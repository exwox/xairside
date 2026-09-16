import assert from 'node:assert/strict';
import test from 'node:test';
import { damagePopupPhotoUrls } from '../src/lib/damage-popup-photos';

test('popup tanpa foto tidak menampilkan galeri', () => {
  assert.deepEqual(damagePopupPhotoUrls([{ photoUrl: null }, {}]), []);
});

test('foto yang sama pada beberapa pecahan STA/SAM hanya muncul sekali', () => {
  assert.deepEqual(damagePopupPhotoUrls([
    { photoUrl: '/uploads/damages/satu.jpg' },
    { photoUrl: ' /uploads/damages/satu.jpg ' },
    { photoUrl: '/uploads/damages/dua.jpg' },
  ]), ['/uploads/damages/satu.jpg', '/uploads/damages/dua.jpg']);
});

test('URL non-HTTP dan protocol-relative tidak dapat menjadi tautan foto popup', () => {
  assert.deepEqual(damagePopupPhotoUrls([
    { photoUrl: 'javascript:alert(1)' },
    { photoUrl: 'data:image/svg+xml,<svg></svg>' },
    { photoUrl: '//example.com/photo.jpg' },
    { photoUrl: '/\\example.com/photo.jpg' },
    { photoUrl: 'https://example.com/photo.jpg' },
  ]), ['https://example.com/photo.jpg']);
});
