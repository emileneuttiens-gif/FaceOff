// Publieke instellingen. De publishable key is bedoeld voor gebruik in de browser;
// alle schrijfacties lopen via beveiligde database-functies.
export const SUPABASE_URL = 'https://sfqwkoaxjfswgdskrlby.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_K1EuyF3DWbHNMasjmU9xZQ_7NRiZiCo';

// YouTube-video voor de intromuziek (Joy Crookes – Feet Don't Fail Me Now)
export const MUSIC_VIDEO_ID = 'xLFCcnYSCyE';
export const MUSIC_START_SECONDS = 0;

// Optioneel en het betrouwbaarst: zet een eigen audiobestand in de repo (bv. music/feet.mp3)
// en vul hier het pad in. Dan wordt YouTube niet gebruikt. Leeg laten = YouTube.
export const MUSIC_FILE = '';

// Wanneer de hints verschijnen (seconden na de start van een ronde)
export const HINT_TIMES = [8, 14, 20, 25];

// Reservevideo's als de eerste niet ingesloten mag worden (Part 2 met Ravyn Lenae)
export const MUSIC_FALLBACK_IDS = ['qZlvBI84mas'];

// Intro-montage: vrij gelicentieerde video's van Wikimedia Commons (CC BY / CC BY-SA).
// t = startseconde in de video, d = duur van het fragment in seconden.
// "photo" gebruikt de spelersfoto uit de database (er is geen vrije video van Arda Güler).
const RONALDO = 'All 48 goals of Cristiano Ronaldo, in 35 league matches for Real Madrid (2014-15).ogv';
const CR7 = 'THANK YOU, CRISTIANO RONALDO - Real Madrid Official Video.webm';
export const REEL = [
  { file: CR7, t: 30, d: 1.3, name: 'Cristiano Ronaldo', sub: 'Real Madrid', player: 'Cristiano Ronaldo' },
  { photo: 'Lionel Messi', d: 1.2, name: 'Lionel Messi', sub: 'Argentinië' },
  { file: CR7, t: 45, d: 1.3, name: 'Cristiano Ronaldo', sub: 'Champions League', player: 'Cristiano Ronaldo' },
  { photo: 'Luka Modrić', d: 1.2, name: 'Luka Modrić', sub: 'Kroatië' },
  { file: RONALDO, t: 47, d: 1.4, name: 'Cristiano Ronaldo', sub: 'La Liga · 2014-15', player: 'Cristiano Ronaldo' },
  { photo: 'Arda Güler', d: 1.2, name: 'Arda Güler', sub: 'Real Madrid' },
  { file: CR7, t: 330, d: 1.3, name: 'Cristiano Ronaldo', sub: 'Real Madrid', player: 'Cristiano Ronaldo' },
  { photo: 'Kylian Mbappé', d: 1.1, name: 'Kylian Mbappé', sub: 'Real Madrid' },
  { file: CR7, t: 225, d: 1.3, name: 'Cristiano Ronaldo', sub: 'Champions League', player: 'Cristiano Ronaldo' },
  { photo: 'Neymar', d: 1.1, name: 'Neymar', sub: 'Brazilië' },
  { file: CR7, t: 120, d: 1.5, name: 'Cristiano Ronaldo', sub: 'Real Madrid', player: 'Cristiano Ronaldo' },
  { photo: 'Lamine Yamal', d: 1.1, name: 'Lamine Yamal', sub: 'FC Barcelona' },
  { file: CR7, t: 15, d: 1.8, name: 'FaceOff', sub: 'Herken ze allemaal', player: 'Cristiano Ronaldo' },
];
