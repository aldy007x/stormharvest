// STORMHARVEST — main.js
// Boot and the one loop: input every frame, the world in fixed 1/60 s steps,
// the renderer painting what is there, and the screen state machine:
//   title → play ⇄ paused, play → draft (on storm clear) → play …,
//   play → over / victory → restart or title.
// Sound is driven entirely from the world's EVENT_* flags here, so world.js
// stays free of any browser or audio knowledge. Clicks are hit-tested
// against the very button rectangles render.js draws.
//
// ?seed=N fixes the storm pattern. ?shot=cover|play|boss|end (with &seed=1)
// stages that deterministic scene instead of running the loop, paints it
// twice and sets window.__shotReady for the screenshot harness.

import { BEST_KEY, SEASON_KEY, STEP, WIN_KEY } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BOSS_HIT, EVENT_COMBO, EVENT_DASH, EVENT_DRAFT, EVENT_DRONE, EVENT_GOLD,
  EVENT_HARVEST, EVENT_HIT, EVENT_LANCE_FIRE, EVENT_LANCE_READY, EVENT_OVER, EVENT_PEAK,
  EVENT_ROAR, EVENT_STORM_CLEAR, EVENT_TELEGRAPH, EVENT_THUNDER, EVENT_VICTORY,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, getButtons, SCREEN_DRAFT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readFlag(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
function writeFlag(key, value) { try { window.localStorage.setItem(key, value); } catch { /* private mode: lasts this visit only */ } }
function readBest() { return Number.parseInt(readFlag(BEST_KEY) ?? '0', 10) || 0; }
function readSeasonBest() { return Number.parseInt(readFlag(SEASON_KEY) ?? '0', 10) || 0; }

function runShot(name) {
  const scene = stageShot(name, world);
  world.state.endlessUnlocked = readFlag(WIN_KEY) === '1';
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let seasonBest = readSeasonBest();
  let wonOnce = readFlag(WIN_KEY) === '1';
  let accumulator = 0;
  let last = performance.now();
  let chosenDifficulty = 'tempest';
  let currentMode = 'campaign';

  function announce(message) { status.textContent = message; }
  function saveBest() {
    if (world.state.season) {
      if (world.state.score > seasonBest) { seasonBest = world.state.score; writeFlag(SEASON_KEY, String(seasonBest)); }
    } else if (world.state.score > best) { best = world.state.score; writeFlag(BEST_KEY, String(best)); }
  }
  function startGame(mode) {
    currentMode = mode;
    world.reset(chosenDifficulty, mode);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock(); audio.setIntensity(0.3);
    if (mode === 'season') { audio.season(); announce('Storm Season. Endless storms, rematch bosses — chase the score.'); }
    else announce(mode === 'endless' ? 'Endless mode. Survive the cycle.' : `Storm 1. Fill the batteries before the timer ends.`);
  }
  function toTitle() { screen = SCREEN_TITLE; currentMode = 'campaign'; world.reset(chosenDifficulty, 'campaign'); announce('Stormharvest. Choose a difficulty to start.'); }

  function handleEvents(events) {
    if (events & EVENT_TELEGRAPH) audio.telegraphHum();
    if (events & EVENT_THUNDER) audio.thunder(false);
    if (events & EVENT_HARVEST) audio.harvest();
    if (events & EVENT_COMBO) audio.combo(world.state.harvestChain);
    if (events & EVENT_GOLD) audio.golden();
    if (events & EVENT_DRONE) audio.droneZap();
    if (events & EVENT_PEAK) audio.peak();
    if (events & EVENT_ROAR) audio.roar();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_LANCE_READY) audio.lanceReady();
    if (events & EVENT_STORM_CLEAR) audio.stormClear();
    if (events & EVENT_BOSS_HIT) audio.bossHit();
    if (events & EVENT_DRAFT && screen === SCREEN_PLAY) {
      screen = SCREEN_DRAFT;
      audio.draft();
      announce(`Storm cleared. Choose one upgrade: ${world.state.draftChoices.map((c) => c.name).join(', ')}.`);
    }
    if (events & EVENT_VICTORY && screen === SCREEN_PLAY) {
      screen = SCREEN_VICTORY; saveBest();
      wonOnce = true; writeFlag(WIN_KEY, '1');
      audio.win();
      announce(`Victory! The Supercell is down. Score ${world.state.score}.`);
    }
    if (events & EVENT_OVER && screen === SCREEN_PLAY) {
      screen = SCREEN_OVER; saveBest();
      audio.lose();
      announce(`Game over. ${world.state.failReason} Score ${world.state.score}.`);
    }
  }

  function pickUpgrade(id) {
    world.applyUpgrade(id);
    audio.click();
    world.nextStorm();
    audio.setIntensity(0.3 + world.state.stormIndex * 0.1);
    screen = SCREEN_PLAY;
    announce(`Upgrade taken. Storm ${world.state.stormIndex + 1}: ${world.state.storm.name}.`);
  }

  function handleClicks() {
    const clicks = input.takeClicks();
    if (!clicks.length) return;
    audio.unlock();
    const buttons = getButtons(screen, world.state);
    for (const click of clicks) {
      for (const b of buttons) {
        if (click.x < b.x || click.x > b.x + b.w || click.y < b.y || click.y > b.y + b.h) continue;
        audio.click();
        if (b.id.startsWith('diff:')) { chosenDifficulty = b.id.slice(5); startGame('campaign'); }
        else if (b.id === 'endless') { if (wonOnce) startGame('endless'); }
        else if (b.id === 'season') startGame('season');
        else if (b.id.startsWith('upgrade:')) pickUpgrade(b.id.slice(8));
        else if (b.id === 'restart') startGame(currentMode);
        else if (b.id === 'title') toTitle();
        else if (b.id === 'resume') screen = SCREEN_PLAY;
        return;
      }
      // Clicking the charged Lance bar area also fires it.
      if (screen === SCREEN_PLAY && world.state.boss.active && world.state.lance >= 100
        && click.x > 470 && click.x < 810 && click.y < 70) {
        if (world.fireLance()) { audio.lanceFire(); handleEvents(EVENT_BOSS_HIT | (world.state.boss.hp <= 0 && !world.state.season ? EVENT_VICTORY : 0)); }
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) { audio.unlock(); const muted = audio.toggleMute(); world.state.muted = muted; announce(muted ? 'Muted.' : 'Sound on.'); }
    if (screen === SCREEN_TITLE) {
      const digit = input.digit();
      if (digit >= 1 && digit <= 3) chosenDifficulty = ['calm', 'tempest', 'maelstrom'][digit - 1];
      if (actions & ACTION_CONFIRM) startGame('campaign');
      return;
    }
    if (screen === SCREEN_DRAFT) {
      const digit = input.digit();
      if (digit >= 1 && digit <= 3 && world.state.draftChoices[digit - 1]) pickUpgrade(world.state.draftChoices[digit - 1].id);
      return;
    }
    if ((screen === SCREEN_OVER || screen === SCREEN_VICTORY) && (actions & (ACTION_RESTART | ACTION_CONFIRM))) { startGame(currentMode); return; }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
      return;
    }
    if (screen === SCREEN_PLAY && (actions & ACTION_CONFIRM) && world.state.boss.active) {
      if (world.fireLance()) { audio.lanceFire(); handleEvents(EVENT_BOSS_HIT | (world.state.boss.hp <= 0 && !world.state.season ? EVENT_VICTORY : 0)); }
    }
  }

  function step() {
    const vector = input.vector();
    const events = world.step(STEP, {
      x: vector.x, y: vector.y,
      dash: input.dashHeld(),
      pointer: { x: input.pointer.x, y: input.pointer.y, down: input.pointer.down },
    }, screen === SCREEN_TITLE);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    renderer.setHover(input.pointer.x, input.pointer.y);
    handleClicks();
    handleActions();
    world.state.endlessUnlocked = wonOnce;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) { step(); accumulator -= STEP; }
    } else accumulator = 0;
    renderer.draw(world.state, screen, world.state.season ? Math.max(seasonBest, world.state.score) : best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
  });

  announce('Stormharvest. Choose Calm, Tempest or Maelstrom to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
