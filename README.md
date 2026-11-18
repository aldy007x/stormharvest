[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/aldy007x/stormharvest/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/aldy007x/stormharvest/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

# STORMHARVEST

**Ride the lightning. Keep the town lit.**

You pilot a storm-kite harvester over a coastal town through **seven named storms**.
Lightning strikes are telegraphed — a glowing ring shrinks, a hum rises — and the bolt
lands whether you are ready or not. Be inside the ring at the strike to harvest the
charge into the town's three battery towers. Fill the quota before the storm timer
runs out, or the town goes dark.

## The storms

1. **First Rumbles** — learn the sky
2. **Squall Line** — gusts start shoving
3. **Hailvein** — hail joins the rain
4. **The Howling Front** — mini-boss: fast bolts, hard wind
5. **Twin Cyclones** — two tornadoes at once
6. **The Drowning Sky** — everything, faster
7. **The Supercell** — a living cloud with a glowing eye. Harvest its mega-bolts to
   charge the **Storm Lance**; at 100%, fire it. Three hits bring the Supercell down.

## Systems

- **Harvest loop** — telegraphed strikes, catcher radius, scorch-ring sting, charge quota per storm
- **Hazards** — hail (impact), wind gusts (shove), tornadoes (damage + pull), boss mega-bolt barrages
- **Upgrade draft** — after every cleared storm, pick 1 of 3 from 14 upgrades
  (Wide Catcher, Reinforced Hull, Storm Magnet, Quickloader Dash, Deep Batteries,
  Borrowed Minutes, Twin Rods, Racing Sails, Hail Plating, Lance Capacitor,
  Field Repairs, Surge Scoring, Wind Ballast, Second Kite)
- **Difficulties** — Calm / Tempest / Maelstrom, plus an **Endless** mode unlocked by victory
- **Feel** — dash with i-frames, screen shake, strike flash, particles, parallax storm
  clouds, animated sea, a town that lights up as its batteries fill, fully synthesized
  WebAudio sound (wind, rain, thunder, harvest zaps, stingers) — no audio files

## Controls

- **WASD / arrows** — fly · **Shift** — dash · **Space** — fire the Storm Lance (boss)
- **Mouse** — click menus and draft cards; hold to mouse-steer the kite
- **P / Esc** — pause · **M** — mute · **R** — restart

## Run it

Static files, no build step, no network requests. Serve the folder and open it:

```
node serve.ts        # http://localhost:8080
```

or open `game/index.html` through any static server in a desktop browser.

Deterministic screenshot scenes (used for `screenshots/`):
`?shot=cover|play|boss|end&seed=1`

## Hand-in (make.fun)

`node main.ts` copies `game/` and `screenshots/` to `/output` (or
`MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the vendored
`vendor/makefun-game.ts` library, unchanged from the bounty kit.

MIT licensed — see `LICENSE`.
