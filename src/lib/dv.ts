import { distressCatalog, type DistressDef, type DistressSeverity, type SurfaceType } from './pci-data';

export type DvSeverity = DistressSeverity;
export type DvPoint = [number, number];
export type DvCurveSet = Record<string, Partial<Record<DvSeverity, DvPoint[]>>>;

export function dvConfigKey(surface: SurfaceType): string {
  return surface === 'ASPHALT' ? 'pciDvCurvesAirfieldAsphalt' : 'pciDvCurvesAirfieldJpcp';
}

export function defaultDvCurveSet(surface: SurfaceType): DvCurveSet {
  return Object.fromEntries(distressCatalog(surface).map((definition) => [
    String(definition.code),
    Object.fromEntries(definition.severities.map((severity) => [
      severity,
      (definition.deducts[severity] ?? []).map(([density, dv]) => [density, dv] as DvPoint),
    ])),
  ]));
}

export function validateDvCurveSet(
  input: unknown,
  surface: SurfaceType
): { ok: true; curves: DvCurveSet } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Data kurva DV harus berupa objek per kode kerusakan.' };
  }
  const catalog = new Map(distressCatalog(surface).map((definition) => [String(definition.code), definition]));
  const curves: DvCurveSet = {};
  for (const [code, severityValues] of Object.entries(input)) {
    const definition = catalog.get(code);
    if (!definition) return { ok: false, error: `Kode ${code} tidak tersedia pada katalog PCI ${surface}.` };
    if (!severityValues || typeof severityValues !== 'object' || Array.isArray(severityValues)) {
      return { ok: false, error: `Kurva DV kode ${code} harus berisi severity yang berlaku.` };
    }
    const validated: Partial<Record<DvSeverity, DvPoint[]>> = {};
    for (const [severity, rawPoints] of Object.entries(severityValues)) {
      if (!definition.severities.includes(severity as DvSeverity)) {
        return { ok: false, error: `Severity ${severity} tidak berlaku untuk kode ${code}.` };
      }
      const maxDv = surface === 'ASPHALT' && definition.code === 4 && severity === 'H' ? 103 : 100;
      if (!Array.isArray(rawPoints) || rawPoints.length < 2 || rawPoints.length > 200) {
        return { ok: false, error: `Kurva ${code}/${severity} memerlukan 2–200 titik.` };
      }
      const points: DvPoint[] = [];
      for (const [index, point] of rawPoints.entries()) {
        if (!Array.isArray(point) || point.length !== 2
          || typeof point[0] !== 'number' || typeof point[1] !== 'number'
          || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
          || point[0] < 0 || point[0] > 100 || point[1] < 0 || point[1] > maxDv) {
          return { ok: false, error: `Titik ${index + 1} pada kurva ${code}/${severity} harus berisi density 0–100 dan DV 0–${maxDv}.` };
        }
        if (index > 0 && (point[0] <= points[index - 1][0]
          || (surface === 'ASPHALT' && point[1] < points[index - 1][1]))) {
          return { ok: false, error: surface === 'ASPHALT'
            ? `Density ${code}/${severity} harus naik unik dan DV tidak boleh menurun.`
            : `Density ${code}/${severity} harus naik unik.` };
        }
        points.push([point[0], point[1]]);
      }
      validated[severity as DvSeverity] = points;
    }
    if (Object.keys(validated).length === 0) {
      return { ok: false, error: `Kode ${code} tidak memiliki kurva DV.` };
    }
    curves[code] = validated;
  }
  return { ok: true, curves };
}

export function parseDvCurveSet(raw: string | null | undefined, surface: SurfaceType): DvCurveSet | null {
  if (!raw) return null;
  try {
    const validated = validateDvCurveSet(JSON.parse(raw), surface);
    return validated.ok ? validated.curves : null;
  } catch {
    return null;
  }
}

export function mergedDvCurveSet(surface: SurfaceType, overrides?: DvCurveSet | null): DvCurveSet {
  const result = defaultDvCurveSet(surface);
  if (!overrides) return result;
  for (const [code, severities] of Object.entries(overrides)) {
    if (!result[code]) continue;
    const definition = distressCatalog(surface).find((entry) => String(entry.code) === code);
    if (!definition) continue;
    for (const severity of definition.severities) {
      if (severities[severity]) result[code][severity] = severities[severity]?.map(([density, dv]) => [density, dv]);
    }
  }
  return result;
}

export function compactDvCurveSet(surface: SurfaceType, effective: DvCurveSet): DvCurveSet {
  const defaults = defaultDvCurveSet(surface);
  const compact: DvCurveSet = {};
  for (const [code, severities] of Object.entries(effective)) {
    const definition = distressCatalog(surface).find((entry) => String(entry.code) === code);
    if (!definition) continue;
    for (const severity of definition.severities) {
      const points = severities[severity];
      if (points && JSON.stringify(points) !== JSON.stringify(defaults[code]?.[severity])) {
        compact[code] ??= {};
        compact[code][severity] = points.map(([density, dv]) => [density, dv]);
      }
    }
  }
  return compact;
}

export function catalogWithDvCurves(surface: SurfaceType, overrides?: DvCurveSet | null): DistressDef[] {
  const effective = mergedDvCurveSet(surface, overrides);
  return distressCatalog(surface).map((definition) => ({
    ...definition,
    severities: [...definition.severities],
    deducts: Object.fromEntries(definition.severities.map((severity) => [
      severity,
      effective[String(definition.code)]?.[severity]?.map(([density, dv]) => [density, dv] as DvPoint) ?? [],
    ])),
  }));
}
