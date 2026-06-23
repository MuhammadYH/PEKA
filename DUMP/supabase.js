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
 * Email dibangun dari display_id: "ADM-001" → "adm-001@rihlah.internal"
 * sehingga user tetap input ID seperti sebelumnya.
 *
 * @param {string} displayId  — e.g. "ADM-001"
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
   ADMIN — Buat akun supervisor armada via Edge Function
   ============================================================ */

/**
 * Buat akun login supervisor armada baru.
 * Memanggil Edge Function 'create-supervisor' (pakai service role di server,
 * jadi TIDAK mengubah sesi login admin yang sedang aktif).
 *
 * @param {{ displayId: string, nama: string, shortName: string,
 *           password: string, armadaId: string }} payload
 * @returns {{ success: true, userId: string } | { error: string }}
 */
async function createSupervisorArmada(payload) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return { error: 'Sesi tidak ditemukan, silakan login ulang.' };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-supervisor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    if (!res.ok) return { error: result.error || 'Gagal membuat supervisor armada.' };
    return result;
  } catch (e) {
    return { error: `Gagal terhubung ke server: ${e.message}` };
  }
}

/* ============================================================
   ARMADA
   ============================================================ */

/**
 * Ambil semua armada beserta nama supervisor.
 * Admin: semua armada. Supervisor: armada sendiri (RLS otomatis).
 */
async function fetchArmada() {
  const { data, error } = await db
    .from('armada')
    .select(`
      id,
      nama,
      supervisor_id,
      users:supervisor_id ( display_id, short_name, nama )
    `)
    .order('nama');

  return { data, error };
}

/* ============================================================
   SOPIR
   ============================================================ */

/**
 * Ambil semua sopir dengan armada & band info.
 * Filter RLS otomatis untuk supervisor (hanya armadanya).
 */
async function fetchSopir() {
  const { data, error } = await db
    .from('sopir')
    .select(`
      id,
      nama,
      umur,
      riwayat_kesehatan,
      armada_id,
      last_spo2,
      last_hr,
      last_rr,
      last_status,
      last_reading_at,
      armada:armada_id ( nama ),
      smart_band:smart_band_id ( band_code, is_active, battery_pct, last_seen_at )
    `)
    .order('nama');

  return { data, error };
}

/**
 * Ambil satu sopir dengan detail lengkap.
 * @param {string} sopirId — UUID
 */
async function fetchSopirById(sopirId) {
  const { data, error } = await db
    .from('sopir')
    .select(`
      id,
      nama,
      umur,
      riwayat_kesehatan,
      armada_id,
      last_spo2,
      last_hr,
      last_rr,
      last_status,
      last_reading_at,
      armada:armada_id ( nama ),
      smart_band:smart_band_id ( band_code, is_active, battery_pct, last_seen_at )
    `)
    .eq('id', sopirId)
    .single();

  return { data, error };
}

/**
 * Insert banyak sopir sekaligus.
 * @param {Array<{nama:string, umur:number, riwayat_kesehatan:string|null, armada_id:string}>} rows
 * @returns {{ data, error }}
 */
async function insertSopirBulk(rows) {
  const { data, error } = await db.from('sopir').insert(rows).select();
  return { data, error };
}

/* ============================================================
   SMART BANDS
   ============================================================ */

/**
 * Ambil semua smart band yang belum di-assign ke sopir.
 */
async function fetchUnassignedBands() {
  // Band unassigned = tidak ada sopir yang punya smart_band_id ini
  const { data, error } = await db
    .from('smart_bands')
    .select('id, band_code, battery_pct')
    .not('id', 'in', `(
      select smart_band_id from sopir where smart_band_id is not null
    )`);

  return { data, error };
}

/**
 * Assign smart band ke sopir.
 * @param {string} sopirId
 * @param {string} bandId — UUID smart_band
 */
async function assignBandToSopir(sopirId, bandId) {
  const { error } = await db
    .from('sopir')
    .update({ smart_band_id: bandId })
    .eq('id', sopirId);

  if (!error) {
    // Aktifkan band
    await db.from('smart_bands').update({ is_active: true }).eq('id', bandId);
  }

  return { error };
}

/* ============================================================
   VITAL READINGS
   ============================================================ */

/**
 * Ambil riwayat vital signs satu sopir (N data terakhir).
 * @param {string} sopirId
 * @param {number} limit — default 50
 */
async function fetchVitalHistory(sopirId, limit = 50) {
  const { data, error } = await db
    .from('vital_readings')
    .select('id, spo2, hr, rr, battery_pct, lat, lng, recorded_at')
    .eq('sopir_id', sopirId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

/**
 * Ambil vital reading terakhir untuk semua sopir (untuk dasbor).
 * Menggunakan snapshot di tabel sopir (last_spo2, dll) — lebih cepat.
 * Fungsi ini untuk refresh manual jika snapshot belum terupdate.
 */
async function fetchLatestVitalsAll() {
  const { data, error } = await db
    .from('vital_readings')
    .select('sopir_id, spo2, hr, rr, battery_pct, recorded_at')
    .order('recorded_at', { ascending: false })
    // Ambil 1 per sopir — Supabase belum support DISTINCT ON via JS client,
    // jadi kita pakai RPC (lihat fungsi fetchLatestVitalsRpc di bawah)
    .limit(200);

  return { data, error };
}

/**
 * Ambil vital terbaru per sopir via Supabase RPC (PostgreSQL function).
 * Jalankan SQL ini di Supabase terlebih dulu:
 *
 * create or replace function get_latest_vitals()
 * returns table (
 *   sopir_id uuid, spo2 smallint, hr smallint,
 *   rr smallint, battery_pct smallint, recorded_at timestamptz
 * ) language sql security definer as $$
 *   select distinct on (sopir_id)
 *     sopir_id, spo2, hr, rr, battery_pct, recorded_at
 *   from vital_readings
 *   order by sopir_id, recorded_at desc;
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
      sopir:sopir_id ( id, nama, armada_id,
        armada:armada_id ( nama )
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
 * Ambil semua alert (termasuk resolved) untuk satu sopir.
 * @param {string} sopirId
 * @param {number} limit
 */
async function fetchAlertsBySopir(sopirId, limit = 30) {
  const { data, error } = await db
    .from('alerts')
    .select('id, alert_type, severity, nilai, pesan, is_resolved, created_at, resolved_at')
    .eq('sopir_id', sopirId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

/* ============================================================
   REALTIME — Subscribe ke perubahan data live
   ============================================================ */

/**
 * Subscribe ke perubahan tabel sopir (snapshot vital terupdate).
 * Berguna untuk update dasbor otomatis tanpa polling.
 *
 * @param {function} onUpdate — dipanggil dengan payload perubahan
 * @returns channel — simpan untuk bisa unsubscribe nanti
 */
function subscribeSopirUpdates(onUpdate) {
  return db
    .channel('sopir-updates')
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'sopir',
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
   STATS HELPER — hitung statistik dasbor dari data sopir
   ============================================================ */

/**
 * Hitung statistik ringkas dari array sopir (sama strukturnya
 * dengan DATA.sopir di mock data lama, tapi dari Supabase).
 * @param {Array} sopirList
 */
function calcStats(sopirList) {
  const total  = sopirList.length;
  const active = sopirList.filter(j => j.smart_band?.is_active).length;
  const hijau  = sopirList.filter(j => j.last_status === 'hijau').length;
  const kuning = sopirList.filter(j => j.last_status === 'kuning').length;
  const merah  = sopirList.filter(j => j.last_status === 'merah').length;
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

  // Admin
  createSupervisorArmada,

  // Data
  fetchArmada,
  fetchSopir,
  fetchSopirById,
  insertSopirBulk,
  fetchUnassignedBands,
  assignBandToSopir,
  fetchVitalHistory,
  fetchLatestVitalsRpc,
  fetchActiveAlerts,
  resolveAlert,
  fetchAlertsBySopir,

  // Realtime
  subscribeSopirUpdates,
  subscribeNewAlerts,
  unsubscribe,

  // Helpers
  calcStats,
};
