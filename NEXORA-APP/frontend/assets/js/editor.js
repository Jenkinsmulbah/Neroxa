(() => {
  'use strict';
  const $ = (s, root=document) => root.querySelector(s);
  const canvas = $('#design-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const viewport = $('#canvas-viewport');
  const stage = $('#canvas-stage');
  const status = $('#editor-status');
  const saveIndicator = $('#save-indicator');
  const STORE_KEY = 'nexora.designs';
  const CURRENT_KEY = 'nexora.currentDesign';
  const defaults = {name:'Untitled design',width:1080,height:1080,background:'#ffffff',objects:[]};
  let design = {...defaults};
  let selected = -1;
  let zoom = 1;
  let history = [];
  let future = [];
  let gesture = null;
  let dirty = false;
  let designId = null;
  let autosaveTimer = null;
  const AUTOSAVE_DELAY = 900;
  const imageCache = new Map();
  const fields = {
    text:$('#object-text'), color:$('#object-color'), opacity:$('#object-opacity'), size:$('#object-size'),
    font:$('#object-font'), x:$('#object-x'), y:$('#object-y'), width:$('#object-width'),
    height:$('#object-height'), rotation:$('#object-rotation')
  };

  function safeParse(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
  function loadInitial() {
    const incoming = safeParse(sessionStorage.getItem(CURRENT_KEY), {});
    const { id: incomingId, ...incomingDesign } = incoming;
    const params = new URLSearchParams(location.search);
    const requestedId = params.get('id');
    const saved = safeParse(localStorage.getItem(STORE_KEY), []);
    const match = requestedId ? saved.find(item => String(item.id) === requestedId) : null;

    if (match?.design) {
      // A saved design opened by ID is authoritative; stale session data must not overwrite it.
      Object.assign(design, match.design);
      designId = String(match.id);
    } else {
      Object.assign(design, incomingDesign, {objects: Array.isArray(incomingDesign.objects) ? incomingDesign.objects : design.objects});
      designId = requestedId || incomingId || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `design-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    }
    if (params.has('name')) design.name = params.get('name');
    design.width = clamp(Number(design.width) || 1080, 100, 4000);
    design.height = clamp(Number(design.height) || 1080, 100, 4000);
    design.objects = Array.isArray(design.objects) ? design.objects : [];
    canvas.width = design.width;
    canvas.height = design.height;
    $('#design-name').value = design.name || defaults.name;
    $('#background-color').value = validHex(design.background) ? design.background : '#ffffff';
    $('#background-hex').value = $('#background-color').value.toUpperCase();
    $('#canvas-dimensions').textContent = `${canvas.width} × ${canvas.height} px`;
  }
  function validHex(value) { return /^#[0-9a-f]{6}$/i.test(String(value)); }
  function clamp(n,min,max) { return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)); }
  function setStatus(message, isError=false) {
    status.textContent = message;
    status.style.color = isError ? '#ff9b9b' : '';
  }
  function markDirty() {
    dirty = true;
    saveIndicator.textContent = 'Unsaved changes';
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => persistDesign(false), AUTOSAVE_DELAY);
  }
  function snapshot() {
    history.push(JSON.stringify(design));
    if (history.length > 80) history.shift();
    future = [];
    updateHistoryButtons();
  }
  function restore(serialized) {
    design = JSON.parse(serialized);
    canvas.width = design.width; canvas.height = design.height;
    selected = -1;
    $('#background-color').value = design.background;
    $('#background-hex').value = design.background.toUpperCase();
    $('#canvas-dimensions').textContent = `${canvas.width} × ${canvas.height} px`;
    markDirty(); fitCanvas(); render(); syncProperties();
  }
  function updateHistoryButtons() {
    $('#undo-btn').disabled = history.length === 0;
    $('#redo-btn').disabled = future.length === 0;
  }
  function objectBounds(o) {
    if (o.type === 'text') {
      ctx.save(); ctx.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size || 64}px ${o.font || 'Arial'}`;
      const lines = String(o.text || 'Text').split('\n');
      const width = Math.max(12, ...lines.map(line => ctx.measureText(line || ' ').width));
      ctx.restore();
      return {x:o.x,y:o.y,w:o.w || width,h:o.h || lines.length * (o.size || 64) * 1.2};
    }
    if (o.type === 'circle') return {x:o.x-(o.r||70),y:o.y-(o.r||70),w:(o.r||70)*2,h:(o.r||70)*2};
    if (o.type === 'line') return {x:Math.min(o.x,o.x2),y:Math.min(o.y,o.y2),w:Math.max(8,Math.abs(o.x2-o.x)),h:Math.max(8,Math.abs(o.y2-o.y))};
    return {x:o.x,y:o.y,w:o.w||160,h:o.h||100};
  }
  function drawObject(o) {
    ctx.save();
    const b = objectBounds(o);
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    ctx.translate(cx,cy); ctx.rotate((Number(o.rotation)||0)*Math.PI/180); ctx.translate(-cx,-cy);
    ctx.globalAlpha = clamp(Number(o.opacity ?? 100),0,100)/100;
    ctx.fillStyle = o.color || '#171717'; ctx.strokeStyle = o.color || '#171717';
    if (o.type === 'text') {
      ctx.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${clamp(Number(o.size)||64,8,500)}px "${o.font || 'Arial'}"`;
      ctx.textBaseline = 'top'; ctx.textAlign = o.align || 'left';
      const lines = String(o.text || 'Text').split('\n');
      const tx = o.align === 'center' ? o.x + (o.w || b.w)/2 : o.align === 'right' ? o.x + (o.w || b.w) : o.x;
      lines.forEach((line,index)=>ctx.fillText(line,tx,o.y+index*(o.size||64)*1.2));
    } else if (o.type === 'rect') {
      const radius = clamp(Number(o.radius)||0,0,Math.min(o.w,o.h)/2);
      if (radius) { ctx.beginPath(); ctx.roundRect(o.x,o.y,o.w,o.h,radius); ctx.fill(); }
      else ctx.fillRect(o.x,o.y,o.w,o.h);
    } else if (o.type === 'circle') {
      ctx.beginPath(); ctx.arc(o.x,o.y,o.r||70,0,Math.PI*2); ctx.fill();
    } else if (o.type === 'line') {
      ctx.lineWidth = o.strokeWidth || 8; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(o.x2,o.y2); ctx.stroke();
    } else if (o.type === 'image' && o.src) {
      let img = imageCache.get(o.src);
      if (!img) { img = new Image(); imageCache.set(o.src,img); img.onload=render; img.src=o.src; }
      if (img.complete && img.naturalWidth) ctx.drawImage(img,o.x,o.y,o.w,o.h);
    }
    ctx.restore();
  }
  function drawSelection(o) {
    const b = objectBounds(o); const handle=10;
    ctx.save();
    const cx=b.x+b.w/2,cy=b.y+b.h/2;
    ctx.translate(cx,cy);ctx.rotate((Number(o.rotation)||0)*Math.PI/180);ctx.translate(-cx,-cy);
    ctx.strokeStyle='#f07842';ctx.lineWidth=Math.max(2,canvas.width/700);ctx.setLineDash([8,5]);ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.setLineDash([]);
    ctx.fillStyle='#fff';ctx.strokeStyle='#f07842';
    [[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].forEach(([x,y])=>{ctx.beginPath();ctx.rect(x-handle/2,y-handle/2,handle,handle);ctx.fill();ctx.stroke();});
    ctx.restore();
  }
  function render() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=design.background||'#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
    design.objects.forEach(drawObject);
    if (selected>=0 && design.objects[selected]) drawSelection(design.objects[selected]);
    renderLayers();
    updateHistoryButtons();
  }
  function fitCanvas() {
    const availableW=Math.max(180,viewport.clientWidth-70),availableH=Math.max(180,viewport.clientHeight-70);
    zoom=Math.min(1,availableW/canvas.width,availableH/canvas.height);
    applyZoom();
  }
  function applyZoom() {
    const width=Math.round(canvas.width*zoom),height=Math.round(canvas.height*zoom);
    canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
    $('#zoom-level').textContent=`${Math.round(zoom*100)}%`;
  }
  function point(event) {
    const r=canvas.getBoundingClientRect();
    return {x:(event.clientX-r.left)*canvas.width/r.width,y:(event.clientY-r.top)*canvas.height/r.height};
  }
  function localPointForObject(p,o) {
    const b=objectBounds(o),cx=b.x+b.w/2,cy=b.y+b.h/2,a=-(Number(o.rotation)||0)*Math.PI/180;
    const dx=p.x-cx,dy=p.y-cy;
    return {x:cx+dx*Math.cos(a)-dy*Math.sin(a),y:cy+dx*Math.sin(a)+dy*Math.cos(a)};
  }
  function hitTest(p,o) {
    const q=localPointForObject(p,o),b=objectBounds(o),pad=5;
    return q.x>=b.x-pad&&q.x<=b.x+b.w+pad&&q.y>=b.y-pad&&q.y<=b.y+b.h+pad;
  }
  function hitResizeHandle(p,o) {
    const b=objectBounds(o),q=localPointForObject(p,o),tol=18;
    if(Math.abs(q.x-(b.x+b.w))<tol&&Math.abs(q.y-(b.y+b.h))<tol)return 'se';
    if(Math.abs(q.x-b.x)<tol&&Math.abs(q.y-b.y)<tol)return 'nw';
    if(Math.abs(q.x-(b.x+b.w))<tol&&Math.abs(q.y-b.y)<tol)return 'ne';
    if(Math.abs(q.x-b.x)<tol&&Math.abs(q.y-(b.y+b.h))<tol)return 'sw';
    return null;
  }
  function select(index) { selected=index;syncProperties();render(); }
  function syncProperties() {
    const o=design.objects[selected],empty=$('#no-selection'),panel=$('#selected-properties');
    empty.hidden=!!o;panel.hidden=!o;
    if(!o)return;
    fields.text.value=o.text||'';fields.text.disabled=o.type!=='text';
    fields.color.value=validHex(o.color)?o.color:'#171717';
    fields.opacity.value=Math.round(o.opacity??100);fields.size.value=o.size||64;fields.font.value=o.font||'Arial';
    fields.x.value=Math.round(o.x);fields.y.value=Math.round(o.y);
    const b=objectBounds(o);fields.width.value=Math.round(o.w||b.w);fields.height.value=Math.round(o.h||b.h);
    fields.rotation.value=o.rotation||0;$('#rotation-value').textContent=`${o.rotation||0}°`;
    $('#bold-text').classList.toggle('active',!!o.bold);$('#italic-text').classList.toggle('active',!!o.italic);
    $('#align-left').classList.toggle('active',(o.align||'left')==='left');$('#align-center').classList.toggle('active',o.align==='center');
  }
  function addObject(o) { snapshot();design.objects.push(o);selected=design.objects.length-1;markDirty();syncProperties();render();setStatus(`${o.type[0].toUpperCase()+o.type.slice(1)} added.`); }
  function addText(text='Your text',size=64) { addObject({type:'text',text,x:Math.round(canvas.width*.12),y:Math.round(canvas.height*.12),size,color:'#171717',font:'Arial',opacity:100,rotation:0}); }
  function renderLayers() {
    const box=$('#layers-list');$('#layer-count').textContent=design.objects.length;
    if(!design.objects.length){box.innerHTML='<p class="property-empty">Your design has no elements yet.</p>';return;}
    box.innerHTML='';
    [...design.objects].map((o,i)=>({o,i})).reverse().forEach(({o,i})=>{
      const button=document.createElement('button');button.type='button';button.className='layer-item'+(i===selected?' active':'');
      const icon={text:'T',rect:'▭',circle:'◯',image:'▧',line:'／'}[o.type]||'•';
      const name=o.type==='text'?(o.text||'Text').split('\n')[0]:`${o.type[0].toUpperCase()+o.type.slice(1)} ${i+1}`;
      const glyph=document.createElement('span');glyph.textContent=icon;
      const label=document.createElement('span');label.className='layer-name';label.textContent=name;
      button.append(glyph,label);button.addEventListener('click',()=>select(i));box.append(button);
    });
  }

  $('#tool-text').addEventListener('click',()=>addText());
  $('#tool-heading').addEventListener('click',()=>addText('Your heading',96));
  $('#tool-rect').addEventListener('click',()=>addObject({type:'rect',x:100,y:100,w:320,h:210,color:'#f07842',opacity:100,rotation:0}));
  $('#tool-circle').addEventListener('click',()=>addObject({type:'circle',x:canvas.width/2,y:canvas.height/2,r:100,color:'#d4af37',opacity:100,rotation:0}));
  $('#tool-line').addEventListener('click',()=>addObject({type:'line',x:100,y:150,x2:500,y2:150,color:'#171717',strokeWidth:10,opacity:100,rotation:0}));
  $('#duplicate-object').addEventListener('click',()=>{if(selected<0)return;const copy=JSON.parse(JSON.stringify(design.objects[selected]));copy.x+=24;copy.y+=24;if(copy.type==='line'){copy.x2+=24;copy.y2+=24;}addObject(copy);});
  $('#delete-object').addEventListener('click',()=>{if(selected<0)return;snapshot();design.objects.splice(selected,1);selected=-1;markDirty();syncProperties();render();setStatus('Object deleted.');});
  $('#background-color').addEventListener('input',e=>{design.background=e.target.value;$('#background-hex').value=e.target.value.toUpperCase();markDirty();render();});
  $('#background-hex').addEventListener('change',e=>{const value=e.target.value.startsWith('#')?e.target.value:'#'+e.target.value;if(!validHex(value)){setStatus('Enter a valid six-digit hex color.',true);return;}snapshot();design.background=value;$('#background-color').value=value;markDirty();render();});
  $('#image-upload').addEventListener('change',e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!file.type.startsWith('image/')){setStatus('Choose a valid image file.',true);return;}
    if(file.size>8*1024*1024){setStatus('Image must be 8 MB or smaller.',true);e.target.value='';return;}
    const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,canvas.width*.72/img.width,canvas.height*.72/img.height);addObject({type:'image',src:reader.result,x:(canvas.width-img.width*scale)/2,y:(canvas.height-img.height*scale)/2,w:img.width*scale,h:img.height*scale,opacity:100,rotation:0,color:'#ffffff'});};img.onerror=()=>setStatus('The selected image could not be opened.',true);img.src=reader.result;};reader.readAsDataURL(file);e.target.value='';
  });

  function updateSelected(mutator,label='Properties updated.') {
    const o=design.objects[selected];if(!o)return;snapshot();mutator(o);markDirty();render();syncProperties();setStatus(label);
  }
  fields.text.addEventListener('change',()=>updateSelected(o=>{if(o.type==='text')o.text=fields.text.value;}));
  fields.color.addEventListener('focus',()=>{if(selected>=0)snapshot();});
  fields.color.addEventListener('input',()=>{const o=design.objects[selected];if(!o)return;o.color=fields.color.value;markDirty();render();});
  fields.opacity.addEventListener('change',()=>updateSelected(o=>o.opacity=clamp(+fields.opacity.value,0,100)));
  fields.size.addEventListener('change',()=>updateSelected(o=>{if(o.type==='text')o.size=clamp(+fields.size.value,8,500);}));
  fields.font.addEventListener('change',()=>updateSelected(o=>o.font=fields.font.value));
  fields.x.addEventListener('change',()=>updateSelected(o=>{const dx=+fields.x.value-o.x;o.x=clamp(+fields.x.value,-canvas.width,canvas.width);if(o.type==='line')o.x2+=dx;}));
  fields.y.addEventListener('change',()=>updateSelected(o=>{const dy=+fields.y.value-o.y;o.y=clamp(+fields.y.value,-canvas.height,canvas.height);if(o.type==='line')o.y2+=dy;}));
  fields.width.addEventListener('change',()=>updateSelected(o=>{if(o.type==='circle')o.r=clamp(+fields.width.value/2,1,canvas.width*2);else if(o.type==='line')o.x2=o.x+clamp(+fields.width.value,1,canvas.width*2);else o.w=clamp(+fields.width.value,1,canvas.width*2);}));
  fields.height.addEventListener('change',()=>updateSelected(o=>{if(o.type==='circle')o.r=clamp(+fields.height.value/2,1,canvas.height*2);else if(o.type==='line')o.y2=o.y+clamp(+fields.height.value,1,canvas.height*2);else o.h=clamp(+fields.height.value,1,canvas.height*2);}));
  fields.rotation.addEventListener('pointerdown',()=>{if(selected>=0)snapshot();});
  fields.rotation.addEventListener('input',()=>{const o=design.objects[selected];if(!o)return;o.rotation=+fields.rotation.value;$('#rotation-value').textContent=`${o.rotation}°`;markDirty();render();});
  $('#bold-text').addEventListener('click',()=>updateSelected(o=>{if(o.type==='text')o.bold=!o.bold;}));
  $('#italic-text').addEventListener('click',()=>updateSelected(o=>{if(o.type==='text')o.italic=!o.italic;}));
  $('#align-left').addEventListener('click',()=>updateSelected(o=>{if(o.type==='text')o.align='left';}));
  $('#align-center').addEventListener('click',()=>updateSelected(o=>{if(o.type==='text')o.align='center';}));
  $('#layer-up').addEventListener('click',()=>moveLayer(1));$('#layer-down').addEventListener('click',()=>moveLayer(-1));
  function moveLayer(direction){if(selected<0)return;const target=selected+direction;if(target<0||target>=design.objects.length)return;snapshot();[design.objects[selected],design.objects[target]]=[design.objects[target],design.objects[selected]];selected=target;markDirty();render();syncProperties();}

  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const p=point(event);
    if(selected>=0&&design.objects[selected]){
      const o=design.objects[selected],handle=hitResizeHandle(p,o);
      if(handle){snapshot();gesture={mode:'resize',start:p,original:JSON.parse(JSON.stringify(o)),handle};canvas.setPointerCapture(event.pointerId);return;}
    }
    for(let i=design.objects.length-1;i>=0;i--){if(hitTest(p,design.objects[i])){select(i);snapshot();gesture={mode:'move',start:p,original:JSON.parse(JSON.stringify(design.objects[i]))};canvas.setPointerCapture(event.pointerId);return;}}
    select(-1);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!gesture)return;const p=point(event),o=design.objects[selected],dx=p.x-gesture.start.x,dy=p.y-gesture.start.y,original=gesture.original;if(!o)return;
    if(gesture.mode==='move'){
      o.x=original.x+dx;o.y=original.y+dy;
      if(o.type==='line'){o.x2=original.x2+dx;o.y2=original.y2+dy;}
    } else {
      const b=objectBounds(original);let x=b.x,y=b.y,w=b.w,h=b.h;
      if(gesture.handle.includes('e'))w=Math.max(12,b.w+dx);if(gesture.handle.includes('s'))h=Math.max(12,b.h+dy);
      if(gesture.handle.includes('w')){x=b.x+dx;w=Math.max(12,b.w-dx);}if(gesture.handle.includes('n')){y=b.y+dy;h=Math.max(12,b.h-dy);}
      if(o.type==='circle'){o.r=Math.max(6,Math.min(w,h)/2);o.x=x+w/2;o.y=y+h/2;}
      else if(o.type==='line'){o.x=x;o.y=y;o.x2=x+w;o.y2=y+h;}
      else {o.x=x;o.y=y;o.w=w;o.h=h;if(o.type==='text')o.size=clamp(h/1.2,8,500);}
    }
    markDirty();render();syncProperties();
  });
  function finishGesture(){if(!gesture)return;gesture=null;setStatus('Object updated.');}
  canvas.addEventListener('pointerup',finishGesture);canvas.addEventListener('pointercancel',finishGesture);

  $('#undo-btn').addEventListener('click',()=>{if(!history.length)return;future.push(JSON.stringify(design));restore(history.pop());setStatus('Last action undone.');});
  $('#redo-btn').addEventListener('click',()=>{if(!future.length)return;history.push(JSON.stringify(design));restore(future.pop());setStatus('Action restored.');});
  function persistDesign(manual = false) {
    if (!dirty && !manual) return;
    window.clearTimeout(autosaveTimer);
    design.name = $('#design-name').value.trim() || 'Untitled design';
    const storedRecords = safeParse(localStorage.getItem(STORE_KEY), []);
    const records = Array.isArray(storedRecords) ? storedRecords : [];
    const record = {
      id: designId,
      name: design.name,
      size: `${design.width} × ${design.height}`,
      description: `${design.objects.length} design elements`,
      status: manual ? 'Saved locally' : 'Draft · autosaved locally',
      updatedAt: new Date().toISOString(),
      design: JSON.parse(JSON.stringify(design))
    };
    const index = records.findIndex(item => String(item.id) === String(designId));
    if (index >= 0) records[index] = record;
    else records.unshift(record);

    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(records));
      try { sessionStorage.setItem(CURRENT_KEY, JSON.stringify({ ...design, id: designId })); } catch (_) { /* Local design record remains the durable browser copy. */ }
      dirty = false;
      saveIndicator.textContent = manual ? 'Saved in this browser' : 'Draft autosaved';
      if (manual) setStatus('Design saved locally.');
    } catch (error) {
      saveIndicator.textContent = 'Save failed';
      setStatus('Could not save. Browser storage may be full. Export your design or remove large imported images before continuing.', true);
    }
  }
  function saveDesign() { persistDesign(true); }
  $('#save-design').addEventListener('click',saveDesign);
  $('#design-name').addEventListener('input',()=>{design.name=$('#design-name').value;markDirty();});
  $('#export-design').addEventListener('click',()=>{
    const old=selected;selected=-1;render();
    try{canvas.toBlob(blob=>{if(!blob){setStatus('PNG export failed.',true);selected=old;render();return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(design.name||'nexora-design').trim().replace(/[^a-z0-9-_]+/gi,'-')+'.png';a.click();URL.revokeObjectURL(url);selected=old;render();setStatus('PNG downloaded at the canvas dimensions.');},'image/png');}
    catch(error){selected=old;render();setStatus('PNG export failed. Check whether an imported image can be exported.',true);}
  });
  $('#zoom-in').addEventListener('click',()=>{zoom=clamp(zoom+.1,.1,2);applyZoom();});
  $('#zoom-out').addEventListener('click',()=>{zoom=clamp(zoom-.1,.1,2);applyZoom();});
  $('#zoom-fit').addEventListener('click',fitCanvas);
  new ResizeObserver(()=>fitCanvas()).observe(viewport);
  document.addEventListener('keydown',event=>{
    const tag=event.target?.tagName?.toLowerCase();const editing=['input','textarea','select'].includes(tag)||event.target?.isContentEditable;
    if(editing)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$('#undo-btn').click();}
    else if((event.ctrlKey||event.metaKey)&&(event.key.toLowerCase()==='y'||(event.shiftKey&&event.key.toLowerCase()==='z'))){event.preventDefault();$('#redo-btn').click();}
    else if(event.key==='Delete'||event.key==='Backspace'){if(selected>=0){event.preventDefault();$('#delete-object').click();}}
    else if(event.key==='Escape')select(-1);
    else if(selected>=0&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
      event.preventDefault();const o=design.objects[selected],step=event.shiftKey?10:1;snapshot();if(event.key==='ArrowUp')o.y-=step;if(event.key==='ArrowDown')o.y+=step;if(event.key==='ArrowLeft')o.x-=step;if(event.key==='ArrowRight')o.x+=step;if(o.type==='line'){if(event.key==='ArrowUp')o.y2-=step;if(event.key==='ArrowDown')o.y2+=step;if(event.key==='ArrowLeft')o.x2-=step;if(event.key==='ArrowRight')o.x2+=step;}markDirty();render();syncProperties();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) persistDesign(false);
  });
  window.addEventListener('pagehide', () => {
    if (dirty) persistDesign(false);
  });
  window.addEventListener('beforeunload',event=>{
    if (dirty) persistDesign(false);
    if (dirty) { event.preventDefault(); event.returnValue=''; }
  });
  loadInitial();render();syncProperties();updateHistoryButtons();requestAnimationFrame(fitCanvas);
})();
