import { NextResponse } from 'next/server';
import { requireAuthContext, isRoleAllowed, setActiveAirportCookie } from '@/lib/auth';
import { prisma } from '@/lib/db';

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

    await setActiveAirportCookie(airport.id);

    return NextResponse.json({ success: true, activeAirport: airport });
  } catch (error: unknown) {
    console.error('Select airport error:', error);
    return NextResponse.json({ error: 'Gagal memilih bandara' }, { status: 500 });
  }
}
