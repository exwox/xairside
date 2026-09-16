import assert from 'node:assert/strict';
import test from 'node:test';
import type { Damage } from '../src/types';
import type { PciLocationRow } from '../src/lib/pci-location-table';
import { buildPciCalculationRow } from '../src/lib/pci-calculation-table';
import { defaultSurfaceDamageCatalog, retainDamageCatalogAliases } from '../src/lib/damage-catalog';

function damage(overrides: Partial<Damage> = {}): Damage {
  return {
    id: 'damage-1', groupId: null, facilityId: 'facility-1', station: 'STA 0+000', sampleCode: null,
    type: 'Alligator Cracking (Retak Buaya)', severity: 'M', lat: 0, lng: 0,
    localX: 0, localY: 0, rectJson: null, lengthM: 2, widthM: 1, areaSqm: 2,
    photoUrl: null, remarks: null, status: 'OPEN', reportedBy: null, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function row(damages: Damage[], areaSqm: number | null = 100, slabCount?: number): PciLocationRow {
  return { key: 'STA-0', label: 'STA 0+000 s/d STA 0+010', areaSqm, slabCount, damages };
}

test('lokasi kosong dan hanya catatan selesai belum dinilai tetapi PCI/SAMPLE memakai PCI koreksi', () => {
  const empty = buildPciCalculationRow(row([]), 'ASPHALT');
  assert.equal(empty.state, 'unassessed');
  assert.equal(empty.pci, 100);
  assert.equal(empty.maxCdv, null);
  assert.equal(empty.lines.length, 0);

  const closed = buildPciCalculationRow(row([damage({ status: 'CLOSED' })]), 'ASPHALT');
  assert.equal(closed.state, 'unassessed');
  assert.equal(closed.closedFindingCount, 1);
  assert.equal(closed.pci, 100);
  assert.equal(closed.maxCdv, null);
});

test('kerusakan aktif sejenis dan severity sama dijumlahkan m² lalu density persen', () => {
  const result = buildPciCalculationRow(row([
    damage({ id: 'a', areaSqm: 2, groupId: 'group-a' }),
    damage({ id: 'b', areaSqm: 3, groupId: 'group-a' }),
    damage({ id: 'c', areaSqm: 5, groupId: 'group-c', status: 'IN_PROGRESS' }),
    damage({ id: 'd', areaSqm: 90, status: 'CLOSED' }),
  ]), 'ASPHALT');
  assert.equal(result.state, 'calculated');
  assert.equal(result.activeFindingCount, 2);
  assert.equal(result.closedFindingCount, 1);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].code, 'F-01');
  assert.equal(result.lines[0].volume, 10);
  assert.equal(result.lines[0].unit, 'm²');
  assert.equal(result.lines[0].density, 10);
  assert.ok((result.lines[0].dv ?? 0) > 0);
  assert.ok((result.pci ?? 100) < 100);
  assert.ok(result.rating);
});

test('severity berbeda dipisah dan iterasi CDV memakai DV yang diurutkan', () => {
  const result = buildPciCalculationRow(row([
    damage({ id: 'low', severity: 'L', areaSqm: 10 }),
    damage({ id: 'high', severity: 'H', areaSqm: 10 }),
  ]), 'ASPHALT');
  assert.equal(result.state, 'calculated');
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.sortedDvs, [...result.sortedDvs].sort((a, b) => b - a));
  assert.ok(result.iterations.length > 0);
  assert.equal(result.iterations[0].deductValues.length, 2);
  assert.equal(result.maxCdv, Math.max(...result.iterations.map((item) => item.cdv)));
});

test('PCI/SAMPLE memakai PCI koreksi per fasilitas: kurangi CDV MAX saat terhitung', () => {
  const noDamage = buildPciCalculationRow(row([]), 'ASPHALT', undefined, undefined, undefined, undefined, 85);
  assert.equal(noDamage.state, 'unassessed');
  assert.equal(noDamage.pci, 85);

  const calculated = buildPciCalculationRow(row([
    damage({ id: 'low', severity: 'L', areaSqm: 10 }),
  ]), 'ASPHALT', undefined, undefined, undefined, undefined, 90);
  assert.equal(calculated.state, 'calculated');
  assert.ok((calculated.maxCdv ?? 0) > 0);
  assert.equal(calculated.pci, Math.max(0, Math.round((90 - calculated.maxCdv!) * 100) / 100));
});

test('PCI koreksi tidak pernah membuat PCI terhitung melewati nol', () => {
  const result = buildPciCalculationRow(row([
    damage({ id: 'high', severity: 'H', areaSqm: 50 }),
  ]), 'ASPHALT', undefined, undefined, undefined, undefined, 5);
  assert.equal(result.state, 'calculated');
  assert.ok(result.pci >= 0);
});

test('kode operasional tidak memproduksi PCI parsial saat bercampur kerusakan yang didukung', () => {
  const result = buildPciCalculationRow(row([
    damage({ id: 'known' }),
    damage({ id: 'other', type: 'FOD (Benda Asing)', areaSqm: 1 }),
  ]), 'ASPHALT');
  assert.equal(result.state, 'unsupported');
  assert.equal(result.lines.length, 2);
  assert.equal(result.pci, 100);
  assert.equal(result.maxCdv, null);
  assert.ok(result.diagnostics.some((message) => message.includes('D-02')));
});

test('F-07 dan F-08 menjumlahkan panjang garis dalam meter, bukan luas gambar', () => {
  const result = buildPciCalculationRow(row([
    damage({
      id: 'joint-a', groupId: 'joint-a', type: 'F-07', severity: 'M',
      geometryType: 'LINE', lengthM: 6, areaSqm: 90,
    }),
    damage({
      id: 'joint-b', groupId: 'joint-b', type: 'Joint Reflection Cracking', severity: 'M',
      geometryType: 'LINE', lengthM: 4, areaSqm: 80,
    }),
    damage({
      id: 'linear', type: 'Longitudinal & Transverse Cracking', severity: 'M',
      geometryType: 'LINE', lengthM: 5, areaSqm: 70,
    }),
  ]), 'ASPHALT');

  assert.equal(result.state, 'calculated');
  assert.equal(result.lines.length, 2);
  const joint = result.lines.find((line) => line.code === 'F-07');
  const linear = result.lines.find((line) => line.code === 'F-08');
  assert.ok(joint);
  assert.ok(linear);
  assert.equal(joint.unit, 'm');
  assert.equal(joint.volume, 10);
  assert.equal(joint.density, 10);
  assert.equal(joint.findingCount, 2);
  assert.equal(linear.unit, 'm');
  assert.equal(linear.volume, 5);
  assert.equal(linear.density, 5);
  assert.ok((joint.dv ?? 0) > 0);
  assert.ok((linear.dv ?? 0) > 0);
  assert.ok((result.pci ?? 100) < 100);
});

test('F-07/F-08 tanpa geometri garis dan panjang valid tidak menghasilkan PCI', () => {
  for (const type of ['F-07', 'F-08']) {
    const areaOnly = buildPciCalculationRow(row([
      damage({ type, geometryType: 'POLYGON', lengthM: 12, areaSqm: 12 }),
    ]), 'ASPHALT');
    assert.equal(areaOnly.state, 'unsupported');
    assert.equal(areaOnly.lines[0].unit, 'm');
    assert.equal(areaOnly.lines[0].volume, 0);
    assert.equal(areaOnly.lines[0].dv, null);
    assert.match(areaOnly.diagnostics[0], /digambar sebagai garis/);

    const noLength = buildPciCalculationRow(row([
      damage({ type, geometryType: 'LINE', lengthM: 0, areaSqm: 12 }),
    ]), 'ASPHALT');
    assert.equal(noLength.state, 'unsupported');
    assert.match(noLength.diagnostics[0], /panjang \(m\) yang valid/);
  }
});

test('jenis road lama di luar 16 tidak dihitung', () => {

  const count = buildPciCalculationRow(row([
    damage({ type: 'Potholes (Lubang)', areaSqm: 2 }),
  ]), 'ASPHALT');
  assert.equal(count.state, 'unsupported');
  assert.equal(count.lines[0].unit, 'm²');
  assert.equal(count.lines[0].dv, null);
});

test('rigit mengenali jenis Excel R-xx tanpa konfigurasi global lama', () => {
  const sample = row([damage({
    type: 'Corner Break', sampleCode: 'SAM-1 Slab A', station: 'SAM-1 Slab A',
    geometryType: 'SLAB', count: 1, areaSqm: 0,
  })], 100, 20);
  const withoutConfig = buildPciCalculationRow(sample, 'JPCP');
  assert.equal(withoutConfig.state, 'calculated');
  assert.equal(withoutConfig.lines[0].code, 'R-02');
  assert.equal(withoutConfig.lines[0].pciCode, 22);
  assert.equal(withoutConfig.lines[0].density, 5);

  const withConfig = buildPciCalculationRow(sample, 'JPCP', [{ name: 'Corner Break', code: 'R-02' }]);
  assert.equal(withConfig.state, 'calculated');
  assert.equal(withConfig.lines[0].pciCode, 22);
  assert.equal(withConfig.lines[0].density, 5);

  const unknown = buildPciCalculationRow(row([damage({ type: 'Jenis Rigit Tak Dikenal' })]), 'JPCP');
  assert.equal(unknown.state, 'unsupported');
  assert.equal(unknown.pci, 100);
});

test('rigit memakai luas dan severity Excel untuk kurva non-slab', () => {
  const durability = buildPciCalculationRow(row([damage({
    type: 'R-04', severity: 'L', areaSqm: 10,
  })]), 'JPCP');
  assert.equal(durability.state, 'calculated');
  assert.equal(durability.lines[0].code, 'R-04');
  assert.equal(durability.lines[0].unit, 'm²');
  assert.equal(durability.lines[0].density, 10);
  assert.equal(durability.lines[0].dv, 6);

  const popouts = buildPciCalculationRow(row([damage({
    type: 'R-07', severity: 'L', areaSqm: 95,
  })]), 'JPCP');
  assert.equal(popouts.state, 'calculated');
  assert.equal(popouts.lines[0].density, 95);
  assert.equal(popouts.lines[0].dv, 21.9);

  const invalidSeverity = buildPciCalculationRow(row([damage({
    type: 'R-07', severity: 'M', areaSqm: 95,
  })]), 'JPCP');
  assert.equal(invalidSeverity.state, 'unsupported');
  assert.equal(invalidSeverity.pci, 100);
});

test('luas unit tidak valid dan kerusakan melampaui luas unit tidak memberi skor', () => {
  assert.equal(buildPciCalculationRow(row([damage()], null), 'ASPHALT').state, 'unsupported');
  assert.equal(buildPciCalculationRow(row([damage({ areaSqm: 120 })]), 'ASPHALT').state, 'unsupported');
});

test('jenis perkerasan yang belum diatur tidak diasumsikan sebagai aspal', () => {
  const result = buildPciCalculationRow(row([
    damage({ id: 'part-a', groupId: 'finding-1', areaSqm: 1 }),
    damage({ id: 'part-b', groupId: 'finding-1', areaSqm: 1 }),
  ]), null);
  assert.equal(result.state, 'unsupported');
  assert.equal(result.pci, 100);
  assert.equal(result.lines[0].findingCount, 1);
  assert.match(result.diagnostics[0], /jenis perkerasan/);
});

test('kegagalan memuat kurva CDV menahan skor tanpa menghilangkan detail DV', () => {
  const result = buildPciCalculationRow(row([damage()]), 'ASPHALT', null, null);
  assert.equal(result.state, 'unsupported');
  assert.ok((result.lines[0].dv ?? 0) > 0);
  assert.equal(result.maxCdv, null);
  assert.equal(result.pci, 100);
  assert.match(result.diagnostics[0], /Kurva CDV/);
});

test('PCI memakai nama dan kode baru dari katalog DV dengan identitas PCI tetap stabil', () => {
  const previous = defaultSurfaceDamageCatalog('ASPHALT');
  const catalog = defaultSurfaceDamageCatalog('ASPHALT');
  const first = catalog.find((entry) => entry.id === 'ASPHALT-F-01');
  assert.ok(first);
  first.name = 'Retak Buaya Baru';
  const renamed = retainDamageCatalogAliases(previous, catalog);

  const historical = buildPciCalculationRow(row([damage()]), 'ASPHALT', null, undefined, undefined, renamed);
  assert.equal(historical.state, 'calculated');
  assert.equal(historical.lines[0].code, 'F-01');
  assert.equal(historical.lines[0].type, 'Retak Buaya Baru');
  assert.equal(historical.lines[0].pciCode, 1);

  const current = buildPciCalculationRow(row([damage({ type: 'ASPHALT-1' })]), 'ASPHALT', null, undefined, undefined, renamed);
  assert.equal(current.lines[0].pciCode, 1);
  assert.equal(current.lines[0].code, 'F-01');
});

test('kode rigit dari katalog DV menghitung PCI tanpa konfigurasi global lama', () => {
  const catalog = defaultSurfaceDamageCatalog('JPCP');
  const result = buildPciCalculationRow(
    row([damage({
      type: 'JPCP-22', sampleCode: 'SAM-1 Slab A', station: 'SAM-1 Slab A',
      geometryType: 'SLAB', count: 1, areaSqm: 0,
    })], 100, 20),
    'JPCP', null, undefined, undefined, catalog
  );
  assert.equal(result.state, 'calculated');
  assert.equal(result.lines[0].code, 'R-02');
  assert.equal(result.lines[0].pciCode, 22);
});
