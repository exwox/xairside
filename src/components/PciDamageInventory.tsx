'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, ClipboardList, MapPin } from 'lucide-react';
import type { AppConfig, Damage, Facility } from '@/types';
import {
  buildPciFacilityTable,
  countRecordedFindings,
  recordedDamageAreaSqm,
} from '@/lib/pci-location-table';
import PciCalculationGrid from './PciCalculationGrid';
import { damageQuantity } from '@/lib/damage-quantity';

interface PciDamageInventoryProps {
  facilities: Facility[];
  damages: Damage[];
  config: AppConfig | null;
}

const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 1,
});

function formatArea(value: number | null): string {
  return value == null ? '—' : `${numberFormatter.format(value)} m²`;
}

export default function PciDamageInventory({ facilities, damages, config }: PciDamageInventoryProps) {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [pciCorrections, setPciCorrections] = useState<Record<string, number>>({});
  const [correctionSaveStatus, setCorrectionSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [correctionSaveErrors, setCorrectionSaveErrors] = useState<Record<string, string>>({});
  const correctionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const correctionSaveChains = useRef<Record<string, Promise<void>>>({});
  const latestCorrections = useRef<Record<string, number>>({});
  const [pciAverages, setPciAverages] = useState<Record<string, number | null>>({});
  const arpLat = config?.arpLat ?? 0.9569;
  const arpLng = config?.arpLng ?? 104.5311;
  const activeFacility = facilities.find((facility) => facility.id === selectedFacilityId) ?? facilities[0];
  const table = useMemo(() => activeFacility
    ? buildPciFacilityTable(activeFacility, damages, arpLat, arpLng)
    : null, [activeFacility, damages, arpLat, arpLng]);
  const mapped = table?.rows.flatMap((row) => row.damages) ?? [];
  const withDamage = table?.rows.filter((row) => row.damages.length > 0).length ?? 0;
  const unassigned = damages.filter((damage) => !damage.facilityId || !facilities.some((facility) => facility.id === damage.facilityId));
  const activeFacilityPciCorrection = activeFacility ? pciCorrections[activeFacility.id] ?? activeFacility.pciCorrection ?? 100 : 100;
  const facilityId = activeFacility?.id ?? null;

  const handlePciCorrectionChange = useCallback((value: number) => {
    if (facilityId == null) return;
    setPciCorrections((previous) => ({ ...previous, [facilityId]: value }));
    latestCorrections.current[facilityId] = value;
    setCorrectionSaveStatus((previous) => ({ ...previous, [facilityId]: 'saving' }));
    setCorrectionSaveErrors((previous) => ({ ...previous, [facilityId]: '' }));
    clearTimeout(correctionTimers.current[facilityId]);
    correctionTimers.current[facilityId] = setTimeout(() => {
      const previousSave = correctionSaveChains.current[facilityId] ?? Promise.resolve();
      correctionSaveChains.current[facilityId] = previousSave.catch(() => undefined).then(async () => {
        if (latestCorrections.current[facilityId] !== value) return;
        try {
          const response = await fetch(`/api/facilities/${encodeURIComponent(facilityId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pciCorrection: value }),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => ({})) as { error?: string };
            throw new Error(result.error || `Server mengembalikan HTTP ${response.status}.`);
          }
          if (latestCorrections.current[facilityId] === value) {
            setCorrectionSaveStatus((previous) => ({ ...previous, [facilityId]: 'saved' }));
          }
        } catch (error) {
          if (latestCorrections.current[facilityId] === value) {
            setCorrectionSaveStatus((previous) => ({ ...previous, [facilityId]: 'error' }));
            setCorrectionSaveErrors((previous) => ({
              ...previous,
              [facilityId]: error instanceof Error ? error.message : 'Koneksi ke server gagal.',
            }));
          }
        }
      });
    }, 400);
  }, [facilityId]);

  const handlePciAverageChange = useCallback((average: number | null) => {
    if (facilityId == null) return;
    setPciAverages((previous) => ({ ...previous, [facilityId]: average }));
  }, [facilityId]);

  return (
    <section className="mt-6 space-y-4" aria-labelledby="pci-location-inventory-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pci-location-inventory-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ClipboardList className="h-5 w-5 text-sky-600" /> Tabel STA / SAM per Fasilitas
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Seluruh STA/SAM dibentuk dari pengaturan fasilitas, termasuk lokasi tanpa kerusakan.
            Tabel mengikuti rincian volume, density, DV, iterasi CDV, dan PCI per sampel pada referensi runway.
          </p>
        </div>
        <Link href="/kerusakan" className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100">
          Lihat Kerusakan <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
        PCI pada tabel adalah perhitungan dari catatan kerusakan aktif. Lokasi tanpa CDV terhitung memakai PCI koreksi (bawaan 100); CDV MAX mengurangi nilai tersebut saat perhitungan berhasil.
        Jika kode, severity, satuan, atau luas sampel tidak cocok, nilai DV/CDV ditahan—PCI/SAMPLE memakai PCI koreksi tanpa potongan palsu.
        Catatan berstatus selesai hanya dihitung sebagai riwayat.
      </div>

      {facilities.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Belum ada fasilitas. Tambahkan fasilitas di menu Admin untuk membentuk tabel STA atau SAM.
        </div>
      )}

      {facilities.length > 0 && (
        <div>
          <div className="overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Pilih fasilitas PCI">
            <div className="flex min-w-max gap-1">
            {facilities.map((facility, index) => {
              const isActive = facility.id === activeFacility?.id;
              return (
                <button
                  key={facility.id}
                  id={`pci-facility-tab-${facility.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="pci-facility-panel"
                  aria-label={`${facility.code} — ${facility.name}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setSelectedFacilityId(facility.id)}
                  onKeyDown={(event) => {
                    const nextIndex = event.key === 'ArrowRight'
                      ? (index + 1) % facilities.length
                      : event.key === 'ArrowLeft'
                        ? (index - 1 + facilities.length) % facilities.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? facilities.length - 1
                            : null;
                    if (nextIndex == null) return;
                    event.preventDefault();
                    const nextId = facilities[nextIndex].id;
                    setSelectedFacilityId(nextId);
                    document.getElementById(`pci-facility-tab-${nextId}`)?.focus();
                  }}
                  title={`${facility.code} — ${facility.name}`}
                  className={`whitespace-nowrap rounded-t-lg border-x border-t px-4 py-2 text-sm font-semibold transition-colors ${isActive
                    ? 'border-sky-300 bg-white text-sky-800 shadow-sm'
                    : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'}`}
                >
                  {facility.code}
                </button>
              );
            })}
            </div>
          </div>

          {table && (
          <section
            id="pci-facility-panel"
            role="tabpanel"
            aria-labelledby={`pci-facility-tab-${table.facility.id}`}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 md:px-5">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-sky-600" />
                <div>
                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                    {table.facility.code} — {table.facility.name}
                    {(() => {
                      const average = pciAverages[table.facility.id];
                      return (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">
                          PCI = {average == null ? '—' : numberFormatter.format(Math.round(average * 100) / 100)}
                        </span>
                      );
                    })()}
                    {correctionSaveStatus[table.facility.id] === 'saving' && <span className="text-[11px] font-normal text-slate-500">Menyimpan PCI Koreksi…</span>}
                    {correctionSaveStatus[table.facility.id] === 'saved' && <span className="text-[11px] font-normal text-emerald-700">PCI Koreksi tersimpan</span>}
                    {correctionSaveStatus[table.facility.id] === 'error' && <span className="text-[11px] font-normal text-red-700" role="alert">Gagal menyimpan PCI Koreksi: {correctionSaveErrors[table.facility.id]} Ubah nilainya untuk mencoba lagi.</span>}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {table.mode === 'SAM' ? 'Sampel (SAM)' : `Stationing (STA) · interval ${table.stationIntervalM} m`} · {table.facility.surfaceType === 'CONCRETE'
                      ? 'Rigit'
                      : table.facility.surfaceType === 'ASPHALT' ? 'Fleksibel' : 'Jenis perkerasan belum diatur'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">{table.rows.length} lokasi</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{withDamage} ada catatan</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">{table.rows.length - withDamage} tanpa catatan</span>
                {table.unmapped.length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">{table.unmapped.length} belum terpetakan</span>}
              </div>
            </div>

            <div className="border-t border-slate-200">
              {table.rows.length > 0 ? (
                <PciCalculationGrid
                  table={table}
                  damageTypesConfig={config?.damageTypesConfig}
                  damageCatalog={config?.damageCatalogs?.[table.facility.surfaceType === 'CONCRETE' ? 'JPCP' : 'ASPHALT']}
                  pciCorrection={activeFacilityPciCorrection}
                  onPciCorrectionChange={handlePciCorrectionChange}
                  onPciAverageChange={handlePciAverageChange}
                  airportName={config?.airportName}
                />
              ) : (
                <div className="px-5 py-6 text-sm text-slate-600">
                  Belum dapat membentuk lokasi {table.mode} karena panjang atau geometri fasilitas belum lengkap di Admin.
                </div>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 md:px-5">
                <span>{countRecordedFindings(mapped)} temuan unik terpetakan</span>
                <span>{formatArea(recordedDamageAreaSqm(mapped))} luas kerusakan terpetakan</span>
                <span>{numberFormatter.format(damageQuantity(mapped.filter((damage) => damage.geometryType === 'LINE')).value)} m kerusakan terpetakan</span>
                <span>{damageQuantity(mapped.filter((damage) => damage.geometryType === 'POINT' || damage.geometryType === 'SLAB')).value} kejadian/slab terpetakan</span>
                <span>{table.rows.length - withDamage} lokasi tanpa catatan</span>
              </div>
              {table.unmapped.length > 0 && (
                <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-xs text-red-800 md:px-5">
                  <p className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-3.5 w-3.5" /> {table.unmapped.length} catatan belum terpetakan ke {table.mode}
                  </p>
                  <p className="mt-1">Periksa kode lokasi atau geometri fasilitas. Catatan ini tidak digabungkan diam-diam ke lokasi lain:</p>
                  <p className="mt-1 font-mono break-words">
                    {table.unmapped.map((damage) => damage.sampleCode || damage.station || damage.id).join(' · ')}
                  </p>
                </div>
              )}
            </div>
          </section>
          )}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <strong>{unassigned.length} catatan Kerusakan belum terhubung ke fasilitas.</strong> Tentukan fasilitasnya pada halaman Kerusakan agar dapat muncul dalam tabel STA/SAM.
        </div>
      )}
    </section>
  );
}
