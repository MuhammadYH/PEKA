-- ============================================================
-- PEKA — Migrasi Skema: Jamaah Haji → Monitoring Sopir
-- Jalankan di Supabase Dashboard → SQL Editor (project oqtavdokazhbukzproam)
--
-- PENTING:
-- 1. Backup dulu (Dashboard → Database → Backups, atau pg_dump manual)
--    sebelum menjalankan migrasi ini di project production.
-- 2. Jalankan saat traffic rendah — rename tabel/kolom di Postgres
--    cepat (metadata-only), tapi RLS policy & query yang sedang
--    berjalan bisa gagal sesaat saat nama berubah.
-- 3. Setelah migrasi ini, deploy ulang edge function baru
--    (create-supervisor.ts) dan HAPUS function lama (create-ketua)
--    dari Supabase Dashboard → Edge Functions.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) RENAME TABEL
-- ------------------------------------------------------------
alter table if exists kelompok    rename to armada;
alter table if exists jamaah      rename to sopir;
alter table if exists hajj_bands  rename to smart_bands;

-- ------------------------------------------------------------
-- 2) RENAME KOLOM — tabel armada (dulu kelompok)
-- ------------------------------------------------------------
alter table armada rename column ketua_id to supervisor_id;

-- ------------------------------------------------------------
-- 3) RENAME KOLOM — tabel sopir (dulu jamaah)
-- ------------------------------------------------------------
alter table sopir rename column kelompok_id   to armada_id;
alter table sopir rename column penyakit       to riwayat_kesehatan;
alter table sopir rename column hajj_band_id   to smart_band_id;

-- ------------------------------------------------------------
-- 4) RENAME KOLOM — tabel vital_readings & alerts
--    (sebelumnya jamaah_id, dipakai sebagai foreign key)
-- ------------------------------------------------------------
alter table vital_readings rename column jamaah_id to sopir_id;
alter table alerts         rename column jamaah_id to sopir_id;

-- ------------------------------------------------------------
-- 5) ROLE: 'ketua' → 'supervisor'
--    Menangani dua kemungkinan: kolom role bertipe TEXT biasa,
--    atau ENUM custom type. Blok DO ini aman dijalankan di
--    kedua kasus.
-- ------------------------------------------------------------
do $$
begin
  -- Kalau kolom role pakai custom ENUM type, tambahkan value baru dulu
  if exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join information_schema.columns c
      on c.udt_name = t.typname
    where c.table_name = 'users' and c.column_name = 'role'
  ) then
    -- Tambahkan 'supervisor' & 'admin' ke enum kalau belum ada
    begin
      execute (
        select format('alter type %I add value if not exists ''supervisor''', t.typname)
        from pg_type t
        join information_schema.columns c on c.udt_name = t.typname
        where c.table_name = 'users' and c.column_name = 'role'
        limit 1
      );
    exception when others then
      raise notice 'Lewati alter enum (mungkin sudah ada / kolom bukan enum): %', sqlerrm;
    end;
  end if;
end $$;

update users set role = 'supervisor' where role = 'ketua';

-- ------------------------------------------------------------
-- 6) RPC FUNCTION — get_latest_vitals()
--    Recreate dengan nama kolom baru (sopir_id)
-- ------------------------------------------------------------
create or replace function get_latest_vitals()
returns table (
  sopir_id uuid, spo2 smallint, hr smallint,
  rr smallint, battery_pct smallint, recorded_at timestamptz
) language sql security definer as $$
  select distinct on (sopir_id)
    sopir_id, spo2, hr, rr, battery_pct, recorded_at
  from vital_readings
  order by sopir_id, recorded_at desc;
$$;

commit;

-- ============================================================
-- 7) PERIKSA MANUAL — RLS POLICIES
-- ============================================================
-- Rename tabel/kolom TIDAK otomatis mengubah teks di dalam RLS
-- policy yang sudah ada (Postgres akan auto-update referensi kolom
-- internal, TAPI kalau ada policy yang menyebut nama role/tabel
-- secara hardcoded sebagai string literal — misal:
--   USING (role = 'ketua' AND kelompok_id = ...)
-- — ini HARUS direvisi manual. Jalankan query ini untuk menemukan
-- semua policy yang masih menyebut istilah lama:
--
--   select schemaname, tablename, policyname, qual, with_check
--   from pg_policies
--   where qual::text ilike any (array['%ketua%','%kelompok%','%jamaah%','%pengawas%'])
--      or with_check::text ilike any (array['%ketua%','%kelompok%','%jamaah%','%pengawas%']);
--
-- Lalu update tiap policy dengan:
--   drop policy "nama_policy" on armada;
--   create policy "nama_policy" on armada using (...);
-- ============================================================

-- ============================================================
-- 8) OPSIONAL — index/constraint yang masih bernama lama
-- ============================================================
-- select indexname from pg_indexes where tablename in ('armada','sopir','smart_bands')
--   and (indexname ilike '%kelompok%' or indexname ilike '%jamaah%' or indexname ilike '%hajj%');
-- Rename manual kalau perlu, contoh:
--   alter index jamaah_pkey rename to sopir_pkey;
