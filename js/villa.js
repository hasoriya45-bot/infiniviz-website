/**
 * Concept villa for the interactive viewer: a fully furnished, walkable model.
 * Physical sky (also used for reflections), procedural PBR textures, soft shadows,
 * three times of day, a section cut and walk-through zones.
 * This is a demo model built in code, not client work.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* Times of day                                                        */
/* ------------------------------------------------------------------ */
// elev/azim: sun in the sky (degrees). lightElev/lightAzim: the directional light (moon at night).
const MODES = {
  day: {
    label: 'Daylight', elev: 52, azim: 32, lightElev: 52, lightAzim: 32,
    turbidity: 2.5, rayleigh: 0.8, mie: 0.004, mieG: 0.8,
    sunColor: '#fff5e8', sunI: 3.4, hemiSky: '#cfe0f0', hemiGround: '#6b6253', hemiI: 0.55,
    fog: '#cdd8e2', glow: 0, pool: 0, exposure: 0.5, bloom: 0.12, stars: 0, interior: 0.35,
  },
  golden: {
    label: 'Golden hour', elev: 3.5, azim: -78, lightElev: 9, lightAzim: -62,
    turbidity: 9, rayleigh: 3, mie: 0.008, mieG: 0.92,
    sunColor: '#ffae6e', sunI: 3.2, hemiSky: '#f2c3a0', hemiGround: '#3a302b', hemiI: 0.32,
    fog: '#b08a73', glow: 0.75, pool: 0.12, exposure: 0.58, bloom: 0.28, stars: 0, interior: 0.75,
  },
  night: {
    label: 'Night', elev: -5, azim: -60, lightElev: 48, lightAzim: 120,
    turbidity: 9, rayleigh: 3, mie: 0.005, mieG: 0.9,
    sunColor: '#9db2e6', sunI: 0.3, hemiSky: '#273451', hemiGround: '#090909', hemiI: 0.16,
    fog: '#0b111c', glow: 2.2, pool: 1, exposure: 0.95, bloom: 0.62, stars: 1, interior: 1,
  },
};
const COLOR_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'fog'];
const NUM_KEYS = ['elev', 'azim', 'lightElev', 'lightAzim', 'turbidity', 'rayleigh', 'mie', 'mieG', 'sunI', 'hemiI', 'glow', 'pool', 'exposure', 'bloom', 'stars', 'interior'];

const toState = (m) => {
  const s = {};
  COLOR_KEYS.forEach((k) => (s[k] = new THREE.Color(m[k])));
  NUM_KEYS.forEach((k) => (s[k] = m[k]));
  return s;
};
const dirFrom = (elevDeg, azimDeg, target = new THREE.Vector3()) =>
  target.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevDeg), THREE.MathUtils.degToRad(azimDeg));

/* ------------------------------------------------------------------ */
/* Procedural textures                                                 */
/* ------------------------------------------------------------------ */
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, Math.max(0, c.r * (1 + amt))); c.g = Math.min(1, Math.max(0, c.g * (1 + amt))); c.b = Math.min(1, Math.max(0, c.b * (1 + amt)));
  return '#' + c.getHexString();
}

function makeTextures(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (size, draw, srgb = true) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const speckle = (g, s, r, n, col, a0, a1, sz = 2) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = col; g.globalAlpha = a0 + r() * (a1 - a0);
      const w = 0.6 + r() * sz; g.fillRect(r() * s, r() * s, w, w);
    }
    g.globalAlpha = 1;
  };
  const blotch = (g, s, r, n, col, a) => {
    for (let i = 0; i < n; i++) {
      const x = r() * s, y = r() * s, rad = s * (0.05 + r() * 0.18);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0));
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  };
  const planks = (g, s, r, rows, base, vary, grainA = 0.08) => {
    const h = s / rows;
    for (let i = 0; i < rows; i++) {
      g.fillStyle = shade(base, (r() - 0.5) * vary); g.fillRect(0, i * h, s, h);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(45,25,12,${grainA * (0.4 + r())})`; g.lineWidth = 0.5 + r() * 1.3;
        const y0 = i * h + r() * h, ph = r() * 6, amp = r() * h * 0.12;
        g.beginPath(); g.moveTo(0, y0);
        for (let x = 0; x <= s; x += s / 16) g.lineTo(x, y0 + Math.sin(x / s * Math.PI * 4 + ph) * amp);
        g.stroke();
      }
      g.fillStyle = 'rgba(20,10,5,0.45)'; g.fillRect(0, i * h, s, 1.5);
      g.fillRect(Math.floor(r() * s), i * h, 1.5, h);
    }
  };
  const tiles = (g, s, r, n, base, vary, grout) => {
    const t = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = shade(base, (r() - 0.5) * vary); g.fillRect(x * t, y * t, t, t);
    }
    speckle(g, s, r, s * 8, '#5a4f42', 0.03, 0.1, 2.5);
    blotch(g, s, r, 18, 'rgba(255,250,240,A)', 0.07);
    g.fillStyle = grout;
    for (let i = 0; i <= n; i++) { g.fillRect(i * t - 1, 0, 2, s); g.fillRect(0, i * t - 1, s, 2); }
  };

  const T = {};
  // Board-formed concrete: panels, tie holes, mottling.
  T.concrete = tex(512, (g, s) => {
    const r = rng(11);
    g.fillStyle = '#cdc6ba'; g.fillRect(0, 0, s, s);
    blotch(g, s, r, 40, 'rgba(120,112,100,A)', 0.07);
    blotch(g, s, r, 30, 'rgba(250,246,238,A)', 0.08);
    speckle(g, s, r, 5000, '#6f675c', 0.05, 0.16);
    speckle(g, s, r, 2500, '#ffffff', 0.04, 0.12);
    g.fillStyle = 'rgba(80,72,62,0.22)'; g.fillRect(0, s / 2 - 1, s, 2); g.fillRect(s / 2 - 1, 0, 2, s);
    g.fillRect(0, 0, s, 1); g.fillRect(0, 0, 1, s);
    g.fillStyle = 'rgba(60,54,46,0.55)';
    [0.25, 0.75].forEach((u) => [0.25, 0.75].forEach((v) => { g.beginPath(); g.arc(u * s, v * s, 3.2, 0, 7); g.fill(); }));
  });
  T.plaster = tex(256, (g, s) => {
    const r = rng(3);
    g.fillStyle = '#efe9df'; g.fillRect(0, 0, s, s);
    blotch(g, s, r, 20, 'rgba(200,190,175,A)', 0.06);
    speckle(g, s, r, 2500, '#9b917f', 0.02, 0.07);
  });
  T.timber = tex(512, (g, s) => planks(g, s, rng(5), 6, '#7b4d30', 0.3, 0.12));
  T.deck = tex(512, (g, s) => planks(g, s, rng(8), 8, '#8d6444', 0.25, 0.1));
  T.oak = tex(512, (g, s) => planks(g, s, rng(21), 12, '#b8916a', 0.16, 0.07));
  T.paving = tex(512, (g, s) => tiles(g, s, rng(9), 4, '#b9b0a2', 0.12, 'rgba(70,62,52,0.55)'));
  T.travertine = tex(512, (g, s) => tiles(g, s, rng(13), 4, '#ddd3c3', 0.06, 'rgba(150,138,120,0.5)'));
  T.stoneDark = tex(512, (g, s) => {
    const r = rng(17);
    g.fillStyle = '#3a3733'; g.fillRect(0, 0, s, s);
    const rows = 10, h = s / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 120;
      while (x < s) { const w = 80 + r() * 160; g.fillStyle = shade('#3a3733', (r() - 0.5) * 0.5); g.fillRect(x, i * h + 1, w - 2, h - 2); x += w; }
    }
    speckle(g, s, r, 3000, '#000000', 0.05, 0.2);
  });
  T.grass = tex(512, (g, s) => {
    const r = rng(19);
    g.fillStyle = '#4b5a34'; g.fillRect(0, 0, s, s);
    blotch(g, s, r, 30, 'rgba(90,100,50,A)', 0.25);
    blotch(g, s, r, 30, 'rgba(40,52,28,A)', 0.25);
    const greens = ['#5f7040', '#3e4c2a', '#6b7a45', '#55663a', '#7a8550'];
    for (let i = 0; i < 14000; i++) {
      g.strokeStyle = greens[(r() * greens.length) | 0]; g.globalAlpha = 0.35 + r() * 0.4; g.lineWidth = 1;
      const x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4); g.stroke();
    }
    g.globalAlpha = 1;
  });
  T.fabric = tex(256, (g, s) => {
    const r = rng(23);
    g.fillStyle = '#d6cdbd'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { g.fillStyle = `rgba(90,80,65,${0.04 + r() * 0.05})`; g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); }
  });
  T.rug = tex(512, (g, s) => {
    g.fillStyle = '#b7aa95'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(70,60,50,0.35)'; g.lineWidth = 3;
    for (let i = 0; i < 9; i++) { g.beginPath(); for (let x = 0; x <= s; x += 8) g.lineTo(x, i * s / 9 + Math.sin(x / s * Math.PI * 2 + i) * 18); g.stroke(); }
    speckle(g, s, rng(29), 6000, '#ffffff', 0.03, 0.1);
  });
  T.art = tex(512, (g, s) => {
    g.fillStyle = '#e7dcc8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#b5643c'; g.beginPath(); g.arc(s * 0.38, s * 0.55, s * 0.28, 0, 7); g.fill();
    g.fillStyle = '#1f1d1b'; g.fillRect(s * 0.55, s * 0.18, s * 0.12, s * 0.66);
    g.fillStyle = '#d2a44f'; g.fillRect(s * 0.18, s * 0.16, s * 0.3, s * 0.06);
    g.strokeStyle = '#2b2926'; g.lineWidth = 4; g.beginPath(); g.arc(s * 0.7, s * 0.7, s * 0.18, Math.PI, Math.PI * 1.9); g.stroke();
  });
  // Tileable ripple normal map for the pool.
  T.waterNormal = tex(256, (g, s) => {
    const img = g.createImageData(s, s), d = img.data, TAU = Math.PI * 2;
    const waves = [[3, 1, 0.5], [1, 4, 0.35], [5, -2, 0.25], [-4, 3, 0.2], [7, 5, 0.12]];
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      let dx = 0, dy = 0;
      for (const [kx, ky, a] of waves) { const ph = TAU * (kx * x + ky * y) / s; dx += a * kx * Math.cos(ph); dy += a * ky * Math.cos(ph); }
      const nx = -dx * 0.06, ny = -dy * 0.06, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * s + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  return T;
}

/** Planar UVs in world metres so every surface has the same texel density. */
function worldUV(geo, size, ox = 0, oy = 0, oz = 0) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i) + ox, y = p.getY(i) + oy, z = p.getZ(i) + oz;
    if (ax >= ay && ax >= az) uv.setXY(i, z / size, y / size);
    else if (ay >= az) uv.setXY(i, x / size, z / size);
    else uv.setXY(i, x / size, y / size);
  }
  uv.needsUpdate = true;
  return geo;
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */
export function createVillaWorld({ renderer, shadowSize = 2048, mode = 'golden' }) {
  const scene = new THREE.Scene();
  const T = makeTextures(renderer);
  const litMats = [];
  const mat = (o, texSize) => {
    const m = new THREE.MeshStandardMaterial(o);
    m.userData.texSize = texSize; litMats.push(m); return m;
  };

  // ---------- Materials ----------
  const M = {
    concrete: mat({ map: T.concrete, roughness: 0.86 }, 2.4),
    plaster: mat({ map: T.plaster, roughness: 0.94 }, 2),
    timber: mat({ map: T.timber, roughness: 0.62 }, 1.8),
    deck: mat({ map: T.deck, roughness: 0.72 }, 2.4),
    oak: mat({ map: T.oak, roughness: 0.48 }, 2.4),
    paving: mat({ map: T.paving, roughness: 0.82 }, 3),
    travertine: mat({ map: T.travertine, roughness: 0.32 }, 3.2),
    stoneDark: mat({ map: T.stoneDark, roughness: 0.7 }, 2.2),
    grass: mat({ map: T.grass, roughness: 1 }, 5),
    field: mat({ map: T.grass, color: '#8c8f7a', roughness: 1 }, 7),
    fabric: mat({ map: T.fabric, roughness: 1 }, 0.8),
    fabricDark: mat({ map: T.fabric, color: '#6c655b', roughness: 1 }, 0.8),
    fabricRust: mat({ map: T.fabric, color: '#b9876a', roughness: 1 }, 0.8),
    linen: mat({ color: '#f1ece3', roughness: 0.95 }),
    rug: mat({ map: T.rug, roughness: 1 }),
    art: mat({ map: T.art, roughness: 0.9 }),
    frame: mat({ color: '#1d1c1a', roughness: 0.38, metalness: 0.7 }),
    brass: mat({ color: '#b08a4a', roughness: 0.3, metalness: 1 }),
    island: mat({ color: '#2a2927', roughness: 0.25, metalness: 0.1 }),
    counter: mat({ color: '#e8e3da', roughness: 0.18 }),
    cabinet: mat({ color: '#d8cfc1', roughness: 0.55 }),
    trunk: mat({ color: '#3d2e23', roughness: 1 }),
    leafA: mat({ color: '#4a5c37', roughness: 0.85, flatShading: true }),
    leafB: mat({ color: '#5d6d40', roughness: 0.85, flatShading: true }),
    leafC: mat({ color: '#38492e', roughness: 0.85, flatShading: true }),
    hedge: mat({ color: '#3f5030', roughness: 0.95 }),
    pot: mat({ color: '#8a7c6b', roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#a9bcc6', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false }),
    water: new THREE.MeshPhysicalMaterial({ color: '#2d8197', roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, normalMap: T.waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), emissive: '#0d7d96', emissiveIntensity: 0 }),
    glowWarm: new THREE.MeshStandardMaterial({ color: '#2a2420', emissive: '#ffd29c', emissiveIntensity: 1, roughness: 1 }),
    fire: new THREE.MeshStandardMaterial({ color: '#1a0c05', emissive: '#ff8a3c', emissiveIntensity: 3 }),
    bollard: new THREE.MeshStandardMaterial({ color: '#1c1c1c', emissive: '#ffd9a8', emissiveIntensity: 1, roughness: 0.5 }),
  };
  T.waterNormal.repeat.set(2, 0.6);

  // ---------- Sky ----------
  const sky = new Sky();
  sky.scale.setScalar(2500);
  scene.add(sky);
  const skyU = sky.material.uniforms;
  const envScene = new THREE.Scene();
  const envSky = new Sky(); envSky.material = sky.material; envSky.scale.setScalar(50); envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function updateEnv() {
    const next = pmrem.fromScene(envScene, 0, 0.1, 200);
    scene.environment = next.texture;
    envRT?.dispose(); envRT = next;
  }
  scene.fog = new THREE.Fog('#b08a73', 90, 420);

  // Stars for night
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(900 * 3), sr = rng(31);
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3().setFromSphericalCoords(1200, Math.acos(sr() * 0.92), sr() * Math.PI * 2);
    starPos.set([v.x, Math.abs(v.y) + 40, v.z], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#dfe6ff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new THREE.Points(starGeo, starMat));

  // ---------- Lights ----------
  const hemi = new THREE.HemisphereLight('#fff', '#444', 0.5);
  const sun = new THREE.DirectionalLight('#fff', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 200 });
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  sun.target.position.set(0, 0, 1);
  scene.add(hemi, sun, sun.target);

  // ---------- Geometry helpers ----------
  const box = (w, h, d, m, x, y, z, parent, { cast = true, receive = true, ry = 0 } = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (m.userData?.texSize) worldUV(geo, m.userData.texSize, ry ? 0 : x, y, ry ? 0 : z);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = cast; mesh.receiveShadow = receive;
    parent.add(mesh); return mesh;
  };
  const cyl = (rt, rb, h, m, x, y, z, parent, seg = 20, cast = true) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const plane = (w, d, m, x, y, z, parent, texSize = m.userData?.texSize) => {
    const geo = new THREE.PlaneGeometry(w, d);
    if (texSize) worldUV(geo, texSize, x, -z, 0);
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const glassPane = (w, h, x, y, z, ry, parent) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass);
    mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.renderOrder = 2; parent.add(mesh); return mesh;
  };

  const building = new THREE.Group(); building.name = 'building';
  const upper = new THREE.Group(); upper.name = 'upper';
  scene.add(building); building.add(upper);
  const floors = []; // walkable surfaces for click-to-move
  const lights = []; // interior lights scaled with time of day

  // ---------- Site ----------
  const ground = new THREE.Mesh(worldUV(new THREE.CircleGeometry(300, 64), 7), M.field);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const lawn = new THREE.Mesh(worldUV(new THREE.CircleGeometry(46, 64), 5), M.grass);
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.012; lawn.receiveShadow = true; scene.add(lawn);

  const PT = 0.45; // plinth top
  box(30, PT, 20, M.paving, 0, PT / 2, 2, building);
  [0, 1, 2].forEach((n) => box(3.2, 0.15, 0.42, M.paving, -11, PT - 0.15 * (n + 1) + 0.075, 12.2 + 0.42 * n, building));
  box(0.45, 2.8, 12, M.concrete, -14.2, PT + 1.4, 0, building); // landscape wall

  // ---------- Lower volume (x -10..6, z -5..4) ----------
  const LH = 3.3, LY = PT + LH / 2, CEIL = PT + LH;
  box(16, LH, 0.3, M.plaster, -2, LY, -4.85, building);
  box(0.3, LH, 9, M.concrete, -9.85, LY, -0.5, building);
  box(0.3, LH, 4, M.concrete, 5.85, LY, -3, building);
  box(0.15, LH, 3.3, M.plaster, -3, LY, -3.05, building);
  const lowerRoof = box(16.8, 0.35, 10.4, M.concrete, -2, CEIL + 0.175, -0.3, building);
  glassPane(15.4, LH, -2, LY, 3.95, 0, building);
  for (let x = -9.7; x <= 5.71; x += 1.925) box(0.06, LH, 0.1, M.frame, x, LY, 3.95, building);
  box(15.6, 0.07, 0.12, M.frame, -2, PT + 0.035, 3.95, building);
  box(15.6, 0.07, 0.12, M.frame, -2, CEIL - 0.035, 3.95, building);
  glassPane(5, LH, 5.9, LY, 1.5, Math.PI / 2, building);
  box(0.1, LH, 0.1, M.frame, 5.9, LY, -1, building);
  const lowerFloor = plane(15.4, 8.6, M.travertine, -2, PT + 0.004, -0.35, building);
  lowerFloor.userData.zone = 'lower'; floors.push(lowerFloor);
  [-3.4, -0.6, 2.2].forEach((z) => box(14.6, 0.04, 0.1, M.glowWarm, -2, CEIL - 0.03, z, building, { cast: false }));

  // Living: fireplace wall, sofa, art, lamp, plant
  box(6.4, LH, 0.22, M.stoneDark, -6.35, LY, -4.59, building);
  box(2.6, 0.32, 0.06, M.fire, -6.35, PT + 0.75, -4.46, building, { cast: false });
  box(2.9, 0.06, 0.32, M.frame, -6.35, PT + 1.0, -4.4, building);
  box(3.3, 0.42, 0.98, M.fabric, -6.35, PT + 0.21, -0.85, building);
  box(3.3, 0.42, 0.22, M.fabric, -6.35, PT + 0.63, -0.45, building);
  box(0.22, 0.6, 0.98, M.fabric, -8.0, PT + 0.3, -0.85, building);
  box(0.22, 0.6, 0.98, M.fabric, -4.7, PT + 0.3, -0.85, building);
  [-7.3, -5.4].forEach((x) => box(0.55, 0.42, 0.14, M.fabricRust, x, PT + 0.62, -0.62, building, { ry: 0.12 }));
  box(1.5, 0.06, 0.85, M.oak, -6.35, PT + 0.36, -2.35, building);
  box(1.3, 0.33, 0.65, M.frame, -6.35, PT + 0.165, -2.35, building);
  plane(3.8, 2.8, M.rug, -6.35, PT + 0.008, -1.9, building, 0);
  box(0.9, 0.4, 0.85, M.fabricDark, -8.7, PT + 0.2, -2.5, building, { ry: 0.6 });
  box(0.9, 0.45, 0.18, M.fabricDark, -8.95, PT + 0.6, -2.85, building, { ry: 0.6 });
  cyl(0.018, 0.018, 1.55, M.brass, -9.2, PT + 0.78, -0.4, building, 8);
  cyl(0.2, 0.26, 0.32, M.glowWarm, -9.2, PT + 1.6, -0.4, building, 24, false);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.15), M.art);
  art.position.set(-9.64, PT + 1.7, 1.9); art.rotation.y = Math.PI / 2; building.add(art);
  box(0.04, 1.23, 1.78, M.frame, -9.69, PT + 1.7, 1.9, building, { cast: false });
  cyl(0.26, 0.2, 0.55, M.pot, -9.15, PT + 0.275, 3.35, building);
  const shrub = (x, y, z, s, parent) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    [[0, 0, 0, 1], [0.2, 0.25, 0.1, 0.75], [-0.18, 0.3, -0.12, 0.7]].forEach(([dx, dy, dz, k], i) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s * k, 1), [M.leafA, M.leafB, M.leafC][i]);
      m.position.set(dx * s, dy * s, dz * s); m.castShadow = true; g.add(m);
    });
    parent.add(g);
  };
  shrub(-9.15, PT + 1.0, 3.35, 0.45, building);

  // Kitchen: tall cabinetry, island, stools, pendants
  box(8.3, 0.88, 0.62, M.cabinet, 1.35, PT + 0.44, -4.39, building);              // base units
  box(8.4, 0.05, 0.68, M.counter, 1.35, PT + 0.905, -4.37, building);             // worktop
  box(8.3, 0.62, 0.03, M.stoneDark, 1.35, PT + 1.24, -4.68, building, { cast: false }); // splashback
  box(8.3, 0.9, 0.38, M.oak, 1.35, PT + 2.0, -4.5, building);                      // wall units
  box(8.3, 0.03, 0.3, M.glowWarm, 1.35, PT + 1.54, -4.52, building, { cast: false });   // under-cabinet light strip
  for (let x = -2.8 + 0.6; x < 5.5; x += 0.6) {
    box(0.012, 0.84, 0.01, M.frame, x, PT + 0.45, -4.075, building, { cast: false });
    box(0.012, 0.86, 0.01, M.frame, x, PT + 2.0, -4.305, building, { cast: false });
  }
  for (let x = -2.5; x < 5.5; x += 0.6) box(0.3, 0.015, 0.02, M.brass, x, PT + 0.8, -4.07, building, { cast: false });
  box(0.6, 0.6, 0.02, M.frame, 3.0, PT + 0.45, -4.07, building, { cast: false });     // oven
  cyl(0.012, 0.012, 0.35, M.brass, 0.6, PT + 1.1, -4.55, building, 8);               // tap
  box(3.2, 0.9, 1.0, M.island, 1.4, PT + 0.45, -2.0, building);
  box(3.35, 0.05, 1.1, M.counter, 1.4, PT + 0.925, -2.0, building);
  [0.5, 1.4, 2.3].forEach((x) => {
    cyl(0.2, 0.2, 0.05, M.fabricDark, x, PT + 0.68, -1.22, building, 20);
    cyl(0.02, 0.02, 0.66, M.frame, x, PT + 0.33, -1.22, building, 6);
    cyl(0.006, 0.006, 1.1, M.frame, x, CEIL - 0.55, -2.0, building, 4, false);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 12), M.glowWarm);
    bulb.position.set(x, CEIL - 1.15, -2.0); building.add(bulb);
  });

  // Dining
  box(2.5, 0.06, 1.05, M.oak, 1.6, PT + 0.75, 1.9, building);
  [[0.6, 1.5], [2.6, 1.5], [0.6, 2.3], [2.6, 2.3]].forEach(([x, z]) => box(0.06, 0.72, 0.06, M.frame, x, PT + 0.36, z, building));
  [0.85, 1.6, 2.35].forEach((x) => [1.05, 2.75].forEach((z) => {
    box(0.46, 0.06, 0.46, M.fabricRust, x, PT + 0.46, z, building);
    box(0.46, 0.46, 0.06, M.fabricRust, x, PT + 0.72, z + (z < 1.9 ? -0.21 : 0.21), building);
    box(0.4, 0.43, 0.4, M.frame, x, PT + 0.215, z, building, { cast: false });
  }));
  box(1.8, 0.035, 0.07, M.glowWarm, 1.6, PT + 2.25, 1.9, building, { cast: false });
  cyl(0.004, 0.004, 1.05, M.frame, 1.0, CEIL - 0.52, 1.9, building, 4, false);
  cyl(0.004, 0.004, 1.05, M.frame, 2.2, CEIL - 0.52, 1.9, building, 4, false);

  const addLight = (x, y, z, parent, k = 1) => { const l = new THREE.PointLight('#ffc48a', 0, 11, 2); l.position.set(x, y, z); l.userData.k = k; parent.add(l); lights.push(l); };
  addLight(-6.3, CEIL - 1.2, -1.6, building);
  addLight(1.4, CEIL - 1.2, -2.2, building);
  addLight(1.6, CEIL - 1.3, 1.9, building, 0.8);

  // ---------- Upper volume (x -6..12, z -4.5..3) — 6 m cantilever ----------
  const UB = CEIL + 0.35, UF = UB + 0.3, UH = 3.0, UY = UF + UH / 2, UCEIL = UF + UH;
  box(18, 0.3, 7.5, M.concrete, 3, UB + 0.15, -0.75, upper);
  box(18.6, 0.35, 8.1, M.concrete, 3, UCEIL + 0.175, -0.75, upper);
  box(18, UH, 0.3, M.plaster, 3, UY, -4.35, upper);
  box(0.3, UH, 7.5, M.timber, -5.85, UY, -0.75, upper);
  glassPane(17.6, UH, 3, UY, 2.85, 0, upper);
  glassPane(7.2, UH, 11.95, UY, -0.75, Math.PI / 2, upper);
  box(0.08, UH, 0.08, M.frame, 11.95, UY, 2.9, upper);
  const finCount = 36;
  const fins = new THREE.InstancedMesh(worldUV(new THREE.BoxGeometry(0.07, UH, 0.3), 1.8), M.timber, finCount);
  fins.castShadow = true; fins.receiveShadow = true;
  const mtx = new THREE.Matrix4();
  for (let n = 0; n < finCount; n++) { mtx.makeTranslation(-5.75 + n * 0.31, UY, 3.12); fins.setMatrixAt(n, mtx); }
  upper.add(fins);
  const upperFloor = plane(17.4, 7.0, M.oak, 3, UF + 0.004, -0.75, upper);
  upperFloor.userData.zone = 'upper'; floors.push(upperFloor);
  box(16.4, 0.04, 0.1, M.glowWarm, 3, UCEIL - 0.03, -1.0, upper, { cast: false });

  // Bedroom suite (x 5.5..12)
  box(0.15, UH, 4.4, M.plaster, 5.5, UY, -2.0, upper);
  box(2.6, 1.15, 0.12, M.fabricDark, 9, UF + 0.58, -4.12, upper);
  box(2.1, 0.32, 2.25, M.oak, 9, UF + 0.16, -2.95, upper);
  box(2.0, 0.22, 2.1, M.linen, 9, UF + 0.43, -2.95, upper);
  box(2.04, 0.06, 1.2, M.fabricRust, 9, UF + 0.56, -2.35, upper);
  [8.5, 9.5].forEach((x) => box(0.7, 0.16, 0.42, M.linen, x, UF + 0.62, -3.8, upper, { ry: 0.05 }));
  [7.45, 10.55].forEach((x) => {
    box(0.55, 0.45, 0.45, M.oak, x, UF + 0.225, -3.8, upper);
    cyl(0.13, 0.16, 0.26, M.glowWarm, x, UF + 0.6, -3.8, upper, 20, false);
  });
  plane(3.6, 3.0, M.rug, 9, UF + 0.008, -2.6, upper, 0);
  box(0.85, 0.42, 0.85, M.fabric, 10.9, UF + 0.21, 1.4, upper, { ry: -0.5 });
  box(0.85, 0.45, 0.16, M.fabric, 11.15, UF + 0.6, 1.75, upper, { ry: -0.5 });
  addLight(9, UCEIL - 1.1, -2.2, upper, 0.8);

  // Study / lounge (x -5.7..5.5)
  box(0.42, 2.5, 3.4, M.oak, -5.45, UF + 1.25, -2.0, upper);
  const bookCols = ['#7b4b34', '#2d3a4a', '#c9b48b', '#5a5e48', '#8f2f2a', '#d9d1c2'];
  for (let s = 0; s < 4; s++) for (let b = 0; b < 9; b++) {
    const h = 0.24 + ((s * 9 + b) % 5) * 0.03;
    box(0.26, h, 0.12, mat({ color: bookCols[(s * 3 + b) % bookCols.length], roughness: 0.8 }), -5.2, UF + 0.35 + s * 0.6 + h / 2, -3.4 + b * 0.32, upper, { cast: false });
  }
  box(1.8, 0.05, 0.8, M.oak, -3.2, UF + 0.74, -3.7, upper);
  [[-4.0, -4.0], [-2.4, -4.0], [-4.0, -3.4], [-2.4, -3.4]].forEach(([x, z]) => box(0.04, 0.72, 0.04, M.frame, x, UF + 0.36, z, upper));
  box(0.55, 0.06, 0.55, M.fabricDark, -3.2, UF + 0.48, -2.95, upper);
  box(0.55, 0.55, 0.06, M.fabricDark, -3.2, UF + 0.78, -2.7, upper);
  box(3.0, 0.42, 0.95, M.fabricDark, 1.4, UF + 0.21, -3.6, upper);
  box(3.0, 0.42, 0.22, M.fabricDark, 1.4, UF + 0.63, -3.98, upper);
  box(1.2, 0.3, 0.7, M.oak, 1.4, UF + 0.15, -2.4, upper);
  cyl(0.24, 0.18, 0.5, M.pot, 4.7, UF + 0.25, 2.1, upper);
  shrub(4.7, UF + 0.95, 2.1, 0.42, upper);
  addLight(-2, UCEIL - 1.1, -2.2, upper, 0.8);

  // ---------- Pool & terrace ----------
  box(14.4, 0.06, 4.4, M.frame, 4, PT + 0.03, 8, building, { cast: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), M.water);
  water.rotation.x = -Math.PI / 2; water.position.set(4, PT + 0.065, 8); water.receiveShadow = true; building.add(water);
  const poolLight = new THREE.PointLight('#56d4ea', 0, 14, 2); poolLight.position.set(4, PT + 0.6, 8); building.add(poolLight);
  const deck = box(10, 0.06, 6, M.deck, -9, PT + 0.03, 8, building);
  [2, 4.2].forEach((x) => { box(0.75, 0.28, 2, M.linen, x, PT + 0.14, 11.3, building); box(0.75, 0.5, 0.5, M.linen, x, PT + 0.4, 10.55, building); });
  box(1.2, 0.4, 1.2, M.concrete, -12.2, PT + 0.2, 6, building);
  shrub(-12.2, PT + 0.75, 6, 0.55, building);
  const terraceFloor = plane(29, 8.2, new THREE.MeshBasicMaterial({ visible: false }), 0, PT + 0.07, 8, scene, 0);
  terraceFloor.userData.zone = 'terrace'; floors.push(terraceFloor);

  // ---------- Bollards ----------
  const bollards = new THREE.Group();
  for (let x = -12; x <= 12; x += 4) cyl(0.08, 0.08, 0.7, M.bollard, x, 0.35, 13.6, bollards, 10);
  scene.add(bollards);

  // ---------- Landscape ----------
  const tr = rng(7);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 2);
  { // organic wobble — hashed by position so shared corners move together (no cracks)
    const p = canopyGeo.attributes.position;
    const hash = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.84 + hash(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(z * 1000) / 1000) * 0.3;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    canopyGeo.computeVertexNormals();
  }
  const leaves = [M.leafA, M.leafB, M.leafC];
  const tree = (x, z, s, h) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.22 * s, h, 8), M.trunk);
    trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(canopyGeo, leaves[(i + (x | 0)) % 3]);
      const k = s * (0.75 + tr() * 0.55);
      c.scale.set(k * 1.25, k * (1.05 + tr() * 0.35), k * 1.25);
      c.position.set((tr() - 0.5) * s * 1.6, h + s * 0.6 + tr() * s * 0.9, (tr() - 0.5) * s * 1.6);
      c.rotation.set(tr() * 6, tr() * 6, 0);
      c.castShadow = true; c.receiveShadow = true; g.add(c);
    }
    scene.add(g);
  };
  const cypress = (x, z, h) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.75, h, 10), M.leafC);
    m.position.set(x, h / 2, z); m.castShadow = true; scene.add(m);
  };
  [[-21, -11], [-19, 7], [19, -13], [23, 3], [-8, -16], [10, -17], [28, -5], [-28, -2], [18, 18], [-25, 16], [31, 12], [1, -21], [-34, -14], [36, -18]]
    .forEach(([x, z]) => tree(x, z, 1.4 + tr() * 1.0, 2.6 + tr() * 2.2));
  [[-16.5, -8], [-16.5, -4], [-16.5, 0], [16.8, 8], [16.8, 11]].forEach(([x, z]) => cypress(x, z, 5.5 + tr() * 1.5));
  box(26, 1.1, 1.2, M.hedge, 0, 0.55, -9.6, scene);
  box(1.2, 1.1, 12, M.hedge, 16.4, 0.55, -2, scene);

  // ---------- Walk-through data ----------
  const EYE = 1.62;
  const ob = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
  const walk = {
    eye: EYE,
    zones: {
      lower: {
        y: PT, bounds: ob(-9.45, 5.5, -4.45, 3.65),
        obstacles: [ob(-8.1, -4.6, -1.35, -0.33), ob(-7.1, -5.6, -2.8, -1.9), ob(-9.3, -8.1, -3.1, -1.9), ob(-0.25, 3.05, -2.55, -1.45),
          ob(0.35, 2.85, 0.75, 3.0), ob(-2.85, 5.5, -4.7, -4.05), ob(-3.1, -2.9, -4.85, -1.4), ob(-9.6, -3.15, -4.7, -4.45)],
      },
      upper: {
        y: UF, bounds: ob(-5.25, 11.6, -3.95, 2.5),
        obstacles: [ob(5.42, 5.58, -4.25, 0.2), ob(7.1, 10.9, -4.2, -1.8), ob(-5.7, -5.2, -3.7, -0.3), ob(-4.1, -2.3, -4.2, -2.6), ob(-0.1, 2.9, -4.2, -2.0), ob(10.3, 11.5, 0.9, 2.2), ob(4.4, 5.0, 1.8, 2.5)],
      },
      terrace: {
        y: PT, bounds: ob(-13.7, 14.6, 4.35, 11.9),
        obstacles: [ob(-3.25, 11.25, 5.75, 10.25), ob(1.5, 4.7, 10.2, 12.4), ob(-12.9, -11.5, 5.3, 6.7)],
      },
    },
    // yaw 0 looks toward -z (into the house from the front); positive yaw turns left.
    spots: {
      living:  { label: 'Living',   zone: 'lower',   x: -5.4, z: 2.9,  yaw: 0.28, pitch: -0.08 },
      kitchen: { label: 'Kitchen',  zone: 'lower',   x: 4.7,  z: 0.4,  yaw: 0.82, pitch: -0.14 },
      dining:  { label: 'Dining',   zone: 'lower',   x: -1.6, z: -0.6, yaw: -2.3, pitch: -0.06 },
      study:   { label: 'Study',    zone: 'upper',   x: 2.6,  z: 1.2,  yaw: 1.05, pitch: -0.08 },
      bedroom: { label: 'Bedroom',  zone: 'upper',   x: 9.8,  z: 1.9,  yaw: 0.25, pitch: -0.1 },
      terrace: { label: 'Terrace',  zone: 'terrace', x: -10.5, z: 11.2, yaw: -0.75, pitch: -0.04 },
    },
  };

  // ---------- Time of day ----------
  const state = toState(MODES[mode]);
  let tween = null, currentMode = mode, envTimer = 0;
  const sunDir = new THREE.Vector3(), lightDir = new THREE.Vector3();
  const bloomRef = { strength: state.bloom };

  function apply(s) {
    dirFrom(s.elev, s.azim, sunDir);
    skyU.sunPosition.value.copy(sunDir);
    skyU.turbidity.value = s.turbidity; skyU.rayleigh.value = s.rayleigh;
    skyU.mieCoefficient.value = s.mie; skyU.mieDirectionalG.value = s.mieG;
    dirFrom(s.lightElev, s.lightAzim, lightDir);
    sun.position.copy(lightDir).multiplyScalar(90).add(sun.target.position);
    sun.color.copy(s.sunColor); sun.intensity = s.sunI;
    hemi.color.copy(s.hemiSky); hemi.groundColor.copy(s.hemiGround); hemi.intensity = s.hemiI;
    scene.fog.color.copy(s.fog);
    M.glowWarm.emissiveIntensity = 0.25 + s.glow * 2.2;
    M.fire.emissiveIntensity = 1.2 + s.glow * 2.5;
    M.bollard.emissiveIntensity = s.glow * 2.4;
    lights.forEach((l) => (l.intensity = (s.interior * 4 + s.glow * 8) * l.userData.k));
    M.water.emissiveIntensity = s.pool * 0.85;
    poolLight.intensity = s.pool * 32;
    starMat.opacity = s.stars * 0.85;
    renderer.toneMappingExposure = s.exposure;
    bloomRef.strength = s.bloom;
  }
  apply(state);
  updateEnv();

  function setMode(name, duration = 1.4) {
    if (!MODES[name]) return;
    currentMode = name;
    const from = {};
    COLOR_KEYS.forEach((k) => (from[k] = state[k].clone()));
    NUM_KEYS.forEach((k) => (from[k] = state[k]));
    tween = { from, to: toState(MODES[name]), t: 0, d: Math.max(duration, 0.0001) };
  }

  let waterT = 0;
  function update(dt) {
    waterT += dt;
    T.waterNormal.offset.set(waterT * 0.012, waterT * 0.008);
    if (!tween) return false;
    tween.t = Math.min(1, tween.t + dt / tween.d);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    COLOR_KEYS.forEach((k) => state[k].copy(tween.from[k]).lerp(tween.to[k], e));
    NUM_KEYS.forEach((k) => (state[k] = tween.from[k] + (tween.to[k] - tween.from[k]) * e));
    apply(state);
    envTimer += dt;
    if (envTimer > 0.25 || tween.t >= 1) { updateEnv(); envTimer = 0; }
    if (tween.t >= 1) tween = null;
    return true;
  }

  function setSection(on) { upper.visible = !on; lowerRoof.visible = !on; }

  /** Swap the procedural building for a user-supplied glTF scene. */
  function useCustomModel(object) {
    building.visible = false; bollards.visible = false; floors.length = 0;
    const b = new THREE.Box3().setFromObject(object);
    const size = b.getSize(new THREE.Vector3());
    object.scale.setScalar(22 / Math.max(size.x, size.z, 0.001));
    b.setFromObject(object);
    const c = b.getCenter(new THREE.Vector3());
    object.position.x -= c.x; object.position.z -= c.z; object.position.y -= b.min.y;
    object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(object);
  }

  return {
    scene, setMode, update, setSection, useCustomModel, walk, floors, bloomRef,
    get mode() { return currentMode; },
    modeLabel: (n) => MODES[n]?.label ?? n,
    setUpperVisible: (v) => { upper.visible = v; },
  };
}
