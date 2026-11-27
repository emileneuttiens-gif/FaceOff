import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY, MUSIC_VIDEO_ID, MUSIC_START_SECONDS, HINT_TIMES } from './config.js';

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

function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
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

// ---------- muziek (YouTube) ----------
let yt = null, ytReady = false, muted = localStorage.getItem('fo_muted') === '1';
window.onYouTubeIframeAPIReady = () => {
  yt = new YT.Player('yt', {
    width: 64, height: 36, videoId: MUSIC_VIDEO_ID,
    playerVars: { start: MUSIC_START_SECONDS, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, loop: 1, playlist: MUSIC_VIDEO_ID },
    events: { onReady: () => { ytReady = true; yt.setVolume(70); } },
  });
};
if (window.YT && window.YT.Player) window.onYouTubeIframeAPIReady();

function musicPlay() {
  $('#music').hidden = false;
  if (!ytReady || muted) return;
  try { yt.playVideo(); } catch { /* */ }
}
function musicVolume(v) { if (ytReady) try { yt.setVolume(v); } catch { /* */ } }
function setMuted(m) {
  muted = m; localStorage.setItem('fo_muted', m ? '1' : '0');
  $('#btn-mute').classList.toggle('off', m);
  if (!ytReady) return;
  if (m) yt.pauseVideo(); else yt.playVideo();
}
$('#btn-mute').addEventListener('click', () => setMuted(!muted));
$('#btn-mute').classList.toggle('off', muted);

// ---------- intro ----------
let introFaces = [];
rpc('intro_faces').then((f) => {
  introFaces = (f || []).filter((x) => x.photo);
  introFaces.forEach((x) => { const i = new Image(); i.referrerPolicy = 'no-referrer'; i.src = x.photo; });
}).catch(() => {});

let introDone = false;
$('#btn-start').addEventListener('click', () => {
  // niet wachten op fullscreen: sommige browsers beantwoorden die vraag nooit
  try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* */ }
  musicPlay();
  playIntro();
});
$('#btn-skip').addEventListener('click', endIntro);

function playIntro() {
  $('.intro-idle').hidden = true;
  $('.intro-show').hidden = false;
  $('#btn-skip').hidden = false;
  const stage = $('#intro-stage');
  const faces = introFaces.slice(0, 10);
  const beat = 620;
  let t = 300;
  faces.forEach((f, i) => {
    setTimeout(() => {
      if (introDone) return;
      const prev = stage.querySelector('.iface.in');
      if (prev) { prev.classList.remove('in'); prev.classList.add(i % 2 ? 'side-l' : 'side-r'); setTimeout(() => prev.remove(), 1400); }
      const el = document.createElement('div');
      el.className = 'iface';
      el.innerHTML = `<img src="${esc(f.photo)}" referrerpolicy="no-referrer" alt=""><div class="cap"><small>${esc(f.club || '')}</small>${esc(f.name)}</div>`;
      stage.appendChild(el);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
      if (i % 2 === 0) { const fl = $('#intro-flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); }
    }, t);
    t += beat;
  });
  setTimeout(() => {
    if (introDone) return;
    stage.querySelectorAll('.iface').forEach((e) => e.classList.add('out'));
    $('#intro-final').classList.add('slam');
    const fl = $('#intro-flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  }, t + 200);
  setTimeout(() => { if (!introDone) $('.intro-show').classList.add('fadeout'); }, t + 2600);
  setTimeout(endIntro, t + 3800);
}

function endIntro() {
  if (introDone) return;
  introDone = true;
  $('#intro').classList.remove('active');
  $('#intro').style.display = 'none';
  musicPlay();
  afterIntro();
}

// ---------- menu ----------
$('#in-name').value = S.name;
$('#in-name').addEventListener('input', (e) => { S.name = e.target.value.trim(); localStorage.setItem('fo_name', S.name); });

function needName() {
  if (!S.name) { $('#in-name').focus(); $('#in-name').classList.add('shake'); setTimeout(() => $('#in-name').classList.remove('shake'), 400); return true; }
  return false;
}

$('#btn-create').addEventListener('click', async () => {
  if (needName()) return;
  try { enterRoom(await rpc('create_room', { p_name: S.name, p_token: S.token, p_mode: S.draftMode, p_rounds: S.draftRounds }), false); }
  catch (e) { toast(e.message); }
});
$('#btn-solo').addEventListener('click', async () => {
  if (!S.name) { S.name = 'Ik'; }
  try { enterRoom(await rpc('create_room', { p_name: S.name, p_token: S.token, p_mode: S.draftMode, p_rounds: S.draftRounds }), true); }
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

function afterIntro() {
  const code = new URLSearchParams(location.search).get('room');
  show('menu');
  if (code) {
    $('#in-code').value = code.toUpperCase();
    if (S.name) joinCode(code);
    else toast('Vul je naam in en klik op Meedoen');
  }
  loadOptions();
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
  show('menu');
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
  $('#mode-readonly').innerHTML = `<div class="label">Spelmodus</div><b>${esc(r.mode_label)}</b> · ${r.total_rounds} rondes<br><span class="small muted">De host kiest de modus</span>`;
  $('#mode-summary').innerHTML = `Modus: <b>${esc(r.mode_label)}</b> · ${r.total_rounds} rondes`;
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
    if (!m.value && leagues[0]) m.value = leagues[0].name;
    sub.innerHTML = sel('sel-league', leagues.map((l) => ({ value: l.name, label: `${l.name} (${l.n})` })), m.value);
  } else if (m.type === 'club') {
    const lg = leagues.find((l) => l.clubs?.some((cl) => cl.id === m.value)) || leagues[0];
    const clubs = lg?.clubs || [];
    if (!clubs.some((cl) => cl.id === m.value) && clubs[0]) m.value = clubs[0].id;
    sub.innerHTML = sel('sel-club-league', leagues.map((l) => ({ value: l.name, label: l.name })), lg?.name)
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
  $('#sb-mode').textContent = r.mode_label;
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

