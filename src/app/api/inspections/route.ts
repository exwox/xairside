import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const inspections = await prisma.inspection.findMany({
      include: {
        inspector: true,
        supervisor: true,
      },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(inspections);
  } catch (error) {
    console.error('Error fetching inspections:', error);
    return NextResponse.json({ error: 'Failed to fetch inspections' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { details, date } = body;

    // Fetch the default inspector seeded in DB
    const inspector = await prisma.user.findFirst({
      where: { role: 'INSPECTOR' },
    });

    if (!inspector) {
      return NextResponse.json({ error: 'Inspector account not found' }, { status: 404 });
    }

    if (!details || !Array.isArray(details) || details.length === 0) {
      return NextResponse.json({ error: 'Invalid details provided' }, { status: 400 });
    }

    // Create the inspection record and details
    const inspection = await prisma.inspection.create({
      data: {
        date: date ? new Date(date) : new Date(),
        status: 'SUBMITTED', // Set directly to SUBMITTED for review
        inspectorId: inspector.id,
        details: {
          create: details.map((d: { itemId: string; status: string; remarks?: string }) => ({
            itemId: d.itemId,
            status: d.status,
            remarks: d.remarks || '',
          })),
        },
      },
      include: {
        details: true,
      },
    });

    return NextResponse.json(inspection, { status: 201 });
  } catch (error) {
    console.error('Error creating inspection:', error);
    return NextResponse.json({ error: 'Failed to create inspection' }, { status: 500 });
  }
}
