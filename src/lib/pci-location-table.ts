import type { Damage, Facility } from '@/types';
import {
  computePolygonMetrics,
  findSampleCodeForPoint,
  formatStationSegment,
  generateFacilityConcreteBlocksSnapped,
  generateFacilitySampleGridsSnapped,
  getFacilityStationIntervalM,
  getFacilityStationOffsetM,
  type LatLng,
} from './geo';

export type PciLocationMode = 'STA' | 'SAM';

export interface PciLocationRow {
  key: string;
  label: string;
  areaSqm: number | null;
  slabCount?: number | null;
  damages: Damage[];
}

export interface PciFacilityTable {
  facility: Facility;
  mode: PciLocationMode;
  stationIntervalM: number | null;
  rows: PciLocationRow[];
  unmapped: Damage[];
}

function parseFacilityPolygon(json: string | null): LatLng[] | undefined {
  if (!json) return undefined;
  try {
    const points = JSON.parse(json) as unknown;
    if (
      Array.isArray(points)
      && points.length >= 3
      && points.every((point) =>
        point !== null
        && typeof point === 'object'
        && Number.isFinite((point as LatLng).lat)
        && Number.isFinite((point as LatLng).lng)
      )
    ) {
      return points as LatLng[];
    }
  } catch {
    // Polygon lama yang tidak valid tidak boleh memutus seluruh tabel PCI.
  }
  return undefined;
}

function stationRangeFromText(station: string | null): { startM: number; endM: number | null } | null {
  if (!station) return null;
  const matches = [...station.matchAll(/\bSTA\s*(\d+)\+(\d{1,3}(?:\.\d+)?)(?!\d)/gi)];
  if (matches.length === 0) return null;
  const distance = (match: RegExpMatchArray) => Number(match[1]) * 1000 + Number(match[2]);
  return { startM: distance(matches[0]), endM: matches[1] ? distance(matches[1]) : null };
}

function sampleParentCode(value: string | null | undefined): string | null {
  const match = value?.match(/\bSAM-(\d+)\b/i);
  return match ? `SAM-${Number(match[1])}` : null;
}

/**
 * Read-only inventory of recorded damage parts per STA or SAM. A damage that
 * spans several locations is already split into separate DB rows; preserve each
 * part's area and never collapse the groupId before locating it.
 */
export function buildPciFacilityTable(
  facility: Facility,
  facilityDamages: Damage[],
  arpLat: number,
  arpLng: number
): PciFacilityTable {
  const polygon = parseFacilityPolygon(facility.polygonJson);
  const mode: PciLocationMode = facility.locationMode === 'SAM' || facility.surfaceType === 'CONCRETE'
    ? 'SAM'
    : 'STA';
  const damages = facilityDamages.filter((damage) => damage.facilityId === facility.id);
  const rows: PciLocationRow[] = [];
  const unmapped: Damage[] = [];
  let stationIntervalM: number | null = null;

  if (mode === 'STA') {
    stationIntervalM = getFacilityStationIntervalM(facility);
    const metrics = polygon ? computePolygonMetrics(polygon, arpLat, arpLng) : null;
    const lengthM = metrics && metrics.lengthM > 0
      ? metrics.lengthM
      : (facility.lengthM && facility.lengthM > 0 ? facility.lengthM : 0);
    const totalAreaSqm = metrics && metrics.areaSqm > 0
      ? metrics.areaSqm
      : (facility.areaSqm && facility.areaSqm > 0
        ? facility.areaSqm
        : (facility.widthM && facility.widthM > 0 ? lengthM * facility.widthM : null));
    const count = Math.ceil(lengthM / stationIntervalM);
    for (let index = 0; index < count; index++) {
      const segment = formatStationSegment(index * stationIntervalM, lengthM, stationIntervalM);
      rows.push({
        key: `STA-${index}`,
        label: segment.stationText,
        areaSqm: totalAreaSqm == null || lengthM <= 0
          ? null
          : (segment.staEndM - segment.staStartM) * totalAreaSqm / lengthM,
        damages: [],
      });
    }

    for (const damage of damages) {
      const range = stationRangeFromText(damage.station);
      const hasExplicitSta = /\bSTA(?=\s|\d|$)/i.test(damage.station ?? '');
      if (hasExplicitSta && (!range || range.startM > lengthM
        || (range.endM != null && (range.endM < range.startM || range.endM > lengthM)))) {
        unmapped.push(damage);
        continue;
      }
      let offsetM = range?.startM ?? null;
      if (!hasExplicitSta) {
        const computed = getFacilityStationOffsetM(
          facility,
          { lat: damage.lat, lng: damage.lng },
          arpLat,
          arpLng
        );
        offsetM = computed?.offsetM ?? null;
      }
      if (hasExplicitSta && range?.endM != null && range.endM > range.startM) {
        if (damage.geometryType === 'POINT' || damage.geometryType === 'SLAB' || damage.count != null) {
          const midpoint = (range.startM + range.endM) / 2;
          const index = Math.min(count - 1, Math.floor(midpoint / stationIntervalM));
          if (rows[index]) rows[index].damages.push(damage);
          else unmapped.push(damage);
          continue;
        }
        // Temuan lama dapat tersimpan per 10 m. Jika batas PCI memotongnya,
        // alokasikan luas secara proporsional tanpa mengubah catatan sumber.
        const firstIndex = Math.floor(range.startM / stationIntervalM);
        const lastIndex = Math.min(count - 1, Math.ceil(range.endM / stationIntervalM) - 1);
        for (let index = firstIndex; index <= lastIndex; index++) {
          const overlap = Math.min(range.endM, (index + 1) * stationIntervalM)
            - Math.max(range.startM, index * stationIntervalM);
          if (overlap > 0 && rows[index]) {
            const fraction = overlap / (range.endM - range.startM);
            rows[index].damages.push({
              ...damage,
              areaSqm: damage.areaSqm * fraction,
              lengthM: damage.lengthM == null ? null : damage.lengthM * fraction,
            });
          }
        }
        continue;
      }
      const index = offsetM == null || !Number.isFinite(offsetM)
        ? -1
        : Math.min(count - 1, Math.floor(offsetM / stationIntervalM));
      if (index >= 0 && index < rows.length) rows[index].damages.push(damage);
      else unmapped.push(damage);
    }
  } else {
    const polygonAreaSqm = polygon ? computePolygonMetrics(polygon, arpLat, arpLng).areaSqm : 0;
    const hasSizedCenter = Number.isFinite(facility.centroidLat)
      && Number.isFinite(facility.centroidLng)
      && (facility.lengthM ?? 0) > 0
      && (facility.widthM ?? 0) > 0;
    if (polygonAreaSqm <= 0 && !hasSizedCenter) {
      return { facility, mode, stationIntervalM, rows, unmapped: damages };
    }
    const sampleGrids = generateFacilitySampleGridsSnapped(facility, arpLat, arpLng, polygon);

    const blocks = facility.surfaceType === 'CONCRETE'
      ? generateFacilityConcreteBlocksSnapped(facility, polygon)
      : [];
    if (blocks.length > 0) {
      const areas = new Map<string, number>();
      const slabCounts = new Map<string, number>();
      for (const block of blocks) {
        areas.set(block.sampleCode, (areas.get(block.sampleCode) ?? 0) + block.areaSqm);
        slabCounts.set(block.sampleCode, (slabCounts.get(block.sampleCode) ?? 0) + 1);
      }
      for (const [sampleCode, areaSqm] of areas) {
        rows.push({
          key: sampleCode,
          label: sampleCode,
          areaSqm,
          slabCount: slabCounts.get(sampleCode) ?? null,
          damages: [],
        });
      }
    } else {
      for (const grid of sampleGrids) {
        rows.push({
          key: grid.sampleCode,
          label: grid.sampleCode,
          areaSqm: grid.areaSqm,
          damages: [],
        });
      }
    }

    const byCode = new Map(rows.map((row) => [row.key, row]));
    const geometryCells = blocks.length > 0 ? blocks : sampleGrids;
    for (const damage of damages) {
      const recordedCode = sampleParentCode(damage.sampleCode)
        ?? sampleParentCode(damage.station);
      let row = recordedCode ? byCode.get(recordedCode) : undefined;
      const hasExplicitSam = /\bSAM-/i.test(`${damage.sampleCode ?? ''} ${damage.station ?? ''}`);
      if (!row && !hasExplicitSam && Number.isFinite(damage.lat) && Number.isFinite(damage.lng)) {
        const geometryCode = findSampleCodeForPoint(damage.lat, damage.lng, geometryCells);
        row = geometryCode ? byCode.get(geometryCode) : undefined;
      }
      if (row) row.damages.push(damage);
      else unmapped.push(damage);
    }
  }

  return { facility, mode, stationIntervalM, rows, unmapped };
}

export function countRecordedFindings(damages: Damage[]): number {
  return new Set(damages.map((damage) => damage.groupId || damage.id)).size;
}

export function recordedDamageAreaSqm(damages: Damage[]): number {
  return damages.reduce((sum, damage) => sum + (
    (!damage.geometryType || damage.geometryType === 'POLYGON') && Number.isFinite(damage.areaSqm)
      ? damage.areaSqm : 0
  ), 0);
}
