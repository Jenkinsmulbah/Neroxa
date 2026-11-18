/* NEXORA Phase 4 browser integration. UI guards improve navigation only;
   all authorization decisions must still be enforced by the API. */
(() => {
  'use strict';
  const API = document.querySelector('meta[name="nexora-api"]')?.content || 'https://neroxa.onrender.com';
  const page = location.pathname.split('/').pop();
  const protectedRoles = (document.body.dataset.nexoraRoles || '').split(',').map(role => role.trim()).filter(Boolean);
  const protectedPage = protectedRoles.length > 0;
  const redirectToLogin = () => {
    const target = encodeURIComponent(location.pathname + location.search);
    location.replace(new URL(`../auth/login.html?next=${target}`, location.href));
  };
  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  };
  const csrf = async () => (await request('/api/auth/csrf')).csrfToken;
  const message = (form, text, error = false) => {
    let node = form.querySelector('[data-auth-message]');
    if (!node) { node = document.createElement('p'); node.dataset.authMessage = ''; node.setAttribute('aria-live', 'polite'); form.append(node); }
    node.textContent = text;
    node.className = error ? 'form-error' : 'form-success';
  };

  const loginForm = document.querySelector('#nexora-login-form');
  if (loginForm) loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = loginForm.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const token = await csrf();
      const result = await request('/api/auth/login', { method: 'POST', headers: { 'X-CSRF-Token': token }, body: JSON.stringify({ email: loginForm.email.value.trim(), password: loginForm.password.value }) });
      const destinations = { client: '../client/dashboard.html', designer: '../team/designer-profile.html', admin: '../admin/applications.html', owner: '../owner/dashboard.html' };
      const next = new URLSearchParams(location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) location.replace(next);
      else location.replace(destinations[result.user.role]);
    } catch (error) { message(loginForm, error.message, true); button.disabled = false; }
  });

  const registerForm = document.querySelector('#nexora-register-form');
  if (registerForm) registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (registerForm.password.value !== registerForm.confirm_password.value) { message(registerForm, 'The passwords do not match.', true); return; }
    const button = registerForm.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const token = await csrf();
      const result = await request('/api/auth/register', { method: 'POST', headers: { 'X-CSRF-Token': token }, body: JSON.stringify({ applicationReference: registerForm.application_reference.value.trim(), email: registerForm.email.value.trim(), password: registerForm.password.value }) });
      const destinations = { client: '../client/dashboard.html', designer: '../team/designer-profile.html', admin: '../admin/applications.html', owner: '../owner/dashboard.html' };
      location.replace(destinations[result.user.role]);
    } catch (error) { message(registerForm, error.message, true); button.disabled = false; }
  });

  document.querySelectorAll('[data-nexora-logout]').forEach(button => button.addEventListener('click', async () => {
    try { const token = await csrf(); await request('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': token } }); location.replace(new URL('../auth/login.html', location.href)); }
    catch (error) { alert(error.message); }
  }));

  if (protectedPage) {
    request('/api/auth/me').then(({ user }) => {
      if (!protectedRoles.includes(user.role)) {
        const destination = { client: '../client/dashboard.html', designer: '../team/designer-profile.html', admin: '../admin/applications.html', owner: '../owner/dashboard.html' };
        location.replace(new URL(destination[user.role], location.href));
      }
    }).catch(redirectToLogin);
  }
})();
