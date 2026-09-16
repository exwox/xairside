import type { Damage, Facility } from '@prisma/client';
import {
  calculateFacilityStation,
  computePolygonMetrics,
  findConcreteBlockForPoint,
  findSampleCodeForPoint,
  generateFacilityConcreteBlocksSnapped,
  generateFacilitySampleGridsSnapped,
  getFacilityStationOffsetM,
  splitDamageByStation,
  splitDamageBySampleGrids,
  splitPolylineBySampleGrids,
  splitPolylineByStation,
  type LatLng,
} from './geo';

type FacilityForResplit = Pick<Facility,
  'id' | 'code' | 'polygonJson' | 'centroidLat' | 'centroidLng' | 'bearingDeg'
  | 'lengthM' | 'widthM' | 'stationDirection' | 'stationIntervalM'
  | 'locationMode' | 'surfaceType' | 'sampleLengthM' | 'sampleWidthM'
  | 'blockLengthM' | 'blockWidthM' | 'slabDirection'
>;

export type DamageForResplit = Pick<Damage,
  'id' | 'groupId' | 'facilityId' | 'station' | 'sampleCode' | 'type' | 'severity'
  | 'status' | 'lat' | 'lng' | 'localX' | 'localY' | 'rectJson' | 'lengthM'
  | 'widthM' | 'areaSqm' | 'geometryType' | 'count' | 'photoUrl' | 'remarks' | 'reportedBy' | 'createdAt'
>;

export type ResplitDamageValues = Pick<DamageForResplit,
  'groupId' | 'facilityId' | 'station' | 'sampleCode' | 'type' | 'severity'
  | 'status' | 'lat' | 'lng' | 'localX' | 'localY' | 'rectJson' | 'lengthM'
  | 'widthM' | 'areaSqm' | 'geometryType' | 'count' | 'photoUrl' | 'remarks' | 'reportedBy'
>;

export type ResplitSkipReason =
  | 'metadata_conflict'
  | 'geometry_conflict'
  | 'geometry_missing'
  | 'facility_station_unavailable'
  | 'invalid_area';

export interface FacilityDamageResplitPlan {
  updates: { id: string; data: Partial<ResplitDamageValues> }[];
  creates: (ResplitDamageValues & { createdAt: Date })[];
  deleteIds: string[];
  updatedFindings: number;
  pointOnlyFindings: number;
  skipped: { key: string; reason: ResplitSkipReason }[];
}

const parenthesizedAutoRemark = /\s*\(Terpotong (?:STA|Sampel) [^)]+\)$/i;
const standaloneAutoRemark = /^Terpotong (?:STA|Sampel) .+$/i;

function baseRemark(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (standaloneAutoRemark.test(trimmed)) return null;
  return trimmed.replace(parenthesizedAutoRemark, '').trim() || null;
}

function parseDamageGeometry(value: string | null, minPoints: number): LatLng[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length < minPoints) return null;
    if (!parsed.every((point) => point !== null && typeof point === 'object'
      && Number.isFinite((point as LatLng).lat) && Number.isFinite((point as LatLng).lng))) return null;
    return parsed as LatLng[];
  } catch {
    return null;
  }
}

function geometryKey(vertices: LatLng[]): string {
  return JSON.stringify(vertices.map((point) => [point.lat, point.lng]));
}

function sameMetadata(rows: DamageForResplit[], allowSamples = false): boolean {
  const first = rows[0];
  const remarks = baseRemark(first.remarks);
  return rows.every((row) => row.type === first.type
    && row.severity === first.severity
    && row.status === first.status
    && row.photoUrl === first.photoUrl
    && row.reportedBy === first.reportedBy
    && row.widthM === first.widthM
    && row.geometryType === first.geometryType
    && (allowSamples || row.sampleCode == null)
    && baseRemark(row.remarks) === remarks);
}

function pointLocation(
  facility: FacilityForResplit,
  point: LatLng,
  arpLat: number,
  arpLng: number
): { station: string; sampleCode: string | null } | null {
  if (facility.locationMode !== 'SAM' && facility.surfaceType !== 'CONCRETE') {
    const station = calculateFacilityStation(facility, point, arpLat, arpLng);
    return station ? { station: station.subSegmentCode, sampleCode: null } : null;
  }
  let polygon: LatLng[] | undefined;
  if (facility.polygonJson) {
    try { polygon = JSON.parse(facility.polygonJson) as LatLng[]; } catch { /* use dimensions */ }
  }
  if (facility.surfaceType === 'CONCRETE') {
    const blocks = generateFacilityConcreteBlocksSnapped(facility, polygon);
    const code = findConcreteBlockForPoint(point.lat, point.lng, blocks)?.blockCode;
    return code ? { station: code, sampleCode: code } : null;
  }
  const grids = generateFacilitySampleGridsSnapped(facility, arpLat, arpLng, polygon);
  const code = findSampleCodeForPoint(point.lat, point.lng, grids);
  return code ? { station: code, sampleCode: code } : null;
}

/**
 * Merencanakan pembagian ulang tanpa mengubah DB. Semua pecahan satu groupId
 * menyimpan polygon asal yang sama, sehingga geometri itu hanya dipecah sekali.
 */
export function planFacilityDamageResplit(
  facility: FacilityForResplit,
  damages: DamageForResplit[],
  arpLat: number,
  arpLng: number
): FacilityDamageResplitPlan {
  const plan: FacilityDamageResplitPlan = {
    updates: [], creates: [], deleteIds: [],
    updatedFindings: 0, pointOnlyFindings: 0, skipped: [],
  };
  const groups = new Map<string, DamageForResplit[]>();
  for (const damage of damages) {
    const key = damage.groupId ? `group:${damage.groupId}` : `single:${damage.id}`;
    const rows = groups.get(key) ?? [];
    rows.push(damage);
    groups.set(key, rows);
  }

  for (const [key, unsortedRows] of groups) {
    const rows = [...unsortedRows].sort((a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
    );
    const first = rows[0];
    const isSam = facility.locationMode === 'SAM' || facility.surfaceType === 'CONCRETE';

    if (first.geometryType === 'POINT' || first.geometryType === 'SLAB') {
      // Kejadian/slab adalah satu unit, tidak dipecah menurut luas. Kelompok
      // multi-baris tidak digabung agar jumlah kejadian tidak berubah diam-diam.
      if (rows.length !== 1 || !sameMetadata(rows, true)) {
        plan.skipped.push({ key, reason: 'metadata_conflict' });
        continue;
      }
      const location = pointLocation(facility, { lat: first.lat, lng: first.lng }, arpLat, arpLng);
      if (!location) {
        plan.skipped.push({ key, reason: 'facility_station_unavailable' });
        continue;
      }
      plan.updates.push({ id: first.id, data: { station: location.station, sampleCode: location.sampleCode } });
      plan.updatedFindings++;
      plan.pointOnlyFindings++;
      continue;
    }

    if (first.geometryType === 'LINE') {
      if (!sameMetadata(rows, true)) {
        plan.skipped.push({ key, reason: 'metadata_conflict' });
        continue;
      }
      const lines = rows.map((row) => parseDamageGeometry(row.rectJson, 2));
      if (lines.some((line) => line === null)) {
        plan.skipped.push({ key, reason: 'geometry_missing' });
        continue;
      }
      const vertices = lines[0]!;
      if (lines.some((line) => geometryKey(line!) !== geometryKey(vertices))) {
        plan.skipped.push({ key, reason: 'geometry_conflict' });
        continue;
      }
      const parts = isSam
        ? splitPolylineBySampleGrids(facility, vertices, arpLat, arpLng)
        : splitPolylineByStation(facility, vertices, arpLat, arpLng);
      if (parts.length === 0 || !parts.every((part) => Number.isFinite(part.lengthM) && part.lengthM > 0)) {
        plan.skipped.push({ key, reason: 'geometry_missing' });
        continue;
      }
      const groupId = first.groupId ?? (parts.length > 1 ? first.id : null);
      const remarks = baseRemark(first.remarks);
      parts.forEach((part, index) => {
        const data: ResplitDamageValues = {
          groupId,
          facilityId: facility.id,
          station: isSam ? (part.sampleCode ?? part.stationText) : part.subSegmentCode,
          sampleCode: isSam ? (part.sampleCode ?? null) : null,
          type: first.type,
          severity: first.severity,
          status: first.status,
          lat: part.lat,
          lng: part.lng,
          localX: part.localX,
          localY: part.localY,
          rectJson: first.rectJson,
          lengthM: part.lengthM,
          widthM: 0,
          areaSqm: 0,
          geometryType: 'LINE',
          count: null,
          photoUrl: first.photoUrl,
          remarks: !isSam && parts.length > 1
            ? `${remarks ? `${remarks} (` : ''}Terpotong STA ${part.stationText}${remarks ? ')' : ''}`
            : remarks,
          reportedBy: first.reportedBy,
        };
        if (index < rows.length) plan.updates.push({ id: rows[index].id, data });
        else plan.creates.push({ ...data, createdAt: first.createdAt });
      });
      plan.deleteIds.push(...rows.slice(parts.length).map((row) => row.id));
      plan.updatedFindings++;
      continue;
    }

    const oldArea = rows.reduce((sum, row) => sum + row.areaSqm, 0);
    if (!Number.isFinite(oldArea) || oldArea <= 0) {
      plan.skipped.push({ key, reason: 'invalid_area' });
      continue;
    }
    if (!sameMetadata(rows, isSam)) {
      plan.skipped.push({ key, reason: 'metadata_conflict' });
      continue;
    }

    const polygons = rows.map((row) => parseDamageGeometry(row.rectJson, 3));
    if (polygons.some((polygon) => polygon === null)) {
      if (rows.length !== 1) {
        plan.skipped.push({ key, reason: 'geometry_missing' });
        continue;
      }
      const location = pointLocation(facility, { lat: first.lat, lng: first.lng }, arpLat, arpLng);
      if (!location) {
        plan.skipped.push({ key, reason: 'facility_station_unavailable' });
        continue;
      }
      plan.updates.push({ id: first.id, data: { station: location.station, sampleCode: location.sampleCode } });
      plan.updatedFindings++;
      plan.pointOnlyFindings++;
      continue;
    }

    const vertices = polygons[0]!;
    if (polygons.some((polygon) => geometryKey(polygon!) !== geometryKey(vertices))) {
      plan.skipped.push({ key, reason: 'geometry_conflict' });
      continue;
    }
    const polygonArea = computePolygonMetrics(vertices, arpLat, arpLng).areaSqm;
    if (!Number.isFinite(polygonArea) || polygonArea <= 0) {
      plan.skipped.push({ key, reason: 'geometry_missing' });
      continue;
    }
    if (!isSam && !getFacilityStationOffsetM(facility, vertices[0], arpLat, arpLng)) {
      plan.skipped.push({ key, reason: 'facility_station_unavailable' });
      continue;
    }
    const parts = isSam
      ? splitDamageBySampleGrids(facility, vertices, arpLat, arpLng)
      : splitDamageByStation(facility, vertices, arpLat, arpLng);
    const geometryArea = parts.reduce((sum, part) => sum + part.areaSqm, 0);
    if (parts.length === 0 || !Number.isFinite(geometryArea) || geometryArea <= 0) {
      plan.skipped.push({ key, reason: 'geometry_missing' });
      continue;
    }

    const oldLength = rows.every((row) => row.lengthM != null && Number.isFinite(row.lengthM) && row.lengthM > 0)
      ? rows.reduce((sum, row) => sum + (row.lengthM ?? 0), 0)
      : null;
    const geometryLength = parts.reduce((sum, part) => sum + part.lengthM, 0);
    const groupId = first.groupId ?? (parts.length > 1 ? first.id : null);
    const remarks = baseRemark(first.remarks);
    let assignedArea = 0;

    parts.forEach((part, index) => {
      const areaSqm = index === parts.length - 1
        ? oldArea - assignedArea
        : oldArea * part.areaSqm / geometryArea;
      assignedArea += areaSqm;
      const data: ResplitDamageValues = {
        groupId,
        facilityId: facility.id,
        station: isSam ? (part.sampleCode ?? part.stationText) : part.subSegmentCode,
        sampleCode: isSam ? (part.sampleCode ?? null) : null,
        type: first.type,
        severity: first.severity,
        status: first.status,
        lat: part.lat,
        lng: part.lng,
        localX: part.localX,
        localY: part.localY,
        rectJson: first.rectJson,
        lengthM: oldLength && geometryLength > 0
          ? oldLength * part.lengthM / geometryLength
          : part.lengthM,
        widthM: first.widthM ?? part.widthM,
        areaSqm,
        geometryType: first.geometryType,
        count: first.count,
        photoUrl: first.photoUrl,
        remarks: !isSam && parts.length > 1
          ? `${remarks ? `${remarks} (` : ''}Terpotong STA ${part.stationText}${remarks ? ')' : ''}`
          : remarks,
        reportedBy: first.reportedBy,
      };

      if (index < rows.length) plan.updates.push({ id: rows[index].id, data });
      else plan.creates.push({ ...data, createdAt: first.createdAt });
    });
    plan.deleteIds.push(...rows.slice(parts.length).map((row) => row.id));
    plan.updatedFindings++;
  }

  return plan;
}
