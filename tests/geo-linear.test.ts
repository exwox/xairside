import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lineFromPoints,
  localToLatLng,
  pointFromPoint,
  polylineLengthM,
  splitPolylineBySampleGrids,
  splitPolylineByStation,
  type LatLng,
} from '../src/lib/geo';

const arpLat = 0.9569;
const arpLng = 104.5311;
const at = (x: number, y: number) => localToLatLng(x, y, arpLat, arpLng);
const rectangle = (x0: number, x1: number, y0: number, y1: number): LatLng[] => [
  at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1),
];
const facility = {
  id: 'facility-1', code: 'RWY', polygonJson: JSON.stringify(rectangle(-10, 10, -50, 50)),
  centroidLat: arpLat, centroidLng: arpLng, bearingDeg: 0,
  lengthM: 100, widthM: 20, stationDirection: 'FORWARD', stationIntervalM: 10,
  surfaceType: 'ASPHALT', sampleLengthM: 100, sampleWidthM: 10,
  blockLengthM: null, blockWidthM: null, slabDirection: 'FORWARD',
};

function near(actual: number, expected: number, tolerance = 1e-5): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

test('meter lari mengikuti ruas bengkok, bukan bounding box', () => {
  const vertices = [at(0, 0), at(10, 0), at(10, 10)];
  near(polylineLengthM(vertices, arpLat, arpLng), 20);
  const line = lineFromPoints(vertices, arpLat, arpLng);
  near(line.lengthM, 20);
  near(line.centerLocal.x, 10);
  near(line.centerLocal.y, 0);
  assert.equal(line.areaSqm, 0);
  assert.equal(line.widthM, 0);
  const point = pointFromPoint(vertices[0], arpLat, arpLng);
  assert.equal(point.corners.length, 1);
  assert.equal(point.areaSqm, 0);
  assert.equal(point.lengthM, 0);
});

test('garis zigzag dibagi menurut panjang aktual di tiap STA dan bisa dipecah ulang', () => {
  const line = [at(0, -30), at(0, 30), at(0, -30)];
  const parts = splitPolylineByStation(facility, line, arpLat, arpLng);
  near(parts.reduce((sum, part) => sum + part.lengthM, 0), 120);
  assert.ok(parts.every((part) => part.areaSqm === 0 && part.rectJson === JSON.stringify(line)));
  const byStation = new Map<string, number>();
  for (const part of parts) byStation.set(part.stationText, (byStation.get(part.stationText) ?? 0) + part.lengthM);
  assert.equal(byStation.size, 6);
  assert.equal(parts.length, 6);
  for (const length of byStation.values()) near(length, 20);
  assert.ok(parts.every((part) => part.clippedPaths && part.clippedPaths.length >= 1));
  assert.ok(parts.some((part) => (part.clippedPaths?.length ?? 0) === 2));

  const wider = splitPolylineByStation({ ...facility, stationIntervalM: 50 }, line, arpLat, arpLng);
  near(wider.reduce((sum, part) => sum + part.lengthM, 0), 120);
  assert.equal(new Set(wider.map((part) => part.stationText)).size, 2);
});

test('bagian garis di luar panjang fasilitas tidak dipaksa masuk STA ujung', () => {
  const parts = splitPolylineByStation(facility, [at(0, -60), at(0, 60)], arpLat, arpLng);
  near(parts.reduce((sum, part) => sum + part.lengthM, 0), 100);
  assert.equal(parts.length, 10);
});

test('garis pada grid SAM dipotong di batas bersama tanpa menghitung dua kali', () => {
  const line = [at(-10, 0), at(10, 0)];
  const parts = splitPolylineBySampleGrids(facility, line, arpLat, arpLng);
  near(parts.reduce((sum, part) => sum + part.lengthM, 0), 20);
  assert.equal(new Set(parts.map((part) => part.sampleCode)).size, 2);
  assert.ok(parts.every((part) => part.areaSqm === 0 && part.rectJson === JSON.stringify(line)));
});
