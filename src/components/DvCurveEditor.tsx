'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, LineChart, Loader2, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { distressCatalog, type SurfaceType } from '@/lib/pci-data';
import { createClientUuid } from '@/lib/client-uuid';
import {
  defaultSurfaceDamageCatalog,
  validateSurfaceDamageCatalog,
  type SurfaceDamageCatalogEntry,
} from '@/lib/damage-catalog';
import {
  defaultDvCurveSet,
  mergedDvCurveSet,
  validateDvCurveSet,
  type DvCurveSet,
  type DvPoint,
  type DvSeverity,
} from '@/lib/dv';

const SEVERITY_LABELS: Record<DvSeverity, string> = { L: 'Low', M: 'Medium', H: 'High', '-': 'Tanpa Tingkat' };
const SEVERITY_COLORS: Record<DvSeverity, string> = { L: '#16a34a', M: '#d97706', H: '#dc2626', '-': '#64748b' };

interface DvApiResponse {
  curves?: unknown;
  catalog?: unknown;
  source?: 'database' | 'default';
  updatedAt?: string | null;
  error?: string;
  ok?: boolean;
}

function chartPoints(points: DvPoint[] | undefined, maxDv: number): string {
  return (points ?? [])
    .filter(([density, dv]) => Number.isFinite(density) && Number.isFinite(dv))
    .map(([density, dv]) => `${54 + Math.max(0, Math.min(100, density)) * 5.2},${286 - Math.max(0, Math.min(maxDv, dv)) * 250 / maxDv}`)
    .join(' ');
}

function DvChart({ curves, code, displayCode, severity }: { curves: DvCurveSet; code: string; displayCode: string; severity: DvSeverity }) {
  const maxDv = Math.max(100, Math.ceil(Math.max(...Object.values(curves[code] ?? {}).flatMap((points) =>
    (points ?? []).map(([, dv]) => dv)), 100) / 10) * 10);
  const dvTicks = maxDv > 100 ? [0, 20, 40, 60, 80, 100, maxDv] : [0, 20, 40, 60, 80, 100];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><LineChart className="h-4 w-4 text-sky-600" /> Preview Kurva DV</h3>
        <span className="font-mono text-xs text-slate-500">Kode {displayCode}</span>
      </div>
      <svg viewBox="0 0 610 330" role="img" aria-label={`Grafik DV kode ${displayCode}`} className="h-auto w-full">
        <rect x="54" y="36" width="520" height="250" fill="#f8fafc" stroke="#94a3b8" />
        {[0, 20, 40, 60, 80, 100].map((tick) => (
          <g key={tick}>
            <line x1={54 + tick * 5.2} x2={54 + tick * 5.2} y1="36" y2="286" stroke="#e2e8f0" />
            <text x={54 + tick * 5.2} y="303" textAnchor="middle" fontSize="10" fill="#64748b">{tick}</text>
          </g>
        ))}
        {dvTicks.map((tick) => (
          <g key={tick}>
            <line x1="54" x2="574" y1={286 - tick * 250 / maxDv} y2={286 - tick * 250 / maxDv} stroke="#e2e8f0" />
            <text x="46" y={290 - tick * 250 / maxDv} textAnchor="end" fontSize="10" fill="#64748b">{tick}</text>
          </g>
        ))}
        {(['L', 'M', 'H', '-'] as const).map((item) => {
          const points = chartPoints(curves[code]?.[item], maxDv);
          return points && <polyline key={item} points={points} fill="none" stroke={SEVERITY_COLORS[item]} strokeWidth={item === severity ? 3 : 1.8} strokeDasharray={item === severity ? undefined : '6 4'} opacity={item === severity ? 1 : 0.7} />;
        })}
        <text x="314" y="326" textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">DENSITY (%)</text>
        <text x="15" y="161" textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155" transform="rotate(-90 15 161)">DEDUCT VALUE</text>
      </svg>
      <div className="mt-2 flex justify-center gap-4 text-xs">
        {(['L', 'M', 'H', '-'] as const).filter((item) => curves[code]?.[item]).map((item) => (
          <span key={item} className="flex items-center gap-1.5" style={{ color: SEVERITY_COLORS[item] }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[item] }} />
            {SEVERITY_LABELS[item]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DvCurveEditor({ surfaceType }: { surfaceType: SurfaceType }) {
  const catalog = useMemo(() => distressCatalog(surfaceType), [surfaceType]);
  const defaults = useMemo(() => defaultDvCurveSet(surfaceType), [surfaceType]);
  const [curves, setCurves] = useState<DvCurveSet>(() => defaultDvCurveSet(surfaceType));
  const [catalogEntries, setCatalogEntries] = useState<SurfaceDamageCatalogEntry[]>(() => defaultSurfaceDamageCatalog(surfaceType));
  const [selectedCode, setSelectedCode] = useState(String(catalog[0].code));
  const [severity, setSeverity] = useState<DvSeverity>(catalog[0].severities[0]);
  const [loading, setLoading] = useState(true);
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [source, setSource] = useState<'database' | 'default'>('default');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const definition = catalog.find((item) => String(item.code) === selectedCode) ?? catalog[0];
  const selectedMetadata = catalogEntries.find((item) => item.pciCode === definition.code);
  const points = curves[selectedCode]?.[severity] ?? [];
  const isRigid = surfaceType === 'JPCP';
  const surfaceLabel = isRigid ? 'Rigit' : 'Flexible';

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(`/api/pci/dv-curves?surfaceType=${surfaceType}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as DvApiResponse;
        if (!response.ok || !data.curves || !data.catalog) throw new Error(data.error || 'Gagal memuat kurva DV dan katalog kerusakan.');
        const validated = validateDvCurveSet(data.curves, surfaceType);
        if (!validated.ok) throw new Error(validated.error);
        const metadata = validateSurfaceDamageCatalog(data.catalog, surfaceType);
        if (!metadata.ok) throw new Error(metadata.error);
        return { curves: mergedDvCurveSet(surfaceType, validated.curves), catalog: metadata.catalog, source: data.source ?? 'default' };
      })
      .then((data) => {
        if (!active) return;
        setCurves(data.curves);
        setCatalogEntries(data.catalog);
        setSource(data.source);
        setDirty(false);
        setLoadSucceeded(true);
      })
      .catch((caught) => {
        if (active && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Gagal memuat kurva DV.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [surfaceType]);

  const selectCode = (code: string) => {
    const selected = catalog.find((item) => String(item.code) === code);
    if (!selected) return;
    setSelectedCode(code);
    setSeverity(selected.severities[0]);
    setError('');
    setSuccess('');
  };

  const updatePoints = (next: DvPoint[]) => {
    setCurves((current) => ({ ...current, [selectedCode]: { ...current[selectedCode], [severity]: next } }));
    setDirty(true);
    setError('');
    setSuccess('');
  };

  const updatePoint = (index: number, axis: 0 | 1, text: string) => {
    const next = points.map((point) => [...point] as DvPoint);
    next[index][axis] = text.trim() === '' ? NaN : Number(text);
    updatePoints(next);
  };

  const addPoint = () => {
    const last = points.at(-1);
    if (last && (!Number.isFinite(last[0]) || !Number.isFinite(last[1]))) {
      setError('Lengkapi titik terakhir sebelum menambah titik baru.');
      return;
    }
    if (last && last[0] >= 100) {
      setError('Density titik terakhir sudah 100. Ubah titik terakhir sebelum menambah.');
      return;
    }
    updatePoints([...points, [last ? Math.min(100, Math.ceil(last[0] + 1)) : 0, last?.[1] ?? 0]]);
  };

  const resetSelected = () => {
    updatePoints(defaults[selectedCode]?.[severity]?.map(([density, dv]) => [density, dv]) ?? []);
    setSuccess('Kurva bawaan dimuat. Simpan untuk menerapkannya ke perhitungan PCI.');
  };

  const updateMetadata = (id: string, field: 'code' | 'name', value: string) => {
    setCatalogEntries((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
    setDirty(true);
    setError('');
    setSuccess('');
  };

  const addMetadata = () => {
    setCatalogEntries((current) => [...current, {
      id: `${surfaceType}-custom-${createClientUuid()}`,
      code: '', name: '', pciCode: null, aliases: [],
    }]);
    setDirty(true);
  };

  const removeMetadata = async (entry: SurfaceDamageCatalogEntry) => {
    if (entry.pciCode != null) return;
    try {
      const response = await fetch('/api/damages', { cache: 'no-store' });
      if (!response.ok) throw new Error('Gagal memeriksa kerusakan yang memakai kode ini.');
      const damages = await response.json() as Array<{ type?: string }>;
      const labels = [entry.id, entry.code, entry.name, ...entry.aliases].map((value) => value.toLowerCase());
      if (damages.some((damage) => damage.type && labels.includes(damage.type.toLowerCase()))) {
        throw new Error(`Kode ${entry.code} masih dipakai catatan kerusakan dan tidak boleh dihapus.`);
      }
      setCatalogEntries((current) => current.filter((item) => item.id !== entry.id));
      setDirty(true);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memeriksa pemakaian kode.');
    }
  };

  const save = async () => {
    setError('');
    setSuccess('');
    const validated = validateDvCurveSet(curves, surfaceType);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    const metadata = validateSurfaceDamageCatalog(catalogEntries, surfaceType);
    if (!metadata.ok) {
      setError(metadata.error);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/pci/dv-curves', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surfaceType, curves: validated.curves, catalog: metadata.catalog }),
      });
      const data = await response.json() as DvApiResponse;
      if (!response.ok || !data.ok || !data.curves || !data.catalog) throw new Error(data.error || 'Gagal menyimpan kurva DV dan katalog kerusakan.');
      const saved = validateDvCurveSet(data.curves, surfaceType);
      if (!saved.ok) throw new Error('Kurva DV respons server tidak valid.');
      const savedMetadata = validateSurfaceDamageCatalog(data.catalog, surfaceType);
      if (!savedMetadata.ok) throw new Error('Katalog kerusakan respons server tidak valid.');
      setCurves(mergedDvCurveSet(surfaceType, saved.curves));
      setCatalogEntries(savedMetadata.catalog);
      setSource(data.source ?? 'database');
      setDirty(false);
      setSuccess(`Kode, nama, dan kurva DV ${surfaceLabel} tersimpan dan aktif di Dashboard, Kerusakan, serta PCI.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan kurva DV.');
    } finally {
      setSaving(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ surfaceType, catalog: catalogEntries, curves }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kurva-dv-${surfaceType.toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setSuccess('');
    try {
      const input = JSON.parse(await file.text()) as unknown;
      const envelope = input && typeof input === 'object' && !Array.isArray(input) && 'curves' in input
        ? input as { curves: unknown; catalog?: unknown; surfaceType?: unknown }
        : { curves: input };
      if (envelope.surfaceType != null && envelope.surfaceType !== surfaceType) {
        throw new Error('File JSON berasal dari jenis perkerasan lain.');
      }
      const validated = validateDvCurveSet(envelope.curves, surfaceType);
      if (!validated.ok) throw new Error(validated.error);
      if (envelope.catalog != null) {
        const metadata = validateSurfaceDamageCatalog(envelope.catalog, surfaceType);
        if (!metadata.ok) throw new Error(metadata.error);
        setCatalogEntries(metadata.catalog);
      }
      setCurves(mergedDvCurveSet(surfaceType, validated.curves));
      setDirty(true);
      setSuccess('File JSON dimuat. Periksa kurva lalu klik Simpan Semua Kurva untuk menerapkannya.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'File JSON tidak valid.');
    }
  };

  if (loading) return <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Memuat kurva DV {surfaceLabel}…</div>;

  if (!loadSucceeded) return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700"><ArrowLeft className="h-4 w-4" /> Kembali ke Admin</Link>
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
        <h1 className="font-bold">Kurva DV {surfaceLabel} belum dapat dimuat</h1>
        <p className="mt-1">{error || 'Periksa koneksi atau data kurva yang tersimpan.'} Perhitungan PCI ditahan sampai kurva tersedia.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold">Coba Lagi</button>
          <button type="button" onClick={() => { setCurves(defaults); setCatalogEntries(defaultSurfaceDamageCatalog(surfaceType)); setDirty(true); setError(''); setLoadSucceeded(true); setSuccess('Katalog dan kurva bawaan dimuat untuk pemulihan. Klik Simpan Semua Pengaturan untuk menerapkannya.'); }} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white">Pulihkan dari Kurva Bawaan</button>
        </div>
      </div>
    </main>
  );

  return (
    <main className="mx-auto max-w-[1440px] space-y-5 p-4 pb-12 md:p-6">
      <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900"><ArrowLeft className="h-4 w-4" /> Kembali ke Admin</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><LineChart className="h-6 w-6 text-sky-600" /> Pengaturan Kurva DV {surfaceLabel}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Kelola kode, nama jenis kerusakan, dan titik Density (%) → Deduct Value (0–100) sesuai jenis perkerasan. Perubahan aktif di Dashboard, Kerusakan, dan PCI setelah disimpan.</p>
        </div>
        <Link href={isRigid ? '/admin/kurva-dv-fleksibel' : '/admin/kurva-dv-rigit'} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Buka DV {isRigid ? 'Flexible' : 'Rigit'} →</Link>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {success && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-bold text-slate-800">Backup &amp; Restore Kode, Nama, dan Kurva DV</h2>
          <p className="text-xs text-slate-500">Impor/ekspor JSON untuk {surfaceLabel}. Impor tidak menyimpan ke database sampai Anda menekan Simpan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportJson} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800"><Download className="h-4 w-4" /> Export JSON</button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><Upload className="h-4 w-4" /> Import JSON<input type="file" accept=".json,application/json" className="sr-only" onChange={(event) => { void importJson(event.target.files?.[0]); event.target.value = ''; }} /></label>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Editor Kurva</h2>
            <p className="text-xs text-slate-500">Sumber: {source === 'database' ? 'kurva tersimpan' : 'kurva bawaan'}{dirty ? ' · ada perubahan belum disimpan' : ''}</p>
          </div>
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'Menyimpan…' : 'Simpan Semua Pengaturan'}</button>
        </div>
        <label className="mt-5 block max-w-lg text-xs font-bold uppercase tracking-wide text-slate-600">Kode Kerusakan
          <select value={selectedCode} onChange={(event) => selectCode(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-800">
            {catalog.map((item) => {
              const metadata = catalogEntries.find((entry) => entry.pciCode === item.code);
              return <option key={item.code} value={item.code}>{metadata?.code ?? item.code} — {metadata?.name ?? item.name}</option>;
            })}
          </select>
        </label>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Tingkat keparahan DV">
          {definition.severities.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={severity === item} onClick={() => setSeverity(item)} className={`rounded-lg border px-4 py-2 text-xs font-bold ${severity === item ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>{item} — {SEVERITY_LABELS[item]}</button>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{selectedMetadata?.name ?? definition.name} · {definition.unit === 'PERCENT' ? 'luas' : definition.unit === 'LENGTH' ? 'panjang' : 'jumlah'} dinormalisasi menjadi density. Identitas PCI internal {definition.code} tetap stabil saat kode/nama tampilan diedit.</p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[440px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Density (%)</th><th className="px-3 py-2">Deduct Value (DV)</th><th className="px-3 py-2 text-center">Hapus</th></tr></thead>
                <tbody>{points.map((point, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2"><input type="number" min="0" max="100" step="any" aria-label={`Density titik ${index + 1} ${selectedMetadata?.name ?? definition.name} ${severity}`} value={Number.isFinite(point[0]) ? point[0] : ''} onChange={(event) => updatePoint(index, 0, event.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5" /></td>
                    <td className="px-3 py-2"><input type="number" min="0" max={surfaceType === 'ASPHALT' && definition.code === 4 && severity === 'H' ? 103 : 100} step="any" aria-label={`DV titik ${index + 1} ${selectedMetadata?.name ?? definition.name} ${severity}`} value={Number.isFinite(point[1]) ? point[1] : ''} onChange={(event) => updatePoint(index, 1, event.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5" /></td>
                    <td className="px-3 py-2 text-center"><button type="button" disabled={points.length <= 2} onClick={() => updatePoints(points.filter((_, item) => item !== index))} aria-label={`Hapus titik ${index + 1}`} className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={addPoint} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800"><Plus className="h-4 w-4" /> Tambah Titik</button>
              <button type="button" onClick={resetSelected} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><RotateCcw className="h-4 w-4" /> Pulihkan Kurva Ini</button>
            </div>
          </div>
          <DvChart curves={curves} code={selectedCode} displayCode={selectedMetadata?.code ?? selectedCode} severity={severity} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Kode Kerusakan &amp; Nama Jenis Kerusakan</h2>
            <p className="mt-1 text-xs text-slate-500">Kode/nama di sini menjadi pilihan di Dashboard dan Kerusakan untuk fasilitas {surfaceLabel}. Kode PCI bawaan tidak dapat dihapus; kode tambahan tanpa kurva PCI tetap terlihat sebagai temuan operasional.</p>
          </div>
          <button type="button" onClick={addMetadata} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800"><Plus className="h-4 w-4" /> Tambah Kode</button>
        </div>
        <div className="mt-4 max-h-[560px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[630px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-700"><tr><th className="px-3 py-2">PCI</th><th className="px-3 py-2">Kode Kerusakan</th><th className="px-3 py-2">Nama Jenis Kerusakan</th><th className="px-3 py-2 text-center">Aksi</th></tr></thead>
            <tbody>{catalogEntries.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-slate-500">{entry.pciCode ?? 'Operasional'}</td>
                <td className="px-3 py-2"><input type="text" value={entry.code} onChange={(event) => updateMetadata(entry.id, 'code', event.target.value)} readOnly={entry.pciCode != null} aria-label={`Kode kerusakan ${entry.name || entry.id}`} className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono font-bold read-only:bg-slate-100" /></td>
                <td className="px-3 py-2"><input type="text" value={entry.name} onChange={(event) => updateMetadata(entry.id, 'name', event.target.value)} aria-label={`Nama jenis kerusakan ${entry.code || entry.id}`} className="w-full rounded-md border border-slate-300 px-2 py-1.5" /></td>
                <td className="px-3 py-2 text-center"><button type="button" disabled={entry.pciCode != null} onClick={() => void removeMetadata(entry)} aria-label={`Hapus kode ${entry.code}`} title={entry.pciCode != null ? 'Kode PCI bawaan tidak dapat dihapus' : 'Hapus jika belum dipakai catatan kerusakan'} className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Nama/kode lama disimpan sebagai alias ketika perubahan disimpan, sehingga catatan kerusakan sebelumnya tetap dapat ditemukan.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="text-lg font-bold text-slate-900">Ringkasan Kurva PCI</h2>
        <p className="mt-1 text-xs text-slate-500">Klik kode untuk mengedit titik DV.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {catalog.map((item) => {
            const code = String(item.code);
            const customized = JSON.stringify(curves[code]) !== JSON.stringify(defaults[code]);
            const metadata = catalogEntries.find((entry) => entry.pciCode === item.code);
            return <button key={code} type="button" onClick={() => selectCode(code)} title={metadata?.name ?? item.name} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${selectedCode === code ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{metadata?.code ?? code} · {metadata?.name ?? item.name}{customized ? ' ●' : ''}</button>;
          })}
        </div>
      </section>
    </main>
  );
}
