import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computePolygonMetrics,
  generateFacilityConcreteBlocks,
  generateFacilityConcreteBlocksSnapped,
  generateFacilitySampleGrids,
  isPointInPolygon,
  localToLatLng,
  parseRectangleDimensions,
  polygonAreaSqm,
  rectFromCenterDimensions,
  resizePolygonToDimensions,
  toLocalPoly,
} from '../src/lib/geo.ts';

const REF_LAT = 0.9569;
const REF_LNG = 104.5311;

function rectanglePolygon(lengthM, widthM, bearingDeg) {
  const radians = (bearingDeg * Math.PI) / 180;
  const lengthAxis = { x: Math.sin(radians), y: Math.cos(radians) };
  const widthAxis = { x: Math.cos(radians), y: -Math.sin(radians) };
  const halfLength = lengthM / 2;
  const halfWidth = widthM / 2;

  return [
    { length: -halfLength, width: -halfWidth },
    { length: -halfLength, width: halfWidth },
    { length: halfLength, width: halfWidth },
    { length: halfLength, width: -halfWidth },
  ].map((offset) =>
    localToLatLng(
      offset.length * lengthAxis.x + offset.width * widthAxis.x,
      offset.length * lengthAxis.y + offset.width * widthAxis.y,
      REF_LAT,
      REF_LNG
    )
  );
}

function actualArea(polygon) {
  return polygonAreaSqm(toLocalPoly(polygon, REF_LAT, REF_LNG));
}

function assertClose(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}

function bearingAxisDelta(actual, expected) {
  const delta = Math.abs((((actual - expected) % 180) + 180) % 180);
  return Math.min(delta, 180 - delta);
}

function polygonFromLocalPoints(points) {
  return points.map(([x, y]) => localToLatLng(x, y, REF_LAT, REF_LNG));
}

function blockGeometrySignature(block) {
  return block.polygon
    .map((point) => `${point.lat.toFixed(11)},${point.lng.toFixed(11)}`)
    .sort()
    .join('|');
}

function groupBlocksBySample(blocks) {
  const groups = new Map();
  for (const block of blocks) {
    const sampleBlocks = groups.get(block.sampleCode) || [];
    sampleBlocks.push(block);
    groups.set(block.sampleCode, sampleBlocks);
  }
  return groups;
}

function assertReverseSlabDirection(facility, polygon, context) {
  const forward = generateFacilityConcreteBlocks(
    { ...facility, slabDirection: 'FORWARD' },
    REF_LAT,
    REF_LNG,
    polygon
  );
  const reverse = generateFacilityConcreteBlocks(
    { ...facility, slabDirection: 'REVERSE' },
    REF_LAT,
    REF_LNG,
    polygon
  );
  const forwardGroups = groupBlocksBySample(forward);
  const reverseGroups = groupBlocksBySample(reverse);

  assert.deepEqual(
    [...reverseGroups.keys()].sort(),
    [...forwardGroups.keys()].sort(),
    `${context}: daftar sampel tidak boleh berubah`
  );

  for (const [sampleCode, forwardBlocks] of forwardGroups) {
    const reverseBlocks = reverseGroups.get(sampleCode);
    assert.ok(reverseBlocks, `${context}: ${sampleCode} harus tetap tersedia`);
    assert.equal(
      reverseBlocks.length,
      forwardBlocks.length,
      `${context}: jumlah slab ${sampleCode} tidak boleh berubah`
    );

    assert.deepEqual(
      reverseBlocks.map(blockGeometrySignature).sort(),
      forwardBlocks.map(blockGeometrySignature).sort(),
      `${context}: geometri slab ${sampleCode} tidak boleh berubah`
    );
    const forwardByGeometry = new Map(
      forwardBlocks.map((block) => [blockGeometrySignature(block), block])
    );
    for (const reverseBlock of reverseBlocks) {
      const matchingForwardBlock = forwardByGeometry.get(blockGeometrySignature(reverseBlock));
      assert.ok(matchingForwardBlock, `${context}: pasangan geometri ${sampleCode} harus tersedia`);
      assert.equal(
        reverseBlock.areaSqm,
        matchingForwardBlock.areaSqm,
        `${context}: luas slab pada posisi yang sama di ${sampleCode}`
      );
      assert.equal(reverseBlock.lengthM, matchingForwardBlock.lengthM);
      assert.equal(reverseBlock.widthM, matchingForwardBlock.widthM);
    }
    assertClose(
      reverseBlocks.reduce((sum, block) => sum + actualArea(block.polygon), 0),
      forwardBlocks.reduce((sum, block) => sum + actualArea(block.polygon), 0),
      1e-6,
      `${context}: luas geometri ${sampleCode}`
    );
    assertClose(
      reverseBlocks.reduce((sum, block) => sum + block.areaSqm, 0),
      forwardBlocks.reduce((sum, block) => sum + block.areaSqm, 0),
      1e-9,
      `${context}: metadata luas ${sampleCode}`
    );

    const forwardFirst = forwardBlocks.find((block) => block.blockLabel === 'Slab A');
    const forwardLast = forwardBlocks.at(-1);
    const reverseFirst = reverseBlocks.find((block) => block.blockLabel === 'Slab A');
    const reverseLast = reverseBlocks.at(-1);

    assert.ok(forwardFirst && forwardLast && reverseFirst && reverseLast);
    assert.equal(
      blockGeometrySignature(reverseFirst),
      blockGeometrySignature(forwardLast),
      `${context}: Slab A REVERSE harus menempati slab terakhir FORWARD pada ${sampleCode}`
    );
    assert.equal(
      blockGeometrySignature(reverseLast),
      blockGeometrySignature(forwardFirst),
      `${context}: slab terakhir REVERSE harus menempati Slab A FORWARD pada ${sampleCode}`
    );
  }

  return { forward, reverse };
}

test('parser ukuran rectangle menerima pemisah dan format desimal yang didukung', () => {
  const cases = [
    ['2x2', { lengthM: 2, widthM: 2 }],
    ['2X3', { lengthM: 2, widthM: 3 }],
    ['4×1.5', { lengthM: 4, widthM: 1.5 }],
    ['7*0.25', { lengthM: 7, widthM: 0.25 }],
    [' 2.5 x 1.25 ', { lengthM: 2.5, widthM: 1.25 }],
    ['2,5x1,25', { lengthM: 2.5, widthM: 1.25 }],
  ];

  for (const [input, expected] of cases) {
    assert.deepEqual(parseRectangleDimensions(input), expected, `ukuran ${input} harus valid`);
  }
});

test('parser ukuran rectangle menolak input tidak lengkap atau ukuran nonpositif', () => {
  const invalidInputs = [
    '',
    '2',
    'x2',
    '2x',
    '0x2',
    '2x0',
    '-2x2',
    '2x-2',
    'NaNx2',
    'Infinityx2',
    '2xx2',
    '2/2',
  ];

  for (const input of invalidInputs) {
    assert.equal(parseRectangleDimensions(input), null, `ukuran ${input || '(kosong)'} harus ditolak`);
  }
});

test('rectangle dari pusat mempertahankan pusat, ukuran, dan luas input', () => {
  const center = localToLatLng(75.25, -32.5, REF_LAT, REF_LNG);
  const rectangle = rectFromCenterDimensions(center, 2, 2, 83, REF_LAT, REF_LNG);
  const localCorners = toLocalPoly(rectangle.corners, REF_LAT, REF_LNG);
  const localCenter = toLocalPoly([center], REF_LAT, REF_LNG)[0];
  const averageX = localCorners.reduce((sum, point) => sum + point.x, 0) / localCorners.length;
  const averageY = localCorners.reduce((sum, point) => sum + point.y, 0) / localCorners.length;

  assert.equal(rectangle.corners.length, 4);
  assert.equal(
    new Set(rectangle.corners.map((point) => `${point.lat.toFixed(12)},${point.lng.toFixed(12)}`)).size,
    4,
    'rectangle harus memiliki empat sudut unik'
  );
  assertClose(rectangle.center.lat, center.lat, 1e-12, 'lintang pusat');
  assertClose(rectangle.center.lng, center.lng, 1e-12, 'bujur pusat');
  assertClose(averageX, localCenter.x, 1e-8, 'pusat lokal sumbu X');
  assertClose(averageY, localCenter.y, 1e-8, 'pusat lokal sumbu Y');
  assert.equal(rectangle.lengthM, 2);
  assert.equal(rectangle.widthM, 2);
  assert.equal(rectangle.areaSqm, 4);
  assertClose(actualArea(rectangle.corners), 4, 1e-6, 'luas geometri rectangle 2x2');
});

test('rectangle ukuran pasti mengikuti bearing fasilitas pada berbagai sudut', () => {
  const center = localToLatLng(-140.75, 63.125, REF_LAT, REF_LNG);
  const lengthM = 12.5;
  const widthM = 3.25;

  for (const bearingDeg of [0, 30, 45, 83, 137, 270, 353]) {
    const rectangle = rectFromCenterDimensions(
      center,
      lengthM,
      widthM,
      bearingDeg,
      REF_LAT,
      REF_LNG
    );
    const metrics = computePolygonMetrics(rectangle.corners, REF_LAT, REF_LNG);

    assert.equal(rectangle.lengthM, lengthM, `metadata panjang bearing ${bearingDeg}`);
    assert.equal(rectangle.widthM, widthM, `metadata lebar bearing ${bearingDeg}`);
    assert.equal(rectangle.areaSqm, lengthM * widthM, `metadata luas bearing ${bearingDeg}`);
    assertClose(actualArea(rectangle.corners), lengthM * widthM, 1e-5, `luas bearing ${bearingDeg}`);
    assertClose(metrics.lengthM, lengthM, 0.1, `panjang bearing ${bearingDeg}`);
    assertClose(metrics.widthM, widthM, 0.1, `lebar bearing ${bearingDeg}`);
    assert.ok(
      bearingAxisDelta(metrics.bearingDeg, bearingDeg) <= 1,
      `bearing hasil ${metrics.bearingDeg} harus mengikuti ${bearingDeg}`
    );
  }
});

test('slab concrete tetap persegi dan menutup fasilitas pada berbagai bearing', () => {
  for (const bearingDeg of [0, 30, 45, 90, 137, 270, 353]) {
    const polygon = rectanglePolygon(20, 10, bearingDeg);
    const facility = {
      code: `TEST-${bearingDeg}`,
      bearingDeg,
      lengthM: 20,
      widthM: 10,
      sampleLengthM: 20,
      sampleWidthM: 10,
      blockLengthM: 5,
      blockWidthM: 5,
    };

    const samples = generateFacilitySampleGrids(
      facility,
      20,
      10,
      REF_LAT,
      REF_LNG,
      polygon
    );
    const blocks = generateFacilityConcreteBlocks(facility, REF_LAT, REF_LNG, polygon);

    assert.equal(samples.length, 1, `bearing ${bearingDeg} harus menghasilkan satu sampel`);
    assert.equal(blocks.length, 8, `bearing ${bearingDeg} harus menghasilkan delapan slab`);

    let totalArea = 0;
    for (const block of blocks) {
      assert.equal(block.polygon.length, 4, `${block.blockCode} harus berupa quadrilateral`);
      assert.equal(
        new Set(block.polygon.map((point) => `${point.lat.toFixed(10)},${point.lng.toFixed(10)}`)).size,
        4,
        `${block.blockCode} tidak boleh memiliki vertex duplikat`
      );
      assert.ok(
        block.polygon.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
        `${block.blockCode} harus memiliki koordinat valid`
      );
      assert.ok(
        isPointInPolygon(block.centerLatLng, block.polygon),
        `pusat ${block.blockCode} harus berada di dalam slab`
      );

      const area = actualArea(block.polygon);
      assertClose(area, 25, 0.05, `luas geometri ${block.blockCode}`);
      assertClose(block.areaSqm, area, 0.11, `metadata luas ${block.blockCode}`);
      totalArea += area;
    }

    assertClose(totalArea, 200, 0.1, `total luas slab bearing ${bearingDeg}`);
  }

test('ukuran slab penuh persis sesuai settingan (tidak dibulatkan/terdistorsi), hanya slab terpotong (remainder) yang disesuaikan', () => {
  // polygon 22m x 22m dengan bearing 45 derajat
  const polygon = rectanglePolygon(22, 22, 45);
  const facility = {
    code: 'TEST-SLAB-EXACT',
    bearingDeg: 45,
    lengthM: 22,
    widthM: 22,
    sampleLengthM: 20,
    sampleWidthM: 20,
    blockLengthM: 6,
    blockWidthM: 6,
  };

  const blocks = generateFacilityConcreteBlocks(facility, REF_LAT, REF_LNG, polygon);
  
  // Dalam sampel 20x20m dengan block 6x6m:
  // Segment panjang: 6m, 6m, 6m, 2m (potongan/remainder terakhir)
  // Segment lebar: 6m, 6m, 6m, 2m (potongan/remainder terakhir)
  const sample1Blocks = blocks.filter(b => b.sampleCode === 'SAM-1');
  assert.ok(sample1Blocks.length > 0);

  const fullBlocks = sample1Blocks.filter(b => b.lengthM === 6 && b.widthM === 6);
  assert.ok(fullBlocks.length > 0, 'Harus ada slab berukuran penuh 6x6 sesuai settingan');

  // Cek bahwasanya slab penuh persis 6m x 6m dan luas 36 sqm
  for (const fb of fullBlocks) {
    assert.equal(fb.lengthM, 6, 'Panjang slab penuh harus persis 6m');
    assert.equal(fb.widthM, 6, 'Lebar slab penuh harus persis 6m');
    assert.equal(fb.areaSqm, 36, 'Luas slab penuh harus persis 36m2');
  }

  // Cek bahwa potongan/remainder tepi mempunyai ukuran yang disesuaikan (misal 2m)
  const remainderBlocks = sample1Blocks.filter(b => b.lengthM !== 6 || b.widthM !== 6);
  assert.ok(remainderBlocks.length > 0, 'Slab di tepi sampel yang terpotong harus memiliki ukuran yang disesuaikan');
});
});

test('arah slab REVERSE membalik posisi label per sampel tanpa mengubah geometri', () => {
  const polygon = rectanglePolygon(40, 20, 90);
  const facility = {
    code: 'FAC-SLAB-DIRECTION',
    bearingDeg: 90,
    lengthM: 40,
    widthM: 20,
    sampleLengthM: 20,
    sampleWidthM: 10,
    blockLengthM: 5,
    blockWidthM: 5,
  };

  const { forward } = assertReverseSlabDirection(facility, polygon, 'polygon sederhana');
  assert.equal(new Set(forward.map((block) => block.sampleCode)).size, 4);
});

test('arah slab REVERSE tetap konsisten pada polygon tidak beraturan yang terpotong', () => {
  const polygon = polygonFromLocalPoints([
    [-20, -10],
    [20, -10],
    [20, 10],
    [-10, 10],
    [-20, 0],
  ]);
  const facility = {
    code: 'FAC-SLAB-DIRECTION-CLIPPED',
    bearingDeg: 90,
    lengthM: 40,
    widthM: 20,
    sampleLengthM: 20,
    sampleWidthM: 20,
    blockLengthM: 5,
    blockWidthM: 5,
  };

  const { forward } = assertReverseSlabDirection(facility, polygon, 'polygon terpotong');
  assert.ok(
    forward.some((block) => block.polygon.length !== 4 || block.areaSqm < 25),
    'fixture harus benar-benar menguji slab hasil clipping'
  );
});

test('noise konversi koordinat tidak membuat baris atau kolom tambahan', () => {
  const polygon = rectanglePolygon(200, 60, 270);
  const facility = {
    code: 'FAC-EPSILON',
    bearingDeg: 270,
    lengthM: 200,
    widthM: 60,
    sampleLengthM: 20,
    sampleWidthM: 20,
    blockLengthM: 5,
    blockWidthM: 5,
  };

  const samples = generateFacilitySampleGrids(facility, 20, 20, REF_LAT, REF_LNG, polygon);
  const blocks = generateFacilityConcreteBlocks(facility, REF_LAT, REF_LNG, polygon);

  assert.equal(samples.length, 30);
  assert.equal(blocks.length, 480);
  assertClose(
    blocks.reduce((sum, block) => sum + actualArea(block.polygon), 0),
    actualArea(polygon),
    0.5,
    'slab harus menutup seluruh fasilitas'
  );
});

test('hanya sel terakhir yang menjadi remainder', () => {
  const polygon = rectanglePolygon(20.25, 10, 0);
  const facility = {
    code: 'FAC-REMAINDER',
    bearingDeg: 0,
    lengthM: 20.25,
    widthM: 10,
    sampleLengthM: 20,
    sampleWidthM: 10,
    blockLengthM: 5,
    blockWidthM: 5,
  };

  const samples = generateFacilitySampleGrids(facility, 20, 10, REF_LAT, REF_LNG, polygon);
  const sortedLengths = samples.map((sample) => sample.lengthM).sort((a, b) => a - b);

  assert.equal(samples.length, 2);
  assert.deepEqual(sortedLengths, [0.3, 20]);
  assertClose(
    samples.reduce((sum, sample) => sum + actualArea(sample.polygon), 0),
    actualArea(polygon),
    0.05,
    'remainder sampel tidak boleh meregangkan semua sampel'
  );
});

test('jalur polygon lebih dari empat vertex memakai komponen arah Y yang benar', () => {
  const rectangle = rectanglePolygon(50, 20, 0);
  const midpoint = {
    lat: (rectangle[0].lat + rectangle[1].lat) / 2,
    lng: (rectangle[0].lng + rectangle[1].lng) / 2,
  };
  const polygon = [rectangle[0], midpoint, rectangle[1], rectangle[2], rectangle[3]];
  const facility = {
    code: 'FAC-FIVE-POINTS',
    bearingDeg: 0,
    lengthM: 50,
    widthM: 20,
    sampleLengthM: 20,
    sampleWidthM: 20,
  };

  const samples = generateFacilitySampleGrids(facility, 20, 20, REF_LAT, REF_LNG, polygon);

  assert.equal(samples.length, 3);
  assertClose(
    samples.reduce((sum, sample) => sum + actualArea(sample.polygon), 0),
    actualArea(polygon),
    0.1,
    'grid sampel fallback harus menutup polygon'
  );
  assert.ok(samples.every((sample) => actualArea(sample.polygon) > 0));
});

test('urutan & posisi slab Dashboard (snapped) identik dengan Admin (resize lalu generate)', () => {
  // Polygon dengan "noise" digitasi di setiap vertex — simulasi hasil gambar manual.
  const clean = rectanglePolygon(180, 70, 353);
  const noisy = clean.map((point, i) => ({
    lat: point.lat + (i % 2 ? 0.00002 : -0.000015),
    lng: point.lng + (i < 2 ? 0.000013 : -0.000011),
  }));
  const facility = {
    code: 'APRON-2',
    bearingDeg: 353,
    lengthM: 180,
    widthM: 70,
    sampleLengthM: 20,
    sampleWidthM: 20,
    blockLengthM: 5,
    blockWidthM: 5,
    slabDirection: 'FORWARD',
  };

  // Admin: resize polygon ke settingan lalu generate dengan arp undefined
  const adminPoly = resizePolygonToDimensions(noisy, facility.lengthM, facility.widthM, facility.bearingDeg);
  const adminBlocks = generateFacilityConcreteBlocks(facility, undefined, undefined, adminPoly);

  // Dashboard: helper snapped (resize diterapkan internal)
  const dashBlocks = generateFacilityConcreteBlocksSnapped(facility, noisy);

  assert.equal(dashBlocks.length, adminBlocks.length, 'jumlah slab harus sama');
  assert.deepEqual(
    dashBlocks.map((b) => b.blockCode),
    adminBlocks.map((b) => b.blockCode),
    'urutan blockCode harus sama persis (Slab A/B/C di posisi yang sama)'
  );

  // Geometri pusat slab harus cocok (toleransi kecil proyeksi WGS84)
  adminBlocks.forEach((adminBlock, index) => {
    const dashBlock = dashBlocks[index];
    assertClose(dashBlock.centerLatLng.lat, adminBlock.centerLatLng.lat, 1e-6, `pusat lat slab ${adminBlock.blockCode}`);
    assertClose(dashBlock.centerLatLng.lng, adminBlock.centerLatLng.lng, 1e-6, `pusat lng slab ${adminBlock.blockCode}`);
  });

  // Tanpa snapping, urutan slab polygon noise menyimpang — sehingga fixture benar-benar menguji
  const rawBlocks = generateFacilityConcreteBlocks(facility, REF_LAT, REF_LNG, noisy);
  assert.notDeepEqual(
    rawBlocks.map((b) => b.blockCode),
    adminBlocks.map((b) => b.blockCode),
    'fixture harus menghasilkan urutan berbeda bila polygon tidak di-snap'
  );
});

test('resize polygon mengikuti konvensi bearing searah jarum jam dari utara', () => {
  for (const bearingDeg of [0, 30, 45, 90, 137, 173]) {
    const source = rectanglePolygon(20, 10, 0);
    const resized = resizePolygonToDimensions(source, 40, 15, bearingDeg);
    const metrics = computePolygonMetrics(resized, REF_LAT, REF_LNG);
    const bearingDelta = Math.abs(metrics.bearingDeg - bearingDeg);

    assertClose(metrics.lengthM, 40, 0.1, `panjang hasil resize bearing ${bearingDeg}`);
    assertClose(metrics.widthM, 15, 0.1, `lebar hasil resize bearing ${bearingDeg}`);
    assertClose(metrics.areaSqm, 600, 0.1, `luas hasil resize bearing ${bearingDeg}`);
    assert.ok(
      Math.min(bearingDelta, 180 - bearingDelta) <= 1,
      `bearing hasil resize ${metrics.bearingDeg} harus mengikuti ${bearingDeg}`
    );
  }
});
