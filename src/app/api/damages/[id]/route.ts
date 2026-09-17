import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';
import { deleteDamagePhotoFile, deleteDamagePhotoFiles } from '@/lib/photo-file';
import { validateDamageMeasurement, type DamageGeometryType, type DamageUnit } from '@/lib/damage-measurement';
import { damageDefinitionForType, damageUnitForType, isDamageSeverityAllowed } from '@/lib/damage-unit-server';

interface GeometrySplitItem {
  station: string;
  sampleCode: string | null;
  lat: number;
  lng: number;
  localX: number;
  localY: number;
  rectJson: string;
  geometryType: DamageGeometryType;
  lengthM: number;
  widthM: number;
  areaSqm: number;
  count: number | null;
  stationText: string;
}

function baseDamageRemark(value: string | null | undefined): string | null {
  const remark = value?.trim();
  if (!remark) return null;
  if (/^Terpotong (?:STA|Sampel) .+$/i.test(remark)) return null;
  return remark.replace(/\s*\(Terpotong (?:STA|Sampel) [^)]+\)$/i, '').trim() || null;
}

function parseGeometrySplitItems(
  value: unknown, unit: DamageUnit | null, geometryType: unknown
): GeometrySplitItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items: GeometrySplitItem[] = [];
  let geometryKey: string | null = null;
  const stations = new Set<string>();

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const sampleCode = typeof item.sampleCode === 'string' && item.sampleCode.trim()
      ? item.sampleCode.trim() : null;
    const stationText = typeof item.stationText === 'string' ? item.stationText.trim() : '';
    const subSegmentCode = typeof item.subSegmentCode === 'string' ? item.subSegmentCode.trim() : '';
    const station = sampleCode || subSegmentCode || stationText;
    if (!station || !stationText || stations.has(station)) return null;
    stations.add(station);

    const lat = item.lat;
    const lng = item.lng;
    const localX = item.localX;
    const localY = item.localY;
    const measurement = validateDamageMeasurement({
      ...item,
      geometryType: item.geometryType ?? geometryType,
    }, unit, true);
    if (!measurement.ok) return null;
    if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90
      || typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180
      || typeof localX !== 'number' || !Number.isFinite(localX)
      || typeof localY !== 'number' || !Number.isFinite(localY)) return null;

    const rectJson = measurement.value.rectJson;
    const points = rectJson ? JSON.parse(rectJson) as { lat: number; lng: number }[] : null;
    const currentKey = points
      ? JSON.stringify(points.map((point) => [point.lat, point.lng]))
      : JSON.stringify([lat, lng]);
    if (geometryKey && geometryKey !== currentKey) return null;
    geometryKey = currentKey;

    items.push({
      station, sampleCode, stationText, lat, lng, localX, localY,
      rectJson: rectJson ?? '', geometryType: measurement.value.geometryType,
      lengthM: measurement.value.lengthM ?? 0,
      widthM: measurement.value.widthM ?? 0,
      areaSqm: measurement.value.areaSqm, count: measurement.value.count,
    });
  }
  return items;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.damage.findUnique({ where: { id }, include: { facility: { select: { airportId: true } } } });
    if (!existing) {
      return NextResponse.json({ error: 'Data temuan tidak ditemukan' }, { status: 404 });
    }
    if (existing.facility && existing.facility.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Data temuan bukan milik airport aktif' }, { status: 404 });
    }

    // Jika opsi replaceAllInGroup diaktifkan (geometri di-edit ulang dan melintasi beberapa segmen STA)
    if (body.replaceAllInGroup) {
      const definition = await damageDefinitionForType(body.type ?? existing.type, body.facilityId ?? existing.facilityId);
      const unit = definition?.unit ?? null;
      const splitItems = parseGeometrySplitItems(body.splitItems, unit, body.geometryType ?? existing.geometryType);
      if (!splitItems) {
        return NextResponse.json({ error: 'Pembagian geometri kerusakan tidak valid' }, { status: 400 });
      }
      if (body.facilityId !== undefined && body.facilityId !== null && typeof body.facilityId !== 'string') {
        return NextResponse.json({ error: 'Fasilitas tidak valid' }, { status: 400 });
      }
      if ((body.type !== undefined || body.severity !== undefined || body.facilityId !== undefined)
        && !isDamageSeverityAllowed(definition, body.severity ?? existing.severity)) {
        return NextResponse.json({ error: 'Severity tidak valid' }, { status: 400 });
      }
      if (body.status !== undefined && !['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(body.status)) {
        return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
      }
      if ((body.type !== undefined && (typeof body.type !== 'string' || !body.type.trim()))
        || (body.photoUrl !== undefined && body.photoUrl !== null && typeof body.photoUrl !== 'string')
        || (body.remarks !== undefined && body.remarks !== null && typeof body.remarks !== 'string')
        || (body.reportedBy !== undefined && body.reportedBy !== null && typeof body.reportedBy !== 'string')) {
        return NextResponse.json({ error: 'Metadata temuan tidak valid' }, { status: 400 });
      }

      // Pertahankan record lama sebanyak mungkin; seluruh perubahan atau kegagalan
      // terjadi dalam satu transaksi, sehingga tidak ada grup yang terhapus separuh.
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.damage.findUnique({ where: { id } });
        if (!current) return { error: 'Data temuan tidak ditemukan', status: 404 } as const;
        const group = current.groupId
          ? await tx.damage.findMany({ where: { groupId: current.groupId }, orderBy: { createdAt: 'asc' } })
          : [current];
        const oldRows = [current, ...group.filter((row) => row.id !== current.id)];
        const oldPhotoUrls = oldRows.map((row) => row.photoUrl);
        const oldRemark = baseDamageRemark(current.remarks);
        if (oldRows.some((row) => row.facilityId !== current.facilityId
          || row.rectJson !== current.rectJson || row.type !== current.type
          || row.severity !== current.severity || row.status !== current.status
          || row.photoUrl !== current.photoUrl || row.reportedBy !== current.reportedBy
          || baseDamageRemark(row.remarks) !== oldRemark)) {
          return { error: 'Metadata antar bagian kerusakan berbeda; edit satu per satu agar data tidak hilang', status: 409 } as const;
        }

        const groupId = current.groupId || (splitItems.length > 1 ? current.id : null);
        const facilityId = body.facilityId !== undefined ? (body.facilityId || null) : current.facilityId;
        const photoUrl = body.photoUrl !== undefined ? (body.photoUrl || null) : current.photoUrl;
        const reportedBy = body.reportedBy !== undefined ? body.reportedBy : current.reportedBy;
        const remarks = body.remarks !== undefined ? baseDamageRemark(body.remarks) : oldRemark;
        const changed = [];
        for (let index = 0; index < splitItems.length; index++) {
          const item = splitItems[index];
          const autoLabel = item.sampleCode
            ? `Terpotong Sampel ${item.stationText}` : `Terpotong STA ${item.stationText}`;
          const itemRemarks = splitItems.length > 1
            ? (remarks ? `${remarks} (${autoLabel})` : autoLabel)
            : remarks;
          const data = {
            groupId, facilityId, station: item.station, sampleCode: item.sampleCode,
            type: body.type ?? current.type,
            severity: body.severity ?? current.severity,
            status: body.status ?? current.status,
            lat: item.lat, lng: item.lng, localX: item.localX, localY: item.localY,
            rectJson: item.rectJson || null, geometryType: item.geometryType,
            lengthM: item.lengthM || null, widthM: item.widthM || null,
            areaSqm: item.areaSqm, count: item.count,
            photoUrl, remarks: itemRemarks, reportedBy,
          };
          if (index < oldRows.length) {
            changed.push(await tx.damage.update({ where: { id: oldRows[index].id }, data, include: { facility: true } }));
          } else {
            changed.push(await tx.damage.create({
              data: { ...data, airportId: auth.activeAirportId, createdAt: current.createdAt },
              include: { facility: true },
            }));
          }
        }
        if (oldRows.length > splitItems.length) {
          await tx.damage.deleteMany({ where: { id: { in: oldRows.slice(splitItems.length).map((row) => row.id) } } });
        }
        return { damage: changed[0], oldPhotoUrls } as const;
      }, { timeout: 120_000 });

      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      // Foto lama dibuang hanya sesudah commit dan bila tidak lagi direferensikan.
      // Gagal cleanup tidak boleh mengubah respons menjadi 500 setelah DB berhasil.
      try {
        const oldUrls = [...new Set(result.oldPhotoUrls.filter((url): url is string => Boolean(url)))];
        const unusedUrls: string[] = [];
        for (const url of oldUrls) {
          if (await prisma.damage.count({ where: { photoUrl: url } }) === 0) unusedUrls.push(url);
        }
        await deleteDamagePhotoFiles(unusedUrls);
      } catch (cleanupError) {
        console.error('Gagal membersihkan foto kerusakan lama:', cleanupError);
      }
      return NextResponse.json(result.damage);
    }

    const data: Record<string, unknown> = {};
    if (body.status !== undefined && ['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(body.status)) data.status = body.status;
    if (body.severity !== undefined) data.severity = body.severity;
    if (body.type !== undefined) data.type = body.type;
    if (body.station !== undefined) data.station = body.station;
    if (body.sampleCode !== undefined) data.sampleCode = body.sampleCode;
    if (body.remarks !== undefined) data.remarks = body.remarks;
    if (body.facilityId !== undefined) data.facilityId = body.facilityId || null;
    if (body.reportedBy !== undefined) data.reportedBy = body.reportedBy;
    if (body.rectJson !== undefined) data.rectJson = body.rectJson;
    if (body.photoUrl !== undefined) data.photoUrl = body.photoUrl;
    if (body.lat !== undefined) data.lat = body.lat;
    if (body.lng !== undefined) data.lng = body.lng;
    if (body.areaSqm !== undefined) data.areaSqm = body.areaSqm;
    if (body.lengthM !== undefined) data.lengthM = body.lengthM;
    if (body.widthM !== undefined) data.widthM = body.widthM;
    if (body.geometryType !== undefined) data.geometryType = body.geometryType;
    if (body.count !== undefined) data.count = body.count;
    if (body.localX !== undefined) data.localX = body.localX;
    if (body.localY !== undefined) data.localY = body.localY;

    if (body.type !== undefined || body.severity !== undefined || body.facilityId !== undefined) {
      const definition = await damageDefinitionForType(body.type ?? existing.type, body.facilityId ?? existing.facilityId);
      if (!isDamageSeverityAllowed(definition, body.severity ?? existing.severity)) {
        return NextResponse.json({ error: 'Severity tidak tersedia untuk jenis kerusakan ini.' }, { status: 400 });
      }
    }

    const measurementChanged = ['type', 'facilityId', 'rectJson', 'geometryType', 'areaSqm', 'lengthM', 'widthM', 'count']
      .some((key) => body[key] !== undefined);
    if (measurementChanged) {
      const unit = await damageUnitForType(body.type ?? existing.type, body.facilityId ?? existing.facilityId);
      const measurement = validateDamageMeasurement(
        { ...existing, ...body },
        unit,
        unit != null || (body.geometryType !== undefined && body.geometryType !== existing.geometryType)
      );
      if (!measurement.ok) return NextResponse.json({ error: measurement.error }, { status: 400 });
      Object.assign(data, measurement.value);
    }

    // Jika meng-update status / severity / type / remarks untuk grup (tanpa mengganti geometri)
    if (existing.groupId && (body.updateGroup ?? true)) {
      // Hapus atribut yang spesifik lokasi individual jika mengupdate seluruh grup tanpa ubah lokasi
      const groupData = { ...data };
      delete groupData.station;
      delete groupData.lat;
      delete groupData.lng;
      delete groupData.localX;
      delete groupData.localY;
      delete groupData.rectJson;

      if (Object.keys(groupData).length > 0) {
        await prisma.damage.updateMany({
          where: { groupId: existing.groupId },
          data: groupData,
        });
      }
      const updated = await prisma.damage.findUnique({ where: { id }, include: { facility: true } });

      // Foto lama dibuang bila diganti/dihapus (data.photoUrl terdefinisi & berbeda)
      const finalGroupPhoto = data.photoUrl !== undefined ? data.photoUrl : existing.photoUrl;
      if (existing.photoUrl && existing.photoUrl !== finalGroupPhoto) {
        await deleteDamagePhotoFile(existing.photoUrl);
      }

      return NextResponse.json(updated);
    }

    const damage = await prisma.damage.update({ where: { id }, data, include: { facility: true } });

    // Foto lama dibuang bila diganti/dihapus
    const finalPhoto = data.photoUrl !== undefined ? data.photoUrl : existing.photoUrl;
    if (existing.photoUrl && existing.photoUrl !== finalPhoto) {
      await deleteDamagePhotoFile(existing.photoUrl);
    }

    return NextResponse.json(damage);
  } catch (error) {
    console.error('Error updating damage:', error);
    return NextResponse.json({ error: 'Gagal memperbarui temuan' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const url = new URL(req.url);
    const deleteGroup = url.searchParams.get('deleteGroup') === 'true';

    const existing = await prisma.damage.findUnique({ where: { id } });
    if (!existing || existing.airportId !== auth.activeAirportId) {
      return NextResponse.json({ ok: true });
    }

    if (existing.groupId && deleteGroup) {
      // Kumpulkan URL foto seluruh record grup sebelum dihapus (untuk cleanup file)
      const groupPhotos = await prisma.damage.findMany({
        where: { groupId: existing.groupId },
        select: { photoUrl: true },
      });
      await prisma.damage.deleteMany({ where: { groupId: existing.groupId } });
      await deleteDamagePhotoFiles(groupPhotos.map((r) => r.photoUrl));
    } else {
      await prisma.damage.delete({ where: { id } });
      await deleteDamagePhotoFile(existing.photoUrl);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting damage:', error);
    return NextResponse.json({ error: 'Gagal menghapus temuan' }, { status: 500 });
  }
}
