import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const host = document.getElementById('closetCanvas');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
// Warm linen clear color — opaque, CSS gradient won't interfere
renderer.setClearColor(0xeadfc8, 1); // warm oak clear color
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);

let wallMat;

// ── Back wall — vertical birch/oak grain texture ──────────
(function addWall() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  // Light birch base — very pale warm tone matching reference
  ctx.fillStyle = '#dfc49a';
  ctx.fillRect(0, 0, size, size);

  // Vertical grain lines (birch/oak style — runs top to bottom)
  const N = 220;
  for (let i = 0; i < N; i++) {
    const x0 = (i / N) * size;
    const a1 = 8  + 7  * Math.sin(i * 0.12);
    const a2 = 4  + 3  * Math.sin(i * 0.21 + 1.3);
    const a3 = 2  + 1  * Math.sin(i * 0.38 + 2.5);
    const f1 = 0.008 + 0.003 * Math.sin(i * 0.09);
    const f2 = 0.020 + 0.006 * Math.sin(i * 0.07 + 0.4);
    const f3 = 0.045 + 0.009 * Math.sin(i * 0.05 + 1.0);
    const p1 = i * 0.52;
    const p2 = i * 0.87 + 2.0;
    const p3 = i * 1.25 + 0.6;

    const dark = 0.04 + 0.15 * Math.pow(Math.abs(Math.sin(i * 0.13)), 2.0);
    ctx.strokeStyle = `rgba(130,80,30,${dark})`;
    ctx.lineWidth = 0.55 + 0.30 * Math.abs(Math.sin(i * 0.18));

    ctx.beginPath();
    for (let y = 0; y <= size; y += 2) {
      const x = x0
        + a1 * Math.sin(y * f1 + p1)
        + a2 * Math.sin(y * f2 + p2)
        + a3 * Math.sin(y * f3 + p3);
      y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Sap / highlight streaks (vertical lighter bands)
  for (let i = 0; i < 14; i++) {
    const x0 = (i / 14) * size + 18;
    const f  = 0.006 + 0.003 * Math.sin(i * 0.55);
    const a  = 7 + 9 * Math.abs(Math.sin(i * 0.42));
    ctx.strokeStyle = `rgba(235,200,145,0.14)`;
    ctx.lineWidth = 3 + 2 * Math.abs(Math.sin(i * 0.65));
    ctx.beginPath();
    for (let y = 0; y <= size; y += 2) {
      const x = x0 + a * Math.sin(y * f + i * 0.75);
      y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Lighten the centre (vignette-style like reference photo)
  const vig = ctx.createRadialGradient(size * 0.5, size * 0.45, size * 0.15, size * 0.5, size * 0.45, size * 0.72);
  vig.addColorStop(0, 'rgba(255,240,210,0.22)');
  vig.addColorStop(1, 'rgba(90,50,15,0.18)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 1.8);
  wallMat = new THREE.MeshLambertMaterial({ map: tex });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), wallMat);
  wall.position.set(0, 0, -4.0);
  scene.add(wall);
})();

// ── Ceiling strip light mesh — visible top bar ─────────────
(function addCeilingBar() {
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.08, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  bar.position.set(0, 2.3, 0.8);
  scene.add(bar);
})();

// ── Animated glow sprites (warm spotlight halos) ──────────
function makeGlowSprite() {
  const sz = 128;
  const c = document.createElement('canvas');
  c.width = c.height = sz;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,   'rgba(255,248,210,1)');
  g.addColorStop(0.3, 'rgba(255,230,150,0.6)');
  g.addColorStop(0.7, 'rgba(255,210,100,0.15)');
  g.addColorStop(1,   'rgba(255,200,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowSprite();
const glowMat1 = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.38 });
const glowMat2 = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.32 });
const glow1 = new THREE.Sprite(glowMat1);
// Top corners — positioned within the camera frustum on all viewport sizes
glow1.position.set(-2.0, 1.5, 0.0);
glow1.scale.set(5.5, 5.5, 1);
scene.add(glow1);
const glow2 = new THREE.Sprite(glowMat2);
glow2.position.set(2.0, 1.5, 0.0);
glow2.scale.set(5.5, 5.5, 1);
scene.add(glow2);

// ── Theme-aware scene colours ─────────────────────────────
function applyTheme3D() {
  const dark = document.documentElement.dataset.theme === 'dark';
  renderer.setClearColor(dark ? 0x1a0e08 : 0xeadfc8, 1);
  if (wallMat) wallMat.color.set(dark ? 0x3a1a08 : 0xffffff);
  glowMat1.color.set(dark ? 0xff9944 : 0xffd4a0);
  glowMat2.color.set(dark ? 0xff9944 : 0xffd4a0);
  glowMat1.opacity = dark ? 0.55 : 0.38;
  glowMat2.opacity = dark ? 0.45 : 0.32;
}
applyTheme3D();
new MutationObserver(applyTheme3D)
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── Lighting ──────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xfff8f0, 0xd8cfc0, 1.1));

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(1, 6, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8; key.shadow.camera.right = 8;
key.shadow.camera.top = 5;  key.shadow.camera.bottom = -5;
key.shadow.normalBias = 0.02; key.shadow.radius = 4;
scene.add(key);

const spot1 = new THREE.SpotLight(0xfff4d0, 3.0, 14, Math.PI / 7, 0.45, 1.0);
spot1.position.set(-2.5, 5, 4);
spot1.target.position.set(-0.5, -1, 0);
scene.add(spot1); scene.add(spot1.target);

const spot2 = new THREE.SpotLight(0xfff4d0, 3.0, 14, Math.PI / 7, 0.45, 1.0);
spot2.position.set(2.5, 5, 4);
spot2.target.position.set(0.5, -1, 0);
scene.add(spot2); scene.add(spot2.target);

// ── Floor shadow ──────────────────────────────────────────
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.ShadowMaterial({ opacity: 0.07 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.8;
floor.receiveShadow = true;
scene.add(floor);

// ── Pipe rail ─────────────────────────────────────────────
const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.3 });
const RAIL_Y  = 1.0;
const RAIL_LEN = 7.0;

const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, RAIL_LEN, 20), ironMat);
pipe.rotation.z = Math.PI / 2;
pipe.position.y = RAIL_Y;
pipe.castShadow = true;
scene.add(pipe);

function makeFlange(x) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 24), ironMat);
  plate.rotation.z = Math.PI / 2; g.add(plate);
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 16), ironMat);
  stub.rotation.z = Math.PI / 2;
  stub.position.x = x > 0 ? -0.09 : 0.09;
  g.add(stub);
  g.position.set(x, RAIL_Y, -0.02);
  return g;
}
scene.add(makeFlange(-RAIL_LEN / 2 + 0.03));
scene.add(makeFlange( RAIL_LEN / 2 - 0.03));

// ── Hanger ────────────────────────────────────────────────
// Pivot = pipe centre (RAIL_Y). Local y=0 = pipe centre, pipe top = y=+0.032.
const APEX_Y   = -0.16;  // shoulder apex below pipe
const CROSSBAR_Y = APEX_Y - 0.26;  // crossbar level

function makeHanger() {
  const g = new THREE.Group();
  const wood    = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.7, metalness: 0.0 });
  const hookMat = new THREE.MeshStandardMaterial({ color: 0x585858, metalness: 0.85, roughness: 0.2 });

  // Collar ring — visually anchors hanger onto the pipe
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 10, 24), hookMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0, 0);
  g.add(collar);

  // Hook wire from apex up through collar to slightly above pipe
  const hookCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, APEX_Y, 0),
    new THREE.Vector3(0.05, APEX_Y * 0.3, 0.04),
    new THREE.Vector3(0.03, 0.10, 0.04),
    new THREE.Vector3(0, 0.04, 0)
  );
  const hookMesh = new THREE.Mesh(new THREE.TubeGeometry(hookCurve, 18, 0.012, 8), hookMat);
  hookMesh.castShadow = true;
  g.add(hookMesh);

  // Left shoulder
  const lc = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, APEX_Y, 0),
    new THREE.Vector3(-0.36, APEX_Y - 0.05, 0),
    new THREE.Vector3(-0.62, CROSSBAR_Y, 0)
  );
  const lm = new THREE.Mesh(new THREE.TubeGeometry(lc, 14, 0.010, 8), wood);
  lm.castShadow = true; g.add(lm);

  // Right shoulder
  const rc = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, APEX_Y, 0),
    new THREE.Vector3(0.36, APEX_Y - 0.05, 0),
    new THREE.Vector3(0.62, CROSSBAR_Y, 0)
  );
  const rm = new THREE.Mesh(new THREE.TubeGeometry(rc, 14, 0.010, 8), wood);
  rm.castShadow = true; g.add(rm);

  // Crossbar exactly at CROSSBAR_Y
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1.24, 10), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, CROSSBAR_Y, 0.005);
  bar.castShadow = true;
  g.add(bar);

  return g;
}

// ── Clothes management ────────────────────────────────────
const clothes = new THREE.Group();
scene.add(clothes);
let generation = 0, meshes = [];

function disposeClothes() {
  while (clothes.children.length) {
    const c = clothes.children[0];
    c.traverse(o => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      if (o.userData.garment) { o.material?.map?.dispose(); o.material?.dispose(); }
    });
    clothes.remove(c);
  }
  meshes = [];
}

async function loadTexture(url) {
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.crossOrigin = ''; i.onload = () => res(i); i.onerror = rej; i.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  if (url.startsWith('assets/')) {
    const ctx = c.getContext('2d');
    const px = ctx.getImageData(0, 0, c.width, c.height);
    for (let j = 0; j < px.data.length; j += 4)
      if (Math.min(px.data[j], px.data[j+1], px.data[j+2]) > 235) px.data[j+3] = 0;
    ctx.putImageData(px, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { t, ratio: c.width / c.height };
}

const SPACING   = 0.48;
const MAX_SHOW  = 7;

async function update({ items, selected }) {
  const version = ++generation;
  disposeClothes();
  const visible = items.filter(i => i.img);
  const selIdx  = visible.findIndex(i => i.id === selected);
  const start   = Math.max(0, Math.min(selIdx - 3, visible.length - MAX_SHOW));
  const shown   = visible.slice(start, start + MAX_SHOW);

  await Promise.all(shown.map(async (item, i) => {
    try {
      const { t, ratio } = await loadTexture(item.img);
      if (version !== generation) { t.dispose(); return; }

      const base = item.category === 'dress' ? 2.6 : 2.0;
      const w = ratio >= 1 ? base : base * ratio;
      const h = ratio >= 1 ? base / ratio : base;
      const isSelected = item.id === selected;

      const pivot = new THREE.Group();
      pivot.position.set(
        (i - (shown.length - 1) / 2) * SPACING,
        RAIL_Y,
        i * 0.05
      );
      pivot.userData = { swayPhase: i * 1.1, isSelected, id: item.id };
      clothes.add(pivot);

      pivot.add(makeHanger());

      // Garment top flush with crossbar
      const garmentY = CROSSBAR_Y - h / 2;
      const mat = new THREE.MeshStandardMaterial({
        map: t, transparent: true, alphaTest: 0.05,
        roughness: 0.80, metalness: 0.0,
        side: THREE.FrontSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(0, garmentY, -0.01); // slightly behind crossbar
      mesh.renderOrder = i;
      mesh.castShadow = true;
      mesh.userData = { garment: true, id: item.id };
      pivot.add(mesh);
      meshes.push(mesh);

      if (isSelected) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.044, 0.007, 8, 24),
          new THREE.MeshStandardMaterial({ color: 0xc8a846, metalness: 0.7, roughness: 0.2 })
        );
        ring.rotation.x = Math.PI / 2;
        pivot.add(ring);
      }

    } catch(e) { console.warn('Garment load failed', item.id); }
  }));
}

window.addEventListener('closet:update', e => update(e.detail));

// ── Interaction ───────────────────────────────────────────
const ray = new THREE.Raycaster();
let down, targetX = 0, targetY = 0, currentX = 0, currentY = 0, hoveredId = null;

renderer.domElement.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (down) {
    targetX = THREE.MathUtils.clamp((e.clientX - down.x) / 700, -0.18, 0.18);
    targetY = THREE.MathUtils.clamp((e.clientY - down.y) / 900, -0.06, 0.06);
    return;
  }
  // Hover raycasting when not dragging
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(
    new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1),
    camera
  );
  const hit = ray.intersectObjects(meshes)[0];
  hoveredId = hit?.object.userData.id ?? null;
  renderer.domElement.style.cursor = hoveredId ? 'pointer' : 'default';
  window.dispatchEvent(new CustomEvent('closet:hover', { detail: hoveredId }));
});
renderer.domElement.addEventListener('pointerup', e => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1),
      camera
    );
    const hit = ray.intersectObjects(meshes)[0];
    if (hit) window.dispatchEvent(new CustomEvent('closet:select', { detail: hit.object.userData.id }));
  }
  down = null;
});
renderer.domElement.addEventListener('pointercancel', () => down = null);
document.getElementById('resetView').onclick = () => { targetX = targetY = 0; };

// ── Resize ────────────────────────────────────────────────
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const halfRack = ((MAX_SHOW - 1) / 2) * SPACING + 1.0;
  const dist = halfRack / (Math.tan(THREE.MathUtils.degToRad(17)) * camera.aspect);
  camera.position.set(0, 0.0, dist);
  camera.lookAt(0, 0.2, 0);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();

// ── Animation loop ────────────────────────────────────────
const clock = new THREE.Clock();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

renderer.setAnimationLoop(() => {
  if (document.hidden || !document.getElementById('view-wardrobe').classList.contains('active')) return;
  const t = clock.getElapsedTime();

  currentX += (targetX - currentX) * (reduced.matches ? 1 : 0.06);
  currentY += (targetY - currentY) * (reduced.matches ? 1 : 0.06);
  scene.rotation.y = currentX;
  scene.rotation.x = currentY;

  if (!reduced.matches) {

    // Gentle garment sway + hover jiggle
    clothes.children.forEach(pivot => {
      const ph      = pivot.userData.swayPhase ?? 0;
      const isHover = pivot.userData.id === hoveredId && hoveredId !== null;
      const spd = isHover ? 4.5 : (pivot.userData.isSelected ? 0.22 : 0.30);
      const amp = isHover ? 0.022 : (pivot.userData.isSelected ? 0.004 : 0.007);
      pivot.rotation.z = Math.sin(t * spd + ph) * amp;
    });
  }

  renderer.render(scene, camera);
});

document.getElementById('wardrobeScene').classList.add('webgl-ready');
document.getElementById('sceneStatus').textContent = 'LIVE CLOSET · PHOTO DEPTH';
window.dispatchEvent(new Event('closet:ready'));
