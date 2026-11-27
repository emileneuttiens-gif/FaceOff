import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY, MUSIC_VIDEO_ID, MUSIC_FALLBACK_IDS, MUSIC_START_SECONDS, MUSIC_FILE, HINT_TIMES, REEL, CHORUS_AT } from './config.js?v=1795781862';

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
  if (data && data.server_now) {
    const rtt = Date.now() - t0;
    S.offset = Date.parse(data.server_now) - (Date.now() - rtt / 2);
  }
  return data;
}

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
  good: () => { beep(660, 0.1); setTimeout(() => beep(990, 0.22), 90); },
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
        if (e.data === YT.PlayerState.ENDED) { yt.seekTo(MUSIC_START_SECONDS, true); yt.playVideo(); }
        if (e.data === YT.PlayerState.PLAYING) updateMusicUi();
      },
      onError: (e) => {
        ytErr = e.data;
        ytIdx++;
        if (ytIdx < MUSIC_IDS.length) {
          yt.loadVideoById({ videoId: MUSIC_IDS[ytIdx], startSeconds: MUSIC_START_SECONDS });
        } else {
          console.warn('YouTube-muziek geblokkeerd, foutcode', e.data);
          updateMusicUi();
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
    try { yt.seekTo(MUSIC_START_SECONDS, true); yt.unMute(); yt.setVolume(0); yt.playVideo(); } catch { /* */ }
  }
  fadeIn(1000);
  setTimeout(updateMusicUi, 1500);
  setTimeout(updateMusicUi, 4000);
}
// zacht aanzwellen zodat de muziek niet abrupt binnenvalt
let fadeTimer = null;
function fadeIn(ms) {
  clearInterval(fadeTimer);
  const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const f = Math.min(1, (performance.now() - t0) / ms);
    const v = Math.round(100 * f * f);
    if (audio) audio.volume = v / 100; else if (ytReady) try { yt.setVolume(v); } catch { /* */ }
    if (f >= 1) clearInterval(fadeTimer);
  }, 40);
}
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
  if (muted) return;
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
  buildReel();
  buildCredits();
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

function playReel() {
  phase('reel');
  $('#btn-skip').hidden = false;
  introT0 = performance.now();
  let i = 0;
  const next = () => {
    if (home.dataset.phase !== 'reel') return;
    if (showClip(i)) { flash(); reelTimer = setTimeout(next, (REEL[i % REEL.length]?.d || 1.3) * 1000); i++; }
    else reelTimer = setTimeout(next, 80);   // nog aan het laden: huidig fragment loopt gewoon door
  };
  next();
  clearInterval(syncTimer);
  syncTimer = setInterval(syncIntro, 50);
}

function startZoom() {
  clearTimeout(reelTimer);
  phase('zoom');
  zoomStart = performance.now();
  geomLoop();
  setTimeout(() => { if (home.dataset.phase === 'zoom') phase('logo'); }, ZOOM_MS);
  // in de O blijven de fragmenten doorlopen
  startLoop(2400);   // tijdens het uitzoomen loopt het beeld nog even door
}

// Uitzoomen door de O van "OFF": het schild start reuzegroot met de O over het hele scherm,
// het videobeeld zit in de O en vervaagt naar zwart tegen dat de zoom klaar is.
const O_RX = 19, O_RY = 28, O_SW = 10;            // maten van de O in het logo (SVG-eenheden)
function geomLoop() {
  cancelAnimationFrame(geomRaf);
  const wrap = $('#logo-wrap'), reel = $('#reel');
  // oorsprong van de zoom = middelpunt van de O, gemeten zonder transform
  wrap.style.transform = 'none';
  const w0 = wrap.getBoundingClientRect(), o0 = $('#o-shape').getBoundingClientRect();
  wrap.style.transformOrigin = `${o0.left - w0.left + o0.width / 2}px ${o0.top - w0.top + o0.height / 2}px`;
  const innerW0 = o0.width * (O_RX - O_SW / 2) / O_RX;   // breedte van het gat in de O
  const big = (Math.hypot(innerWidth, innerHeight) * 1.15) / Math.max(4, innerW0);
  const step = () => {
    const p = home.dataset.phase;
    if (!home.classList.contains('active')) { geomRaf = null; return; }
    let e = 1;
    if (p === 'zoom' && zoomStart != null) e = ease(Math.min(1, (performance.now() - zoomStart) / ZOOM_MS));
    if (p === 'zoom' || p === 'logo' || p === 'welcome' || p === 'menu') {
      const sc = big + (1 - big) * e;
      wrap.style.transform = e >= 1 ? '' : `scale(${sc})`;
      const r = $('#o-shape').getBoundingClientRect();
      const k = r.width / (2 * O_RX);
      const rx = (O_RX - O_SW / 2) * k, ry = (O_RY - O_SW / 2) * k;
      reel.style.clipPath = `ellipse(${rx}px ${ry}px at ${r.left + r.width / 2}px ${r.top + r.height / 2}px)`;
      reel.style.opacity = String(Math.max(0, 1 - Math.pow(e, 0.8)));
      if (e >= 1 && p !== 'zoom') { stopReelLoop(); geomRaf = null; return; }
    }
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
  playReel();
});
document.addEventListener('keydown', (e) => {
  if (!home.classList.contains('active')) return;
  const p = home.dataset.phase;
  if (p === 'login' && !$('#btn-login').hidden && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); unlockMusic(); openLogin(); }
  else if (p === 'welcome') { e.preventDefault(); toMenu(); }
});
home.addEventListener('click', (e) => { if (home.dataset.phase === 'welcome' && !e.target.closest('#btn-skip')) toMenu(); });
$('#btn-skip').addEventListener('click', (e) => { e.stopPropagation(); skipIntro(); });
$('#btn-switch').addEventListener('click', () => {
  clearInterval(loopTimer); loopTimer = null;
  $('#reel').style.clipPath = ''; $('#reel').style.opacity = ''; $('#logo-wrap').style.transform = '';
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
  slots.forEach((s) => { try { s.video.pause(); } catch { /* */ } });
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
  $('#btn-share').hidden = S.solo;
  $('#lobby-p1 .pname').textContent = r.host_name;
  const p2 = $('#lobby-p2');
  p2.classList.toggle('waiting', !r.guest_name);
  p2.querySelector('.pname').textContent = S.solo ? 'Oefenmodus' : (r.guest_name || 'Wachten…');
  p2.querySelector('.ptag').textContent = S.solo ? 'Alleen jij' : (r.guest_name ? 'Klaar' : 'Deel de code');
  $('#mode-picker').hidden = !isHost();
  $('#mode-readonly').hidden = isHost();
  $('#mode-readonly').innerHTML = `<div class="label">Spelmodus</div><b>${esc(leagueName(r.mode_label))}</b> · ${r.total_rounds} rondes<br><span class="small muted">De host kiest de modus</span>`;
  $('#mode-summary').innerHTML = `Modus: <b>${esc(leagueName(r.mode_label))}</b> · ${r.total_rounds} rondes`;
  $('#mode-summary').hidden = !isHost();
  $('#btn-go').hidden = !isHost();
  $('#btn-go').disabled = !S.solo && !r.guest_name;
  $('#lobby-hint').textContent = isHost()
    ? (S.solo || r.guest_name ? '' : 'Wacht tot je tegenstander meedoet, of deel de link.')
    : 'Wachten tot de host start…';
}

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
    const txt = { bekend: `De bekendste spelers ter wereld (${c.bekend || '…'}).`, alles: `Alle ${c.alles || ''} voetballers. Ook de onbekende — succes.`, legend: `Gestopte grootheden (${c.legend || '…'}).`, vrouwen: `Topspeelsters (${c.vrouwen || '…'}).` }[m.type];
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

$('#btn-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${S.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'FaceOff', text: `Speel FaceOff tegen mij! Code ${S.code}`, url });
    else { await navigator.clipboard.writeText(url); toast('Link gekopieerd'); }
  } catch { /* geannuleerd */ }
});
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
  setScore('#sb-p1 .sc', r.host_score);
  setScore('#sb-p2 .sc', r.guest_score);
  $('#sb-round').textContent = `Ronde ${r.round}/${r.total_rounds}`;
  $("#sb-mode").textContent = leagueName(r.mode_label);
  $('#btn-skipround').hidden = !(S.solo || !r.guest_name);

  // nieuwe ronde
  if (r.round !== S.shownRound) {
    S.shownRound = r.round;
    const img = $('#photo');
    img.classList.remove('show');
    img.classList.add('hidden-pre');
    img.src = r.photo_url;
    $('#credit').textContent = r.photo_credit ? `Foto: ${r.photo_credit} · Wikimedia Commons` : '';
    $('#hints').innerHTML = '';
    $('#reveal').hidden = true;
    $('#photo-wrap').classList.remove('win', 'lose');
    $('#in-guess').value = '';
    $('#in-guess').classList.remove('good');
    $('#in-guess').disabled = false;
    $('#btn-guess').disabled = false;
    closeAc();
    lastCount = null; hintsShown = 0;
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
    $('#photo').classList.remove('hidden-pre'); $('#photo').classList.add('show');
    $('#countdown').textContent = '';
    $('#reveal').hidden = false;
    $('#reveal-name').textContent = r.reveal_name;
    const who = $('#reveal-who');
    if (r.round_winner) {
      const nm = r.round_winner === 1 ? r.host_name : r.guest_name;
      const me = r.round_winner === S.slot;
      who.className = `reveal-who p${r.round_winner}`;
      who.textContent = me ? `Jij had hem! +${r.round_points}` : `${nm} was sneller +${r.round_points}`;
      $('#photo-wrap').classList.add(me ? 'win' : 'lose');
      me ? sfx.good() : sfx.lose();
    } else {
      who.className = 'reveal-who none';
      who.textContent = 'Niemand had hem…';
      sfx.bad();
    }
    $('#in-guess').disabled = true;
    $('#btn-guess').disabled = true;
    closeAc();
  }
}

function setScore(sel, v) {
  const el = $(sel);
  if (el.textContent !== String(v)) {
    el.textContent = v;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
}

let lastCount = null, hintsShown = 0;
function loop() {
  const r = S.room;
  if (!r || !$('#game').classList.contains('active')) return;
  const now = serverNow();
  const start = Date.parse(r.round_start), end = Date.parse(r.round_deadline);
  const img = $('#photo');
  if (r.status === 'playing' && now < start) {
    const n = Math.ceil((start - now) / 1000);
    if (n !== lastCount) {
      lastCount = n;
      const cd = $('#countdown');
      cd.textContent = n; cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick');
      sfx.tick();
    }
    $('#timer-fill').style.transform = 'scaleX(1)';
  } else if (r.status === 'playing') {
    if (lastCount !== 0) {
      lastCount = 0;
      $('#countdown').textContent = '';
      img.classList.remove('hidden-pre'); img.classList.add('show');
      sfx.go();
      $('#in-guess').focus();
    }
    const frac = Math.max(0, Math.min(1, (end - now) / (end - start)));
    const fill = $('#timer-fill');
    fill.style.transform = `scaleX(${frac})`;
    fill.style.backgroundPosition = `${(1 - frac) * 100}% 0`;
    const el = (now - start) / 1000;
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
    $('#timer-fill').style.transform = 'scaleX(0)';
  }
  raf = requestAnimationFrame(loop);
}

// raden
async function guess(text) {
  text = (text ?? $('#in-guess').value).trim();
  if (!text || S.room?.status !== 'playing' || serverNow() < Date.parse(S.room.round_start)) return;
  closeAc();
  try {
    const res = await rpc('submit_guess', { p_code: S.code, p_token: S.token, p_guess: text });
    if (res.correct) { $('#in-guess').classList.add('good'); }
    else if (res.reason === 'wrong') {
      sfx.bad();
      const i = $('#in-guess');
      i.classList.remove('shake'); void i.offsetWidth; i.classList.add('shake');
      i.select();
    }
  } catch (e) { toast(e.message); }
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
  $('#end-title').innerHTML = title;
  $('#btn-again').hidden = !isHost();
  $('#end-hint').textContent = isHost() ? '' : 'De host kan een nieuwe wedstrijd starten.';
  if (S.lastStatus !== 'finished') sfx.good();
}
$('#btn-again').addEventListener('click', async () => {
  try { applyRoom(await rpc('back_to_lobby', { p_code: S.code, p_token: S.token })); } catch (e) { toast(e.message); }
});
$('#btn-menu').addEventListener('click', leaveRoom);

