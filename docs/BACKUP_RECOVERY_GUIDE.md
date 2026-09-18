# 📦 Backup & Recovery System - X-AIRSIDE

## Overview

Fitur Backup & Recovery memungkinkan admin dan superadmin untuk membuat backup data dan melakukan restore dari backup sebelumnya.

### Fitur Utama

#### ✅ Untuk ADMIN (Per Airport)
- Backup data khusus bandara mereka
- Include: Inspections, Damages, Markings, PCI Surveys, Facilities, Map Layers
- Format pilihan: JSON atau PostgreSQL dump
- Optional: Include damage photos
- Download backup file (ZIP)
- Restore data dengan pilihan Replace atau Merge mode
- View history backup dengan storage info

#### ✅ Untuk SUPADMIN (Full System)
- Backup seluruh sistem data
- Include: All airports, users, facilities, inspections, damages, markings, PCI, map layers
- Include: Semua damage photos
- Format pilihan: JSON atau PostgreSQL dump
- Filter backup per airport
- Advanced restore dengan validation
- Full audit log

---

## Menu & Navigation

### Akses Menu
1. Login ke aplikasi
2. Klik menu **Admin** (Settings icon) di navigation bar
3. Di sidebar, klik **Backup & Recovery** (Database icon)

### URL Langsung
```
http://localhost:2026/admin/backup-recovery
```

---

## Fitur Backup

### 1. Create Backup

**Location:** Admin > Backup & Recovery > Tab "Create Backup"

**Langkah-langkah:**
1. Pilih format backup:
   - **JSON (Recommended)**: Mudah diedit, human-readable, cocok untuk backup rutin
   - **PostgreSQL Dump**: Format SQL native, cocok untuk disaster recovery

2. Centang "Include damage photos" jika ingin include foto kerusakan
   - Backup akan lebih besar tapi data lengkap

3. Klik tombol **Download Backup**

4. File akan di-download dalam format ZIP:
   ```
   xairside-backup-[AIRPORT_CODE]-[DATE]-[with-photos].zip
   ```

### 2. Struktur File Backup

Setiap backup ZIP berisi:

```
backup.zip
├── metadata.json          # Info backup (version, timestamp, data count)
├── data.json              # Seluruh data terstruktur
└── photos/                # (Optional) Damage photos
    └── [damage-photo-uuid].jpg
```



---

## Fitur Restore

### 1. Upload & Restore

**Location:** Admin > Backup & Recovery > Tab "Restore Data"

**Langkah-langkah:**
1. Klik **Select Backup File**
2. Pilih file .zip dari backup sebelumnya
3. Pilih **Restore Mode**:
   - **Replace**: Hapus data existing dan restore dari backup (Fresh restore)
   - **Merge**: Gabung data backup dengan data existing

4. Review file info (nama, ukuran)

5. Klik **Restore Backup**

6. Tunggu proses selesai

### 2. Backup History

**Location:** Admin > Backup & Recovery > Tab "Backup History"

**Informasi:**
- File name, ukuran, format
- Status, tanggal dibuat
- Total storage used
- Delete old backups

---

## Use Cases

### Scenario 1: Routine Daily Backup (Admin)
1. Masuk ke Backup & Recovery
2. Pilih JSON format, uncheck photos
3. Download backup setiap hari
4. Simpan di local/cloud storage

### Scenario 2: Full Backup Before Changes
1. Create full backup WITH photos
2. Store di secure location
3. Lakukan perubahan data
4. Restore jika ada issue

### Scenario 3: Disaster Recovery (SUPADMIN)
1. Database corrupted
2. Restore dari backup terbaru
3. Pilih mode REPLACE
4. Verify data integrity

---

## Technical Details

### API Endpoints

**Create Backup:**
```http
POST /api/backup
Content-Type: application/json

{
  "backupType": "AIRPORT|FULL_SYSTEM",
  "airportId": "uuid-xxx",
  "format": "JSON|SQL",
  "includePhotos": true|false
}
```

**Restore Backup:**
```http
POST /api/restore
Content-Type: multipart/form-data

FormData:
- file: [backup.zip]
- backupType: "AIRPORT|FULL_SYSTEM"
- airportId: "uuid-xxx"
- mergeMode: "REPLACE|MERGE"
```

**History:**
```http
GET /api/backup/history?backupType=AIRPORT&airportId=uuid-xxx&limit=50
DELETE /api/backup/history?id=backup-id
```

---

## Access Control

| Action | ADMIN | SUPADMIN |
|--------|-------|----------|
| Backup own airport | ✅ | ❌ |
| Backup all airports | ❌ | ✅ |
| Restore own airport | ✅ | ❌ |
| Restore all airports | ❌ | ✅ |
| View history | ✅ | ✅ |
| Delete backups | ✅ | ✅ |

---

## Best Practices

✅ **DO's:**
- Backup regularly (min 1x/week for production)
- Test restore procedures
- Include photos for audit trail
- Archive old backups
- Encrypt stored backups

❌ **DON'Ts:**
- Don't restore without clear backup point
- Don't delete backups without verification
- Don't share backup files unencrypted
- Don't store backups in single location

---

## Files Created

**Backend:**
- `/src/lib/backup-service.ts` - Backup logic service
- `/src/app/api/backup/route.ts` - Backup creation API
- `/src/app/api/restore/route.ts` - Restore API
- `/src/app/api/backup/history/route.ts` - History & delete API

**Frontend:**
- `/src/components/backup-recovery/backup-recovery-page.tsx` - Main page
- `/src/components/backup-recovery/create-backup-tab.tsx` - Create tab
- `/src/components/backup-recovery/restore-backup-tab.tsx` - Restore tab
- `/src/components/backup-recovery/backup-history-tab.tsx` - History tab

**Database:**
- `prisma/schema.prisma` - Added BackupLog model
- Updated User & Airport models with backupLogs relation

---

**Version:** 1.0 | **Last Updated:** 2026-09-17

**Contoh metadata.json:**
```json
{
  "version": "1.0",
  "timestamp": "2026-09-17T09:24:00.061Z",
  "backupType": "AIRPORT",
  "airportId": "uuid-xxx",
  "airportCode": "RHF",
  "includePhotos": true,
  "format": "JSON",
  "dataCount": {
    "inspections": 45,
    "damages": 128,
    "markings": 67,
    "pciSurveys": 12,
    "facilities": 8,
    "mapLayers": 3
  }
}
```
