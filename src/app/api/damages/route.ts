import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateDamageMeasurement } from '@/lib/damage-measurement';
import { damageDefinitionForType, isDamageSeverityAllowed } from '@/lib/damage-unit-server';

export async function GET() {
  try {
    const damages = await prisma.damage.findMany({
      include: { facility: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(damages);
  } catch (error) {
    console.error('Error fetching damages:', error);
    return NextResponse.json({ error: 'Failed to fetch damages' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
      return NextResponse.json({ error: 'Koordinat (lat/lng) wajib diisi' }, { status: 400 });
    }
    const definition = await damageDefinitionForType(body.type ?? 'Lainnya', body.facilityId || null);
    if (!isDamageSeverityAllowed(definition, body.severity)) {
      return NextResponse.json({ error: 'Severity tidak tersedia untuk jenis kerusakan ini.' }, { status: 400 });
    }
    // Jenis PCI memiliki bentuk ukur baku. Klien harus mengirim geometri yang
    // sesuai agar kerusakan bersatuan m tidak tersimpan sebagai bidang.
    const measurement = validateDamageMeasurement(
      body,
      definition?.unit ?? null,
      definition != null || body.geometryType != null
    );
    if (!measurement.ok) return NextResponse.json({ error: measurement.error }, { status: 400 });
    const damage = await prisma.damage.create({
      data: {
        groupId: body.groupId ?? null,
        facilityId: body.facilityId || null,
        station: body.station ?? null,
        sampleCode: body.sampleCode ?? null,
        type: body.type ?? 'Lainnya',
        severity: body.severity,
        lat,
        lng,
        localX: Number(body.localX ?? 0),
        localY: Number(body.localY ?? 0),
        ...measurement.value,
        photoUrl: body.photoUrl ?? null,
        remarks: body.remarks ?? null,
        reportedBy: body.reportedBy ?? null,
      },
    });
    return NextResponse.json(damage, { status: 201 });
  } catch (error) {
    console.error('Error creating damage:', error);
    return NextResponse.json({ error: 'Gagal menyimpan data kerusakan' }, { status: 500 });
  }
}
