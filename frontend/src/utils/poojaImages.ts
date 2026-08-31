// Real photographs for the seeded poojas, sourced from Wikimedia Commons
// (freely licensed, stable CDN). Keyed by pooja id first (exact match for
// the built-in seed data), falling back to a keyword match on the name so
// admin-added poojas still get a sensible image instead of nothing.
const DIYA = 'https://upload.wikimedia.org/wikipedia/commons/2/28/Aarti_Arati_Lamp_for_Puja%2C_Prayers_Hinduism.jpg';
const GANESH = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Clay_Ganesh_Idol.jpg/960px-Clay_Ganesh_Idol.jpg';
const SHIVA_LINGAM = 'https://upload.wikimedia.org/wikipedia/commons/8/83/Shiva_Lingam_at_Sri_Punyalingeswara_Swamy_Kshetram%2C_Choutuppal%2C_Telangana.png';
const LAKSHMI = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Lakshmi_pooja_in_Odisha_2024_43.jpg/960px-Lakshmi_pooja_in_Odisha_2024_43.jpg';
const HAVAN = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/%28A%29_Hindu_puja%2C_yajna%2C_yagna%2C_Havanam_in_progress.jpg/960px-%28A%29_Hindu_puja%2C_yajna%2C_yagna%2C_Havanam_in_progress.jpg';
const RANGOLI = 'https://upload.wikimedia.org/wikipedia/commons/a/ad/Diwali_rangoli_in_goa.jpg';
const TEMPLE_BELL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Brass_Temple_Bell_%2824275541%29.jpeg/960px-Brass_Temple_Bell_%2824275541%29.jpeg';

export const POOJA_IMAGE_BY_ID: Record<string, string> = {
  p1: DIYA,        // Satyanarayana Pooja
  p2: GANESH,       // Ganapathi Homam
  p3: SHIVA_LINGAM, // Rudrabhishekam
  p4: LAKSHMI,      // Lakshmi Pooja
  p5: HAVAN,        // Navagraha Homam
  p6: RANGOLI,      // Gruhapravesham
  p7: HAVAN,        // Ayush Homam
  p8: HAVAN,        // Sudarshana Homam
  p9: RANGOLI,       // Vastu Pooja
  p10: TEMPLE_BELL, // Annaprasana
};

const KEYWORD_IMAGES: [RegExp, string][] = [
  [/ganesh|ganapathi|vinayaka/i, GANESH],
  [/shiva|rudra|lingam/i, SHIVA_LINGAM],
  [/lakshmi|dhana/i, LAKSHMI],
  [/homam|homa|yajna|yagna|havan/i, HAVAN],
  [/griha|vastu|house|home/i, RANGOLI],
  [/bell/i, TEMPLE_BELL],
];

export function poojaImageFor(id: string, name?: string): string {
  if (POOJA_IMAGE_BY_ID[id]) return POOJA_IMAGE_BY_ID[id];
  if (name) {
    for (const [re, uri] of KEYWORD_IMAGES) {
      if (re.test(name)) return uri;
    }
  }
  return DIYA;
}
