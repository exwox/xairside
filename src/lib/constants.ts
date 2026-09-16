// ===== Konstanta aplikasi monitoring airside =====

import type { DamageTypeEntry } from '@/types';
import airfieldCurves from './airfield-pci-curves.json';
import rigidCurves from './airfield-rigid-pci-curves.json';

export type Severity = 'L' | 'M' | 'H' | '-';

export const SEVERITIES: Severity[] = ['L', 'M', 'H', '-'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  L: 'Low (Rendah)',
  M: 'Medium (Sedang)',
  H: 'High (Tinggi)',
  '-': 'Tanpa Tingkat',
};

// Warna severity pada peta & UI
export const SEVERITY_COLORS: Record<Severity, string> = {
  L: '#eab308', // kuning
  M: '#f97316', // oranye
  H: '#ef4444', // merah
  '-': '#64748b', // tanpa tingkat
};

export const FACILITY_TYPE_LABEL: Record<string, string> = {
  RUNWAY: 'Runway',
  TAXIWAY: 'Taxiway',
  APRON: 'Apron',
};

export const FACILITY_TYPE_COLORS: Record<string, string> = {
  RUNWAY: '#38bdf8',
  TAXIWAY: '#a3e635',
  APRON: '#fbbf24',
};

export const DAMAGE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Terbuka',
  IN_PROGRESS: 'Dalam Penanganan',
  CLOSED: 'Selesai',
};

// Default (fallback) daftar jenis kerusakan & kode — digunakan jika belum ada config dari Admin
export const DEFAULT_DAMAGE_TYPES_CONFIG: DamageTypeEntry[] = [
  ...airfieldCurves.map(({ code, name }) => ({ code, name })),
  ...rigidCurves.map(({ code, name }) => ({ code, name })),
  { code: 'D-01', name: 'Crack Seal Rusak' },
  { code: 'D-02', name: 'FOD (Benda Asing)' },
  { code: 'D-03', name: 'Rubber Deposit Berlebih' },
  { code: 'D-04', name: 'Tumpahan Oli/BBM' },
  { code: 'D-05', name: 'Kerusakan Lampu Tepi/Taxiway Light' },
  { code: 'D-06', name: 'Drainase Tersumbat/Erosi' },
  { code: 'D-07', name: 'Kerusakan Marka' },
  { code: 'D-99', name: 'Lainnya' },
];

// Legacy arrays — dibangun dari DEFAULT untuk backward compat
export const DAMAGE_TYPES = DEFAULT_DAMAGE_TYPES_CONFIG.map((e) => e.name);

export const DAMAGE_CODES: Record<string, string> = Object.fromEntries(
  DEFAULT_DAMAGE_TYPES_CONFIG.map((e) => [e.name, e.code])
);

// Helper: build DAMAGE_TYPES list dari config (atau fallback ke default)
export function buildDamageTypes(cfg?: DamageTypeEntry[] | null): string[] {
  const src = cfg && cfg.length > 0 ? cfg : DEFAULT_DAMAGE_TYPES_CONFIG;
  return src.map((e) => e.name);
}

// Helper: build DAMAGE_CODES map dari config (atau fallback ke default)
export function buildDamageCodesMap(cfg?: DamageTypeEntry[] | null): Record<string, string> {
  const src = cfg && cfg.length > 0 ? cfg : DEFAULT_DAMAGE_TYPES_CONFIG;
  return Object.fromEntries(src.map((e) => [e.name, e.code]));
}

// Helper: get damage code from type name (runtime, accepts optional config)
export function getDamageCode(type: string, cfg?: DamageTypeEntry[] | null): string {
  const map = buildDamageCodesMap(cfg);
  if (map[type]) return map[type];
  const match = type.match(/A-\d+|D-\d+|[A-Z]+-\d+/);
  if (match) return match[0];
  return 'DMG';
}
export const MARKING_CONDITION_LABEL: Record<string, string> = {
  BAIK: 'Baik',
  PERLU_PERBAIKAN: 'Perlu Perbaikan',
  USANG: 'Usang',
};

export const MARKING_CONDITION_COLORS: Record<string, string> = {
  BAIK: '#22c55e',
  PERLU_PERBAIKAN: '#f59e0b',
  USANG: '#ef4444',
};

export const MARKING_TYPES: { group: string; types: string[] }[] = [
  {
    group: 'Runway',
    types: [
      'Threshold Marking',
      'Runway Designator (Nomor Runway)',
      'Centerline',
      'Touchdown Zone',
      'Aiming Point',
      'Edge Stripes',
      'Displaced Threshold',
      'Blast Pad Marking',
    ],
  },
  {
    group: 'Taxiway',
    types: [
      'Taxiway Centerline',
      'Taxiway Edge Marking',
      'Runway Holding Position',
      'Intermediate Holding Position',
      'ILS Critical Area Holding Position',
    ],
  },
  {
    group: 'Apron',
    types: [
      'Stand Centerline / Lead-in Line',
      'Lead-out Line',
      'Apron Safety Line',
      'Equipment Restraint Area',
      'Service Road Marking',
      'No Parking / Hatch Marking',
    ],
  },
];

export const DEFAULT_ARP = { lat: 0.9569, lng: 104.5311 }; // Bandara Raja Haji Fisabilillah (dapat diubah di pengaturan)
