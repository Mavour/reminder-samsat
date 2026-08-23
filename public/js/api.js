const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function isLoggedIn() {
  return !!getToken();
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/';
    return false;
  }
  return true;
}

function isAdmin() {
  const user = getUser();
  return user && user.role === 'admin';
}

async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (response.status === 401) {
      clearAuth();
      window.location.href = '/';
      return null;
    }

    if (!response.ok) {
      throw new Error(data.error || 'Terjadi kesalahan');
    }

    return data;
  } catch (err) {
    throw err;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showConfirm(messageHtml, options = {}) {
  return new Promise(resolve => {
    let overlay = document.getElementById('confirmModalRoot');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'confirmModalRoot';
      overlay.className = 'modal-overlay';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);
    }

    const title = escapeHtml(options.title || 'Konfirmasi');
    const confirmText = escapeHtml(options.confirmText || 'Ya');
    const cancelText = escapeHtml(options.cancelText || 'Batal');
    const confirmClass = options.danger ? 'btn-danger' : 'btn-primary';

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" data-cancel="1" type="button">&times;</button>
        </div>
        <div class="modal-body"><p style="line-height:1.6;margin:0">${messageHtml}</p></div>
        <div class="modal-footer">
          <button class="btn btn-outline btn-sm" data-cancel="1" type="button">${cancelText}</button>
          <button class="btn ${confirmClass} btn-sm" style="width:auto" data-confirm="1" type="button">${confirmText}</button>
        </div>
      </div>`;
    overlay.style.display = 'flex';

    const done = value => {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      overlay.onclick = null;
      resolve(value);
    };

    overlay.querySelectorAll('[data-cancel="1"]').forEach(el => el.addEventListener('click', () => done(false)));
    overlay.querySelector('[data-confirm="1"]').addEventListener('click', () => done(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
  });
}

function formatRupiah(amount) {
  if (!amount) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const date = new Date(dateStr);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateFull(dateStr) {
  if (!dateStr) return '-';
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const date = new Date(dateStr);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function gantiPlatBadge(v) {
  if (!v.next_ganti_plat) return '';
  const cls = v.ganti_plat_due_this_year ? 'badge-kritis' : 'badge-warning';
  const title = v.ganti_plat_due_this_year
    ? 'Ganti plat berikutnya: ' + v.next_ganti_plat
    : 'Perkiraan tahun ganti plat berikutnya';
  const label = v.ganti_plat_due_this_year ? 'Ganti Plat Tahun Ini' : 'Ganti Plat ' + v.next_ganti_plat;
  return `<div class="gp-wrap"><span class="badge ${cls}" title="${title}">${label}</span></div>`;
}

const WITA_OFFSET_HOURS = 8;

function witaNow() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + WITA_OFFSET_HOURS * 3600000);
}

function parseTanggalPajak(dateStr) {
  const parts = String(dateStr).split('T')[0].split('-');
  return { y: parseInt(parts[0], 10), m: parseInt(parts[1], 10) - 1, d: parseInt(parts[2], 10) };
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const dd = document.getElementById('userMenuDropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', function (e) {
  const dd = document.getElementById('userMenuDropdown');
  if (!dd || !dd.classList.contains('open')) return;
  if (!e.target.closest('.user-menu')) {
    dd.classList.remove('open');
  }
});

(function initUserMenu() {
  const u = getUser();
  if (!u) return;
  document.querySelectorAll('.user-menu-name').forEach(el => el.textContent = u.nama || 'User');
  document.querySelectorAll('.user-menu-role').forEach(el => el.textContent = u.role === 'admin' ? 'Administrator' : 'User');
})();
