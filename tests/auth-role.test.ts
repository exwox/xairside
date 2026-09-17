import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, isApiActionAllowed, verifyPassword } from '../src/lib/auth';

test('role API: viewer hanya dapat membaca sumber dashboard', () => {
  assert.equal(isApiActionAllowed('VIEWER', '/api/damages', 'GET'), true);
  assert.equal(isApiActionAllowed('VIEWER', '/api/damages', 'POST'), false);
  assert.equal(isApiActionAllowed('VIEWER', '/api/inspections', 'GET'), false);
  assert.equal(isApiActionAllowed('VIEWER', '/api/config', 'PUT'), false);
});

test('role API: user tidak dapat mengelola akun atau menyetujui inspeksi', () => {
  assert.equal(isApiActionAllowed('USER', '/api/users', 'GET'), false);
  assert.equal(isApiActionAllowed('USER', '/api/inspections/abc/approve', 'POST'), false);
  assert.equal(isApiActionAllowed('USER', '/api/damages', 'POST'), true);
  assert.equal(isApiActionAllowed('ADMIN', '/api/inspections/abc/approve', 'POST'), true);
  assert.equal(isApiActionAllowed('ADMIN', '/api/airports', 'POST'), false);
});

test('login menolak sandi yang tidak berupa hash sah', () => {
  const stored = hashPassword('contoh-sandi-panjang');
  assert.equal(verifyPassword('contoh-sandi-panjang', stored), true);
  assert.equal(verifyPassword('salah', stored), false);
  assert.equal(verifyPassword('password123', 'password123'), false);
});
