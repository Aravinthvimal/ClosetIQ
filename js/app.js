/* ════════════════════════════════════════════════════════════
   ClosetIQ — Main Application
   Vanilla JS, no build step required.
════════════════════════════════════════════════════════════ */

'use strict';

// ── Occasion labels ───────────────────────────────────────
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const OCCASIONS = {
  daily:  'Daily',
  smart:  'Smart Casual',
  formal: 'Formal',
  date:   'Date Night',
  travel: 'Travel',
  party:  'Party',
  gym:    'Gym',
};

// ── Category emoji placeholders ───────────────────────────
const CAT_EMOJI = {
  shirt: 'Add photo', tshirt: 'Add photo', dress: 'Add photo', pants: 'Add photo',
  shoes: 'Add photo', watch: 'Add photo', accessory: 'Add photo',
};

// ── Shelf-based categories (displayed on shelf, not hanger) ─
const SHELF_CATS = new Set(['shoes', 'watch', 'accessory']);

// ════════════════════════════════════════════════════════════
// ImageStore — IndexedDB for base64 images (avoids localStorage quota)
// ════════════════════════════════════════════════════════════
const ImageStore = (() => {
  let _db;
  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const req = indexedDB.open('closetiq_imgs', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('imgs');
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror = () => rej(req.error);
    });
  }
  async function put(id, dataUrl) {
    const d = await open();
    return new Promise((res, rej) => {
      const tx = d.transaction('imgs', 'readwrite');
      tx.objectStore('imgs').put(dataUrl, id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function get(id) {
    const d = await open();
    return new Promise((res, rej) => {
      const req = d.transaction('imgs').objectStore('imgs').get(id);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
  }
  async function del(id) {
    const d = await open();
    return new Promise((res, rej) => {
      const tx = d.transaction('imgs', 'readwrite');
      tx.objectStore('imgs').delete(id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function getAll(ids) {
    const pairs = await Promise.all(ids.map(async id => [id, await get(id)]));
    return Object.fromEntries(pairs.filter(([, v]) => v));
  }
  return { put, get, del, getAll };
})();

// ════════════════════════════════════════════════════════════
// Auth state (set by initSupabaseClient after login)
// ════════════════════════════════════════════════════════════
let _authSession = null;

// ════════════════════════════════════════════════════════════
// DB — Supabase wrapper (with localStorage fallback)
// ════════════════════════════════════════════════════════════
const DB = (() => {
  function headers() {
    const token = _authSession?.access_token ?? CONFIG.supabaseKey;
    return {
      'Content-Type': 'application/json',
      'apikey': CONFIG.supabaseKey,
      'Authorization': `Bearer ${token}`,
      'Prefer': 'return=representation',
    };
  }

  function url(table, query = '') {
    return `${CONFIG.supabaseUrl}/rest/v1/${table}${query ? '?' + query : ''}`;
  }

  function isConfigured() {
    return CONFIG.supabaseUrl && CONFIG.supabaseKey;
  }

  // Local storage fallback
  const LOCAL = {
    get(key) {
      try { return JSON.parse(localStorage.getItem('closetiq_' + key) || '[]'); } catch { return []; }
    },
    set(key, val) {
      localStorage.setItem('closetiq_' + key, JSON.stringify(val));
    },
  };

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Items
  async function getItems() {
    if (!isConfigured()) {
      const items = LOCAL.get('items');
      // Migrate any img still in localStorage → IndexedDB (one-time, frees quota)
      let migrated = false;
      for (const item of items) {
        if (item.img) {
          await ImageStore.put(item.id, item.img);
          delete item.img;
          migrated = true;
        }
      }
      if (migrated) LOCAL.set('items', items);
      const imgs = await ImageStore.getAll(items.map(i => i.id));
      return items.map(i => ({ ...i, img: imgs[i.id] ?? null }));
    }
    const res = await fetch(url('items', 'select=*&order=created_at.asc'), { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function insertItem(item) {
    if (!isConfigured()) {
      const items = LOCAL.get('items');
      const { img, ...meta } = item;
      const newItem = { ...meta, id: genId(), created_at: new Date().toISOString() };
      if (img) await ImageStore.put(newItem.id, img);
      items.push(newItem);
      LOCAL.set('items', items);
      return { ...newItem, img: img ?? null };
    }
    const payload = _authSession ? { ...item, user_id: _authSession.user.id } : item;
    const res = await fetch(url('items'), {
      method: 'POST', headers: headers(), body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async function updateItem(id, patch) {
    if (!isConfigured()) {
      const items = LOCAL.get('items');
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) {
        const { img, ...metaPatch } = patch;
        if (img) await ImageStore.put(id, img);
        items[idx] = { ...items[idx], ...metaPatch };
        LOCAL.set('items', items);
        return { ...items[idx], img: img ?? await ImageStore.get(id) };
      }
      return null;
    }
    const res = await fetch(url('items', `id=eq.${id}`), {
      method: 'PATCH', headers: headers(), body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async function deleteItem(id) {
    if (!isConfigured()) {
      await ImageStore.del(id);
      const items = LOCAL.get('items').filter(i => i.id !== id);
      LOCAL.set('items', items);
      return;
    }
    const res = await fetch(url('items', `id=eq.${id}`), { method: 'DELETE', headers: headers() });
    if (!res.ok) throw new Error(await res.text());
  }

  // Combos
  async function getCombos() {
    if (!isConfigured()) return LOCAL.get('combos');
    const res = await fetch(url('combos', 'select=*&order=pinned.desc,created_at.asc'), { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function insertCombo(combo) {
    if (!isConfigured()) {
      const combos = LOCAL.get('combos');
      const newCombo = { ...combo, id: genId(), created_at: new Date().toISOString() };
      combos.push(newCombo);
      LOCAL.set('combos', combos);
      return newCombo;
    }
    const res = await fetch(url('combos'), {
      method: 'POST', headers: headers(), body: JSON.stringify(combo),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async function updateCombo(id, patch) {
    if (!isConfigured()) {
      const combos = LOCAL.get('combos');
      const idx = combos.findIndex(c => c.id === id);
      if (idx !== -1) { combos[idx] = { ...combos[idx], ...patch }; LOCAL.set('combos', combos); return combos[idx]; }
      return null;
    }
    const res = await fetch(url('combos', `id=eq.${id}`), {
      method: 'PATCH', headers: headers(), body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async function deleteCombo(id) {
    if (!isConfigured()) {
      LOCAL.set('combos', LOCAL.get('combos').filter(c => c.id !== id));
      return;
    }
    const res = await fetch(url('combos', `id=eq.${id}`), { method: 'DELETE', headers: headers() });
    if (!res.ok) throw new Error(await res.text());
  }

  // Journal
  async function getJournal() {
    if (!isConfigured()) return LOCAL.get('journal');
    const res = await fetch(url('journal', 'select=*&order=date.desc'), { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function insertJournal(entry) {
    if (!isConfigured()) {
      const j = LOCAL.get('journal');
      const newEntry = { ...entry, id: genId(), created_at: new Date().toISOString() };
      j.unshift(newEntry);
      LOCAL.set('journal', j);
      return newEntry;
    }
    const res = await fetch(url('journal'), {
      method: 'POST', headers: headers(), body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async function testConnection() {
    if (!isConfigured()) throw new Error('No Supabase URL/key configured');
    const res = await fetch(url('items', 'select=id&limit=1'), { headers: headers() });
    if (!res.ok) throw new Error('Connection failed: ' + res.status);
    return true;
  }

  return { getItems, insertItem, updateItem, deleteItem, getCombos, insertCombo, updateCombo, deleteCombo, getJournal, insertJournal, testConnection };
})();

// ════════════════════════════════════════════════════════════
// AI — outfit extraction
// ════════════════════════════════════════════════════════════
const AI = (() => {
  const META_PROMPT = `Analyze this clothing photo. Return ONLY a JSON object — no markdown, no extra text:
{"name":"descriptive item name","category":"one of: shirt, tshirt, dress, pants, shoes, watch, accessory","notes":"color, material, style — max 100 chars"}`;

  const EXTRACT_PROMPT = `Remove the background from this clothing photo. Return the garment isolated on a transparent background as a PNG image. Also return JSON metadata: {"name":"...","category":"shirt|tshirt|dress|pants|shoes|watch|accessory","notes":"..."}`;

  function getConfig() {
    return {
      provider: localStorage.getItem('closetiq_aiProvider') || '',
      key: localStorage.getItem('closetiq_aiKey') || '',
    };
  }
  function saveConfig(provider, key) {
    localStorage.setItem('closetiq_aiProvider', provider);
    localStorage.setItem('closetiq_aiKey', key);
  }
  function isConfigured() {
    const { provider, key } = getConfig();
    return !!(provider && key);
  }

  function parseMetaFromText(text) {
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]); } catch { return {}; }
  }

  // Gemini with gemini-3.1-flash-image — returns both extracted image + metadata
  async function extractWithGemini(dataUrl, key) {
    const base64 = dataUrl.split(',')[1];
    const mediaType = dataUrl.split(';')[0].slice(5);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mediaType, data: base64 } },
            { text: EXTRACT_PROMPT },
          ]}],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 1 },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error ${res.status}`);
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    let imageDataUrl = null;
    let meta = {};
    for (const part of parts) {
      if (part.inline_data?.data) {
        imageDataUrl = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
      } else if (part.text) {
        meta = parseMetaFromText(part.text);
      }
    }
    return { imageDataUrl, ...meta };
  }

  // Claude — metadata only (cannot output images)
  async function extractWithClaude(dataUrl, key) {
    const base64 = dataUrl.split(',')[1];
    const mediaType = dataUrl.split(';')[0].slice(5);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-request-allowed': 'true', 'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 256,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: META_PROMPT },
        ]}],
      }),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `Claude error ${res.status}`); }
    const data = await res.json();
    return { imageDataUrl: null, ...parseMetaFromText(data.content[0].text) };
  }

  // OpenAI — metadata only (image editing requires separate endpoint)
  async function extractWithOpenAI(dataUrl, key) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 256,
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: META_PROMPT },
        ]}],
      }),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `OpenAI error ${res.status}`); }
    const data = await res.json();
    return { imageDataUrl: null, ...parseMetaFromText(data.choices[0].message.content) };
  }

  async function extractGarment(dataUrl) {
    const { provider, key } = getConfig();
    if (!provider || !key) throw new Error('no-ai');
    if (provider === 'gemini') return extractWithGemini(dataUrl, key);
    if (provider === 'claude') return extractWithClaude(dataUrl, key);
    if (provider === 'openai') return extractWithOpenAI(dataUrl, key);
    throw new Error('Unknown AI provider.');
  }

  return { isConfigured, getConfig, saveConfig, extractGarment };
})();

// ════════════════════════════════════════════════════════════
// State
// ════════════════════════════════════════════════════════════
const State = {
  items: [],
  combos: [],
  journal: [],
  currentCategory: 'shirt',
  carouselIndex: 0,
  selectedItemId: null,
  editingItemId: null,
  photoDataUrl: null,
  photoFile: null,
  builderSelection: {},   // { top, bottom, shoes, watch, accessory } → item ids
  viewingOutfitId: null,
};

// ════════════════════════════════════════════════════════════
// Hanger SVG generator
// ════════════════════════════════════════════════════════════
function hangerSVG(type = 'shirt') {
  if (type === 'pants') {
    // Clip hanger for pants
    return `<svg class="hanger-svg" viewBox="0 0 120 56" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hg2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#e4c06a"/>
          <stop offset="50%" stop-color="#9b7a30"/>
          <stop offset="100%" stop-color="#c9a84c"/>
        </linearGradient>
      </defs>
      <!-- hook -->
      <path d="M60 4 Q65 0 69 4 Q73 9 69 14 L61 20" fill="none" stroke="url(#hg2)" stroke-width="2.5" stroke-linecap="round"/>
      <!-- bar -->
      <line x1="12" y1="32" x2="108" y2="32" stroke="url(#hg2)" stroke-width="3.5" stroke-linecap="round"/>
      <!-- left arm -->
      <line x1="61" y1="20" x2="12" y2="32" stroke="url(#hg2)" stroke-width="2.5" stroke-linecap="round"/>
      <!-- right arm -->
      <line x1="61" y1="20" x2="108" y2="32" stroke="url(#hg2)" stroke-width="2.5" stroke-linecap="round"/>
      <!-- left clip -->
      <rect x="10" y="30" width="10" height="16" rx="2" fill="url(#hg2)" opacity="0.9"/>
      <!-- right clip -->
      <rect x="100" y="30" width="10" height="16" rx="2" fill="url(#hg2)" opacity="0.9"/>
    </svg>`;
  }

  // Standard shirt/top hanger
  return `<svg class="hanger-svg" viewBox="0 0 120 56" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#e8c870"/>
        <stop offset="45%" stop-color="#9b7a30"/>
        <stop offset="100%" stop-color="#c9a84c"/>
      </linearGradient>
    </defs>
    <!-- hook -->
    <path d="M60 4 Q66 -1 71 4 Q76 10 71 16 L62 22" fill="none" stroke="url(#hg)" stroke-width="2.8" stroke-linecap="round"/>
    <!-- neck -->
    <path d="M62 22 Q60 28 52 34 Q40 42 14 48" fill="none" stroke="url(#hg)" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M62 22 Q64 28 72 34 Q84 42 106 48" fill="none" stroke="url(#hg)" stroke-width="2.6" stroke-linecap="round"/>
    <!-- shoulder bar -->
    <line x1="14" y1="48" x2="106" y2="48" stroke="url(#hg)" stroke-width="3" stroke-linecap="round"/>
    <!-- gold ball ends -->
    <circle cx="14" cy="48" r="3.5" fill="#e8c870"/>
    <circle cx="106" cy="48" r="3.5" fill="#e8c870"/>
    <!-- hook ring -->
    <circle cx="69" cy="4" r="2.5" fill="none" stroke="url(#hg)" stroke-width="1.5"/>
  </svg>`;
}

// ════════════════════════════════════════════════════════════
// Wardrobe Carousel
// ════════════════════════════════════════════════════════════
const Carousel = (() => {
  let dragStartX = 0;
  let isDragging = false;
  let lastDelta = 0;
  let velocity = 0;
  let momentumFrame = null;

  function getItems() {
    const cat = State.currentCategory;
    return State.items.filter(i => i.category === cat);
  }

  function render() {
    const track = document.getElementById('carouselTrack');
    const scene = document.getElementById('wardrobeScene');
    const shelfSection = document.getElementById('shelfSection');
    const railWrap = document.querySelector('.rail-wrap');
    const arrows = document.querySelectorAll('.carousel-arrow');
    const empty = document.getElementById('wardrobeEmpty');

    const cat = State.currentCategory;
    const isShelf = SHELF_CATS.has(cat);

    // Toggle shelf vs hanging display
    if (isShelf) {
      track.style.display = 'none';
      shelfSection.style.display = 'flex';
      railWrap.style.display = 'none';
      arrows.forEach(a => a.style.display = 'none');
      renderShelf();
    } else {
      track.style.display = '';
      shelfSection.style.display = 'none';
      railWrap.style.display = 'flex';
      arrows.forEach(a => a.style.display = '');
      renderCarousel();
    }

    // Empty state
    const filteredItems = getItems();
    empty.classList.toggle('hidden', filteredItems.length > 0);

  }

  function renderCarousel() {
    const track = document.getElementById('carouselTrack');
    const items = getItems();

    // Clamp index
    if (State.carouselIndex >= items.length) State.carouselIndex = Math.max(0, items.length - 1);

    track.innerHTML = '';

    if (items.length === 0) {
      updateStrip(null);
      return;
    }

    items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'wardrobe-item';
      el.dataset.id = item.id;
      el.dataset.index = i;

      const isHanging = !SHELF_CATS.has(item.category);
      const svg = isHanging ? hangerSVG(item.category) : '';
      const imgHtml = item.img
        ? `<img class="garment-img" src="${escapeHTML(item.img)}" alt="${escapeHTML(item.name)}" loading="lazy" />`
        : `<div class="garment-placeholder">${CAT_EMOJI[item.category] || '👔'}</div>`;

      el.innerHTML = `
        ${svg}
        <div class="garment-wrap">${imgHtml}</div>
        <div class="item-label">${escapeHTML(item.name)}</div>
      `;

      // Stagger sway animation on hanger + garment children
      const swayEls = el.querySelectorAll('.hanger-svg, .garment-wrap');
      const delay = `${(i * 0.7) % 4}s`;
      const dur   = `${3.8 + (i % 3) * 0.7}s`;
      swayEls.forEach(s => {
        s.style.animationDelay    = delay;
        s.style.animationDuration = dur;
      });

      el.addEventListener('click', () => selectCarouselItem(i));
      track.appendChild(el);
    });

    positionItems(false);
    updateStrip(items[State.carouselIndex]);
  }

  function positionItems(animate = true) {
    const track = document.getElementById('carouselTrack');
    const itemEls = track.querySelectorAll('.wardrobe-item');
    const items = getItems();
    const isMobile = window.innerWidth < 600;
    const itemW = isMobile ? 130 : 155;
    const gap = isMobile ? 18 : 28;

    if (!animate) {
      itemEls.forEach(el => el.style.transition = 'none');
      requestAnimationFrame(() => {
        applyPositions(itemEls, itemW, gap);
        requestAnimationFrame(() => {
          itemEls.forEach(el => el.style.transition = '');
        });
      });
    } else {
      applyPositions(itemEls, itemW, gap);
    }
  }

  function applyPositions(itemEls, itemW, gap) {
    const idx = State.carouselIndex;
    itemEls.forEach((el, i) => {
      const offset = i - idx;
      const absOff = Math.abs(offset);

      const tx = offset * (itemW + gap);
      const scale = Math.max(0.45, 1 - absOff * 0.14);
      const ry = offset * -14;
      const zIndex = 200 - absOff;
      const opacity = Math.max(0, 1 - absOff * 0.28);
      const brightness = Math.max(0.45, 1 - absOff * 0.22);

      el.style.transform = `translateX(calc(-50% + ${tx}px)) rotateY(${ry}deg) scale(${scale})`;
      el.style.opacity = opacity;
      el.style.zIndex = zIndex;
      el.style.filter = `brightness(${brightness})`;
      el.classList.toggle('is-active', offset === 0);
    });
  }

  function renderShelf() {
    const shelfItems = document.getElementById('shelfItems');
    const items = getItems();
    shelfItems.innerHTML = '';

    items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'shelf-item';
      el.dataset.id = item.id;
      el.classList.toggle('is-active', i === State.carouselIndex);

      const imgHtml = item.img
        ? `<img src="${escapeHTML(item.img)}" alt="${escapeHTML(item.name)}" loading="lazy" />`
        : `<div style="font-size:36px;height:72px;display:flex;align-items:center;justify-content:center">${CAT_EMOJI[item.category]}</div>`;

      el.innerHTML = `${imgHtml}<div class="item-label">${escapeHTML(item.name)}</div>`;
      el.addEventListener('click', () => { State.carouselIndex = i; renderShelf(); updateStrip(item); });
      shelfItems.appendChild(el);
    });

    const items2 = getItems();
    updateStrip(items2[State.carouselIndex] || null);
  }

  function selectCarouselItem(index) {
    const items = getItems();
    if (index < 0 || index >= items.length) return;
    State.carouselIndex = index;
    State.selectedItemId = items[index]?.id;
    positionItems(true);
    updateStrip(items[index]);
  }

  function next() {
    const items = getItems();
    if (items.length === 0) return;
    State.carouselIndex = (State.carouselIndex + 1) % items.length;
    positionItems(true);
    updateStrip(items[State.carouselIndex]);
  }

  function prev() {
    const items = getItems();
    if (items.length === 0) return;
    State.carouselIndex = (State.carouselIndex - 1 + items.length) % items.length;
    positionItems(true);
    updateStrip(items[State.carouselIndex]);
  }

  function setupDrag() {
    const viewport = document.getElementById('carouselViewport');

    const onStart = (x) => {
      isDragging = true;
      dragStartX = x;
      velocity = 0;
      if (momentumFrame) cancelAnimationFrame(momentumFrame);
    };

    const onMove = (x) => {
      if (!isDragging) return;
      const delta = x - dragStartX;
      lastDelta = delta;
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      if (lastDelta < -40) next();
      else if (lastDelta > 40) prev();
      lastDelta = 0;
    };

    viewport.addEventListener('mousedown', e => onStart(e.clientX));
    window.addEventListener('mousemove', e => { if (isDragging) onMove(e.clientX); });
    window.addEventListener('mouseup', onEnd);

    viewport.addEventListener('touchstart', e => onStart(e.touches[0].clientX), { passive: true });
    viewport.addEventListener('touchmove', e => onMove(e.touches[0].clientX), { passive: true });
    viewport.addEventListener('touchend', onEnd);
  }

  return { render, next, prev, setupDrag };
})();

// ════════════════════════════════════════════════════════════
// Strip (selected item info bar)
// ════════════════════════════════════════════════════════════
function updateStrip(item) {
  const name = document.getElementById('stripName');
  const meta = document.getElementById('stripMeta');
  State.selectedItemId = item ? item.id : null;

  if (!item) {
    name.textContent = '—';
    meta.textContent = '';
    window.refreshStudio?.();
    return;
  }

  name.textContent = item.name;
  const occs = (item.occasions || []).map(o => OCCASIONS[o] || o).join(' · ');
  meta.textContent = [item.notes, occs].filter(Boolean).join(' — ');
  window.refreshStudio?.();
}

// ════════════════════════════════════════════════════════════
// Outfits View
// ════════════════════════════════════════════════════════════
function renderOutfits(filterOccasion = '') {
  const pinnedGrid = document.getElementById('pinnedGrid');
  const outfitGrid = document.getElementById('outfitGrid');
  const pinnedSection = document.getElementById('pinnedSection');
  const empty = document.getElementById('outfitsEmpty');

  let combos = State.combos;
  if (filterOccasion) combos = combos.filter(c => c.occasion === filterOccasion);

  const pinned = combos.filter(c => c.pinned);
  const rest = combos.filter(c => !c.pinned);

  pinnedSection.style.display = pinned.length ? '' : 'none';
  pinnedGrid.innerHTML = '';
  outfitGrid.innerHTML = '';

  function makeCard(combo) {
    const card = document.createElement('div');
    card.className = 'outfit-card' + (combo.pinned ? ' pinned' : '');

    // Get item images
    const comboItems = (combo.items || []).map(id => State.items.find(i => i.id === id)).filter(Boolean);
    const imgs = comboItems.slice(0, 3).map(it =>
      it.img ? `<img src="${escapeHTML(it.img)}" alt="${escapeHTML(it.name)}" loading="lazy">` : `<div class="outfit-img-placeholder">${CAT_EMOJI[it.category]||'👔'}</div>`
    ).join('');

    card.innerHTML = `
      <div class="outfit-card-imgs">
        ${imgs || `<div class="outfit-img-placeholder">🧥</div>`}
        ${combo.pinned ? '<div class="pin-badge">📌</div>' : ''}
      </div>
      <div class="outfit-card-info">
        <div class="outfit-card-name">${escapeHTML(combo.name)}</div>
        <div class="outfit-card-occ">${OCCASIONS[combo.occasion] || combo.occasion}</div>
      </div>
    `;
    card.addEventListener('click', () => openOutfitDetail(combo.id));
    return card;
  }

  pinned.forEach(c => pinnedGrid.appendChild(makeCard(c)));
  rest.forEach(c => outfitGrid.appendChild(makeCard(c)));
  empty.classList.toggle('hidden', combos.length > 0);
}

function openOutfitDetail(id) {
  const combo = State.combos.find(c => c.id === id);
  if (!combo) return;
  State.viewingOutfitId = id;

  document.getElementById('outfitDetailTitle').textContent = combo.name;

  const itemsEl = document.getElementById('outfitDetailItems');
  const metaEl = document.getElementById('outfitDetailMeta');
  const pinBtn = document.getElementById('outfitDetailPin');

  const comboItems = (combo.items || []).map(id => State.items.find(i => i.id === id)).filter(Boolean);
  itemsEl.innerHTML = comboItems.map(it => `
    <div class="outfit-detail-item">
      ${it.img ? `<img src="${escapeHTML(it.img)}" alt="${escapeHTML(it.name)}">` : `<div style="width:72px;height:72px;background:var(--bg2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px">${CAT_EMOJI[it.category]}</div>`}
      <p>${escapeHTML(it.name)}</p>
    </div>
  `).join('');

  metaEl.innerHTML = `
    <span>Occasion: <strong>${OCCASIONS[combo.occasion] || combo.occasion}</strong></span>
    <span>${combo.pinned ? '📌 Pinned' : 'Not pinned'}</span>
  `;

  pinBtn.textContent = combo.pinned ? 'Unpin' : 'Pin';

  showModal('outfitDetailModal');
}

// ════════════════════════════════════════════════════════════
// Builder View
// ════════════════════════════════════════════════════════════
function renderBuilder() {
  State.builderSelection = {};

  const fillRow = (containerId, categories) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const items = State.items.filter(i => (categories.includes(i.category) || (categories.includes('shirt') && i.category === 'dress')));
    if (items.length === 0) {
      container.innerHTML = '<span style="color:var(--text3);font-size:12px">No items</span>';
      return;
    }
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'builder-thumb';
      el.dataset.id = item.id;
      el.dataset.slot = categories[0];
      el.innerHTML = item.img
        ? `<img src="${escapeHTML(item.img)}" alt="${escapeHTML(item.name)}"><span class="item-name-tip">${escapeHTML(item.name)}</span>`
        : `<div class="thumb-placeholder">${CAT_EMOJI[item.category]}</div><span class="item-name-tip">${escapeHTML(item.name)}</span>`;
      el.addEventListener('click', () => selectBuilderItem(el, item, categories[0]));
      container.appendChild(el);
    });
  };

  fillRow('builderTops', ['shirt', 'tshirt']);
  fillRow('builderBottoms', ['pants']);
  fillRow('builderShoes', ['shoes']);
  fillRow('builderWatch', ['watch']);
  fillRow('builderAcc', ['accessory']);

  // Clear preview
  ['Top', 'Bottom', 'Shoes', 'Watch', 'Accessory'].forEach(s => clearPreviewSlot(s.toLowerCase()));
}

function selectBuilderItem(el, item, slot) {
  // Deselect others in this row
  const container = el.closest('.builder-item-scroll');
  container.querySelectorAll('.builder-thumb').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');

  State.builderSelection[slot] = item.id;
  updatePreviewSlot(slot, item);
}

function updatePreviewSlot(slot, item) {
  const slotMap = {
    shirt: 'previewTop', tshirt: 'previewTop',
    pants: 'previewBottom', shoes: 'previewShoes',
    watch: 'previewWatch', accessory: 'previewAccessory',
  };
  const id = slotMap[slot] || slotMap[item.category];
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('has-item');
  if (item.img) {
    el.innerHTML = `<img src="${escapeHTML(item.img)}" alt="${escapeHTML(item.name)}" style="width:100%;height:100%;object-fit:contain;position:absolute;inset:0" />`;
  } else {
    el.innerHTML = `<span class="slot-icon" style="font-size:28px">${CAT_EMOJI[item.category]}</span>`;
  }
}

function clearPreviewSlot(slot) {
  const id = `preview${slot.charAt(0).toUpperCase() + slot.slice(1)}`;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('has-item');
  const icons = { top:'👔', bottom:'👖', shoes:'👟', watch:'⌚', accessory:'💍' };
  el.innerHTML = `<span class="slot-icon">${icons[slot]||'👔'}</span><span class="slot-label">${slot.charAt(0).toUpperCase()+slot.slice(1)}</span>`;
}

async function saveOutfit() {
  const name = document.getElementById('outfitNameInput').value.trim();
  const occasion = document.getElementById('outfitOccasionSelect').value;

  if (!name) { showToast('Please enter an outfit name', 'error'); return; }

  const itemIds = Object.values(State.builderSelection).filter(Boolean);
  if (itemIds.length === 0) { showToast('Select at least one item', 'error'); return; }

  try {
    const combo = await DB.insertCombo({ name, occasion, items: itemIds, pinned: false });
    State.combos.push(combo);
    document.getElementById('outfitNameInput').value = '';
    State.builderSelection = {};
    renderBuilder();
    renderOutfits();
    showToast('Outfit saved!', 'success');
    navigate('outfits');
  } catch (e) {
    showToast('Error saving outfit: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// Journal View
// ════════════════════════════════════════════════════════════
function renderJournal() {
  const list = document.getElementById('journalList');
  const empty = document.getElementById('journalEmpty');
  list.innerHTML = '';

  if (State.journal.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  State.journal.forEach(entry => {
    const d = new Date(entry.date + 'T12:00:00');
    const day = d.getDate();
    const mon = d.toLocaleString('default', { month: 'short' });

    const el = document.createElement('div');
    el.className = 'journal-entry';
    el.innerHTML = `
      <div class="journal-date">
        <div class="jd-day">${day}</div>
        <div class="jd-mon">${mon}</div>
      </div>
      <div class="journal-info">
        <div class="journal-combo">${entry.combo_name || 'Custom outfit'}</div>
        <div class="journal-occ">${OCCASIONS[entry.occasion] || entry.occasion || ''}</div>
      </div>
    `;
    list.appendChild(el);
  });
}

function openLogModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('logDate').value = today;

  // Fill combo select
  const sel = document.getElementById('logCombo');
  sel.innerHTML = '<option value="">— no saved outfit —</option>';
  State.combos.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });

  showModal('logModal');
}

async function saveJournalEntry() {
  const date = document.getElementById('logDate').value;
  const comboId = document.getElementById('logCombo').value;
  const occasion = document.getElementById('logOccasion').value;

  if (!date) { showToast('Please select a date', 'error'); return; }

  const combo = comboId ? State.combos.find(c => c.id === comboId) : null;

  try {
    const entry = await DB.insertJournal({
      date,
      combo_id: comboId || null,
      combo_name: combo ? combo.name : null,
      occasion,
      items: combo ? combo.items : [],
    });
    State.journal.unshift(entry);
    renderJournal();
    hideModal('logModal');
    showToast('Outfit logged!', 'success');
  } catch (e) {
    showToast('Error logging: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// Add / Edit Item Modal
// ════════════════════════════════════════════════════════════
function openAddItem(editId = null) {
  window.cancelPhotoJob?.();
  State.editingItemId = editId;
  State.photoDataUrl = null;
  State.photoFile = null;

  const modal = document.getElementById('itemModal');
  const title = document.getElementById('itemModalTitle');
  const previewImg = document.getElementById('photoPreviewImg');
  const placeholder = document.getElementById('photoPlaceholder');
  const removeBgBtn = document.getElementById('removeBgBtn');

  title.textContent = editId ? 'Edit Item' : 'Add Item';

  if (editId) {
    const item = State.items.find(i => i.id === editId);
    if (!item) return;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemNotes').value = item.notes || '';

    // Set occasion chips
    document.querySelectorAll('#occasionChips input').forEach(cb => {
      cb.checked = (item.occasions || []).includes(cb.value);
    });

    if (item.img) {
      previewImg.src = item.img;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
      removeBgBtn.style.display = 'inline-flex';
      State.photoDataUrl = item.img;
    } else {
      previewImg.style.display = 'none';
      placeholder.style.display = 'flex';
      removeBgBtn.style.display = 'none';
    }
  } else {
    document.getElementById('itemName').value = '';
    document.getElementById('itemCategory').value = State.currentCategory;
    document.getElementById('itemNotes').value = '';
    document.querySelectorAll('#occasionChips input').forEach(cb => cb.checked = false);
    previewImg.style.display = 'none';
    placeholder.style.display = 'flex';
    removeBgBtn.style.display = 'none';
  }

  showModal('itemModal');
}

async function handlePhotoUpload(file) {
  if (!file) return;
  State.photoFile = file;
  const url = URL.createObjectURL(file);
  const previewImg = document.getElementById('photoPreviewImg');
  previewImg.src = url;
  previewImg.style.display = 'block';
  document.getElementById('photoPlaceholder').style.display = 'none';
  document.getElementById('removeBgBtn').style.display = 'inline-flex';

  // Read as base64 (original, before bg removal)
  const reader = new FileReader();
  reader.onload = e => { State.photoDataUrl = e.target.result; };
  reader.readAsDataURL(file);
}

async function doRemoveBg() {
  if (!State.photoFile) { showToast('Upload a photo first', 'error'); return; }
  const btn = document.getElementById('removeBgBtn');
  btn.textContent = 'Processing…';
  btn.disabled = true;

  try {
    const result = await BgRemover.process(State.photoFile);
    State.photoDataUrl = result;
    const previewImg = document.getElementById('photoPreviewImg');
    previewImg.src = result;
    previewImg.style.display = 'block';
    document.getElementById('photoPlaceholder').style.display = 'none';
    showToast('Background removed!', 'success');
  } catch (e) {
    showToast('BG removal failed: ' + e.message, 'error');
  } finally {
    btn.textContent = 'Remove BG';
    btn.disabled = false;
  }
}

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const category = document.getElementById('itemCategory').value;
  const notes = document.getElementById('itemNotes').value.trim();
  const occasions = Array.from(document.querySelectorAll('#occasionChips input:checked')).map(cb => cb.value);

  if (!name) { showToast('Please enter an item name', 'error'); return; }

  const payload = { name, category, occasions, notes, img: State.photoDataUrl || null };

  try {
    if (State.editingItemId) {
      const updated = await DB.updateItem(State.editingItemId, payload);
      const idx = State.items.findIndex(i => i.id === State.editingItemId);
      if (idx !== -1) State.items[idx] = updated || { ...State.items[idx], ...payload };
    } else {
      const newItem = await DB.insertItem(payload);
      State.items.push(newItem);
    }

    hideModal('itemModal');
    State.carouselIndex = 0;

    // Switch to the right category
    if (State.currentCategory !== category) {
      setCategory(category);
    } else {
      Carousel.render();
    }

    renderBuilder();
    showToast(State.editingItemId ? 'Item updated!' : 'Item added!', 'success');
    State.editingItemId = null;
  } catch (e) {
    showToast('Error saving: ' + e.message, 'error');
  }
}

async function deleteCurrentItem() {
  if (!State.selectedItemId) return;
  const item = State.items.find(i => i.id === State.selectedItemId);
  if (!item) return;
  if (!confirm(`Delete "${escapeHTML(item.name)}"?`)) return;

  try {
    await DB.deleteItem(State.selectedItemId);
    State.items = State.items.filter(i => i.id !== State.selectedItemId);
    State.selectedItemId = null;
    State.carouselIndex = 0;
    Carousel.render();
    renderBuilder();
    showToast('Item deleted', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// Navigation
// ════════════════════════════════════════════════════════════
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  // Run view-specific renderers
  if (view === 'wardrobe') Carousel.render();
  if (view === 'outfits') renderOutfits();
  if (view === 'builder') renderBuilder();
  if (view === 'journal') renderJournal();
}

function setCategory(cat) {
  State.currentCategory = cat;
  State.carouselIndex = 0;
  document.querySelectorAll('.cat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === cat);
  });
  Carousel.render();
}

// ════════════════════════════════════════════════════════════
// Modal helpers
// ════════════════════════════════════════════════════════════
function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
  const modal=document.getElementById(id);
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  document.getElementById('app').inert=true;
  modal.querySelector('button, input, select')?.focus();
}
function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
  if(id==='itemModal')window.cancelPhotoJob?.();
  document.getElementById('app').inert=false;
  document.getElementById('navAdd')?.focus();
}

// ════════════════════════════════════════════════════════════
// Toast
// ════════════════════════════════════════════════════════════
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ════════════════════════════════════════════════════════════
// Settings
// ════════════════════════════════════════════════════════════
function openSettings() {
  document.getElementById('settingUrl').value = CONFIG.supabaseUrl || '';
  document.getElementById('settingKey').value = CONFIG.supabaseKey || '';
  showModal('settingsModal');
}

async function saveSettings() {
  CONFIG.supabaseUrl = document.getElementById('settingUrl').value.trim();
  CONFIG.supabaseKey = document.getElementById('settingKey').value.trim();
  saveConfig({ supabaseUrl: CONFIG.supabaseUrl, supabaseKey: CONFIG.supabaseKey });
  hideModal('settingsModal');
  showToast('Settings saved.', 'success');
  await loadData();
}

async function testConnection() {
  const statusEl = document.getElementById('connectionStatus');
  statusEl.textContent = 'Testing…';
  statusEl.className = 'connection-status';
  try {
    await DB.testConnection();
    statusEl.textContent = '✓ Connected successfully!';
  } catch (e) {
    statusEl.textContent = '✗ ' + e.message;
    statusEl.className = 'connection-status error';
  }
}

// ════════════════════════════════════════════════════════════
// Theme
// ════════════════════════════════════════════════════════════
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('closetiq_theme', html.dataset.theme);
  document.getElementById('iconSun').style.display = isDark ? 'block' : 'none';
  document.getElementById('iconMoon').style.display = isDark ? 'none' : 'block';
}

function applyTheme() {
  const saved = localStorage.getItem('closetiq_theme') || 'light';
  document.documentElement.dataset.theme = saved;
  document.getElementById('iconSun').style.display = saved === 'dark' ? 'block' : 'none';
  document.getElementById('iconMoon').style.display = saved === 'dark' ? 'none' : 'block';
}

// ════════════════════════════════════════════════════════════
// Seed data (first launch only)
// ════════════════════════════════════════════════════════════
const SEED_ITEMS = [
  { name:'Cotton field jacket', category:'shirt', occasions:['daily','travel'], notes:'Sample piece · Replace with your own photograph', img:'assets/jacket.png' },
  { name:'Indigo everyday shirt', category:'shirt', occasions:['daily','smart'], notes:'Sample piece · Replace with your own photograph', img:'assets/blue-shirt.png' },
  { name:'Contrast cotton henley', category:'shirt', occasions:['daily'], notes:'Sample piece · Replace with your own photograph', img:'assets/henley.png' },
];

const SEED_COMBOS = [
  { name: 'Smart Friday',   items: [],  occasion: 'smart',  pinned: true  },
  { name: 'Evening Out',    items: [],  occasion: 'date',   pinned: true  },
  { name: 'Weekend Casual', items: [],  occasion: 'daily',  pinned: false },
  { name: 'Vacation Day',   items: [],  occasion: 'travel', pinned: false },
  { name: 'Casual Sharp',   items: [],  occasion: 'daily',  pinned: false },
  { name: 'Formal Ready',   items: [],  occasion: 'formal', pinned: false },
];

async function seedIfEmpty() {
  if (!CONFIG.supabaseUrl) {
    // Only seed local if truly empty
    const existing = JSON.parse(localStorage.getItem('closetiq_items') || '[]');
    if (existing.length > 0 || localStorage.getItem('closetiq_seeded')) return;
    localStorage.setItem('closetiq_seeded', '1');

    // Insert seed items
    for (const item of SEED_ITEMS) {
      const saved = await DB.insertItem(item);
      State.items.push(saved);
    }

    // Seed some combos with approximate item ids
    const seedComboData = [
      { name: 'Smart Friday',   cats: ['shirt','pants','shoes'],  occ: 'smart',  pin: true  },
      { name: 'Evening Out',    cats: ['shirt','pants','shoes'],  occ: 'date',   pin: true  },
      { name: 'Weekend Casual', cats: ['shirt','pants','shoes'],  occ: 'daily',  pin: false },
      { name: 'Vacation Day',   cats: ['shirt','pants','shoes'],  occ: 'travel', pin: false },
    ];

    for (const cd of seedComboData) {
      const picked = cd.cats.map(cat => State.items.find(i => i.category === cat)?.id).filter(Boolean);
      const saved = await DB.insertCombo({ name: cd.name, items: picked, occasion: cd.occ, pinned: cd.pin });
      State.combos.push(saved);
    }
  }
}

// ════════════════════════════════════════════════════════════
// Data loader
// ════════════════════════════════════════════════════════════
async function loadData() {
  try {
    [State.items, State.combos, State.journal] = await Promise.all([
      DB.getItems(),
      DB.getCombos(),
      DB.getJournal(),
    ]);
  } catch (e) {
    console.warn('DB load error:', e);
    State.items = [];
    State.combos = [];
    State.journal = [];
  }
}

// ════════════════════════════════════════════════════════════
// Auth — Supabase email/password login
// ════════════════════════════════════════════════════════════
let _supaClient = null;

function isConfigured() { return !!(CONFIG.supabaseUrl && CONFIG.supabaseKey); }

function initSupabaseClient() {
  if (!isConfigured() || typeof supabase === 'undefined') return;
  _supaClient = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
}

function waitForAuth() {
  return new Promise(resolve => {
    const { data: { subscription } } = _supaClient.auth.onAuthStateChange((event, session) => {
      if (session) { subscription.unsubscribe(); _authSession = session; resolve(session); }
    });
  });
}

function showAuthModal() {
  document.getElementById('authModal').classList.remove('hidden');
  setAuthStatus('', '');
  document.getElementById('authEmail').focus();
}
function hideAuthModal() { document.getElementById('authModal').classList.add('hidden'); }

function setAuthStatus(msg, type) {
  const el = document.getElementById('authStatus');
  el.textContent = msg;
  el.dataset.type = type;
}

function authReadyState(ready) {
  document.getElementById('authSigninBtn').disabled = !ready;
  document.getElementById('authSignupBtn').disabled = !ready;
  if (ready) {
    document.getElementById('authSigninBtn').textContent = 'Sign in';
    document.getElementById('authSignupBtn').textContent = 'Create account';
  }
}

function friendlyAuthError(error) {
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials') || msg.includes('invalid credentials'))
    return null; // handled inline with contextual prompt
  if (msg.includes('email not confirmed'))
    return 'Your email isn\'t confirmed yet. Check your inbox for the confirmation link.';
  if (msg.includes('user already registered') || msg.includes('already been registered') || code === 'user_already_exists')
    return 'An account with this email already exists — sign in instead.';
  if (msg.includes('password') && (msg.includes('6') || msg.includes('weak')))
    return 'Password must be at least 6 characters.';
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror'))
    return 'Connection failed. Check your internet and try again.';
  return error.message || 'Something went wrong. Please try again.';
}

function validateEmail(email) {
  if (!email) { setAuthStatus('Please enter your email address.', 'error'); return false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAuthStatus('Enter a valid email address.', 'error'); return false; }
  return true;
}

function togglePasswordVisibility() {
  const input = document.getElementById('authPassword');
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  document.getElementById('eyeOpen').style.display = isText ? 'block' : 'none';
  document.getElementById('eyeClosed').style.display = isText ? 'none' : 'block';
}

async function authSignIn() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!validateEmail(email)) return;
  if (!password) { setAuthStatus('Please enter your password.', 'error'); return; }
  authReadyState(false);
  document.getElementById('authSigninBtn').textContent = 'Signing in…';
  setAuthStatus('', '');
  try {
    const { data, error } = await _supaClient.auth.signInWithPassword({ email, password });
    if (error) {
      const friendly = friendlyAuthError(error);
      if (!friendly) {
        // Invalid credentials — could be wrong password OR no account
        document.getElementById('authPassword').value = '';
        setAuthStatus('Incorrect password, or no account found with this email. Try again or create a new account below.', 'error');
      } else {
        setAuthStatus(friendly, 'error');
      }
      return;
    }
    _authSession = data.session;
    hideAuthModal();
  } catch (e) {
    setAuthStatus('Connection failed. Check your internet and try again.', 'error');
  } finally {
    authReadyState(true);
  }
}

async function authSignUp() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!validateEmail(email)) return;
  if (!password) { setAuthStatus('Please enter a password.', 'error'); return; }
  if (password.length < 6) { setAuthStatus('Password must be at least 6 characters.', 'error'); return; }
  authReadyState(false);
  document.getElementById('authSignupBtn').textContent = 'Creating account…';
  setAuthStatus('', '');
  try {
    const { data, error } = await _supaClient.auth.signUp({ email, password });
    if (error) { setAuthStatus(friendlyAuthError(error) || error.message, 'error'); return; }
    if (data.session) {
      _authSession = data.session;
      hideAuthModal();
    } else {
      setAuthStatus('Account created! Check your email for a confirmation link, then sign in here.', 'success');
    }
  } catch (e) {
    setAuthStatus('Connection failed. Check your internet and try again.', 'error');
  } finally {
    authReadyState(true);
  }
}

async function authForgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!validateEmail(email)) { setAuthStatus('Enter your email address above first.', 'error'); return; }
  setAuthStatus('Sending reset link…', '');
  document.getElementById('authForgotBtn').disabled = true;
  try {
    const { error } = await _supaClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) { setAuthStatus(friendlyAuthError(error) || error.message, 'error'); return; }
    setAuthStatus(`Password reset link sent to ${email}. Check your inbox.`, 'success');
  } catch (e) {
    setAuthStatus('Connection failed. Try again.', 'error');
  } finally {
    document.getElementById('authForgotBtn').disabled = false;
  }
}

async function authSignOut() {
  if (_supaClient) await _supaClient.auth.signOut();
  _authSession = null;
  location.reload();
}

// ════════════════════════════════════════════════════════════
// Profile Drawer
// ════════════════════════════════════════════════════════════
function openProfileDrawer() {
  renderProfileDrawer();
  document.getElementById('profileDrawer').classList.remove('hidden');
  document.getElementById('profileDrawerBackdrop').classList.remove('hidden');
  requestAnimationFrame(() => {
    document.getElementById('profileDrawer').classList.add('open');
  });
}

function closeProfileDrawer() {
  document.getElementById('profileDrawer').classList.remove('open');
  document.getElementById('profileDrawerBackdrop').classList.add('hidden');
  setTimeout(() => document.getElementById('profileDrawer').classList.add('hidden'), 300);
}

function styleIQLevel(score) {
  if (score >= 90) return 'Exceptional wardrobe — nothing left to add.';
  if (score >= 75) return 'Well-rounded and versatile.';
  if (score >= 55) return 'Good foundation, room to grow.';
  if (score >= 35) return 'Building your capsule wardrobe.';
  return 'Just getting started — keep adding pieces.';
}

function renderProfileDrawer() {
  const session = _authSession;
  const email = session?.user?.email || '';
  const createdAt = session?.user?.created_at;

  // Identity
  document.getElementById('profileAvatar').textContent = email ? email[0].toUpperCase() : '?';
  document.getElementById('profileEmail').textContent = email;
  document.getElementById('profileSince').textContent = createdAt
    ? 'Member since ' + new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // Stats
  const items = State.items || [];
  const combos = State.combos || [];
  const journal = State.journal || [];
  const cats = new Set(items.map(i => i.category));
  const catCount = cats.size;

  document.getElementById('statItems').textContent = items.length;
  document.getElementById('statCategories').textContent = `${catCount}/7`;
  document.getElementById('statOutfits').textContent = combos.length;
  document.getElementById('statJournal').textContent = journal.length;

  // Style IQ (out of 100)
  const catScore   = Math.round((catCount / 7) * 40);
  const itemScore  = Math.round((Math.min(items.length, 20) / 20) * 25);
  const outfitScore= Math.round((Math.min(combos.length, 10) / 10) * 20);
  const journalScore=Math.round((Math.min(journal.length, 15) / 15) * 15);
  const iq = catScore + itemScore + outfitScore + journalScore;

  document.getElementById('statStyleIQ').textContent = iq;
  document.getElementById('styleIQFill').style.width = iq + '%';
  document.getElementById('styleIQHint').textContent = styleIQLevel(iq);

  // Reset password status
  document.getElementById('profilePassStatus').textContent = '';
  document.getElementById('profileNewPass').value = '';
  document.getElementById('profileConfirmPass').value = '';
}

async function profileChangePassword() {
  const newPass = document.getElementById('profileNewPass').value;
  const confirmPass = document.getElementById('profileConfirmPass').value;
  const statusEl = document.getElementById('profilePassStatus');
  statusEl.dataset.type = '';

  if (!newPass) { statusEl.textContent = 'Enter a new password.'; statusEl.dataset.type = 'error'; return; }
  if (newPass.length < 6) { statusEl.textContent = 'Password must be at least 6 characters.'; statusEl.dataset.type = 'error'; return; }
  if (newPass !== confirmPass) { statusEl.textContent = 'Passwords do not match.'; statusEl.dataset.type = 'error'; return; }

  document.getElementById('profileChangePassBtn').disabled = true;
  statusEl.textContent = 'Updating…';
  try {
    const { error } = await _supaClient.auth.updateUser({ password: newPass });
    if (error) { statusEl.textContent = error.message; statusEl.dataset.type = 'error'; }
    else { statusEl.textContent = 'Password updated successfully.'; statusEl.dataset.type = 'success'; document.getElementById('profileNewPass').value = ''; document.getElementById('profileConfirmPass').value = ''; }
  } catch (e) {
    statusEl.textContent = 'Connection failed. Try again.'; statusEl.dataset.type = 'error';
  } finally {
    document.getElementById('profileChangePassBtn').disabled = false;
  }
}

async function profileDeleteAccount() {
  const confirmed = confirm('This will permanently delete all your wardrobe data and sign you out. This cannot be undone.\n\nAre you sure?');
  if (!confirmed) return;
  const doubleCheck = prompt('Type DELETE to confirm:');
  if (doubleCheck !== 'DELETE') { showToast('Deletion cancelled.', 'success'); return; }

  try {
    // Delete all user data via DB
    if (isConfigured() && _authSession) {
      const uid = _authSession.user.id;
      const h = { 'Content-Type':'application/json', 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${_authSession.access_token}` };
      await Promise.all([
        fetch(`${CONFIG.supabaseUrl}/rest/v1/items?user_id=eq.${uid}`, { method: 'DELETE', headers: h }),
        fetch(`${CONFIG.supabaseUrl}/rest/v1/combos?user_id=eq.${uid}`, { method: 'DELETE', headers: h }),
        fetch(`${CONFIG.supabaseUrl}/rest/v1/journal?user_id=eq.${uid}`, { method: 'DELETE', headers: h }),
      ]);
    }
    // Clear local data
    ['items','combos','journal','config'].forEach(k => localStorage.removeItem('closetiq_' + k));
    await _supaClient?.auth.signOut();
    location.reload();
  } catch (e) {
    showToast('Could not delete account. Try again.', 'error');
  }
}

// ════════════════════════════════════════════════════════════
// Boot
// ════════════════════════════════════════════════════════════
async function boot() {
  applyTheme();
  initSupabaseClient();

  // Wire auth buttons immediately — must happen before waitForAuth()
  document.getElementById('authSigninBtn')?.addEventListener('click', authSignIn);
  document.getElementById('authSignupBtn')?.addEventListener('click', authSignUp);
  document.getElementById('authForgotBtn')?.addEventListener('click', authForgotPassword);
  document.getElementById('authTogglePass')?.addEventListener('click', togglePasswordVisibility);
  document.getElementById('authEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('authPassword').focus(); });
  document.getElementById('authPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') authSignIn(); });

  // Profile drawer
  document.getElementById('profileBtn')?.addEventListener('click', openProfileDrawer);
  document.getElementById('profileDrawerClose')?.addEventListener('click', closeProfileDrawer);
  document.getElementById('profileDrawerBackdrop')?.addEventListener('click', closeProfileDrawer);
  document.getElementById('profileChangePassBtn')?.addEventListener('click', profileChangePassword);
  document.getElementById('profileSignOutBtn')?.addEventListener('click', authSignOut);
  document.getElementById('profileDeleteBtn')?.addEventListener('click', profileDeleteAccount);

  // Auth gate — require login when Supabase is configured
  if (_supaClient && isConfigured()) {
    const { data: { session } } = await _supaClient.auth.getSession();
    _authSession = session;
    if (!_authSession) {
      // Hide splash so auth modal is visible
      document.getElementById('splash').classList.add('out');
      document.getElementById('app').classList.remove('hidden');
      showAuthModal();
      await waitForAuth();
      hideAuthModal();
    }
    document.getElementById('profileBtn')?.classList.remove('hidden');
  }

  // Load data
  await loadData();

  // Seed if first launch
  if (State.items.length === 0) await seedIfEmpty();
  window.prepareStudio?.();

  // Wire up navigation
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  // Category tabs
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => setCategory(tab.dataset.cat));
  });

  // Carousel arrows
  document.getElementById('arrowLeft').addEventListener('click', () => Carousel.prev());
  document.getElementById('arrowRight').addEventListener('click', () => Carousel.next());

  // Carousel drag
  Carousel.setupDrag();

  // Add item button
  document.getElementById('navAdd')?.addEventListener('click', () => openAddItem());

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsModalClose').addEventListener('click', () => hideModal('settingsModal'));
  document.getElementById('settingsCancel').addEventListener('click', () => hideModal('settingsModal'));
  document.getElementById('settingsSave').addEventListener('click', saveSettings);
  document.getElementById('testConnectionBtn').addEventListener('click', testConnection);
  document.getElementById('clearLocalBtn').addEventListener('click', () => {
    if (confirm('Clear all local data? This cannot be undone.')) {
      ['items','combos','journal','config'].forEach(k => localStorage.removeItem('closetiq_' + k));
      location.reload();
    }
  });

  // Item modal
  document.getElementById('itemModalClose').addEventListener('click', () => hideModal('itemModal'));
  document.getElementById('itemModalCancel').addEventListener('click', () => hideModal('itemModal'));
  document.getElementById('itemModalSave').addEventListener('click', () => window.saveItem());

  // Photo upload
  const photoInput = document.getElementById('photoInput');
  document.getElementById('uploadPhotoBtn').addEventListener('click', () => photoInput.click());
  document.getElementById('photoZone').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    photoInput.click();
  });
  photoInput.addEventListener('change', e => {
    if (e.target.files[0]) window.handlePhotoUpload(e.target.files[0]);
  });
  document.getElementById('removeBgBtn').addEventListener('click', () => window.doRemoveBg());

  // Strip actions
  document.getElementById('stripEdit').addEventListener('click', () => {
    if (State.selectedItemId) openAddItem(State.selectedItemId);
  });
  document.getElementById('stripDelete').addEventListener('click', deleteCurrentItem);

  // Outfit filter
  document.getElementById('outfitFilter').addEventListener('change', e => renderOutfits(e.target.value));

  // Outfit detail modal
  document.getElementById('outfitDetailClose').addEventListener('click', () => hideModal('outfitDetailModal'));
  document.getElementById('outfitDetailDelete').addEventListener('click', async () => {
    if (!State.viewingOutfitId) return;
    const combo = State.combos.find(c => c.id === State.viewingOutfitId);
    if (!combo || !confirm(`Delete "${escapeHTML(combo.name)}"?`)) return;
    await DB.deleteCombo(State.viewingOutfitId);
    State.combos = State.combos.filter(c => c.id !== State.viewingOutfitId);
    hideModal('outfitDetailModal');
    renderOutfits();
    showToast('Outfit deleted');
  });
  document.getElementById('outfitDetailPin').addEventListener('click', async () => {
    if (!State.viewingOutfitId) return;
    const combo = State.combos.find(c => c.id === State.viewingOutfitId);
    if (!combo) return;
    const updated = await DB.updateCombo(combo.id, { pinned: !combo.pinned });
    const idx = State.combos.findIndex(c => c.id === combo.id);
    if (idx !== -1) State.combos[idx] = { ...combo, pinned: !combo.pinned };
    hideModal('outfitDetailModal');
    renderOutfits();
    showToast(combo.pinned ? 'Unpinned' : 'Pinned!', 'success');
  });

  // Builder save
  document.getElementById('saveOutfitBtn').addEventListener('click', saveOutfit);

  // Journal
  document.getElementById('logTodayBtn').addEventListener('click', openLogModal);
  document.getElementById('logModalClose').addEventListener('click', () => hideModal('logModal'));
  document.getElementById('logModalCancel').addEventListener('click', () => hideModal('logModal'));
  document.getElementById('logModalSave').addEventListener('click', saveJournalEntry);

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) hideModal(backdrop.id);
    });
  });

  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m => hideModal(m.id));
    }
    // Arrow keys for carousel
    if (e.target.matches('input, textarea, select') || document.querySelector('.modal-backdrop:not(.hidden)')) return;
    if (e.key === 'ArrowLeft') Carousel.prev();
    if (e.key === 'ArrowRight') Carousel.next();
  });

  // Initial render
  Carousel.render();

  // Show app, hide splash
  setTimeout(() => {
    document.getElementById('splash').classList.add('out');
    document.getElementById('app').classList.remove('hidden');
  }, 1200);
}

// Launch
document.addEventListener('DOMContentLoaded', () => boot().catch(console.error));
