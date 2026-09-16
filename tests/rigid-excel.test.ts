import assert from 'node:assert/strict';
import test from 'node:test';
import sourceCurves from '../src/lib/airfield-rigid-pci-curves.json';
import { defaultSurfaceDamageCatalog } from '../src/lib/damage-catalog';
import { defaultDvCurveSet, dvConfigKey, validateDvCurveSet } from '../src/lib/dv';
import { distressCatalog } from '../src/lib/pci-data';
import { deductValue, computeSampleUnitPci } from '../src/lib/pci';

// Independent transcription of the 14 worksheet titles and the severity
// columns in DATA DISTRESS DENSITY RIGID.xlsx. The sheet labels skip number 5.
const excelTypes = [
  ['R-01', 'Blow Up', 'LM'],
  ['R-02', 'Corner Break', 'LMH'],
  ['R-03', 'Linear Cracking', 'LMH'],
  ['R-04', 'Durability Cracking', 'LMH'],
  ['R-05', 'Small Patch', 'LMH'],
  ['R-06', 'Patching/Utility Cut', 'LMH'],
  ['R-07', 'Popouts', 'L'],
  ['R-08', 'Pumping', 'L'],
  ['R-09', 'Scalling/Crazing', 'LMH'],
  ['R-10', 'Fulting/ettlement', 'LMH'],
  ['R-11', 'Shattered Slab', 'LMH'],
  ['R-12', 'Shrinking Cracking', 'L'],
  ['R-13', 'Spalling(Longitudinal and Trans', 'LMH'],
  ['R-14', 'Corner Spalling', 'LMH'],
] as const;

// Selected Excel A:D cells, including truncated curves and literal source
// anomalies. This list is intentionally separate from the generated fixture.
const excelAnchors: ReadonlyArray<{
  code: number;
  severity: 'L' | 'M' | 'H';
  point: [number, number];
}> = [
  { code: 21, severity: 'L', point: [90, 100] },
  { code: 21, severity: 'M', point: [63, 100] },
  { code: 22, severity: 'H', point: [100, 91] },
  { code: 23, severity: 'M', point: [100, 58] },
  { code: 24, severity: 'H', point: [100, 88] },
  { code: 25, severity: 'L', point: [100, 10] },
  { code: 26, severity: 'M', point: [100, 49.5] },
  { code: 27, severity: 'L', point: [90, 22] },
  { code: 27, severity: 'L', point: [100, 21.8] },
  { code: 28, severity: 'L', point: [0, 1] },
  { code: 29, severity: 'H', point: [100, 81.5] },
  { code: 30, severity: 'H', point: [100, 90] },
  { code: 31, severity: 'H', point: [90, 100] },
  { code: 32, severity: 'L', point: [0, 0.5] },
  { code: 33, severity: 'M', point: [100, 36] },
  { code: 34, severity: 'H', point: [100, 45.5] },
];

test('katalog rigit mengikuti 14 sheet Excel dengan kode R-01–R-14 dan severity kolom sumber', () => {
  const definitions = distressCatalog('JPCP');
  const names = defaultSurfaceDamageCatalog('JPCP').filter((entry) => entry.pciCode != null);

  assert.equal(sourceCurves.length, 14);
  assert.equal(definitions.length, 14);
  assert.equal(names.length, 14);
  assert.equal(dvConfigKey('JPCP'), 'pciDvCurvesAirfieldJpcp');
  assert.deepEqual(sourceCurves.map((entry) => [entry.code, entry.name, entry.severities.join('')]), excelTypes);
  for (const [index, [code, name, severityLetters]] of excelTypes.entries()) {
    const numericCode = index + 21;
    assert.equal(definitions[index].code, numericCode);
    assert.equal(definitions[index].name, name);
    assert.deepEqual(definitions[index].severities, [...severityLetters], code);
    assert.equal(names[index].id, `JPCP-${code}`);
    assert.equal(names[index].pciCode, numericCode);
    assert.equal(names[index].code, code);
    assert.equal(names[index].name, name);
  }
  assert.deepEqual(
    definitions.filter((definition) => definition.unit === 'LENGTH'),
    [],
    'Linear Cracking rigit dihitung per slab, bukan meter lari',
  );
  assert.deepEqual(
    definitions.filter((definition) => definition.unit === 'COUNT').map((definition) => definition.code),
    [22, 23],
  );
});

test('seluruh tabel density dan DV rigid bawaan sama dengan angka Excel', () => {
  const definitions = distressCatalog('JPCP');
  const defaults = defaultDvCurveSet('JPCP');
  assert.equal(validateDvCurveSet(defaults, 'JPCP').ok, true);
  assert.deepEqual(Object.keys(defaults), sourceCurves.map((_, index) => String(index + 21)));

  let pointCount = 0;
  for (const [index, source] of sourceCurves.entries()) {
    const definition = definitions[index];
    const curves = defaults[String(index + 21)];
    assert.deepEqual(Object.keys(curves), source.severities, source.code);
    for (const severity of source.severities) {
      const expected = (source.points as Record<string, number[][] | undefined>)[severity];
      assert.ok(expected, `${source.code}/${severity} ada pada tabel Excel`);
      pointCount += expected.length;
      assert.deepEqual(definition.deducts[severity as 'L' | 'M' | 'H'], expected,
        `${source.code}/${severity} pada katalog PCI`);
      assert.deepEqual(curves[severity as 'L' | 'M' | 'H'], expected,
        `${source.code}/${severity} pada editor kurva DV`);
    }
  }
  assert.equal(pointCount, 624);

  for (const { code, severity, point } of excelAnchors) {
    const curve = defaults[String(code)][severity];
    assert.ok(curve?.some(([density, dv]) => density === point[0] && dv === point[1]),
      `Sel Excel kode ${code}/${severity} pada density ${point[0]} harus DV ${point[1]}`);
  }
  assert.deepEqual(defaults['21'].L?.at(-1), [90, 100]);
  assert.deepEqual(defaults['21'].M?.at(-1), [63, 100]);
  assert.deepEqual(defaults['31'].H?.at(-1), [90, 100]);
});

test('interpolasi rigid dan pilihan severity mengikuti kurva Excel', () => {
  const definitions = distressCatalog('JPCP');
  assert.equal(deductValue(definitions[1], 'L', 7.5), 5.75);
  assert.equal(deductValue(definitions[7], 'L', 0), 1);
  assert.equal(deductValue(definitions[6], 'L', 95), 21.9);
  assert.equal(deductValue(definitions[0], 'M', 70), 100);

  for (const code of [21, 27, 28, 32]) {
    const definition = definitions[code - 21];
    assert.ok(!definition.severities.includes('H'));
    assert.throws(() => computeSampleUnitPci('JPCP', 100, [
      { code, severity: 'H', quantity: 1 },
    ]), `R-${String(code - 20).padStart(2, '0')} tidak boleh memakai H`);
  }
  assert.equal(validateDvCurveSet({ '28': { M: [[0, 0], [100, 50]] } }, 'JPCP').ok, false);
});
