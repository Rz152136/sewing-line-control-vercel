-- Jalankan script ini di Supabase Dashboard → SQL Editor → New query → Run.

create table if not exists entries (
  id text primary key,
  line text not null,
  date date not null,
  style text default '',
  qty_order numeric default 0,
  plan_start date,
  plan_finish date,
  tis numeric,
  smv numeric default 0,
  mp numeric default 0,
  wh numeric default 0,
  output numeric default 0,
  transfer numeric default 0,
  eff_manual numeric,
  defect_name text default '',
  defect_qty numeric,
  notes text default '',
  updated_at timestamptz default now()
);

-- Satu line hanya boleh punya satu entry per tanggal (sama seperti aturan di versi sebelumnya)
create unique index if not exists entries_line_date_idx on entries (line, date);

create index if not exists entries_date_idx on entries (date);

-- Row Level Security diaktifkan dan TIDAK diberi policy publik apa pun.
-- Ini aman karena frontend tidak pernah bicara langsung ke Supabase — semua
-- akses lewat serverless function kita (folder /api) yang memakai
-- SERVICE ROLE KEY, yang otomatis melewati RLS. Anon key (kalau ada yang
-- mencoba akses langsung dari browser) tidak akan bisa membaca/menulis apa pun.
alter table entries enable row level security;

-- ============================================================
-- User roles: supervisor (hanya input), ie (superadmin), tamu (lihat saja)
-- ============================================================

create type user_role as enum ('supervisor', 'ie', 'tamu');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text default '',
  role user_role not null default 'tamu',
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- User boleh membaca profil dirinya sendiri (dipakai frontend kalau perlu).
-- Tidak ada policy insert/update/delete publik — pembuatan user baru dan
-- perubahan role hanya lewat endpoint /api/admin/users (khusus role IE),
-- yang memakai service_role key dan otomatis melewati RLS.
create policy "Users can read own profile" on profiles
  for select using (auth.uid() = id);

-- ============================================================
-- LANGKAH WAJIB SETELAH MENJALANKAN SCRIPT INI:
-- Buat akun IE (superadmin) PERTAMA secara manual, karena belum ada
-- siapa pun yang bisa membuat user lewat aplikasi:
--
-- 1. Authentication -> Users -> Add User -> isi email & password ->
--    centang "Auto Confirm User" -> Create user.
-- 2. Salin User UID yang baru dibuat.
-- 3. Table Editor -> profiles -> Insert row:
--      id        = User UID dari langkah 2
--      email     = email yang sama
--      full_name = nama Anda
--      role      = ie
--
-- Setelah itu, akun IE ini bisa login ke aplikasi dan membuat user
-- supervisor/tamu lainnya lewat tab "Kelola User".
-- ============================================================
