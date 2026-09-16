'use client';

// Panel daftar temuan kerusakan: filter severity/status, klik untuk terbang ke lokasi,
// dan ubah status tindak lanjut (OPEN -> IN_PROGRESS -> CLOSED).

import { useMemo, useState } from 'react';
import { AlertTriangle, Crosshair } from 'lucide-react';
import type { Damage } from '@/types';
import { SEVERITY_COLORS, DAMAGE_STATUS_LABEL } from '@/lib/constants';
import { getDamageLocationLabel } from '@/lib/geo';
import { formatDamageQuantity } from '@/lib/damage-quantity';

interface DamageListPanelProps {
  damages: Damage[];
  onSelect: (d: Damage) => void;
  onStatusChange: (id: string, status: string) => void;
}

export default function DamageListPanel({ damages, onSelect, onStatusChange }: DamageListPanelProps) {
  const [sevFilter, setSevFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('OPEN');

  const filtered = useMemo(
    () =>
      damages
        .filter((d) => (sevFilter ? d.severity === sevFilter : true))
        .filter((d) => (statusFilter ? d.status === statusFilter : true))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [damages, sevFilter, statusFilter]
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1">
          <option value="">Semua severity</option>
          <option value="L">Low</option>
          <option value="M">Medium</option>
          <option value="H">High</option>
          <option value="-">Tanpa Tingkat</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1">
          <option value="">Semua status</option>
          <option value="OPEN">Terbuka</option>
          <option value="IN_PROGRESS">Dalam Penanganan</option>
          <option value="CLOSED">Selesai</option>
        </select>
        <span className="ml-auto text-gray-400 self-center">{filtered.length} temuan</span>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Tidak ada temuan pada filter ini.</p>
        )}
        {filtered.map((d) => {
          const locInfo = getDamageLocationLabel(d);
          return (
            <div key={d.id} className="border border-gray-100 rounded-lg p-2 hover:bg-gray-50 text-xs">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SEVERITY_COLORS[d.severity] }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800 truncate">{d.type}</p>
                  <p className="text-gray-500">
                    {locInfo.label} · {formatDamageQuantity([d])} · {d.severity}
                  </p>
                  <p className="text-[10px] text-gray-400 font-mono truncate">
                    {d.lat.toFixed(6)}, {d.lng.toFixed(6)} | E {d.localX.toFixed(0)} N {d.localY.toFixed(0)}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => onSelect(d)} title="Lokasi di peta" className="p-1 rounded hover:bg-sky-100 text-sky-600">
                    <Crosshair className="w-3.5 h-3.5" />
                  </button>
                  {d.status === 'OPEN' && (
                    <button onClick={() => onStatusChange(d.id, 'IN_PROGRESS')} title="Mulai penanganan" className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                      Proses
                    </button>
                  )}
                  {d.status === 'IN_PROGRESS' && (
                    <button onClick={() => onStatusChange(d.id, 'CLOSED')} title="Tandai selesai" className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                      Selesai
                    </button>
                  )}
                  {d.status === 'CLOSED' && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-center">{DAMAGE_STATUS_LABEL.CLOSED}</span>
                  )}
                </div>
              </div>
              {d.remarks && <p className="mt-1 text-gray-500 italic pl-4.5">“{d.remarks}”</p>}
            </div>
          );
        })}
      </div>
      {damages.length === 0 && (
        <p className="text-[11px] text-gray-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Belum ada data. Aktifkan mode gambar untuk mencatat kerusakan.
        </p>
      )}
    </div>
  );
}
