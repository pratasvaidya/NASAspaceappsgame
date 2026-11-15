/* Scenery: paints the outpost world (terrain, pavement, shadows, props, lights, dust).
   The layout, walls and terminal pads come from the Tiled map and are not changed here:
   everything in this file is decoration drawn on top of / underneath them.
   Art: Kenney "Sci-Fi RTS" (CC0) sprites + shapes drawn in code. */
(function () {
'use strict';

const TILE = 32;
const INK = '#2b1458';

/* small seeded random generator so the world looks the same every time it loads */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* A soft round blob texture (for glows and dust) */
function radialTexture(scene, key, size, stops) {
  if (scene.textures.exists(key)) return;
  const cv = makeCanvas(size, size), c = cv.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([t, col]) => g.addColorStop(t, col));
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  scene.textures.addCanvas(key, cv);
}

/* ------------------------------------------------------------------ */
function build(scene, map, cfg) {
  const W = map.widthInPixels, H = map.heightInPixels;
  const cols = map.width, rows = map.height;
  const R = rng(20241114);
  const atlasImg = scene.textures.get('rts').getSourceImage();
  const gl = scene.sys.game.renderer && scene.sys.game.renderer.gl;
  const maxTex = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
  const SS = maxTex >= W * 1.5 ? 1.5 : 1;   // paint at 1.5x: exactly one texel per screen pixel at the normal zoom, and gentle on memory

  /* which tiles are pavement / walls, and how far each tile is from them */
  const P = [], WL = [];
  for (let y = 0; y < rows; y++) {
    P.push([]); WL.push([]);
    for (let x = 0; x < cols; x++) {
      const g = cfg.ground.getTileAt(x, y);
      P[y].push(!!(g && cfg.pathIds.has(g.index)));
      const w = cfg.walls.getTileAt(x, y);
      WL[y].push(!!(w && w.index > 0));
    }
  }
  const isP = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && P[y][x];
  const dist = [];                                   // distance (in tiles) to the nearest pavement tile
  for (let y = 0; y < rows; y++) { dist.push([]); for (let x = 0; x < cols; x++) dist[y].push(isP(x, y) ? 0 : 99); }
  for (let pass = 0; pass < 8; pass++) {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (dist[y][x] === 0) continue;
      let m = dist[y][x];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < rows && xx < cols) m = Math.min(m, dist[yy][xx] + 1); });
      dist[y][x] = m;
    }
  }

  /* ---------- the big ground painting ---------- */
  const cv = makeCanvas(W * SS, H * SS), c = cv.getContext('2d');
  c.scale(SS, SS);
  c.imageSmoothingEnabled = false;
  const frame = (name) => scene.textures.getFrame('rts', name + '.png');
  function blit(name, dx, dy, dw, dh, flipX, flipY, ctx2) {
    const f = frame(name), k = ctx2 || c;
    if (!f) return;
    k.save();
    k.translate(dx + (flipX ? dw : 0), dy + (flipY ? dh : 0));
    k.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    k.drawImage(atlasImg, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, dw, dh);
    k.restore();
  }

  // 1. Martian dirt from the pack's own dirt tiles
  for (let ty = 0; ty < H / 128; ty++) for (let tx = 0; tx < W / 128; tx++) {
    blit(R() < 0.5 ? 'scifiTile_41' : 'scifiTile_42', tx * 128, ty * 128, 128, 128, R() < 0.5, R() < 0.5);
  }
  c.imageSmoothingEnabled = true;

  // 2. big soft patches of lighter and darker soil so the ground is never one flat colour
  for (let i = 0; i < 90; i++) {
    const x = R() * W, y = R() * H, r = 70 + R() * 190, light = R() < 0.5;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, light ? 'rgba(236,150,98,0.16)' : 'rgba(110,38,16,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 3. wind ripples (little curved dune lines)
  c.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = R() * W, y = R() * H, len = 14 + R() * 40, bend = (R() - 0.5) * 10, light = R() < 0.55;
    c.strokeStyle = light ? 'rgba(255,214,168,0.10)' : 'rgba(92,30,10,0.10)';
    c.lineWidth = 1.5 + R() * 1.5;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + len / 2, y + bend, x + len, y + bend * 0.3); c.stroke();
  }
  // 4. fine grit
  for (let i = 0; i < 9000; i++) {
    const x = R() * W, y = R() * H, light = R() < 0.5;
    c.fillStyle = light ? 'rgba(255,205,150,0.22)' : 'rgba(80,24,8,0.24)';
    c.fillRect(x, y, 1 + (R() < 0.2 ? 1 : 0), 1);
  }

  const free = (tx, ty, margin) => tx >= 1 && ty >= 1 && tx < cols - 1 && ty < rows - 1 && dist[ty][tx] >= margin && !WL[ty][tx];

  // 5. craters
  const craters = [[7.5, 12.5, 46], [32.5, 9.5, 40], [8.5, 28.5, 38], [30.5, 28.5, 52], [27.5, 4.5, 30], [4.5, 37.5, 34], [36.5, 34.5, 36]];
  craters.forEach(([tx, ty, r]) => {
    const x = tx * TILE, y = ty * TILE, ry = r * 0.6;
    c.save();
    c.translate(x, y);
    // soft raised apron
    let g = c.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.45);
    g.addColorStop(0, 'rgba(240,160,108,0.28)'); g.addColorStop(1, 'rgba(240,160,108,0)');
    c.save(); c.scale(1, 0.62); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 1.45, 0, 7); c.fill(); c.restore();
    // dark bowl
    g = c.createRadialGradient(-r * 0.2, -ry * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(70,22,8,0.55)'); g.addColorStop(0.75, 'rgba(110,38,16,0.5)'); g.addColorStop(1, 'rgba(150,60,28,0.2)');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, r, ry, 0, 0, 7); c.fill();
    // rim: bright on the sunny side, dark on the other
    c.lineWidth = 3.2;
    c.strokeStyle = 'rgba(255,218,176,0.65)'; c.beginPath(); c.ellipse(0, 0, r, ry, 0, Math.PI * 0.95, Math.PI * 1.9); c.stroke();
    c.strokeStyle = 'rgba(70,20,6,0.5)'; c.beginPath(); c.ellipse(0, 0, r, ry, 0, -0.1, Math.PI * 0.9); c.stroke();
    c.restore();
    for (let k = 0; k < 7; k++) {               // little stones thrown out by the impact
      const a = R() * 6.28, d = r * (1.05 + R() * 0.45);
      blit(R() < 0.5 ? 'scifiEnvironment_02' : 'scifiEnvironment_08', x + Math.cos(a) * d - 8, y + Math.sin(a) * d * 0.62 - 7, 16, 14, R() < 0.5, false);
    }
  });

  // 6. ice patches (Mars really has water ice near the surface)
  const ices = [[35.5, 7.8, 58, 34], [3.4, 36.6, 46, 26]];
  ices.forEach(([tx, ty, rx, ry]) => {
    const x = tx * TILE, y = ty * TILE, pts = [];
    for (let k = 0; k < 14; k++) { const a = (k / 14) * 6.283, j = 0.82 + R() * 0.3; pts.push([x + Math.cos(a) * rx * j, y + Math.sin(a) * ry * j]); }
    const path = () => {
      c.beginPath();
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (k === 0) c.moveTo(mx, my);
        const n = pts[(k + 1) % pts.length], nn = pts[(k + 2) % pts.length];
        c.quadraticCurveTo(n[0], n[1], (n[0] + nn[0]) / 2, (n[1] + nn[1]) / 2);
      }
      c.closePath();
    };
    c.save(); c.shadowColor = 'rgba(60,20,8,0.45)'; c.shadowBlur = 10; c.shadowOffsetY = 4; c.fillStyle = '#9fd6e8'; path(); c.fill(); c.restore();
    c.save(); path(); c.clip();
    c.imageSmoothingEnabled = false;
    blit('scifiTile_13', x - 128, y - 128, 256, 256, false, false);
    c.imageSmoothingEnabled = true;
    const g = c.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(40,110,160,0.28)');
    c.fillStyle = g; c.fillRect(x - rx * 1.4, y - ry * 1.4, rx * 2.8, ry * 2.8);
    c.restore();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.85)'; path(); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(48,120,170,0.6)'; c.save(); c.translate(0, 2.5); path(); c.stroke(); c.restore();
  });

  /* ---------- pavement ---------- */
  // soft shadow the paving casts on the ground
  const sh = makeCanvas(W, H), sc = sh.getContext('2d');
  sc.fillStyle = 'rgba(58,18,6,0.5)';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (P[y][x]) sc.fillRect(x * TILE + 2, y * TILE + 8, TILE, TILE);
  c.save();
  if ('filter' in c) c.filter = 'blur(5px)';
  c.drawImage(sh, 0, 0);
  c.restore();

  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!P[y][x]) continue;
    const px = x * TILE, py = y * TILE, v = R();
    const l = 70 + v * 4.5 + ((x + y) % 2 ? 1.4 : 0);                 // each plate a slightly different tone
    c.fillStyle = `hsl(208, 17%, ${l}%)`;
    c.fillRect(px, py, TILE, TILE);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(px, py, TILE, 1.5); c.fillRect(px, py, 1.5, TILE);     // bevel: lit top/left
    c.fillStyle = 'rgba(52,72,92,0.30)';    c.fillRect(px, py + TILE - 1.5, TILE, 1.5); c.fillRect(px + TILE - 1.5, py, 1.5, TILE);   // shaded bottom/right
    c.fillStyle = 'rgba(54,74,94,0.5)';                                                                            // rivets
    [[5, 5], [TILE - 5, 5], [5, TILE - 5], [TILE - 5, TILE - 5]].forEach(([dx, dy]) => { c.beginPath(); c.arc(px + dx, py + dy, 1.35, 0, 7); c.fill(); });
    c.fillStyle = 'rgba(255,255,255,0.45)';
    [[5, 5], [TILE - 5, 5], [5, TILE - 5], [TILE - 5, TILE - 5]].forEach(([dx, dy]) => c.fillRect(px + dx - 1.4, py + dy - 1.4, 1, 1));
    for (let k = 0; k < 5; k++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(60,80,100,0.14)'; c.fillRect(px + R() * 30, py + R() * 30, 1.5, 1.5); }   // scuffs
  }
  // rim around every edge that meets dirt, so the paving looks raised and solid
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!P[y][x]) continue;
    const px = x * TILE, py = y * TILE;
    [[0, -1, px, py, TILE, 0], [0, 1, px, py + TILE, TILE, 0], [-1, 0, px, py, 0, TILE], [1, 0, px + TILE, py, 0, TILE]].forEach(([dx, dy, ex, ey, w, h]) => {
      if (isP(x + dx, y + dy)) return;
      const horiz = w > 0, inward = (dx < 0 || dy < 0) ? 1 : -1;
      const rx = horiz ? ex : ex + (inward > 0 ? 0 : -3.5), ry = horiz ? ey + (inward > 0 ? 0 : -3.5) : ey;
      c.fillStyle = '#4e6174'; c.fillRect(rx - (horiz ? 0 : 0), ry, horiz ? TILE : 3.5, horiz ? 3.5 : TILE);        // dark rim
      const hx = horiz ? ex : ex + (inward > 0 ? 3.5 : -6), hy = horiz ? ey + (inward > 0 ? 3.5 : -6) : ey;
      c.fillStyle = 'rgba(226,236,246,0.85)'; c.fillRect(hx, hy, horiz ? TILE : 2.5, horiz ? 2.5 : TILE);          // bright lip just inside
    });
  }
  // yellow dashes down the middle of every 4-wide road
  c.strokeStyle = '#f6cf55'; c.lineWidth = 3.4; c.lineCap = 'butt';
  c.setLineDash([22, 14]);
  const runsOf = (get, n) => { const out = []; let s = -1; for (let i = 0; i <= n; i++) { const on = i < n && get(i); if (on && s < 0) s = i; if (!on && s >= 0) { out.push([s, i - 1]); s = -1; } } return out; };
  const roads = [];           // {x0,y0,x1,y1} in tiles: stretches of path that are exactly 4 tiles wide
  for (let y = 0; y < rows; y++) runsOf((x) => P[y][x], cols).forEach(([a, b]) => { if (b - a === 3) roads.push({ v: true, a: y, mid: a + 2 }); });
  for (let x = 0; x < cols; x++) runsOf((y) => P[y][x], rows).forEach(([a, b]) => { if (b - a === 3) roads.push({ v: false, a: x, mid: a + 2 }); });
  const drawRoad = (list, vertical) => {
    const byMid = {};
    list.filter((r) => r.v === vertical).forEach((r) => { (byMid[r.mid] = byMid[r.mid] || []).push(r.a); });
    Object.keys(byMid).forEach((mid) => {
      const idx = byMid[mid].sort((m, n) => m - n);
      let start = idx[0], prev = idx[0];
      const flush = (from, to) => {
        if (to - from < 2) return;
        c.beginPath();
        if (vertical) { c.moveTo(mid * TILE, from * TILE + 6); c.lineTo(mid * TILE, (to + 1) * TILE - 6); } else { c.moveTo(from * TILE + 6, mid * TILE); c.lineTo((to + 1) * TILE - 6, mid * TILE); }
        c.stroke();
      };
      for (let i = 1; i < idx.length; i++) { if (idx[i] !== prev + 1) { flush(start, prev); start = idx[i]; } prev = idx[i]; }
      flush(start, prev);
    });
  };
  drawRoad(roads, true); drawRoad(roads, false);
  c.setLineDash([]);

  // pad mats: a tinted patch under each terminal so each wing has its own colour identity
  (cfg.zones || []).forEach((z) => {
    const r = z.rect, pad = 10;
    c.save();
    c.fillStyle = 'rgba(' + z.rgb + ',0.28)';
    c.beginPath(); c.roundRect ? c.roundRect(r.x - pad, r.y - pad, r.width + pad * 2, r.height + pad * 2, 16) : c.rect(r.x - pad, r.y - pad, r.width + pad * 2, r.height + pad * 2); c.fill();
    c.restore();
  });

  /* ---------- scenery props (placed only where they will not block anything) ---------- */
  const placed = [];         // {x0,y0,x1,y1} footprints of things already placed
  const solids = [];         // footprints the player must walk around
  const images = [];         // props drawn as separate sprites so the astronaut can walk behind them
  const padRects = (cfg.zones || []).map((z) => z.rect);
  function footprintFree(x0, y0, x1, y1, margin) {
    const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor((x1 - 1) / TILE), ty0 = Math.floor(y0 / TILE), ty1 = Math.floor((y1 - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 1 || ty < 1 || tx >= cols - 1 || ty >= rows - 1) return false;
      if (dist[ty][tx] < margin || WL[ty][tx]) return false;
    }
    for (const p of padRects) if (x1 > p.x - 28 && x0 < p.right + 28 && y1 > p.y - 28 && y0 < p.bottom + 28) return false;
    for (const p of placed) if (x1 > p.x0 - 6 && x0 < p.x1 + 6 && y1 > p.y0 - 6 && y0 < p.y1 + 6) return false;
    return true;
  }
  // put a sprite near (tx,ty); if that spot is taken, look around for the closest free one
  function place(name, tx, ty, opt) {
    opt = opt || {};
    const f = frame(name); if (!f) return null;
    const w = f.cutWidth * (opt.scale || 1), h = f.cutHeight * (opt.scale || 1);
    const foot = h * (opt.foot || 0.4), margin = opt.margin == null ? 1 : opt.margin;
    for (let r = 0; r <= (opt.search == null ? 5 : opt.search); r++) {
      for (let a = 0; a < (r === 0 ? 1 : 12); a++) {
        const ang = (a / 12) * 6.283 + r;
        const cx = (tx + Math.cos(ang) * r) * TILE + TILE / 2, by = (ty + Math.sin(ang) * r) * TILE + TILE;
        const x0 = cx - w / 2, x1 = cx + w / 2, y0 = by - foot, y1 = by;
        if (!footprintFree(x0, y0, x1, y1, margin)) continue;
        placed.push({ x0, y0: y0 - 4, x1, y1 });
        if (opt.solid) solids.push({ x: x0 + 2, y: y0, w: w - 4, h: foot });
        // contact shadow baked into the ground
        c.save(); c.fillStyle = 'rgba(55,16,4,0.30)'; c.beginPath(); c.ellipse(cx + w * 0.06, by - 2, w * 0.46, Math.max(6, h * 0.11), 0, 0, 7); c.fill(); c.restore();
        images.push({ name, x: cx, y: by, w, h, flip: !!opt.flip, bob: !!opt.bob, depthY: by });
        return { x: cx, y: by };
      }
    }
    return null;
  }

  // buildings, machines and vehicles that make the outpost feel lived in
  place('scifiStructure_10', 12.5, 6.5, { solid: true });                 // observatory dome
  place('scifiStructure_16', 26, 8.5, { solid: true, foot: 0.45 });       // radar dish
  place('scifiStructure_12', 24.5, 14, { solid: true, foot: 0.3 });       // antenna mast
  place('scifiStructure_06', 34.5, 14.5, { solid: true });                // hangar
  place('scifiStructure_09', 7, 30, { solid: true });                     // lab
  place('scifiStructure_07', 33.5, 31, { solid: true });                  // storage depot
  place('scifiStructure_08', 28, 36, { solid: true });                    // habitat
  place('scifiStructure_14', 4.5, 15, { solid: true, foot: 0.45 });       // supply pod
  place('scifiStructure_02', 12, 22.3, { solid: true, foot: 0.45 });      // cargo pod
  place('scifiStructure_03', 26.5, 22.3, { solid: true, foot: 0.45 });
  place('scifiUnit_05', 12, 27.5, { solid: true });                       // blue truck
  place('scifiUnit_17', 27.5, 27, { solid: true });                       // orange truck
  place('scifiUnit_08', 12.5, 12.5, { solid: true });                     // rover with a gun-looking arm (it is the science drill)
  place('scifiUnit_20', 27, 33.5, { solid: true });
  place('scifiUnit_29', 30.5, 9, { solid: true });                        // green truck
  place('scifiUnit_09', 3.5, 24.5, { solid: true });
  // street lamps down both sides of the long roads
  [11, 14, 27.5, 35.5].forEach((ty) => { place('scifiStructure_13', 16.2, ty, { margin: 0, search: 1, foot: 0.25 }); place('scifiStructure_13', 22.3, ty, { margin: 0, search: 1, foot: 0.25, flip: true }); });
  [[9, 18.2], [9, 23.6], [27, 18.2], [27, 23.6]].forEach(([tx, ty]) => place('scifiStructure_13', tx, ty, { margin: 0, search: 1, foot: 0.25, flip: tx > 20 }));
  // a few astronauts standing around chatting (they bob a little)
  [['scifiUnit_01', 14, 7], ['scifiUnit_12', 24.6, 9.6], ['scifiUnit_16', 10.6, 25], ['scifiUnit_13', 29.5, 24.6], ['scifiUnit_03', 24, 31], ['scifiUnit_11', 13.6, 33.4]]
    .forEach(([n, tx, ty]) => place(n, tx, ty, { bob: true, margin: 1, search: 2, foot: 0.2 }));
  // nature: boulders, crystals, cacti, purple trees
  const nature = ['scifiEnvironment_03', 'scifiEnvironment_04', 'scifiEnvironment_05', 'scifiEnvironment_06', 'scifiEnvironment_07', 'scifiEnvironment_09', 'scifiEnvironment_10', 'scifiEnvironment_11', 'scifiEnvironment_12', 'scifiEnvironment_13', 'scifiEnvironment_14', 'scifiEnvironment_15', 'scifiEnvironment_16', 'scifiEnvironment_17', 'scifiEnvironment_18', 'scifiEnvironment_19'];
  for (let i = 0, tries = 0; i < 46 && tries < 900; tries++) {
    const tx = 1 + Math.floor(R() * (cols - 2)), ty = 1 + Math.floor(R() * (rows - 2));
    const n = nature[Math.floor(R() * nature.length)];
    const big = /_(0[3-7]|09|1[0-3])$/.test(n);
    if (place(n, tx, ty, { margin: 2, search: 0, solid: big, flip: R() < 0.5, foot: big ? 0.45 : 0.3 })) i++;
  }
  // loose pebbles and little shrubs painted straight onto the ground (no collision)
  for (let i = 0, tries = 0; i < 170 && tries < 1500; tries++) {
    const tx = Math.floor(R() * cols), ty = Math.floor(R() * rows);
    if (!free(tx, ty, 1)) continue;
    const px = tx * TILE + R() * TILE, py = ty * TILE + R() * TILE, kind = R();
    const n = kind < 0.4 ? 'scifiEnvironment_02' : kind < 0.75 ? 'scifiEnvironment_08' : 'scifiEnvironment_01';
    const s = n.endsWith('01') ? 0.55 : 0.5 + R() * 0.4;
    c.save(); c.fillStyle = 'rgba(55,16,4,0.25)'; c.beginPath(); c.ellipse(px, py + 5 * s, 13 * s, 4 * s, 0, 0, 7); c.fill(); c.restore();
    c.imageSmoothingEnabled = false; blit(n, px - 18 * s, py - 16 * s, 36 * s, 32 * s, R() < 0.5, false); c.imageSmoothingEnabled = true;
    i++;
  }

  /* ---------- turn the painting into a game texture ---------- */
  scene.textures.addCanvas('ground_art', cv);
  scene.textures.get('ground_art').setFilter(Phaser.Textures.FilterMode.LINEAR);
  scene.add.image(0, 0, 'ground_art').setOrigin(0, 0).setScale(1 / SS).setDepth(-10);

  /* sprites for the props (so the astronaut can walk behind tall ones) */
  const propSprites = [];
  images.forEach((p) => {
    const im = scene.add.image(p.x, p.y, 'rts', p.name + '.png').setOrigin(0.5, 1).setFlipX(p.flip);
    im.setDepth(3 + p.depthY / 10000);
    if (p.bob) scene.tweens.add({ targets: im, y: p.y - 2, duration: 900 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Math.random() * 800 });
    propSprites.push(im);
  });

  /* ---------- running lights along the pavement edges ---------- */
  const lights = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!P[y][x]) continue;
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
      if (isP(x + dx, y + dy) || WL[y][x]) return;
      if (((dx === 0 ? x : y) % 2) !== 0) return;
      lights.push({ x: x * TILE + TILE / 2 + dx * 11, y: y * TILE + TILE / 2 + dy * 11, d: lights.length });
    });
  }
  const lightSockets = lights.slice();
  // (drawn on top of the ground so they sit on the pavement, under the astronaut)
  const lightLayer = scene.add.graphics().setDepth(1.2);
  const glow = scene.add.graphics().setDepth(1.3).setBlendMode(Phaser.BlendModes.ADD);
  lightSockets.forEach((l) => { lightLayer.fillStyle(0x34465a, 1).fillCircle(l.x, l.y, 3.4); lightLayer.fillStyle(0x6a8196, 1).fillCircle(l.x, l.y, 2); });

  /* glow halos on street lamps */
  radialTexture(scene, 'glow_soft', 128, [[0, 'rgba(255,236,170,0.95)'], [0.35, 'rgba(255,200,110,0.4)'], [1, 'rgba(255,170,60,0)']]);
  const lampGlows = [];
  images.filter((p) => p.name === 'scifiStructure_13').forEach((p) => {
    const g = scene.add.image(p.x + (p.flip ? 14 : -14), p.y - p.h + 8, 'glow_soft').setScale(0.7).setDepth(25).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35);
    lampGlows.push(g);
  });

  /* ---------- drifting dust ---------- */
  radialTexture(scene, 'dust_puff', 48, [[0, 'rgba(255,225,190,0.55)'], [0.6, 'rgba(255,205,160,0.2)'], [1, 'rgba(255,190,140,0)']]);
  let calmDust = null, stormDust = null;
  try {
    const zone = new Phaser.Geom.Rectangle(-40, -40, W + 80, H + 80);
    calmDust = scene.add.particles(0, 0, 'dust_puff', {
      emitZone: { type: 'random', source: zone }, lifespan: 9000, frequency: 260, quantity: 1,
      speedX: { min: 8, max: 22 }, speedY: { min: -3, max: 5 }, scale: { start: 0.5, end: 1.7 }, alpha: { start: 0.45, end: 0 },
    });
    calmDust.setDepth(30);
    stormDust = scene.add.particles(0, 0, 'dust_puff', {
      emitZone: { type: 'random', source: zone }, lifespan: 2600, frequency: 22, quantity: 2,
      speedX: { min: 220, max: 420 }, speedY: { min: -24, max: 30 }, scale: { start: 1.2, end: 2.6 }, alpha: { start: 0.55, end: 0 },
      tint: 0xd9824f, emitting: false,
    });
    stormDust.setDepth(31);
  } catch (e) { calmDust = stormDust = null; }

  let mood = 'day', lastLightDraw = 0;
  const ctrl = {
    solids, propSprites,
    /* shadows under buildings, rocks and trees, cut from the actual shape of each wall tile.
       pick(tile) says which picture to take that tile's shape from. */
    makeShadows(pick) {
      try {
        const tcols = map.tilesets[0].columns || 31;
        const wc = makeCanvas(W, H), w2 = wc.getContext('2d');
        w2.imageSmoothingEnabled = false;
        cfg.walls.forEachTile((t) => {
          if (t.index <= 0) return;
          const g = t.index - 1;
          w2.drawImage(pick(t), (g % tcols) * TILE, Math.floor(g / tcols) * TILE, TILE, TILE, t.pixelX, t.pixelY, TILE, TILE);
        });
        w2.globalCompositeOperation = 'source-in'; w2.fillStyle = '#3a1004'; w2.fillRect(0, 0, W, H);
        const out = makeCanvas(W, H), o2 = out.getContext('2d');
        if ('filter' in o2) o2.filter = 'blur(2.5px)';
        o2.drawImage(wc, 0, 0);
        scene.textures.addCanvas('wall_shadow', out);
        scene.add.image(5, 8, 'wall_shadow').setOrigin(0, 0).setAlpha(0.42).setDepth(1.5);
      } catch (e) { /* shadows are only decoration */ }
    },
    setMood(m) {
      if (m === mood) return;
      mood = m;
      document.body.dataset.mood = m;
      if (stormDust) { if (m === 'storm') stormDust.start(); else stormDust.stop(); }
      lampGlows.forEach((g) => scene.tweens.add({ targets: g, alpha: m === 'night' ? 0.95 : 0.35, duration: 900 }));
    },
    update(time) {
      if (time - lastLightDraw < 70) return;
      lastLightDraw = time;
      glow.clear();
      const night = mood === 'night', t = time / 1000;
      const n = lights.length;
      for (let i = 0; i < n; i++) {
        const l = lights[i];
        const wave = 0.5 + 0.5 * Math.sin(t * 3.2 - l.d * 0.28);      // a bright pulse runs along the edges
        const a = (night ? 0.45 : 0.18) + wave * (night ? 0.55 : 0.5);
        glow.fillStyle(mood === 'storm' ? 0xff6a4a : 0xffe08a, Math.min(1, a)).fillCircle(l.x, l.y, 2.6 + wave * 1.4);
        if (night || wave > 0.8) glow.fillStyle(mood === 'storm' ? 0xff6a4a : 0xffd070, (night ? 0.18 : 0.12) * wave).fillCircle(l.x, l.y, 9);
      }
    },
  };
  return ctrl;
}

window.Scenery = { build };
})();
