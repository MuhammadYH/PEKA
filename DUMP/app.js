/* ============================================================
   RIHLAH DASHBOARD — app.js
   Batch 3: Full JS — data, routing, rendering, interactions
   ============================================================ */

'use strict';

/* ============================================================
   AUTH — Supabase-backed auth
   Session dikelola Supabase SDK (localStorage otomatis).
   Kita hanya simpan profil di SAVED_ACCOUNTS_KEY untuk UI
   "akun tersimpan" di profile popup.
   ============================================================ */
const SAVED_ACCOUNTS_KEY = 'rihlah-saved-accounts';

function getInitialsFromName(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/* --- Saved accounts helpers (UI only — bukan session) --- */
function getSavedAccounts() {
  try { return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY)) || []; } catch { return []; }
}
function saveAccount(profile) {
  const accounts = getSavedAccounts();
  const existing = accounts.findIndex(a => a.id === profile.display_id);
  if (existing >= 0) accounts.splice(existing, 1);
  accounts.unshift({
    id:        profile.display_id,
    nama:      profile.nama,
    role:      profile.role,
    shortName: profile.short_name,
  });
  if (accounts.length > 4) accounts.length = 4;
  try { localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts)); } catch {}
}

/* --- Session helpers — delegasi ke Supabase --- */
let _currentProfile = null;
function getSession()   { return _currentProfile; }
function clearSession() { _currentProfile = null; }

/* ============================================================
   AUTH — Login Screen Controller (Supabase)
   ============================================================ */
function initLogin() {
  const loginScreen  = document.getElementById('loginScreen');
  const loginForm    = document.getElementById('loginForm');
  const loginId      = document.getElementById('loginId');
  const loginPw      = document.getElementById('loginPw');
  const loginSubmit  = document.getElementById('loginSubmit');
  const loginError   = document.getElementById('loginError');
  const loginErrMsg  = document.getElementById('loginErrorMsg');
  const pwToggle     = document.getElementById('loginPwToggle');
  const loginTheme   = document.getElementById('loginThemeToggle');

  if (!loginScreen) return;

  // Password visibility toggle
  pwToggle?.addEventListener('click', () => {
    const isText = loginPw.type === 'text';
    loginPw.type = isText ? 'password' : 'text';
    pwToggle.querySelector('.pw-eye-show').style.display = isText ? '' : 'none';
    pwToggle.querySelector('.pw-eye-hide').style.display = isText ? 'none' : '';
    pwToggle.setAttribute('aria-label', isText ? 'Tampilkan kata sandi' : 'Sembunyikan kata sandi');
  });

  // Theme toggle pada halaman login
  loginTheme?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('rihlah-theme', next); } catch {}
  });

  // Form submit → Supabase Auth
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;

    const inputId = loginId.value.trim().toUpperCase();
    const inputPw = loginPw.value;

    if (!inputId || !inputPw) {
      loginErrMsg.textContent = 'ID pengguna dan kata sandi wajib diisi.';
      loginError.hidden = false;
      return;
    }

    loginSubmit.classList.add('login-submit--loading');
    loginSubmit.disabled = true;

    const result = await window.RIHLAH_DB.authLogin(inputId, inputPw);

    loginSubmit.classList.remove('login-submit--loading');
    loginSubmit.disabled = false;

    if (result.error) {
      loginErrMsg.textContent = result.error.includes('Invalid') || result.error.includes('credentials')
        ? 'ID pengguna atau kata sandi tidak sesuai.'
        : result.error;
      loginError.hidden = false;
      loginPw.value = '';
      loginPw.focus();
      return;
    }

    // Sukses
    _currentProfile = result.profile;
    saveAccount(result.profile);
    syncSidebarUser({
      nama:      result.profile.nama,
      shortName: result.profile.short_name,
      role:      result.profile.role,
      id:        result.profile.display_id,
    });

    loginScreen.style.transition = 'opacity 300ms ease';
    loginScreen.style.opacity = '0';
    setTimeout(async () => {
      loginScreen.hidden = true;
      loginScreen.style.opacity = '';
      // Muat data dari Supabase setelah login
      await loadAppData();
    }, 300);
  });
}

/* ============================================================
   AUTH — Sync sidebar user widget from session
   ============================================================ */
function syncSidebarUser(user) {
  const initials = getInitialsFromName(user.shortName || user.nama);
  const el = (id) => document.getElementById(id);

  if (el('sidebarAvatar'))   el('sidebarAvatar').textContent   = initials;
  if (el('sidebarUserName')) el('sidebarUserName').textContent = user.shortName || user.nama;
  if (el('sidebarUserRole')) el('sidebarUserRole').textContent = user.role;

  // Sync popup header too
  if (el('ppAvatar')) el('ppAvatar').textContent = initials;
  if (el('ppName'))   el('ppName').textContent   = user.nama;
  if (el('ppRole'))   el('ppRole').textContent   = user.role;
  if (el('ppId'))     el('ppId').textContent      = user.id;
}

/* ============================================================
   PROFILE POPUP — Account switcher
   ============================================================ */
function initProfilePopup() {
  const userBtn       = document.getElementById('sidebarUserBtn');
  const popup         = document.getElementById('profilePopup');
  const accountsList  = document.getElementById('profileAccountsList');
  const addAccountBtn = document.getElementById('profileAddAccount');
  const logoutBtn     = document.getElementById('profileLogout');

  if (!userBtn || !popup) return;

  function openPopup() {
    // Render saved accounts list
    renderSavedAccounts();
    popup.hidden = false;
    userBtn.classList.add('sidebar__user--open');
    userBtn.setAttribute('aria-expanded', 'true');
  }

  function closePopup() {
    popup.hidden = true;
    userBtn.classList.remove('sidebar__user--open');
    userBtn.setAttribute('aria-expanded', 'false');
  }

  function renderSavedAccounts() {
    const accounts = getSavedAccounts();
    const session  = getSession();

    if (!accountsList) return;
    // Clear existing account items (preserve the label)
    const label = accountsList.querySelector('.profile-accounts__label');
    accountsList.innerHTML = '';
    if (label) accountsList.appendChild(label);

    if (!accounts.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 8px 16px; font-size: 12px; color: var(--color-text-muted);';
      empty.textContent = 'Belum ada akun tersimpan';
      accountsList.appendChild(empty);
      return;
    }

    accounts.forEach(acc => {
      const isActive = session && session.id === acc.id;
      const btn = document.createElement('button');
      btn.className = 'profile-account-item' + (isActive ? ' profile-account-item--active' : '');
      btn.innerHTML = `
        <div class="profile-account-item__avatar">${getInitialsFromName(acc.shortName || acc.nama)}</div>
        <div class="profile-account-item__info">
          <div class="profile-account-item__name">${acc.shortName || acc.nama}</div>
          <div class="profile-account-item__role">${acc.role}</div>
        </div>
        ${isActive ? `<span class="profile-account-item__check">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="4 10 8 14 16 6"/>
          </svg>
        </span>` : ''}
      `;

      if (!isActive) {
        btn.addEventListener('click', () => switchAccount(acc));
      }

      accountsList.appendChild(btn);
    });
  }

  // Toggle popup on click
  userBtn.addEventListener('click', () => {
    popup.hidden ? openPopup() : closePopup();
  });

  // Keyboard: Enter / Space opens popup
  userBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      popup.hidden ? openPopup() : closePopup();
    }
    if (e.key === 'Escape') closePopup();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!popup.hidden && !popup.contains(e.target) && !userBtn.contains(e.target)) {
      closePopup();
    }
  });

  // Add / switch account → go to login
  addAccountBtn?.addEventListener('click', () => {
    closePopup();
    showLoginScreen();
  });

  // Logout
  logoutBtn?.addEventListener('click', async () => {
    closePopup();
    await window.RIHLAH_DB.authLogout();
    clearSession();
    showLoginScreen();
    if (typeof showToast === 'function') {
      showToast('info', 'Keluar berhasil', 'Sampai jumpa!', 3000);
    }
  });
}

function switchAccount(acc) {
  // For saved accounts we only have metadata, not passwords.
  // Show login pre-filled with their ID so they can re-authenticate.
  clearSession();
  showLoginScreen(acc.id);
}

function showLoginScreen(prefillId = '') {
  const loginScreen = document.getElementById('loginScreen');
  if (!loginScreen) return;
  loginScreen.style.opacity = '0';
  loginScreen.hidden = false;
  requestAnimationFrame(() => {
    loginScreen.style.transition = 'opacity 300ms ease';
    loginScreen.style.opacity = '1';
  });
  // Pre-fill ID if provided
  const loginId = document.getElementById('loginId');
  if (loginId && prefillId) {
    loginId.value = prefillId;
    const loginPw = document.getElementById('loginPw');
    if (loginPw) loginPw.focus();
  } else if (loginId) {
    loginId.focus();
  }
}



/* ============================================================
   1. MOCK DATA
   ============================================================ */
const DATA = {
  pengawas: {
    nama: 'H. Dr. Abdul Rahman, M.Kes',
    id: 'PWS-001',
    role: 'Pengawas Pusat',
  },

  kelompok: [
    { id: 'klp-1', nama: 'Kelompok 1', ketua: 'H. Musthofa Kamal', ketuaId: 'KTU-001' },
    { id: 'klp-2', nama: 'Kelompok 2', ketua: 'H. Wahyu Santoso',  ketuaId: 'KTU-002' },
    { id: 'klp-3', nama: 'Kelompok 3', ketua: 'Hj. Fatimah Zahra', ketuaId: 'KTU-003' },
  ],

  jamaah: [
    // Kelompok 1
    { id: 'JMH-001', gelang: 'RIH001', nama: 'Ahmad Fauzi',         umur: 58, kelompokId: 'klp-1', status: 'hijau',  penyakit: 'Hipertensi',           spo2: 98, hr: 72,  rr: 16, online: true,  batt: 82, alertTerakhir: null,                       waktuAlert: null,           noGelang: '001A' },
    { id: 'JMH-002', gelang: 'RIH002', nama: 'Siti Aminah',          umur: 63, kelompokId: 'klp-1', status: 'kuning', penyakit: 'Diabetes Tipe 2',      spo2: 95, hr: 88,  rr: 20, online: true,  batt: 61, alertTerakhir: 'SpO₂ turun ke 95%',      waktuAlert: '08:42',        noGelang: '001B' },
    { id: 'JMH-003', gelang: 'RIH003', nama: 'Yusuf Rahman',         umur: 71, kelompokId: 'klp-1', status: 'merah',  penyakit: 'Jantung Koroner',      spo2: 89, hr: 118, rr: 26, online: true,  batt: 45, alertTerakhir: 'HR melebihi 110 bpm',    waktuAlert: '09:15',        noGelang: '001C' },
    { id: 'JMH-004', gelang: 'RIH004', nama: 'Halimah Tusyadiah',    umur: 55, kelompokId: 'klp-1', status: 'hijau',  penyakit: '-',                    spo2: 99, hr: 68,  rr: 14, online: true,  batt: 90, alertTerakhir: null,                       waktuAlert: null,           noGelang: '001D' },
    { id: 'JMH-005', gelang: 'RIH005', nama: 'Ridwan Kamil',         umur: 60, kelompokId: 'klp-1', status: 'hijau',  penyakit: 'Asma ringan',          spo2: 97, hr: 74,  rr: 17, online: true,  batt: 77, alertTerakhir: null,                       waktuAlert: null,           noGelang: '001E' },
    { id: 'JMH-006', gelang: 'RIH006', nama: 'Nurul Hidayah',        umur: 49, kelompokId: 'klp-1', status: 'hijau',  penyakit: '-',                    spo2: 98, hr: 70,  rr: 15, online: false, batt: 18, alertTerakhir: 'Gelang offline',          waktuAlert: '07:30',        noGelang: '001F' },
    // Kelompok 2
    { id: 'JMH-007', gelang: 'RIH007', nama: 'Bambang Sutrisno',     umur: 67, kelompokId: 'klp-2', status: 'hijau',  penyakit: 'Hipertensi',           spo2: 96, hr: 78,  rr: 18, online: true,  batt: 55, alertTerakhir: null,                       waktuAlert: null,           noGelang: '002A' },
    { id: 'JMH-008', gelang: 'RIH008', nama: 'Aisyah Putri',         umur: 52, kelompokId: 'klp-2', status: 'hijau',  penyakit: '-',                    spo2: 99, hr: 65,  rr: 14, online: true,  batt: 93, alertTerakhir: null,                       waktuAlert: null,           noGelang: '002B' },
    { id: 'JMH-009', gelang: 'RIH009', nama: 'Darmawan Hadi',        umur: 74, kelompokId: 'klp-2', status: 'kuning', penyakit: 'Stroke Ringan',        spo2: 94, hr: 92,  rr: 21, online: true,  batt: 38, alertTerakhir: 'RR meningkat 21 bpm',     waktuAlert: '09:02',        noGelang: '002C' },
    { id: 'JMH-010', gelang: 'RIH010', nama: 'Sumiati',              umur: 59, kelompokId: 'klp-2', status: 'hijau',  penyakit: 'Kolesterol',           spo2: 97, hr: 75,  rr: 16, online: true,  batt: 72, alertTerakhir: null,                       waktuAlert: null,           noGelang: '002D' },
    { id: 'JMH-011', gelang: 'RIH011', nama: 'Fathur Rozy',          umur: 64, kelompokId: 'klp-2', status: 'merah',  penyakit: 'Diabetes + Hipertensi', spo2: 88, hr: 125, rr: 28, online: true,  batt: 50, alertTerakhir: 'SpO₂ kritis 88%',        waktuAlert: '09:20',        noGelang: '002E' },
    { id: 'JMH-012', gelang: 'RIH012', nama: 'Kartini Wulandari',    umur: 56, kelompokId: 'klp-2', status: 'hijau',  penyakit: '-',                    spo2: 98, hr: 69,  rr: 15, online: true,  batt: 84, alertTerakhir: null,                       waktuAlert: null,           noGelang: '002F' },
    // Kelompok 3
    { id: 'JMH-013', gelang: 'RIH013', nama: 'Hj. Mariyam',          umur: 68, kelompokId: 'klp-3', status: 'hijau',  penyakit: 'Asam Urat',            spo2: 97, hr: 71,  rr: 16, online: true,  batt: 66, alertTerakhir: null,                       waktuAlert: null,           noGelang: '003A' },
    { id: 'JMH-014', gelang: 'RIH014', nama: 'Abdul Hamid',          umur: 70, kelompokId: 'klp-3', status: 'kuning', penyakit: 'Jantung + Hipertensi', spo2: 93, hr: 96,  rr: 22, online: true,  batt: 41, alertTerakhir: 'HR 96 bpm — pantau',      waktuAlert: '08:55',        noGelang: '003B' },
    { id: 'JMH-015', gelang: 'RIH015', nama: 'Zainab Alatas',        umur: 61, kelompokId: 'klp-3', status: 'hijau',  penyakit: '-',                    spo2: 99, hr: 67,  rr: 14, online: true,  batt: 89, alertTerakhir: null,                       waktuAlert: null,           noGelang: '003C' },
    { id: 'JMH-016', gelang: 'RIH016', nama: 'Mochtar Effendi',      umur: 66, kelompokId: 'klp-3', status: 'hijau',  penyakit: 'Hipertensi',           spo2: 96, hr: 80,  rr: 17, online: true,  batt: 73, alertTerakhir: null,                       waktuAlert: null,           noGelang: '003D' },
    { id: 'JMH-017', gelang: 'RIH017', nama: 'Robiatul Adawiyah',    umur: 54, kelompokId: 'klp-3', status: 'hijau',  penyakit: '-',                    spo2: 98, hr: 66,  rr: 13, online: true,  batt: 95, alertTerakhir: null,                       waktuAlert: null,           noGelang: '003E' },
    { id: 'JMH-018', gelang: 'RIH018', nama: 'Syamsuddin Latif',     umur: 72, kelompokId: 'klp-3', status: 'hijau',  penyakit: 'Kolesterol + Asma',    spo2: 96, hr: 77,  rr: 18, online: false, batt: 12, alertTerakhir: 'Baterai rendah 12%',      waktuAlert: '06:50',        noGelang: '003F' },
  ],

  // Gelang yang belum dibagikan
  gelangUnassigned: ['RIH019', 'RIH020', 'RIH021'],

  // Trend data: 7 hari terakhir
  trend: [
    { hari: 'Sen', hijau: 15, kuning: 2, merah: 1 },
    { hari: 'Sel', hijau: 14, kuning: 3, merah: 1 },
    { hari: 'Rab', hijau: 13, kuning: 3, merah: 2 },
    { hari: 'Kam', hijau: 14, kuning: 3, merah: 1 },
    { hari: 'Jum', hijau: 13, kuning: 4, merah: 1 },
    { hari: 'Sab', hijau: 13, kuning: 3, merah: 2 },
    { hari: 'Min', hijau: 12, kuning: 4, merah: 2 },
  ],
};

/* ============================================================
   2. STATE
   ============================================================ */
const STATE = {
  activePage: 'dashboard',
  filterStatus: 'all',
  searchQuery: '',
  expandedJamaah: null,
  expandedVitals: null,
  activeSubtab: 'registrasi',
};

/* ============================================================
   3. DOM SELECTORS
   ============================================================ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const DOM = {
  sidebar:        $('#sidebar'),
  overlay:        $('#sidebarOverlay'),
  hamburgerBtn:   $('#hamburgerBtn'),
  navItems:       $$('.nav__item'),
  breadcrumb:     $('#breadcrumbLabel'),
  lastUpdated:    $('#lastUpdated'),
  alertBadge:     $('#alertBadge'),
  alertBellBtn:   $('#alertBellBtn'),
  themeToggleBtn: $('#themeToggleBtn'),

  // Dashboard
  statTotal:      $('#statTotal'),
  statActive:     $('#statActive'),
  statHijau:      $('#statHijau'),
  statKuning:     $('#statKuning'),
  statMerah:      $('#statMerah'),
  statAlert:      $('#statAlert'),
  alertsList:     $('#alertsList'),
  alertCount:     $('#alertCount'),
  trendChart:     $('#trendChart'),
  btnLihatAlert:  $('#btnLihatAlert'),

  // Monitoring
  jamaahSearch:   $('#jamaahSearch'),
  filterChips:    $$('.chip'),
  groupsContainer:$('#groupsContainer'),

  // Settings
  ketuaList:      $('#ketuaList'),
  subtabs:        $$('.subtab'),
  gelangStatusGrid: $('#gelangStatusGrid'),
  distribusiBody: $('#distribusiTableBody'),
  btnDaftarGelang:$('#btnDaftarGelang'),
  btnSaveThreshold: $('#btnSaveThreshold'),

  // Modal
  alertModal:     $('#alertModal'),
  alertModalTitle:$('#alertModalTitle'),
  alertModalBody: $('#alertModalBody'),
  alertModalClose:$('#alertModalClose'),
  alertModalCancel:$('#alertModalCancel'),
  btnHubungiPetugas: $('#btnHubungiPetugas'),

  // Toast
  toastContainer: $('#toastContainer'),
};

/* ============================================================
   4. UTILITIES
   ============================================================ */
function getStatusLabel(status) {
  return { hijau: 'Hijau', kuning: 'Kuning', merah: 'Merah' }[status] || status;
}

function getStatusEmoji(status) {
  return { hijau: '🟩', kuning: '🟨', merah: '🟥' }[status] || '⬜';
}

function getVitalClass(key, val) {
  if (key === 'spo2') {
    if (val < 90) return 'vital-card--danger';
    if (val < 95) return 'vital-card--warning';
  }
  if (key === 'hr') {
    if (val > 115) return 'vital-card--danger';
    if (val > 100) return 'vital-card--warning';
  }
  if (key === 'rr') {
    if (val > 25) return 'vital-card--danger';
    if (val > 20) return 'vital-card--warning';
  }
  return '';
}

function formatTime(str) {
  if (!str) return '—';
  return str;
}

function getKelompok(id) {
  return DATA.kelompok.find(k => k.id === id) || {};
}

function getAlerts() {
  return DATA.jamaah.filter(j => j.alertTerakhir !== null);
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function nowTimeString() {
  const d = new Date();
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ============================================================
   5. TOAST SYSTEM
   ============================================================ */
function showToast(type, title, msg, duration = 4000) {
  const icons = { success: '✅', warning: '⚠️', danger: '🚨', info: 'ℹ️' };
  const id = 'toast-' + Date.now();

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.id = id;
  el.innerHTML = `
    <span class="toast__icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast__body">
      <div class="toast__title">${title}</div>
      ${msg ? `<div class="toast__msg">${msg}</div>` : ''}
    </div>
    <button class="toast__close" aria-label="Tutup notifikasi">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
        <line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/>
      </svg>
    </button>
  `;

  el.querySelector('.toast__close').addEventListener('click', () => dismissToast(id));
  DOM.toastContainer.prepend(el);

  if (duration > 0) setTimeout(() => dismissToast(id), duration);
}

function dismissToast(id) {
  const el = $('#' + id);
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateX(20px)';
  el.style.transition = 'opacity 0.2s, transform 0.2s';
  setTimeout(() => el.remove(), 220);
}

/* ============================================================
   6. ROUTING / PAGE NAVIGATION
   ============================================================ */
const PAGE_LABELS = {
  dashboard:  'Dashboard',
  monitoring: 'Monitoring Jamaah',
  settings:   'Settings',
};

function navigateTo(page) {
  if (!['dashboard', 'monitoring', 'settings'].includes(page)) return;

  // Update pages
  $$('.page').forEach(p => p.classList.remove('page--active'));
  $(`#page-${page}`).classList.add('page--active');

  // Update nav
  DOM.navItems.forEach(item => {
    item.classList.toggle('nav__item--active', item.dataset.page === page);
  });

  // Update breadcrumb
  DOM.breadcrumb.textContent = PAGE_LABELS[page];

  STATE.activePage = page;

  // Close sidebar on mobile
  closeSidebar();

  // Page-specific init
  if (page === 'monitoring') renderMonitoring();
  if (page === 'settings')   renderSettings();
}

/* ============================================================
   7. SIDEBAR (MOBILE)
   ============================================================ */
function openSidebar() {
  DOM.sidebar.classList.add('sidebar--open');
  DOM.overlay.classList.add('sidebar__overlay--visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  DOM.sidebar.classList.remove('sidebar--open');
  DOM.overlay.classList.remove('sidebar__overlay--visible');
  document.body.style.overflow = '';
}

/* ============================================================
   8. DASHBOARD — STATS
   ============================================================ */
function computeStats() {
  const total    = DATA.jamaah.length;
  const active   = DATA.jamaah.filter(j => j.online).length;
  const hijau    = DATA.jamaah.filter(j => j.status === 'hijau').length;
  const kuning   = DATA.jamaah.filter(j => j.status === 'kuning').length;
  const merah    = DATA.jamaah.filter(j => j.status === 'merah').length;
  const alerts   = getAlerts().length;
  return { total, active, hijau, kuning, merah, alerts };
}

function animateCounter(el, target, duration = 700) {
  const start = parseInt(el.textContent) || 0;
  const step  = (target - start) / (duration / 16);
  let current = start;

  const tick = () => {
    current += step;
    if ((step > 0 && current >= target) || (step < 0 && current <= target)) {
      el.textContent = target;
      return;
    }
    el.textContent = Math.round(current);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderStats() {
  const s = computeStats();
  animateCounter(DOM.statTotal,  s.total);
  animateCounter(DOM.statActive, s.active);
  animateCounter(DOM.statHijau,  s.hijau);
  animateCounter(DOM.statKuning, s.kuning);
  animateCounter(DOM.statMerah,  s.merah);
  animateCounter(DOM.statAlert,  s.alerts);

  // Badge
  DOM.alertBadge.textContent = s.alerts;
  DOM.alertCount.textContent = `${s.alerts} aktif`;
}

/* ============================================================
   9. DASHBOARD — ALERTS PANEL
   ============================================================ */
function renderAlerts() {
  const alerts = getAlerts();

  if (!alerts.length) {
    DOM.alertsList.innerHTML = `<li class="alerts-list__empty">Tidak ada alert aktif 🟩</li>`;
    return;
  }

  DOM.alertsList.innerHTML = alerts.map(j => {
    const klp = getKelompok(j.kelompokId);
    return `
      <li class="alert-item alert-item--${j.status}" 
          role="button" tabindex="0"
          data-id="${j.id}"
          aria-label="Lihat detail alert ${j.nama}">
        <span class="alert-item__dot"></span>
        <div class="alert-item__body">
          <div class="alert-item__name">${j.nama}</div>
          <div class="alert-item__desc">${j.alertTerakhir} · ${klp.nama || ''} · ${j.gelang}</div>
        </div>
        <span class="alert-item__time">${formatTime(j.waktuAlert)}</span>
      </li>
    `;
  }).join('');

  // Click on alert → open modal
  $$('.alert-item', DOM.alertsList).forEach(el => {
    const open = () => openAlertModal(el.dataset.id);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
  });
}

/* ============================================================
   10. DASHBOARD — TREND CHART (Pure SVG)
   ============================================================ */
function renderTrendChart() {
  const data   = DATA.trend;
  const W      = DOM.trendChart.clientWidth  || 600;
  const H      = 180;
  const padL   = 32;
  const padR   = 16;
  const padT   = 16;
  const padB   = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxVal = Math.max(...data.map(d => d.hijau + d.kuning + d.merah)) + 1;
  const cols   = ['hijau', 'kuning', 'merah'];
  const colors = {
    hijau:  cssVar('--color-hijau')  || '#22c55e',
    kuning: cssVar('--color-kuning') || '#f59e0b',
    merah:  cssVar('--color-merah')  || '#ef4444',
  };
  const gridColor   = cssVar('--color-border')        || '#2a3447';
  const axisColor    = cssVar('--color-text-muted')    || '#484f58';
  const xLabelColor  = cssVar('--color-text-secondary')|| '#8b949e';
  const dotStroke    = cssVar('--color-surface')       || '#161b22';

  const xPos = i => padL + (i / (data.length - 1)) * chartW;
  const yPos = v  => padT + chartH - (v / maxVal) * chartH;

  // Build polyline points for each series
  function polyPoints(key) {
    return data.map((d, i) => `${xPos(i)},${yPos(d[key])}`).join(' ');
  }

  // Y grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const y = padT + chartH * t;
    const val = Math.round(maxVal * (1 - t));
    return `
      <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
            stroke="${gridColor}" stroke-width="1" stroke-dasharray="3 4"/>
      <text x="${padL - 6}" y="${y + 4}" 
            font-size="9" fill="${axisColor}" text-anchor="end" font-family="IBM Plex Mono,monospace">${val}</text>
    `;
  }).join('');

  // X labels
  const xLabels = data.map((d, i) => `
    <text x="${xPos(i)}" y="${H - 6}" 
          font-size="10" fill="${xLabelColor}" text-anchor="middle" font-family="Inter,sans-serif">${d.hari}</text>
  `).join('');

  // Data dots
  function dots(key) {
    return data.map((d, i) => `
      <circle cx="${xPos(i)}" cy="${yPos(d[key])}" r="3.5"
              fill="${colors[key]}" stroke="${dotStroke}" stroke-width="1.5">
        <title>${d.hari}: ${d[key]} jamaah ${key}</title>
      </circle>
    `).join('');
  }

  // Area fill (subtle gradient under each line)
  function areaPath(key) {
    const pts = data.map((d, i) => `${xPos(i)},${yPos(d[key])}`).join(' L');
    const lastX = xPos(data.length - 1);
    const firstX = xPos(0);
    return `M${firstX},${yPos(data[0][key])} L${pts} L${lastX},${padT + chartH} L${firstX},${padT + chartH} Z`;
  }

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" 
         role="img" aria-label="Grafik tren kondisi jamaah 7 hari">
      <defs>
        <linearGradient id="gradH" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colors.hijau}" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="${colors.hijau}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="gradK" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colors.kuning}" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="${colors.kuning}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="gradM" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colors.merah}" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="${colors.merah}" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- Grid -->
      ${gridLines}
      ${xLabels}

      <!-- Area fills -->
      <path d="${areaPath('hijau')}"  fill="url(#gradH)"/>
      <path d="${areaPath('kuning')}" fill="url(#gradK)"/>
      <path d="${areaPath('merah')}"  fill="url(#gradM)"/>

      <!-- Lines -->
      <polyline points="${polyPoints('hijau')}"  fill="none" stroke="${colors.hijau}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="${polyPoints('kuning')}" fill="none" stroke="${colors.kuning}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="${polyPoints('merah')}"  fill="none" stroke="${colors.merah}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>

      <!-- Dots -->
      ${dots('hijau')}
      ${dots('kuning')}
      ${dots('merah')}
    </svg>
  `;

  DOM.trendChart.innerHTML = svg;
}

/* ============================================================
   11. MONITORING — RENDER GROUPS
   ============================================================ */
function renderMonitoring() {
  const query  = STATE.searchQuery.toLowerCase().trim();
  const filter = STATE.filterStatus;

  // Filter jamaah
  let filtered = DATA.jamaah.filter(j => {
    const matchStatus = filter === 'all' || j.status === filter;
    const matchSearch = !query || j.nama.toLowerCase().includes(query) || j.gelang.toLowerCase().includes(query);
    return matchStatus && matchSearch;
  });

  // Group per kelompok
  const grouped = DATA.kelompok.map(klp => ({
    kelompok: klp,
    members: filtered.filter(j => j.kelompokId === klp.id),
  })).filter(g => g.members.length > 0);

  if (!grouped.length) {
    DOM.groupsContainer.innerHTML = `
      <div class="groups-placeholder">
        Tidak ada jamaah yang sesuai dengan filter atau pencarian.
      </div>`;
    return;
  }

  DOM.groupsContainer.innerHTML = grouped.map(g => renderGroupBlock(g)).join('');

  // Re-attach expand listeners
  $$('.jamaah-row__toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleJamaahDetail(btn));
  });

  // Re-attach vitals toggle
  $$('.vitals-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleVitals(btn));
  });
}

function renderGroupBlock({ kelompok, members }) {
  const hijauC  = members.filter(m => m.status === 'hijau').length;
  const kuningC = members.filter(m => m.status === 'kuning').length;
  const merahC  = members.filter(m => m.status === 'merah').length;

  return `
    <div class="group-block" data-group="${kelompok.id}">
      <div class="group-header">
        <div class="group-header__left">
          <span class="group-badge">${kelompok.nama}</span>
          <span class="group-leader">Ketua: ${kelompok.ketua}</span>
        </div>
        <div class="group-header__right">
          <span class="group-count">${members.length} jamaah</span>
          <span class="group-status-dots">
            <span class="dot dot--hijau">${hijauC}</span>
            <span class="dot dot--kuning">${kuningC}</span>
            <span class="dot dot--merah">${merahC}</span>
          </span>
        </div>
      </div>
      <ul class="jamaah-list">
        ${members.map(j => renderJamaahRow(j)).join('')}
      </ul>
    </div>
  `;
}

function renderJamaahRow(j) {
  const klp = getKelompok(j.kelompokId);
  return `
    <li class="jamaah-row" data-id="${j.id}" data-status="${j.status}">
      <button class="jamaah-row__toggle" 
              aria-expanded="false" 
              aria-controls="detail-${j.id}"
              data-id="${j.id}">
        <span class="status-dot status-dot--${j.status}" 
              aria-label="Status ${getStatusLabel(j.status)}"></span>
        <span class="jamaah-row__name">${j.nama}</span>
        <span class="jamaah-row__meta">
          <span class="gelang-id">${j.gelang}</span>
          <span class="vitals-mini">
            SpO₂ ${j.spo2}% &nbsp;·&nbsp; HR ${j.hr}
            ${!j.online ? ' &nbsp;·&nbsp; <span style="color:var(--color-text-muted)">Offline</span>' : ''}
          </span>
        </span>
        <span class="jamaah-row__chevron">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </span>
      </button>

      <div class="jamaah-detail" id="detail-${j.id}" hidden>
        <!-- Informasi Umum -->
        <div class="detail-section">
          <div class="detail-section__title">Informasi Umum</div>
          <div class="detail-row">
            <span class="detail-row__key">Nama Lengkap</span>
            <span class="detail-row__val" style="font-family:var(--font-sans);font-size:13px">${j.nama}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__key">Umur</span>
            <span class="detail-row__val">${j.umur} tahun</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__key">Kelompok</span>
            <span class="detail-row__val">${klp.nama || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__key">No. Gelang</span>
            <span class="detail-row__val">${j.gelang}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__key">Baterai</span>
            <span class="detail-row__val" style="color:${j.batt < 20 ? 'var(--color-kuning)' : 'inherit'}">${j.batt}%</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__key">Koneksi</span>
            <span class="detail-row__val" style="color:${j.online ? 'var(--color-hijau)' : 'var(--color-text-muted)'}">
              ${j.online ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        <!-- Kondisi Kesehatan -->
        <div class="detail-section">
          <div class="detail-section__title">Kondisi Kesehatan</div>
          <div class="detail-row">
            <span class="detail-row__key">Status Triase</span>
            <span class="triage-badge triage-badge--${j.status}">${getStatusLabel(j.status)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__key">Penyakit Bawaan</span>
            <span class="detail-row__val" style="font-family:var(--font-sans);font-size:12px;text-align:right">${j.penyakit}</span>
          </div>
        </div>

        <!-- Detail Medis (Dropdown) -->
        <div class="vitals-dropdown">
          <button class="vitals-toggle" 
                  aria-expanded="false" 
                  aria-controls="vitals-${j.id}"
                  data-vitals-id="${j.id}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 6l4 4 4-4"/>
            </svg>
            Detail Medis
          </button>
          <div class="vitals-content" id="vitals-${j.id}" hidden>
            <div class="vital-card ${getVitalClass('spo2', j.spo2)}">
              <span class="vital-card__label">SpO₂</span>
              <span class="vital-card__value">${j.spo2}</span>
              <span class="vital-card__unit">%</span>
            </div>
            <div class="vital-card ${getVitalClass('hr', j.hr)}">
              <span class="vital-card__label">Heart Rate</span>
              <span class="vital-card__value">${j.hr}</span>
              <span class="vital-card__unit">bpm</span>
            </div>
            <div class="vital-card ${getVitalClass('rr', j.rr)}">
              <span class="vital-card__label">Resp. Rate</span>
              <span class="vital-card__value">${j.rr}</span>
              <span class="vital-card__unit">bpm</span>
            </div>
          </div>
        </div>

        <!-- Riwayat Alert -->
        <div class="alert-history">
          <div class="detail-section__title">Riwayat Alert</div>
          ${j.alertTerakhir
            ? `<div class="alert-history-item">
                <span class="dot-sm dot-sm--${j.status}"></span>
                <span>${j.alertTerakhir}</span>
                <span class="alert-history-item__time">${formatTime(j.waktuAlert)}</span>
               </div>`
            : `<div class="alert-history-item" style="color:var(--color-text-muted)">
                <span class="dot-sm" style="background:var(--color-border)"></span>
                <span>Tidak ada alert</span>
               </div>`
          }
        </div>

        <!-- Aksi -->
        <div class="detail-actions">
          <button class="btn btn--danger btn--sm" 
                  data-jamaah-id="${j.id}"
                  onclick="handleHubungiPetugas('${j.id}')">
            📞 Hubungi Petugas Kesehatan
          </button>
          ${j.status !== 'hijau' ? `
          <button class="btn btn--secondary btn--sm"
                  onclick="openAlertModal('${j.id}')">
            Detail Alert
          </button>` : ''}
        </div>
      </div>
    </li>
  `;
}

/* ============================================================
   12. MONITORING — EXPAND / COLLAPSE
   ============================================================ */
function toggleJamaahDetail(btn) {
  const id       = btn.dataset.id;
  const detail   = $(`#detail-${id}`);
  const isOpen   = btn.getAttribute('aria-expanded') === 'true';

  // Close previously open (optional: single-expand mode)
  if (STATE.expandedJamaah && STATE.expandedJamaah !== id) {
    const prevBtn    = $(`[aria-controls="detail-${STATE.expandedJamaah}"]`);
    const prevDetail = $(`#detail-${STATE.expandedJamaah}`);
    if (prevBtn)    prevBtn.setAttribute('aria-expanded', 'false');
    if (prevDetail) prevDetail.hidden = true;
  }

  btn.setAttribute('aria-expanded', String(!isOpen));
  detail.hidden = isOpen;
  STATE.expandedJamaah = isOpen ? null : id;
}

function toggleVitals(btn) {
  const id      = btn.dataset.vitalsId;
  const content = $(`#vitals-${id}`);
  const isOpen  = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!isOpen));
  content.hidden = isOpen;
}

/* ============================================================
   13. MONITORING — SEARCH & FILTER
   ============================================================ */
function initMonitoringFilters() {
  // Search
  DOM.jamaahSearch.addEventListener('input', (e) => {
    STATE.searchQuery = e.target.value;
    renderMonitoring();
  });

  // Filter chips
  DOM.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      DOM.filterChips.forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      STATE.filterStatus = chip.dataset.filter;
      renderMonitoring();
    });
  });
}

/* ============================================================
   14. SETTINGS — RENDER
   ============================================================ */
function renderSettings() {
  renderKetuaList();
  renderGelangStatus();
  renderDistribusiTable();
}

function renderKetuaList() {
  if (!DOM.ketuaList) return;
  const ketuaData = DATA.kelompok.map(k => ({
    nama: k.ketua,
    kelompok: k.nama,
    id: k.ketuaId,
  }));

  DOM.ketuaList.innerHTML = ketuaData.map(k => `
    <div class="ketua-item">
      <div class="ketua-item__avatar">${getInitials(k.nama)}</div>
      <span class="ketua-item__name">${k.nama}</span>
      <span class="ketua-item__group">${k.kelompok}</span>
      <span class="settings-card__role-badge badge--ketua" style="font-size:10px;padding:2px 8px;border-radius:10px">Ketua</span>
      <button class="btn-text" style="margin-left:auto">Edit</button>
      <button class="btn-text btn-text--danger">Hapus</button>
    </div>
  `).join('');
}

function renderGelangStatus() {
  if (!DOM.gelangStatusGrid) return;

  const assignedCards = DATA.jamaah.map(j => `
    <div class="gelang-card">
      <span class="gelang-card__id">${j.gelang}</span>
      <span class="gelang-card__name">${j.nama}</span>
      <span class="gelang-card__status">
        <span class="gelang-status-dot gelang-status-dot--${j.online ? 'online' : 'offline'}"></span>
        ${j.online ? 'Online' : 'Offline'}
      </span>
      <span class="gelang-card__batt">🔋 ${j.batt}%</span>
    </div>
  `).join('');

  const unsetCards = DATA.gelangUnassigned.map(g => `
    <div class="gelang-card" style="opacity:0.5">
      <span class="gelang-card__id">${g}</span>
      <span class="gelang-card__name" style="color:var(--color-text-muted);font-style:italic">Belum Dibagikan</span>
      <span class="gelang-card__status">
        <span class="gelang-status-dot gelang-status-dot--unset"></span>
        Tidak aktif
      </span>
      <span class="gelang-card__batt">—</span>
    </div>
  `).join('');

  DOM.gelangStatusGrid.innerHTML = assignedCards + unsetCards;
}

function renderDistribusiTable() {
  if (!DOM.distribusiBody) return;

  const rows = DATA.jamaah.map(j => {
    const klp = getKelompok(j.kelompokId);
    return `
      <tr>
        <td>${j.gelang}</td>
        <td style="color:var(--color-text-primary);font-weight:500">${j.nama}</td>
        <td>${klp.nama || '—'}</td>
        <td>
          <span class="distribusi-status distribusi-status--assigned">
            <span class="gelang-status-dot gelang-status-dot--${j.online ? 'online' : 'offline'}" style="width:6px;height:6px;border-radius:50%;display:inline-block"></span>
            ${j.online ? 'Aktif' : 'Offline'}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  const unsetRows = DATA.gelangUnassigned.map(g => `
    <tr>
      <td>${g}</td>
      <td class="td-unset">Belum Dibagikan</td>
      <td class="td-unset">—</td>
      <td>
        <span class="distribusi-status distribusi-status--unset">Tidak Aktif</span>
      </td>
    </tr>
  `).join('');

  DOM.distribusiBody.innerHTML = rows + unsetRows;
}

/* ============================================================
   15. SETTINGS — SUB-TABS
   ============================================================ */
function initSubtabs() {
  DOM.subtabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.subtab;

      // Update tab buttons
      DOM.subtabs.forEach(t => {
        t.classList.toggle('subtab--active', t.dataset.subtab === target);
        t.setAttribute('aria-selected', String(t.dataset.subtab === target));
      });

      // Show/hide panels
      $$('.subtab-panel').forEach(panel => {
        const isTarget = panel.id === `subtab-${target}`;
        panel.hidden = !isTarget;
      });

      STATE.activeSubtab = target;

      // Lazy render
      if (target === 'status')     renderGelangStatus();
      if (target === 'distribusi') renderDistribusiTable();
    });
  });
}

/* ============================================================
   16. MODAL
   ============================================================ */
function openAlertModal(jamaahId) {
  const j = DATA.jamaah.find(j => j.id === jamaahId);
  if (!j) return;

  const klp = getKelompok(j.kelompokId);

  DOM.alertModalTitle.textContent = `Alert — ${j.nama}`;
  DOM.alertModalBody.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;
                  background:var(--color-${j.status}-bg);border:1px solid rgba(0,0,0,0.1);
                  border-radius:10px;">
        <span style="font-size:24px">${getStatusEmoji(j.status)}</span>
        <div>
          <div style="font-weight:700;font-size:15px">${j.nama}</div>
          <div style="font-size:12px;color:var(--color-text-secondary)">${klp.nama} · ${j.gelang}</div>
        </div>
        <span class="triage-badge triage-badge--${j.status}" style="margin-left:auto">
          ${getStatusLabel(j.status)}
        </span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="vital-card ${getVitalClass('spo2', j.spo2)}">
          <span class="vital-card__label">SpO₂</span>
          <span class="vital-card__value">${j.spo2}</span>
          <span class="vital-card__unit">%</span>
        </div>
        <div class="vital-card ${getVitalClass('hr', j.hr)}">
          <span class="vital-card__label">Heart Rate</span>
          <span class="vital-card__value">${j.hr}</span>
          <span class="vital-card__unit">bpm</span>
        </div>
        <div class="vital-card ${getVitalClass('rr', j.rr)}">
          <span class="vital-card__label">Resp. Rate</span>
          <span class="vital-card__value">${j.rr}</span>
          <span class="vital-card__unit">bpm</span>
        </div>
      </div>

      <div style="font-size:13px;color:var(--color-text-secondary);
                  padding:12px 14px;background:var(--color-surface-2);
                  border-radius:8px;border:1px solid var(--color-border-soft)">
        <div style="font-weight:600;color:var(--color-text-primary);margin-bottom:6px">🚨 Alert Terakhir</div>
        <div>${j.alertTerakhir || 'Tidak ada alert'}</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;font-family:'IBM Plex Mono',monospace">
          Waktu: ${formatTime(j.waktuAlert)}
        </div>
      </div>

      <div style="font-size:12px;color:var(--color-text-secondary)">
        <strong>Penyakit Bawaan:</strong> ${j.penyakit}
      </div>
    </div>
  `;

  // Store jamaah id for action button
  DOM.btnHubungiPetugas.dataset.jamaahId = jamaahId;

  DOM.alertModal.hidden = false;
  document.body.style.overflow = 'hidden';
  DOM.alertModalClose.focus();
}

function closeAlertModal() {
  DOM.alertModal.hidden = true;
  document.body.style.overflow = '';
}

function handleHubungiPetugas(jamaahId) {
  const j = DATA.jamaah.find(j => j.id === (jamaahId || DOM.btnHubungiPetugas.dataset.jamaahId));
  if (!j) return;
  closeAlertModal();
  showToast('danger', 'Petugas Dihubungi', `Permintaan bantuan untuk ${j.nama} telah dikirim ke petugas kesehatan.`);
}

// Expose to inline onclick
window.handleHubungiPetugas = handleHubungiPetugas;
window.openAlertModal = openAlertModal;

/* ============================================================
   17. TIMESTAMP AUTO-UPDATE
   ============================================================ */
function updateTimestamp() {
  DOM.lastUpdated.textContent = nowTimeString();
}

/* ============================================================
   18. SIMULATED LIVE DATA (mild fluctuation every 8s)
   ============================================================ */
function fluctuateData() {
  DATA.jamaah.forEach(j => {
    if (!j.online) return;
    // Small random walk on vitals
    j.spo2 = Math.min(100, Math.max(80,  j.spo2  + (Math.random() > 0.5 ? 1 : -1)));
    j.hr   = Math.min(150, Math.max(50,  j.hr    + Math.round((Math.random() - 0.5) * 4)));
    j.rr   = Math.min(35,  Math.max(10,  j.rr    + (Math.random() > 0.5 ? 1 : -1)));

    // Re-evaluate status
    const prevStatus = j.status;
    if (j.spo2 < 90 || j.hr > 115 || j.rr > 25) {
      j.status = 'merah';
    } else if (j.spo2 < 95 || j.hr > 100 || j.rr > 20) {
      j.status = 'kuning';
    } else {
      j.status = 'hijau';
    }

    // Show toast if status escalated
    if (prevStatus === 'hijau' && j.status === 'kuning') {
      showToast('warning', 'Status Berubah', `${j.nama} berubah ke status Kuning`);
      j.alertTerakhir = `Status berubah ke Kuning (SpO₂ ${j.spo2}%)`;
      j.waktuAlert    = nowTimeString();
    } else if (prevStatus !== 'merah' && j.status === 'merah') {
      showToast('danger', '🚨 Status Kritis!', `${j.nama} masuk status Merah — butuh penanganan!`, 8000);
      j.alertTerakhir = `Status kritis: SpO₂ ${j.spo2}%, HR ${j.hr}`;
      j.waktuAlert    = nowTimeString();
    }
  });

  // Refresh views
  renderStats();
  renderAlerts();
  if (STATE.activePage === 'monitoring') renderMonitoring();
  updateTimestamp();
}

/* ============================================================
   19. SETTINGS ACTIONS
   ============================================================ */
function initSettingsActions() {
  // Daftarkan Gelang
  if (DOM.btnDaftarGelang) {
    DOM.btnDaftarGelang.addEventListener('click', () => {
      const gelangId  = $('#gelangId')?.value.trim();
      const jamaahNm  = $('#gelangJamaah')?.value.trim();
      const kelompok  = $('#gelangKelompok')?.value;

      if (!gelangId || !jamaahNm || !kelompok) {
        showToast('warning', 'Form Belum Lengkap', 'Harap isi semua kolom sebelum mendaftarkan gelang.');
        return;
      }

      showToast('success', 'Gelang Terdaftar', `${gelangId} berhasil ditetapkan ke ${jamaahNm}`);
      // Reset form
      if ($('#gelangId'))       $('#gelangId').value = '';
      if ($('#gelangJamaah'))   $('#gelangJamaah').value = '';
      if ($('#gelangKelompok')) $('#gelangKelompok').value = '';
    });
  }

  // Simpan Ambang Batas
  if (DOM.btnSaveThreshold) {
    DOM.btnSaveThreshold.addEventListener('click', () => {
      showToast('success', 'Ambang Batas Disimpan', 'Pengaturan baru akan diterapkan pada pemantauan berikutnya.');
    });
  }

  // Tambah Ketua placeholder
  const btnTambah = $('#btnTambahKetua');
  if (btnTambah) {
    btnTambah.addEventListener('click', () => {
      showToast('info', 'Segera Hadir', 'Fitur tambah ketua kelompok akan tersedia di versi berikutnya.');
    });
  }
}

/* ============================================================
   20. THEME (Dark / Light Mode)
   ============================================================ */
const THEME_KEY = 'rihlah-theme';

function getActiveTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (DOM.themeToggleBtn) {
    DOM.themeToggleBtn.setAttribute(
      'aria-label',
      theme === 'light' ? 'Ganti ke mode gelap' : 'Ganti ke mode terang'
    );
    DOM.themeToggleBtn.setAttribute('title', theme === 'light' ? 'Mode Terang' : 'Mode Gelap');
  }
  // Trend chart uses hardcoded-from-CSS colors baked into the SVG markup,
  // so it needs a manual re-render whenever the palette changes.
  if (STATE.activePage === 'dashboard') renderTrendChart();
}

function initTheme() {
  // data-theme is already set by the inline script in <head> (avoids flicker);
  // just sync the button's label/icon state here.
  applyTheme(getActiveTheme());

  DOM.themeToggleBtn?.addEventListener('click', () => {
    const next = getActiveTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage unavailable */ }
    showToast('info', next === 'light' ? 'Mode Terang Aktif' : 'Mode Gelap Aktif', '', 2000);
  });
}

/* ============================================================
   21. EVENT LISTENERS — INIT
   ============================================================ */
function initEventListeners() {

  // --- Theme toggle ---
  initTheme();

  // --- Sidebar hamburger ---
  DOM.hamburgerBtn?.addEventListener('click', () => {
    DOM.sidebar.classList.contains('sidebar--open') ? closeSidebar() : openSidebar();
  });

  DOM.overlay?.addEventListener('click', closeSidebar);

  // --- Nav items ---
  DOM.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // --- Quick action buttons (data-goto) ---
  $$('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.goto));
  });

  // --- Alert bell ---
  DOM.alertBellBtn?.addEventListener('click', () => navigateTo('dashboard'));

  // --- Lihat Alert button on dashboard ---
  DOM.btnLihatAlert?.addEventListener('click', () => {
    DOM.alertsList.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // --- Alert panel items (delegated) ---
  DOM.alertsList?.addEventListener('click', (e) => {
    const item = e.target.closest('.alert-item');
    if (item) openAlertModal(item.dataset.id);
  });

  // --- Modal close ---
  DOM.alertModalClose?.addEventListener('click',  closeAlertModal);
  DOM.alertModalCancel?.addEventListener('click', closeAlertModal);
  DOM.alertModal?.addEventListener('click', (e) => {
    if (e.target === DOM.alertModal) closeAlertModal();
  });

  // --- Modal Hubungi Petugas ---
  DOM.btnHubungiPetugas?.addEventListener('click', handleHubungiPetugas);

  // Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !DOM.alertModal.hidden) closeAlertModal();
  });

  // --- Monitoring filters ---
  initMonitoringFilters();

  // --- Settings sub-tabs ---
  initSubtabs();

  // --- Settings actions ---
  initSettingsActions();

  // --- Notification toggles (just toast feedback) ---
  $$('.toggle__input').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const label = e.target.closest('.notif-item')?.querySelector('.notif-item__name')?.textContent || 'Notifikasi';
      const state = e.target.checked ? 'diaktifkan' : 'dinonaktifkan';
      showToast('info', `${label} ${state}`, '');
    });
  });

  // --- Window resize: re-render chart ---
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (STATE.activePage === 'dashboard') renderTrendChart();
    }, 200);
  });
}

/* ============================================================
   22. LOAD APP DATA — dipanggil setelah login sukses
   ============================================================ */
async function loadAppData() {
  // Render skeleton dulu, lalu isi dari Supabase
  renderStats();
  renderAlerts();
  updateTimestamp();
  requestAnimationFrame(() => renderTrendChart());

  // Muat data dari Supabase dan update DATA global
  try {
    const [jamaahRes, kelompokRes, alertsRes] = await Promise.all([
      window.RIHLAH_DB.fetchJamaah(),
      window.RIHLAH_DB.fetchKelompok(),
      window.RIHLAH_DB.fetchActiveAlerts(),
    ]);

    if (!jamaahRes.error && jamaahRes.data) {
      // Adaptasi format Supabase → format DATA.jamaah yang dipakai renderer
      DATA.jamaah = jamaahRes.data.map(j => ({
        id:           j.id,
        gelang:       j.hajj_band?.band_code || '-',
        nama:         j.nama,
        umur:         j.umur,
        kelompokId:   j.kelompok_id,
        status:       j.last_status || 'hijau',
        penyakit:     j.penyakit || '-',
        spo2:         j.last_spo2 || 0,
        hr:           j.last_hr   || 0,
        rr:           j.last_rr   || 0,
        online:       j.hajj_band?.is_active ?? false,
        batt:         j.hajj_band?.battery_pct ?? 0,
        alertTerakhir: null,
        waktuAlert:   null,
        noGelang:     j.hajj_band?.band_code || '-',
      }));
    }

    if (!kelompokRes.error && kelompokRes.data) {
      DATA.kelompok = kelompokRes.data.map(k => ({
        id:      k.id,
        nama:    k.nama,
        ketua:   k.users?.short_name || '-',
        ketuaId: k.users?.display_id || '-',
      }));
    }

    // Re-render dengan data asli
    renderStats();
    renderAlerts();
    requestAnimationFrame(() => renderTrendChart());

    // Subscribe realtime updates
    window.RIHLAH_DB.subscribeJamaahUpdates((payload) => {
      const updated = payload.new;
      const idx = DATA.jamaah.findIndex(j => j.id === updated.id);
      if (idx >= 0) {
        DATA.jamaah[idx].status = updated.last_status || DATA.jamaah[idx].status;
        DATA.jamaah[idx].spo2   = updated.last_spo2   ?? DATA.jamaah[idx].spo2;
        DATA.jamaah[idx].hr     = updated.last_hr     ?? DATA.jamaah[idx].hr;
        DATA.jamaah[idx].rr     = updated.last_rr     ?? DATA.jamaah[idx].rr;
        if (STATE.activePage === 'dashboard') { renderStats(); renderAlerts(); }
      }
    });

    window.RIHLAH_DB.subscribeNewAlerts((payload) => {
      const a = payload.new;
      showToast(
        a.severity === 'merah' ? 'danger' : 'warning',
        'Alert Baru',
        a.pesan || a.nilai || 'Cek monitoring segera.',
        6000
      );
      if (STATE.activePage === 'dashboard') renderAlerts();
    });

    showToast('info', 'RIHLAH Aktif', 'Sistem monitoring jamaah berjalan normal.', 4000);

  } catch (err) {
    console.error('loadAppData error:', err);
    showToast('warning', 'Gagal memuat data', 'Periksa koneksi internet Anda.', 5000);
  }
}

/* ============================================================
   23. BOOT
   ============================================================ */
async function boot() {
  // Init profile popup
  initProfilePopup();

  // Cek sesi Supabase yang masih aktif (misal: refresh halaman)
  const session = await window.RIHLAH_DB.authGetSession();

  if (session) {
    // Sudah login — ambil profil & langsung buka app
    const profileRes = await window.RIHLAH_DB.fetchCurrentUserProfile();
    if (profileRes.data) {
      _currentProfile = profileRes.data;
      saveAccount(profileRes.data);
      syncSidebarUser({
        nama:      profileRes.data.nama,
        shortName: profileRes.data.short_name,
        role:      profileRes.data.role,
        id:        profileRes.data.display_id,
      });
      document.getElementById('loginScreen').hidden = true;
      await loadAppData();
    } else {
      // Profil tidak ada — minta login ulang
      showLoginScreen();
    }
  } else {
    // Belum login — tampilkan login screen
    showLoginScreen();
  }

  // Init login form handler
  initLogin();

  // Init semua event listener UI
  initEventListeners();

  // Auto-refresh timestamp setiap detik
  setInterval(updateTimestamp, 1000);

  // Realtime fluctuasi data (mock, hapus saat production penuh)
  setInterval(fluctuateData, 8000);
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
