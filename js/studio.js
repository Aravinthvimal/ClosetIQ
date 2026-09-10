const DEMO_PHOTOS = {'Cotton field jacket':'assets/jacket.png','Indigo everyday shirt':'assets/blue-shirt.png','Contrast cotton henley':'assets/henley.png'};
const BGREMOVAL_CDN = 'https://esm.sh/@imgly/background-removal';

window.prepareStudio = function(){
  State.items.forEach(i=>{if(DEMO_PHOTOS[i.name]&&!i.img)i.img=DEMO_PHOTOS[i.name];});
  document.querySelectorAll('.slot-icon').forEach(e=>e.textContent='＋');
  document.getElementById('arrowLeft').setAttribute('aria-label','Previous garment');
  document.getElementById('arrowRight').setAttribute('aria-label','Next garment');
  document.getElementById('navAdd')?.setAttribute('aria-label','Add garment');
  document.querySelectorAll('.form-group').forEach(group=>{const label=group.querySelector('.form-label'),input=group.querySelector('input,select,textarea');if(label&&input)label.htmlFor=input.id;});
  document.getElementById('resetView').disabled=true;
  import('./closet-3d.js').catch(()=>{document.getElementById('sceneStatus').textContent='PHOTO VIEW · 3D unavailable';});
};

window.refreshStudio = function(){
  const items=State.items.filter(i=>i.category===State.currentCategory);
  document.getElementById('wardrobeCount').textContent=State.items.length;
  const gallery=document.getElementById('garmentGallery');gallery.replaceChildren();
  items.forEach((item,index)=>{
    const card=document.createElement('button');card.className='garment-card'+(index===State.carouselIndex?' selected':'');card.setAttribute('aria-pressed',index===State.carouselIndex?'true':'false');
    if(item.img){const img=document.createElement('img');img.src=item.img;img.alt=item.name;img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('span'),{className:'no-photo',textContent:'Photo unavailable'}));};card.append(img);}
    else card.append(Object.assign(document.createElement('span'),{className:'no-photo',textContent:'Add your photograph'}));
    const name=document.createElement('strong');name.textContent=item.name;const caption=document.createElement('small');caption.textContent=DEMO_PHOTOS[item.name]?'Sample piece':item.img?'Your photograph':'Awaiting a photograph';card.append(name,caption);
    card.onclick=()=>{
      State.carouselIndex=index;
      State.selectedItemId=item.id;
      // Update strip text directly — bypasses refreshStudio which would reload the 3D scene
      const occs=(item.occasions||[]).map(o=>({daily:'Daily',smart:'Smart Casual',formal:'Formal',date:'Date Night',travel:'Travel',party:'Party',gym:'Gym'}[o]||o)).join(' · ');
      const sn=document.getElementById('stripName');const sm=document.getElementById('stripMeta');
      if(sn)sn.textContent=item.name;
      if(sm)sm.textContent=[item.notes,occs].filter(Boolean).join(' — ');
      // Update gallery highlight
      document.querySelectorAll('#garmentGallery .garment-card').forEach((c,i)=>{
        c.classList.toggle('selected',i===index);
        c.setAttribute('aria-pressed',i===index?'true':'false');
      });
    };gallery.append(card);
  });
  window.dispatchEvent(new CustomEvent('closet:update',{detail:{items,selected:items[State.carouselIndex]?.id}}));
};

window.addEventListener('closet:ready',()=>{document.getElementById('resetView').disabled=false;refreshStudio();});
window.addEventListener('closet:hover',e=>{
  const items=State.items.filter(i=>i.category===State.currentCategory);
  const index=e.detail==null?-1:items.findIndex(i=>i.id===e.detail);
  document.querySelectorAll('#garmentGallery .garment-card').forEach((card,i)=>{
    card.classList.toggle('hovered',i===index);
  });
});
window.addEventListener('closet:select',e=>{
  const items=State.items.filter(i=>i.category===State.currentCategory);
  const index=items.findIndex(i=>i.id===e.detail);
  if(index<0) return;
  State.carouselIndex=index;
  // Update card highlight only — do NOT call Carousel.render() or refreshStudio()
  // as that would re-dispatch closet:update and reload the 3D scene
  document.querySelectorAll('#garmentGallery .garment-card').forEach((card,i)=>{
    card.classList.toggle('selected',i===index);
    card.setAttribute('aria-pressed',i===index?'true':'false');
  });
  const card=document.querySelectorAll('#garmentGallery .garment-card')[index];
  if(card) card.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
});

// ── Photo state ───────────────────────────────────────────
let photoVersion = 0, processing = false;
const photoStatus = msg => document.getElementById('photoStatus').textContent = msg;

window.cancelPhotoJob = () => {
  photoVersion++; processing = false; State.originalPhoto = null;
  document.getElementById('itemCategory').disabled = false;
  document.getElementById('uploadPhotoBtn').disabled = false;
  document.getElementById('itemModalSave').disabled = false;
  document.getElementById('removeBgBtn').disabled = false;
  document.getElementById('photoInput').value = '';
  photoStatus('Upload a photo — background is removed on your device, no API needed.');
};

async function normalizedPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type))
    throw new Error('Please choose a JPG, PNG or WebP photograph.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

window.handlePhotoUpload = async function(file) {
  if (!file || processing) return;
  const version = ++photoVersion;
  processing = true;
  document.getElementById('itemModalSave').disabled = true;
  try {
    const source = await normalizedPhoto(file);
    if (version !== photoVersion) return;
    State.photoFile = file;
    State.originalPhoto = source;
    State.photoDataUrl = source;
    const preview = document.getElementById('photoPreviewImg');
    preview.src = source; preview.style.display = 'block';
    document.getElementById('photoPlaceholder').style.display = 'none';
    document.getElementById('removeBgBtn').style.display = 'inline-flex';
    if (!document.getElementById('itemName').value)
      document.getElementById('itemName').value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 60);
    await processPhoto(version);
  } catch(e) {
    if (version === photoVersion) { photoStatus(e.message); showToast(e.message, 'error'); }
  } finally {
    if (version === photoVersion) { processing = false; document.getElementById('itemModalSave').disabled = false; }
  }
};

async function processPhoto(version) {
  const btn = document.getElementById('removeBgBtn');
  btn.disabled = true;
  document.getElementById('itemCategory').disabled = true;
  document.getElementById('uploadPhotoBtn').disabled = true;
  btn.textContent = 'Extracting…';

  try {
    // ── Step 1: Remove background (imgly) ────────────────
    photoStatus('Step 1 / 2 — Removing background… (first run ~50 MB download)');
    const { removeBackground } = await import(BGREMOVAL_CDN);
    const blob = await fetch(State.originalPhoto).then(r => r.blob());
    const cleanBlob = await removeBackground(blob, {
      progress: (key, current, total) => {
        if (version !== photoVersion) return;
        if (total > 0) photoStatus(`Step 1 / 2 — Removing background… ${Math.round(current / total * 100)}%`);
      },
    });
    if (version !== photoVersion) return;

    const cleanDataUrl = await new Promise(res => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.readAsDataURL(cleanBlob);
    });

    // Show intermediate result
    document.getElementById('photoPreviewImg').src = cleanDataUrl;

    // Step 2 skipped for shoes/watch/accessories — background removal is enough
    const cat = document.getElementById('itemCategory').value;
    const skipStep2 = ['shoes', 'watch', 'accessory', 'pants'].includes(cat);

    if (skipStep2) {
      State.photoDataUrl = cleanDataUrl;
      photoStatus('Background removed. Check the edges and save.');
      showToast('Background removed', 'success');
    } else {
      // ── Step 2: Isolate clothing (ONNX) ──────────────────
      photoStatus('Step 2 / 2 — Isolating garment…');
      const { extractGarment } = await import('./garment-processing.js');
      const result = await extractGarment(
        cleanDataUrl,
        cat,
        msg => { if (version === photoVersion) photoStatus(`Step 2 / 2 — ${msg}`); }
      );
      if (version !== photoVersion) return;

      State.photoDataUrl = result;
      document.getElementById('photoPreviewImg').src = result;
      photoStatus('Garment extracted. Check the edges and save.');
      showToast('Garment extracted', 'success');
    }

  } catch(e) {
    if (version !== photoVersion) return;
    State.photoDataUrl = State.originalPhoto;
    photoStatus(e.message + ' Original photo kept.');
    showToast('Extraction failed', 'error');
  } finally {
    if (version === photoVersion) {
      btn.disabled = false;
      document.getElementById('itemCategory').disabled = false;
      document.getElementById('uploadPhotoBtn').disabled = false;
      btn.textContent = 'Re-extract';
    }
  }
}

window.doRemoveBg = async function() {
  if (!State.originalPhoto || processing) return;
  const version = ++photoVersion;
  processing = true;
  document.getElementById('itemModalSave').disabled = true;
  try { await processPhoto(version); }
  finally { if (version === photoVersion) { processing = false; document.getElementById('itemModalSave').disabled = false; } }
};

const originalSave = window.saveItem;
window.saveItem = async function() {
  if (processing) return;
  if (!State.photoDataUrl) { showToast('Upload a photo first.', 'error'); return; }
  const btn = document.getElementById('itemModalSave');
  btn.disabled = true;
  try { await originalSave(); } finally { btn.disabled = false; }
};

// Keep original button
const keep = document.createElement('button');
keep.className = 'btn-outline sm'; keep.textContent = 'Keep original'; keep.id = 'keepOriginal';
keep.onclick = e => {
  e.stopPropagation();
  if (processing || !State.originalPhoto) return;
  State.photoDataUrl = State.originalPhoto;
  document.getElementById('photoPreviewImg').src = State.originalPhoto;
  photoStatus('Original photo kept.');
};
document.querySelector('.photo-actions').append(keep);

// Drag-and-drop
const zone = document.getElementById('photoZone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); window.handlePhotoUpload(e.dataTransfer.files[0]); });

document.getElementById('photoInput').accept = 'image/jpeg,image/png,image/webp';
