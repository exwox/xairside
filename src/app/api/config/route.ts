import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';
import {
  damageCatalogConfigKey,
  effectiveSurfaceDamageCatalog,
  parseSurfaceDamageCatalog,
} from '@/lib/damage-catalog';
import type { DamageTypeEntry } from '@/types';

export async function GET(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const rows = await prisma.airportConfig.findMany({ where: { airportId: auth.activeAirportId } });
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
      arpLat: auth.activeAirport.refLat,
      arpLng: auth.activeAirport.refLng,
      airportName: auth.activeAirport.name,
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
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    if (body.damageTypesConfig !== undefined) {
      return NextResponse.json(
        { error: 'Kode dan nama kerusakan kini dikelola per jenis perkerasan pada halaman Kurva DV.' },
        { status: 400 }
      );
    }
    const entries: [string, string][] = [];
    if (body.mapRotationDeg != null) entries.push(['mapRotationDeg', String(body.mapRotationDeg)]);
    if (body.stationIntervalM != null) entries.push(['stationIntervalM', String(body.stationIntervalM)]);

    // ARP & nama airport kini disimpan di tabel Airport (per-airport)
    if (body.arpLat != null || body.arpLng != null || body.airportName != null) {
      await prisma.airport.update({
        where: { id: auth.activeAirportId },
        data: {
          ...(body.arpLat != null ? { refLat: Number(body.arpLat) } : {}),
          ...(body.arpLng != null ? { refLng: Number(body.arpLng) } : {}),
          ...(body.airportName != null ? { name: String(body.airportName) } : {}),
        },
      });
    }

    for (const [key, value] of entries) {
      await prisma.airportConfig.upsert({
        where: { airportId_key: { airportId: auth.activeAirportId, key } },
        update: { value },
        create: { airportId: auth.activeAirportId, key, value },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
