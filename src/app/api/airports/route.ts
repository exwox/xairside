import { NextResponse } from 'next/server';
import { requireAuthContext, isRoleAllowed } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AIRPORT_PROFILE_KEYS, airportProfile, parseAirportCoordinates } from '@/lib/airport-profile';

export async function GET(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    if (auth.user.role === 'SUPADMIN') {
      const airports = await prisma.airport.findMany({
        orderBy: { code: 'asc' },
        include: { configs: { select: { key: true, value: true } }, _count: { select: { users: true, facilities: true } } },
      });
      return NextResponse.json(airports.map(airportProfile));
    } else {
      if (!auth.user.airportId) {
        return NextResponse.json([]);
      }
      const airport = await prisma.airport.findUnique({
        where: { id: auth.user.airportId },
        include: { configs: { select: { key: true, value: true } }, _count: { select: { users: true, facilities: true } } },
      });
      return NextResponse.json(airport ? [airportProfile(airport)] : []);
    }
  } catch (error) {
    console.error('Fetch airports error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data bandara' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['SUPADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const body = await req.json();

    const { code, name, timezone, refLat, refLng, location, manager, description } = body;

    if (typeof code !== 'string' || !/^[A-Z0-9-]{2,10}$/.test(code.trim().toUpperCase())
      || typeof name !== 'string' || !name.trim() || name.trim().length > 150
      || typeof location !== 'string' || !location.trim() || location.trim().length > 200
      || typeof manager !== 'string' || !manager.trim() || manager.trim().length > 200
      || (description !== undefined && (typeof description !== 'string' || description.length > 2000))) {
      return NextResponse.json({ error: 'Kode, nama, lokasi, dan pengelola bandara wajib diisi dengan benar' }, { status: 400 });
    }
    const coordinates = parseAirportCoordinates(refLat, refLng);
    if (!coordinates) return NextResponse.json({ error: 'Koordinat ARP tidak valid' }, { status: 400 });

    const upperCode = code.trim().toUpperCase();
    const existing = await prisma.airport.findUnique({ where: { code: upperCode } });
    if (existing) {
      return NextResponse.json({ error: 'Kode bandara sudah digunakan' }, { status: 400 });
    }

    const airport = await prisma.airport.create({
      data: {
        code: upperCode,
        name: name.trim(),
        timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'Asia/Jakarta',
        ...coordinates,
        configs: { create: [
          { key: AIRPORT_PROFILE_KEYS.location, value: location.trim() },
          { key: AIRPORT_PROFILE_KEYS.manager, value: manager.trim() },
          { key: AIRPORT_PROFILE_KEYS.description, value: description?.trim() ?? '' },
        ] },
      },
      include: { configs: { select: { key: true, value: true } } },
    });

    return NextResponse.json(airportProfile(airport), { status: 201 });
  } catch (error) {
    console.error('Create airport error:', error);
    return NextResponse.json({ error: 'Gagal menambahkan bandara' }, { status: 500 });
  }
}
