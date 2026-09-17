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
    if (body.markingType !== undefined) data.markingType = body.markingType;
    if (body.condition !== undefined && ['BAIK', 'PERLU_PERBAIKAN', 'USANG'].includes(body.condition))
      data.condition = body.condition;
    if (body.station !== undefined) data.station = body.station;
    if (body.remarks !== undefined) data.remarks = body.remarks;
    if (body.reportedBy !== undefined) data.reportedBy = body.reportedBy;
    if (body.status !== undefined && ['OPEN', 'CLOSED'].includes(body.status)) data.status = body.status;
    if (body.facilityId !== undefined) data.facilityId = body.facilityId || null;
    if (body.areaSqm !== undefined) data.areaSqm = body.areaSqm === null ? null : Number(body.areaSqm);
    if (body.lat !== undefined) data.lat = body.lat === null ? null : Number(body.lat);
    if (body.lng !== undefined) data.lng = body.lng === null ? null : Number(body.lng);
    if (body.localX !== undefined) data.localX = body.localX === null ? null : Number(body.localX);
    if (body.localY !== undefined) data.localY = body.localY === null ? null : Number(body.localY);
    if (body.facilityId !== undefined && body.facilityId) {
      const facility = await prisma.facility.findUnique({
        where: { id: String(body.facilityId) },
        select: { airportId: true },
      });
      if (!facility || facility.airportId !== auth.activeAirportId) {
        return NextResponse.json({ error: 'Fasilitas tidak ditemukan atau bukan milik airport aktif' }, { status: 400 });
      }
    }
    const existing = await prisma.markingFinding.findUnique({ where: { id }, select: { airportId: true } });
    if (!existing || existing.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Temuan marka tidak ditemukan' }, { status: 404 });
    }
    const marking = await prisma.markingFinding.update({ where: { id }, data, include: { facility: true } });
    return NextResponse.json(marking);
  } catch (error) {
    console.error('Error updating marking:', error);
    return NextResponse.json({ error: 'Gagal memperbarui temuan marka' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const existing = await prisma.markingFinding.findUnique({ where: { id }, select: { airportId: true } });
    if (!existing || existing.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Temuan marka tidak ditemukan' }, { status: 404 });
    }
    await prisma.markingFinding.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting marking:', error);
    return NextResponse.json({ error: 'Gagal menghapus temuan marka' }, { status: 500 });
  }
}
