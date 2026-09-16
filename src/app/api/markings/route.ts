import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const markings = await prisma.markingFinding.findMany({
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
    const body = await req.json();
    if (!body.markingType || !body.condition) {
      return NextResponse.json({ error: 'markingType dan condition wajib diisi' }, { status: 400 });
    }
    const marking = await prisma.markingFinding.create({
      data: {
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
