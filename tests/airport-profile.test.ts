import assert from 'node:assert/strict';
import test from 'node:test';
import { AIRPORT_PROFILE_KEYS, airportProfile, parseAirportCoordinates } from '../src/lib/airport-profile';

test('profil bandara lama tanpa metadata tetap dapat ditampilkan', () => {
  assert.deepEqual(airportProfile({ id: 'A', name: 'Bandara A', configs: [] }), {
    id: 'A', name: 'Bandara A', location: '', manager: '', description: '',
  });
});

test('metadata bandara diambil dari konfigurasi bandara sendiri', () => {
  const profile = airportProfile({ id: 'B', configs: [
    { key: AIRPORT_PROFILE_KEYS.location, value: 'Tanjung Pinang' },
    { key: AIRPORT_PROFILE_KEYS.manager, value: 'UPBU' },
    { key: AIRPORT_PROFILE_KEYS.description, value: 'Operasional' },
  ] });
  assert.equal(profile.location, 'Tanjung Pinang');
  assert.equal(profile.manager, 'UPBU');
  assert.equal(profile.description, 'Operasional');
});

test('ARP menolak koordinat kosong atau di luar rentang', () => {
  assert.deepEqual(parseAirportCoordinates('0.9569', '104.5311'), { refLat: 0.9569, refLng: 104.5311 });
  assert.equal(parseAirportCoordinates('', '104'), null);
  assert.equal(parseAirportCoordinates(' ', '104'), null);
  assert.equal(parseAirportCoordinates('91', '104'), null);
  assert.equal(parseAirportCoordinates('0', '181'), null);
});
