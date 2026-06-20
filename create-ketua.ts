// ============================================================
// RIHLAH — Edge Function: create-ketua
// Membuat akun login ketua kelompok baru (auth.users + public.users)
// dan menetapkannya sebagai ketua di tabel kelompok.
//
// Hanya boleh dipanggil oleh user yang sedang login dengan role 'admin'.
// Menggunakan SERVICE ROLE KEY di sisi server — TIDAK PERNAH dikirim ke browser.
//
// Deploy: supabase functions deploy create-ketua
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY');

    // Client biasa (anon) — untuk verifikasi siapa yang memanggil
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Client admin — untuk operasi Admin API (bypass RLS)
    const adminClient = createClient(SUPABASE_URL!, SERVICE_ROLE!);

    // 1) Pastikan ada user yang login
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return json({ error: 'Tidak terautentikasi.' }, 401);
    }

    // 2) Pastikan caller adalah admin
    const { data: callerProfile, error: profileErr } = await adminClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (profileErr || callerProfile?.role !== 'admin') {
      return json({ error: 'Hanya admin yang dapat menambah ketua kelompok.' }, 403);
    }

    // 3) Validasi payload
    const body = await req.json();
    const { displayId, nama, shortName, password, kelompokId } = body ?? {};

    if (!displayId || !nama || !shortName || !password || !kelompokId) {
      return json({ error: 'Semua kolom wajib diisi.' }, 400);
    }
    if (password.length < 6) {
      return json({ error: 'Password minimal 6 karakter.' }, 400);
    }

    const email = `${String(displayId).toLowerCase()}@rihlah.internal`;

    // 4) Buat user di auth.users via Admin API (TIDAK mengubah sesi siapa pun)
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      return json({ error: `Gagal membuat akun: ${createErr.message}` }, 400);
    }

    const newUserId = created.user.id;

    // 5) Insert profil ke public.users
    const { error: insertErr } = await adminClient.from('users').insert({
      id: newUserId,
      display_id: displayId,
      nama,
      short_name: shortName,
      role: 'ketua',
    });

    if (insertErr) {
      // Rollback: hapus auth user kalau insert profil gagal
      await adminClient.auth.admin.deleteUser(newUserId);
      return json({ error: `Gagal membuat profil: ${insertErr.message}` }, 400);
    }

    // 6) Tetapkan sebagai ketua di tabel kelompok
    const { error: updateErr } = await adminClient
      .from('kelompok')
      .update({ ketua_id: newUserId })
      .eq('id', kelompokId);

    if (updateErr) {
      return json({ error: `Akun dibuat, tapi gagal menetapkan kelompok: ${updateErr.message}` }, 400);
    }

    return json({ success: true, userId: newUserId }, 200);

  } catch (e) {
    return json({ error: `Kesalahan server: ${e.message}` }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
