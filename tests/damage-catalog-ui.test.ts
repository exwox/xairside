import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DamageDetailModal from '../src/components/DamageDetailModal';
import { defaultSurfaceDamageCatalog } from '../src/lib/damage-catalog';
import type { Damage, Facility } from '../src/types';

test('detail kerusakan menampilkan nama dan kode terbaru dari katalog DV sesuai perkerasan', () => {
  const facility = {
    id: 'runway-1', code: 'RWY', name: 'Runway', type: 'RUNWAY', surfaceType: 'ASPHALT',
  } as Facility;
  const damage = {
    id: 'damage-1', facilityId: facility.id, type: 'Alligator Cracking (Retak Buaya)',
    severity: 'M', status: 'OPEN', areaSqm: 2, lat: 0, lng: 0, localX: 0, localY: 0,
    station: 'STA 0+000', sampleCode: null, lengthM: null, widthM: null,
    photoUrl: null, rectJson: null, remarks: null,
  } as Damage;
  const asphalt = defaultSurfaceDamageCatalog('ASPHALT').map((entry) => entry.pciCode === 1
    ? { ...entry, code: 'F-01', name: 'Retak Kulit Buaya Baru', aliases: [...entry.aliases, entry.name] }
    : entry);
  const html = renderToStaticMarkup(React.createElement(DamageDetailModal, {
    open: true, onClose: () => {}, damage, allDamages: [damage], facilities: [facility],
    damageCatalogs: { ASPHALT: asphalt, JPCP: defaultSurfaceDamageCatalog('JPCP') },
  }));

  assert.match(html, /Retak Kulit Buaya Baru/);
  assert.match(html, /F-01/);
  assert.doesNotMatch(html, /Alligator Cracking \(Retak Buaya\)/);
});
