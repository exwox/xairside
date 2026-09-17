import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { distressCatalog } from '../src/lib/pci-data';
import { computeSampleUnitPci, computeSectionPci, pciRating, type DistressInput } from '../src/lib/pci';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('Seeding multi-airport database...');

  // 1. Airports
  const airportRHF = await prisma.airport.upsert({
    where: { code: 'RHF' },
    update: {},
    create: {
      code: 'RHF',
      name: 'Bandara Raja Haji Fisabilillah',
      timezone: 'Asia/Jakarta',
      refLat: 0.9569,
      refLng: 104.5311,
      isActive: true,
    },
  });

  const airportYIA = await prisma.airport.upsert({
    where: { code: 'YIA' },
    update: {},
    create: {
      code: 'YIA',
      name: 'Yogyakarta International Airport',
      timezone: 'Asia/Jakarta',
      refLat: -7.9044,
      refLng: 110.0578,
      isActive: true,
    },
  });

  // 2. Users
  const seedPassword = process.env.XAIRSIDE_SEED_PASSWORD;
  if (!seedPassword || seedPassword.length < 12) {
    throw new Error('XAIRSIDE_SEED_PASSWORD minimal 12 karakter wajib saat menjalankan seed.');
  }
  const passwordHash = hashPassword(seedPassword);

  const supadmin = await prisma.user.upsert({
    where: { email: 'supadmin@airside.com' },
    update: { role: 'SUPADMIN', airportId: null },
    create: {
      email: 'supadmin@airside.com',
      name: 'Super Admin',
      passwordHash,
      role: 'SUPADMIN',
      airportId: null,
      isActive: true,
    },
  });

  const adminRHF = await prisma.user.upsert({
    where: { email: 'admin.rhf@airside.com' },
    update: { role: 'ADMIN', airportId: airportRHF.id },
    create: {
      email: 'admin.rhf@airside.com',
      name: 'Admin RHF',
      passwordHash,
      role: 'ADMIN',
      airportId: airportRHF.id,
      isActive: true,
    },
  });

  const userRHF = await prisma.user.upsert({
    where: { email: 'user.rhf@airside.com' },
    update: { role: 'USER', airportId: airportRHF.id },
    create: {
      email: 'user.rhf@airside.com',
      name: 'Budi (Petugas RHF)',
      passwordHash,
      role: 'USER',
      airportId: airportRHF.id,
      isActive: true,
    },
  });

  const viewerRHF = await prisma.user.upsert({
    where: { email: 'viewer.rhf@airside.com' },
    update: { role: 'VIEWER', airportId: airportRHF.id },
    create: {
      email: 'viewer.rhf@airside.com',
      name: 'Viewer RHF',
      passwordHash,
      role: 'VIEWER',
      airportId: airportRHF.id,
      isActive: true,
    },
  });

  const adminYIA = await prisma.user.upsert({
    where: { email: 'admin.yia@airside.com' },
    update: { role: 'ADMIN', airportId: airportYIA.id },
    create: {
      email: 'admin.yia@airside.com',
      name: 'Admin YIA',
      passwordHash,
      role: 'ADMIN',
      airportId: airportYIA.id,
      isActive: true,
    },
  });

  console.log('Users seeded:', [supadmin.email, adminRHF.email, userRHF.email, viewerRHF.email, adminYIA.email]);


  // 3. Configs
  const configs = [
    { airportId: airportRHF.id, key: 'airportName', value: 'Bandara Raja Haji Fisabilillah' },
    { airportId: airportRHF.id, key: 'arpLat', value: '0.9569' },
    { airportId: airportRHF.id, key: 'arpLng', value: '104.5311' },
    { airportId: airportRHF.id, key: 'mapRotationDeg', value: '0' },
    { airportId: airportRHF.id, key: 'stationIntervalM', value: '50' },

    { airportId: airportYIA.id, key: 'airportName', value: 'Yogyakarta International Airport' },
    { airportId: airportYIA.id, key: 'arpLat', value: '-7.9044' },
    { airportId: airportYIA.id, key: 'arpLng', value: '110.0578' },
    { airportId: airportYIA.id, key: 'mapRotationDeg', value: '0' },
    { airportId: airportYIA.id, key: 'stationIntervalM', value: '50' },
  ];

  for (const cfg of configs) {
    await prisma.airportConfig.upsert({
      where: { airportId_key: { airportId: cfg.airportId, key: cfg.key } },
      update: { value: cfg.value },
      create: cfg,
    });
  }

  // 4. Checklist Items
  const checklistItems = [
    { zone: 'RUNWAY', category: 'Surface', name: 'Surface - Runway 11/29', matrixKey: 'RUNWAY_11_SURFACE' },
    { zone: 'RUNWAY', category: 'Marking', name: 'Marking - Runway 11/29', matrixKey: 'RUNWAY_11_MARKING' },
    { zone: 'RUNWAY', category: 'Runway Strip', name: 'Runway Strip - Runway 11/29', matrixKey: 'RUNWAY_11_STRIP' },
    { zone: 'RUNWAY', category: 'RESA', name: 'RESA - Runway 11/29', matrixKey: 'RUNWAY_11_RESA' },
    { zone: 'DRAINAGE', category: 'Drainage', name: '1. Surface (permukaan dasar)', matrixKey: 'DRAINAGE_1_CONDITION' },
    { zone: 'PERIMETER_FENCE', category: 'Perimeter Fence', name: '1. Foundation (pondasi)', matrixKey: 'FENCE_1_CONDITION' },
  ];

  let order = 1;
  for (const item of checklistItems) {
    const existing = await prisma.inspectionItem.findFirst({ where: { matrixKey: item.matrixKey } });
    if (!existing) {
      await prisma.inspectionItem.create({ data: { ...item, order: order++ } });
    }
  }

  // 5. Facilities
  const rwyRHF = await prisma.facility.upsert({
    where: { airportId_code: { airportId: airportRHF.id, code: 'RWY' } },
    update: {},
    create: {
      airportId: airportRHF.id,
      code: 'RWY',
      name: 'Runway 04/22',
      type: 'RUNWAY',
      lengthM: 1800,
      widthM: 30,
      areaSqm: 54000,
      surfaceType: 'ASPHALT',
      pcn: 'PCN 38 F/B/X/T',
      bearingDeg: 83,
      centroidLat: 0.9572,
      centroidLng: 104.5342,
      status: 'SERVICEABLE',
    },
  });

  const rwyYIA = await prisma.facility.upsert({
    where: { airportId_code: { airportId: airportYIA.id, code: 'RWY' } },
    update: {},
    create: {
      airportId: airportYIA.id,
      code: 'RWY',
      name: 'Runway 11/29',
      type: 'RUNWAY',
      lengthM: 3250,
      widthM: 45,
      areaSqm: 146250,
      surfaceType: 'ASPHALT',
      pcn: '95 F/A/W/T',
      status: 'SERVICEABLE',
      centroidLat: -7.9044,
      centroidLng: 110.0578,
    },
  });

  console.log('Facilities seeded.');

  // 6. Sample Damages
  const dmgCount = await prisma.damage.count();
  if (dmgCount === 0) {
    await prisma.damage.create({
      data: {
        airportId: airportRHF.id,
        facilityId: rwyRHF.id,
        station: '04 + 450',
        type: 'Retak Buaya (Alligator Cracking)',
        severity: 'M',
        lat: 0.9576,
        lng: 104.5307,
        localX: 44,
        localY: 11,
        areaSqm: 15,
        remarks: 'Retak buaya intermiten di TDZ',
        status: 'OPEN',
        reportedBy: 'Petugas Patroli',
      },
    });

    await prisma.damage.create({
      data: {
        airportId: airportYIA.id,
        facilityId: rwyYIA.id,
        station: '11 + 500',
        type: 'Lubang (Pothole)',
        severity: 'H',
        lat: -7.904,
        lng: 110.058,
        localX: 120,
        localY: -5,
        areaSqm: 0.8,
        remarks: 'Lubang dalam di area touchdown YIA',
        status: 'OPEN',
        reportedBy: 'Petugas YIA',
      },
    });
  }
  // 7. Sample Inspection
  const inspCount = await prisma.inspection.count();
  if (inspCount === 0) {
    await prisma.inspection.create({
      data: {
        airportId: airportRHF.id,
        date: new Date(),
        status: 'SUBMITTED',
        inspectorId: userRHF.id,
        rubberDepositRunway11: 'L',
        notam: 'NIL',
        fodCondition: 'SERVICEABLE',
      },
    });
  }

  console.log('Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
