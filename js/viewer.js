/**
 * Interactive 3D architectural viewer.
 *  - Orbit mode: rotate / zoom / pan, preset views, section cut, auto-rotate.
 *  - Walk mode ("Step inside"): first-person look + walk with collisions,
 *    click-the-floor navigation, room hotspots, keyboard and touch pad.
 *  - HDR post-processing (bloom), physical sky lighting, time of day, fullscreen,
 *    optional custom .glb, and a static fallback when WebGL is unavailable.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createVillaWorld, hasWebGL } from './villa.js';
import { CONFIG } from './config.js';

const VIEWS = {
  front:      { pos: [7, 5.5, 34],   target: [1.5, 3, 0] },
  aerial:     { pos: [30, 34, 30],   target: [1, 1.5, 0] },
  pool:       { pos: [15, 1.7, 15],  target: [1, 2.8, 3] },
  cantilever: { pos: [26, 3.2, 9],   target: [8, 5.2, 0] },
  rear:       { pos: [-22, 8, -26],  target: [0, 3, 0] },
};
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const angleLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export function initViewer(root) {
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const fallback = (msg) => {
    if (msg) { const p = $('[data-fallback-msg]'); if (p) p.textContent = msg; }
    root.classList.add('is-fallback');
  };
  if (!hasWebGL()) return fallback();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    console.warn('WebGL renderer unavailable:', e);
    return fallback();
  }
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 700px)').matches;
  const hq = !small && (navigator.hardwareConcurrency || 4) >= 4;

  const pixelRatio = Math.min(devicePixelRatio || 1, hq ? 2 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive 3D model of a concept villa. Use the buttons to change view, lighting, or to step inside.');
  canvas.setAttribute('data-lenis-prevent', '');
  root.prepend(canvas);

  const world = createVillaWorld({ renderer, shadowSize: hq ? 4096 : 2048, mode: 'golden' });
  const { scene, walk } = world;

  const camera = new THREE.PerspectiveCamera(small ? 42 : 36, 1, 0.08, 4000);
  camera.rotation.order = 'YXZ';

  // ---------- Post-processing (HDR + bloom) ----------
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: hq ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), world.bloomRef.strength, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- Orbit controls ----------
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...VIEWS.front.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 7;
  controls.maxDistance = 110;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.5;
  controls.enabled = false;

  // ---------- Optional custom model ----------
  let customModel = false;
  if (CONFIG.modelUrl) {
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      new GLTFLoader().load(CONFIG.modelUrl, (gltf) => {
        world.useCustomModel(gltf.scene);
        customModel = true;
        const label = $('.vu-label'); if (label) label.firstChild.textContent = 'Your model · ';
        $$('[data-toggle="section"], [data-walk-enter]').forEach((b) => b.setAttribute('hidden', ''));
        needsRender = true;
      }, undefined, (err) => console.warn('Custom model failed to load, using the concept model instead.', err));
    }).catch((err) => console.warn('GLTFLoader unavailable:', err));
  }

  // ---------- Size ----------
  let needsRender = true;
  function viewPos(v) {
    const target = new THREE.Vector3(...v.target);
    const off = new THREE.Vector3(...v.pos).sub(target);
    const k = camera.aspect < 1.2 ? Math.min(1.75, 1.05 / camera.aspect) : 1;
    return target.add(off.multiplyScalar(k));
  }
  let firstSize = true;
  const resize = () => {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (firstSize) { camera.position.copy(viewPos(VIEWS.front)); controls.update(); firstSize = false; }
    needsRender = true;
  };
  new ResizeObserver(resize).observe(root);
  resize();

  // ---------- Shared UI helpers ----------
  const setPressed = (sel, el) => $$(sel).forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  const status = $('[data-viewer-status]');
  const fade = $('[data-viewer-fade]');
  const fadeTo = (on) => new Promise((res) => { if (!fade || reduceMotion) return res(); fade.classList.toggle('is-on', on); setTimeout(res, 280); });

  // ---------- Activation ----------
  const activate = () => { root.classList.remove('is-idle'); if (mode === 'orbit') controls.enabled = true; };
  const deactivate = () => { keys.clear(); if (mode === 'walk') return; root.classList.add('is-idle'); controls.enabled = false; };
  $('[data-viewer-activate]')?.addEventListener('click', activate);

  // ---------- Orbit: camera flights ----------
  let flight = null;
  function flyTo(name) {
    const v = VIEWS[name]; if (!v) return;
    flight = { p0: camera.position.clone(), p1: viewPos(v), t0: controls.target.clone(), t1: new THREE.Vector3(...v.target), t: 0, d: reduceMotion ? 0.001 : 1.8 };
  }
  controls.addEventListener('start', () => { flight = null; if (controls.autoRotate) setRotate(false); setPressed('[data-view]', null); });
  controls.addEventListener('change', () => (needsRender = true));
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => { setPressed('[data-view]', b); flyTo(b.dataset.view); if (controls.autoRotate) setRotate(false); }));

  $$('[data-time]').forEach((b) => b.addEventListener('click', () => {
    setPressed('[data-time]', b);
    world.setMode(b.dataset.time, reduceMotion ? 0 : 1.6);
    if (status) status.textContent = world.modeLabel(b.dataset.time);
  }));

  const rotateBtn = $('[data-toggle="rotate"]');
  function setRotate(on) { controls.autoRotate = on; rotateBtn?.setAttribute('aria-pressed', String(on)); }
  setRotate(controls.autoRotate);
  rotateBtn?.addEventListener('click', () => setRotate(!controls.autoRotate));

  const sectionBtn = $('[data-toggle="section"]');
  sectionBtn?.addEventListener('click', () => {
    const on = sectionBtn.getAttribute('aria-pressed') !== 'true';
    sectionBtn.setAttribute('aria-pressed', String(on));
    world.setSection(on);
    if (on) { flyTo('aerial'); setPressed('[data-view]', $('[data-view="aerial"]')); }
    needsRender = true;
  });

  $$('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    if (mode === 'walk') { camera.fov = THREE.MathUtils.clamp(camera.fov + (b.dataset.zoom === 'in' ? -8 : 8), 30, 80); camera.updateProjectionMatrix(); needsRender = true; return; }
    const off = camera.position.clone().sub(controls.target);
    const len = THREE.MathUtils.clamp(off.length() * (b.dataset.zoom === 'in' ? 0.78 : 1.28), controls.minDistance, controls.maxDistance);
    flight = { p0: camera.position.clone(), p1: controls.target.clone().add(off.setLength(len)), t0: controls.target.clone(), t1: controls.target.clone(), t: 0, d: reduceMotion ? 0.001 : 0.6 };
  }));

  const fsBtn = $('[data-fullscreen]');
  if (!document.fullscreenEnabled) fsBtn?.setAttribute('hidden', '');
  fsBtn?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.().then(activate).catch(() => {});
  });

  // ---------- Walk mode ----------
  let mode = 'orbit';
  const W = { zone: null, yaw: 0, pitch: 0, pos: new THREE.Vector3(), glide: null, turn: null };
  const keys = new Set();
  const RADIUS = 0.28, SPEED = 1.7, TURN = 1.6;
  const orbitFov = camera.fov, walkFov = small ? 70 : 62;
  const savedOrbit = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  const blocked = (zone, x, z) => {
    const b = zone.bounds;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return true;
    return zone.obstacles.some((o) => x > o.x0 - RADIUS && x < o.x1 + RADIUS && z > o.z0 - RADIUS && z < o.z1 + RADIUS);
  };
  const applyWalkCamera = () => {
    camera.position.set(W.pos.x, W.zone.y + walk.eye, W.pos.z);
    camera.rotation.set(W.pitch, W.yaw, 0);
    needsRender = true;
  };

  async function goSpot(name, { instant = false } = {}) {
    const s = walk.spots[name]; if (!s) return;
    const sameZone = W.zone === walk.zones[s.zone];
    setPressed('[data-spot]', $(`[data-spot="${name}"]`));
    if (sameZone && !instant) {
      W.glide = { p0: W.pos.clone(), p1: new THREE.Vector3(s.x, 0, s.z), y0: W.yaw, y1: s.yaw, pi0: W.pitch, pi1: s.pitch, t: 0, d: reduceMotion ? 0.001 : 1.2 };
      return;
    }
    if (!instant) await fadeTo(true);
    W.zone = walk.zones[s.zone];
    W.pos.set(s.x, 0, s.z); W.yaw = s.yaw; W.pitch = s.pitch; W.glide = null;
    world.setUpperVisible(true);
    applyWalkCamera();
    if (!instant) { renderNow(); await fadeTo(false); }
  }

  async function enterWalk(spot = 'living') {
    if (customModel || mode === 'walk') { if (mode === 'walk') goSpot(spot); return; }
    savedOrbit.pos.copy(camera.position); savedOrbit.target.copy(controls.target);
    flight = null; setRotate(false);
    if (sectionBtn?.getAttribute('aria-pressed') === 'true') sectionBtn.click();
    await fadeTo(true);
    mode = 'walk';
    controls.enabled = false;
    root.classList.add('is-walk'); root.classList.remove('is-idle');
    camera.fov = walkFov; camera.near = 0.05; camera.updateProjectionMatrix();
    W.zone = null;
    await goSpot(spot, { instant: true });
    renderNow();
    await fadeTo(false);
    $('[data-walk-exit]')?.focus({ preventScroll: true });
  }

  async function exitWalk() {
    if (mode !== 'walk') return;
    await fadeTo(true);
    mode = 'orbit'; keys.clear(); W.glide = null;
    root.classList.remove('is-walk');
    camera.fov = orbitFov; camera.near = 0.08; camera.updateProjectionMatrix();
    camera.position.copy(savedOrbit.pos); controls.target.copy(savedOrbit.target);
    controls.enabled = true; controls.update();
    renderNow();
    await fadeTo(false);
  }

  $$('[data-walk-enter]').forEach((b) => b.addEventListener('click', () => enterWalk(b.dataset.walkEnter || 'living')));
  $('[data-walk-exit]')?.addEventListener('click', exitWalk);
  $$('[data-spot]').forEach((b) => b.addEventListener('click', () => goSpot(b.dataset.spot)));
  root.addEventListener('ivz:walk', () => { activate(); enterWalk('living'); });

  // Look (drag) + click-to-walk
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'walk') return;
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    W.glide = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'walk' || !drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
    const k = e.pointerType === 'touch' ? 0.006 : 0.0042;
    W.yaw += dx * k; W.pitch = THREE.MathUtils.clamp(W.pitch + dy * k, -1.2, 1.2);
    applyWalkCamera();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (mode !== 'walk' || !drag) return;
    const wasClick = drag.moved < 6; drag = null;
    if (!wasClick) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(world.floors.filter((f) => walk.zones[f.userData.zone] === W.zone), false)[0];
    if (!hit || hit.distance > 14) return;
    const p = hit.point;
    // Walk toward the point, stopping before obstacles.
    const target = new THREE.Vector3(p.x, 0, p.z);
    if (blocked(W.zone, target.x, target.z)) {
      const dir = target.clone().sub(W.pos); const len = dir.length(); dir.normalize();
      let d = len; while (d > 0 && blocked(W.zone, W.pos.x + dir.x * d, W.pos.z + dir.z * d)) d -= 0.1;
      if (d <= 0.2) return;
      target.set(W.pos.x + dir.x * d, 0, W.pos.z + dir.z * d);
    }
    W.glide = { p0: W.pos.clone(), p1: target, y0: W.yaw, y1: W.yaw, pi0: W.pitch, pi1: W.pitch, t: 0, d: reduceMotion ? 0.001 : Math.min(2.2, 0.35 + W.pos.distanceTo(target) / 2.6) };
    setPressed('[data-spot]', null);
  });
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'walk') return;
    e.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + Math.sign(e.deltaY) * 3, 30, 80);
    camera.updateProjectionMatrix(); needsRender = true;
  }, { passive: false });

  // Keyboard
  const KEYMAP = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'strafeL', KeyD: 'strafeR', ArrowLeft: 'left', ArrowRight: 'right', KeyQ: 'left', KeyE: 'right' };
  addEventListener('keydown', (e) => {
    if (mode !== 'walk' || !visible || e.target.closest?.('input, textarea, select')) return;
    if (e.code === 'Escape' && !document.fullscreenElement) { exitWalk(); return; }
    const k = KEYMAP[e.code]; if (!k) return;
    e.preventDefault(); keys.add(k); W.glide = null;
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());

  // Touch / mouse pad
  $$('[data-move]').forEach((b) => {
    const k = b.dataset.move;
    const on = (e) => { e.preventDefault(); keys.add(k); W.glide = null; b.setPointerCapture?.(e.pointerId); };
    const off = () => keys.delete(k);
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  });

  function stepWalk(dt) {
    let moved = false;
    if (W.glide) {
      const g = W.glide; g.t = Math.min(1, g.t + dt / g.d); const e = ease(g.t);
      W.pos.lerpVectors(g.p0, g.p1, e);
      W.yaw = angleLerp(g.y0, g.y1, e); W.pitch = g.pi0 + (g.pi1 - g.pi0) * e;
      if (g.t >= 1) W.glide = null;
      moved = true;
    }
    if (keys.size) {
      if (keys.has('left')) W.yaw += TURN * dt;
      if (keys.has('right')) W.yaw -= TURN * dt;
      const f = (keys.has('fwd') ? 1 : 0) - (keys.has('back') ? 1 : 0);
      const s = (keys.has('strafeR') ? 1 : 0) - (keys.has('strafeL') ? 1 : 0);
      if (f || s) {
        const sin = Math.sin(W.yaw), cos = Math.cos(W.yaw);
        const dx = (-sin * f + cos * s) * SPEED * dt, dz = (-cos * f - sin * s) * SPEED * dt;
        if (!blocked(W.zone, W.pos.x + dx, W.pos.z)) W.pos.x += dx;
        if (!blocked(W.zone, W.pos.x, W.pos.z + dz)) W.pos.z += dz;
      }
      moved = true;
    }
    if (moved) applyWalkCamera();
    return moved;
  }

  // ---------- Render loop (only while visible) ----------
  let visible = false, raf = 0, last = performance.now(), idleFrames = 0;
  const renderNow = () => { bloom.strength = world.bloomRef.strength; composer.render(); };
  const clock = () => {
    raf = requestAnimationFrame(clock);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    let moving = world.update(dt);
    if (mode === 'orbit') {
      if (flight) {
        flight.t = Math.min(1, flight.t + dt / flight.d);
        const e = ease(flight.t);
        camera.position.lerpVectors(flight.p0, flight.p1, e);
        controls.target.lerpVectors(flight.t0, flight.t1, e);
        if (flight.t >= 1) flight = null;
        moving = true;
      }
      controls.update(dt);
      if (controls.autoRotate) moving = true;
    } else if (stepWalk(dt)) moving = true;
    // Keep the pool shimmering gently while on screen, at a lower frame rate when idle.
    idleFrames++;
    if (moving || needsRender || idleFrames % 4 === 0) { renderNow(); needsRender = false; }
  };
  const setRunning = (on) => {
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(clock); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver((en) => {
    visible = en.some((e) => e.isIntersecting);
    setRunning(visible && !document.hidden);
    if (!visible && !document.fullscreenElement) deactivate();
  }, { threshold: 0.05 }).observe(root);
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); setRunning(false);
    fallback('The 3D view was paused by your browser to save memory. Reload the page to explore again.');
  });

  renderNow();
  root.classList.add('is-ready');
  if (root.dataset.autostart === 'walk') { delete root.dataset.autostart; activate(); enterWalk('living'); }
}
