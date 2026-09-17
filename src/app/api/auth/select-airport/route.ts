import { NextResponse } from 'next/server';
import { requireAuthContext, isRoleAllowed, ACTIVE_AIRPORT_COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['SUPADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const body = await req.json();
    const { airportId } = body;

    if (!airportId) {
      return NextResponse.json({ error: 'ID Bandara wajib diisi' }, { status: 400 });
    }

    const airport = await prisma.airport.findUnique({
      where: { id: airportId },
    });

    if (!airport || !airport.isActive) {
      return NextResponse.json({ error: 'Bandara tidak ditemukan atau tidak aktif' }, { status: 404 });
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_AIRPORT_COOKIE_NAME, airport.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return NextResponse.json({ success: true, activeAirport: airport });
  } catch (error: any) {
    if (error.response) return error.response;
    console.error('Select airport error:', error);
    return NextResponse.json({ error: 'Gagal memilih bandara' }, { status: 500 });
  }
}
