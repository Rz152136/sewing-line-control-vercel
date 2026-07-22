# Sewing Line Control — GitHub + Vercel + Supabase

Versi serverless dari Sewing Line Control: frontend statis di Vercel,
backend berupa Vercel Serverless Functions, dan data tersimpan di Postgres
(Supabase). Semua fitur (andon board, ringkasan per line, input/update,
riwayat + filter, chart efisiensi/defect/trend/S-curve, export Excel) sama
persis dengan versi Express — hanya cara penyimpanan datanya yang berbeda.

**Untuk pemakaian pribadi/belajar/demo** (lihat catatan ToS di `DEPLOY.md`).

## Cara deploy

Lihat `DEPLOY.md` untuk langkah lengkap: Supabase → GitHub → Vercel.

## Cara kerja

- `index.html` memanggil `/api/entries` (GET/POST) dan `/api/entries/:id`
  (DELETE) — persis seperti versi Express, cuma sekarang di-handle oleh
  Vercel Serverless Functions di folder `api/`.
- Functions di `api/` memakai Supabase **service_role key** (disimpan
  sebagai Environment Variable di Vercel, tidak pernah dikirim ke browser)
  untuk baca/tulis ke tabel `entries`.
- Aturan "satu entry per line per tanggal" tetap sama: kirim data dengan
  `line` + `date` yang sudah ada akan menimpa entry tersebut (bukan bikin
  duplikat), persis seperti versi sebelumnya.
