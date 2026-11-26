import { CONFIG } from './config.js';
import { PROJECTS, CATEGORIES, EXPERIENCES, imgSrc, imgSrcset } from './projects.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const page = document.body.dataset.page;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const canAnimate = !!(gsap && ScrollTrigger) && !reduceMotion;
let lenis = null;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const whatsappUrl = (text = CONFIG.whatsappMessage) =>
  CONFIG.whatsapp ? `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}` : '';

/* ---------------- Smooth scroll ---------------- */
function initSmoothScroll() {
  if (reduceMotion || typeof window.Lenis !== 'function') return;
  lenis = new window.Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  if (gsap && ScrollTrigger) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}

export function scrollToEl(el) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
  else el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    const target = url.hash === '#top' ? document.body : document.getElementById(url.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    closeMenu();
    if (a.hasAttribute('data-step-inside')) {
      const v = $('[data-viewer]');
      if (v?.classList.contains('is-ready')) v.dispatchEvent(new Event('ivz:walk'));
      else if (v) v.dataset.autostart = 'walk';
    }
    if (url.hash === '#top') { lenis ? lenis.scrollTo(0, { duration: 1.4 }) : scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }
    else scrollToEl(target);
    history.replaceState(null, '', url.hash === '#top' ? location.pathname + location.search : url.hash);
  });
  // Arriving on the home page with a hash from another page.
  if (location.hash && location.hash.length > 1) {
    const t = document.getElementById(location.hash.slice(1));
    if (t) setTimeout(() => t.scrollIntoView({ block: 'start' }), 60);
  }
}

/* ---------------- Header & menu ---------------- */
function initHeader() {
  const header = $('[data-header]');
  if (!header) return;
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    header.classList.toggle('is-scrolled', y > 40);
    const menuOpen = $('#mobile-menu')?.classList.contains('is-open');
    header.classList.toggle('is-hidden', !menuOpen && y > 600 && y > lastY + 4);
    if (y < lastY - 4 || y < 600) header.classList.remove('is-hidden');
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Active section highlight.
  const links = $$('.nav-list a[href^="#"]');
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) links.forEach((a) => a.classList.toggle('is-active', a === map.get(en.target.id)));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}

function closeMenu() {
  const menu = $('#mobile-menu'), btn = $('.nav-toggle');
  if (!menu || !menu.classList.contains('is-open')) return;
  menu.classList.remove('is-open');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Open menu');
  menu.inert = true;
  lenis?.start();
  document.body.style.overflow = '';
}

function initMenu() {
  const menu = $('#mobile-menu'), btn = $('.nav-toggle');
  if (!menu || !btn) return;
  menu.inert = true;
  btn.addEventListener('click', () => {
    if (menu.classList.contains('is-open')) return closeMenu();
    menu.classList.add('is-open');
    menu.inert = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close menu');
    $('[data-header]')?.classList.remove('is-hidden');
    lenis?.stop();
    document.body.style.overflow = 'hidden';
  });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  matchMedia('(min-width: 1101px)').addEventListener('change', (e) => e.matches && closeMenu());
  const foot = $('[data-menu-foot]');
  if (foot) {
    const parts = [];
    if (CONFIG.whatsapp) parts.push(`<a href="${whatsappUrl()}" target="_blank" rel="noopener">WhatsApp ↗</a>`);
    if (CONFIG.email) parts.push(`<a href="mailto:${escapeHtml(CONFIG.email)}">${escapeHtml(CONFIG.email)}</a>`);
    Object.entries(CONFIG.socials).forEach(([n, u]) => u && parts.push(`<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(n)} ↗</a>`));
    foot.innerHTML = parts.join('');
  }
}

/* ---------------- Hero slideshow ---------------- */
function initHero() {
  const wrap = $('[data-hero-slides]');
  if (!wrap) return;
  const slides = $$('.hero-slide', wrap);
  const dotsWrap = $('[data-hero-dots]');
  const caption = $('[data-hero-caption]');
  const SLIDE_MS = 7000;
  let i = 0, timer = null;
  dotsWrap.style.setProperty('--slide-ms', SLIDE_MS + 'ms');
  dotsWrap.innerHTML = slides.map((s, n) => `<button type="button" aria-label="Show image ${n + 1}: ${escapeHtml(s.dataset.caption)}"${n === 0 ? ' class="is-active" aria-current="true"' : ''}></button>`).join('');
  const dots = $$('button', dotsWrap);
  const go = (n) => {
    slides[i].classList.remove('is-active');
    dots[i].classList.remove('is-active'); dots[i].removeAttribute('aria-current');
    i = (n + slides.length) % slides.length;
    // Restart CSS animations.
    const img = $('img', slides[i]); img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    slides[i].classList.add('is-active');
    void dots[i].offsetWidth; dots[i].classList.add('is-active'); dots[i].setAttribute('aria-current', 'true');
    if (caption) caption.textContent = slides[i].dataset.caption;
  };
  const start = () => { if (reduceMotion) return; clearInterval(timer); timer = setInterval(() => go(i + 1), SLIDE_MS); };
  dots.forEach((d, n) => d.addEventListener('click', () => { go(n); start(); }));
  document.addEventListener('visibilitychange', () => (document.hidden ? clearInterval(timer) : start()));
  start();
}

/* ---------------- Projects gallery (home) ---------------- */
/**
 * Editorial rhythm on a 12-column grid: rows of [wide 7 + mid 5], [three thirds], [mid 5 + wide 7].
 * The tail is adjusted so a row is never left half empty.
 */
export function layoutClasses(count) {
  const rows = [['is-wide', 'is-mid'], ['', '', ''], ['is-mid', 'is-wide']];
  const out = [];
  let r = 0;
  while (out.length < count) {
    const left = count - out.length;
    let row = rows[r % rows.length];
    if (left < row.length) row = left === 1 ? ['is-full'] : ['is-wide', 'is-mid'];
    out.push(...row);
    r++;
  }
  return out;
}

export function projectCard(p, cls = '', { eager = false } = {}) {
  const sizes = cls === 'is-full' ? '100vw' : cls === 'is-wide' ? '(max-width: 700px) 100vw, 58vw' : cls === 'is-mid' ? '(max-width: 700px) 100vw, 42vw' : '(max-width: 700px) 100vw, (max-width: 900px) 50vw, 33vw';
  return `
    <article class="project-card ${cls}">
      <a class="project-link" href="project.html?p=${encodeURIComponent(p.slug)}" aria-label="${escapeHtml(p.title)}: ${escapeHtml(p.type)}">
        <div class="project-media">
          <img src="${imgSrc(p, 800)}" srcset="${imgSrcset(p)}" sizes="${sizes}" alt="${escapeHtml(p.alt)}" width="${p.w}" height="${p.h}" ${eager ? '' : 'loading="lazy"'} decoding="async">
          <span class="view" aria-hidden="true">View project <span>→</span></span>
        </div>
        <div class="project-meta">
          <div>
            <span class="project-type">${escapeHtml(p.type)}</span>
            <h3 class="h3">${escapeHtml(p.title)}</h3>
            <p>${escapeHtml(p.summary)}</p>
          </div>
          <span class="project-index">${String(PROJECTS.indexOf(p) + 1).padStart(2, '0')}</span>
        </div>
      </a>
    </article>`;
}

function initProjects() {
  const grid = $('[data-projects]'), filtersEl = $('[data-filters]');
  if (!grid || !filtersEl) return;
  const count = (id) => (id === 'all' ? PROJECTS.length : PROJECTS.filter((p) => p.categories.includes(id)).length);
  filtersEl.innerHTML = CATEGORIES.map((c, n) =>
    `<button class="filter" type="button" data-filter="${c.id}" aria-pressed="${n === 0}">${escapeHtml(c.label)} <sup>${String(count(c.id)).padStart(2, '0')}</sup></button>`
  ).join('') + `<span class="filter-count" data-filter-count aria-live="polite"></span>`;
  const countEl = $('[data-filter-count]', filtersEl);

  const render = (id) => {
    const list = id === 'all' ? PROJECTS : PROJECTS.filter((p) => p.categories.includes(id));
    const classes = layoutClasses(list.length);
    grid.innerHTML = list.map((p, n) => projectCard(p, classes[n], { eager: n < 2 })).join('');
    countEl.textContent = `${String(list.length).padStart(2, '0')} projects`;
    initCursorTargets(grid);
  };
  render('all');

  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn || btn.getAttribute('aria-pressed') === 'true') return;
    $$('[data-filter]', filtersEl).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    if (reduceMotion) return render(btn.dataset.filter);
    grid.classList.add('is-switching');
    setTimeout(() => {
      render(btn.dataset.filter);
      requestAnimationFrame(() => {
        grid.classList.add('is-switching');
        requestAnimationFrame(() => {
          grid.classList.remove('is-switching');
          ScrollTrigger?.refresh();
        });
      });
    }, 380);
  });
}

/* ---------------- Published 3D experiences ---------------- */
function initExperiences() {
  const el = $('[data-experiences]');
  if (!el) return;
  el.innerHTML = EXPERIENCES.map((x, n) => `
    <article class="experience-row" data-reveal>
      <span class="num">${String(n + 1).padStart(2, '0')}</span>
      <div><span class="project-type">${escapeHtml(x.type)}</span><h4 class="h3">${escapeHtml(x.title)}</h4></div>
      <p>${escapeHtml(x.text)}</p>
      <div class="experience-actions">
        <a class="btn btn--small" href="${escapeHtml(x.url)}" target="_blank" rel="noopener noreferrer">Open 3D view <span aria-hidden="true">↗</span></a>
        ${x.source ? `<a class="link-arrow" href="${escapeHtml(x.source)}" target="_blank" rel="noopener noreferrer">GitHub project ↗</a>` : ''}
      </div>
    </article>`).join('');
}

/* ---------------- 3D viewer (lazy) ---------------- */
function initViewerLazy() {
  const el = $('[data-viewer]');
  if (!el) return;
  let started = false;
  const start = () => {
    if (started) return; started = true;
    import('./viewer.js')
      .then((m) => m.initViewer(el))
      .catch((err) => {
        console.warn('3D viewer could not load:', err);
        el.classList.add('is-fallback');
      });
  };
  const io = new IntersectionObserver((en) => { if (en.some((e) => e.isIntersecting)) { start(); io.disconnect(); } }, { rootMargin: '600px 0px' });
  io.observe(el);
}

/* ---------------- Point field (from the original site) ---------------- */
function initPointField() {
  const el = $('[data-point-field]');
  if (!el || reduceMotion) return;
  const io = new IntersectionObserver((en) => {
    if (en.some((e) => e.isIntersecting)) {
      io.disconnect();
      import('./point-field.js').then((m) => m.initPointField(el)).catch(() => {});
    }
  }, { rootMargin: '300px 0px' });
  io.observe(el);
}

/* ---------------- Contact ---------------- */
function initChannels() {
  const el = $('[data-channels]');
  if (!el) return;
  const rows = [];
  if (CONFIG.whatsapp) rows.push(`<a class="channel" href="${whatsappUrl()}" target="_blank" rel="noopener"><span><small>Direct message / WhatsApp</small><strong>Start a project enquiry</strong></span><span class="arrow" aria-hidden="true">↗</span></a>`);
  if (CONFIG.email) rows.push(`<a class="channel" href="mailto:${escapeHtml(CONFIG.email)}"><span><small>Email</small><strong>${escapeHtml(CONFIG.email)}</strong></span><span class="arrow" aria-hidden="true">↗</span></a>`);
  if (CONFIG.socials.Instagram) rows.push(`<a class="channel" href="${escapeHtml(CONFIG.socials.Instagram)}" target="_blank" rel="noopener"><span><small>Follow / Instagram</small><strong>@infiniviz</strong></span><span class="arrow" aria-hidden="true">↗</span></a>`);
  if (CONFIG.location) rows.push(`<div class="channel"><span><small>Studio</small><strong>${escapeHtml(CONFIG.location)}</strong></span></div>`);
  el.innerHTML = rows.join('');
}

function initForm() {
  const form = $('[data-contact-form]');
  if (!form) return;
  const status = $('[data-form-status]', form);
  const note = $('[data-form-note]', form);
  const submit = $('[data-submit]', form);
  const mode = CONFIG.formEndpoint ? 'endpoint' : CONFIG.whatsapp ? 'whatsapp' : CONFIG.email ? 'email' : 'none';
  note.textContent = {
    endpoint: 'Your enquiry is sent securely. We reply by email.',
    whatsapp: 'Sending opens WhatsApp with your enquiry ready to send.',
    email: 'Sending opens your email app with your enquiry ready to send.',
    none: '',
  }[mode];
  if (mode === 'whatsapp') submit.firstChild.textContent = 'Send via WhatsApp ';

  const messages = {
    name: 'Please enter your name.',
    email: 'Please enter a valid email address.',
    projectType: 'Please choose a project type.',
    message: 'Please tell us a little about the project.',
  };
  const validate = (field) => {
    const wrap = field.closest('.field');
    const err = wrap && $('.field-error', wrap);
    let ok = field.checkValidity();
    if (field.name === 'message' && field.value.trim().length < 10) ok = false;
    if (field.name === 'name' && !field.value.trim()) ok = false;
    wrap?.classList.toggle('is-invalid', !ok);
    field.setAttribute('aria-invalid', String(!ok));
    if (err) err.textContent = ok ? '' : messages[field.name] || 'Please check this field.';
    return ok;
  };
  const fields = $$('input[required], select[required], textarea[required]', form);
  fields.forEach((f) => {
    f.addEventListener('blur', () => f.value && validate(f));
    f.addEventListener('input', () => f.closest('.field')?.classList.contains('is-invalid') && validate(f));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'form-status'; status.textContent = '';
    const results = fields.map(validate);
    if (results.includes(false)) { fields[results.indexOf(false)].focus(); return; }
    const data = Object.fromEntries(new FormData(form));
    if (data.website) return; // honeypot: silently drop bots
    delete data.website;
    const text = `New project enquiry — ${data.projectType}\n\nName: ${data.name}\nEmail: ${data.email}\n\n${data.message}`;

    if (mode === 'endpoint') {
      submit.disabled = true;
      try {
        const res = await fetch(CONFIG.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        status.classList.add('is-ok'); status.textContent = "Thank you — your enquiry has been sent. We'll be in touch soon.";
      } catch {
        status.classList.add('is-error'); status.textContent = 'Sorry, something went wrong sending your message. Please try WhatsApp or Instagram instead.';
      } finally { submit.disabled = false; }
    } else if (mode === 'whatsapp') {
      window.open(whatsappUrl(text), '_blank', 'noopener');
      status.classList.add('is-ok'); status.textContent = 'WhatsApp opened in a new tab with your enquiry. Press send there to reach us.';
    } else if (mode === 'email') {
      location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent('Project enquiry — ' + data.projectType)}&body=${encodeURIComponent(text)}`;
      status.classList.add('is-ok'); status.textContent = 'Your email app should now open with the enquiry ready to send.';
    } else {
      status.classList.add('is-error'); status.textContent = 'Online enquiries are not configured yet.';
    }
  });
}

function initMap() {
  const map = $('[data-map]'), btn = $('[data-map-load]');
  if (!map || !btn) return;
  btn.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.title = 'INFINIVIZ location on Google Maps';
    f.src = `https://maps.google.com/maps?q=${encodeURIComponent(CONFIG.mapQuery)}&z=15&output=embed`;
    f.loading = 'lazy';
    f.referrerPolicy = 'no-referrer-when-downgrade';
    f.allowFullscreen = true;
    btn.replaceWith(f);
  });
}

/* ---------------- Footer ---------------- */
function initFooter() {
  $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
  const list = $('[data-socials]');
  if (list) {
    const items = Object.entries(CONFIG.socials).filter(([, u]) => u).map(([n, u]) => `<li><a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(n)} ↗</a></li>`);
    if (CONFIG.whatsapp) items.push(`<li><a href="${whatsappUrl()}" target="_blank" rel="noopener">WhatsApp ↗</a></li>`);
    if (CONFIG.email) items.push(`<li><a href="mailto:${escapeHtml(CONFIG.email)}">Email</a></li>`);
    items.push(`<li><a href="https://www.google.com/maps?q=${encodeURIComponent(CONFIG.mapQuery)}" target="_blank" rel="noopener">${escapeHtml(CONFIG.location.split(',')[0])}, India ↗</a></li>`);
    list.innerHTML = items.join('');
  }
}

/* ---------------- Cursor ---------------- */
let cursorEl = null;
function initCursorTargets(scope = document) {
  if (!cursorEl) return;
  $$('a, button, [data-viewer] canvas', scope).forEach((el) => {
    if (el.dataset.cursorBound) return;
    el.dataset.cursorBound = '1';
    el.addEventListener('mouseenter', () => cursorEl.classList.add('is-hover'));
    el.addEventListener('mouseleave', () => cursorEl.classList.remove('is-hover'));
  });
}
function initCursor() {
  cursorEl = $('[data-cursor]');
  if (!cursorEl || !finePointer || reduceMotion) { cursorEl?.remove(); cursorEl = null; return; }
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; cursorEl.classList.add('is-visible'); }, { passive: true });
  document.addEventListener('pointerleave', () => cursorEl.classList.remove('is-visible'));
  const loop = () => { cx += (x - cx) * 0.2; cy += (y - cy) * 0.2; cursorEl.style.transform = `translate3d(${cx}px, ${cy}px, 0)`; requestAnimationFrame(loop); };
  loop();
  initCursorTargets();
}

/* ---------------- Animations ---------------- */
function initAnimations() {
  if (!canAnimate) { root.classList.add('anim-off'); return; }
  root.classList.add('anim-on');
  gsap.registerPlugin(ScrollTrigger);
  const introDelay = $('#intro') && !$('#intro').hidden ? 1.55 : 0.15;

  // Hero
  if ($('.hero-title')) {
    const tl = gsap.timeline({ delay: introDelay });
    tl.fromTo('.hero-title .line > span', { y: 0, yPercent: 105 }, { y: 0, yPercent: 0, duration: 1.5, ease: 'expo.out', stagger: 0.12 })
      .fromTo('[data-hero-fade]', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'power3.out', stagger: 0.1 }, '-=1.1');
    gsap.to('.hero-content', { yPercent: -12, autoAlpha: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero-media', { yPercent: 18, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  }

  // Generic reveals (batched for natural stagger within a row).
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'power3.out', stagger: 0.09, overwrite: true }),
  });

  // Gentle parallax on feature images.
  $$('[data-parallax]').forEach((img) => {
    gsap.fromTo(img, { yPercent: -8 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Process progress line.
  const line = $('[data-process-line]');
  if (line) gsap.to(line, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.process-track', start: 'top 80%', end: 'bottom 55%', scrub: true } });

  // Refresh once images have their final size.
  addEventListener('load', () => ScrollTrigger.refresh());
}

/* ---------------- Boot ---------------- */
function boot() {
  initSmoothScroll();
  initAnchors();
  initHeader();
  initMenu();
  initFooter();
  if (page === 'home') {
    initHero();
    initProjects();
    initExperiences();
    initChannels();
    initForm();
    initMap();
    initViewerLazy();
    initPointField();
  }
  initCursor();
  initAnimations();
}

if (page === 'project') {
  // The detail page renders its content first, then runs the shared setup.
  import('./project-page.js').then((m) => { m.renderProjectPage(); boot(); }).catch((e) => { console.warn(e); boot(); });
} else {
  boot();
}
