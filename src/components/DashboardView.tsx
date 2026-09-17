'use client';

// Dashboard monitoring airside: peta satelit ala Google Earth + KPI performance,
// panel detail fasilitas (PCN/PCR, dimensi), daftar temuan, dan modals (DXF, kerusakan, ARP).

import { useCallback, useEffect, useMemo, useState } from 'react';
import nextDynamic from 'next/dynamic';
import { Pencil, Upload, Settings, Crosshair, Activity, AlertTriangle, Paintbrush, Gauge, X, RotateCw, FileText, Trash2, MoreVertical } from 'lucide-react';
import type { Facility, Damage, MarkingFinding, MapLayer, AppConfig, PciSection } from '@/types';
import type { DrawnRect } from './FacilityMap';
import DamageFormModal from './DamageFormModal';
import DamageDetailModal from './DamageDetailModal';
import DxfUploadModal from './DxfUploadModal';
import { FACILITY_TYPE_LABEL, FACILITY_TYPE_COLORS, SEVERITY_COLORS, DAMAGE_STATUS_LABEL } from '@/lib/constants';
import { resolveDamageCatalogEntry } from '@/lib/damage-catalog';
import { distressCatalog } from '@/lib/pci-data';
import { formatLatLng, formatLocal, findFacilityForPoint, splitDamageByStation, splitDamageBySampleGrids, splitPolylineByStation, splitPolylineBySampleGrids, calculateFacilityStation, generateFacilitySampleGridsSnapped, generateFacilityConcreteBlocksSnapped, findSampleCodeForPoint, findConcreteBlockForPoint, groupDamagesWithBreakdown, type SplitDamageItem } from '@/lib/geo';
import { pciRating } from '@/lib/pci';
import { validateCdvCurveSet } from '@/lib/cdv';
import { validateDvCurveSet } from '@/lib/dv';
import type { SurfaceType } from '@/lib/pci-data';
import { calculateFacilityPciAverage, latestPciForFacilities, type PciFacilityCurves } from '@/lib/pci-facility-average';
import { formatDamageQuantity } from '@/lib/damage-quantity';
import { damageDrawingInstruction, damageDrawingModeLabel } from '@/lib/damage-drawing';

const FacilityMap = nextDynamic(() => import('./FacilityMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-800 animate-pulse" />,
});

export default function DashboardView() {
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const canEdit = currentRole !== null && currentRole !== 'VIEWER';
  const canManage = currentRole === 'ADMIN' || currentRole === 'SUPADMIN';
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((response) => response.json())
      .then((data) => setCurrentRole(data.user?.role ?? null)).catch(() => {});
  }, []);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [damages, setDamages] = useState<Damage[]>([]);
  const [markings, setMarkings] = useState<MarkingFinding[]>([]);
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [pciSections, setPciSections] = useState<PciSection[]>([]);
  const [pciCurves, setPciCurves] = useState<Partial<Record<SurfaceType, PciFacilityCurves>> | null>(null);
  const [config, setConfig] = useState<AppConfig>({ arpLat: 0.9569, arpLng: 104.5311, airportName: 'Airside', mapRotationDeg: 0 });
  const [loading, setLoading] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [drawFacilityId, setDrawFacilityId] = useState('');
  const [drawType, setDrawType] = useState('');
  const [rect, setRect] = useState<DrawnRect | null>(null);
  const [showDamageForm, setShowDamageForm] = useState(false);
  const [editingDamageModal, setEditingDamageModal] = useState<Damage | null>(null);
  const [editingGeometryDamage, setEditingGeometryDamage] = useState<Damage | null>(null);
  const [contextMenu, setContextMenu] = useState<{ damage: Damage; x: number; y: number } | null>(null);
  const [deletingDamage, setDeletingDamage] = useState<Damage | null>(null);
  const [detailDamageModal, setDetailDamageModal] = useState<Damage | null>(null);
  const [showDxf, setShowDxf] = useState(false);
  const [showArp, setShowArp] = useState(false);
  const [arpLatInput, setArpLatInput] = useState('');
  const [arpLngInput, setArpLngInput] = useState('');
  const [selected, setSelected] = useState<Facility | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [filterSev, setFilterSev] = useState<'ALL' | 'L' | 'M' | 'H' | '-'>('ALL');

  const drawFacility = facilities.find((facility) => facility.id === drawFacilityId);
  const drawSurface = drawFacility?.surfaceType === 'CONCRETE' ? 'JPCP'
    : drawFacility?.surfaceType === 'ASPHALT' ? 'ASPHALT' : null;
  const drawCatalog = drawSurface ? config.damageCatalogs?.[drawSurface] ?? [] : [];
  const drawDefinitions = drawSurface ? distressCatalog(drawSurface) : [];
  const drawOptions = drawCatalog.map((entry) => ({
    ...entry,
    unit: entry.pciCode == null
      ? 'PERCENT' as const
      : drawDefinitions.find((definition) => definition.code === entry.pciCode)?.unit ?? 'PERCENT' as const,
  }));
  const drawEntry = drawOptions.find((entry) => entry.id === drawType);
  const drawUnit = drawEntry?.unit ?? 'PERCENT';

  const damageName = (damage: Damage) => {
    const facility = facilities.find((item) => item.id === damage.facilityId) ?? damage.facility;
    const surface = facility?.surfaceType === 'CONCRETE' ? 'JPCP'
      : facility?.surfaceType === 'ASPHALT' ? 'ASPHALT' : null;
    return (surface ? resolveDamageCatalogEntry(
      damage.type, surface, config.damageCatalogs?.[surface] ?? [], config.damageTypesConfig,
    ) : null)?.name ?? damage.type;
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, dRes, mRes, lRes, cRes, pRes] = await Promise.all([
        fetch('/api/facilities'),
        fetch('/api/damages'),
        fetch('/api/markings'),
        fetch('/api/map-layers'),
        fetch('/api/config'),
        fetch('/api/pci/sections'),
      ]);
      if (fRes.ok) setFacilities(await fRes.json());
      if (dRes.ok) setDamages(await dRes.json());
      if (mRes.ok) setMarkings(await mRes.json());
      if (lRes.ok) setLayers(await lRes.json());
      if (pRes.ok) setPciSections(await pRes.json());
      if (cRes.ok) {
        const c = (await cRes.json()) as AppConfig;
        setConfig(c);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- existing async data loader.
    refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;
    const loadCurves = async (surface: SurfaceType): Promise<[SurfaceType, PciFacilityCurves]> => {
      const [cdvResponse, dvResponse] = await Promise.all([
        fetch(`/api/pci/cdv-curves?surfaceType=${surface}`, { cache: 'no-store' }),
        fetch(`/api/pci/dv-curves?surfaceType=${surface}`, { cache: 'no-store' }),
      ]);
      if (!cdvResponse.ok || !dvResponse.ok) throw new Error(`Kurva PCI ${surface} gagal dimuat.`);
      const [cdvData, dvData] = await Promise.all([cdvResponse.json(), dvResponse.json()]) as [{ curves?: unknown }, { curves?: unknown }];
      const cdv = validateCdvCurveSet(cdvData.curves, surface);
      const dv = validateDvCurveSet(dvData.curves, surface);
      if (!cdv.ok || !cdv.curves || !dv.ok) throw new Error(`Kurva PCI ${surface} tidak valid.`);
      return [surface, { cdv: cdv.curves, dv: dv.curves }];
    };
    Promise.allSettled([loadCurves('ASPHALT'), loadCurves('JPCP')]).then((results) => {
      if (!active) return;
      setPciCurves(Object.fromEntries(results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [])));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleWindowClick = () => setContextMenu(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  // ===== KPI Performance =====
  const openDamages = useMemo(() => damages.filter((d) => d.status !== 'CLOSED'), [damages]);
  const sevCounts = useMemo(
    () => ({
      L: openDamages.filter((d) => d.severity === 'L').length,
      M: openDamages.filter((d) => d.severity === 'M').length,
      H: openDamages.filter((d) => d.severity === 'H').length,
      '-': openDamages.filter((d) => d.severity === '-').length,
    }),
    [openDamages]
  );
  const markingIssues = useMemo(() => markings.filter((m) => m.condition !== 'BAIK' && m.status === 'OPEN').length, [markings]);
  const currentPciByFacility = useMemo(() => {
    if (!pciCurves) return {} as Record<string, number | null>;
    return Object.fromEntries(facilities.map((facility) => [
      facility.id,
      calculateFacilityPciAverage(facility, damages, config, pciCurves),
    ])) as Record<string, number | null>;
  }, [facilities, damages, config, pciCurves]);
  const latestPciByFacility = useMemo(() =>
    latestPciForFacilities(facilities, pciSections, currentPciByFacility),
  [facilities, pciSections, currentPciByFacility]);
  const avgPci = useMemo(() => {
    const scores = Object.values(latestPciByFacility).filter((value): value is number => value != null);
    return scores.length > 0 ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  }, [latestPciByFacility]);
  const pciRatingInfo = avgPci != null ? pciRating(avgPci) : null;

  // ===== Handlers =====
  const onDrawComplete = (r: DrawnRect) => {
    const detected = findFacilityForPoint(r.center, facilities, config.arpLat, config.arpLng);
    if (drawFacility && detected?.id !== drawFacility.id) {
      alert(`Gambar berada di ${detected?.code ?? 'luar fasilitas'}, bukan ${drawFacility.code}. Pilih fasilitas yang sesuai lalu gambar ulang.`);
      setDrawMode(false);
      return;
    }
    setRect(r);
    setShowDamageForm(true);
    setDrawMode(false);
  };

  const selectFacility = (f: Facility) => {
    setSelected(f);
    if (f.centroidLat != null && f.centroidLng != null) {
      setFlyTarget((previous) => ({ lat: f.centroidLat!, lng: f.centroidLng!, zoom: 16, key: (previous?.key ?? 0) + 1 }));
    }
  };

  const flyTo = (lat: number, lng: number, zoom = 18) => setFlyTarget((previous) => ({ lat, lng, zoom, key: (previous?.key ?? 0) + 1 }));

  const handleSaveEditingGeometry = async (updatedRect: DrawnRect) => {
    if (!editingGeometryDamage) return;
    try {
      const targetFacility =
        findFacilityForPoint(updatedRect.center, facilities, config.arpLat, config.arpLng) ??
        facilities.find((f) => f.id === editingGeometryDamage.facilityId) ??
        facilities[0];

      let splitItems: SplitDamageItem[] = [];
      const isSamMode = targetFacility?.locationMode === 'SAM' || targetFacility?.surfaceType === 'CONCRETE';
      const geometryType = updatedRect.geometryType ?? editingGeometryDamage.geometryType ?? 'POLYGON';
      if (targetFacility && updatedRect.corners.length >= 2 && geometryType !== 'SLAB' && geometryType !== 'POINT') {
        splitItems = geometryType === 'LINE'
          ? (isSamMode
            ? splitPolylineBySampleGrids(targetFacility, updatedRect.corners, config.arpLat, config.arpLng)
            : splitPolylineByStation(targetFacility, updatedRect.corners, config.arpLat, config.arpLng))
          : (isSamMode
            ? splitDamageBySampleGrids(targetFacility, updatedRect.corners, config.arpLat, config.arpLng)
            : splitDamageByStation(targetFacility, updatedRect.corners, config.arpLat, config.arpLng));
      }

      if (geometryType === 'LINE' && splitItems.length === 0) {
        alert('Garis tidak dapat dipetakan ke interval STA/SAM fasilitas ini.');
        return;
      }

      const replaceAllInGroup = splitItems.length > 1 || Boolean(editingGeometryDamage.groupId);
      const singlePart = splitItems[0];
      let pointLocation = editingGeometryDamage.station;
      if (targetFacility && !singlePart) {
        if (isSamMode) {
          let polygon: { lat: number; lng: number }[] | undefined;
          if (targetFacility.polygonJson) {
            try { polygon = JSON.parse(targetFacility.polygonJson); } catch { polygon = undefined; }
          }
          if (targetFacility.surfaceType === 'CONCRETE') {
            const blocks = generateFacilityConcreteBlocksSnapped(targetFacility, polygon);
            pointLocation = findConcreteBlockForPoint(updatedRect.center.lat, updatedRect.center.lng, blocks)?.blockCode ?? pointLocation;
          } else {
            const grids = generateFacilitySampleGridsSnapped(targetFacility, config.arpLat, config.arpLng, polygon);
            pointLocation = findSampleCodeForPoint(updatedRect.center.lat, updatedRect.center.lng, grids) ?? pointLocation;
          }
        } else {
          pointLocation = calculateFacilityStation(targetFacility, updatedRect.center, config.arpLat, config.arpLng)?.subSegmentCode ?? pointLocation;
        }
      }
      const station = singlePart
        ? (isSamMode ? singlePart.sampleCode || singlePart.stationText : singlePart.subSegmentCode)
        : pointLocation;
      const sampleCode = isSamMode ? (singlePart?.sampleCode || station) : null;

      const res = await fetch(`/api/damages/${editingGeometryDamage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replaceAllInGroup,
          splitItems: replaceAllInGroup ? splitItems : undefined,
          facilityId: targetFacility?.id || null,
          station,
          sampleCode,
          rectJson: JSON.stringify(updatedRect.corners),
          lat: updatedRect.center.lat,
          lng: updatedRect.center.lng,
          localX: updatedRect.centerLocal.x,
          localY: updatedRect.centerLocal.y,
          geometryType,
          count: geometryType === 'POINT' || geometryType === 'SLAB' ? (updatedRect.count ?? editingGeometryDamage.count ?? 1) : null,
          areaSqm: updatedRect.areaSqm,
          lengthM: updatedRect.lengthM,
          widthM: updatedRect.widthM,
        }),
      });
      if (!res.ok) {
        const response = await res.json().catch(() => ({})) as { error?: string };
        alert(response.error || 'Gagal memperbarui geometri gambar kerusakan');
      } else {
        setEditingGeometryDamage(null);
        refresh();
      }
    } catch (err) {
      console.error('Error saving geometry:', err);
      alert('Terjadi kesalahan saat menyimpan geometri gambar');
    }
  };

  const confirmDeleteDamage = async () => {
    if (!deletingDamage) return;
    try {
      const res = await fetch(`/api/damages/${deletingDamage.id}?deleteGroup=true`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeletingDamage(null);
        refresh();
      } else {
        alert('Gagal menghapus temuan kerusakan');
      }
    } catch {
      alert('Terjadi kesalahan saat menghapus kerusakan');
    }
  };

  const openArpModal = () => {
    setArpLatInput(config.arpLat.toFixed(6));
    setArpLngInput(config.arpLng.toFixed(6));
    setShowArp(true);
  };

  const saveArp = async () => {
    const lat = parseFloat(arpLatInput);
    const lng = parseFloat(arpLngInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arpLat: lat, arpLng: lng }),
    });
    setShowArp(false);
    refresh();
  };

  const selectedPci = selected ? latestPciByFacility[selected.id] : null;

  const filteredDamages = useMemo(
    () =>
      [...damages]
        .filter((d) => filterSev === 'ALL' || d.severity === filterSev)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [damages, filterSev]
  );

  const groupedFilteredDamages = useMemo(() => {
    return groupDamagesWithBreakdown(filteredDamages, config.arpLat, config.arpLng);
  }, [filteredDamages, config.arpLat, config.arpLng]);

  return (
    <div className="space-y-4">
      {/* KPI Performance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Temuan Terbuka</p>
              <p className="text-2xl font-bold text-gray-800">{openDamages.length}</p>
            </div>
            <Activity className="w-8 h-8 text-sky-500" />
          </div>
          <div className="mt-2 flex gap-2 text-[11px] font-semibold">
            <span style={{ color: SEVERITY_COLORS.L }}>L: {sevCounts.L}</span>
            <span style={{ color: SEVERITY_COLORS.M }}>M: {sevCounts.M}</span>
            <span style={{ color: SEVERITY_COLORS.H }}>H: {sevCounts.H}</span>
            <span style={{ color: SEVERITY_COLORS['-'] }}>-: {sevCounts['-']}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Temuan High (H)</p>
              <p className="text-2xl font-bold text-red-600">{sevCounts.H}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <p className="mt-2 text-[11px] text-gray-400">Prioritas penanganan segera</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Marka Perlu Tindakan</p>
              <p className="text-2xl font-bold text-amber-600">{markingIssues}</p>
            </div>
            <Paintbrush className="w-8 h-8 text-amber-500" />
          </div>
          <p className="mt-2 text-[11px] text-gray-400">{markings.length} catatan marka tersurvei</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">PCI Rata-rata</p>
              <p className="text-2xl font-bold" style={{ color: pciRatingInfo?.color ?? '#9ca3af' }}>
                {avgPci ?? '—'}
              </p>
            </div>
            <Gauge className="w-8 h-8 text-emerald-500" />
          </div>
          <p className="mt-2 text-[11px] text-gray-400">{pciRatingInfo?.label ?? 'Belum ada survey PCI'}</p>
        </div>
      </div>

      {/* Peta + Panel */}
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-330px)] min-h-[520px]">
        <div className="relative flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-slate-800">
          <FacilityMap
            facilities={facilities}
            damages={damages}
            markings={markings}
            layers={layers}
            arpLat={config.arpLat}
            arpLng={config.arpLng}
            mapRotationDeg={config.mapRotationDeg}
            stationIntervalM={config.stationIntervalM}
            damageTypesConfig={config.damageTypesConfig}
            damageCatalogs={config.damageCatalogs}
            drawMode={drawMode}
            drawUnit={drawUnit}
            onDrawComplete={onDrawComplete}
            onCursorMove={setCursor}
            onContextMenuDamage={canEdit ? (d, pos) => setContextMenu({ damage: d, x: pos.x, y: pos.y }) : undefined}
            editingGeometryDamage={editingGeometryDamage}
            onSaveEditingGeometry={handleSaveEditingGeometry}
            onCancelEditingGeometry={() => setEditingGeometryDamage(null)}
            onSelectFacility={selectFacility}
            flyTarget={flyTarget}
            fitKey={fitKey}
          />

          {/* Toolbar peta */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex gap-1.5 bg-white/95 backdrop-blur rounded-lg shadow-lg p-1.5">
            {canEdit && <button
              onClick={() => {
                if (drawMode) { setDrawMode(false); return; }
                const facility = (selected?.surfaceType === 'ASPHALT' || selected?.surfaceType === 'CONCRETE' ? selected : null)
                  ?? facilities.find((item) => item.surfaceType === 'ASPHALT' || item.surfaceType === 'CONCRETE');
                if (!facility) { alert('Belum ada fasilitas berjenis perkerasan Flexible/Rigit.'); return; }
                const surface = facility.surfaceType === 'CONCRETE' ? 'JPCP' : 'ASPHALT';
                const firstType = config.damageCatalogs?.[surface]?.[0]?.id;
                if (!firstType) { alert('Katalog DV fasilitas ini belum dimuat.'); return; }
                setDrawFacilityId(facility.id);
                setDrawType(firstType);
                setDrawMode(true);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${drawMode ? 'bg-red-600 text-white shadow-sm' : 'hover:bg-gray-100 text-gray-700'}`}
              title="Pilih fasilitas dan jenis kerusakan, lalu gambar sesuai satuannya."
            >
              <Pencil className="w-3.5 h-3.5" /> {drawMode ? 'Selesai / Batal Gambar' : 'Gambar Kerusakan'}
            </button>}
            <button onClick={() => setFitKey((k) => k + 1)} className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 hover:bg-gray-100 text-gray-700" title="Fit semua fasilitas">
              <Crosshair className="w-3.5 h-3.5" /> Fit
            </button>
          </div>

          {drawMode && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] flex max-w-[calc(100%-24px)] flex-wrap justify-center gap-1.5 rounded-lg bg-white/95 p-2 shadow-lg backdrop-blur">
              <select
                aria-label="Fasilitas yang digambar"
                value={drawFacilityId}
                onChange={(event) => {
                  const facility = facilities.find((item) => item.id === event.target.value);
                  const surface = facility?.surfaceType === 'CONCRETE' ? 'JPCP' : 'ASPHALT';
                  setDrawFacilityId(event.target.value);
                  setDrawType(config.damageCatalogs?.[surface]?.[0]?.id ?? '');
                }}
                className="max-w-44 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              >
                {facilities.filter((item) => item.surfaceType === 'ASPHALT' || item.surfaceType === 'CONCRETE').map((facility) => (
                  <option key={facility.id} value={facility.id}>{facility.code} — {facility.name}</option>
                ))}
              </select>
              <select
                aria-label="Jenis kerusakan yang digambar"
                value={drawType}
                onChange={(event) => setDrawType(event.target.value)}
                className="max-w-64 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              >
                {drawOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.code} — {entry.name} · {damageDrawingModeLabel(entry.unit)}
                  </option>
                ))}
              </select>
              <span className="self-center rounded bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-800">
                {damageDrawingModeLabel(drawUnit)}
              </span>
            </div>
          )}

          {/* Status bar koordinat */}
          <div className="absolute bottom-0 inset-x-0 z-[1000] bg-black/70 backdrop-blur text-[11px] text-white px-3 py-1.5 flex flex-wrap gap-x-5 font-mono">
            <span>
              Google: <b>{cursor ? formatLatLng(cursor) : '—'}</b>
            </span>
            <span>
              Aerodrome: <b>{cursor ? formatLocal(cursor) : '—'}</b>
            </span>
            {drawMode && (
              <span className="text-amber-300 font-sans font-semibold">
                {damageDrawingInstruction(drawUnit)}
              </span>
            )}
          </div>
        </div>

        {/* Panel informasi */}
        <div className="w-full lg:w-96 shrink-0 flex flex-col gap-3 overflow-y-auto">
          {selected ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase" style={{ color: FACILITY_TYPE_COLORS[selected.type] }}>
                    {FACILITY_TYPE_LABEL[selected.type]}
                  </p>
                  <h3 className="font-bold text-gray-800">{selected.code}</h3>
                  <p className="text-xs text-gray-500">{selected.name}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-gray-100" aria-label="Tutup panel">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <Row label="PCN" value={selected.pcn ?? '—'} />
                <Row label="PCR" value={selected.pcr ?? '—'} />
                <Row label="Dimensi" value={selected.lengthM ? `${selected.lengthM} m × ${selected.widthM ?? '?'} m` : '—'} />
                <Row label="Luas" value={selected.areaSqm ? `${selected.areaSqm.toLocaleString('id-ID')} m²` : '—'} />
                <Row label="Perkerasan" value={selected.surfaceType ?? '—'} />
                <Row label="Bearing" value={selected.bearingDeg != null ? `${selected.bearingDeg.toFixed(0)}°` : '—'} />
                <Row label="Koordinat Google" value={selected.centroidLat != null ? formatLatLng({ lat: selected.centroidLat, lng: selected.centroidLng ?? 0 }) : '—'} />
                <Row
                  label="Koordinat Aerodrome"
                  value={
                    selected.centroidLat != null
                      ? formatLocal({
                          x: ((selected.centroidLng ?? 0) - config.arpLng) * 111320 * Math.cos((config.arpLat * Math.PI) / 180),
                          y: ((selected.centroidLat ?? 0) - config.arpLat) * 110540,
                        })
                      : '—'
                  }
                />
                <Row label="Status" value={selected.status ?? '—'} />
                <Row label="Temuan Aktif" value={String(openDamages.filter((d) => d.facilityId === selected.id).length)} />
                <Row label="PCI Terakhir" value={selectedPci != null ? `${selectedPci.toLocaleString('id-ID', { maximumFractionDigits: 1 })} (${pciRating(selectedPci).label})` : '—'} />
              </dl>
              {selected.remarks && <p className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded-md p-2">{selected.remarks}</p>}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="font-bold text-gray-800 text-sm">Fasilitas Airside</h3>
              <p className="text-xs text-gray-500 mt-0.5">{config.airportName} · ARP {formatLatLng({ lat: config.arpLat, lng: config.arpLng })}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {(['RUNWAY', 'TAXIWAY', 'APRON'] as const).map((t) => (
                  <div key={t} className="rounded-lg p-2" style={{ background: `${FACILITY_TYPE_COLORS[t]}22` }}>
                    <p className="text-lg font-bold" style={{ color: FACILITY_TYPE_COLORS[t] }}>
                      {facilities.filter((f) => f.type === t).length}
                    </p>
                    <p className="text-[10px] font-semibold text-gray-500">{FACILITY_TYPE_LABEL[t]}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-gray-400">Klik polygon di peta untuk melihat detail fasilitas (PCN/PCR, dimensi, performance).</p>
            </div>
          )}

          {/* Daftar fasilitas cepat */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Navigasi Cepat</p>
            <div className="flex flex-wrap gap-1.5">
              {facilities.map((f) => (
                <button
                  key={f.id}
                  onClick={() => selectFacility(f)}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors hover:opacity-80"
                  style={{ borderColor: FACILITY_TYPE_COLORS[f.type], color: FACILITY_TYPE_COLORS[f.type], background: `${FACILITY_TYPE_COLORS[f.type]}14` }}
                >
                  {f.code}
                </button>
              ))}
              {facilities.length === 0 && <p className="text-xs text-gray-400">Belum ada fasilitas. Tambahkan melalui seed atau API.</p>}
            </div>
          </div>

          {/* Daftar temuan kerusakan */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex-1 min-h-[160px]">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-500">Temuan Kerusakan ({filteredDamages.length})</p>
              <div className="flex gap-1">
                {(['ALL', 'L', 'M', 'H', '-'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterSev(s)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${filterSev === s ? 'text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                    style={filterSev === s ? { background: s === 'ALL' ? '#334155' : SEVERITY_COLORS[s] } : undefined}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {groupedFilteredDamages.map((item) => {
                const d = item.mainDamage;
                return (
                  <li key={item.id} className="relative group">
                    <div
                      onClick={() => {
                        flyTo(d.lat, d.lng, 19);
                        setDetailDamageModal(d);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        flyTo(d.lat, d.lng, 19);
                        setContextMenu({ damage: d, x: e.clientX, y: e.clientY });
                      }}
                      className="w-full text-left border border-gray-100 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between gap-1 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold truncate" style={{ color: SEVERITY_COLORS[d.severity] }}>
                            ● {damageName(d)}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">{new Date(d.createdAt).toLocaleDateString('id-ID')}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{item.locationSummary}</span>
                          <span>·</span>
                          <span className="font-bold text-sky-600 dark:text-sky-400">{formatDamageQuantity(item.parts)}</span>
                          <span>·</span>
                          <span>{DAMAGE_STATUS_LABEL[d.status] ?? d.status}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenu({ damage: d, x: e.clientX, y: e.clientY });
                        }}
                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded"
                        title="Menu Opsi Kerusakan"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
              {groupedFilteredDamages.length === 0 && <li className="text-xs text-gray-400 py-2">Tidak ada temuan{loading ? ' (memuat...)' : '.'}</li>}
            </ul>
          </div>

        </div>

      </div>

      {/* Modals */}
      {canEdit && <DamageFormModal
        open={showDamageForm || !!editingDamageModal}
        onClose={() => {
          setShowDamageForm(false);
          setEditingDamageModal(null);
          setRect(null);
        }}
        arpLat={config.arpLat}
        arpLng={config.arpLng}
        facilities={facilities}
        rect={rect}
        initialType={rect ? drawType : null}
        editingDamage={editingDamageModal}
        onSaved={refresh}
        damageCatalogs={config.damageCatalogs}
        legacyDamageTypesConfig={config.damageTypesConfig}
      />}
      {canManage && <DxfUploadModal open={showDxf} onClose={() => setShowDxf(false)} arpLat={config.arpLat} arpLng={config.arpLng} layers={layers} onChanged={refresh} />}

      {canManage && showArp && (
        <div className="fixed inset-0 z-[1200] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowArp(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-sm">Titik Acuan (ARP)</h3>
              <p className="text-[11px] text-gray-500">Origin koordinat aerodrome (E, N meter). Gunakan ARP bandara sesuai AIP.</p>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-gray-500">Latitude ARP</span>
                <input value={arpLatInput} onChange={(e) => setArpLatInput(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Longitude ARP</span>
                <input value={arpLngInput} onChange={(e) => setArpLngInput(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={saveArp} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 rounded-lg">
                  Simpan
                </button>
                <button onClick={() => setShowArp(false)} className="px-4 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu Floating Popover */}
      {canEdit && contextMenu && (
        <div
          className="fixed z-[2000] bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 py-1.5 w-52 text-xs font-semibold overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] text-slate-400 border-b border-slate-800 font-mono truncate bg-slate-950/60">
            {damageName(contextMenu.damage)} ({contextMenu.damage.station || 'No STA'})
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingGeometryDamage(contextMenu.damage);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-cyan-300 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" /> 1. Edit Gambar
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingDamageModal(contextMenu.damage);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-amber-300 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> 2. Edit Keterangan
          </button>
          <button
            type="button"
            onClick={() => {
              setDeletingDamage(contextMenu.damage);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-red-900/60 hover:text-red-200 flex items-center gap-2 text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> 3. Hapus Kerusakan
          </button>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Kerusakan */}
      {canEdit && deletingDamage && (
        <div className="fixed inset-0 z-[1300] bg-black/60 flex items-center justify-center p-4" onClick={() => setDeletingDamage(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2 bg-red-100 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-gray-900 text-base">Hapus Kerusakan</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus temuan kerusakan <strong className="text-gray-800">{damageName(deletingDamage)}</strong> (Station {deletingDamage.station ?? '-'})?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingDamage(null)}
                className="px-3.5 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 text-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteDamage}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Rincian Temuan Kerusakan per STA/SAM */}
      <DamageDetailModal
        open={Boolean(detailDamageModal)}
        onClose={() => setDetailDamageModal(null)}
        damage={detailDamageModal}
        allDamages={damages}
        facilities={facilities}
        damageCatalogs={config.damageCatalogs}
        legacyDamageTypesConfig={config.damageTypesConfig}
        onEditGeometry={canEdit ? (d) => setEditingGeometryDamage(d) : undefined}
        onEditForm={canEdit ? (d) => setEditingDamageModal(d) : undefined}
        onDelete={canEdit ? (d) => setDeletingDamage(d) : undefined}
        onStatusChange={canEdit ? async (id, status) => {
          try {
            const res = await fetch(`/api/damages/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            });
            if (res.ok) {
              refresh();
            }
          } catch (err) {
            console.error('Gagal update status:', err);
          }
        } : undefined}
        onFlyTo={(lat, lng) => flyTo(lat, lng, 19)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-400 shrink-0">{label}</dt>
      <dd className="font-semibold text-gray-700 text-right">{value}</dd>
    </div>
  );
}
