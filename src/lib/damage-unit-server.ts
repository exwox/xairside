import { prisma } from './db';
import {
  damageCatalogConfigKey,
  effectiveSurfaceDamageCatalog,
  parseSurfaceDamageCatalog,
  resolveDamageCatalogEntry,
} from './damage-catalog';
import { distressCatalog, type DistressDef, type SurfaceType } from './pci-data';
import type { DamageUnit } from './damage-measurement';
import type { DamageTypeEntry } from '@/types';

/** The editable DV catalog owns the visible code/name; the stable PCI code owns
 * the quantity unit. Unknown operational findings remain geometry-validated. */
export async function damageDefinitionForType(type: string, facilityId: string | null): Promise<DistressDef | null> {
  if (!facilityId) return null;
  const facility = await prisma.facility.findUnique({ where: { id: facilityId }, select: { surfaceType: true } });
  const surface: SurfaceType | null = facility?.surfaceType === 'ASPHALT' ? 'ASPHALT'
    : facility?.surfaceType === 'CONCRETE' ? 'JPCP' : null;
  if (!surface) return null;
  const keys = [damageCatalogConfigKey(surface), 'damageTypesConfig'];
  const settings = await prisma.appConfig.findMany({ where: { key: { in: keys } } });
  const config = Object.fromEntries(settings.map(({ key, value }) => [key, value]));
  let legacy: DamageTypeEntry[] | null = null;
  try {
    const parsed: unknown = JSON.parse(config.damageTypesConfig ?? 'null');
    if (Array.isArray(parsed)) legacy = parsed as DamageTypeEntry[];
  } catch { /* malformed historical config cannot alter the PCI code */ }
  const catalog = effectiveSurfaceDamageCatalog(
    surface,
    parseSurfaceDamageCatalog(config[damageCatalogConfigKey(surface)], surface),
    legacy
  );
  const pciCode = resolveDamageCatalogEntry(type, surface, catalog, legacy)?.pciCode;
  return distressCatalog(surface).find((definition) => definition.code === pciCode) ?? null;
}

export async function damageUnitForType(type: string, facilityId: string | null): Promise<DamageUnit | null> {
  return (await damageDefinitionForType(type, facilityId))?.unit ?? null;
}

export function isDamageSeverityAllowed(definition: DistressDef | null, severity: unknown): boolean {
  return definition
    ? definition.severities.includes(severity as DistressDef['severities'][number])
    : severity === 'L' || severity === 'M' || severity === 'H';
}
