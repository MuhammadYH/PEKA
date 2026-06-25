-- ============================================================
-- PEKA — SOS FEATURE SETUP
-- Jalankan di Supabase SQL Editor, urut dari atas ke bawah.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABEL sos_events
--    Setiap kali tombol SOS di smart band ditekan, satu baris
--    masuk ke sini. Ini adalah "log" / riwayat lengkap SOS,
--    mirip vital_readings tapi khusus kejadian darurat.
-- ------------------------------------------------------------
create table if not exists public.sos_events (
  id            bigint generated always as identity primary key,
  sopir_id      uuid not null references public.sopir(id) on delete cascade,
  band_id       uuid references public.smart_bands(id) on delete set null,

  -- Lokasi GPS saat SOS ditekan (boleh null kalau GPS belum lock)
  lat           double precision,
  lng           double precision,

  -- Vital terakhir yang terekam saat itu (opsional, untuk konteks)
  spo2          smallint,
  hr            smallint,
  rr            smallint,

  -- Status penanganan
  is_resolved   boolean not null default false,
  resolved_by   uuid references public.users(id),
  resolved_at   timestamptz,
  catatan_resolusi text,

  created_at    timestamptz not null default now()
);

create index if not exists idx_sos_events_sopir   on public.sos_events(sopir_id);
create index if not exists idx_sos_events_active  on public.sos_events(is_resolved, created_at desc);

comment on table public.sos_events is
  'Log setiap penekanan tombol SOS dari smart band. Satu baris = satu kejadian SOS.';

-- ------------------------------------------------------------
-- 2. KOLOM SNAPSHOT di tabel sopir
--    Sama seperti last_spo2/last_hr/dll — supaya dashboard bisa
--    baca status SOS langsung dari tabel sopir tanpa join,
--    cepat untuk render awal & query daftar sopir.
-- ------------------------------------------------------------
alter table public.sopir
  add column if not exists sos_active     boolean not null default false,
  add column if not exists sos_triggered_at timestamptz,
  add column if not exists sos_event_id   bigint references public.sos_events(id);

comment on column public.sopir.sos_active is
  'true selama ada sos_events aktif (belum resolved) untuk sopir ini.';

-- ------------------------------------------------------------
-- 3. TRIGGER — otomatis update snapshot di sopir saat:
--    a) SOS baru masuk (INSERT ke sos_events)         → sos_active = true
--    b) SOS di-resolve (UPDATE is_resolved = true)     → sos_active = false
-- ------------------------------------------------------------
create or replace function public.fn_sos_event_sync_sopir()
returns trigger
language plpgsql
security definer
as $$
begin
  if (tg_op = 'INSERT') then
    update public.sopir
    set sos_active       = true,
        sos_triggered_at = new.created_at,
        sos_event_id     = new.id
    where id = new.sopir_id;

  elsif (tg_op = 'UPDATE' and new.is_resolved = true and old.is_resolved = false) then
    -- Hanya matikan sos_active kalau ini event SOS yang sedang aktif tercatat
    update public.sopir
    set sos_active = false
    where id = new.sopir_id
      and sos_event_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sos_event_sync_sopir on public.sos_events;
create trigger trg_sos_event_sync_sopir
  after insert or update on public.sos_events
  for each row execute function public.fn_sos_event_sync_sopir();

-- ------------------------------------------------------------
-- 4. RPC — terima sinyal SOS dari smart band / gateway IoT
--    Dipanggil via Edge Function (lihat catatan di bawah) ATAU
--    langsung via REST RPC kalau gateway bisa panggil Supabase.
--
--    security definer supaya band/gateway tidak perlu role admin
--    penuh — cukup anon key + RPC ini, RLS tetap aman karena
--    function ini sendiri yang menentukan apa yang boleh ditulis.
-- ------------------------------------------------------------
create or replace function public.report_sos(
  p_band_code text,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_spo2      smallint default null,
  p_hr        smallint default null,
  p_rr        smallint default null
)
returns table (sos_event_id bigint, sopir_id uuid)
language plpgsql
security definer
as $$
declare
  v_band_id  uuid;
  v_sopir_id uuid;
  v_event_id bigint;
begin
  select id into v_band_id from public.smart_bands where band_code = p_band_code;
  if v_band_id is null then
    raise exception 'Band code % tidak ditemukan', p_band_code;
  end if;

  select id into v_sopir_id from public.sopir where smart_band_id = v_band_id;
  if v_sopir_id is null then
    raise exception 'Band % belum terpasang ke sopir manapun', p_band_code;
  end if;

  insert into public.sos_events (sopir_id, band_id, lat, lng, spo2, hr, rr)
  values (v_sopir_id, v_band_id, p_lat, p_lng, p_spo2, p_hr, p_rr)
  returning id into v_event_id;

  return query select v_event_id, v_sopir_id;
end;
$$;

-- Izinkan role anon memanggil RPC ini (band/gateway pakai anon key)
grant execute on function public.report_sos to anon, authenticated;

-- ------------------------------------------------------------
-- 5. RPC — tandai SOS sebagai resolved (dipanggil dari web app)
-- ------------------------------------------------------------
create or replace function public.resolve_sos(
  p_sos_event_id   bigint,
  p_catatan        text default null
)
returns void
language plpgsql
security definer
as $$
begin
  update public.sos_events
  set is_resolved       = true,
      resolved_by       = auth.uid(),
      resolved_at       = now(),
      catatan_resolusi  = p_catatan
  where id = p_sos_event_id;
end;
$$;

grant execute on function public.resolve_sos to authenticated;

-- ------------------------------------------------------------
-- 6. RLS — sos_events ikut pola RLS yang sama dengan tabel sopir
--    (admin lihat semua, supervisor lihat armadanya saja).
--    Sesuaikan nama policy sopir yang sudah ada di project Anda.
-- ------------------------------------------------------------
alter table public.sos_events enable row level security;

create policy "sos_events_select_admin"
  on public.sos_events for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

create policy "sos_events_select_supervisor"
  on public.sos_events for select
  using (
    exists (
      select 1 from public.sopir s
      join public.armada a on a.id = s.armada_id
      where s.id = sos_events.sopir_id
        and a.supervisor_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 7. REALTIME — pastikan tabel ini ikut di publication realtime
--    (kalau publication Anda sudah include semua tabel public,
--    baris ini aman dijalankan dan tidak akan error duplikat).
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.sos_events;

-- ============================================================
-- CATATAN INTEGRASI HARDWARE
-- ============================================================
-- Smart band / gateway IoT memanggil RPC ini saat tombol SOS ditekan:
--
--   POST https://<project>.supabase.co/rest/v1/rpc/report_sos
--   Headers:
--     apikey: <anon key>
--     Content-Type: application/json
--   Body:
--     {
--       "p_band_code": "001A",
--       "p_lat": -7.6967,
--       "p_lng": 112.5594,
--       "p_spo2": 89,
--       "p_hr": 130,
--       "p_rr": 28
--     }
--
-- Kalau hardware/gateway TIDAK bisa kirim HTTPS langsung (misal
-- band hanya kirim ke gateway BLE→cloud pihak ketiga dulu), maka
-- pasang Edge Function 'report-sos' sebagai perantara: gateway
-- panggil Edge Function itu, Edge Function yang panggil RPC ini
-- dengan service role. Pola ini sama dengan create-supervisor
-- yang sudah Anda punya di supabase.js.
-- ============================================================
