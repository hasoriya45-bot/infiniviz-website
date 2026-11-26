/**
 * Section 04 fallback: shows the static drawing with the *actual* reason the 3D viewer could not start,
 * and records it on the element (data-reason / data-detail) for the self-test and diagnostics.
 */
const MESSAGES = {
  'no-webgl': '3D graphics (WebGL) are switched off or unsupported in this browser, so a drawing of the model is shown. In Chrome or Edge, turn on Settings › System › "Use graphics acceleration when available" and reload.',
  renderer: "This device's graphics driver would not start 3D (the WebGL context could not be created), so a drawing of the model is shown. Updating the browser or graphics driver usually fixes this.",
  load: 'The 3D viewer files could not be downloaded, so a drawing of the model is shown. Check the connection and reload the page.',
  init: 'The 3D viewer hit an error on this device, so a drawing of the model is shown.',
  lost: 'The 3D view was paused by your browser to save memory. Reload the page to explore again.',
};

export function webglSupport() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context immediately
    return true;
  } catch { return false; }
}

export function showViewerFallback(el, reason, detail = '') {
  if (!el) return;
  el.classList.add('is-fallback');
  el.dataset.status = 'error';
  el.dataset.reason = reason;
  if (detail) el.dataset.detail = String(detail).slice(0, 300);
  const p = el.querySelector('[data-fallback-msg]');
  if (p) p.textContent = (MESSAGES[reason] || MESSAGES.init) + (reason === 'init' && detail ? ` (${String(detail).slice(0, 140)})` : '');
  console.warn(`[INFINIVIZ] 3D viewer fallback: ${reason}${detail ? ' - ' + detail : ''}`);
}

/**
 * Create a WebGLRenderer on a context we pick ourselves (WebGL2, else WebGL1).
 * Letting three.js probe would log a console error on WebGL1-only devices even though it then succeeds.
 */
export function createRenderer(THREE, { antialias = false, alpha = false, powerPreference = 'high-performance' } = {}) {
  const canvas = document.createElement('canvas');
  const attrs = { antialias, alpha, powerPreference, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
  const context = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
  if (!context) throw new Error('WebGL context could not be created');
  return new THREE.WebGLRenderer({ canvas, context, antialias, alpha, powerPreference });
}

/** Distinguish "files could not be downloaded" from an error while starting. */
export function classifyLoadError(err) {
  const msg = String(err?.message || err || '');
  return /dynamically imported module|Failed to fetch|Importing a module script failed|error loading|NetworkError|Load failed/i.test(msg) ? 'load' : 'init';
}
