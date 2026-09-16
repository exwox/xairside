'use client';

// Menu PCI : manajemen section perkerasan, builder survey sample unit
// distress (jenis + severity + quantity), perhitungan PCI server-side,
// hasil per sample unit (DV, maxCDV, PCI), rating, dan riwayat survey per section.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Plus, Trash2, Loader2, Save, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import type { AppConfig, Damage, Facility, PciSection } from '@/types';
import { distressCatalog, type SurfaceType } from '@/lib/pci-data';
import { pciRating } from '@/lib/pci';
import PciDamageInventory from './PciDamageInventory';

interface UnitDraft {
  key: number;
  areaSqm: string;
  distresses: { key: number; code: number; severity: 'L' | 'M' | 'H' | '-'; quantity: string }[];
}

interface SurveyDetail {
  no: number;
  areaSqm: number;
  distresses: { code: number; name?: string; severity: string; quantity: number; density?: number }[];
  dvLines: { code: number; name: string; severity: string; density: number; dv: number }[];
  totalDv: number;
  maxCdv: number;
  pci: number;
}

let uid = 1;
const nextId = () => uid++;

export default function PciView() {
  const [sections, setSections] = useState<PciSection[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [damages, setDamages] = useState<Damage[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // form section baru
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [surfaceType, setSurfaceType] = useState<SurfaceType>('ASPHALT');
  const [totalAreaSqm, setTotalAreaSqm] = useState('');
  const [sampleUnitArea, setSampleUnitArea] = useState('225');
  const [savingSection, setSavingSection] = useState(false);

  // builder survey
  const [active, setActive] = useState<PciSection | null>(null);
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [inspectorName, setInspectorName] = useState('');
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [lastResult, setLastResult] = useState<{ pci: number; rating: string; ratingColor: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sRes, fRes, dRes, cRes] = await Promise.all([
        fetch('/api/pci/sections'),
        fetch('/api/facilities'),
        fetch('/api/damages'),
        fetch('/api/config'),
      ]);
      if (!fRes.ok || !dRes.ok || !cRes.ok) throw new Error('Gagal memuat fasilitas, Kerusakan, atau konfigurasi Admin.');
      const [facilityData, damageData, configData] = await Promise.all([
        fRes.json() as Promise<Facility[]>,
        dRes.json() as Promise<Damage[]>,
        cRes.json() as Promise<AppConfig>,
      ]);
      setFacilities(facilityData);
      setDamages(damageData);
      setAppConfig(configData);
      if (sRes.ok) setSections(await sRes.json());
    } catch {
      setAppConfig(null);
      setError('Gagal memuat data PCI dan Kerusakan. Coba muat ulang.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh is the existing async data loader for this page.
    refresh();
  }, [refresh]);

  const catalog = useMemo(() => {
    const surface = active?.surfaceType ?? 'ASPHALT';
    const names = appConfig?.damageCatalogs?.[surface];
    return distressCatalog(surface).map((definition) => ({
      ...definition,
      name: names?.find((entry) => entry.pciCode === definition.code)?.name ?? definition.name,
    }));
  }, [active, appConfig]);

  const openSection = (s: PciSection) => {
    setActive(s.id === active?.id ? null : s);
    setUnits([]);
    setLastResult(null);
    setError('');
  };

  const addUnit = () => {
    setUnits((u) => [...u, { key: nextId(), areaSqm: String(active?.sampleUnitArea ?? 225), distresses: [] }]);
  };
  const addDistress = (unitKey: number) => {
    setUnits((us) =>
      us.map((u) =>
        u.key === unitKey
          ? { ...u, distresses: [...u.distresses, { key: nextId(), code: catalog[0].code, severity: catalog[0].severities[0], quantity: '' }] }
          : u
      )
    );
  };
  const updateDistress = (unitKey: number, dKey: number, patch: Partial<UnitDraft['distresses'][number]>) => {
    setUnits((us) =>
      us.map((u) =>
        u.key === unitKey
          ? { ...u, distresses: u.distresses.map((d) => (d.key === dKey ? { ...d, ...patch } : d)) }
          : u
      )
    );
  };
  const removeDistress = (unitKey: number, dKey: number) => {
    setUnits((us) =>
      us.map((u) => (u.key === unitKey ? { ...u, distresses: u.distresses.filter((d) => d.key !== dKey) } : u))
    );
  };

  const submitSection = async () => {
    setError('');
    if (!name.trim() || !totalAreaSqm) {
      setError('Nama section dan luas total wajib diisi.');
      return;
    }
    setSavingSection(true);
    try {
      const res = await fetch('/api/pci/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, facilityId: facilityId || null, surfaceType, totalAreaSqm, sampleUnitArea }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Gagal membuat section');
      }
      setName('');
      setTotalAreaSqm('');
      setShowForm(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat section');
    } finally {
      setSavingSection(false);
    }
  };

  const removeUnit = (unitKey: number) => setUnits((us) => us.filter((u) => u.key !== unitKey));

  const submitSurvey = async () => {
    if (!active) return;
    setError('');
    const cleaned = units
      .filter((u) => parseFloat(u.areaSqm) > 0)
      .map((u) => ({
        areaSqm: parseFloat(u.areaSqm),
        distresses: u.distresses
          .filter((d) => parseFloat(d.quantity) > 0)
          .map((d) => ({ code: d.code, severity: d.severity, quantity: parseFloat(d.quantity) })),
      }));
    if (cleaned.length === 0) {
      setError('Tambahkan minimal satu sample unit dengan luas > 0.');
      return;
    }
    setSavingSurvey(true);
    try {
      const res = await fetch('/api/pci/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: active.id, inspectorName: inspectorName || null, units: cleaned }),
      });
      const j = (await res.json()) as { error?: string; pci?: number; rating?: string; ratingColor?: string };
      if (!res.ok) throw new Error(j.error || 'Gagal menyimpan survey');
      setLastResult({ pci: j.pci ?? 0, rating: j.rating ?? '', ratingColor: j.ratingColor ?? '#15803d' });
      setUnits([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan survey');
    } finally {
      setSavingSurvey(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" /> PCI — Pavement Condition Index
          </h1>
          <p className="text-sm text-gray-500">
            Sample unit → density → deduct value → kurva CDV fleksibel/rigit → skor PCI &amp; rating.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={refresh} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold px-3 py-2 rounded-lg flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Muat Ulang Data
          </button>
          <button onClick={() => setShowForm((v) => !v)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
            <Plus className="w-4 h-4" /> Section Baru
          </button>
        </div>
      </header>

      {error && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

      {/* Form section baru */}
      {showForm && (
        <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">Definisi Section Perkerasan</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <label className="block">
              <span className="text-xs text-gray-500">Nama Section</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="RWY 11/29 - Seksi 1" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Fasilitas</span>
              <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5">
                <option value="">—</option>
                {facilities.map((f) => (<option key={f.id} value={f.id}>{f.code}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Tipe Perkerasan</span>
              <select value={surfaceType} onChange={(e) => setSurfaceType(e.target.value as SurfaceType)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5">
                <option value="ASPHALT">Asphalt (Flexible)</option>
                <option value="JPCP">JPCP (Rigid)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Luas Total (m²)</span>
              <input value={totalAreaSqm} onChange={(e) => setTotalAreaSqm(e.target.value)} type="number" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Luas Sample Unit (m²)</span>
              <input value={sampleUnitArea} onChange={(e) => setSampleUnitArea(e.target.value)} type="number" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={submitSection} disabled={savingSection} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
              <Save className="w-4 h-4" /> {savingSection ? 'Menyimpan...' : 'Simpan Section'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Batal</button>
          </div>
        </div>
      )}

      {appConfig ? (
        <PciDamageInventory facilities={facilities} damages={damages} config={appConfig} />
      ) : (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Konfigurasi Admin belum tersedia. Tabel dan perhitungan PCI ditahan sampai data berhasil dimuat.
        </p>
      )}

      {/* [PCI-LIST] */}

    </div>
  );
}
