
## 4. Rancangan Menu & Halaman

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ✈ X-Airside Monitoring   [ Dashboard ] [ Inspeksi ] [ Marka ] [ PCI ]   │
├───────────────────────────────────────────────────────────┬──────────────┤
│  PETA SATELIT (Leaflet + Esri World Imagery)              │ PANEL INFO   │
│  ▣ Polygon fasilitas (RWY/TWY/APRON) + label kode         │ ┌──────────┐ │
│  ▣ Overlay DXF (layer on/off, upload .dxf)                │ │Fasilitas │ │
│  ▣ Rectangle kerusakan (L/M/H) — klik utk detail          │ │PCN/PCR   │ │
│  ▣ Titik temuan marka                                     │ │Dimensi   │ │
│  [+] Gambar Kerusakan   [⬆ Timpa DXF]   [⚙ Koordinat]     │ │Performance│ │
│  Status bar: lat,lng (Google) · X,Y m (aerodrome)         │ └──────────┘ │
└───────────────────────────────────────────────────────────┴──────────────┘
KPI: Total Fasilitas · Temuan Terbuka (L/M/H) · Marka Perlu Perbaikan · PCI Terakhir
```

1. **Dashboard** (`/`) — peta + panel detail fasilitas (PCN/PCR, dimensi, tipe perkerasan, bearing, status, jumlah temuan, PCI terakhir) + KPI performance + daftar temuan + modals: *Upload DXF*, *Form Kerusakan* (auto-isi luasan/koordinat/station dari rectangle), *Pengaturan ARP*, *Kelola Fasilitas*.
2. **Inspeksi** (`/inspeksi`) — portal checklist existing (InspectorForm + SupervisorDashboard) dipindah utuh ke menu ini.
3. **Marka** (`/marka`) — inventaris & kondisi marka per fasilitas (threshold, centerline, TDZ, holding position, stand line, dst.), kondisi BAIK/PERLU_PERBAIKAN/USANG, station, opsional koordinat & luasan, daftar temuan + tindak lanjut.
4. **PCI (mode lanjutan)** (`/pci`) — manajemen section perkerasan → builder survey sample unit (distress ASTM D6433 + severity + quantity) → perhitungan PCI (server) → hasil per sample unit + PCI section + rating + riwayat.

## 5. Prosedur PCI Mode Lanjutan (ASTM D6433)

```
Input sample unit ──► density tiap distress ──► Deduct Value (kurva ASTM)
        │                                             │
        ▼                                             ▼
 quantity & severity (L/M/H)              max CDV (koreksi q/n, kurva F)
                                                      │
                                                      ▼
                              PCI sample unit = 100 − max CDV
                                                      │
                              PCI section = Σ (PCI unit × luas unit)/Σ luas
```
- **Rating**: 86–100 Excellent · 71–85 Very Good · 56–70 Good · 41–55 Fair · 26–40 Poor · 11–25 Very Poor · 0–10 Failed.
- Distress ASPHALT (15) & JPCC (utama) tersedia pada `src/lib/pci-data.ts`; **kurva deduct dapat dikalibrasi** tanpa mengubah engine.

## 6. Alur Kerja

```
[Upload DXF + set ARP/rotasi] ──► [Dashboard: overlay + detailing station]
        │
        ▼ (patroli lapangan)
[Inspeksi checklist existing]        [Gambar rectangle kerusakan di peta]
        │                                     │
        ▼                                     ▼
[Approval supervisor]                [DB: posisi, koordinat, luasan, jenis, severity]
                                              │
                                              ▼
                              [Marka: monitoring kondisi marka]
                                              │
                                              ▼
                              [PCI lanjutan: survey sample unit → skor & rating]
```

## 7. Tahapan Implementasi (mapping file)

| Tahap | Isi | File |
| :--- | :--- | :--- |
| 1 | Skema DB + migrasi + seed | `prisma/schema.prisma`, `prisma/seed.ts` |
| 2 | Lib geo/DXF/PCI/constants | `src/lib/geo.ts`, `src/lib/dxf.ts`, `src/lib/pci-data.ts`, `src/lib/pci.ts`, `src/lib/constants.ts` |
| 3 | REST API monitoring | `src/app/api/{config,facilities,map-layers,damages,markings,pci/*}` |
| 4 | Shell & Dashboard + peta | `src/components/AppShell.tsx`, `DashboardView.tsx`, `FacilityMap.tsx`, `DamageFormModal.tsx`, `DxfUploadModal.tsx` |
| 5 | Menu Marka & PCI | `src/components/MarkaView.tsx`, `PciView.tsx`, `PciSurveyBuilder.tsx` |
| 6 | Routing halaman | `src/app/page.tsx`, `src/app/{inspeksi,marka,pci}/page.tsx`, `layout.tsx` |
| 7 | Validasi | migrate → seed → `next build` → smoke test API & UI |

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
| :--- | :--- |
| Kurva deduct ASTM belum persis standar | Data terpisah di `pci-data.ts`, mudah dikalibrasi; prosedur DV→CDV→PCI sesuai ASTM |
| Georeferencing DXF meleset | Konfigurasi ref point/rotasi/skala per layer + verifikasi visual terhadap citra satelit |
| DXF besar → berat render | Parser membatasi jumlah entity, filter per layer, render polyline sederhana |
| Citra satelit butuh internet | Basemap tetap berfungsi tanpa tile (polygon+DXF), koordinat lokal tidak bergantung tile |
| Akurasi konversi koordinat | Local tangent plane cukup untuk skala bandara (< 0,1 m); dokumentasi rumus pada kode |

## 9. Status Implementasi

- [x] plan.md
- [x] Skema Prisma + migrasi + seed data monitoring
- [x] Lib geo (koordinat), DXF parser, engine PCI
- [x] API monitoring lengkap
- [x] Menu Dashboard/Inspeksi/Marka/PCI + peta + DXF overlay + rectangle kerusakan
- [x] Build & smoke test

# Plan — Aplikasi Monitoring Fasilitas Airside (X-Airside Monitoring)

Dokumen ini adalah rencana pengembangan modul **monitoring fasilitas airside** yang dibangun **di atas aplikasi X-Airside Inspection Portal yang sudah berjalan** (digitalisasi checklist inspeksi Runway/Taxiway/Apron berbasis Excel). Modul baru menambahkan kemampuan pemetaan fasilitas, temuan kerusakan berbasis lokasi (koordinat Google & koordinat aerodrome), pemetaan kerusakan visual, monitoring marka, serta perhitungan **PCI (Pavement Condition Index) mode lanjutan**.

---

## 1. Ruang Lingkup Fitur

| Kode | Fitur | Deskripsi |
| :--- | :--- | :--- |
| **F1** | **Dashboard "Google Earth"** | Peta citra satelit interaktif (pan/zoom halus) menampilkan polygon fasilitas **Runway, Taxiway, Apron** beserta informasi **PCN/PCR, dimensi (panjang/lebar/luas), tipe perkerasan, status**, dan indikator **performance** (temuan terbuka, kondisi marka, PCI terakhir, status inspeksi). |
| **F2** | **Overlay file DXF** | Peta dapat **ditimpa file `.dxf`** hasil drawing bandara untuk *detailing station lokasi*. DXF di-parse (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, TEXT/MTEXT, POINT), digeoreferensikan dengan **titik acuan ARP + rotasi + skala**, ditampilkan sebagai layer yang bisa di-on/off, dan label TEXT (station) dipakai untuk mendeteksi nama station di sekitar titik temuan. |
| **F3** | **Temuan kerusakan berbasis koordinat** | Setiap temuan mencatat **dua sistem koordinat sekaligus**: koordinat Google (WGS84 lat/lng) dan **koordinat aerodrome** (grid lokal X=East, Y=North dalam meter dari ARP). Input dua arah: klik/pilih di peta, atau paste koordinat Google / koordinat lokal. |
| **F4** | **Pemetaan kerusakan visual (rectangle)** | Petugas **menggambar rectangle langsung di peta** (drag). Saat disimpan, sistem merekam otomatis ke database: **posisi (lat/lng & lokal), polygon rectangle, panjang, lebar, luasan (m²), jenis kerusakan, severity (L/M/H), station, status tindak lanjut**. Rectangle tampil berwarna sesuai severity (L=kuning, M=oranye, H=merah). |
| **F5** | **PCI mode lanjutan** | Data temuan/hasil survey diolah menjadi **PCI per segmen perkerasan** mengikuti prosedur **ASTM D6433**: sample unit, distress + severity + quantity/density, *deduct value*, koreksi *maximum Corrected Deduct Value (CDV)*, skor PCI 0–100 + rating kondisi, riwayat & tren per section. |
| **F6** | **Menu utama** | **Dashboard** · **Inspeksi** (portal checklist existing) · **Marka** (monitoring marka) · **PCI (mode lanjutan)**. |

---

## 2. Arsitektur & Teknologi

Dipilih agar konsisten dengan aplikasi existing (tanpa menambah infrastruktur baru):

| Komponen | Teknologi | Catatan |
| :--- | :--- | :--- |
| Frontend | **Next.js 16 (App Router) + React 19 + TypeScript** | Sama dengan project existing; halaman client component. |
| Styling | **Tailwind CSS 4 + lucide-react** | Konsisten dengan UI existing. |
| Peta | **Leaflet 1.9 + citra satelit Esri World Imagery** | Ringan, tanpa API key; tampilan satelit ala Google Earth; kontrol zoom/layer kustom. |
| Parser DXF | **Parser internal (`src/lib/dxf.ts`)** | Tanpa dependency eksternal; entity → JSON (satuan meter). |
| Koordinat | **`src/lib/geo.ts`** | Konversi dua arah WGS84 ↔ grid lokal aerodrome (local tangent plane, akurasi < 0,1 m pada skala bandara) + polygon (luas, point-in-polygon) + stationing runway. |
| Engine PCI | **`src/lib/pci.ts` + `src/lib/pci-data.ts`** | TypeScript murni; dataset deduct value ASTM D6433 (AS & JPCC) mudah dikalibrasi. |
| Backend API | **Next.js Route Handlers** | Pola sama dengan API inspeksi existing (`params: Promise<...>`). |
| Database | **Prisma + SQLite** (`DATABASE_URL=file:./dev.db`) | Skema diperluas dengan model monitoring. |
| Laporan | **ExcelJS** (existing) | Dipertahankan untuk ekspor checklist; lanjutan ekspor PCI menyusul. |

### Model Koordinat
- **ARP (Aerodrome Reference Point)** disimpan di tabel `AppConfig` (`arpLat`, `arpLng`) — dapat diubah lewat menu pengaturan.
- Grid lokal: **X = East (m), Y = North (m)** dari ARP, sumbu mengikuti **utara sejati**; konversi memakai panjang derajat lintang/bujur terkoreksi (series WGS84).
- Layer DXF memiliki konfigurasi sendiri (`refLat`, `refLng`, `rotationDeg`, `scale`) sehingga drawing CAD dapat diselaraskan ke citra satelit.

---

## 3. Desain Database (tambahan)

```
AppConfig (key, value)                  -- arpLat, arpLng, airportName, dst.
Facility  1---* Damage
Facility  1---* MarkingFinding
Facility  1---* PciSection 1---* PciSurvey
MapLayer  (layer DXF, berdiri sendiri)
```

| Model | Field kunci |
| :--- | :--- |
| `Facility` | code, name, type (RUNWAY/TAXIWAY/APRON), lengthM, widthM, areaSqm, surfaceType, **pcn**, **pcr**, bearingDeg, centroidLat/Lng, **polygonJson**, status, remarks |
| `MapLayer` | name, fileName, refLat, refLng, rotationDeg, scale, **entitiesJson** (hasil parse DXF), visible |
| `Damage` | facilityId?, **station**, **type** (jenis kerusakan), **severity (L/M/H)**, **lat, lng, localX, localY**, **rectJson** (4 titik), lengthM, widthM, **areaSqm**, photoUrl?, remarks?, status (OPEN/IN_PROGRESS/CLOSED), reportedBy? |
| `MarkingFinding` | facilityId?, markingType, condition (BAIK/PERLU_PERBAIKAN/USANG), station?, lat/lng?, localX/Y?, areaSqm?, remarks?, status |
| `PciSection` | facilityId?, name, surfaceType (ASPHALT/JPCP), totalAreaSqm, sampleUnitArea (default 225 m²), lastPci, lastSurveyAt |
| `PciSurvey` | sectionId, inspectorName?, surveyDate, **pci**, rating, **detailsJson** (per sample unit: distress, DV, maxCDV, PCI) |
| `AppConfig` | key-value (arpLat, arpLng, airportName) |

---

## 4. Rancangan Menu & Halaman

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ✈ X-Airside Monitoring   [ Dashboard ] [ Inspeksi ] [ Marka ] [ PCI ]   │
├───────────────────────────────────────────────────────────┬──────────────┤
│  PETA SATELIT (Leaflet + Esri World Imagery)              │ PANEL INFO   │
│  ▣ Polygon fasilitas (RWY/TWY/APRON) + label kode         │ ┌──────────┐ │
│  ▣ Overlay DXF (layer on/off, upload .dxf)                │ │Fasilitas │ │
│  ▣ Rectangle kerusakan (L/M/H) — klik utk detail          │ │PCN/PCR   │ │
│  ▣ Titik temuan marka                                     │ │Dimensi   │ │
│  [+] Gambar Kerusakan   [⬆ Timpa DXF]   [⚙ Koordinat]     │ │Performance│ │
│  Status bar: lat,lng (Google) · X,Y m (aerodrome)         │ └──────────┘ │
└───────────────────────────────────────────────────────────┴──────────────┘
KPI: Total Fasilitas · Temuan Terbuka (L/M/H) · Marka Perlu Perbaikan · PCI Terakhir
```

1. **Dashboard** (`/`) — peta + panel detail fasilitas (PCN/PCR, dimensi, tipe perkerasan, bearing, status, jumlah temuan, PCI terakhir) + KPI performance + daftar temuan + modals: *Upload DXF*, *Form Kerusakan* (auto-isi luasan/koordinat/station dari rectangle), *Pengaturan ARP*, *Kelola Fasilitas*.
2. **Inspeksi** (`/inspeksi`) — portal checklist existing (InspectorForm + SupervisorDashboard) dipindah utuh ke menu ini.
3. **Marka** (`/marka`) — inventaris & kondisi marka per fasilitas (threshold, centerline, TDZ, holding position, stand line, dst.), kondisi BAIK/PERLU_PERBAIKAN/USANG, station, opsional koordinat & luasan, daftar temuan + tindak lanjut.
4. **PCI (mode lanjutan)** (`/pci`) — manajemen section perkerasan → builder survey sample unit (distress ASTM D6433 + severity + quantity) → perhitungan PCI (server) → hasil per sample unit + PCI section + rating + riwayat.

## 5. Prosedur PCI Mode Lanjutan (ASTM D6433)

```
Input sample unit ──► density tiap distress ──► Deduct Value (kurva ASTM)
        │                                             │
        ▼                                             ▼
 quantity & severity (L/M/H)              max CDV (koreksi q/n, kurva F)
                                                      │
                                                      ▼
                              PCI sample unit = 100 − max CDV
                                                      │
                              PCI section = Σ (PCI unit × luas unit)/Σ luas
```
- **Rating**: 86–100 Excellent · 71–85 Very Good · 56–70 Good · 41–55 Fair · 26–40 Poor · 11–25 Very Poor · 0–10 Failed.
- Distress ASPHALT (18) & JPCC (16) tersedia pada `src/lib/pci-data.ts`; **kurva deduct dapat dikalibrasi** tanpa mengubah engine.

## 6. Alur Kerja

```
[Upload DXF + set ARP/rotasi] ──► [Dashboard: overlay + detailing station]
        │
        ▼ (patroli lapangan)
[Inspeksi checklist existing]        [Gambar rectangle kerusakan di peta]
        │                                     │
        ▼                                     ▼
[Approval supervisor]                [DB: posisi, koordinat, luasan, jenis, severity]
                                              │
                                              ▼
                              [Marka: monitoring kondisi marka]
                                              │
                                              ▼
                              [PCI lanjutan: survey sample unit → skor & rating]
```

## 7. Tahapan Implementasi (mapping file)

| Tahap | Isi | File |
| :--- | :--- | :--- |
| 1 | Skema DB + migrasi + seed | `prisma/schema.prisma`, `prisma/seed.ts` |
| 2 | Lib geo/DXF/PCI/constants | `src/lib/geo.ts`, `src/lib/dxf.ts`, `src/lib/pci-data.ts`, `src/lib/pci.ts`, `src/lib/constants.ts` |
| 3 | REST API monitoring | `src/app/api/{config,facilities,map-layers,damages,markings,pci/*}` |
| 4 | Shell & Dashboard + peta | `src/components/AppShell.tsx`, `DashboardView.tsx`, `FacilityMap.tsx`, `DamageFormModal.tsx`, `DxfUploadModal.tsx` |
| 5 | Menu Marka & PCI | `src/components/MarkaView.tsx`, `PciView.tsx` |
| 6 | Routing halaman | `src/app/page.tsx`, `src/app/{inspeksi,marka,pci}/page.tsx`, `layout.tsx` |
| 7 | Validasi | migrate → seed → `next build` → smoke test API & UI |

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
| :--- | :--- |
| Kurva deduct ASTM belum persis standar | Data terpisah di `pci-data.ts`, mudah dikalibrasi; prosedur DV→CDV→PCI sesuai ASTM |
| Georeferencing DXF meleset | Konfigurasi ref point/rotasi/skala per layer + verifikasi visual terhadap citra satelit |
| DXF besar → berat render | Parser membatasi jumlah entity, filter per layer, render polyline sederhana |
| Citra satelit butuh internet | Basemap tetap berfungsi tanpa tile (polygon+DXF), koordinat lokal tidak bergantung tile |
| Akurasi konversi koordinat | Local tangent plane cukup untuk skala bandara (< 0,1 m); dokumentasi rumus pada kode |

## 9. Status Implementasi

- [x] plan.md
- [x] Skema Prisma + migrasi + seed data monitoring
- [x] Lib geo (koordinat), DXF parser, engine PCI
- [x] API monitoring lengkap (config, facilities, map-layers, damages, markings, pci)
- [x] Menu Dashboard/Inspeksi/Marka/PCI + peta + DXF overlay + rectangle kerusakan
- [x] Build berhasil (17 halaman, 14 API endpoint)
- [x] Seed data monitoring (facilities, damages, markings, PCI section + survey)


---
