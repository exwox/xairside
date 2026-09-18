import type { BackupMetadata } from '@/lib/backup-service';

export type BackupType = 'AIRPORT' | 'FULL_SYSTEM';
export type MergeMode = 'REPLACE' | 'MERGE';

export interface BackupDataCount {
  inspections: number;
  damages: number;
  markings: number;
  pciSurveys: number;
  facilities: number;
  mapLayers: number;
  users?: number;
  airports?: number;
}

export const PHOTO_URL_PREFIX = '/uploads/damages/';

export function isBackupType(value: unknown): value is BackupType {
  return value === 'AIRPORT' || value === 'FULL_SYSTEM';
}

export function normalizeMergeMode(value: unknown): MergeMode {
  return typeof value === 'string' && value.trim().toUpperCase() === 'MERGE' ? 'MERGE' : 'REPLACE';
}

export function toText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Prisma P2002 = pelanggaran unique constraint (dipakai saat mode MERGE). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

export function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

export function parseDataCount(value: unknown): BackupDataCount {
  let source: unknown = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { inspections: 0, damages: 0, markings: 0, pciSurveys: 0, facilities: 0, mapLayers: 0 };
  }
  const record = source as Record<string, unknown>;
  const pick = (key: string): number => {
    const parsed = Number(record[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return {
    inspections: pick('inspections'),
    damages: pick('damages'),
    markings: pick('markings'),
    pciSurveys: pick('pciSurveys'),
    facilities: pick('facilities'),
    mapLayers: pick('mapLayers'),
    users: 'users' in record ? pick('users') : undefined,
    airports: 'airports' in record ? pick('airports') : undefined,
  };
}

/** Metadata backup boleh dikirim sebagai object (data.json) atau string (isi file metadata.json). */
export function parseBackupMetadata(raw: unknown): BackupMetadata | null {
  let source: unknown = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  if (!isBackupType(record.backupType)) return null;
  return {
    version: toText(record.version) ?? '1.0',
    timestamp: toText(record.timestamp) ?? new Date().toISOString(),
    backupType: record.backupType,
    airportId: toText(record.airportId),
    airportCode: toText(record.airportCode),
    includePhotos: record.includePhotos === true,
    format: record.format === 'SQL' ? 'SQL' : 'JSON',
    photoCount: toNullableNumber(record.photoCount) ?? undefined,
    missingPhotos: toNullableNumber(record.missingPhotos) ?? undefined,
    dataCount: parseDataCount(record.dataCount),
  };
}

function collectAirportPhotoUrls(airport: unknown, urls: Set<string>) {
  if (!airport || typeof airport !== 'object') return;
  const record = airport as Record<string, unknown>;
  const push = (value: unknown) => {
    const url = toText(value);
    if (url && url.startsWith(PHOTO_URL_PREFIX)) urls.add(url);
  };
  for (const damage of asArray(record.damages)) push(damage.photoUrl);
  for (const marking of asArray(record.markings)) push(marking.photoUrl);
  for (const inspection of asArray(record.inspections)) {
    for (const detail of asArray(inspection.details)) push(detail.photoUrl);
  }
}

/** Kumpulkan semua URL foto (kerusakan, marka, detail inspeksi) dari payload backup. */
export function collectPhotoUrls(data: unknown, backupType: BackupType): string[] {
  const urls = new Set<string>();
  if (backupType === 'AIRPORT') {
    collectAirportPhotoUrls(data, urls);
  } else {
    const record = (data ?? {}) as Record<string, unknown>;
    for (const airport of asArray(record.airports)) collectAirportPhotoUrls(airport, urls);
  }
  return [...urls];
}

export interface AirportBackupEntry {
  airport: Record<string, unknown> | null;
  payload: Record<string, unknown>;
}

/**
 * Samakan bentuk payload backup per-bandara dan full-system supaya logika restore
 * hanya perlu menangani satu bentuk: `{ airport, payload }`.
 */
export function airportBackupEntries(backupData: unknown, backupType: BackupType): AirportBackupEntry[] {
  const record = (backupData ?? {}) as Record<string, unknown>;
  if (backupType === 'AIRPORT') {
    const airport = record.airport && typeof record.airport === 'object' ? (record.airport as Record<string, unknown>) : null;
    return [{ airport, payload: record }];
  }
  return asArray(record.airports).map((airport) => ({ airport, payload: airport }));
}
