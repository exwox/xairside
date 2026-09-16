import type { DamageGeometryType, DamageUnit } from './damage-measurement';

/** Bentuk gambar utama untuk setiap satuan kuantitas PCI. */
export function geometryTypeForDamageUnit(unit: DamageUnit): Extract<DamageGeometryType, 'POLYGON' | 'LINE' | 'POINT'> {
  if (unit === 'LENGTH') return 'LINE';
  if (unit === 'COUNT') return 'POINT';
  return 'POLYGON';
}

/** Satuan kuantitas yang dihasilkan oleh bentuk pada peta. */
export function damageUnitForGeometryType(geometryType: DamageGeometryType): DamageUnit {
  if (geometryType === 'LINE') return 'LENGTH';
  if (geometryType === 'POINT' || geometryType === 'SLAB') return 'COUNT';
  return 'PERCENT';
}

/** Slab dapat mewakili jumlah slab atau bidang rusak di dalam satu slab. */
export function isDamageUnitCompatibleWithGeometry(
  unit: DamageUnit,
  geometryType: DamageGeometryType
): boolean {
  return damageUnitForGeometryType(geometryType) === unit
    || (geometryType === 'SLAB' && unit === 'PERCENT');
}

export function damageDrawingModeLabel(unit: DamageUnit): string {
  if (unit === 'LENGTH') return 'Garis · m';
  if (unit === 'COUNT') return 'Titik/slab · jumlah';
  return 'Area · m²';
}

export function damageDrawingInstruction(unit: DamageUnit): string {
  if (unit === 'LENGTH') {
    return 'Klik mengikuti jalur kerusakan → klik ganda/Enter untuk selesai · Escape = batal';
  }
  if (unit === 'COUNT') return 'Klik satu titik kejadian atau Shift+klik satu slab · Escape = batal';
  return 'Klik pusat → ketik panjang×lebar → Enter; atau gambar poligon · Shift+klik = seluruh slab · Escape = batal';
}
