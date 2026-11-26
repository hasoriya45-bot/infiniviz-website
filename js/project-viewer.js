/**
 * INFINIVIZ project viewer — Section 04 "Step inside. Look around."
 * Driven entirely by experiences/<id>/manifest.json produced by tools/blender/export_project.py.
 *
 * Modes (one renderer, one loaded GLB shared by walkthrough + free camera):
 *   360°        Blender Cycles equirectangular panoramas, 9 viewpoints, crossfades, zoom.
 *   Walkthrough first-person, drag/touch look, WASD/arrows/pad, capsule collision via three-mesh-bvh.
 *   Free camera orbit/zoom/pan around a cut-away of the model, reset.
 * Plus: viewpoint strip with thumbnails, material options from the manifest, lighting variants
 * (Blender-rendered panorama variants; real-time approximation for the 3D model), fullscreen, help.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshBVH } from 'three-mesh-bvh';

const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  full: '<svg viewBox="0 0 16 16"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>',
  reset: '<svg viewBox="0 0 16 16"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><path d="M2 2v3h3"/></svg>',
  help: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3v.4"/><path d="M8 11.6v.2"/></svg>',
  up: '<svg viewBox="0 0 16 16"><path d="M8 13V3M4 7l4-4 4 4"/></svg>',
  down: '<svg viewBox="0 0 16 16"><path d="M8 3v10M4 9l4 4 4-4"/></svg>',
  left: '<svg viewBox="0 0 16 16"><path d="M13 8H3M7 4L3 8l4 4"/></svg>',
  right: '<svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
};

export async function initProjectViewer(root, manifestUrl) {
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  const manifest = await fetch(manifestUrl, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    return r.json();
  });
  const url = (p) => base + p;
  const views = manifest.views || [];
  const lighting = (manifest.lighting && manifest.lighting.length) ? manifest.lighting : [{ id: 'default', label: 'As rendered', panoramas_dir: '' }];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 700px)').matches;
  const status = { status: 'starting', views: views.length, panoramasLoaded: 0, model: 'not loaded', errors: [] };
  const setStatus = (s, detail) => { status.status = s; root.dataset.status = s; if (detail) root.dataset.detail = detail; };

  // ---------------------------------------------------------------- UI
  root.classList.add('is-project');
  root.classList.remove('is-idle');
  root.querySelectorAll('.viewer-ui, .viewer-activate, .viewer-loading').forEach((n) => n.remove());
  const lead = document.querySelector('[data-exp-lead]');
  if (lead) lead.textContent = `${manifest.title}: ${manifest.description || 'a real interior rendered in Blender.'} Choose a viewpoint, step inside and walk around, or orbit the model.`;
  const metaModel = document.querySelector('[data-exp-model]');
  if (metaModel) metaModel.textContent = `${manifest.title} — modelled and rendered in Blender (${manifest.source?.blender || 'Blender'}, Cycles). Panoramas are the real renders; the walkthrough uses the exported model in real time.`;

  const hasMaterials = (manifest.materials || []).length > 0;
  root.insertAdjacentHTML('beforeend', `
    <div class="pv-fade" data-pv-fade aria-hidden="true"></div>
    <div class="pv-activate">
      <div class="va-actions">
        <button class="va-btn va-btn--primary" type="button" data-pv-start="walk">Step inside</button>
        <button class="va-btn" type="button" data-pv-start="pano">360° views</button>
        <button class="va-btn" type="button" data-pv-start="orbit">Explore model</button>
      </div>
    </div>
    <div class="pv-ui">
      <div class="pv-top">
        <p class="pv-title"><b>${esc(manifest.title)}</b><span data-pv-viewname></span></p>
        <div class="vu-group pv-modes" role="tablist" aria-label="Viewing mode">
          <button class="vu-btn" type="button" role="tab" data-pv-mode="walk">Walkthrough</button>
          <button class="vu-btn" type="button" role="tab" data-pv-mode="orbit">Free camera</button>
          <button class="vu-btn" type="button" role="tab" data-pv-mode="pano">360°</button>
        </div>
        <div class="vu-group pv-tools" role="group" aria-label="Tools">
          ${hasMaterials ? '<button class="vu-btn" type="button" data-pv-panel="materials" aria-pressed="false">Materials</button>' : ''}
          <button class="vu-btn" type="button" data-pv-panel="lighting" aria-pressed="false">Lighting</button>
          <button class="vu-btn vu-icon" type="button" data-pv-panel="help" aria-pressed="false" aria-label="Help">${ICON.help}</button>
          <button class="vu-btn vu-icon" type="button" data-pv-reset aria-label="Reset view">${ICON.reset}</button>
          <button class="vu-btn vu-icon" type="button" data-pv-full aria-label="Full screen">${ICON.full}</button>
        </div>
      </div>
      <div class="pv-panel" data-pv-panelbox hidden></div>
      <div class="pv-views" role="group" aria-label="Viewpoints">
        ${views.map((v, i) => `<button class="pv-view" type="button" data-pv-view="${i}" aria-pressed="false" title="${esc(v.label)}">
          <img src="${esc(url(v.thumbnail))}" alt="" loading="lazy" width="128" height="64"><span><i>${String(i + 1).padStart(2, '0')}</i>${esc(v.label)}</span></button>`).join('')}
      </div>
      <div class="vu-pad pv-pad" role="group" aria-label="Move">
        <button class="vu-btn vu-icon" type="button" data-move="fwd" aria-label="Walk forward">${ICON.up}</button>
        <button class="vu-btn vu-icon" type="button" data-move="left" aria-label="Turn left">${ICON.left}</button>
        <button class="vu-btn vu-icon" type="button" data-move="back" aria-label="Walk back">${ICON.down}</button>
        <button class="vu-btn vu-icon" type="button" data-move="right" aria-label="Turn right">${ICON.right}</button>
      </div>
      <div class="pv-progress" data-pv-progress hidden><i></i><span>Loading</span></div>
    </div>`);
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const progressEl = $('[data-pv-progress]');
  const progress = (text, frac) => {
    if (text == null) { progressEl.hidden = true; return; }
    progressEl.hidden = false;
    progressEl.querySelector('span').textContent = text;
    progressEl.querySelector('i').style.transform = `scaleX(${frac == null ? 0.15 : Math.max(0.02, Math.min(1, frac))})`;
    progressEl.classList.toggle('is-indeterminate', frac == null);
  };
  const fadeEl = $('[data-pv-fade]');
  const fadeTo = (on) => new Promise((res) => { if (reduceMotion) return res(); fadeEl.classList.toggle('is-on', on); setTimeout(res, 260); });

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = false;
  const canvas = renderer.domElement;
  canvas.setAttribute('data-lenis-prevent', '');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Interactive views of ${manifest.title}`);
  root.prepend(canvas);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 2000);
  camera.rotation.order = 'YXZ';
  let needsRender = true;
  const resize = () => {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    needsRender = true;
  };
  new ResizeObserver(resize).observe(root);
  resize();

  // ---------------------------------------------------------------- panorama scene
  const panoScene = new THREE.Scene();
  const sphereGeo = new THREE.SphereGeometry(50, 96, 48);
  sphereGeo.scale(-1, 1, 1);
  const mkSphere = () => {
    // Panoramas are finished Cycles renders: show them as-is (no second tone-mapping pass).
    const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.renderOrder = 1; panoScene.add(m); return m;
  };
  const spheres = [mkSphere(), mkSphere()];
  let front = 0;
  const texCache = new Map();
  const texLoader = new THREE.TextureLoader();
  let lightingIdx = 0;
  const panoPath = (v, li = lightingIdx) => {
    const dir = lighting[li]?.panoramas_dir;
    const p = small ? (v.panorama_mobile || v.panorama) : v.panorama;
    return url(dir ? p.replace(/^panoramas\//, `panoramas/${dir}/`) : p);
  };
  async function loadTexture(src) {
    if (texCache.has(src)) { const t = texCache.get(src); texCache.delete(src); texCache.set(src, t); return t; }
    const tex = await texLoader.loadAsync(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texCache.set(src, tex);
    while (texCache.size > 4) { const [k, t] = texCache.entries().next().value; texCache.delete(k); t.dispose(); }
    return tex;
  }
  const pano = { yaw: 0, pitch: 0, fov: 75, fade: null };
  async function showPanorama(i, { instant = false } = {}) {
    const v = views[i]; if (!v) return;
    progress(`Loading ${v.label}`, null);
    let tex;
    try { tex = await loadTexture(panoPath(v)); }
    catch (e) { progress(null); status.errors.push(`panorama ${v.panorama}: ${e.message || e}`); throw e; }
    progress(null);
    const next = spheres[1 - front], cur = spheres[front];
    next.material.map = tex; next.material.needsUpdate = true;
    next.rotation.y = -Math.PI / 2 + (v.yaw || 0);
    next.material.opacity = 0; next.renderOrder = 2; cur.renderOrder = 1;
    pano.yaw = v.yaw || 0; pano.pitch = 0;
    pano.fade = { t: instant || reduceMotion ? 1 : 0, next, cur };
    front = 1 - front;
    needsRender = true;
  }

  // ---------------------------------------------------------------- model scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#15140f');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  let model = null, collider = null, modelLights = [], materialsByName = new Map();
  const bounds = new THREE.Box3(
    new THREE.Vector3(...(manifest.bounds?.min || [-5, 0, -5])),
    new THREE.Vector3(...(manifest.bounds?.max || [5, 3, 5])));
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), bounds.max.y - Math.min(0.35, size.y * 0.12));
  let modelPromise = null;

  function loadModel() {
    if (modelPromise) return modelPromise;
    if (!manifest.model?.file) return (modelPromise = Promise.reject(new Error('No 3D model in manifest')));
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    progress('Loading 3D model', 0);
    modelPromise = new Promise((resolve, reject) => {
      loader.load(url(manifest.model.file), (gltf) => {
        model = gltf.scene;
        const colliderParts = [];
        model.traverse((o) => {
          if (o.isMesh) {
            if (o.name.startsWith('__swatch__')) { o.visible = false; }
            else {
              o.castShadow = true; o.receiveShadow = true;
              colliderParts.push(o);
            }
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => { if (m?.name) materialsByName.set(m.name, m); });
          }
          if (o.isLight) { modelLights.push(o); o.userData.baseIntensity = o.intensity; if (o.castShadow !== undefined) o.castShadow = !small; }
        });
        scene.add(model);
        model.updateMatrixWorld(true);
        collider = buildCollider(colliderParts);
        draco.dispose();
        progress(null);
        status.model = 'loaded';
        resolve(model);
      }, (xhr) => {
        const total = xhr.total || manifest.model.bytes || 0;
        progress(`Loading 3D model ${total ? Math.round((xhr.loaded / total) * 100) + '%' : ''}`, total ? xhr.loaded / total : null);
      }, (e) => { progress(null); status.model = 'error'; status.errors.push(`model: ${e.message || e}`); reject(e); });
    });
    return modelPromise;
  }

  function buildCollider(meshes) {
    let count = 0;
    const parts = meshes.map((m) => {
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
      const pos = g.getAttribute('position').clone().applyMatrix4(m.matrixWorld);
      count += pos.count; g.dispose();
      return pos;
    });
    const arr = new Float32Array(count * 3);
    let off = 0;
    for (const p of parts) {
      for (let i = 0; i < p.count; i++) { arr[off++] = p.getX(i); arr[off++] = p.getY(i); arr[off++] = p.getZ(i); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.boundsTree = new MeshBVH(geo);
    return geo;
  }

  // ---------------------------------------------------------------- lighting (3D)
  const LIGHT_PRESETS = [
    { id: 'day', label: 'Daylight', env: 1.0, lights: 0.4, exposure: 1.0, bg: '#d9dde0' },
    { id: 'dusk', label: 'Dusk', env: 0.45, lights: 1.0, exposure: 0.95, bg: '#3a2f2a' },
    { id: 'night', label: 'Night', env: 0.08, lights: 1.25, exposure: 1.1, bg: '#0b0d12' },
  ];
  let preset3d = 1;
  function applyPreset3d(i) {
    preset3d = i; const p = LIGHT_PRESETS[i];
    scene.traverse((o) => { if (o.isMesh) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m && 'envMapIntensity' in m) m.envMapIntensity = p.env; }); } });
    modelLights.forEach((l) => (l.intensity = l.userData.baseIntensity * p.lights));
    scene.background.set(p.bg);
    needsRender = true;
  }

  // ---------------------------------------------------------------- materials
  const matState = {};
  function applyMaterial(optIdx, choiceIdx) {
    const opt = manifest.materials[optIdx]; const choice = opt.choices[choiceIdx];
    const target = materialsByName.get(choice.material);
    if (!model || !target) return false;
    const currentName = matState[optIdx] ?? opt.target_material;
    model.traverse((o) => {
      if (!o.isMesh || o.name.startsWith('__swatch__')) return;
      if (Array.isArray(o.material)) o.material = o.material.map((m) => (m?.name === currentName ? target : m));
      else if (o.material?.name === currentName) o.material = target;
    });
    matState[optIdx] = choice.material;
    applyPreset3d(preset3d);
    return true;
  }

  // ---------------------------------------------------------------- orbit
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.enabled = false;
  const resetOrbit = () => {
    const r = Math.max(size.x, size.z) * 1.15 + 2;
    controls.target.set(center.x, bounds.min.y + size.y * 0.35, center.z);
    camera.position.set(center.x + r * 0.7, bounds.max.y + r * 0.55, center.z + r * 0.8);
    camera.fov = 45; camera.updateProjectionMatrix();
    controls.minDistance = 1.2; controls.maxDistance = r * 3;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update(); needsRender = true;
  };
  controls.addEventListener('change', () => (needsRender = true));

  // ---------------------------------------------------------------- walkthrough (capsule vs BVH)
  const EYE = manifest.eye_height || 1.6, RADIUS = 0.25, GRAVITY = -9.8, SPEED = 1.5, TURN = 1.7;
  const walk = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, spawn: 0 };
  const capsule = { radius: RADIUS, segment: new THREE.Line3(new THREE.Vector3(0, -RADIUS, 0), new THREE.Vector3(0, -(EYE - RADIUS), 0)) };
  const tmpBox = new THREE.Box3(), tmpSeg = new THREE.Line3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), triPt = new THREE.Vector3(), capPt = new THREE.Vector3();
  const keys = new Set();

  function stepWalk(dt) {
    if (!collider) return false;
    walk.vel.y += walk.onGround ? 0 : dt * GRAVITY;
    walk.pos.addScaledVector(walk.vel, dt);
    if (keys.has('left')) walk.yaw += TURN * dt;
    if (keys.has('right')) walk.yaw -= TURN * dt;
    const f = (keys.has('fwd') ? 1 : 0) - (keys.has('back') ? 1 : 0);
    const s = (keys.has('strafeR') ? 1 : 0) - (keys.has('strafeL') ? 1 : 0);
    if (f || s) {
      const sin = Math.sin(walk.yaw), cos = Math.cos(walk.yaw);
      walk.pos.x += (-sin * f + cos * s) * SPEED * dt;
      walk.pos.z += (-cos * f - sin * s) * SPEED * dt;
    }
    // Resolve capsule against every nearby triangle (walls, furniture, floor).
    tmpSeg.copy(capsule.segment); tmpSeg.start.add(walk.pos); tmpSeg.end.add(walk.pos);
    tmpBox.makeEmpty(); tmpBox.expandByPoint(tmpSeg.start); tmpBox.expandByPoint(tmpSeg.end);
    tmpBox.min.addScalar(-RADIUS); tmpBox.max.addScalar(RADIUS);
    collider.boundsTree.shapecast({
      intersectsBounds: (box) => box.intersectsBox(tmpBox),
      intersectsTriangle: (tri) => {
        const d = tri.closestPointToSegment(tmpSeg, triPt, capPt);
        if (d < RADIUS) {
          const depth = RADIUS - d;
          const dir = capPt.sub(triPt).normalize();
          tmpSeg.start.addScaledVector(dir, depth); tmpSeg.end.addScaledVector(dir, depth);
        }
      },
    });
    const newPos = tmpV.copy(tmpSeg.start).sub(capsule.segment.start);
    const delta = tmpV2.subVectors(newPos, walk.pos);
    walk.onGround = delta.y > Math.abs(dt * walk.vel.y * 0.25);
    const offset = Math.max(0, delta.length() - 1e-5);
    delta.normalize().multiplyScalar(offset);
    walk.pos.add(delta);
    if (walk.onGround) walk.vel.set(0, 0, 0);
    else { delta.normalize(); walk.vel.addScaledVector(delta, -delta.dot(walk.vel)); }
    if (walk.pos.y < bounds.min.y - 3) spawnAt(walk.spawn, true);
    camera.position.copy(walk.pos);
    camera.rotation.set(walk.pitch, walk.yaw, 0);
    return true;
  }
  function spawnAt(i, keepView = false) {
    const v = views[i]; if (!v) return;
    walk.spawn = i;
    walk.pos.set(v.position[0], v.position[1], v.position[2]);
    walk.vel.set(0, 0, 0); walk.onGround = false;
    if (!keepView) { walk.yaw = v.yaw || 0; walk.pitch = Math.max(-0.6, Math.min(0.6, v.pitch || 0)); }
    camera.position.copy(walk.pos); camera.rotation.set(walk.pitch, walk.yaw, 0);
    needsRender = true;
  }

  // ---------------------------------------------------------------- modes
  let mode = null, current = 0;
  const viewName = $('[data-pv-viewname]');
  const markView = (i) => {
    current = i;
    $$('[data-pv-view]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.pvView === i)));
    viewName.textContent = views[i] ? ` · ${views[i].label}` : '';
  };
  async function setMode(m, { viewIndex = current } = {}) {
    if (m !== 'pano') {
      try { await loadModel(); }
      catch (e) { console.warn('3D model unavailable', e); if (m !== 'pano') { m = 'pano'; } }
    }
    const changing = mode !== m;
    if (changing && mode) await fadeTo(true);
    mode = m;
    root.dataset.mode = m;
    keys.clear();
    $$('[data-pv-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pvMode === m)));
    controls.enabled = m === 'orbit';
    renderer.clippingPlanes = m === 'orbit' ? [cutPlane] : [];
    if (m === 'pano') { camera.fov = pano.fov; camera.near = 0.1; camera.updateProjectionMatrix(); await showPanorama(viewIndex, { instant: true }); }
    if (m === 'walk') { camera.fov = small ? 75 : 68; camera.near = 0.03; camera.updateProjectionMatrix(); spawnAt(viewIndex); }
    if (m === 'orbit') { camera.near = 0.05; resetOrbit(); }
    markView(viewIndex);
    renderPanel();
    needsRender = true;
    if (changing) await fadeTo(false);
  }
  async function goView(i) {
    if (mode === 'pano') { markView(i); await showPanorama(i); }
    else if (mode === 'walk') { await fadeTo(true); spawnAt(i); markView(i); await fadeTo(false); }
    else { markView(i); await setMode('walk', { viewIndex: i }); }
  }

  // ---------------------------------------------------------------- panels
  const panelBox = $('[data-pv-panelbox]');
  let openPanel = null;
  function renderPanel() {
    $$('[data-pv-panel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pvPanel === openPanel)));
    if (!openPanel) { panelBox.hidden = true; return; }
    panelBox.hidden = false;
    if (openPanel === 'help') {
      panelBox.innerHTML = `<h4>How to explore</h4><dl>
        <dt>360°</dt><dd>Drag to look around, scroll or pinch to zoom. Pick a viewpoint below. These are the real Blender Cycles renders.</dd>
        <dt>Walkthrough</dt><dd>Drag to look. W A S D or arrow keys to walk (Q/E or ←/→ to turn). On phones use the arrows. Walls and furniture stop you.</dd>
        <dt>Free camera</dt><dd>Drag to rotate, scroll to zoom, right-drag or two fingers to pan. The ceiling is cut away so you can see in.</dd></dl>
        <p class="pv-note">The 3D modes show the exported Blender model in real time; real-time lighting is an approximation and does not match Cycles exactly.</p>`;
    } else if (openPanel === 'lighting') {
      const panoBtns = lighting.map((l, i) => `<button class="pv-chip" type="button" data-pv-light="${i}" aria-pressed="${i === lightingIdx}">${esc(l.label)}</button>`).join('');
      const rtBtns = LIGHT_PRESETS.map((p, i) => `<button class="pv-chip" type="button" data-pv-rt="${i}" aria-pressed="${i === preset3d}">${p.label}</button>`).join('');
      panelBox.innerHTML = `<h4>Lighting</h4>
        <p class="pv-label">360° renders (Blender Cycles)</p><div class="pv-chips">${panoBtns}</div>
        ${lighting.length < 2 ? '<p class="pv-note">Only one lighting setup was rendered for this project. Add lighting variants in the export config to render more.</p>' : ''}
        <p class="pv-label">3D model (real-time approximation)</p><div class="pv-chips">${rtBtns}</div>`;
    } else if (openPanel === 'materials') {
      panelBox.innerHTML = `<h4>Materials</h4>` + manifest.materials.map((opt, oi) => `
        <p class="pv-label">${esc(opt.label)}</p><div class="pv-chips">${opt.choices.map((c, ci) => {
          const cur = (matState[oi] ?? opt.target_material) === c.material;
          const m = materialsByName.get(c.material);
          const sw = m?.color ? `#${m.color.getHexString()}` : '#777';
          return `<button class="pv-chip" type="button" data-pv-mat="${oi}:${ci}" aria-pressed="${cur}"><i style="background:${sw}"></i>${esc(c.label)}</button>`;
        }).join('')}</div>`).join('') + (mode === 'pano' ? '<p class="pv-note">Material changes apply to the 3D model. Switch to Walkthrough or Free camera to see them.</p>' : '');
    }
  }
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t || !root.contains(t)) return;
    if (t.dataset.pvStart) { root.classList.add('is-active'); await setMode(t.dataset.pvStart); }
    else if (t.dataset.pvMode) { root.classList.add('is-active'); await setMode(t.dataset.pvMode); }
    else if (t.dataset.pvView != null) { root.classList.add('is-active'); if (!mode) await setMode('pano', { viewIndex: +t.dataset.pvView }); else await goView(+t.dataset.pvView); }
    else if (t.dataset.pvPanel) { openPanel = openPanel === t.dataset.pvPanel ? null : t.dataset.pvPanel; renderPanel(); }
    else if (t.dataset.pvLight != null) { lightingIdx = +t.dataset.pvLight; renderPanel(); if (mode === 'pano') await showPanorama(current); }
    else if (t.dataset.pvRt != null) { applyPreset3d(+t.dataset.pvRt); renderPanel(); }
    else if (t.dataset.pvMat) { const [o, c] = t.dataset.pvMat.split(':').map(Number); if (!model) await loadModel(); applyMaterial(o, c); renderPanel(); }
    else if (t.hasAttribute('data-pv-reset')) { if (mode === 'orbit') resetOrbit(); else if (mode === 'walk') spawnAt(current); else if (mode === 'pano') { pano.yaw = views[current]?.yaw || 0; pano.pitch = 0; pano.fov = 75; camera.fov = 75; camera.updateProjectionMatrix(); needsRender = true; } }
    else if (t.hasAttribute('data-pv-full')) { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().catch(() => {}); }
  });
  if (!document.fullscreenEnabled) $('[data-pv-full]')?.setAttribute('hidden', '');

  // ---------------------------------------------------------------- input: look (pano + walk), zoom, keys, pad
  const pointers = new Map();
  let pinchStart = 0, fovStart = 75;
  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'pano' && mode !== 'walk') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a.x - b.x, a.y - b.y); fovStart = camera.fov; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    if (pointers.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart) { camera.fov = THREE.MathUtils.clamp(fovStart * pinchStart / d, 30, 95); camera.updateProjectionMatrix(); if (mode === 'pano') pano.fov = camera.fov; needsRender = true; }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    const k = (camera.fov / 75) * (e.pointerType === 'touch' ? 0.006 : 0.0045);
    if (mode === 'pano') { pano.yaw += dx * k; pano.pitch = THREE.MathUtils.clamp(pano.pitch + dy * k, -1.45, 1.45); }
    else { walk.yaw += dx * k; walk.pitch = THREE.MathUtils.clamp(walk.pitch + dy * k, -1.3, 1.3); }
    needsRender = true;
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = 0; };
  canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'pano' && mode !== 'walk') return;
    e.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + Math.sign(e.deltaY) * 4, 30, 95);
    camera.updateProjectionMatrix(); if (mode === 'pano') pano.fov = camera.fov; needsRender = true;
  }, { passive: false });
  const KEYMAP = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'strafeL', KeyD: 'strafeR', ArrowLeft: 'left', ArrowRight: 'right', KeyQ: 'left', KeyE: 'right' };
  let visible = false;
  addEventListener('keydown', (e) => {
    if (mode !== 'walk' || !visible || e.target.closest?.('input, textarea, select')) return;
    const k = KEYMAP[e.code]; if (!k) return;
    e.preventDefault(); keys.add(k);
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());
  $$('[data-move]').forEach((b) => {
    const k = b.dataset.move;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(k); b.setPointerCapture?.(e.pointerId); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, () => keys.delete(k)));
  });

  // ---------------------------------------------------------------- loop
  let raf = 0, last = performance.now();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let moving = false;
    if (mode === 'pano') {
      if (pano.fade) {
        pano.fade.t = Math.min(1, pano.fade.t + dt / 0.6);
        const e = ease(pano.fade.t);
        pano.fade.next.material.opacity = e;
        pano.fade.cur.material.opacity = 1 - e;
        if (pano.fade.t >= 1) { pano.fade.cur.material.opacity = 0; pano.fade = null; }
        moving = true;
      }
      camera.position.set(0, 0, 0);
      camera.rotation.set(pano.pitch, pano.yaw, 0);
    } else if (mode === 'walk') {
      moving = stepWalk(dt) && (keys.size > 0 || !walk.onGround);
    } else if (mode === 'orbit') {
      controls.update();
    }
    if (moving || needsRender) {
      renderer.render(mode === 'pano' ? panoScene : scene, camera);
      needsRender = false;
    }
  };
  const setRunning = (on) => {
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver((en) => { visible = en.some((x) => x.isIntersecting); setRunning(visible && !document.hidden); }, { threshold: 0.02 }).observe(root);
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setRunning(false); root.classList.add('is-fallback'); });

  // ---------------------------------------------------------------- start: show the first real render immediately
  mode = 'pano'; root.dataset.mode = 'pano';
  camera.fov = pano.fov; camera.updateProjectionMatrix();
  try { await showPanorama(0, { instant: true }); markView(0); setStatus('ready'); }
  catch (e) { setStatus('error', `first panorama failed: ${e.message || e}`); }
  root.classList.add('is-ready');
  $$('[data-pv-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pvMode === 'pano')));
  renderer.render(panoScene, camera);
  if (root.dataset.autostart === 'walk') { delete root.dataset.autostart; root.classList.add('is-active'); setMode('walk'); }
  root.addEventListener('ivz:walk', () => { root.classList.add('is-active'); setMode('walk'); });

  // ---------------------------------------------------------------- test hooks (used by tools/test-site.ps1)
  const api = {
    status,
    async loadAllPanoramas() {
      let ok = 0;
      for (const v of views) {
        for (let li = 0; li < lighting.length; li++) {
          try { await loadTexture(panoPath(v, li)); ok++; } catch (e) { status.errors.push(`panorama ${v.id}/${lighting[li].id}: ${e.message || e}`); }
        }
      }
      status.panoramasLoaded = ok;
      return ok === views.length * lighting.length;
    },
    async testModes() {
      const out = {};
      for (const m of ['pano', 'walk', 'orbit', 'pano']) {
        try { await setMode(m); renderer.render(m === 'pano' ? panoScene : scene, camera); out[m] = mode === m; }
        catch (e) { out[m] = false; status.errors.push(`mode ${m}: ${e.message || e}`); }
      }
      return out;
    },
    async testCollision() {
      // From every viewpoint walk 6 s in four directions; the eye must stay inside the model bounds and land on a floor.
      await loadModel();
      const inside = (p) => p.x > bounds.min.x - 0.05 && p.x < bounds.max.x + 0.05 && p.z > bounds.min.z - 0.05 && p.z < bounds.max.z + 0.05;
      const problems = [];
      for (let i = 0; i < views.length; i++) {
        for (const dir of ['fwd', 'back', 'strafeL', 'strafeR']) {
          spawnAt(i); keys.clear(); keys.add(dir);
          for (let s = 0; s < 360; s++) stepWalk(1 / 60);
          keys.clear();
          for (let s = 0; s < 60; s++) stepWalk(1 / 60);
          if (!inside(walk.pos)) problems.push(`${views[i].id} walking ${dir} left the room at (${walk.pos.x.toFixed(2)}, ${walk.pos.z.toFixed(2)})`);
          if (!walk.onGround) problems.push(`${views[i].id} walking ${dir}: no floor found under the camera`);
        }
      }
      return { ok: problems.length === 0, problems };
    },
  };
  root.__ivz = api;
  return api;
}
