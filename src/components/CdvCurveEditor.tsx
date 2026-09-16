'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Database,
  LineChart,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import type { SurfaceType } from '@/lib/pci-data';
import {
  CDV_Q_VALUES,
  CDV_SURFACE_LABEL,
  correctedDeductValue,
  defaultCdvCurveSet,
  validateCdvCurveSet,
  type CdvCurveSet,
  type CdvPoint,
} from '@/lib/cdv';

const CURVE_COLORS: Record<number, string> = {
  1: '#16a34a',
  2: '#0891b2',
  3: '#2563eb',
  4: '#9333ea',
  6: '#ea580c',
  8: '#dc2626',
  10: '#475569',
};

interface CdvCurveEditorProps {
  surfaceType: SurfaceType;
}

interface CurveApiResponse {
  curves?: CdvCurveSet;
  source?: 'database' | 'default';
  updatedAt?: string | null;
  error?: string;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function CurveChart({
  curves,
  qValues,
  selectedQ,
  surfaceType,
}: {
  curves: CdvCurveSet;
  qValues: readonly number[];
  selectedQ: number;
  surfaceType: SurfaceType;
}) {
  const width = 760;
  const height = 400;
  const pad = { top: 28, right: 24, bottom: 58, left: 64 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (value: number) => pad.left + (Math.max(0, Math.min(200, value)) / 200) * plotWidth;
  const y = (value: number) => pad.top + (1 - Math.max(0, Math.min(100, value)) / 100) * plotHeight;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Grafik kurva CDV ${CDV_SURFACE_LABEL[surfaceType]}`}
      >
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
        {Array.from({ length: 11 }, (_, index) => index * 10).map((value) => (
          <g key={`y-${value}`}>
            <line
              x1={pad.left}
              x2={pad.left + plotWidth}
              y1={y(value)}
              y2={y(value)}
              stroke={value % 20 === 0 ? '#cbd5e1' : '#e2e8f0'}
              strokeWidth={value % 20 === 0 ? 1.2 : 0.8}
            />
            <text x={pad.left - 10} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {value}
            </text>
          </g>
        ))}
        {Array.from({ length: 11 }, (_, index) => index * 20).map((value) => (
          <g key={`x-${value}`}>
            <line
              x1={x(value)}
              x2={x(value)}
              y1={pad.top}
              y2={pad.top + plotHeight}
              stroke="#e2e8f0"
              strokeWidth="0.8"
            />
            <text x={x(value)} y={pad.top + plotHeight + 20} textAnchor="middle" fontSize="11" fill="#64748b">
              {value}
            </text>
          </g>
        ))}
        <rect
          x={pad.left}
          y={pad.top}
          width={plotWidth}
          height={plotHeight}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.4"
        />
        {qValues.map((q) => {
          const points = curves[`Q${q}`] ?? [];
          const selected = q === selectedQ;
          return (
            <g key={q} opacity={selected ? 1 : 0.45}>
              <polyline
                points={points.map(([tdv, cdv]) => `${x(tdv)},${y(cdv)}`).join(' ')}
                fill="none"
                stroke={CURVE_COLORS[q]}
                strokeWidth={selected ? 3 : 1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={selected ? undefined : '7 4'}
              />
              {points.map(([tdv, cdv], index) => (
                <circle
                  key={`${tdv}-${cdv}-${index}`}
                  cx={x(tdv)}
                  cy={y(cdv)}
                  r={selected ? 4 : 2.5}
                  fill={CURVE_COLORS[q]}
                >
                  <title>{`Q${q}: TDV ${formatNumber(tdv)} → CDV ${formatNumber(cdv)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        <text x={pad.left + plotWidth / 2} y={height - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill="#334155">
          TOTAL DEDUCT VALUE (TDV)
        </text>
        <text
          x="17"
          y={pad.top + plotHeight / 2}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="#334155"
          transform={`rotate(-90 17 ${pad.top + plotHeight / 2})`}
        >
          CORRECTED DEDUCT VALUE (CDV)
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-slate-100 px-3 py-3">
        {qValues.map((q) => (
          <span
            key={q}
            className={`flex items-center gap-1.5 text-xs ${q === selectedQ ? 'font-bold text-slate-900' : 'text-slate-500'}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CURVE_COLORS[q] }} /> Q{q}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CdvCurveEditor({ surfaceType }: CdvCurveEditorProps) {
  const qValues = CDV_Q_VALUES[surfaceType];
  const label = CDV_SURFACE_LABEL[surfaceType];
  const isRigid = surfaceType === 'JPCP';
  const [curves, setCurves] = useState<CdvCurveSet>(() => defaultCdvCurveSet(surfaceType));
  const [selectedQ, setSelectedQ] = useState(qValues[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [source, setSource] = useState<'database' | 'default'>('default');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testTdv, setTestTdv] = useState('60');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(`/api/pci/cdv-curves?surfaceType=${surfaceType}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json().catch(() => ({}))) as CurveApiResponse;
        if (!response.ok || !json.curves) throw new Error(json.error || 'Gagal memuat kurva CDV.');
        return json;
      })
      .then((json) => {
        if (!active || !json.curves) return;
        setCurves(json.curves);
        setSource(json.source ?? 'default');
        setUpdatedAt(json.updatedAt ?? null);
        setDirty(false);
      })
      .catch((caught: unknown) => {
        if (!active || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof Error ? caught.message : 'Gagal memuat kurva CDV.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [surfaceType]);

  const selectedKey = `Q${selectedQ}`;
  const selectedPoints = curves[selectedKey] ?? [];
  const testValue = Number(testTdv);
  const testCdv = useMemo(
    () => correctedDeductValue(curves, selectedQ, Number.isFinite(testValue) ? testValue : 0),
    [curves, selectedQ, testValue]
  );

  const updatePoint = (index: number, field: 0 | 1, value: number) => {
    if (!Number.isFinite(value)) return;
    setCurves((current) => ({
      ...current,
      [selectedKey]: (current[selectedKey] ?? []).map((point, pointIndex) => {
        if (pointIndex !== index) return point;
        const next: CdvPoint = [...point];
        next[field] = value;
        return next;
      }),
    }));
    setDirty(true);
    setError('');
    setSuccess('');
  };

  const addPoint = () => {
    const sorted = [...selectedPoints].sort((a, b) => a[0] - b[0]);
    const last = sorted.at(-1) ?? [0, 0];
    if (last[0] >= 200) {
      setError('TDV maksimum sudah 200. Ubah titik terakhir sebelum menambah titik baru.');
      return;
    }
    const nextTdv = Math.min(200, last[0] + (last[0] < 100 ? 10 : 20));
    setCurves((current) => ({
      ...current,
      [selectedKey]: [...(current[selectedKey] ?? []), [nextTdv, last[1]]],
    }));
    setDirty(true);
    setError('');
    setSuccess('');
  };

  const removePoint = (index: number) => {
    if (selectedPoints.length <= 2) {
      setError(`${selectedKey} harus tetap memiliki minimal 2 titik.`);
      return;
    }
    setCurves((current) => ({
      ...current,
      [selectedKey]: (current[selectedKey] ?? []).filter((_, pointIndex) => pointIndex !== index),
    }));
    setDirty(true);
    setError('');
    setSuccess('');
  };

  const restoreDefaults = () => {
    setCurves(defaultCdvCurveSet(surfaceType));
    setDirty(true);
    setError('');
    setSuccess('Nilai awal dimuat. Klik “Simpan Semua Kurva” untuk menerapkannya ke perhitungan PCI.');
  };

  const saveCurves = async () => {
    setError('');
    setSuccess('');
    const validation = validateCdvCurveSet(curves, surfaceType);
    if (!validation.ok || !validation.curves) {
      setError(validation.error || 'Kurva CDV tidak valid.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/pci/cdv-curves', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surfaceType, curves: validation.curves }),
      });
      const json = (await response.json().catch(() => ({}))) as CurveApiResponse & { ok?: boolean };
      if (!response.ok || !json.ok || !json.curves) {
        throw new Error(json.error || 'Gagal menyimpan kurva CDV.');
      }
      setCurves(json.curves);
      setSource('database');
      setUpdatedAt(json.updatedAt ?? null);
      setDirty(false);
      setSuccess(`Kurva CDV ${label.toLowerCase()} tersimpan dan aktif untuk survey PCI berikutnya.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan kurva CDV.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Memuat kurva CDV {label.toLowerCase()}...
      </div>
    );
  }

  const otherHref = isRigid ? '/admin/kurva-cdv-fleksibel' : '/admin/kurva-cdv-rigit';
  const otherLabel = isRigid ? 'Fleksibel' : 'Rigit';

  return (
    <div className="mx-auto max-w-[1500px] p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-900">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Admin
        </Link>
        <Link href={otherHref} className="text-sm font-semibold text-slate-600 hover:text-sky-700">
          Buka Kurva CDV {otherLabel} →
        </Link>
      </div>

      <header className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 p-5 text-white shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Admin · PCI </p>
            <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <LineChart className="h-7 w-7 text-sky-300" /> Kurva CDV {label}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Editor titik interpolasi Total Deduct Value (TDV) ke Corrected Deduct Value (CDV) untuk
              {isRigid ? ' perkerasan beton/kaku (JPCP).' : ' perkerasan aspal/fleksibel.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-slate-200">
              <Database className="h-3.5 w-3.5" /> {source === 'database' ? 'Data tersimpan' : 'Nilai awal aplikasi'}
            </span>
            {dirty && <span className="rounded-full bg-amber-400/20 px-3 py-1.5 font-bold text-amber-200">Belum disimpan</span>}
          </div>
        </div>
      </header>

      <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <strong>Catatan:</strong> Q bukan tingkat keparahan L/M/H. Q adalah jumlah deduct value yang lebih besar dari 5
        pada iterasi koreksi. Titik awal mengacu pada kurva airfield UFM 3-260-16 (2026) dan dapat dikalibrasi di sini.
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {success}
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-bold text-slate-900">Editor titik kurva</h2>
            <p className="text-xs text-slate-500">Pilih Q, ubah titik, lalu simpan seluruh kurva sebagai satu konfigurasi.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restoreDefaults}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Muat Nilai Awal
            </button>
            <button
              type="button"
              onClick={saveCurves}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Menyimpan...' : 'Simpan Semua Kurva'}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Pilih nilai Q">
          {qValues.map((q) => (
            <button
              type="button"
              role="tab"
              aria-selected={selectedQ === q}
              key={q}
              onClick={() => {
                setSelectedQ(q);
                setError('');
              }}
              className={`rounded-lg border px-4 py-2 text-sm font-bold transition-colors ${
                selectedQ === q
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              style={selectedQ === q ? { backgroundColor: CURVE_COLORS[q] } : undefined}
            >
              Q{q}
            </button>
          ))}
        </div>

        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(480px,1.08fr)]">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Titik Q{selectedQ}</h3>
                <p className="text-xs text-slate-500">TDV harus unik dan naik; origin 0→0 dikunci; CDV tidak boleh menurun.</p>
              </div>
              <button
                type="button"
                onClick={addPoint}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100"
              >
                <Plus className="h-3.5 w-3.5" /> Tambah Titik
              </button>
            </div>
            <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="w-12 px-3 py-2.5 text-center">#</th>
                    <th className="px-3 py-2.5">Total Deduct Value</th>
                    <th className="px-3 py-2.5">Corrected DV</th>
                    <th className="w-16 px-3 py-2.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedPoints.map(([tdv, cdv], index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="200"
                          step="any"
                          value={tdv}
                          disabled={index === 0}
                          onChange={(event) => updatePoint(index, 0, event.currentTarget.valueAsNumber)}
                          aria-label={`TDV titik ${index + 1} Q${selectedQ}`}
                          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          value={cdv}
                          disabled={index === 0}
                          onChange={(event) => updatePoint(index, 1, event.currentTarget.valueAsNumber)}
                          aria-label={`CDV titik ${index + 1} Q${selectedQ}`}
                          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removePoint(index)}
                          disabled={index === 0 || selectedPoints.length <= 2}
                          title="Hapus titik"
                          aria-label={`Hapus titik ${index + 1}`}
                          className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="min-w-0 xl:sticky xl:top-20">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Preview seluruh kurva</h3>
                <p className="text-xs text-slate-500">Q{selectedQ} ditampilkan sebagai garis aktif.</p>
              </div>
              <span className="rounded-md px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: CURVE_COLORS[selectedQ] }}>
                Q{selectedQ} · {selectedPoints.length} titik
              </span>
            </div>
            <CurveChart curves={curves} qValues={qValues} selectedQ={selectedQ} surfaceType={surfaceType} />

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
                <Calculator className="h-4 w-4" /> Uji interpolasi Q{selectedQ}
              </div>
              <div className="mt-2 flex items-end gap-3">
                <label className="block flex-1">
                  <span className="text-xs font-semibold text-amber-900">TDV uji</span>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="any"
                    value={testTdv}
                    onChange={(event) => setTestTdv(event.target.value)}
                    className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <div className="min-w-32 rounded-lg bg-white px-3 py-2 text-right shadow-sm ring-1 ring-amber-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-amber-700">Hasil CDV</span>
                  <strong className="font-mono text-xl text-amber-950">{formatNumber(testCdv)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm md:grid-cols-3 md:p-5">
        <div>
          <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">1 · Urutkan DV</span>
          <p className="mt-1">DV diurutkan menurun dan dibatasi dengan nilai maksimum yang diizinkan (m).</p>
        </div>
        <div>
          <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">2 · Iterasi CDV</span>
          <p className="mt-1">TDV dan q dihitung, kemudian DV terkecil yang lebih dari 5 diturunkan menjadi 5.</p>
        </div>
        <div>
          <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">3 · Nilai PCI</span>
          <p className="mt-1">CDV maksimum dipilih dan PCI sample unit dihitung sebagai 100 − max CDV.</p>
        </div>
        {updatedAt && (
          <p className="md:col-span-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
            Terakhir disimpan: {new Date(updatedAt).toLocaleString('id-ID')}
          </p>
        )}
      </section>
    </div>
  );
}
