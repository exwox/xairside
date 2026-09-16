import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  cdvConfigKey,
  defaultCdvCurveSet,
  isSurfaceType,
  parseCdvCurveSet,
  validateCdvCurveSet,
} from '@/lib/cdv';

export async function GET(req: Request) {
  const surfaceType = new URL(req.url).searchParams.get('surfaceType');
  if (!isSurfaceType(surfaceType)) {
    return NextResponse.json(
      { error: 'surfaceType harus ASPHALT atau JPCP.' },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.appConfig.findUnique({
      where: { key: cdvConfigKey(surfaceType) },
    });
    const stored = parseCdvCurveSet(row?.value, surfaceType);
    return NextResponse.json({
      surfaceType,
      curves: stored ?? defaultCdvCurveSet(surfaceType),
      source: stored ? 'database' : 'default',
      updatedAt: stored ? row?.updatedAt.toISOString() : null,
    });
  } catch (error) {
    console.error('Error fetching CDV curves:', error);
    return NextResponse.json({ error: 'Gagal memuat kurva CDV.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { surfaceType?: unknown; curves?: unknown };
    if (!isSurfaceType(body.surfaceType)) {
      return NextResponse.json(
        { error: 'surfaceType harus ASPHALT atau JPCP.' },
        { status: 400 }
      );
    }

    const validation = validateCdvCurveSet(body.curves, body.surfaceType);
    if (!validation.ok || !validation.curves) {
      return NextResponse.json(
        { error: validation.error ?? 'Kurva CDV tidak valid.' },
        { status: 400 }
      );
    }

    const row = await prisma.appConfig.upsert({
      where: { key: cdvConfigKey(body.surfaceType) },
      update: { value: JSON.stringify(validation.curves) },
      create: {
        key: cdvConfigKey(body.surfaceType),
        value: JSON.stringify(validation.curves),
      },
    });

    return NextResponse.json({
      ok: true,
      surfaceType: body.surfaceType,
      curves: validation.curves,
      source: 'database',
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error saving CDV curves:', error);
    return NextResponse.json({ error: 'Gagal menyimpan kurva CDV.' }, { status: 500 });
  }
}
