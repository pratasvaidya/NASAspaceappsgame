(() => {
'use strict';

/* =====================================================================
   Mars Outpost Survival  (Phaser 3 + vanilla JS)
   ===================================================================== */

const SOL_GOAL = 10;          // finish Sol 10 to win
const CRISIS_SECONDS = 90;
const SIGNAL_SECONDS = 25;    // "25-minute" Earth round trip, shrunk to 25 seconds
const MAX_RES = 100;
const BASELINE = { oxygen: 15, food: 10, power: 10 };
const RESET_COST = { power: 10 };
const WARN_SECONDS = 15;
const LOW_RES = 25;

const SHIELD_COST = 30;       // 30 Power: roughly a third of what the base makes in a day
const SOLAR_RATE = 0.15;      // Power per second while solar panels are extended
const SCRUB_RATE = 0.1;       // Power per second while dust scrubbers run
const DRAIN_DIV = 75;         // a glitch drains (hit / 75) per second
const PATCH_FACTOR = 0.25;    // holding SPACE at a broken terminal keeps 25% of the drain
const HOLD_SECONDS = 0.35;    // hold SPACE this long to start patching
const WALK_SPEED = 170;
const DUST_SPEED = 90;

const MAP_PATH = 'assets/kenney_sci-fi-rts/outpost_map.json';
const TILES_PATH = 'assets/kenney_sci-fi-rts/Spritesheet/scifiRTS_spritesheet@2.png';

const FONT = 'Fredoka, "Arial Rounded MT Bold", "Comic Sans MS", sans-serif';

const RES = {
  power:  { label: 'Power',  icon: '⚡' },
  oxygen: { label: 'Oxygen', icon: '💨' },
  food:   { label: 'Food',   icon: '🍎' },
};

const TERMINALS = {
  terminal_comms:       { name: 'Comms Center',      icon: '📡', color: 0x4fc3f7 },
  terminal_archives:    { name: 'NASA Archives',     icon: '📚', color: 0xc792ea },
  terminal_shields:     { name: 'North Shields',     icon: '🛡️', color: 0x7aa2ff },
  terminal_hydroponics: { name: 'East Hydroponics',  icon: '🌱', color: 0x7ddc5c },
  terminal_lifesupport: { name: 'West Life Support', icon: '💨', color: 0x66e0d0 },
  terminal_airlock:     { name: 'South Airlock',     icon: '🚪', color: 0xffb347 },
};

/* Every action has a price. type 'once' = once per Sol, 'toggle' = switch on/off (costs/benefits over time). */
const ACTIONS = {
  terminal_shields: [
    { id: 'shield', type: 'once', name: 'Electromagnetic Shielding',
      blurb: 'Fire up the heavy shields to block a solar storm. It only protects against storms that haven\'t arrived yet!',
      cost: { power: SHIELD_COST }, gain: {},
      done: 'Shields are up! The storm will bounce off if it is the kind shields can stop.' },
    { id: 'solar', type: 'toggle', name: 'Solar Array Controls', ignoreFault: true },
  ],
  terminal_hydroponics: [
    { id: 'grow', type: 'once', name: 'Run Crop Incubators',
      blurb: 'Warm lights, water pumps and nutrients turn Power and Oxygen into food. Plants need both!',
      cost: { power: 20, oxygen: 15 }, gain: { food: 30 }, done: 'The plants are growing fast!' },
  ],
  terminal_lifesupport: [
    { id: 'o2', type: 'once', name: 'Run Oxygen Generator',
      blurb: 'A Sabatier reactor and water splitter make breathable air. (The real space station uses a Sabatier reactor too.)',
      cost: { power: 15 }, gain: { oxygen: 30 }, done: 'Fresh oxygen is flowing!' },
  ],
  terminal_airlock: [
    { id: 'scrub', type: 'toggle', name: 'Dust Scrubbers' },
    { id: 'sweep', type: 'once', name: 'Sweep Solar Panels',
      blurb: 'Suit up, step outside, and brush Martian dust off the panels. Suit air is not free!',
      cost: { oxygen: 10 }, gain: { power: 30 }, done: 'The panels are shiny and soaking up sunlight!' },
    { id: 'samples', type: 'once', name: 'Collect Rock Samples (Research)',
      blurb: 'A science trip outside. It uses oxygen and gives no supplies, but scientists on Earth love it.',
      cost: { oxygen: 15 }, gain: {}, stars: 1, done: 'Great science! +1 ⭐ Research.' },
  ],
};

/* ---------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const normName = (n) => String(n || '').toLowerCase().replace(/[^a-z_]/g, ''); // the map has "terminal_airlock'"
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shortDate = (iso) => String(iso || '').slice(0, 10);

function fatal(msg) {
  $('loading').hidden = true;
  const f = $('fatal');
  f.hidden = false;
  f.innerHTML = `<div>😢 Oops! The game could not start.<br><small>${msg}</small><br><br>
    If you opened <code>index.html</code> by double-clicking, start a local server instead:<br>
    <code>python -m http.server 8000</code> then open <code>http://localhost:8000</code></div>`;
}

const costChips = (cost, gain, stars, extra) =>
  `<div class="chips">` +
  Object.entries(cost || {}).map(([k, v]) => `<span class="chip cost">−${v} ${RES[k].icon} ${RES[k].label}</span>`).join('') +
  Object.entries(gain || {}).map(([k, v]) => `<span class="chip gain">+${v} ${RES[k].icon} ${RES[k].label}</span>`).join('') +
  (stars ? `<span class="chip gain">+${stars} ⭐ Research</span>` : '') +
  (extra || '') + `</div>`;

/* ---------------------------------------------------------------------
   Real NASA data: DONKI (space weather)
   Live from api.nasa.gov, cached 6 hours in the browser, with an honest
   saved-copy fallback if the network or API is unavailable.
   --------------------------------------------------------------------- */
const DONKI = { status: 'loading', label: 'Contacting NASA…', cme: [], gst: [], flr: [], sep: [], counts: {}, fetchedAt: null };
const DONKI_CACHE_KEY = 'marsOutpost.donki.v1';
const DONKI_TTL_MS = 6 * 3600 * 1000;

function donkiKey() {
  try { return new URLSearchParams(location.search).get('key') || 'DEMO_KEY'; } catch (e) { return 'DEMO_KEY'; }
}
const isoDay = (d) => d.toISOString().slice(0, 10);

async function fetchDonki(kind, start, end) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(`https://api.nasa.gov/DONKI/${kind}?startDate=${start}&endDate=${end}&api_key=${donkiKey()}`, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${kind} ${r.status}`);
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } finally { clearTimeout(timer); }
}

function slimDonki(kind, rows) {
  if (kind === 'CME') {
    return rows.map((e) => {
      const a = (e.cmeAnalyses || []).find((x) => x.isMostAccurate && x.speed) || (e.cmeAnalyses || []).find((x) => x.speed);
      return a ? { id: e.activityID, time: e.startTime, speed: Math.round(a.speed), link: a.link } : null;
    }).filter(Boolean);
  }
  if (kind === 'GST') {
    return rows.map((e) => {
      const kp = Math.max(0, ...(e.allKpIndex || []).map((k) => k.kpIndex || 0));
      return { id: e.gstID, time: e.startTime, kp, link: e.link };
    });
  }
  if (kind === 'FLR') return rows.map((e) => ({ id: e.flrID, time: e.peakTime || e.beginTime, cls: e.classType, link: e.link }));
  return rows.map((e) => ({ id: e.sepID, time: e.eventTime, link: e.link }));
}

async function loadDonki() {
  const apply = (d, status, label) => {
    DONKI.cme = d.cme || []; DONKI.gst = d.gst || []; DONKI.flr = d.flr || []; DONKI.sep = d.sep || [];
    DONKI.counts = d.counts || {}; DONKI.fetchedAt = d.fetchedAt || null; DONKI.status = status; DONKI.label = label;
  };
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(DONKI_CACHE_KEY)); } catch (e) { /* no storage */ }
  const fmtAt = (t) => new Date(t).toLocaleString();
  if (cached && Date.now() - cached.fetchedAt < DONKI_TTL_MS) {
    apply(cached, 'live', `LIVE from NASA DONKI (fetched ${fmtAt(cached.fetchedAt)})`);
    return;
  }
  const end = new Date(), start = new Date(Date.now() - 30 * 86400000);
  const kinds = ['CME', 'GST', 'FLR', 'SEP'];
  const results = await Promise.allSettled(kinds.map((k) => fetchDonki(k, isoDay(start), isoDay(end))));
  const data = { fetchedAt: Date.now(), counts: {} };
  let ok = 0;
  results.forEach((r, i) => {
    const k = kinds[i], key = k.toLowerCase();
    if (r.status === 'fulfilled') {
      ok++;
      data[key] = slimDonki(k, r.value);
      data.counts[key] = r.value.length;
    } else data[key] = [];
  });
  if (ok > 0 && (data.cme.length + data.gst.length + data.flr.length + data.sep.length) > 0) {
    try { localStorage.setItem(DONKI_CACHE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    apply(data, 'live', `LIVE from NASA DONKI (fetched ${fmtAt(data.fetchedAt)})`);
  } else if (cached) {
    apply(cached, 'cached', `SAVED COPY of NASA DONKI data from ${fmtAt(cached.fetchedAt)} (could not reach NASA now)`);
  } else {
    const s = DATA && DATA.sampleDonki;
    apply(s || {}, 'sample', s ? s.label + ' (could not reach NASA right now)' : 'No NASA data available');
  }
}

/* Build today's event: pick a real DONKI record of the same kind (if there is one) and let its real
   strength scale the damage. Returns a fresh object so we never change the stored story. */
function buildEvent(base) {
  const ev = JSON.parse(JSON.stringify(base));
  ev.scale = 1;
  ev.real = null;
  const live = DONKI.status === 'live' || DONKI.status === 'cached';
  const tag = live ? (DONKI.status === 'live' ? 'LIVE · NASA DONKI' : 'SAVED · NASA DONKI') : 'SAVED COPY · NASA DONKI';
  if (ev.kind === 'cme' && DONKI.cme.length) {
    const r = pick(DONKI.cme);
    ev.scale = r.speed >= 1000 ? 1.5 : r.speed >= 700 ? 1.3 : r.speed >= 400 ? 1 : 0.8;
    ev.real = { tag, link: r.link,
      text: `On ${shortDate(r.time)} NASA's DONKI logged a real CME moving at <b>${r.speed} km/s</b> (about ${(r.speed * 3.6 / 1000).toFixed(1)} million km/h!).`,
      strength: r.speed >= 1000 ? 'very fast, so it hits extra hard' : r.speed >= 700 ? 'fast, so it hits harder' : r.speed >= 400 ? 'about average' : 'slow, so it hits softer' };
  } else if (ev.kind === 'gst' && DONKI.gst.length) {
    const r = pick(DONKI.gst);
    ev.scale = r.kp >= 7 ? 1.4 : r.kp >= 6 ? 1.2 : r.kp >= 5 ? 1 : 0.8;
    ev.real = { tag, link: r.link,
      text: `On ${shortDate(r.time)} DONKI logged a real geomagnetic storm that reached <b>Kp ${r.kp}</b> on the 0 to 9 scale.`,
      strength: r.kp >= 7 ? 'severe, so it hits extra hard' : r.kp >= 6 ? 'strong, so it hits harder' : 'moderate' };
  } else if (ev.kind === 'flare' && DONKI.flr.length) {
    const r = pick(DONKI.flr);
    const c = String(r.cls || 'C').toUpperCase()[0];
    ev.scale = c === 'X' ? 1.5 : c === 'M' ? 1.15 : 0.8;
    ev.real = { tag, link: r.link,
      text: `On ${shortDate(r.time)} DONKI logged a real <b>${r.cls || ''}-class</b> solar flare. (Flare classes go C, M, X: each letter is 10 times stronger.)`,
      strength: c === 'X' ? 'the strongest class, so it hits extra hard' : c === 'M' ? 'medium class, so it hits harder' : 'a small flare, so it hits softer' };
  } else if (ev.kind === 'sep' && DONKI.sep.length) {
    const r = pick(DONKI.sep);
    ev.scale = 1.2;
    ev.real = { tag, link: r.link, text: `On ${shortDate(r.time)} DONKI logged a real solar energetic particle event.`, strength: 'real events are rare, so this one hits harder' };
  } else if (ev.kind === 'calm' && DONKI.counts && DONKI.counts.cme != null) {
    ev.real = { tag, link: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
      text: `In the last 30 days DONKI logged <b>${DONKI.counts.cme} CMEs</b>, so quiet days are a treat!`, strength: 'calm' };
  } else if (ev.kind === 'cme' || ev.kind === 'gst' || ev.kind === 'flare' || ev.kind === 'sep') {
    ev.realNote = 'No real record of this type was available right now, so this story is modeled on DONKI data.';
  } else if (ev.kind !== 'calm') {
    ev.realNote = 'This story is inspired by real NASA science (it is not a live reading). See the NASA Archives.';
  }
  Object.keys(ev.hit || {}).forEach((k) => { ev.hit[k] = Math.max(5, Math.round(ev.hit[k] * ev.scale / 5) * 5); });
  ev.arriveAt = ev.arrive ? Math.round(randInt(ev.arrive[0], ev.arrive[1]) / 5) * 5 : null;
  return ev;
}

/* ---------------------------------------------------------------------
   Game state
   --------------------------------------------------------------------- */
let DATA = null;          // nasa_events.json
let scene = null;         // Phaser scene
let eventBag = [];

const S = {
  phase: 'title',         // title | briefing | crisis | night | over
  sol: 1,
  timeLeft: CRISIS_SECONDS,
  res: { power: 100, oxygen: 100, food: 100 },
  research: 0,
  event: null,
  arrived: false,         // has this Sol's storm hit yet?
  blocked: false,         // did our protection stop it?
  faults: {},             // terminalId -> true while broken
  signal: { status: 'idle', remaining: 0 },   // idle | waiting | ready
  used: {},               // 'terminalId:actionId' -> true once used this Sol
  shieldUp: false,
  retracted: false,       // solar panels folded away
  scrubbers: true,        // dust scrubbers running
  patching: false,        // player is holding SPACE at a broken terminal
  startRes: null,
  lost: {},               // resources lost to the glitch this Sol
  solar: 0,               // power made by solar this Sol
  scrubCost: 0,
  result: null,
  lossReason: '',
};

const UI = { modalOpen: false, modalKind: null, modalRender: null, closable: true, lastSig: -1 };

function pickBaseEvent() {
  if (!eventBag.length) {
    eventBag = DATA.events.slice();
    for (let i = eventBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eventBag[i], eventBag[j]] = [eventBag[j], eventBag[i]];
    }
  }
  let ev = eventBag.pop();
  if (S.sol === 1 && ev.id === 'calm' && eventBag.length) { const other = eventBag.pop(); eventBag.push(ev); ev = other; }
  return ev;
}

function newGame() {
  eventBag = [];
  S.res = { power: 100, oxygen: 100, food: 100 };
  S.research = 0;
  S.result = null;
  S.lossReason = '';
  startSol(1);
}

function startSol(n) {
  S.sol = n;
  S.phase = 'briefing';
  S.timeLeft = CRISIS_SECONDS;
  S.event = buildEvent(pickBaseEvent());
  S.arrived = false;
  S.blocked = false;
  S.faults = {};
  S.signal = { status: 'idle', remaining: 0 };
  S.used = {};
  S.shieldUp = false;
  S.retracted = false;
  S.scrubbers = true;
  S.patching = false;
  S.lost = {};
  S.solar = 0;
  S.scrubCost = 0;
  S.startRes = { ...S.res };
  if (scene) scene.teleportToSpawn();
  closeModal();
  toast(`🌅 Sol ${n} begins! Visit the Comms Center for your briefing.`);
}

function readBriefing() {
  const ev = S.event;
  S.phase = 'crisis';
  if (ev.bonus) { addAll(ev.bonus, 1); S.startRes = { ...S.res }; toast(`☀️ ${ev.bonusText}`, 'good'); }
  else toast('⏱️ The 90-second clock is running. Protect the base!', 'bad');
}

const addRes = (k, v) => { const before = S.res[k]; S.res[k] = clamp(before + v, 0, MAX_RES); return S.res[k] - before; };
function addAll(obj, sign) { Object.entries(obj || {}).forEach(([k, v]) => addRes(k, sign * v)); }

function canAfford(cost) {
  for (const [k, v] of Object.entries(cost || {})) if (S.res[k] - v <= 0) return k;  // a button never takes you to 0
  return null;
}

const protectedNow = () => {
  const p = S.event && S.event.protect;
  return (p === 'shields' && S.shieldUp) || (p === 'retract' && S.retracted);
};
const scrubbersOn = () => S.scrubbers && !S.faults.terminal_airlock;
const isDusty = () => !scrubbersOn();
const activeFault = () => { const ft = S.event && S.event.faultTerminal; return ft && S.faults[ft] ? ft : null; };

function checkLose() {
  const dead = Object.keys(S.res).find((k) => S.res[k] <= 0);
  if (dead && S.phase !== 'over') {
    S.phase = 'over';
    S.result = 'lost';
    S.patching = false;
    S.lossReason = `The base ran out of ${RES[dead].label.toLowerCase()}.`;
    showEndModal();
    return true;
  }
  return false;
}

function stormArrives() {
  const ev = S.event;
  S.arrived = true;
  if (protectedNow()) {
    S.blocked = true;
    toast(ev.protect === 'shields' ? '🛡️ The shields blocked the storm!' : '🌙 Panels were folded away. Dust missed them!', 'good');
  } else {
    S.faults[ev.faultTerminal] = true;
    toast(`${ev.emoji} It hit! ${ev.faultLabel}. Ask Earth for help!`, 'bad');
  }
}

function endSol() {
  S.phase = 'night';
  S.patching = false;
  Object.keys(S.res).forEach((k) => { S.res[k] = Math.ceil(S.res[k] - 1e-9); });
  const ev = S.event;
  const lines = [];
  const stat = (k) => Object.entries(S.lost).filter(([, v]) => v >= 0.5).map(([r, v]) => `−${Math.round(v)} ${RES[r].label}`).join(', ');

  if (!ev.faultTerminal) {
    lines.push({ ok: true, text: '☀️ A calm Sol, with no storm damage.' });
  } else if (S.blocked) {
    lines.push({ ok: true, text: `${ev.protect === 'shields' ? '🛡️ Your shields' : '🌙 Folding the solar panels'} stopped "${ev.title}" completely!` });
  } else if (!S.faults[ev.faultTerminal]) {
    lines.push({ ok: true, text: `✅ You fixed ${TERMINALS[ev.faultTerminal].name}.${stat() ? ' Damage while broken: ' + stat() + '.' : ''}` });
  } else {
    // still broken at night: it keeps leaking until morning
    const night = {};
    Object.entries(ev.hit).forEach(([k, v]) => { night[k] = Math.round(v * 0.5); });
    addAll(night, -1);
    lines.push({ ok: false, text: `${ev.emoji} ${ev.faultLabel} all day. ${ev.hitText} (${stat() || 'a little'} during the day, then ${Object.entries(night).map(([k, v]) => `−${v} ${RES[k].label}`).join(', ')} overnight)` });
  }
  if (S.retracted) lines.push({ ok: false, text: '🌙 Panels stayed folded: no solar power today.' });
  else lines.push({ ok: true, text: `☀️ Solar panels made +${Math.round(S.solar)} Power.` });
  if (S.scrubCost >= 0.5) lines.push({ ok: false, text: `💨 Dust scrubbers used ${Math.round(S.scrubCost)} Power.` });

  const afterDay = { ...S.res };
  addAll(BASELINE, -1);
  lines.push({ ok: false, text: `🌙 Night-time life support: −${BASELINE.oxygen} Oxygen, −${BASELINE.food} Food, −${BASELINE.power} Power` });

  const dead = Object.keys(S.res).find((k) => S.res[k] <= 0);
  let next;
  if (dead) {
    S.result = 'lost';
    S.lossReason = `The base ran out of ${RES[dead].label.toLowerCase()} during the night.`;
    next = { label: 'Oh no…', cls: 'secondary', onClick: () => { S.phase = 'over'; showEndModal(); } };
  } else if (S.sol >= SOL_GOAL) {
    S.result = 'won';
    next = { label: '🎉 Finish the mission!', cls: 'good', onClick: () => { S.phase = 'over'; showEndModal(); } };
  } else {
    next = { label: `🌅 Start Sol ${S.sol + 1}`, cls: 'good', onClick: () => startSol(S.sol + 1) };
  }

  const rows = Object.keys(RES).map((k) => {
    const d = S.res[k] - S.startRes[k];
    return `<tr><td>${RES[k].icon} ${RES[k].label}</td><td>${S.startRes[k]} → <b>${S.res[k]}</b></td>
      <td class="${d < 0 ? 'dn' : 'up'}">${d > 0 ? '+' : ''}${d}</td></tr>`;
  }).join('');

  showModal({
    kind: 'night', closable: false, icon: '🌙', title: `Sol ${S.sol} Summary`,
    body: `<ul>${lines.map((l) => `<li class="${l.ok ? 'up' : ''}">${l.text}</li>`).join('')}</ul>
           <table class="sum">${rows}</table>
           ${S.research ? `<p>⭐ Research so far: <b>${S.research}</b></p>` : ''}
           <div class="card science"><b>🎓 Real constraint:</b> ${ev.lesson}</div>
           <p class="hint">${S.sol >= SOL_GOAL ? 'This was your last Sol!' : `Only ${SOL_GOAL - S.sol} more Sols to go.`}</p>`,
    buttons: [next],
  });
}

function tick(dt) {
  if (S.phase !== 'crisis') return;
  if (UI.modalKind === 'archives') return; // reading the archives pauses the clock
  S.timeLeft -= dt;
  const ev = S.event;

  // the storm reaches the base
  if (ev.arriveAt != null && !S.arrived && CRISIS_SECONDS - S.timeLeft >= ev.arriveAt) stormArrives();

  // steady power flows
  if (!S.retracted) S.solar += addRes('power', SOLAR_RATE * dt);
  if (scrubbersOn()) { const d = addRes('power', -SCRUB_RATE * dt); S.scrubCost -= d; }

  // a broken system leaks resources until it is reset (holding SPACE there slows the leak)
  const ft = activeFault();
  if (ft) {
    const f = (S.patching ? PATCH_FACTOR : 1) / DRAIN_DIV * dt;
    Object.entries(ev.hit).forEach(([k, v]) => { const d = addRes(k, -v * f); S.lost[k] = (S.lost[k] || 0) - d; });
  }

  if (S.signal.status === 'waiting') {
    S.signal.remaining -= dt;
    if (S.signal.remaining <= 0) {
      S.signal = { status: 'ready', remaining: 0 };
      toast('📡 Earth replied! The reset code is ready.', 'good');
      if (UI.modalKind === 'comms') renderCurrentModal();
    }
  }
  if (checkLose()) return;
  if (S.timeLeft <= 0) { S.timeLeft = 0; endSol(); }
}

/* ---------------------------------------------------------------------
   Objective (drives HUD text and the bouncing arrow in the world)
   --------------------------------------------------------------------- */
function objective() {
  if (S.phase === 'briefing') return { text: '📡 Go to the Comms Center and read today\'s briefing (clock is paused)', target: 'terminal_comms' };
  if (S.phase !== 'crisis') return { text: '', target: null };
  const ev = S.event, ft = ev.faultTerminal;
  if (ft && !S.arrived) {
    const left = Math.max(0, Math.ceil(ev.arriveAt - (CRISIS_SECONDS - S.timeLeft)));
    if (ev.protect && !protectedNow()) {
      return { text: `⏰ ${ev.emoji} Arrives in ${left}s! ${ev.protect === 'shields' ? 'Raise the shields (−30 ⚡)' : 'Retract the solar panels'} in the North Wing`, target: 'terminal_shields' };
    }
    if (ev.protect) return { text: `✅ Protected! Brace for it… ${left}s`, target: null };
    return { text: `⏰ ${ev.emoji} Trouble arrives in ${left}s. Shields can't stop this one!`, target: null };
  }
  if (ft && S.faults[ft]) {
    const name = TERMINALS[ft].name;
    if (S.signal.status === 'idle') return { text: `📡 ${name} is broken! Ask Earth for help at Comms`, target: 'terminal_comms' };
    if (S.signal.status === 'waiting') return { text: `⏳ Earth is thinking… HOLD SPACE at ${name} to slow the leak!`, target: ft };
    return { text: `✅ Reset code ready! Go to ${name} and press Reset`, target: ft };
  }
  return { text: '🔧 Use your time wisely. Boost systems, or go for ⭐ research!', target: null };
}

/* ---------------------------------------------------------------------
   HUD
   --------------------------------------------------------------------- */
const hudCache = {};
function setText(el, key, v) { if (hudCache[key] !== v) { el.textContent = v; hudCache[key] = v; } }
function setHtml(el, key, v) { if (hudCache[key] !== v) { el.innerHTML = v; hudCache[key] = v; } }

function renderHUD() {
  $('hud').hidden = S.phase === 'title';
  setText($('solNum'), 'sol', `Sol ${S.sol}`);
  const paused = S.phase !== 'crisis' || UI.modalKind === 'archives';
  setText($('clock'), 'clock', S.phase === 'briefing' ? '1:30' : fmtTime(S.timeLeft));
  setText($('phaseLabel'), 'phase', S.phase === 'briefing' ? 'Paused · Briefing' : S.phase === 'crisis' ? (paused ? 'Paused' : 'Active Crisis') : 'Night');
  const warn = S.phase === 'crisis' && S.timeLeft <= WARN_SECONDS;
  $('clockBox').classList.toggle('paused', paused);
  $('clockBox').classList.toggle('warn', warn);
  document.body.classList.toggle('warning', warn);

  document.querySelectorAll('.bar').forEach((bar) => {
    const k = bar.dataset.res, v = S.res[k];
    bar.querySelector('.fill').style.width = `${v}%`;
    setText(bar.querySelector('.val'), 'v' + k, String(Math.ceil(v - 1e-9)));
    bar.classList.toggle('low', v <= LOW_RES);
  });

  const obj = objective();
  $('objective').hidden = !obj.text;
  setText($('objective'), 'obj', obj.text);

  let chips = '';
  if (S.phase === 'crisis') {
    const ev = S.event;
    if (ev.arriveAt != null && !S.arrived) chips += `<span class="chip info">${ev.emoji} Hits in ${Math.max(0, Math.ceil(ev.arriveAt - (CRISIS_SECONDS - S.timeLeft)))}s</span>`;
    if (activeFault()) chips += `<span class="chip alert">⚠️ ${ev.faultLabel}</span>`;
    if (S.patching) chips += `<span class="chip ok">🔧 Patching: leak slowed!</span>`;
    if (S.signal.status === 'waiting') chips += `<span class="chip info">📡 Earth signal… ${Math.ceil(S.signal.remaining)}s</span>`;
    if (S.signal.status === 'ready' && activeFault()) chips += `<span class="chip ok">📡 Reset code received</span>`;
    if (S.shieldUp) chips += `<span class="chip ok">🛡️ Shields up</span>`;
    if (S.retracted) chips += `<span class="chip info">🌙 Panels folded</span>`;
    if (isDusty()) chips += `<span class="chip alert">🐢 Dust slows you down</span>`;
  }
  if (S.phase !== 'title') chips += `<span class="chip info">⭐ Research ${S.research}</span>`;
  setHtml($('status'), 'status', chips);
}

let toastTimer = null;
function toast(msg, kind) {
  const t = $('toast');
  t.textContent = msg;
  t.className = kind || '';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

/* ---------------------------------------------------------------------
   Modal system
   --------------------------------------------------------------------- */
function showModal(cfg) {
  UI.modalOpen = true;
  UI.modalKind = cfg.kind || null;
  UI.closable = cfg.closable !== false;
  UI.modalRender = cfg;
  renderCurrentModal();
  $('modal-backdrop').hidden = false;
}

function renderCurrentModal() {
  const c = UI.modalRender;
  if (!c) return;
  const cfg = typeof c.build === 'function' ? c.build() : c;
  UI.closable = cfg.closable !== false;
  const modal = $('modal');
  const scroll = modal.scrollTop;
  modal.innerHTML = `
    <h2><span class="big">${cfg.icon || ''}</span><span>${cfg.title}</span></h2>
    ${cfg.body}
    <div class="buttons"></div>
    ${UI.closable ? '<p class="hint keys">Press <kbd>ESC</kbd> or <kbd>SPACE</kbd> to close</p>' : ''}`;
  const box = modal.querySelector('.buttons');
  const buttons = (cfg.buttons || []).slice();
  if (UI.closable && !cfg.noClose) buttons.push({ label: 'Close', cls: 'secondary', onClick: closeModal });
  buttons.forEach((b) => {
    const el = document.createElement('button');
    el.className = `btn ${b.cls || ''}`;
    el.textContent = b.label;
    el.disabled = !!b.disabled;
    el.addEventListener('click', () => { el.blur(); b.onClick && b.onClick(); });
    box.appendChild(el);
  });
  modal.scrollTop = scroll;
  UI.lastSig = Math.ceil(S.signal.remaining);
}

function closeModal() {
  UI.modalOpen = false;
  UI.modalKind = null;
  UI.modalRender = null;
  $('modal-backdrop').hidden = true;
}

/* ---------------------------------------------------------------------
   Terminal modals
   --------------------------------------------------------------------- */
function openTerminal(id, msg) {
  if (id === 'terminal_comms') return openComms(msg);
  if (id === 'terminal_archives') return openArchives();
  return openWing(id, msg);
}

function msgHtml(msg) { return msg ? `<div class="msg ${msg.bad ? 'bad' : ''}">${msg.text}</div>` : ''; }

function realCard(ev) {
  if (ev.real) {
    const live = ev.real.tag.startsWith('LIVE');
    return `<div class="card real"><span class="tag ${live ? 'live' : ''}">🛰️ ${ev.real.tag}</span>
      <p>${ev.real.text}</p>
      ${ev.scale !== 1 ? `<p>That makes today's storm <b>${ev.real.strength}</b> (damage ×${ev.scale}).</p>` : ''}
      <a href="${ev.real.link}" target="_blank" rel="noopener noreferrer">See the real NASA record</a></div>`;
  }
  return ev.realNote ? `<div class="card"><span class="tag">📚 About the data</span><p class="hint">${ev.realNote}</p></div>` : '';
}

function eventCard(ev) {
  const words = (ev.words || []).map(([t, d]) => `<li><b>${t}:</b> ${d}</li>`).join('') +
    `<li><b>Sol:</b> ${DATA.glossary.sol}</li>`;
  const timing = ev.arriveAt != null
    ? `<div class="card alert">⏰ <b>Expected to hit about ${ev.arriveAt} seconds after the clock starts.</b>
        ${ev.protect === 'shields' ? ' Shields can stop it, but only if you raise them first!' : ev.protect === 'retract' ? ' Folding up the solar panels can save them, but only if you do it first!' : ' Shields cannot stop this one.'}</div>` : '';
  return `<span class="tag">${ev.source} · ${ev.category}</span>
    <p><b>${ev.emoji} ${ev.title}</b></p>
    <p>${ev.story}</p>
    ${realCard(ev)}
    ${timing}
    <div class="card science"><b>🔬 Real science:</b> ${ev.lesson}</div>
    <div class="card"><b>💡 Tip:</b> ${ev.advice}</div>
    <div class="card"><b>📖 Words to know</b><ul>${words}</ul></div>`;
}

function openComms(msg) {
  showModal({
    kind: 'comms',
    build: () => {
      const ev = S.event;
      const t = TERMINALS.terminal_comms;
      if (S.phase === 'briefing') {
        return {
          icon: t.icon, title: `Sol ${S.sol} Morning Briefing`,
          body: `${eventCard(ev)}<p class="hint">The clock starts when you press the button!</p>`,
          buttons: [{ label: `⏱️ Start Sol ${S.sol}`, cls: 'good', onClick: () => { readBriefing(); closeModal(); } }],
          noClose: true,
        };
      }
      const ft = ev.faultTerminal;
      let sig = '';
      const buttons = [];
      if (!ft) {
        sig = `<div class="card">No systems are broken today, so no help from Earth is needed. 🎉</div>`;
      } else if (!S.arrived) {
        sig = `<div class="card">Nothing is broken yet. You can only ask Earth for help once something breaks.
          <p class="hint">Messages between Mars and Earth are slow, so it is smart to get ready now.</p></div>`;
      } else if (S.blocked) {
        sig = `<div class="card">✅ The storm was blocked. Nothing needs fixing!</div>`;
      } else if (!S.faults[ft]) {
        sig = `<div class="card">✅ ${TERMINALS[ft].name} is already fixed. Nice work!</div>`;
      } else if (S.signal.status === 'idle') {
        sig = `<div class="card alert"><b>${ev.faultLabel}.</b> You need Earth's reset code.
          <p class="hint">A message to Earth and back really takes about 25 minutes. Here it takes ${SIGNAL_SECONDS} seconds.
          <b>You can't just wait here!</b> The leak keeps draining supplies. Run to ${TERMINALS[ft].name} and HOLD SPACE to patch it while you wait.</p></div>`;
        buttons.push({ label: `📡 Ask Earth for Help (${SIGNAL_SECONDS}s)`, cls: 'good', onClick: () => {
          S.signal = { status: 'waiting', remaining: SIGNAL_SECONDS };
          closeModal();
          toast(`📡 Signal sent! Run to ${TERMINALS[ft].name} and HOLD SPACE to slow the leak.`, 'good');
        } });
      } else if (S.signal.status === 'waiting') {
        const pct = Math.round(100 * (1 - S.signal.remaining / SIGNAL_SECONDS));
        sig = `<div class="card"><b>📡 Message traveling to Earth and back…</b>
          <div class="progress"><div style="width:${pct}%"></div></div>
          <p class="hint">${Math.ceil(S.signal.remaining)} seconds left. Go patch ${TERMINALS[ft].name}!</p></div>`;
      } else {
        sig = `<div class="card"><b>✅ Earth replied!</b> The Reset button is now unlocked at <b>${TERMINALS[ft].name}</b>.</div>`;
      }
      return {
        icon: t.icon, title: 'Comms Center',
        body: `${msgHtml(msg)}<h3>Deep Space Link</h3>${sig}<h3>Today's alert</h3>${eventCard(ev)}`,
        buttons,
      };
    },
  });
}

function actionAvailability(tid, a) {
  const faulted = !!S.faults[tid];
  const ev = S.event;
  const key = `${tid}:${a.id}`;
  if (a.type === 'once') {
    if (S.used[key]) return 'Already used this Sol';
    if (faulted) return 'Locked: reset first';
    const lacking = canAfford(a.cost);
    if (lacking) return `Not enough ${RES[lacking].label}`;
  }
  if (a.id === 'shield' && S.arrived && ev.protect === 'shields') return 'Too late: the storm already hit';
  if (a.id === 'scrub' && faulted) return 'Offline until reset';
  return '';
}

function openWing(id, msg) {
  showModal({
    kind: 'wing',
    build: () => {
      const t = TERMINALS[id], ev = S.event;
      if (S.phase === 'briefing') {
        return { icon: t.icon, title: t.name,
          body: `<p>⏸️ The clock is paused. Go to the <b>Comms Center</b> first and read today's briefing!</p>`, buttons: [] };
      }
      const faulted = !!S.faults[id];
      let body = msgHtml(msg);
      const buttons = [];

      body += faulted
        ? `<div class="card alert"><b>⚠️ BROKEN!</b> ${ev.faultLabel}. Supplies are leaking. Boosts here are locked until it is reset.
            <p class="hint">Close this window and <b>HOLD SPACE</b> on the glowing pad to slow the leak while you wait for Earth.</p></div>`
        : `<div class="card">✅ ${t.name} is working normally.</div>`;

      ACTIONS[id].forEach((a) => {
        const reason = actionAvailability(id, a);
        if (a.type === 'toggle') {
          if (a.id === 'solar') {
            body += `<h3>☀️ ${a.name}</h3>
              <p>Panels are <b>${S.retracted ? 'FOLDED AWAY' : 'OUT'}</b>. Out, they make Power. Folded, they are safe from dust but make nothing.</p>
              ${costChips({}, {}, 0, S.retracted ? '<span class="chip gain">Folded: safe from dust storms</span><span class="chip cost">No solar Power</span>'
                : `<span class="chip gain">+${SOLAR_RATE} ⚡ every second</span><span class="chip cost">Dust storm can hurt them</span>`)}`;
            buttons.push({ label: S.retracted ? '☀️ Extend Panels' : '🌙 Retract Panels', cls: '', onClick: () => {
              S.retracted = !S.retracted;
              const late = S.retracted && S.arrived && ev.protect === 'retract' && !S.blocked;
              toast(S.retracted ? '🌙 Panels folded away.' : '☀️ Panels are out again.', 'good');
              openWing(id, { text: S.retracted ? `Panels folded.${late ? ' (Too late to stop the dust that already hit.)' : ''}` : 'Panels extended.' });
            } });
          } else if (a.id === 'scrub') {
            const on = scrubbersOn();
            body += `<h3>💨 ${a.name}</h3>
              <p>Martian dust is sharp and sneaky. With scrubbers <b>${on ? 'ON' : 'OFF'}</b> the base is ${on ? 'clean' : '<b>dusty, and you walk slowly</b>'}.</p>
              ${costChips({}, {}, 0, on ? `<span class="chip cost">−${SCRUB_RATE} ⚡ every second</span>` : '<span class="chip cost">🐢 Slow walking</span><span class="chip gain">Saves Power</span>')}`;
            buttons.push({ label: reason ? `Dust Scrubbers (${reason})` : (S.scrubbers ? '⛔ Turn Scrubbers OFF' : '✅ Turn Scrubbers ON'), disabled: !!reason, onClick: () => {
              S.scrubbers = !S.scrubbers;
              openWing(id, { text: S.scrubbers ? 'Scrubbers are running.' : 'Scrubbers are off: saving Power, but dust will slow you down!', bad: !S.scrubbers });
            } });
          }
          return;
        }
        body += `<h3>${a.name}</h3><p>${a.blurb}</p>${costChips(a.cost, a.gain, a.stars)}`;
        if (a.id === 'shield' && !reason) {
          const hint = ev.protect === 'shields' ? '' : (ev.faultTerminal ? 'Careful: shields can\'t stop today\'s problem!' : 'No storm is coming today, so shields would be wasted.');
          if (hint) body += `<p class="hint">⚠️ ${hint}</p>`;
        }
        buttons.push({
          label: reason ? `${a.name} (${reason})` : a.name, disabled: !!reason,
          onClick: () => {
            addAll(a.cost, -1); addAll(a.gain, 1);
            if (a.stars) S.research += a.stars;
            S.used[`${id}:${a.id}`] = true;
            if (a.id === 'shield') S.shieldUp = true;
            let extra = '';
            if (a.id === 'shield') extra = ev.protect === 'shields' ? ' The storm will bounce off!' : ' (It will not stop today\'s problem.)';
            toast(`${t.icon} ${a.done}`, 'good');
            if (!checkLose()) openWing(id, { text: `${a.done}${extra}` });
          },
        });
      });

      if (faulted) {
        body += `<h3>🔧 Critical System Reset</h3>${costChips(RESET_COST)}`;
        let rReason = '';
        if (S.signal.status === 'idle') rReason = 'Needs a reset code from Earth: visit Comms';
        else if (S.signal.status === 'waiting') rReason = `Waiting for Earth… ${Math.ceil(S.signal.remaining)}s`;
        else if (canAfford(RESET_COST)) rReason = `Not enough ${RES[canAfford(RESET_COST)].label}`;
        body += `<p class="hint">${rReason || 'Earth\'s reset code has arrived. You are cleared to reset!'}</p>`;
        buttons.push({
          label: '🔧 Reset System', cls: 'good', disabled: !!rReason,
          onClick: () => {
            addAll(RESET_COST, -1);
            S.faults[id] = false;
            S.patching = false;
            toast(`✅ ${t.name} is fixed!`, 'good');
            if (!checkLose()) openWing(id, { text: '🔧 Reset complete! The leak has stopped.' });
          },
        });
      }
      return { icon: t.icon, title: t.name, body, buttons };
    },
  });
}

function openArchives() {
  showModal({
    kind: 'archives',
    build: () => {
      const t = TERMINALS.terminal_archives;
      const row = (kind, r, extra) => `<li><b>${kind}</b> · ${shortDate(r.time)} · ${extra} · <a href="${r.link}" target="_blank" rel="noopener noreferrer">NASA record</a></li>`;
      const recs = [
        ...DONKI.cme.slice(0, 4).map((r) => row('CME', r, `${r.speed} km/s`)),
        ...DONKI.gst.slice(0, 3).map((r) => row('Geomagnetic storm', r, `Kp ${r.kp}`)),
        ...DONKI.flr.slice(0, 3).map((r) => row('Solar flare', r, `class ${r.cls}`)),
        ...DONKI.sep.slice(0, 2).map((r) => row('Particle storm', r, 'SEP')),
      ].join('') || '<li>No records loaded.</li>';
      const evs = DATA.events.map((e) => `<li>${e.emoji} <b>${e.title}</b> <span class="tag">${e.source}</span></li>`).join('');
      const attr = DATA.attributions.map((a) => `<div class="card"><b>${a.name}</b><br>
        <span class="hint">${a.owner}</span><br>${a.used_for}<br>
        <a href="${a.url}" target="_blank" rel="noopener noreferrer">${a.url}</a>${a.api ? `<br><a href="${a.api}" target="_blank" rel="noopener noreferrer">${a.api}</a>` : ''}</div>`).join('');
      const gl = Object.entries(DATA.glossary).map(([k, v]) => `<li><b>${k}:</b> ${v}</li>`).join('');
      return {
        icon: t.icon, title: 'NASA Archives',
        body: `<p class="hint">⏸️ The clock is paused while you read.</p>
          <p>Welcome, space scout! Here is the real NASA science behind this game.</p>
          <h3>Real space weather records</h3>
          <div class="card real"><span class="tag ${DONKI.status === 'live' ? 'live' : ''}">🛰️ ${DONKI.label}</span>
            <ul>${recs}</ul>
            <p class="hint">These come from NASA's DONKI database. The strength of each storm in the game is scaled by a real record like these.</p></div>
          <h3>Events you may meet on Mars</h3><ul>${evs}</ul>
          <h3>Fun fact: Earth–Mars signal delay</h3>
          <p>Radio waves travel at the speed of light, but Mars is far away. A one-way message takes about 3 to 22 minutes, depending on where the planets are. This game uses ${SIGNAL_SECONDS} seconds for the "25-minute" round trip.</p>
          <h3>Words to know</h3><ul>${gl}</ul>
          <h3>Dataset attributions</h3>${attr}
          <p class="hint">${DATA.disclaimer}</p>`,
        buttons: [],
      };
    },
  });
}

/* ---------------------------------------------------------------------
   Title / end screens
   --------------------------------------------------------------------- */
function showTitle() {
  showModal({
    kind: 'title',
    build: () => ({
      closable: false, icon: '🚀', title: 'Mars Outpost Survival',
      body: `<p>You are the only astronaut at a Mars outpost! Keep <b>⚡ Power</b>, <b>💨 Oxygen</b> and <b>🍎 Food</b> above zero for <b>${SOL_GOAL} Sols</b>. A <b>sol</b> is a Mars day.</p>
      <ul>
        <li>Move with <span class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> or the arrow keys.</li>
        <li>Stand on a pad and press <span class="keys"><kbd>SPACE</kbd></span> to use it.</li>
        <li>Each Sol starts at <b>📡 Comms</b> with a <b>real NASA space-weather</b> briefing. Then you have <b>${CRISIS_SECONDS} seconds</b>!</li>
        <li>Nothing is free: shields cost Power, science trips cost Oxygen, solar panels can be folded away.</li>
        <li>When something breaks, Earth must send a reset code (it takes time!). Meanwhile, <b>HOLD SPACE</b> at the broken pad to slow the leak.</li>
        <li>At night the base uses ${BASELINE.oxygen} Oxygen, ${BASELINE.food} Food and ${BASELINE.power} Power.</li>
      </ul>
      <div class="card real"><span class="tag ${DONKI.status === 'live' ? 'live' : ''}">🛰️ ${DONKI.label}</span></div>`,
      buttons: [{ label: DONKI.status === 'loading' ? '⏳ Contacting NASA…' : '🚀 Start Mission', cls: 'good', disabled: DONKI.status === 'loading', onClick: () => { newGame(); } }],
    }),
  });
}

function showEndModal() {
  const won = S.result === 'won';
  showModal({
    kind: 'end', closable: false,
    icon: won ? '🏆' : '💔',
    title: won ? 'Mission Complete!' : 'Mission Failed',
    body: won
      ? `<p>You survived all ${SOL_GOAL} Sols on Mars! You handled space weather, long Earth delays and tough trade-offs like a real NASA crew.</p>
         <div class="card">Final supplies: ${Object.keys(RES).map((k) => `${RES[k].icon} ${Math.ceil(S.res[k])}`).join(' &nbsp; ')}<br>⭐ Research collected: <b>${S.research}</b></div>
         <p class="hint">Every game is different: the storms are shuffled and the real NASA data changes. Can you get more ⭐ next time?</p>`
      : `<p>${S.lossReason} You made it to Sol ${S.sol}. ⭐ Research: ${S.research}.</p>
         <div class="card science"><b>🎓 What to try:</b> Watch the storm countdown, raise shields or fold the panels <i>before</i> it hits, and HOLD SPACE at a broken pad while you wait for Earth.</div>
         <p class="hint">Real astronauts and mission planners also learn from things that go wrong. Every run is different, so try again!</p>`,
    buttons: [{ label: '🔁 Play Again', cls: 'good', onClick: () => newGame() }],
  });
}

/* ---------------------------------------------------------------------
   Phaser scene
   --------------------------------------------------------------------- */
class MarsScene extends Phaser.Scene {
  constructor() { super('Mars'); }

  preload() {
    this.load.on('loaderror', (f) => fatal(`Could not load ${f.src || f.key}`));
    this.load.tilemapTiledJSON('map', MAP_PATH);
    this.load.image('tiles', TILES_PATH);
    this.load.json('events', 'nasa_events.json');
  }

  create() {
    scene = this;
    DATA = this.cache.json.get('events');
    loadDonki().catch(() => {}).then(() => {
      if (DONKI.status === 'loading') {           // unexpected failure: fall back to the saved copy
        const s = DATA.sampleDonki || {};
        Object.assign(DONKI, { status: 'sample', label: s.label || 'Saved copy', cme: s.cme || [], gst: s.gst || [], flr: s.flr || [], sep: s.sep || [], counts: s.counts || {} });
      }
      if (UI.modalKind === 'title') renderCurrentModal();
    });

    /* ---- tilemap ---- */
    const map = this.make.tilemap({ key: 'map' });
    const tileset = map.addTilesetImage(map.tilesets[0].name, 'tiles');
    this.ground = map.createLayer('Ground', tileset, 0, 0);
    this.walls = map.createLayer('Walls', tileset, 0, 0);
    this.ground.setDepth(0);
    this.walls.setDepth(2);
    // The map has a few plain white *floor* tiles accidentally placed in the Walls layer (e.g. beside the
    // command bunker). They are invisible but blocked the player, so drop any wall tile that is a floor tile.
    const floorIds = new Set();
    map.getLayer('Ground').data.forEach((row) => row.forEach((t) => { if (t.index > 0) floorIds.add(t.index); }));
    const strays = [];
    this.walls.forEachTile((t) => { if (t.index > 0 && floorIds.has(t.index)) strays.push(t); });
    strays.forEach((t) => this.walls.removeTileAt(t.x, t.y, true, true));
    this.walls.setCollisionByExclusion([-1]);   // every remaining wall tile blocks the player

    /* ---- interactables ---- */
    const objs = map.getObjectLayer('Interactables').objects;
    this.zones = [];
    let spawn = { x: map.widthInPixels / 2, y: map.heightInPixels / 2 };
    objs.forEach((o) => {
      const name = normName(o.name);
      const rect = new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height);
      if (name === 'spawn_point') { spawn = { x: rect.centerX, y: rect.centerY }; return; }
      if (TERMINALS[name]) this.zones.push(this.makeTerminalMarker(name, rect));
    });
    this.spawn = spawn;
    this.makeRoomSigns(map);

    /* ---- player ---- */
    this.makeFallbackAstronaut();
    let key = 'astro_fallback', frame;
    try {
      const tex = this.textures.get('tiles');
      if (tex && tex.key === 'tiles' && tex.getSourceImage().width >= 1004) {
        tex.add('astro', 0, 972, 96, 32, 48);       // astronaut in the far-right column
        key = 'tiles'; frame = 'astro';
      }
    } catch (e) { /* fall back to drawn astronaut */ }
    this.shadow = this.add.ellipse(spawn.x, spawn.y + 18, 22, 8, 0x000000, 0.35).setDepth(3);
    this.player = this.physics.add.sprite(spawn.x, spawn.y, key, frame).setDepth(4);
    this.player.body.setSize(20, 20).setOffset(6, 26);   // 20x20 feet hitbox
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, this.walls);

    /* ---- camera ---- */
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.startFollow(this.player, true, 0.1, 0.1);
    cam.setZoom(1.5);

    /* ---- input ---- */
    const kb = this.input.keyboard;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
    this.space = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.esc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    /* ---- prompt + objective arrow ---- */
    this.prompt = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: '#ffd93b',
      stroke: '#2b1458', strokeThickness: 7, align: 'center', padding: { x: 4, y: 4 },
    }).setOrigin(0.5, 1).setDepth(50).setVisible(false);
    this.arrow = this.add.text(0, 0, '▼', {
      fontFamily: FONT, fontSize: '34px', fontStyle: '700', color: '#ff5fa8', stroke: '#2b1458', strokeThickness: 8,
    }).setOrigin(0.5, 1).setDepth(40).setVisible(false);

    $('loading').hidden = true;
    showTitle();
  }

  makeFallbackAstronaut() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xe8eef5, 1).fillRoundedRect(6, 20, 20, 24, 6);       // suit
    g.fillStyle(0xff7a3d, 1).fillRect(6, 30, 20, 4);                   // belt stripe
    g.fillStyle(0xe8eef5, 1).fillCircle(16, 14, 11);                   // helmet
    g.fillStyle(0x1b3b5a, 1).fillRoundedRect(8, 8, 16, 11, 5);         // visor
    g.fillStyle(0x7fd1ff, 0.8).fillRect(10, 10, 5, 3);                 // visor glint
    g.fillStyle(0x556677, 1).fillRect(7, 42, 7, 5).fillRect(18, 42, 7, 5); // boots
    g.generateTexture('astro_fallback', 32, 48);
    g.destroy();
  }

  makeTerminalMarker(id, rect) {
    const t = TERMINALS[id];
    const pad = 4;
    const draw = (fill, line) => {
      const g = this.add.graphics().setDepth(1);
      g.fillStyle(fill, 0.35).fillRoundedRect(rect.x - pad, rect.y - pad, rect.width + pad * 2, rect.height + pad * 2, 14);
      g.lineStyle(5, 0x2b1458, 1).strokeRoundedRect(rect.x - pad, rect.y - pad, rect.width + pad * 2, rect.height + pad * 2, 14);
      g.lineStyle(3, line, 1).strokeRoundedRect(rect.x - pad + 3, rect.y - pad + 3, rect.width + pad * 2 - 6, rect.height + pad * 2 - 6, 11);
      return g;
    };
    const base = draw(t.color, 0xffffff);
    const alert = draw(0xff4d4d, 0xff4d4d).setVisible(false);
    // one small plaque per terminal; the center ones sit below / beside their pads so nothing overlaps
    const label = `${t.icon} ${t.name}`;
    if (id === 'terminal_comms') this.makeLabel(rect.centerX, rect.bottom + 8, label, t.color, 0.5, 0);
    else if (id === 'terminal_archives') this.makeLabel(rect.right + 10, rect.centerY, label, t.color, 0, 0.5);
    else this.makeLabel(rect.centerX, rect.top - 8, label, t.color, 0.5, 1);
    return { id, rect, base, alert };
  }

  // Small, legible name plaque: text on a rounded colored tag.
  makeLabel(x, y, text, color, ox, oy) {
    const t = this.add.text(0, 0, text, {
      fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#ffffff', stroke: '#2b1458', strokeThickness: 4,
    }).setOrigin(0.5);
    const w = t.width + 16, h = t.height + 4;
    const left = x - w * ox, top = y - h * oy;
    t.setPosition(left + w / 2, top + h / 2).setDepth(6);
    const g = this.add.graphics().setDepth(5.9);
    g.fillStyle(color, 1).fillRoundedRect(left, top, w, h, 10);
    g.lineStyle(3, 0x2b1458, 1).strokeRoundedRect(left, top, w, h, 10);
  }

  makeRoomSigns() {
    const co = this.zones.find((q) => q.id === 'terminal_comms');
    if (co) this.makeLabel(co.rect.centerX, this.spawn.y + 28, '🏠 Command Bunker', 0xff8fc8, 0.5, 1);
  }

  teleportToSpawn() {
    if (!this.player) return;
    this.player.setPosition(this.spawn.x, this.spawn.y);
    this.player.setVelocity(0, 0);
  }

  nearestZone() {
    const b = this.player.body;
    const pr = new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
    let best = null, bestArea = 0;
    for (const z of this.zones) {
      if (!Phaser.Geom.Intersects.RectangleToRectangle(pr, z.rect)) continue;
      const i = Phaser.Geom.Rectangle.Intersection(pr, z.rect);
      const area = i.width * i.height;
      if (area > bestArea) { best = z; bestArea = area; }
    }
    return best;
  }

  update(time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    tick(dt);
    renderHUD();

    // live refresh of the Earth countdown while its window is open
    if ((UI.modalKind === 'comms' || UI.modalKind === 'wing') && S.signal.status === 'waiting' && Math.ceil(S.signal.remaining) !== UI.lastSig) renderCurrentModal();

    const KB = Phaser.Input.Keyboard;
    const spaceDown = KB.JustDown(this.space);
    const spaceUp = KB.JustUp(this.space);
    const escDown = KB.JustDown(this.esc);

    // movement (dust slows you down)
    const p = this.player;
    const speed = isDusty() ? DUST_SPEED : WALK_SPEED;
    let vx = 0, vy = 0;
    if (!UI.modalOpen && S.phase !== 'over') {
      const c = this.cursors, w = this.wasd;
      if (c.left.isDown || w.left.isDown) vx -= 1;
      if (c.right.isDown || w.right.isDown) vx += 1;
      if (c.up.isDown || w.up.isDown) vy -= 1;
      if (c.down.isDown || w.down.isDown) vy += 1;
    }
    const len = Math.hypot(vx, vy) || 1;
    p.setVelocity((vx / len) * speed, (vy / len) * speed);
    if (vx < 0) p.setFlipX(true); else if (vx > 0) p.setFlipX(false);
    p.setScale(1, vx || vy ? 1 + Math.sin(time / 70) * 0.03 : 1);
    this.shadow.setPosition(p.x, p.y + 18);

    // terminal detection
    const zone = UI.modalOpen ? null : this.nearestZone();
    const faultedHere = !!(zone && S.phase === 'crisis' && S.faults[zone.id]);
    if (zone) {
      const label = S.patching ? '🔧 Patching… leak slowed!'
        : faultedHere ? `${TERMINALS[zone.id].name} is BROKEN!
TAP SPACE: open  ·  HOLD SPACE: patch the leak`
        : `Press SPACE to use ${TERMINALS[zone.id].name}`;
      this.prompt.setText(label).setPosition(p.x, p.y - 34).setVisible(true);
    } else this.prompt.setVisible(false);

    if (UI.modalOpen) {
      this.holding = false; S.patching = false;
      if ((spaceDown || escDown) && UI.closable) closeModal();
    } else {
      if (spaceDown && zone && S.phase !== 'night' && S.phase !== 'over') {
        if (faultedHere) { this.holding = true; this.holdT = 0; }   // tap = open, hold = patch
        else openTerminal(zone.id);
      }
      if (this.holding) {
        if (this.space.isDown && faultedHere) {
          this.holdT += dt;
          S.patching = this.holdT >= HOLD_SECONDS;
        } else {
          if (spaceUp && faultedHere && this.holdT < HOLD_SECONDS) openTerminal(zone.id);
          this.holding = false; S.patching = false;
        }
      } else S.patching = false;
    }

    // marker visuals
    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    const obj = objective();
    for (const z of this.zones) {
      z.alert.setVisible(!!S.faults[z.id]).setAlpha(0.35 + 0.65 * pulse);
      z.base.setAlpha(obj.target === z.id ? 0.5 + 0.5 * pulse : 1);
    }
    const tz = this.zones.find((z) => z.id === obj.target);
    if (tz) this.arrow.setVisible(true).setPosition(tz.rect.centerX, tz.rect.top - 18 + Math.sin(time / 150) * 5);
    else this.arrow.setVisible(false);
  }
}

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */
window.addEventListener('error', (e) => { if (!scene) fatal(e.message); });

if (typeof Phaser === 'undefined') {
  fatal('Phaser could not be loaded from the internet.');
} else {
  const start = () => new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#c1440e',
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: MarsScene,
  });
  // wait (briefly) for the bubbly web font so in-world text uses it too
  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('700 20px Fredoka') : Promise.resolve();
  Promise.race([fontReady, new Promise((r) => setTimeout(r, 2500))]).catch(() => {}).then(start);
}
})();
