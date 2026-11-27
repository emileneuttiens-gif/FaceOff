import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY, MUSIC_VIDEO_ID, MUSIC_FALLBACK_IDS, MUSIC_START_SECONDS, MUSIC_FILE, HINT_TIMES, PLAYLIST, REEL, CHORUS_AT } from './config.js?v=1795809580';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------- toestand ----------
const S = {
  token: localStorage.getItem('fo_token') || crypto.randomUUID(),
  name: localStorage.getItem('fo_name') || '',
  code: null, slot: null, room: null, solo: false,
  offset: 0, channel: null, tickTimer: null,
  pool: [], poolKey: null, options: null,
  shownRound: 0, lastWrongAt: null, revealedRound: 0, lastStatus: null,
  draftMode: { type: 'bekend' }, draftRounds: 10,
};
localStorage.setItem('fo_token', S.token);

// ---------- hulpjes ----------
const norm = (t) => (t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const serverNow = () => Date.now() + S.offset;
const LEAGUE_NAMES = { 'Belgian Pro League': 'Jupiler Pro League', 'Campeonato Brasileiro Série A': 'Brasileirão', 'AFA Liga Profesional de Fútbol': 'Liga Profesional (Argentinië)', 'Major League Soccer': 'MLS', 'J1 League': 'J1 League (Japan)' };
const leagueName = (n) => LEAGUE_NAMES[n] || n;

function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id !== 'home' && typeof stopReelLoop === 'function') stopReelLoop();
  document.body.classList.toggle('in-game', id === 'game');
}

let toastT;
function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}

async function rpc(fn, args = {}) {
  const t0 = Date.now();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  if (data && data.server_now) syncClock(Date.parse(data.server_now), Date.now() - t0);
  return data;
}

// Klok gelijkzetten met de server zonder te springen: we bewaren de laatste metingen,
// vertrouwen de snelste (kleinste vertraging) en schuiven de klok er rustig naartoe.
const clockSamples = [];
let clockTarget = null;
function syncClock(serverMs, rtt) {
  clockSamples.push({ off: serverMs - (Date.now() - rtt / 2), rtt });
  if (clockSamples.length > 10) clockSamples.shift();
  const best = clockSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  clockTarget = best.off;
  if (clockSamples.length === 1 || Math.abs(clockTarget - S.offset) > 1500) S.offset = clockTarget;
}
setInterval(() => {
  if (clockTarget == null) return;
  const d = clockTarget - S.offset;
  S.offset += Math.max(-8, Math.min(8, d));   // max 8 ms per 100 ms bijsturen: onzichtbaar
}, 100);

// ---------- geluid ----------
let ac;
function beep(freq = 660, dur = 0.12, type = 'sine', vol = 0.15) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  } catch { /* geen audio */ }
}
const sfx = {
  tick: () => beep(520, 0.09, 'square', 0.08),
  go: () => beep(880, 0.25, 'square', 0.1),
  good: (m = 1) => { const f = [1, 1.26, 1.5][Math.min(3, m) - 1]; beep(660 * f, 0.1); setTimeout(() => beep(990 * f, 0.22), 90); if (m >= 3) setTimeout(() => beep(1320, 0.25), 200); },
  bad: () => beep(170, 0.22, 'sawtooth', 0.08),
  lose: () => { beep(330, 0.15, 'triangle'); setTimeout(() => beep(220, 0.3, 'triangle'), 140); },
};

// ---------- muziek ----------
// Twee bronnen: (1) een eigen audiobestand als dat in de repo staat (MUSIC_FILE) — het meest
// betrouwbaar; (2) anders de YouTube-speler. YouTube speelt alleen als de speler minstens
// 200x200 px groot is, daarom staat hij onzichtbaar achter de pagina op volle grootte.
const MUSIC_IDS = [MUSIC_VIDEO_ID, ...MUSIC_FALLBACK_IDS];
let yt = null, ytReady = false, ytIdx = 0, ytErr = null, musicWanted = false, muted = false;
let audio = null;            // HTMLAudioElement als er een bestand is

if (MUSIC_FILE) {
  const a = new Audio();
  a.preload = 'auto'; a.loop = true; a.src = MUSIC_FILE;
  a.addEventListener('canplay', () => { audio = a; }, { once: true });
}

window.onYouTubeIframeAPIReady = () => {
  yt = new YT.Player('yt', {
    width: 320, height: 240, videoId: MUSIC_IDS[0],
    playerVars: { autoplay: 0, start: MUSIC_START_SECONDS, controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin },
    events: {
      onReady: () => { ytReady = true; if (musicWanted && !audio) startMusic(); },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) { if (musicWanted) nextTrack(); }
        if (e.data === YT.PlayerState.PLAYING) { plFails = 0; updateMusicUi(); }
      },
      onError: (e) => {
        if (plMode) { if (++plFails < PLAYLIST.length) nextTrack(); else updateMusicUi(); return; }
        ytErr = e.data;
        ytIdx++;
        if (ytIdx < MUSIC_IDS.length) {
          yt.loadVideoById({ videoId: MUSIC_IDS[ytIdx], startSeconds: MUSIC_START_SECONDS });
        } else {
          console.warn('YouTube-muziek geblokkeerd, foutcode', e.data);
          if (musicWanted) nextTrack(); else updateMusicUi();
        }
      },
    },
  });
};
if (window.YT && window.YT.Player) window.onYouTubeIframeAPIReady();

function musicPlaying() {
  if (audio) return !audio.paused && !audio.muted;
  try { return ytReady && yt.getPlayerState() === YT.PlayerState.PLAYING && !yt.isMuted(); } catch { return false; }
}

// "ontgrendelen" bij de eerste klik (LOGIN): stil starten, zodat het geluid er bij Enter meteen is
function unlockMusic() {
  if (audio) { audio.volume = 0; audio.play().then(() => { if (!musicWanted) { audio.pause(); audio.volume = 1; } }).catch(() => {}); return; }
  if (ytReady) try { yt.unMute(); yt.setVolume(0); yt.playVideo(); } catch { /* */ }
}

// moet binnen een klik/toets-handler aangeroepen worden
function startMusic() {
  musicWanted = true; muted = false;
  $('#btn-mute').classList.remove('off');
  if (audio) {
    audio.currentTime = MUSIC_START_SECONDS; audio.volume = 0; audio.muted = false;
    audio.play().catch(() => {});
  } else if (ytReady) {
    try { if (!plMode) yt.seekTo(MUSIC_START_SECONDS, true); yt.unMute(); yt.setVolume(0); yt.playVideo(); } catch { /* */ }
  }
  fadeIn(1000);
  setTimeout(updateMusicUi, 1500);
  setTimeout(updateMusicUi, 4000);
}
// zacht aanzwellen zodat de muziek niet abrupt binnenvalt
let fadeTimer = null, targetVol = 100;
function fadeIn(ms) {
  clearInterval(fadeTimer);
  const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const f = Math.min(1, (performance.now() - t0) / ms);
    const v = Math.round(targetVol * f * f);
    if (audio) audio.volume = v / 100; else if (ytReady) try { yt.setVolume(v); } catch { /* */ }
    if (f >= 1) clearInterval(fadeTimer);
  }, 40);
}
// ---- playlist: na het intronummer volgen de FIFA-nummers, met een korte overgang ----
let plQueue = [], plMode = false, plFails = 0, xfading = false, lastTrack = null;
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function setNowPlaying(t) {
  $('#music .music-title').textContent = t.title;
  $('#music .music-artist').textContent = t.artist;
}
function nextTrack() {
  if (!ytReady || !PLAYLIST.length) return;
  if (!plQueue.length) { plQueue = shuffled(PLAYLIST); if (plQueue[0].id === lastTrack && plQueue.length > 1) plQueue.push(plQueue.shift()); }
  const t = plQueue.shift();
  lastTrack = t.id; plMode = true; xfading = false;
  clearInterval(fadeTimer);
  setNowPlaying(t);
  try { yt.setVolume(0); yt.loadVideoById({ videoId: t.id, startSeconds: t.start || 0 }); } catch { /* */ }
  fadeIn(1500);
}
function fadeOutThen(ms, done) {
  clearInterval(fadeTimer);
  const t0 = performance.now(), from = targetVol;
  fadeTimer = setInterval(() => {
    const f = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
    try { yt.setVolume(Math.round(from * (1 - f))); } catch { /* */ }
    if (f >= 1) { clearInterval(fadeTimer); done(); }
  }, 40);
}
// net voor het einde van een nummer uitfaden en het volgende starten
setInterval(() => {
  if (audio || !ytReady || !musicWanted || xfading) return;
  try {
    // browsers dempen soms een automatisch gestart volgend nummer: weer aanzetten
    if (plMode && !muted && yt.isMuted()) { yt.unMute(); yt.playVideo(); }
    if (yt.getPlayerState() !== YT.PlayerState.PLAYING) return;
    const d = yt.getDuration(), c = yt.getCurrentTime();
    if (d > 30 && d - c < 2.6) { xfading = true; fadeOutThen(muted ? 0 : 2200, nextTrack); }
  } catch { /* */ }
}, 250);

function updateMusicUi() {
  if (!musicWanted || muted) { $('#music-fix').hidden = true; return; }
  const ok = musicPlaying();
  const fix = $('#music-fix');
  fix.hidden = ok;
  if (!ok) fix.textContent = (ytErr && !audio && ytIdx >= MUSIC_IDS.length)
    ? 'YouTube laat deze muziek hier niet afspelen — zie README'
    : 'Tik hier om de muziek te starten';
}
$('#music-fix').addEventListener('click', (e) => { e.stopPropagation(); startMusic(); });
function musicVolume(v) {
  targetVol = v;
  if (muted || xfading) return;
  if (audio) audio.volume = v / 100;
  else if (ytReady) try { yt.setVolume(v); } catch { /* */ }
}
function setMuted(m) {
  muted = m;
  $('#btn-mute').classList.toggle('off', m);
  if (audio) { audio.muted = m; if (!m) audio.play().catch(() => {}); }
  else if (ytReady) { if (m) yt.mute(); else { yt.unMute(); yt.playVideo(); } }
  updateMusicUi();
}
$('#btn-mute').addEventListener('click', () => { if (!musicWanted) startMusic(); else setMuted(!muted); });

// ---------- home: login → montage → logo → welkom → menu ----------
const home = $('#home');
const phase = (p) => { home.dataset.phase = p; $('#music').classList.toggle('dim', ['reel', 'zoom', 'logo', 'welcome'].includes(p)); };
const reelItems = [];      // { el, kind, item, video? }
let reelMeta = {};         // bestandsnaam -> { webm, mp4, artist, license, page }
let photoBy = {};          // spelersnaam -> foto-url
let zoomStart = null, geomRaf = null, loopTimer = null;
const ZOOM_MS = 1800;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function prepareReel() {
  // video-URL's en licenties ophalen bij Wikimedia Commons
  const files = [...new Set(REEL.filter((r) => r.file).map((r) => r.file))];
  try {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=videoinfo&viprop=url|extmetadata|derivatives&titles='
      + encodeURIComponent(files.map((f) => 'File:' + f).join('|'));
    const j = await fetch(url).then((r) => r.json());
    const norm = {}; (j.query.normalized || []).forEach((n) => { norm[n.to] = n.from; });
    const small = innerWidth < 1200;
    for (const p of Object.values(j.query.pages)) {
      const v = p.videoinfo?.[0]; if (!v) continue;
      const ds = v.derivatives || [];
      const pick = (re) => ds.find((d) => re.test(d.transcodekey || ''))?.src;
      const em = v.extmetadata || {};
      reelMeta[(norm[p.title] || p.title).replace(/^File:/, '')] = {
        webm: small ? (pick(/480p\.vp9\.webm/) || pick(/360p\.vp9\.webm/)) : (pick(/1080p\.vp9\.webm/) || pick(/720p\.vp9\.webm/) || pick(/480p\.vp9\.webm/)),
        mp4: pick(/360p\.mpeg4/) || pick(/mp4/),
        artist: (em.Artist?.value || '').replace(/<[^>]+>/g, '').trim(),
        license: em.LicenseShortName?.value || '', page: v.descriptionurl,
      };
    }
  } catch { /* zonder video's: foto's als reserve */ }
  // reservefoto's uit onze eigen database
  try {
    const names = [...new Set(REEL.map((r) => r.player || r.photo).filter(Boolean))];
    const { data } = await sb.from('players').select('name,photo_url,photo_author,photo_license,photo_page').in('name', names);
    (data || []).forEach((p) => { photoBy[p.name] = p; });
  } catch { /* */ }
  buildCredits();
}

// ---- intro: één vooraf gemonteerde video (fade uit zwart, harde cuts, scherp), ----
// ---- al volledig geladen terwijl je je naam typt: geen zwart gat, geen haperen.  ----
const INTRO_SRC = (Math.max(screen.width, screen.height) * (devicePixelRatio || 1) >= 1700 && !navigator.connection?.saveData)
  ? 'media/intro-1080.mp4?v=3' : 'media/intro-720.mp4?v=3';
const introVid = document.createElement('video');
introVid.muted = true; introVid.playsInline = true; introVid.preload = 'auto';
introVid.setAttribute('muted', ''); introVid.setAttribute('playsinline', '');
introVid.className = 'intro-vid';
$('#reel-clips').appendChild(introVid);
fetch(INTRO_SRC).then((r) => (r.ok ? r.blob() : Promise.reject()))
  .then((b) => { if (!introVid.src) { introVid.src = URL.createObjectURL(b); introVid.load(); } })
  .catch(() => { if (!introVid.src) introVid.src = INTRO_SRC; });
// eerste beeld: Ronaldo's zwarte shirt; de camera komt uit de stof (6x ingezoomd) en zoomt uit
const VID_FABRIC = { x: 0.15, y: 0.72 };   // punt op zijn shirt, in de video (0..1)
function playIntroVideo(fromShirt) {
  if (!introVid.src) introVid.src = INTRO_SRC;          // nog niet volledig binnen: dan streamen
  try { introVid.currentTime = 0; } catch { /* */ }
  introVid.style.transition = 'none';
  introVid.style.filter = '';
  if (fromShirt) {
    // waar ligt dat punt op het scherm (object-fit: contain of cover)?
    const W = innerWidth, H = innerHeight, vr = 1920 / 816;
    const cover = getComputedStyle(introVid).objectFit === 'cover';
    let cw = W, ch = W / vr;
    if (cover ? ch < H : ch > H) { ch = H; cw = H * vr; }
    const ox = (W - cw) / 2 + VID_FABRIC.x * cw, oy = (H - ch) / 2 + VID_FABRIC.y * ch;
    introVid.style.transformOrigin = `${ox}px ${oy}px`;
    introVid.style.transform = 'scale(6)';
    introVid.style.filter = 'blur(6px)';
    void introVid.offsetWidth;
    introVid.style.transition = 'transform 1.7s cubic-bezier(.15,.75,.2,1), filter 1.1s ease-out';
    requestAnimationFrame(() => { introVid.style.transform = 'scale(1)'; introVid.style.filter = 'blur(0)'; });
  } else {
    introVid.style.transform = '';
  }
  introVid.play().catch(() => {});
}
function resetShirt() {
  const rug = $('#rug'); rug.classList.remove('stamp');
  rug.style.transition = 'none'; rug.style.transform = ''; rug.style.filter = '';
  $('#login-form .btn-start').style.opacity = '';
}
// SPELEN: de naam wordt erop gedrukt, dan vliegt de camera de stof in
function flyIntoShirt() {
  return new Promise((done) => {
    const rug = $('#rug');
    rug.classList.add('stamp');
    const btn = $('#login-form .btn-start'); btn.style.opacity = '0';
    setTimeout(() => {
      // punt net onder de naam, midden van de rug (in beeldcoördinaten van de foto)
      const r = rug.getBoundingClientRect(), s = Math.max(r.width / 1672, r.height / 941);
      const ox = r.width / 2 + (836 - 836) * s, oy = r.height / 2 + (520 - 470.5) * s;
      rug.style.transformOrigin = `${ox}px ${oy}px`;
      rug.style.transition = 'transform 1.05s cubic-bezier(.55,0,.85,.35), filter 1.05s ease-in';
      rug.style.transform = 'scale(9)';
      rug.style.filter = 'blur(5px) brightness(.7)';
      setTimeout(done, 900);
    }, 320);
  });
}

// Drie video-spelers die om beurt het volgende fragment klaarzetten (laden + spoelen).
// Zo laadt de browser maar 3 streams tegelijk en hapert er niets.
const POOL = 3;
const slots = [];          // { el, video, want: clipIndex|null, ready }
let curSlot = null;

function buildReel() {
  const box = $('#reel-clips'); box.innerHTML = '';
  REEL.forEach((item) => reelItems.push({ item }));
  for (let k = 0; k < POOL; k++) {
    const el = document.createElement('div'); el.className = 'clip';
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    el.appendChild(video); box.appendChild(el);
    const slot = { el, video, want: null, ready: false, file: null };
    video.addEventListener('seeked', () => { if (slot.want != null && video.readyState >= 3) slot.ready = true; });
    video.addEventListener('canplay', () => { if (slot.want != null && Math.abs(video.currentTime - REEL[slot.want].t) < 0.6) slot.ready = true; });
    slots.push(slot);
  }
  prepare(0); prepare(1); prepare(2);
}

function srcFor(file) {
  const m = reelMeta[file]; if (!m) return null;
  const canWebm = document.createElement('video').canPlayType('video/webm; codecs="vp9"');
  return (canWebm && m.webm) || m.mp4 || m.webm;
}

// zet fragment i klaar in een vrije speler
function prepare(i) {
  i = ((i % REEL.length) + REEL.length) % REEL.length;
  if (slots.some((s) => s.want === i)) return;
  const free = slots.find((s) => s !== curSlot && !slots.some(() => false) && (s.want == null || !isUpcoming(s.want)));
  const slot = free || slots.find((s) => s !== curSlot);
  if (!slot) return;
  const item = REEL[i]; const src = srcFor(item.file); if (!src) return;
  slot.want = i; slot.ready = false;
  if (slot.file !== src) { slot.file = src; slot.video.src = src; slot.video.addEventListener('loadedmetadata', () => { if (slot.want === i) slot.video.currentTime = item.t; }, { once: true }); }
  else { try { slot.video.currentTime = item.t; } catch { /* */ } }
}
let shownIdx = -1;
function isUpcoming(i) { const n = REEL.length; return i === (shownIdx + 1) % n || i === (shownIdx + 2) % n; }

// toon fragment i als het klaar is; anders false (dan blijft het huidige fragment lopen)
function showClip(i) {
  i = ((i % REEL.length) + REEL.length) % REEL.length;
  const slot = slots.find((s) => s.want === i && s.ready);
  if (!slot) { prepare(i); return false; }
  const prev = curSlot;
  curSlot = slot; shownIdx = i;
  try { slot.video.play().catch(() => {}); } catch { /* */ }
  slot.el.classList.remove('on'); void slot.el.offsetWidth; slot.el.classList.add('on');
  if (prev && prev !== slot) { prev.el.classList.remove('on'); setTimeout(() => { if (curSlot !== prev) { prev.video.pause(); prev.want = null; prev.ready = false; prepare(i + 1); prepare(i + 2); } }, 250); }
  prepare(i + 1); prepare(i + 2);
  return true;
}

// in de O / het menu: om de zoveel tijd het volgende fragment
function startLoop(ms) {
  clearInterval(loopTimer);
  loopTimer = setInterval(() => { showClip(shownIdx + 1); }, ms);
}

function buildCredits() {
  const seen = new Set(); const rows = [];
  for (const r of REEL) {
    if (r.file && reelMeta[r.file] && !seen.has(r.file)) { seen.add(r.file); const m = reelMeta[r.file]; rows.push(`<a href="${esc(m.page)}" target="_blank" rel="noopener">${esc(r.file.replace(/\.(webm|ogv)$/, ''))}</a> — ${esc(m.artist)} (${esc(m.license)})`); }
    const ph = photoBy[r.photo]; if (ph && !seen.has(ph.photo_url)) { seen.add(ph.photo_url); rows.push(`Foto ${esc(ph.name)} — ${esc(ph.photo_author || '')} (${esc(ph.photo_license || '')})`); }
  }
  rows.push('Achtergrond: Lionel Messi, Cristiano Ronaldo, Luka Modrić, Nico Paz — Bryan Berlin (allen CC BY-SA 4.0, Wikimedia Commons).');
  rows.push('Spelersfoto\'s: Wikimedia Commons, fotograaf en licentie staan onder elke foto in het spel.');
  rows.push('Muziek: Joy Crookes — Feet Don\'t Fail Me Now (via YouTube).');
  $('#credits').innerHTML = rows.join('<br>');
}

let reelTimer = null, syncTimer = null, introT0 = 0;
const LOGO_MS = 1000, WELCOME_LEAD = 1.7;            // seconden vóór het refrein dat "Welkom" verschijnt
const ZOOM_LEAD = (ZOOM_MS + LOGO_MS) / 1000 + WELCOME_LEAD;

// tijd in het nummer; valt terug op de verstreken tijd als de muziek (nog) niet speelt
function songTime() {
  const elapsed = (performance.now() - introT0) / 1000;
  let t = null;
  try {
    if (audio && !audio.paused) t = audio.currentTime;
    else if (ytReady && yt.getPlayerState() === YT.PlayerState.PLAYING) t = yt.getCurrentTime();
  } catch { /* */ }
  // geen muziek, of na 40 s nog altijd niet bij het refrein (bv. reclame): op de klok verder
  if (t == null || t < MUSIC_START_SECONDS - 1 || elapsed > 40) t = Math.max(t ?? 0, MUSIC_START_SECONDS + elapsed);
  return t;
}

function syncIntro() {
  const p = home.dataset.phase, t = songTime();
  if (p === 'reel' && t >= CHORUS_AT - ZOOM_LEAD) startZoom();
  else if (p === 'logo' && t >= CHORUS_AT - WELCOME_LEAD) { phase('welcome'); $('#btn-skip').hidden = true; }
  else if (p === 'welcome' && t >= CHORUS_AT - 0.05) { clearInterval(syncTimer); syncTimer = null; toMenu(); }
}

function flash() { const fl = $('#reel-flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); }

function playReel(fromShirt) {
  phase('reel');
  $('#btn-skip').hidden = false;
  introT0 = performance.now();
  playIntroVideo(fromShirt);
  setTimeout(resetShirt, 800);
  clearInterval(syncTimer);
  syncTimer = setInterval(syncIntro, 50);
}

function startZoom() {
  clearTimeout(reelTimer);
  phase('zoom');
  zoomStart = performance.now();
  geomLoop();
  setTimeout(() => { if (home.dataset.phase === 'zoom') phase('logo'); }, ZOOM_MS);
}

// Uitzoomen door de O van "OFF". Een schermvullende SVG zoomt via zijn viewBox (vector, dus altijd
// scherp) van in het gat van de O naar het schild op zijn eindplaats. Het videobeeld zit in het gat
// en vervaagt naar zwart tegen dat de zoom klaar is.
const O_CX = 88, O_CY = 198, HOLE_RX = 14, HOLE_RY = 23;   // gat in de O (SVG-eenheden van het logo)
let zoomSvg = null;
function ensureZoomSvg() {
  if (zoomSvg) return zoomSvg;
  zoomSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  zoomSvg.id = 'zoom-svg';
  zoomSvg.setAttribute('preserveAspectRatio', 'none');
  zoomSvg.innerHTML = $('#logo-svg').innerHTML.replace(/id="o-shape"/, '');
  $('#reel').after(zoomSvg);
  return zoomSvg;
}
function geomLoop() {
  cancelAnimationFrame(geomRaf);
  const reel = $('#reel'), svg = ensureZoomSvg(), wrap = $('#logo-wrap');
  wrap.style.transform = '';
  const step = () => {
    const p = home.dataset.phase;
    if (!home.classList.contains('active')) { geomRaf = null; return; }
    const L = $('#logo-svg').getBoundingClientRect();
    const s1 = L.width / 240;                                   // eindschaal (px per SVG-eenheid)
    const ox = L.left + O_CX * s1, oy = L.top + O_CY * s1;      // plaats van de O op het scherm
    const s0 = (Math.hypot(innerWidth, innerHeight) * 1.1) / (2 * HOLE_RX);
    let e = 1;
    if (p === 'zoom' && zoomStart != null) e = ease(Math.min(1, (performance.now() - zoomStart) / ZOOM_MS));
    const sc = Math.exp(Math.log(s0) * (1 - e) + Math.log(s1) * e);   // logaritmisch: voelt als echte zoom
    const W = innerWidth / sc, H = innerHeight / sc;
    svg.setAttribute('viewBox', `${O_CX - ox / sc} ${O_CY - oy / sc} ${W} ${H}`);
    reel.style.clipPath = `ellipse(${HOLE_RX * sc}px ${HOLE_RY * sc}px at ${ox}px ${oy}px)`;
    reel.style.opacity = String(Math.max(0, 1 - Math.pow(e, 0.8)));
    const zooming = p === 'zoom' && e < 1;
    svg.style.display = zooming ? 'block' : 'none';
    wrap.style.visibility = zooming ? 'hidden' : '';
    if (!zooming && p !== 'zoom') { stopReelLoop(); geomRaf = null; return; }
    geomRaf = requestAnimationFrame(step);
  };
  step();
}

function toMenu() {
  if (home.dataset.phase === 'menu') return;
  clearInterval(syncTimer); syncTimer = null;
  $('#btn-skip').hidden = true;
  phase('menu');
  if (!geomRaf) geomLoop();
  musicVolume(70);
  loadOptions();
  const code = new URLSearchParams(location.search).get('room');
  if (code && !S.code) { $('#menu-main').hidden = true; $('#menu-multi').hidden = false; $('#in-code').value = code.toUpperCase(); joinCode(code); }
}

function skipIntro() {
  // naar net vóór het refrein springen: menu verschijnt dan alsnog op "Feet, don't fail me now"
  const target = CHORUS_AT - WELCOME_LEAD - 0.2;
  try {
    if (audio && !audio.paused) audio.currentTime = target;
    else if (ytReady) yt.seekTo(target, true);
  } catch { /* */ }
  introT0 = performance.now() - (target - MUSIC_START_SECONDS) * 1000;
  if (home.dataset.phase === 'reel') startZoom();
  zoomStart = performance.now() - ZOOM_MS;
  phase('welcome');
  geomLoop();
  $('#btn-skip').hidden = true;
  if (!syncTimer) syncTimer = setInterval(syncIntro, 50);
}

// login
$('#in-name').value = S.name;
$('#switch-name').textContent = S.name;
function openLogin() {
  $('#btn-login').hidden = true;
  $('#login-form').hidden = false;
  $('#in-name').focus();
  $('#in-name').select();
}
$('#btn-login').addEventListener('click', () => { unlockMusic(); openLogin(); });
// naam live op de rug: tekst langs de schouders, vervormd door de stof (SVG-filter), blinkend streepje
function paintShirt() {
  const v = $('#in-name').value.replace(/\s+/g, ' ').toUpperCase();
  const t = $('#rug-name'), txt = $('#rug-text'), caret = $('#rug-caret');
  t.textContent = v;
  let size = 150; txt.setAttribute('font-size', size);
  try {
    const maxW = 800;
    const w = txt.getComputedTextLength();
    if (w > maxW) { size = Math.max(62, size * maxW / w); txt.setAttribute('font-size', size.toFixed(1)); }
    // streepje achter de laatste letter (of in het midden als het leeg is)
    let x = 836, y = 372;
    if (v.length) { const p = txt.getEndPositionOfChar(v.length - 1); x = p.x + 8; y = p.y; }
    caret.setAttribute('height', (size * 0.84).toFixed(1));
    caret.setAttribute('x', x.toFixed(1));
    caret.setAttribute('y', (y - size * 0.8).toFixed(1));
  } catch { /* */ }
  $('#login-form .btn-start').disabled = v.trim().length < 2;
}
document.fonts?.ready?.then(paintShirt);
$('#login').addEventListener('click', (e) => { if (!e.target.closest('button')) $('#in-name').focus(); });
$('#in-name').addEventListener('input', paintShirt);
let musicUnlocked = false;
const unlockOnce = () => { if (!musicUnlocked) { musicUnlocked = true; unlockMusic(); } };
['pointerdown', 'keydown'].forEach((ev) => $('#login').addEventListener(ev, unlockOnce));
paintShirt();
setTimeout(() => { if (home.dataset.phase === 'login') $('#in-name').focus(); }, 300);
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const n = $('#in-name').value.trim();
  if (!n) { const i = $('#in-name'); i.classList.remove('shake'); void i.offsetWidth; i.classList.add('shake'); i.focus(); return; }
  S.name = n; localStorage.setItem('fo_name', n);
  $('#welcome-name').textContent = n;
  $('#switch-name').textContent = n;
  $('#in-name').blur();
  // alles wat een klik nodig heeft gebeurt hier meteen
  try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* */ }
  startMusic();
  $('#music').hidden = false;
  if (inviteOk && !S.code) {
    // uitgenodigd: geen montage, meteen naar de lobby van de uitnodiger
    rpc('join_room', { p_code: INVITE, p_name: S.name, p_token: S.token })
      .then((room) => { musicVolume(70); enterRoom(room, false); })
      .catch((err) => { toast(err.message || 'Deze kamer is niet meer beschikbaar'); inviteOk = false; playReel(); });
    return;
  }
  // eerst 1 seconde zodat het scherm naar volledig scherm kan gaan, dan pas de stof in
  $('#login-form .btn-start').disabled = true;
  setTimeout(() => flyIntoShirt().then(() => playReel(true)), 1000);
});
document.addEventListener('keydown', (e) => {
  if (!home.classList.contains('active')) return;
  const p = home.dataset.phase;
  if (p === 'welcome') { e.preventDefault(); toMenu(); }
});
home.addEventListener('click', (e) => { if (home.dataset.phase === 'welcome' && !e.target.closest('#btn-skip')) toMenu(); });
$('#btn-skip').addEventListener('click', (e) => { e.stopPropagation(); skipIntro(); });
$('#btn-switch').addEventListener('click', () => {
  clearInterval(loopTimer); loopTimer = null;
  $('#reel').style.clipPath = ''; $('#reel').style.opacity = ''; $('#logo-wrap').style.transform = ''; if (zoomSvg) zoomSvg.style.display = 'none';
  $('#btn-login').hidden = true; $('#login-form').hidden = false;
  phase('login'); $('#in-name').select(); $('#in-name').focus();
});
$('#btn-credits').addEventListener('click', () => { $('#credits').hidden = !$('#credits').hidden; });
prepareReel();

// ---------- menu ----------
function needName() {
  if (!S.name) { toast('Log eerst in met je naam'); return true; }
  return false;
}

$('#btn-create').addEventListener('click', async () => {
  if (needName()) return;
  try { enterRoom(await rpc('create_room', { p_name: S.name, p_token: S.token, p_mode: S.draftMode, p_rounds: S.draftRounds }), false); }
  catch (e) { toast(e.message); }
});
$('#btn-multi').addEventListener('click', () => { $('#menu-main').hidden = true; $('#menu-multi').hidden = false; });
$('#btn-back').addEventListener('click', () => { $('#menu-multi').hidden = true; $('#menu-main').hidden = false; });
$('#btn-single').addEventListener('click', async () => {
  try { enterRoom(await rpc('create_room', { p_name: S.name || 'Ik', p_token: S.token, p_mode: S.draftMode, p_rounds: S.draftRounds }), true); }
  catch (e) { toast(e.message); }
});
$('#btn-join').addEventListener('click', () => joinCode($('#in-code').value));
$('#in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCode(e.target.value); });

async function joinCode(code) {
  code = (code || '').trim().toUpperCase();
  if (code.length !== 4) { toast('Een code heeft 4 tekens'); return; }
  if (needName()) return;
  try { enterRoom(await rpc('join_room', { p_code: code, p_name: S.name, p_token: S.token }), false); }
  catch (e) { toast(e.message); }
}

function stopReelLoop() {
  clearInterval(loopTimer); loopTimer = null;
  try { introVid.pause(); } catch { /* */ }
}

function backHome() {
  show('home');
  phase('menu');
  $('#reel').style.opacity = '0';
}

async function loadOptions() {
  if (S.options) return S.options;
  try {
    S.options = await rpc('mode_options');
    const c = S.options.counts;
    $('#db-stats').textContent = `${c.alles.toLocaleString('nl-BE')} voetballers · ${S.options.leagues?.length || 0} competities`;
  } catch { /* */ }
  return S.options;
}

// ---------- kamer ----------
function enterRoom(room, solo) {
  S.code = room.code; S.slot = room.slot; S.solo = solo;
  S.shownRound = 0; S.revealedRound = 0; S.lastWrongAt = null; S.lastStatus = null;
  history.replaceState(null, '', solo ? location.pathname : `?room=${room.code}`);
  subscribe();
  applyRoom(room);
}

function subscribe() {
  if (S.channel) sb.removeChannel(S.channel);
  S.channel = sb.channel(`room-${S.code}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${S.code}` }, (p) => applyRoom(p.new))
    .subscribe();
  clearInterval(S.tickTimer);
  S.tickTimer = setInterval(async () => {
    try { applyRoom(await rpc('tick', { p_code: S.code })); } catch { /* */ }
  }, 1000);
}

function leaveRoom() {
  if (S.channel) sb.removeChannel(S.channel);
  clearInterval(S.tickTimer);
  S.code = null; S.room = null;
  history.replaceState(null, '', location.pathname);
  musicVolume(70);
  backHome();
}

function applyRoom(r) {
  if (!r || r.code !== S.code) return;
  // negeer oudere realtime-berichten
  if (S.room && r.updated_at && S.room.updated_at && Date.parse(r.updated_at) < Date.parse(S.room.updated_at)) return;
  S.room = { ...S.room, ...r };
  const st = S.room.status;
  if (st === 'lobby') renderLobby();
  else if (st === 'playing' || st === 'reveal') renderGame();
  else if (st === 'finished') renderEnd();
  S.lastStatus = st;
}

// ---------- lobby ----------
const isHost = () => S.slot === 1;

function renderLobby() {
  const r = S.room;
  if (!$('#lobby').classList.contains('active')) { show('lobby'); musicVolume(70); buildModePicker(); }
  $('#lobby-code').textContent = S.solo ? 'SOLO' : r.code;
  $('#invite-box').hidden = S.solo || !!r.guest_name || !isHost();
  if (!$('#invite-box').hidden) updateInvite();
  $('#lobby-p1 .pname').textContent = r.host_name;
  const p2 = $('#lobby-p2');
  p2.classList.toggle('waiting', !r.guest_name);
  p2.querySelector('.pname').textContent = S.solo ? 'Oefenmodus' : (r.guest_name || 'Wachten…');
  p2.querySelector('.ptag').textContent = S.solo ? 'Alleen jij' : (r.guest_name ? 'Klaar' : 'Deel de code');
  renderHandicaps(r);
  $('#mode-picker').hidden = !isHost();
  $('#mode-readonly').hidden = isHost();
  $('#mode-readonly').innerHTML = `<div class="label">Spelmodus</div><b>${esc(leagueName(r.mode_label))}</b> · ${r.total_rounds} rondes<br><span class="small muted">De host kiest de modus</span>`;
  const rec = S.solo ? +(localStorage.getItem(recordKey(r)) || 0) : 0;
  $('#mode-summary').innerHTML = `Modus: <b>${esc(leagueName(r.mode_label))}</b> · ${r.total_rounds} rondes`
    + (S.solo ? `<br><span class="record">${rec ? `Jouw record: <b>${rec}</b>` : 'Nog geen record in deze modus'}</span>` : '');
  $('#mode-summary').hidden = !isHost();
  $('#btn-go').hidden = !isHost();
  $('#btn-go').disabled = !S.solo && !r.guest_name;
  $('#lobby-hint').textContent = isHost()
    ? (S.solo || r.guest_name ? '' : 'Wacht tot je tegenstander meedoet, of deel de link.')
    : 'Wachten tot de host start…';
}

// handicap: een speler mag pas na X seconden raden (host stelt in)
const HC_OPTS = [0, 3, 5, 8, 10, 15];
function renderHandicaps(r) {
  $$('.pcard .hc').forEach((el) => {
    const slot = +el.dataset.slot;
    const val = (slot === 1 ? r.host_handicap : r.guest_handicap) || 0;
    const show = !S.solo && (slot === 1 || r.guest_name);
    if (!show) { el.innerHTML = ''; return; }
    if (isHost()) {
      const html = `<label>Handicap <select data-slot="${slot}">${HC_OPTS.map((o) => `<option value="${o}" ${o === val ? 'selected' : ''}>${o ? o + ' s' : 'geen'}</option>`).join('')}</select></label>`;
      if (el._v !== html) { el.innerHTML = html; el._v = html; }
    } else {
      el.innerHTML = val ? `Handicap: ${val} s` : ''; el._v = '';
    }
  });
}
$('#lobby').addEventListener('change', async (e) => {
  const sel = e.target.closest('.hc select'); if (!sel) return;
  try { applyRoom(await rpc('set_handicap', { p_code: S.code, p_token: S.token, p_slot: +sel.dataset.slot, p_secs: +sel.value })); }
  catch (err) { toast(err.message); }
});

async function buildModePicker() {
  const opts = await loadOptions();
  const r = S.room;
  S.draftMode = r.mode || { type: 'bekend' };
  S.draftRounds = r.total_rounds;
  $$('#mode-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.type === S.draftMode.type));
  $$('#rounds button').forEach((b) => b.classList.toggle('active', +b.dataset.r === S.draftRounds));
  renderModeSub(opts);
}

function renderModeSub(opts) {
  const sub = $('#mode-sub');
  const m = S.draftMode;
  const leagues = opts?.leagues || [];
  const countries = opts?.countries || [];
  const c = opts?.counts || {};
  const sel = (id, items, val, label) =>
    `<select id="${id}">${items.map((i) => `<option value="${esc(i.value)}" ${i.value === val ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</select>`;
  if (m.type === 'league') {
    if (!m.value) m.value = (leagues.find((l) => l.name === 'Belgian Pro League') || leagues[0])?.name;
    sub.innerHTML = sel('sel-league', leagues.map((l) => ({ value: l.name, label: `${leagueName(l.name)} (${l.n})` })), m.value);
  } else if (m.type === 'club') {
    const lg = leagues.find((l) => l.clubs?.some((cl) => cl.id === m.value)) || leagues.find((l) => l.name === 'Belgian Pro League') || leagues[0];
    const clubs = lg?.clubs || [];
    if (!clubs.some((cl) => cl.id === m.value) && clubs[0]) m.value = clubs[0].id;
    sub.innerHTML = sel('sel-club-league', leagues.map((l) => ({ value: l.name, label: leagueName(l.name) })), lg?.name)
      + sel('sel-club', clubs.map((cl) => ({ value: cl.id, label: `${cl.name} (${cl.n})` })), m.value);
  } else if (m.type === 'country') {
    if (!m.value) m.value = countries.find((x) => x.name === 'België')?.name || countries[0]?.name;
    sub.innerHTML = sel('sel-country', countries.map((x) => ({ value: x.name, label: `${x.name} (${x.n})` })), m.value);
  } else {
    const txt = { ultra: `Alleen de allergrootste wereldsterren (${c.ultra || '…'} spelers). Perfect om te beginnen.`, bekend: `Sterren die nu spelen bij de topclubs van de wereld (${c.bekend || "…"} spelers).`, alles: `Alle ${c.alles || ''} actieve spelers uit 16 competities. Ook de onbekende, succes.`, legend: `Gestopte grootheden (${c.legend || '…'}).`, vrouwen: `Topspeelsters (${c.vrouwen || '…'}).` }[m.type];
    sub.innerHTML = `<div class="small muted">${txt || ''}</div>`;
  }
  $('#sel-league')?.addEventListener('change', (e) => { m.value = e.target.value; pushMode(); });
  $('#sel-country')?.addEventListener('change', (e) => { m.value = e.target.value; pushMode(); });
  $('#sel-club')?.addEventListener('change', (e) => { m.value = e.target.value; pushMode(); });
  $('#sel-club-league')?.addEventListener('change', (e) => {
    const lg = leagues.find((l) => l.name === e.target.value);
    m.value = lg?.clubs?.[0]?.id; renderModeSub(opts); pushMode();
  });
}

$('#mode-tabs').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  S.draftMode = { type: b.dataset.type };
  $$('#mode-tabs button').forEach((x) => x.classList.toggle('active', x === b));
  renderModeSub(await loadOptions());
  pushMode();
});
$('#rounds').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  S.draftRounds = +b.dataset.r;
  $$('#rounds button').forEach((x) => x.classList.toggle('active', x === b));
  pushMode();
});

let pushT;
function pushMode() {
  clearTimeout(pushT);
  pushT = setTimeout(async () => {
    try { applyRoom(await rpc('set_mode', { p_code: S.code, p_token: S.token, p_mode: S.draftMode, p_rounds: S.draftRounds })); }
    catch (e) { toast(e.message); }
  }, 150);
}

// ---- uitnodigen ----
const inviteUrl = () => `${location.origin}${location.pathname}?room=${S.code}`;
function updateInvite() { /* alleen kopiëren */ }
$('#btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(inviteUrl()); toast('Link gekopieerd'); }
  catch { prompt('Kopieer deze link', inviteUrl()); }
});
// wie via een uitnodiging binnenkomt: banner op het loginscherm, en na de naam meteen de kamer in
const INVITE = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
let inviteOk = false;
if (INVITE.length === 4) {
  rpc('tick', { p_code: INVITE }).then((r) => {
    if (r && r.status === 'lobby' && !r.guest_name) {
      inviteOk = true;
      $('#inv-host').textContent = r.host_name;
      $('#invite-banner').hidden = false;
    }
  }).catch(() => {});
}
$('#btn-leave').addEventListener('click', leaveRoom);
$('#btn-go').addEventListener('click', async () => {
  $('#btn-go').disabled = true;
  try { applyRoom(await rpc('start_game', { p_code: S.code, p_token: S.token })); }
  catch (e) { toast(e.message); $('#btn-go').disabled = false; }
});

// ---------- spel ----------
async function ensurePool() {
  const key = JSON.stringify(S.room.mode);
  if (S.poolKey === key) return;
  S.poolKey = key;
  try {
    const names = await rpc('pool_names', { p_mode: S.room.mode });
    S.pool = (names || []).map((n) => ({ n, k: norm(n) })).sort((a, b) => a.n.localeCompare(b.n));
  } catch { S.pool = []; }
}

// ---- foto's: vooraf laden, en pas tonen als ze echt binnen zijn ----
const photoCache = new Map();   // url -> Promise<boolean>
function preloadPhoto(url) {
  if (!url) return Promise.resolve(false);
  if (!photoCache.has(url)) {
    photoCache.set(url, new Promise((res) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(true));
      im.onerror = () => { photoCache.delete(url); res(false); };
      im.src = url;
    }));
  }
  return photoCache.get(url);
}
let photoToken = 0;
S.photoReady = false;
function setRoundPhoto(url) {
  const img = $('#photo');
  const my = ++photoToken;
  S.photoReady = false;
  // meteen onzichtbaar (zonder fade), anders schemert de nieuwe foto door tijdens het uitfaden
  img.style.transition = 'none';
  img.classList.remove('show');
  img.removeAttribute('src');                    // nooit de foto van de vorige ronde laten staan
  void img.offsetWidth;
  img.style.transition = '';
  $('#photo-wrap').classList.add('loading');
  preloadPhoto(url).then((ok) => {
    if (my !== photoToken) return;
    if (!ok) { setTimeout(() => { if (my === photoToken) setRoundPhoto(url); }, 800); return; }
    img.src = url;
    // foto past niet goed in het kader (breed, vierkant of klein)? dan helemaal tonen op een vage achtergrond van zichzelf
    const wrap = $('#photo-wrap');
    wrap.style.setProperty('--ph', `url("${url}")`);
    const fit = () => { if (my !== photoToken || !img.naturalWidth) return; const ar = img.naturalWidth / img.naturalHeight; wrap.classList.toggle('fit', ar > 0.86 || img.naturalWidth < 420); };
    if (img.complete && img.naturalWidth) fit(); else img.addEventListener('load', fit, { once: true });
    S.photoReady = true;
    wrap.classList.remove('loading');
  });
}

let raf;
function renderGame() {
  const r = S.room;
  if (!$('#game').classList.contains('active')) {
    show('game');
    musicVolume(18);
    ensurePool();
  }
  $('#game .scorebar').classList.toggle('solo', S.solo || !r.guest_name);
  $('#sb-p1 .nm').textContent = r.host_name;
  $('#sb-p2 .nm').textContent = r.guest_name || '';
  $('#sb-p1 .av').textContent = initials(r.host_name);
  $('#sb-p2 .av').textContent = initials(r.guest_name);
  $('#sb-p1').classList.toggle('me', S.slot === 1);
  $('#sb-p2').classList.toggle('me', S.slot === 2);
  setScore('#sb-p1 .sc', r.host_score);
  setScore('#sb-p2 .sc', r.guest_score);
  $('#sb-round').textContent = `RONDE ${r.round} / ${r.total_rounds}`;
  $("#sb-mode").textContent = leagueName(r.mode_label);
  // "Weet ik niet": solo meteen door, in PvP pas als jullie allebei passen
  {
    const sk = $('#btn-skipround'), duo = !S.solo && !!r.guest_name;
    const myPass = S.slot === 2 ? r.guest_pass : r.host_pass;
    const oppPass = S.slot === 2 ? r.host_pass : r.guest_pass;
    const opp = S.slot === 2 ? r.host_name : r.guest_name;
    sk.hidden = false;
    const playing = r.status === 'playing';
    sk.disabled = !playing || !!myPass;
    sk.textContent = !duo ? 'Weet ik niet' : myPass ? `Gepast · wacht op ${opp}` : oppPass ? 'Ik ook niet' : 'Weet ik niet';
    sk.classList.toggle('opp-passed', duo && !!oppPass && !myPass && playing);
    if (playing && myPass) { $('#in-guess').readOnly = true; $('#btn-guess').disabled = true; }
    const pk = r.round + ':' + (oppPass ? 1 : 0);
    if (duo && playing && oppPass && !myPass && S.oppPassToast !== pk) { S.oppPassToast = pk; toast(`${opp} weet het niet`); }
  }
  if (r.next_photo_url) preloadPhoto(r.next_photo_url);

  // nieuwe ronde
  if (r.round !== S.shownRound) {
    if (r.round <= 1 || !S.hist) S.hist = {};
    S.shownRound = r.round;
    $('#photo-wrap').classList.remove('revealed', 'hit');
    $('#pop').hidden = true;
    setRoundPhoto(r.photo_url);
    $('#credit').textContent = r.photo_credit ? `Foto: ${r.photo_credit} · Wikimedia Commons` : '';
    $('#hints').innerHTML = '';
    $('#reveal').hidden = true;
    $('#photo-wrap').classList.remove('win', 'lose');
    $('#in-guess').value = '';
    $('#in-guess').classList.remove('good');
    $('#in-guess').disabled = false;
    $('#btn-guess').disabled = false;
    closeAc();
    hintsShown = 0;
    renderStreak(r);
    lockUntil = 0; clearTimeout(lockGuess.t); $('.answer').classList.remove('locked'); $('#btn-guess').disabled = false; $('#in-guess').readOnly = false;
    scheduleRound(r);
    cancelAnimationFrame(raf);
    loop();
  }

  // tegenstander zat ernaast
  if (r.last_wrong && r.last_wrong.slot !== S.slot && r.last_wrong.at !== S.lastWrongAt) {
    S.lastWrongAt = r.last_wrong.at;
    toast(`${S.slot === 1 ? r.guest_name : r.host_name} zat ernaast`);
  }

  // onthulling
  if (r.status === 'reveal' && S.revealedRound !== r.round) {
    S.revealedRound = r.round;
    if (S.photoReady) $('#photo').classList.add('show');
    cdTimers.forEach(clearTimeout); cdTimers = [];
    $('#countdown').className = 'countdown'; $('#countdown').textContent = '';
    $('#reveal').hidden = false;
    $('#photo-wrap').classList.add('revealed');
    $('#reveal-name').textContent = r.reveal_name;
    const who = $('#reveal-who');
    S.hist[r.round] = r.round_winner ? (r.round_winner === S.slot ? 'me' : 'opp') : 'none';
    if (r.round_winner) {
      const nm = r.round_winner === 1 ? r.host_name : r.guest_name;
      const me = r.round_winner === S.slot;
      const m = r.round_mult || 1;
      who.className = `reveal-who ${me ? 'me' : 'p' + r.round_winner}`;
      who.textContent = me ? 'Jij had hem!' : `${nm} was sneller (+${r.round_points})`;
      $('#photo-wrap').classList.add(me ? 'win' : 'lose');
      if (me) celebrate(r, m); else sfx.lose();
    } else {
      who.className = 'reveal-who none';
      who.textContent = 'Niemand had hem…';
      sfx.bad();
    }
    $('#in-guess').disabled = true;
    $('#btn-guess').disabled = true;
    closeAc();
    renderStreak(r);
  }
  renderDots(r);
}

const initials = (n) => (n || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
function renderDots(r) {
  const el = $('#sb-dots');
  let html = '';
  for (let i = 1; i <= r.total_rounds; i++) {
    const h = S.hist?.[i];
    const cls = h || (i === r.round && r.status === 'playing' ? 'cur' : '');
    html += `<i class="${cls}"></i>`;
  }
  if (el._h !== html) { el.innerHTML = html; el._h = html; }
}
// reeks: x-waarde die je volgende juiste gok krijgt (max x3)
let lastStreak = 0;
function renderStreak(r) {
  const st = (S.slot === 2 ? r.guest_streak : r.host_streak) || 0;
  const m = Math.min(st + 1, 3);
  const b = $('#streak');
  $('#streak-x').textContent = 'x' + m;
  b.classList.toggle('off', st === 0);
  b.classList.toggle('max', m === 3);
  $('#streak-t').textContent = st ? `${st} op rij` : 'Nog geen reeks';
  $('#streak-s').textContent = st === 0 ? 'Raad juist om te starten' : (m < 3 ? `Daarna x${m + 1}` : 'Maximale bonus');
  if (st > lastStreak) { b.classList.remove('boost'); void b.offsetWidth; b.classList.add('boost'); }
  lastStreak = st;
}
// juist geraden: flits, schok, punten die naar je score vliegen
let scoreHold = 0;
function celebrate(r, m) {
  sfx.good(m);
  const wrap = $('#photo-wrap');
  wrap.classList.remove('hit'); void wrap.offsetWidth; wrap.classList.add('hit');
  const fl = $('#flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  const speed = Math.round(r.round_points / m) - 100;
  const pop = $('#pop');
  pop.innerHTML = `+${r.round_points}` + (m > 1 ? `<small>x${m}</small>` : '') + (speed >= 60 ? '<small>· snel</small>' : '');
  pop.hidden = false;
  // vliegende punten
  scoreHold = performance.now() + 700;
  const target = $(S.slot === 2 ? '#sb-p2 .sc' : '#sb-p1 .sc').getBoundingClientRect();
  const from = pop.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'flyer'; f.textContent = `+${r.round_points}`;
  f.style.left = from.left + 'px'; f.style.top = from.top + 'px';
  document.body.appendChild(f);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    f.style.transform = `translate(${target.left - from.left}px, ${target.top - from.top}px) scale(.6)`;
    f.style.opacity = '0.2';
  }));
  setTimeout(() => f.remove(), 750);
}

// punten optellen met een korte tel-animatie
function setScore(sel, v) {
  const el = $(sel);
  const wait = scoreHold - performance.now();
  if (wait > 0) { clearTimeout(el._hold); el._hold = setTimeout(() => setScore(sel, v), wait); return; }
  const to = Number(v) || 0;
  const from = Number(el.dataset.v ?? el.textContent) || 0;
  if (from === to && el.dataset.v != null) return;
  el.dataset.v = to;
  if (to <= from) { el.textContent = to; return; }
  cancelAnimationFrame(el._raf);
  const t0 = performance.now(), dur = 700;
  const stepF = () => {
    const f = Math.min(1, (performance.now() - t0) / dur);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - f, 3)));
    if (f < 1) el._raf = requestAnimationFrame(stepF);
  };
  stepF();
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ---- ronde-timing: één keer berekend bij de start van een ronde, daarna puur lokaal ----
// De aftelling 3-2-1, de tijdbalk en de hints lopen op de klok van dit toestel vanaf een vast
// startpunt. Latere klok-correcties kunnen de aftelling dus niet meer doen verspringen.
let hintsShown = 0, roundGo = 0, roundEnd = 0, cdTimers = [], cdRound = 0;
function scheduleRound(r) {
  cdTimers.forEach(clearTimeout); cdTimers = [];
  cdRound = r.round;
  const inMs = Date.parse(r.round_start) - serverNow();          // hoe lang nog tot de start
  roundGo = performance.now() + inMs;
  roundEnd = roundGo + (Date.parse(r.round_deadline) - Date.parse(r.round_start));
  const cd = $('#countdown');
  cd.className = 'countdown'; cd.textContent = '';
  [3, 2, 1].forEach((n) => {
    const at = inMs - n * 1000;
    if (at < -150) return;                                          // dat cijfer is al voorbij
    cdTimers.push(setTimeout(() => {
      if (cdRound !== r.round) return;
      cd.textContent = n;
      cd.className = 'countdown';                                   // animatie herstarten
      void cd.offsetWidth;
      cd.className = 'countdown tick';
      sfx.tick();
    }, Math.max(0, at)));
  });
  cdTimers.push(setTimeout(() => {
    if (cdRound !== r.round) return;
    cd.className = 'countdown'; cd.textContent = '';
    sfx.go();
    $('#in-guess').focus();
    // handicap: deze speler moet nog even wachten voor hij mag raden
    const hc = (S.slot === 2 ? r.guest_handicap : r.host_handicap) || 0;
    if (hc > 0 && !S.solo) lockGuess(hc * 1000 + Math.min(0, inMs), 'Handicap');
  }, Math.max(0, inMs)));
}
const isLive = () => S.room?.status === 'playing' && performance.now() >= roundGo;

function loop() {
  const r = S.room;
  if (!r || !$('#game').classList.contains('active')) return;
  const now = performance.now();
  const img = $('#photo');
  const ring = $('#ring'), ringN = $('#ring-n');
  const total = (roundEnd - roundGo) / 1000;
  const setRing = (frac, secs) => {
    ring.style.setProperty('--p', frac.toFixed(4));
    const t = String(Math.max(0, Math.ceil(secs)));
    if (ringN.textContent !== t) ringN.textContent = t;
    ring.classList.toggle('low', secs <= 5 && frac > 0);
  };
  if (r.status === 'playing' && now < roundGo) {
    setRing(1, total);
  } else if (r.status === 'playing') {
    if (S.photoReady && !img.classList.contains('show')) img.classList.add('show');
    const frac = Math.max(0, Math.min(1, (roundEnd - now) / (roundEnd - roundGo)));
    setRing(frac, (roundEnd - now) / 1000);
    const el = (now - roundGo) / 1000;
    const keys = [['land', 'Land'], ['positie', 'Positie'], ['club', 'Club'], ['initialen', 'Initialen']];
    const h = r.hints || {};
    const avail = keys.filter(([k]) => h[k]);
    while (hintsShown < avail.length && el >= HINT_TIMES[hintsShown]) {
      const [k, lbl] = avail[hintsShown];
      $('#hints').insertAdjacentHTML('beforeend', `<span class="hint"><b>${lbl}</b>${esc(h[k])}</span>`);
      hintsShown++;
      beep(440, 0.08, 'triangle', 0.06);
    }
  } else {
    setRing(0, 0);
  }
  raf = requestAnimationFrame(loop);
}

// raden
let guessPending = false;
// na een foute gok even geblokkeerd (ook op de server afgedwongen)
let lockUntil = 0;
function lockGuess(ms, msg = '') {
  lockUntil = performance.now() + ms;
  const ans = $('.answer'), inp = $('#in-guess'), btn = $('#btn-guess');
  ans.dataset.msg = msg; ans.classList.toggle('hc-lock', !!msg);
  ans.style.setProperty('--lock-ms', ms + 'ms');
  ans.classList.remove('locked'); void ans.offsetWidth; ans.classList.add('locked');
  inp.readOnly = true; btn.disabled = true;
  clearTimeout(lockGuess.t);
  lockGuess.t = setTimeout(() => {
    ans.classList.remove('locked', 'hc-lock'); ans.dataset.msg = ''; inp.readOnly = false; btn.disabled = false;
    if (isLive()) { inp.focus(); inp.select(); }
  }, ms);
}
async function guess(text) {
  text = (text ?? $('#in-guess').value).trim();
  if (guessPending || !text || !isLive() || performance.now() < lockUntil) return;
  closeAc();
  guessPending = true;
  const round = S.room.round;
  const btn = $('#btn-guess'), inp = $('#in-guess');
  btn.classList.add('busy'); inp.classList.add('busy'); inp.readOnly = true;   // meteen zichtbaar: we zijn aan het controleren
  try {
    const res = await rpc('submit_guess', { p_code: S.code, p_token: S.token, p_guess: text, p_round: round });
    if (res.correct) { inp.classList.add('good'); }
    else if (res.reason === 'wrong' && S.room.round === round) {
      sfx.bad();
      inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
      guessPending = false; btn.classList.remove('busy'); inp.classList.remove('busy');
      lockGuess(res.wait_ms || 1500);
      return;
    } else if (res.reason === 'handicap') {
      guessPending = false; btn.classList.remove('busy'); inp.classList.remove('busy');
      lockGuess(res.wait_ms || 1000, 'Handicap');
      return;
    } else if (res.reason === 'cooldown') {
      guessPending = false; btn.classList.remove('busy'); inp.classList.remove('busy');
      lockGuess(res.wait_ms || 500);
      return;
    }
  } catch (e) { toast(e.message); }
  finally {
    guessPending = false;
    btn.classList.remove('busy'); inp.classList.remove('busy');
    if (performance.now() >= lockUntil) inp.readOnly = false;
  }
}
$('#btn-guess').addEventListener('click', () => guess());
$('#btn-skipround').addEventListener('click', async () => {
  try { applyRoom(await rpc('skip_round', { p_code: S.code, p_token: S.token })); } catch (e) { toast(e.message); }
});

// autocomplete
let acSel = -1, acItems = [];
function closeAc() { $('#ac-list').hidden = true; acSel = -1; acItems = []; }
function renderAc() {
  const q = norm($('#in-guess').value);
  const list = $('#ac-list');
  if (q.length < 2 || !S.pool.length) { closeAc(); return; }
  const starts = [], contains = [];
  for (const p of S.pool) {
    const idx = p.k.indexOf(q);
    if (idx === -1) continue;
    const wordStart = idx === 0 || p.k[idx - 1] === ' ';
    (wordStart ? starts : contains).push(p);
    if (starts.length >= 7) break;
  }
  acItems = [...starts, ...contains].slice(0, 7);
  if (!acItems.length) { closeAc(); return; }
  acSel = -1;
  list.innerHTML = acItems.map((p, i) => `<li data-i="${i}">${highlight(p.n, q)}</li>`).join('');
  list.hidden = false;
}
function highlight(name, q) {
  const k = norm(name);
  const i = k.indexOf(q);
  if (i < 0 || k.length !== name.length) return esc(name);
  return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
}
$('#in-guess').addEventListener('input', renderAc);
$('#in-guess').addEventListener('keydown', (e) => {
  const list = $('#ac-list');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (list.hidden) return;
    e.preventDefault();
    acSel = (acSel + (e.key === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length;
    [...list.children].forEach((li, i) => li.classList.toggle('sel', i === acSel));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (!list.hidden && acSel >= 0) { $('#in-guess').value = acItems[acSel].n; guess(acItems[acSel].n); }
    else guess();
  } else if (e.key === 'Escape') closeAc();
});
$('#ac-list').addEventListener('mousedown', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  e.preventDefault();
  const n = acItems[+li.dataset.i].n;
  $('#in-guess').value = n; guess(n);
});
$('#in-guess').addEventListener('blur', () => setTimeout(closeAc, 150));

// ---------- einde ----------
const recordKey = (r) => `fo_best:${r.mode_label || 'bekend'}:${r.total_rounds}`;
function renderEnd() {
  const r = S.room;
  if (!$('#end').classList.contains('active')) {
    show('end'); musicVolume(70);
    cancelAnimationFrame(raf);
    S.shownRound = 0; S.revealedRound = 0;
  }
  const solo = S.solo || !r.guest_name;
  const rows = [{ n: r.host_name, s: r.host_score, p: 1 }];
  if (!solo) rows.push({ n: r.guest_name, s: r.guest_score, p: 2 });
  const best = Math.max(...rows.map((x) => x.s));
  $('#end-scores').innerHTML = rows.map((x) => `<div class="end-row p${x.p} ${!solo && x.s === best ? 'best' : ''}"><span>${esc(x.n)}</span><span class="pts">${x.s}</span></div>`).join('');
  let title;
  if (solo) title = `<span class="win">${r.host_score}</span> punten`;
  else if (r.host_score === r.guest_score) title = 'Gelijkspel!';
  else {
    const winSlot = r.host_score > r.guest_score ? 1 : 2;
    title = winSlot === S.slot ? '<span class="win">Gewonnen!</span>' : 'Verloren…';
  }
  if (r.left_slot && r.left_slot !== S.slot) {
    title = `<span class="win">Gewonnen</span>`;
    $('#end-hint').textContent = `${esc(r.left_slot === 1 ? r.host_name : r.guest_name)} heeft het spel verlaten.`;
  }
  // persoonlijk record (singleplayer), per modus en aantal rondes
  if (solo) {
    if (S.lastStatus !== 'finished') {
      const key = recordKey(r), prev = +(localStorage.getItem(key) || 0);
      S.endRecord = r.host_score > prev ? { neu: true, prev } : { neu: false, prev };
      if (r.host_score > prev) localStorage.setItem(key, r.host_score);
    }
    const rec = S.endRecord || { neu: false, prev: 0 };
    title += rec.neu
      ? `<div class="record new">Nieuw record!${rec.prev ? ` <small>(was ${rec.prev})</small>` : ''}</div>`
      : `<div class="record">Jouw record: <b>${rec.prev}</b> · nog ${rec.prev - r.host_score + 1} te gaan</div>`;
  }
  $('#end-title').innerHTML = title;
  $('#btn-again').hidden = !isHost() || !!(r.left_slot && r.left_slot !== S.slot);
  if (!(r.left_slot && r.left_slot !== S.slot)) $('#end-hint').textContent = isHost() ? '' : 'De host kan een nieuwe wedstrijd starten.';
  if (S.lastStatus !== 'finished') sfx.good();
}
$('#btn-again').addEventListener('click', async () => {
  try { applyRoom(await rpc('back_to_lobby', { p_code: S.code, p_token: S.token })); } catch (e) { toast(e.message); }
});
$('#btn-menu').addEventListener('click', leaveRoom);

// spel verlaten
$('#btn-exit').addEventListener('click', () => { $('#exit-dlg').hidden = false; });
$('#exit-no').addEventListener('click', () => { $('#exit-dlg').hidden = true; });
$('#exit-yes').addEventListener('click', async () => {
  $('#exit-dlg').hidden = true;
  try { await rpc('leave_room', { p_code: S.code, p_token: S.token }); } catch { /* */ }
  cancelAnimationFrame(raf);
  S.shownRound = 0; S.revealedRound = 0;
  leaveRoom();
});

