// STORMHARVEST — render.js
// Drawing only: world state + current screen in, pixels out. All art is
// Canvas 2D code — layered parallax storm clouds, a dusk sky that darkens
// with each storm, animated sea, a coastal town silhouette with lit windows
// and three battery towers that fill as you harvest, rain, jagged lightning,
// telegraphed strike rings, particles, and a full HUD (storm banner, quota
// bar, hull, timer, dash, Storm Lance, upgrade icons). Screens: title (with
// clickable difficulty + Endless buttons), play, paused, upgrade draft
// cards, game over and victory. Button rectangles are exported so main.js
// hit-tests exactly what is drawn.

import { BOSS, CHAIN, DIFFICULTIES, DRONE, FIELD, FONT, LASH, PALETTE, STRIKE } from './config.js';
import { forkPoint } from './entities.js';
import { chainMultiplier, STORMS, UPGRADES } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

/** Deterministic pseudo-random from an integer seed (for bolt jaggedness / town windows). */
function seeded(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/** Buttons for a screen, as { id, x, y, w, h, label } in logical coordinates. */
export function getButtons(screen, state) {
  const buttons = [];
  if (screen === SCREEN_TITLE) {
    const ids = Object.keys(DIFFICULTIES);
    ids.forEach((id, i) => buttons.push({ id: 'diff:' + id, x: 340 + i * 208, y: 512, w: 192, h: 52, label: DIFFICULTIES[id].label }));
    buttons.push({ id: 'endless', x: 490, y: 578, w: 300, h: 46, label: state.endlessUnlocked ? '▶  ENDLESS MODE' : '🔒 ENDLESS — win once to unlock' });
  } else if (screen === SCREEN_DRAFT) {
    state.draftChoices.forEach((choice, i) => buttons.push({ id: 'upgrade:' + choice.id, x: 92 + i * 380, y: 250, w: 340, h: 250, label: choice.name }));
  } else if (screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
    buttons.push({ id: 'restart', x: 490, y: 540, w: 300, h: 54, label: '↻  PLAY AGAIN (R)' });
    buttons.push({ id: 'title', x: 490, y: 606, w: 300, h: 44, label: 'TITLE' });
  } else if (screen === SCREEN_PAUSED) {
    buttons.push({ id: 'resume', x: 490, y: 400, w: 300, h: 52, label: 'RESUME (P)' });
    buttons.push({ id: 'title', x: 490, y: 464, w: 300, h: 44, label: 'QUIT TO TITLE' });
  }
  return buttons;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let hover = { x: -999, y: -999 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    view.x = (canvas.width - FIELD.width * view.scale) / 2;
    view.y = (canvas.height - FIELD.height * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function setHover(x, y) { hover = { x, y }; }
  const inside = (b) => hover.x >= b.x && hover.x <= b.x + b.w && hover.y >= b.y && hover.y <= b.y + b.h;

  function text(value, x, y, size, color, align = 'left', weight = '') {
    ctx.font = `${weight} ${size}px ${FONT}`.trim();
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
  function bar(x, y, w, h, frac, color, back = 'rgba(255,255,255,0.14)') {
    ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  // ---- Scenery -------------------------------------------------------------
  function sky(state) {
    const dark = state.storm.dark;
    const top = [26 + (1 - dark) * 30, 30 + (1 - dark) * 22, 66 + (1 - dark) * 40];
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.horizonY);
    grad.addColorStop(0, `rgb(${top[0] | 0},${top[1] | 0},${top[2] | 0})`);
    grad.addColorStop(0.7, `rgb(${58 - dark * 22},${52 - dark * 14},${96 - dark * 30})`);
    grad.addColorStop(1, `rgb(${122 - dark * 40},${84 - dark * 26},${92 - dark * 22})`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, FIELD.width, FIELD.horizonY + 4);
    // Each storm washes the sky with its own tint (amber front, violet
    // cyclones, drowning blue…) so no two storms look alike.
    if (state.storm.tint) { ctx.fillStyle = state.storm.tint; ctx.fillRect(0, 0, FIELD.width, FIELD.horizonY + 4); }
    // A bruised moon behind the clouds in late storms.
    ctx.fillStyle = 'rgba(230,235,255,0.5)';
    ctx.beginPath(); ctx.arc(1085, 96, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(230,235,255,0.16)';
    ctx.beginPath(); ctx.arc(1085, 96, 52, 0, Math.PI * 2); ctx.fill();
  }

  function clouds(state, layer) {
    for (const c of state.entities.clouds) {
      if (c.layer !== layer) continue;
      const shade = 22 + c.shade * 26 - state.storm.dark * 8;
      ctx.fillStyle = `rgba(${shade + 14},${shade + 16},${shade + 34},${0.55 + layer * 0.18})`;
      const w = c.w; const h = w * 0.26;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - w * 0.28, c.y + h * 0.14, w * 0.3, h * 0.42, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + w * 0.3, c.y + h * 0.1, w * 0.32, h * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function seaAndTown(state) {
    // Sea with animated wave glints.
    const grad = ctx.createLinearGradient(0, FIELD.horizonY, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.sea1); grad.addColorStop(1, PALETTE.sea2);
    ctx.fillStyle = grad; ctx.fillRect(0, FIELD.horizonY, FIELD.width, FIELD.height - FIELD.horizonY);
    ctx.strokeStyle = 'rgba(140,190,230,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 26; i += 1) {
      const wx = seeded(i * 3) * FIELD.width + Math.sin(state.elapsed * 1.4 + i) * 16;
      const wy = FIELD.horizonY + 12 + seeded(i * 7) * 52;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 26 + seeded(i) * 30, wy); ctx.stroke();
    }
    // Coastal town silhouette: houses with lit windows along the shore.
    ctx.fillStyle = PALETTE.town;
    ctx.fillRect(0, FIELD.groundY, FIELD.width, FIELD.height - FIELD.groundY);
    for (let i = 0; i < 22; i += 1) {
      const hx = i * 60 + seeded(i * 11) * 12;
      const hh = 26 + seeded(i * 13) * 30;
      ctx.fillRect(hx, FIELD.groundY - hh, 46, hh);
      ctx.beginPath(); ctx.moveTo(hx - 4, FIELD.groundY - hh); ctx.lineTo(hx + 23, FIELD.groundY - hh - 14); ctx.lineTo(hx + 50, FIELD.groundY - hh); ctx.fill();
      for (let wnd = 0; wnd < 3; wnd += 1) {
        if (seeded(i * 31 + wnd * 7) > 0.42) {
          ctx.fillStyle = PALETTE.window;
          ctx.fillRect(hx + 8 + wnd * 13, FIELD.groundY - hh + 10 + (wnd % 2) * 12, 7, 9);
          ctx.fillStyle = PALETTE.town;
        }
      }
    }
    // Three battery towers, spread along the skyline (15% / 50% / 85% of the
    // width), each mounted on its own rooftop plinth so they read as part of
    // the town — and kept well clear of the bottom-left HULL/DASH bars.
    const frac = state.storm.boss ? 1 : (state.quota ? state.battery / state.quota : 0);
    const towerXs = [FIELD.width * 0.15, FIELD.width * 0.5, FIELD.width * 0.85];
    towerXs.forEach((cx, t) => {
      const base = FIELD.groundY - 24; const hgt = 86;
      // Rooftop plinth the tower stands on.
      ctx.fillStyle = PALETTE.town;
      ctx.fillRect(cx - 30, FIELD.groundY - 24, 60, 24);
      ctx.beginPath(); ctx.moveTo(cx - 34, FIELD.groundY - 24); ctx.lineTo(cx, FIELD.groundY - 38); ctx.lineTo(cx + 34, FIELD.groundY - 24); ctx.fill();
      ctx.fillStyle = PALETTE.tower; ctx.fillRect(cx - 12, base - hgt, 24, hgt);
      const fillH = hgt * Math.max(0, Math.min(1, frac * 3 - t));
      ctx.fillStyle = PALETTE.battery; ctx.fillRect(cx - 8, base - 6 - fillH, 16, fillH);
      ctx.fillStyle = frac * 3 - t >= 1 ? PALETTE.charge : '#42507a';
      ctx.beginPath(); ctx.arc(cx, base - hgt - 7, 6, 0, Math.PI * 2); ctx.fill();
    });
    // Label above the middle tower, in open sky — never over the HUD bars.
    text('TOWN BATTERIES', FIELD.width * 0.5, FIELD.groundY - 24 - 86 - 22, 13, PALETTE.muted, 'center', '700');
  }

  function rainLayer(state) {
    ctx.strokeStyle = `rgba(170,200,240,${0.16 + state.storm.dark * 0.14})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const r of state.entities.rain) {
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + state.wind * 9, r.y + r.len);
    }
    ctx.stroke();
  }

  // ---- Entities --------------------------------------------------------------
  function telegraphs(state) {
    for (const t of state.entities.telegraphs) {
      if (!t.active) continue;
      const frac = t.t / t.total;
      const pulse = 0.65 + Math.sin(state.elapsed * 22) * 0.35;
      // The Supercell's column lash: a vertical band of crackling purple
      // from cloud to sea. Stand in it to harvest; the edges shock.
      if (t.column) {
        const w = LASH.catchHalfWidth;
        const grad = ctx.createLinearGradient(t.x - w, 0, t.x + w, 0);
        grad.addColorStop(0, 'rgba(199,146,255,0)');
        grad.addColorStop(0.5, `rgba(199,146,255,${0.22 + pulse * 0.22 + frac * 0.25})`);
        grad.addColorStop(1, 'rgba(199,146,255,0)');
        ctx.fillStyle = grad; ctx.fillRect(t.x - w, 66, w * 2, FIELD.horizonY - 66);
        ctx.strokeStyle = `rgba(230,200,255,${0.5 + pulse * 0.4})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(t.x - w, 66); ctx.lineTo(t.x - w, FIELD.horizonY); ctx.moveTo(t.x + w, 66); ctx.lineTo(t.x + w, FIELD.horizonY); ctx.stroke();
        // The core narrows as the lash charges: a bright spine at impact.
        ctx.fillStyle = `rgba(255,255,255,${frac * 0.5})`;
        ctx.fillRect(t.x - 2 - frac * 3, 66, 4 + frac * 6, FIELD.horizonY - 66);
        text('⚡ LASH ⚡', t.x, 150, 15, '#e6c8ff', 'center', '800');
        continue;
      }
      const radius = (t.mega ? 118 : 92) * (1 - frac * 0.55);
      const ringColor = t.gold ? `rgba(255,243,176,${0.6 + pulse * 0.4})` : (t.mega ? `rgba(199,146,255,${0.55 + pulse * 0.4})` : `rgba(255,210,87,${0.5 + pulse * 0.45})`);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3 + frac * 3 + (t.gold ? 1.5 : 0);
      ctx.beginPath(); ctx.arc(t.x, t.y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(t.x, t.y, Math.max(8, radius * (1 - frac)), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = t.gold ? '#fff3b0' : (t.mega ? '#c792ff' : PALETTE.telegraph);
      ctx.beginPath(); ctx.arc(t.x, t.y, 4 + frac * 4, 0, Math.PI * 2); ctx.fill();
      text(t.gold ? 'GOLD ×3' : (t.mega ? 'MEGA' : ''), t.x, t.y - radius - 8, 13, t.gold ? '#fff3b0' : '#c792ff', 'center', '800');
      // Cross ticks so the ring reads even in peripheral vision.
      ctx.strokeStyle = t.gold ? 'rgba(255,243,176,0.9)' : 'rgba(255,230,150,0.8)';
      for (let k = 0; k < 4; k += 1) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(t.x + Math.cos(a) * (radius + 6), t.y + Math.sin(a) * (radius + 6));
        ctx.lineTo(t.x + Math.cos(a) * (radius + 18), t.y + Math.sin(a) * (radius + 18));
        ctx.stroke();
      }
      // A forked strike shows its twin ring, linked by a crackling tie —
      // catching EITHER ring harvests, so the pair reads as one decision.
      if (t.fork) {
        const fp = forkPoint(t);
        ctx.strokeStyle = ringColor; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(fp.x, fp.y, radius * 0.92, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(fp.x, fp.y); ctx.stroke();
        ctx.setLineDash([]);
        text('FORK', fp.x, fp.y - radius * 0.92 - 8, 12, PALETTE.telegraph, 'center', '800');
      }
    }
    // Catcher radius around the kite, so players can judge a harvest.
    const k = state.kite;
    ctx.strokeStyle = 'rgba(120,220,255,0.28)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(k.x, k.y, k.catcher, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  function bolts(state) {
    for (const b of state.entities.bolts) {
      if (!b.active) continue;
      const alpha = 1 - b.life / b.total;
      const width = b.mega ? 10.5 : 6.5;
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass === 0 ? `rgba(255,240,150,${alpha * 0.5})` : `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = pass === 0 ? width * 3.4 : width;
        ctx.beginPath();
        let x = b.x; let y = -10;
        ctx.moveTo(x + (seeded(b.seed) - 0.5) * 90, y);
        const segments = 9;
        for (let s = 1; s <= segments; s += 1) {
          const ny = (b.y + 10) * (s / segments) - 10;
          const nx = b.x + (seeded(b.seed + s * 17) - 0.5) * (b.mega ? 84 : 56) * (s < segments ? 1 : 0);
          ctx.lineTo(nx, ny);
          x = nx; y = ny;
        }
        ctx.stroke();
        void x; void y;
      }
      // Scorch / catch glow at the strike point.
      const glow = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.mega ? 90 : 60);
      glow.addColorStop(0, b.caught ? `rgba(255,228,94,${alpha * 0.8})` : `rgba(180,200,255,${alpha * 0.45})`);
      glow.addColorStop(1, 'rgba(255,228,94,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.mega ? 90 : 60, 0, Math.PI * 2); ctx.fill();
    }
  }

  function hazards(state) {
    for (const g of state.entities.gusts) {
      if (!g.active) continue;
      const a = Math.sin(Math.min(1, g.life / g.total) * Math.PI) * 0.5;
      ctx.strokeStyle = `rgba(200,225,255,${a})`; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        const yy = g.y - 22 + i * 22;
        ctx.beginPath();
        ctx.moveTo(g.x, yy);
        ctx.bezierCurveTo(g.x + g.w * 0.3, yy - 12, g.x + g.w * 0.7, yy + 12, g.x + g.w, yy);
        ctx.stroke();
      }
      text(g.dir > 0 ? 'GUST »»' : '«« GUST', g.x + g.w / 2, g.y - 36, 14, 'rgba(200,225,255,0.9)', 'center', '800');
    }
    for (const t of state.entities.tornadoes) {
      if (!t.active) continue;
      const topY = 120; const baseY = FIELD.horizonY;
      for (let i = 0; i < 7; i += 1) {
        const frac = i / 7;
        const yy = baseY - frac * (baseY - topY);
        const wdt = 16 + frac * 62 + Math.sin(t.phase + i) * 7;
        ctx.fillStyle = `rgba(168,184,214,${0.34 + frac * 0.2})`;
        ctx.beginPath(); ctx.ellipse(t.x + Math.sin(t.phase * 1.3 + i * 0.8) * 9 * frac, yy, wdt, 11, 0, 0, Math.PI * 2); ctx.fill();
      }
      text('TORNADO', t.x, topY - 14, 13, '#ffb0b0', 'center', '800');
    }
    for (const h of state.entities.hail) {
      if (!h.active) continue;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.spin);
      ctx.fillStyle = 'rgba(205,232,255,0.95)';
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = i * Math.PI / 3;
        ctx.lineTo(Math.cos(a) * h.r, Math.sin(a) * h.r);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
  }

  function bossDraw(state) {
    const boss = state.boss;
    if (!boss.active || state.victory) return;
    const flash = boss.flash > 0;
    const x = boss.x; const y = boss.y; const t = state.elapsed;
    // Purple under-glow spilling from the belly of the cloud.
    const glow = ctx.createRadialGradient(x, y + 84, 12, x, y + 84, 240);
    glow.addColorStop(0, 'rgba(168,96,255,0.32)'); glow.addColorStop(1, 'rgba(168,96,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y + 84, 240, 0, Math.PI * 2); ctx.fill();
    // Rain shaft: a translucent curtain falling from the cloud to the sea.
    const shaft = ctx.createLinearGradient(0, y + 52, 0, FIELD.horizonY);
    shaft.addColorStop(0, 'rgba(158,188,235,0.20)'); shaft.addColorStop(1, 'rgba(158,188,235,0.04)');
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(x - 128, y + 52); ctx.lineTo(x + 128, y + 52);
    ctx.lineTo(x + 168, FIELD.horizonY); ctx.lineTo(x - 168, FIELD.horizonY);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(180,205,245,0.20)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 22; i += 1) {
      const sx = x - 120 + seeded(i * 17) * 240;
      const sy = y + 58 + ((seeded(i * 29) * 300 + t * 340) % 420);
      ctx.moveTo(sx, sy); ctx.lineTo(sx + 7, sy + 44);
    }
    ctx.stroke();
    // One layered cloud mass — shelf, lobes, dome, belly, back to front —
    // so the Supercell reads as a single strong silhouette, not loose blobs.
    // (Its name / integrity / lance live in the HUD header, never here.)
    const mass = [
      [0, 44, 208, 56, 'rgba(38,36,66,0.97)'],
      [-108, -20, 110, 54, 'rgba(52,49,84,0.97)'],
      [110, -22, 114, 56, 'rgba(52,49,84,0.97)'],
      [0, -50, 126, 58, 'rgba(74,69,112,0.97)'],
      [0, 10, 172, 74, 'rgba(62,58,96,0.98)'],
    ];
    for (const [ox, oy, rx, ry, fill] of mass) {
      ctx.fillStyle = flash ? 'rgba(150,120,220,0.95)' : fill;
      ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Dark outline along the belly + pale rim light on the dome.
    ctx.strokeStyle = 'rgba(6,5,18,0.65)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y + 8, 200, 88, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.strokeStyle = 'rgba(216,210,255,0.38)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y - 50, 126, 58, 0, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    // Rotating band arcs sweeping around the mass, clipped to its belly.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y + 10, 196, 86, 0, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 3; i += 1) {
      const r = 158 - i * 34;
      const start = t * (0.55 + i * 0.16) + i * 2.1;
      ctx.strokeStyle = `rgba(172,160,228,${0.34 - i * 0.07})`;
      ctx.lineWidth = 13 - i * 3;
      ctx.beginPath(); ctx.arc(x, y + 10, r, start, start + 1.85); ctx.stroke();
    }
    ctx.restore();
    // The great glowing eye: halo, iris, hot core, spark.
    const pulse = 0.72 + Math.sin(t * 5) * 0.28;
    const eyeGlow = ctx.createRadialGradient(x, y + 16, 4, x, y + 16, 72);
    eyeGlow.addColorStop(0, `rgba(255,96,64,${0.85 * pulse})`); eyeGlow.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = eyeGlow; ctx.beginPath(); ctx.arc(x, y + 16, 72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6a4d'; ctx.beginPath(); ctx.arc(x, y + 16, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(x, y + 16, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6ec'; ctx.beginPath(); ctx.arc(x, y + 16, 4.5, 0, Math.PI * 2); ctx.fill();
    if (flash) {
      ctx.fillStyle = 'rgba(200,160,255,0.30)';
      ctx.beginPath(); ctx.ellipse(x, y + 8, 200, 88, 0, 0, Math.PI * 2); ctx.fill();
    }
    void BOSS;
  }

  function kiteDraw(state) {
    const k = state.kite;
    const s = k.scale || 1; // staged scenes (cover) may pose a larger hero kite
    if (k.invulnerable > 0 && Math.floor(state.elapsed * 14) % 2 === 0 && k.dashT <= 0) { /* blink */ }
    else {
      ctx.save(); ctx.translate(k.x, k.y); ctx.scale(k.facing * s, s);
      ctx.rotate(k.vy * 0.0006);
      // Kite sail: a bright diamond with ribs and a charged rim.
      ctx.fillStyle = '#ffb03a';
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(26, 0); ctx.lineTo(0, 26); ctx.lineTo(-26, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff7847';
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(26, 0); ctx.lineTo(0, 0); ctx.lineTo(-26, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 26); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.stroke();
      // Copper harvest rods at the wingtips.
      ctx.strokeStyle = PALETTE.charge; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-38, -14); ctx.moveTo(26, 0); ctx.lineTo(38, -14); ctx.stroke();
      ctx.fillStyle = '#fff6a8';
      ctx.beginPath(); ctx.arc(-38, -14, 4, 0, Math.PI * 2); ctx.arc(38, -14, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Tail ribbons streaming behind.
      ctx.strokeStyle = 'rgba(255,176,58,0.75)'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 4; i += 1) {
        const tx = k.x - k.facing * (26 + i * 11) * s;
        const ty = k.y + 20 * s + Math.sin(state.elapsed * 9 + i * 1.4) * 6 * s + i * 3 * s;
        if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      // String down toward the town.
      ctx.strokeStyle = 'rgba(230,238,255,0.4)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(k.x, k.y + 24 * s); ctx.lineTo(k.x - 30, FIELD.groundY); ctx.stroke();
    }
    if (k.dashT > 0) {
      ctx.strokeStyle = 'rgba(160,220,255,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(k.x, k.y, (34 + (0.22 - k.dashT) * 60) * s, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /** Harvest drones: little rotor craft holding their orbit around the kite,
   *  each with its own faint catcher ring so their coverage reads at a glance. */
  function dronesDraw(state) {
    for (const d of state.dronePos) {
      ctx.strokeStyle = 'rgba(143,208,255,0.30)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 7]);
      ctx.beginPath(); ctx.arc(d.x, d.y, DRONE.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.save(); ctx.translate(d.x, d.y);
      // Rotor blur arcs spinning with the orbit phase.
      ctx.strokeStyle = 'rgba(200,230,255,0.75)'; ctx.lineWidth = 2;
      const spin = state.elapsed * 26 + d.angle * 3;
      for (const sx of [-13, 13]) {
        ctx.beginPath(); ctx.arc(sx, -7, 7, spin, spin + 2.4); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, -7, 7, spin + Math.PI, spin + Math.PI + 2.4); ctx.stroke();
      }
      // Body: a compact cyan diamond with a charged core.
      ctx.fillStyle = '#57d7ff';
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(11, 0); ctx.lineTo(0, 10); ctx.lineTo(-11, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#eaf7ff';
      ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Tether line back to the kite, so the orbit reads as one machine.
      ctx.strokeStyle = 'rgba(143,208,255,0.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(state.kite.x, state.kite.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
  }

  /** Expanding shockwave rings from harvests, lance hits and storm clears. */
  function ringsDraw(state) {
    for (const r of state.entities.rings) {
      if (!r.active) continue;
      const frac = r.life / r.total;
      const ease = 1 - (1 - frac) * (1 - frac);
      ctx.globalAlpha = (1 - frac) * 0.85;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - frac * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(2, r.maxR * ease), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function particlesAndFloaters(state) {
    for (const p of state.entities.particles) {
      if (!p.active) continue;
      const a = 1 - p.life / p.total;
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const f of state.entities.floaters) {
      if (!f.active) continue;
      const a = 1 - f.life / f.total;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      text(f.text, f.x, f.y, f.size, f.color, 'center', '800');
    }
    ctx.globalAlpha = 1;
  }

  // ---- HUD ---------------------------------------------------------------------
  function hud(state, screen) {
    // Top bar panel. On the boss storm it grows taller so the objective,
    // SUPERCELL INTEGRITY and Storm Lance each get their own row inside it.
    const stripH = state.storm.boss ? 92 : 64;
    ctx.fillStyle = 'rgba(8,12,26,0.72)'; ctx.fillRect(0, 0, FIELD.width, stripH);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, stripH, FIELD.width, 1);
    text(`STORM ${state.stormIndex + 1}/7 — ${state.storm.name}`, 22, 28, 20, PALETTE.text, 'left', '800');
    text(state.endless ? `ENDLESS CYCLE ${state.endlessCycle + 1} · ${state.difficulty.label}` : state.difficulty.label, 22, 52, 14, PALETTE.muted, 'left', '600');
    // Quota / boss centrepiece.
    if (state.storm.boss) {
      // Boss header stack, one element per row, all inside the taller strip:
      // objective (y25) · INTEGRITY label+bar (y55–67) · LANCE label+bar
      // (y74–86). Nothing overlaps the storm title, the timer, or the boss
      // itself (the Supercell is drawn below the strip, eye at boss.y+16).
      text(state.boss.hp === 2 ? '👁 THE EYE IS OPEN — DODGE ITS LASH, FEED ON ITS BOLTS 👁'
        : state.boss.hp === 1 ? '🔥 THE SUPERCELL RAGES — ONE HIT LEFT 🔥'
          : '⚡ HARVEST MEGA-BOLTS → CHARGE THE LANCE → SPACE TO FIRE ⚡', FIELD.width / 2, 25, 16, state.boss.hp < 3 ? '#ff9d5c' : '#c792ff', 'center', '800');
      text(`INTEGRITY ${state.boss.hp}/${state.boss.maxHp}`, 462, 66, 13, '#ffb0b0', 'right', '800');
      bar(470, 55, 340, 12, state.boss.maxHp ? state.boss.hp / state.boss.maxHp : 0, '#ff5d5d');
      text(state.lance >= STRIKE.lanceMax ? 'LANCE READY — SPACE!' : `LANCE ${Math.floor(state.lance)}%`, 462, 85, 13, '#c792ff', 'right', '800');
      bar(470, 74, 340, 12, state.lance / STRIKE.lanceMax, PALETTE.lance);
    } else {
      text(`BATTERY ${state.battery} / ${state.quota}`, FIELD.width / 2, 26, 18, PALETTE.text, 'center', '800');
      bar(FIELD.width / 2 - 170, 34, 340, 14, state.quota ? state.battery / state.quota : 0, PALETTE.battery);
    }
    // Combo chain meter, under the centrepiece: the multiplier you are
    // flying for, and the shrinking bar of time left to feed it.
    if (state.harvestChain >= 2 && screen === SCREEN_PLAY) {
      const mult = chainMultiplier(state.harvestChain);
      const hot = state.harvestChain >= 10;
      text(`⚡ CHAIN ${state.harvestChain} · ×${mult.toFixed(1)} SCORE`, FIELD.width / 2, state.storm.boss ? 108 : 66, 15, hot ? PALETTE.gold : PALETTE.charge, 'center', '800');
      const window = state.upgrades.lattice ? CHAIN.latticeWindow : CHAIN.window;
      bar(FIELD.width / 2 - 90, state.storm.boss ? 112 : 70, 180, 5, state.chainTimer / window, hot ? PALETTE.gold : PALETTE.charge, 'rgba(255,255,255,0.12)');
    }
    // Timer (right-top), hull, score, dash.
    const urgent = state.timeLeft <= 15 && screen === SCREEN_PLAY;
    text(`⏱ ${Math.ceil(state.timeLeft)}s`, FIELD.width - 22, 28, 22, urgent ? PALETTE.danger : PALETTE.text, 'right', '800');
    text(`SCORE ${state.score}`, FIELD.width - 22, 54, 15, PALETTE.gold, 'right', '700');
    // Bottom-left: hull + dash.
    text('HULL', 22, FIELD.height - 44, 14, PALETTE.muted, 'left', '700');
    bar(70, FIELD.height - 58, 190, 15, state.kite.hull / state.kite.maxHull, state.kite.hull / state.kite.maxHull < 0.3 ? PALETTE.hullLow : PALETTE.hull);
    text(`${Math.max(0, Math.ceil(state.kite.hull))}/${state.kite.maxHull}`, 268, FIELD.height - 44, 14, PALETTE.text, 'left', '700');
    text('DASH', 340, FIELD.height - 44, 14, PALETTE.muted, 'left', '700');
    bar(388, FIELD.height - 58, 90, 15, state.kite.dashCd <= 0 ? 1 : 1 - state.kite.dashCd / 1.6, '#8fd0ff');
    // Bottom-right: harvested count + upgrade icons owned.
    text(`⚡ ${state.harvests} harvested`, FIELD.width - 22, FIELD.height - 44, 15, PALETTE.charge, 'right', '700');
    let ux = FIELD.width - 22;
    for (const def of UPGRADES) {
      const rank = state.upgrades[def.id] || 0;
      if (!rank) continue;
      ux -= 30;
      ctx.fillStyle = 'rgba(20,28,52,0.9)'; ctx.fillRect(ux, FIELD.height - 92, 26, 26);
      ctx.strokeStyle = PALETTE.panelEdge; ctx.strokeRect(ux, FIELD.height - 92, 26, 26);
      text(def.icon, ux + 13, FIELD.height - 73, 15, PALETTE.text, 'center');
      if (rank > 1) text(String(rank), ux + 22, FIELD.height - 70, 10, PALETTE.gold, 'center', '800');
    }
    if (state.muted) text('🔇 M', FIELD.width - 22, 84, 14, PALETTE.muted, 'right', '700');
    // Storm banner for the first seconds of each storm. The boss storm
    // skips it: its header stack already announces the Supercell, and a
    // banner on top of the fight would collide with it.
    if (state.bannerT > 0 && screen === SCREEN_PLAY && !state.storm.boss) {
      const a = Math.min(1, state.bannerT);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,12,26,0.66)'; ctx.fillRect(290, 120, 700, 92);
      ctx.strokeStyle = PALETTE.panelEdge; ctx.strokeRect(290, 120, 700, 92);
      text(`STORM ${state.stormIndex + 1} OF 7`, FIELD.width / 2, 152, 17, PALETTE.gold, 'center', '800');
      text(state.storm.name, FIELD.width / 2, 188, 34, PALETTE.text, 'center', '900');
      if (state.storm.tag) text(state.storm.tag, FIELD.width / 2, 206, 14.5, PALETTE.muted, 'center', '600');
      ctx.globalAlpha = 1;
    }
  }

  // ---- Panels / screens ---------------------------------------------------------
  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PALETTE.panelEdge; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  }
  function button(b, accent) {
    const hot = inside(b);
    ctx.fillStyle = hot ? 'rgba(60,52,20,0.96)' : PALETTE.card;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = hot ? PALETTE.cardHover : (accent || PALETTE.cardEdge);
    ctx.lineWidth = hot ? 3 : 2; ctx.strokeRect(b.x, b.y, b.w, b.h);
    text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 7, b.h > 50 ? 19 : 16, hot ? PALETTE.gold : PALETTE.text, 'center', '800');
  }

  function titleScreen(state, best) {
    text('STORMHARVEST', FIELD.width / 2, 168, 84, PALETTE.text, 'center', '900');
    text('Ride the kite. Catch the lightning. Keep the town lit.', FIELD.width / 2, 208, 24, PALETTE.gold, 'center', '600');
    panel(290, 238, 700, 238);
    text('HOW TO PLAY', FIELD.width / 2, 278, 20, PALETTE.battery, 'center', '800');
    const lines = [
      'Lightning is telegraphed: a glowing ring counts down, then the bolt lands.',
      'Be INSIDE the ring at the strike to harvest charge into the town batteries.',
      'Chain harvests without a miss to grow a COMBO multiplier — up to ×2.6 score.',
      'Golden rings pay triple but fall fast. Forked strikes land as twins.',
      'Fill the quota before the storm timer ends — through all SEVEN storms.',
      'Dodge hail, gusts and tornadoes. Between storms, draft 1 of 3 upgrades',
      '— even a Harvest Drone that catches rings for you. Storm 7: THE SUPERCELL.',
      'Harvest its mega-bolts, charge the Storm Lance, SPACE to fire. 3 hits win.',
      'Fly: WASD / arrows or hold mouse · Dash: Shift · Pause: P · Mute: M',
    ];
    lines.forEach((line, i) => text(line, FIELD.width / 2, 306 + i * 19.5, 15, PALETTE.muted, 'center'));
    text(best > 0 ? `Best score: ${best}` : 'Choose your sky:', FIELD.width / 2, 498, 16, PALETTE.muted, 'center', '700');
    for (const b of getButtons(SCREEN_TITLE, state)) button(b, b.id.startsWith('diff') ? PALETTE.battery : PALETTE.lance);
    text('Calm = gentler · Tempest = the real storm · Maelstrom = for maniacs', FIELD.width / 2, 652, 14, PALETTE.dim, 'center');
    text('An original game of wind, wire and lightning — plays fully offline.', FIELD.width / 2, 676, 13, PALETTE.dim, 'center');
  }

  function draftScreen(state) {
    ctx.fillStyle = 'rgba(5,8,18,0.62)'; ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('STORM CLEARED — THE TOWN STILL GLOWS', FIELD.width / 2, 128, 30, PALETTE.hull, 'center', '900');
    text(`Choose 1 upgrade before ${STORMS[Math.min(6, state.stormIndex + 1)].name}  ·  click a card or press 1–3`, FIELD.width / 2, 164, 18, PALETTE.muted, 'center');
    state.draftChoices.forEach((choice, i) => {
      const b = getButtons(SCREEN_DRAFT, state)[i];
      const hot = inside(b);
      ctx.fillStyle = hot ? 'rgba(52,46,22,0.97)' : PALETTE.card;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = hot ? PALETTE.cardHover : PALETTE.cardEdge; ctx.lineWidth = hot ? 3 : 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      text(choice.icon, b.x + b.w / 2, b.y + 74, 52, PALETTE.gold, 'center');
      text(choice.name, b.x + b.w / 2, b.y + 122, 24, PALETTE.text, 'center', '800');
      text(`owned: ${state.upgrades[choice.id] || 0} / ${choice.max}`, b.x + b.w / 2, b.y + 150, 14, PALETTE.muted, 'center', '700');
      // Wrap the description into the card.
      const words = choice.desc.split(' ');
      let line = ''; let ly = b.y + 182;
      for (const word of words) {
        if ((line + ' ' + word).length > 34 && line) { text(line, b.x + b.w / 2, ly, 15.5, PALETTE.muted, 'center'); ly += 22; line = word; }
        else line = line ? line + ' ' + word : word;
      }
      if (line) text(line, b.x + b.w / 2, ly, 15.5, PALETTE.muted, 'center');
      text(`[ ${i + 1} ]`, b.x + b.w / 2, b.y + b.h - 18, 15, PALETTE.gold, 'center', '800');
    });
  }

  /** A letter grade for the run, from score and whether the sky broke. */
  function runGrade(state, victory) {
    if (victory && state.score >= 24000) return 'S — LEGEND OF THE SKY';
    if (victory) return 'A — STORM TAMER';
    if (state.score >= 16000) return 'B — SKY RIDER';
    if (state.score >= 9000) return 'C — KITE HAND';
    if (state.score >= 3500) return 'D — GROUNDED DREAMER';
    return 'E — FIRST FLIGHT';
  }

  function endScreen(state, best, victory) {
    ctx.fillStyle = 'rgba(5,8,18,0.6)'; ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(340, 120, 600, 400);
    text(victory ? '☀ THE SKY BREAKS ☀' : 'THE TOWN GOES DARK', FIELD.width / 2, 192, 38, victory ? PALETTE.gold : PALETTE.danger, 'center', '900');
    if (!victory) text(state.failReason, FIELD.width / 2, 224, 16, PALETTE.muted, 'center');
    text(`RUN GRADE  ${runGrade(state, victory)}`, FIELD.width / 2, victory ? 226 : 250, 17, PALETTE.gold, 'center', '800');
    const rows = [
      ['Final score', String(state.score)],
      ['Best score', String(Math.max(best, state.score))],
      ['Storms cleared', `${state.stats.stormsCleared} / 7`],
      ['Bolts harvested', String(state.harvests)],
      ['Best harvest chain', `×${state.stats.bestChain}`],
      ['Golden strikes caught', String(state.stats.goldCaught)],
      ['Drone catches', String(state.stats.droneCatches)],
      ['Supercell hits', String(state.stats.bossHits)],
      ['Hits taken', String(state.hitsTaken)],
      ['Difficulty', state.difficulty.label + (state.endless ? ' · Endless' : '')],
    ];
    rows.forEach((row, i) => {
      text(row[0], 420, 282 + i * 24, 16, PALETTE.muted, 'left');
      text(row[1], 860, 282 + i * 24, 16, PALETTE.text, 'right', '800');
    });
    for (const b of getButtons(victory ? SCREEN_VICTORY : SCREEN_OVER, state)) button(b);
  }

  function pausedScreen() {
    ctx.fillStyle = 'rgba(5,8,18,0.6)'; ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(390, 220, 500, 310);
    text('PAUSED', FIELD.width / 2, 300, 42, PALETTE.text, 'center', '900');
    text('The storm waits. It is patient. You should not be.', FIELD.width / 2, 340, 15.5, PALETTE.muted, 'center');
    for (const b of getButtons(SCREEN_PAUSED, {})) button(b);
  }

  /** Paint one frame. `best` is the stored best score; `screen` one of SCREEN_*. */
  function draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake ? (seeded(Math.floor(state.elapsed * 60)) - 0.5) * state.shake : 0;
    const shakeY = state.shake ? (seeded(Math.floor(state.elapsed * 60) + 99) - 0.5) * state.shake : 0;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    sky(state);
    clouds(state, 0); clouds(state, 1);
    bossDraw(state);
    seaAndTown(state);
    telegraphs(state);
    hazards(state);
    dronesDraw(state);
    kiteDraw(state);
    bolts(state);
    ringsDraw(state);
    particlesAndFloaters(state);
    clouds(state, 2);
    rainLayer(state);
    if (state.flash > 0) { ctx.fillStyle = `rgba(255,246,200,${state.flash * 0.35})`; ctx.fillRect(0, 0, FIELD.width, FIELD.height); }
    // Low hull: a pulsing red vignette so danger is felt, not just read.
    if (screen === SCREEN_PLAY && state.kite.maxHull && state.kite.hull / state.kite.maxHull < 0.3 && !state.over) {
      const pulse = 0.16 + Math.sin(state.elapsed * 6) * 0.08;
      const vg = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 300, FIELD.width / 2, FIELD.height / 2, 760);
      vg.addColorStop(0, 'rgba(255,40,40,0)'); vg.addColorStop(1, `rgba(255,40,40,${pulse})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (screen === SCREEN_TITLE) { titleScreen(state, best); return; }
    hud(state, screen);
    if (screen === SCREEN_DRAFT) draftScreen(state);
    else if (screen === SCREEN_PAUSED) pausedScreen();
    else if (screen === SCREEN_OVER) endScreen(state, best, false);
    else if (screen === SCREEN_VICTORY) endScreen(state, best, true);
    if (screen === SCREEN_PLAY) text('WASD/arrows or hold mouse to fly · Shift dash · P pause · M mute', FIELD.width / 2, FIELD.height - 12, 12.5, 'rgba(174,186,221,0.66)', 'center');
  }

  return { draw, setHover };
}
