import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closestEquivalentBearing,
  computePolygonMetrics,
  getFacilityStationOffsetM,
  localToLatLng,
  resizePolygonToDimensions,
  rotateFacilityPolygonClockwise,
  type LatLng,
} from '../src/lib/geo';

const arpLat = 0.9569;
const arpLng = 104.5311;

function rectangle(): LatLng[] {
  return [[-10, -50], [10, -50], [10, 50], [-10, 50]]
    .map(([x, y]) => localToLatLng(x, y, arpLat, arpLng));
}

function assertSameVertices(actual: LatLng[], expected: LatLng[], tolerance = 1e-9) {
  assert.equal(actual.length, expected.length);
  actual.forEach((point, index) => {
    assert.ok(Math.abs(point.lat - expected[index].lat) < tolerance, `latitude vertex ${index}`);
    assert.ok(Math.abs(point.lng - expected[index].lng) < tolerance, `longitude vertex ${index}`);
  });
}

test('tombol +15° memutar searah jarum jam dan bearing tetap sama sesudah snap Simpan', () => {
  const rotated = rotateFacilityPolygonClockwise(rectangle(), 15, 0);
  assert.equal(rotated.bearingDeg, 15);
  assert.ok(Math.abs(computePolygonMetrics(rotated.vertices).bearingDeg - 15) <= 1);
  const saved = resizePolygonToDimensions(rotated.vertices, 100, 20, rotated.bearingDeg);
  assertSameVertices(saved, rotated.vertices);
});

test('bearing melampaui 180° tidak membalik arah STA', () => {
  const rotated = rotateFacilityPolygonClockwise(rectangle(), -90, 0);
  assert.equal(rotated.bearingDeg, 270);
  const saved = resizePolygonToDimensions(rotated.vertices, 100, 20, rotated.bearingDeg);
  const facility = {
    code: 'RWY', polygonJson: JSON.stringify(saved),
    centroidLat: arpLat, centroidLng: arpLng,
    bearingDeg: rotated.bearingDeg, lengthM: 100,
    stationDirection: 'FORWARD',
  };
  const west = getFacilityStationOffsetM(facility, localToLatLng(-40, 0, arpLat, arpLng), arpLat, arpLng);
  const east = getFacilityStationOffsetM(facility, localToLatLng(40, 0, arpLat, arpLng), arpLat, arpLng);
  assert.ok(west && east && west.offsetM > east.offsetM);
});

test('polygon asimetris >4 vertex tidak berbalik lagi saat disimpan ulang', () => {
  const asymmetric = [[-10, -50], [10, -50], [10, 50], [0, 40], [-10, 50]]
    .map(([x, y]) => localToLatLng(x, y, arpLat, arpLng));
  const rotated = rotateFacilityPolygonClockwise(asymmetric, -90, 0);
  assert.equal(closestEquivalentBearing(90, 270), 270);
  const firstSave = resizePolygonToDimensions(rotated.vertices, 100, 20, rotated.bearingDeg);
  const secondSave = resizePolygonToDimensions(firstSave, 100, 20, rotated.bearingDeg);
  assertSameVertices(secondSave, firstSave);
});
