import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const markings = await prisma.markingFinding.findMany({
      where: { airportId: auth.activeAirportId },
      include: { facility: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(markings);
  } catch (error) {
    console.error('Error fetching markings:', error);
    return NextResponse.json({ error: 'Failed to fetch markings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    if (!body.markingType || !body.condition) {
      return NextResponse.json({ error: 'markingType dan condition wajib diisi' }, { status: 400 });
    }
    if (body.facilityId) {
      const facility = await prisma.facility.findUnique({
        where: { id: body.facilityId },
        select: { airportId: true },
      });
      if (!facility || facility.airportId !== auth.activeAirportId) {
        return NextResponse.json({ error: 'Fasilitas tidak ditemukan atau bukan milik airport aktif' }, { status: 400 });
      }
    }
    const marking = await prisma.markingFinding.create({
      data: {
        airportId: auth.activeAirportId,
        facilityId: body.facilityId || null,
        markingType: body.markingType,
        condition: body.condition,
        station: body.station ?? null,
        lat: body.lat != null ? Number(body.lat) : null,
        lng: body.lng != null ? Number(body.lng) : null,
        localX: body.localX != null ? Number(body.localX) : null,
        localY: body.localY != null ? Number(body.localY) : null,
        areaSqm: body.areaSqm != null ? Number(body.areaSqm) : null,
        remarks: body.remarks ?? null,
        reportedBy: body.reportedBy ?? null,
      },
    });
    return NextResponse.json(marking, { status: 201 });
  } catch (error) {
    console.error('Error creating marking:', error);
    return NextResponse.json({ error: 'Gagal menyimpan data marka' }, { status: 500 });
  }
}
