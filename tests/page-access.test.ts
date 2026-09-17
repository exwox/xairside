import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRoleUsePage, isPageAllowed, normalizeRolePageAccess, pageForApiRequest, pageKeyForPath,
} from '../src/lib/page-access';

test('hak dasar role tidak dapat dinaikkan dari pengaturan halaman', () => {
  const access = normalizeRolePageAccess({
    VIEWER: { admin: true, users: true, inspections: true },
    USER: { airports: true, admin: true },
    SUPADMIN: { dashboard: false, admin: false },
  });
  assert.equal(access.VIEWER.dashboard, true);
  assert.equal(access.VIEWER.inspections, false);
  assert.equal(access.USER.airports, false);
  assert.equal(access.SUPADMIN.admin, true);
  assert.equal(canRoleUsePage('ADMIN', 'airports'), false);
});

test('halaman turunan Admin tertutup bersama Admin Panel', () => {
  const access = normalizeRolePageAccess({ ADMIN: { admin: false, users: true, dvFlexible: true } });
  assert.equal(isPageAllowed(access, 'ADMIN', 'admin'), false);
  assert.equal(isPageAllowed(access, 'ADMIN', 'users'), false);
  assert.equal(isPageAllowed(access, 'ADMIN', 'dvFlexible'), false);
});

test('rute halaman dan mutasi API memakai kategori akses yang sama', () => {
  assert.equal(pageKeyForPath('/admin/users'), 'users');
  assert.equal(pageKeyForPath('/admin/kurva-cdv-rigit'), 'cdvRigid');
  assert.equal(pageKeyForPath('/inspeksi'), 'inspections');
  assert.equal(pageForApiRequest('/api/inspections/123', 'GET'), 'inspections');
  assert.equal(pageForApiRequest('/api/damages/123', 'PATCH'), 'damages');
  assert.equal(pageForApiRequest('/api/damages', 'GET'), null); // dipakai Dashboard
});
