import type { AppConfig, Damage, Facility, PciSection } from '@/types';
import type { CdvCurveSet } from './cdv';
import type { DvCurveSet } from './dv';
import type { SurfaceType } from './pci-data';
import { buildPciCalculationRow } from './pci-calculation-table';
import { buildPciFacilityTable } from './pci-location-table';

export interface PciFacilityCurves {
  cdv: CdvCurveSet;
  dv: DvCurveSet;
}

/** Match the average displayed in the PCI facility table. */
export function calculateFacilityPciAverage(
  facility: Facility,
  damages: Damage[],
  config: AppConfig,
  curves: Partial<Record<SurfaceType, PciFacilityCurves>>,
): number | null {
  const surfaceType: SurfaceType | null = facility.surfaceType === 'CONCRETE'
    ? 'JPCP' : facility.surfaceType === 'ASPHALT' ? 'ASPHALT' : null;
  const activeCurves = surfaceType ? curves[surfaceType] : null;
  if (!surfaceType || !activeCurves) return null;

  const table = buildPciFacilityTable(facility, damages, config.arpLat, config.arpLng);
  if (table.rows.length === 0) return null;
  const correction = facility.pciCorrection ?? 100;
  const catalog = config.damageCatalogs?.[surfaceType];
  const total = table.rows.reduce((sum, row) => sum + buildPciCalculationRow(
    row, surfaceType, config.damageTypesConfig,
    activeCurves.cdv, activeCurves.dv, catalog, correction,
  ).pci, 0);
  return total / table.rows.length;
}

export function latestPciForFacilities(
  facilities: Facility[],
  sections: PciSection[],
  currentPciByFacility: Record<string, number | null>,
): Record<string, number | null> {
  const latestSurvey = new Map<string, PciSection>();
  for (const section of sections) {
    if (!section.facilityId || section.lastPci == null) continue;
    const previous = latestSurvey.get(section.facilityId);
    if (!previous || (section.lastSurveyAt ?? '') > (previous.lastSurveyAt ?? '')) {
      latestSurvey.set(section.facilityId, section);
    }
  }
  return Object.fromEntries(facilities.map((facility) => [
    facility.id,
    latestSurvey.get(facility.id)?.lastPci ?? currentPciByFacility[facility.id] ?? null,
  ]));
}
