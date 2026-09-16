import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseDxf } from '@/lib/dxf';

export async function GET() {
  try {
    const layers = await prisma.mapLayer.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(
      layers.map((l) => ({ ...l, entities: JSON.parse(l.entitiesJson) as unknown[] }))
    );
  } catch (error) {
    console.error('Error fetching map layers:', error);
    return NextResponse.json({ error: 'Failed to fetch map layers' }, { status: 500 });
  }
}

// Upload & parse DXF -> layer overlay peta
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.name || !body.content) {
      return NextResponse.json({ error: 'name dan content (isi DXF) wajib' }, { status: 400 });
    }
    if (typeof body.content !== 'string' || body.content.length > 20_000_000) {
      return NextResponse.json({ error: 'File DXF terlalu besar (maks 20 MB)' }, { status: 413 });
    }
    const parsed = parseDxf(body.content);
    if (parsed.entities.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada entity yang dikenali pada DXF (LINE/LWPOLYLINE/POLYLINE/CIRCLE/ARC/TEXT)' },
        { status: 422 }
      );
    }
    const layer = await prisma.mapLayer.create({
      data: {
        name: body.name,
        fileName: body.fileName ?? 'drawing.dxf',
        refLat: Number(body.refLat ?? 0),
        refLng: Number(body.refLng ?? 0),
        rotationDeg: Number(body.rotationDeg ?? 0),
        scale: Number(body.scale ?? 1) || 1,
        entitiesJson: JSON.stringify(parsed.entities),
        visible: true,
      },
    });
    return NextResponse.json({ ...layer, entities: parsed.entities, skipped: parsed.skipped }, { status: 201 });
  } catch (error) {
    console.error('Error uploading DXF:', error);
    return NextResponse.json({ error: 'Gagal memproses file DXF' }, { status: 500 });
  }
}
