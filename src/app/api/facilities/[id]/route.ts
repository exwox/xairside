import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext, isRoleAllowed } from '@/lib/auth';
import { planFacilityDamageResplit } from '@/lib/damage-resplit';
import {
  findConcreteBlockForPoint,
  formatStationSegment,
  generateFacilityConcreteBlocksSnapped,
  getFacilityStationIntervalM,
  type LatLng,
} from '@/lib/geo';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    const { id } = await params;
    const facility = await prisma.facility.findUnique({
      where: { id },
      include: {
        damages: true,
        markings: true,
        pciSections: true,
      },
    });

    if (!facility || facility.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Fasilitas tidak ditemukan' }, { status: 404 });
    }
    const correctionRows = await prisma.$queryRaw<{ pciCorrection: number }[]>`
      SELECT "pciCorrection" FROM "Facility" WHERE "id" = ${id}
    `;

    // Segmen STA mengikuti interval fasilitas, termasuk sisa panjang di ujung.
    const lengthM = facility.lengthM || 0;
    const intervalM = getFacilityStationIntervalM(facility);
    const segmentCount = Math.ceil(lengthM / intervalM);
    const subSegments = [];

    for (let i = 0; i < segmentCount; i++) {
      const offsetStartM = i * intervalM;
      const seg = formatStationSegment(offsetStartM, lengthM, intervalM);

      subSegments.push({
        segmentIndex: i + 1,
        staStartM: seg.staStartM,
        staEndM: seg.staEndM,
        staStartStr: seg.staStartStr,
        staEndStr: seg.staEndStr,
        stationText: seg.stationText,
        subSegmentCode: `${facility.code} [${seg.staStartStr}-${seg.staEndStr}]`,
        damagesCount: 0,
        damages: [] as typeof facility.damages,
      });
    }

    // Label lama bisa berupa rentang STA. Titik tengahnya menentukan satu
    // segmen tujuan, sehingga batas bersama tidak menghitung satu temuan dua kali.
    for (const damage of facility.damages) {
      if (!damage.station || segmentCount === 0) continue;
      const offsets = [...damage.station.matchAll(/\bSTA\s*(\d+)\s*\+\s*(\d+(?:\.\d+)?)/gi)]
        .slice(0, 2)
        .map((match) => Number(match[1]) * 1000 + Number(match[2]));
      if (offsets.length === 0 || offsets.some((offset) => !Number.isFinite(offset))) continue;
      const offsetM = offsets.length > 1 ? (offsets[0] + offsets[1]) / 2 : offsets[0];
      if (offsetM < 0 || offsetM > lengthM) continue;
      const segmentIndex = Math.min(segmentCount - 1, Math.floor(offsetM / intervalM));
      subSegments[segmentIndex].damages.push(damage);
      subSegments[segmentIndex].damagesCount++;
    }

    return NextResponse.json({
      facility: { ...facility, pciCorrection: correctionRows[0]?.pciCorrection ?? 100 },
      totalLengthM: lengthM,
      totalSubSegments: subSegments.length,
      subSegments,
    });
  } catch (error) {
    console.error('Error fetching facility details:', error);
    return NextResponse.json({ error: 'Gagal mengambil data fasilitas' }, { status: 500 });
  }
}


export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    if (!isRoleAllowed(auth.user.role, ['SUPADMIN', 'ADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    if (body.stationIntervalM !== undefined && body.stationIntervalM !== null && body.stationIntervalM !== '') {
      const requestedInterval = Number(body.stationIntervalM);
      if (!Number.isFinite(requestedInterval) || requestedInterval < 5) {
        return NextResponse.json({ error: 'Interval STA fasilitas harus minimal 5 meter.' }, { status: 400 });
      }
    }
    if (body.pciCorrection !== undefined && (typeof body.pciCorrection !== 'number'
      || !Number.isFinite(body.pciCorrection) || body.pciCorrection < 0 || body.pciCorrection > 100)) {
      return NextResponse.json({ error: 'PCI Koreksi harus berupa angka antara 0 dan 100.' }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    const fields = [
      'code', 'name', 'type', 'surfaceType', 'pcn', 'pcr', 'polygonJson', 'color', 'status', 'remarks', 'stationDirection', 'locationMode',
    ];
    const numFields = ['lengthM', 'widthM', 'areaSqm', 'bearingDeg', 'centroidLat', 'centroidLng', 'stationIntervalM', 'sampleLengthM', 'sampleWidthM', 'blockLengthM', 'blockWidthM'];
    fields.forEach((f) => {
      if (body[f] !== undefined) data[f] = body[f];
    });
    if (body.slabDirection !== undefined) {
      data.slabDirection = body.slabDirection === 'REVERSE' ? 'REVERSE' : 'FORWARD';
    }
    numFields.forEach((f) => {
      if (body[f] !== undefined) {
        if (body[f] === null || body[f] === '') {
          data[f] = null;
        } else {
          const val = Number(body[f]);
          data[f] = Number.isNaN(val) ? null : val;
        }
      }
    });
    const result = await prisma.$transaction(async (tx) => {
      const currentFacility = await tx.facility.findUnique({ where: { id } });
      if (!currentFacility || currentFacility.airportId !== auth.activeAirportId) {
        throw new Error('Fasilitas tidak ditemukan atau bukan milik airport ini');
      }
      const updated = await tx.facility.update({ where: { id }, data });
      if (body.pciCorrection !== undefined) {
        await tx.$executeRaw`UPDATE "Facility" SET "pciCorrection" = ${body.pciCorrection} WHERE "id" = ${id}`;
      }
      const slabDirectionChanged = currentFacility != null
        && (currentFacility.slabDirection || 'FORWARD') !== (updated.slabDirection || 'FORWARD');

      // Kode lokasi temuan concrete menyimpan nama slab. Saat arah dibalik,
      // hitung ulang kode berdasarkan koordinat agar popup dan form edit tetap
      // cocok dengan label grid yang baru.
      if (slabDirectionChanged && updated.surfaceType === 'CONCRETE') {
        let polygon: LatLng[] | undefined;
        if (updated.polygonJson) {
          try {
            const parsed = JSON.parse(updated.polygonJson) as unknown;
            if (Array.isArray(parsed) && parsed.length >= 3) polygon = parsed as LatLng[];
          } catch {
            polygon = undefined;
          }
        }

        const blocks = generateFacilityConcreteBlocksSnapped(updated, polygon);

        if (blocks.length > 0) {
          const damages = await tx.damage.findMany({
            where: { facilityId: id },
            select: {
              id: true,
              lat: true,
              lng: true,
              sampleCode: true,
              station: true,
              remarks: true,
            },
          });

          for (const damage of damages) {
            const block = findConcreteBlockForPoint(damage.lat, damage.lng, blocks);
            if (!block) continue;
            const oldCode = damage.sampleCode || damage.station;
            const remarks = damage.remarks && oldCode && oldCode !== block.blockCode
              ? damage.remarks.split(oldCode).join(block.blockCode)
              : damage.remarks;
            if (
              damage.sampleCode === block.blockCode
              && damage.station === block.blockCode
              && damage.remarks === remarks
            ) continue;
            await tx.damage.update({
              where: { id: damage.id },
              data: { sampleCode: block.blockCode, station: block.blockCode, remarks },
            });
          }
        }
      }

      let stationResplit = null;
      const intervalChanged = currentFacility != null
        && getFacilityStationIntervalM(currentFacility) !== getFacilityStationIntervalM(updated);
      const sampleGridChanged = currentFacility != null && (
        currentFacility.sampleLengthM !== updated.sampleLengthM
        || currentFacility.sampleWidthM !== updated.sampleWidthM
        || currentFacility.blockLengthM !== updated.blockLengthM
        || currentFacility.blockWidthM !== updated.blockWidthM
      );
      const facilityGeometryChanged = currentFacility != null && (
        currentFacility.polygonJson !== updated.polygonJson
        || currentFacility.lengthM !== updated.lengthM
        || currentFacility.widthM !== updated.widthM
        || currentFacility.bearingDeg !== updated.bearingDeg
        || currentFacility.centroidLat !== updated.centroidLat
        || currentFacility.centroidLng !== updated.centroidLng
        || currentFacility.stationDirection !== updated.stationDirection
        || currentFacility.locationMode !== updated.locationMode
        || currentFacility.surfaceType !== updated.surfaceType
        || slabDirectionChanged
      );
      if (intervalChanged || sampleGridChanged || facilityGeometryChanged) {
        const arpLat = auth.activeAirport.refLat;
        const arpLng = auth.activeAirport.refLng;
        const damages = await tx.damage.findMany({ where: { facilityId: id } });
        const plan = planFacilityDamageResplit(updated, damages, arpLat, arpLng);

        if (plan.deleteIds.length > 0) {
          await tx.damage.deleteMany({ where: { id: { in: plan.deleteIds } } });
        }
        for (const update of plan.updates) {
          await tx.damage.update({ where: { id: update.id }, data: update.data });
        }
        if (plan.creates.length > 0) {
          await tx.damage.createMany({
            data: plan.creates.map((c) => ({ ...c, airportId: auth.activeAirportId })),
          });
        }
        stationResplit = {
          updatedFindings: plan.updatedFindings,
          pointOnlyFindings: plan.pointOnlyFindings,
          skippedFindings: plan.skipped.length,
          skippedByReason: plan.skipped.reduce<Record<string, number>>((counts, item) => {
            counts[item.reason] = (counts[item.reason] ?? 0) + 1;
            return counts;
          }, {}),
        };
      }

      return { facility: updated, stationResplit };
    }, { timeout: 120000 });
    return NextResponse.json({
      ...result.facility,
      ...(body.pciCorrection !== undefined ? { pciCorrection: body.pciCorrection } : {}),
      stationResplit: result.stationResplit,
    });
  } catch (error) {
    console.error('Error updating facility:', error);
    const msg = error instanceof Error ? error.message : 'Gagal memperbarui fasilitas';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    if (!isRoleAllowed(auth.user.role, ['SUPADMIN', 'ADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const { id } = await params;
    const facility = await prisma.facility.findUnique({ where: { id }, select: { airportId: true } });
    if (!facility || facility.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Fasilitas tidak ditemukan atau bukan milik airport ini' }, { status: 404 });
    }
    await prisma.facility.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting facility:', error);
    return NextResponse.json({ error: 'Gagal menghapus fasilitas' }, { status: 500 });
  }
}
