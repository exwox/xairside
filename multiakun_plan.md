# Rencana akun dan data multi bandara

## Tujuan

Satu instalasi X-Airside melayani banyak bandara. Setiap akun terikat pada satu bandara, kecuali **SUPADMIN** yang dapat mengelola semua bandara. Data satu bandara tidak boleh terlihat atau berubah melalui akun bandara lain, termasuk ketika pengguna memanggil API secara langsung.

Dokumen ini adalah rencana implementasi. Perubahan akun, hak akses, dan migrasi data belum dijalankan.

## Kondisi aplikasi saat ini

- `User` sudah ada di Prisma, tetapi belum ada login atau sesi. Peran yang tersimpan masih `INSPECTOR` dan `SUPERVISOR` untuk alur Inspeksi. Halaman Inspeksi memakai pengalih peran di browser; API membuat dan menyetujui inspeksi dengan memilih akun seed berdasarkan peran.
- Fasilitas, kerusakan, marka, peta DXF, section/survei PCI, inspeksi, dan konfigurasi belum mempunyai `airportId`. Daftar dari API saat ini dapat memuat data seluruh instalasi.
- `AppConfig` memakai kunci global, termasuk nama bandara, ARP, pengaturan peta, katalog kerusakan, serta kurva DV/CDV. Pengaturan tersebut harus dipisah per bandara.
- Foto kerusakan berada di `public/uploads`; URL publik tidak dapat dijadikan batas akses antarbandara.
- Kode fasilitas saat ini unik secara global. Dalam sistem multi bandara, dua bandara perlu bisa sama-sama memiliki kode seperti `RWY`.

## Aturan peran

| Kemampuan | SUPADMIN | ADMIN | USER | VIEWER |
| --- | --- | --- | --- | --- |
| Melihat Dashboard | Semua bandara | Bandara sendiri | Bandara sendiri | Bandara sendiri |
| Melihat menu Inspeksi, Kerusakan, Marka, PCI | Semua bandara | Bandara sendiri | Bandara sendiri | Tidak |
| Membuat atau mengubah inspeksi dan temuan | Semua bandara | Bandara sendiri | Bandara sendiri | Tidak |
| Menyetujui inspeksi | Semua bandara | Bandara sendiri | Tidak | Tidak |
| Mengunduh laporan dari menu kerja | Semua bandara | Bandara sendiri | Bandara sendiri | Tidak |
| Membuka Admin Panel dan mengelola fasilitas, peta, ARP, katalog, kurva PCI | Semua bandara | Bandara sendiri | Tidak | Tidak |
| Mengelola akun USER dan VIEWER | Semua bandara | Bandara sendiri | Tidak | Tidak |
| Membuat ADMIN atau SUPADMIN | Ya | Tidak | Tidak | Tidak |
| Membuat, mengubah, atau menonaktifkan bandara | Ya | Tidak | Tidak | Tidak |

**Asumsi implementasi:** satu akun ADMIN/USER/VIEWER hanya berada pada satu bandara. SUPADMIN memilih bandara aktif ketika bekerja, dengan konteks bandara yang jelas di URL dan tampilan. Hak persetujuan inspeksi diberikan kepada ADMIN dan SUPADMIN; tombol pengalih `INSPECTOR/SUPERVISOR` di halaman Inspeksi diganti dengan hak akses dari akun yang sedang login.

VIEWER hanya mendapat halaman Dashboard. API baca yang diperlukan Dashboard tetap boleh dipanggil untuk bandara sendiri, tetapi halaman kerja, rincian yang tidak dipakai Dashboard, unduhan laporan, dan seluruh mutasi ditolak. Menyembunyikan tombol atau menu saja tidak dianggap sebagai pengamanan.

## Model data yang dituju

1. Tambahkan `Airport`: `id`, `code` unik, `name`, `timezone`, status aktif, waktu pembuatan/perubahan. Simpan identitas lokasi dan ARP milik bandara, bukan sebagai satu nilai global.
2. Ubah `User`: `role` menjadi `SUPADMIN | ADMIN | USER | VIEWER`, tambah `airportId` (wajib untuk selain SUPADMIN), `isActive`, dan metadata keamanan akun. Email tetap unik untuk login. SUPADMIN tidak terikat pada satu `airportId`.
3. Tambahkan `Session` untuk sesi server yang dapat kedaluwarsa dan dicabut. Simpan hanya hash token sesi di database; cookie menyimpan token acak yang aman.
4. Tambahkan `airportId` ke akar data bandara: `Facility`, `Damage`, `MarkingFinding`, `MapLayer`, `PciSection`, `PciSurvey`, dan `Inspection`. `InspectionDetail` mengikuti `Inspection`; relasi section/survei dan fasilitas/temuan harus konsisten dengan `airportId` yang sama. `airportId` langsung pada kerusakan, marka, dan section tetap diperlukan saat `facilityId` kosong.
5. Pindahkan konfigurasi dari `AppConfig` global menjadi konfigurasi per bandara, misalnya `AirportConfig` dengan kunci unik `(airportId, key)`. Nama bandara, ARP, rotasi peta, interval STA, katalog kerusakan, dan kurva DV/CDV termasuk di dalamnya. `InspectionItem` dapat tetap menjadi template global yang hanya dibaca; inspeksi hasil pengisian selalu milik satu bandara.
6. Ubah keunikan `Facility.code` menjadi `(airportId, code)`. Tambahkan indeks `airportId` pada tabel yang sering difilter. Gunakan relasi atau validasi transaksi untuk menolak `facilityId`, `sectionId`, atau `groupId` dari bandara berbeda.
7. Simpan berkas foto di lokasi privat menurut bandara, misalnya `uploads/<airportId>/...`, lalu sajikan melalui route yang memeriksa sesi dan kepemilikan. Migrasikan URL foto lama tanpa menghilangkan relasi ke temuan.

Bandara yang mempunyai data tidak dihapus langsung; gunakan status nonaktif agar riwayat dan relasi tetap utuh.

## Login dan otorisasi

- Buat halaman login/logout dan sesi menggunakan cookie `HttpOnly`, `Secure` pada HTTPS, serta `SameSite=Lax`. Simpan kata sandi sebagai hash kuat; jangan memakai atau menanamkan kata sandi contoh dari seed saat produksi.
- Pada setiap request, server mengambil pengguna dari sesi aktif, memeriksa `isActive`, peran, dan bandara. Sesi dicabut ketika akun dinonaktifkan atau perannya/bandaranya berubah. Batasi percobaan login dan periksa asal request untuk operasi yang mengubah data.
- Buat fungsi server terpusat seperti `requireSession()`, `requireRole(...)`, dan `requireAirportAccess(airportId)`. Semua route API, unduhan, foto, dan proses turunan memakai fungsi yang sama. Permintaan tanpa sesi menghasilkan 401; peran yang tidak berhak 403; ID data bandara lain dijawab 404 agar keberadaan data tidak terungkap.
- Bandara aktif SUPADMIN dipilih secara eksplisit, misalnya lewat URL `/bandara/[code]/...` dan route API yang membawa identitas bandara. Server tetap memvalidasi pilihan itu; `airportId` dari body/header/query tidak boleh menjadi sumber hak akses untuk ADMIN/USER/VIEWER.
- Query daftar selalu memakai filter `airportId` di server. Query berdasarkan ID mengambil record bersama bandara pemiliknya sebelum membaca atau mengubah. Operasi berkelompok, penghapusan, perubahan geometri, pemecahan kerusakan, dan ekspor harus mempertahankan filter yang sama sampai ke setiap query di dalam transaksi.
- Menu dan tombol mengikuti izin akun untuk pengalaman pengguna, sedangkan keputusan akhir tetap di API/server. Perubahan URL, payload, atau tombol melalui DevTools tidak boleh meningkatkan hak akses.

## Cakupan perubahan aplikasi

| Area | Pekerjaan |
| --- | --- |
| Navigasi | Tampilkan menu sesuai peran; tampilkan nama akun dan bandara aktif; sediakan pemilih bandara hanya untuk SUPADMIN. Lindungi halaman jika URL dibuka langsung. |
| Dashboard | Batasi fasilitas, kerusakan, marka, layer peta, statistik, dan PCI ke bandara aktif. VIEWER mendapat tampilan baca saja tanpa aksi tambah/edit/hapus. |
| Admin Panel | ADMIN hanya dapat mengubah fasilitas dan pengaturan bandara sendiri. SUPADMIN dapat mengelola bandara dan ADMIN. ADMIN hanya dapat mengelola USER/VIEWER pada bandara sendiri. |
| Inspeksi | Tambahkan `airportId`; penulis berasal dari sesi, bukan akun seed pertama. Persetujuan memakai akun yang login dan izin ADMIN/SUPADMIN. Ekspor Excel dibatasi ke bandara pemilik inspeksi. |
| Kerusakan dan Marka | Filter daftar/detail, pembuatan, edit, hapus, status, grup kerusakan, geometri, dan foto menurut bandara. Hubungan dengan fasilitas harus berada pada bandara yang sama. |
| PCI | Filter section, survei, perhitungan, koreksi PCI, PDF, katalog, serta kurva per bandara. Perubahan kurva oleh ADMIN tidak mengubah hasil bandara lain. |
| Peta dan foto | DXF/layer dan file foto hanya tersedia untuk bandara yang berhak. Route berkas memeriksa sesi; nama file atau URL tidak boleh memberi akses lintas bandara. |
| API | Audit seluruh route di `src/app/api` termasuk GET, POST, PATCH/PUT, DELETE, ekspor, upload, dan penghapusan file. Validasi izin sebelum membaca/memutasi data. |

## Migrasi data yang sudah ada

1. Cadangkan database serta direktori foto sebelum migrasi. Catat jumlah record per tabel dan contoh relasi agar dapat dibandingkan setelah migrasi.
2. Buat satu `Airport` untuk data instalasi saat ini berdasarkan konfigurasi yang ada. Seluruh fasilitas, kerusakan termasuk yang belum terhubung ke fasilitas, marka, layer peta, section/survei PCI, dan inspeksi lama dipetakan ke bandara ini.
3. Salin nilai `AppConfig` ke konfigurasi bandara tersebut. Pertahankan default kurva/katalog untuk bandara baru, lalu izinkan penyesuaian per bandara.
4. Pertahankan akun dan relasi historis Inspeksi, tetapi nonaktifkan akun seed lama sampai peran dan sandinya ditetapkan ulang. Jangan menaikkan `SUPERVISOR` lama otomatis menjadi ADMIN. Buat SUPADMIN pertama melalui prosedur bootstrap satu kali dengan sandi yang ditentukan di luar kode sumber.
5. Setelah jumlah dan relasi cocok, ubah `airportId` menjadi wajib, pasang indeks/kendala, dan aktifkan route dengan filter bandara. Jangan membuka akses multi bandara saat masih ada route yang belum difilter.
6. Migrasikan file foto dan verifikasi URL lama masih membuka foto hanya bagi akun bandara pemiliknya. Sediakan langkah pemulihan dari cadangan bila pemeriksaan gagal.

## Urutan implementasi

1. **Fondasi data:** model `Airport`, kunci bandara pada data, konfigurasi per bandara, migrasi data lama, dan kendala relasi/indeks.
2. **Akun dan sesi:** login/logout, hash sandi, sesi, bootstrap SUPADMIN, pengelolaan akun, dan penggantian pengalih peran Inspeksi.
3. **Penjagaan server:** fungsi izin terpusat, filter semua route API dan ekspor, pembatasan upload/foto, serta penolakan ID lintas bandara.
4. **Antarmuka:** menu menurut peran, pemilih bandara SUPADMIN, halaman pengelolaan bandara/akun, dan mode Dashboard baca saja untuk VIEWER.
5. **Migrasi dan uji penerimaan:** jalankan pada salinan data, periksa isolasi dua bandara, baru terapkan ke data aktif dengan cadangan dan pemeriksaan pascamigrasi.

## Uji penerimaan wajib

- Buat Bandara A dan B, masing-masing memiliki fasilitas berkode `RWY`. ADMIN A hanya melihat dan mengubah data A; ADMIN B hanya data B. SUPADMIN dapat memilih dan mengelola keduanya.
- USER A dapat menambah/mengubah temuan, marka, inspeksi, dan PCI A, tetapi tidak membuka Admin Panel atau menyetujui inspeksi. VIEWER A hanya dapat membuka Dashboard A dan tidak dapat mengirim mutasi API apa pun.
- Ubah `airportId`, `facilityId`, `sectionId`, ID temuan, dan ID inspeksi dalam URL/body menjadi milik B saat login sebagai akun A: baca, ubah, hapus, ekspor, dan foto semuanya ditolak. Operasi grup kerusakan dan pemecahan geometri juga tidak menyentuh data B.
- Pengaturan ARP, layer DXF, katalog/kurva DV-CDV, serta PCI Koreksi yang diubah di A tidak mengubah tampilan atau perhitungan B.
- Akun yang dinonaktifkan atau dipindah peran tidak dapat melanjutkan akses dengan sesi lama. Percobaan login dengan sandi salah tidak membuka data.
- Setelah migrasi, jumlah data historis per tabel tetap cocok, semua record lama berada di bandara awal, inspeksi lama masih dapat dibaca oleh akun yang berhak, dan foto lama tetap dapat diakses secara terbatas.

## Keputusan awal untuk pelaksanaan

- Empat peran aplikasi: `SUPADMIN`, `ADMIN`, `USER`, `VIEWER`.
- Satu akun non-SUPADMIN terikat ke satu bandara. Jika kelak satu orang perlu akses ke beberapa bandara, perlu model keanggotaan tambahan; jangan memakai bandara pilihan dari browser sebagai pengganti otorisasi.
- ADMIN mengelola akun USER/VIEWER setempat. Hanya SUPADMIN yang dapat membuat atau menaikkan akun menjadi ADMIN/SUPADMIN.
- Template checklist Inspeksi tetap global; hasil inspeksi dan persetujuannya terikat bandara.
- Sistem tetap dapat memakai SQLite untuk tahap awal. Sebelum pemakaian serentak lintas banyak bandara, evaluasi kebutuhan database server, cadangan terjadwal, dan pemantauan operasi.
