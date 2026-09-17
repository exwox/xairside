import { NextResponse } from 'next/server';
import { requireAuthContext } from '@/lib/auth';
import { getRolePageAccess, saveRolePageAccess } from '@/lib/page-access-server';
import { normalizeRolePageAccess } from '@/lib/page-access';

export async function GET(req: Request) {
  const auth = await requireAuthContext(req);
  if ('response' in auth) return auth.response;
  return NextResponse.json(await getRolePageAccess());
}

export async function PUT(req: Request) {
  const auth = await requireAuthContext(req);
  if ('response' in auth) return auth.response;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Format data tidak valid' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Pengaturan akses tidak valid' }, { status: 400 });
  }
  const access = normalizeRolePageAccess(body);
  await saveRolePageAccess(access);
  return NextResponse.json(access);
}
