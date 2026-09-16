// Engine PCI (Pavement Condition Index)
// 1) quantity -> density (%)  2) density -> Deduct Value (kurva)
// 3) batas m + iterasi kurva CDV airfield  4) PCI = 100 - maxCDV

import { distressCatalog, type DistressDef, type SurfaceType } from './pci-data';
import { catalogWithDvCurves, type DvCurveSet } from './dv';
import {
  correctedDeductValue,
  curveQRange,
  defaultCdvCurveSet,
  type CdvCurveSet,
} from './cdv';

export type Sev = 'L' | 'M' | 'H' | '-';

export class PciInputError extends Error {}

export interface DistressInput {
  code: number;
  severity: Sev;
  quantity: number;
}

export interface DvLine {
  code: number;
  name: string;
  severity: string;
  quantity: number;
  density: number;
  dv: number;
}

export interface SampleUnitResult {
  dvLines: DvLine[];
  totalDv: number;
  maxCdv: number;
  pci: number;
  allowableDeducts: number;
  cdvIterations: CdvIteration[];
}

export interface CdvIteration {
  q: number;
  curveQs: [number, number];
  totalDv: number;
  cdv: number;
  deductValues: number[];
}

// Konversi quantity menjadi density (%) sesuai satuan distress
export function computeDensity(
  def: DistressDef, quantity: number, sampleAreaSqm: number, sampleSlabCount?: number | null
): number {
  const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  if (def.unit === 'PERCENT') {
    // Area-based findings record damaged area (m²) on both surfaces.
    return clamp(q / Math.max(sampleAreaSqm, 1) * 100, 0, 100);
  }
  // Kerusakan rigid yang dihitung per slab memakai jumlah slab, bukan luas.
  if (def.unit === 'COUNT' && def.surface === 'JPCP') {
    if (!Number.isInteger(sampleSlabCount) || (sampleSlabCount ?? 0) <= 0) return NaN;
    return clamp(q / sampleSlabCount! * 100, 0, 100);
  }
  // Meter lari retak dibagi luas sampel lalu dikali 100, sesuai density PCI airfield.
  return clamp((q / Math.max(sampleAreaSqm, 1)) * 100, 0, 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Excel XPCI-Flex memakai TREND terhadap LOG10(density) di antara dua titik tabel.
export function deductValue(def: DistressDef, severity: Sev, density: number): number {
  const curve = def.deducts[severity] ?? [];
  if (curve.length === 0) return 0;
  if (density < curve[0][0]) return 0; // di bawah ambang bawah kurva
  for (let i = 1; i < curve.length; i++) {
    if (density <= curve[i][0]) {
      const [d0, v0] = curve[i - 1];
      const [d1, v1] = curve[i];
      const fraction = def.surface === 'ASPHALT' && d0 > 0 && density > 0
        ? (Math.log10(density) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0))
        : (density - d0) / (d1 - d0);
      return v0 + fraction * (v1 - v0);
    }
  }
  return curve[curve.length - 1][1];
}

// UFM 3-260-16, Persamaan 3-1: jumlah maksimum deduct yang boleh dipakai.
export function maximumAllowableDeducts(highestDv: number): number {
  if (!Number.isFinite(highestDv) || highestDv <= 0) return 1;
  return clamp(1 + (9 / 95) * (100 - highestDv), 1, 10);
}

function adjustToAllowableDeducts(deductValues: number[]): {
  values: number[];
  allowableDeducts: number;
} {
  const sorted = deductValues
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);
  if (sorted.length === 0) return { values: [], allowableDeducts: 1 };

  const allowableDeducts = maximumAllowableDeducts(sorted[0]);
  if (sorted.length <= allowableDeducts) return { values: sorted, allowableDeducts };

  const whole = Math.floor(allowableDeducts);
  const fraction = allowableDeducts - whole;
  const values = sorted.slice(0, whole);
  if (fraction > 0 && sorted[whole] != null) values.push(sorted[whole] * fraction);
  return { values, allowableDeducts };
}

export function computeMaximumCorrectedDeductValue(
  deductValues: number[],
  curves: CdvCurveSet
): { maxCdv: number; allowableDeducts: number; iterations: CdvIteration[] } {
  const adjusted = adjustToAllowableDeducts(deductValues);
  if (adjusted.values.length === 0) {
    return { maxCdv: 0, allowableDeducts: adjusted.allowableDeducts, iterations: [] };
  }

  const working = [...adjusted.values];
  const iterations: CdvIteration[] = [];
  let maxCdv = 0;

  while (working.length > 0) {
    const totalDv = working.reduce((sum, value) => sum + value, 0);
    const q = Math.max(1, working.filter((value) => value > 5).length);
    const curveQs = curveQRange(curves, q);
    const cdv = correctedDeductValue(curves, q, totalDv);
    iterations.push({
      q,
      curveQs,
      totalDv,
      cdv,
      deductValues: [...working],
    });
    maxCdv = Math.max(maxCdv, cdv);

    if (q <= 1) break;
    const smallestAboveFive = working.findLastIndex((value) => value > 5);
    if (smallestAboveFive < 0) break;
    working[smallestAboveFive] = 5;
  }

  return {
    maxCdv: clamp(maxCdv, 0, 100),
    allowableDeducts: adjusted.allowableDeducts,
    iterations,
  };
}

// PCI satu sample unit
export function computeSampleUnitPci(
  surface: SurfaceType,
  sampleAreaSqm: number,
  distresses: DistressInput[],
  cdvCurves: CdvCurveSet = defaultCdvCurveSet(surface),
  dvCurves?: DvCurveSet,
  sampleSlabCount?: number | null
): SampleUnitResult {
  if (!Number.isFinite(sampleAreaSqm) || sampleAreaSqm <= 0) {
    throw new PciInputError('Luas sampel PCI harus lebih besar dari nol.');
  }
  const catalog = dvCurves ? catalogWithDvCurves(surface, dvCurves) : distressCatalog(surface);
  const dvLines: DvLine[] = [];

  for (const d of distresses) {
    const def = catalog.find((c) => c.code === d.code);
    if (!def) throw new PciInputError(`Kode kerusakan ${d.code} tidak tersedia untuk ${surface}.`);
    if (!def.severities.includes(d.severity)) {
      throw new PciInputError(`Severity ${d.severity} tidak tersedia untuk kode ${d.code}.`);
    }
    if (!Number.isFinite(d.quantity) || d.quantity <= 0
      || (def.unit === 'COUNT' && !Number.isInteger(d.quantity))) {
      throw new PciInputError(`Kuantitas kerusakan kode ${d.code} tidak valid.`);
    }
    if (def.unit === 'PERCENT' && d.quantity > sampleAreaSqm + 1e-6) {
      throw new PciInputError(`Luas kerusakan kode ${d.code} melebihi luas sampel.`);
    }
    if (def.unit === 'COUNT' && def.surface === 'JPCP'
      && Number.isInteger(sampleSlabCount) && d.quantity > sampleSlabCount!) {
      throw new PciInputError(`Jumlah slab terdampak kode ${d.code} melebihi jumlah slab sampel.`);
    }
    const severity = d.severity;
    const density = computeDensity(def, d.quantity, sampleAreaSqm, sampleSlabCount);
    if (!Number.isFinite(density)) {
      throw new PciInputError(`Jumlah slab sampel wajib untuk kerusakan rigit kode ${d.code}.`);
    }
    const dv = deductValue(def, severity, density);
    if (dv > 0) {
      dvLines.push({ code: def.code, name: def.name, severity, quantity: d.quantity, density, dv });
    }
  }

  dvLines.sort((a, b) => b.dv - a.dv);
  const totalDv = dvLines.reduce((s, l) => s + l.dv, 0);
  if (dvLines.length === 0 || totalDv <= 0) {
    return {
      dvLines,
      totalDv: 0,
      maxCdv: 0,
      pci: 100,
      allowableDeducts: 1,
      cdvIterations: [],
    };
  }

  const correction = computeMaximumCorrectedDeductValue(
    dvLines.map((line) => line.dv),
    cdvCurves
  );
  const maxCdv = correction.maxCdv;
  const pci = Math.max(0, Math.round(100 - maxCdv));
  return {
    dvLines,
    totalDv,
    maxCdv,
    pci,
    allowableDeducts: correction.allowableDeducts,
    cdvIterations: correction.iterations,
  };
}

// PCI section = rata-rata tertimbang luas sample unit
export function computeSectionPci(units: { areaSqm: number; pci: number }[]): number {
  if (units.length === 0) return 100;
  const totalArea = units.reduce((s, u) => s + Math.max(u.areaSqm, 0), 0);
  if (totalArea <= 0) {
    return Math.round(units.reduce((s, u) => s + u.pci, 0) / units.length);
  }
  return Math.round(units.reduce((s, u) => s + u.pci * Math.max(u.areaSqm, 0), 0) / totalArea);
}

export function pciRating(pci: number): { label: string; color: string } {
  if (pci >= 86) return { label: 'Excellent', color: '#15803d' };
  if (pci >= 71) return { label: 'Very Good', color: '#22c55e' };
  if (pci >= 56) return { label: 'Good', color: '#84cc16' };
  if (pci >= 41) return { label: 'Fair', color: '#eab308' };
  if (pci >= 26) return { label: 'Poor', color: '#f97316' };
  if (pci >= 11) return { label: 'Very Poor', color: '#ef4444' };
  return { label: 'Failed', color: '#7f1d1d' };
}
