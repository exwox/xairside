import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateFacilityStation,
  formatStationSegment,
  getFacilityStationIntervalM,
  localToLatLng,
  splitDamageByStation,
  type LatLng,
} from '../src/lib/geo';

const arpLat = 0.9569;
const arpLng = 104.5311;
const facilityLengthM = 120;

function rectangle(xMin: number, xMax: number, yMin: number, yMax: number): LatLng[] {
  return [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]]
    .map(([x, y]) => localToLatLng(x, y, arpLat, arpLng));
}

function facility(intervalM: number, reverse = false) {
  return {
    id: 'runway-1', code: 'RWY',
    polygonJson: JSON.stringify(rectangle(-10, 10, -60, 60)),
    centroidLat: arpLat, centroidLng: arpLng,
    bearingDeg: 0, lengthM: facilityLengthM, widthM: 20,
    stationDirection: reverse ? 'REVERSE' : 'FORWARD',
    stationIntervalM: intervalM,
  };
}

function damageBetweenSta(startM: number, endM: number, widthM = 2): LatLng[] {
  return rectangle(-widthM / 2, widthM / 2, startM - facilityLengthM / 2, endM - facilityLengthM / 2);
}

test('kerusakan dibagi sesuai interval 50 m fasilitas, bukan 10 m', () => {
  const parts = splitDamageByStation(facility(50), damageBetweenSta(20, 80), arpLat, arpLng);
  assert.deepEqual(parts.map((part) => part.stationText), [
    'STA 0+000 s/d STA 0+050',
    'STA 0+050 s/d STA 0+100',
  ]);
  assert.ok(Math.abs(parts[0].areaSqm - parts[1].areaSqm) < 0.01);
  assert.ok(Math.abs(parts.reduce((sum, part) => sum + part.areaSqm, 0) - 120) < 0.01);
});

test('interval 25 m membelah temuan yang hanya melintas tipis dan menjaga jumlah luas', () => {
  const parts = splitDamageByStation(facility(25), damageBetweenSta(24.95, 25.05, 0.2), arpLat, arpLng);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((part) => part.stationText), [
    'STA 0+000 s/d STA 0+025',
    'STA 0+025 s/d STA 0+050',
  ]);
  assert.ok(Math.abs(parts.reduce((sum, part) => sum + part.areaSqm, 0) - 0.1) < 1e-6);
});

test('interval 100 m memotong temuan menuju segmen akhir yang lebih pendek', () => {
  const parts = splitDamageByStation(facility(100), damageBetweenSta(90, 110), arpLat, arpLng);
  assert.deepEqual(parts.map((part) => part.stationText), [
    'STA 0+000 s/d STA 0+100',
    'STA 0+100 s/d STA 0+120',
  ]);
  assert.ok(Math.abs(parts.reduce((sum, part) => sum + part.areaSqm, 0) - 40) < 0.01);
});

test('lokasi tepat di ujung fasilitas memakai interval terakhir dan arah reverse dihormati', () => {
  assert.equal(formatStationSegment(120, 120, 50).stationText, 'STA 0+100 s/d STA 0+120');
  const endpoint = calculateFacilityStation(
    facility(50), localToLatLng(0, 60, arpLat, arpLng), arpLat, arpLng
  );
  assert.equal(endpoint?.stationText, 'STA 0+100 s/d STA 0+120');
  const reverse = calculateFacilityStation(
    facility(50, true), localToLatLng(0, 40, arpLat, arpLng), arpLat, arpLng
  );
  assert.equal(reverse?.stationText, 'STA 0+000 s/d STA 0+050');
});

test('interval tidak valid mengikuti fallback 50 m yang sama dengan PCI', () => {
  assert.equal(getFacilityStationIntervalM({ stationIntervalM: 0 }), 50);
  assert.equal(getFacilityStationIntervalM({ stationIntervalM: 25 }), 25);
});
