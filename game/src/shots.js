// STORMHARVEST — shots.js
// The deterministic screenshot scenes behind ?shot=<name>&seed=1.
// Each scene builds a real world with the seeded RNG, then hand-stages the
// entities (using the same pools and shapes real play uses) so the frame is
// gorgeous, information-dense and exactly repeatable:
//   cover — the title screen over a dramatic storm: bolts mid-strike, rings
//           telegraphing, the town lit, the kite in heroic pose.
//   play  — mid Storm 3 (HAILVEIN): three telegraphed strikes, hail falling,
//           quota half-filled, three upgrades owned, sparks from a harvest.
//   boss  — Storm 7: THE SUPERCELL at 2/3 integrity, a tornado loose, mega
//           telegraphs around it, the Storm Lance fully charged.
//   end   — the victory screen with a plausible champion's final stats.
// No Math.random anywhere: every staged value comes from the seeded RNG or
// fixed constants, so seed 1 always paints the identical frame.

import { FIELD, STEP } from './config.js';
import { burstParticles, landBolt, spawnGust, spawnHail, spawnTelegraph, spawnTornado } from './entities.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';
import { createRandom, range } from './random.js';

/** Run the ambient world (title backdrop) forward so clouds/rain settle naturally. */
function settle(world, seconds) {
  const idle = { x: 0, y: 0, dash: false, pointer: null };
  for (let i = 0; i < seconds / STEP; i += 1) world.step(STEP, idle, true);
}

function stageLightningShow(world, random) {
  const e = world.state.entities;
  // Four bolts caught mid-flash and three rings at different countdown stages.
  const boltSpecs = [[330, 300, false, true], [905, 215, true, false], [1150, 330, true, false], [150, 250, false, true]];
  for (const [bx, by, mega, caught] of boltSpecs) {
    const tp = spawnTelegraph(e, random, 99, mega); tp.x = bx; tp.y = by;
    landBolt(e, random, tp, caught); tp.active = false;
  }
  for (const b of e.bolts) b.life = 0.05;
  const rings = [[520, 380, 0.35], [760, 330, 0.62], [1080, 420, 0.85]];
  rings.forEach(([x, y, frac], i) => {
    const t = spawnTelegraph(e, random, 1.15, false);
    t.x = x; t.y = y; t.t = 1.15 * frac;
    if (i === 1) t.gold = true; // one golden ring glitters over the town
  });
  burstParticles(e, random, 330, 300, 26, '#ffe45e', 300, 0.9, 3, 60);
  for (const p of e.particles) p.life = p.total * 0.3;
}

export function stageShot(name, world) {
  const random = createRandom(1);
  const state = world.state;
  const e = state.entities;

  if (name === 'play') {
    world.reset('tempest', false);
    // Storm 3, mid-flight: fast-forward the director to HAILVEIN by hand.
    world.nextStorm(); world.nextStorm();
    state.battery = 62; state.score = 4850; state.harvests = 41; state.hitsTaken = 3;
    state.timeLeft = 47; state.bannerT = 0; state.elapsed = 26;
    state.kite.x = 560; state.kite.y = 330; state.kite.hull = 82;
    world.applyUpgrade('catcher'); world.applyUpgrade('battery'); world.applyUpgrade('sails'); world.applyUpgrade('drone'); world.applyUpgrade('dynamo'); world.applyUpgrade('gilded');
    state.draftChoices = [];
    // A combo chain in full flow, so the HUD shows the multiplier meter.
    state.harvestChain = 7; state.chainTimer = 3.4;
    settle(world, 0.6);
    // A golden ring right under the kite (about to be harvested), two more nearby.
    const hero = spawnTelegraph(e, random, 1.15, false, { gold: true }); hero.x = 560; hero.y = 330; hero.t = 0.55;
    const t2 = spawnTelegraph(e, random, 1.15, false); t2.x = 830; t2.y = 250; t2.t = 0.25;
    const t3 = spawnTelegraph(e, random, 1.15, false); t3.x = 300; t3.y = 430; t3.t = 0.85;
    for (let i = 0; i < 16; i += 1) { spawnHail(e, random, 0.4); const h = e.hail.find((x) => x.active && x.y < 0); if (h) { h.y = range(random, 40, 480); h.x = range(random, 30, 1250); } }
    spawnGust(e, random);
    burstParticles(e, random, 420, 260, 20, '#ffe45e', 280, 0.8, 3, 60);
    for (const p of e.particles) p.life = p.total * 0.25;
    return { screen: SCREEN_PLAY, best: 4850 };
  }

  if (name === 'boss') {
    world.reset('tempest', false);
    for (let i = 0; i < 6; i += 1) world.nextStorm();
    state.score = 21400; state.harvests = 118; state.hitsTaken = 9;
    state.timeLeft = 83; state.bannerT = 0; state.elapsed = 64;
    state.kite.x = 470; state.kite.y = 360; state.kite.hull = 57;
    state.boss.hp = 2; state.boss.x = 700;
    state.lance = 100; state.lanceReadyAnnounced = true;
    world.applyUpgrade('catcher'); world.applyUpgrade('lance'); world.applyUpgrade('hull'); world.applyUpgrade('dash');
    state.draftChoices = []; state.kite.hull = 57;
    settle(world, 0.5);
    state.boss.enterT = 0; // the Supercell sits at fighting altitude in this frame, entrance finished
    for (const f of e.floaters) f.active = false; // no stray announcements in the boss frame
    // Mega-bolt barrage ringing the Supercell + one normal ring near the kite.
    const megas = [[520, 250, 0.4], [880, 290, 0.65], [700, 430, 0.2], [1020, 180, 0.8]];
    for (const [x, y, frac] of megas) {
      const t = spawnTelegraph(e, random, 0.78, true); t.x = x; t.y = y; t.t = 0.78 * frac;
    }
    const near = spawnTelegraph(e, random, 1.0, false); near.x = 470; near.y = 360; near.t = 0.5;
    // The eye's column lash charging at the right edge (boss is in phase 1).
    const lash = spawnTelegraph(e, random, 1.0, true, { column: true }); lash.x = 1085; lash.y = 488; lash.t = 0.45;
    spawnTornado(e, random, 980);
    burstParticles(e, random, 700, 190, 30, '#c792ff', 340, 0.9, 4, 100);
    for (const p of e.particles) p.life = p.total * 0.3;
    return { screen: SCREEN_PLAY, best: 21400 };
  }

  if (name === 'end') {
    world.reset('tempest', false);
    // Advance to the true final state — storm 7/7, THE SUPERCELL, already
    // beaten — so the HUD behind the victory panel agrees with its stats:
    // storm 7/7, integrity 0/3, timer 0, score 28950, 137 harvested.
    for (let i = 0; i < 6; i += 1) world.nextStorm();
    state.victory = true;
    state.score = 28950; state.harvests = 137; state.hitsTaken = 11;
    state.stats.stormsCleared = 7; state.stats.bossHits = 3; state.stats.bestChain = 14;
    state.timeLeft = 0; state.bannerT = 0; state.lance = 0;
    state.boss.hp = 0; // integrity empty: the Supercell is down
    state.elapsed = 90;
    world.applyUpgrade('catcher'); world.applyUpgrade('rods'); world.applyUpgrade('surge');
    state.kite.hull = 43;
    state.draftChoices = [];
    for (const f of e.floaters) f.active = false;
    settle(world, 1.2);
    burstParticles(e, random, 640, 260, 50, '#ffd257', 380, 1.4, 4, 120);
    for (const p of e.particles) p.life = p.total * 0.35;
    void SCREEN_OVER;
    return { screen: SCREEN_VICTORY, best: 28950 };
  }

  // Default: cover — title screen over the most dramatic storm we can stage.
  world.reset('tempest', false);
  state.elapsed = 12; state.bannerT = 0;
  state.kite.x = 468; state.kite.y = 332;
  settle(world, 1.5);
  // Hero pose (settle drifts the kite, so restore it): a larger kite
  // hovering at the edge of the nearest telegraph ring (520, 380).
  state.kite.x = 468; state.kite.y = 332; state.kite.scale = 1.4;
  stageLightningShow(world, random);
  return { screen: SCREEN_TITLE, best: 0 };
}
