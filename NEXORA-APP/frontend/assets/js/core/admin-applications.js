(() => {
  'use strict';
  const API = document.querySelector('meta[name="nexora-api"]')?.content || 'https://neroxa.onrender.com';
  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Request failed.'); return data;
  };
  const csrf = async () => (await request('/api/auth/csrf')).csrfToken;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const message = (root, text, error = false) => { let p=root.querySelector('[data-admin-message]'); if(!p){p=document.createElement('p');p.dataset.adminMessage='';p.setAttribute('aria-live','polite');root.append(p);}p.textContent=text;p.className=error?'form-error':'form-success'; };
  const list = document.querySelector('#admin-application-list');
  if (list) {
    const status = document.querySelector('#application-filter'); const type = document.querySelector('#type-filter');
    const load = async () => {
      list.innerHTML = '<p class="empty-state">Loading applications…</p>';
      try {
        const params = new URLSearchParams({ page:'1', limit:'50', status:status?.value || 'all', type:type?.value || 'all' });
        const data = await request(`/api/admin/applications?${params}`);
        if (!data.applications.length) { list.innerHTML='<p class="empty-state">No applications match these filters.</p>'; return; }
        list.innerHTML = data.applications.map(item => {
          const title = item.application_data?.businessName || item.application_data?.fullName || item.application_data?.applicantName || 'Application';
          return `<article class="application-record"><div class="inline-actions"><span class="eyebrow">${esc(item.application_type.toUpperCase())} · ${esc(item.reference)}</span><span class="status-pill">${esc(item.status)}</span></div><h2>${esc(title)}</h2><p>${esc(item.applicant_email)} · ${esc(new Date(item.submitted_at).toLocaleString())}</p><a class="button button-secondary" href="application-review.html?reference=${encodeURIComponent(item.reference)}">Review application</a></article>`;
        }).join('');
        message(list, `${data.pagination.total} application(s) found. Showing page ${data.pagination.page} of ${Math.max(data.pagination.pages,1)}.`);
      } catch (error) { list.innerHTML=''; message(list, error.message, true); }
    };
    status?.addEventListener('change', load); type?.addEventListener('change', load); load();
  }
  const detail = document.querySelector('#admin-application-detail');
  if (detail) {
    const reference = new URLSearchParams(location.search).get('reference');
    const load = async () => {
      if (!reference) { message(detail, 'Application reference is missing.', true); return; }
      try {
        const data = await request(`/api/admin/applications/${encodeURIComponent(reference)}`);
        const app = data.application; const payload = app.application_data || {};
        const fields = Object.entries(payload).map(([key,value]) => `<dt>${esc(key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()))}</dt><dd>${esc(Array.isArray(value)?value.join(', '):value)}</dd>`).join('');
        const history = data.history.map(item=>`<li><strong>${esc(item.to_status)}</strong> — ${esc(new Date(item.created_at).toLocaleString())} · ${esc(item.actor_name || 'Applicant / system')}<br>${esc(item.note)}${item.internal_note ? `<br><strong>Internal note:</strong> ${esc(item.internal_note)}` : ''}</li>`).join('');
        detail.innerHTML = `<article class="application-record"><p class="eyebrow">${esc(app.application_type.toUpperCase())} APPLICATION · ${esc(app.reference)}</p><h2>${esc(payload.businessName || payload.fullName || payload.applicantName || 'Application')}</h2><p><span class="status-pill">${esc(app.status)}</span></p><p>${esc(app.applicant_email)} · Submitted ${esc(new Date(app.submitted_at).toLocaleString())}</p><h3>Application information</h3><dl>${fields}</dl><h3>Administrator review</h3><label for="review-note">Review note / decision reason *</label><textarea id="review-note" rows="4" maxlength="1200" required></textarea><div class="record-actions">${['Under Review','More Information Required','On Hold','Approved','Rejected'].map(s=>`<button class="button ${s==='Approved'?'button-primary':'button-secondary'}" type="button" data-status="${esc(s)}">${esc(s)}</button>`).join('')}</div><h3>Status history</h3><ol>${history || '<li>No history available.</li>'}</ol></article>`;
        detail.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', async () => {
          const note = detail.querySelector('#review-note').value.trim();
          if (note.length < 5) { message(detail, 'Enter a factual review note of at least five characters.', true); return; }
          button.disabled = true;
          try { const token = await csrf(); await request(`/api/admin/applications/${encodeURIComponent(app.reference)}/decision`, { method:'POST', headers:{'X-CSRF-Token':token}, body:JSON.stringify({status:button.dataset.status,note}) }); location.reload(); }
          catch (error) { message(detail, error.message, true); button.disabled = false; }
        }));
      } catch (error) { detail.innerHTML=''; message(detail, error.message, true); }
    };
    load();
  }
})();
