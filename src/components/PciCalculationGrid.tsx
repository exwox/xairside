'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Download, ExternalLink, Printer, X } from 'lucide-react';
import type { DamageTypeEntry } from '@/types';
import { validateCdvCurveSet, type CdvCurveSet } from '@/lib/cdv';
import { validateDvCurveSet, type DvCurveSet } from '@/lib/dv';
import type { SurfaceDamageCatalogEntry } from '@/lib/damage-catalog';
import { buildPciCalculationRow, type PciCalculationRow } from '@/lib/pci-calculation-table';
import { generatePciReportPdf } from '@/lib/pci-pdf';
import { pciRating } from '@/lib/pci';
import type { PciFacilityTable, PciLocationRow } from '@/lib/pci-location-table';
import type { SurfaceType } from '@/lib/pci-data';

interface PciCalculationGridProps {
  table: PciFacilityTable;
  damageTypesConfig?: DamageTypeEntry[] | null;
  damageCatalog?: SurfaceDamageCatalogEntry[] | null;
  showDvIterationsDefault?: boolean;
  pciCorrection?: number;
  onPciCorrectionChange?: (value: number) => void;
  onPciAverageChange?: (average: number | null) => void;
}

const PAGE_SIZE = 30;
const DV_COLUMNS = Array.from({ length: 10 }, (_, index) => index + 1);

interface CurveLoadResult {
  table: PciFacilityTable;
  surfaceType: SurfaceType;
  cdvCurves: CdvCurveSet | null;
  dvCurves: DvCurveSet | null;
  cdvSource: 'database' | 'default' | null;
  dvSource: 'database' | 'default' | null;
}

function decimal(value: number | null | undefined, places = 2): string {
  return value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('id-ID', { minimumFractionDigits: places, maximumFractionDigits: places });
}

function RowStatus({ calculation }: { calculation: PciCalculationRow }) {
  if (calculation.state !== 'unsupported') {
    const rating = calculation.rating ?? pciRating(calculation.pci);
    return (
      <span
        className="inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-tight"
        style={{ color: rating.color, borderColor: rating.color, backgroundColor: '#ffffff' }}
      >
        {rating.label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-amber-900"
      title={calculation.diagnostics.join(' ')}
    >
      Belum dapat dihitung
    </span>
  );
}

function CalculationLocationRows({
  location,
  calculation,
  number,
  showDvIterations,
}: {
  location: PciLocationRow;
  calculation: PciCalculationRow;
  number: number;
  showDvIterations: boolean;
}) {
  const rowCount = Math.max(1, calculation.lines.length, calculation.iterations.length);
  const background = number % 2 === 0 ? 'bg-indigo-50/60' : 'bg-white';
  const firstRowBackground = number % 2 === 0 ? 'bg-indigo-50' : 'bg-white';
  const totalQ = calculation.sortedDvs.filter((value) => value >= 5).length;

  return Array.from({ length: rowCount }, (_, index) => {
    const first = index === 0;
    const line = calculation.lines[index];
    const iteration = calculation.iterations[index];
    return (
      <tr key={`${location.key}-${index}`} className={`${background} border-b border-slate-200 text-[11px] leading-tight text-slate-700 hover:bg-sky-50`}>
        <td className={`sticky left-0 z-[1] w-9 px-1 py-1 text-center font-semibold ${firstRowBackground}`}>
          {first ? number : ''}
        </td>
        <td className={`sticky left-9 z-[1] min-w-32 border-r border-slate-200 px-1.5 py-1 font-mono font-semibold text-sky-800 ${firstRowBackground}`}>
          {first && <><span>{location.label}</span><span className="block font-sans text-[9px] font-normal text-slate-500">Unit {decimal(location.areaSqm, 1)} m²{location.slabCount ? ` · ${location.slabCount} slab` : ''}{calculation.closedFindingCount > 0 ? ` · ${calculation.closedFindingCount} selesai` : ''}</span></>}
        </td>
        <td className="min-w-32 px-1.5 py-1 leading-snug">{line?.type ?? (first ? 'Belum ada kerusakan aktif' : '')}</td>
        <td className="whitespace-nowrap px-1.5 py-1 font-mono font-semibold text-amber-800">{line?.code ?? '—'}</td>
        <td className="px-1 py-1 text-center font-bold">{line?.severity ?? '—'}</td>
        <td className="whitespace-nowrap px-1.5 py-1 text-right font-mono">{line ? `${decimal(line.volume)} ${line.unit ?? ''}` : '—'}</td>
        <td className="whitespace-nowrap px-1.5 py-1 text-right font-mono">{line?.density == null ? '—' : `${decimal(line.density, 3)}%`}</td>
        <td className="px-1.5 py-1 text-right font-mono font-bold text-orange-700" title={line?.diagnostic ?? undefined}>{decimal(line?.dv, 1)}</td>
        <td className="px-1.5 py-1 text-right font-mono">{decimal(calculation.sortedDvs[index], 1)}</td>
        <td className="px-1.5 py-1 text-right font-mono text-sky-700">{first ? decimal(calculation.allowableDeducts, 2) : '—'}</td>
        <td className="px-1.5 py-1 text-right font-mono">{first && calculation.state === 'calculated' ? totalQ : '—'}</td>
        {showDvIterations && DV_COLUMNS.map((column) => (
          <td key={column} className="px-1.5 py-1 text-right font-mono text-amber-800">
            {decimal(iteration?.deductValues[column - 1], 1)}
          </td>
        ))}
        <td className="px-1.5 py-1 text-right font-mono">{iteration?.q ?? '—'}</td>
        <td className="px-1.5 py-1 text-right font-mono">{decimal(iteration?.totalDv, 1)}</td>
        <td className="px-1.5 py-1 text-right font-mono font-bold text-orange-700">{decimal(iteration?.cdv, 1)}</td>
        <td className="px-1.5 py-1 text-right font-mono font-extrabold text-emerald-700">{first ? decimal(calculation.maxCdv, 2) : '—'}</td>
        <td className="px-1.5 py-1 text-right font-mono font-extrabold text-sky-700">{first ? decimal(calculation.pci, 2) : '—'}</td>
        <td className="min-w-28 px-1.5 py-1 text-center">{first && <RowStatus calculation={calculation} />}</td>
      </tr>
    );
  });
}

const PCI_CATEGORIES = [
  { label: 'Excellent', min: 86, color: '#15803d' },
  { label: 'Very Good', min: 71, color: '#22c55e' },
  { label: 'Good', min: 56, color: '#84cc16' },
  { label: 'Fair', min: 41, color: '#eab308' },
  { label: 'Poor', min: 26, color: '#f97316' },
  { label: 'Very Poor', min: 11, color: '#ef4444' },
  { label: 'Failed', min: 0, color: '#7f1d1d' },
];

const UNSUPPORTED_BAR_STYLES = {
  backgroundColor: '#f59e0b',
  backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 3px, transparent 3px 6px)',
} as const;

function PciBarChart({
  table,
  calculations,
}: {
  table: PciFacilityTable;
  calculations: PciCalculationRow[];
}) {
  const valid = calculations.filter((calculation) => Number.isFinite(calculation.pci));
  const average = valid.length > 0
    ? valid.reduce((sum, calculation) => sum + calculation.pci, 0) / valid.length
    : null;
  const maxPci = valid.length > 0 ? Math.max(...valid.map((calculation) => calculation.pci)) : null;
  const minPci = valid.length > 0 ? Math.min(...valid.map((calculation) => calculation.pci)) : null;
  const unsupportedCount = calculations.filter((calculation) => calculation.state === 'unsupported').length;
  const ratingCounts = useMemo(() => {
    const counts = new Map<string, number>(PCI_CATEGORIES.map((category) => [category.label, 0]));
    for (const calculation of calculations) {
      if (calculation.state === 'unsupported' || !Number.isFinite(calculation.pci)) continue;
      const label = calculation.rating?.label ?? pciRating(calculation.pci).label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return counts;
  }, [calculations]);
  const labelEvery = Math.max(1, Math.ceil(table.rows.length / 32));

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          Semua <strong className="text-slate-800">{table.rows.length}</strong>{' '}
          {table.mode === 'SAM' ? 'sampel' : 'STA'} · skala PCI 0–100
        </span>
        <span className="font-mono">
          Terendah <strong className="text-red-700">{decimal(minPci, 1)}</strong> · Tertinggi{' '}
          <strong className="text-emerald-700">{decimal(maxPci, 1)}</strong> · Rata-rata{' '}
          <strong className="text-sky-700">{decimal(average, 1)}</strong>
        </span>
      </div>
      <div className="relative mt-2 h-48 rounded-lg border border-slate-200 bg-white px-1 shadow-sm">
        <div className="absolute inset-x-0 bottom-5 top-0 px-1" aria-hidden="true">
          {PCI_CATEGORIES.filter((category) => category.min > 0).map((category) => (
            <div key={category.label} className="absolute inset-x-0" style={{ bottom: `${category.min}%` }}>
              <div className="border-t border-dashed border-slate-300/70" />
              <span className="absolute -top-2 right-0 font-mono text-[8px] font-bold leading-none text-slate-400">
                {category.min}
              </span>
            </div>
          ))}
          {average != null && (
            <div className="absolute inset-x-0" style={{ bottom: `${average}%` }}>
              <div className="border-t-2 border-dashed border-sky-500" />
              <span className="absolute -top-2 right-0 rounded-sm bg-sky-600 px-0.5 font-mono text-[8px] font-bold leading-none text-white">
                {decimal(average, 1)}
              </span>
            </div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-full items-end gap-[2px] px-1">
          {table.rows.map((location, index) => {
            const calculation = calculations[index];
            const unsupported = calculation?.state === 'unsupported';
            const rating = calculation?.rating ?? pciRating(calculation?.pci ?? 0);
            const pci = calculation && Number.isFinite(calculation.pci)
              ? Math.min(100, Math.max(0, calculation.pci))
              : 0;
            const showLabel = index % labelEvery === 0;
            return (
              <div
                key={location.key}
                title={`${location.label} · PCI ${decimal(calculation?.pci, 1)} · ${unsupported ? 'Belum dapat dihitung' : rating.label}`}
                className="group relative flex h-full min-w-0 flex-1 flex-col"
              >
                <div className="relative h-full flex-1">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-[3px] transition-[filter] duration-150 group-hover:brightness-110 group-hover:drop-shadow-md"
                    style={{
                      height: `${pci}%`,
                      backgroundColor: unsupported ? UNSUPPORTED_BAR_STYLES.backgroundColor : rating.color,
                      backgroundImage: unsupported ? UNSUPPORTED_BAR_STYLES.backgroundImage : undefined,
                    }}
                  />
                </div>
                <div className="h-5 select-none overflow-visible text-center">
                  {showLabel && (
                    <span className="whitespace-nowrap font-mono text-[8px] font-semibold text-slate-400">
                      {index + 1}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-200 pt-2 text-[10px] text-slate-600">
        {PCI_CATEGORIES.map((category) => {
          const count = ratingCounts.get(category.label) ?? 0;
          if (count === 0) return null;
          return (
            <span key={category.label} className="inline-flex items-center gap-1">
              <i className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: category.color }} />
              {category.label} <strong className="font-mono font-bold">{count}</strong>
            </span>
          );
        })}
        {unsupportedCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <i
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{
                backgroundColor: UNSUPPORTED_BAR_STYLES.backgroundColor,
                backgroundImage: UNSUPPORTED_BAR_STYLES.backgroundImage,
              }}
            />
            Belum dapat dihitung <strong className="font-mono font-bold">{unsupportedCount}</strong>
          </span>
        )}
        {average != null && (
          <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
            <i className="h-0 w-4 border-t-2 border-dashed border-sky-500" /> Rata-rata {decimal(average, 1)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PciCalculationGrid({
  table,
  damageTypesConfig,
  damageCatalog,
  showDvIterationsDefault,
  pciCorrection = 100,
  onPciCorrectionChange,
  onPciAverageChange,
}: PciCalculationGridProps) {
  const [page, setPage] = useState(1);
  // Kolom digitasi DV 1–10 disembunyikan secara default agar tabel rapat; toggle di bar ringkasan menampilkannya.
  const [showDvIterations, setShowDvIterations] = useState(showDvIterationsDefault ?? false);
  const [curveResult, setCurveResult] = useState<CurveLoadResult | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [pdfError, setPdfError] = useState('');
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const closePreviewButtonRef = useRef<HTMLButtonElement>(null);
  const surfaceType: SurfaceType | null = table.facility.surfaceType === 'CONCRETE'
    ? 'JPCP'
    : table.facility.surfaceType === 'ASPHALT' ? 'ASPHALT' : null;

  useEffect(() => {
    if (!surfaceType) return;
    let active = true;
    const loadCdv = async (): Promise<{ curves: CdvCurveSet; source: 'database' | 'default' }> => {
      const response = await fetch(`/api/pci/cdv-curves?surfaceType=${surfaceType}`);
      if (!response.ok) throw new Error('Kurva CDV gagal dimuat.');
      const data = await response.json() as { curves?: unknown; source?: unknown };
      const validated = validateCdvCurveSet(data.curves, surfaceType);
      if (!validated.ok || !validated.curves || (data.source !== 'database' && data.source !== 'default')) {
        throw new Error('Data kurva CDV tidak valid.');
      }
      return { curves: validated.curves, source: data.source };
    };
    const loadDv = async (): Promise<{ curves: DvCurveSet; source: 'database' | 'default' }> => {
      const response = await fetch(`/api/pci/dv-curves?surfaceType=${surfaceType}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Kurva DV gagal dimuat.');
      const data = await response.json() as { curves?: unknown; source?: unknown };
      const validated = validateDvCurveSet(data.curves, surfaceType);
      if (!validated.ok || (data.source !== 'database' && data.source !== 'default')) {
        throw new Error('Data kurva DV tidak valid.');
      }
      return { curves: validated.curves, source: data.source };
    };
    Promise.allSettled([loadCdv(), loadDv()]).then(([cdv, dv]) => {
      if (!active) return;
      setCurveResult({
        table, surfaceType,
        cdvCurves: cdv.status === 'fulfilled' ? cdv.value.curves : null,
        dvCurves: dv.status === 'fulfilled' ? dv.value.curves : null,
        cdvSource: cdv.status === 'fulfilled' ? cdv.value.source : null,
        dvSource: dv.status === 'fulfilled' ? dv.value.source : null,
      });
    });
    return () => { active = false; };
  }, [table, surfaceType]);

  const currentCurve = curveResult?.table === table && curveResult.surfaceType === surfaceType
    ? curveResult
    : null;
  const cdvCurves = currentCurve?.cdvCurves ?? null;
  const dvCurves = currentCurve?.dvCurves ?? null;
  const calculations = useMemo(() => table.rows.map((row) =>
    buildPciCalculationRow(row, surfaceType, damageTypesConfig, cdvCurves, dvCurves, damageCatalog, pciCorrection)
  ), [table.rows, surfaceType, damageTypesConfig, cdvCurves, dvCurves, damageCatalog, pciCorrection]);
  const pciAverage = useMemo(() => {
    if (calculations.length === 0) return null;
    const total = calculations.reduce((sum, row) => !Number.isFinite(row.pci) ? sum : sum + row.pci, 0);
    return total / calculations.length;
  }, [calculations]);
  useEffect(() => {
    onPciAverageChange?.(pciAverage);
  }, [pciAverage, onPciAverageChange]);
  const pdfPreparing = surfaceType != null && currentCurve == null;
  const handlePreviewPdf = useCallback(() => {
    if (pdfPreparing) return;
    try {
      setPdfError('');
      const doc = generatePciReportPdf({
        table,
        calculations,
        pciCorrection,
        pciAverage,
        generatedAt: new Date(),
      });
      const stamp = new Date().toISOString().slice(0, 10);
      setPdfPreview({
        url: URL.createObjectURL(doc.output('blob')),
        filename: `${table.facility.code}-Laporan-PCI-${stamp}.pdf`,
      });
    } catch {
      setPdfError('Pratinjau PDF gagal dibuat. Coba lagi.');
    }
  }, [table, calculations, pciCorrection, pciAverage, pdfPreparing]);
  useEffect(() => {
    if (!pdfPreview) return;
    const previewButton = previewButtonRef.current;
    closePreviewButtonRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPdfPreview(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      URL.revokeObjectURL(pdfPreview.url);
      previewButton?.focus();
    };
  }, [pdfPreview]);
  const totalPages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleRows = table.rows.slice(start, start + PAGE_SIZE);
  const summary = {
    calculated: calculations.filter((row) => row.state === 'calculated').length,
    unsupported: calculations.filter((row) => row.state === 'unsupported').length,
    unassessed: calculations.filter((row) => row.state === 'unassessed').length,
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 text-xs text-slate-600">
        <span>
          <strong className="text-slate-800">{summary.calculated}</strong> terhitung ·{' '}
          <strong className="text-amber-800">{summary.unsupported}</strong> belum dapat dihitung ·{' '}
          <strong>{summary.unassessed}</strong> belum dinilai
        </span>
        <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50">
          <input
            type="checkbox"
            checked={showDvIterations}
            onChange={(event) => setShowDvIterations(event.target.checked)}
            className="h-3.5 w-3.5 accent-sky-600"
          />
          Iterasi DV 1–10
        </label>
        <label className="flex select-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700">
          PCI Koreksi =
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={pciCorrection}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed) && event.target.value.trim() !== '') {
                onPciCorrectionChange?.(Math.min(100, Math.max(0, parsed)));
              }
            }}
            className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right font-mono text-xs font-bold text-sky-800"
            aria-label="PCI Koreksi"
          />
        </label>
        <button
          ref={previewButtonRef}
          type="button"
          onClick={handlePreviewPdf}
          disabled={pdfPreparing}
          className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 font-semibold text-sky-800 transition-colors hover:bg-sky-100 disabled:cursor-wait disabled:opacity-50"
          title="Pratinjau laporan PDF seluruh isi tabel STA/SAMPEL fasilitas ini"
        >
          <Printer className="h-3.5 w-3.5" />
          Preview PDF
        </button>
        {pdfError && <span role="alert" className="text-red-700">{pdfError}</span>}
        <span>
          Density memakai estimasi luas unit STA/SAM; status mengikuti kategori PCI aplikasi.{' '}
          {!surfaceType
            ? 'Jenis perkerasan belum diatur.'
            : !currentCurve
              ? 'Memuat kurva DV dan CDV…'
              : !currentCurve.dvCurves || !currentCurve.cdvCurves
                ? 'Kurva DV/CDV gagal dimuat; skor PCI ditahan.'
                : `DV ${currentCurve.dvSource === 'database' ? 'tersimpan' : 'bawaan'} dan CDV ${currentCurve.cdvSource === 'database' ? 'tersimpan' : 'bawaan'} aktif.`}
        </span>
      </div>
      {pdfPreview && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/70 p-2 sm:p-5" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPdfPreview(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="pci-pdf-preview-title" className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 id="pci-pdf-preview-title" className="text-sm font-bold text-slate-900">Pratinjau laporan PCI</h2>
                <p className="text-xs text-slate-500">{pdfPreview.filename}</p>
              </div>
              <button ref={closePreviewButtonRef} type="button" onClick={() => setPdfPreview(null)} aria-label="Tutup pratinjau PDF" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe src={pdfPreview.url} title="Pratinjau laporan PCI" className="min-h-0 w-full flex-1 bg-slate-100" />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 text-xs">
              <span className="mr-auto text-slate-500">Periksa halaman laporan sebelum mengunduh atau mencetak.</span>
              <a href={pdfPreview.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">
                <ExternalLink className="h-3.5 w-3.5" /> Buka untuk cetak
              </a>
              <a href={pdfPreview.url} download={pdfPreview.filename} className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 font-semibold text-white hover:bg-sky-700">
                <Download className="h-3.5 w-3.5" /> Unduh PDF
              </a>
            </div>
          </section>
        </div>
      )}
      <details className="border-b border-slate-200 bg-gradient-to-b from-slate-50/80 to-white">
        <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100">
          <BarChart3 className="h-4 w-4 text-sky-600" />
          Grafik PCI
          <span className="font-normal text-slate-500">
            · {table.rows.length} {table.mode === 'SAM' ? 'SAMPEL' : 'STA'} · warna sesuai status PCI
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-800 ring-1 ring-sky-200">
            Rata-rata {decimal(pciAverage, 1)}
          </span>
        </summary>
        <PciBarChart table={table} calculations={calculations} />
      </details>
      <div className="max-h-[70vh] overflow-auto">
        <table className={`w-full border-collapse text-left ${showDvIterations ? 'min-w-[1400px]' : 'min-w-[1000px]'}`} aria-label={`Perhitungan PCI per ${table.mode} ${table.facility.code}`}>
          <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-700 shadow-sm">
            <tr>
              <th className="sticky left-0 z-20 w-9 bg-slate-100 px-1 py-1.5 text-center">No</th>
              <th className="sticky left-9 z-20 min-w-32 bg-slate-100 px-1.5 py-1.5">{table.mode}</th>
              <th className="px-1.5 py-1.5 leading-tight">Jenis Kerusakan</th>
              <th className="px-1.5 py-1.5">Kode</th>
              <th className="px-1 py-1.5 text-center">Severity</th>
              <th className="px-1.5 py-1.5 text-right">Volume</th>
              <th className="px-1.5 py-1.5 text-right">Density (%)</th>
              <th className="px-1.5 py-1.5 text-right">DV</th>
              <th className="px-1.5 py-1.5 text-right leading-tight">DV max ↓ min</th>
              <th className="px-1.5 py-1.5 text-right" title="Maximum allowable deducts">M</th>
              <th className="px-1.5 py-1.5 text-right leading-tight" title="Jumlah DV awal ≥ 5 sebelum pembatasan M">Total Q</th>
              {showDvIterations && DV_COLUMNS.map((column) => <th key={column} className="px-1.5 py-1.5 text-right">{column}</th>)}
              <th className="px-1.5 py-1.5 text-right">Q</th>
              <th className="px-1.5 py-1.5 text-right">TDV</th>
              <th className="px-1.5 py-1.5 text-right text-orange-700">CDV</th>
              <th className="px-1.5 py-1.5 text-right text-emerald-700">CDV MAX</th>
              <th className="px-1.5 py-1.5 text-right text-sky-700">PCI/SAMPLE</th>
              <th className="px-1.5 py-1.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((location, index) => (
              <CalculationLocationRows
                key={location.key}
                location={location}
                calculation={calculations[start + index]}
                number={start + index + 1}
                showDvIterations={showDvIterations}
              />
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 px-4 py-3 text-xs" aria-label="Halaman tabel PCI">
          <button type="button" onClick={() => setPage(1)} disabled={currentPage === 1} className="rounded border border-slate-300 px-2.5 py-1.5 disabled:opacity-40">Pertama</button>
          <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} className="rounded border border-slate-300 px-2.5 py-1.5 disabled:opacity-40">Sebelumnya</button>
          <span className="px-2 font-semibold text-slate-700">{currentPage} / {totalPages}</span>
          <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages} className="rounded border border-slate-300 px-2.5 py-1.5 disabled:opacity-40">Berikutnya</button>
          <button type="button" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} className="rounded border border-slate-300 px-2.5 py-1.5 disabled:opacity-40">Terakhir</button>
        </nav>
      )}
      {summary.unsupported > 0 && (
        <details className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <summary className="cursor-pointer font-bold">Mengapa {summary.unsupported} lokasi belum dapat dihitung?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {table.rows.flatMap((location, index) => calculations[index].state === 'unsupported'
              ? [{ location, calculation: calculations[index] }]
              : []).slice(0, 10).map(({ location, calculation }) => (
                <li key={location.key}><span className="font-mono font-semibold">{location.label}</span>: {calculation.diagnostics.join(' ')}</li>
              ))}
          </ul>
          {summary.unsupported > 10 && <p className="mt-2">Dan {summary.unsupported - 10} lokasi lainnya.</p>}
        </details>
      )}
    </div>
  );
}
