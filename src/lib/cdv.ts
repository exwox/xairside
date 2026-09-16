import type { SurfaceType } from './pci-data';

export type CdvPoint = [tdv: number, cdv: number];
export type CdvCurveSet = Record<string, CdvPoint[]>;

export interface CdvValidationResult {
  ok: boolean;
  curves?: CdvCurveSet;
  error?: string;
}

/**
 * q adalah jumlah deduct value yang lebih besar dari 5 pada satu iterasi.
 * Kurva beton memiliki rentang q yang lebih banyak daripada kurva aspal.
 */
export const CDV_Q_VALUES: Record<SurfaceType, readonly number[]> = {
  ASPHALT: [1, 2, 3, 4, 6],
  JPCP: [1, 2, 3, 4, 6, 8, 10],
};

export const CDV_SURFACE_LABEL: Record<SurfaceType, string> = {
  ASPHALT: 'Fleksibel',
  JPCP: 'Rigit',
};

/**
 * Titik awal hasil digitasi kurva koreksi airfield pada UFM 3-260-16
 * (24 Februari 2026), Figure 3-6 (asphalt) dan Figure D-17 (concrete).
 * Data sengaja disimpan sebagai titik interpolasi agar dapat dikalibrasi admin.
 */
export const DEFAULT_CDV_CURVES: Record<SurfaceType, CdvCurveSet> = {
  ASPHALT: {
    Q1: [[0, 0], [20, 20], [40, 40], [60, 60], [80, 80], [100, 100], [180, 100]],
    Q2: [[0, 0], [10, 5], [20, 12], [40, 25], [56, 37], [60, 39], [80, 52], [100, 65], [120, 79], [140, 91], [155, 100], [180, 100]],
    Q3: [[0, 0], [15, 5], [20, 8], [40, 21], [60.2, 36], [80, 48], [100, 60], [120, 72], [140, 84], [160, 94], [172, 100], [180, 100]],
    Q4: [[0, 0], [20, 5], [40, 16], [60, 30], [61.9, 31], [80, 41], [100, 53], [120, 64], [140, 73], [160, 81], [180, 86]],
    Q6: [[0, 0], [25, 5], [40, 14], [60, 27], [80, 40], [100, 51], [120, 61], [140, 68], [160, 74], [180, 79]],
  },
  JPCP: {
    Q1: [[0, 0], [20, 20], [40, 40], [60, 60], [80, 80], [100, 100], [180, 100]],
    Q2: [[0, 0], [10, 8], [20, 17], [40, 34], [48.9, 42], [60, 50], [80, 67], [100, 82], [120, 97], [125, 100], [180, 100]],
    Q3: [[0, 0], [10, 7], [20, 15], [40, 31], [54.9, 38], [60, 43], [80, 59], [100, 75], [120, 88], [140, 99], [145, 100], [180, 100]],
    Q4: [[0, 0], [10, 7], [20, 14], [40, 28], [59.5, 38], [60, 39], [80, 55], [100, 69], [120, 81], [140, 91], [160, 98], [170, 100], [180, 100]],
    Q6: [[0, 0], [10, 6], [20, 13], [40, 26], [60, 37], [80, 52], [100, 64], [120, 75], [140, 84], [160, 93], [177, 100], [180, 100]],
    Q8: [[0, 0], [10, 6], [20, 12], [40, 24], [60, 35], [80, 49], [100, 60], [120, 70], [140, 80], [160, 89], [180, 96]],
    Q10: [[0, 0], [10, 5], [20, 11], [40, 23], [60, 33], [80, 46], [100, 56], [120, 66], [140, 75], [160, 83], [180, 90]],
  },
};

export function cloneCdvCurveSet(curves: CdvCurveSet): CdvCurveSet {
  return Object.fromEntries(
    Object.entries(curves).map(([key, points]) => [key, points.map(([tdv, cdv]) => [tdv, cdv] as CdvPoint)])
  );
}

export function defaultCdvCurveSet(surface: SurfaceType): CdvCurveSet {
  return cloneCdvCurveSet(DEFAULT_CDV_CURVES[surface]);
}

export function validateCdvCurveSet(value: unknown, surface: SurfaceType): CdvValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Format kumpulan kurva tidak valid.' };
  }

  const input = value as Record<string, unknown>;
  const curves: CdvCurveSet = {};
  for (const q of CDV_Q_VALUES[surface]) {
    const key = `Q${q}`;
    const rawPoints = input[key];
    if (!Array.isArray(rawPoints) || rawPoints.length < 2) {
      return { ok: false, error: `${key} harus memiliki minimal 2 titik.` };
    }
    if (rawPoints.length > 201) {
      return { ok: false, error: `${key} tidak boleh memiliki lebih dari 201 titik.` };
    }

    const points: CdvPoint[] = [];
    for (let index = 0; index < rawPoints.length; index++) {
      const point = rawPoints[index];
      if (!Array.isArray(point) || point.length !== 2) {
        return { ok: false, error: `Titik ${index + 1} pada ${key} tidak valid.` };
      }
      const tdv = Number(point[0]);
      const cdv = Number(point[1]);
      if (!Number.isFinite(tdv) || !Number.isFinite(cdv)) {
        return { ok: false, error: `TDV dan CDV pada ${key} harus berupa angka.` };
      }
      if (tdv < 0 || tdv > 200) {
        return { ok: false, error: `TDV pada ${key} harus berada pada rentang 0–200.` };
      }
      if (cdv < 0 || cdv > 100) {
        return { ok: false, error: `CDV pada ${key} harus berada pada rentang 0–100.` };
      }
      points.push([tdv, cdv]);
    }

    points.sort((a, b) => a[0] - b[0]);
    if (points[0][0] !== 0 || points[0][1] !== 0) {
      return { ok: false, error: `${key} harus diawali titik origin TDV 0 → CDV 0.` };
    }
    for (let index = 1; index < points.length; index++) {
      if (points[index][0] <= points[index - 1][0]) {
        return { ok: false, error: `TDV pada ${key} harus unik dan berurutan naik.` };
      }
      if (points[index][1] < points[index - 1][1]) {
        return { ok: false, error: `CDV pada ${key} tidak boleh menurun.` };
      }
    }
    curves[key] = points;
  }

  return { ok: true, curves };
}

export function parseCdvCurveSet(value: string | null | undefined, surface: SurfaceType): CdvCurveSet | null {
  if (!value) return null;
  try {
    const result = validateCdvCurveSet(JSON.parse(value), surface);
    return result.ok && result.curves ? result.curves : null;
  } catch {
    return null;
  }
}

export function interpolateCurve(points: CdvPoint[], tdv: number): number {
  if (points.length === 0 || !Number.isFinite(tdv) || tdv <= 0) return 0;
  const x = Math.max(0, tdv);
  if (x <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index++) {
    const [x1, y1] = points[index];
    if (x <= x1) {
      const [x0, y0] = points[index - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

export function curveQRange(curves: CdvCurveSet, q: number): [number, number] {
  const available = Object.keys(curves)
    .map((key) => Number(key.slice(1)))
    .filter((value) => Number.isFinite(value) && curves[`Q${value}`]?.length >= 2)
    .sort((a, b) => a - b);
  if (available.length === 0) return [1, 1];
  if (q <= available[0]) return [available[0], available[0]];
  if (q >= available[available.length - 1]) {
    const last = available[available.length - 1];
    return [last, last];
  }
  for (let index = 1; index < available.length; index++) {
    if (q <= available[index]) return [available[index - 1], available[index]];
  }
  return [available[0], available[0]];
}

export function correctedDeductValue(curves: CdvCurveSet, q: number, tdv: number): number {
  if (!Number.isFinite(tdv) || tdv <= 0 || !Number.isFinite(q) || q <= 0) return 0;
  const [lowerQ, upperQ] = curveQRange(curves, q);
  const lowerCdv = interpolateCurve(curves[`Q${lowerQ}`] ?? [], tdv);
  if (lowerQ === upperQ) return Math.min(100, Math.max(0, lowerCdv));

  const upperCdv = interpolateCurve(curves[`Q${upperQ}`] ?? [], tdv);
  const ratio = (q - lowerQ) / (upperQ - lowerQ);
  const cdv = lowerCdv + ratio * (upperCdv - lowerCdv);
  return Math.min(100, Math.max(0, cdv));
}

export function cdvConfigKey(surface: SurfaceType): string {
  return surface === 'ASPHALT' ? 'pciCdvCurvesAsphalt' : 'pciCdvCurvesJpcp';
}

export function isSurfaceType(value: unknown): value is SurfaceType {
  return value === 'ASPHALT' || value === 'JPCP';
}
