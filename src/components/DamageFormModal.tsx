'use client';

// Modal pencatatan temuan kerusakan: koordinat Google & aerodrome, luasan otomatis
// dari rectangle yang digambar, jenis kerusakan, severity L/M/H, dan station otomatis.

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, MapPin, Save, Camera, ImagePlus, Trash2, Loader2 } from 'lucide-react';
import type { Facility, Damage, AppConfig, DamageTypeEntry } from '@/types';
import type { DrawnRect } from './FacilityMap';
import { damageDrawingModeLabel, damageUnitForGeometryType, isDamageUnitCompatibleWithGeometry } from '@/lib/damage-drawing';
import { SEVERITIES, SEVERITY_LABEL, SEVERITY_COLORS, DAMAGE_STATUS_LABEL } from '@/lib/constants';
import { resolveDamageCatalogEntry } from '@/lib/damage-catalog';
import { distressCatalog } from '@/lib/pci-data';
import { createClientUuid } from '@/lib/client-uuid';
import {
  formatDms,
  parseLatLngInput,
  parseLocalInput,
  calculateFacilityStation,
  getFacilityStationIntervalM,
  findFacilityForPoint,
  splitDamageByStation,
  splitDamageBySampleGrids,
  splitPolylineByStation,
  splitPolylineBySampleGrids,
  generateFacilitySampleGridsSnapped,
  generateFacilityConcreteBlocksSnapped,
  findConcreteBlockForPoint,
  findSampleCodeForPoint,
  latLngToLocal,
  localToLatLng,
  type SplitDamageItem,
} from '@/lib/geo';

interface DamageFormModalProps {
  open: boolean;
  onClose: () => void;
  arpLat: number;
  arpLng: number;
  facilities: Facility[];
  rect: DrawnRect | null;
  initialType?: string | null;
  editingDamage?: Damage | null;
  onSaved: () => void;
  damageCatalogs?: AppConfig['damageCatalogs'];
  legacyDamageTypesConfig?: DamageTypeEntry[] | null;
}

function splitDrawnDamage(facility: Facility, rect: DrawnRect, arpLat: number, arpLng: number): SplitDamageItem[] {
  if (rect.corners.length < 2 || rect.geometryType === 'POINT' || rect.geometryType === 'SLAB') return [];
  const isSamMode = facility.locationMode === 'SAM' || facility.surfaceType === 'CONCRETE';
  if (rect.geometryType === 'LINE') {
    return isSamMode
      ? splitPolylineBySampleGrids(facility, rect.corners, arpLat, arpLng)
      : splitPolylineByStation(facility, rect.corners, arpLat, arpLng);
  }
  return isSamMode
    ? splitDamageBySampleGrids(facility, rect.corners, arpLat, arpLng)
    : splitDamageByStation(facility, rect.corners, arpLat, arpLng);
}

export default function DamageFormModal({ open, onClose, arpLat, arpLng, facilities, rect, initialType, editingDamage, onSaved, damageCatalogs, legacyDamageTypesConfig }: DamageFormModalProps) {
  const [facilityId, setFacilityId] = useState('');
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState<'L' | 'M' | 'H' | '-'>('M');
  const [status, setStatus] = useState<'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('OPEN');
  const [station, setStation] = useState('');
  const [sampleCode, setSampleCode] = useState('');
  const [googleInput, setGoogleInput] = useState('');
  const [localInput, setLocalInput] = useState('');
  const [lengthM, setLengthM] = useState('');
  const [widthM, setWidthM] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [count, setCount] = useState('1');
  const [remarks, setRemarks] = useState('');
  const [reportedBy, setReportedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Foto kerusakan (upload dengan dukungan kamera HP / galeri)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null); // URL yang tersimpan/akan dikirim
  const [photoPreview, setPhotoPreview] = useState<string | null>(null); // data-url untuk preview
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const selectedFacility = useMemo(() => facilities.find((f) => f.id === facilityId), [facilities, facilityId]);
  const surfaceType = selectedFacility?.surfaceType === 'CONCRETE'
    ? 'JPCP' : selectedFacility?.surfaceType === 'ASPHALT' ? 'ASPHALT' : null;
  const surfaceCatalog = surfaceType ? damageCatalogs?.[surfaceType] : undefined;
  const selectedCatalogEntry = surfaceType
    ? resolveDamageCatalogEntry(type, surfaceType, surfaceCatalog ?? [], legacyDamageTypesConfig)
    : null;
  const selectedPciDistress = surfaceType && selectedCatalogEntry?.pciCode != null
    ? distressCatalog(surfaceType).find((entry) => entry.code === selectedCatalogEntry.pciCode)
    : null;
  const geometryType = rect?.geometryType ?? editingDamage?.geometryType ?? 'POLYGON';
  const geometryUnit = damageUnitForGeometryType(geometryType);
  const selectedQuantityUnit = selectedPciDistress?.unit ?? geometryUnit;
  const catalogOptions = useMemo(
    () => surfaceCatalog?.filter((entry) => {
      if (!rect && !editingDamage?.geometryType) return true;
      const definition = entry.pciCode == null ? null
        : distressCatalog(surfaceType ?? 'ASPHALT').find((candidate) => candidate.code === entry.pciCode);
      const unit = definition?.unit ?? geometryUnit;
      return isDamageUnitCompatibleWithGeometry(unit, geometryType);
    }).map((entry) => ({ value: entry.id, label: `${entry.code} — ${entry.name}` })) ?? [],
    [surfaceCatalog, rect, editingDamage?.geometryType, surfaceType, geometryType, geometryUnit],
  );
  const typesList = catalogOptions;
  const historicalTypeOption = type && !typesList.some((item) => item.value === type)
    ? { value: type, label: selectedCatalogEntry
      ? `${selectedCatalogEntry.code} — ${selectedCatalogEntry.name} (data lama)`
      : `${type} (data lama)` }
    : null;

  /* eslint-disable react-hooks/set-state-in-effect -- pilihan jenis harus mengikuti fasilitas yang baru dipilih. */
  useEffect(() => {
    if (!open || !selectedFacility || typesList.length === 0) return;
    setType((current) => {
      if (editingDamage?.facilityId === selectedFacility.id && current === editingDamage.type) return current;
      if (typesList.some((item) => item.value === current)) return current;
      const matching = surfaceType
        ? resolveDamageCatalogEntry(current, surfaceType, surfaceCatalog ?? [], legacyDamageTypesConfig)
        : null;
      return matching && typesList.some((item) => item.value === matching.id)
        ? matching.id
        : typesList[0].value;
    });
  }, [open, selectedFacility, editingDamage, typesList, surfaceType, surfaceCatalog, legacyDamageTypesConfig]);
  useEffect(() => {
    if (!open || !selectedPciDistress || selectedPciDistress.severities.includes(severity)) return;
    if (editingDamage && editingDamage.facilityId === selectedFacility?.id && type === editingDamage.type) return;
    setSeverity(selectedPciDistress.severities[0]);
  }, [open, selectedPciDistress, severity, editingDamage, selectedFacility, type]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const availableSamples = useMemo(() => {
    if (!selectedFacility) return [];
    if (selectedFacility.locationMode !== 'SAM' && selectedFacility.surfaceType !== 'CONCRETE') return [];
    let poly = undefined;
    if (selectedFacility.polygonJson) {
      try { poly = JSON.parse(selectedFacility.polygonJson); } catch { poly = undefined; }
    }
    if (selectedFacility.surfaceType === 'CONCRETE') {
      const cBlocks = generateFacilityConcreteBlocksSnapped(selectedFacility, poly);
      return cBlocks.map((b) => ({
        sampleCode: b.blockCode,
        polygon: b.polygon,
      }));
    }
    return generateFacilitySampleGridsSnapped(selectedFacility, arpLat, arpLng, poly);
  }, [selectedFacility, arpLat, arpLng]);


  const [splitItems, setSplitItems] = useState<SplitDamageItem[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect -- pola sengaja: reset seluruh state form saat modal dibuka */
  useEffect(() => {
    if (!open) return;
    setError('');
    setPhotoUrl(null);
    setPhotoPreview(null);
    setPhotoError('');
    setUploadingPhoto(false);
    if (editingDamage) {
      // Mode Edit Kerangan Keterangan Existing
      setFacilityId(editingDamage.facilityId || '');
      setType(editingDamage.type);
      setSeverity(editingDamage.severity);
      setStatus(editingDamage.status);
      setGoogleInput(`${editingDamage.lat.toFixed(6)}, ${editingDamage.lng.toFixed(6)}`);
      setLocalInput(`${editingDamage.localX.toFixed(1)}, ${editingDamage.localY.toFixed(1)}`);
      setLengthM(editingDamage.lengthM ? String(Number(editingDamage.lengthM.toFixed(3))) : '');
      setWidthM(editingDamage.widthM ? editingDamage.widthM.toFixed(1) : '');
      setAreaSqm(editingDamage.areaSqm ? editingDamage.areaSqm.toFixed(1) : '');
      setCount(String(editingDamage.count ?? 1));
      setRemarks(editingDamage.remarks || '');
      setReportedBy(editingDamage.reportedBy || '');
      setSplitItems([]);
      if (editingDamage.photoUrl) {
        setPhotoUrl(editingDamage.photoUrl);
        setPhotoPreview(editingDamage.photoUrl);
      }

      const fac = facilities.find((f) => f.id === editingDamage.facilityId);
      if (fac && fac.locationMode === 'SAM') {
        let poly = undefined;
        if (fac.polygonJson) { try { poly = JSON.parse(fac.polygonJson); } catch { poly = undefined; } }
        const sGrids = generateFacilitySampleGridsSnapped(fac, arpLat, arpLng, poly);
        const sc = findSampleCodeForPoint(editingDamage.lat, editingDamage.lng, sGrids);
        const finalSc = editingDamage.sampleCode || sc || (sGrids.length > 0 ? sGrids[0].sampleCode : 'SAM-1');
        setSampleCode(finalSc);
        setStation(finalSc);
      } else {
        setStation(editingDamage.station || '');
        setSampleCode(editingDamage.sampleCode || '');
      }
    } else if (rect) {
      // Mode Buat Temuan Baru dari Hasil Draw Peta
      setStatus('OPEN');
      const { lat, lng } = rect.center;
      setGoogleInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      setLocalInput(`${rect.centerLocal.x.toFixed(1)}, ${rect.centerLocal.y.toFixed(1)}`);
      setLengthM(String(Number(rect.lengthM.toFixed(3))));
      setWidthM(rect.widthM.toFixed(1));
      setAreaSqm(rect.areaSqm.toFixed(1));
      setCount(String(rect.count ?? 1));
      setType(initialType ?? '');

      // Deteksi fasilitas paling presisi (point-in-polygon / terdekat)
      const detectedFacility = findFacilityForPoint({ lat, lng }, facilities, arpLat, arpLng);
      const targetFacility = facilities.find((facility) => facility.id === detectedFacility?.id) ?? facilities[0];
      setFacilityId(targetFacility?.id ?? '');

      if (targetFacility) {
        const isSamOrConcrete = targetFacility.locationMode === 'SAM' || targetFacility.surfaceType === 'CONCRETE';
        if (isSamOrConcrete) {
          const checkCorners = rect.corners.length >= 2 ? rect.corners : [];
          if (checkCorners.length >= 2) {
            const splits = splitDrawnDamage(targetFacility, rect, arpLat, arpLng);
            setSplitItems(splits);
            if (splits.length > 0) {
              const sc = splits[0].sampleCode || splits[0].stationText;
              setSampleCode(sc);
              setStation(sc);
            } else {
              let poly = undefined;
              if (targetFacility.polygonJson) { try { poly = JSON.parse(targetFacility.polygonJson); } catch { poly = undefined; } }
              if (targetFacility.surfaceType === 'CONCRETE') {
                const cBlocks = generateFacilityConcreteBlocksSnapped(targetFacility, poly);
                const cb = findConcreteBlockForPoint(lat, lng, cBlocks);
                const sc = cb ? cb.blockCode : (cBlocks.length > 0 ? cBlocks[0].blockCode : 'SAM-1 Slab A');
                setSampleCode(sc);
                setStation(sc);
              } else {
                const sGrids = generateFacilitySampleGridsSnapped(targetFacility, arpLat, arpLng, poly);
                const sc = findSampleCodeForPoint(lat, lng, sGrids) || (sGrids.length > 0 ? sGrids[0].sampleCode : 'SAM-1');
                setSampleCode(sc);
                setStation(sc);
              }
            }
          } else {
            setSplitItems([]);
            let poly = undefined;
            if (targetFacility.polygonJson) { try { poly = JSON.parse(targetFacility.polygonJson); } catch { poly = undefined; } }
            if (targetFacility.surfaceType === 'CONCRETE') {
              const cBlocks = generateFacilityConcreteBlocksSnapped(targetFacility, poly);
              const cb = findConcreteBlockForPoint(lat, lng, cBlocks);
              const sc = cb ? cb.blockCode : (cBlocks.length > 0 ? cBlocks[0].blockCode : 'SAM-1 Slab A');
              setSampleCode(sc);
              setStation(sc);
            } else {
              const sGrids = generateFacilitySampleGridsSnapped(targetFacility, arpLat, arpLng, poly);
              const sc = findSampleCodeForPoint(lat, lng, sGrids) || (sGrids.length > 0 ? sGrids[0].sampleCode : 'SAM-1');
              setSampleCode(sc);
              setStation(sc);
            }
          }
        } else {
          setSampleCode('');
          const checkCorners = rect.corners.length >= 2 ? rect.corners : [];
          if (checkCorners.length >= 2) {
            const splits = splitDrawnDamage(targetFacility, rect, arpLat, arpLng);
            setSplitItems(splits);
            if (splits.length > 0) {
              setStation(splits[0].subSegmentCode);
            } else {
              const st = calculateFacilityStation(targetFacility, { lat, lng }, arpLat, arpLng);
              setStation(st ? st.subSegmentCode : targetFacility.code);
            }
          } else {
            setSplitItems([]);
            const st = calculateFacilityStation(targetFacility, { lat, lng }, arpLat, arpLng);
            setStation(st ? st.subSegmentCode : targetFacility.code);
          }
        }
      } else {
        setSplitItems([]);
        setStation('');
        setSampleCode('');
      }
    } else {
      setStatus('OPEN');
      setGoogleInput('');
      setLocalInput('');
      setLengthM('');
      setWidthM('');
      setAreaSqm('');
      setCount('1');
      setStation('');
      setSplitItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rect, editingDamage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  // Sinkronisasi input dua arah Google <-> aerodrome
  const applyGoogle = (v: string) => {
    setGoogleInput(v);
    const p = parseLatLngInput(v);
    if (p) {
      const l = latLngToLocal(p.lat, p.lng, arpLat, arpLng);
      setLocalInput(`${l.x.toFixed(1)}, ${l.y.toFixed(1)}`);
      const selectedFac = facilities.find((f) => f.id === facilityId);
      if (selectedFac && splitItems.length <= 1) {
        if (selectedFac.locationMode === 'SAM' || selectedFac.surfaceType === 'CONCRETE') {
          let poly = undefined;
          if (selectedFac.polygonJson) { try { poly = JSON.parse(selectedFac.polygonJson); } catch { poly = undefined; } }
          if (selectedFac.surfaceType === 'CONCRETE') {
            const cBlocks = generateFacilityConcreteBlocksSnapped(selectedFac, poly);
            const cb = findConcreteBlockForPoint(p.lat, p.lng, cBlocks);
            const code = cb ? cb.blockCode : (cBlocks.length > 0 ? cBlocks[0].blockCode : 'SAM-1 Slab A');
            setSampleCode(code);
            setStation(code);
          } else {
            const sGrids = generateFacilitySampleGridsSnapped(selectedFac, arpLat, arpLng, poly);
            const sc = findSampleCodeForPoint(p.lat, p.lng, sGrids);
            const code = sc || (sGrids.length > 0 ? sGrids[0].sampleCode : 'SAM-1');
            setSampleCode(code);
            setStation(code);
          }
        } else {
          const st = calculateFacilityStation(selectedFac, p, arpLat, arpLng);
          if (st) setStation(st.subSegmentCode);
        }
      }
    }
  };
  const applyLocal = (v: string) => {
    setLocalInput(v);
    const l = parseLocalInput(v);
    if (l) {
      const p = localToLatLng(l.x, l.y, arpLat, arpLng);
      setGoogleInput(`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`);
      const selectedFac = facilities.find((f) => f.id === facilityId);
      if (selectedFac && splitItems.length <= 1) {
        if (selectedFac.locationMode === 'SAM' || selectedFac.surfaceType === 'CONCRETE') {
          let poly = undefined;
          if (selectedFac.polygonJson) { try { poly = JSON.parse(selectedFac.polygonJson); } catch { poly = undefined; } }
          if (selectedFac.surfaceType === 'CONCRETE') {
            const cBlocks = generateFacilityConcreteBlocksSnapped(selectedFac, poly);
            const cb = findConcreteBlockForPoint(p.lat, p.lng, cBlocks);
            const code = cb ? cb.blockCode : (cBlocks.length > 0 ? cBlocks[0].blockCode : 'SAM-1 Slab A');
            setSampleCode(code);
            setStation(code);
          } else {
            const sGrids = generateFacilitySampleGridsSnapped(selectedFac, arpLat, arpLng, poly);
            const sc = findSampleCodeForPoint(p.lat, p.lng, sGrids);
            const code = sc || (sGrids.length > 0 ? sGrids[0].sampleCode : 'SAM-1');
            setSampleCode(code);
            setStation(code);
          }
        } else {
          const st = calculateFacilityStation(selectedFac, p, arpLat, arpLng);
          if (st) setStation(st.subSegmentCode);
        }
      }
    }
  };

  // ===== Foto kerusakan (kamera HP / galeri) =====
  // Kompresi client-side via canvas agar upload ringan (HP kamera menghasilkan
  // gambar 3-8 MB; cukup di-resize ke 1600px + JPEG 0.82).
  const compressImageFile = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Gambar tidak dapat dibuka (format tidak didukung)'));
        img.onload = () => {
          const MAX_DIM = 1600;
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            const scale = MAX_DIM / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas tidak tersedia di perangkat ini'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Gagal mengompresi gambar'));
                return;
              }
              resolve(new File([blob], 'damage-photo.jpg', { type: 'image/jpeg' }));
            },
            'image/jpeg',
            0.82
          );
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoPicked = async (file: File | null) => {
    setPhotoError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Pilih file gambar (JPG/PNG/WebP).');
      return;
    }
    setUploadingPhoto(true);
    try {
      const compressed = await compressImageFile(file);
      const formData = new FormData();
      formData.append('file', compressed);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        throw new Error((json as { error?: string }).error || 'Gagal mengunggah foto');
      }
      setPhotoUrl((json as { url: string }).url);
      setPhotoPreview((json as { url: string }).url);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Gagal mengunggah foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = async () => {
    const oldUrl = photoUrl;
    // Hapus file yang sudah ter-upload agar tidak jadi file yatim
    if (oldUrl && oldUrl.startsWith('/uploads/')) {
      fetch(`/api/upload?url=${encodeURIComponent(oldUrl)}`, { method: 'DELETE' }).catch(() => {});
    }
    setPhotoUrl(null);
    setPhotoPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const submit = async () => {
    setError('');
    if (!selectedFacility || !surfaceType) {
      setError('Pilih fasilitas dengan jenis perkerasan Flexible atau Rigit sebelum menyimpan kerusakan.');
      return;
    }
    if (!surfaceCatalog?.length) {
      setError('Katalog kode dan nama kerusakan belum dimuat. Muat ulang halaman dan coba lagi.');
      return;
    }
    if (!selectedCatalogEntry && !(editingDamage && type === editingDamage.type && facilityId === editingDamage.facilityId)) {
      setError('Pilih jenis kerusakan dari katalog DV untuk perkerasan fasilitas ini.');
      return;
    }
    if (selectedPciDistress && !selectedPciDistress.severities.includes(severity)) {
      setError('Tingkat severity tidak tersedia untuk jenis kerusakan ini.');
      return;
    }
    const p = parseLatLngInput(googleInput);
    if (!p) {
      setError('Koordinat Google tidak valid. Contoh: 0.956900, 104.531100');
      return;
    }
    const l = parseLocalInput(localInput) ?? latLngToLocal(p.lat, p.lng, arpLat, arpLng);
    const area = parseFloat(areaSqm) || 0;
    const length = parseFloat(lengthM) || 0;
    const damageCount = Number(count);
    const quantityUnit = selectedQuantityUnit;
    const compatibleGeometry = isDamageUnitCompatibleWithGeometry(quantityUnit, geometryType);
    if (rect && !compatibleGeometry) {
      setError('Satuan jenis kerusakan tidak sesuai dengan bentuk gambar. Pilih jenis dengan satuan yang sama atau gambar ulang.');
      return;
    }
    if (editingDamage && facilityId !== editingDamage.facilityId) {
      setError('Untuk memindahkan temuan ke fasilitas lain, gunakan Edit Gambar agar lokasi STA/SAM dan kuantitas dihitung ulang.');
      return;
    }
    if (editingDamage && type !== editingDamage.type) {
      const originalEntry = resolveDamageCatalogEntry(editingDamage.type, surfaceType, surfaceCatalog, legacyDamageTypesConfig);
      const originalUnit = distressCatalog(surfaceType).find((entry) => entry.code === originalEntry?.pciCode)?.unit ?? geometryUnit;
      if (!compatibleGeometry || quantityUnit !== originalUnit) {
        setError('Jenis baru memiliki satuan berbeda. Gunakan Edit Gambar untuk membuat bentuk dan kuantitas yang sesuai.');
        return;
      }
    }
    if (!editingDamage && quantityUnit === 'PERCENT' && (!Number.isFinite(area) || area <= 0)) {
      setError('Luasan (m²) wajib lebih dari 0 untuk kerusakan area.');
      return;
    }
    if (!editingDamage && quantityUnit === 'LENGTH' && (!Number.isFinite(length) || length <= 0)) {
      setError('Panjang garis (m) wajib lebih dari 0 untuk jenis kerusakan ini.');
      return;
    }
    if (!editingDamage && quantityUnit === 'COUNT' && (!Number.isInteger(damageCount) || damageCount <= 0)) {
      setError('Jumlah kerusakan/slab wajib bilangan bulat lebih dari 0.');
      return;
    }
    if (!editingDamage && quantityUnit === 'LENGTH' && geometryType !== 'LINE') {
      setError('Kerusakan bersatuan m harus digambar sebagai garis pada peta.');
      return;
    }
    setSaving(true);
    try {
      const isSamMode = selectedFacility?.locationMode === 'SAM' || selectedFacility?.surfaceType === 'CONCRETE';
      let finalSampleCode = sampleCode || null;
      let finalStation = station || null;
      if (isSamMode) {
        const code = sampleCode || station || (availableSamples.length > 0 ? availableSamples[0].sampleCode : 'SAM-1 Slab A');
        finalSampleCode = code;
        finalStation = code;
      }

      if (editingDamage) {
        // Modal ini mengubah keterangan saja; geometri/kuantitas tiap pecahan
        // STA/SAM tidak boleh ditimpa dengan nilai salah satu bagian grup.
        const res = await fetch(`/api/damages/${editingDamage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updateGroup: true,
            type,
            severity,
            status,
            photoUrl: photoUrl || null,
            remarks: remarks || null,
            reportedBy: reportedBy || 'Petugas Patroli',
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || 'Gagal memperbarui kerusakan');
        }
      } else if (splitItems.length > 1 && rect) {
        // Jika kerusakan melintasi 2 (atau lebih) STA atau Sampel PCI, buat groupId dan simpan masing-masing potongan record
        const groupId = createClientUuid();
        for (const item of splitItems) {
          const itemStation = isSamMode ? (item.sampleCode || item.stationText) : item.subSegmentCode;
          const itemSampleCode = isSamMode ? (item.sampleCode || item.stationText) : null;
          const itemRemarksLabel = isSamMode ? `Terpotong Sampel ${item.stationText}` : `Terpotong STA ${item.stationText}`;

          const res = await fetch('/api/damages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groupId,
              facilityId: facilityId || null,
              station: itemStation,
              sampleCode: itemSampleCode,
              type,
              severity,
              status: 'OPEN',
              lat: item.lat,
              lng: item.lng,
              localX: item.localX,
              localY: item.localY,
              geometryType,
              count: quantityUnit === 'COUNT' ? damageCount : null,
              rectJson: item.rectJson,
              lengthM: item.lengthM,
              widthM: item.widthM,
              areaSqm: item.areaSqm,
              photoUrl: photoUrl || null,
              remarks: remarks ? `${remarks} (${itemRemarksLabel})` : itemRemarksLabel,
              reportedBy: reportedBy || 'Petugas Patroli',
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error((j as { error?: string }).error || 'Gagal menyimpan potongan kerusakan');
          }
        }
      } else {
        const res = await fetch('/api/damages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facilityId: facilityId || null,
            station: finalStation,
            sampleCode: finalSampleCode,
            type,
            severity,
            status: 'OPEN',
            lat: p.lat,
            lng: p.lng,
            localX: l.x,
            localY: l.y,
            geometryType,
            count: quantityUnit === 'COUNT' ? damageCount : null,
            rectJson: rect && geometryType !== 'POINT' ? JSON.stringify(rect.corners) : null,
            lengthM: length || null,
            widthM: parseFloat(widthM) || null,
            areaSqm: area,
            photoUrl: photoUrl || null,
            remarks: remarks || null,
            reportedBy: reportedBy || 'Petugas Patroli',
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || 'Gagal menyimpan');
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const parsed = parseLatLngInput(googleInput);

  return (
    <div className="fixed inset-0 z-[1200] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl z-10">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-500" /> {editingDamage ? 'Edit Keterangan Kerusakan' : 'Catat Temuan Kerusakan'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          {splitItems.length > 1 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-amber-900">
                ⚠️ {geometryType === 'LINE' ? 'Garis' : 'Area'} Kerusakan Melintasi {splitItems.length} {selectedFacility?.locationMode === 'SAM' || selectedFacility?.surfaceType === 'CONCRETE' ? 'Sampel PCI' : 'Interval STA'}!
              </p>
              <p>Geometri kerusakan ini melintasi batas lokasi. Saat disimpan, sistem akan memecah menjadi {splitItems.length} rekaman temuan sesuai porsinya:</p>
              <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px] mt-1">
                {splitItems.map((item, idx) => (
                  <li key={idx}>
                    <b>{item.stationText}</b>: ~{geometryType === 'LINE'
                      ? `${item.lengthM.toLocaleString('id-ID', { maximumFractionDigits: 3 })} m `
                      : `${item.areaSqm.toLocaleString('id-ID', { maximumFractionDigits: 3 })} m² (${item.lengthM}m × ${item.widthM}m)`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Fasilitas</span>
              <select
                value={facilityId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setFacilityId(newId);
                  const selectedFac = facilities.find((f) => f.id === newId);
                  if (selectedFac) {
                    if (selectedFac.locationMode === 'SAM' || selectedFac.surfaceType === 'CONCRETE') {
                      const splits = rect ? splitDrawnDamage(selectedFac, rect, arpLat, arpLng) : [];
                      setSplitItems(splits);
                      const p = parseLatLngInput(googleInput) || rect?.center;
                      let poly = undefined;
                      if (selectedFac.polygonJson) { try { poly = JSON.parse(selectedFac.polygonJson); } catch { poly = undefined; } }
                      if (selectedFac.surfaceType === 'CONCRETE') {
                        const cBlocks = generateFacilityConcreteBlocksSnapped(selectedFac, poly);
                        const cb = p ? findConcreteBlockForPoint(p.lat, p.lng, cBlocks) : null;
                        const initialSc = cb ? cb.blockCode : (cBlocks.length > 0 ? cBlocks[0].blockCode : 'SAM-1 Slab A');
                        setSampleCode(splits[0]?.sampleCode || initialSc);
                        setStation(splits[0]?.sampleCode || initialSc);
                      } else {
                        const sGrids = generateFacilitySampleGridsSnapped(selectedFac, arpLat, arpLng, poly);
                        const sc = p ? findSampleCodeForPoint(p.lat, p.lng, sGrids) : null;
                        const initialSc = sc || (sGrids.length > 0 ? sGrids[0].sampleCode : 'SAM-1');
                        setSampleCode(splits[0]?.sampleCode || initialSc);
                        setStation(splits[0]?.sampleCode || initialSc);
                      }
                    } else {
                      setSampleCode('');
                      const checkCorners = rect && rect.corners.length >= 2 ? rect.corners : [];
                      if (checkCorners.length >= 2) {
                        const splits = rect ? splitDrawnDamage(selectedFac, rect, arpLat, arpLng) : [];
                        setSplitItems(splits);
                        if (splits.length > 0) {
                          setStation(splits[0].subSegmentCode);
                        } else {
                          const p = parseLatLngInput(googleInput) || rect?.center;
                          if (p) {
                            const st = calculateFacilityStation(selectedFac, p, arpLat, arpLng);
                            setStation(st ? st.subSegmentCode : selectedFac.code);
                          } else {
                            setStation(selectedFac.code);
                          }
                        }
                      } else {
                        setSplitItems([]);
                        const p = parseLatLngInput(googleInput) || rect?.center;
                        if (p) {
                          const st = calculateFacilityStation(selectedFac, p, arpLat, arpLng);
                          setStation(st ? st.subSegmentCode : selectedFac.code);
                        } else {
                          setStation(selectedFac.code);
                        }
                      }
                    }
                  } else {
                    setSplitItems([]);
                    setStation('');
                    setSampleCode('');
                  }
                }}
                className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5"
              >
                <option value="">— Tidak spesifik —</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} ({f.name})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              {(selectedFacility?.locationMode === 'SAM' || selectedFacility?.surfaceType === 'CONCRETE') ? (
                <>
                  <span className="text-xs font-bold text-amber-900 flex items-center justify-between">
                    <span>{selectedFacility?.surfaceType === 'CONCRETE' ? 'Kode Slab (Concrete)' : 'Unit Sampel (SAM)'}</span>
                    <span className="text-[10px] text-amber-600 font-mono">{selectedFacility?.surfaceType === 'CONCRETE' ? 'Rigid Pavement' : 'PCI Mode'}</span>
                  </span>
                  {availableSamples.length > 0 ? (
                    <select
                      value={sampleCode || station}
                      onChange={(e) => {
                        setSampleCode(e.target.value);
                        setStation(e.target.value);
                      }}
                      className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 font-mono font-bold text-amber-950 bg-amber-50/50"
                    >
                      {availableSamples.map((s) => (
                        <option key={s.sampleCode} value={s.sampleCode}>
                          {s.sampleCode}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={sampleCode || station}
                      onChange={(e) => {
                        setSampleCode(e.target.value);
                        setStation(e.target.value);
                      }}
                      placeholder={selectedFacility?.surfaceType === 'CONCRETE' ? 'SAM-1 Slab A, SAM-1 Slab B, ...' : 'SAM-1, SAM-2, ...'}
                      className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 font-mono font-bold text-amber-950 bg-amber-50/50"
                    />
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs text-gray-500">Station / Lokasi</span>
                  <input value={station} onChange={(e) => setStation(e.target.value)} placeholder="08 + 450 / TWY-A3 / Stand 2" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
                </>
              )}
            </label>
          </div>
          {editingDamage && (
            <div>
              <span className="text-xs text-gray-500 block mb-1">Status Penanganan</span>
              <div className="flex gap-2">
                {(['OPEN', 'IN_PROGRESS', 'CLOSED'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatus(st)}
                    className={`flex-1 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      status === st
                        ? st === 'OPEN'
                          ? 'bg-red-600 text-white border-red-600 font-bold'
                          : st === 'IN_PROGRESS'
                          ? 'bg-amber-500 text-white border-amber-500 font-bold'
                          : 'bg-emerald-600 text-white border-emerald-600 font-bold'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {DAMAGE_STATUS_LABEL[st] || st}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="block">
            <span className="text-xs text-gray-500">Jenis Kerusakan</span>
            <select value={type} onChange={(e) => setType(e.target.value)} disabled={!surfaceCatalog?.length} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 disabled:bg-gray-100 disabled:text-gray-400">
              {!type && <option value="">Pilih jenis kerusakan</option>}
              {historicalTypeOption && <option value={historicalTypeOption.value}>{historicalTypeOption.label}</option>}
              {typesList.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            {!surfaceType && <span className="mt-1 block text-[11px] text-amber-700">Pilih fasilitas dengan jenis perkerasan Flexible atau Rigit.</span>}
            {surfaceType && !surfaceCatalog?.length && <span className="mt-1 block text-[11px] text-amber-700">Katalog DV belum dimuat; periksa halaman Admin atau muat ulang.</span>}
            {(rect || editingDamage?.geometryType) && surfaceCatalog?.length ? (
              <span className="mt-1 block text-[11px] text-sky-700">
                Pilihan jenis disaring sesuai bentuk gambar: {damageDrawingModeLabel(geometryUnit)}.
              </span>
            ) : null}
          </label>
          <div>
            <span className="text-xs text-gray-500">Severity</span>
            <div className="mt-1 flex gap-2">
              {(selectedPciDistress?.severities ?? SEVERITIES.filter((s) => s !== '-')).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  disabled={selectedPciDistress != null && !selectedPciDistress.severities.includes(s)}
                  title={selectedPciDistress != null && !selectedPciDistress.severities.includes(s) ? 'Severity ini tidak tersedia pada kurva PCI jenis kerusakan terpilih.' : undefined}
                  className={`flex-1 py-1.5 rounded-md border-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${severity === s ? 'text-white' : 'bg-white text-gray-600'}`}
                  style={severity === s ? { background: SEVERITY_COLORS[s], borderColor: SEVERITY_COLORS[s] } : { borderColor: '#e5e7eb' }}
                >
                  {s} — {SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-gray-500">Koordinat Google (WGS84 lat, lng)</span>
            <input value={googleInput} onChange={(e) => applyGoogle(e.target.value)} placeholder="0.956900, 104.531100" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
            {parsed && <span className="text-[10px] text-gray-400">{formatDms(parsed.lat, true)} {formatDms(parsed.lng, false)}</span>}
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Koordinat Aerodrome (E, N meter dari ARP)</span>
            <input value={localInput} onChange={(e) => applyLocal(e.target.value)} placeholder="123.4, 56.7" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-mono text-xs" />
          </label>
          {selectedQuantityUnit === 'COUNT' ? (
            <label className="block">
              <span className="text-xs text-gray-500">Jumlah {geometryType === 'SLAB' ? 'slab' : 'kejadian'}</span>
              <input value={count} onChange={(e) => setCount(e.target.value)} readOnly={Boolean(rect || editingDamage)} type="number" min="1" step="1" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-semibold read-only:bg-gray-100" />
              {rect && <span className="mt-1 block text-[11px] text-gray-500">Satu titik/slab = satu temuan. Gambar lagi untuk kejadian berikutnya.</span>}
            </label>
          ) : selectedQuantityUnit === 'LENGTH' ? (
            <label className="block">
              <span className="text-xs text-gray-500">Panjang jalur kerusakan (m)</span>
              <input value={lengthM} onChange={(e) => setLengthM(e.target.value)} readOnly={Boolean(rect || editingDamage)} type="number" step="0.01" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-semibold read-only:bg-gray-100" />
              <span className="mt-1 block text-[11px] text-gray-500">Dihitung otomatis dari setiap ruas garis yang digambar, bukan luas atau panjang kotak.</span>
            </label>
          ) : <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Panjang (m)</span>
              <input value={lengthM} onChange={(e) => setLengthM(e.target.value)} readOnly={Boolean(editingDamage)} type="number" step="0.1" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 read-only:bg-gray-100" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Lebar (m)</span>
              <input value={widthM} onChange={(e) => setWidthM(e.target.value)} readOnly={Boolean(editingDamage)} type="number" step="0.1" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 read-only:bg-gray-100" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Luas (m²)</span>
              <input value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} readOnly={Boolean(editingDamage)} type="number" step="0.1" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 font-semibold read-only:bg-gray-100" />
            </label>
          </div>}
          {editingDamage && <p className="text-[11px] text-slate-500">Ukuran dan posisi diubah melalui menu Edit Gambar agar kuantitas tiap STA/SAM tetap akurat.</p>}
          {/* Foto Kerusakan — dukungan kamera HP & galeri */}
          <div className="border border-dashed border-slate-300 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-sky-500" />
                Foto Kerusakan <span className="text-gray-400">(opsional, mendukung kamera HP)</span>
              </span>
              {uploadingPhoto && (
                <span className="flex items-center gap-1.5 text-[11px] text-sky-600 font-semibold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengunggah...
                </span>
              )}
            </div>

            {photoPreview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element -- preview data-url lokal, next/image tidak perlu */}
                <img
                  src={photoPreview}
                  alt="Preview foto kerusakan"
                  className="h-32 w-auto max-w-full object-cover rounded-lg border border-slate-200 shadow-sm"
                />
                <button
                  type="button"
                  onClick={removePhoto}
                  title="Hapus foto"
                  className="absolute -top-2 -right-2 p-1.5 bg-red-600 text-white rounded-full shadow hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {/* Kamera langsung (HP: membuka aplikasi kamera; desktop: dialog file) */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => handlePhotoPicked(e.target.files?.[0] ?? null)}
                />
                {/* Galeri / dokumen */}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => handlePhotoPicked(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  <Camera className="w-4 h-4" /> Ambil Foto (Kamera)
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 disabled:opacity-60 border border-sky-200 rounded-lg transition-colors"
                >
                  <ImagePlus className="w-4 h-4" /> Pilih dari Galeri/File
                </button>
              </div>
            )}
            {photoError && <p className="mt-2 text-[11px] text-red-600 bg-red-50 rounded-md px-2 py-1.5">{photoError}</p>}
          </div>

          <label className="block">
            <span className="text-xs text-gray-500">Keterangan</span>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Pelapor</span>
            <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Nama petugas" className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5" />
          </label>
          {splitItems.length > 1 && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-1 text-xs text-amber-900">
              <div className="font-bold flex items-center justify-between">
                <span>✂ Pemotongan Otomatis ({splitItems.length} Potongan)</span>
                <span className="text-[10px] bg-amber-200 px-1.5 py-0.5 rounded font-mono">
                  {selectedFacility?.locationMode === 'SAM' || selectedFacility?.surfaceType === 'CONCRETE'
                    ? 'Batas Sampel PCI'
                    : `Batas STA ${getFacilityStationIntervalM(selectedFacility ?? {})}m`}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 leading-tight">
                Kerusakan yang Anda gambar melintasi garis batas {selectedFacility?.locationMode === 'SAM' || selectedFacility?.surfaceType === 'CONCRETE' ? 'sampel PCI' : 'stationing'}. Sistem akan membuat {splitItems.length} record terpisah dengan {geometryType === 'LINE' ? 'panjang garis' : 'luas'} & lokasi disesuaikan:
              </p>
              <div className="max-h-24 overflow-y-auto space-y-1 pt-1 font-mono text-[10px]">
                {splitItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white/80 px-2 py-0.5 rounded border border-amber-100">
                    <span className="font-bold text-amber-950">{item.subSegmentCode || item.stationText}</span>
                    <span>{geometryType === 'LINE'
                      ? `${item.lengthM.toLocaleString('id-ID', { maximumFractionDigits: 3 })} m`
                      : `${item.areaSqm.toLocaleString('id-ID', { maximumFractionDigits: 3 })} m²`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan Temuan'}
            </button>
            <button onClick={onClose} className="px-4 border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
          </div>
        </div>
      </div>
    </div>
  );
}
