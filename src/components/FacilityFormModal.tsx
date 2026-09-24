'use client';

// Form tambah/ubah fasilitas (Runway/Taxiway/Apron). Polygon batas dapat dibuat
// otomatis dari centroid + bearing + panjang + lebar, atau diisi manual (JSON).

import { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';
import type { Facility } from '@/types';
import { FACILITY_TYPE_COLORS } from '@/lib/constants';

interface FacilityFormModalProps {
  open: boolean;
  onClose: () => void;
  arpLat: number;
  arpLng: number;
  editing: Facility | null;
  onSaved: () => void;
}

// 4 sudut polygon fasilitas dari centroid, bearing, panjang & lebar
function computeCorners(
  centroidLat: number,
  centroidLng: number,
  bearingDeg: number,
  lengthM: number,
  widthM: number
): { lat: number; lng: number }[] {
  const rad = (bearingDeg * Math.PI) / 180;
  const dir = { x: Math.sin(rad), y: Math.cos(rad) }; // sumbu fasilitas (utara=0°)
  const perp = { x: dir.y, y: -dir.x }; // tegak lurus
  const hl = lengthM / 2;
  const hw = widthM / 2;
  const radLat = (centroidLat * Math.PI) / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * radLat);
  const mPerDegLng = 111412.84 * Math.cos(radLat);
  const corners: { lat: number; lng: number }[] = [];
  for (const [a, b] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]] as [number, number][]) {
    const e = a * dir.x + b * perp.x;
    const n = a * dir.y + b * perp.y;
    corners.push({ lat: centroidLat + n / mPerDegLat, lng: centroidLng + e / mPerDegLng });
  }
  return corners;
}

export default function FacilityFormModal({ open, onClose, editing, onSaved }: FacilityFormModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'RUNWAY' | 'TAXIWAY' | 'APRON'>('RUNWAY');
  const [lengthM, setLengthM] = useState('');
  const [widthM, setWidthM] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [surfaceType, setSurfaceType] = useState('ASPHALT');
  const [blockLengthM, setBlockLengthM] = useState('5');
  const [blockWidthM, setBlockWidthM] = useState('5');
  const [slabDirection, setSlabDirection] = useState<'FORWARD' | 'REVERSE'>('FORWARD');
  const [pcn, setPcn] = useState('');
  const [pcr, setPcr] = useState('');
  const [bearingDeg, setBearingDeg] = useState('');
  const [centroidLat, setCentroidLat] = useState('');
  const [centroidLng, setCentroidLng] = useState('');
  const [polygonText, setPolygonText] = useState('');
  const [status, setStatus] = useState('SERVICEABLE');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editing) {
      setCode(editing.code);
      setName(editing.name);
      setType(editing.type);
      setLengthM(editing.lengthM?.toString() ?? '');
      setWidthM(editing.widthM?.toString() ?? '');
      setAreaSqm(editing.areaSqm?.toString() ?? '');
      setSurfaceType(editing.surfaceType ?? 'ASPHALT');
      setBlockLengthM(editing.blockLengthM?.toString() ?? '5');
      setBlockWidthM(editing.blockWidthM?.toString() ?? '5');
      setSlabDirection(editing.slabDirection ?? 'FORWARD');
      setPcn(editing.pcn ?? '');
      setPcr(editing.pcr ?? '');
      setBearingDeg(editing.bearingDeg?.toString() ?? '');
      setCentroidLat(editing.centroidLat?.toString() ?? '');
      setCentroidLng(editing.centroidLng?.toString() ?? '');
      setPolygonText(editing.polygonJson ?? '');
      setStatus(editing.status ?? 'SERVICEABLE');
      setRemarks(editing.remarks ?? '');
    } else {
      setCode(''); setName(''); setType('RUNWAY'); setLengthM(''); setWidthM(''); setAreaSqm('');
      setSurfaceType('ASPHALT'); setPcn(''); setPcr(''); setBearingDeg('');
      setBlockLengthM('5'); setBlockWidthM('5');
      setSlabDirection('FORWARD');
      setCentroidLat(''); setCentroidLng(''); setPolygonText(''); setStatus('SERVICEABLE'); setRemarks('');
    }
  }, [open, editing]);

  if (!open) return null;

  const generatePolygon = () => {
    const cLat = parseFloat(centroidLat);
    const cLng = parseFloat(centroidLng);
    const len = parseFloat(lengthM);
    const wid = parseFloat(widthM);
    const brg = parseFloat(bearingDeg) || 0;
    if (!Number.isFinite(cLat) || !Number.isFinite(cLng) || !Number.isFinite(len) || !Number.isFinite(wid)) {
      setError('Isi centroid (lat/lng), panjang, dan lebar dulu untuk membuat polygon otomatis.');
      return;
    }
    const corners = computeCorners(cLat, cLng, brg, len, wid);
    setPolygonText(JSON.stringify(corners.map((c) => ({ lat: +c.lat.toFixed(7), lng: +c.lng.toFixed(7) }))));
    setError('');
  };

  const submit = async () => {
    setError('');
    if (!code || !name) {
      setError('Kode dan nama fasilitas wajib diisi');
      return;
    }
    setBusy(true);
    const area = parseFloat(areaSqm) || (parseFloat(lengthM) > 0 && parseFloat(widthM) > 0 ? parseFloat(lengthM) * parseFloat(widthM) : null);
    const payload = {
      code,
      name,
      type,
      lengthM: parseFloat(lengthM) || null,
      widthM: parseFloat(widthM) || null,
      areaSqm: area,
      blockLengthM: parseFloat(blockLengthM) || 5,
      blockWidthM: parseFloat(blockWidthM) || 5,
      slabDirection,
      surfaceType,
      pcn: pcn || null,
      pcr: pcr || null,
      bearingDeg: parseFloat(bearingDeg) || null,
      centroidLat: parseFloat(centroidLat) || null,
      centroidLng: parseFloat(centroidLng) || null,
      polygonJson: polygonText || null,
      color: FACILITY_TYPE_COLORS[type],
      status,
      remarks: remarks || null,
    };
    try {
      const res = await fetch(editing ? `/api/facilities/${editing.id}` : '/api/facilities', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || 'Gagal menyimpan fasilitas');
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan fasilitas');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-bold text-gray-800">{editing ? 'Ubah Fasilitas' : 'Tambah Fasilitas'}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-gray-500">Kode</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="RWY-09/27" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Nama</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Runway Utama" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Tipe</span>
              <select value={type} onChange={(e) => setType(e.target.value as 'RUNWAY' | 'TAXIWAY' | 'APRON')} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5">
                <option value="RUNWAY">Runway</option>
                <option value="TAXIWAY">Taxiway</option>
                <option value="APRON">Apron</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Tipe Perkerasan</span>
              <select value={surfaceType} onChange={(e) => setSurfaceType(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5">
                <option value="ASPHALT">Asphalt (Flexible)</option>
                <option value="CONCRETE">Concrete (Rigid)</option>
              </select>
            </label>
            {surfaceType === 'CONCRETE' && (
              <>
                <label className="block bg-amber-50/70 p-1.5 rounded border border-amber-200">
                  <span className="text-xs font-bold text-amber-900">Panjang Slab Concrete (m)</span>
                  <input value={blockLengthM} onChange={(e) => setBlockLengthM(e.target.value)} type="number" step="0.5" placeholder="5" className="mt-0.5 w-full border border-amber-300 rounded px-2 py-1 text-xs font-bold text-amber-950" />
                </label>
                <label className="block bg-amber-50/70 p-1.5 rounded border border-amber-200">
                  <span className="text-xs font-bold text-amber-900">Lebar Slab Concrete (m)</span>
                  <input value={blockWidthM} onChange={(e) => setBlockWidthM(e.target.value)} type="number" step="0.5" placeholder="5" className="mt-0.5 w-full border border-amber-300 rounded px-2 py-1 text-xs font-bold text-amber-950" />
                </label>
                <label className="col-span-2 block bg-amber-50/70 p-1.5 rounded border border-amber-200">
                  <span className="text-xs font-bold text-amber-900">Arah Penomoran Slab</span>
                  <select
                    value={slabDirection}
                    onChange={(e) => setSlabDirection(e.target.value as 'FORWARD' | 'REVERSE')}
                    className="mt-0.5 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-950"
                  >
                    <option value="FORWARD">Normal — Slab A dari kiri atas</option>
                    <option value="REVERSE">Reverse — Slab A dari kanan bawah</option>
                  </select>
                </label>
              </>
            )}
            <label className="block">
              <span className="text-xs text-gray-500">PCN</span>
              <input value={pcn} onChange={(e) => setPcn(e.target.value)} placeholder="PCN 60 F/B/W/T" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">PCR</span>
              <input value={pcr} onChange={(e) => setPcr(e.target.value)} placeholder="PCR 74 F/B/W/T" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Panjang (m)</span>
              <input value={lengthM} onChange={(e) => setLengthM(e.target.value)} type="number" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Lebar (m)</span>
              <input value={widthM} onChange={(e) => setWidthM(e.target.value)} type="number" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Centroid Lat</span>
              <input value={centroidLat} onChange={(e) => setCentroidLat(e.target.value)} type="number" step="0.000001" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Centroid Lng</span>
              <input value={centroidLng} onChange={(e) => setCentroidLng(e.target.value)} type="number" step="0.000001" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Bearing (°)</span>
              <input value={bearingDeg} onChange={(e) => setBearingDeg(e.target.value)} type="number" step="0.01" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5">
                <option value="SERVICEABLE">Serviceable</option>
                <option value="CAUTION">Caution</option>
                <option value="UNSERVICEABLE">Unserviceable</option>
              </select>
            </label>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Polygon Batas (JSON lat/lng)</span>
              <button type="button" onClick={generatePolygon} className="text-[11px] px-2 py-0.5 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 font-medium">
                Buat Otomatis dari Dimensi
              </button>
            </div>
            <textarea value={polygonText} onChange={(e) => setPolygonText(e.target.value)} rows={3} placeholder='[{"lat":..., "lng":...}, ...]' className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-[11px]" />
          </div>
          <label className="block">
            <span className="text-xs text-gray-500">Keterangan</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
          </label>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
          <button onClick={submit} disabled={busy} className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Simpan Fasilitas
          </button>
        </div>
      </div>
    </div>
  );
}
