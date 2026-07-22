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
