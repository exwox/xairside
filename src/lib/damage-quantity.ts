import type { Damage } from '@/types';

export function damageQuantity(damages: Pick<Damage, 'geometryType' | 'areaSqm' | 'lengthM' | 'count'>[]): {
  value: number;
  unit: 'm²' | 'm' | 'buah' | 'slab';
} {
  const geometryType = damages[0]?.geometryType ?? 'POLYGON';
  if (geometryType === 'LINE') {
    return { value: damages.reduce((sum, damage) => sum + (damage.lengthM ?? 0), 0), unit: 'm' };
  }
  if (geometryType === 'POINT' || geometryType === 'SLAB') {
    return {
      value: damages.reduce((sum, damage) => sum + (damage.count ?? 0), 0),
      unit: geometryType === 'SLAB' ? 'slab' : 'buah',
    };
  }
  return { value: damages.reduce((sum, damage) => sum + (damage.areaSqm || 0), 0), unit: 'm²' };
}

export function formatDamageQuantity(damages: Pick<Damage, 'geometryType' | 'areaSqm' | 'lengthM' | 'count'>[]): string {
  const { value, unit } = damageQuantity(damages);
  return `${value.toLocaleString('id-ID', { minimumFractionDigits: unit === 'buah' || unit === 'slab' ? 0 : 1, maximumFractionDigits: 2 })} ${unit}`;
}
