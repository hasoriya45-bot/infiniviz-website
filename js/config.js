/**
 * InfiniViz site configuration — contact details and integrations.
 * Empty values are hidden on the site, so nothing links to a dead address.
 */
export const CONFIG = {
  brand: 'INFINIVIZ',

  // WhatsApp number in international format, digits only (from the original site).
  whatsapp: '917038480370',
  whatsappMessage: "Hello Infiniviz, I'd like to discuss an architectural visualisation project.",

  // Optional public email, e.g. 'hello@yourstudio.com'. Adds an email link and an
  // "email instead" option on the enquiry form.
  email: '',

  // Optional form backend URL (Formspree, Basin, Getform…). When set, the enquiry
  // form POSTs JSON there. When empty, the form sends the enquiry through WhatsApp.
  formEndpoint: '',

  location: 'Nagpur, Maharashtra, India',
  mapQuery: '21.156909,79.100312',

  // Social profiles. Empty entries are not shown.
  socials: {
    Instagram: 'https://www.instagram.com/infiniviz/',
    LinkedIn: '',
    Behance: '',
    YouTube: '',
  },

  // Optional: your own .glb model for the 3D viewer, e.g. 'assets/models/villa.glb'.
  // Leave empty to use the built-in concept model.
  modelUrl: '',
};
