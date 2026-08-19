document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) {
    window.location.href = '/dashboard.html';
    return;
  }

  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    const btn = form.querySelector('button[type="submit"]');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Masuk...';

    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (data && data.token) {
        setAuth(data.token, data.user);
        window.location.href = '/dashboard.html';
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  });
});
