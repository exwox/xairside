'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  Download,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  RefreshCw,
  Crosshair,
} from 'lucide-react';
import type { Damage, Facility, AppConfig } from '@/types';
import {
  SEVERITY_COLORS,
  DAMAGE_STATUS_LABEL,
  getDamageCode,
  FACILITY_TYPE_COLORS,
} from '@/lib/constants';
import { resolveDamageCatalogEntry } from '@/lib/damage-catalog';
import { groupDamagesWithBreakdown, rectFromCenterDimensions } from '@/lib/geo';
import { damageQuantity, formatDamageQuantity } from '@/lib/damage-quantity';
import DamageDetailModal from './DamageDetailModal';
import DamageFormModal from './DamageFormModal';
import type { DrawnRect } from './FacilityMap';

export function parseStationOffset(stationStr?: string | null): number {
  if (!stationStr) return Infinity;
  const matchPlus = stationStr.match(/(\d+)\+(\d+)/);
  if (matchPlus) {
    const km = parseInt(matchPlus[1], 10);
    const m = parseInt(matchPlus[2], 10);
    return km * 1000 + m;
  }
  const matchNum = stationStr.match(/\d+/);
  if (matchNum) {
    return parseInt(matchNum[0], 10);
  }
  return Infinity;
}

export default function KerusakanView() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [damages, setDamages] = useState<Damage[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailDamageModal, setDetailDamageModal] = useState<Damage | null>(null);

  // Tambah Kerusakan Visual via GPS HP
  const [showDamageForm, setShowDamageForm] = useState(false);
  const [gpsRect, setGpsRect] = useState<DrawnRect | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'done' | 'error'>('idle');
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [gpsCoord, setGpsCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState('');

  // Filters & Sorting
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'STA_ASC' | 'STA_DESC' | 'NEWEST'>('STA_ASC');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [facRes, dmgRes, cfgRes] = await Promise.all([
        fetch('/api/facilities'),
        fetch('/api/damages'),
        fetch('/api/config'),
      ]);
      if (facRes.ok) setFacilities(await facRes.json());
      if (dmgRes.ok) setDamages(await dmgRes.json());
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setAppConfig(cfg);
      }
    } catch (err) {
      console.error('Gagal mengambil data kerusakan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- existing async data loader.
    fetchData();
  }, []);

  const damagePresentation = useCallback((damage: Damage) => {
    const facility = facilities.find((item) => item.id === damage.facilityId) ?? damage.facility;
    const surface = facility?.surfaceType === 'CONCRETE' ? 'JPCP'
      : facility?.surfaceType === 'ASPHALT' ? 'ASPHALT' : null;
    const entry = surface ? resolveDamageCatalogEntry(
      damage.type, surface, appConfig?.damageCatalogs?.[surface] ?? [], appConfig?.damageTypesConfig,
    ) : null;
    return {
      name: entry?.name ?? damage.type,
      code: entry?.code ?? getDamageCode(damage.type, appConfig?.damageTypesConfig),
    };
  }, [facilities, appConfig]);

  // Filtered & Sorted damages
  const filteredDamages = useMemo(() => {
    const list = damages.filter((d) => {
      if (selectedFacilityId !== 'ALL') {
        if (selectedFacilityId === 'UNASSIGNED') {
          if (d.facilityId !== null) return false;
        } else if (d.facilityId !== selectedFacilityId) {
          return false;
        }
      }
      if (selectedSeverity !== 'ALL' && d.severity !== selectedSeverity) {
        return false;
      }
      if (selectedStatus !== 'ALL' && d.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const stationMatch = d.station?.toLowerCase().includes(q);
        const presentation = damagePresentation(d);
        const typeMatch = d.type.toLowerCase().includes(q) || presentation.name.toLowerCase().includes(q);
        const codeMatch = presentation.code.toLowerCase().includes(q);
        const remarkMatch = d.remarks?.toLowerCase().includes(q);
        const facNameMatch = d.facility?.name?.toLowerCase().includes(q);
        if (!stationMatch && !typeMatch && !codeMatch && !remarkMatch && !facNameMatch) {
          return false;
        }
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'STA_ASC') {
        const offsetA = parseStationOffset(a.station);
        const offsetB = parseStationOffset(b.station);
        if (offsetA !== offsetB) return offsetA - offsetB;
        return (a.station || '').localeCompare(b.station || '');
      } else if (sortBy === 'STA_DESC') {
        const offsetA = parseStationOffset(a.station);
        const offsetB = parseStationOffset(b.station);
        if (offsetA !== offsetB) return offsetB - offsetA;
        return (b.station || '').localeCompare(a.station || '');
      } else {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
    });
  }, [damages, selectedFacilityId, selectedSeverity, selectedStatus, searchQuery, sortBy, damagePresentation]);

  const groupedFilteredDamages = useMemo(() => {
    return groupDamagesWithBreakdown(filteredDamages);
  }, [filteredDamages]);

  // Calculations & stats
  const totalVolumeSqm = useMemo(() => {
    return filteredDamages.filter((damage) => !damage.geometryType || damage.geometryType === 'POLYGON')
      .reduce((sum, damage) => sum + (damage.areaSqm || 0), 0);
  }, [filteredDamages]);
  const totalLengthM = useMemo(() => filteredDamages
    .filter((damage) => damage.geometryType === 'LINE')
    .reduce((sum, damage) => sum + (damage.lengthM || 0), 0), [filteredDamages]);
  const totalCount = useMemo(() => filteredDamages
    .filter((damage) => damage.geometryType === 'POINT' || damage.geometryType === 'SLAB')
    .reduce((sum, damage) => sum + (damage.count || 0), 0), [filteredDamages]);

  const openCount = useMemo(() => filteredDamages.filter((d) => d.status === 'OPEN').length, [filteredDamages]);
  const inProgressCount = useMemo(() => filteredDamages.filter((d) => d.status === 'IN_PROGRESS').length, [filteredDamages]);
  const closedCount = useMemo(() => filteredDamages.filter((d) => d.status === 'CLOSED').length, [filteredDamages]);
  const highCount = useMemo(() => filteredDamages.filter((d) => d.severity === 'H').length, [filteredDamages]);

  const updateStatus = async (damageId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/damages/${damageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDamages((prev) => prev.map((d) => (d.id === damageId ? { ...d, status: updated.status } : d)));
      } else {
        alert('Gagal memperbarui status');
      }
    } catch {
      alert('Terjadi kesalahan saat memperbarui status');
    }
  };

  const exportCsv = () => {
    if (filteredDamages.length === 0) return;
    const headers = ['No', 'Fasilitas', 'Station', 'Jenis Kerusakan', 'Kode Kerusakan', 'Severity', 'Kuantitas', 'Satuan', 'Status', 'Catatan'];
    const rows = filteredDamages.map((d, i) => [
      i + 1,
      `"${d.facility?.name || '-'}"`,
      `"${d.station || '-'}"`,
      `"${damagePresentation(d).name.replace(/"/g, '""')}"`,
      `"${damagePresentation(d).code.replace(/"/g, '""')}"`,
      d.severity,
      damageQuantity([d]).value.toFixed(2),
      damageQuantity([d]).unit,
      DAMAGE_STATUS_LABEL[d.status] || d.status,
      `"${(d.remarks || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daftar_Kerusakan_Airside_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeFacilityObj = facilities.find((f) => f.id === selectedFacilityId);

  // ===== Tambah Kerusakan Visual: titik lokasi memakai GPS HP =====
  const arpLat = appConfig?.arpLat ?? 0.9569;
  const arpLng = appConfig?.arpLng ?? 104.5311;

  const gpsAccuracyInfo = (accuracy: number): { label: string; color: string; note: string } => {
    if (accuracy <= 5) return { label: `±${accuracy} m (presisi sangat baik)`, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', note: 'Cocok untuk fix lokasi titik kerusakan.' };
    if (accuracy <= 15) return { label: `±${accuracy} m (presisi cukup)`, color: 'text-amber-700 bg-amber-50 border-amber-200', note: 'Masih dapat dipakai, pastikan titik di area yang tepat.' };
    return { label: `±${accuracy} m (deviasi besar)`, color: 'text-red-700 bg-red-50 border-red-200', note: 'Sinyal GPS lemah — verifikasi/geser koordinat secara manual sebelum simpan.' };
  };

  const addVisualDamageFromGps = () => {
    setGpsError('');
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsState('error');
      setGpsError('Perangkat/browser ini tidak mendukung GPS. Gunakan HP dengan GPS aktif di area terbuka.');
      return;
    }
    if (window.isSecureContext === false) {
      setGpsState('error');
      setGpsError('Akses GPS hanya tersedia di koneksi aman (HTTPS) atau localhost. Buka aplikasi memakai HTTPS agar izin lokasi HP dapat diaktifkan.');
      return;
    }
    setGpsState('locating');
    setGpsAccuracyM(null);
    setGpsCoord(null);
    setGpsRect(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setGpsState('error');
          setGpsError('Koordinat GPS tidak valid yang diterima dari perangkat.');
          return;
        }
        setGpsCoord({ lat: latitude, lng: longitude });
        setGpsAccuracyM(Math.round(accuracy));
        setGpsState('done');
        // Buat area default kecil di sekitar titik GPS (2×2 m) sebagai titik lokasi.
        // Ukuran & luas dapat disesuaikan di form sebelum disimpan.
        const rect = rectFromCenterDimensions({ lat: latitude, lng: longitude }, 2, 2, 0, arpLat, arpLng);
        setGpsRect(rect);
        setShowDamageForm(true);
      },
      (err) => {
        const messages: Record<number, string> = {
          1: 'Izin lokasi ditolak. Aktifkan akses lokasi untuk browser/aplikasi ini lalu coba lagi.',
          2: 'Posisi tidak tersedia. Pastikan GPS HP aktif dan Anda berada di area terbuka (bukan di dalam gedung).',
          3: 'Waktu pencarian GPS habis. Coba lagi di area terbuka dengan sinyal satelit yang baik.',
        };
        setGpsState('error');
        setGpsError(messages[err.code] || `Gagal mendapatkan posisi GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  return (
    <div className="max-w-[1800px] mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
                Rekap & Daftar Temuan Kerusakan
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Manajemen data kerusakan permukaan perkerasan fasilitas airside berdasarkan segmentasi interval station.
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <button
            onClick={addVisualDamageFromGps}
            disabled={gpsState === 'locating'}
            title='Tentukan titik lokasi kerusakan otomatis dari GPS HP. Presisi mengikuti sinyal GPS (umumnya ±3-15 m). Area default 2×2 m bisa disesuaikan.'
            className="flex flex-1 items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 disabled:cursor-wait rounded-lg shadow-sm transition-colors sm:flex-none"
          >
            <Crosshair className={`w-3.5 h-3.5 ${gpsState === 'locating' ? 'animate-pulse' : ''}`} />
            {gpsState === 'locating' ? 'Mencari GPS HP...' : 'Tambah Kerusakan Visual'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={filteredDamages.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors sm:flex-none"
          >
            <Download className="w-3.5 h-3.5" />
            Ekspor Excel/CSV
          </button>
        </div>
      </div>

      {/* Status GPS: menampilkan deviasi agar pengguna tahu presisi titik lokasi */}
      {gpsState !== 'idle' && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs flex items-center gap-3 ${
            gpsState === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : gpsState === 'locating'
              ? 'bg-sky-50 border-sky-200 text-sky-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {gpsState === 'locating' && (
            <>
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>
                Mencari posisi GPS... Pastikan GPS HP aktif dan Anda berada di <strong>area terbuka</strong> (bukan di dalam gedung).<br />
                <span className="opacity-75">Perangkat akan melaporkan deviasi (akurasi) posisi sebelum disimpan.</span>
              </span>
            </>
          )}
          {gpsState === 'done' && gpsCoord && (
            <>
              <MapPin className="w-4 h-4 shrink-0" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono font-bold">
                  {gpsCoord.lat.toFixed(6)}, {gpsCoord.lng.toFixed(6)}
                </span>
                {gpsAccuracyM != null && (
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-bold ${gpsAccuracyInfo(gpsAccuracyM).color}`}>
                    Deviasi {gpsAccuracyInfo(gpsAccuracyM).label}
                  </span>
                )}
                <span className="w-full sm:w-auto opacity-80">
                  {gpsAccuracyM != null ? gpsAccuracyInfo(gpsAccuracyM).note : ''} Isi detail lalu simpan — koordinat masih bisa digeser/diubah manual.
                </span>
              </div>
            </>
          )}
          {gpsState === 'error' && (
            <>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{gpsError}</span>
            </>
          )}
        </div>
      )}

      {/* Tabs Filter Fasilitas */}
      <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          <button
            onClick={() => setSelectedFacilityId('ALL')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              selectedFacilityId === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Semua Fasilitas</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                selectedFacilityId === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {damages.length}
            </span>
          </button>

          {facilities.map((fac) => {
            const facDmgCount = damages.filter((d) => d.facilityId === fac.id).length;
            const isSelected = selectedFacilityId === fac.id;
            const typeColor = FACILITY_TYPE_COLORS[fac.type] || '#94a3b8';
            return (
              <button
                key={fac.id}
                onClick={() => setSelectedFacilityId(fac.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isSelected ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? '#ffffff' : typeColor }} />
                <span>{fac.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    isSelected ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {facDmgCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Kerusakan</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{filteredDamages.length} <span className="text-xs font-normal text-slate-500">titik/segmen</span></h3>
            <p className="text-xs text-slate-500 mt-1">
              Fasilitas: <span className="font-semibold text-slate-700">{selectedFacilityId === 'ALL' ? 'Semua' : activeFacilityObj?.name}</span>
              {' · '}Severity H: <span className="font-bold text-red-600">{highCount}</span>
            </p>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Luas Kerusakan</p>
            <h3 className="text-2xl font-black text-amber-600 mt-1">
              {totalVolumeSqm.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs font-normal text-slate-500">m²</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Panjang: <span className="font-bold text-sky-700">{totalLengthM.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m </span>
              {' · '}Jumlah: <span className="font-bold text-sky-700">{totalCount}</span>
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status Terbuka / Penanganan</p>
            <h3 className="text-2xl font-black text-red-600 mt-1">
              {openCount} <span className="text-xs text-amber-600 font-semibold">({inProgressCount} proses)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">Memerlukan perbaikan</p>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Selesai Ditangani</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{closedCount} <span className="text-xs font-normal text-slate-500">lokasi</span></h3>
            <p className="text-xs text-slate-500 mt-1">
              Tingkat Selesai: <span className="font-semibold text-emerald-700">{filteredDamages.length ? Math.round((closedCount / filteredDamages.length) * 100) : 0}%</span>
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan Station, Jenis Kerusakan, Kode (misal A-01), atau Catatan..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex items-center justify-between gap-1.5 sm:justify-start">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">Severity:</span>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium bg-white text-slate-800 focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">Semua Severity</option>
              <option value="L">L (Low / Rendah)</option>
              <option value="M">M (Medium / Sedang)</option>
              <option value="H">H (High / Tinggi)</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-1.5 sm:justify-start">
            <span className="text-xs font-semibold text-slate-600">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium bg-white text-slate-800 focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="OPEN">Terbuka</option>
              <option value="IN_PROGRESS">Dalam Penanganan</option>
              <option value="CLOSED">Selesai</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-1.5 sm:justify-start">
            <span className="text-xs font-semibold text-slate-600">Urutan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'STA_ASC' | 'STA_DESC' | 'NEWEST')}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium bg-white text-slate-800 focus:ring-2 focus:ring-sky-500"
            >
              <option value="STA_ASC">STA Terendah (0+000 ↑)</option>
              <option value="STA_DESC">STA Tertinggi (3+000 ↓)</option>
              <option value="NEWEST">Terbaru Ditambahkan</option>
            </select>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5 text-center w-12">No</th>
                <th
                  onClick={() => setSortBy(sortBy === 'STA_ASC' ? 'STA_DESC' : 'STA_ASC')}
                  className="px-4 py-3.5 min-w-[150px] cursor-pointer hover:bg-slate-200/70 transition-colors select-none"
                  title="Klik untuk mengubah urutan Station"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Station</span>
                    <span className="text-[11px] font-mono text-sky-600 font-extrabold">
                      {sortBy === 'STA_ASC' ? '▲ STA Terendah' : sortBy === 'STA_DESC' ? '▼ STA Tertinggi' : '↕'}
                    </span>
                  </div>
                </th>
                <th className="px-4 py-3.5 min-w-[200px]">Jenis Kerusakan</th>
                <th className="px-4 py-3.5 text-center min-w-[120px]">Kode Kerusakan</th>
                <th className="px-4 py-3.5 text-center min-w-[90px]">Severity</th>
                <th className="px-4 py-3.5 text-right min-w-[110px]">Kuantitas</th>
                <th className="px-4 py-3.5 text-center min-w-[150px]">Status</th>
                <th className="px-4 py-3.5 text-center min-w-[100px]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
                    Memuat data kerusakan fasilitas...
                  </td>
                </tr>
              ) : groupedFilteredDamages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    Tidak ada data kerusakan yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                groupedFilteredDamages.map((grp, index) => {
                  const item = grp.mainDamage;
                  const { code: damageCode, name: damageName } = damagePresentation(item);
                  const sevBgColor = SEVERITY_COLORS[item.severity] || '#94a3b8';

                  return (
                    <tr
                      key={grp.id}
                      onClick={() => setDetailDamageModal(item)}
                      className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-center font-medium text-slate-500">
                        {index + 1}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 flex items-center gap-1.5">
                            {grp.locationSummary}
                            {grp.isSam && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-purple-100 text-purple-700 font-semibold rounded border border-purple-200">
                                SAM
                              </span>
                            )}
                            {grp.parts.length > 1 && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-700 font-semibold rounded border border-amber-200" title={`Melintasi ${grp.parts.length} segmen`}>
                                {grp.parts.length} Bagian
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: FACILITY_TYPE_COLORS[item.facility?.type || ''] || '#94a3b8' }} />
                            {item.facility?.name || 'Umum / Tidak Terikat'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{damageName}</div>
                        {item.remarks && (
                          <p className="text-[11px] text-slate-500 italic truncate max-w-xs mt-0.5" title={item.remarks}>
                            &ldquo;{item.remarks}&rdquo;
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2.5 py-1 text-xs font-mono font-bold bg-slate-100 text-slate-800 rounded border border-slate-300 shadow-2xs">
                          {damageCode}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white font-extrabold text-xs shadow-2xs"
                          style={{ backgroundColor: sevBgColor }}
                          title={`Severity Level: ${item.severity}`}
                        >
                          {item.severity}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-bold text-sky-700 text-sm">
                          {formatDamageQuantity(grp.parts)}
                        </div>
                        {grp.parts.length > 1 && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Total {grp.parts.length} bagian
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={item.status}
                          onChange={(e) => updateStatus(item.id, e.target.value)}
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none transition-colors ${
                            item.status === 'OPEN'
                              ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                              : item.status === 'IN_PROGRESS'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <option value="OPEN">Terbuka</option>
                          <option value="IN_PROGRESS">Dalam Penanganan</option>
                          <option value="CLOSED">Selesai</option>
                        </select>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailDamageModal(item);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-800 hover:underline px-2 py-1 bg-sky-50 rounded border border-sky-200"
                        >
                          Detail Rincian
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Menampilkan <span className="font-semibold text-slate-800">{filteredDamages.length}</span> dari <span className="font-semibold text-slate-800">{damages.length}</span> total temuan kerusakan.
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Low (L)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Medium (M)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> High (H)</span>
          </div>
        </div>
      </div>

      {/* Modal Detail Rincian Temuan Kerusakan per STA/SAM */}
      <DamageDetailModal
        open={Boolean(detailDamageModal)}
        onClose={() => setDetailDamageModal(null)}
        damage={detailDamageModal}
        allDamages={damages}
        facilities={facilities}
        damageCatalogs={appConfig?.damageCatalogs}
        legacyDamageTypesConfig={appConfig?.damageTypesConfig}
        onStatusChange={async (id, status) => {
          try {
            const res = await fetch(`/api/damages/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            });
            if (res.ok) {
              fetchData();
            }
          } catch (err) {
            console.error('Gagal update status:', err);
          }
        }}
      />

      {/* Modal Tambah Kerusakan Visual (titik lokasi dari GPS HP) */}
      <DamageFormModal
        open={showDamageForm}
        onClose={() => {
          setShowDamageForm(false);
          setGpsRect(null);
          setGpsCoord(null);
          setGpsAccuracyM(null);
        }}
        arpLat={arpLat}
        arpLng={arpLng}
        facilities={facilities}
        rect={gpsRect}
        onSaved={() => {
          setShowDamageForm(false);
          setGpsRect(null);
          setGpsCoord(null);
          setGpsAccuracyM(null);
          setGpsState('idle');
          fetchData();
        }}
        damageCatalogs={appConfig?.damageCatalogs}
        legacyDamageTypesConfig={appConfig?.damageTypesConfig}
      />
    </div>
  );
}
