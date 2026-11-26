/**
 * Gold point-field wave from the original INFINIVIZ site, now scoped to one
 * container (the contact section) and rendered only while it is on screen.
 */
import * as THREE from 'three';

export function initPointField(container) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch { return; }
  const canvas = renderer.domElement;
  container.appendChild(canvas);
  let ratio = Math.min(devicePixelRatio || 1, 1.35);
  renderer.setPixelRatio(ratio);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
  camera.position.set(0, 4.6, 8.2);
  camera.lookAt(0, -0.35, 0);

  const cols = 110, rows = 110, span = 15.5, pos = new Float32Array(cols * rows * 3);
  let n = 0;
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
    pos[n++] = (x / (cols - 1) - 0.5) * span; pos[n++] = 0; pos[n++] = (z / (rows - 1) - 0.5) * span;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const U = {
    uTime: { value: 0 }, uPixelRatio: { value: ratio },
    uMouseWorld: { value: new THREE.Vector3(99, 0, 99) }, uMouseRadius: { value: 2.55 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: `
      uniform float uTime; uniform float uPixelRatio; uniform vec3 uMouseWorld; uniform float uMouseRadius;
      varying float vHeight; varying float vHover; varying float vEdge;
      void main() {
        vec3 p = position;
        float wave = sin(p.x * 0.85 + uTime * 1.1) * cos(p.z * 0.78 + uTime * 0.82);
        wave += sin((p.x + p.z) * 0.52 - uTime * 0.72) * 0.42;
        wave += sin(length(p.xz) * 1.72 - uTime * 1.5) * 0.33;
        float d = length(p.xz - uMouseWorld.xz);
        float hover = 1.0 - smoothstep(0.0, uMouseRadius, d);
        float ripple = sin(d * 6.4 - uTime * 4.9) * 0.16 * hover;
        p.xz += normalize(p.xz - uMouseWorld.xz + vec2(0.0001)) * hover * 0.16;
        p.y = wave * 0.36 + hover * 0.62 + ripple;
        vHeight = p.y; vHover = hover;
        vEdge = 1.0 - smoothstep(5.7, 7.55, max(abs(position.x), abs(position.z)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 16.0 * (1.0 + hover * 0.55) * uPixelRatio / max(-mv.z, 0.35);
      }`,
    fragmentShader: `
      varying float vHeight; varying float vHover; varying float vEdge;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5)); if (d > 0.5) discard;
        float alphaDot = 1.0 - smoothstep(0.16, 0.5, d);
        float level = clamp((vHeight + 0.5) / 1.35, 0.0, 1.0);
        vec3 base = mix(vec3(0.30, 0.20, 0.07), vec3(0.78, 0.63, 0.31), level);
        vec3 glow = mix(vec3(0.86, 0.65, 0.25), vec3(1.0, 0.91, 0.62), pow(vHover, 1.5));
        vec3 color = mix(base, glow, clamp(vHover, 0.0, 0.95));
        gl_FragColor = vec4(color, alphaDot * vEdge * (0.22 + level * 0.18 + vHover * 0.38));
      }`,
  });
  scene.add(new THREE.Points(geo, mat));

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const target = new THREE.Vector3(99, 0, 99), mouse = new THREE.Vector3(99, 0, 99);

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    ratio = Math.min(devicePixelRatio || 1, 1.35);
    renderer.setPixelRatio(ratio); U.uPixelRatio.value = ratio;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const section = container.parentElement;
  section.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) target.copy(hit);
  }, { passive: true });
  section.addEventListener('pointerleave', () => target.set(99, 0, 99));

  let raf = 0, visible = false;
  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    U.uTime.value = t * 0.001;
    mouse.lerp(target, 0.12);
    U.uMouseWorld.value.copy(mouse);
    renderer.render(scene, camera);
  };
  const setRunning = (on) => {
    if (on && !raf) raf = requestAnimationFrame(tick);
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver((en) => { visible = en.some((e) => e.isIntersecting); setRunning(visible && !document.hidden); }).observe(container);
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setRunning(false); });
}
