import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { compactDvCurveSet, dvConfigKey, mergedDvCurveSet, parseDvCurveSet, validateDvCurveSet } from '@/lib/dv';
import {
  damageCatalogConfigKey,
  effectiveSurfaceDamageCatalog,
  parseSurfaceDamageCatalog,
  retainDamageCatalogAliases,
  validateSurfaceDamageCatalog,
} from '@/lib/damage-catalog';
import type { SurfaceType } from '@/lib/pci-data';
import type { DamageTypeEntry } from '@/types';

function isSurfaceType(value: unknown): value is SurfaceType {
  return value === 'ASPHALT' || value === 'JPCP';
}

function parseLegacyConfig(raw: string | null | undefined): DamageTypeEntry[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value as DamageTypeEntry[] : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const surfaceType = new URL(req.url).searchParams.get('surfaceType');
  if (!isSurfaceType(surfaceType)) {
    return NextResponse.json({ error: 'surfaceType harus ASPHALT atau JPCP.' }, { status: 400 });
  }
  try {
    const [row, catalogRow, legacyRow] = await Promise.all([
      prisma.appConfig.findUnique({ where: { key: dvConfigKey(surfaceType) } }),
      prisma.appConfig.findUnique({ where: { key: damageCatalogConfigKey(surfaceType) } }),
      prisma.appConfig.findUnique({ where: { key: 'damageTypesConfig' } }),
    ]);
    const stored = parseDvCurveSet(row?.value, surfaceType);
    if (row && !stored) {
      return NextResponse.json({ error: 'Kurva DV tersimpan tidak valid. Periksa konfigurasi Admin.' }, { status: 500 });
    }
    const storedCatalog = parseSurfaceDamageCatalog(catalogRow?.value, surfaceType);
    if (catalogRow && !storedCatalog) {
      return NextResponse.json({ error: 'Katalog kerusakan tersimpan tidak valid. Periksa konfigurasi Admin.' }, { status: 500 });
    }
    return NextResponse.json({
      surfaceType,
      curves: mergedDvCurveSet(surfaceType, stored),
      catalog: effectiveSurfaceDamageCatalog(surfaceType, storedCatalog, parseLegacyConfig(legacyRow?.value)),
      catalogSource: storedCatalog ? 'database' : 'default',
      source: stored && Object.keys(stored).length > 0 ? 'database' : 'default',
      updatedAt: stored && Object.keys(stored).length > 0 ? row?.updatedAt.toISOString() : null,
    });
  } catch (error) {
    console.error('Error fetching DV curves:', error);
    return NextResponse.json({ error: 'Gagal memuat kurva DV.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { surfaceType?: unknown; curves?: unknown; catalog?: unknown };
    if (!isSurfaceType(body.surfaceType)) {
      return NextResponse.json({ error: 'surfaceType harus ASPHALT atau JPCP.' }, { status: 400 });
    }
    const validation = validateDvCurveSet(body.curves, body.surfaceType);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const curves = mergedDvCurveSet(body.surfaceType, validation.curves);
    const compact = compactDvCurveSet(body.surfaceType, curves);
    const surface = body.surfaceType;
    let catalog = null;
    if (body.catalog !== undefined) {
      const incoming = validateSurfaceDamageCatalog(body.catalog, surface);
      if (!incoming.ok) return NextResponse.json({ error: incoming.error }, { status: 400 });
      const [catalogRow, legacyRow] = await Promise.all([
        prisma.appConfig.findUnique({ where: { key: damageCatalogConfigKey(surface) } }),
        prisma.appConfig.findUnique({ where: { key: 'damageTypesConfig' } }),
      ]);
      const storedCatalog = parseSurfaceDamageCatalog(catalogRow?.value, surface);
      if (catalogRow && !storedCatalog) {
        return NextResponse.json({ error: 'Katalog kerusakan tersimpan tidak valid. Periksa konfigurasi Admin.' }, { status: 500 });
      }
      const previous = effectiveSurfaceDamageCatalog(surface, storedCatalog, parseLegacyConfig(legacyRow?.value));
      const merged = retainDamageCatalogAliases(previous, incoming.catalog);
      const checked = validateSurfaceDamageCatalog(merged, surface);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      catalog = checked.catalog;
    }
    const operations = [prisma.appConfig.upsert({
      where: { key: dvConfigKey(surface) },
      update: { value: JSON.stringify(compact) },
      create: { key: dvConfigKey(surface), value: JSON.stringify(compact) },
    })];
    if (catalog) operations.push(prisma.appConfig.upsert({
      where: { key: damageCatalogConfigKey(surface) },
      update: { value: JSON.stringify(catalog) },
      create: { key: damageCatalogConfigKey(surface), value: JSON.stringify(catalog) },
    }));
    const [row] = await prisma.$transaction(operations);
    return NextResponse.json({
      ok: true, surfaceType: surface, curves, catalog,
      catalogSource: catalog ? 'database' : undefined,
      source: Object.keys(compact).length > 0 ? 'database' : 'default',
      updatedAt: Object.keys(compact).length > 0 ? row.updatedAt.toISOString() : null,
    });
  } catch (error) {
    console.error('Error saving DV curves:', error);
    return NextResponse.json({ error: 'Gagal menyimpan kurva DV.' }, { status: 500 });
  }
}
