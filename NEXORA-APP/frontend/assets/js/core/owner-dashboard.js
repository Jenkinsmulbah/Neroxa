(() => {
  'use strict';
  const API = document.querySelector('meta[name="nexora-api"]')?.content || 'http://localhost:4000';
  const $ = (id) => document.getElementById(id);
  let permissionCatalog = [];
  const showMessage = (text, kind = '') => { const box = $('owner-message'); box.hidden = false; box.textContent = text; box.className = `owner-message ${kind}`; };
  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  };
  const csrf = async () => (await request('/api/auth/csrf')).csrfToken;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value).toLocaleString() : '—';

  async function loadOwner() {
    const { user } = await request('/api/auth/me');
    if (user.role !== 'owner') { location.replace('../auth/login.html'); return; }
    $('owner-identity').textContent = `${user.fullName} · ${user.email}`;
  }
  async function loadAdministrators() {
    const data = await request('/api/owner/administrators');
    permissionCatalog = data.availablePermissions || [];
    const admins = data.administrators || [];
    $('admin-count').textContent = admins.length;
    $('active-admin-count').textContent = admins.filter(a => a.account_status === 'active').length;
    $('administrator-rows').innerHTML = admins.length ? admins.map(a => {
      const permissions = (a.permissions || []).map(p => `<span class="tag">${escapeHtml(p.permission)}</span>`).join('') || '<span class="muted">No permissions</span>';
      const nextStatus = a.account_status === 'active' ? 'suspended' : 'active';
      return `<tr><td><strong>${escapeHtml(a.full_name)}</strong><br><span class="muted">${escapeHtml(a.email)}</span></td><td>${escapeHtml(a.account_status)}</td><td>${permissions}</td><td><div class="owner-actions"><button type="button" data-permissions="${escapeHtml(a.id)}">Edit permissions</button><button type="button" data-status="${escapeHtml(a.id)}" data-next="${nextStatus}">${nextStatus === 'active' ? 'Reactivate' : 'Suspend'}</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="4">No delegated administrators have been invited.</td></tr>';
    $('permission-options').innerHTML = permissionCatalog.map(p => `<label><input type="checkbox" name="permissions" value="${escapeHtml(p)}"> ${escapeHtml(p)}</label>`).join('');
    $('administrator-rows').querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', async () => {
      const status = button.dataset.next;
      if (!confirm(`Set this administrator account to ${status}?`)) return;
      try { const token = await csrf(); await request(`/api/owner/administrators/${encodeURIComponent(button.dataset.status)}/account-status`, { method:'PATCH', headers:{'X-CSRF-Token':token}, body:JSON.stringify({status}) }); showMessage(`Administrator account ${status}.`, 'success'); await loadAdministrators(); }
      catch (error) { showMessage(error.message, 'error'); }
    }));
    $('administrator-rows').querySelectorAll('[data-permissions]').forEach(button => button.addEventListener('click', async () => {
      const row = admins.find(a => a.id === button.dataset.permissions); if (!row) return;
      const current = (row.permissions || []).map(p => p.permission);
      const answer = prompt(`Enter comma-separated permissions for ${row.full_name}:\n${permissionCatalog.join(', ')}`, current.join(', '));
      if (answer === null) return;
      const selected = answer.split(',').map(x => x.trim()).filter(Boolean);
      if (selected.some(x => !permissionCatalog.includes(x))) { showMessage('One or more permissions are not in the allowed catalogue.', 'error'); return; }
      try { const token = await csrf(); await request(`/api/owner/administrators/${encodeURIComponent(row.id)}/permissions`, { method:'PATCH', headers:{'X-CSRF-Token':token}, body:JSON.stringify({permissions:selected}) }); showMessage('Administrator permissions updated.', 'success'); await loadAdministrators(); }
      catch (error) { showMessage(error.message, 'error'); }
    }));
  }
  async function loadApplications() {
    try { const data = await request('/api/admin/applications?limit=1'); $('application-count').textContent = data.pagination?.total ?? '—';
      const pending = await request('/api/admin/applications?status=Submitted&limit=1'); $('pending-count').textContent = pending.pagination?.total ?? '—'; }
    catch { $('application-count').textContent = '—'; $('pending-count').textContent = 'Permission / API unavailable'; }
  }
  async function loadAudit() {
    try { const data = await request('/api/admin/audit?limit=12'); const rows = data.events || [];
      $('audit-rows').innerHTML = rows.length ? rows.map(e => `<tr><td>${escapeHtml(date(e.created_at))}</td><td>${escapeHtml(e.actor_name || e.actor_user_id || 'System')}</td><td>${escapeHtml(e.action)}</td><td>${escapeHtml(`${e.target_type || ''} ${e.target_id || ''}`)}</td></tr>`).join('') : '<tr><td colspan="4">No audit events returned.</td></tr>'; }
    catch { $('audit-rows').innerHTML = '<tr><td colspan="4">Audit endpoint unavailable.</td></tr>'; }
  }
  $('show-invite').addEventListener('click', () => { $('invite-panel').hidden = false; $('show-invite').hidden = true; });
  $('cancel-invite').addEventListener('click', () => { $('invite-panel').hidden = true; $('show-invite').hidden = false; $('invite-form').reset(); });
  $('invite-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const permissions = [...form.querySelectorAll('[name="permissions"]:checked')].map(x => x.value);
    try {
      const token = await csrf(); const result = await request('/api/owner/administrators/invitations', { method:'POST', headers:{'X-CSRF-Token':token}, body:JSON.stringify({fullName:form.fullName.value.trim(),email:form.email.value.trim(),permissions}) });
      const invitation = result.invitation; $('invitation-result').hidden = false;
      $('invitation-result').innerHTML = `<strong>Invitation created.</strong><p>Send this one-time acceptance token securely to ${escapeHtml(invitation.email)}. It expires ${escapeHtml(date(invitation.expiresAt))}.</p><textarea readonly rows="3" style="width:100%">${escapeHtml(invitation.acceptanceToken)}</textarea><p class="muted">This token is displayed once. Do not publish it or send it through an insecure channel.</p>`;
      form.reset(); await loadAdministrators();
    } catch (error) { showMessage(error.message, 'error'); }
  });
  Promise.all([loadOwner(), loadAdministrators(), loadApplications(), loadAudit()]).catch(error => showMessage(error.message, 'error'));
})();
