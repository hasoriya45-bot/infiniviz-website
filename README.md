# infiniviz-website
INFINIVIZ architectural visualisation portfolio and client website.

Static site with no build step. It runs on GitHub Pages as-is.

## Run locally (Windows, nothing to install)
Double-click `start.cmd`, or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Open
```

Then open http://localhost:8080/infiniviz-website/

## Structure
| Path | What it is |
| --- | --- |
| `index.html` | Home: hero, about, services, projects, 3D viewer, process, contact, location |
| `project.html?p=<slug>` | Project detail page (rendered from `js/projects.js`) |
| `css/styles.css` | Design system and all styles |
| `js/config.js` | **Contact details, WhatsApp, socials, form endpoint, optional 3D model** |
| `js/projects.js` | **Project list**: add or edit work here |
| `js/main.js` | Navigation, smooth scroll, animations, gallery, form |
| `js/villa.js`, `js/viewer.js` | Three.js concept villa and interactive viewer |
| `js/point-field.js` | Gold point-field background (from the original site) |
| `assets/img/` | Optimised JPEGs (800 px and full size) used by the site |
| `assets/*.png` | Original renders and logos (kept unchanged) |

## Adding a project
1. Export `assets/img/<name>-800.jpg` (800 px wide) and `assets/img/<name>-1600.jpg` (up to 1600 px wide).
2. Add an entry to `PROJECTS` in `js/projects.js` (copy an existing one).
3. Add its URL to `sitemap.xml`.

## Using your own 3D model in the viewer
Put a `.glb` file in `assets/models/` and set `modelUrl` in `js/config.js`.
Keep it under about 15 MB (use Draco or Meshopt compression) for fast loading.

## Libraries (CDN, pinned versions)
Three.js 0.160.0 · GSAP 3.12.5 + ScrollTrigger · Lenis 1.1.13 · Google Fonts (Cormorant Garamond, Manrope)
