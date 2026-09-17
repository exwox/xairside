import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext, isRoleAllowed, checkAirportAccess } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const facilities = await prisma.facility.findMany({
      where: { airportId: auth.activeAirportId },
      include: { _count: { select: { damages: true, markings: true, pciSections: true } } },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
    const corrections = await prisma.$queryRaw<{ id: string; pciCorrection: number }[]>`
      SELECT "id", "pciCorrection" FROM "Facility" WHERE "airportId" = ${auth.activeAirportId}
    `;
    const correctionById = new Map(corrections.map((row) => [row.id, row.pciCorrection]));
    return NextResponse.json(facilities.map((facility) => ({
      ...facility,
      pciCorrection: correctionById.get(facility.id) ?? 100,
    })));
  } catch (error) {
    console.error('Error fetching facilities:', error);
    return NextResponse.json({ error: 'Failed to fetch facilities' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    if (!isRoleAllowed(auth.user.role, ['SUPADMIN', 'ADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.code || !body.name || !body.type) {
      return NextResponse.json({ error: 'code, name, dan type wajib diisi' }, { status: 400 });
    }
    const facility = await prisma.facility.create({
      data: {
        airportId: auth.activeAirportId,
        code: body.code,
        name: body.name,
        type: body.type,
        lengthM: body.lengthM ?? null,
        widthM: body.widthM ?? null,
        areaSqm: body.areaSqm ?? null,
        surfaceType: body.surfaceType ?? null,
        pcn: body.pcn ?? null,
        pcr: body.pcr ?? null,
        bearingDeg: body.bearingDeg ?? null,
        centroidLat: body.centroidLat ?? null,
        centroidLng: body.centroidLng ?? null,
        polygonJson: body.polygonJson ?? null,
        color: body.color ?? null,
        stationDirection: body.stationDirection ?? 'FORWARD',
        stationIntervalM: body.stationIntervalM ? Number(body.stationIntervalM) : 50,
        locationMode: body.locationMode ?? 'STA',
        sampleLengthM: body.sampleLengthM ? Number(body.sampleLengthM) : 20,
        sampleWidthM: body.sampleWidthM ? Number(body.sampleWidthM) : 20,
        blockLengthM: body.blockLengthM ? Number(body.blockLengthM) : 5,
        blockWidthM: body.blockWidthM ? Number(body.blockWidthM) : 5,
        slabDirection: body.slabDirection === 'REVERSE' ? 'REVERSE' : 'FORWARD',
        status: body.status ?? 'SERVICEABLE',
        remarks: body.remarks ?? null,
      },
    });
    return NextResponse.json(facility, { status: 201 });
  } catch (error) {
    console.error('Error creating facility:', error);
    return NextResponse.json({ error: 'Gagal membuat fasilitas (kode harus unik)' }, { status: 500 });
  }
}
