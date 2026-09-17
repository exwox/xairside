import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';
import { isPageAllowed } from '@/lib/page-access';
import { getRolePageAccess } from '@/lib/page-access-server';
import {
  cdvConfigKey,
  defaultCdvCurveSet,
  isSurfaceType,
  parseCdvCurveSet,
  validateCdvCurveSet,
} from '@/lib/cdv';

export async function GET(req: Request) {
  const auth = await requireAuthContext(req);
  if ('response' in auth) return auth.response;

  const surfaceType = new URL(req.url).searchParams.get('surfaceType');
  if (!isSurfaceType(surfaceType)) {
    return NextResponse.json(
      { error: 'surfaceType harus ASPHALT atau JPCP.' },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.airportConfig.findUnique({
      where: { airportId_key: { airportId: auth.activeAirportId, key: cdvConfigKey(surfaceType) } },
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
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    // Hanya ADMIN/SUPADMIN yang dapat mengubah kurva CDV
    if (auth.user.role !== 'ADMIN' && auth.user.role !== 'SUPADMIN') {
      return NextResponse.json({ error: 'Anda tidak memiliki hak akses untuk mengubah kurva CDV' }, { status: 403 });
    }

    const body = (await req.json()) as { surfaceType?: unknown; curves?: unknown };
    if (!isSurfaceType(body.surfaceType)) {
      return NextResponse.json(
        { error: 'surfaceType harus ASPHALT atau JPCP.' },
        { status: 400 }
      );
    }
    const curvePage = body.surfaceType === 'ASPHALT' ? 'cdvFlexible' : 'cdvRigid';
    if (!isPageAllowed(await getRolePageAccess(), auth.user.role, curvePage)) {
      return NextResponse.json({ error: 'Akses kurva CDV ditolak' }, { status: 403 });
    }

    const validation = validateCdvCurveSet(body.curves, body.surfaceType);
    if (!validation.ok || !validation.curves) {
      return NextResponse.json(
        { error: validation.error ?? 'Kurva CDV tidak valid.' },
        { status: 400 }
      );
    }

    const row = await prisma.airportConfig.upsert({
      where: { airportId_key: { airportId: auth.activeAirportId, key: cdvConfigKey(body.surfaceType) } },
      update: { value: JSON.stringify(validation.curves) },
      create: {
        airportId: auth.activeAirportId,
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
