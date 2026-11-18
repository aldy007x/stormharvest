// STORMHARVEST — entities.js
// The entity pools and their per-step movement. Everything that flies, falls
// or flashes lives here as plain objects in fixed pools allocated once at
// boot (no allocation in the hot loop):
//   telegraphs — glowing target rings that warn where lightning will land
//   bolts      — landed lightning, drawn briefly with a jagged polyline
//   hail       — falling ice shards that damage the hull
//   gusts      — horizontal wind bands that shove the kite
//   tornadoes  — roaming funnels (late storms + the Supercell) that damage + pull
//   particles  — sparks, rain splashes, harvest bursts, boss debris
//   rings      — expanding shockwave circles (harvest pops, lance hits)
//   floaters   — rising score / event text ("+100", "HULL -8")
//   rain       — background rain streaks, recycled forever
//   clouds     — parallax storm-cloud blobs (positions seeded once)
// The world (world.js) owns spawning rules and collisions; this file owns the
// shapes and how they move.

import { FIELD, HAIL, POOLS, TORNADO } from './config.js';
import { range } from './random.js';

function makePool(size, factory) {
  const pool = [];
  for (let i = 0; i < size; i += 1) pool.push(factory());
  return pool;
}
export function freeOf(pool) {
  for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
  return null;
}

export function createEntities(random) {
  const telegraphs = makePool(POOLS.telegraphs, () => ({ active: false, x: 0, y: 0, t: 0, total: 1, mega: false, gold: false, fork: false, column: false }));
  const bolts = makePool(POOLS.bolts, () => ({ active: false, x: 0, y: 0, life: 0, total: 0.28, mega: false, seed: 0, caught: false }));
  const hail = makePool(POOLS.hail, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, r: 9, spin: 0 }));
  const gusts = makePool(POOLS.gusts, () => ({ active: false, x: 0, y: 0, w: 0, dir: 1, life: 0, total: 3 }));
  const tornadoes = makePool(POOLS.tornadoes, () => ({ active: false, x: 0, y: 0, vx: 0, phase: 0 }));
  const particles = makePool(POOLS.particles, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, total: 1, size: 2, color: '#ffffff', gravity: 0 }));
  const floaters = makePool(POOLS.floaters, () => ({ active: false, x: 0, y: 0, life: 0, total: 1, text: '', color: '#ffffff', size: 20 }));
  const rings = makePool(POOLS.rings, () => ({ active: false, x: 0, y: 0, life: 0, total: 0.5, maxR: 90, color: '#ffe45e', width: 3 }));
  const rain = makePool(POOLS.rain, () => ({ x: random() * FIELD.width, y: random() * FIELD.height, len: range(random, 12, 30), speed: range(random, 620, 980) }));
  const clouds = makePool(POOLS.clouds, () => ({
    x: random() * FIELD.width, y: range(random, -30, 210),
    w: range(random, 220, 520), layer: Math.floor(random() * 3), shade: random(),
  }));
  return { telegraphs, bolts, hail, gusts, tornadoes, particles, floaters, rain, clouds, rings };
}

export function clearEntities(e) {
  for (const list of [e.telegraphs, e.bolts, e.hail, e.gusts, e.tornadoes, e.particles, e.floaters, e.rings]) {
    for (const item of list) item.active = false;
  }
}

/**
 * Spawn a telegraphed strike. `total` is the warning time before it lands.
 * `kind` may set: gold (rare triple-pay strike), fork (a second bolt lands
 * beside the first; catching either harvests), column (the Supercell's
 * vertical lash — x is the column centre, y is unused).
 */
export function spawnTelegraph(e, random, total, mega, kind = {}) {
  const t = freeOf(e.telegraphs); if (!t) return null;
  t.active = true; t.mega = !!mega;
  t.gold = !!kind.gold; t.fork = !!kind.fork; t.column = !!kind.column;
  t.x = range(random, 70, FIELD.width - 70);
  t.y = range(random, 120, FIELD.horizonY - 40);
  t.t = 0; t.total = total;
  return t;
}

/** The second landing point of a forked strike, beside the telegraph's own. */
export function forkPoint(t) {
  const dir = t.x < FIELD.width / 2 ? 1 : -1;
  return {
    x: Math.min(FIELD.width - 60, Math.max(60, t.x + dir * 118)),
    y: Math.min(FIELD.horizonY - 30, Math.max(110, t.y + 36)),
  };
}

/** Spawn an expanding shockwave ring (pure juice: harvests, hits, clears). */
export function spawnRing(e, x, y, maxR, color, width = 3, total = 0.5) {
  const r = freeOf(e.rings); if (!r) return;
  r.active = true; r.x = x; r.y = y; r.life = 0; r.total = total; r.maxR = maxR; r.color = color; r.width = width;
}

/** Turn a telegraph into a landed bolt (called by the world at strike moment). */
export function landBolt(e, random, telegraph, caught) {
  const b = freeOf(e.bolts); if (!b) return;
  b.active = true; b.x = telegraph.x; b.y = telegraph.y;
  b.mega = telegraph.mega; b.life = 0; b.total = telegraph.mega ? 0.4 : 0.28;
  b.seed = Math.floor(random() * 1e9); b.caught = caught;
}

export function spawnHail(e, random, wind) {
  const h = freeOf(e.hail); if (!h) return;
  h.active = true;
  h.x = range(random, 0, FIELD.width); h.y = -16;
  h.vy = range(random, HAIL.speedMin, HAIL.speedMax);
  h.vx = wind * range(random, 20, 70);
  h.r = range(random, 6, 13); h.spin = range(random, 0, Math.PI * 2);
}

export function spawnGust(e, random) {
  const g = freeOf(e.gusts); if (!g) return;
  g.active = true; g.dir = random() < 0.5 ? -1 : 1;
  g.y = range(random, 110, FIELD.horizonY - 60);
  g.w = range(random, 260, 520);
  g.x = g.dir > 0 ? -g.w : FIELD.width;
  g.life = 0; g.total = 3.4;
}

export function spawnTornado(e, random, x) {
  const t = freeOf(e.tornadoes); if (!t) return;
  t.active = true;
  t.x = x !== undefined ? x : range(random, 120, FIELD.width - 120);
  t.y = FIELD.horizonY;
  t.vx = (random() < 0.5 ? -1 : 1) * TORNADO.speed * range(random, 0.7, 1.3);
  t.phase = range(random, 0, Math.PI * 2);
}

export function burstParticles(e, random, x, y, count, color, speed, life, size, gravity = 0) {
  for (let i = 0; i < count; i += 1) {
    const p = freeOf(e.particles); if (!p) return;
    const angle = random() * Math.PI * 2;
    const v = speed * range(random, 0.25, 1);
    p.active = true; p.x = x; p.y = y;
    p.vx = Math.cos(angle) * v; p.vy = Math.sin(angle) * v;
    p.life = 0; p.total = life * range(random, 0.6, 1.15);
    p.size = size * range(random, 0.6, 1.4); p.color = color; p.gravity = gravity;
  }
}

export function addFloater(e, x, y, text, color, size = 20) {
  const f = freeOf(e.floaters); if (!f) return;
  f.active = true; f.x = x; f.y = y; f.life = 0; f.total = 1.15; f.text = text; f.color = color; f.size = size;
}

/** Advance every pool one step. Collisions stay in world.js; this is motion + lifetimes. */
export function stepEntities(e, dt, wind, time) {
  for (const t of e.telegraphs) if (t.active) t.t += dt;
  for (const b of e.bolts) if (b.active) { b.life += dt; if (b.life >= b.total) b.active = false; }
  for (const h of e.hail) {
    if (!h.active) continue;
    h.x += (h.vx + wind * 40) * dt; h.y += h.vy * dt; h.spin += dt * 6;
    if (h.y > FIELD.groundY + 20 || h.x < -30 || h.x > FIELD.width + 30) h.active = false;
  }
  for (const g of e.gusts) {
    if (!g.active) continue;
    g.life += dt; g.x += g.dir * 260 * dt;
    if (g.life >= g.total || g.x > FIELD.width + 60 || g.x + g.w < -60) g.active = false;
  }
  for (const t of e.tornadoes) {
    if (!t.active) continue;
    t.phase += dt * 5; t.x += t.vx * dt;
    if (t.x < 50) { t.x = 50; t.vx = Math.abs(t.vx); }
    if (t.x > FIELD.width - 50) { t.x = FIELD.width - 50; t.vx = -Math.abs(t.vx); }
  }
  for (const p of e.particles) {
    if (!p.active) continue;
    p.life += dt; if (p.life >= p.total) { p.active = false; continue; }
    p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (const f of e.floaters) {
    if (!f.active) continue;
    f.life += dt; f.y -= 34 * dt; if (f.life >= f.total) f.active = false;
  }
  for (const r of e.rings) {
    if (!r.active) continue;
    r.life += dt; if (r.life >= r.total) r.active = false;
  }
  for (const r of e.rain) {
    r.y += r.speed * dt; r.x += wind * 130 * dt;
    if (r.y > FIELD.height) { r.y = -30; r.x = Math.random() * 0 + r.x % FIELD.width; }
    if (r.x < 0) r.x += FIELD.width; if (r.x > FIELD.width) r.x -= FIELD.width;
  }
  for (const c of e.clouds) {
    c.x += (wind * (6 + c.layer * 7) - 4) * dt;
    if (c.x < -560) c.x = FIELD.width + 20;
    if (c.x > FIELD.width + 560) c.x = -c.w - 20;
  }
  void time;
}
