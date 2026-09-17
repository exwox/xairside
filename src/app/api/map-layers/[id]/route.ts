import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.visible !== undefined) data.visible = !!body.visible;
    if (body.name !== undefined) data.name = body.name;
    if (body.refLat !== undefined) data.refLat = Number(body.refLat);
    if (body.refLng !== undefined) data.refLng = Number(body.refLng);
    if (body.rotationDeg !== undefined) data.rotationDeg = Number(body.rotationDeg);
    if (body.scale !== undefined) data.scale = Number(body.scale) || 1;
    const existing = await prisma.mapLayer.findUnique({ where: { id }, select: { airportId: true } });
    if (!existing || existing.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Layer tidak ditemukan' }, { status: 404 });
    }
    const layer = await prisma.mapLayer.update({ where: { id }, data });
    return NextResponse.json(layer);
  } catch (error) {
    console.error('Error updating map layer:', error);
    return NextResponse.json({ error: 'Gagal memperbarui layer' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const existing = await prisma.mapLayer.findUnique({ where: { id }, select: { airportId: true } });
    if (!existing || existing.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Layer tidak ditemukan' }, { status: 404 });
    }
    await prisma.mapLayer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting map layer:', error);
    return NextResponse.json({ error: 'Gagal menghapus layer' }, { status: 500 });
  }
}
