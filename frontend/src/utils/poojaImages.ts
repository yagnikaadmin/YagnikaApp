// Deity / ritual imagery for the poojas and the full service catalog.
// Sourced from Wikimedia Commons (freely licensed, stable
// upload.wikimedia.org CDN). Resolution order:
//   1. exact pooja id  (the built-in p1..p10 demo poojas)
//   2. keyword match on the service name + its category / subcategory
//      so every one of the 150+ catalog services gets a fitting god image
//      instead of a blank square.

const DIYA = 'https://upload.wikimedia.org/wikipedia/commons/2/28/Aarti_Arati_Lamp_for_Puja%2C_Prayers_Hinduism.jpg';
const GANESH = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Ganesha_Idol%2C_Siddhivinayak_Temple%2C_Mumbai.jpg/960px-Ganesha_Idol%2C_Siddhivinayak_Temple%2C_Mumbai.jpg';
const GANESH_CLAY = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Clay_Ganesh_Idol.jpg/960px-Clay_Ganesh_Idol.jpg';
const SHIVA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Shiva_statue_at_CERN_02.jpg/960px-Shiva_statue_at_CERN_02.jpg';
const SHIVA_LINGAM = 'https://upload.wikimedia.org/wikipedia/commons/8/83/Shiva_Lingam_at_Sri_Punyalingeswara_Swamy_Kshetram%2C_Choutuppal%2C_Telangana.png';
const LAKSHMI = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Lakshmi_pooja_in_Odisha_2024_43.jpg/960px-Lakshmi_pooja_in_Odisha_2024_43.jpg';
const LAKSHMI_ART = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Siddha_Lakshmi_-_Google_Art_Project.jpg/960px-Siddha_Lakshmi_-_Google_Art_Project.jpg';
const VISHNU = 'https://upload.wikimedia.org/wikipedia/commons/3/37/The_Idol_of_Mohini%2C_female_avatar_of_Lord_Vishnu.jpg';
const VENKATESWARA = 'https://upload.wikimedia.org/wikipedia/commons/d/de/Malekallu_Tirupathi-balaji%2C_Arsikere.jpg';
const DURGA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Durga_Burdwan_03_10_2011.JPG/960px-Durga_Burdwan_03_10_2011.JPG';
const SARASWATI = 'https://upload.wikimedia.org/wikipedia/commons/1/12/Saraswati.jpg';
const HANUMAN = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Anjaneya_Swamy_Statue_at_Anantha_Padmanabha_Swamy_Temple%2C_Ananthagiri.jpg/960px-Anjaneya_Swamy_Statue_at_Anantha_Padmanabha_Swamy_Temple%2C_Ananthagiri.jpg';
const MURUGAN = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Gombak_Selangor_Batu-Caves-01.jpg/960px-Gombak_Selangor_Batu-Caves-01.jpg';
const KRISHNA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Krishna_Playing_Flute_-_Deccan_Painting.jpg/960px-Krishna_Playing_Flute_-_Deccan_Painting.jpg';
const RAMA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Idols_of_Rama%2C_Sita_and_others_in_Howrah.jpg/960px-Idols_of_Rama%2C_Sita_and_others_in_Howrah.jpg';
const NAVAGRAHA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/0091623_Surya_Rannada_Navagraha_temple%2C_Bagwadar_Gujarat_018.jpg/960px-0091623_Surya_Rannada_Navagraha_temple%2C_Bagwadar_Gujarat_018.jpg';
const HAVAN = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/%28A%29_Hindu_puja%2C_yajna%2C_yagna%2C_Havanam_in_progress.jpg/960px-%28A%29_Hindu_puja%2C_yajna%2C_yagna%2C_Havanam_in_progress.jpg';
const RANGOLI = 'https://upload.wikimedia.org/wikipedia/commons/a/ad/Diwali_rangoli_in_goa.jpg';
const TEMPLE_BELL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Brass_Temple_Bell_%2824275541%29.jpeg/960px-Brass_Temple_Bell_%2824275541%29.jpeg';

export const POOJA_IMAGE_BY_ID: Record<string, string> = {
  p1: DIYA,          // Satyanarayana Pooja
  p2: GANESH_CLAY,   // Ganapathi Homam
  p3: SHIVA_LINGAM,  // Rudrabhishekam
  p4: LAKSHMI,       // Lakshmi Pooja
  p5: NAVAGRAHA,     // Navagraha Homam
  p6: RANGOLI,       // Gruhapravesham
  p7: HAVAN,         // Ayush Homam
  p8: VISHNU,        // Sudarshana Homam
  p9: RANGOLI,       // Vastu Pooja
  p10: TEMPLE_BELL,  // Annaprasana
};

// First match wins — order matters (specific deities before the generic
// homam / puja catch-alls).
const KEYWORD_IMAGES: [RegExp, string][] = [
  [/ganesh|ganapati|ganapathi|vinayaka|vighn/i, GANESH],
  [/venkatesw|srinivasa|balaji|govinda|tirupati|perumal/i, VENKATESWARA],
  [/rudra|lingam|linga|pradosh|maha[ -]?mrityunjaya|kedar|uma[ -]?mahesh|lingashtak|shiva|shiv[ae]|pashupata/i, SHIVA],
  [/lakshmi|kubera|dhana|varalakshmi|vara[ -]?lakshmi|kanakadhara|vaibhava|vibhava|kanaka/i, LAKSHMI_ART],
  [/vishnu|narayana|satyanarayan|sudarshan|padmanabha|dhanvantari|ananta|anantha/i, VISHNU],
  [/hanuman|anjaneya|sundara[ -]?kanda|chalisa|aditya[ -]?hridayam/i, HANUMAN],
  [/durga|devi|chandi|navaratri|navaratrulu|lalitha|mahishasura|pratyangira|santoshi|amman|shakta|shakti|soundarya|manidweepam/i, DURGA],
  [/saraswati|medha|akshar|vidya|vedarambh/i, SARASWATI],
  [/subrahmany|subramanya|skanda|shashti|murugan|karthikeya|kartikeya|kumara|kandha/i, MURUGAN],
  [/krishna|gopala|bhagavat|bhagavad[ -]?gita|santana[ -]?gopala|venugopala/i, KRISHNA],
  [/\brama\b|sita|ramayan|kalyanam|kalyana|vivah|vivaham|marriage|pattabhi/i, RAMA],
  [/navagraha|graha|rahu|ketu|shani|sarpa|naga[ -]?dosha|jyotish|astrolog|horoscope|muhurth|numerolog|palmistr|dosha/i, NAVAGRAHA],
  [/homa|homam|yaga|yagna|yajna|havan|agni|yagam/i, HAVAN],
  [/griha|gruha|vastu|bhoomi|shanku|house|home|shop|factory|office|vehicle|opening/i, RANGOLI],
  [/abhishek/i, SHIVA_LINGAM],
  [/anna[ -]?prasan|anna[ -]?dana|annadana|dakshina|\bdana\b|vastra|gift|offering/i, TEMPLE_BELL],
  [/archana|suprabhat|harathi|aarti|arati|vratham|\bvrat\b|parayan|recit|chanting|stotra|sahasranam|suktam|puja|pooja|seva/i, DIYA],
];

export function poojaImageFor(id: string, name?: string, extra?: string): string {
  if (POOJA_IMAGE_BY_ID[id]) return POOJA_IMAGE_BY_ID[id];
  const hay = `${name || ''} ${extra || ''}`;
  for (const [re, uri] of KEYWORD_IMAGES) {
    if (re.test(hay)) return uri;
  }
  return DIYA;
}
