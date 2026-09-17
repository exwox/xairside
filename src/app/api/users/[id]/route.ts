import { NextResponse } from 'next/server';
import { requireAuthContext, isRoleAllowed, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['SUPADMIN', 'ADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });
    }

    if (auth.user.role === 'ADMIN') {
      // ADMIN can only manage users in their airport and cannot manage SUPADMIN or ADMINs
      if (targetUser.airportId !== auth.user.airportId || targetUser.role === 'SUPADMIN' || targetUser.role === 'ADMIN') {
        return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
      }
    }

    const { name, email, password, role, airportId, isActive } = body;
    if (id === auth.user.id && (role !== undefined || airportId !== undefined || isActive === false)) {
      return NextResponse.json({ error: 'Tidak dapat mengubah role, bandara, atau status akun sendiri' }, { status: 400 });
    }
    const dataToUpdate: Prisma.UserUncheckedUpdateInput = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return NextResponse.json({ error: 'Nama tidak valid' }, { status: 400 });
      dataToUpdate.name = name.trim();
    }
    if (email !== undefined) {
      if (typeof email !== 'string' || !email.trim()) return NextResponse.json({ error: 'Email tidak valid' }, { status: 400 });
      dataToUpdate.email = email.trim().toLowerCase();
    }
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 12) return NextResponse.json({ error: 'Kata sandi minimal 12 karakter' }, { status: 400 });
      dataToUpdate.passwordHash = hashPassword(password);
    }
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
      dataToUpdate.isActive = isActive;
    }

    if (role !== undefined) {
      const newRole = typeof role === 'string' ? role.toUpperCase() : '';
      if (!['SUPADMIN', 'ADMIN', 'USER', 'VIEWER'].includes(newRole)) {
        return NextResponse.json({ error: 'Peran tidak valid' }, { status: 400 });
      }
      if (auth.user.role === 'ADMIN' && (newRole === 'SUPADMIN' || newRole === 'ADMIN')) {
        return NextResponse.json({ error: 'Admin tidak dapat mengubah peran ke ADMIN atau SUPADMIN' }, { status: 403 });
      }
      dataToUpdate.role = newRole;
    }

    if (airportId !== undefined) {
      if (auth.user.role === 'SUPADMIN') {
        dataToUpdate.airportId = airportId || null;
      }
    }

    const effectiveRole = dataToUpdate.role ?? targetUser.role;
    const effectiveAirportId = effectiveRole === 'SUPADMIN' ? null
      : airportId !== undefined && auth.user.role === 'SUPADMIN' ? (typeof airportId === 'string' && airportId ? airportId : null)
      : targetUser.airportId;
    if (effectiveRole !== 'SUPADMIN' && !effectiveAirportId) {
      return NextResponse.json({ error: 'Pengguna harus terikat ke bandara' }, { status: 400 });
    }
    if (effectiveAirportId && !await prisma.airport.findFirst({ where: { id: effectiveAirportId, isActive: true } })) {
      return NextResponse.json({ error: 'Bandara tidak valid atau tidak aktif' }, { status: 400 });
    }
    if (effectiveRole === 'SUPADMIN') dataToUpdate.airportId = null;

    const revokeSessions = Boolean(dataToUpdate.passwordHash || dataToUpdate.role !== undefined
      || dataToUpdate.airportId !== undefined || dataToUpdate.isActive === false);

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: dataToUpdate,
        select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        airportId: true,
        airport: { select: { id: true, code: true, name: true } },
        },
      });
      if (revokeSessions) await tx.session.deleteMany({ where: { userId: id } });
      return user;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui pengguna' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['SUPADMIN', 'ADMIN'])) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const { id } = await params;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });
    }

    if (targetUser.id === auth.user.id) {
      return NextResponse.json({ error: 'Tidak dapat menghapus akun sendiri' }, { status: 400 });
    }

    if (auth.user.role === 'ADMIN') {
      if (targetUser.airportId !== auth.user.airportId || targetUser.role === 'SUPADMIN' || targetUser.role === 'ADMIN') {
        return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
      }
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Gagal menghapus pengguna' }, { status: 500 });
  }
}
