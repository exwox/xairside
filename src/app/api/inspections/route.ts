import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const inspections = await prisma.inspection.findMany({
      where: { airportId: auth.activeAirportId },
      include: {
        inspector: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
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
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { details, matrixResults, rubberDepositRunway11, rubberDepositRunway29, notam, fodCondition, standingWaterCondition, obstacleCondition, pavementCondition, pavementTempRunway11, pavementTempRunway29, date } = body;

    // Inspector = user yang sedang login (menggantikan akun seed INSPECTOR)
    const inspector = auth.user;

    // details can come from matrixResults (preferred) or from the legacy details array
    let detailData: any[] = [];

    if (matrixResults && typeof matrixResults === 'object') {
      // Map matrix keys (e.g. "RUNWAY_11_SURFACE") to real InspectionItem ids via the item.matrixKey field
      const items = await prisma.inspectionItem.findMany();
      const matrixKeyToItemId = new Map<string, string>();
      items.forEach((item: { id: string; matrixKey: string | null }) => {
        if (item.matrixKey) {
          matrixKeyToItemId.set(item.matrixKey, item.id);
        }
      });
      detailData = Object.entries(matrixResults)
        .filter(([key]) => matrixKeyToItemId.has(key))
        .map(([key, value]) => ({
          itemId: matrixKeyToItemId.get(key) as string,
          status: String(value),
          remarks: '',
        }));
    }

    if (details && Array.isArray(details) && details.length > 0) {
      detailData = details.map((d: { itemId: string; status: string; remarks?: string }) => ({
        itemId: d.itemId,
        status: d.status,
        remarks: d.remarks || '',
      }));
    }

    const hasItems = detailData.length > 0 || Object.keys(matrixResults || {}).length > 0;
    if (!hasItems) {
      return NextResponse.json({ error: 'No inspection data provided' }, { status: 400 });
    }

    // Create the inspection record and details
    const inspection = await prisma.inspection.create({
      data: {
        airportId: auth.activeAirportId,
        date: date ? new Date(date) : new Date(),
        status: 'SUBMITTED', // Set directly to SUBMITTED for review
        inspectorId: inspector.id,
        details: {
          create: detailData,
        },
        // Store matrix results as JSON string
        matrixResults: matrixResults ? JSON.stringify(matrixResults) : null,
        // Bottom panel fields
        rubberDepositRunway11: rubberDepositRunway11 || null,
        rubberDepositRunway29: rubberDepositRunway29 || null,
        notam: notam || null,
        fodCondition: fodCondition || null,
        standingWaterCondition: standingWaterCondition || null,
        obstacleCondition: obstacleCondition || null,
        pavementCondition: pavementCondition || null,
        pavementTempRunway11: pavementTempRunway11 || null,
        pavementTempRunway29: pavementTempRunway29 || null,
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
