import type { DamageTypeEntry } from '@/types';
import { DEFAULT_DAMAGE_TYPES_CONFIG } from './constants';
import { distressCatalog, type SurfaceType } from './pci-data';

/** The id and pciCode identify a distress; code and name are editable labels. */
export interface SurfaceDamageCatalogEntry {
  id: string;
  code: string;
  name: string;
  pciCode: number | null;
  aliases: string[];
}

const key = (value: string) => value.trim().toLocaleLowerCase('en-US');
const builtInId = (surface: SurfaceType, pciCode: number) => surface === 'ASPHALT'
  ? `${surface}-F-${String(pciCode).padStart(2, '0')}`
  : `${surface}-R-${String(pciCode - 20).padStart(2, '0')}`;

// The road catalog used a different numbering scheme. Only equivalent old
// distresses may resolve to the new airfield code; an old numeric ID is never
// interpreted by its matching index in the airfield catalog.
const LEGACY_ASPHALT_TO_AIRFIELD: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 5: 4, 6: 5, 8: 7, 10: 8,
  11: 10, 12: 11, 18: 12, 15: 13, 16: 14, 17: 16,
};

const LEGACY_ASPHALT_NAMES: Record<number, string[]> = {
  1: ['Alligator Cracking', 'Alligator Cracking (Retak Buaya)'],
  2: ['Bleeding', 'Bleeding (Pendaran Aspal)'],
  3: ['Block Cracking', 'Block Cracking (Retak Blok)'],
  5: ['Corrugation', 'Corrugation (Kerut)'],
  6: ['Depression', 'Depression (Lekukan)'],
  8: ['Joint Reflection Cracking'],
  10: ['Longitudinal & Transverse Cracking'],
  11: ['Patching & Utility Cut'],
  12: ['Polished Aggregate', 'Polished Aggregate (Agregat Mengkilap)'],
  18: ['Weathering/Raveling', 'Weathering/Raveling (Pelapukan)'],
  15: ['Rutting', 'Rutting (Alur Ban)'],
  16: ['Shoving', 'Shoving (Dorongan)'],
  17: ['Swelling', 'Swelling (Ambang)'],
};

const AIRFIELD_TITLE_NAMES: Record<number, string> = {
  1: 'Alligator Cracking', 2: 'Bleeding', 3: 'Block Cracking',
  4: 'Corrugation', 5: 'Depression', 6: 'Jet Blast Erosion',
  7: 'Joint Reflection Cracking', 8: 'Longitudinal & Transverse Cracking',
  9: 'Oil Spillage', 10: 'Patching', 11: 'Polished Aggregate',
  12: 'Raveling/Weathering', 13: 'Rutting', 14: 'Shoving',
  15: 'Slippage Cracking', 16: 'Swell',
};

// The former JPCP catalog also used internal numbers 21–36, but its order
// differs from the rigid workbook. Resolve historical IDs only by equivalent
// distress, never by their matching position in the new list.
const LEGACY_JPCP_TO_AIRFIELD: Record<number, number> = {
  21: 21, 22: 22, 23: 31, 24: 24, 25: 30, 28: 23,
  29: 26, 30: 25, 31: 27, 32: 28, 34: 32, 35: 34, 36: 33,
};

const LEGACY_JPCP_NAMES: Record<number, string[]> = {
  21: ['Blowup/Buckling'],
  22: ['Corner Break'],
  23: ['Divided (Shattered) Slab'],
  24: ['Durability (D-Cracking)'],
  25: ['Faulting'],
  28: ['Linear Cracking'],
  29: ['Large Patch & Utility Cut'],
  30: ['Small Patch'],
  31: ['Popouts'],
  32: ['Pumping'],
  34: ['Shrinkage Cracking'],
  35: ['Spalling (Corner)'],
  36: ['Spalling (Joint)'],
};

function asphaltAliases(pciCode: number, canonicalName: string): string[] {
  const aliases = [AIRFIELD_TITLE_NAMES[pciCode]];
  for (const [oldCode, newCode] of Object.entries(LEGACY_ASPHALT_TO_AIRFIELD)) {
    if (newCode !== pciCode) continue;
    const old = Number(oldCode);
    aliases.push(`ASPHALT-${old}`, `A-${String(old).padStart(2, '0')}`, ...(LEGACY_ASPHALT_NAMES[old] ?? []));
  }
  return [...new Set(aliases.filter((alias) => alias && key(alias) !== key(canonicalName)))];
}

function rigidAliases(pciCode: number, canonicalName: string): string[] {
  const aliases: string[] = [];
  for (const [oldCode, newCode] of Object.entries(LEGACY_JPCP_TO_AIRFIELD)) {
    if (newCode !== pciCode) continue;
    aliases.push(`JPCP-${oldCode}`, ...(LEGACY_JPCP_NAMES[Number(oldCode)] ?? []));
  }
  return [...new Set(aliases.filter((alias) => key(alias) !== key(canonicalName)))];
}

export function damageCatalogConfigKey(surface: SurfaceType): string {
  return surface === 'ASPHALT' ? 'pciDamageCatalogAirfieldAsphalt' : 'pciDamageCatalogAirfieldJpcp';
}

export function pciCodeForDamageCode(code: string, surface: SurfaceType): number | null {
  const trimmed = code.trim();
  if (surface === 'ASPHALT') {
    const airfield = /^F-(0?[1-9]|1[0-6])$/i.exec(trimmed);
    if (airfield) return Number(airfield[1]);
    const legacy = /^A-(0?[1-9]|1[0-8])$/i.exec(trimmed);
    return legacy ? LEGACY_ASPHALT_TO_AIRFIELD[Number(legacy[1])] ?? null : null;
  }
  const rigid = /^R-(0?[1-9]|1[0-4])$/i.exec(trimmed);
  if (rigid) return Number(rigid[1]) + 20;
  const jpcp = /^(?:JPCP-)?(2[1-9]|3[0-6])$/i.exec(trimmed);
  return jpcp ? LEGACY_JPCP_TO_AIRFIELD[Number(jpcp[1])] ?? null : null;
}

export function defaultSurfaceDamageCatalog(surface: SurfaceType): SurfaceDamageCatalogEntry[] {
  const airfieldNames = new Map(DEFAULT_DAMAGE_TYPES_CONFIG
    .filter((entry) => /^F-/.test(entry.code))
    .map((entry) => [pciCodeForDamageCode(entry.code, 'ASPHALT'), entry]));
  const pciEntries = distressCatalog(surface).map((definition) => {
    const airfield = surface === 'ASPHALT' ? airfieldNames.get(definition.code) : undefined;
    const code = airfield?.code ?? `R-${String(definition.code - 20).padStart(2, '0')}`;
    const name = airfield?.name ?? definition.name;
    return {
      id: builtInId(surface, definition.code), code, name, pciCode: definition.code,
      aliases: surface === 'ASPHALT'
        ? asphaltAliases(definition.code, name)
        : rigidAliases(definition.code, name),
    };
  });
  const operational = DEFAULT_DAMAGE_TYPES_CONFIG.filter((entry) => /^D-/.test(entry.code)).map((entry) => ({
    id: `${surface}-${entry.code}`, code: entry.code, name: entry.name,
    pciCode: null, aliases: [] as string[],
  }));
  return [...pciEntries, ...operational];
}

/** Reject ambiguous labels and attempts to reassign a built-in PCI code. */
export function validateSurfaceDamageCatalog(
  input: unknown,
  surface: SurfaceType
): { ok: true; catalog: SurfaceDamageCatalogEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0 || input.length > 200) {
    return { ok: false, error: 'Katalog kerusakan harus berisi 1–200 entri.' };
  }
  const builtIns = new Map(distressCatalog(surface).map((definition) => [builtInId(surface, definition.code), definition.code]));
  const seenIds = new Set<string>();
  const seenPciCodes = new Set<number>();
  const seenLabels = new Map<string, string>();
  const catalog: SurfaceDamageCatalogEntry[] = [];
  for (const [index, raw] of input.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: `Entri ${index + 1} tidak valid.` };
    }
    const entry = raw as Record<string, unknown>;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const code = typeof entry.code === 'string' ? entry.code.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!id || id.length > 100 || !code || code.length > 40 || !name || name.length > 160) {
      return { ok: false, error: `ID, kode, atau nama entri ${index + 1} kosong atau terlalu panjang.` };
    }
    if (!id.startsWith(`${surface}-`)) {
      return { ok: false, error: `ID ${id} bukan milik katalog ${surface}.` };
    }
    if (seenIds.has(key(id))) return { ok: false, error: `ID ${id} digunakan lebih dari sekali.` };
    seenIds.add(key(id));
    const expectedPciCode = builtIns.get(id);
    const pciCode = entry.pciCode;
    if (expectedPciCode != null ? pciCode !== expectedPciCode : pciCode !== null) {
      return { ok: false, error: `Kode PCI internal entri ${id} tidak boleh diubah.` };
    }
    if (surface === 'ASPHALT' && expectedPciCode != null
      && code !== `F-${String(expectedPciCode).padStart(2, '0')}`) {
      return { ok: false, error: `Kode kerusakan ${id} harus tetap F-${String(expectedPciCode).padStart(2, '0')}.` };
    }
    if (surface === 'JPCP' && expectedPciCode != null
      && code !== `R-${String(expectedPciCode - 20).padStart(2, '0')}`) {
      return { ok: false, error: `Kode kerusakan ${id} harus tetap R-${String(expectedPciCode - 20).padStart(2, '0')}.` };
    }
    if (typeof pciCode === 'number') {
      if (seenPciCodes.has(pciCode)) return { ok: false, error: `Kode PCI ${pciCode} digunakan lebih dari sekali.` };
      seenPciCodes.add(pciCode);
    }
    if (!Array.isArray(entry.aliases) || entry.aliases.length > 100
      || entry.aliases.some((alias) => typeof alias !== 'string' || !alias.trim() || alias.length > 160)) {
      return { ok: false, error: `Alias entri ${id} tidak valid.` };
    }
    const aliases = [...new Set((entry.aliases as string[]).map((alias) => alias.trim()))]
      .filter((alias) => key(alias) !== key(code) && key(alias) !== key(name));
    for (const label of [id, code, name, ...aliases]) {
      const normalized = key(label);
      const owner = seenLabels.get(normalized);
      if (owner && owner !== id) {
        return { ok: false, error: `Kode/nama/alias "${label}" ambigu antara ${owner} dan ${id}.` };
      }
      seenLabels.set(normalized, id);
    }
    catalog.push({ id, code, name, pciCode: pciCode as number | null, aliases });
  }
  for (const [id] of builtIns) {
    if (!catalog.some((entry) => entry.id === id)) {
      return { ok: false, error: `Kode PCI bawaan ${id} tidak boleh dihapus.` };
    }
  }
  return { ok: true, catalog };
}

export function parseSurfaceDamageCatalog(raw: string | null | undefined, surface: SurfaceType): SurfaceDamageCatalogEntry[] | null {
  if (!raw) return null;
  try {
    const validation = validateSurfaceDamageCatalog(JSON.parse(raw), surface);
    return validation.ok ? validation.catalog : null;
  } catch {
    return null;
  }
}

function legacyEntries(value?: DamageTypeEntry[] | null): DamageTypeEntry[] {
  return Array.isArray(value) ? value.filter((entry) => entry
    && typeof entry.code === 'string' && entry.code.trim()
    && typeof entry.name === 'string' && entry.name.trim()) : [];
}

function addAlias(entry: SurfaceDamageCatalogEntry, alias: string): void {
  const normalized = key(alias);
  if (normalized && ![entry.code, entry.name, ...entry.aliases].some((label) => key(label) === normalized)) {
    entry.aliases.push(alias.trim());
  }
}

/** Workbook names stay authoritative; historical equivalent labels remain aliases. */
export function effectiveSurfaceDamageCatalog(
  surface: SurfaceType,
  persisted?: SurfaceDamageCatalogEntry[] | null,
  legacyConfig?: DamageTypeEntry[] | null
): SurfaceDamageCatalogEntry[] {
  const hasPersisted = persisted != null;
  const catalog = (persisted ?? defaultSurfaceDamageCatalog(surface)).map((entry) => ({ ...entry, aliases: [...entry.aliases] }));
  for (const legacy of legacyEntries(legacyConfig)) {
    const legacyCode = legacy.code.trim();
    const legacyName = legacy.name.trim();
    if ((surface === 'ASPHALT' && /^F-/i.test(legacyCode))
      || (surface === 'JPCP' && /^(?:R-|JPCP-)/i.test(legacyCode))) {
      // Old display codes used another order; they cannot rename workbook entries.
      continue;
    }
    const pciCode = pciCodeForDamageCode(legacyCode, surface);
    if (pciCode != null) {
      const current = catalog.find((entry) => entry.pciCode === pciCode);
      if (!current) continue;
      addAlias(current, legacyName);
      addAlias(current, legacyCode);
      continue;
    }
    if (/^(?:A-|F-|R-|JPCP-)/i.test(legacyCode)) continue;
    const current = catalog.find((entry) => key(entry.code) === key(legacyCode));
    if (current) {
      if (!hasPersisted) {
        const formerName = current.name;
        current.name = legacyName;
        addAlias(current, formerName);
      } else {
        addAlias(current, legacyName);
      }
    } else if (!hasPersisted && catalog.length < 200) {
      catalog.push({
        id: `${surface}-LEGACY-${legacyCode.toUpperCase()}`,
        code: legacyCode, name: legacyName, pciCode: null, aliases: [],
      });
    }
  }
  return catalog;
}

/** Preserve old labels on rename so historical Damage.type values keep resolving. */
export function retainDamageCatalogAliases(
  previous: SurfaceDamageCatalogEntry[],
  next: SurfaceDamageCatalogEntry[]
): SurfaceDamageCatalogEntry[] {
  const byId = new Map(previous.map((entry) => [entry.id, entry]));
  return next.map((entry) => {
    const result = { ...entry, aliases: [...entry.aliases] };
    const old = byId.get(entry.id);
    if (old) {
      addAlias(result, old.code);
      addAlias(result, old.name);
      for (const alias of old.aliases) addAlias(result, alias);
    }
    return result;
  });
}

export function resolveDamageCatalogEntry(
  type: string,
  surface: SurfaceType,
  catalog?: SurfaceDamageCatalogEntry[] | null,
  legacyConfig?: DamageTypeEntry[] | null
): SurfaceDamageCatalogEntry | null {
  const normalized = key(type);
  if (!normalized) return null;
  const entries = catalog ?? effectiveSurfaceDamageCatalog(surface, null, legacyConfig);
  const direct = entries.find((entry) => key(entry.id) === normalized)
    ?? entries.find((entry) => [entry.code, entry.name, ...entry.aliases].some((label) => key(label) === normalized));
  if (direct) return direct;
  const legacy = legacyEntries(legacyConfig).find((entry) => key(entry.name) === normalized || key(entry.code) === normalized);
  // Legacy rigid names with R-xx display codes are ambiguous after reordering.
  // Their equivalent old names are handled by explicit aliases above.
  const pciCode = pciCodeForDamageCode(surface === 'JPCP' ? type : legacy?.code ?? type, surface);
  return pciCode == null ? null : entries.find((entry) => entry.pciCode === pciCode) ?? null;
}
