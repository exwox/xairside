'use client';

// Modal pengaturan: ARP (asal koordinat aerodrome) & nama bandara.

import { useState } from 'react';
import { X, Save } from 'lucide-react';

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
  arpLat: number;
  arpLng: number;
  airportName: string;
  stationIntervalM?: number;
  onSaved: (cfg: { arpLat: number; arpLng: number; airportName: string; stationIntervalM: number }) => void;
}

export default function ConfigModal({ open, onClose, arpLat, arpLng, airportName, stationIntervalM = 50, onSaved }: ConfigModalProps) {
  const [lat, setLat] = useState(String(arpLat || ''));
  const [lng, setLng] = useState(String(arpLng || ''));
  const [name, setName] = useState(airportName);
  const [intervalM, setIntervalM] = useState(String(stationIntervalM || 50));
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    try {
      const cfg = {
        arpLat: parseFloat(lat) || 0,
        arpLng: parseFloat(lng) || 0,
        airportName: name,
        stationIntervalM: parseFloat(intervalM) || 50,
      };
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      onSaved(cfg);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">⚙ Pengaturan Koordinat</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p className="text-xs text-gray-500">
            ARP (Aerodrome Reference Point) adalah titik asal koordinat aerodrome: X = East (m), Y = North (m).
          </p>
          <label className="block">
            <span className="text-xs text-gray-500">Nama Bandara</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-gray-500">ARP Latitude</span>
              <input value={lat} onChange={(e) => setLat(e.target.value)} type="number" step="0.000001" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">ARP Longitude</span>
              <input value={lng} onChange={(e) => setLng(e.target.value)} type="number" step="0.000001" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-gray-500 font-semibold">Jarak Interval Garis STA (meter)</span>
            <input
              value={intervalM}
              onChange={(e) => setIntervalM(e.target.value)}
              type="number"
              min="5"
              step="5"
              placeholder="50"
              className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs"
            />
            <span className="text-[10px] text-gray-400 block mt-0.5">Misal: 10, 25, 50, atau 100 meter</span>
          </label>
          <button onClick={submit} disabled={busy} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
