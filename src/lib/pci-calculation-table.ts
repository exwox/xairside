import type { DamageTypeEntry } from '@/types';
import type { PciLocationRow } from './pci-location-table';
import { getDamageCode } from './constants';
import { pciCodeForDamageCode, resolveDamageCatalogEntry, type SurfaceDamageCatalogEntry } from './damage-catalog';
import { distressCatalog, type DistressDef, type SurfaceType } from './pci-data';
import {
  computeDensity,
  computeMaximumCorrectedDeductValue,
  deductValue,
  pciRating,
  type CdvIteration,
} from './pci';
import { defaultCdvCurveSet, type CdvCurveSet } from './cdv';
import { catalogWithDvCurves, type DvCurveSet } from './dv';

export type PciCalculationState = 'calculated' | 'unassessed' | 'unsupported';

export interface PciCalculationLine {
  type: string;
  code: string;
  pciCode: number | null;
  severity: 'L' | 'M' | 'H' | '-';
  volume: number;
  unit: 'm²' | 'm' | 'count' | null;
  density: number | null;
  dv: number | null;
  findingCount: number;
  supported: boolean;
  diagnostic: string | null;
}

export interface PciCalculationRow {
  state: PciCalculationState;
  lines: PciCalculationLine[];
  sortedDvs: number[];
  allowableDeducts: number | null;
  iterations: CdvIteration[];
  maxCdv: number | null;
  pci: number;
  rating: ReturnType<typeof pciRating> | null;
  diagnostics: string[];
  activeFindingCount: number;
  closedFindingCount: number;
}

function resolvePciCode(
  type: string,
  surfaceType: SurfaceType,
  config: DamageTypeEntry[] | null | undefined,
  catalog?: SurfaceDamageCatalogEntry[] | null
): { code: string; pciCode: number | null; name: string } {
  if (catalog) {
    const entry = resolveDamageCatalogEntry(type, surfaceType, catalog, config);
    return entry
      ? { code: entry.code, pciCode: entry.pciCode, name: entry.name }
      : { code: getDamageCode(type, config), pciCode: null, name: type };
  }
  const entry = resolveDamageCatalogEntry(type, surfaceType, undefined, config);
  if (entry) return { code: entry.code, pciCode: entry.pciCode, name: entry.name };
  const configured = config?.find((entry) => entry.name === type)?.code;
  const code = configured ?? getDamageCode(type, config);
  return { code, pciCode: pciCodeForDamageCode(code, surfaceType), name: type };
}

function volumeForUnit(
  damage: PciLocationRow['damages'][number],
  definition: DistressDef | undefined
): { volume: number; unit: PciCalculationLine['unit']; valid: boolean } {
  if (!definition || definition.unit === 'PERCENT') {
    const volume = damage.areaSqm;
    return { volume, unit: 'm²', valid: Number.isFinite(volume) && volume > 0 };
  }
  if (definition.unit === 'LENGTH') {
    const volume = damage.lengthM ?? NaN;
    return {
      volume,
      unit: 'm',
      valid: damage.geometryType === 'LINE' && Number.isFinite(volume) && volume > 0,
    };
  }
  if (definition.surface === 'JPCP') {
    // An unambiguous historical slab label safely identifies one affected slab.
    // Area is never converted into a slab count.
    const slab = slabKeyForDamage(damage);
    const volume = damage.count ?? (slab ? 1 : NaN);
    return { volume, unit: 'count', valid: Boolean(slab) && volume === 1 };
  }
  const volume = damage.count ?? NaN;
  return { volume, unit: 'count', valid: Number.isInteger(volume) && volume > 0 };
}

function slabKeyForDamage(damage: PciLocationRow['damages'][number]): string | null {
  const label = damage.sampleCode ?? damage.station ?? '';
  const match = /\bSAM-(\d+)\s+Slab\s+([A-Z]+)\b/i.exec(label);
  return match ? `SAM-${Number(match[1])} Slab ${match[2].toUpperCase()}` : null;
}

/**
 * Read-only PCI presentation model for one existing STA/SAM inventory row.
 * A location without an active finding receives the PCI koreksi value (default 100)
 * as its PCI/SAMPLE since CDV is not calculated. All active findings must be
 * interpretable before a reduced score is exposed.
 */
export function buildPciCalculationRow(
  row: PciLocationRow,
  surfaceType: SurfaceType | null,
  damageTypesConfig?: DamageTypeEntry[] | null,
  cdvCurves?: CdvCurveSet | null,
  dvCurves?: DvCurveSet | null,
  damageCatalog?: SurfaceDamageCatalogEntry[] | null,
  pciCorrection = 100
): PciCalculationRow {
  const active = row.damages.filter((damage) => damage.status !== 'CLOSED');
  const closed = row.damages.filter((damage) => damage.status === 'CLOSED');
  const activeFindingCount = new Set(active.map((damage) => damage.groupId || damage.id)).size;
  const closedFindingCount = new Set(closed.map((damage) => damage.groupId || damage.id)).size;
  const base: PciCalculationRow = {
    state: 'unassessed', lines: [], sortedDvs: [], allowableDeducts: null,
    iterations: [], maxCdv: null, pci: pciCorrection, rating: null, diagnostics: [],
    activeFindingCount, closedFindingCount,
  };
  if (active.length === 0) {
    base.diagnostics.push(closed.length > 0
      ? 'Hanya ada catatan selesai; lokasi belum memiliki penilaian PCI aktif.'
      : 'Belum ada catatan kerusakan atau survei PCI di lokasi ini.');
    return base;
  }

  if (!surfaceType) {
    const groups = new Map<string, { line: PciCalculationLine; findingIds: Set<string> }>();
    for (const damage of active) {
      const code = getDamageCode(damage.type, damageTypesConfig);
      const key = `${damage.type}|${damage.severity}`;
      const group = groups.get(key) ?? {
        line: {
          type: damage.type, code, pciCode: null, severity: damage.severity,
          volume: 0, unit: 'm²' as const, density: null, dv: null,
          findingCount: 0, supported: false,
          diagnostic: 'Tetapkan jenis perkerasan ASPHALT atau CONCRETE pada fasilitas di Admin.',
        },
        findingIds: new Set<string>(),
      };
      group.line.volume += damage.areaSqm;
      group.findingIds.add(damage.groupId || damage.id);
      groups.set(key, group);
    }
    base.lines = [...groups.values()].map(({ line, findingIds }) => ({ ...line, findingCount: findingIds.size }));
    base.state = 'unsupported';
    base.diagnostics = ['Tetapkan jenis perkerasan ASPHALT atau CONCRETE pada fasilitas di Admin.'];
    return base;
  }

  const catalog = dvCurves ? catalogWithDvCurves(surfaceType, dvCurves) : distressCatalog(surfaceType);
  const groups = new Map<string, {
    line: PciCalculationLine;
    definition: DistressDef | undefined;
    findingIds: Set<string>;
  }>();
  const seenRigidSlabs = new Set<string>();
  for (const damage of [...active].sort((left, right) =>
    'HML'.indexOf(left.severity) - 'HML'.indexOf(right.severity))) {
    const resolved = resolvePciCode(damage.type, surfaceType, damageTypesConfig, damageCatalog);
    const definition = catalog.find((entry) => entry.code === resolved.pciCode);
    if (definition?.unit === 'COUNT' && definition.surface === 'JPCP') {
      const slab = slabKeyForDamage(damage);
      if (slab) {
        const slabKey = `${resolved.pciCode}|${slab}`;
        if (seenRigidSlabs.has(slabKey)) continue;
        seenRigidSlabs.add(slabKey);
      }
    }
    const key = `${resolved.pciCode ?? `${resolved.code}:${damage.type}`}|${damage.severity}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        line: {
          type: resolved.name, code: resolved.code, pciCode: resolved.pciCode,
          severity: damage.severity, volume: 0, unit: null,
          density: null, dv: null, findingCount: 0,
          supported: true, diagnostic: null,
        },
        definition,
        findingIds: new Set(),
      };
      groups.set(key, group);
    }
    group.findingIds.add(damage.groupId || damage.id);
    if (!definition) {
      group.line.supported = false;
      group.line.diagnostic = surfaceType === 'JPCP'
        ? `Kode ${resolved.code} tidak tersedia pada katalog PCI rigit. Pilih jenis R-01–R-14 yang sesuai atau tinjau catatan lama.`
        : `Kode ${resolved.code} tidak tersedia pada katalog PCI ${surfaceType}.`;
    } else if (!definition.severities.includes(damage.severity)) {
      group.line.supported = false;
      group.line.diagnostic = `Severity ${damage.severity} tidak didukung untuk kode ${resolved.code}.`;
    }
    const quantity = volumeForUnit(damage, definition);
    group.line.unit = quantity.unit;
    if (!quantity.valid) {
      group.line.supported = false;
      group.line.diagnostic = definition?.unit === 'COUNT'
        ? (definition.surface === 'JPCP'
          ? `Kode ${resolved.code} memerlukan identitas slab SAM-n Slab X dan jumlah 1 per slab; catatan lama perlu ditinjau.`
          : `Kode ${resolved.code} memerlukan jumlah kejadian; catatan lama tanpa jumlah harus ditinjau dan dilengkapi.`)
        : definition?.unit === 'LENGTH'
          ? `Kode ${resolved.code} harus digambar sebagai garis dengan panjang (m) yang valid.`
          : `Volume ${quantity.unit ?? ''} untuk kode ${resolved.code} tidak tersedia atau tidak valid.`;
    } else {
      group.line.volume += quantity.volume;
    }
  }

  base.lines = [...groups.values()].map(({ line, definition, findingIds }) => {
    line.findingCount = findingIds.size;
    if (!line.supported || !definition) return line;
    if (!Number.isFinite(row.areaSqm) || row.areaSqm == null || row.areaSqm <= 0) {
      line.supported = false;
      line.diagnostic = 'Luas unit STA/SAM belum tersedia sebagai penyebut density.';
      return line;
    }
    if (definition.unit === 'PERCENT' && line.volume > row.areaSqm + 1e-6) {
      line.supported = false;
      line.diagnostic = `Luas kerusakan ${line.code} melebihi luas unit STA/SAM.`;
      return line;
    }
    if (definition.unit === 'COUNT' && definition.surface === 'JPCP'
      && (!Number.isInteger(row.slabCount) || (row.slabCount ?? 0) <= 0)) {
      line.supported = false;
      line.diagnostic = 'Jumlah slab pada sampel rigit tidak tersedia sebagai penyebut density.';
      return line;
    }
    if (definition.unit === 'COUNT' && definition.surface === 'JPCP' && line.volume > row.slabCount!) {
      line.supported = false;
      line.diagnostic = `Jumlah slab terdampak ${line.code} melebihi jumlah slab dalam sampel.`;
      return line;
    }
    line.density = computeDensity(definition, line.volume, row.areaSqm, row.slabCount);
    if (dvCurves === null) {
      line.supported = false;
      line.diagnostic = 'Kurva DV belum tersedia; nilai DV dan PCI tidak ditampilkan.';
    } else {
      line.dv = deductValue(definition, line.severity, line.density);
    }
    return line;
  });
  base.lines.sort((a, b) => (a.pciCode ?? Infinity) - (b.pciCode ?? Infinity)
    || a.severity.localeCompare(b.severity));
  base.diagnostics = [...new Set(base.lines.flatMap((line) => line.diagnostic ? [line.diagnostic] : []))];
  if (base.diagnostics.length > 0) {
    base.state = 'unsupported';
    return base;
  }

  base.sortedDvs = base.lines.map((line) => line.dv ?? 0).filter((value) => value > 0).sort((a, b) => b - a);
  if (cdvCurves === null) {
    base.state = 'unsupported';
    base.diagnostics = ['Kurva CDV belum tersedia; nilai PCI tidak ditampilkan.'];
    return base;
  }
  const correction = computeMaximumCorrectedDeductValue(base.sortedDvs, cdvCurves ?? defaultCdvCurveSet(surfaceType));
  base.state = 'calculated';
  base.allowableDeducts = correction.allowableDeducts;
  base.iterations = correction.iterations;
  base.maxCdv = correction.maxCdv;
  base.pci = Math.max(0, Math.round((pciCorrection - correction.maxCdv) * 100) / 100);
  base.rating = pciRating(base.pci);
  return base;
}
