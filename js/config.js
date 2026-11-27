// Publieke instellingen. De publishable key is bedoeld voor gebruik in de browser;
// alle schrijfacties lopen via beveiligde database-functies.
export const SUPABASE_URL = 'https://sfqwkoaxjfswgdskrlby.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_K1EuyF3DWbHNMasjmU9xZQ_7NRiZiCo';

// YouTube-video voor de intromuziek (Joy Crookes – Feet Don't Fail Me Now)
export const MUSIC_VIDEO_ID = 'xLFCcnYSCyE';
// Het refrein ("Feet, don't fail me now") begint op dit moment in het nummer (seconden).
// Het FaceOff-menu verschijnt precies op dat moment. Klopt het niet helemaal? Pas dit getal aan.
export const CHORUS_AT = 44.7;
// Zoveel seconden vóór het refrein start de muziek bij Enter (= lengte van de intro).
export const INTRO_LEAD = 20;
export const MUSIC_START_SECONDS = Math.max(0, CHORUS_AT - INTRO_LEAD);

// Optioneel en het betrouwbaarst: zet een eigen audiobestand in de repo (bv. music/feet.mp3)
// en vul hier het pad in. Dan wordt YouTube niet gebruikt. Leeg laten = YouTube.
export const MUSIC_FILE = '';

// Wanneer de hints verschijnen (seconden na de start van een ronde)
export const HINT_TIMES = [8, 14, 20, 25];

// Reservevideo's als de eerste niet ingesloten mag worden (Part 2 met Ravyn Lenae)
export const MUSIC_FALLBACK_IDS = ['qZlvBI84mas'];

// Intro-montage: echte, vrij gelicentieerde beelden van Wikimedia Commons (CC BY 3.0, Real Madrid C.F.).
// t = startseconde in de video, d = duur van het fragment in seconden. De montage herhaalt
// zich tot het moment van het refrein bereikt is.
const RONALDO = 'All 48 goals of Cristiano Ronaldo, in 35 league matches for Real Madrid (2014-15).ogv';
const CR7 = 'THANK YOU, CRISTIANO RONALDO - Real Madrid Official Video.webm';
export const REEL = [
  { file: CR7, t: 30, d: 1.3 },     // bal aan de voet, close-up
  { file: CR7, t: 45, d: 1.2 },     // schot op doel
  { file: RONALDO, t: 47, d: 1.3 }, // rush richting doel
  { file: CR7, t: 330, d: 1.3 },    // dribbel
  { file: CR7, t: 150, d: 1.2 },    // Champions League-actie
  { file: CR7, t: 270, d: 1.2 },    // bal in het net
  { file: CR7, t: 225, d: 1.3 },    // actie in de zestien
  { file: RONALDO, t: 262, d: 1.2 },// viering met Marcelo
  { file: CR7, t: 240, d: 1.2 },    // viering
  { file: CR7, t: 120, d: 1.6 },    // shirt uit, iconische viering
  { file: CR7, t: 360, d: 1.4 },    // trofee
  { file: CR7, t: 15, d: 1.8 },     // viering voor het publiek
];
