import { PrismaClient } from '@prisma/client';
import { distressCatalog } from '../src/lib/pci-data';
import { computeSampleUnitPci, computeSectionPci, pciRating, type DistressInput } from '../src/lib/pci';
import { lineFromPoints } from '../src/lib/geo';

const prisma = new PrismaClient();

async function seedExisting() {
  console.log('Seeding database...');

  // Create Users
  const inspector = await prisma.user.upsert({
    where: { email: 'inspector@airside.com' },
    update: {},
    create: {
      email: 'inspector@airside.com',
      name: 'Budi (Inspector)',
      passwordHash: 'password123', // In production, hash this password
      role: 'INSPECTOR',
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@airside.com' },
    update: {},
    create: {
      email: 'supervisor@airside.com',
      name: 'Pak Anto (Supervisor)',
      passwordHash: 'password123', // In production, hash this password
      role: 'SUPERVISOR',
    },
  });

  console.log('Users seeded:', { inspector: inspector.email, supervisor: supervisor.email });

    // Checklist Items configuration - aligned with YIA worksheet matrix layout (Runway only)
  // Left matrix (Cols A-K): Runway 11/29 with Surface/Marking/Runway Strip/RESA columns (S/US)
  // Right matrix (Cols L-N): Drainage + Perimeter Fence with Condition/S/US columns
  const checklistItems = [
    // RUNWAY - Rows 7-8 (Runway 11/29)
    { zone: 'RUNWAY', category: 'Surface', name: 'Surface - Runway 11/29', matrixKey: 'RUNWAY_11_SURFACE' },
    { zone: 'RUNWAY', category: 'Marking', name: 'Marking - Runway 11/29', matrixKey: 'RUNWAY_11_MARKING' },
    { zone: 'RUNWAY', category: 'Runway Strip', name: 'Runway Strip - Runway 11/29', matrixKey: 'RUNWAY_11_STRIP' },
    { zone: 'RUNWAY', category: 'RESA', name: 'RESA - Runway 11/29', matrixKey: 'RUNWAY_11_RESA' },
    { zone: 'RUNWAY', category: 'Surface', name: 'Surface - Runway 29', matrixKey: 'RUNWAY_29_SURFACE' },
    { zone: 'RUNWAY', category: 'Marking', name: 'Marking - Runway 29', matrixKey: 'RUNWAY_29_MARKING' },
    { zone: 'RUNWAY', category: 'Runway Strip', name: 'Runway Strip - Runway 29', matrixKey: 'RUNWAY_29_STRIP' },
    { zone: 'RUNWAY', category: 'RESA', name: 'RESA - Runway 29', matrixKey: 'RUNWAY_29_RESA' },

    // DRAINAGE - Right matrix (Rows 7-10)
    { zone: 'DRAINAGE', category: 'Drainage', name: '1. Surface (permukaan dasar)', matrixKey: 'DRAINAGE_1_CONDITION' },
    { zone: 'DRAINAGE', category: 'Drainage', name: '2. Water flow (aliran air)', matrixKey: 'DRAINAGE_2_CONDITION' },
    { zone: 'DRAINAGE', category: 'Drainage', name: '3. Cover (tutup drainase)', matrixKey: 'DRAINAGE_3_CONDITION' },
    { zone: 'DRAINAGE', category: 'Drainage', name: '4. Top Surface (permukaan atas)', matrixKey: 'DRAINAGE_4_CONDITION' },

    // PERIMETER FENCE - Right matrix (Rows 16-19)
    { zone: 'PERIMETER_FENCE', category: 'Perimeter Fence', name: '1. Foundation (pondasi)', matrixKey: 'FENCE_1_CONDITION' },
    { zone: 'PERIMETER_FENCE', category: 'Perimeter Fence', name: '2. Fence pole (tiang pagar)', matrixKey: 'FENCE_2_CONDITION' },
    { zone: 'PERIMETER_FENCE', category: 'Perimeter Fence', name: '3. Fence panel (panel pagar)', matrixKey: 'FENCE_3_CONDITION' },
    { zone: 'PERIMETER_FENCE', category: 'Perimeter Fence', name: '4. Razor wire (kawat duri)', matrixKey: 'FENCE_4_CONDITION' },
  ];

  let order = 1;
  const itemCount = await prisma.inspectionItem.count();
  if (itemCount > 0) {
    console.log(`Inspection items already seeded (${itemCount} items), skipping.`);
  } else {
    for (const item of checklistItems) {
      const createdItem = await prisma.inspectionItem.create({
        data: {
          zone: item.zone,
          category: item.category,
          name: item.name,
          matrixKey: item.matrixKey,
          order: order++,
        },
      });
      console.log(`Created Item: [${createdItem.zone}] ${createdItem.category} - ${createdItem.name}`);
    }
  }

  console.log('Seeding finished successfully!');
}

// ===== Monitoring: Fasilitas, Temuan Kerusakan, Marka, PCI =====
async function seedMonitoring() {
  const cfg = async (key: string, value: string) => {
    await prisma.appConfig.upsert({ where: { key }, update: {}, create: { key, value } });
  };
  await cfg('arpLat', '0.9569');
  await cfg('arpLng', '104.5311');
  await cfg('airportName', 'Bandara Raja Haji Fisabilillah');

  // --- Fasilitas (polygon di area bandara, ARP sebagai acuan) ---
  const rwyCenter = { lat: 0.9572, lng: 104.5342 };
  const upsertFacility = async (data: {
    code: string; name: string; type: string; lengthM?: number; widthM?: number; areaSqm?: number;
    surfaceType?: string; pcn?: string; pcr?: string; bearingDeg?: number; centroidLat: number;
    centroidLng: number; polygon: { lat: number; lng: number }[]; status?: string; remarks?: string;
  }) => {
    await prisma.facility.upsert({
      where: { code: data.code },
      update: {},
      create: {
        code: data.code, name: data.name, type: data.type,
        lengthM: data.lengthM ?? null, widthM: data.widthM ?? null, areaSqm: data.areaSqm ?? null,
        surfaceType: data.surfaceType ?? null, pcn: data.pcn ?? null, pcr: data.pcr ?? null,
        bearingDeg: data.bearingDeg ?? null, centroidLat: data.centroidLat, centroidLng: data.centroidLng,
        polygonJson: JSON.stringify(data.polygon), status: data.status ?? 'SERVICEABLE', remarks: data.remarks ?? null,
      },
    });
  };
  const rwyRect = (c: { lat: number; lng: number }, halfL: number, halfW: number) => {
    const dLat = halfL / 111320, dLng = halfW / 111320 / Math.cos((c.lat * Math.PI) / 180);
    return [
      { lat: c.lat + dLat, lng: c.lng - dLng }, { lat: c.lat + dLat, lng: c.lng + dLng },
      { lat: c.lat - dLat, lng: c.lng + dLng }, { lat: c.lat - dLat, lng: c.lng - dLng },
    ];
  };
  await upsertFacility({
    code: 'RWY-08/26', name: 'Runway 08/26', type: 'RUNWAY', lengthM: 1800, widthM: 30, areaSqm: 54000,
    surfaceType: 'ASPHALT', pcn: 'PCN 38 F/B/X/T', pcr: 'PCR 38 F/B/X/T', bearingDeg: 83,
    centroidLat: rwyCenter.lat, centroidLng: rwyCenter.lng, polygon: rwyRect(rwyCenter, 900, 15),
    remarks: 'Runway utama, arah 08/26',
  });
  const twyACenter = { lat: 0.9564, lng: 104.5332 };
  await upsertFacility({
    code: 'TWY-A', name: 'Taxiway A (Parallel)', type: 'TAXIWAY', lengthM: 1500, widthM: 15, areaSqm: 22500,
    surfaceType: 'ASPHALT', pcn: 'PCN 30 F/B/X/T', pcr: 'PCR 30 F/B/X/T', bearingDeg: 83,
    centroidLat: twyACenter.lat, centroidLng: twyACenter.lng, polygon: rwyRect(twyACenter, 750, 7.5),
  });
  const twyBCenter = { lat: 0.9568, lng: 104.5355 };
  await upsertFacility({
    code: 'TWY-B1', name: 'Taxiway B1 (Connector)', type: 'TAXIWAY', lengthM: 120, widthM: 15, areaSqm: 1800,
    surfaceType: 'ASPHALT', pcn: 'PCN 30 F/B/X/T', bearingDeg: 353,
    centroidLat: twyBCenter.lat, centroidLng: twyBCenter.lng, polygon: rwyRect(twyBCenter, 60, 7.5),
  });
  const apronCenter = { lat: 0.9557, lng: 104.5322 };
  await upsertFacility({
    code: 'APRON-1', name: 'Apron Terminal', type: 'APRON', lengthM: 260, widthM: 90, areaSqm: 23400,
    surfaceType: 'ASPHALT', pcn: 'PCN 28 F/B/X/T', pcr: 'PCR 28 F/B/X/T', bearingDeg: 353,
    centroidLat: apronCenter.lat, centroidLng: apronCenter.lng, polygon: rwyRect(apronCenter, 130, 45),
  });
  const apron2Center = { lat: 0.9551, lng: 104.5331 };
  await upsertFacility({
    code: 'APRON-2', name: 'Apron Cargo & Militer', type: 'APRON', lengthM: 180, widthM: 70, areaSqm: 12600,
    surfaceType: 'CONCRETE', pcn: 'PCN 24 F/B/W/T', bearingDeg: 353,
    centroidLat: apron2Center.lat, centroidLng: apron2Center.lng, polygon: rwyRect(apron2Center, 90, 35),
    status: 'CAUTION',
  });
  console.log('Facilities seeded.');
  // --- Contoh temuan kerusakan (rectangle di sekitar fasilitas) ---
  const rwy = await prisma.facility.findUnique({ where: { code: 'RWY-08/26' } });
  const twyA = await prisma.facility.findUnique({ where: { code: 'TWY-A' } });
  const apron1 = await prisma.facility.findUnique({ where: { code: 'APRON-1' } });
  const mkDamage = async (d: {
    facilityId: string | null; station: string; type: string; severity: string; lat: number; lng: number;
    halfW: number; halfL: number; remarks: string; status?: string;
  }) => {
    const rect = rwyRect({ lat: d.lat, lng: d.lng }, d.halfL, d.halfW);
    await prisma.damage.create({
      data: {
        facilityId: d.facilityId, station: d.station, type: d.type, severity: d.severity,
        lat: d.lat, lng: d.lng,
        localX: (d.lng - 104.5311) * 111320 * Math.cos((0.9569 * Math.PI) / 180),
        localY: (d.lat - 0.9569) * 111320,
        rectJson: JSON.stringify(rect),
        lengthM: d.halfL * 2, widthM: d.halfW * 2, areaSqm: d.halfL * 2 * (d.halfW * 2),
        remarks: d.remarks, status: d.status ?? 'OPEN', reportedBy: 'Petugas Patroli',
      },
    });
  };
  const mkLineDamage = async (d: {
    facilityId: string | null; station: string; type: string; severity: string;
    points: { lat: number; lng: number }[]; remarks: string; status?: string;
  }) => {
    const line = lineFromPoints(d.points, 0.9569, 104.5311);
    await prisma.damage.create({
      data: {
        facilityId: d.facilityId, station: d.station, type: d.type, severity: d.severity,
        lat: line.center.lat, lng: line.center.lng,
        localX: line.centerLocal.x, localY: line.centerLocal.y,
        rectJson: JSON.stringify(line.corners), geometryType: 'LINE',
        lengthM: line.lengthM, widthM: 0, areaSqm: 0, count: null,
        remarks: d.remarks, status: d.status ?? 'OPEN', reportedBy: 'Petugas Patroli',
      },
    });
  };
  const dmgCount = await prisma.damage.count();
  if (dmgCount === 0 && rwy && twyA && apron1) {
    await mkDamage({
      facilityId: rwy.id, station: '08 + 450', type: 'F-01', severity: 'M',
      lat: rwyCenter.lat + 0.0004, lng: rwyCenter.lng - 0.0035, halfW: 2.5, halfL: 5,
      remarks: 'Retak buaya intermiten pada jalur roda landing gear, area TDZ 08',
    });
    await mkDamage({
      facilityId: rwy.id, station: '08 + 1210', type: 'F-05', severity: 'H',
      lat: rwyCenter.lat + 0.0016, lng: rwyCenter.lng + 0.004, halfW: 0.6, halfL: 0.8,
      remarks: 'Cekungan lokal sedalam > 5 cm, prioritas perbaikan segera',
    });
    await mkDamage({
      facilityId: rwy.id, station: '26 + 300', type: 'F-12', severity: 'L',
      lat: rwyCenter.lat - 0.0013, lng: rwyCenter.lng + 0.0022, halfW: 3, halfL: 8,
      remarks: 'Pelapukan permukaan ringan, pemantauan rutin', status: 'IN_PROGRESS',
    });
    await mkLineDamage({
      facilityId: twyA.id, station: 'TWY-A + 620', type: 'F-08', severity: 'M',
      points: [
        { lat: twyACenter.lat, lng: twyACenter.lng + 0.00145 },
        { lat: twyACenter.lat, lng: twyACenter.lng + 0.00155 },
      ],
      remarks: 'Retak memanjang menyatu, perlu sealing',
    });
    await mkDamage({
      facilityId: apron1.id, station: 'Stand 3', type: 'F-09', severity: '-',
      lat: apronCenter.lat + 0.0005, lng: apronCenter.lng - 0.0008, halfW: 1.2, halfL: 1.8,
      remarks: 'Tumpahan oli di area stand parkir, licin saat hujan',
    });
    console.log('Sample damages seeded.');
  }
  // --- Contoh temuan marka ---
  const markCount = await prisma.markingFinding.count();
  if (markCount === 0) {
    const mkMark = async (m: {
      facilityId: string | null; markingType: string; condition: string; station: string; remarks: string;
    }) => {
      await prisma.markingFinding.create({
        data: { facilityId: m.facilityId, markingType: m.markingType, condition: m.condition, station: m.station, remarks: m.remarks, reportedBy: 'Petugas Patroli' },
      });
    };
    await mkMark({ facilityId: rwy?.id ?? null, markingType: 'Centerline', condition: 'BAIK', station: 'RWY 08/26 full', remarks: 'Marka centerline jelas & reflektif' });
    await mkMark({ facilityId: rwy?.id ?? null, markingType: 'Threshold Marking', condition: 'PERLU_PERBAIKAN', station: 'THR 08', remarks: 'Marka threshold pudar, perlu cat ulang' });
    await mkMark({ facilityId: rwy?.id ?? null, markingType: 'Touchdown Zone', condition: 'BAIK', station: 'TDZ 08 & 26', remarks: '-' });
    await mkMark({ facilityId: twyA?.id ?? null, markingType: 'Runway Holding Position', condition: 'USANG', station: 'TWY A1', remarks: 'Marka holding position nyaris hilang, berpotensi incursion' });
    await mkMark({ facilityId: apron1?.id ?? null, markingType: 'Stand Centerline / Lead-in Line', condition: 'PERLU_PERBAIKAN', station: 'Stand 1-4', remarks: 'Lead-in line pudar, stand 2 terburuk' });
    console.log('Sample markings seeded.');
  }

  // --- Contoh section PCI + survey ---
  const secCount = await prisma.pciSection.count();
  if (secCount === 0 && rwy) {
    const section = await prisma.pciSection.create({
      data: {
        facilityId: rwy.id, name: 'RWY 08/26 - Seksi 1 (THR08+0 s/d +900)',
        surfaceType: 'ASPHALT', totalAreaSqm: 27000, sampleUnitArea: 225,
      },
    });
    const surveyDate = new Date();
    surveyDate.setDate(surveyDate.getDate() - 14);
    const catalog = distressCatalog('ASPHALT');
    const sampleUnits: { no: number; areaSqm: number; distresses: DistressInput[] }[] = [
      { no: 1, areaSqm: 225, distresses: [{ code: 8, severity: 'M', quantity: 12 }] },
      { no: 2, areaSqm: 225, distresses: [] },
      { no: 3, areaSqm: 225, distresses: [{ code: 12, severity: 'L', quantity: 35 }] },
      { no: 4, areaSqm: 225, distresses: [] },
    ];
    const details = sampleUnits.map((unit) => {
      const result = computeSampleUnitPci('ASPHALT', unit.areaSqm, unit.distresses);
      return {
        no: unit.no,
        areaSqm: unit.areaSqm,
        slabCount: null,
        distresses: unit.distresses.map((distress) => ({
          ...distress,
          name: catalog.find((definition) => definition.code === distress.code)?.name ?? '',
          density: result.dvLines.find((line) => line.code === distress.code && line.severity === distress.severity)?.density ?? 0,
        })),
        dvLines: result.dvLines,
        totalDv: result.totalDv,
        maxCdv: result.maxCdv,
        allowableDeducts: result.allowableDeducts,
        cdvIterations: result.cdvIterations,
        pci: result.pci,
      };
    });
    const sectionPci = computeSectionPci(details);
    await prisma.pciSurvey.create({
      data: {
        sectionId: section.id, inspectorName: 'Tim Pavement', surveyDate,
        pci: sectionPci, rating: pciRating(sectionPci).label,
        detailsJson: JSON.stringify(details),
      },
    });
    await prisma.pciSection.update({ where: { id: section.id }, data: { lastPci: sectionPci, lastSurveyAt: surveyDate } });
    console.log('Sample PCI section & survey seeded.');
  }
}

async function main() {
  await seedExisting();
  await seedMonitoring();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
