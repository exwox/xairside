import assert from 'node:assert/strict';
import test from 'node:test';
import sourceCurves from '../src/lib/airfield-pci-curves.json';
import { defaultSurfaceDamageCatalog } from '../src/lib/damage-catalog';
import { defaultDvCurveSet, dvConfigKey, validateDvCurveSet } from '../src/lib/dv';
import { distressCatalog } from '../src/lib/pci-data';
import { computeDensity, computeSampleUnitPci, deductValue } from '../src/lib/pci';

// Curve sheets 1–16 in PCI 2025 TNJ.xlsm. Keep this list independent of the
// extracted numeric fixture so an accidental rename cannot change both sides.
const excelTypes = [
  ['F-01', 'ALLIGATOR CRACKING', 'LMH'],
  ['F-02', 'BLEEDING', '-'],
  ['F-03', 'BLOCK CRACKING', 'LMH'],
  ['F-04', 'CORRUGATION', 'LMH'],
  ['F-05', 'DEPRESSION', 'LMH'],
  ['F-06', 'Jet Blast Erosion', '-'],
  ['F-07', 'JOINT REFLECTION CRACKING', 'LMH'],
  ['F-08', 'Longitudinal/Transverse Cracking', 'LMH'],
  ['F-09', 'OIL SPILLAGE', '-'],
  ['F-10', 'PATCHING', 'LMH'],
  ['F-11', 'POLISH AGGREGATE', '-'],
  ['F-12', 'RAVELING / WEATHERING', 'LMH'],
  ['F-13', 'RUTTING', 'LMH'],
  ['F-14', 'SHOVING', 'LMH'],
  ['F-15', 'SLIPPAGE CRACKING', '-'],
  ['F-16', 'SWELL', 'LMH'],
] as const;

test('katalog ASPHALT mengikuti 16 kurva Excel dengan kode F-xx dan severity yang tersedia', () => {
  const definitions = distressCatalog('ASPHALT');
  const names = defaultSurfaceDamageCatalog('ASPHALT').filter((entry) => entry.pciCode != null);

  assert.equal(sourceCurves.length, 16);
  assert.equal(dvConfigKey('ASPHALT'), 'pciDvCurvesAirfieldAsphalt');
  assert.equal(definitions.length, 16);
  assert.equal(names.length, 16);
  assert.deepEqual(sourceCurves.map((entry) => [entry.code, entry.name, entry.severities.join('')]), excelTypes);
  for (const [index, [code, name, severityLetters]] of excelTypes.entries()) {
    const numericCode = index + 1;
    const severity = severityLetters === '-' ? ['-'] : [...severityLetters];
    assert.equal(definitions[index].code, numericCode);
    assert.equal(definitions[index].name, name);
    assert.deepEqual(definitions[index].severities, severity, code);
    assert.equal(names[index].pciCode, numericCode);
    assert.equal(names[index].code, code);
    assert.equal(names[index].name, name);
  }
});

test('F-07 dan F-08 memakai meter lari; jenis flexible lain tetap memakai luas', () => {
  const definitions = distressCatalog('ASPHALT');
  assert.deepEqual(
    definitions.filter((definition) => definition.unit === 'LENGTH').map((definition) => definition.code),
    [7, 8],
  );
  assert.deepEqual(
    definitions.filter((definition) => definition.unit === 'PERCENT').map((definition) => definition.code),
    [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16],
  );

  assert.equal(computeDensity(definitions[6], 12.5, 250), 5);
  assert.equal(computeDensity(definitions[7], 7.5, 250), 3);
});

test('semua titik density dan DV bawaan sama persis dengan tabel L/M/H Excel', () => {
  const definitions = distressCatalog('ASPHALT');
  const defaults = defaultDvCurveSet('ASPHALT');
  assert.equal(validateDvCurveSet(defaults, 'ASPHALT').ok, true);
  assert.deepEqual(Object.keys(defaults), sourceCurves.map((entry, index) => String(index + 1)));

  for (const [index, source] of sourceCurves.entries()) {
    const definition = definitions[index];
    const curves = defaults[String(index + 1)];
    assert.deepEqual(Object.keys(curves), source.severities, source.code);
    for (const severity of source.severities) {
      const expected = source.points[severity as keyof typeof source.points];
      assert.deepEqual(definition.deducts[severity as keyof typeof definition.deducts], expected,
        `${source.code}/${severity} pada katalog PCI`);
      assert.deepEqual(curves[severity as keyof typeof curves], expected,
        `${source.code}/${severity} pada editor kurva DV`);
    }
  }

  // Nilai 103 memang tertulis pada F-04/H di density 100%; jangan diam-diam
  // mengubah angka sumber ketika menyimpan atau menampilkan tabel.
  assert.deepEqual(defaults['4'].H?.at(-1), [100, 103]);
});

test('interpolasi dan jenis tanpa severity menggunakan kurva Excel yang tepat', () => {
  const definitions = distressCatalog('ASPHALT');
  assert.ok(Math.abs(computeDensity(definitions[1], 23.65, 450) - 5.2555555555555555) < 1e-10);
  const excelTrend = (density: number, d0: number, v0: number, d1: number, v1: number) =>
    v0 + (Math.log10(density) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0)) * (v1 - v0);
  assert.ok(Math.abs(deductValue(definitions[0], 'L', 1.5) - excelTrend(1.5, 1, 21, 2, 27)) < 1e-10);
  assert.ok(Math.abs(deductValue(definitions[11], 'M', 1.25) - excelTrend(1.25, 1, 9, 1.5, 11)) < 1e-10);
  assert.ok(Math.abs(deductValue(definitions[0], 'L', 2.09111111111111) - 27.4394792584637) < 1e-10);
  assert.ok(Math.abs(deductValue(definitions[1], '-', 13.3177777777778) - 44.2397935452933) < 1e-10);
  assert.ok(Math.abs(deductValue(definitions[11], 'M', 1.34666666666667) - 10.4681036535728) < 1e-10);

  for (const code of [2, 6, 9, 11, 15]) {
    const result = computeSampleUnitPci('ASPHALT', 100, [
      { code, severity: '-', quantity: 10 },
    ]);
    assert.equal(result.dvLines.length, 1, `F-${String(code).padStart(2, '0')}`);
    assert.equal(result.dvLines[0].severity, '-');
    assert.equal(result.dvLines[0].dv, deductValue(definitions[code - 1], '-', 10));
    assert.throws(() => computeSampleUnitPci('ASPHALT', 100, [
      { code, severity: 'L', quantity: 10 },
    ]), `F-${String(code).padStart(2, '0')} tidak boleh memakai L`);
  }
});
