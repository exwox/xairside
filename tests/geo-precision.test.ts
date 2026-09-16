import assert from 'node:assert/strict';
import test from 'node:test';
import {
  directionFromAnchorToCursor,
  endpointAtDistanceM,
  latLngToLocal,
  localToLatLng,
  parseMeterInput,
  polylineLengthM,
  snapLatLngToOrtho,
  type LatLng,
} from '../src/lib/geo';

const arpLat = 0.9569;
const arpLng = 104.5311;
const at = (x: number, y: number): LatLng => localToLatLng(x, y, arpLat, arpLng);

function near(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function localNear(point: LatLng, expectedX: number, expectedY: number): void {
  const local = latLngToLocal(point.lat, point.lng, arpLat, arpLng);
  near(local.x, expectedX);
  near(local.y, expectedY);
}

test('input jarak menerima desimal Indonesia atau internasional dalam meter', () => {
  assert.equal(parseMeterInput('12'), 12);
  assert.equal(parseMeterInput(' 12,75 '), 12.75);
  assert.equal(parseMeterInput('12.75'), 12.75);
  assert.equal(parseMeterInput(',5 m'), 0.5);
  assert.equal(parseMeterInput('.5 meter'), 0.5);
  assert.equal(parseMeterInput('5,'), 5);

  for (const invalid of ['', '0', '-2', '1,2.3', '1.000,5', '2 km', 'NaN', 'Infinity']) {
    assert.equal(parseMeterInput(invalid), null, invalid);
  }
});

test('ORTO tanpa rotasi memilih proyeksi horizontal atau vertikal terdekat', () => {
  const horizontal = snapLatLngToOrtho(at(2, 3), at(12, 7), arpLat, arpLng);
  assert.equal(horizontal.axis, 'HORIZONTAL');
  localNear(horizontal.point, 12, 3);
  near(horizontal.distanceM, 10);
  near(horizontal.direction.x, 1);
  near(horizontal.direction.y, 0);

  const vertical = snapLatLngToOrtho(at(2, 3), at(-1, -9), arpLat, arpLng);
  assert.equal(vertical.axis, 'VERTICAL');
  localNear(vertical.point, 2, -9);
  near(vertical.distanceM, 12);
  near(vertical.direction.x, 0);
  near(vertical.direction.y, -1);
});

test('ORTO mengikuti sumbu layar ketika peta diputar', () => {
  // Pada rotasi peta 90°, arah utara terlihat ke kanan dan arah barat ke atas.
  const visualHorizontal = snapLatLngToOrtho(at(0, 0), at(2, 10), arpLat, arpLng, 90);
  assert.equal(visualHorizontal.axis, 'HORIZONTAL');
  localNear(visualHorizontal.point, 0, 10);
  near(visualHorizontal.direction.x, 0);
  near(visualHorizontal.direction.y, 1);

  const visualVertical = snapLatLngToOrtho(at(0, 0), at(-10, 2), arpLat, arpLng, 90);
  assert.equal(visualVertical.axis, 'VERTICAL');
  localNear(visualVertical.point, -10, 0);
  near(visualVertical.direction.x, -1);
  near(visualVertical.direction.y, 0);
});

test('ORTO pada rotasi bebas memproyeksikan ke sumbu layar yang tepat', () => {
  const radians = Math.PI / 6;
  const horizontalAxis = { x: Math.cos(radians), y: Math.sin(radians) };
  const target = at(horizontalAxis.x * 20 - 2.5, horizontalAxis.y * 20 + 4.3301270189);
  const snapped = snapLatLngToOrtho(at(0, 0), target, arpLat, arpLng, 30);

  assert.equal(snapped.axis, 'HORIZONTAL');
  localNear(snapped.point, horizontalAxis.x * 20, horizontalAxis.y * 20);
  near(snapped.distanceM, 20);
});

test('endpoint numerik mempertahankan jarak meter persis dan arah bertanda', () => {
  const anchor = at(100, -25);
  const endpoint = endpointAtDistanceM(anchor, { x: 3, y: 4 }, 12.5, arpLat, arpLng);
  localNear(endpoint, 107.5, -15);
  near(polylineLengthM([anchor, endpoint], arpLat, arpLng), 12.5);

  const reverse = endpointAtDistanceM(anchor, { x: -10, y: 0 }, 7.25, arpLat, arpLng);
  localNear(reverse, 92.75, -25);
  near(polylineLengthM([anchor, reverse], arpLat, arpLng), 7.25);
});

test('arah numerik mengikuti kursor, atau sumbu layar saat ORTO aktif', () => {
  const anchor = at(0, 0);
  const cursor = at(3, 8);

  const free = directionFromAnchorToCursor(anchor, cursor, false, arpLat, arpLng);
  assert.ok(free);
  const len = Math.hypot(3, 8);
  near(free.x, 3 / len);
  near(free.y, 8 / len);
  near(Math.hypot(free.x, free.y), 1);

  const ortho = directionFromAnchorToCursor(anchor, cursor, true, arpLat, arpLng);
  assert.ok(ortho);
  near(Math.hypot(ortho.x, ortho.y), 1);
  // Kursor lebih dekat ke sumbu vertikal → arah utara (y +)
  near(ortho.x, 0);
  near(ortho.y, 1);

  // Tidak ada arah saat kursor bersamaan dengan anchor (mode bebas)
  assert.equal(directionFromAnchorToCursor(anchor, at(0, 0), false, arpLat, arpLng), null);
});
