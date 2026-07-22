# Deploy — GitHub + Vercel + Supabase (100% gratis, untuk belajar/demo)

## Struktur proyek ini

```
sewing-line-control-vercel/
├── index.html              ← frontend (dashboard, sama seperti sebelumnya)
├── api/
│   ├── entries.js           ← GET (list semua) & POST (simpan/update)
│   ├── entries/[id].js       ← DELETE (hapus satu entry)
│   └── health.js            ← dipakai cron untuk "membangunkan" Supabase
├── lib/
│   └── entries.js            ← validasi, sanitasi, mapping data (dipakai bersama)
├── supabase/
│   └── schema.sql            ← skema tabel, dijalankan sekali di Supabase
├── vercel.json               ← cron harian ke /api/health (cegah auto-pause)
├── package.json
└── .env.example
```

Catatan penting: **hanya untuk pemakaian pribadi/belajar/demo** — Vercel
Hobby melarang pemakaian komersial di ketentuan layanannya.

---

## Langkah 1 — Buat project Supabase

1. Daftar di [supabase.com](https://supabase.com) (bisa pakai akun GitHub, tanpa kartu kredit).
2. "New Project" → beri nama, buat password database (simpan baik-baik), pilih region terdekat (mis. Singapore).
3. Setelah project siap, buka **SQL Editor** → "New query" → tempel isi
   `supabase/schema.sql` → klik **Run**. Ini membuat tabel `entries`.
4. Buka **Project Settings → API**. Catat dua nilai ini:
   - **Project URL** (contoh: `https://xxxxx.supabase.co`)
   - **service_role key** (di bagian "Project API keys" — bukan yang
     `anon`/`public`, tapi yang `service_role`. Ini kunci rahasia dengan
     akses penuh, jangan pernah taruh di kode frontend.)

---

## Langkah 2 — Push ke GitHub

```bash
cd sewing-line-control-vercel
git init
git add .
git commit -m "Initial commit"
```
Buat repo baru di GitHub (kosong, tanpa README), lalu:
```bash
git remote add origin https://github.com/USERNAME/sewing-line-control-vercel.git
git branch -M main
git push -u origin main
```

---

## Langkah 3 — Deploy ke Vercel

1. Daftar/login di [vercel.com](https://vercel.com) pakai akun GitHub.
2. "Add New..." → "Project" → pilih repo `sewing-line-control-vercel`.
3. Framework Preset: biarkan **"Other"** (Vercel otomatis mengenali folder
   `api/` sebagai serverless functions dan `index.html` sebagai static file).
4. Sebelum klik Deploy, buka **Environment Variables**, tambahkan:
   - `SUPABASE_URL` = Project URL dari Langkah 1
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key dari Langkah 1
5. Klik **Deploy**. Tunggu ±30 detik.
6. Selesai — Vercel kasih URL seperti
   `https://sewing-line-control-vercel.vercel.app`, sudah HTTPS otomatis.

### Update aplikasi di kemudian hari
Cukup `git push` ke `main`, Vercel otomatis build & deploy ulang (biasanya <1 menit).

---

## Tentang auto-pause Supabase

Project Supabase gratis pause otomatis kalau **7 hari tanpa request sama
sekali**. File `vercel.json` di proyek ini sudah berisi **cron job harian**
yang memanggil `/api/health` (yang melakukan query kecil ke tabel `entries`)
setiap jam 3 pagi — ini sudah cukup mencegah pause selama Vercel project-nya
tetap ter-deploy. Kalau suatu saat project tetap ter-pause (misal Vercel
project-nya sendiri lama tidak di-push), tinggal buka Supabase dashboard →
klik "Restore project" — datanya tetap ada, cuma butuh di-resume manual.

## Testing lokal sebelum deploy (opsional)

```bash
npm install -g vercel
cd sewing-line-control-vercel
cp .env.example .env.local   # isi dengan URL & key Supabase Anda
vercel dev
```
Buka `http://localhost:3000`.

## Kalau nanti perlu naik ke pemakaian komersial

Migrasinya tidak besar — cukup upgrade Vercel ke Pro ($20/bulan) dan/atau
Supabase ke Pro ($25/bulan) kalau butuh, kode tidak perlu diubah. Atau
pindah ke Oracle Cloud Always Free (lihat `DEPLOY.md` di versi
Express+file sebelumnya) yang boleh dipakai komersial gratis, tapi itu versi
kode yang berbeda (pakai Express, bukan serverless functions).
