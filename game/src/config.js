// STORMHARVEST — config.js
// Every tuning number, colour and layout constant in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below ever depends on the real screen size.

export const FIELD = { width: 1280, height: 720, horizonY: 548, groundY: 640, seaY: 664 };

/** The simulation's fixed step, in seconds: 60 updates a second at any refresh rate. */
export const STEP = 1 / 60;

export const KITE = {
  radius: 20,            // collision / body radius of the kite harvester
  speed: 335,            // base fly speed, logical px per second
  accel: 2400,           // velocity approach rate for snappy but weighty flight
  hull: 100,             // starting hull integrity
  catcher: 86,           // harvest radius: be this close to a strike centre to catch it
  dashSpeed: 880,        // dash burst speed
  dashTime: 0.22,        // dash duration, seconds
  dashCooldown: 1.6,     // seconds between dashes
  invulnerable: 0.9,     // brief grace after taking a hit
  magnet: 0,             // base magnet (upgrades raise it): pulls telegraph centres' glow, widens effective catch slightly via world logic
};

export const STRIKE = {
  telegraph: 1.15,       // seconds a target ring glows before the bolt lands
  telegraphFast: 0.78,   // late-storm / boss barrage telegraph time
  boltLife: 0.28,        // seconds a landed bolt stays drawn
  charge: 12,            // battery charge per normal harvest
  megaCharge: 20,        // battery charge per boss mega-bolt harvest
  lancePerMega: 34,      // Storm Lance charge per mega-bolt (3 harvests = one shot)
  lanceMax: 100,
  score: 100,            // score per harvest
  missScore: 0,
};

/** Combo chains: consecutive harvests without a miss or a hit build a
 *  multiplier. The chain survives `window` seconds after each harvest;
 *  a miss, a sting or any hull damage resets it to zero. */
export const CHAIN = {
  window: 4.5,        // seconds a chain stays alive after a harvest
  latticeWindow: 7.5, // window with the Chain Lattice upgrade
  perStep: 0.08,      // score multiplier gained per chain step (+8%)
  cap: 20,            // chain steps that count toward the multiplier
};

/** Golden strikes: rare, faster telegraphs that pay double charge and
 *  triple score — worth breaking your route for. */
export const GOLD = { chance: 0.12, telegraph: 0.92, chargeMul: 2, scoreMul: 3 };

/** Harvest drones (draft upgrade): orbit the kite and catch any strike that
 *  lands inside their own small catcher, banking half charge and score.
 *  The orbit (118) deliberately sits OUTSIDE the kite's base catcher (86):
 *  drones extend your coverage to rings you cannot reach, not duplicate it. */
export const DRONE = { radius: 54, orbit: 118, orbitSpeed: 1.15, chargeFrac: 0.5 };

/** The Supercell's column lash (boss phase 1+): a telegraphed vertical
 *  lightning column at the kite's position. Stand in it to harvest it as a
 *  mega-bolt; stand near it and the shockwave bites. */
export const LASH = { every: 7.5, telegraph: 1.0, catchHalfWidth: 58, shockHalfWidth: 104, shockDamage: 10 };

export const HAIL = { damage: 8, radius: 9, speedMin: 260, speedMax: 430 };
export const GUST = { force: 420, life: 3.2 };
export const TORNADO = { damage: 14, radius: 30, speed: 62, pull: 150 };

export const BOSS = {
  name: 'THE SUPERCELL',
  hp: 3,                 // three Storm Lance hits defeat it
  y: 118,
  radius: 118,
  drift: 46,             // horizontal drift speed of the living cloud
  barrageEvery: 5.2,     // seconds between mega-bolt barrages (phase 0)
  barragePhase1: 4.3,    // phase 1 (2 hp left): the eye opens, barrages quicken
  barragePhase2: 3.5,    // phase 2 (1 hp left): enraged
  tornadoEvery: 9.0,
};

export const DIFFICULTIES = {
  calm:      { id: 'calm',      label: 'Calm',      hullMul: 1.3, quotaMul: 0.8, hazardMul: 0.7, scoreMul: 1.0 },
  tempest:   { id: 'tempest',   label: 'Tempest',   hullMul: 1.0, quotaMul: 1.0, hazardMul: 1.0, scoreMul: 1.5 },
  maelstrom: { id: 'maelstrom', label: 'Maelstrom', hullMul: 0.85, quotaMul: 1.2, hazardMul: 1.35, scoreMul: 2.2 },
};

export const PALETTE = {
  text: '#f4f7ff',
  muted: '#aebadd',
  dim: '#7e8ab0',
  gold: '#ffd257',
  charge: '#ffe45e',
  bolt: '#fff6a8',
  boltCore: '#ffffff',
  telegraph: '#ffd257',
  danger: '#ff5d5d',
  hull: '#69e58a',
  hullLow: '#ff5d5d',
  battery: '#57d7ff',
  lance: '#c792ff',
  panel: 'rgba(13,18,36,0.88)',
  panelEdge: '#3d4a78',
  card: 'rgba(22,30,56,0.95)',
  cardEdge: '#54649c',
  cardHover: '#ffd257',
  sea1: '#16324a',
  sea2: '#0d2036',
  town: '#0a1020',
  window: '#ffca7a',
  tower: '#1b2a4a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'stormharvest.best';
export const WIN_KEY = 'stormharvest.won';
export const SEASON_KEY = 'stormharvest.seasonBest';

/** Storm Season (the endless escalation mode): storms are generated from
 *  the authored templates and scaled by depth — quotas grow, cadence
 *  quickens, hail thickens, the sky darkens — and every `bossEvery`-th
 *  storm is a Supercell rematch that gains +1 integrity per appearance. */
export const SEASON = {
  bossEvery: 5,
  quotaGrowth: 0.14,   // +14% quota per depth level
  cadenceDecay: 0.97,  // strike interval ×0.97 per level (floored in world.js)
  timeLoss: 1.5,       // seconds shaved off each storm clock per level
  hailGrowth: 0.08,
  darkGrowth: 0.03,
  forkGrowth: 0.01,
};

/** Pool sizes, allocated once at boot so play never allocates in the hot loop. */
export const POOLS = { telegraphs: 28, bolts: 28, hail: 90, gusts: 10, tornadoes: 6, particles: 420, floaters: 24, rain: 170, clouds: 26, rings: 24 };
