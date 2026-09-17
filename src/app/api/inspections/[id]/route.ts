import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: {
        inspector: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
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

        if (!inspection || inspection.airportId !== auth.activeAirportId) {
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
