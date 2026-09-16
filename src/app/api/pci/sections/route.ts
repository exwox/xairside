import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const sections = await prisma.pciSection.findMany({
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
    const body = await req.json();
    if (!body.name || !body.surfaceType || !body.totalAreaSqm) {
      return NextResponse.json({ error: 'name, surfaceType, totalAreaSqm wajib diisi' }, { status: 400 });
    }
    const section = await prisma.pciSection.create({
      data: {
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
