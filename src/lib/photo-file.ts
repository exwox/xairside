import { unlink } from 'node:fs/promises';
import path from 'node:path';

const UPLOAD_RELATIVE = path.join('public', 'uploads', 'damages');

/**
 * Hapus satu file foto kerusakan dari disk.
 * Aman dipanggil dengan URL null / tidak valid — langsung no-op.
 */
export async function deleteDamagePhotoFile(url?: string | null): Promise<void> {
  if (!url || !url.startsWith('/uploads/damages/')) return;
  const filename = path.basename(url);
  const filePath = path.join(process.cwd(), UPLOAD_RELATIVE, filename);
  await unlink(filePath).catch(() => {});
}

/** Hapus beberapa foto sekaligus (duplikat diabaikan). */
export async function deleteDamagePhotoFiles(urls: Array<string | null | undefined>): Promise<void> {
  const unique = Array.from(new Set(urls.filter((u): u is string => Boolean(u))));
  await Promise.all(unique.map((u) => deleteDamagePhotoFile(u)));
}