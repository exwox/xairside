// Kurva ASPHALT berasal dari tabel sheet 1–16 PCI 2025 TNJ.xlsm.
// Kurva JPCP tetap menggunakan digitasi yang telah ada di aplikasi.
// unit: PERCENT = luas kerusakan (m²) | LENGTH = panjang retak (m) | COUNT = jumlah slab
// Untuk JPCP COUNT, density memakai jumlah slab sampel sebagai penyebut.

import airfieldCurves from './airfield-pci-curves.json';
import airfieldRigidCurves from './airfield-rigid-pci-curves.json';

export type SurfaceType = 'ASPHALT' | 'JPCP';
export type DistressSeverity = 'L' | 'M' | 'H' | '-';

export interface DistressDef {
  code: number;
  name: string;
  surface: SurfaceType;
  unit: 'PERCENT' | 'LENGTH' | 'COUNT';
  severities: DistressSeverity[];
  // Kurva [density 0–100, deduct value]. Sheet 4/H memuat DV 103.
  deducts: Partial<Record<DistressSeverity, [number, number][]>>;
}

export const ASPHALT_DISTRESSES: DistressDef[] = airfieldCurves.map((entry) => ({
  code: Number(entry.code.slice(2)),
  name: entry.name,
  surface: 'ASPHALT',
  // Joint reflection serta retak longitudinal/transversal diukur sepanjang
  // jalur retak; jenis flexible lainnya memakai luas permukaan terdampak.
  unit: entry.code === 'F-07' || entry.code === 'F-08' ? 'LENGTH' : 'PERCENT',
  severities: entry.severities as DistressSeverity[],
  deducts: Object.fromEntries(Object.entries(entry.points).map(([severity, points]) => [
    severity,
    (points as number[][]).map(([density, dv]) => [density, dv] as [number, number]),
  ])),
}));

// Workbook rigid berisi 14 sheet kurva (nomor sheet 5 dilewati). Kode publik
// R-01–R-14 mengikuti urutan sheet; angka internal 21–34 menjaga ruang kode
// terpisah dari ASPHALT. Semua tabel sumber menyatakan density dalam persen.
// Corner Break dan Linear Cracking memakai jumlah slab seperti input rigid lama;
// jenis lainnya memakai luas terdampak (m²) per luas unit sampel.
export const JPCP_DISTRESSES: DistressDef[] = airfieldRigidCurves.map((entry, index) => ({
  code: index + 21,
  name: entry.name,
  surface: 'JPCP',
  unit: index === 1 || index === 2 ? 'COUNT' : 'PERCENT',
  severities: entry.severities as DistressSeverity[],
  deducts: Object.fromEntries(Object.entries(entry.points).map(([severity, points]) => [
    severity,
    (points as number[][]).map(([density, dv]) => [density, dv] as [number, number]),
  ])),
}));

export function distressCatalog(surface: SurfaceType): DistressDef[] {
  return surface === 'ASPHALT' ? ASPHALT_DISTRESSES : JPCP_DISTRESSES;
}
