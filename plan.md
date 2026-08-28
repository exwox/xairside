# Rencana Digitalisasi Laporan Checklist Inspeksi Airside (Runway, Taxiway, Apron)

Dokumen ini menjelaskan rencana pengembangan aplikasi berbasis web untuk digitalisasi checklist inspeksi airside yang sebelumnya menggunakan file Excel (.xlsx). Aplikasi ini dirancang agar responsif (mendukung perangkat mobile) dan dapat menghasilkan output laporan yang formatnya sama persis dengan template Excel siap cetak.

---

## 1. Arsitektur & Teknologi Terpilih

Untuk mencapai performa optimal, kemudahan pengembangan, serta pemenuhan kebutuhan mobile-friendly dan cetak laporan yang presisi, berikut adalah rekomendasi *tech stack*:

| Komponen | Teknologi | Alasan Pemilihan |
| :--- | :--- | :--- |
| **Frontend** | React (Next.js) + Tailwind CSS | Responsif (Mobile-first), mendukung rendering sisi server (SSR) untuk kecepatan, serta Tailwind memudahkan penyesuaian layout cetak (`@media print`). |
| **UI Library** | shadcn/ui / Flowbite + Lucide | Menyediakan komponen UI modern yang ramah perangkat seluler dan mudah disesuaikan. |
| **Backend API** | Node.js (Express) atau Laravel | Tangguh, cepat, dan memiliki library yang sangat baik untuk memanipulasi & menghasilkan file Excel. |
| **Database** | PostgreSQL / MySQL | Relasional, cocok untuk struktur data checklist yang memiliki relasi antara jadwal, item inspeksi, temuan, dan tanda tangan digital. |
| **Excel & PDF Generator** | **ExcelJS** (JS) atau **PhpSpreadsheet** (PHP) | Mampu memuat template `.xlsx` yang sudah ada, mengisi data dinamis ke dalamnya, mempertahankan formatting (border, warna, font, merger cell), lalu mengunduhnya. |

---

## 2. Fitur Utama Aplikasi

### A. Tampilan Mobile (Mobile-Friendly Inspection Form)
*   **Akses Lapangan**: Dioptimalkan untuk layar smartphone/tablet agar memudahkan petugas saat berjalan melakukan inspeksi di Runway, Taxiway, dan Apron.
*   **Form Inspeksi Interaktif**: Pengisian checklist menggunakan pilihan cepat (contoh: *Baik / Rusak / Tidak Ada / N/A*).
*   **Upload Foto Temuan**: Integrasi kamera handphone untuk memotret langsung temuan kerusakan (misal: *pothole*, *FOD*, lampu runway mati) dan memberikan catatan koordinat/lokasi.
*   **Draft & Auto-Save**: Fitur untuk menyimpan progress pengisian sementara secara lokal (*local storage*) guna mencegah hilangnya data akibat kendala sinyal di area airside.

### B. Dasbor Pemantauan (Web Desktop View)
*   **Ringkasan Status**: Statistik temuan hari ini, status kelayakan airside, dan tren kerusakan.
*   **Manajemen Inspeksi**: List inspeksi yang telah selesai, sedang berjalan (draft), atau membutuhkan verifikasi/approval dari supervisor.
*   **Verifikasi / Approval**: Supervisor dapat meninjau temuan, memberikan catatan perbaikan, serta memberikan tanda tangan digital (*e-signature*).

### C. Ekspor & Cetak Laporan (Presisi Excel)
*   **Ekspor Excel (.xlsx)**: Sistem akan membaca file template Excel asli yang biasa digunakan, menyuntikkan data hasil inspeksi ke cell-cell yang sesuai, dan menyajikannya sebagai file download yang siap cetak tanpa merusak formatting aslinya.
*   **Fitur "Siap Cetak" (Print-Ready)**: Layout HTML versi desktop akan dilengkapi dengan CSS `@media print` sehingga saat ditekan tombol "Cetak PDF" dari browser, hasilnya rapi, presisi, pas satu halaman (atau halaman terstruktur), tanpa terpotong.

---

## 3. Desain Database (Skema Relasional)

Berikut adalah rancangan tabel utama untuk menyimpan data inspeksi:

```
+--------------------+       +-------------------------+       +------------------------+
|       users        |       |       inspections       |       |   inspection_details   |
+--------------------+       +-------------------------+       +------------------------+
| - id (PK)          |       | - id (PK)               |       | - id (PK)              |
| - name             |1     *| - date                  |1     *| - inspection_id (FK)   |
| - email            +-------> - inspector_id (FK)     +-------> - item_id (FK)         |
| - password_hash    |       | - supervisor_id (FK)    |       | - status (Baik/Rusak)  |
| - role (Admin/     |       | - status (Draft/        |       | - remarks (catatan)    |
|   Inspector/Super) |       |   Submitted/Approved)   |       | - photo_url            |
+--------------------+       +-------------------------+       +------------------------+
                                                                            ^
                                                                            | *
                                                               +------------+-----------+
                                                               |    inspection_items    |
                                                               +------------------------+
                                                               | - id (PK)              |
                                                               | - zone (Runway/Taxiway/|
                                                               |   Apron)               |
                                                               | - item_name            |
                                                               | - category             |
                                                               +------------------------+
```

---

## 4. Alur Kerja (Workflow) Aplikasi

```
[Mulai Inspeksi] 
       │
       ▼ (Petugas Lapangan - Mobile)
[Isi Checklist Runway, Taxiway, Apron] ──► (Unggah foto & catat temuan jika ada)
       │
       ▼
[Kirim Laporan (Status: Submitted)]
       │
       ▼ (Supervisor - Desktop/Mobile)
[Review & Validasi Temuan] ──► (Opsional: Tambahkan catatan/perintah kerja)
       │
       ▼
[Approval & Tanda Tangan Digital] (Status: Approved)
       │
       ▼
[Ekspor ke Excel / Cetak PDF] ──► (Laporan akhir persis template Excel asli siap cetak)
```

---

## 5. Rencana Tahapan Pengembangan (Roadmap)

### Tahap 1: Inisiasi & Analisis Dokumen (Minggu 1)
*   Mengumpulkan template file Excel asli untuk Runway, Taxiway, dan Apron.
*   Pemetaan setiap sel (cell mapping) pada Excel ke dalam struktur database.
*   Pembuatan mockup UI/UX khusus mobile untuk pengisian formulir dan desktop untuk cetak/verifikasi.

### Tahap 2: Setup Project & Database (Minggu 2)
*   Inisialisasi repositori project.
*   Pembuatan skema database dan migrasi.
*   Setup autentikasi pengguna (JWT/Session-based).


### Tahap 3: Pengembangan Form Mobile (Minggu 3-4)
*   Pembuatan halaman form dinamis untuk Runway, Taxiway, dan Apron.
*   Fitur upload gambar temuan (simpan ke Cloud Storage seperti S3 atau lokal folder).
*   Implementasi sistem auto-save menggunakan *Local Storage* browser.

### Tahap 4: Pengembangan Dashboard & Engine Ekspor Excel (Minggu 5-6)
*   Pembuatan dasbor supervisor untuk memantau status inspeksi.
*   Integrasi library **ExcelJS** / **PhpSpreadsheet** untuk membaca template `.xlsx`, menyisipkan data transaksi, serta menyimpannya kembali sebagai file siap unduh.
*   Optimasi CSS cetak halaman agar hasil print dari browser langsung rapi.

### Tahap 5: Pengujian (Testing) & Deployment (Minggu 7)
*   Pengujian fungsionalitas di berbagai ukuran layar handphone (iOS dan Android).
*   Pengujian ekspor file Excel dan verifikasi apakah format cetak sudah sama persis dengan yang lama.
*   Deployment ke server produksi (menggunakan Docker/VPS) dan konfigurasi SSL/domain.

---

## 6. Contoh Implementasi Ekspor Excel (Node.js/ExcelJS)

Sebagai gambaran teknis, berikut potongan kode sederhana bagaimana aplikasi akan mengisi data ke dalam file template Excel yang sudah ada tanpa merusak layout:

```javascript
const ExcelJS = require('exceljs');

async function generateReport(inspectionData) {
  const workbook = new ExcelJS.Workbook();
  // Membaca file template excel yang sudah ada format cetaknya
  await workbook.xlsx.readFile('./templates/template_inspeksi_airside.xlsx');
  
  const worksheet = workbook.getWorksheet('Runway');
  
  // Mengisi cell dinamis berdasarkan data dari database
  worksheet.getCell('C4').value = inspectionData.date;
  worksheet.getCell('C5').value = inspectionData.inspectorName;
  
  // Mengisi baris tabel checklist secara dinamis
  inspectionData.items.forEach((item, index) => {
    const rowNumber = 10 + index; // Contoh baris tabel dimulai dari baris ke-10
    worksheet.getCell(`D${rowNumber}`).value = item.status;
    worksheet.getCell(`E${rowNumber}`).value = item.remarks;
  });

  // Menyimpan file baru hasil generate yang siap didownload/diprint
  await workbook.xlsx.writeFile(`./exports/Laporan_Inspeksi_${inspectionData.date}.xlsx`);
}
```

---

*Catatan: Struktur detail dari template Excel asli Anda (seperti jumlah kolom, nama item checklist, dan posisi logo) akan langsung diintegrasikan pada Tahap 1 pengembangan.*

