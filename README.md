# RISE — Real-time Industrial System for Excellence

Production Monitoring System for Garment Manufacturing.

Aplikasi web single-page untuk memantau produksi tiap line sewing: efisiensi,
output, breakdown proses & SMV, skill matrix operator, hingga forecast target
— real-time dan bisa ditelusuri ke tanggal-tanggal sebelumnya.

> ⚠️ **Catatan**: README ini disusun ulang dari nol berdasarkan seluruh fitur
> yang sudah dibangun sampai sesi terakhir. Kalau kamu punya `readme.md`
> versi lama dengan catatan lain (mis. histori keputusan desain yang tidak
> tercermin di sini), gabungkan manual — file ini tidak menggantikan catatan
> yang belum sempat dibagikan ke sesi ini.

---

## Tech Stack

- **Frontend**: Single file `index.html` (vanilla JS, tanpa framework/build step) + `styles.css` terpisah.
- **Chart**: [Chart.js](https://www.chartjs.org/) (CDN)
- **Export Excel**: [SheetJS/xlsx](https://sheetjs.com/) (CDN)
- **Export gambar** (Skill Matrix): [html2canvas](https://html2canvas.hertzen.com/) (CDN)
- **Backend**: Vercel Serverless Functions (Node.js) di folder `/api`
- **Database & Auth**: [Supabase](https://supabase.com/) (Postgres + Auth)
- **Hosting**: Vercel (Hobby plan — perhatikan limit 12 Serverless Function per deployment, lihat [Catatan Vercel](#catatan-limit-serverless-function-vercel))

---

## Role & Akses

| Role | Akses |
|---|---|
| **IE / Superadmin** | Semua tab: Dashboard, Variabel Line (Setup + Order/Style), Operational Breakdown, Skill Matrix, Data Produksi, Kelola User. Bisa lihat angka konfidensial (Mesin, MC Shift, Productivity, Contribution). |
| **Supervisor** | Input qty produksi harian per line, lihat dashboard line-nya. |
| **Tamu** | Read-only — dashboard, Detail Line, Skill Matrix per line. Tidak bisa lihat angka konfidensial. |

---

## Fitur Utama

### Dashboard
- KPI cards: Output Aktual, Target Harian Penuh, **BLC Produksi** (Output − Target, minus = kurang dari target), Rata-rata Efisiensi, Hadir/Tidak Hadir, (khusus IE: Total Mesin, MC Shift), Rata-rata Productivity, Contribution.
- **Top 3 Line** — papan peringkat ala podium (🥇🥈🥉) berdasarkan Efisiensi tertinggi; kalau seri, Output Aktual lebih besar yang menang.
- **Navigasi tanggal historis**: toggle Harian/Mingguan/Bulanan + tombol ‹ › + date picker + tombol "Hari Ini" — bisa lihat kondisi dashboard di tanggal manapun di masa lalu, tidak cuma hari ini.
- Chart: Tren Output vs Target (garis), Efisiensi per Line (bar, bisa digeser horizontal kalau line-nya banyak), Ringkasan Status (donut), MC Shift & Productivity per line (khusus IE).
- Andon grid per line — warna status (Baik/Waspada/Kritis/Belum Update), beda kartu untuk line Assembly vs Preparation (garis putus-putus).
- Sidebar navigasi khusus mobile untuk tab-tab di Tampilan IE (buka-tutup lewat tombol hamburger).

### Halaman Detail Line
- Klik salah satu kartu line di dashboard → halaman detail lengkap: hero card status, info Supervisor, Qty Order/Plan Start/Plan Finish/Delivery Date/SMV/MP/Jam Kerja/Jam Mulai Shift.
- **Forecast Target** — Target Harian/Mingguan/Bulanan dihitung dari kapasitas line saat ini (SMV/MP/Jam Kerja), **tidak terikat Plan Finish** (supaya tetap valid walau style berganti di tengah bulan). Asumsi 6 hari kerja/minggu (Minggu libur).
- **Detail Proses** — breakdown No. Proses/Nama Proses/SMV/Nama Operator/Nama Mesin untuk style yang sedang berjalan, plus ringkasan Total SMV per Operator.
- Tombol **"Lihat Skill Matrix Line"** → grid kompetensi operator × proses (khusus style yang berjalan), bisa **di-export jadi gambar PNG**.

### Variabel Line (tab IE)
Dipecah jadi beberapa bagian:
1. **Setup Line** — data fisik yang **ditimpa** tiap disimpan (1 baris aktif per line): MP, Jam Kerja, Jam Mulai Shift, Jumlah Mesin, Jenis Line (Assembly/Preparation), Catatan.
2. **Order/Style** — data order yang **punya riwayat** (baris baru tiap kombinasi Line+Style+Plan Start berbeda): Style, SMV, Qty Order, Plan Start, Plan Finish, Delivery Date, Target Output. Ada tabel riwayat + tombol Edit.
3. **Breakdown Proses per Line** — paste dari Excel: No. Proses, Nama Proses, SMV, Nama Mesin (tanpa kolom operator — operator dipasang lewat tab Operational Breakdown).
4. **Database Manpower** — paste dari Excel: NIK, Nama. Upsert per NIK (paste ulang tidak menghapus data lama).

### Operational Breakdown (tab IE)
Alur kerja: pilih Line → pilih Style (dropdown otomatis dari style yang sudah ada breakdown-nya) → breakdown proses muncul dengan kolom Manpower kosong → cocokkan tiap proses dengan orang dari Database Manpower (cari NIK/nama, klik Pasang/Lepas).

### Skill Matrix (tab IE)
Kartu per operator (Grade A/B/C berdasarkan total SMV yang dikuasai): Grade A > 1 menit (hijau), Grade B 0,6–1 menit (kuning), Grade C < 0,6 menit (merah). Bisa difilter per Line dan dicari per nama.

### Data Produksi (tab IE)
Tabel oversight seluruh line dalam satu periode + export ke Excel.

### Kelola User (tab IE)
CRUD akun & role (IE/Supervisor/Tamu), assign Supervisor ke line tertentu.

---

## Struktur File

```
/
├── index.html              # Seluruh UI + logic frontend (SPA, vanilla JS)
├── styles.css              # Semua CSS (dipisah dari index.html)
├── favicon.png             # Ikon tab browser
├── rise-mark-light.png     # Logo robot RISE (hijau, background transparan) — dipakai di background terang
├── rise-mark-dark.png      # Logo robot RISE (putih, background transparan) — dipakai di background gelap
└── api/
    ├── line-config.js      # Setup Line (GET/POST) — line, mp, wh, shift_start, mesin, line_type, notes
    ├── line-orders.js      # Order/Style dengan riwayat (GET/POST)
    ├── line-processes.js   # Breakdown proses (GET/POST/PATCH/DELETE)
    │                       #   + Database Manpower digabung di sini lewat
    │                       #   query ?resource=manpower (GET/POST/DELETE),
    │                       #   supaya tidak nambah 1 Serverless Function lagi
    ├── qty-logs.js*         # Input qty produksi harian per line (kumulatif per hari)
    ├── attendance.js*       # Data hadir/tidak hadir per line per hari
    ├── settings.js*         # Setting global (mis. gross_margin)
    ├── supervisors.js*      # Data & assignment Supervisor ke line
    └── users.js*            # CRUD akun & role

  * File ini sudah ada sebelum sesi ini dan tidak diubah — disebut di sini
    karena dipanggil dari frontend, tapi source code-nya tidak diverifikasi
    ulang di README ini.
```

---

## Skema Database (Supabase / Postgres)

| Tabel | Peran | Catatan |
|---|---|---|
| `line_config` | Setup Line — 1 baris aktif per line, ditimpa | Kolom lama (`style`,`qty_order`,`smv`,`plan_start`,`plan_finish`,`target_output`) masih ada di skema tapi **sudah tidak dipakai** — datanya sudah dipindah ke `line_orders` |
| `line_orders` | Riwayat Order/Style per line | Kolom: `line`,`style`,`qty_order`,`smv`,`plan_start`,`plan_finish`,`delivery_date`,`target_output`. Unique per `(line, style, plan_start)` |
| `line_processes` | Breakdown proses per Line+Style | Kolom: `line`,`style`,`no_proses`,`nama_proses`,`smv`,`nama_mesin`,`nik`,`nama_operator`. `nama_operator` diisi otomatis dari `manpower.nama` saat dicocokkan |
| `manpower` | Master NIK + Nama | Primary key `nik` |
| `qty_logs`* | Input qty kumulatif per line per hari | — |
| `attendance`* | Hadir/tidak hadir per line per hari | — |

\* Skema tabel ini tidak diverifikasi ulang di sesi ini.

---

## Urutan Migration SQL

Kalau setup dari awal / menyusul dari versi lama, jalankan berurutan:

1. `migration_line_processes.sql` — bikin tabel `line_processes`
2. `migration_add_nama_mesin.sql` — tambah kolom `nama_mesin`
3. `migration_rename_line_type.sql` — ganti nilai `line_type`: `normal`→`assembly`, `support`→`preparation` (termasuk urus ulang CHECK constraint)
4. `migration_line_orders.sql` — bikin tabel `line_orders` + kolom `smv`/`delivery_date`/`target_output` + seed dari `line_config` lama
5. `migration_manpower.sql` — bikin tabel `manpower` + kolom `nik` di `line_processes`

Semua migration ditulis idempotent (`if not exists`) sejauh mungkin, aman dijalankan ulang.

---

## Deploy ke Vercel

1. Push semua file (`index.html`, `styles.css`, folder `api/`, aset gambar) ke repo yang terhubung ke Vercel.
2. Pastikan environment variable Supabase (URL & anon/service key) sudah diset di Vercel project settings.
3. Jalankan migration SQL di atas (Supabase SQL Editor) **sebelum** deploy kode yang bergantung padanya (terutama migration #3 dan #4, karena ada perubahan nama nilai & pemindahan data).

### Catatan limit Serverless Function (Vercel)

Paket **Hobby** Vercel membatasi maksimal **12 Serverless Function** per
deployment — setiap file di `/api` dihitung 1 function. Kalau butuh
endpoint baru, pertimbangkan digabung ke file `/api` yang sudah ada lewat
query param routing (seperti `manpower` yang digabung ke `line-processes.js`
via `?resource=manpower`) alih-alih bikin file baru, supaya tidak kena limit.

---

## Asumsi Bisnis yang Dipakai di Kode

- **Hari kerja**: Senin–Sabtu, Minggu libur (6 hari kerja/minggu, ±26 hari kerja/bulan) — dipakai di Forecast Target Mingguan/Bulanan.
- **Grade Skill Matrix**: A = SMV > 1 menit, B = SMV 0,6–1 menit, C = SMV < 0,6 menit.
- **Line Assembly vs Preparation**: cuma line Assembly yang dijumlahkan ke KPI dashboard; Preparation tetap tampil di detail tapi di luar agregat KPI.
- Riwayat Order (`line_orders`) baru mulai tercatat sejak fitur itu dipasang — order yang sudah lewat sebelum migration tidak bisa direkonstruksi.

---

## Belum/Tidak Dikerjakan di Sesi Ini

- Tidak ada test otomatis (unit/e2e).
- Source `qty-logs.js`, `attendance.js`, `settings.js`, `supervisors.js`, `users.js` tidak pernah di-review ulang di sesi ini — asumsikan masih versi sebelumnya.
- Sempat ada laporan chart "Efisiensi per Line", "Ringkasan Status", dan "Tren Output vs Target" terpotong di tampilan tertentu — **belum diperbaiki**, perlu investigasi lanjutan (kemungkinan terkait wrapper `.chart-canvas-inner`/ukuran container saat Chart.js pertama kali render).
