import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    // Hanya ADMIN/SUPADMIN yang dapat menyetujui inspeksi
    if (auth.user.role !== 'ADMIN' && auth.user.role !== 'SUPADMIN') {
      return NextResponse.json({ error: 'Anda tidak memiliki hak akses untuk menyetujui inspeksi' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { signature } = body;

    if (!signature) {
      return NextResponse.json({ error: 'Signature is required for approval' }, { status: 400 });
    }

    // Cek apakah inspeksi ada dan milik airport aktif
    const existing = await prisma.inspection.findUnique({
      where: { id },
    });

    if (!existing || existing.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    // Supervisor = user yang sedang login
    const updated = await prisma.inspection.update({
      where: { id },
      data: {
        status: 'APPROVED',
        supervisorId: auth.user.id,
        signature: signature,
      },
      include: {
        inspector: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error approving inspection:', error);
    return NextResponse.json({ error: 'Failed to approve inspection' }, { status: 500 });
  }
}
