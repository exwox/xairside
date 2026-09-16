import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  damageCatalogConfigKey,
  effectiveSurfaceDamageCatalog,
  parseSurfaceDamageCatalog,
} from '@/lib/damage-catalog';
import type { DamageTypeEntry } from '@/types';

export async function GET() {
  try {
    const rows = await prisma.appConfig.findMany();
    const obj: Record<string, string> = {};
    rows.forEach((r) => (obj[r.key] = r.value));

    let damageTypesConfig: DamageTypeEntry[] | undefined = undefined;
    if (obj.damageTypesConfig) {
      try {
        const parsed: unknown = JSON.parse(obj.damageTypesConfig);
        if (Array.isArray(parsed)) damageTypesConfig = parsed as DamageTypeEntry[];
      } catch { /* ignore */ }
    }

    const asphaltKey = damageCatalogConfigKey('ASPHALT');
    const jpcpKey = damageCatalogConfigKey('JPCP');
    const asphaltCatalog = parseSurfaceDamageCatalog(obj[asphaltKey], 'ASPHALT');
    const jpcpCatalog = parseSurfaceDamageCatalog(obj[jpcpKey], 'JPCP');
    if ((obj[asphaltKey] && !asphaltCatalog) || (obj[jpcpKey] && !jpcpCatalog)) {
      return NextResponse.json({ error: 'Katalog kerusakan tersimpan tidak valid. Periksa konfigurasi Admin.' }, { status: 500 });
    }

    return NextResponse.json({
      arpLat: parseFloat(obj.arpLat ?? '0') || 0,
      arpLng: parseFloat(obj.arpLng ?? '0') || 0,
      airportName: obj.airportName ?? 'Airside',
      mapRotationDeg: parseFloat(obj.mapRotationDeg ?? '0') || 0,
      stationIntervalM: parseFloat(obj.stationIntervalM ?? '50') || 50,
      damageTypesConfig,
      damageCatalogs: {
        ASPHALT: effectiveSurfaceDamageCatalog('ASPHALT', asphaltCatalog, damageTypesConfig),
        JPCP: effectiveSurfaceDamageCatalog('JPCP', jpcpCatalog, damageTypesConfig),
      },
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    if (body.damageTypesConfig !== undefined) {
      return NextResponse.json(
        { error: 'Kode dan nama kerusakan kini dikelola per jenis perkerasan pada halaman Kurva DV.' },
        { status: 400 }
      );
    }
    const entries: [string, string][] = [];
    if (body.arpLat != null) entries.push(['arpLat', String(body.arpLat)]);
    if (body.arpLng != null) entries.push(['arpLng', String(body.arpLng)]);
    if (body.airportName != null) entries.push(['airportName', String(body.airportName)]);
    if (body.mapRotationDeg != null) entries.push(['mapRotationDeg', String(body.mapRotationDeg)]);
    if (body.stationIntervalM != null) entries.push(['stationIntervalM', String(body.stationIntervalM)]);
    for (const [key, value] of entries) {
      await prisma.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
