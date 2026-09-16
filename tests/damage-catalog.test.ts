import assert from 'node:assert/strict';
import test from 'node:test';
import {
  damageCatalogConfigKey,
  defaultSurfaceDamageCatalog,
  effectiveSurfaceDamageCatalog,
  parseSurfaceDamageCatalog,
  pciCodeForDamageCode,
  resolveDamageCatalogEntry,
  retainDamageCatalogAliases,
  validateSurfaceDamageCatalog,
} from '../src/lib/damage-catalog';

test('katalog flexible dan rigit terpisah serta kode PCI bawaan stabil', () => {
  assert.notEqual(damageCatalogConfigKey('ASPHALT'), damageCatalogConfigKey('JPCP'));
  assert.equal(damageCatalogConfigKey('ASPHALT'), 'pciDamageCatalogAirfieldAsphalt');
  assert.equal(damageCatalogConfigKey('JPCP'), 'pciDamageCatalogAirfieldJpcp');
  for (const surface of ['ASPHALT', 'JPCP'] as const) {
    const defaults = defaultSurfaceDamageCatalog(surface);
    assert.equal(validateSurfaceDamageCatalog(defaults, surface).ok, true);
    assert.equal(defaults.filter((entry) => entry.pciCode != null).length, surface === 'ASPHALT' ? 16 : 14);
    assert.ok(defaults.some((entry) => entry.code === 'D-02' && entry.pciCode === null));
  }
  assert.equal(pciCodeForDamageCode('F-01', 'ASPHALT'), 1);
  assert.equal(pciCodeForDamageCode('F-16', 'ASPHALT'), 16);
  assert.equal(pciCodeForDamageCode('F-17', 'ASPHALT'), null);
  assert.equal(pciCodeForDamageCode('A-01', 'ASPHALT'), 1);
  assert.equal(pciCodeForDamageCode('A-11', 'ASPHALT'), 10);
  assert.equal(pciCodeForDamageCode('A-04', 'ASPHALT'), null);
  assert.equal(pciCodeForDamageCode('R-02', 'JPCP'), 22);
  assert.equal(pciCodeForDamageCode('R-14', 'JPCP'), 34);
  assert.equal(pciCodeForDamageCode('R-15', 'JPCP'), null);
  assert.equal(pciCodeForDamageCode('JPCP-22', 'JPCP'), 22);
  assert.equal(pciCodeForDamageCode('A-01', 'JPCP'), null);
});

test('resolver menerima ID baru, nama lama, alias, dan konfigurasi admin lama', () => {
  const legacy = [{ code: 'A-01', name: 'Retak Buaya Lama' }];
  const catalog = effectiveSurfaceDamageCatalog('ASPHALT', null, legacy);
  const first = catalog.find((entry) => entry.pciCode === 1);
  assert.equal(first?.name, 'ALLIGATOR CRACKING');
  assert.ok(first?.aliases.includes('Alligator Cracking (Retak Buaya)'));
  for (const value of ['ASPHALT-F-01', 'F-01', 'ASPHALT-1', 'A-01', 'Retak Buaya Lama', 'Alligator Cracking (Retak Buaya)']) {
    assert.equal(resolveDamageCatalogEntry(value, 'ASPHALT', catalog, legacy)?.pciCode, 1);
  }
  assert.equal(resolveDamageCatalogEntry('ASPHALT-11', 'ASPHALT', catalog)?.pciCode, 10);
  assert.equal(resolveDamageCatalogEntry('ASPHALT-12', 'ASPHALT', catalog)?.pciCode, 11);
  assert.equal(resolveDamageCatalogEntry('ASPHALT-4', 'ASPHALT', catalog), null);
  assert.equal(resolveDamageCatalogEntry('A-04', 'ASPHALT', catalog), null);
  assert.equal(resolveDamageCatalogEntry('A-01', 'JPCP', defaultSurfaceDamageCatalog('JPCP')), null);
});

test('nama rigit dapat diubah tetapi kode R-xx tetap mengikuti urutan Excel', () => {
  const previous = defaultSurfaceDamageCatalog('JPCP');
  const next = previous.map((entry) => entry.pciCode === 22
    ? { ...entry, name: 'Patah Sudut', aliases: [] }
    : entry);
  const merged = retainDamageCatalogAliases(previous, next);
  const validated = validateSurfaceDamageCatalog(merged, 'JPCP');
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(resolveDamageCatalogEntry('JPCP-22', 'JPCP', validated.catalog)?.pciCode, 22);
  assert.equal(resolveDamageCatalogEntry('R-02', 'JPCP', validated.catalog)?.pciCode, 22);
  assert.equal(resolveDamageCatalogEntry('Corner Break', 'JPCP', validated.catalog)?.pciCode, 22);
  assert.equal(resolveDamageCatalogEntry('JPCP-22', 'ASPHALT', defaultSurfaceDamageCatalog('ASPHALT')), null);
  assert.deepEqual(parseSurfaceDamageCatalog(JSON.stringify(validated.catalog), 'JPCP'), validated.catalog);
  assert.equal(validateSurfaceDamageCatalog(next.map((entry) => entry.pciCode === 22
    ? { ...entry, code: 'BETON-02' } : entry), 'JPCP').ok, false);
});

test('custom operasional boleh ditambah/hapus, kode PCI internal tidak boleh dipindah', () => {
  const defaults = defaultSurfaceDamageCatalog('ASPHALT');
  const custom = { id: 'ASPHALT-custom-1', code: 'FOD-X', name: 'Temuan Khusus', pciCode: null, aliases: [] };
  assert.equal(validateSurfaceDamageCatalog([...defaults, custom], 'ASPHALT').ok, true);
  assert.equal(validateSurfaceDamageCatalog([...defaults, { ...custom, id: 'JPCP-custom-1' }], 'ASPHALT').ok, false);
  assert.equal(validateSurfaceDamageCatalog(defaults.filter((entry) => entry.id !== 'ASPHALT-D-02'), 'ASPHALT').ok, true);
  assert.equal(validateSurfaceDamageCatalog(defaults.filter((entry) => entry.id !== 'ASPHALT-F-01'), 'ASPHALT').ok, false);
  assert.equal(validateSurfaceDamageCatalog(defaults.map((entry) => entry.id === 'ASPHALT-F-01'
    ? { ...entry, pciCode: 2 } : entry), 'ASPHALT').ok, false);
  assert.equal(validateSurfaceDamageCatalog(defaults.map((entry) => entry.id === 'ASPHALT-F-01'
    ? { ...entry, code: 'A-01' } : entry), 'ASPHALT').ok, false);
  assert.equal(validateSurfaceDamageCatalog([...defaults, { ...custom, name: defaults[0].name }], 'ASPHALT').ok, false);
  assert.equal(parseSurfaceDamageCatalog('{bad JSON}', 'ASPHALT'), null);
});
