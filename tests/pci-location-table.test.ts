import assert from 'node:assert/strict';
import test from 'node:test';
import type { Damage, Facility } from '../src/types';
import { localToLatLng } from '../src/lib/geo';
import { buildPciFacilityTable, countRecordedFindings, recordedDamageAreaSqm } from '../src/lib/pci-location-table';

const arpLat = 0.9569;
const arpLng = 104.5311;

function rectangle(lengthM: number, widthM: number) {
  return [
    [-widthM / 2, -lengthM / 2],
    [widthM / 2, -lengthM / 2],
    [widthM / 2, lengthM / 2],
    [-widthM / 2, lengthM / 2],
  ].map(([x, y]) => localToLatLng(x, y, arpLat, arpLng));
}

function facility(overrides: Partial<Facility> = {}): Facility {
  return {
    id: 'facility-1', code: 'RWY', name: 'Runway', type: 'RUNWAY',
    lengthM: 40, widthM: 20, areaSqm: 800, surfaceType: 'ASPHALT',
    pcn: null, pcr: null, bearingDeg: 0, stationDirection: 'FORWARD',
    locationMode: 'STA', stationIntervalM: 10, sampleLengthM: 20, sampleWidthM: 20,
    centroidLat: arpLat, centroidLng: arpLng,
    polygonJson: JSON.stringify(rectangle(40, 20)), color: null,
    status: null, remarks: null, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function damage(overrides: Partial<Damage> = {}): Damage {
  return {
    id: 'damage-1', facilityId: 'facility-1', station: 'STA 0+010 s/d STA 0+020',
    sampleCode: null, type: 'Retak', severity: 'M', lat: arpLat, lng: arpLng,
    localX: 0, localY: 0, rectJson: null, lengthM: 2, widthM: 1,
    areaSqm: 2, photoUrl: null, remarks: null, status: 'OPEN',
    reportedBy: null, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

test('STA membentuk seluruh interval 10 m termasuk yang tanpa kerusakan', () => {
  const table = buildPciFacilityTable(facility(), [damage()], arpLat, arpLng);
  assert.equal(table.mode, 'STA');
  assert.equal(table.rows.length, 4);
  assert.deepEqual(table.rows.map((row) => row.damages.length), [0, 1, 0, 0]);
  assert.equal(table.unmapped.length, 0);
});

test('kode STA eksplisit yang keluar fasilitas tidak diam-diam dipetakan dari koordinat', () => {
  const table = buildPciFacilityTable(
    facility(), [damage({ station: 'STA 0+999 s/d STA 1+000' })], arpLat, arpLng
  );
  assert.equal(table.unmapped.length, 1);
  assert.ok(table.rows.every((row) => row.damages.length === 0));
});

test('interval STA mengikuti pengaturan fasilitas dan baris terakhir menutup sisa panjang', () => {
  const configured = facility({
    lengthM: 120, areaSqm: 2400, stationIntervalM: 50,
    polygonJson: JSON.stringify(rectangle(120, 20)),
  });
  const table = buildPciFacilityTable(configured, [
    damage({ id: 'early', station: 'STA 0+020 s/d STA 0+030' }),
    damage({ id: 'middle', station: 'STA 0+050 s/d STA 0+060' }),
  ], arpLat, arpLng);
  assert.equal(table.stationIntervalM, 50);
  assert.deepEqual(table.rows.map((row) => row.label), [
    'STA 0+000 s/d STA 0+050',
    'STA 0+050 s/d STA 0+100',
    'STA 0+100 s/d STA 0+120',
  ]);
  assert.deepEqual(table.rows.map((row) => row.damages.length), [1, 1, 0]);
});

test('interval 25 m membagi proporsional catatan 10 m yang melintasi batas', () => {
  const configured = facility({
    lengthM: 50, areaSqm: 1000, stationIntervalM: 25,
    polygonJson: JSON.stringify(rectangle(50, 20)),
  });
  const table = buildPciFacilityTable(configured, [
    damage({ station: 'RWY [STA 0+020-STA 0+030]', areaSqm: 10 }),
  ], arpLat, arpLng);
  assert.equal(table.rows.length, 2);
  assert.equal(recordedDamageAreaSqm(table.rows[0].damages), 5);
  assert.equal(recordedDamageAreaSqm(table.rows[1].damages), 5);
  assert.equal(table.rows[0].damages[0].lengthM, 1);
  assert.equal(table.rows[1].damages[0].lengthM, 1);
  assert.equal(countRecordedFindings(table.rows.flatMap((row) => row.damages)), 1);
});

test('interval 100 m membentuk satu baris untuk fasilitas sepanjang 100 m', () => {
  const configured = facility({
    lengthM: 100, areaSqm: 2000, stationIntervalM: 100,
    polygonJson: JSON.stringify(rectangle(100, 20)),
  });
  const table = buildPciFacilityTable(configured, [], arpLat, arpLng);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].label, 'STA 0+000 s/d STA 0+100');
});

test('beton digabung per SAM induk dan luas pecahan kerusakan tetap dijumlahkan', () => {
  const rigid = facility({
    type: 'APRON', surfaceType: 'CONCRETE', locationMode: 'SAM',
    lengthM: 20, widthM: 20, areaSqm: 400,
    polygonJson: JSON.stringify(rectangle(20, 20)),
    blockLengthM: 5, blockWidthM: 5,
  });
  const parts = [
    damage({ id: 'a', groupId: 'group-1', sampleCode: 'SAM-1 Slab A', station: 'SAM-1 Slab A', areaSqm: 3 }),
    damage({ id: 'b', groupId: 'group-1', sampleCode: 'SAM-1 Slab B', station: 'SAM-1 Slab B', areaSqm: 4 }),
  ];
  const table = buildPciFacilityTable(rigid, parts, arpLat, arpLng);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].label, 'SAM-1');
  assert.equal(countRecordedFindings(table.rows[0].damages), 1);
  assert.equal(recordedDamageAreaSqm(table.rows[0].damages), 7);
});

test('SAM yang tidak punya geometri atau dimensi tidak membuat grid fiktif di ARP', () => {
  const table = buildPciFacilityTable(
    facility({ locationMode: 'SAM', polygonJson: null, centroidLat: null, centroidLng: null, lengthM: null, widthM: null }),
    [damage({ station: 'SAM-1', sampleCode: 'SAM-1' })], arpLat, arpLng
  );
  assert.equal(table.rows.length, 0);
  assert.equal(table.unmapped.length, 1);
});

test('SAM mengikuti dimensi snap fasilitas, bukan ukuran digitasi polygon lama', () => {
  const table = buildPciFacilityTable(
    facility({
      locationMode: 'SAM', lengthM: 20, widthM: 20, areaSqm: 400,
      polygonJson: JSON.stringify(rectangle(20.2, 20)),
    }),
    [damage({ station: 'SAM-999', sampleCode: 'SAM-999' })], arpLat, arpLng
  );
  assert.equal(table.rows.length, 1);
  assert.equal(table.unmapped.length, 1);
});

test('ringkasan luas tidak mencampur panjang garis atau jumlah slab', () => {
  const records = [
    damage({ id: 'area', geometryType: 'POLYGON', areaSqm: 4 }),
    damage({ id: 'line', geometryType: 'LINE', areaSqm: 0, lengthM: 7 }),
    damage({ id: 'slab', geometryType: 'SLAB', areaSqm: 20, count: 1 }),
  ];
  assert.equal(recordedDamageAreaSqm(records), 4);
});
