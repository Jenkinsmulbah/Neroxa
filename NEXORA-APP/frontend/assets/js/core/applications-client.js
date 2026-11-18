(() => {
  'use strict';
  const API = document.querySelector('meta[name="nexora-api"]')?.content || 'https://neroxa.onrender.com';
  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: 'include', ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'The request could not be completed.');
    return body;
  };
  const csrf = async () => (await request('/api/auth/csrf')).csrfToken;
  const show = (node, text, error = false) => { if (!node) return; node.textContent = text; node.className = error ? 'form-error' : 'form-success'; node.setAttribute('role', 'status'); };
  const forms = document.querySelectorAll('form[data-application-form]');
  forms.forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const type = form.dataset.applicationForm;
    const data = {};
    for (const [key, value] of new FormData(form).entries()) {
      if (Object.hasOwn(data, key)) data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
      else data[key] = value;
    }
    const multi = type === 'client' ? 'services' : 'specialties';
    data[multi] = [...form.querySelectorAll(`[name="${multi}"]:checked`)].map(input => input.value);
    if (!data[multi].length) { show(form.querySelector('[data-form-message]'), `Select at least one ${type === 'client' ? 'service' : 'specialization'}.`, true); return; }
    const button = form.querySelector('[type="submit"]');
    const message = form.querySelector('[data-form-message]');
    button.disabled = true;
    try {
      const token = await csrf();
      const result = await request('/api/applications', { method: 'POST', headers: { 'X-CSRF-Token': token }, body: JSON.stringify({ type, data }) });
      sessionStorage.setItem('nexora.application.receipt', JSON.stringify(result));
      location.href = `application-status.html?submitted=1`;
    } catch (error) { show(message, error.message, true); button.disabled = false; }
  }));

  const lookup = document.querySelector('#application-lookup-form');
  const resultBox = document.querySelector('#application-status-result');
  if (lookup) {
    const message = lookup.querySelector('[data-form-message]');
    const receipt = sessionStorage.getItem('nexora.application.receipt');
    if (receipt && new URLSearchParams(location.search).has('submitted')) {
      try {
        const saved = JSON.parse(receipt);
        lookup.reference.value = saved.reference;
        lookup.accessToken.value = saved.accessToken;
        show(message, `Application received. Reference: ${saved.reference}. Save the access code displayed below; it is only shown once.`);
        resultBox.innerHTML = `<article class="application-record"><h2>Submission receipt</h2><p><strong>Reference:</strong> ${escapeHTML(saved.reference)}</p><p><strong>Private access code:</strong></p><code class="application-access-code">${escapeHTML(saved.accessToken)}</code><p>Store this code securely. NEXORA cannot recover the original code because only its hash is stored.</p></article>`;
        sessionStorage.removeItem('nexora.application.receipt');
      } catch { /* Ignore malformed session receipt. */ }
    }
    lookup.addEventListener('submit', async event => {
      event.preventDefault();
      const button = lookup.querySelector('[type="submit"]'); button.disabled = true;
      try {
        const token = await csrf();
        const data = await request(`/api/applications/${encodeURIComponent(lookup.reference.value.trim())}/status`, { method: 'POST', headers: { 'X-CSRF-Token': token }, body: JSON.stringify({ accessToken: lookup.accessToken.value.trim() }) });
        const history = (data.history || []).map(item => `<li><strong>${escapeHTML(item.status)}</strong> — ${escapeHTML(new Date(item.at).toLocaleString())}<br>${escapeHTML(item.note || '')}</li>`).join('');
        resultBox.innerHTML = `<article class="application-record"><p class="eyebrow">${escapeHTML(data.type.toUpperCase())} APPLICATION</p><h2>${escapeHTML(data.reference)}</h2><p><span class="status-pill">${escapeHTML(data.status)}</span></p><p>Submitted: ${escapeHTML(new Date(data.submittedAt).toLocaleString())}</p><h3>Status history</h3><ol>${history || '<li>No status history is available.</li>'}</ol>${!['Approved','Rejected','Withdrawn'].includes(data.status) ? '<button type="button" class="button button-secondary" id="withdraw-application">Withdraw application</button>' : ''}</article>`;
        const withdraw = document.querySelector('#withdraw-application');
        withdraw?.addEventListener('click', async () => {
          if (!confirm('Withdraw this application? This action cannot be reversed through applicant tracking.')) return;
          try { const token = await csrf(); await request(`/api/applications/${encodeURIComponent(data.reference)}/withdraw`, { method: 'POST', headers: { 'X-CSRF-Token': token }, body: JSON.stringify({ accessToken: lookup.accessToken.value.trim() }) }); show(message, 'Application withdrawn. Refresh the status to confirm.'); withdraw.disabled = true; }
          catch (error) { show(message, error.message, true); }
        });
        show(message, 'Application status retrieved.');
      } catch (error) { resultBox.replaceChildren(); show(message, error.message, true); }
      finally { button.disabled = false; }
    });
  }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
})();
