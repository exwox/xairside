import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: {
        inspector: true,
        supervisor: true,
        details: {
          include: {
            item: true,
          },
          orderBy: {
            item: {
              order: 'asc',
            },
          },
        },
      },
    });

        if (!inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    // Parse matrixResults JSON string if present
    const parsedInspection = {
      ...inspection,
      matrixResults: inspection.matrixResults ? JSON.parse(inspection.matrixResults) : null,
    };

    return NextResponse.json(parsedInspection);
  } catch (error) {
    console.error('Error fetching inspection:', error);
    return NextResponse.json({ error: 'Failed to fetch inspection details' }, { status: 500 });
  }
}
