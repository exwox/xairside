'use client';

// Modal timpa file DXF ke peta: parsing di server, georeferensi dengan titik acuan,
// rotasi & skala. Layer dapat di-on/off atau dihapus dari daftar.

import { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, Eye, EyeOff, Layers } from 'lucide-react';
import type { MapLayer } from '@/types';

interface DxfUploadModalProps {
  open: boolean;
  onClose: () => void;
  arpLat: number;
  arpLng: number;
  layers: MapLayer[];
  onChanged: () => void;
}

export default function DxfUploadModal({ open, onClose, arpLat, arpLng, layers, onChanged }: DxfUploadModalProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [name, setName] = useState('');
  const [refLat, setRefLat] = useState('');
  const [refLng, setRefLng] = useState('');
  const [rotation, setRotation] = useState('0');
  const [scale, setScale] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setRefLat(arpLat ? arpLat.toFixed(6) : '');
      setRefLng(arpLng ? arpLng.toFixed(6) : '');
      setError('');
      setMessage('');
    }
  }, [open, arpLat, arpLng]);

  if (!open) return null;

  const pickFile = (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    if (!name) setName(f.name.replace(/\.dxf$/i, ''));
  };

  const upload = async () => {
    setError('');
    setMessage('');
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Pilih file .dxf terlebih dahulu.');
      return;
    }
    if (!refLat || !refLng) {
      setError('Titik acuan (lat, lng) wajib diisi — biasanya titik ARP.');
      return;
    }
    setBusy(true);
    try {
      const content = await file.text();
      const res = await fetch('/api/map-layers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || file.name,
          fileName: file.name,
          content,
          refLat: parseFloat(refLat),
          refLng: parseFloat(refLng),
          rotationDeg: parseFloat(rotation) || 0,
          scale: parseFloat(scale) || 1,
        }),
      });
      const j = (await res.json()) as { error?: string; entities?: unknown[]; skipped?: number };
      if (!res.ok) throw new Error(j.error || 'Gagal memproses DXF');
      setMessage(`Berhasil: ${(j.entities ?? []).length} entity dimuat${j.skipped ? `, ${j.skipped} dilewati` : ''}.`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memproses DXF');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (l: MapLayer) => {
    await fetch(`/api/map-layers/${l.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: !l.visible }),
    });
    onChanged();
  };

  const remove = async (l: MapLayer) => {
    await fetch(`/api/map-layers/${l.id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-600" /> Timpa File DXF
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-gray-500">File DXF</span>
            <input ref={fileRef} type="file" accept=".dxf" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-sky-50 file:text-sky-700" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Nama Layer</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Drawing Airside 2026" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Acuan Lat (ARP)</span>
              <input value={refLat} onChange={(e) => setRefLat(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Acuan Lng (ARP)</span>
              <input value={refLng} onChange={(e) => setRefLng(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Rotasi (°, searah jarum jam)</span>
              <input value={rotation} onChange={(e) => setRotation(e.target.value)} type="number" step="0.1" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Skala (1 unit = m)</span>
              <input value={scale} onChange={(e) => setScale(e.target.value)} type="number" step="0.001" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
          </div>
          {fileName && <p className="text-[11px] text-gray-400">File: {fileName}</p>}
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
          {message && <p className="text-xs text-green-700 bg-green-50 rounded-md px-3 py-2">{message}</p>}
          <button onClick={upload} disabled={busy} className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" /> {busy ? 'Memproses...' : 'Timpa ke Peta'}
          </button>

          <div className="pt-2">
            <p className="text-xs font-semibold text-gray-500 mb-1">Layer DXF ({layers.length})</p>
            {layers.length === 0 && <p className="text-xs text-gray-400">Belum ada layer DXF.</p>}
            <ul className="space-y-1">
              {layers.map((l) => (
                <li key={l.id} className="flex items-center justify-between border border-gray-100 rounded-md px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{l.name}</p>
                    <p className="text-[10px] text-gray-400">{l.fileName} · {l.entities.length} entity · rot {l.rotationDeg}° · ×{l.scale}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => toggle(l)} className="p-1 rounded hover:bg-gray-100" title={l.visible ? 'Sembunyikan' : 'Tampilkan'}>
                      {l.visible ? <Eye className="w-3.5 h-3.5 text-sky-600" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                    <button onClick={() => remove(l)} className="p-1 rounded hover:bg-red-50" title="Hapus">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
