(() => {
  'use strict';
  const KEY = 'nexora.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const write = data => localStorage.setItem(KEY, JSON.stringify(data));
  const state = read();
  const all = (selector, root=document) => [...root.querySelectorAll(selector)];
  const formData = form => Object.fromEntries(new FormData(form).entries());
  const notify = (form, message, type='success') => { let box=form.querySelector('[data-form-message]'); if(!box){box=document.createElement('p');box.dataset.formMessage='';form.append(box);} box.className=type==='error'?'notice-error':'notice-success';box.setAttribute('role','status');box.textContent=message; };
  const page = location.pathname.split('/').pop();

  // Keep prototype navigation and account information explicit: this is not secure authentication.
  const signup = document.querySelector('form[action*="welcome.html"]');
  if (signup && page === 'signup.html') signup.addEventListener('submit', e => {
    e.preventDefault(); const d=formData(signup); const pass=signup.querySelector('#password')?.value; const confirm=signup.querySelector('#confirm-password')?.value;
    if(pass!==confirm){notify(signup,'The passwords do not match.','error');return;}
    if(state.account?.email===d.email){notify(signup,'An account with this email is already stored in this browser.','error');return;}
    state.account={fullName:d.full_name,username:d.username,email:d.email};state.onboarding={};write(state);location.href='../onboarding/welcome.html';
  });
  const login=document.querySelector('form[action*="dashboard.html"]');
  if(login && page==='login.html') login.addEventListener('submit',e=>{e.preventDefault();const d=formData(login);if(!state.account||state.account.email!==d.email){notify(login,'No matching demo account was found in this browser. Create an account first.','error');return;}state.session=true;write(state);location.href='../dashboard/dashboard.html';});

  // Onboarding: roles, interests and preferences persist in localStorage.
  const roleForm=document.querySelector('form.choice-form');
  if(roleForm) roleForm.addEventListener('submit',e=>{e.preventDefault();state.onboarding=state.onboarding||{};state.onboarding.roles=all('input[name="role"]:checked',roleForm).map(x=>x.value);if(!state.onboarding.roles.length){notify(roleForm,'Select at least one way you plan to use NEXORA.','error');return;}write(state);location.href='onboarding-preferences.html';});
  const prefsForm=document.querySelector('form[action*="onboarding-review.html"]');
  if(prefsForm) prefsForm.addEventListener('submit',e=>{e.preventDefault();state.onboarding=state.onboarding||{};state.onboarding.interests=all('input[name="interest"]:checked',prefsForm).map(x=>x.value);state.onboarding.experience=prefsForm.querySelector('[name="experience"]:checked')?.value||'';state.onboarding.country=prefsForm.querySelector('[name="country"]')?.value||'';state.onboarding.language=prefsForm.querySelector('[name="language"]')?.value||'en';write(state);location.href='onboarding-review.html';});
  if(page==='onboarding-review.html'){const s=document.querySelector('.summary-card');if(s){const o=state.onboarding||{};s.innerHTML=`<h2>Profile summary</h2><p><strong>Account type:</strong> ${escapeHTML((o.roles||[]).join(', ')||'Not selected')}</p><p><strong>Interests:</strong> ${escapeHTML((o.interests||[]).join(', ')||'Not selected')}</p><p><strong>Experience:</strong> ${escapeHTML(o.experience||'Not selected')}</p><p><strong>Country:</strong> ${escapeHTML(o.country||'Not provided')}</p><p><strong>Language:</strong> ${escapeHTML(o.language||'en')}</p>`;}}
  const finish=document.querySelector('form[action*="dashboard.html"]');if(finish&&page==='onboarding-review.html')finish.addEventListener('submit',e=>{e.preventDefault();state.onboarding=state.onboarding||{};state.onboarding.completed=true;write(state);location.href='../dashboard/dashboard.html';});

  // Prefill and save personal profile.
  if(page==='profile.html'){const f=document.querySelector('form');if(f&&state.account){const values={'display-name':state.account.fullName,'profile-username':state.account.username,'profile-email':state.account.email,'about':state.account.about||''};Object.entries(values).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.value=val;});f.addEventListener('submit',e=>{e.preventDefault();const d=formData(f);Object.assign(state.account,d);write(state);notify(f,'Profile changes saved in this browser.');});}}

  // Designer application draft.
  const designerForm=document.querySelector('form[action*="designer-profile.html"]');if(designerForm)designerForm.addEventListener('submit',e=>{e.preventDefault();const d=formData(designerForm);d.specialties=all('[name="specialty"]:checked',designerForm).map(x=>x.value);state.designer=d;write(state);location.href='designer-profile.html';});
  if(page==='designer-profile.html'&&state.designer){const heading=document.querySelector('.page-heading');if(heading){heading.querySelector('h1').textContent=state.designer.professional_name||'Designer profile';heading.querySelector('p:last-child').textContent=state.designer.headline||state.designer.bio||'Your saved local designer profile draft.';}}

  // Local project requests and saved design cards.
  const hire=document.querySelector('form[action*="projects.html"]');if(hire&&page==='hire-designer.html')hire.addEventListener('submit',e=>{e.preventDefault();const d=formData(hire);d.id=Date.now();d.status='Draft request';state.requests=state.requests||[];state.requests.push(d);write(state);location.href='../workspace/projects.html?submitted=1';});
  if(page==='projects.html'){const sections=all('.content-section');const designs=JSON.parse(localStorage.getItem('nexora.designs')||'[]');if(sections[0])renderList(sections[0],designs,'No designs saved yet.');if(sections[1])renderList(sections[1],state.requests||[],'No hiring requests saved yet.');}
  function renderList(section,items,empty){const box=section.querySelector('.empty-state');if(!box)return;if(!items.length){const p=box.querySelector('p');if(p)p.textContent=empty;return;}box.innerHTML=items.map(x=>`<article class="data-item"><h3>${escapeHTML(x.name||x.project_title||'Untitled')}</h3><p>${escapeHTML(x.description||x.design_type||x.size||'Saved locally')}</p><span class="status-pill">${escapeHTML(x.status||'Saved')}</span></article>`).join('');}

  // Marketplace search filters real, locally saved designer profiles only.
  if(page==='marketplace.html'){const profiles=JSON.parse(localStorage.getItem('nexora.publicDesigners')||'[]');const section=document.querySelector('.content-section');const search=document.querySelector('#search');const specialty=document.querySelector('#specialty');if(profiles.length&&section){const grid=document.createElement('div');grid.className='feature-grid';section.append(grid);const draw=()=>{const q=(search?.value||'').toLowerCase();const sp=(specialty?.value||'').toLowerCase();const matches=profiles.filter(p=>(`${p.name} ${p.headline} ${p.bio} ${(p.specialties||[]).join(' ')}`).toLowerCase().includes(q)&&(!sp||`${(p.specialties||[]).join(' ')}`.toLowerCase().includes(sp)));grid.innerHTML=matches.map(p=>`<article class="designer-card"><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.headline||'Independent designer')}</p><p>${escapeHTML((p.specialties||[]).join(', '))}</p><a href="designer-profile.html">View profile</a></article>`).join('')||'<p>No matching local designer profiles.</p>';};search?.addEventListener('input',draw);specialty?.addEventListener('change',draw);draw();}}

  // Template choices pass a named preset into the new-design page.
  all('a[href*="new-design.html"]').forEach(a=>{if(a.textContent.toLowerCase().includes('choose category'))a.addEventListener('click',()=>sessionStorage.setItem('nexora.template',a.closest('article')?.querySelector('h2')?.textContent||'Custom'));});
  if(page==='new-design.html'){const f=document.querySelector('form');const preset=sessionStorage.getItem('nexora.template');if(preset){const name=document.querySelector('#design-name');if(name&&!name.value)name.value=preset+' design';}const select=document.querySelector('#canvas-size');const w=document.querySelector('#width'),h=document.querySelector('#height');const sizes={square:[1080,1080],portrait:[1080,1350],story:[1080,1920],landscape:[1920,1080],a4:[2480,3508]};select?.addEventListener('change',()=>{if(sizes[select.value]){w.value=sizes[select.value][0];h.value=sizes[select.value][1];}});f?.addEventListener('submit',e=>{e.preventDefault();const d=formData(f);if(+d.width>4000||+d.height>4000){notify(f,'For browser performance, canvas dimensions are limited to 4000 px in this prototype.','error');return;}sessionStorage.setItem('nexora.currentDesign',JSON.stringify({name:d.design_name,width:+d.width,height:+d.height}));location.href='editor.html';});}

  // Basic support form behavior and password reset messaging.
  if(page==='forgot-password.html'){const f=document.querySelector('form');f?.addEventListener('submit',e=>{e.preventDefault();notify(f,'Password reset email delivery is not configured. No email was sent.','error');});}
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

})();