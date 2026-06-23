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

    const result = await window.PEKA_DB.authLogin(inputId, inputPw);

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
  admin: {
    nama: 'Dr. Abdul Rahman, M.Kes',
    id: 'ADM-001',
    role: 'Admin Pusat',
  },

  armada: [
    { id: 'arm-1', nama: 'Armada 1', supervisor: 'Musthofa Kamal', supervisorId: 'SPV-001' },
    { id: 'arm-2', nama: 'Armada 2', supervisor: 'Wahyu Santoso',  supervisorId: 'SPV-002' },
    { id: 'arm-3', nama: 'Armada 3', supervisor: 'Fatimah Zahra', supervisorId: 'SPV-003' },
  ],

  sopir: [
    // Armada 1
    { id: 'SPR-001', smartwatch: 'SWT001', nama: 'Ahmad Fauzi',         umur: 58, armadaId: 'arm-1', status: 'hijau',  riwayatKesehatan: 'Hipertensi',           spo2: 98, hr: 72,  rr: 16, online: true,  batt: 82, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '001A' },
    { id: 'SPR-002', smartwatch: 'SWT002', nama: 'Siti Aminah',          umur: 63, armadaId: 'arm-1', status: 'kuning', riwayatKesehatan: 'Diabetes Tipe 2',      spo2: 95, hr: 88,  rr: 20, online: true,  batt: 61, alertTerakhir: 'SpO₂ turun ke 95%',      waktuAlert: '08:42',        noSmartwatch: '001B' },
    { id: 'SPR-003', smartwatch: 'SWT003', nama: 'Yusuf Rahman',         umur: 71, armadaId: 'arm-1', status: 'merah',  riwayatKesehatan: 'Jantung Koroner',      spo2: 89, hr: 118, rr: 26, online: true,  batt: 45, alertTerakhir: 'HR melebihi 110 bpm',    waktuAlert: '09:15',        noSmartwatch: '001C' },
    { id: 'SPR-004', smartwatch: 'SWT004', nama: 'Halimah Tusyadiah',    umur: 55, armadaId: 'arm-1', status: 'hijau',  riwayatKesehatan: '-',                    spo2: 99, hr: 68,  rr: 14, online: true,  batt: 90, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '001D' },
    { id: 'SPR-005', smartwatch: 'SWT005', nama: 'Ridwan Kamil',         umur: 60, armadaId: 'arm-1', status: 'hijau',  riwayatKesehatan: 'Asma ringan',          spo2: 97, hr: 74,  rr: 17, online: true,  batt: 77, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '001E' },
    { id: 'SPR-006', smartwatch: 'SWT006', nama: 'Nurul Hidayah',        umur: 49, armadaId: 'arm-1', status: 'hijau',  riwayatKesehatan: '-',                    spo2: 98, hr: 70,  rr: 15, online: false, batt: 18, alertTerakhir: 'Smartwatch offline',          waktuAlert: '07:30',        noSmartwatch: '001F' },
    // Armada 2
    { id: 'SPR-007', smartwatch: 'SWT007', nama: 'Bambang Sutrisno',     umur: 67, armadaId: 'arm-2', status: 'hijau',  riwayatKesehatan: 'Hipertensi',           spo2: 96, hr: 78,  rr: 18, online: true,  batt: 55, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '002A' },
    { id: 'SPR-008', smartwatch: 'SWT008', nama: 'Aisyah Putri',         umur: 52, armadaId: 'arm-2', status: 'hijau',  riwayatKesehatan: '-',                    spo2: 99, hr: 65,  rr: 14, online: true,  batt: 93, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '002B' },
    { id: 'SPR-009', smartwatch: 'SWT009', nama: 'Darmawan Hadi',        umur: 74, armadaId: 'arm-2', status: 'kuning', riwayatKesehatan: 'Stroke Ringan',        spo2: 94, hr: 92,  rr: 21, online: true,  batt: 38, alertTerakhir: 'RR meningkat 21 bpm',     waktuAlert: '09:02',        noSmartwatch: '002C' },
    { id: 'SPR-010', smartwatch: 'SWT010', nama: 'Sumiati',              umur: 59, armadaId: 'arm-2', status: 'hijau',  riwayatKesehatan: 'Kolesterol',           spo2: 97, hr: 75,  rr: 16, online: true,  batt: 72, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '002D' },
    { id: 'SPR-011', smartwatch: 'SWT011', nama: 'Fathur Rozy',          umur: 64, armadaId: 'arm-2', status: 'merah',  riwayatKesehatan: 'Diabetes + Hipertensi', spo2: 88, hr: 125, rr: 28, online: true,  batt: 50, alertTerakhir: 'SpO₂ kritis 88%',        waktuAlert: '09:20',        noSmartwatch: '002E' },
    { id: 'SPR-012', smartwatch: 'SWT012', nama: 'Kartini Wulandari',    umur: 56, armadaId: 'arm-2', status: 'hijau',  riwayatKesehatan: '-',                    spo2: 98, hr: 69,  rr: 15, online: true,  batt: 84, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '002F' },
    // Armada 3
    { id: 'SPR-013', smartwatch: 'SWT013', nama: 'Mariyam',          umur: 68, armadaId: 'arm-3', status: 'hijau',  riwayatKesehatan: 'Asam Urat',            spo2: 97, hr: 71,  rr: 16, online: true,  batt: 66, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '003A' },
    { id: 'SPR-014', smartwatch: 'SWT014', nama: 'Abdul Hamid',          umur: 70, armadaId: 'arm-3', status: 'kuning', riwayatKesehatan: 'Jantung + Hipertensi', spo2: 93, hr: 96,  rr: 22, online: true,  batt: 41, alertTerakhir: 'HR 96 bpm — pantau',      waktuAlert: '08:55',        noSmartwatch: '003B' },
    { id: 'SPR-015', smartwatch: 'SWT015', nama: 'Zainab Alatas',        umur: 61, armadaId: 'arm-3', status: 'hijau',  riwayatKesehatan: '-',                    spo2: 99, hr: 67,  rr: 14, online: true,  batt: 89, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '003C' },
    { id: 'SPR-016', smartwatch: 'SWT016', nama: 'Mochtar Effendi',      umur: 66, armadaId: 'arm-3', status: 'hijau',  riwayatKesehatan: 'Hipertensi',           spo2: 96, hr: 80,  rr: 17, online: true,  batt: 73, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '003D' },
    { id: 'SPR-017', smartwatch: 'SWT017', nama: 'Robiatul Adawiyah',    umur: 54, armadaId: 'arm-3', status: 'hijau',  riwayatKesehatan: '-',                    spo2: 98, hr: 66,  rr: 13, online: true,  batt: 95, alertTerakhir: null,                       waktuAlert: null,           noSmartwatch: '003E' },
    { id: 'SPR-018', smartwatch: 'SWT018', nama: 'Syamsuddin Latif',     umur: 72, armadaId: 'arm-3', status: 'hijau',  riwayatKesehatan: 'Kolesterol + Asma',    spo2: 96, hr: 77,  rr: 18, online: false, batt: 12, alertTerakhir: 'Baterai rendah 12%',      waktuAlert: '06:50',        noSmartwatch: '003F' },
  ],

  // Smartwatch yang belum dibagikan
  smartwatchUnassigned: ['SWT019', 'SWT020', 'SWT021'],

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
  expandedSopir: null,
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
  sopirSearch:   $('#sopirSearch'),
  filterChips:    $$('.chip'),
  groupsContainer:$('#groupsContainer'),

  // Settings
  supervisorList:      $('#supervisorList'),
  subtabs:        $$('.subtab'),
  smartwatchStatusGrid: $('#smartwatchStatusGrid'),
  distribusiBody: $('#distribusiTableBody'),
  btnDaftarSmartwatch:$('#btnDaftarSmartwatch'),
  btnSaveThreshold: $('#btnSaveThreshold'),

  // Modal
  alertModal:     $('#alertModal'),
  alertModalTitle:$('#alertModalTitle'),
  alertModalBody: $('#alertModalBody'),
  alertModalClose:$('#alertModalClose'),
  alertModalCancel:$('#alertModalCancel'),
  btnHubungiK3: $('#btnHubungiK3'),

  // Settings: Daftar Armada
  armadaCardList:         $('#armadaCardList'),
  btnTambahArmada:        $('#btnTambahArmada'),

  // Modal: Tambah Armada
  armadaModal:        $('#armadaModal'),
  armadaModalClose:   $('#armadaModalClose'),
  armadaModalCancel:  $('#armadaModalCancel'),
  armadaNama:         $('#armadaNama'),
  btnSimpanArmada:    $('#btnSimpanArmada'),

  // Modal: Tambah Supervisor
  supervisorModal:        $('#supervisorModal'),
  supervisorModalClose:   $('#supervisorModalClose'),
  supervisorModalCancel:  $('#supervisorModalCancel'),
  supervisorDisplayId:    $('#supervisorDisplayId'),
  supervisorNama:         $('#supervisorNama'),
  supervisorShortName:    $('#supervisorShortName'),
  supervisorArmada:     $('#supervisorArmada'),
  supervisorPassword:     $('#supervisorPassword'),
  btnSimpanSupervisor:    $('#btnSimpanSupervisor'),

  // Modal: Tambah Sopir Massal
  btnTambahSopirMassal: $('#btnTambahSopirMassal'),
  sopirMassalModal:  $('#sopirMassalModal'),
  sopirMassalClose:  $('#sopirMassalClose'),
  sopirMassalCancel: $('#sopirMassalCancel'),
  sopirStepSource:   $('#sopirStepSource'),
  sopirStepPreview:  $('#sopirStepPreview'),
  jmFileInput:        $('#jmFileInput'),
  jmFileStatus:       $('#jmFileStatus'),
  jmManualArmada:   $('#jmManualArmada'),
  jmManualBody:       $('#jmManualBody'),
  jmAddRow:           $('#jmAddRow'),
  jmPreviewSummary:   $('#jmPreviewSummary'),
  jmPreviewBody:      $('#jmPreviewBody'),
  jmBtnBack:          $('#jmBtnBack'),
  jmBtnPreview:       $('#jmBtnPreview'),
  jmBtnSubmit:        $('#jmBtnSubmit'),

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

function getArmada(id) {
  return DATA.armada.find(k => k.id === id) || {};
}

function getAlerts() {
  return DATA.sopir.filter(j => j.alertTerakhir !== null);
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
  monitoring: 'Monitoring Sopir',
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
  const total    = DATA.sopir.length;
  const active   = DATA.sopir.filter(j => j.online).length;
  const hijau    = DATA.sopir.filter(j => j.status === 'hijau').length;
  const kuning   = DATA.sopir.filter(j => j.status === 'kuning').length;
  const merah    = DATA.sopir.filter(j => j.status === 'merah').length;
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
    const klp = getArmada(j.armadaId);
    return `
      <li class="alert-item alert-item--${j.status}" 
          role="button" tabindex="0"
          data-id="${j.id}"
          aria-label="Lihat detail alert ${j.nama}">
        <span class="alert-item__dot"></span>
        <div class="alert-item__body">
          <div class="alert-item__name">${j.nama}</div>
          <div class="alert-item__desc">${j.alertTerakhir} · ${klp.nama || ''} · ${j.smartwatch}</div>
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
        <title>${d.hari}: ${d[key]} sopir ${key}</title>
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
         role="img" aria-label="Grafik tren kondisi sopir 7 hari">
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

  // Filter sopir
  let filtered = DATA.sopir.filter(j => {
    const matchStatus = filter === 'all' || j.status === filter;
    const matchSearch = !query || j.nama.toLowerCase().includes(query) || j.smartwatch.toLowerCase().includes(query);
    return matchStatus && matchSearch;
  });

  // Group per armada
  const grouped = DATA.armada.map(klp => ({
    armada: klp,
    members: filtered.filter(j => j.armadaId === klp.id),
  })).filter(g => g.members.length > 0);

  if (!grouped.length) {
    DOM.groupsContainer.innerHTML = `
      <div class="groups-placeholder">
        Tidak ada sopir yang sesuai dengan filter atau pencarian.
      </div>`;
    return;
  }

  DOM.groupsContainer.innerHTML = grouped.map(g => renderGroupBlock(g)).join('');

  // Re-attach expand listeners
  $$('.sopir-row__toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleSopirDetail(btn));
  });

  // Re-attach vitals toggle
  $$('.vitals-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleVitals(btn));
  });
}

function renderGroupBlock({ armada, members }) {
  const hijauC  = members.filter(m => m.status === 'hijau').length;
  const kuningC = members.filter(m => m.status === 'kuning').length;
  const merahC  = members.filter(m => m.status === 'merah').length;

  return `
    <div class="group-block" data-group="${armada.id}">
      <div class="group-header">
        <div class="group-header__left">
          <span class="group-badge">${armada.nama}</span>
          <span class="group-leader">Supervisor: ${armada.supervisor}</span>
        </div>
        <div class="group-header__right">
          <span class="group-count">${members.length} sopir</span>
          <span class="group-status-dots">
            <span class="dot dot--hijau">${hijauC}</span>
            <span class="dot dot--kuning">${kuningC}</span>
            <span class="dot dot--merah">${merahC}</span>
          </span>
        </div>
      </div>
      <ul class="sopir-list">
        ${members.map(j => renderSopirRow(j)).join('')}
      </ul>
    </div>
  `;
}

function renderSopirRow(j) {
  const klp = getArmada(j.armadaId);
  return `
    <li class="sopir-row" data-id="${j.id}" data-status="${j.status}">
      <button class="sopir-row__toggle" 
              aria-expanded="false" 
              aria-controls="detail-${j.id}"
              data-id="${j.id}">
        <span class="status-dot status-dot--${j.status}" 
              aria-label="Status ${getStatusLabel(j.status)}"></span>
        <span class="sopir-row__name">${j.nama}</span>
        <span class="sopir-row__meta">
          <span class="smartwatch-id">${j.smartwatch}</span>
          <span class="vitals-mini">
            SpO₂ ${j.spo2}% &nbsp;·&nbsp; HR ${j.hr}
            ${!j.online ? ' &nbsp;·&nbsp; <span style="color:var(--color-text-muted)">Offline</span>' : ''}
          </span>
        </span>
        <span class="sopir-row__chevron">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </span>
      </button>

      <div class="sopir-detail" id="detail-${j.id}" hidden>
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
            <span class="detail-row__key">Armada</span>
            <span class="detail-row__val">${klp.nama || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__key">No. Smartwatch</span>
            <span class="detail-row__val">${j.smartwatch}</span>
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
            <span class="detail-row__key">Riwayat Kesehatan</span>
            <span class="detail-row__val" style="font-family:var(--font-sans);font-size:12px;text-align:right">${j.riwayatKesehatan}</span>
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
                  data-sopir-id="${j.id}"
                  onclick="handleHubungiK3('${j.id}')">
            📞 Hubungi Tim K3/HSE
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
function toggleSopirDetail(btn) {
  const id       = btn.dataset.id;
  const detail   = $(`#detail-${id}`);
  const isOpen   = btn.getAttribute('aria-expanded') === 'true';

  // Close previously open (optional: single-expand mode)
  if (STATE.expandedSopir && STATE.expandedSopir !== id) {
    const prevBtn    = $(`[aria-controls="detail-${STATE.expandedSopir}"]`);
    const prevDetail = $(`#detail-${STATE.expandedSopir}`);
    if (prevBtn)    prevBtn.setAttribute('aria-expanded', 'false');
    if (prevDetail) prevDetail.hidden = true;
  }

  btn.setAttribute('aria-expanded', String(!isOpen));
  detail.hidden = isOpen;
  STATE.expandedSopir = isOpen ? null : id;
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
  DOM.sopirSearch.addEventListener('input', (e) => {
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
  renderArmadaList();
  renderSupervisorList();
  renderSmartwatchStatus();
  renderDistribusiTable();
}

function renderArmadaList() {
  if (!DOM.armadaCardList) return;

  DOM.armadaCardList.innerHTML = DATA.armada.map(k => `
    <div class="settings-card">
      <div class="settings-card__body">
        <h3 class="settings-card__name">${k.nama}</h3>
        <p class="settings-card__detail">
          <span>Supervisor: ${k.supervisor && k.supervisor !== '-' ? k.supervisor : 'Belum ditugaskan'}</span>
        </p>
      </div>
    </div>
  `).join('');
}

function renderSupervisorList() {
  if (!DOM.supervisorList) return;
  const supervisorData = DATA.armada.map(k => ({
    nama: k.supervisor,
    armada: k.nama,
    id: k.supervisorId,
    armadaId: k.id,
  }));

  DOM.supervisorList.innerHTML = supervisorData.map((k, i) => `
    <div class="supervisor-item">
      <div class="supervisor-item__avatar">${getInitials(k.nama)}</div>
      <div class="supervisor-item__info">
        <span class="supervisor-item__name">${k.nama}</span>
        <span class="supervisor-item__group">${k.armada}</span>
      </div>
      <span class="settings-card__role-badge badge--supervisor supervisor-item__badge" style="font-size:10px;padding:2px 8px;border-radius:10px">Supervisor</span>
      <button class="supervisor-item__menu-btn" data-menu-toggle="${i}" aria-label="Menu aksi" aria-haspopup="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="10" cy="16" r="1.5"/>
        </svg>
      </button>
      <div class="supervisor-item__menu" id="supervisorMenu-${i}" hidden data-armada-id="${k.armadaId}">
        <button type="button" data-action="edit">Edit</button>
        <button type="button" class="supervisor-item__menu-danger" data-action="hapus">Hapus</button>
      </div>
    </div>
  `).join('');
}

function closeAllSupervisorMenus() {
  $$('.supervisor-item__menu').forEach(m => m.hidden = true);
}

function initSupervisorItemMenus() {
  // Delegasi di level container supaya tetap jalan setelah re-render
  DOM.supervisorList?.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('[data-menu-toggle]');
    if (toggleBtn) {
      const idx = toggleBtn.dataset.menuToggle;
      const menu = document.getElementById(`supervisorMenu-${idx}`);
      const wasHidden = menu.hidden;
      closeAllSupervisorMenus();
      menu.hidden = !wasHidden;
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const menu = actionBtn.closest('.supervisor-item__menu');
      const armadaId = menu?.dataset.armadaId;
      closeAllSupervisorMenus();
      if (actionBtn.dataset.action === 'edit') {
        showToast('info', 'Segera Hadir', 'Fitur edit supervisor armada akan tersedia di versi berikutnya.');
      } else if (actionBtn.dataset.action === 'hapus') {
        showToast('info', 'Segera Hadir', 'Fitur hapus supervisor armada akan tersedia di versi berikutnya.');
      }
      return;
    }
  });

  // Klik di luar menu menutup semua menu yang terbuka
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.supervisor-item')) closeAllSupervisorMenus();
  });
}

function renderSmartwatchStatus() {
  if (!DOM.smartwatchStatusGrid) return;

  const assignedCards = DATA.sopir.map(j => `
    <div class="smartwatch-card">
      <span class="smartwatch-card__id">${j.smartwatch}</span>
      <span class="smartwatch-card__name">${j.nama}</span>
      <span class="smartwatch-card__status">
        <span class="smartwatch-status-dot smartwatch-status-dot--${j.online ? 'online' : 'offline'}"></span>
        ${j.online ? 'Online' : 'Offline'}
      </span>
      <span class="smartwatch-card__batt">🔋 ${j.batt}%</span>
    </div>
  `).join('');

  const unsetCards = DATA.smartwatchUnassigned.map(g => `
    <div class="smartwatch-card" style="opacity:0.5">
      <span class="smartwatch-card__id">${g}</span>
      <span class="smartwatch-card__name" style="color:var(--color-text-muted);font-style:italic">Belum Dibagikan</span>
      <span class="smartwatch-card__status">
        <span class="smartwatch-status-dot smartwatch-status-dot--unset"></span>
        Tidak aktif
      </span>
      <span class="smartwatch-card__batt">—</span>
    </div>
  `).join('');

  DOM.smartwatchStatusGrid.innerHTML = assignedCards + unsetCards;
}

function renderDistribusiTable() {
  if (!DOM.distribusiBody) return;

  const rows = DATA.sopir.map(j => {
    const klp = getArmada(j.armadaId);
    return `
      <tr>
        <td>${j.smartwatch}</td>
        <td style="color:var(--color-text-primary);font-weight:500">${j.nama}</td>
        <td>${klp.nama || '—'}</td>
        <td>
          <span class="distribusi-status distribusi-status--assigned">
            <span class="smartwatch-status-dot smartwatch-status-dot--${j.online ? 'online' : 'offline'}" style="width:6px;height:6px;border-radius:50%;display:inline-block"></span>
            ${j.online ? 'Aktif' : 'Offline'}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  const unsetRows = DATA.smartwatchUnassigned.map(g => `
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
      if (target === 'status')     renderSmartwatchStatus();
      if (target === 'distribusi') renderDistribusiTable();
    });
  });
}

/* ============================================================
   16. MODAL
   ============================================================ */
function openAlertModal(sopirId) {
  const j = DATA.sopir.find(j => j.id === sopirId);
  if (!j) return;

  const klp = getArmada(j.armadaId);

  DOM.alertModalTitle.textContent = `Alert — ${j.nama}`;
  DOM.alertModalBody.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;
                  background:var(--color-${j.status}-bg);border:1px solid rgba(0,0,0,0.1);
                  border-radius:10px;">
        <span style="font-size:24px">${getStatusEmoji(j.status)}</span>
        <div>
          <div style="font-weight:700;font-size:15px">${j.nama}</div>
          <div style="font-size:12px;color:var(--color-text-secondary)">${klp.nama} · ${j.smartwatch}</div>
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
        <strong>Riwayat Kesehatan:</strong> ${j.riwayatKesehatan}
      </div>
    </div>
  `;

  // Store sopir id for action button
  DOM.btnHubungiK3.dataset.sopirId = sopirId;

  DOM.alertModal.hidden = false;
  document.body.style.overflow = 'hidden';
  DOM.alertModalClose.focus();
}

function closeAlertModal() {
  DOM.alertModal.hidden = true;
  document.body.style.overflow = '';
}

/* ----- Modal: Tambah Armada ----- */
function openArmadaModal() {
  DOM.armadaNama.value = '';
  DOM.armadaModal.hidden = false;
  document.body.style.overflow = 'hidden';
  DOM.armadaNama.focus();
}

function closeArmadaModal() {
  DOM.armadaModal.hidden = true;
  document.body.style.overflow = '';
}

async function submitArmadaForm() {
  const nama = DOM.armadaNama.value.trim();

  if (!nama) {
    showToast('warning', 'Form Belum Lengkap', 'Harap isi nama armada sebelum menyimpan.');
    return;
  }

  // Cegah duplikat nama armada (case-insensitive) di sisi client
  const sudahAda = DATA.armada.some(k => k.nama.trim().toLowerCase() === nama.toLowerCase());
  if (sudahAda) {
    showToast('warning', 'Armada Sudah Ada', `Armada dengan nama "${nama}" sudah terdaftar.`);
    return;
  }

  DOM.btnSimpanArmada.disabled = true;
  DOM.btnSimpanArmada.textContent = 'Menyimpan...';

  const result = await window.RIHLAH_DB.insertArmada(nama);

  DOM.btnSimpanArmada.disabled = false;
  DOM.btnSimpanArmada.textContent = 'Simpan';

  if (result.error) {
    showToast('error', 'Gagal Menyimpan', result.error.message || 'Gagal menambah armada.');
    return;
  }

  showToast('success', 'Armada Ditambahkan', `"${nama}" berhasil ditambahkan.`);
  closeArmadaModal();

  // Refresh data armada dari server supaya list & dropdown ter-update
  if (typeof loadAppData === 'function') await loadAppData();
  renderArmadaList();
  renderSupervisorList();
}

/* ----- Modal: Tambah Supervisor Armada ----- */
function openSupervisorModal() {
  // Isi dropdown armada yang BELUM punya supervisor (supervisorId masih placeholder/'-')
  const opsi = DATA.armada
    .map(k => `<option value="${k.id}">${k.nama}${k.supervisor && k.supervisor !== '-' ? ` (saat ini: ${k.supervisor})` : ''}</option>`)
    .join('');
  DOM.supervisorArmada.innerHTML = `<option value="">Pilih armada...</option>${opsi}`;

  // Reset form
  DOM.supervisorDisplayId.value = '';
  DOM.supervisorNama.value = '';
  DOM.supervisorShortName.value = '';
  DOM.supervisorPassword.value = '';

  DOM.supervisorModal.hidden = false;
  document.body.style.overflow = 'hidden';
  DOM.supervisorDisplayId.focus();
}

function closeSupervisorModal() {
  DOM.supervisorModal.hidden = true;
  document.body.style.overflow = '';
}

async function submitSupervisorForm() {
  const displayId   = DOM.supervisorDisplayId.value.trim().toUpperCase();
  const nama        = DOM.supervisorNama.value.trim();
  const shortName   = DOM.supervisorShortName.value.trim();
  const armadaId  = DOM.supervisorArmada.value;
  const password    = DOM.supervisorPassword.value;

  if (!displayId || !nama || !shortName || !armadaId || !password) {
    showToast('warning', 'Form Belum Lengkap', 'Harap isi semua kolom sebelum menyimpan.');
    return;
  }
  if (password.length < 6) {
    showToast('warning', 'Password Terlalu Pendek', 'Password minimal 6 karakter.');
    return;
  }

  DOM.btnSimpanSupervisor.disabled = true;
  DOM.btnSimpanSupervisor.textContent = 'Menyimpan...';

  const result = await window.RIHLAH_DB.createSupervisorArmada({
    displayId, nama, shortName, password, armadaId,
  });

  DOM.btnSimpanSupervisor.disabled = false;
  DOM.btnSimpanSupervisor.textContent = 'Simpan';

  if (result.error) {
    showToast('error', 'Gagal Menyimpan', result.error);
    return;
  }

  showToast('success', 'Supervisor Armada Ditambahkan', `${nama} berhasil ditetapkan sebagai supervisor.`);
  closeSupervisorModal();

  // Refresh data armada dari server supaya supervisorList & dropdown ter-update
  if (typeof loadAppData === 'function') await loadAppData();
  renderSupervisorList();
}

/* ----- Modal: Tambah Sopir Massal ----- */
const JM_STATE = {
  source: 'upload',   // 'upload' | 'manual'
  rows:   [],          // hasil parsing, sebelum divalidasi
  manualRowCount: 0,
};

function openSopirMassalModal() {
  // Reset state
  JM_STATE.source = 'upload';
  JM_STATE.rows = [];
  JM_STATE.manualRowCount = 0;

  DOM.jmFileInput.value = '';
  DOM.jmFileStatus.textContent = '';
  DOM.jmManualBody.innerHTML = '';
  DOM.jmPreviewBody.innerHTML = '';

  // Isi dropdown armada untuk mode manual
  const opsi = DATA.armada.map(k => `<option value="${k.id}">${k.nama}</option>`).join('');
  DOM.jmManualArmada.innerHTML = `<option value="">Pilih armada...</option>${opsi}`;

  // Reset tab ke Upload
  $$('.jm-source-tab[data-jmsubtab]').forEach(t => {
    const active = t.dataset.jmsubtab === 'upload';
    t.classList.toggle('jm-source-tab--active', active);
    t.setAttribute('aria-selected', active);
  });
  $('#jmPanel-upload').classList.add('jm-panel--active');
  $('#jmPanel-upload').hidden = false;
  $('#jmPanel-manual').classList.remove('jm-panel--active');
  $('#jmPanel-manual').hidden = true;

  // Mulai dengan 3 baris kosong di mode manual
  addManualRow(); addManualRow(); addManualRow();

  // Reset langkah ke step 1 (sumber data)
  DOM.sopirStepSource.hidden = false;
  DOM.sopirStepPreview.hidden = true;
  DOM.jmBtnBack.hidden = true;
  DOM.jmBtnPreview.hidden = false;
  DOM.jmBtnSubmit.hidden = true;

  DOM.sopirMassalModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSopirMassalModal() {
  DOM.sopirMassalModal.hidden = true;
  document.body.style.overflow = '';
}

function addManualRow() {
  JM_STATE.manualRowCount++;
  const rowId = `mrow-${JM_STATE.manualRowCount}`;
  const tr = document.createElement('tr');
  tr.dataset.rowId = rowId;
  tr.innerHTML = `
    <td><input type="text" class="jm-input-nama" placeholder="Nama sopir"></td>
    <td><input type="number" class="jm-input-umur" placeholder="Umur" min="0" max="120"></td>
    <td><input type="text" class="jm-input-riwayat-kesehatan" placeholder="-"></td>
    <td><button type="button" class="jm-remove-row" aria-label="Hapus baris">&times;</button></td>
  `;
  DOM.jmManualBody.appendChild(tr);
  tr.querySelector('.jm-remove-row').addEventListener('click', () => tr.remove());
}

function parseXlsxFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Bangun daftar baris mentah dari sumber yang sedang aktif (upload/manual),
 * lalu validasi tiap baris. Mengisi JM_STATE.rows dengan hasil + status error.
 */
function buildAndValidateRows() {
  const armadaByName = {};
  const armadaById = {};
  DATA.armada.forEach(k => {
    armadaByName[k.nama.trim().toLowerCase()] = k.id;
    armadaById[k.id] = k.nama;
  });

  let rawRows = [];

  if (JM_STATE.source === 'upload') {
    rawRows = JM_STATE.rows.map(r => ({
      nama:     String(r.nama ?? '').trim(),
      umur:     r.umur,
      riwayatKesehatan: String(r.riwayatKesehatan ?? '').trim(),
      armadaNama: String(r.armada ?? '').trim(),
    }));
  } else {
    const selectedArmadaId = DOM.jmManualArmada.value;
    const selectedArmadaNama = armadaById[selectedArmadaId] || '';
    rawRows = Array.from(DOM.jmManualBody.querySelectorAll('tr')).map(tr => ({
      nama:     tr.querySelector('.jm-input-nama').value.trim(),
      umur:     tr.querySelector('.jm-input-umur').value,
      riwayatKesehatan: tr.querySelector('.jm-input-riwayat-kesehatan').value.trim(),
      armadaNama: selectedArmadaNama,
      armadaId:   selectedArmadaId,
    })).filter(r => r.nama || r.umur || r.riwayatKesehatan); // skip baris benar2 kosong
  }

  const validated = rawRows.map((r, idx) => {
    const errors = [];
    const umurNum = Number(r.umur);

    if (!r.nama) errors.push('Nama kosong');
    if (r.umur === '' || r.umur === undefined || r.umur === null) {
      errors.push('Umur kosong');
    } else if (!Number.isFinite(umurNum) || umurNum <= 0 || umurNum > 120) {
      errors.push('Umur tidak valid');
    }

    let armadaId = r.armadaId || null;
    if (!armadaId) {
      if (!r.armadaNama) {
        errors.push('Armada kosong');
      } else {
        armadaId = armadaByName[r.armadaNama.toLowerCase()];
        if (!armadaId) errors.push(`Armada "${r.armadaNama}" tidak dikenal`);
      }
    }

    return {
      no: idx + 1,
      nama: r.nama,
      umur: umurNum,
      riwayatKesehatan: r.riwayatKesehatan || null,
      armadaNama: r.armadaNama || armadaById[armadaId] || '',
      armadaId,
      errors,
    };
  });

  return validated;
}

function renderJmPreview(rows) {
  const errorCount = rows.filter(r => r.errors.length > 0).length;

  DOM.jmPreviewSummary.textContent = rows.length === 0
    ? 'Tidak ada data untuk ditampilkan.'
    : errorCount > 0
      ? `${rows.length} baris ditemukan, ${errorCount} baris bermasalah. Perbaiki sebelum mengirim.`
      : `${rows.length} baris siap dikirim ke database.`;

  DOM.jmPreviewBody.innerHTML = rows.map(r => `
    <tr class="${r.errors.length ? 'jm-row--error' : ''}">
      <td>${r.no}</td>
      <td>${escapeHtml(r.nama) || '<em>(kosong)</em>'}</td>
      <td>${Number.isFinite(r.umur) ? r.umur : '<em>(kosong)</em>'}</td>
      <td>${escapeHtml(r.riwayatKesehatan) || '-'}</td>
      <td>${escapeHtml(r.armadaNama) || '<em>(kosong)</em>'}</td>
      <td>${r.errors.length
          ? `<span class="jm-status-error">${r.errors.join(', ')}</span>`
          : '<span class="jm-status-ok">✓ Valid</span>'}</td>
    </tr>
  `).join('');

  return errorCount === 0 && rows.length > 0;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function handleJmPreviewClick() {
  // Kalau sumber upload, JM_STATE.rows sudah diisi saat file dipilih.
  // Kalau manual, validasi langsung dari DOM saat ini.
  if (JM_STATE.source === 'manual') {
    // tidak perlu re-fetch, buildAndValidateRows membaca langsung dari DOM
  } else if (JM_STATE.rows.length === 0) {
    showToast('warning', 'Belum Ada File', 'Pilih file XLSX terlebih dahulu.');
    return;
  }

  const validated = buildAndValidateRows();
  const allValid = renderJmPreview(validated);

  JM_STATE.validatedRows = validated;
  JM_STATE.allValid = allValid;

  DOM.sopirStepSource.hidden = true;
  DOM.sopirStepPreview.hidden = false;
  DOM.jmBtnBack.hidden = false;
  DOM.jmBtnPreview.hidden = true;
  DOM.jmBtnSubmit.hidden = false;
  DOM.jmBtnSubmit.disabled = !allValid;
}

function handleJmBackClick() {
  DOM.sopirStepSource.hidden = false;
  DOM.sopirStepPreview.hidden = true;
  DOM.jmBtnBack.hidden = true;
  DOM.jmBtnPreview.hidden = false;
  DOM.jmBtnSubmit.hidden = true;
}

async function handleJmSubmitClick() {
  if (!JM_STATE.allValid || !JM_STATE.validatedRows?.length) return;

  const payload = JM_STATE.validatedRows.map(r => ({
    nama: r.nama,
    umur: r.umur,
    riwayatKesehatan: r.riwayatKesehatan,
    armada_id: r.armadaId,
  }));

  DOM.jmBtnSubmit.disabled = true;
  DOM.jmBtnSubmit.textContent = 'Mengirim...';

  const { data, error } = await window.RIHLAH_DB.insertSopirBulk(payload);

  DOM.jmBtnSubmit.disabled = false;
  DOM.jmBtnSubmit.textContent = 'Kirim ke Database';

  if (error) {
    showToast('error', 'Gagal Mengirim', error.message || 'Terjadi kesalahan saat menyimpan data.');
    return;
  }

  showToast('success', 'Sopir Ditambahkan', `${payload.length} sopir berhasil ditambahkan.`);
  closeSopirMassalModal();

  if (typeof loadAppData === 'function') await loadAppData();
}

function initSopirMassalTabs() {
  $$('.jm-source-tab[data-jmsubtab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.jmsubtab;
      JM_STATE.source = target;

      $$('.jm-source-tab[data-jmsubtab]').forEach(t => {
        const active = t === tab;
        t.classList.toggle('jm-source-tab--active', active);
        t.setAttribute('aria-selected', active);
      });

      const uploadPanel = $('#jmPanel-upload');
      const manualPanel = $('#jmPanel-manual');
      uploadPanel.hidden = target !== 'upload';
      manualPanel.hidden = target !== 'manual';
      uploadPanel.classList.toggle('jm-panel--active', target === 'upload');
      manualPanel.classList.toggle('jm-panel--active', target === 'manual');
    });
  });

  DOM.jmFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    DOM.jmFileStatus.textContent = 'Membaca file...';
    try {
      const rows = await parseXlsxFile(file);
      JM_STATE.rows = rows;
      DOM.jmFileStatus.textContent = `${rows.length} baris terbaca dari "${file.name}".`;
    } catch (err) {
      JM_STATE.rows = [];
      DOM.jmFileStatus.textContent = `Gagal membaca file: ${err.message}`;
    }
  });

  DOM.jmAddRow?.addEventListener('click', addManualRow);
  DOM.jmBtnPreview?.addEventListener('click', handleJmPreviewClick);
  DOM.jmBtnBack?.addEventListener('click', handleJmBackClick);
  DOM.jmBtnSubmit?.addEventListener('click', handleJmSubmitClick);
}

function handleHubungiK3(sopirId) {
  const j = DATA.sopir.find(j => j.id === (sopirId || DOM.btnHubungiK3.dataset.sopirId));
  if (!j) return;
  closeAlertModal();
  showToast('danger', 'Tim K3/HSE Dihubungi', `Permintaan bantuan untuk ${j.nama} telah dikirim ke tim K3/HSE.`);
}

// Expose to inline onclick
window.handleHubungiK3 = handleHubungiK3;
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
  DATA.sopir.forEach(j => {
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
  // Daftarkan Smartwatch
  if (DOM.btnDaftarSmartwatch) {
    DOM.btnDaftarSmartwatch.addEventListener('click', () => {
      const smartwatchId  = $('#smartwatchId')?.value.trim();
      const sopirNm  = $('#smartwatchSopir')?.value.trim();
      const armada  = $('#smartwatchArmada')?.value;

      if (!smartwatchId || !sopirNm || !armada) {
        showToast('warning', 'Form Belum Lengkap', 'Harap isi semua kolom sebelum mendaftarkan smartwatch.');
        return;
      }

      showToast('success', 'Smartwatch Terdaftar', `${smartwatchId} berhasil ditetapkan ke ${sopirNm}`);
      // Reset form
      if ($('#smartwatchId'))       $('#smartwatchId').value = '';
      if ($('#smartwatchSopir'))   $('#smartwatchSopir').value = '';
      if ($('#smartwatchArmada')) $('#smartwatchArmada').value = '';
    });
  }

  // Simpan Ambang Batas
  if (DOM.btnSaveThreshold) {
    DOM.btnSaveThreshold.addEventListener('click', () => {
      showToast('success', 'Ambang Batas Disimpan', 'Pengaturan baru akan diterapkan pada pemantauan berikutnya.');
    });
  }

  // Tambah Armada
  if (DOM.btnTambahArmada) {
    DOM.btnTambahArmada.addEventListener('click', openArmadaModal);
  }

  // Tambah Supervisor Armada
  const btnTambah = $('#btnTambahSupervisor');
  if (btnTambah) {
    btnTambah.addEventListener('click', openSupervisorModal);
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

  // --- Modal Hubungi K3 ---
  DOM.btnHubungiK3?.addEventListener('click', handleHubungiK3);

  // --- Modal: Tambah Armada ---
  DOM.armadaModalClose?.addEventListener('click',  closeArmadaModal);
  DOM.armadaModalCancel?.addEventListener('click', closeArmadaModal);
  DOM.armadaModal?.addEventListener('click', (e) => {
    if (e.target === DOM.armadaModal) closeArmadaModal();
  });
  DOM.btnSimpanArmada?.addEventListener('click', submitArmadaForm);

  // --- Modal: Tambah Supervisor Armada ---
  DOM.supervisorModalClose?.addEventListener('click',  closeSupervisorModal);
  DOM.supervisorModalCancel?.addEventListener('click', closeSupervisorModal);
  DOM.supervisorModal?.addEventListener('click', (e) => {
    if (e.target === DOM.supervisorModal) closeSupervisorModal();
  });
  DOM.btnSimpanSupervisor?.addEventListener('click', submitSupervisorForm);

  // --- Modal: Tambah Sopir Massal ---
  DOM.btnTambahSopirMassal?.addEventListener('click', openSopirMassalModal);
  DOM.sopirMassalClose?.addEventListener('click',  closeSopirMassalModal);
  DOM.sopirMassalCancel?.addEventListener('click', closeSopirMassalModal);
  DOM.sopirMassalModal?.addEventListener('click', (e) => {
    if (e.target === DOM.sopirMassalModal) closeSopirMassalModal();
  });
  initSopirMassalTabs();
  initSupervisorItemMenus();

  // Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !DOM.alertModal.hidden) closeAlertModal();
    if (e.key === 'Escape' && DOM.armadaModal && !DOM.armadaModal.hidden) closeArmadaModal();
    if (e.key === 'Escape' && DOM.supervisorModal && !DOM.supervisorModal.hidden) closeSupervisorModal();
    if (e.key === 'Escape' && DOM.sopirMassalModal && !DOM.sopirMassalModal.hidden) closeSopirMassalModal();
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
    const [sopirRes, armadaRes, alertsRes] = await Promise.all([
      window.RIHLAH_DB.fetchSopir(),
      window.RIHLAH_DB.fetchArmada(),
      window.RIHLAH_DB.fetchActiveAlerts(),
    ]);

    if (!sopirRes.error && sopirRes.data) {
      // Adaptasi format Supabase → format DATA.sopir yang dipakai renderer
      DATA.sopir = sopirRes.data.map(j => ({
        id:           j.id,
        smartwatch:       j.smart_band?.band_code || '-',
        nama:         j.nama,
        umur:         j.umur,
        armadaId:   j.armada_id,
        status:       j.last_status || 'hijau',
        riwayatKesehatan:     j.riwayat_kesehatan || '-',
        spo2:         j.last_spo2 || 0,
        hr:           j.last_hr   || 0,
        rr:           j.last_rr   || 0,
        online:       j.smart_band?.is_active ?? false,
        batt:         j.smart_band?.battery_pct ?? 0,
        alertTerakhir: null,
        waktuAlert:   null,
        noSmartwatch:     j.smart_band?.band_code || '-',
      }));
    }

    if (!armadaRes.error && armadaRes.data) {
      DATA.armada = armadaRes.data.map(k => ({
        id:      k.id,
        nama:    k.nama,
        supervisor:   k.users?.short_name || '-',
        supervisorId: k.users?.display_id || '-',
      }));
    }

    // Re-render dengan data asli
    renderStats();
    renderAlerts();
    requestAnimationFrame(() => renderTrendChart());

    // Subscribe realtime updates — HANYA SEKALI per sesi.
    // loadAppData() dipanggil berulang (setelah tambah armada/supervisor, dll),
    // tapi channel realtime tidak boleh di-subscribe dua kali dengan nama yang sama.
    subscribeRealtimeOnce();

    showToast('info', 'RIHLAH Aktif', 'Sistem monitoring sopir berjalan normal.', 4000);

  } catch (err) {
    console.error('loadAppData error:', err);
    showToast('warning', 'Gagal memuat data', 'Periksa koneksi internet Anda.', 5000);
  }
}

let _realtimeSubscribed = false;

function subscribeRealtimeOnce() {
  if (_realtimeSubscribed) return;
  _realtimeSubscribed = true;

  window.RIHLAH_DB.subscribeSopirUpdates((payload) => {
    const updated = payload.new;
    const idx = DATA.sopir.findIndex(j => j.id === updated.id);
    if (idx >= 0) {
      DATA.sopir[idx].status = updated.last_status || DATA.sopir[idx].status;
      DATA.sopir[idx].spo2   = updated.last_spo2   ?? DATA.sopir[idx].spo2;
      DATA.sopir[idx].hr     = updated.last_hr     ?? DATA.sopir[idx].hr;
      DATA.sopir[idx].rr     = updated.last_rr     ?? DATA.sopir[idx].rr;
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