'use client';

import { useMemo } from 'react';
import { X, Layers, Trash2, Edit3, Map, Camera } from 'lucide-react';
import type { AppConfig, Damage, DamageTypeEntry, Facility } from '@/types';
import { SEVERITY_COLORS, DAMAGE_STATUS_LABEL, getDamageCode } from '@/lib/constants';
import { resolveDamageCatalogEntry } from '@/lib/damage-catalog';
import { damageQuantity, formatDamageQuantity } from '@/lib/damage-quantity';

interface DamageDetailModalProps {
  open: boolean;
  onClose: () => void;
  damage: Damage | null;
  allDamages: Damage[];
  facilities: Facility[];
  damageCatalogs?: AppConfig['damageCatalogs'];
  legacyDamageTypesConfig?: DamageTypeEntry[] | null;
  onEditGeometry?: (damage: Damage) => void;
  onEditForm?: (damage: Damage) => void;
  onDelete?: (damage: Damage) => void;
  onStatusChange?: (damageId: string, status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED') => void;
  onFlyTo?: (lat: number, lng: number) => void;
}

export default function DamageDetailModal({ open, onClose, damage, allDamages, facilities, damageCatalogs, legacyDamageTypesConfig, onEditGeometry, onDelete, onStatusChange, onFlyTo }: DamageDetailModalProps) {
  const groupParts = useMemo(() => {
    if (!damage) return [];
    if (damage.groupId) return allDamages.filter((d) => d.groupId === damage.groupId);
    return [damage];
  }, [damage, allDamages]);

  const facility = useMemo(() => {
    if (!damage) return null;
    return facilities.find((f) => f.id === damage.facilityId) ?? damage.facility ?? null;
  }, [damage, facilities]);

  const totalQuantity = useMemo(() => damageQuantity(groupParts), [groupParts]);

  if (!open || !damage) return null;

  const isSam = facility?.locationMode === 'SAM' || groupParts.some((p) => Boolean(p.sampleCode));
  const surface = facility?.surfaceType === 'CONCRETE' ? 'JPCP'
    : facility?.surfaceType === 'ASPHALT' ? 'ASPHALT' : null;
  const entry = surface ? resolveDamageCatalogEntry(
    damage.type, surface, damageCatalogs?.[surface] ?? [], legacyDamageTypesConfig,
  ) : null;
  const code = entry?.code ?? getDamageCode(damage.type, legacyDamageTypesConfig);
  const damageName = entry?.name ?? damage.type;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl font-mono text-sm font-black text-white min-w-[42px] text-center" style={{ background: SEVERITY_COLORS[damage.severity] }}>{code}</div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800">{damageName}</h3>
                <span className="px-2 py-0.5 rounded text-xs font-black text-white" style={{ background: SEVERITY_COLORS[damage.severity] }}>{damage.severity === '-' ? 'Tanpa Tingkat' : `Tingkat ${damage.severity}`}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Fasilitas: <span className="font-semibold text-slate-700">{facility?.name || facility?.code || '—'}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-sky-50/80 border border-sky-100 rounded-xl p-3.5">
              <span className="text-xs font-semibold text-sky-600">Total Kuantitas</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-sky-900">{totalQuantity.value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</span>
                <span className="text-xs font-bold text-sky-700">{totalQuantity.unit}</span>
              </div>
            </div>
            <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-3.5">
              <span className="text-xs font-semibold text-amber-600">Sebaran ({isSam ? 'PCI SAM' : 'STA'})</span>
              <div className="mt-1">
                <span className="text-sm font-bold text-amber-900">
                  {groupParts.length > 1 ? `${groupParts.length} ${isSam ? 'Grid SAM' : 'STA'}` : (damage.sampleCode || damage.station || '—')}
                </span>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
              <span className="text-xs font-semibold text-slate-500">Status</span>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">{DAMAGE_STATUS_LABEL[damage.status] ?? damage.status}</span>
                {onStatusChange && (
                  <select value={damage.status} onChange={(e) => onStatusChange(damage.id, e.target.value as Damage['status'])} className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700">
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Breakdown per STA/SAM */}
          <div className="bg-slate-50/90 rounded-xl border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Rincian Kuantitas Per {isSam ? 'Sampel (SAM)' : 'Station (STA)'}</h4>
              </div>
              <span className="text-xs text-slate-400">{groupParts.length} Bagian</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {groupParts.map((part, idx) => {
                const partQuantity = damageQuantity([part]);
                const pct = totalQuantity.value > 0 ? (partQuantity.value / totalQuantity.value) * 100 : 100;
                const loc = part.sampleCode || part.station || `Bagian #${idx + 1}`;
                return (
                  <div key={part.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">{loc}</span>
                        {part.geometryType !== 'LINE' && part.lengthM && part.widthM && <span className="text-slate-400 text-[11px]">({part.lengthM}×{part.widthM} m)</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-800">{formatDamageQuantity([part])}</span>
                        <span className="text-slate-400 text-[11px] font-mono w-12 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(5, pct))}%`, background: SEVERITY_COLORS[damage.severity] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Foto Kerusakan */}
          {(() => {
            const photos = Array.from(new Set(groupParts.map((p) => p.photoUrl).filter((u): u is string => Boolean(u))));
            if (photos.length === 0) return null;
            return (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 space-y-2">
                <span className="text-slate-400 text-xs font-semibold flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-sky-500" /> Foto Kerusakan ({photos.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {photos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" title="Klik untuk lihat ukuran penuh" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Foto kerusakan"
                        className="h-32 w-auto max-w-[220px] object-cover rounded-lg border border-slate-200 shadow-sm hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Koordinat */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 space-y-1">
              <span className="text-slate-400 font-semibold block">Koordinat WGS-84</span>
              <p className="font-mono text-slate-700">Lat: {damage.lat.toFixed(6)}, Lng: {damage.lng.toFixed(6)}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 space-y-1">
              <span className="text-slate-400 font-semibold block">Koordinat Lokal Aerodrome</span>
              <p className="font-mono text-slate-700">E: {damage.localX.toFixed(1)} m, N: {damage.localY.toFixed(1)} m</p>
            </div>
          </div>
          {damage.remarks && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 space-y-1">
              <span className="text-slate-400 text-xs font-semibold block">Catatan</span>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{damage.remarks}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {onFlyTo && (
              <button type="button" onClick={() => { onFlyTo(damage.lat, damage.lng); onClose(); }} className="px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg flex items-center gap-1.5">
                <Map className="w-3.5 h-3.5" />Fokus di Peta
              </button>
            )}
            {onEditGeometry && (
              <button type="button" onClick={() => { onEditGeometry(damage); onClose(); }} className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" />Edit Geometri
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {onDelete && (
              <button type="button" onClick={() => { onDelete(damage); onClose(); }} className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />Hapus
              </button>
            )}
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg">Tutup</button>
          </div>
        </div>
      </div>
    </div>
  );
}
