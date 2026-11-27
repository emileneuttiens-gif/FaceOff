// Publieke instellingen. De publishable key is bedoeld voor gebruik in de browser;
// alle schrijfacties lopen via beveiligde database-functies.
export const SUPABASE_URL = 'https://sfqwkoaxjfswgdskrlby.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_K1EuyF3DWbHNMasjmU9xZQ_7NRiZiCo';

// YouTube-video voor de intromuziek (Joy Crookes – Feet Don't Fail Me Now)
export const MUSIC_VIDEO_ID = 'xLFCcnYSCyE';
// Het refrein ("Feet, don't fail me now") begint op dit moment in de officiële video (seconden).
// Het menu verschijnt precies op dat moment. Klopt het niet helemaal? Pas dit getal aan.
export const CHORUS_AT = 44.62;
// De muziek start bij Enter aan het begin van een zinnetje (25,47 s), niet midden in een woord,
// en zwelt in één seconde aan. Daardoor duurt de intro ongeveer 19 seconden.
export const MUSIC_START_SECONDS = 25.2;

// Optioneel en het betrouwbaarst: zet een eigen audiobestand in de repo (bv. music/feet.mp3)
// en vul hier het pad in. Dan wordt YouTube niet gebruikt. Leeg laten = YouTube.
export const MUSIC_FILE = '';

// Wanneer de hints verschijnen (seconden na de start van een ronde)
export const HINT_TIMES = [8, 14, 20, 25];

// Reservevideo's als de eerste niet ingesloten mag worden (Part 2 met Ravyn Lenae)
export const MUSIC_FALLBACK_IDS = ['qZlvBI84mas'];

// Na het intronummer: bekende FIFA-nummers in willekeurige volgorde (officiële YouTube-video's).
// start = seconde waarop het nummer begint (sommige clips hebben een gesproken intro).
export const PLAYLIST = [
  { id: 'fe4EK4HSPkI', title: 'Kids', artist: 'MGMT' },
  { id: 'UtF6Jej8yb4', title: 'The Nights', artist: 'Avicii' },
  { id: 'mRD0-GxqHVo', title: 'Heat Waves', artist: 'Glass Animals' },
  { id: 'w869Avr_fXI', title: 'Jerk It Out', artist: 'Caesars' },
  { id: 'lk5iMgG-WJI', title: 'Club Foot', artist: 'Kasabian' },
  { id: 'yYDmaexVHic', title: 'Rhinestone Eyes', artist: 'Gorillaz' },
  { id: 'NSD11dnphg0', title: 'Fools Gold', artist: 'The Stone Roses' },
  { id: 'SetClFl10cQ', title: 'Beat 54 (All Good Now)', artist: 'Jungle' },
  { id: 'F1B9Fk_SgI0', title: 'Feels Like Summer', artist: 'Childish Gambino' },
  { id: 'SSbBvKaM6sk', title: 'Song 2', artist: 'Blur' },
  { id: 'Dv7vr6oE3U8', title: 'Red Morning Light', artist: 'Kings of Leon' },
  { id: 'FMrIy9zm7QY', title: 'The Rockafeller Skank', artist: 'Fatboy Slim' },
];

// Intro-montage: echte, vrij gelicentieerde beelden van Wikimedia Commons (CC BY 3.0, Real Madrid C.F.).
// t = startseconde in de video, d = duur van het fragment in seconden. Uitgekozen uit
// "THANK YOU, CRISTIANO RONALDO" (Real Madrid): dribbels, goals en vieringen.
const CR7 = 'THANK YOU, CRISTIANO RONALDO - Real Madrid Official Video.webm';
export const REEL = [
  { file: CR7, t: 25.5, d: 1.3 },  // 0:26 bal aan de voet, close-up
  { file: CR7, t: 136.5, d: 1.3 }, // 2:17 dribbel langs Bayern-spelers
  { file: CR7, t: 319.5, d: 1.3 }, // 5:20 dribbel tegen PSG
  { file: CR7, t: 70.0, d: 1.3 },  // 1:11 bal voorbij de keeper in het net
  { file: CR7, t: 31.0, d: 1.2 },  // 0:32 duik/afronding voor doel
  { file: CR7, t: 324.5, d: 2.0 }, // 5:26 de omhaal tegen Juventus
  { file: CR7, t: 190.0, d: 1.2 }, // 3:11 bal in het net
  { file: CR7, t: 292.5, d: 1.3 }, // 4:53 goal tegen Barcelona
  { file: CR7, t: 118.5, d: 1.4 }, // 1:59 shirt uit, iconische viering
  { file: CR7, t: 250.5, d: 1.2 }, // 4:11 schreeuw na een goal
  { file: CR7, t: 280.5, d: 1.2 }, // 4:41 hele ploeg op elkaar
  { file: CR7, t: 253.5, d: 1.8 }, // 4:14 confetti met de trofee
];
