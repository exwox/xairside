import assert from 'node:assert/strict';
import test from 'node:test';
import {
  damageDrawingInstruction,
  damageDrawingModeLabel,
  damageUnitForGeometryType,
  geometryTypeForDamageUnit,
  isDamageUnitCompatibleWithGeometry,
} from '../src/lib/damage-drawing';
import { formatDamageQuantity } from '../src/lib/damage-quantity';

test('kerusakan meter lari selalu memakai garis dan label m', () => {
  assert.equal(geometryTypeForDamageUnit('LENGTH'), 'LINE');
  assert.equal(damageUnitForGeometryType('LINE'), 'LENGTH');
  assert.equal(damageDrawingModeLabel('LENGTH'), 'Garis · m');
  assert.match(damageDrawingInstruction('LENGTH'), /jalur kerusakan/);
  assert.equal(formatDamageQuantity([
    { geometryType: 'LINE', lengthM: 4.25, areaSqm: 0, count: null },
    { geometryType: 'LINE', lengthM: 5.75, areaSqm: 0, count: null },
  ]), '10,0 m');
});

test('pilihan jenis dapat difilter dengan kecocokan satuan dan geometri', () => {
  assert.equal(isDamageUnitCompatibleWithGeometry('LENGTH', 'LINE'), true);
  assert.equal(isDamageUnitCompatibleWithGeometry('LENGTH', 'POLYGON'), false);
  assert.equal(isDamageUnitCompatibleWithGeometry('LENGTH', 'POINT'), false);
  assert.equal(isDamageUnitCompatibleWithGeometry('PERCENT', 'POLYGON'), true);
  assert.equal(isDamageUnitCompatibleWithGeometry('PERCENT', 'SLAB'), true);
  assert.equal(isDamageUnitCompatibleWithGeometry('COUNT', 'POINT'), true);
  assert.equal(isDamageUnitCompatibleWithGeometry('COUNT', 'SLAB'), true);
  assert.equal(isDamageUnitCompatibleWithGeometry('COUNT', 'LINE'), false);
});
