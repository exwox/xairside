import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const sections = await prisma.pciSection.findMany({
      where: { airportId: auth.activeAirportId },
      include: { facility: true, surveys: { orderBy: { surveyDate: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(sections);
  } catch (error) {
    console.error('Error fetching PCI sections:', error);
    return NextResponse.json({ error: 'Failed to fetch PCI sections' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    if (!body.name || !body.surfaceType || !body.totalAreaSqm) {
      return NextResponse.json({ error: 'name, surfaceType, totalAreaSqm wajib diisi' }, { status: 400 });
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
    const section = await prisma.pciSection.create({
      data: {
        airportId: auth.activeAirportId,
        facilityId: body.facilityId || null,
        name: body.name,
        surfaceType: body.surfaceType,
        totalAreaSqm: Number(body.totalAreaSqm),
        sampleUnitArea: Number(body.sampleUnitArea ?? 225) || 225,
      },
      include: { facility: true, surveys: true },
    });
    return NextResponse.json(section, { status: 201 });
  } catch (error) {
    console.error('Error creating PCI section:', error);
    return NextResponse.json({ error: 'Gagal membuat section' }, { status: 500 });
  }
}
