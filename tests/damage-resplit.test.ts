import assert from 'node:assert/strict';
import test from 'node:test';
import type { Facility } from '@prisma/client';
import {
  planFacilityDamageResplit,
  type DamageForResplit,
  type FacilityDamageResplitPlan,
} from '../src/lib/damage-resplit';
import {
  calculateFacilityStation,
  findConcreteBlockForPoint,
  generateFacilityConcreteBlocksSnapped,
  localToLatLng,
  splitDamageByStation,
  splitDamageBySampleGrids,
  splitPolylineBySampleGrids,
  splitPolylineByStation,
  type LatLng,
} from '../src/lib/geo';

const arpLat = 0.9569;
const arpLng = 104.5311;
const originalDate = new Date('2025-01-01T00:00:00.000Z');

function rectangle(xMin: number, xMax: number, yMin: number, yMax: number): LatLng[] {
  return [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]]
    .map(([x, y]) => localToLatLng(x, y, arpLat, arpLng));
}

function facility(intervalM: number) {
  return {
    id: 'facility-1', code: 'RWY',
    polygonJson: JSON.stringify(rectangle(-10, 10, -50, 50)),
    centroidLat: arpLat, centroidLng: arpLng,
    bearingDeg: 0, lengthM: 100, widthM: 20,
    stationDirection: 'FORWARD', stationIntervalM: intervalM,
    locationMode: 'STA', surfaceType: 'ASPHALT',
    sampleLengthM: 20, sampleWidthM: 20,
    blockLengthM: null, blockWidthM: null, slabDirection: 'FORWARD',
  } satisfies Pick<Facility,
    'id' | 'code' | 'polygonJson' | 'centroidLat' | 'centroidLng'
    | 'bearingDeg' | 'lengthM' | 'widthM' | 'stationDirection' | 'stationIntervalM'
    | 'locationMode' | 'surfaceType' | 'sampleLengthM' | 'sampleWidthM'
    | 'blockLengthM' | 'blockWidthM' | 'slabDirection'
  >;
}

function sourceRows(intervalM: number): DamageForResplit[] {
  const polygon = rectangle(-1, 1, -30, 30); // cakupan asli STA 20–80 m
  const parts = splitDamageByStation(facility(intervalM), polygon, arpLat, arpLng);
  return parts.map((part, index) => ({
    id: `damage-${index + 1}`,
    groupId: 'finding-1',
    facilityId: 'facility-1',
    station: part.subSegmentCode,
    sampleCode: null,
    type: 'Retak', severity: 'M', status: 'IN_PROGRESS',
    lat: part.lat, lng: part.lng, localX: part.localX, localY: part.localY,
    rectJson: JSON.stringify(polygon),
    lengthM: part.lengthM, widthM: part.widthM, areaSqm: part.areaSqm,
    geometryType: 'POLYGON', count: null,
    photoUrl: '/uploads/temuan.jpg',
    remarks: `Catatan lapangan (Terpotong STA ${part.stationText})`,
    reportedBy: 'Petugas', createdAt: originalDate,
  }));
}

function applyPlan(rows: DamageForResplit[], plan: FacilityDamageResplitPlan): DamageForResplit[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of plan.deleteIds) byId.delete(id);
  for (const update of plan.updates) {
    byId.set(update.id, { ...byId.get(update.id)!, ...update.data });
  }
  plan.creates.forEach((created, index) => {
    byId.set(`new-${index}`, { id: `new-${index}`, ...created });
  });
  return [...byId.values()];
}

test('10 → 50 → 10 m membagi ulang geometri asal tanpa memperluas cakupan atau luas', () => {
  const oldRows = sourceRows(10);
  assert.equal(oldRows.length, 6);
  const areaBefore = oldRows.reduce((sum, row) => sum + row.areaSqm, 0);

  const enlarged = planFacilityDamageResplit(facility(50), oldRows, arpLat, arpLng);
  assert.equal(enlarged.skipped.length, 0);
  assert.equal(enlarged.updatedFindings, 1);
  const mergedRows = applyPlan(oldRows, enlarged);
  assert.equal(mergedRows.length, 2);
  assert.deepEqual(mergedRows.map((row) => row.station), [
    'RWY [STA 0+000-STA 0+050]',
    'RWY [STA 0+050-STA 0+100]',
  ]);
  assert.ok(Math.abs(mergedRows.reduce((sum, row) => sum + row.areaSqm, 0) - areaBefore) < 1e-8);

  const narrowed = planFacilityDamageResplit(facility(10), mergedRows, arpLat, arpLng);
  const restoredRows = applyPlan(mergedRows, narrowed);
  assert.equal(restoredRows.length, 6);
  assert.deepEqual(restoredRows.map((row) => row.station).sort(), oldRows.map((row) => row.station).sort());
  assert.ok(Math.abs(restoredRows.reduce((sum, row) => sum + row.areaSqm, 0) - areaBefore) < 1e-8);
  assert.ok(restoredRows.every((row) => row.groupId === 'finding-1'
    && row.status === 'IN_PROGRESS'
    && row.photoUrl === '/uploads/temuan.jpg'
    && row.remarks?.startsWith('Catatan lapangan (Terpotong STA ')));
  assert.ok(restoredRows.every((row) => calculateFacilityStation(
    facility(10), { lat: row.lat, lng: row.lng }, arpLat, arpLng
  )?.subSegmentCode === row.station));
});

test('temuan tunggal tanpa grup menjadi grup saat interval diperkecil', () => {
  const one = sourceRows(100)[0];
  one.groupId = null;
  const plan = planFacilityDamageResplit(facility(25), [one], arpLat, arpLng);
  assert.equal(plan.creates.length, 3);
  assert.equal(plan.updates[0].id, one.id);
  assert.equal(plan.updates[0].data.groupId, one.id);
});

test('geometri berbeda atau metadata potongan berbeda dilewati tanpa mutasi', () => {
  const rows = sourceRows(50);
  rows[1].status = 'CLOSED';
  const conflictingMetadata = planFacilityDamageResplit(facility(10), rows, arpLat, arpLng);
  assert.equal(conflictingMetadata.skipped[0].reason, 'metadata_conflict');
  assert.equal(conflictingMetadata.updates.length, 0);

  rows[1].status = rows[0].status;
  rows[1].rectJson = JSON.stringify(rectangle(-1, 1, -25, 30));
  const conflictingGeometry = planFacilityDamageResplit(facility(10), rows, arpLat, arpLng);
  assert.equal(conflictingGeometry.skipped[0].reason, 'geometry_conflict');
  assert.equal(conflictingGeometry.deleteIds.length, 0);
});

test('temuan titik tanpa poligon hanya dipindah label, tidak dikloning', () => {
  const point = sourceRows(100)[0];
  point.groupId = null;
  point.rectJson = null;
  const plan = planFacilityDamageResplit(facility(10), [point], arpLat, arpLng);
  assert.equal(plan.pointOnlyFindings, 1);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].data.areaSqm, undefined);
});

test('poligon dengan luas nol tidak menghasilkan pecahan atau mengubah data lama', () => {
  const row = sourceRows(100)[0];
  row.rectJson = JSON.stringify(rectangle(-1, 1, 0, 0));
  const plan = planFacilityDamageResplit(facility(10), [row], arpLat, arpLng);
  assert.equal(plan.skipped[0].reason, 'geometry_missing');
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.deleteIds.length, 0);
});

test('koordinat setiap pecahan juga berada di STA yang benar saat arah dibalik', () => {
  const reversed = { ...facility(10), stationDirection: 'REVERSE' };
  const parts = splitDamageByStation(reversed, rectangle(-1, 1, -30, 30), arpLat, arpLng);
  assert.equal(parts.length, 6);
  assert.ok(parts.every((part) => calculateFacilityStation(
    reversed, { lat: part.lat, lng: part.lng }, arpLat, arpLng
  )?.subSegmentCode === part.subSegmentCode));
  assert.equal(new Set(parts.map((part) => `${part.localX},${part.localY}`)).size, parts.length);
});

test('garis m lari tetap terukur saat interval STA diubah dari 10 ke 50 dan kembali', () => {
  const line = [[0, -30], [0, 30]].map(([x, y]) => localToLatLng(x, y, arpLat, arpLng));
  const oldRows: DamageForResplit[] = splitPolylineByStation(facility(10), line, arpLat, arpLng)
    .map((part, index) => ({
      ...sourceRows(100)[0],
      id: `line-${index}`,
      groupId: 'line-finding',
      station: part.subSegmentCode,
      lat: part.lat, lng: part.lng, localX: part.localX, localY: part.localY,
      rectJson: JSON.stringify(line), lengthM: part.lengthM, widthM: 0,
      areaSqm: 0, geometryType: 'LINE', count: null,
      remarks: 'Retak memanjang',
    }));
  assert.equal(oldRows.length, 6);
  const enlarged = planFacilityDamageResplit(facility(50), oldRows, arpLat, arpLng);
  assert.equal(enlarged.skipped.length, 0);
  const merged = applyPlan(oldRows, enlarged);
  assert.equal(merged.length, 2);
  assert.ok(Math.abs(merged.reduce((sum, row) => sum + (row.lengthM ?? 0), 0) - 60) < 1e-5);
  assert.ok(merged.every((row) => row.areaSqm === 0 && row.geometryType === 'LINE'));
  const restored = applyPlan(merged, planFacilityDamageResplit(facility(10), merged, arpLat, arpLng));
  assert.equal(restored.length, 6);
  assert.ok(Math.abs(restored.reduce((sum, row) => sum + (row.lengthM ?? 0), 0) - 60) < 1e-5);
});

test('garis di SAM mengikuti perubahan ukuran grid tanpa mengubah panjang total', () => {
  const smallGrid = { ...facility(10), locationMode: 'SAM', sampleLengthM: 100, sampleWidthM: 10 };
  const wideGrid = { ...smallGrid, sampleWidthM: 20 };
  const line = [[-8, 0], [8, 0]].map(([x, y]) => localToLatLng(x, y, arpLat, arpLng));
  const oldRows: DamageForResplit[] = splitPolylineBySampleGrids(smallGrid, line, arpLat, arpLng)
    .map((part, index) => ({
      ...sourceRows(100)[0],
      id: `sam-line-${index}`, groupId: 'sam-finding',
      station: part.sampleCode ?? null, sampleCode: part.sampleCode ?? null,
      lat: part.lat, lng: part.lng, localX: part.localX, localY: part.localY,
      rectJson: JSON.stringify(line), lengthM: part.lengthM, widthM: 0,
      areaSqm: 0, geometryType: 'LINE', count: null,
      remarks: `Terpotong Sampel ${part.stationText}`,
    }));
  assert.equal(oldRows.length, 2);
  const plan = planFacilityDamageResplit(wideGrid, oldRows, arpLat, arpLng);
  assert.equal(plan.skipped.length, 0);
  const updated = applyPlan(oldRows, plan);
  assert.equal(updated.length, 1);
  assert.ok(Math.abs((updated[0].lengthM ?? 0) - 16) < 1e-5);
  assert.ok(updated[0].sampleCode?.startsWith('SAM-'));
});

test('kejadian titik tetap count=1 dan hanya label STA yang diperbarui', () => {
  const row: DamageForResplit = {
    ...sourceRows(100)[0],
    id: 'point-1', groupId: null,
    lat: localToLatLng(0, -25, arpLat, arpLng).lat,
    lng: localToLatLng(0, -25, arpLat, arpLng).lng,
    rectJson: JSON.stringify([localToLatLng(0, -25, arpLat, arpLng)]),
    areaSqm: 0, lengthM: 0, widthM: 0, geometryType: 'POINT', count: 1,
  };
  const plan = planFacilityDamageResplit(facility(10), [row], arpLat, arpLng);
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.updates[0].data.count, undefined);
  assert.equal(plan.updates[0].data.station, 'RWY [STA 0+020-STA 0+030]');
});

test('poligon SAM dipetakan ulang saat ukuran sampel diubah', () => {
  const smallGrid = { ...facility(10), locationMode: 'SAM', sampleLengthM: 100, sampleWidthM: 10 };
  const wideGrid = { ...smallGrid, sampleWidthM: 20 };
  const polygon = rectangle(-8, 8, -2, 2);
  const rows: DamageForResplit[] = splitDamageBySampleGrids(smallGrid, polygon, arpLat, arpLng)
    .map((part, index) => ({
      ...sourceRows(100)[0], id: `sam-area-${index}`, groupId: 'sam-area-finding',
      station: part.sampleCode ?? null, sampleCode: part.sampleCode ?? null,
      lat: part.lat, lng: part.lng, localX: part.localX, localY: part.localY,
      rectJson: JSON.stringify(polygon), lengthM: part.lengthM, widthM: part.widthM,
      areaSqm: part.areaSqm, remarks: `Terpotong Sampel ${part.stationText}`,
    }));
  assert.equal(rows.length, 2);
  const areaBefore = rows.reduce((sum, row) => sum + row.areaSqm, 0);
  const plan = planFacilityDamageResplit(wideGrid, rows, arpLat, arpLng);
  assert.equal(plan.skipped.length, 0);
  const updated = applyPlan(rows, plan);
  assert.equal(updated.length, 1);
  assert.ok(Math.abs(updated[0].areaSqm - areaBefore) < 1e-8);
});

test('temuan satu slab count=1 mengikuti label blok setelah arah slab dibalik', () => {
  const forward = {
    ...facility(10), locationMode: 'SAM', surfaceType: 'CONCRETE',
    sampleLengthM: 20, sampleWidthM: 20, blockLengthM: 10, blockWidthM: 10,
    slabDirection: 'FORWARD',
  };
  const reverse = { ...forward, slabDirection: 'REVERSE' };
  const position = localToLatLng(-5, -45, arpLat, arpLng);
  const oldBlock = findConcreteBlockForPoint(position.lat, position.lng,
    generateFacilityConcreteBlocksSnapped(forward, rectangle(-10, 10, -50, 50)));
  const newBlock = findConcreteBlockForPoint(position.lat, position.lng,
    generateFacilityConcreteBlocksSnapped(reverse, rectangle(-10, 10, -50, 50)));
  assert.ok(oldBlock && newBlock);
  const row: DamageForResplit = {
    ...sourceRows(100)[0], id: 'slab-1', groupId: null,
    station: oldBlock.blockCode, sampleCode: oldBlock.blockCode,
    lat: position.lat, lng: position.lng, rectJson: JSON.stringify(oldBlock.polygon),
    geometryType: 'SLAB', count: 1, areaSqm: 0, lengthM: 0, widthM: 0,
  };
  const plan = planFacilityDamageResplit(reverse, [row], arpLat, arpLng);
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.updates[0].data.sampleCode, newBlock.blockCode);
  assert.equal(plan.updates[0].data.count, undefined);
  assert.equal(plan.creates.length, 0);
});
