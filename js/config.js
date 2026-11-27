// Publieke instellingen. De publishable key is bedoeld voor gebruik in de browser;
// alle schrijfacties lopen via beveiligde database-functies.
export const SUPABASE_URL = 'https://sfqwkoaxjfswgdskrlby.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_K1EuyF3DWbHNMasjmU9xZQ_7NRiZiCo';

// YouTube-video voor de intromuziek (Joy Crookes – Feet Don't Fail Me Now)
export const MUSIC_VIDEO_ID = 'xLFCcnYSCyE';
export const MUSIC_START_SECONDS = 0;

// Wanneer de hints verschijnen (seconden na de start van een ronde)
export const HINT_TIMES = [8, 14, 20, 25];

// Reservevideo's als de eerste niet ingesloten mag worden (Part 2 met Ravyn Lenae)
export const MUSIC_FALLBACK_IDS = ['qZlvBI84mas'];

// Intro-montage: vrij gelicentieerde video's van Wikimedia Commons (CC BY / CC BY-SA).
// t = startseconde in de video, d = duur van het fragment in seconden.
// "photo" gebruikt de spelersfoto uit de database (er is geen vrije video van Arda Güler).
const RONALDO = 'All 48 goals of Cristiano Ronaldo, in 35 league matches for Real Madrid (2014-15).ogv';
const MESSI = 'Messi. Barcelona (End of an Era).webm';
const MODRIC = 'Luka Modrić achievements with Real Madrid -shorts -football.webm';
export const REEL = [
  { file: MESSI, t: 38, d: 1.4, name: 'Lionel Messi', sub: 'FC Barcelona', player: 'Lionel Messi' },
  { file: RONALDO, t: 47, d: 1.4, name: 'Cristiano Ronaldo', sub: 'Real Madrid · 2014-15', player: 'Cristiano Ronaldo' },
  { file: MODRIC, t: 9, d: 1.3, name: 'Luka Modrić', sub: 'Real Madrid', player: 'Luka Modrić' },
  { photo: 'Arda Güler', d: 1.3, name: 'Arda Güler', sub: 'Real Madrid' },
  { file: 'Neymar takes a free kick - BRA v. RSA, Rio 2016.ogv', t: 11, d: 1.7, name: 'Neymar', sub: 'Brazilië · Rio 2016', player: 'Neymar' },
  { file: RONALDO, t: 131, d: 1.2, name: 'Cristiano Ronaldo', sub: 'Real Madrid', player: 'Cristiano Ronaldo' },
  { file: MESSI, t: 71, d: 1.2, name: 'Lionel Messi', sub: 'FC Barcelona', player: 'Lionel Messi' },
  { file: "Kylian Mbappe at Real Madrid's UEFA Champions League game versus Juventus Turin on 22 October 2025 (video).webm", t: 1, d: 1.3, name: 'Kylian Mbappé', sub: 'Real Madrid', player: 'Kylian Mbappé' },
  { file: MODRIC, t: 22, d: 1.2, name: 'Luka Modrić', sub: 'Real Madrid', player: 'Luka Modrić' },
  { file: RONALDO, t: 214, d: 1.2, name: 'Cristiano Ronaldo', sub: 'Real Madrid', player: 'Cristiano Ronaldo' },
  { file: 'El Real Madrid ofreció la Undécima a los madridistas.webm', t: 70, d: 1.4, name: 'La Undécima', sub: 'Real Madrid · 2016' },
  { file: MESSI, t: 95, d: 1.6, name: 'Lionel Messi', sub: 'FC Barcelona', player: 'Lionel Messi' },
];
