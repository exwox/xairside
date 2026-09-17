import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMapRotation, rotatedMapSize, rotateMapVector, viewportToMapPoint } from '../src/lib/map-rotation';
import { latLngToLocal, localToLatLng, polyFromPoints, rectFromCorners, snapLatLngToOrtho } from '../src/lib/geo';

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should equal ${expected}`);
}

test('90° converts screen right into map north, without bounding-box scaling', () => {
  const point = viewportToMapPoint({ x: 700, y: 200 }, { x: 1000, y: 400 }, { x: 400, y: 1000 }, 90);
  near(point.x, 200);
  near(point.y, 300);
  const drag = rotateMapVector({ x: 60, y: -25 }, -90);
  near(drag.x, -25);
  near(drag.y, -60);
});

test('all viewport corners remain covered on wide and tall rotated maps', () => {
  for (const viewport of [{ x: 1200, y: 400 }, { x: 400, y: 900 }]) {
    for (const degrees of [0, 30, 45, 90, 135, 180, 270, -60, 405]) {
      const size = rotatedMapSize(viewport, -degrees);
      for (const x of [0, viewport.x]) for (const y of [0, viewport.y]) {
        const point = viewportToMapPoint({ x, y }, viewport, size, degrees);
        assert.ok(point.x >= -1e-7 && point.x <= size.x + 1e-7);
        assert.ok(point.y >= -1e-7 && point.y <= size.y + 1e-7);
        const visible = rotateMapVector({ x: point.x - size.x / 2, y: point.y - size.y / 2 }, degrees);
        near(visible.x + viewport.x / 2, x);
        near(visible.y + viewport.y / 2, y);
      }
    }
  }
});

test('ORTO drawing aligns with visible horizontal/vertical axes after rotation', () => {
  const anchor = { lat: 0.9569, lng: 104.5311 };
  for (const degrees of [0, 30, 45, 90, 135, 270, -60]) {
    for (const screenDelta of [{ x: 40, y: 3 }, { x: 3, y: -40 }]) {
      const mapDelta = rotateMapVector(screenDelta, -degrees);
      const target = localToLatLng(mapDelta.x, -mapDelta.y, anchor.lat, anchor.lng);
      const snapped = snapLatLngToOrtho(anchor, target, anchor.lat, anchor.lng, degrees);
      const local = latLngToLocal(snapped.point.lat, snapped.point.lng, anchor.lat, anchor.lng);
      const screen = rotateMapVector({ x: local.x, y: -local.y }, degrees);
      near(screenDelta.x === 40 ? screen.y : screen.x, 0);
    }
  }
});

test('rotation accepts equivalent angles and safely handles non-finite input', () => {
  assert.equal(normalizeMapRotation(-90), 270);
  assert.equal(normalizeMapRotation(450), 90);
  assert.equal(normalizeMapRotation(360), 0);
  assert.equal(normalizeMapRotation(NaN), 0);
  assert.equal(normalizeMapRotation(Infinity), 0);
});

test('two-corner damage preview and completed rectangle follow the rotated screen axes', () => {
  const arpLat = 0.9569;
  const arpLng = 104.5311;
  for (const degrees of [0, 30, 45, 90, 137, -43]) {
    const corners = [{ x: -10, y: 5 }, { x: 30, y: -15 }].map((point) => {
      const delta = rotateMapVector(point, -degrees);
      return localToLatLng(delta.x, -delta.y, arpLat, arpLng);
    });
    const preview = rectFromCorners(corners[0], corners[1], arpLat, arpLng, degrees);
    const completed = polyFromPoints(corners, arpLat, arpLng, degrees);
    assert.deepEqual(completed, preview);
    near(preview.widthM, 40);
    near(preview.lengthM, 20);
    near(preview.areaSqm, 800);
    const rendered = preview.corners.map((point) => {
      const local = latLngToLocal(point.lat, point.lng, arpLat, arpLng);
      return rotateMapVector({ x: local.x, y: -local.y }, degrees);
    });
    rendered.forEach((point, index) => {
      const expected = [{ x: -10, y: 5 }, { x: 30, y: 5 }, { x: 30, y: -15 }, { x: -10, y: -15 }][index];
      near(point.x, expected.x);
      near(point.y, expected.y);
    });
  }
});
