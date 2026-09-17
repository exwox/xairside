import { NextResponse } from 'next/server';
import { requireAuthContext, isRoleAllowed } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AIRPORT_PROFILE_KEYS, airportProfile, parseAirportCoordinates } from '@/lib/airport-profile';
import type { Prisma } from '@prisma/client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id } = await params;

    if (auth.user.role !== 'SUPADMIN' && auth.user.airportId !== id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const airport = await prisma.airport.findUnique({
      where: { id },
      include: { configs: true },
    });

    if (!airport) {
      return NextResponse.json({ error: 'Bandara tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json(airportProfile(airport));
  } catch {
    return NextResponse.json({ error: 'Gagal memuat bandara' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['SUPADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const { code, name, timezone, refLat, refLng, isActive, location, manager, description } = body;
    const dataToUpdate: Prisma.AirportUpdateInput = {};
    if (code !== undefined) {
      if (typeof code !== 'string' || !/^[A-Z0-9-]{2,10}$/.test(code.trim().toUpperCase())) return NextResponse.json({ error: 'Kode bandara tidak valid' }, { status: 400 });
      dataToUpdate.code = code.trim().toUpperCase();
    }
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) return NextResponse.json({ error: 'Nama bandara wajib diisi dan maksimal 150 karakter' }, { status: 400 });
      dataToUpdate.name = name.trim();
    }
    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || !timezone.trim()) return NextResponse.json({ error: 'Zona waktu tidak valid' }, { status: 400 });
      dataToUpdate.timezone = timezone.trim();
    }
    if (refLat !== undefined || refLng !== undefined) {
      const existing = await prisma.airport.findUnique({ where: { id }, select: { refLat: true, refLng: true } });
      if (!existing) return NextResponse.json({ error: 'Bandara tidak ditemukan' }, { status: 404 });
      const coordinates = parseAirportCoordinates(refLat ?? existing.refLat, refLng ?? existing.refLng);
      if (!coordinates) return NextResponse.json({ error: 'Koordinat ARP tidak valid' }, { status: 400 });
      Object.assign(dataToUpdate, coordinates);
    }
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') return NextResponse.json({ error: 'Status bandara tidak valid' }, { status: 400 });
      dataToUpdate.isActive = isActive;
    }
    const profileEntries = [
      [AIRPORT_PROFILE_KEYS.location, location],
      [AIRPORT_PROFILE_KEYS.manager, manager],
      [AIRPORT_PROFILE_KEYS.description, description],
    ] as const;
    for (const [key, value] of profileEntries) {
      if (value === undefined) continue;
      if (typeof value !== 'string' || (key !== AIRPORT_PROFILE_KEYS.description && !value.trim())
        || value.length > (key === AIRPORT_PROFILE_KEYS.description ? 2000 : 200)) {
        return NextResponse.json({ error: 'Lokasi atau pengelola bandara tidak valid' }, { status: 400 });
      }
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.airport.update({ where: { id }, data: dataToUpdate });
      for (const [key, value] of profileEntries) {
        if (value === undefined) continue;
        await tx.airportConfig.upsert({
          where: { airportId_key: { airportId: id, key } },
          create: { airportId: id, key, value: value.trim() },
          update: { value: value.trim() },
        });
      }
      return tx.airport.findUniqueOrThrow({ where: { id }, include: { configs: { select: { key: true, value: true } } } });
    });

    return NextResponse.json(airportProfile(updated));
  } catch (error) {
    console.error('Update airport error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui bandara' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['SUPADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const { id } = await params;

    await prisma.airport.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete airport error:', error);
    return NextResponse.json({ error: 'Gagal menghapus bandara' }, { status: 500 });
  }
}
