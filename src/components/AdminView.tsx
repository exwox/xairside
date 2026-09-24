'use client';

// Menu Admin — edit posisi fasilitas (polygon) di peta, drag vertex untuk reposisi,
// tambah/hapus vertex, edit metadata (PCN/PCR/dimensi), dan hapus fasilitas.

import { useCallback, useEffect, useMemo, useState } from 'react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { Save, Plus, Trash2, RotateCcw, RotateCw, MapPin, Edit3, ChevronDown, ChevronUp, AlertTriangle, Compass, LineChart, Users, Database } from 'lucide-react';
import type { PageKey } from '@/lib/page-access';
import type { Facility } from '@/types';
import { FACILITY_TYPE_LABEL, FACILITY_TYPE_COLORS } from '@/lib/constants';
import { rotateFacilityPolygonClockwise, closestEquivalentBearing, computePolygonMetrics, resizePolygonToDimensions, generateFacilitySampleGrids, type FacilitySampleGrid } from '@/lib/geo';

const AdminMap = nextDynamic(() => import('./AdminMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-800 animate-pulse" />,
});

export default function AdminView() {
  const [currentRole, setCurrentRole] = useState<'SUPADMIN' | 'ADMIN' | null>(null);
  const [pageAccess, setPageAccess] = useState<PageKey[]>([]);
  const [showPciMenu, setShowPciMenu] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [vertices, setVertices] = useState<{ lat: number; lng: number }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [meta, setMeta] = useState({
    code: '', name: '', type: 'RUNWAY', surfaceType: '', pcn: '', pcr: '',
    lengthM: '', widthM: '', bearingDeg: '', stationDirection: 'FORWARD', stationIntervalM: '50',
    locationMode: 'STA', sampleLengthM: '20', sampleWidthM: '20',
    blockLengthM: '5', blockWidthM: '5', slabDirection: 'FORWARD',
    status: 'SERVICEABLE', remarks: '', color: '',
  });
  const [showMeta, setShowMeta] = useState(true);

  // Global Map Settings
  const [config, setConfig] = useState({
    arpLat: 0.9569,
    arpLng: 104.5311,
    airportName: 'Airside',
    mapRotationDeg: 0,
    stationIntervalM: 50,
  });
  const [configReady, setConfigReady] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const selected = useMemo(() => facilities.find((f) => f.id === selectedId), [facilities, selectedId]);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        setCurrentRole(data.user?.role === 'SUPADMIN' ? 'SUPADMIN' : data.user?.role === 'ADMIN' ? 'ADMIN' : null);
        setPageAccess(Array.isArray(data.pageAccess) ? data.pageAccess : []);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, cRes] = await Promise.all([
        fetch('/api/facilities', { cache: 'no-store' }),
        fetch('/api/config', { cache: 'no-store' }),
      ]);
      if (fRes.ok) setFacilities(await fRes.json());
      if (!cRes.ok) throw new Error('Gagal memuat konfigurasi bandara aktif. Silakan muat ulang halaman.');
      const cfg = await cRes.json();
      if (typeof cfg.arpLat !== 'number' || typeof cfg.arpLng !== 'number'
        || !Number.isFinite(cfg.arpLat) || !Number.isFinite(cfg.arpLng)
        || Math.abs(cfg.arpLat) > 90 || Math.abs(cfg.arpLng) > 180) {
        throw new Error('Koordinat ARP bandara aktif tidak valid. Periksa pengaturan Bandara.');
      }
      setConfig({
        arpLat: cfg.arpLat,
        arpLng: cfg.arpLng,
        airportName: cfg.airportName ?? 'Airside',
        mapRotationDeg: cfg.mapRotationDeg ?? 0,
        stationIntervalM: cfg.stationIntervalM ?? 50,
      });
      setConfigReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data bandara aktif.');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh is the existing async data loader.
  useEffect(() => { refresh(); }, [refresh]);

  // Load polygon & metadata saat facility dipilih
  /* eslint-disable react-hooks/set-state-in-effect -- selection loads a new editable draft. */
  useEffect(() => {
    if (!selected) { setVertices([]); setDirty(false); return; }
    let poly: { lat: number; lng: number }[] = [];
    if (selected.polygonJson) { try { poly = JSON.parse(selected.polygonJson); } catch { poly = []; } }
    setVertices(poly);
    setDirty(false);
    setMeta({
      code: selected.code || '', name: selected.name || '', type: selected.type || 'RUNWAY',
      surfaceType: selected.surfaceType || '', pcn: selected.pcn || '', pcr: selected.pcr || '',
      lengthM: selected.lengthM != null ? String(selected.lengthM) : '',
      widthM: selected.widthM != null ? String(selected.widthM) : '',
      bearingDeg: selected.bearingDeg != null ? String(selected.bearingDeg) : '',
      stationDirection: selected.stationDirection || 'FORWARD',
      stationIntervalM: selected.stationIntervalM != null ? String(selected.stationIntervalM) : '50',
      locationMode: selected.locationMode || 'STA',
      sampleLengthM: selected.sampleLengthM != null ? String(selected.sampleLengthM) : '20',
      sampleWidthM: selected.sampleWidthM != null ? String(selected.sampleWidthM) : '20',
      blockLengthM: selected.blockLengthM != null ? String(selected.blockLengthM) : '5',
      blockWidthM: selected.blockWidthM != null ? String(selected.blockWidthM) : '5',
      slabDirection: selected.slabDirection || 'FORWARD',
      status: selected.status || 'SERVICEABLE', remarks: selected.remarks || '',
      color: selected.color || FACILITY_TYPE_COLORS[selected.type] || '#38bdf8',
    });
  }, [selected]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleVerticesChange = useCallback((v: { lat: number; lng: number }[]) => {
    setVertices(v); setDirty(true);
  }, []);

  const setFacilityStationInterval = (value: string) => {
    setMeta((previous) => ({ ...previous, stationIntervalM: value }));
    setDirty(true);
  };

  // Tambah vertex (tengah edge terpanjang)
  const addVertex = useCallback(() => {
    if (vertices.length < 3) {
      const c = vertices.reduce((a, b) => ({ lat: a.lat + b.lat / vertices.length, lng: a.lng + b.lng / vertices.length }), { lat: 0, lng: 0 });
      setVertices([...vertices, { lat: c.lat + 0.0001, lng: c.lng + 0.0001 }]);
    } else {
      let maxIdx = 0;
      let maxDist = 0;
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const d = (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
        if (d > maxDist) { maxDist = d; maxIdx = i; }
      }
      const a = vertices[maxIdx];
      const b = vertices[(maxIdx + 1) % vertices.length];
      const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
      const newVerts = [...vertices];
      newVerts.splice(maxIdx + 1, 0, mid);
      setVertices(newVerts);
    }
    setDirty(true);
  }, [vertices]);

  const removeLastVertex = useCallback(() => {
    if (vertices.length > 3) { setVertices(vertices.slice(0, -1)); setDirty(true); }
  }, [vertices]);

  const resetVertices = useCallback(() => {
    if (!selected) return;
    let poly: { lat: number; lng: number }[] = [];
    if (selected.polygonJson) { try { poly = JSON.parse(selected.polygonJson); } catch { poly = []; } }
    setVertices(poly);
    setMeta((previous) => ({
      ...previous,
      bearingDeg: selected.bearingDeg != null ? String(selected.bearingDeg) : '',
    }));
    setDirty(false);
  }, [selected]);

  const rotateVerticesBy = useCallback((deg: number) => {
    if (vertices.length < 3) return;
    const currentBearing = meta.bearingDeg.trim() === '' ? null : Number(meta.bearingDeg);
    const rotated = rotateFacilityPolygonClockwise(vertices, deg, currentBearing);
    setVertices(rotated.vertices);
    setMeta((previous) => ({ ...previous, bearingDeg: String(rotated.bearingDeg) }));
    setDirty(true);
  }, [vertices, meta.bearingDeg]);

  const computed = useMemo(() => {
    return computePolygonMetrics(vertices);
  }, [vertices]);

  const computedSampleGrids = useMemo(() => {
    if (meta.locationMode !== 'SAM') return [];
    const targetL = parseFloat(meta.lengthM) || 0;
    const targetW = parseFloat(meta.widthM) || 0;
    const sLen = Math.max(1, parseFloat(meta.sampleLengthM) || 20);
    const sWid = Math.max(1, parseFloat(meta.sampleWidthM) || 20);
    if (targetL <= 0 || targetW <= 0) return [];

    let activeVerts = vertices;
    if (vertices.length >= 3) {
      const targetB = meta.bearingDeg ? parseFloat(meta.bearingDeg) : undefined;
      activeVerts = resizePolygonToDimensions(vertices, targetL, targetW, targetB);
    }

    return generateFacilitySampleGrids(
      {
        code: meta.code || 'FAC',
        lengthM: targetL,
        widthM: targetW,
        centroidLat: computed.centroid?.lat,
        centroidLng: computed.centroid?.lng,
        bearingDeg: meta.bearingDeg ? parseFloat(meta.bearingDeg) : computed.bearingDeg,
        sampleLengthM: sLen,
        sampleWidthM: sWid,
      },
      sLen,
      sWid,
      config.arpLat,
      config.arpLng,
      activeVerts.length >= 3 ? activeVerts : undefined
    );
  }, [meta, vertices, computed, config.arpLat, config.arpLng]);

  // Terapkan ukuran (Panjang & Lebar meter dari inputan) ke bentuk polygon di peta
  const applyDimensionsToMap = useCallback((overrideLength?: number, overrideWidth?: number, overrideBearing?: number) => {
    if (vertices.length < 3) return;
    const targetL = overrideLength ?? parseFloat(meta.lengthM);
    const targetW = overrideWidth ?? parseFloat(meta.widthM);
    const targetB = overrideBearing ?? (meta.bearingDeg ? parseFloat(meta.bearingDeg) : undefined);
    if (!targetL || !targetW || targetL <= 0 || targetW <= 0) return;

    const resized = resizePolygonToDimensions(vertices, targetL, targetW, targetB);
    setVertices(resized);
    setDirty(true);
  }, [vertices, meta.lengthM, meta.widthM, meta.bearingDeg]);

  // Sync dimensi real dari peta ke input metadata
  const syncDimensionsFromMap = useCallback(() => {
    if (vertices.length < 3) return;
    const metrics = computePolygonMetrics(vertices);
    setMeta((prev) => ({
      ...prev,
      lengthM: String(metrics.lengthM),
      widthM: String(metrics.widthM),
      bearingDeg: String(prev.bearingDeg.trim() === '' || !Number.isFinite(Number(prev.bearingDeg))
        ? metrics.bearingDeg
        : closestEquivalentBearing(metrics.bearingDeg, Number(prev.bearingDeg))),
    }));
    setDirty(true);
  }, [vertices]);

  const save = async () => {
    if (!selected) return;
    setError(''); setSuccess(''); setSaving(true);
    try {
      let finalVertices = vertices;
      const finalLength = meta.lengthM ? parseFloat(meta.lengthM) : null;
      const finalWidth = meta.widthM ? parseFloat(meta.widthM) : null;
      const finalBearing = meta.bearingDeg ? parseFloat(meta.bearingDeg) : null;

      if (vertices.length >= 3 && finalLength && finalWidth && finalLength > 0 && finalWidth > 0) {
        finalVertices = resizePolygonToDimensions(vertices, finalLength, finalWidth, finalBearing ?? undefined);
        setVertices(finalVertices);
      }

      const finalMetrics = computePolygonMetrics(finalVertices);

      const body: Record<string, unknown> = {
        code: meta.code, name: meta.name, type: meta.type,
        surfaceType: meta.surfaceType || null, pcn: meta.pcn || null, pcr: meta.pcr || null,
        lengthM: finalLength,
        widthM: finalWidth,
        bearingDeg: finalBearing,
        stationDirection: meta.stationDirection || 'FORWARD',
        stationIntervalM: meta.stationIntervalM ? parseFloat(meta.stationIntervalM) : 50,
        locationMode: meta.locationMode || 'STA',
        sampleLengthM: meta.sampleLengthM ? parseFloat(meta.sampleLengthM) : 20,
        sampleWidthM: meta.sampleWidthM ? parseFloat(meta.sampleWidthM) : 20,
        blockLengthM: meta.blockLengthM ? parseFloat(meta.blockLengthM) : 5,
        blockWidthM: meta.blockWidthM ? parseFloat(meta.blockWidthM) : 5,
        slabDirection: meta.slabDirection === 'REVERSE' ? 'REVERSE' : 'FORWARD',
        status: meta.status, remarks: meta.remarks || null, color: meta.color || null,
        polygonJson: JSON.stringify(finalVertices),
        areaSqm: finalMetrics.areaSqm,
        centroidLat: finalMetrics.centroid?.lat ?? null,
        centroidLng: finalMetrics.centroid?.lng ?? null,
      };
      const res = await fetch(`/api/facilities/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as { error?: string }).error || 'Gagal menyimpan'); }
      const saved = await res.json() as {
        stationResplit?: {
          updatedFindings: number;
          pointOnlyFindings: number;
          skippedFindings: number;
        } | null;
      };
      const summary = saved.stationResplit;
      setSuccess(summary
        ? `Perubahan disimpan. ${summary.updatedFindings} temuan diperbarui ke interval STA baru.`
        : 'Perubahan disimpan.');
      if (summary?.skippedFindings) {
        setError(`${summary.skippedFindings} temuan tidak dapat dibagi ulang karena data lokasi, geometri, luas, atau metadata tidak lengkap atau tidak konsisten; data aslinya tetap aman.`);
      } else if (summary?.pointOnlyFindings) {
        setError(`${summary.pointOnlyFindings} temuan tanpa poligon hanya diperbarui label STA berdasarkan titik; luasnya tidak dipecah.`);
      }
      setDirty(false); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal menyimpan'); }
    finally { setSaving(false); }
  };

  const deleteFacility = async () => {
    if (!selected) return;
    if (!window.confirm(`Hapus fasilitas "${selected.code} — ${selected.name}"? Data terkait ikut terhapus.`)) return;
    setError('');
    try { const res = await fetch(`/api/facilities/${selected.id}`, { method: 'DELETE' }); if (!res.ok) throw new Error(''); setSelectedId(''); await refresh(); }
    catch { setError('Gagal menghapus fasilitas'); }
  };

  const generateDefaultBoxVertices = useCallback(() => {
    const centerLat = config.arpLat;
    const centerLng = config.arpLng;
    const dLat = 0.00015;
    const dLng = 0.0004;
    const defaultVerts = [
      { lat: centerLat - dLat, lng: centerLng - dLng },
      { lat: centerLat - dLat, lng: centerLng + dLng },
      { lat: centerLat + dLat, lng: centerLng + dLng },
      { lat: centerLat + dLat, lng: centerLng - dLng },
    ];
    setVertices(defaultVerts);
    setDirty(true);
  }, [config.arpLat, config.arpLng]);

  const createFacility = async () => {
    setError('');
    try {
      const centerLat = config.arpLat;
      const centerLng = config.arpLng;
      const dLat = 0.00015;
      const dLng = 0.0004;
      const defaultVerts = [
        { lat: centerLat - dLat, lng: centerLng - dLng },
        { lat: centerLat - dLat, lng: centerLng + dLng },
        { lat: centerLat + dLat, lng: centerLng + dLng },
        { lat: centerLat + dLat, lng: centerLng - dLng },
      ];

      const res = await fetch('/api/facilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: `FAC-${String(facilities.length + 1).padStart(2, '0')}`,
          name: 'Fasilitas Baru',
          type: 'RUNWAY',
          status: 'SERVICEABLE',
          polygonJson: JSON.stringify(defaultVerts),
          centroidLat: centerLat,
          centroidLng: centerLng,
          lengthM: 100,
          widthM: 30,
        }),
      });
      if (!res.ok) throw new Error('');
      const created = (await res.json()) as Facility;
      await refresh();
      setSelectedId(created.id);
      setSuccess('Fasilitas baru berhasil dibuat dengan polygon awal di peta. Silakan drag titik vertex atau klik peta untuk menyesuaikan.');
    } catch {
      setError('Gagal membuat fasilitas baru');
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    setError(''); setSuccess('');
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Gagal menyimpan pengaturan peta global');
      setSuccess('Pengaturan Peta Acuan Global berhasil disimpan.');
      setShowGlobalSettings(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSavingConfig(false);
    }
  };

  // [AV-PART3]
  if (loading) return <div className="flex items-center justify-center h-full text-gray-500">Memuat data fasilitas...</div>;

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col lg:h-full lg:min-h-0 lg:flex-row">
      {/* Panel kiri — daftar fasilitas */}
      <aside className="flex max-h-72 w-full flex-col overflow-hidden border-b border-gray-200 bg-white lg:max-h-none lg:w-80 lg:border-r lg:border-b-0">
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-sky-600" /> Kelola Fasilitas
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowGlobalSettings(true)}
              className="p-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
              title="Pengaturan Rotasi & Peta Acuan Global"
            >
              <Compass className="w-4 h-4" />
            </button>
            <button onClick={createFacility} className="p-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white" title="Tambah fasilitas">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="bg-sky-50/60 p-2 border-b border-sky-100 flex items-center justify-between text-xs text-sky-900 font-medium">
          <span className="flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-amber-600" /> Rotasi Peta Global:
          </span>
          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-sky-200 font-bold">
            {config.mapRotationDeg}°
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {currentRole && pageAccess.includes('admin') && <div className="border-b border-slate-200 bg-slate-50 p-2.5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <Users className="h-3.5 w-3.5" /> {currentRole === 'SUPADMIN' ? 'Menu Superadmin' : 'Menu Admin'}
            </p>
            <nav aria-label={currentRole === 'SUPADMIN' ? 'Menu Superadmin' : 'Menu Admin'} className="space-y-1.5">
              {pageAccess.includes('users') && <Link href="/admin/users" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50">
                <Users className="h-4 w-4 text-sky-700" /> Akun
              </Link>}
              {pageAccess.includes('airports') && <Link href="/admin/airports" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50">
                <MapPin className="h-4 w-4 text-sky-700" /> Bandara
              </Link>}
              {(['dvFlexible', 'dvRigid', 'cdvFlexible', 'cdvRigid'] as PageKey[]).some((page) => pageAccess.includes(page)) && <>
                <button
                  type="button"
                  aria-expanded={showPciMenu}
                  aria-controls="superadmin-pci-links"
                  onClick={() => setShowPciMenu((open) => !open)}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50"
                >
                  <LineChart className="h-4 w-4 text-sky-700" /> Perhitungan PCI
                  {showPciMenu ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
                </button>
                <div id="superadmin-pci-links" hidden={!showPciMenu} className="ml-3 space-y-1 border-l-2 border-sky-200 pl-3">
                  {pageAccess.includes('dvFlexible') && <Link href="/admin/kurva-dv-fleksibel" className="block rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-sky-100">Kurva DV Fleksibel</Link>}
                  {pageAccess.includes('dvRigid') && <Link href="/admin/kurva-dv-rigit" className="block rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-sky-100">Kurva DV Rigit</Link>}
                  {pageAccess.includes('cdvFlexible') && <Link href="/admin/kurva-cdv-fleksibel" className="block rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-sky-100">Kurva CDV Fleksibel</Link>}
                  {pageAccess.includes('cdvRigid') && <Link href="/admin/kurva-cdv-rigit" className="block rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-sky-100">Kurva CDV Rigit</Link>}
                </div>
              </>}
              {/* Link Backup & Recovery harus di luar blok PCI: dulu tersembunyi bagi ADMIN tanpa akses kurva PCI. */}
              <Link href="/admin/backup-recovery" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50">
                <Database className="h-4 w-4 text-sky-700" /> Backup & Recovery
              </Link>
            </nav>
          </div>}
          {facilities.length === 0 && <p className="p-3 text-xs text-gray-400">Belum ada fasilitas. Klik + untuk menambah.</p>}
          {facilities.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedId(f.id)}
              className={`w-full text-left px-3 py-2 border-b border-gray-50 hover:bg-sky-50 transition-colors ${selectedId === f.id ? 'bg-sky-100 border-l-4 border-l-sky-600' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: f.color || FACILITY_TYPE_COLORS[f.type] || '#94a3b8' }} />
                <span className="font-semibold text-sm text-gray-800">{f.code}</span>
                <span className="text-xs text-gray-400 ml-auto">{FACILITY_TYPE_LABEL[f.type]}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{f.name}</p>
            </button>
          ))}
        </div>
      </aside>

      {/* Panel tengah — peta edit polygon */}
      <div className="relative min-h-[55svh] flex-1 lg:min-h-0">
        {configReady ? <AdminMap
          arpLat={config.arpLat}
          arpLng={config.arpLng}
          facilities={facilities}
          selectedId={selectedId}
          vertices={vertices}
          mapRotationDeg={config.mapRotationDeg}
          stationIntervalM={parseFloat(meta.stationIntervalM) || 50}
          locationMode={meta.locationMode as 'STA' | 'SAM'}
          sampleLengthM={parseFloat(meta.sampleLengthM) || 20}
          sampleWidthM={parseFloat(meta.sampleWidthM) || 20}
          surfaceType={meta.surfaceType}
          blockLengthM={parseFloat(meta.blockLengthM) || 5}
          blockWidthM={parseFloat(meta.blockWidthM) || 5}
          slabDirection={meta.slabDirection as 'FORWARD' | 'REVERSE'}
          lengthM={meta.lengthM ? parseFloat(meta.lengthM) : undefined}
          widthM={meta.widthM ? parseFloat(meta.widthM) : undefined}
          bearingDeg={meta.bearingDeg ? parseFloat(meta.bearingDeg) : undefined}
          onVerticesChange={handleVerticesChange}
          onSelectFacility={(id) => setSelectedId(id)}
        /> : (
          <div className="flex h-full items-center justify-center bg-slate-900 px-6 text-center text-sm text-slate-300" role="status">
            {loading ? 'Memuat peta sesuai ARP bandara aktif...' : 'Peta belum tersedia. Konfigurasi ARP bandara aktif gagal dimuat.'}
          </div>
        )}
        {selected && (
          <div className="absolute top-3 left-3 bg-white/95 backdrop-blur rounded-lg shadow-lg px-3 py-2 text-xs max-w-xs">
            <p className="font-bold text-gray-800">{selected.code} — {selected.name}</p>
            <p className="text-gray-500">Vertex: {vertices.length} · Luas: {computed.areaSqm.toFixed(0)} m²</p>
            {dirty && <p className="text-amber-600 font-semibold">● Belum disimpan</p>}
          </div>
        )}
      </div>

      {/* Panel kanan — metadata */}
      <aside className="flex max-h-[70svh] w-full flex-col overflow-hidden border-t border-gray-200 bg-white lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
        <div className="p-3 border-b border-gray-100">
          <button onClick={() => setShowMeta(!showMeta)} className="flex items-center justify-between w-full font-bold text-gray-800">
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-sky-600" /> Metadata & Polygon</span>
            {showMeta ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {showMeta && selected && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">Kode</span>
                <input value={meta.code} onChange={(e) => setMeta({ ...meta, code: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Tipe</span>
                <select value={meta.type} onChange={(e) => setMeta({ ...meta, type: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs">
                  <option value="RUNWAY">Runway</option>
                  <option value="TAXIWAY">Taxiway</option>
                  <option value="APRON">Apron</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-gray-500">Nama</span>
              <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">PCN</span>
                <input value={meta.pcn} onChange={(e) => setMeta({ ...meta, pcn: e.target.value })} placeholder="PCN 60 F/B/W/T" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">PCR</span>
                <input value={meta.pcr} onChange={(e) => setMeta({ ...meta, pcr: e.target.value })} placeholder="PCR 74 F/B/W/T" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs" />
              </label>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2">
              <label className="block">
                <span className="text-xs font-bold text-slate-800 block mb-1">Metode Lokasi Kerusakan</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMeta({ ...meta, locationMode: 'STA' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${meta.locationMode === 'STA' ? 'bg-sky-600 text-white border-sky-600 shadow-xs' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                  >
                    📍 STA (Station)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeta({ ...meta, locationMode: 'SAM' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${meta.locationMode === 'SAM' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                  >
                    ⏹ SAM (Sampel PCI)
                  </button>
                </div>
              </label>
            </div>

            {meta.locationMode === 'SAM' && (
              <div className="bg-purple-50/80 p-3 rounded-lg border border-purple-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 flex items-center gap-1">
                    ⏹ Ukuran Sampel Kotak PCI (PxL)
                  </span>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-200/80 px-1.5 py-0.5 rounded font-mono">
                    Mode SAM
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] font-semibold text-purple-900">Panjang Sampel (m)</span>
                    <input
                      type="number"
                      min="1"
                      value={meta.sampleLengthM}
                      onChange={(e) => setMeta({ ...meta, sampleLengthM: e.target.value })}
                      className="mt-1 w-full border border-purple-300 rounded px-2 py-1 text-xs font-mono font-bold text-purple-950 bg-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-purple-900">Lebar Sampel (m)</span>
                    <input
                      type="number"
                      min="1"
                      value={meta.sampleWidthM}
                      onChange={(e) => setMeta({ ...meta, sampleWidthM: e.target.value })}
                      className="mt-1 w-full border border-purple-300 rounded px-2 py-1 text-xs font-mono font-bold text-purple-950 bg-white"
                    />
                  </label>
                </div>
                <div className="flex gap-1 flex-wrap pt-0.5">
                  <button type="button" onClick={() => setMeta({ ...meta, sampleLengthM: '10', sampleWidthM: '10' })} className="px-2 py-0.5 rounded border border-purple-300 text-[10px] font-semibold bg-white hover:bg-purple-100 text-purple-900">10×10m</button>
                  <button type="button" onClick={() => setMeta({ ...meta, sampleLengthM: '15', sampleWidthM: '15' })} className="px-2 py-0.5 rounded border border-purple-300 text-[10px] font-semibold bg-white hover:bg-purple-100 text-purple-900">15×15m</button>
                  <button type="button" onClick={() => setMeta({ ...meta, sampleLengthM: '20', sampleWidthM: '20' })} className="px-2 py-0.5 rounded border border-purple-300 text-[10px] font-semibold bg-white hover:bg-purple-100 text-purple-900">20×20m</button>
                  <button type="button" onClick={() => setMeta({ ...meta, sampleLengthM: '25', sampleWidthM: '15' })} className="px-2 py-0.5 rounded border border-purple-300 text-[10px] font-semibold bg-white hover:bg-purple-100 text-purple-900">25×15m</button>
                  <button type="button" onClick={() => setMeta({ ...meta, sampleLengthM: '30', sampleWidthM: '30' })} className="px-2 py-0.5 rounded border border-purple-300 text-[10px] font-semibold bg-white hover:bg-purple-100 text-purple-900">30×30m</button>
                </div>
                {computedSampleGrids.length > 0 && (() => {
                  const sLen = Math.max(1, parseFloat(meta.sampleLengthM) || 20);
                  const sWid = Math.max(1, parseFloat(meta.sampleWidthM) || 20);
                  const standardCount = computedSampleGrids.filter((g: FacilitySampleGrid) => Math.abs(g.lengthM - sLen) < 0.1 && Math.abs(g.widthM - sWid) < 0.1).length;
                  const partialGrids = computedSampleGrids.filter((g: FacilitySampleGrid) => Math.abs(g.lengthM - sLen) >= 0.1 || Math.abs(g.widthM - sWid) >= 0.1);

                  return (
                    <div className="bg-white p-2.5 rounded-lg border border-purple-200 text-xs text-purple-950 space-y-1.5 font-mono shadow-xs">
                      <div className="flex justify-between items-center font-bold text-sm border-b border-purple-100 pb-1">
                        <span>Estimasi Grid Sampel:</span>
                        <span className="text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded">
                          {computedSampleGrids.length} Sampel
                        </span>
                      </div>
                      <div className="text-[11px] space-y-0.5 text-purple-900">
                        <div>• Standar ({sLen}×{sWid}m): <strong className="text-emerald-700">{standardCount}</strong> unit</div>
                        {partialGrids.length > 0 && (
                          <div className="text-amber-800">
                            • Sisa Fasilitas (Disesuaikan): <strong className="text-amber-700">{partialGrids.length}</strong> unit
                            <div className="text-[10px] text-amber-600 pl-2">
                              ({partialGrids.map((g: FacilitySampleGrid) => `${g.sampleCode}: ${g.lengthM}×${g.widthM}m`).join(', ')})
                            </div>
                          </div>
                        )}
                        <div className="pt-1 text-[10px] text-purple-700 font-sans border-t border-purple-50">
                          Kode Penamaan: <strong>SAM-1</strong> s/d <strong>SAM-{computedSampleGrids.length}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {meta.locationMode === 'STA' && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Arah Urutan Stationing (STA)</span>
                  <select
                    value={meta.stationDirection || 'FORWARD'}
                    onChange={(e) => setMeta({ ...meta, stationDirection: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs font-semibold text-sky-900 bg-sky-50/50"
                  >
                    <option value="FORWARD">Normal: STA 0+000 Ujung Awal → Ujung Akhir (Kiri → Kanan)</option>
                    <option value="REVERSE">Dibalik: STA 0+000 Ujung Akhir → Ujung Awal (Kanan → Kiri)</option>
                  </select>
                </label>
                <div className="bg-amber-50/70 p-2.5 rounded-md border border-amber-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900">Jarak Interval Garis STA (m)</span>
                    <input
                      type="number"
                      min="5"
                      step="5"
                      value={meta.stationIntervalM}
                      onChange={(e) => setFacilityStationInterval(e.target.value)}
                      className="w-20 border border-amber-300 rounded px-2 py-0.5 text-right font-mono font-bold text-amber-950 bg-white"
                    />
                  </div>
                  <span className="text-[10px] text-amber-800 block">Jarak antar garis STA di peta dan interval baris STA fasilitas ini pada tabel PCI.</span>
                  <div className="flex gap-1 flex-wrap pt-0.5">
                    <button type="button" onClick={() => setFacilityStationInterval('10')} className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${meta.stationIntervalM === '10' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300'}`}>10m</button>
                    <button type="button" onClick={() => setFacilityStationInterval('25')} className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${meta.stationIntervalM === '25' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300'}`}>25m</button>
                    <button type="button" onClick={() => setFacilityStationInterval('50')} className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${meta.stationIntervalM === '50' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300'}`}>50m</button>
                    <button type="button" onClick={() => setFacilityStationInterval('100')} className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${meta.stationIntervalM === '100' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300'}`}>100m</button>
                  </div>
                </div>
                {/* Preview Sub-Fasilitas Potongan Stationing 10 Meter */}
                {parseFloat(meta.lengthM) > 0 && (
                  <div className="bg-emerald-50/70 p-2.5 rounded-md border border-emerald-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                      <span>Sub-Fasilitas (Potongan 10m):</span>
                      <span className="font-mono bg-emerald-200/80 px-1.5 py-0.5 rounded text-[10px]">
                        {Math.ceil(parseFloat(meta.lengthM) / 10)} Segmen
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-800 flex items-center justify-between font-mono">
                      <span>STA 0+000 s/d STA 0+010</span>
                      <span>...</span>
                      <span>STA {Math.floor(parseFloat(meta.lengthM)/1000)}+{String(Math.floor(parseFloat(meta.lengthM)%1000)).padStart(3, '0')}</span>
                    </div>
                    <p className="text-[10px] text-emerald-700 italic leading-tight">
                      {meta.stationDirection === 'REVERSE'
                        ? 'Arah STA DIBALIK (Mulai STA 0+000 dari Ujung Akhir/Kanan ke Ujung Awal/Kiri).'
                        : 'Arah STA NORMAL (Mulai STA 0+000 dari Ujung Awal/Kiri ke Ujung Akhir/Kanan).'}
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="bg-sky-50/60 p-2 rounded-md border border-sky-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-sky-800">Dimensi Real Peta:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => applyDimensionsToMap()}
                    className="px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    title="Terapkan ukuran input (Panjang x Lebar) ke bentuk Polygon di Peta"
                  >
                    Terapkan Ke Map
                  </button>
                  <button
                    type="button"
                    onClick={syncDimensionsFromMap}
                    className="px-2 py-0.5 text-[10px] font-medium rounded bg-sky-600 hover:bg-sky-700 text-white shadow-xs"
                    title="Baca dimensi dari bentuk Polygon peta ke form"
                  >
                    Ambil Dari Map
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px] text-sky-900 font-mono">
                <div>P: {computed.lengthM}m</div>
                <div>L: {computed.widthM}m</div>
                <div>A: {computed.areaSqm}m²</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">Panjang (m)</span>
                <input
                  value={meta.lengthM}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMeta({ ...meta, lengthM: val });
                    const l = parseFloat(val);
                    if (l > 0) applyDimensionsToMap(l, undefined, undefined);
                  }}
                  type="number"
                  className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs font-mono"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Lebar (m)</span>
                <input
                  value={meta.widthM}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMeta({ ...meta, widthM: val });
                    const w = parseFloat(val);
                    if (w > 0) applyDimensionsToMap(undefined, w, undefined);
                  }}
                  type="number"
                  className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs font-mono"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Bearing (°)</span>
                <input
                  value={meta.bearingDeg}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMeta({ ...meta, bearingDeg: val });
                    const b = parseFloat(val);
                    if (!isNaN(b)) applyDimensionsToMap(undefined, undefined, b);
                  }}
                  type="number"
                  className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs font-mono"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">Tipe Perkerasan</span>
                <select value={meta.surfaceType} onChange={(e) => setMeta({ ...meta, surfaceType: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs">
                  <option value="">—</option>
                  <option value="ASPHALT">Asphalt</option>
                  <option value="CONCRETE">Concrete</option>
                </select>
              </label>
            {meta.surfaceType === 'CONCRETE' && (
              <div className="grid grid-cols-2 gap-2 bg-amber-50/80 p-2 rounded-lg border border-amber-200">
                <label className="block">
                  <span className="text-[11px] font-bold text-amber-900">Panjang Slab (m)</span>
                  <input
                    value={meta.blockLengthM}
                    onChange={(e) => setMeta({ ...meta, blockLengthM: e.target.value })}
                    type="number"
                    step="0.5"
                    placeholder="5"
                    className="mt-1 w-full border border-amber-300 rounded px-2 py-1 text-xs font-bold text-amber-950 bg-white"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-amber-900">Lebar Slab (m)</span>
                  <input
                    value={meta.blockWidthM}
                    onChange={(e) => setMeta({ ...meta, blockWidthM: e.target.value })}
                    type="number"
                    step="0.5"
                    placeholder="5"
                    className="mt-1 w-full border border-amber-300 rounded px-2 py-1 text-xs font-bold text-amber-950 bg-white"
                  />
                </label>
                <label className="col-span-2 block border-t border-amber-200 pt-2">
                  <span className="text-[11px] font-bold text-amber-900">Arah Penomoran Slab</span>
                  <select
                    value={meta.slabDirection}
                    onChange={(e) => {
                      setMeta({ ...meta, slabDirection: e.target.value });
                      setDirty(true);
                    }}
                    className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-xs font-semibold text-amber-950"
                  >
                    <option value="FORWARD">Normal — Slab A dari kiri atas</option>
                    <option value="REVERSE">Reverse — Slab A dari kanan bawah</option>
                  </select>
                  <span className="mt-1 block text-[10px] text-amber-700">
                    Arah sudut mengikuti orientasi dan bearing fasilitas.
                  </span>
                </label>
              </div>
            )}
              <label className="block">
                <span className="text-xs text-gray-500">Status</span>
                <select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs">
                  <option value="SERVICEABLE">Serviceable</option>
                  <option value="CAUTION">Caution</option>
                  <option value="UNSERVICEABLE">Unserviceable</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-gray-500">Warna Polygon</span>
              <input type="color" value={meta.color} onChange={(e) => setMeta({ ...meta, color: e.target.value })} className="mt-1 w-full h-8 border border-gray-300 rounded-md cursor-pointer" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Keterangan</span>
              <textarea value={meta.remarks} onChange={(e) => setMeta({ ...meta, remarks: e.target.value })} rows={2} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs" />
            </label>
            {/* Polygon vertex tools */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">Polygon ({vertices.length} vertex)</p>

              {vertices.length < 3 && (
                <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-900 space-y-1.5">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Mode Penggambaran Aktif
                  </p>
                  <p className="text-[10px] text-amber-800">
                    Klik pada peta di area yang diinginkan untuk menambahkan titik vertex baru, atau buat polygon awal 4 titik otomatis:
                  </p>
                  <button
                    type="button"
                    onClick={generateDefaultBoxVertices}
                    className="w-full py-1 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-xs flex items-center justify-center gap-1"
                  >
                    <MapPin className="w-3 h-3" /> Buat Polygon Box 4 Titik Awal
                  </button>
                </div>
              )}

              <div className="flex gap-1.5 flex-wrap">
                <button onClick={addVertex} className="px-2 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Vertex
                </button>
                <button onClick={removeLastVertex} disabled={vertices.length <= 3} className="px-2 py-1 text-xs rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Hapus
                </button>
                <button onClick={resetVertices} disabled={!dirty} className="px-2 py-1 text-xs rounded-md bg-gray-600 hover:bg-gray-700 disabled:opacity-40 text-white flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              {/* Rotasi Fasilitas */}
              <div className="mt-3 bg-gray-50 p-2 rounded-md border border-gray-200">
                <span className="text-[11px] font-medium text-gray-600 block mb-1.5">Rotasi Fasilitas</span>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => rotateVerticesBy(-0.1)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> -0,1°
                  </button>
                  <button onClick={() => rotateVerticesBy(-1)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> -1°
                  </button>
                  <button onClick={() => rotateVerticesBy(-5)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> -5°
                  </button>
                  <button onClick={() => rotateVerticesBy(-15)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> -15°
                  </button>
                  <button onClick={() => rotateVerticesBy(0.1)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCw className="w-3 h-3" /> +0,1°
                  </button>
                  <button onClick={() => rotateVerticesBy(1)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCw className="w-3 h-3" /> +1°
                  </button>
                  <button onClick={() => rotateVerticesBy(5)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCw className="w-3 h-3" /> +5°
                  </button>
                  <button onClick={() => rotateVerticesBy(15)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCw className="w-3 h-3" /> +15°
                  </button>
                  <button onClick={() => rotateVerticesBy(90)} className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                    <RotateCw className="w-3 h-3" /> 90°
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-gray-400 mt-2">Drag vertex di peta atau tahan Shift+Drag polygon untuk reposisi.</p>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
            {success && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-md px-2 py-1.5">{success}</p>}
            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving || !dirty} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 text-sm">
                <Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button onClick={deleteFacility} className="px-3 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg text-sm">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {showMeta && !selected && (
          <div className="flex-1 flex items-center justify-center p-4 text-xs text-gray-400 text-center">
            Pilih fasilitas di panel kiri atau di peta untuk mengedit.
          </div>
        )}
      </aside>

      {/* Modal Rotasi Peta Global & ARP */}
      {showGlobalSettings && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base">
                <Compass className="w-5 h-5 text-amber-600" /> Pengaturan Peta Acuan Global
              </h3>
              <button onClick={() => setShowGlobalSettings(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-amber-900 leading-relaxed">
                Rotasi ini menjadi acuan sudut rotasi visual seluruh tampilan peta (Dashboard, DXF, Admin).
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700">Sudut Rotasi Peta (°)</span>
                  <input
                    type="number"
                    value={config.mapRotationDeg}
                    onChange={(e) => setConfig({ ...config, mapRotationDeg: parseFloat(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-0.5 text-right font-mono font-bold text-sky-900"
                  />
                </div>
                <input
                  type="range" min="-180" max="180" step="1"
                  value={config.mapRotationDeg}
                  onChange={(e) => setConfig({ ...config, mapRotationDeg: parseFloat(e.target.value) || 0 })}
                  className="w-full accent-sky-600 cursor-pointer"
                />
                <div className="flex gap-1 flex-wrap pt-1">
                  <button type="button" onClick={() => setConfig({ ...config, mapRotationDeg: 0 })} className="px-2 py-1 rounded border bg-gray-50 hover:bg-gray-100">0° (Utara)</button>
                  <button type="button" onClick={() => setConfig({ ...config, mapRotationDeg: -43 })} className="px-2 py-1 rounded border bg-gray-50 hover:bg-gray-100">-43° (Runway YIA)</button>
                  <button type="button" onClick={() => setConfig({ ...config, mapRotationDeg: 137 })} className="px-2 py-1 rounded border bg-gray-50 hover:bg-gray-100">137° (Sebaliknya)</button>
                  <button type="button" onClick={() => setConfig({ ...config, mapRotationDeg: 90 })} className="px-2 py-1 rounded border bg-gray-50 hover:bg-gray-100">90° (Timur)</button>
                </div>
              </div>
              <div className="border-t pt-3 space-y-2">
                <span className="font-bold text-gray-700 block">Titik Acuan ARP & Bandara</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-gray-500 text-[11px]">ARP Lat</span><input type="number" step="any" value={config.arpLat} onChange={(e) => setConfig({ ...config, arpLat: parseFloat(e.target.value) || 0 })} className="mt-1 w-full border rounded px-2 py-1 font-mono" /></label>
                  <label className="block"><span className="text-gray-500 text-[11px]">ARP Lng</span><input type="number" step="any" value={config.arpLng} onChange={(e) => setConfig({ ...config, arpLng: parseFloat(e.target.value) || 0 })} className="mt-1 w-full border rounded px-2 py-1 font-mono" /></label>
                </div>
                <label className="block"><span className="text-gray-500 text-[11px]">Nama Bandara</span><input type="text" value={config.airportName} onChange={(e) => setConfig({ ...config, airportName: e.target.value })} className="mt-1 w-full border rounded px-2 py-1" /></label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onClick={() => setShowGlobalSettings(false)} className="px-3 py-1.5 text-xs rounded border text-gray-700">Batal</button>
              <button type="button" onClick={saveConfig} disabled={savingConfig} className="px-4 py-1.5 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1">
                <Save className="w-3.5 h-3.5" /> {savingConfig ? 'Menyimpan...' : 'Simpan Acuan Global'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
