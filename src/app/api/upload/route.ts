import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { deleteDamagePhotoFile } from '@/lib/photo-file';
import { requireAuthContext } from '@/lib/auth';

export const runtime = 'nodejs';

const UPLOAD_RELATIVE = path.join('public', 'uploads', 'damages');
const MAX_FILE_BYTES = 12 * 1024 * 1024; // 12 MB aman untuk foto HP (dikompres sisi client juga)

export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File foto tidak ditemukan di form data' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `Ukuran file harus antara 1 byte - ${MAX_FILE_BYTES / 1024 / 1024} MB` }, { status: 400 });
    }

    const ext = (file.name.match(/\.(jpe?g|png|webp|gif|heic|heif)$/i)?.[1] || 'jpg').toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt}`;
    const dir = path.join(process.cwd(), UPLOAD_RELATIVE);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({ url: `/uploads/damages/${filename}` }, { status: 201 });
  } catch (error) {
    console.error('Error uploading photo:', error);
    return NextResponse.json({ error: 'Gagal menyimpan foto kerusakan' }, { status: 500 });
  }
}

// Hapus file foto yang tidak lagi terpakai (misal photo diganti/dihapus pada form edit).
export async function DELETE(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url') || '';
    if (!url.startsWith('/uploads/damages/')) {
      return NextResponse.json({ error: 'URL tidak valid' }, { status: 400 });
    }
    await deleteDamagePhotoFile(url);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return NextResponse.json({ error: 'Gagal menghapus foto' }, { status: 500 });
  }
}