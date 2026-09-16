import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppConfig, Damage, Facility, PciSection } from '../src/types';
import { defaultCdvCurveSet } from '../src/lib/cdv';
import { defaultDvCurveSet } from '../src/lib/dv';
import { calculateFacilityPciAverage, latestPciForFacilities } from '../src/lib/pci-facility-average';

const facility = {
  id: 'facility-1', code: 'RWY', name: 'Runway', type: 'RUNWAY',
  surfaceType: 'ASPHALT', lengthM: 20, widthM: 10, areaSqm: 200,
  stationIntervalM: 10, locationMode: 'STA', polygonJson: null,
  pciCorrection: 85,
} as Facility;
const config = { arpLat: 0.9569, arpLng: 104.5311, airportName: 'Airside', mapRotationDeg: 0 } as AppConfig;
const curves = { ASPHALT: { cdv: defaultCdvCurveSet('ASPHALT'), dv: defaultDvCurveSet('ASPHALT') } };

test('rata-rata PCI fasilitas memakai PCI koreksi untuk lokasi tanpa kerusakan', () => {
  assert.equal(calculateFacilityPciAverage(facility, [], config, curves), 85);
});

test('rata-rata PCI fasilitas memakai perhitungan STA yang sama dengan halaman PCI', () => {
  const damage = {
    id: 'damage-1', facilityId: facility.id, station: 'STA 0+000 s/d STA 0+010',
    sampleCode: null, type: 'Alligator Cracking (Retak Buaya)', severity: 'M',
    lat: config.arpLat, lng: config.arpLng, areaSqm: 10, status: 'OPEN',
  } as Damage;
  const average = calculateFacilityPciAverage(facility, [damage], config, curves);
  assert.ok(average != null && average < 85);
  assert.ok(average > 0);
});

test('fasilitas tanpa STA atau kurva valid belum menampilkan nilai PCI', () => {
  assert.equal(calculateFacilityPciAverage({ ...facility, lengthM: 0 }, [], config, curves), null);
  assert.equal(calculateFacilityPciAverage(facility, [], config, {}), null);
});

test('hasil survei terbaru diprioritaskan dan fasilitas lain memakai PCI perhitungan', () => {
  const apron = { ...facility, id: 'facility-2', code: 'APRON' };
  const sections = [
    { facilityId: facility.id, lastPci: 77, lastSurveyAt: '2026-09-01' },
    { facilityId: facility.id, lastPci: 72, lastSurveyAt: '2026-08-01' },
  ] as PciSection[];
  assert.deepEqual(
    latestPciForFacilities([facility, apron], sections, { [facility.id]: 85, [apron.id]: 91 }),
    { [facility.id]: 77, [apron.id]: 91 },
  );
});
