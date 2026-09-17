import { NextResponse } from 'next/server';
import { requireAuthContext, isRoleAllowed, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['SUPADMIN', 'ADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const whereClause: Prisma.UserWhereInput = {};
    if (auth.user.role !== 'SUPADMIN') {
      if (!auth.user.airportId) {
        return NextResponse.json([]);
      }
      whereClause.airportId = auth.user.airportId;
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        airportId: true,
        airport: {
          select: { id: true, code: true, name: true },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data pengguna' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['SUPADMIN', 'ADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const body = await req.json();

    const { email, password, name, role, airportId } = body;

    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || typeof role !== 'string'
      || !email.trim() || password.length < 12 || !name.trim() || !role.trim()) {
      return NextResponse.json({ error: 'Email, nama, peran, dan kata sandi minimal 12 karakter wajib diisi' }, { status: 400 });
    }

    const formattedEmail = email.trim().toLowerCase();

    // Check existing email
    const existing = await prisma.user.findUnique({ where: { email: formattedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 400 });
    }

    let targetAirportId: string | null = airportId || null;
    const targetRole = typeof role === 'string' ? role.toUpperCase() : '';
    if (!['SUPADMIN', 'ADMIN', 'USER', 'VIEWER'].includes(targetRole)) {
      return NextResponse.json({ error: 'Peran tidak valid' }, { status: 400 });
    }

    if (auth.user.role === 'ADMIN') {
      // ADMIN can only create USER or VIEWER for their own airport
      if (targetRole !== 'USER' && targetRole !== 'VIEWER') {
        return NextResponse.json({ error: 'Admin hanya dapat membuat peran USER atau VIEWER' }, { status: 403 });
      }
      targetAirportId = auth.user.airportId;
      if (!targetAirportId) {
        return NextResponse.json({ error: 'Admin harus terikat pada suatu bandara' }, { status: 400 });
      }
    } else if (auth.user.role === 'SUPADMIN') {
      if (targetRole !== 'SUPADMIN' && !targetAirportId) {
        return NextResponse.json({ error: 'Pengguna non-SUPADMIN harus terikat ke bandara' }, { status: 400 });
      }
      if (targetRole === 'SUPADMIN') targetAirportId = null;
    }
    if (targetAirportId && !await prisma.airport.findFirst({ where: { id: targetAirportId, isActive: true } })) {
      return NextResponse.json({ error: 'Bandara tidak valid atau tidak aktif' }, { status: 400 });
    }

    const passwordHash = hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        email: formattedEmail,
        passwordHash,
        name: name.trim(),
        role: targetRole,
        airportId: targetAirportId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        airportId: true,
        airport: {
          select: { id: true, code: true, name: true },
        },
        createdAt: true,
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Gagal membuat pengguna' }, { status: 500 });
  }
}
