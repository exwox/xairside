import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Facility } from '../src/types';
import type { PciFacilityTable } from '../src/lib/pci-location-table';
import PciCalculationGrid from '../src/components/PciCalculationGrid';

const facility = {
  id: 'facility-1', code: 'RWY', name: 'Runway', type: 'RUNWAY', surfaceType: 'ASPHALT',
} as Facility;

test('kolom iterasi DV 1–10 disembunyikan secara default dan STA kosong memakai PCI koreksi 100', () => {
  const table: PciFacilityTable = {
    facility, mode: 'STA', stationIntervalM: 10,
    rows: [{ key: 'STA-0', label: 'STA 0+000 s/d STA 0+010', areaSqm: 100, damages: [] }],
    unmapped: [],
  };
  const html = renderToStaticMarkup(createElement(PciCalculationGrid, { table }));
  assert.equal((html.match(/<th\b/g) ?? []).length, 17);
  assert.match(html, /Iterasi DV 1–10/);
  assert.match(html, /PCI Koreksi/);
  assert.doesNotMatch(html, /<th\b[^>]*>10<\/th>/);
  assert.match(html, /STA 0\+000 s\/d STA 0\+010/);
  assert.match(html, /Excellent/);
  assert.match(html, /color:#15803d;border-color:#15803d;background-color:#ffffff[^>]*>Excellent<\/span>/);
  assert.match(html, /100,00<\/td>/);
});

test('tabel PCI referensi memiliki 27 kolom saat iterasi DV ditampilkan', () => {
  const table: PciFacilityTable = {
    facility, mode: 'STA', stationIntervalM: 10,
    rows: [{ key: 'STA-0', label: 'STA 0+000 s/d STA 0+010', areaSqm: 100, damages: [] }],
    unmapped: [],
  };
  const html = renderToStaticMarkup(createElement(PciCalculationGrid, { table, showDvIterationsDefault: true }));
  assert.equal((html.match(/<th\b/g) ?? []).length, 27);
  assert.match(html, /<th\b[^>]*>10<\/th>/);
  assert.match(html, /Excellent/);
  assert.match(html, /100,00<\/td>/);
});

test('PCI koreksi tampil editable di toolbar dan dipakai untuk PCI/SAMPLE baris kosong', () => {
  const table: PciFacilityTable = {
    facility, mode: 'STA', stationIntervalM: 10,
    rows: [{ key: 'STA-0', label: 'STA 0+000 s/d STA 0+010', areaSqm: 100, damages: [] }],
    unmapped: [],
  };
  const html = renderToStaticMarkup(createElement(PciCalculationGrid, { table, pciCorrection: 85 }));
  assert.match(html, /PCI Koreksi/);
  assert.match(html, /85,00<\/td>/);
  assert.doesNotMatch(html, /100,00<\/td>/);
});

test('spoiler grafik batang menampilkan satu batang per STA/SAMPEL dengan warna status PCI', () => {
  const table: PciFacilityTable = {
    facility, mode: 'STA', stationIntervalM: 10,
    rows: [
      { key: 'STA-0', label: 'STA 0+000 s/d STA 0+010', areaSqm: 100, damages: [] },
      { key: 'STA-1', label: 'STA 0+010 s/d STA 0+020', areaSqm: 100, damages: [] },
    ],
    unmapped: [],
  };
  const html = renderToStaticMarkup(createElement(PciCalculationGrid, { table, pciCorrection: 85 }));
  assert.match(html, /Grafik PCI/);
  assert.match(html, /Semua <strong class="text-slate-800">2<\/strong> STA/);
  assert.equal((html.match(/min-w-0 flex-1 flex-col/g) ?? []).length, 2);
  assert.match(html, /Rata-rata 85,0/);
  // Baris tanpa kerusakan memakai PCI koreksi 85 -> status Very Good (#22c55e), tinggi 85%
  assert.match(html, /height:85%/);
  assert.match(html, /background-color:#22c55e/);
});
