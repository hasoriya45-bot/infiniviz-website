import { PROJECTS, findProject, imgSrc, imgSrcset } from './projects.js';
import { projectCard, layoutClasses } from './main.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function setMeta(name, content, attr = 'name') {
  let m = document.querySelector(`meta[${attr}="${name}"]`);
  if (!m) { m = document.createElement('meta'); m.setAttribute(attr, name); document.head.appendChild(m); }
  m.setAttribute('content', content);
}

export function renderProjectPage() {
  const main = document.getElementById('main');
  const slug = new URLSearchParams(location.search).get('p');
  const p = slug && findProject(slug);

  if (!p) {
    document.title = 'Project not found — INFINIVIZ';
    setMeta('robots', 'noindex');
    main.innerHTML = `
      <section class="notfound">
        <div>
          <p class="eyebrow eyebrow--plain">404 — Project not found</p>
          <h1 class="h2">This project doesn't exist, <em>or has moved.</em></h1>
          <a class="btn btn--primary" href="index.html#work">Back to all projects <span class="arrow" aria-hidden="true">→</span></a>
        </div>
      </section>`;
    return;
  }

  const i = PROJECTS.indexOf(p);
  const prev = PROJECTS[(i - 1 + PROJECTS.length) % PROJECTS.length];
  const next = PROJECTS[(i + 1) % PROJECTS.length];
  const related = PROJECTS.filter((x) => x !== p && x.categories.some((c) => p.categories.includes(c))).slice(0, 3);
  const base = 'https://hasoriya45-bot.github.io/infiniviz-website/';

  document.title = `${p.title} — ${p.type} | INFINIVIZ`;
  setMeta('description', `${p.summary} ${p.scope} by INFINIVIZ.`);
  setMeta('og:title', `${p.title} | INFINIVIZ`, 'property');
  setMeta('og:description', p.summary, 'property');
  setMeta('og:image', base + imgSrc(p), 'property');
  setMeta('og:url', `${base}project.html?p=${p.slug}`, 'property');
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = `${base}project.html?p=${p.slug}`;
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'VisualArtwork', name: p.title, description: p.summary,
    artform: '3D architectural visualization', image: base + imgSrc(p),
    creator: { '@type': 'Organization', name: 'INFINIVIZ', url: base },
  });
  document.head.appendChild(ld);

  const specs = [
    ['Category', p.type],
    ['Scope', p.scope],
    p.client && ['Client', p.client],
    p.location && ['Location', p.location],
    p.year && ['Year', p.year],
    p.software && ['Software', p.software],
    ['Studio', 'INFINIVIZ'],
  ].filter(Boolean);

  const classes = layoutClasses(related.length);
  main.innerHTML = `
    <article>
      <header class="p-hero">
        <div class="container">
          <nav class="crumbs" aria-label="Breadcrumb" data-reveal>
            <a href="index.html">Home</a><span aria-hidden="true">/</span>
            <a href="index.html#work">Work</a><span aria-hidden="true">/</span>
            <span aria-current="page">${esc(p.title)}</span>
          </nav>
          <h1 class="display p-title" data-reveal>${esc(p.title)}</h1>
          <div class="p-intro">
            <p class="lead" data-reveal>${esc(p.summary)}</p>
            <dl class="p-specs" data-reveal>
              ${specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
            </dl>
          </div>
        </div>
      </header>

      <figure class="p-figure container" data-reveal>
        <div class="p-figure-frame">
          <img src="${imgSrc(p)}" srcset="${imgSrcset(p)}" sizes="(max-width: 1560px) 100vw, 1400px" alt="${esc(p.alt)}" width="${p.w}" height="${p.h}" fetchpriority="high">
        </div>
        <figcaption>
          <span>${esc(p.alt)}.</span>
          <a class="link-arrow" href="${imgSrc(p)}" target="_blank" rel="noopener">View full resolution ↗</a>
        </figcaption>
      </figure>

      <div class="container">
        <nav class="p-nav" aria-label="More projects">
          <a href="project.html?p=${prev.slug}">
            <img src="${imgSrc(prev, 800)}" alt="" width="96" height="72" loading="lazy" decoding="async">
            <span><small>← Previous</small><strong>${esc(prev.title)}</strong></span>
          </a>
          <a href="project.html?p=${next.slug}">
            <img src="${imgSrc(next, 800)}" alt="" width="96" height="72" loading="lazy" decoding="async">
            <span><small>Next →</small><strong>${esc(next.title)}</strong></span>
          </a>
        </nav>

        ${related.length ? `
        <section class="p-related" aria-labelledby="related-title">
          <div class="section-head">
            <div data-reveal><p class="eyebrow">Related work</p><h2 class="h2" id="related-title">More in <em>${esc(p.type.split('·')[0].trim())}</em></h2></div>
          </div>
          <div class="projects-grid">${related.map((r, n) => projectCard(r, classes[n])).join('')}</div>
        </section>` : ''}
      </div>

      <section class="p-cta">
        <div class="container" data-reveal>
          <p class="eyebrow">Have a project like this?</p>
          <h2 class="h2">Let's bring your next space <em>to life.</em></h2>
          <a class="btn btn--gold" href="index.html#contact">Start a project <span class="arrow" aria-hidden="true">→</span></a>
        </div>
      </section>
    </article>`;
}
