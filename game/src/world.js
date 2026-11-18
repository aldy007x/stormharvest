// STORMHARVEST — world.js
// The game's rules and state, with no drawing and no browser in it.
// Systems, in the order step() runs them:
//   1. Storm director — the seven named storms (data below): each has a
//      battery quota, a timer, strike cadence, hazard mix and sky darkness.
//      Storm 4 is a mini-boss (THE HOWLING FRONT: fast telegraphs + gusts),
//      storm 7 is the boss (THE SUPERCELL, see system 6).
//   2. Flight — velocity flight with dash (burst + cooldown + i-frames),
//      mouse-steer while the pointer is held, wind gusts and tornado pull.
//   3. Lightning — strikes telegraph (ring + hum), then land: being inside
//      the catcher radius at that instant harvests charge into the town
//      batteries; being at ground zero without catching still stings.
//   4. Hazards — hail shards, gusts, tornadoes chip the hull; hull 0 = wreck.
//   5. Draft — clearing a storm's quota opens a draft of 3 upgrades drawn
//      from a pool of 14; the run builds a different harvester each time.
//   6. Boss — THE SUPERCELL has 3 health. Its mega-bolts charge the Storm
//      Lance when harvested; a full Lance fires (Space / click the Lance)
//      for one hit. Three hits win the game.
//   7. Scoring — harvests, storm clears, boss hits, time bonuses, all scaled
//      by difficulty; Endless mode keeps escalating after a victory.
// step() returns EVENT_* bit flags so main.js can react (sound, screens)
// without the world knowing about either.

import { BOSS, DIFFICULTIES, FIELD, GUST, HAIL, KITE, STRIKE, TORNADO } from './config.js';
import { addFloater, burstParticles, clearEntities, createEntities, landBolt, spawnGust, spawnHail, spawnTelegraph, spawnTornado, stepEntities } from './entities.js';
import { pick, range } from './random.js';

export const EVENT_HARVEST = 1;
export const EVENT_HIT = 2;
export const EVENT_THUNDER = 4;
export const EVENT_STORM_CLEAR = 8;
export const EVENT_OVER = 16;
export const EVENT_VICTORY = 32;
export const EVENT_DRAFT = 64;
export const EVENT_LANCE_READY = 128;
export const EVENT_LANCE_FIRE = 256;
export const EVENT_BOSS_HIT = 512;
export const EVENT_DASH = 1024;
export const EVENT_TELEGRAPH = 2048;

/** The seven storms. quota = battery charge to fill; time = seconds on the clock. */
export const STORMS = [
  { name: 'FIRST RUMBLES', quota: 60, time: 75, strikeEvery: 1.9, hail: 0.0, gustEvery: 9, tornadoes: 0, dark: 0.25, wind: 0.2 },
  { name: 'SQUALL LINE', quota: 84, time: 85, strikeEvery: 1.7, hail: 0.5, gustEvery: 8, tornadoes: 0, dark: 0.38, wind: 0.45 },
  { name: 'HAILVEIN', quota: 108, time: 90, strikeEvery: 1.55, hail: 1.4, gustEvery: 7, tornadoes: 0, dark: 0.5, wind: 0.55 },
  { name: 'THE HOWLING FRONT', quota: 120, time: 95, strikeEvery: 1.15, hail: 0.9, gustEvery: 3.6, tornadoes: 0, dark: 0.62, wind: 0.95, miniboss: true },
  { name: 'TWIN CYCLONES', quota: 132, time: 100, strikeEvery: 1.45, hail: 1.1, gustEvery: 6, tornadoes: 2, dark: 0.72, wind: 0.7 },
  { name: 'THE DROWNING SKY', quota: 156, time: 105, strikeEvery: 1.3, hail: 1.9, gustEvery: 5, tornadoes: 1, dark: 0.84, wind: 0.8 },
  { name: 'THE SUPERCELL', quota: 0, time: 150, strikeEvery: 1.5, hail: 0.85, gustEvery: 6.5, tornadoes: 0, dark: 1.0, wind: 0.65, boss: true },
];

/** The upgrade pool (14). Draft offers 3 distinct, not-yet-maxed choices. */
export const UPGRADES = [
  { id: 'catcher', name: 'Wide Catcher', icon: '◉', max: 3, desc: '+22 harvest radius per rank. Forgiving rings, greedier routes.' },
  { id: 'hull', name: 'Reinforced Hull', icon: '⬢', max: 3, desc: '+25 max hull and repair 25 now.' },
  { id: 'magnet', name: 'Storm Magnet', icon: '🧲', max: 2, desc: 'Strikes telegraph nearer to you; +10 catcher radius.' },
  { id: 'dash', name: 'Quickloader Dash', icon: '»', max: 2, desc: 'Dash recharges 35% faster and lasts longer.' },
  { id: 'battery', name: 'Deep Batteries', icon: '▦', max: 2, desc: 'Each harvest banks +4 extra charge.' },
  { id: 'clock', name: 'Borrowed Minutes', icon: '◷', max: 2, desc: '+12 seconds on every storm clock from now on.' },
  { id: 'rods', name: 'Twin Rods', icon: '⚡', max: 2, desc: 'Every 4th harvest strikes twice: double charge.' },
  { id: 'sails', name: 'Racing Sails', icon: '⛵', max: 2, desc: '+12% flight speed per rank.' },
  { id: 'plating', name: 'Hail Plating', icon: '❄', max: 2, desc: 'Hail and tornado damage reduced by 35%.' },
  { id: 'lance', name: 'Lance Capacitor', icon: '✦', max: 2, desc: 'Mega-bolts charge the Storm Lance 50% faster.' },
  { id: 'repair', name: 'Field Repairs', icon: '✚', max: 99, desc: 'Repair 40 hull right now. Always welcome.' },
  { id: 'surge', name: 'Surge Scoring', icon: '★', max: 2, desc: 'Harvests score +50% per rank.' },
  { id: 'ballast', name: 'Wind Ballast', icon: '⚓', max: 2, desc: 'Gusts and tornado pull push you 55% less.' },
  { id: 'second', name: 'Second Kite', icon: '♡', max: 1, desc: 'Once per run: a fatal hit instead leaves you at 30 hull.' },
];

const dist2 = (ax, ay, bx, by) => { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; };

export function createWorld(random) {
  const entities = createEntities(random);
  const kite = {
    x: FIELD.width / 2, y: 330, vx: 0, vy: 0, hull: KITE.hull, maxHull: KITE.hull,
    catcher: KITE.catcher, invulnerable: 0, dashT: 0, dashCd: 0, dashDirX: 1, dashDirY: 0, facing: 1,
  };
  const boss = { active: false, x: FIELD.width / 2, y: BOSS.y, hp: BOSS.hp, maxHp: BOSS.hp, phase: 0, barrageT: 3, tornadoT: 5, flash: 0 };
  const state = {
    entities, kite, boss,
    screenTime: 0, elapsed: 0, stormIndex: 0, storm: STORMS[0], stormTime: 0, timeLeft: STORMS[0].time,
    battery: 0, quota: STORMS[0].quota, score: 0, harvests: 0, strikesSeen: 0, hitsTaken: 0,
    difficulty: DIFFICULTIES.tempest, endless: false, endlessCycle: 0,
    upgrades: {}, draftChoices: [], harvestChain: 0,
    strikeT: 1.2, hailT: 1, gustT: 4, lance: 0, lanceReadyAnnounced: false,
    shake: 0, flash: 0, bannerT: 3, windPhase: 0, wind: 0, secondUsed: false,
    stats: { stormsCleared: 0, bossHits: 0, bestChain: 0 },
    over: false, victory: false, failReason: '',
  };

  function currentQuota() {
    const s = state.storm;
    if (s.boss) return 0;
    return Math.round(s.quota * state.difficulty.quotaMul) + state.endlessCycle * 24;
  }

  function startStorm(index) {
    state.stormIndex = index;
    state.storm = STORMS[index];
    state.stormTime = 0;
    state.timeLeft = state.storm.time + (state.upgrades.clock || 0) * 12;
    state.battery = 0;
    state.quota = currentQuota();
    state.bannerT = 3;
    state.strikeT = 1.1; state.hailT = 1.4; state.gustT = 3;
    boss.active = !!state.storm.boss;
    if (boss.active) { boss.hp = BOSS.hp; boss.phase = 0; boss.barrageT = 2.5; boss.tornadoT = 4; state.lance = 0; }
    for (let i = 0; i < state.storm.tornadoes; i += 1) spawnTornado(entities, random);
    if (state.storm.miniboss) addFloater(entities, FIELD.width / 2, 210, 'MINI-BOSS STORM — FAST BOLTS, HARD WIND', '#ff9d5c', 24);
  }

  function reset(difficultyId = 'tempest', endless = false) {
    clearEntities(entities);
    state.difficulty = DIFFICULTIES[difficultyId] || DIFFICULTIES.tempest;
    state.endless = endless; state.endlessCycle = 0;
    kite.x = FIELD.width / 2; kite.y = 330; kite.vx = 0; kite.vy = 0;
    kite.maxHull = Math.round(KITE.hull * state.difficulty.hullMul);
    kite.hull = kite.maxHull; kite.catcher = KITE.catcher;
    kite.invulnerable = 0; kite.dashT = 0; kite.dashCd = 0;
    state.score = 0; state.harvests = 0; state.strikesSeen = 0; state.hitsTaken = 0;
    state.upgrades = {}; state.draftChoices = []; state.harvestChain = 0;
    state.lance = 0; state.lanceReadyAnnounced = false; state.secondUsed = false;
    state.elapsed = 0; state.shake = 0; state.flash = 0;
    state.stats = { stormsCleared: 0, bossHits: 0, bestChain: 0 };
    state.over = false; state.victory = false; state.failReason = '';
    startStorm(0);
  }

  function rollDraft() {
    const pool = UPGRADES.filter((u) => (state.upgrades[u.id] || 0) < u.max);
    const choices = [];
    const copy = pool.slice();
    while (choices.length < 3 && copy.length) {
      const i = Math.floor(random() * copy.length);
      choices.push(copy.splice(i, 1)[0]);
    }
    state.draftChoices = choices;
    return choices;
  }

  function applyUpgrade(id) {
    const def = UPGRADES.find((u) => u.id === id); if (!def) return;
    state.upgrades[id] = (state.upgrades[id] || 0) + 1;
    switch (id) {
      case 'catcher': kite.catcher += 19; break;
      case 'hull': kite.maxHull += 25; kite.hull = Math.min(kite.maxHull, kite.hull + 25); break;
      case 'magnet': kite.catcher += 10; break;
      case 'repair': kite.hull = Math.min(kite.maxHull, kite.hull + 40); break;
      default: break; // dash/battery/clock/rods/sails/plating/lance/surge/ballast/second read live from state.upgrades
    }
    state.draftChoices = [];
  }

  function damage(amount, x, y) {
    let events = 0;
    if (kite.invulnerable > 0 || state.over) return events;
    const plated = state.upgrades.plating ? amount * 0.65 : amount;
    kite.hull -= Math.round(plated);
    kite.invulnerable = KITE.invulnerable;
    state.hitsTaken += 1; state.harvestChain = 0;
    state.shake = Math.max(state.shake, 9);
    burstParticles(entities, random, x, y, 16, '#ff8a5c', 260, 0.5, 3, 300);
    addFloater(entities, kite.x, kite.y - 34, `HULL -${Math.round(plated)}`, '#ff5d5d', 20);
    events |= EVENT_HIT;
    if (kite.hull <= 0) {
      if (state.upgrades.second && !state.secondUsed) {
        state.secondUsed = true; kite.hull = 30;
        addFloater(entities, kite.x, kite.y - 60, 'SECOND KITE! HULL RESTORED', '#69e58a', 24);
        burstParticles(entities, random, kite.x, kite.y, 40, '#69e58a', 340, 0.8, 3, 120);
      } else {
        kite.hull = 0; state.over = true; state.failReason = 'Your kite was wrecked by the storm.';
        burstParticles(entities, random, kite.x, kite.y, 70, '#ffd257', 420, 1.1, 4, 260);
        events |= EVENT_OVER;
      }
    }
    return events;
  }

  /** Fire the Storm Lance at the Supercell. Returns true when it fired. */
  function fireLance() {
    if (!boss.active || state.lance < STRIKE.lanceMax || state.over) return false;
    state.lance = 0; state.lanceReadyAnnounced = false;
    boss.hp -= 1; boss.flash = 0.5; state.stats.bossHits += 1;
    state.score += Math.round(500 * state.difficulty.scoreMul);
    state.shake = 16; state.flash = 0.7;
    burstParticles(entities, random, boss.x, boss.y + 60, 60, '#c792ff', 480, 0.9, 4, 160);
    addFloater(entities, boss.x, boss.y + 130, boss.hp > 0 ? `SUPERCELL HIT! ${boss.hp} TO GO` : 'SUPERCELL DOWN!', '#c792ff', 28);
    return true;
  }

  function resolveStrike(telegraph) {
    let events = EVENT_THUNDER;
    const d2 = dist2(kite.x, kite.y, telegraph.x, telegraph.y);
    const caught = d2 <= kite.catcher * kite.catcher;
    landBolt(entities, random, telegraph, caught);
    state.strikesSeen += 1;
    state.flash = Math.max(state.flash, telegraph.mega ? 0.55 : 0.35);
    state.shake = Math.max(state.shake, telegraph.mega ? 8 : 5);
    if (caught) {
      state.harvestChain += 1;
      state.stats.bestChain = Math.max(state.stats.bestChain, state.harvestChain);
      state.harvests += 1;
      let charge = (telegraph.mega ? STRIKE.megaCharge : STRIKE.charge) + (state.upgrades.battery || 0) * 4;
      if (state.upgrades.rods && state.harvests % 4 === 0) charge *= 2;
      if (!state.storm.boss) state.battery = Math.min(state.quota, state.battery + charge);
      const surge = 1 + (state.upgrades.surge || 0) * 0.5;
      const gained = Math.round(STRIKE.score * surge * state.difficulty.scoreMul * (telegraph.mega ? 2 : 1));
      state.score += gained;
      burstParticles(entities, random, telegraph.x, telegraph.y, telegraph.mega ? 34 : 22, '#ffe45e', 320, 0.6, 3, 60);
      addFloater(entities, telegraph.x, telegraph.y - 26, `+${gained}`, '#ffe45e', 22);
      events |= EVENT_HARVEST;
      if (boss.active && telegraph.mega) {
        // Mega-bolt energy also patches the kite: the boss fight sustains
        // itself as long as you keep catching the big bolts.
        kite.hull = Math.min(kite.maxHull, kite.hull + 4);
        const before = state.lance;
        state.lance = Math.min(STRIKE.lanceMax, state.lance + STRIKE.lancePerMega * (1 + (state.upgrades.lance || 0) * 0.5));
        if (state.lance >= STRIKE.lanceMax && before < STRIKE.lanceMax) {
          events |= EVENT_LANCE_READY;
          addFloater(entities, kite.x, kite.y - 56, 'STORM LANCE READY — SPACE!', '#c792ff', 26);
        }
      }
    } else {
      state.harvestChain = 0;
      // Ground zero still stings: standing in the outer scorch ring hurts.
      if (d2 <= (kite.catcher + 34) * (kite.catcher + 34)) events |= damage(6, kite.x, kite.y);
      burstParticles(entities, random, telegraph.x, telegraph.y, 10, '#9fb4d8', 200, 0.4, 2, 300);
    }
    return events;
  }

  function clearStorm() {
    let events = EVENT_STORM_CLEAR;
    state.stats.stormsCleared += 1;
    const timeBonus = Math.round(state.timeLeft * 10 * state.difficulty.scoreMul);
    state.score += timeBonus + 250;
    addFloater(entities, FIELD.width / 2, 250, `STORM CLEARED! +${timeBonus + 250}`, '#69e58a', 30);
    if (state.stormIndex >= STORMS.length - 1) { /* boss handled separately */ }
    if (state.endless && state.stormIndex === STORMS.length - 2) {
      state.endlessCycle += 1; startStorm(2 + (state.endlessCycle % 4)); return events;
    }
    if (state.stormIndex < STORMS.length - 1) {
      rollDraft();
      events |= EVENT_DRAFT;
    }
    return events;
  }

  /** Advance from the draft into the next storm (called by main after a pick). */
  function nextStorm() { startStorm(Math.min(STORMS.length - 1, state.stormIndex + 1)); }

  /**
   * One fixed step. `input` = { x, y, dash, pointer:{x,y,down}|null }.
   * With `harmless` (title backdrop) storms rage but nothing can hurt or score.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt; state.screenTime += dt;
    if (state.bannerT > 0) state.bannerT -= dt;
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.2);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 34);
    if (boss.flash > 0) boss.flash -= dt;
    state.windPhase += dt * 0.35;
    state.wind = Math.sin(state.windPhase) * state.storm.wind;

    if (!harmless && !state.over && !state.victory) {
      state.stormTime += dt; state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        if (state.storm.boss) { state.over = true; state.failReason = 'The Supercell outlasted you.'; events |= EVENT_OVER; }
        else if (state.battery < state.quota) { state.over = true; state.failReason = `The town went dark — quota missed in ${state.storm.name}.`; events |= EVENT_OVER; }
      }
    }

    // --- Flight ------------------------------------------------------------
    const speedMul = 1 + (state.upgrades.sails || 0) * 0.12;
    let mx = input.x; let my = input.y;
    if (input.pointer && input.pointer.down) {
      const dx = input.pointer.x - kite.x; const dy = input.pointer.y - kite.y;
      const d = Math.hypot(dx, dy);
      if (d > 14) { mx = dx / d; my = dy / d; }
    }
    const mag = Math.hypot(mx, my) || 1;
    if (kite.dashCd > 0) kite.dashCd -= dt;
    if (kite.invulnerable > 0) kite.invulnerable -= dt;
    if (input.dash && kite.dashCd <= 0 && !harmless) {
      kite.dashT = 0.22 + (state.upgrades.dash || 0) * 0.05;
      kite.dashCd = KITE.dashCooldown * (1 - (state.upgrades.dash || 0) * 0.35);
      kite.dashDirX = mx !== 0 || my !== 0 ? mx / mag : kite.facing;
      kite.dashDirY = mx !== 0 || my !== 0 ? my / mag : 0;
      kite.invulnerable = Math.max(kite.invulnerable, kite.dashT);
      events |= EVENT_DASH;
      burstParticles(entities, random, kite.x, kite.y, 10, '#aebadd', 180, 0.3, 2, 0);
    }
    const dashing = kite.dashT > 0;
    if (dashing) kite.dashT -= dt;
    const targetVx = dashing ? kite.dashDirX * KITE.dashSpeed : (mx / (Math.hypot(mx, my) || 1)) * KITE.speed * speedMul * (mx !== 0 || my !== 0 ? 1 : 0);
    const targetVy = dashing ? kite.dashDirY * KITE.dashSpeed : (my / (Math.hypot(mx, my) || 1)) * KITE.speed * speedMul * (mx !== 0 || my !== 0 ? 1 : 0);
    const approach = Math.min(1, KITE.accel * dt / KITE.speed);
    kite.vx += (targetVx - kite.vx) * approach;
    kite.vy += (targetVy - kite.vy) * approach;
    // Wind: gusts and ambient storm wind shove the kite (ballast resists).
    const resist = 1 - (state.upgrades.ballast || 0) * 0.275;
    kite.vx += state.wind * 130 * resist * dt;
    for (const g of entities.gusts) {
      if (g.active && kite.y > g.y - 34 && kite.y < g.y + 34 && kite.x > g.x && kite.x < g.x + g.w) {
        kite.vx += g.dir * GUST.force * resist * dt;
      }
    }
    for (const t of entities.tornadoes) {
      if (!t.active) continue;
      const d2 = dist2(kite.x, kite.y, t.x, FIELD.horizonY - 90);
      if (d2 < 200 * 200) {
        const d = Math.sqrt(d2) || 1;
        kite.vx += ((t.x - kite.x) / d) * TORNADO.pull * resist * dt;
        kite.vy += ((FIELD.horizonY - 90 - kite.y) / d) * TORNADO.pull * resist * dt;
      }
    }
    kite.x = Math.min(FIELD.width - 26, Math.max(26, kite.x + kite.vx * dt));
    kite.y = Math.min(FIELD.horizonY - 8, Math.max(64, kite.y + kite.vy * dt));
    if (kite.vx > 24) kite.facing = 1; else if (kite.vx < -24) kite.facing = -1;

    // --- Lightning director --------------------------------------------------
    if (!state.over && !state.victory) {
      state.strikeT -= dt;
      if (state.strikeT <= 0) {
        const fast = state.storm.miniboss || boss.active;
        const t = spawnTelegraph(entities, random, fast ? STRIKE.telegraphFast : STRIKE.telegraph * range(random, 0.9, 1.2), false);
        if (t && state.upgrades.magnet) { // Storm Magnet bends strikes toward the kite
          t.x = Math.min(FIELD.width - 70, Math.max(70, t.x + (kite.x - t.x) * 0.35 * state.upgrades.magnet));
          t.y = Math.min(FIELD.horizonY - 40, Math.max(120, t.y + (kite.y - t.y) * 0.25 * state.upgrades.magnet));
        }
        if (t) events |= EVENT_TELEGRAPH;
        state.strikeT = state.storm.strikeEvery * state.difficulty.hazardMul ** -0.5 * range(random, 0.75, 1.25) + state.endlessCycle * -0.05;
        if (state.strikeT < 0.55) state.strikeT = 0.55;
      }
      // Boss barrages: rings of mega-bolts around the Supercell.
      if (boss.active) {
        boss.phase += dt;
        boss.x = FIELD.width / 2 + Math.sin(boss.phase * 0.45) * 300;
        boss.barrageT -= dt;
        if (boss.barrageT <= 0) {
          for (let i = 0; i < 4; i += 1) {
            const t = spawnTelegraph(entities, random, STRIKE.telegraphFast, true);
            if (t) { t.x = Math.min(FIELD.width - 70, Math.max(70, boss.x + range(random, -330, 330))); t.y = range(random, 190, FIELD.horizonY - 50); }
          }
          events |= EVENT_TELEGRAPH;
          boss.barrageT = BOSS.barrageEvery;
        }
        boss.tornadoT -= dt;
        if (boss.tornadoT <= 0) { spawnTornado(entities, random, boss.x); boss.tornadoT = BOSS.tornadoEvery; }
      }
      // Hazards
      if (state.storm.hail > 0) {
        state.hailT -= dt;
        if (state.hailT <= 0) { spawnHail(entities, random, state.wind); state.hailT = 1 / (state.storm.hail * state.difficulty.hazardMul) * range(random, 0.5, 1.3); }
      }
      state.gustT -= dt;
      if (state.gustT <= 0) { spawnGust(entities, random); state.gustT = state.storm.gustEvery * range(random, 0.8, 1.3); }
    }

    // --- Strike resolution ---------------------------------------------------
    for (const t of entities.telegraphs) {
      if (t.active && t.t >= t.total) {
        t.active = false;
        if (harmless) { landBolt(entities, random, t, false); events |= EVENT_THUNDER; }
        else events |= resolveStrike(t);
      }
    }

    // --- Hazard collisions -----------------------------------------------------
    if (!harmless && !state.over) {
      for (const h of entities.hail) {
        if (h.active && dist2(h.x, h.y, kite.x, kite.y) < (h.r + KITE.radius - 4) ** 2) { h.active = false; events |= damage(HAIL.damage, h.x, h.y); }
      }
      for (const t of entities.tornadoes) {
        if (t.active && dist2(t.x, FIELD.horizonY - 90, kite.x, kite.y) < (TORNADO.radius + KITE.radius) ** 2) events |= damage(TORNADO.damage, kite.x, kite.y);
      }
    }

    stepEntities(entities, dt, state.wind, state.elapsed);

    // --- Storm / boss outcomes ---------------------------------------------------
    if (!harmless && !state.over && !state.victory) {
      if (boss.active && boss.hp <= 0) {
        state.victory = true; state.score += 1000;
        burstParticles(entities, random, boss.x, boss.y, 120, '#c792ff', 520, 1.4, 5, 200);
        burstParticles(entities, random, boss.x, boss.y, 80, '#ffe45e', 420, 1.2, 4, 120);
        events |= EVENT_VICTORY;
      } else if (!state.storm.boss && state.battery >= state.quota && state.quota > 0) {
        events |= clearStorm();
      }
    }
    void pick;
    return events;
  }

  reset('tempest', false);
  return { state, reset, step, applyUpgrade, fireLance, nextStorm, rollDraft };
}
