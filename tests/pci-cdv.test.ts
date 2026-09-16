import assert from 'node:assert/strict';
import test from 'node:test';

import {
  correctedDeductValue,
  curveQRange,
  defaultCdvCurveSet,
  validateCdvCurveSet,
  type CdvCurveSet,
} from '../src/lib/cdv';
import {
  computeMaximumCorrectedDeductValue,
  maximumAllowableDeducts,
} from '../src/lib/pci';

test('kurva awal fleksibel dan rigit lolos validasi', () => {
  for (const surface of ['ASPHALT', 'JPCP'] as const) {
    const result = validateCdvCurveSet(defaultCdvCurveSet(surface), surface);
    assert.equal(result.ok, true, result.error);
  }
});

test('kurva awal rigit tidak saling bersilangan saat q bertambah', () => {
  const curves = defaultCdvCurveSet('JPCP');
  const qValues = [1, 2, 3, 4, 6, 8, 10];
  for (let tdv = 0; tdv <= 180; tdv++) {
    for (let index = 1; index < qValues.length; index++) {
      const lower = correctedDeductValue(curves, qValues[index - 1], tdv);
      const higher = correctedDeductValue(curves, qValues[index], tdv);
      assert.ok(lower >= higher - 1e-9, `Kurva Q${qValues[index]} melewati Q${qValues[index - 1]} pada TDV ${tdv}`);
    }
  }
});

test('interpolasi CDV memakai garis lurus di antara dua titik', () => {
  const curves: CdvCurveSet = { Q1: [[0, 0], [100, 80]] };
  assert.equal(correctedDeductValue(curves, 1, 25), 20);
  assert.equal(correctedDeductValue(curves, 1, 200), 80);
  assert.equal(correctedDeductValue(curves, 1, -1), 0);
});

test('q di antara dua kurva menginterpolasi kedua nilai q', () => {
  const curves: CdvCurveSet = {
    Q1: [[0, 0], [100, 100]],
    Q4: [[0, 0], [100, 60]],
    Q6: [[0, 0], [100, 40]],
  };
  assert.deepEqual(curveQRange(curves, 5), [4, 6]);
  assert.equal(correctedDeductValue(curves, 5, 100), 50);
  assert.deepEqual(curveQRange(curves, 9), [6, 6]);
});

test('jumlah deduct maksimum memakai persamaan airfield 9/95', () => {
  assert.equal(maximumAllowableDeducts(100), 1);
  assert.equal(maximumAllowableDeducts(5), 10);
  assert.ok(Math.abs(maximumAllowableDeducts(21.02) - 8.4823) < 0.001);
});

test('contoh resmi aspal menghasilkan max CDV sekitar 41 dan PCI 59', () => {
  const result = computeMaximumCorrectedDeductValue(
    [21, 20.2, 9.2, 6.7, 4.8],
    defaultCdvCurveSet('ASPHALT')
  );
  assert.equal(result.iterations.length, 4);
  assert.deepEqual(result.iterations.map((iteration) => iteration.q), [4, 3, 2, 1]);
  assert.ok(Math.abs(result.maxCdv - 40.8) < 0.01);
  assert.equal(Math.round(100 - result.maxCdv), 59);
});

test('contoh resmi beton menghasilkan max CDV sekitar 42 dan PCI 58', () => {
  const result = computeMaximumCorrectedDeductValue(
    [18.66, 15.43, 11.02, 9.62, 4.78],
    defaultCdvCurveSet('JPCP')
  );
  assert.equal(result.iterations.length, 4);
  assert.deepEqual(result.iterations.map((iteration) => iteration.q), [4, 3, 2, 1]);
  assert.ok(Math.abs(result.maxCdv - 42) < 0.1);
  assert.equal(Math.round(100 - result.maxCdv), 58);
});

test('batas m mempertahankan bagian pecahan deduct terakhir', () => {
  const result = computeMaximumCorrectedDeductValue(
    [80, 30, 20, 10],
    defaultCdvCurveSet('ASPHALT')
  );
  const expectedM = 1 + (9 / 95) * 20;
  assert.ok(Math.abs(result.allowableDeducts - expectedM) < 1e-10);
  assert.equal(result.iterations[0].deductValues.length, 3);
  assert.ok(Math.abs(result.iterations[0].deductValues[2] - 20 * (expectedM - 2)) < 1e-10);
});

test('validasi menolak TDV duplikat dan CDV yang menurun', () => {
  const duplicate = defaultCdvCurveSet('ASPHALT');
  duplicate.Q1 = [[0, 0], [0, 10]];
  assert.equal(validateCdvCurveSet(duplicate, 'ASPHALT').ok, false);

  const descending = defaultCdvCurveSet('ASPHALT');
  descending.Q2 = [[0, 10], [20, 5]];
  assert.equal(validateCdvCurveSet(descending, 'ASPHALT').ok, false);
});
