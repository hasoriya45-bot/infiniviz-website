/**
 * InfiniViz project data: one entry per render on the site.
 * Titles, categories and descriptions are taken from the original website.
 *
 * Images: `img` is the base name in assets/img/. Each needs two files:
 *   assets/img/<img>-800.jpg   (cards, mobile)
 *   assets/img/<img>-1600.jpg  (detail page, full view)
 * `w`/`h` are the 1600 image's pixel size (prevents layout shift).
 *
 * To add a project: export two JPEGs at those widths, add an entry, done.
 * Optional fields shown on the detail page when present: client, location, year, scope, software.
 */
export const CATEGORIES = [
  { id: 'all', label: 'All work' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'interior', label: 'Interior' },
];

export const PROJECTS = [
  {
    slug: 'life-in-the-landscape',
    title: 'Life in the landscape',
    type: 'Architecture · Residential',
    categories: ['exterior', 'architecture', 'residential'],
    summary: 'Layered terraces, green outlooks and generous shared spaces shape an inviting arrival.',
    alt: 'Full-color 3D render of a landscaped contemporary apartment building with planted terraces',
    img: 'apartment-exterior', w: 1586, h: 1176,
    scope: 'Exterior visualisation',
  },
  {
    slug: 'garden-house',
    title: 'Garden house',
    type: 'Residential · Garden home',
    categories: ['exterior', 'architecture', 'residential'],
    summary: 'A sheltered terrace and lush planting connect this home with its outdoor setting.',
    alt: 'Full-color 3D render of a contemporary garden home beside a swimming pool',
    img: 'residential-garden-house', w: 1169, h: 1239,
    scope: 'Exterior visualisation',
  },
  {
    slug: 'framed-by-light',
    title: 'Framed by light',
    type: 'Architecture · Exterior',
    categories: ['exterior', 'architecture', 'residential'],
    summary: 'A sculptural roofline, warm stone and garden planting shape the arrival.',
    alt: 'Full-color 3D render of a sculptural modern villa among palm trees',
    img: 'exterior', w: 1310, h: 779,
    scope: 'Exterior visualisation',
  },
  {
    slug: 'modern-residence',
    title: 'Modern residence',
    type: 'Residential · Private home',
    categories: ['exterior', 'architecture', 'residential'],
    summary: 'Clean volumes and generous windows sit naturally among mature trees.',
    alt: 'Full-color 3D render of a modern family home framed by mature trees',
    img: 'residential-modern-house', w: 1171, h: 961,
    scope: 'Exterior visualisation',
  },
  {
    slug: 'connected-homes',
    title: 'Connected homes',
    type: 'Residential · Townhouses',
    categories: ['exterior', 'architecture', 'residential'],
    summary: 'A repeating rhythm of brick and white forms gives this small community its character.',
    alt: 'Full-color 3D architectural render of contemporary townhouses in a green landscape',
    img: 'residential-townhouses', w: 993, h: 585,
    scope: 'Exterior visualisation',
  },
  {
    slug: 'at-home-among-the-trees',
    title: 'At home among the trees',
    type: 'Residential · Family home',
    categories: ['exterior', 'architecture', 'residential'],
    summary: 'Warm timber, broad rooflines and a welcoming courtyard bring the family outdoors.',
    alt: 'Full-color 3D render of a contemporary family home in a wooded landscape',
    img: 'residential-forest-house', w: 1162, h: 962,
    scope: 'Exterior visualisation',
  },
  {
    slug: 'room-to-focus',
    title: 'Room to focus',
    type: 'Interior · Workplace',
    categories: ['interior'],
    summary: 'Natural light and rich materials create a calm, considered workspace.',
    alt: 'Full-color 3D interior render of a warm contemporary office',
    img: 'interior-office', w: 1089, h: 1351,
    scope: 'Interior visualisation',
  },
  {
    slug: 'quietly-warm',
    title: 'Quietly warm',
    type: 'Interior · Living',
    categories: ['interior'],
    summary: 'Soft textures and crafted timber bring depth to an understated living space.',
    alt: 'Full-color 3D interior render of a softly textured living room',
    img: 'interior-lounge', w: 1078, h: 1360,
    scope: 'Interior visualisation',
  },
  {
    slug: 'everyday-elevated',
    title: 'Everyday, elevated',
    type: 'Interior · Kitchen',
    categories: ['interior'],
    summary: 'A focused palette and simple forms make the smallest details feel intentional.',
    alt: 'Full-color 3D interior render of a refined modern kitchen',
    img: 'interior-kitchen', w: 1083, h: 1352,
    scope: 'Interior visualisation',
  },
  {
    slug: 'gather-in-style',
    title: 'Gather in style',
    type: 'Interior · Dining',
    categories: ['interior'],
    summary: 'A sculptural brick arch frames a warm dining room for intimate gatherings.',
    alt: 'Full-color 3D render of an elegant dining room framed by a brick arch',
    img: 'interior-dining', w: 1118, h: 1282,
    scope: 'Interior visualisation',
  },
  {
    slug: 'a-softer-retreat',
    title: 'A softer retreat',
    type: 'Interior · Bedroom',
    categories: ['interior'],
    summary: 'Layered fabrics and subtle lighting bring a sense of quiet to the bedroom.',
    alt: 'Full-color 3D render of a serene bedroom with layered textures',
    img: 'interior-bedroom', w: 1147, h: 1283,
    scope: 'Interior visualisation',
  },
  {
    slug: 'room-for-living',
    title: 'Room for living',
    type: 'Interior · Living',
    categories: ['interior'],
    summary: 'A warm, open interior connects everyday moments with generous shared space.',
    alt: 'Full-color 3D render of a welcoming family living space',
    img: 'interior-family-living', w: 987, h: 1082,
    scope: 'Interior visualisation',
  },
];

/** Interactive 3D experiences already published by InfiniViz (external links). */
export const EXPERIENCES = [
  {
    title: 'Nimesh Bedroom',
    type: 'Interactive interior',
    text: 'Explore the bedroom as an interactive 3D experience.',
    url: 'https://hasoriya45-bot.github.io/NIMESH-BEDROOM-1/',
    source: 'https://github.com/hasoriya45-bot/NIMESH-BEDROOM-1',
  },
  {
    title: 'Master Bedroom',
    type: 'Interactive interior',
    text: 'Open the master bedroom walkthrough in your browser.',
    url: 'https://hasoriya45-bot.github.io/MASTER-BEDROOM/',
  },
];

export const imgSrc = (p, size = 1600) => `assets/img/${p.img}-${size}.jpg`;
export const imgSrcset = (p) => `${imgSrc(p, 800)} 800w, ${imgSrc(p, 1600)} ${p.w}w`;
export const findProject = (slug) => PROJECTS.find((p) => p.slug === slug);
