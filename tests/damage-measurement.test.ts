import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDamageMeasurement } from '../src/lib/damage-measurement';
import { damageQuantity } from '../src/lib/damage-quantity';

const lineJson = JSON.stringify([
  { lat: 0.9569, lng: 104.5311 },
  { lat: 0.9570, lng: 104.5312 },
  { lat: 0.9571, lng: 104.5313 },
]);

test('pengukuran meter lari menerima garis dan mempertahankan panjangnya', () => {
  const result = validateDamageMeasurement({
    geometryType: 'LINE', rectJson: lineJson,
    lengthM: 18.75, widthM: 0, areaSqm: 0, count: null,
  }, 'LENGTH', true);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.geometryType, 'LINE');
  assert.equal(result.value.lengthM, 18.75);
  assert.equal(result.value.areaSqm, 0);
  assert.equal(result.value.count, null);
});

test('pengukuran meter lari menolak bidang dan garis yang tidak lengkap', () => {
  const polygon = validateDamageMeasurement({
    geometryType: 'POLYGON', rectJson: JSON.stringify([
      { lat: 0.9569, lng: 104.5311 },
      { lat: 0.9570, lng: 104.5312 },
      { lat: 0.9571, lng: 104.5311 },
    ]),
    lengthM: 18.75, widthM: 2, areaSqm: 37.5, count: null,
  }, 'LENGTH', true);
  assert.deepEqual(polygon, {
    ok: false,
    error: 'Kerusakan bersatuan m harus digambar sebagai garis.',
  });

  const onePoint = validateDamageMeasurement({
    geometryType: 'LINE',
    rectJson: JSON.stringify([{ lat: 0.9569, lng: 104.5311 }]),
    lengthM: 18.75, widthM: 0, areaSqm: 0, count: null,
  }, 'LENGTH', true);
  assert.deepEqual(onePoint, {
    ok: false,
    error: 'Geometri LINE memerlukan minimal 2 titik valid.',
  });

  const zeroLength = validateDamageMeasurement({
    geometryType: 'LINE', rectJson: lineJson,
    lengthM: 0, widthM: 0, areaSqm: 0, count: null,
  }, 'LENGTH', true);
  assert.deepEqual(zeroLength, {
    ok: false,
    error: 'Jenis kerusakan ini memerlukan panjang (m) lebih dari nol.',
  });
});

test('ringkasan kuantitas beberapa bagian garis memakai total panjang meter', () => {
  const quantity = damageQuantity([
    { geometryType: 'LINE', lengthM: 6.25, areaSqm: 0, count: null },
    { geometryType: 'LINE', lengthM: 3.75, areaSqm: 0, count: null },
  ]);
  assert.deepEqual(quantity, { value: 10, unit: 'm' });
});
