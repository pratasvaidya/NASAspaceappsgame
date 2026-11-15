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
const LOW_RES = 25;

const SHIELD_COST = 30;       // 30 Power: roughly a third of what the base makes in a day
const SOLAR_RATE = 0.15;      // Power per second while solar panels are extended
const SCRUB_RATE = 0.1;       // Power per second while dust scrubbers run
const DRAIN_DIV = 75;         // a glitch drains (hit / 75) per second
const PATCH_FACTOR = 0.25;    // holding SPACE at a broken terminal keeps 25% of the drain
const HOLD_SECONDS = 0.35;    // hold SPACE this long to start patching
const WALK_SPEED = 160;       // walking on bare Martian ground
const PATH_SPEED = 220;       // running on the paved pathways
const DUST_FACTOR = 0.55;     // dust makes you this much slower
const TUT_MAX = 55;           // training always finishes before a minute is up
const TUT_HOLD = 1.5;         // seconds to hold SPACE in the patching practice
const ESCALATE = 0.04;        // storms get 4% stronger every Sol

/* Replayability: three difficulties, a random "mission twist" every run, a score, and badges. */
const DIFFS = {
  easy:   { name: 'Cadet',     icon: ':plant:', blurb: 'Gentler storms and easier nights',  hit: 0.75, night: 0.8, start: 100, mult: 0.8 },
  normal: { name: 'Astronaut', icon: ':rocket-launch:', blurb: 'The real mission',                         hit: 1,    night: 1,   start: 100, mult: 1 },
  hard:   { name: 'Commander', icon: ':fire:', blurb: 'Stronger storms, a hungrier base, fewer supplies', hit: 1.25, night: 1.1, start: 90, mult: 1.3 },
};
const TWISTS = [
  { id: 'plain',  icon: ':map-pin:', name: 'Standard Landing Site', text: 'A normal landing site. No surprises!', mods: {} },
  { id: 'sunny',  icon: ':sun:', name: 'Sunny Plateau',  text: 'Solar panels make 60% more Power, but you landed with less Food.', mods: { solar: 1.6, start: { food: -20 } } },
  { id: 'garden', icon: ':plant:', name: 'Garden Dome',    text: 'Crop Incubators grow 50% more Food, but you landed with less Oxygen.', mods: { grow: 1.5, start: { oxygen: -20 } } },
  { id: 'shield', icon: ':shield-check:', name: 'Shield Ridge',   text: 'Shields cost less Power (21 instead of 30), but you landed with less Power.', mods: { shield: 0.7, start: { power: -15 } } },
  { id: 'dusty',  icon: ':tornado:', name: 'Dusty Valley',   text: 'Dust scrubbers use twice the Power, but panels you sweep give 50% more Power.', mods: { scrub: 2, sweep: 1.5 } },
];
const BADGES = [
  { id: 'survivor',  icon: ':trophy:', name: 'Mars Survivor',       text: 'Finish all 10 Sols',                       test: (s) => s.result === 'won' },
  { id: 'dodger',    icon: ':shield-check:', name: 'Storm Dodger',        text: 'Block 3 storms in one mission',            test: (s) => s.stats.blocked >= 3 },
  { id: 'fixit',     icon: ':wrench:', name: 'Fix-It Pro',          text: 'Reset 3 broken systems in one mission',    test: (s) => s.stats.fixed >= 3 },
  { id: 'scientist', icon: ':microscope:', name: 'Junior Scientist',    text: 'Collect 5 :star: research in one mission',      test: (s) => s.research >= 5 },
  { id: 'calm',      icon: ':snowflake:', name: 'Cool Under Pressure', text: 'Win without any bar dropping under 25',    test: (s) => s.result === 'won' && s.stats.minRes >= 25 },
  { id: 'hull',      icon: ':meteor:',    name: 'Hull Hero',           text: 'Patch 3 hull breaches in one mission',      test: (s) => s.stats.patched >= 3 },
  { id: 'finder',    icon: ':sparkle:',   name: 'Treasure Hunter',     text: 'Collect 3 surprise finds in one mission',   test: (s) => s.stats.finds >= 3 },
  { id: 'commander', icon: ':fire:', name: 'Commander',           text: 'Win a mission on Commander difficulty',    test: (s) => s.result === 'won' && s.diff === 'hard' },
];
/* Surprises: things that happen mid-Sol with NO warning in the briefing, so shields alone never solve a day.
   Each one is a short chain of steps (grab a tool, do the job, deliver it), so there is always something to plan. */
const SURPRISE_MIN = 22, SURPRISE_MAX = 62;   // they start somewhere in this window (seconds after the clock starts)
const BONUS_SECONDS = 80;                     // time limit for the supply pod / rock find chains
const LEAK_RATE = 0.35;                        // a hull breach loses this much per second at first...
const LEAK_GROWTH = 0.035;                    // ...and it gets worse: the rate grows by this fraction every second
const SUPPLY_GAIN = { easy: 34, normal: 28, hard: 22 };
const CARRY_SLOW = 0.7;                       // a heavy load slows you down
const DEVIL_SPEED = 100, DEVIL_HIT = 10;      // dust devil speed (pixels/second) and the oxygen it costs if it scratches your suit
const LEAK_SPOTS = ['terminal_lifesupport', 'terminal_hydroponics', 'terminal_airlock', 'terminal_shields'];
const LEAK_RES = { terminal_lifesupport: 'oxygen', terminal_hydroponics: 'food', terminal_airlock: 'oxygen', terminal_shields: 'power' };
const SUPPLY_WING = { power: 'terminal_shields', oxygen: 'terminal_lifesupport', food: 'terminal_hydroponics' };
const SURPRISES = {
  leak: { icon: ':meteor:', kind: 'disaster', short: 'Hull breach',
    lesson: 'Tiny space rocks called micrometeoroids hit spacecraft all the time. In 2016 a tiny fleck of space debris chipped a window on the International Space Station. Crews keep patch kits ready and fix small holes themselves, right away, because waiting for help from home takes too long.' },
  devil: { icon: ':tornado:', kind: 'disaster', short: 'Dust devil',
    lesson: 'Dust devils are real on Mars. NASA\'s Mars rovers have photographed them, and sometimes the wind even cleaned dust off the rovers\' solar panels, which helped them keep working. A base would have to sweep its panels itself.' },
  supply: { icon: ':sparkle:', kind: 'bonus', short: 'Supply pod',
    lesson: 'Real cargo ships like SpaceX Dragon and Cygnus deliver food and gear to the International Space Station. A Mars base would need regular deliveries too, and crews have to unpack and carry them to the right place.' },
  science: { icon: ':star:', kind: 'bonus', short: 'Rock find',
    lesson: 'NASA\'s Perseverance rover collects rock samples in sealed tubes so scientists can study them. Finding a good rock is only the start: the sample has to be collected carefully and its data sent home.' },
};
const KEY_DIFF = 'marsOutpost.diff.v1', KEY_BEST = 'marsOutpost.best.v1', KEY_BADGES = 'marsOutpost.badges.v1', KEY_TUT = 'marsOutpost.tutorial.v1';

/* The training: under a minute, learn by doing. Each step points at a pad with the pink arrow. */
const TUT_STEPS = [
  { target: 'terminal_comms', text: 'Walk to the :broadcast: Comms pad and press SPACE',
    icon: ':broadcast:', title: 'Comms Center',
    body: `<p>Every Sol starts here. You get a <b>real NASA space-weather</b> news report that says <b>which storm is coming and when</b>.</p>
           <p>The Sol clock only starts when <i>you</i> press Start.</p>` },
  { target: 'terminal_shields', text: 'Run up to the :shield-check: Shields pad (north) and press SPACE',
    icon: ':shield-check:', title: 'North Shields',
    body: `<p>Shields block a storm, but only if you raise them <b>before</b> it hits.</p>
           <div class="chips"><span class="chip cost">−30 :lightning: Power</span></div>
           <p><b>Nothing is free!</b> Watch your :lightning: Power bar drop when you press Got it.</p>`,
    after: () => { S.res.power = 70; toast(':lightning: See that? Power dropped by 30. Everything has a price!', 'bad'); } },
  { target: 'terminal_lifesupport', hold: true, text: ':wind: Life Support is broken! Run west and HOLD SPACE for 2 seconds',
    icon: ':wrench:', title: 'You patched it!',
    body: `<p>When a storm breaks something, supplies <b>leak out</b>. Holding SPACE on the red pad <b>slows the leak</b>.</p>
           <p>Then ask Earth for a reset code at :broadcast: Comms. Real messages take about <b>25 minutes</b> each way, so in this game it takes <b>25 seconds</b>. Hold on until it arrives!</p>` },
];

const MAP_PATH = 'assets/kenney_sci-fi-rts/outpost_map.json';
const TILES_PATH = 'assets/kenney_sci-fi-rts/Spritesheet/scifiRTS_spritesheet@2.png';
const ATLAS_XML = 'assets/kenney_sci-fi-rts/Spritesheet/scifiRTS_spritesheet@2.xml';
const WORLD_ICONS = ['broadcast', 'books', 'shield-check', 'plant', 'wind', 'door', 'warning', 'arrow-fat-down', 'house', 'star', 'sparkle', 'tornado'];
const iconOf = (token) => String(token).replace(/:/g, '');   // ':broadcast:' -> 'broadcast'

const FONT = 'Fredoka, "Arial Rounded MT Bold", "Comic Sans MS", sans-serif';

const RES = {
  power:  { label: 'Power',  icon: ':lightning:' },
  oxygen: { label: 'Oxygen', icon: ':wind:' },
  food:   { label: 'Food',   icon: ':orange:' },
};

const TERMINALS = {
  terminal_comms:       { name: 'Comms Center',      icon: ':broadcast:', color: 0x4fc3f7 },
  terminal_archives:    { name: 'NASA Archives',     icon: ':books:', color: 0xc792ea },
  terminal_shields:     { name: 'North Shields',     icon: ':shield-check:', color: 0x7aa2ff },
  terminal_hydroponics: { name: 'East Hydroponics',  icon: ':plant:', color: 0x7ddc5c },
  terminal_lifesupport: { name: 'West Life Support', icon: ':wind:', color: 0x66e0d0 },
  terminal_airlock:     { name: 'South Airlock',     icon: ':door:', color: 0xffb347 },
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
      cost: { oxygen: 15 }, gain: {}, stars: 1, done: 'Great science! +1 :star: Research.' },
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
const store = {   // saved on this device only; always safe if storage is blocked
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: that's fine */ } },
};

function fatal(msg) {
  $('loading').hidden = true;
  const f = $('fatal');
  f.hidden = false;
  f.innerHTML = ic(`<div>:heart-break: Oops! The game could not start.<br><small>${msg}</small><br><br>
    If you opened <code>index.html</code> by double-clicking, start a local server instead:<br>
    <code>python -m http.server 8000</code> then open <code>http://localhost:8000</code></div>`);
}

const costChips = (cost, gain, stars, extra) =>
  `<div class="chips">` +
  Object.entries(cost || {}).map(([k, v]) => `<span class="chip cost">−${v} ${RES[k].icon} ${RES[k].label}</span>`).join('') +
  Object.entries(gain || {}).map(([k, v]) => `<span class="chip gain">+${v} ${RES[k].icon} ${RES[k].label}</span>`).join('') +
  (stars ? `<span class="chip gain">+${stars} :star: Research</span>` : '') +
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
  // difficulty and the Sol number make storms stronger (real-data strength is already in ev.scale)
  ev.level = DIFFS[S.diff].hit * (1 + ESCALATE * (S.sol - 1));
  Object.keys(ev.hit || {}).forEach((k) => { ev.hit[k] = Math.max(5, Math.round(ev.hit[k] * ev.scale * ev.level / 5) * 5); });
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
  diff: 'normal',         // easy | normal | hard (remembered between visits)
  twist: TWISTS[0],       // this mission's random landing-site twist
  stats: { blocked: 0, fixed: 0, minRes: 100, finds: 0, patched: 0 },
  plan: null,             // the surprise planned for this Sol (not shown in the briefing!)
  surprise: null,         // the surprise that is happening now
  carrying: null,         // something heavy being carried for a surprise
  solarMul: 1,            // 0.5 while the solar panels are dusty after a dust devil
  final: null,            // score, best score and new badges, worked out once when the mission ends
};
S.diff = DIFFS[store.get(KEY_DIFF, 'normal')] ? store.get(KEY_DIFF, 'normal') : 'normal';

// training state (only used while S.phase === 'tutorial')
const T = { active: false, step: 0, started: false, elapsed: 0, hold: 0 };
const tutorialSeen = () => !!store.get(KEY_TUT, false);

const UI = { modalOpen: false, modalKind: null, modalRender: null, closable: true, lastSig: -1 };

/* twist-aware numbers (every price and rate goes through these, so the screen always matches the game) */
const mod = (k) => (S.twist.mods && S.twist.mods[k]) || 1;
const solarRate = () => SOLAR_RATE * mod('solar');
const scrubRate = () => SCRUB_RATE * mod('scrub');
function actionCost(a) {
  const c = { ...(a.cost || {}) };
  if (a.id === 'shield') c.power = Math.round(SHIELD_COST * mod('shield'));
  return c;
}
function actionGain(a) {
  const g = { ...(a.gain || {}) };
  if (a.id === 'grow') g.food = Math.round(g.food * mod('grow'));
  if (a.id === 'sweep') g.power = Math.round(g.power * mod('sweep'));
  return g;
}
function baseline() {
  const m = DIFFS[S.diff].night, o = {};
  Object.keys(BASELINE).forEach((k) => { o[k] = Math.round(BASELINE[k] * m); });
  return o;
}

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

/* "Start Mission": first-time players get the short training first. */
function newGame() {
  if (!tutorialSeen()) startTutorial(); else beginRun();
}

function beginRun() {
  T.active = false;
  eventBag = [];
  S.twist = pick(TWISTS);                       // a different landing site every mission
  const start = DIFFS[S.diff].start, d = (S.twist.mods && S.twist.mods.start) || {};
  S.res = {};
  Object.keys(RES).forEach((k) => { S.res[k] = clamp(start + (d[k] || 0), 10, MAX_RES); });
  S.research = 0;
  S.result = null;
  S.lossReason = '';
  S.final = null;
  S.stats = { blocked: 0, fixed: 0, minRes: 100, finds: 0, patched: 0 };
  startSol(1);
}

/* ---------------------------------------------------------------------
   Training (under a minute): comms -> shields (see the price) -> hold-to-patch practice
   --------------------------------------------------------------------- */
function startTutorial() {
  Object.assign(T, { active: true, step: 0, started: false, elapsed: 0, hold: 0 });
  S.phase = 'tutorial';
  S.res = { power: 100, oxygen: 100, food: 100 };
  S.faults = {}; S.scrubbers = true; S.patching = false; S.signal = { status: 'idle', remaining: 0 };
  S.event = null; S.sol = 1; S.timeLeft = CRISIS_SECONDS; S.research = 0;
  S.surprise = null; S.plan = null; S.carrying = null; S.solarMul = 1;
  if (scene && scene.clearDrop) scene.clearDrop();
  if (scene && scene.clearDevil) scene.clearDevil();
  S.twist = TWISTS[0];
  if (scene) scene.teleportToSpawn();
  showModal({
    kind: 'tutorial', icon: ':graduation-cap:', title: 'Mars Training',
    body: `<p>Hi, astronaut! You run a tiny base on Mars. Keep these three bars above zero for <b>${SOL_GOAL} Sols</b> (Mars days):</p>
      <div class="chips"><span class="chip gain">:lightning: Power</span><span class="chip gain">:wind: Oxygen</span><span class="chip gain">:orange: Food</span></div>
      <div class="card"><b>3 things to know:</b><ul>
        <li>:sun: Space <b>storms</b> break stuff.</li>
        <li>:coins: <b>Everything costs something.</b></li>
        <li>:broadcast: Earth answers <b>slowly</b>.</li></ul></div>
      <p>Training takes <b>under a minute</b>. Walk with <span class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> or the arrow keys and follow the <b style="color:#ff5fa8">pink arrow</b> :arrow-fat-down:.</p>`,
    buttons: [
      { label: "Let's go! :play:", cls: 'good', onClick: closeModal },
      { label: 'Skip training', cls: 'secondary', onClick: skipTutorial },
    ],
    noClose: true, keyHint: 'Press <kbd>SPACE</kbd> to start',
    onClose: () => { if (T.active) T.started = true; },
  });
}

function skipTutorial() {
  if (!T.active) return;
  T.active = false;
  closeModal();
  store.set(KEY_TUT, true);
  beginRun();
}

function finishTutorial(auto) {
  T.active = false;
  store.set(KEY_TUT, true);
  closeModal();
  beginRun();
  if (auto) toast(':graduation-cap: Training done! Good luck, astronaut!', 'good');
}

function openTutorialCard(i) {
  const st = TUT_STEPS[i];
  showModal({
    kind: 'tutorial', icon: st.icon, title: st.title, body: st.body,
    buttons: [{ label: 'Got it! :play:', cls: 'good', onClick: closeModal }],
    noClose: true, keyHint: 'Press <kbd>SPACE</kbd> to continue',
    onClose: () => advanceTutorial(i),
  });
}

function advanceTutorial(i) {
  if (!T.active || T.step !== i) return;
  const st = TUT_STEPS[i];
  if (st.after) st.after();
  T.step++; T.hold = 0;
  if (T.step < TUT_STEPS.length) return;
  showModal({
    kind: 'tutorial', icon: ':rocket-launch:', title: "You're ready!",
    body: `<div class="card"><ul>
        <li>:shield-check: Raise shields <b>before</b> the storm hits.</li>
        <li>:wrench: If something breaks: ask Earth at :broadcast: Comms, then <b>HOLD SPACE</b> at the red pad.</li>
        <li>:meteor: <b>Surprises</b> happen with no warning. Follow the pink arrow and act fast!</li>
        <li>:scales: Check your three bars. <b>Every choice has a price.</b></li></ul></div>
      <p class="hint">Each mission has a different storm order, landing site and real NASA data. Try all three difficulties and collect every badge!</p>`,
    buttons: [{ label: ':rocket-launch: Start Sol 1', cls: 'good', onClick: closeModal }],
    noClose: true, keyHint: 'Press <kbd>SPACE</kbd> to start',
    onClose: () => { if (T.active) finishTutorial(false); },
  });
}

/* called every frame while training: counts the clock (hard stop) and watches the hold-to-patch practice */
function tutorialTick(dt, zone, spaceDown, spaceHeld) {
  if (T.started) {
    T.elapsed += dt;
    if (T.elapsed >= TUT_MAX) { T.active = false; finishTutorial(true); return; }
  }
  const st = TUT_STEPS[T.step];
  if (!st || UI.modalOpen || !T.started) return;
  if (!zone || zone.id !== st.target) { T.hold = 0; return; }
  if (st.hold) {
    if (spaceHeld) { T.hold += dt; if (T.hold >= TUT_HOLD) { T.hold = 0; openTutorialCard(T.step); } } else T.hold = 0;
  } else if (spaceDown) openTutorialCard(T.step);
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
  if (scene && scene.clearDrop) scene.clearDrop();
  S.surprise = null;
  S.carrying = null;
  S.solarMul = 1;
  if (scene && scene.clearDevil) scene.clearDevil();
  S.plan = rollSurprise(S.event);
  if (scene) scene.teleportToSpawn();
  closeModal();
  toast(`:sun-horizon: Sol ${n} begins! Visit the Comms Center for your briefing.`);
}

function readBriefing() {
  const ev = S.event;
  S.phase = 'crisis';
  if (ev.bonus) { addAll(ev.bonus, 1); S.startRes = { ...S.res }; toast(`:sun: ${ev.bonusText}`, 'good'); }
  else toast(':timer: The 90-second clock is running. Protect the base!', 'bad');
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

/* what the world should look like right now (drives the night tint, dust storm haze and lamp glow) */
function currentMood() {
  if (S.phase === 'night') return 'night';
  if (S.phase === 'crisis' && S.event && S.event.kind === 'dust' && S.arrived) return 'storm';
  return 'day';
}

function stormArrives() {
  const ev = S.event;
  S.arrived = true;
  if (scene && scene.shakeScreen) scene.shakeScreen(!protectedNow());
  if (protectedNow()) {
    S.blocked = true;
    S.stats.blocked++;
    toast(ev.protect === 'shields' ? ':shield-check: The shields blocked the storm!' : ':moon: Panels were folded away. Dust missed them!', 'good');
  } else {
    S.faults[ev.faultTerminal] = true;
    toast(`${ev.emoji} It hit! ${ev.faultLabel}. Ask Earth for help!`, 'bad');
  }
}

/* ---------------------------------------------------------------------
   Surprises: short chains of steps
   --------------------------------------------------------------------- */
function rollSurprise(ev) {
  try {                                           // ?surprise=leak|devil|supply|science forces one early (handy for demos)
    const forced = new URLSearchParams(location.search).get('surprise');
    if (SURPRISES[forced]) return { id: forced, at: 4 };
  } catch (e) { /* no URL */ }
  const calm = !ev.faultTerminal;                 // calm Sols always get one, so quiet days are never boring
  const chance = calm ? 1 : clamp(0.4 + 0.03 * (S.sol - 1) + (S.diff === 'hard' ? 0.1 : S.diff === 'easy' ? -0.1 : 0), 0, 0.9);
  if (Math.random() > chance) return null;
  // storm days lean towards disasters, calm days towards opportunities
  const w = calm ? [['supply', 0.3], ['science', 0.3], ['leak', 0.2], ['devil', 0.2]] : [['leak', 0.4], ['devil', 0.3], ['supply', 0.15], ['science', 0.15]];
  let r = Math.random(), id = w[w.length - 1][0];
  for (const [k, pr] of w) { if (r < pr) { id = k; break; } r -= pr; }
  return { id, at: randInt(SURPRISE_MIN, SURPRISE_MAX) };
}

let bannerTimer = null;
function banner(html, kind) {
  const b = $('banner');
  b.innerHTML = ic(html);
  b.className = kind || '';
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, 5200);
}

/* The steps of each surprise. A step is done by standing on its pad (or spot) and HOLDING SPACE. */
function buildSteps(kind, sp) {
  const airlock = TERMINALS.terminal_airlock.name;
  if (kind === 'leak') return [
    { id: 'kit', terminal: 'terminal_airlock', hold: 1, verb: 'grab the patch kit', text: `Grab a patch kit at ${airlock}`, cost: { oxygen: 2 } },
    { id: 'patch', terminal: sp.terminal, hold: 1.6, verb: 'patch the hole', text: `Patch the hole at ${TERMINALS[sp.terminal].name}` },
  ];
  if (kind === 'devil') return [
    { id: 'dodge', auto: true, text: 'Dodge the dust devil! Do not let it touch you',
      onDone: () => { S.solarMul = 0.35; addRes('power', -8); toast(':sun: Dust got into the panels and batteries: −8 Power, and weak sunlight until you sweep them!', 'bad'); } },
    { id: 'sweep', terminal: 'terminal_airlock', hold: 2, verb: 'sweep the panels', text: `The panels are dusty! Sweep them clean at ${airlock}`, cost: { oxygen: 3 } },
  ];
  if (kind === 'supply') return [
    { id: 'cart', terminal: 'terminal_airlock', hold: 1, verb: 'grab a cargo cart', text: `Grab a cargo cart at ${airlock}`, cost: { oxygen: 2 } },
    { id: 'open', point: sp.point, hold: 2, verb: 'pry the pod open', text: 'Run to the pod and pry it open',
      onDone: () => { S.carrying = { icon: 'sparkle', slow: CARRY_SLOW, label: 'supplies' }; } },
    { id: 'deliver', terminal: sp.wing, hold: 1, verb: 'unload the supplies', text: `Carry the supplies to ${TERMINALS[sp.wing].name} (the load slows you down)` },
  ];
  return [
    { id: 'kit', terminal: 'terminal_airlock', hold: 1, verb: 'grab the sample kit', text: `Grab a sample kit at ${airlock}` },
    { id: 'dig', point: sp.point, hold: 2, verb: 'collect the rock', text: 'Run to the glowing rock and collect a sample',
      onDone: () => { S.carrying = { icon: 'star', slow: 1, label: 'rock sample' }; } },
    { id: 'send', terminal: 'terminal_comms', hold: 1.5, verb: 'send it to Earth', text: 'Take the sample to Comms and send it to Earth' },
  ];
}

function spawnSurprise() {
  const kind = S.plan.id;
  const sp = S.surprise = { id: kind, status: 'active', lost: 0, hits: 0, idx: 0, elapsed: 0, remaining: BONUS_SECONDS, steps: [] };
  const shake = (hard) => { if (scene && scene.shakeScreen) scene.shakeScreen(hard); };
  if (kind === 'leak') {
    sp.terminal = pick(LEAK_SPOTS.filter((t) => t !== S.event.faultTerminal));
    sp.res = LEAK_RES[sp.terminal];
    banner(`:meteor: SURPRISE! A space rock punched a hole in ${TERMINALS[sp.terminal].name}! Grab a patch kit at the South Airlock!`, 'bad');
    shake(true);
  } else if (kind === 'devil') {
    banner(':tornado: SURPRISE! A DUST DEVIL is rolling across the base! Dodge it!', 'bad');
    if (scene && scene.spawnDevil) scene.spawnDevil();
    shake(true);
  } else {
    sp.point = scene && scene.pickSpot ? scene.pickSpot() : { x: 600, y: 600 };
    if (kind === 'supply') { sp.low = Object.keys(S.res).sort((a, b) => S.res[a] - S.res[b])[0]; sp.wing = SUPPLY_WING[sp.low]; }
    if (scene && scene.spawnDrop) scene.spawnDrop(sp);
    banner(kind === 'supply'
      ? ':sparkle: SURPRISE! A supply pod crashed! Get a cargo cart at the South Airlock, then pry it open!'
      : ':star: SURPRISE! The rover found a glowing rock! Get a sample kit at the South Airlock first!', 'good');
    shake(false);
  }
  sp.steps = buildSteps(kind, sp);
}

const currentStep = () => { const sp = S.surprise; return sp && sp.status === 'active' ? sp.steps[sp.idx] || null : null; };

function completeStep() {
  const sp = S.surprise, st = currentStep();
  if (!st) return;
  if (st.cost) Object.entries(st.cost).forEach(([k, v]) => addRes(k, -Math.min(v, Math.max(0, S.res[k] - 1))));   // suiting up costs air, but never takes you to zero
  if (st.onDone) st.onDone(sp);
  sp.idx++;
  if (sp.idx >= sp.steps.length) finishSurprise();
  else toast(`:check-circle: Step ${sp.idx} of ${sp.steps.length} done!`, 'good');
}

function finishSurprise() {
  const sp = S.surprise;
  sp.status = 'done';
  S.carrying = null;
  if (sp.id === 'leak') {
    S.stats.patched++;
    toast(':wrench: Patched! The hole is sealed.', 'good');
  } else if (sp.id === 'devil') {
    S.solarMul = 1;
    toast(':sun: Panels are clean again: full Power!', 'good');
  } else if (sp.id === 'supply') {
    const got = Math.round(addRes(sp.low, SUPPLY_GAIN[S.diff]));            // what actually fit (a bar cannot go past 100)
    sp.gain = got >= 5 ? `You carried the supplies to ${TERMINALS[sp.wing].name}: +${got} ${RES[sp.low].label}, because that was what you were lowest on.`
      : 'You delivered the supplies, but your stores were already full. Next time, grab it when you are running low!';
    S.stats.finds++;
    toast(got >= 5 ? `:sparkle: Delivered! +${got} ${RES[sp.low].label}` : ':sparkle: Delivered! (supplies already full)', 'good');
  } else {
    S.research += 3;
    const got = Math.round(addRes('power', 10));
    sp.gain = `Earth loved your rock data: +3 Research stars${got ? ` and +${got} Power as a thank-you` : ''}.`;
    S.stats.finds++;
    toast(':star: Sample sent! +3 Research', 'good');
  }
  if (scene && scene.clearDrop) scene.clearDrop();
}

function missSurprise() {                  // ran out of time on a supply pod / rock find
  const sp = S.surprise;
  if (!sp || sp.status !== 'active') return;
  sp.status = 'missed';
  S.carrying = null;
  toast(`${SURPRISES[sp.id].icon} Too late: the wind buried the ${SURPRISES[sp.id].short.toLowerCase()}.`, 'bad');
  if (scene && scene.clearDrop) scene.clearDrop();
}

function devilDone() {                     // the dust devil left the map
  const st = currentStep();
  if (st && st.id === 'dodge') completeStep();
}

function surpriseLines(sp) {
  const d = SURPRISES[sp.id];
  if (sp.id === 'leak') {
    const nm = TERMINALS[sp.terminal].name, lost = Math.round(sp.lost);
    return [sp.status === 'done'
      ? { ok: true, text: `:meteor: Surprise! You fetched a patch kit and sealed the hull breach at ${nm}. It leaked ${lost} ${RES[sp.res].label} first.` }
      : { ok: false, text: `:meteor: Surprise! The hull breach at ${nm} leaked ${lost} ${RES[sp.res].label} all day. Next time: patch kit from the Airlock, then hold SPACE at the hole.` }];
  }
  if (sp.id === 'devil') {
    const out = [sp.hits ? { ok: false, text: `:tornado: Surprise! The dust devil scratched your suit ${sp.hits} time${sp.hits > 1 ? 's' : ''}: −${sp.hits * DEVIL_HIT} Oxygen.` } : { ok: true, text: ':tornado: Surprise! You dodged the dust devil without a scratch.' }];
    out.push(sp.status === 'done' ? { ok: true, text: ':sun: You swept the dust off the solar panels.' } : { ok: false, text: ':sun: The panels stayed dusty, so solar Power was cut by two thirds.' });
    return out;
  }
  if (sp.status === 'done') return [{ ok: true, text: `${d.icon} Surprise! ${sp.gain}` }];
  return [{ ok: false, text: `${d.icon} Surprise! You did not finish in time: the wind buried the ${d.short.toLowerCase()}.` }];
}

function endSol() {
  S.phase = 'night';
  S.patching = false;
  Object.keys(S.res).forEach((k) => { S.res[k] = Math.ceil(S.res[k] - 1e-9); });
  const ev = S.event;
  const sp = S.surprise;
  if (sp && sp.status === 'active' && (sp.id === 'supply' || sp.id === 'science')) missSurprise();
  S.carrying = null;
  if (scene && scene.clearDevil) scene.clearDevil();
  const lines = [];
  const stat = (k) => Object.entries(S.lost).filter(([, v]) => v >= 0.5).map(([r, v]) => `−${Math.round(v)} ${RES[r].label}`).join(', ');

  if (!ev.faultTerminal) {
    lines.push({ ok: true, text: ':sun: A calm Sol, with no storm damage.' });
  } else if (S.blocked) {
    lines.push({ ok: true, text: `${ev.protect === 'shields' ? ':shield-check: Your shields' : ':moon: Folding the solar panels'} stopped "${ev.title}" completely!` });
  } else if (!S.faults[ev.faultTerminal]) {
    lines.push({ ok: true, text: `:check-circle: You fixed ${TERMINALS[ev.faultTerminal].name}.${stat() ? ' Damage while broken: ' + stat() + '.' : ''}` });
  } else {
    // still broken at night: it keeps leaking until morning
    const night = {};
    Object.entries(ev.hit).forEach(([k, v]) => { night[k] = Math.round(v * 0.5); });
    addAll(night, -1);
    lines.push({ ok: false, text: `${ev.emoji} ${ev.faultLabel} all day. ${ev.hitText} (${stat() || 'a little'} during the day, then ${Object.entries(night).map(([k, v]) => `−${v} ${RES[k].label}`).join(', ')} overnight)` });
  }
  if (sp) lines.push(...surpriseLines(sp));
  if (S.retracted) lines.push({ ok: false, text: ':moon: Panels stayed folded: no solar power today.' });
  else lines.push({ ok: true, text: `:sun: Solar panels made +${Math.round(S.solar)} Power.` });
  if (S.scrubCost >= 0.5) lines.push({ ok: false, text: `:wind: Dust scrubbers used ${Math.round(S.scrubCost)} Power.` });

  const night0 = baseline();
  addAll(night0, -1);
  lines.push({ ok: false, text: `:moon: Night-time life support: −${night0.oxygen} Oxygen, −${night0.food} Food, −${night0.power} Power` });
  S.stats.minRes = Math.min(S.stats.minRes, ...Object.values(S.res));

  const dead = Object.keys(S.res).find((k) => S.res[k] <= 0);
  let next;
  if (dead) {
    S.result = 'lost';
    S.lossReason = `The base ran out of ${RES[dead].label.toLowerCase()} during the night.`;
    next = { label: 'Oh no…', cls: 'secondary', onClick: () => { S.phase = 'over'; showEndModal(); } };
  } else if (S.sol >= SOL_GOAL) {
    S.result = 'won';
    next = { label: ':confetti: Finish the mission!', cls: 'good', onClick: () => { S.phase = 'over'; showEndModal(); } };
  } else {
    next = { label: `:sun-horizon: Start Sol ${S.sol + 1}`, cls: 'good', onClick: () => startSol(S.sol + 1) };
  }

  const rows = Object.keys(RES).map((k) => {
    const d = S.res[k] - S.startRes[k];
    return `<tr><td>${RES[k].icon} ${RES[k].label}</td><td>${S.startRes[k]} → <b>${S.res[k]}</b></td>
      <td class="${d < 0 ? 'dn' : 'up'}">${d > 0 ? '+' : ''}${d}</td></tr>`;
  }).join('');

  showModal({
    kind: 'night', closable: false, icon: ':moon:', title: `Sol ${S.sol} Summary`,
    body: `<ul>${lines.map((l) => `<li class="${l.ok ? 'up' : ''}">${l.text}</li>`).join('')}</ul>
           <table class="sum">${rows}</table>
           ${S.research ? `<p>:star: Research so far: <b>${S.research}</b></p>` : ''}
           <div class="card science"><b>:graduation-cap: Real constraint:</b> ${ev.lesson}</div>
           ${sp ? `<div class="card science"><b>:meteor: About today's surprise:</b> ${SURPRISES[sp.id].lesson}</div>` : ''}
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
  if (!S.retracted) S.solar += addRes('power', solarRate() * S.solarMul * dt);
  if (scrubbersOn()) { const d = addRes('power', -scrubRate() * dt); S.scrubCost -= d; }

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
      toast(':broadcast: Earth replied! The reset code is ready.', 'good');
      if (UI.modalKind === 'comms') renderCurrentModal();
    }
  }
  // surprises: they start with no warning, somewhere in the Sol
  const elapsed = CRISIS_SECONDS - S.timeLeft;
  if (S.plan && !S.surprise && elapsed >= S.plan.at) spawnSurprise();
  const sp = S.surprise;
  if (sp && sp.status === 'active') {
    sp.elapsed += dt;
    if (sp.id === 'leak') { const d = addRes(sp.res, -LEAK_RATE * DIFFS[S.diff].hit * (1 + LEAK_GROWTH * sp.elapsed) * dt); sp.lost -= d; }
    else if (sp.id === 'supply' || sp.id === 'science') { sp.remaining -= dt; if (sp.remaining <= 0) missSurprise(); }
  }
  S.stats.minRes = Math.min(S.stats.minRes, ...Object.values(S.res));
  if (checkLose()) return;
  if (S.timeLeft <= 0) { S.timeLeft = 0; endSol(); }
}

/* ---------------------------------------------------------------------
   Objective (drives HUD text and the bouncing arrow in the world)
   --------------------------------------------------------------------- */
function objective() {
  if (S.phase === 'tutorial') {
    const st = TUT_STEPS[T.step];
    if (!T.started || !st) return { text: '', target: null };
    return { text: `:graduation-cap: Training ${T.step + 1}/${TUT_STEPS.length} · ${st.text}`, target: st.target };
  }
  if (S.phase === 'briefing') return { text: ':broadcast: Go to the Comms Center and read today\'s briefing (clock is paused)', target: 'terminal_comms' };
  if (S.phase !== 'crisis') return { text: '', target: null };
  const ev = S.event, ft = ev.faultTerminal;
  const sp = S.surprise, st = currentStep();
  if (st) {                                       // a surprise is the most urgent thing, unless a storm is about to hit
    const stormSoon = ft && !S.arrived && ev.protect && !protectedNow() && ev.arriveAt - (CRISIS_SECONDS - S.timeLeft) < 10;
    if (!stormSoon) {
      const bonus = SURPRISES[sp.id].kind === 'bonus';
      return { text: `${SURPRISES[sp.id].icon} Step ${sp.idx + 1}/${sp.steps.length}: ${st.text}${bonus ? ` (${Math.ceil(sp.remaining)}s)` : ''}`, target: st.terminal || null, point: st.point || null };
    }
  }
  if (ft && !S.arrived) {
    const left = Math.max(0, Math.ceil(ev.arriveAt - (CRISIS_SECONDS - S.timeLeft)));
    if (ev.protect && !protectedNow()) {
      return { text: `:alarm: ${ev.emoji} Arrives in ${left}s! ${ev.protect === 'shields' ? `Raise the shields (−${actionCost({ id: 'shield' }).power} :lightning:)` : 'Retract the solar panels'} in the North Wing`, target: 'terminal_shields' };
    }
    if (ev.protect) return { text: `:check-circle: Protected! Brace for it… ${left}s`, target: null };
    return { text: `:alarm: ${ev.emoji} Trouble arrives in ${left}s. Shields can't stop this one!`, target: null };
  }
  if (ft && S.faults[ft]) {
    const name = TERMINALS[ft].name;
    if (S.signal.status === 'idle') return { text: `:broadcast: ${name} is broken! Ask Earth for help at Comms`, target: 'terminal_comms' };
    if (S.signal.status === 'waiting') return { text: `:hourglass-medium: Earth is thinking… HOLD SPACE at ${name} to slow the leak!`, target: ft };
    return { text: `:check-circle: Reset code ready! Go to ${name} and press Reset`, target: ft };
  }
  return { text: ':wrench: Use your time wisely. Boost systems, or go for :star: research!', target: null };
}

/* ---------------------------------------------------------------------
   HUD
   --------------------------------------------------------------------- */
const hudCache = {};
function setText(el, key, v) { if (hudCache[key] !== v) { el.innerHTML = ic(v); hudCache[key] = v; } }   // :name: becomes an icon picture
function setHtml(el, key, v) { if (hudCache[key] !== v) { el.innerHTML = ic(v); hudCache[key] = v; } }

/* what the clock pill says during a Sol: only call it a crisis when something is actually broken */
function crisisLabel(paused) {
  if (paused) return 'Paused';
  const ev = S.event, sp = S.surprise;
  if (activeFault()) return 'Crisis';
  if (sp && sp.status === 'active') return 'Surprise!';
  if (!ev.faultTerminal) return 'Calm Sol';
  if (!S.arrived) return 'Trouble Coming';
  return S.blocked ? 'Blocked!' : 'All Clear';
}

function renderHUD() {
  $('hud').hidden = S.phase === 'title';
  $('skipTut').hidden = S.phase !== 'tutorial';
  const training = S.phase === 'tutorial';
  setText($('solNum'), 'sol', training ? 'Training' : `Sol ${S.sol}`);
  setText($('solOf'), 'solof', training ? 'practice' : `of ${SOL_GOAL}`);
  const paused = S.phase !== 'crisis' || UI.modalKind === 'archives';
  setText($('clock'), 'clock', training ? ':graduation-cap:' : S.phase === 'briefing' ? '1:30' : fmtTime(S.timeLeft));
  setText($('phaseLabel'), 'phase', training ? 'No rush' : S.phase === 'briefing' ? 'Paused · Briefing' : S.phase === 'crisis' ? crisisLabel(paused) : 'Night');
  $('clockBox').classList.toggle('paused', paused);

  document.querySelectorAll('.bar').forEach((bar) => {
    const k = bar.dataset.res, v = S.res[k];
    bar.querySelector('.fill').style.width = `${v}%`;
    setText(bar.querySelector('.val'), 'v' + k, String(Math.ceil(v - 1e-9)));
    bar.classList.toggle('low', v <= LOW_RES);
  });
  // the red flashing border means one of the big three is running low (and nothing else)
  document.body.classList.toggle('warning', S.phase !== 'title' && S.phase !== 'tutorial' && S.phase !== 'over' && Object.values(S.res).some((v) => v <= LOW_RES));

  const obj = objective();
  $('objective').hidden = !obj.text;
  setText($('objective'), 'obj', obj.text);

  let chips = '';
  if (S.phase === 'crisis') {
    const ev = S.event;
    if (ev.arriveAt != null && !S.arrived) chips += `<span class="chip info">${ev.emoji} Hits in ${Math.max(0, Math.ceil(ev.arriveAt - (CRISIS_SECONDS - S.timeLeft)))}s</span>`;
    if (activeFault()) chips += `<span class="chip alert">:warning: ${ev.faultLabel}</span>`;
    if (S.patching) chips += `<span class="chip ok">:wrench: Patching: leak slowed!</span>`;
    if (S.signal.status === 'waiting') chips += `<span class="chip info">:broadcast: Earth signal… ${Math.ceil(S.signal.remaining)}s</span>`;
    if (S.signal.status === 'ready' && activeFault()) chips += `<span class="chip ok">:broadcast: Reset code received</span>`;
    if (S.shieldUp) chips += `<span class="chip ok">:shield-check: Shields up</span>`;
    if (S.retracted) chips += `<span class="chip info">:moon: Panels folded</span>`;
    if (isDusty()) chips += `<span class="chip alert">:hourglass: Dust slows you down</span>`;
    const sp = S.surprise;
    if (sp && sp.status === 'active') {
      const d = SURPRISES[sp.id], prog = `${Math.min(sp.idx + 1, sp.steps.length)}/${sp.steps.length}`;
      chips += d.kind === 'disaster'
        ? `<span class="chip alert">${d.icon} ${d.short}! Step ${prog}</span>`
        : `<span class="chip info">${d.icon} ${d.short} ${prog} · ${Math.ceil(sp.remaining)}s</span>`;
    }
    if (S.carrying) chips += `<span class="chip ok">:${S.carrying.icon}: Carrying ${S.carrying.label}${S.carrying.slow < 1 ? ' (slower)' : ''}</span>`;
    if (S.solarMul < 1) chips += `<span class="chip alert">:sun: Dusty panels: half Power</span>`;
  }
  if (S.phase !== 'title' && S.phase !== 'tutorial') {
    chips += `<span class="chip info">:star: Research ${S.research}</span>`;
    chips += `<span class="chip info">${DIFFS[S.diff].icon} ${DIFFS[S.diff].name}</span><span class="chip info">${S.twist.icon} ${S.twist.name}</span>`;
  }
  setHtml($('status'), 'status', chips);
}

let toastTimer = null;
function toast(msg, kind) {
  const t = $('toast');
  t.innerHTML = ic(msg);
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
  const wasOpen = !!modal.querySelector('details[open]');      // keep "Science corner" open when the window refreshes
  modal.innerHTML = `
    <h2><span class="big">${ic(cfg.icon || '')}</span><span>${ic(cfg.title)}</span></h2>
    ${ic(cfg.body)}
    <div class="buttons"></div>
    ${UI.closable ? `<p class="hint keys">${cfg.keyHint || 'Press <kbd>ESC</kbd> or <kbd>SPACE</kbd> to close'}</p>` : ''}`;
  if (wasOpen) modal.querySelectorAll('details').forEach((d) => { d.open = true; });
  const box = modal.querySelector('.buttons');
  const buttons = (cfg.buttons || []).slice();
  if (UI.closable && !cfg.noClose) buttons.push({ label: 'Close', cls: 'secondary', onClick: closeModal });
  buttons.forEach((b) => {
    const el = document.createElement('button');
    el.className = `btn ${b.cls || ''}`;
    el.innerHTML = ic(b.label);
    el.disabled = !!b.disabled;
    el.addEventListener('click', () => { el.blur(); b.onClick && b.onClick(); });
    box.appendChild(el);
  });
  modal.scrollTop = scroll;
  UI.lastSig = Math.ceil(S.signal.remaining);
  if (cfg.after) cfg.after(modal);
}

function closeModal() {
  const done = UI.modalRender && UI.modalRender.onClose;
  UI.modalOpen = false;
  UI.modalKind = null;
  UI.modalRender = null;
  $('modal-backdrop').hidden = true;
  if (done) done();
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
    return `<div class="card real"><span class="tag ${live ? 'live' : ''}">:planet: ${ev.real.tag}</span>
      <p>${ev.real.text}</p>
      ${ev.scale !== 1 ? `<p>That makes today's storm <b>${ev.real.strength}</b> (damage ×${ev.scale}).</p>` : ''}
      <a href="${ev.real.link}" target="_blank" rel="noopener noreferrer">See the real NASA record</a></div>`;
  }
  return ev.realNote ? `<div class="card"><span class="tag">:books: About the data</span><p class="hint">${ev.realNote}</p></div>` : '';
}

function eventCard(ev) {
  const words = (ev.words || []).map(([t, d]) => `<li><b>${t}:</b> ${d}</li>`).join('') +
    `<li><b>Sol:</b> ${DATA.glossary.sol}</li>`;
  const timing = ev.arriveAt != null
    ? `<div class="card alert">:alarm: <b>Expected to hit about ${ev.arriveAt} seconds after the clock starts.</b>
        ${ev.protect === 'shields' ? ' Shields can stop it, but only if you raise them first!' : ev.protect === 'retract' ? ' Folding up the solar panels can save them, but only if you do it first!' : ' Shields cannot stop this one.'}</div>` : '';
  return `<span class="tag">${ev.source} · ${ev.category}</span>
    <p><b>${ev.emoji} ${ev.title}</b></p>
    <p>${ev.story}</p>
    ${timing}
    <div class="card"><b>:lightbulb: What to do:</b> ${ev.advice}</div>
    ${realCard(ev)}
    <details class="more"><summary>:microscope: Science corner &amp; new words (tap to open)</summary>
      <div class="card science"><b>:microscope: Real science:</b> ${ev.lesson}</div>
      <div class="card"><b>:book-open: Words to know</b><ul>${words}</ul></div>
    </details>`;
}

function missionCard() {
  const d = DIFFS[S.diff], tw = S.twist, ev = S.event;
  const stronger = Math.round((ev.level / d.hit - 1) * 100);
  return `<div class="chips"><span class="chip info">${d.icon} ${d.name}</span><span class="chip info">${tw.icon} ${tw.name}</span></div>
    <p class="hint">${tw.text}${stronger > 0 ? ` Storms are ${stronger}% stronger than on Sol 1.` : ''}</p>`;
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
          body: `${missionCard()}${eventCard(ev)}<div class="card"><b>:warning: Heads up:</b> surprises can happen at any time with <b>no warning</b>. Keep your eyes open!</div><p class="hint">The clock starts when you press the button!</p>`,
          buttons: [{ label: `:timer: Start Sol ${S.sol}`, cls: 'good', onClick: () => { readBriefing(); closeModal(); } }],
          noClose: true,
        };
      }
      const ft = ev.faultTerminal;
      let sig = '';
      const buttons = [];
      if (!ft) {
        sig = `<div class="card">No systems are broken today, so no help from Earth is needed. :confetti:</div>`;
      } else if (!S.arrived) {
        sig = `<div class="card">Nothing is broken yet. You can only ask Earth for help once something breaks.
          <p class="hint">Messages between Mars and Earth are slow, so it is smart to get ready now.</p></div>`;
      } else if (S.blocked) {
        sig = `<div class="card">:check-circle: The storm was blocked. Nothing needs fixing!</div>`;
      } else if (!S.faults[ft]) {
        sig = `<div class="card">:check-circle: ${TERMINALS[ft].name} is already fixed. Nice work!</div>`;
      } else if (S.signal.status === 'idle') {
        sig = `<div class="card alert"><b>${ev.faultLabel}.</b> You need Earth's reset code.
          <p class="hint">A message to Earth and back really takes about 25 minutes. Here it takes ${SIGNAL_SECONDS} seconds.
          <b>You can't just wait here!</b> The leak keeps draining supplies. Run to ${TERMINALS[ft].name} and HOLD SPACE to patch it while you wait.</p></div>`;
        buttons.push({ label: `:broadcast: Ask Earth for Help (${SIGNAL_SECONDS}s)`, cls: 'good', onClick: () => {
          S.signal = { status: 'waiting', remaining: SIGNAL_SECONDS };
          closeModal();
          toast(`:broadcast: Signal sent! Run to ${TERMINALS[ft].name} and HOLD SPACE to slow the leak.`, 'good');
        } });
      } else if (S.signal.status === 'waiting') {
        const pct = Math.round(100 * (1 - S.signal.remaining / SIGNAL_SECONDS));
        sig = `<div class="card"><b>:broadcast: Message traveling to Earth and back…</b>
          <div class="progress"><div style="width:${pct}%"></div></div>
          <p class="hint">${Math.ceil(S.signal.remaining)} seconds left. Go patch ${TERMINALS[ft].name}!</p></div>`;
      } else {
        sig = `<div class="card"><b>:check-circle: Earth replied!</b> The Reset button is now unlocked at <b>${TERMINALS[ft].name}</b>.</div>`;
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
    const lacking = canAfford(actionCost(a));
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
          body: `<p>:pause: The clock is paused. Go to the <b>Comms Center</b> first and read today's briefing!</p>`, buttons: [] };
      }
      const faulted = !!S.faults[id];
      let body = msgHtml(msg);
      const buttons = [];

      body += faulted
        ? `<div class="card alert"><b>:warning: BROKEN!</b> ${ev.faultLabel}. Supplies are leaking. Boosts here are locked until it is reset.
            <p class="hint">Close this window and <b>HOLD SPACE</b> on the glowing pad to slow the leak while you wait for Earth.</p></div>`
        : `<div class="card">:check-circle: ${t.name} is working normally.</div>`;

      ACTIONS[id].forEach((a) => {
        const reason = actionAvailability(id, a);
        if (a.type === 'toggle') {
          if (a.id === 'solar') {
            body += `<h3>:sun: ${a.name}</h3>
              <p>Panels are <b>${S.retracted ? 'FOLDED AWAY' : 'OUT'}</b>. Out, they make Power. Folded, they are safe from dust but make nothing.</p>
              ${costChips({}, {}, 0, S.retracted ? '<span class="chip gain">Folded: safe from dust storms</span><span class="chip cost">No solar Power</span>'
                : `<span class="chip gain">+${+solarRate().toFixed(2)} :lightning: every second</span><span class="chip cost">Dust storm can hurt them</span>`)}`;
            buttons.push({ label: S.retracted ? ':sun: Extend Panels' : ':moon: Retract Panels', cls: '', onClick: () => {
              S.retracted = !S.retracted;
              const late = S.retracted && S.arrived && ev.protect === 'retract' && !S.blocked;
              toast(S.retracted ? ':moon: Panels folded away.' : ':sun: Panels are out again.', 'good');
              openWing(id, { text: S.retracted ? `Panels folded.${late ? ' (Too late to stop the dust that already hit.)' : ''}` : 'Panels extended.' });
            } });
          } else if (a.id === 'scrub') {
            const on = scrubbersOn();
            body += `<h3>:wind: ${a.name}</h3>
              <p>Martian dust is sharp and sneaky. With scrubbers <b>${on ? 'ON' : 'OFF'}</b> the base is ${on ? 'clean' : '<b>dusty, and you walk slowly</b>'}.</p>
              ${costChips({}, {}, 0, on ? `<span class="chip cost">−${+scrubRate().toFixed(2)} :lightning: every second</span>` : '<span class="chip cost">:hourglass: Slow walking</span><span class="chip gain">Saves Power</span>')}`;
            buttons.push({ label: reason ? `Dust Scrubbers (${reason})` : (S.scrubbers ? ':prohibit: Turn Scrubbers OFF' : ':check-circle: Turn Scrubbers ON'), disabled: !!reason, onClick: () => {
              S.scrubbers = !S.scrubbers;
              openWing(id, { text: S.scrubbers ? 'Scrubbers are running.' : 'Scrubbers are off: saving Power, but dust will slow you down!', bad: !S.scrubbers });
            } });
          }
          return;
        }
        body += `<h3>${a.name}</h3><p>${a.blurb}</p>${costChips(actionCost(a), actionGain(a), a.stars)}`;
        if (a.id === 'shield' && !reason) {
          const hint = ev.protect === 'shields' ? '' : (ev.faultTerminal ? 'Careful: shields can\'t stop today\'s problem!' : 'No storm is coming today, so shields would be wasted.');
          if (hint) body += `<p class="hint">:warning: ${hint}</p>`;
        }
        buttons.push({
          label: reason ? `${a.name} (${reason})` : a.name, disabled: !!reason,
          onClick: () => {
            addAll(actionCost(a), -1); addAll(actionGain(a), 1);
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
        body += `<h3>:wrench: Critical System Reset</h3>${costChips(RESET_COST)}`;
        let rReason = '';
        if (S.signal.status === 'idle') rReason = 'Needs a reset code from Earth: visit Comms';
        else if (S.signal.status === 'waiting') rReason = `Waiting for Earth… ${Math.ceil(S.signal.remaining)}s`;
        else if (canAfford(RESET_COST)) rReason = `Not enough ${RES[canAfford(RESET_COST)].label}`;
        body += `<p class="hint">${rReason || 'Earth\'s reset code has arrived. You are cleared to reset!'}</p>`;
        buttons.push({
          label: ':wrench: Reset System', cls: 'good', disabled: !!rReason,
          onClick: () => {
            addAll(RESET_COST, -1);
            S.faults[id] = false;
            S.stats.fixed++;
            S.patching = false;
            toast(`:check-circle: ${t.name} is fixed!`, 'good');
            if (!checkLose()) openWing(id, { text: ':wrench: Reset complete! The leak has stopped.' });
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
        body: `<p class="hint">:pause: The clock is paused while you read.</p>
          <p>Welcome, space scout! Here is the real NASA science behind this game.</p>
          <h3>Real space weather records</h3>
          <div class="card real"><span class="tag ${DONKI.status === 'live' ? 'live' : ''}">:planet: ${DONKI.label}</span>
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
function badgeGrid(earned) {
  return `<div class="badges">${BADGES.map((b) => `<div class="badge ${earned[b.id] ? 'got' : 'locked'}">
      <span class="bi">${earned[b.id] ? b.icon : ':lock:'}</span><span><b>${b.name}</b><small>${b.text}</small></span></div>`).join('')}</div>`;
}

function showTitle() {
  showModal({
    kind: 'title',
    build: () => {
      const earned = store.get(KEY_BADGES, {}), best = store.get(KEY_BEST, {});
      const got = BADGES.filter((b) => earned[b.id]).length;
      const diffs = Object.entries(DIFFS).map(([id, d]) =>
        `<button class="diff ${S.diff === id ? 'on' : ''}" data-diff="${id}"><span class="di">${d.icon}</span><b>${d.name}</b><small>${d.blurb}</small>${best[id] ? `<em>Best: ${best[id]}</em>` : ''}</button>`).join('');
      const loading = DONKI.status === 'loading';
      const buttons = [{ label: loading ? ':hourglass-medium: Contacting NASA…' : ':rocket-launch: Start Mission', cls: 'good', disabled: loading, onClick: () => { newGame(); } }];
      if (tutorialSeen()) buttons.push({ label: ':graduation-cap: Training', cls: 'secondary', disabled: loading, onClick: () => { startTutorial(); } });
      return {
        closable: false, icon: ':rocket-launch:', title: 'Mars Outpost Survival',
        body: `<p>You are the only astronaut on Mars! Keep <b>:lightning: Power</b>, <b>:wind: Oxygen</b> and <b>:orange: Food</b> above zero for <b>${SOL_GOAL} Sols</b> (Mars days) while real NASA space weather tries to ruin your day.</p>
          <p class="keys">Walk: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows &nbsp;·&nbsp; Use a pad: <kbd>SPACE</kbd> &nbsp;·&nbsp; Paths are faster!</p>
          ${tutorialSeen() ? '' : '<p class="hint">First time? A quick training (under a minute) comes first.</p>'}
          <h3>Pick your challenge</h3><div class="diffs">${diffs}</div>
          <p class="hint">Every mission has a different storm order, a random landing site, and real NASA data.</p>
          <h3>Badges: ${got}/${BADGES.length}</h3>${badgeGrid(earned)}
          <div class="card real"><span class="tag ${DONKI.status === 'live' ? 'live' : ''}">:planet: ${DONKI.label}</span></div>`,
        buttons,
        after: (m) => m.querySelectorAll('.diff').forEach((el) => el.addEventListener('click', () => {
          S.diff = el.dataset.diff; store.set(KEY_DIFF, S.diff); renderCurrentModal();
        })),
      };
    },
  });
}

/* Score, personal best and badges are worked out once, when a mission ends. Saved on this device only. */
function finalizeRun() {
  if (S.final) return S.final;
  const d = DIFFS[S.diff], won = S.result === 'won';
  const parts = {
    sols: (won ? SOL_GOAL : Math.max(0, S.sol - 1)) * 100,
    supplies: won ? Object.values(S.res).reduce((t, v) => t + Math.ceil(v), 0) : 0,
    science: S.research * 40,
  };
  const score = Math.round((parts.sols + parts.supplies + parts.science) * d.mult);
  const best = store.get(KEY_BEST, {}), prev = best[S.diff] || 0;
  const isNew = score > prev;
  if (isNew) { best[S.diff] = score; store.set(KEY_BEST, best); }
  const have = store.get(KEY_BADGES, {});
  const fresh = BADGES.filter((b) => !have[b.id] && b.test(S));
  fresh.forEach((b) => { have[b.id] = true; });
  if (fresh.length) store.set(KEY_BADGES, have);
  const next = BADGES.find((b) => !have[b.id]) || null;
  S.final = { score, prev, isNew, parts, fresh, next };
  return S.final;
}

function showEndModal() {
  const won = S.result === 'won';
  const f = finalizeRun(), d = DIFFS[S.diff];
  const scoreCard = `<div class="card score">
      <div class="bigscore">:star: Score: ${f.score}</div>
      <div class="hint">Sols survived ${f.parts.sols} + supplies left ${f.parts.supplies} + research ${f.parts.science}${d.mult !== 1 ? ` &times; ${d.mult} (${d.name})` : ''}</div>
      <p>${f.isNew ? `:confetti: <b>New best on ${d.name}!</b>${f.prev ? ` (old best: ${f.prev})` : ''}` : `Your best on ${d.name}: <b>${f.prev}</b>`}</p></div>`;
  const badgeCard = (f.fresh.length ? `<div class="card real"><b>:medal: New badge${f.fresh.length > 1 ? 's' : ''}!</b> ${f.fresh.map((b) => `${b.icon} <b>${b.name}</b>`).join(' &nbsp; ')}</div>` : '') +
    (f.next ? `<p class="hint">Next badge to try: ${f.next.icon} <b>${f.next.name}</b>: ${f.next.text}.</p>` : '<p class="hint">:sparkle: You have every badge. Wow, space legend!</p>');
  showModal({
    kind: 'end', closable: false,
    icon: won ? ':trophy:' : ':heart-break:',
    title: won ? 'Mission Complete!' : 'Mission Failed',
    body: won
      ? `<p>You survived all ${SOL_GOAL} Sols on Mars at ${S.twist.icon} <b>${S.twist.name}</b>! You handled space weather, long Earth delays and tough trade-offs like a real NASA crew.</p>
         <div class="card">Final supplies: ${Object.keys(RES).map((k) => `${RES[k].icon} ${Math.ceil(S.res[k])}`).join(' &nbsp; ')}<br>:star: Research collected: <b>${S.research}</b></div>
         ${scoreCard}${badgeCard}`
      : `<p>${S.lossReason} You made it to Sol ${S.sol}. :star: Research: ${S.research}.</p>
         <div class="card science"><b>:graduation-cap: What to try:</b> Watch the storm countdown, raise shields or fold the panels <i>before</i> it hits, and HOLD SPACE at a broken pad while you wait for Earth.</div>
         ${scoreCard}${badgeCard}
         <p class="hint">Real astronauts and mission planners also learn from things that go wrong. Every run is different, so try again!</p>`,
    buttons: [
      { label: ':arrow-clockwise: Play Again', cls: 'good', onClick: () => newGame() },
      { label: ':house: Change challenge', cls: 'secondary', onClick: () => { S.phase = 'title'; showTitle(); } },
    ],
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
    this.load.atlasXML('rts', TILES_PATH, ATLAS_XML);          // the same art, with a name for every sprite
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
    this.ready = false;
    // pictures used inside the game world (pad icons, labels, the arrow) are made from the same icon set as the menus
    Promise.all(WORLD_ICONS.map((n) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.textures.addImage('ic_' + n, img); resolve(); };
      img.onerror = resolve;
      img.src = iconDataUrl(n, 96);
    }))).then(() => this.buildWorld()).catch((e) => fatal(String(e && e.message || e)));
  }

  buildWorld() {
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
    // Pathways: every ground tile that is NOT the plain Martian dirt (the most common ground tile) is a path.
    const counts = {};
    map.getLayer('Ground').data.forEach((row) => row.forEach((t) => { if (t.index > 0) counts[t.index] = (counts[t.index] || 0) + 1; }));
    const dirt = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]);
    this.pathIds = new Set(Object.keys(counts).map(Number).filter((i) => i !== dirt));
    this.walls.setCollisionByExclusion([-1]);   // every remaining wall tile blocks the player

    /* ---- interactables ---- */
    const objs = map.getObjectLayer('Interactables').objects;
    const defs = [];
    let spawn = { x: map.widthInPixels / 2, y: map.heightInPixels / 2 };
    objs.forEach((o) => {
      const name = normName(o.name);
      const rect = new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height);
      if (name === 'spawn_point') { spawn = { x: rect.centerX, y: rect.centerY }; return; }
      if (TERMINALS[name]) defs.push({ id: name, rect, rgb: [(TERMINALS[name].color >> 16) & 255, (TERMINALS[name].color >> 8) & 255, TERMINALS[name].color & 255].join(',') });
    });
    this.spawn = spawn;

    /* ---- the painted world (terrain, paving, props, shadows, lights, dust) ---- */
    this.scenery = null;
    try {
      this.scenery = Scenery.build(this, map, { ground: this.ground, walls: this.walls, pathIds: this.pathIds, zones: defs });
      this.ground.setVisible(false);                 // the paved paths are now painted; the tile data is still used for "am I on a path?"
    } catch (e) { console.error('Scenery failed, using plain tiles', e); }

    this.cutOutDecorTiles();
    this.zones = defs.map((d) => this.makeTerminalMarker(d.id, d.rect));
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
    // a soft glow under the astronaut so they stand out against the grey paving
    if (this.textures.exists('glow_soft')) this.halo = this.add.image(spawn.x, spawn.y + 10, 'glow_soft').setScale(0.62).setTint(0x8fe3ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setDepth(2.98);
    this.shadow = this.add.ellipse(spawn.x, spawn.y + 18, 22, 8, 0x000000, 0.35).setDepth(2.99);
    this.player = this.physics.add.sprite(spawn.x, spawn.y, key, frame).setDepth(3.1);
    this.player.body.setSize(20, 20).setOffset(6, 26);   // 20x20 feet hitbox
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, this.walls);
    if (this.scenery && this.scenery.solids.length) {     // vehicles, buildings and boulders you have to walk around
      const group = this.physics.add.staticGroup();
      this.scenery.solids.forEach((r) => { const z = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h); this.physics.add.existing(z, true); group.add(z); });
      this.physics.add.collider(this.player, group);
    }

    /* ---- camera ---- */
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.startFollow(this.player, true, 0.1, 0.1);
    let zoom = 1.5;
    try { const z = parseFloat(new URLSearchParams(location.search).get('zoom')); if (z > 0.2 && z < 4) zoom = z; } catch (e) { /* default */ }
    cam.setZoom(zoom);

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
    this.ring = this.add.graphics().setDepth(44);                      // progress ring while holding SPACE on a step
    this.carryIcon = this.add.image(0, 0, 'ic_sparkle').setDisplaySize(26, 26).setDepth(46).setVisible(false);
    this.arrow = this.add.image(0, 0, 'ic_arrow-fat-down').setScale(0.5).setOrigin(0.5, 1).setDepth(40).setVisible(false);
    // guide arrow: rides next to the astronaut and always points straight at the current target, with a trail of dots
    this.guide = this.add.image(0, 0, 'ic_arrow-fat-down').setScale(0.55).setDepth(45).setVisible(false);
    this.guideDots = this.add.graphics().setDepth(44);

    this.ready = true;
    $('loading').hidden = true;
    showTitle();
  }

  /* The trees and rocks in the map are slices of pictures that have plain dirt painted behind them, which showed up as
     flat rectangles on the new textured ground. Here we make that dirt colour see-through and redraw just those tiles. */
  cutOutDecorTiles() {
    try {
      const src = this.textures.get('tiles').getSourceImage();
      const cv = document.createElement('canvas');
      cv.width = src.width; cv.height = src.height;
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.drawImage(src, 0, 0);
      const data = c.getImageData(0, 0, cv.width, cv.height), px = data.data;
      // the dirt colours: every colour that appears in the pack's two plain dirt pictures
      const pal = new Map();
      ['scifiTile_41.png', 'scifiTile_42.png'].forEach((n) => {
        const f = this.textures.getFrame('rts', n);
        for (let y = f.cutY; y < f.cutY + f.cutHeight; y++) for (let x = f.cutX; x < f.cutX + f.cutWidth; x++) {
          const i = (y * cv.width + x) * 4, k = (px[i] >> 2) << 16 | (px[i + 1] >> 2) << 8 | (px[i + 2] >> 2);
          pal.set(k, (pal.get(k) || 0) + 1);
        }
      });
      const colors = [...pal.entries()].filter(([, n]) => n >= 4).map(([k]) => [((k >> 16) & 63) << 2, ((k >> 8) & 63) << 2, (k & 63) << 2]);
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        for (let j = 0; j < colors.length; j++) {
          const d0 = px[i] - colors[j][0], d1 = px[i + 1] - colors[j][1], d2 = px[i + 2] - colors[j][2];
          if (d0 * d0 + d1 * d1 + d2 * d2 <= 300) { px[i + 3] = 0; break; }
        }
      }
      c.putImageData(data, 0, 0);
      const tex = this.textures.addCanvas('tiles_cut', cv);
      const ts = this.walls.tileset[0], cols = ts.columns || 31;
      const made = new Set();
      const isDecor = (t) => { const g = this.ground.getTileAt(t.x, t.y); return !(g && this.pathIds.has(g.index)); };
      if (this.scenery) this.scenery.makeShadows((t) => (isDecor(t) ? cv : src));
      this.walls.forEachTile((t) => {
        if (t.index <= 0) return;
        if (!isDecor(t)) return;          // pieces of buildings on the paving are left exactly as they were
        const name = 'g' + t.index;
        if (!made.has(name)) { tex.add(name, 0, ((t.index - 1) % cols) * 32, Math.floor((t.index - 1) / cols) * 32, 32, 32); made.add(name); }
        t.visible = false;                                    // still blocks the player, just not drawn
        this.add.image(t.pixelX + 16, t.pixelY + 16, 'tiles_cut', name).setDepth(2).setFlipX(!!t.flipX).setFlipY(!!t.flipY).setRotation(t.rotation || 0);
      });
    } catch (e) { console.error('Could not clean up decoration tiles', e); }
  }

  /* ---- surprise pickups: a glowing supply pod or rock somewhere on the map ---- */
  pickSpot() {
    const spots = (this.scenery && this.scenery.spots) || [], p = this.player;
    const mid = spots.filter((q) => { const d = Math.hypot(q.x - p.x, q.y - p.y); return d > 280 && d < 800; });
    const pool = mid.length ? mid : spots;
    return pool.length ? pick(pool) : { x: this.spawn.x + 220, y: this.spawn.y + 220 };
  }

  spawnDrop(sp) {
    this.clearDrop();
    const { x, y } = sp.point, supply = sp.id === 'supply', tint = supply ? 0xffd23b : 0x7ad7ff;
    const objs = [];
    if (this.textures.exists('glow_soft')) objs.push(this.add.image(x, y, 'glow_soft').setScale(1.4).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(2.4).setAlpha(0.8));
    const ring = this.add.graphics().setDepth(2.45);
    ring.lineStyle(7, 0x2b1458, 1).strokeCircle(x, y + 6, 38);
    ring.lineStyle(4, tint, 1).strokeCircle(x, y + 6, 38);
    objs.push(ring);
    const item = this.add.image(x, y + 20, 'rts', supply ? 'scifiStructure_02.png' : 'scifiEnvironment_12.png').setOrigin(0.5, 1).setDepth(3 + (y + 20) / 10000);
    objs.push(item);
    const icon = this.add.image(x, y - 58, 'ic_' + (supply ? 'sparkle' : 'star')).setDisplaySize(32, 32).setDepth(45);
    objs.push(icon);
    this.tweens.add({ targets: ring, alpha: { from: 0.3, to: 1 }, duration: 500, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: icon, y: y - 66, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: item, y: y + 16, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.dropObjs = objs;
  }

  clearDrop() {
    (this.dropObjs || []).forEach((o) => { this.tweens.killTweensOf(o); o.destroy(); });
    this.dropObjs = [];
  }

  /* ---- dust devil: a twister that rolls across the map. Touch it and it scratches your suit. ---- */
  spawnDevil() {
    this.clearDevil();
    const W = this.physics.world.bounds.width, H = this.physics.world.bounds.height, off = 100;
    const along = () => Phaser.Math.Between(300, H - 300);
    const side = Phaser.Math.Between(0, 3);
    let sx, sy, ex, ey;
    if (side === 0) { sx = -off; sy = along(); ex = W + off; ey = along(); }
    else if (side === 1) { sx = W + off; sy = along(); ex = -off; ey = along(); }
    else if (side === 2) { sx = along(); sy = -off; ex = along(); ey = H + off; }
    else { sx = along(); sy = H + off; ex = along(); ey = -off; }
    const len = Math.hypot(ex - sx, ey - sy);
    const dust = this.textures.exists('glow_soft') ? this.add.image(sx, sy, 'glow_soft').setScale(2.1).setTint(0xd9a066).setAlpha(0.6).setDepth(26) : null;
    const shadow = this.add.ellipse(sx, sy, 104, 34, 0xd6322a, 0.42).setDepth(2.9);          // red danger zone on the ground
    this.tweens.add({ targets: shadow, alpha: { from: 0.22, to: 0.55 }, duration: 350, yoyo: true, repeat: -1 });
    const img = this.add.image(sx, sy, 'ic_tornado').setOrigin(0.5, 0.85).setScale(1.7).setDepth(27);
    this.devil = { img, shadow, dust, x: sx, y: sy, vx: (ex - sx) / len * DEVIL_SPEED, vy: (ey - sy) / len * DEVIL_SPEED, t: 0, hitCd: 0, W, H };
  }

  updateDevil(dt, time, p) {
    const d = this.devil;
    d.t += dt; d.hitCd -= dt;
    d.x += d.vx * dt; d.y += d.vy * dt;
    const sway = Math.sin(d.t * 3) * 16;
    const px = d.x - (d.vy / DEVIL_SPEED) * sway, py = d.y + (d.vx / DEVIL_SPEED) * sway;
    d.img.setPosition(px, py).setAngle(Math.sin(d.t * 8) * 9).setScale(1.62 + Math.sin(d.t * 13) * 0.14, 1.7);
    d.shadow.setPosition(px, py + 6);
    if (d.dust) d.dust.setPosition(px, py - 44);
    if (d.hitCd <= 0 && S.phase === 'crisis' && Math.hypot(p.x - px, p.y - (py - 30)) < 52) {
      d.hitCd = 2;
      if (S.surprise) S.surprise.hits++;
      addRes('oxygen', -DEVIL_HIT);
      const a = Math.atan2(p.y - (py - 30), p.x - px);
      this.stunT = 0.9; this.kbx = Math.cos(a) * 280; this.kby = Math.sin(a) * 280;
      toast(`:tornado: Ouch! The dust devil scratched your suit: −${DEVIL_HIT} Oxygen`, 'bad');
      this.shakeScreen(false);
      checkLose();
    }
    const m = 140;
    if (d.t > 1 && (px < -m || px > d.W + m || py < -m || py > d.H + m)) { this.clearDevil(); devilDone(); }
  }

  clearDevil() {
    if (!this.devil) return;
    [this.devil.img, this.devil.shadow, this.devil.dust].forEach((o) => { if (o) { this.tweens.killTweensOf(o); o.destroy(); } });
    this.devil = null;
  }

  /* a brief shake when a storm reaches the base */
  shakeScreen(hard) { if (this.cameras && this.cameras.main) this.cameras.main.shake(hard ? 420 : 220, hard ? 0.006 : 0.002); }

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

  /* A terminal pad: a glowing metal plate with its own icon. `alert` is the red warning version shown when it breaks. */
  makeTerminalMarker(id, rect) {
    const t = TERMINALS[id], col = t.color, iconKey = 'ic_' + iconOf(t.icon);
    const pad = 6, x = rect.x - pad, y = rect.y - pad, w = rect.width + pad * 2, h = rect.height + pad * 2;
    const base = this.add.container(0, 0).setDepth(1.4);
    const g = this.add.graphics();
    g.fillStyle(col, 0.10).fillRoundedRect(x - 9, y - 9, w + 18, h + 18, 24);
    g.fillStyle(col, 0.18).fillRoundedRect(x - 4, y - 4, w + 8, h + 8, 18);
    g.fillStyle(0x22304a, 1).fillRoundedRect(x, y, w, h, 14);
    g.lineStyle(4, 0x2b1458, 1).strokeRoundedRect(x, y, w, h, 14);
    g.fillStyle(0x354a70, 1).fillRoundedRect(x + 5, y + 5, w - 10, h - 10, 10);
    g.lineStyle(3, col, 1).strokeRoundedRect(x + 7, y + 7, w - 14, h - 14, 8);
    [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]].forEach(([cx, cy]) => g.fillStyle(0xffffff, 0.9).fillCircle(cx, cy, 2.2));
    base.add(g);
    const pulse = this.add.graphics();
    pulse.lineStyle(4, col, 1).strokeRoundedRect(x - 3, y - 3, w + 6, h + 6, 17);
    base.add(pulse);
    this.tweens.add({ targets: pulse, alpha: { from: 0.15, to: 0.95 }, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const size = clamp(Math.min(rect.width, rect.height) - 8, 26, 46);
    const disc = this.add.graphics();
    disc.fillStyle(0xffffff, 1).fillCircle(rect.centerX, rect.centerY, size * 0.62);
    disc.lineStyle(4, col, 1).strokeCircle(rect.centerX, rect.centerY, size * 0.62);
    disc.lineStyle(2, 0x2b1458, 1).strokeCircle(rect.centerX, rect.centerY, size * 0.62 + 3);
    base.add(disc);
    const ic = this.add.image(rect.centerX, rect.centerY, iconKey).setDisplaySize(size, size);
    base.add(ic);
    this.tweens.add({ targets: ic, y: rect.centerY - 2.5, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // red alarm overlay + bobbing warning sign
    const alert = this.add.container(0, 0).setDepth(1.5).setVisible(false);
    const ag = this.add.graphics();
    ag.fillStyle(0xff3b3b, 0.42).fillRoundedRect(x, y, w, h, 14);
    ag.lineStyle(5, 0xff3b3b, 1).strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 16);
    alert.add(ag);
    const warn = this.add.image(rect.centerX, y - 6, 'ic_warning').setDisplaySize(34, 34).setOrigin(0.5, 1);
    alert.add(warn);
    this.tweens.add({ targets: warn, y: y - 11, duration: 380, yoyo: true, repeat: -1 });

    // one small name tag per terminal; the centre ones sit below / beside their pads so nothing overlaps
    if (id === 'terminal_comms') this.makeLabel(rect.centerX, rect.bottom + 10, t.name, col, 0.5, 0, iconKey);
    else if (id === 'terminal_archives') this.makeLabel(rect.right + 12, rect.centerY, t.name, col, 0, 0.5, iconKey);
    else this.makeLabel(rect.centerX, rect.top - (id === 'terminal_shields' ? 12 : 12), t.name, col, 0.5, 1, iconKey);
    return { id, rect, base, alert };
  }

  // Small, legible name plaque: an icon and a word on a rounded coloured tag.
  makeLabel(x, y, text, color, ox, oy, iconKey) {
    const t = this.add.text(0, 0, text, {
      fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#ffffff', stroke: '#2b1458', strokeThickness: 4,
    }).setOrigin(0, 0.5);
    const isz = 20, gap = 5;
    const iw = iconKey ? isz + gap : 0;
    const w = t.width + 18 + iw, h = Math.max(t.height + 4, isz + 6);
    const left = x - w * ox, top = y - h * oy;
    const g = this.add.graphics().setDepth(5.9);
    g.fillStyle(0x000000, 0.22).fillRoundedRect(left, top + 3, w, h, 11);
    g.fillStyle(color, 1).fillRoundedRect(left, top, w, h, 11);
    g.lineStyle(3, 0x2b1458, 1).strokeRoundedRect(left, top, w, h, 11);
    if (iconKey) {
      const dot = this.add.graphics().setDepth(5.95);
      dot.fillStyle(0xffffff, 1).fillCircle(left + 9 + isz / 2, top + h / 2, isz / 2 + 1);
      dot.lineStyle(2, 0x2b1458, 1).strokeCircle(left + 9 + isz / 2, top + h / 2, isz / 2 + 1);
      this.add.image(left + 9 + isz / 2, top + h / 2, iconKey).setDisplaySize(isz - 2, isz - 2).setDepth(6);
      t.setPosition(left + 9 + iw + isz / 2 - 2, top + h / 2).setDepth(6);
    } else t.setPosition(left + 9, top + h / 2).setDepth(6);
  }

  makeRoomSigns() {
    const co = this.zones.find((q) => q.id === 'terminal_comms');
    if (co) this.makeLabel(co.rect.centerX, this.spawn.y + 28, 'Command Bunker', 0xff8fc8, 0.5, 1, 'ic_house');
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
    if (!this.ready) return;                         // the world is still being painted
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
    const feet = this.ground.getTileAtWorldXY(p.x, p.y + 14);
    const onPath = !!(feet && this.pathIds.has(feet.index));
    const speed = (onPath ? PATH_SPEED : WALK_SPEED) * (isDusty() ? DUST_FACTOR : 1) * (S.carrying ? S.carrying.slow : 1);
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
    if (this.stunT > 0) { this.stunT -= dt; const f = Math.max(0, this.stunT / 0.9); p.setVelocity(this.kbx * f, this.kby * f); vx = vy = 0; }   // knocked back by the dust devil
    if (vx < 0) p.setFlipX(true); else if (vx > 0) p.setFlipX(false);
    p.setScale(1, vx || vy ? 1 + Math.sin(time / 70) * 0.03 : 1);
    this.shadow.setPosition(p.x, p.y + 18);
    if (this.halo) this.halo.setPosition(p.x, p.y + 10);
    p.setDepth(3 + (p.y + 24) / 10000);              // walk in front of or behind props depending on where your feet are
    if (this.scenery) { this.scenery.update(time); this.scenery.setMood(currentMood()); }

    // terminal detection
    const zone = UI.modalOpen ? null : this.nearestZone();
    const faultedHere = !!(zone && S.phase === 'crisis' && S.faults[zone.id]);
    // surprise steps: stand on the right pad (or spot) and HOLD SPACE until the ring fills
    const st = currentStep();
    const live = S.phase === 'crisis' && !UI.modalOpen;
    const atTerm = !!(st && st.terminal && zone && zone.id === st.terminal && live);
    const atPoint = !!(st && st.point && live && Math.hypot(p.x - st.point.x, p.y + 8 - st.point.y) < 46);
    const needsHold = faultedHere || atTerm;         // tap SPACE opens the pad, holding SPACE does the job
    if (this.stepLock && !this.space.isDown) this.stepLock = false;
    if ((atTerm || atPoint) && this.space.isDown && !this.stepLock) {
      this.stepT = (this.stepT || 0) + dt;
      if (this.stepT >= st.hold) { completeStep(); this.stepT = 0; this.stepLock = true; }
    } else this.stepT = 0;
    this.ring.clear();
    if (this.stepT > 0.08 && st) {
      const frac = Math.min(1, this.stepT / st.hold);
      this.ring.lineStyle(11, 0x2b1458, 1).strokeCircle(p.x, p.y + 4, 27);
      this.ring.lineStyle(6, 0x7ddc5c, 1).beginPath().arc(p.x, p.y + 4, 27, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false).strokePath();
    }
    if (zone && S.phase === 'tutorial') {
      const tst = TUT_STEPS[T.step];
      let label = 'Follow the pink arrow first!';
      if (tst && zone.id === tst.target) {
        label = tst.hold ? (T.hold > 0 ? `Patching… ${Math.round(100 * T.hold / TUT_HOLD)}%` : 'HOLD SPACE (keep it down!)') : 'Press SPACE';
      }
      this.prompt.setText(plainText(label)).setPosition(p.x, p.y - 34).setVisible(true);
    } else if (zone || atPoint) {
      const nm = zone ? TERMINALS[zone.id].name : '';
      let label;
      if ((atTerm || atPoint) && this.stepT > 0.08) label = `${st.verb[0].toUpperCase()}${st.verb.slice(1)}… ${Math.min(99, Math.round(100 * this.stepT / st.hold))}%`;
      else if (atPoint) label = `HOLD SPACE: ${st.verb}`;
      else if (atTerm) label = `${nm}\nTAP SPACE: open  ·  HOLD SPACE: ${st.verb}`;
      else if (S.patching) label = ':wrench: Patching… leak slowed!';
      else if (faultedHere) label = `${nm} is BROKEN!\nTAP SPACE: open  ·  HOLD SPACE: patch the leak`;
      else label = `Press SPACE to use ${nm}`;
      this.prompt.setText(plainText(label)).setPosition(p.x, p.y - (atPoint ? 40 : 34)).setVisible(true);
    } else this.prompt.setVisible(false);

    // dust devil, and the load the astronaut is carrying
    if (this.devil) this.updateDevil(dt, time, p);
    this.carryIcon.setVisible(!!S.carrying && S.phase === 'crisis');
    if (S.carrying) this.carryIcon.setTexture('ic_' + S.carrying.icon).setPosition(p.x + 15, p.y - 32 + Math.sin(time / 200) * 2);

    const modalAtStart = UI.modalOpen;      // a card opened by this very SPACE press must not be closed by it
    if (S.phase === 'tutorial') tutorialTick(dt, zone, spaceDown, this.space.isDown);

    if (modalAtStart) {
      this.holding = false; S.patching = false;
      if ((spaceDown || escDown) && UI.closable) closeModal();
    } else if (S.phase === 'tutorial') {
      this.holding = false; S.patching = false;       // training has its own SPACE handling (above)
    } else {
      if (spaceDown && zone && S.phase !== 'night' && S.phase !== 'over') {
        if (needsHold) { this.holding = true; this.holdT = 0; }   // tap = open, hold = patch
        else openTerminal(zone.id);
      }
      if (this.holding) {
        if (this.space.isDown && needsHold) {
          this.holdT += dt;
          S.patching = faultedHere && this.holdT >= HOLD_SECONDS;
        } else {
          if (spaceUp && needsHold && this.holdT < HOLD_SECONDS) openTerminal(zone.id);
          this.holding = false; S.patching = false;
        }
      } else S.patching = false;
    }

    // marker visuals
    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    const obj = objective();
    for (const z of this.zones) {
      const practiceBroken = S.phase === 'tutorial' && T.started && TUT_STEPS[T.step] && TUT_STEPS[T.step].hold && TUT_STEPS[T.step].target === z.id;
      z.alert.setVisible(!!S.faults[z.id] || !!practiceBroken || !!(S.surprise && S.surprise.status === 'active' && S.surprise.id === 'leak' && S.surprise.terminal === z.id)).setAlpha(0.35 + 0.65 * pulse);
      z.base.setAlpha(obj.target === z.id ? 0.5 + 0.5 * pulse : 1);
    }
    const tz = this.zones.find((z) => z.id === obj.target);
    // where is the target? a pad, or a spot on the ground (supply pod / rock find)
    const tgt = tz ? { x: tz.rect.centerX, y: tz.rect.centerY, top: tz.rect.top - 18 } : obj.point ? { x: obj.point.x, y: obj.point.y, top: obj.point.y - 76 } : null;
    if (tgt) this.arrow.setVisible(true).setPosition(tgt.x, tgt.top + Math.sin(time / 150) * 5);
    else this.arrow.setVisible(false);

    // guide arrow toward the target, from wherever the astronaut is
    this.guideDots.clear();
    const gx = tgt ? tgt.x - p.x : 0, gy = tgt ? tgt.y - p.y : 0, gd = Math.hypot(gx, gy);
    if (tgt && !UI.modalOpen && gd > 110) {
      const ux = gx / gd, uy = gy / gd, push = 46 + Math.sin(time / 170) * 4;
      this.guide.setVisible(true).setPosition(p.x + ux * push, p.y - 4 + uy * push).setRotation(Math.atan2(uy, ux) - Math.PI / 2).setScale(0.55 + Math.sin(time / 170) * 0.04);
      const reach = Math.min(gd - 60, 340);
      for (let d = 86, i = 0; d < reach; d += 28, i++) {
        const a = 0.9 * (1 - (d - 86) / Math.max(1, reach - 86)) + 0.1;
        this.guideDots.fillStyle(0x2b1458, a).fillCircle(p.x + ux * d, p.y + 8 + uy * d, 5.5);
        this.guideDots.fillStyle(0xff5fa8, a).fillCircle(p.x + ux * d, p.y + 8 + uy * d, 3.6);
      }
    } else this.guide.setVisible(false);
  }
}

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */
window.addEventListener('error', (e) => { if (!scene) fatal(e.message); });
if (/[?&]debug/.test(location.search)) window.__mars = { S, T, UI, readBriefing, closeModal, startSol, endSol, tick, get scene() { return scene; } };   // for testing only
document.querySelectorAll('.ico, #skipTut').forEach((el) => { el.innerHTML = ic(el.textContent); });   // static HUD icons
$('skipTut').addEventListener('click', (e) => { e.currentTarget.blur(); skipTutorial(); });

if (typeof Phaser === 'undefined') {
  fatal('Phaser could not be loaded from the internet.');
} else {
  const start = () => new Phaser.Game({
    type: /[?&]canvas/.test(location.search) ? Phaser.CANVAS : Phaser.AUTO,   // ?canvas forces the simpler renderer (for graphics-challenged computers)
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
