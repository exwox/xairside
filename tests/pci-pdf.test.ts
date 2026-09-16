import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Facility } from '../src/types';
import type { PciFacilityTable } from '../src/lib/pci-location-table';
import type { PciCalculationRow } from '../src/lib/pci-calculation-table';
import { pciRating } from '../src/lib/pci';
import { buildPciPdfDetailRows, buildPciPdfTableRows, generatePciReportPdf } from '../src/lib/pci-pdf';
import PciCalculationGrid from '../src/components/PciCalculationGrid';

const facility = {
  id: 'facility-1', code: 'RWY', name: 'Runway 11/29', type: 'RUNWAY', surfaceType: 'ASPHALT',
  lengthM: 2500, widthM: 45, areaSqm: 112500,
} as Facility;

const table: PciFacilityTable = {
  facility,
  mode: 'STA',
  stationIntervalM: 10,
  rows: [
    { key: 'STA-0', label: 'STA 0+000 s/d STA 0+010', areaSqm: 450, damages: [] },
    { key: 'STA-1', label: 'STA 0+010 s/d STA 0+020', areaSqm: 450, damages: [] },
    { key: 'STA-2', label: 'STA 0+020 s/d STA 0+030', areaSqm: 450, damages: [] },
  ],
  unmapped: [],
};

function makeRow(overrides: Partial<PciCalculationRow>): PciCalculationRow {
  return {
    state: 'unassessed', lines: [], sortedDvs: [], allowableDeducts: null,
    iterations: [], maxCdv: null, pci: 100, rating: null, diagnostics: [],
    activeFindingCount: 0, closedFindingCount: 0,
    ...overrides,
  };
}

const unassessed = makeRow({ state: 'unassessed', pci: 100 });

const calculated = makeRow({
  state: 'calculated',
  lines: [{
    type: 'Alligator Cracking', code: 'ALC', pciCode: 1, severity: 'H',
    volume: 5, unit: 'm²', density: 5, dv: 50,
    findingCount: 1, supported: true, diagnostic: null,
  }],
  sortedDvs: [50, 20],
  allowableDeducts: 2,
  iterations: [
    { q: 0, curveQs: [0, 50], totalDv: 80, cdv: 50, deductValues: [50, 20, 10] },
    { q: 1, curveQs: [1, 40], totalDv: 70, cdv: 48, deductValues: [50, 20] },
  ],
  maxCdv: 50,
  pci: 85,
  rating: pciRating(85),
  activeFindingCount: 1,
});

const unsupported = makeRow({
  state: 'unsupported',
  pci: 100,
  diagnostics: ['Kurva CDV belum tersedia; nilai PCI tidak ditampilkan.'],
  activeFindingCount: 1,
});

test('buildPciPdfTableRows memetakan status/PCI/iterasi DV per baris tabel', () => {
  const rows = buildPciPdfTableRows(table, [unassessed, calculated, unsupported]);
  assert.equal(rows.length, 3);

  assert.deepEqual(
    { pci: rows[0].pci, status: rows[0].status, iterationCount: rows[0].iterationCount },
    { pci: '100,00', status: 'Excellent', iterationCount: 0 },
  );
  assert.equal(rows[0].statusFill, pciRating(100).color);

  assert.deepEqual(
    { pci: rows[1].pci, status: rows[1].status, iterationCount: rows[1].iterationCount },
    { pci: '85,00', status: 'Very Good', iterationCount: 2 },
  );
  assert.equal(rows[1].statusFill, '#22c55e');

  assert.deepEqual(
    { pci: rows[2].pci, status: rows[2].status, iterationCount: rows[2].iterationCount },
    { pci: '—', status: 'Belum dapat dihitung', iterationCount: 0 },
  );
  assert.equal(rows[2].statusFill, '#fef3c7');

  // Properti lokasi mengikuti urutan fasilitas (bukan urutan status).
  assert.equal(rows[1].location, 'STA 0+010 s/d STA 0+020');
  assert.equal(rows[1].areaSqm, '450,0');
});

test('buildPciPdfDetailRows mencetak seluruh kolom dan subbaris tabel perhitungan', () => {
  const rows = buildPciPdfDetailRows(table, [unassessed, calculated, unsupported]);

  // Satu baris kosong + dua iterasi pada lokasi terhitung + satu baris unsupported.
  assert.equal(rows.length, 4);
  assert.deepEqual(
    {
      no: rows[1].no,
      damageType: rows[1].damageType,
      damageCode: rows[1].damageCode,
      severity: rows[1].severity,
      volume: rows[1].volume,
      density: rows[1].density,
      deductValue: rows[1].deductValue,
      sortedDeductValue: rows[1].sortedDeductValue,
      allowableDeducts: rows[1].allowableDeducts,
      totalQ: rows[1].totalQ,
      dv1: rows[1]['dv-1'],
      dv2: rows[1]['dv-2'],
      dv3: rows[1]['dv-3'],
      q: rows[1].q,
      totalDv: rows[1].totalDv,
      cdv: rows[1].cdv,
      maxCdv: rows[1].maxCdv,
      pci: rows[1].pci,
      status: rows[1].status,
    },
    {
      no: '2',
      damageType: 'Alligator Cracking',
      damageCode: 'ALC',
      severity: 'H',
      volume: '5,00 m²',
      density: '5,000%',
      deductValue: '50,0',
      sortedDeductValue: '50,0',
      allowableDeducts: '2,00',
      totalQ: '2',
      dv1: '50,0',
      dv2: '20,0',
      dv3: '10,0',
      q: '0',
      totalDv: '80,0',
      cdv: '50,0',
      maxCdv: '50,00',
      pci: '85,00',
      status: 'Very Good',
    },
  );

  assert.deepEqual(
    {
      no: rows[2].no,
      location: rows[2].location,
      damageType: rows[2].damageType,
      sortedDeductValue: rows[2].sortedDeductValue,
      allowableDeducts: rows[2].allowableDeducts,
      q: rows[2].q,
      totalDv: rows[2].totalDv,
      cdv: rows[2].cdv,
      maxCdv: rows[2].maxCdv,
      pci: rows[2].pci,
      status: rows[2].status,
    },
    {
      no: '2', location: 'STA 0+010 s/d STA 0+020', damageType: '', sortedDeductValue: '20,0',
      allowableDeducts: '—', q: '1', totalDv: '70,0', cdv: '48,0',
      maxCdv: '—', pci: '—', status: '',
    },
  );
  assert.equal(rows[0].status, 'Excellent');
  assert.equal(rows[0].statusFill, pciRating(100).color);
  assert.equal(rows[0].pci, '100,00');
  assert.equal(rows[3].status, 'Belum dapat dihitung');
  assert.equal(rows[3].pci, '100,00');
});

test('generatePciReportPdf menghasilkan PDF A4 dengan halaman ringkasan dan tabel', () => {
  const doc = generatePciReportPdf({
    table,
    calculations: [unassessed, calculated, unsupported],
    pciCorrection: 100,
    pciAverage: 93.3,
    generatedAt: new Date('2026-09-15T14:05:00'),
  });

  assert.ok(doc.getNumberOfPages() >= 2, `diharapkan >=2 halaman, aktual ${doc.getNumberOfPages()}`);
  doc.setPage(1);
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 210) < 0.1, 'ringkasan memakai A4 portrait');
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 297) < 0.1, 'ringkasan memakai A4 portrait');
  doc.setPage(2);
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 297) < 0.1, 'tabel memakai A4 landscape');
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 210) < 0.1, 'tabel memakai A4 landscape');

  const detailTable = (doc as typeof doc & {
    lastAutoTable: { columns: { dataKey: string | number }[]; body: unknown[] };
  }).lastAutoTable;
  assert.equal(detailTable.columns.length, 27);
  assert.deepEqual(
    detailTable.columns.map((column) => column.dataKey),
    [
      'no', 'location', 'damageType', 'damageCode', 'severity', 'volume', 'density',
      'deductValue', 'sortedDeductValue', 'allowableDeducts', 'totalQ',
      ...Array.from({ length: 10 }, (_, index) => `dv-${index + 1}`),
      'q', 'totalDv', 'cdv', 'maxCdv', 'pci', 'status',
    ],
  );
  assert.equal(detailTable.body.length, 4);
  const pageOperations = doc.internal.pages.flat().join('\n');
  assert.match(pageOperations, /Alligator Cracking/);
  assert.match(pageOperations, /Density/);
  assert.match(pageOperations, /CDV MAX/);

  const buf = doc.output('arraybuffer');
  const bytes = new Uint8Array(buf);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.byteLength > 10_000, `Dokumen terlalu kecil: ${bytes.byteLength} byte`);
  assert.match(new TextDecoder().decode(bytes.slice(-20)), /%%EOF/);
});

test('generatePciReportPdf tetap mencetak lokasi setelah batas 30 baris pagination layar', () => {
  const manyRows = Array.from({ length: 35 }, (_, index) => ({
    key: `STA-${index}`,
    label: index === 34 ? 'STA SENTINEL LAST' : `STA ${index}`,
    areaSqm: 450,
    damages: [],
  }));
  const sentinel = makeRow({
    ...calculated,
    lines: [{
      ...calculated.lines[0],
      type: 'DISTRESS SENTINEL LAST',
      code: 'ZZZ',
    }],
    iterations: [calculated.iterations[0]],
  });
  const doc = generatePciReportPdf({
    table: { ...table, rows: manyRows },
    calculations: [...manyRows.slice(0, -1).map(() => unassessed), sentinel],
    pciCorrection: 100,
    generatedAt: new Date('2026-09-15T14:05:00'),
  });
  const detailTable = (doc as typeof doc & { lastAutoTable: { body: unknown[] } }).lastAutoTable;
  assert.equal(detailTable.body.length, 35);
  const pageOperations = doc.internal.pages.flat().join('\n');
  assert.match(pageOperations, /STA SENTINEL LAST/);
  assert.match(pageOperations, /DISTRESS SENTINEL LAST/);
});

test('toolbar PciCalculationGrid membuka pratinjau sebelum mengunduh PDF', () => {
  const html = renderToStaticMarkup(createElement(PciCalculationGrid, { table }));
  assert.match(html, /Preview PDF/);
  assert.match(html, /<button\b[^>]*type="button"[^>]*>/);
  assert.match(html, /<button\b[^>]*disabled=""[^>]*>/);
  assert.match(html, /title="Pratinjau laporan PDF seluruh isi tabel STA\/SAMPEL fasilitas ini/);
});
