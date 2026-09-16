import type { DistressDef } from './pci-data';

export type DamageGeometryType = 'POLYGON' | 'LINE' | 'POINT' | 'SLAB';
export type DamageUnit = DistressDef['unit'];

export interface DamageMeasurement {
  geometryType: DamageGeometryType;
  rectJson: string | null;
  lengthM: number | null;
  widthM: number | null;
  areaSqm: number;
  count: number | null;
}

export type DamageMeasurementResult =
  | { ok: true; value: DamageMeasurement }
  | { ok: false; error: string };

function nullablePositiveNumber(value: unknown): number | null | undefined {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

/** Validation shared by create/edit and split-group writes. Legacy records without
 * rectJson stay editable, but newly declared line/slab geometry needs vertices. */
export function validateDamageMeasurement(
  raw: Record<string, unknown>,
  unit?: DamageUnit | null,
  requireGeometry = false
): DamageMeasurementResult {
  const geometryType = raw.geometryType ?? 'POLYGON';
  if (geometryType !== 'POLYGON' && geometryType !== 'LINE'
    && geometryType !== 'POINT' && geometryType !== 'SLAB') {
    return { ok: false, error: 'Tipe geometri kerusakan tidak valid.' };
  }
  const rectJson = raw.rectJson == null ? null : raw.rectJson;
  if (rectJson !== null && typeof rectJson !== 'string') {
    return { ok: false, error: 'Geometri kerusakan harus berupa JSON titik.' };
  }
  if (rectJson) {
    let vertices: unknown;
    try { vertices = JSON.parse(rectJson); } catch {
      return { ok: false, error: 'JSON titik geometri tidak valid.' };
    }
    const minimum = geometryType === 'LINE' ? 2 : geometryType === 'POINT' ? 1 : 3;
    if (!Array.isArray(vertices) || vertices.length < minimum
      || vertices.some((point) => point == null || typeof point !== 'object'
        || !Number.isFinite((point as { lat?: unknown }).lat)
        || !Number.isFinite((point as { lng?: unknown }).lng)
        || Math.abs((point as { lat: number }).lat) > 90
        || Math.abs((point as { lng: number }).lng) > 180)) {
      return { ok: false, error: `Geometri ${geometryType} memerlukan minimal ${minimum} titik valid.` };
    }
  } else if (requireGeometry && geometryType !== 'POINT') {
    return { ok: false, error: `Geometri ${geometryType} memerlukan titik peta.` };
  }
  const lengthM = nullablePositiveNumber(raw.lengthM);
  const widthM = nullablePositiveNumber(raw.widthM);
  const areaSqm = nullablePositiveNumber(raw.areaSqm ?? 0);
  const count = nullablePositiveNumber(raw.count);
  if (lengthM === undefined || widthM === undefined || areaSqm == null
    || count === undefined || (count != null && (!Number.isInteger(count) || count <= 0))) {
    return { ok: false, error: 'Ukuran/jumlah kerusakan harus angka valid; jumlah harus bilangan bulat positif.' };
  }

  if (unit === 'PERCENT' && areaSqm <= 0) {
    return { ok: false, error: 'Jenis kerusakan ini memerlukan luas (m²) lebih dari nol.' };
  }
  if (unit === 'LENGTH' && (lengthM == null || lengthM <= 0)) {
    return { ok: false, error: 'Jenis kerusakan ini memerlukan panjang (m) lebih dari nol.' };
  }
  if (unit === 'COUNT' && (count == null || count <= 0)) {
    return { ok: false, error: 'Jenis kerusakan ini memerlukan jumlah kejadian/slab lebih dari nol.' };
  }
  if (unit == null) {
    const hasQuantity = geometryType === 'LINE' ? (lengthM ?? 0) > 0
      : geometryType === 'POINT' ? (count ?? 0) > 0
        : areaSqm > 0 || (count ?? 0) > 0;
    if (!hasQuantity) return { ok: false, error: 'Ukuran atau jumlah kerusakan wajib lebih dari nol.' };
  }
  if (requireGeometry && unit === 'PERCENT' && geometryType !== 'POLYGON' && geometryType !== 'SLAB') {
    return { ok: false, error: 'Kerusakan bersatuan m² harus digambar sebagai bidang/slab.' };
  }
  if (requireGeometry && unit === 'LENGTH' && geometryType !== 'LINE') {
    return { ok: false, error: 'Kerusakan bersatuan m harus digambar sebagai garis.' };
  }
  if (requireGeometry && unit === 'COUNT' && geometryType !== 'POINT' && geometryType !== 'SLAB') {
    return { ok: false, error: 'Kerusakan bersatuan jumlah harus digambar sebagai titik/slab.' };
  }
  return { ok: true, value: { geometryType, rectJson, lengthM, widthM, areaSqm, count } };
}
