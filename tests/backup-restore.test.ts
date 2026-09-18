import assert from 'node:assert/strict';
import test from 'node:test';
import {
  airportBackupEntries,
  collectPhotoUrls,
  isBackupType,
  isUniqueViolation,
  normalizeMergeMode,
  parseBackupMetadata,
  parseDataCount,
  toDate,
  toNullableNumber,
  toNumber,
  toText,
} from '../src/lib/backup-restore';

test('parseDataCount membaca dataCount tersimpan sebagai string JSON', () => {
  // Regresi: backupLog.dataCount disimpan sebagai string, dulu tampil 0 di riwayat.
  const stored = JSON.stringify({ inspections: 12, damages: 34, markings: 5, pciSurveys: 2, facilities: 3, mapLayers: 1 });
  const count = parseDataCount(stored);
  assert.equal(count.inspections, 12);
  assert.equal(count.damages, 34);
  assert.equal(count.markings, 5);
  assert.equal(count.pciSurveys, 2);
  assert.equal(count.facilities, 3);
  assert.equal(count.mapLayers, 1);
});

test('parseDataCount aman untuk nilai kosong dan rusak', () => {
  for (const value of [null, undefined, '', '{bukan json', 42, []]) {
    const count = parseDataCount(value);
    assert.equal(count.inspections, 0);
    assert.equal(count.damages, 0);
    assert.equal(count.airports, undefined);
  }
  const withSystem = parseDataCount({ airports: 4, users: 7 });
  assert.equal(withSystem.airports, 4);
  assert.equal(withSystem.users, 7);
});

test('parseBackupMetadata menerima string JSON dan menolak metadata tanpa tipe sah', () => {
  const metadata = parseBackupMetadata(JSON.stringify({
    version: '1.0', timestamp: '2026-09-17T09:24:00.061Z', backupType: 'AIRPORT',
    airportId: 'a1', airportCode: 'RHF', includePhotos: true, format: 'SQL',
    photoCount: 3, missingPhotos: 1, dataCount: { inspections: 2 },
  }));
  assert.ok(metadata);
  assert.equal(metadata.backupType, 'AIRPORT');
  assert.equal(metadata.airportCode, 'RHF');
  assert.equal(metadata.format, 'SQL');
  assert.equal(metadata.photoCount, 3);
  assert.equal(metadata.dataCount.inspections, 2);

  assert.equal(parseBackupMetadata('bukan json'), null);
  assert.equal(parseBackupMetadata({ backupType: 'LUAR_BIASA' }), null);
  assert.equal(parseBackupMetadata({}), null);
});

test('airportBackupEntries menyamakan bentuk payload AIRPORT dan FULL_SYSTEM', () => {
  const airportPayload = {
    airport: { id: 'a1', code: 'RHF' },
    facilities: [{ id: 'f1' }],
    inspections: [{ id: 'i1' }],
  };
  const single = airportBackupEntries(airportPayload, 'AIRPORT');
  assert.equal(single.length, 1);
  assert.equal(single[0].airport?.code, 'RHF');
  assert.equal(single[0].payload.facilities, airportPayload.facilities);

  // Regresi: dulu FULL_SYSTEM menghasilkan 0 data karena hanya AIRPORT yang ditangani.
  const full = airportBackupEntries({
    airports: [
      { id: 'a1', code: 'RHF', facilities: [{ id: 'f1' }] },
      { id: 'a2', code: 'YIA', facilities: [] },
    ],
    masterUsers: [{ id: 'u1' }],
  }, 'FULL_SYSTEM');
  assert.equal(full.length, 2);
  assert.equal(full[0].airport?.code, 'RHF');
  assert.equal(Array.isArray(full[0].payload.facilities) ? full[0].payload.facilities.length : -1, 1);
  assert.equal(full[1].airport?.code, 'YIA');
  assert.deepEqual(airportBackupEntries({ airports: 'rusak' }, 'FULL_SYSTEM'), []);
});

test('collectPhotoUrls mengumpulkan foto kerusakan, marka, dan detail inspeksi', () => {
  const urls = collectPhotoUrls({
    airport: { id: 'a1' },
    damages: [{ photoUrl: '/uploads/damages/a.jpg' }, { photoUrl: null }, { photoUrl: 'https://luar/x.jpg' }],
    markings: [{ photoUrl: '/uploads/damages/b.png' }],
    inspections: [{ details: [{ photoUrl: '/uploads/damages/a.jpg' }, { photoUrl: '/uploads/damages/c.webp' }] }],
  }, 'AIRPORT');
  assert.deepEqual(urls.sort(), ['/uploads/damages/a.jpg', '/uploads/damages/b.png', '/uploads/damages/c.webp']);
  assert.deepEqual(collectPhotoUrls({}, 'AIRPORT'), []);
});

test('collectPhotoUrls menelusuri setiap bandara pada backup full system', () => {
  const urls = collectPhotoUrls({
    airports: [
      { id: 'a1', damages: [{ photoUrl: '/uploads/damages/1.jpg' }] },
      { id: 'a2', markings: [{ photoUrl: '/uploads/damages/2.jpg' }] },
    ],
    masterUsers: [],
  }, 'FULL_SYSTEM');
  assert.deepEqual(urls.sort(), ['/uploads/damages/1.jpg', '/uploads/damages/2.jpg']);
});

test('normalizeMergeMode default REPLACE dan hanya MERGE yang mengubahnya', () => {
  assert.equal(normalizeMergeMode('MERGE'), 'MERGE');
  assert.equal(normalizeMergeMode(' merge '), 'MERGE');
  assert.equal(normalizeMergeMode('REPLACE'), 'REPLACE');
  assert.equal(normalizeMergeMode(undefined), 'REPLACE');
  assert.equal(normalizeMergeMode(123), 'REPLACE');
});

test('isBackupType hanya menerima AIRPORT dan FULL_SYSTEM', () => {
  assert.equal(isBackupType('AIRPORT'), true);
  assert.equal(isBackupType('FULL_SYSTEM'), true);
  assert.equal(isBackupType('SQL'), false);
  assert.equal(isBackupType(null), false);
});

test('isUniqueViolation mengenali kode Prisma P2002', () => {
  assert.equal(isUniqueViolation({ code: 'P2002' }), true);
  assert.equal(isUniqueViolation({ code: 'P2003' }), false);
  assert.equal(isUniqueViolation(new Error('gagal')), false);
  assert.equal(isUniqueViolation(null), false);
});

test('konversi nilai mentah dari data.json tetap aman', () => {
  assert.equal(toText('  RHF  '), 'RHF');
  assert.equal(toText('   '), undefined);
  assert.equal(toText(null), undefined);
  assert.equal(toNumber('12.5', 0), 12.5);
  assert.equal(toNumber('abc', 7), 7);
  assert.equal(toNullableNumber(''), null);
  assert.equal(toNullableNumber('3'), 3);
  assert.equal(toNullableNumber(undefined), null);
  assert.equal(toDate('2026-09-17T09:24:00.061Z')?.toISOString(), '2026-09-17T09:24:00.061Z');
  assert.equal(toDate('bukan tanggal'), null);
  assert.equal(toDate(undefined), null);
});
