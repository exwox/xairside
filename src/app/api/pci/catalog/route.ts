import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { distressCatalog } from '@/lib/pci-data';
import { damageCatalogConfigKey, effectiveSurfaceDamageCatalog, parseSurfaceDamageCatalog } from '@/lib/damage-catalog';
import { pciRating } from '@/lib/pci';
import type { DamageTypeEntry } from '@/types';

// Katalog ASPHALT dan JPCP mengikuti masing-masing tabel kurva workbook airfield.
export async function GET() {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: ['damageTypesConfig', damageCatalogConfigKey('ASPHALT'), damageCatalogConfigKey('JPCP')] } },
  });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  let legacy: DamageTypeEntry[] | null = null;
  try {
    const parsed: unknown = JSON.parse(values.damageTypesConfig ?? 'null');
    if (Array.isArray(parsed)) legacy = parsed as DamageTypeEntry[];
  } catch { /* Data lama yang tidak valid tidak dipakai. */ }
  const storedAsphalt = parseSurfaceDamageCatalog(values[damageCatalogConfigKey('ASPHALT')], 'ASPHALT');
  const storedJpcp = parseSurfaceDamageCatalog(values[damageCatalogConfigKey('JPCP')], 'JPCP');
  if ((values[damageCatalogConfigKey('ASPHALT')] && !storedAsphalt)
    || (values[damageCatalogConfigKey('JPCP')] && !storedJpcp)) {
    return NextResponse.json({ error: 'Katalog kerusakan tersimpan tidak valid.' }, { status: 500 });
  }
  const asphaltNames = effectiveSurfaceDamageCatalog('ASPHALT', storedAsphalt, legacy);
  const jpcpNames = effectiveSurfaceDamageCatalog('JPCP', storedJpcp, legacy);
  const asfalt = distressCatalog('ASPHALT').map((d) => ({
    code: d.code,
    displayCode: asphaltNames.find((entry) => entry.pciCode === d.code)?.code ?? `A-${String(d.code).padStart(2, '0')}`,
    name: asphaltNames.find((entry) => entry.pciCode === d.code)?.name ?? d.name,
    unit: d.unit,
    severities: d.severities,
  }));
  const beton = distressCatalog('JPCP').map((d) => ({
    code: d.code,
    displayCode: jpcpNames.find((entry) => entry.pciCode === d.code)?.code ?? `R-${String(d.code - 20).padStart(2, '0')}`,
    name: jpcpNames.find((entry) => entry.pciCode === d.code)?.name ?? d.name,
    unit: d.unit,
    severities: d.severities,
  }));
  const ratings = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5].map((v) => ({
    pci: v,
    ...pciRating(v),
  }));
  return NextResponse.json({ ASPHALT: asfalt, JPCP: beton, ratings });
}
