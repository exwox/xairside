import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const existing = await prisma.pciSection.findUnique({ where: { id }, select: { airportId: true } });
    if (!existing || existing.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Section tidak ditemukan' }, { status: 404 });
    }
    await prisma.pciSection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting PCI section:', error);
    return NextResponse.json({ error: 'Gagal menghapus section' }, { status: 500 });
  }
}
