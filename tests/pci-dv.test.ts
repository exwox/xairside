import assert from 'node:assert/strict';
import test from 'node:test';
import type { Damage } from '../src/types';
import { distressCatalog } from '../src/lib/pci-data';
import {
  catalogWithDvCurves,
  compactDvCurveSet,
  defaultDvCurveSet,
  dvConfigKey,
  mergedDvCurveSet,
  parseDvCurveSet,
  validateDvCurveSet,
  type DvCurveSet,
} from '../src/lib/dv';
import { computeSampleUnitPci, deductValue } from '../src/lib/pci';
import { buildPciCalculationRow } from '../src/lib/pci-calculation-table';

test('kurva DV bawaan flexible dan rigit valid serta kunci database terpisah', () => {
  assert.notEqual(dvConfigKey('ASPHALT'), dvConfigKey('JPCP'));
  for (const surface of ['ASPHALT', 'JPCP'] as const) {
    const defaults = defaultDvCurveSet(surface);
    const result = validateDvCurveSet(defaults, surface);
    assert.equal(result.ok, true);
    assert.equal(Object.keys(defaults).length, distressCatalog(surface).length);
  }
});

test('validasi DV menolak density duplikat, DV menurun, kode lintas perkerasan, dan titik tidak lengkap', () => {
  assert.equal(validateDvCurveSet({ '1': { L: [[1, 10], [1, 20]] } }, 'ASPHALT').ok, false);
  assert.equal(validateDvCurveSet({ '1': { L: [[1, 20], [2, 10]] } }, 'ASPHALT').ok, false);
  assert.equal(validateDvCurveSet({ '21': { L: [[1, 10], [2, 20]] } }, 'ASPHALT').ok, false);
  assert.equal(validateDvCurveSet({ '1': { L: [[1, 10]] } }, 'ASPHALT').ok, false);
  assert.equal(validateDvCurveSet({ '1': { L: [[1, 10], [101, 20]] } }, 'ASPHALT').ok, false);
  assert.equal(parseDvCurveSet('{not JSON}', 'ASPHALT'), null);
});

test('override parsial mengubah interpolasi tanpa memutasi katalog bawaan', () => {
  const original = distressCatalog('ASPHALT')[0];
  const originalDv = deductValue(original, 'M', 5);
  const override: DvCurveSet = { '1': { M: [[0, 0], [10, 90], [100, 100]] } };
  const modified = catalogWithDvCurves('ASPHALT', override)[0];
  assert.equal(deductValue(modified, 'M', 5), 45);
  assert.equal(deductValue(original, 'M', 5), originalDv);
  assert.notEqual(originalDv, 45);
  assert.deepEqual(mergedDvCurveSet('ASPHALT', override)['2'], defaultDvCurveSet('ASPHALT')['2']);
  assert.deepEqual(compactDvCurveSet('ASPHALT', mergedDvCurveSet('ASPHALT', override)), override);
});

test('edit DV flexible dan rigit mengubah DV serta PCI engine survei', () => {
  const cases: Array<{ surface: 'ASPHALT' | 'JPCP'; code: number; severity: 'L' | 'M'; override: DvCurveSet }> = [
    { surface: 'ASPHALT' as const, code: 1, severity: 'M' as const, override: { '1': { M: [[0, 0], [10, 95], [100, 100]] } } },
    { surface: 'JPCP' as const, code: 21, severity: 'L' as const, override: { '21': { L: [[0, 0], [10, 95], [100, 100]] } } },
  ];
  for (const item of cases) {
    const distresses = [{ code: item.code, severity: item.severity, quantity: 10 }];
    const normal = computeSampleUnitPci(item.surface, 100, distresses);
    const edited = computeSampleUnitPci(item.surface, 100, distresses, undefined, item.override);
    assert.ok(edited.dvLines[0].dv > normal.dvLines[0].dv);
    assert.ok(edited.pci < normal.pci);
  }
});

test('tabel PCI memakai kurva DV tersimpan dan menahan skor saat DV gagal dimuat', () => {
  const finding: Damage = {
    id: 'damage-1', groupId: null, facilityId: 'facility-1', station: 'STA 0+000', sampleCode: null,
    type: 'Alligator Cracking (Retak Buaya)', severity: 'M', lat: 0, lng: 0,
    localX: 0, localY: 0, rectJson: null, lengthM: 10, widthM: 1, areaSqm: 10,
    photoUrl: null, remarks: null, status: 'OPEN', reportedBy: null, createdAt: '', updatedAt: '',
  };
  const row = { key: 'STA-0', label: 'STA 0+000 s/d STA 0+010', areaSqm: 100, damages: [finding] };
  const normal = buildPciCalculationRow(row, 'ASPHALT');
  const edited = buildPciCalculationRow(row, 'ASPHALT', null, undefined, { '1': { M: [[0, 0], [10, 95], [100, 100]] } });
  assert.ok((edited.lines[0].dv ?? 0) > (normal.lines[0].dv ?? 0));
  assert.ok((edited.pci ?? 100) < (normal.pci ?? 100));
  const unavailable = buildPciCalculationRow(row, 'ASPHALT', null, undefined, null);
  assert.equal(unavailable.state, 'unsupported');
  assert.equal(unavailable.lines[0].dv, null);
  assert.equal(unavailable.pci, 100);
});
