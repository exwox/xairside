'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import AppShell from '@/components/AppShell';

type Airport = {
  id: string;
  name: string;
  code: string;
  location: string;
  refLat: number;
  refLng: number;
  manager: string;
  description: string;
  isActive: boolean;
};
type Draft = Omit<Airport, 'id' | 'isActive' | 'refLat' | 'refLng'> & { refLat: string; refLng: string };

const emptyDraft: Draft = { name: '', code: '', location: '', refLat: '', refLng: '', manager: '', description: '' };

export default function AirportsPage() {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/airports', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Gagal memuat daftar bandara');
    setAirports(body);
  }, []);

  useEffect(() => { Promise.resolve().then(load).catch((error) => setMessage(error.message)); }, [load]);

  function edit(airport: Airport) {
    setEditingId(airport.id);
    setDraft({
      name: airport.name, code: airport.code, location: airport.location,
      refLat: String(airport.refLat), refLng: String(airport.refLng),
      manager: airport.manager, description: airport.description,
    });
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() { setDraft(emptyDraft); setEditingId(null); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(editingId ? `/api/airports/${editingId}` : '/api/airports', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Gagal menyimpan bandara');
      reset();
      await load();
      setMessage(editingId ? 'Data bandara diperbarui.' : 'Bandara baru berhasil ditambahkan.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan bandara');
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return <AppShell><main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900">Manajemen bandara</h1>
      <p className="mt-1 text-sm text-slate-600">Tambahkan bandara dan atur informasi dasar yang terlihat oleh SUPADMIN.</p>
    </div>
    {message && <p role="status" className="mb-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</p>}

    <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Ubah bandara' : 'Tambah bandara'}</h2>
        {editingId && <button type="button" onClick={reset} className="text-sm font-medium text-sky-700 hover:underline">Batal ubah</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">Nama bandara
          <input required maxLength={150} value={draft.name} onChange={(e) => update('name', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Contoh: Bandara Raja Haji Fisabilillah" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Kode bandara
          <input required minLength={2} maxLength={10} pattern="[A-Za-z0-9-]+" value={draft.code} onChange={(e) => update('code', e.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase" placeholder="Contoh: RHF" />
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Lokasi bandara
          <input required maxLength={200} value={draft.location} onChange={(e) => update('location', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Kota/Kabupaten, Provinsi" />
        </label>
        <fieldset className="rounded-lg border border-slate-200 p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-semibold text-slate-700">Titik ARP</legend>
          <p className="mb-3 text-xs text-slate-500">Isi koordinat desimal. Latitude: −90 sampai 90, longitude: −180 sampai 180.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Latitude
              <input required type="number" step="any" min={-90} max={90} value={draft.refLat} onChange={(e) => update('refLat', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" placeholder="0.9569" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Longitude
              <input required type="number" step="any" min={-180} max={180} value={draft.refLng} onChange={(e) => update('refLng', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" placeholder="104.5311" />
            </label>
          </div>
        </fieldset>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Pengelola bandara
          <input required maxLength={200} value={draft.manager} onChange={(e) => update('manager', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Nama instansi atau pengelola" />
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Keterangan
          <textarea rows={3} maxLength={2000} value={draft.description} onChange={(e) => update('description', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Informasi tambahan (opsional)" />
        </label>
      </div>
      <button disabled={saving} className="mt-5 rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60">{saving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Tambah bandara'}</button>
    </form>

    <section className="mt-8">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Daftar bandara</h2>
      {airports.length === 0 ? <p className="rounded-lg bg-white p-5 text-sm text-slate-500">Belum ada bandara.</p> :
        <div className="grid gap-4 md:grid-cols-2">{airports.map((airport) => <article key={airport.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{airport.name}</h3><p className="text-sm text-slate-500">{airport.code} · {airport.location || 'Lokasi belum diisi'}</p></div><span className={`rounded-full px-2 py-1 text-xs ${airport.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{airport.isActive ? 'Aktif' : 'Nonaktif'}</span></div>
          <dl className="mt-4 space-y-1 text-sm text-slate-700"><div><dt className="inline font-medium">ARP: </dt><dd className="inline">{airport.refLat}, {airport.refLng}</dd></div><div><dt className="inline font-medium">Pengelola: </dt><dd className="inline">{airport.manager || 'Belum diisi'}</dd></div>{airport.description && <div><dt className="inline font-medium">Keterangan: </dt><dd className="inline">{airport.description}</dd></div>}</dl>
          <button type="button" onClick={() => edit(airport)} className="mt-4 rounded-lg border border-sky-300 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-50">Ubah data</button>
        </article>)}</div>}
    </section>
  </main></AppShell>;
}
