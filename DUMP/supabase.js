/* ============================================================
   RIHLAH — supabase.js
   Supabase client, auth, dan semua query ke database.
   Import file ini sebelum app.js di index.html.
   ============================================================ */

'use strict';

/* ============================================================
   CONFIG — ganti dengan nilai dari Supabase Dashboard
   Project Settings → API → Project URL & anon key
   ============================================================ */
const SUPABASE_URL  = 'https://oqtavdokazhbukzproam.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xdGF2ZG9rYXpoYnVrenByb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MTIxODQsImV4cCI6MjA5NzQ4ODE4NH0.p9hBRRIr4KgQR2SoGr_0e_boBN85cE9M7ZSyxLQ0Rk0';

/* ============================================================
   CLIENT INIT
   Menggunakan Supabase CDN (dimuat di index.html sebelum file ini)
   ============================================================ */
const { createClient } = supabase;  // dari CDN window.supabase
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ============================================================
   AUTH — Login / Logout / Session
   ============================================================ */

/**
 * Login dengan email & password via Supabase Auth.
 * Email dibangun dari display_id: "PWS-001" → "pws-001@rihlah.internal"
 * sehingga user tetap input ID seperti sebelumnya.
 *
 * @param {string} displayId  — e.g. "PWS-001"
 * @param {string} password
 * @returns {{ user, profile } | { error }}
 */
async function authLogin(displayId, password) {
  const email = `${displayId.toLowerCase()}@rihlah.internal`;

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  // Ambil profil dari tabel public.users
  const profile = await fetchCurrentUserProfile();
  if (profile.error) return { error: 'Login berhasil, tapi profil tidak ditemukan.' };

  return { user: data.user, profile: profile.data };
}

/**
 * Logout dari Supabase Auth.
 */
async function authLogout() {
  const { error } = await db.auth.signOut();
  if (error) console.warn('Logout error:', error.message);
}

/**
 * Ambil sesi aktif (digunakan saat halaman di-refresh).
 * @returns {Session | null}
 */
async function authGetSession() {
  const { data } = await db.auth.getSession();
  return data?.session ?? null;
}

/**
 * Daftarkan listener perubahan auth (login/logout/refresh token).
 * @param {function} callback — dipanggil dengan (event, session)
 */
function authOnChange(callback) {
  db.auth.onAuthStateChange(callback);
}

/* ============================================================
   USERS — Profil pengguna
   ============================================================ */

/**
 * Ambil profil user yang sedang login dari public.users.
 */
async function fetchCurrentUserProfile() {
  const { data, error } = await db
    .from('users')
    .select('id, display_id, nama, short_name, role')
    .eq('id', (await db.auth.getUser()).data.user?.id)
    .single();

  return { data, error };
}

/* ============================================================
   KELOMPOK
   ============================================================ */

/**
 * Ambil semua kelompok beserta nama ketua.
 * Admin: semua kelompok. Ketua: kelompok sendiri (RLS otomatis).
 */
async function fetchKelompok() {
  const { data, error } = await db
    .from('kelompok')
    .select(`
      id,
      nama,
      ketua_id,
      users:ketua_id ( display_id, short_name, nama )
    `)
    .order('nama');

  return { data, error };
}

/* ============================================================
   JAMAAH
   ============================================================ */

/**
 * Ambil semua jamaah dengan kelompok & band info.
 * Filter RLS otomatis untuk ketua (hanya kelompoknya).
 */
async function fetchJamaah() {
  const { data, error } = await db
    .from('jamaah')
    .select(`
      id,
      nama,
      umur,
      penyakit,
      kelompok_id,
      last_spo2,
      last_hr,
      last_rr,
      last_status,
      last_reading_at,
      kelompok:kelompok_id ( nama ),
      hajj_band:hajj_band_id ( band_code, is_active, battery_pct, last_seen_at )
    `)
    .order('nama');

  return { data, error };
}

/**
 * Ambil satu jamaah dengan detail lengkap.
 * @param {string} jamaahId — UUID
 */
async function fetchJamaahById(jamaahId) {
  const { data, error } = await db
    .from('jamaah')
    .select(`
      id,
      nama,
      umur,
      penyakit,
      kelompok_id,
      last_spo2,
      last_hr,
      last_rr,
      last_status,
      last_reading_at,
      kelompok:kelompok_id ( nama ),
      hajj_band:hajj_band_id ( band_code, is_active, battery_pct, last_seen_at )
    `)
    .eq('id', jamaahId)
    .single();

  return { data, error };
}

/* ============================================================
   HAJJ BANDS
   ============================================================ */

/**
 * Ambil semua hajj band yang belum di-assign ke jamaah.
 */
async function fetchUnassignedBands() {
  // Band unassigned = tidak ada jamaah yang punya hajj_band_id ini
  const { data, error } = await db
    .from('hajj_bands')
    .select('id, band_code, battery_pct')
    .not('id', 'in', `(
      select hajj_band_id from jamaah where hajj_band_id is not null
    )`);

  return { data, error };
}

/**
 * Assign hajj band ke jamaah.
 * @param {string} jamaahId
 * @param {string} bandId — UUID hajj_band
 */
async function assignBandToJamaah(jamaahId, bandId) {
  const { error } = await db
    .from('jamaah')
    .update({ hajj_band_id: bandId })
    .eq('id', jamaahId);

  if (!error) {
    // Aktifkan band
    await db.from('hajj_bands').update({ is_active: true }).eq('id', bandId);
  }

  return { error };
}

/* ============================================================
   VITAL READINGS
   ============================================================ */

/**
 * Ambil riwayat vital signs satu jamaah (N data terakhir).
 * @param {string} jamaahId
 * @param {number} limit — default 50
 */
async function fetchVitalHistory(jamaahId, limit = 50) {
  const { data, error } = await db
    .from('vital_readings')
    .select('id, spo2, hr, rr, battery_pct, lat, lng, recorded_at')
    .eq('jamaah_id', jamaahId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

/**
 * Ambil vital reading terakhir untuk semua jamaah (untuk dasbor).
 * Menggunakan snapshot di tabel jamaah (last_spo2, dll) — lebih cepat.
 * Fungsi ini untuk refresh manual jika snapshot belum terupdate.
 */
async function fetchLatestVitalsAll() {
  const { data, error } = await db
    .from('vital_readings')
    .select('jamaah_id, spo2, hr, rr, battery_pct, recorded_at')
    .order('recorded_at', { ascending: false })
    // Ambil 1 per jamaah — Supabase belum support DISTINCT ON via JS client,
    // jadi kita pakai RPC (lihat fungsi fetchLatestVitalsRpc di bawah)
    .limit(200);

  return { data, error };
}

/**
 * Ambil vital terbaru per jamaah via Supabase RPC (PostgreSQL function).
 * Jalankan SQL ini di Supabase terlebih dulu:
 *
 * create or replace function get_latest_vitals()
 * returns table (
 *   jamaah_id uuid, spo2 smallint, hr smallint,
 *   rr smallint, battery_pct smallint, recorded_at timestamptz
 * ) language sql security definer as $$
 *   select distinct on (jamaah_id)
 *     jamaah_id, spo2, hr, rr, battery_pct, recorded_at
 *   from vital_readings
 *   order by jamaah_id, recorded_at desc;
 * $$;
 */
async function fetchLatestVitalsRpc() {
  const { data, error } = await db.rpc('get_latest_vitals');
  return { data, error };
}

/* ============================================================
   ALERTS
   ============================================================ */

/**
 * Ambil semua alert aktif (belum resolved), terbaru duluan.
 * @param {number} limit — default 20
 */
async function fetchActiveAlerts(limit = 20) {
  const { data, error } = await db
    .from('alerts')
    .select(`
      id,
      alert_type,
      severity,
      nilai,
      pesan,
      created_at,
      jamaah:jamaah_id ( id, nama, kelompok_id,
        kelompok:kelompok_id ( nama )
      )
    `)
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

/**
 * Tandai alert sebagai resolved.
 * @param {number} alertId
 */
async function resolveAlert(alertId) {
  const { data: { user } } = await db.auth.getUser();

  const { error } = await db
    .from('alerts')
    .update({
      is_resolved:  true,
      resolved_by:  user?.id ?? null,
      resolved_at:  new Date().toISOString(),
    })
    .eq('id', alertId);

  return { error };
}

/**
 * Ambil semua alert (termasuk resolved) untuk satu jamaah.
 * @param {string} jamaahId
 * @param {number} limit
 */
async function fetchAlertsByJamaah(jamaahId, limit = 30) {
  const { data, error } = await db
    .from('alerts')
    .select('id, alert_type, severity, nilai, pesan, is_resolved, created_at, resolved_at')
    .eq('jamaah_id', jamaahId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

/* ============================================================
   REALTIME — Subscribe ke perubahan data live
   ============================================================ */

/**
 * Subscribe ke perubahan tabel jamaah (snapshot vital terupdate).
 * Berguna untuk update dasbor otomatis tanpa polling.
 *
 * @param {function} onUpdate — dipanggil dengan payload perubahan
 * @returns channel — simpan untuk bisa unsubscribe nanti
 */
function subscribeJamaahUpdates(onUpdate) {
  return db
    .channel('jamaah-updates')
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'jamaah',
    }, onUpdate)
    .subscribe();
}

/**
 * Subscribe ke alert baru.
 * @param {function} onInsert
 * @returns channel
 */
function subscribeNewAlerts(onInsert) {
  return db
    .channel('new-alerts')
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'alerts',
    }, onInsert)
    .subscribe();
}

/**
 * Unsubscribe dari channel realtime.
 * @param {object} channel — hasil return dari subscribe*()
 */
function unsubscribe(channel) {
  if (channel) db.removeChannel(channel);
}

/* ============================================================
   STATS HELPER — hitung statistik dasbor dari data jamaah
   ============================================================ */

/**
 * Hitung statistik ringkas dari array jamaah (sama strukturnya
 * dengan DATA.jamaah di mock data lama, tapi dari Supabase).
 * @param {Array} jamaahList
 */
function calcStats(jamaahList) {
  const total  = jamaahList.length;
  const active = jamaahList.filter(j => j.hajj_band?.is_active).length;
  const hijau  = jamaahList.filter(j => j.last_status === 'hijau').length;
  const kuning = jamaahList.filter(j => j.last_status === 'kuning').length;
  const merah  = jamaahList.filter(j => j.last_status === 'merah').length;
  return { total, active, hijau, kuning, merah };
}

/* ============================================================
   EXPORT — semua fungsi tersedia global (vanilla JS, no bundler)
   ============================================================ */
window.RIHLAH_DB = {
  client: db,

  // Auth
  authLogin,
  authLogout,
  authGetSession,
  authOnChange,
  fetchCurrentUserProfile,

  // Data
  fetchKelompok,
  fetchJamaah,
  fetchJamaahById,
  fetchUnassignedBands,
  assignBandToJamaah,
  fetchVitalHistory,
  fetchLatestVitalsRpc,
  fetchActiveAlerts,
  resolveAlert,
  fetchAlertsByJamaah,

  // Realtime
  subscribeJamaahUpdates,
  subscribeNewAlerts,
  unsubscribe,

  // Helpers
  calcStats,
};
