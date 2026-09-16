'use client';

// Menu Marka: inventaris & monitoring kondisi marka airside per fasilitas.
// Temuan marka (threshold, centerline, TDZ, holding position, dll) dengan kondisi
// BAIK / PERLU_PERBAIKAN / USANG, station, koordinat opsional, dan tindak lanjut.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PenTool, Plus, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import type { Facility, MarkingFinding } from '@/types';
import {
  MARKING_TYPES,
  MARKING_CONDITION_LABEL,
  MARKING_CONDITION_COLORS,
} from '@/lib/constants';

const ALL_MARKING_TYPES = MARKING_TYPES.flatMap((g) => g.types);

export default function MarkaView() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [markings, setMarkings] = useState<MarkingFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');

  // form state
  const [facilityId, setFacilityId] = useState('');
  const [markingType, setMarkingType] = useState(ALL_MARKING_TYPES[0]);
  const [condition, setCondition] = useState<'BAIK' | 'PERLU_PERBAIKAN' | 'USANG'>('PERLU_PERBAIKAN');
  const [station, setStation] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reportedBy, setReportedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, mRes] = await Promise.all([fetch('/api/facilities'), fetch('/api/markings')]);
      if (fRes.ok) setFacilities(await fRes.json());
      if (mRes.ok) setMarkings(await mRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => (filter === 'ALL' ? markings : markings.filter((m) => m.status === filter)),
    [markings, filter]
  );

  const kpi = useMemo(
    () => ({
      total: markings.length,
      perlu: markings.filter((m) => m.condition === 'PERLU_PERBAIKAN' && m.status === 'OPEN').length,
      usang: markings.filter((m) => m.condition === 'USANG').length,
      baik: markings.filter((m) => m.condition === 'BAIK').length,
    }),
    [markings]
  );

  const submit = async () => {
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/markings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId: facilityId || null,
          markingType,
          condition,
          station: station || null,
          areaSqm: parseFloat(areaSqm) || null,
          remarks: remarks || null,
          reportedBy: reportedBy || 'Petugas Marka',
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Gagal menyimpan');
      }
      setShowForm(false);
      setStation('');
      setAreaSqm('');
      setRemarks('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (m: MarkingFinding, status: 'OPEN' | 'CLOSED') => {
    await fetch(`/api/markings/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await refresh();
  };

  const remove = async (m: MarkingFinding) => {
    if (!confirm(`Hapus temuan marka "${m.markingType}"?`)) return;
    await fetch(`/api/markings/${m.id}`, { method: 'DELETE' });
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <PenTool className="w-5 h-5 text-amber-500" /> Monitoring Marka
          </h1>
          <p className="text-xs text-gray-500">Inventaris & kondisi marka runway, taxiway, dan apron.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Catat Kondisi Marka
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Catatan', value: kpi.total, color: 'text-gray-800' },
          { label: 'Perlu Perbaikan (aktif)', value: kpi.perlu, color: 'text-amber-600' },
          { label: 'Usang', value: kpi.usang, color: 'text-red-600' },
          { label: 'Kondisi Baik', value: kpi.baik, color: 'text-green-600' },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{loading ? '…' : k.value}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3 text-sm">
          <h3 className="font-semibold text-gray-700">Catatan Kondisi Marka Baru</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Fasilitas</span>
              <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5">
                <option value="">— Umum —</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>{f.code} ({f.name})</option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs text-gray-500">Jenis Marka</span>
              <select value={markingType} onChange={(e) => setMarkingType(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5">
                {MARKING_TYPES.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.types.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Kondisi</span>
              <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5">
                {Object.entries(MARKING_CONDITION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Station / Lokasi</span>
              <input value={station} onChange={(e) => setStation(e.target.value)} placeholder="08 + 120 / TWY-A / Stand 5" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Luas (m², opsional)</span>
              <input value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} type="number" step="0.1" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Keterangan</span>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" placeholder="Kondisi,lokasi detail, rekomendasi..." />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Petugas</span>
              <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Nama petugas" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">Batal</button>
          </div>

        </div>
      )}

      {/* Filter + Tabel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 flex gap-2 text-xs items-center">
          <span className="text-gray-500">Tampilkan:</span>
          {(['ALL', 'OPEN', 'CLOSED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md font-medium ${filter === f ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f === 'ALL' ? 'Semua' : f === 'OPEN' ? 'Terbuka' : 'Selesai'}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Fasilitas</th>
                <th className="px-3 py-2 font-medium">Jenis Marka</th>
                <th className="px-3 py-2 font-medium">Kondisi</th>
                <th className="px-3 py-2 font-medium">Station</th>
                <th className="px-3 py-2 font-medium">Luas</th>
                <th className="px-3 py-2 font-medium">Keterangan</th>
                <th className="px-3 py-2 font-medium">Tanggal</th>
                <th className="px-3 py-2 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-700">{m.facility?.code ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{m.markingType}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ background: MARKING_CONDITION_COLORS[m.condition] }}>
                      {MARKING_CONDITION_LABEL[m.condition]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{m.station ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{m.areaSqm != null ? `${m.areaSqm} m²` : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[220px] truncate" title={m.remarks ?? ''}>{m.remarks ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400">{new Date(m.createdAt).toLocaleDateString('id-ID')}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {m.status === 'OPEN' ? (
                      <button onClick={() => setStatus(m, 'CLOSED')} className="text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Selesai
                      </button>
                    ) : (
                      <button onClick={() => setStatus(m, 'OPEN')} className="text-gray-500 hover:bg-gray-100 px-2 py-1 rounded font-medium">
                        <RotateCcw className="w-3.5 h-3.5 inline mr-1" />Buka
                      </button>
                    )}
                    <button onClick={() => remove(m)} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded ml-1">
                      <Trash2 className="w-3.5 h-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-400">Belum ada catatan marka.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
