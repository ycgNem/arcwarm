# Arcwarm: plan

A 2–5 minute aim warm-up you play as a game: a **Quake Live lightning gun duel against a bot**, with
**Halo gravity, air control and shields**, on a custom forest map (**Pinehollow**) or a plain **White Room**. The duel *is* the warm-up.
You track while you move and dodge, and the bot's beam punishes predictable movement.

Stack: Three.js 0.186.1 + Vite, plain JavaScript. `Play.bat` / `npm run dev` → http://localhost:5200.
Live: https://ycgnem.github.io/arcwarm/ (GitHub Pages, redeploys on every push to `main`).

## Decisions (from you)
- Mode: duel only (the bot fights back). No separate scenario mode.
- Feel: Halo gravity + Halo movement (air control without bhop speed gain). The LG and hitbox use QL numbers.
- Maps: one custom forest map, plus a basic white room with ramps.
- Lifesteal (default Full): hits heal the shooter, so a fight is decided by who misses more.
- Bot look: QL-style brightskin (colour selectable).

## Mechanics, as built (all numbers live in `src/data/`)
| Thing | Value | Notes |
|---|---|---|
| Tick | 125 Hz fixed, interpolated render | Mouse look applies instantly, not per tick |
| Gravity / jump | 400 u/s², 270 u/s | 91u apex, 1.35 s air (QL: 46u, 0.68 s). Presets: Halo / Quake / Moon |
| Run | 300 u/s, 0.12 s to 90%, 0.18 s ADAD reversal | Quake accel/friction, tuned snappy |
| Air | Steer freely, can't exceed max(entry speed, run speed) | No bunny-hop gain. Holding jump auto-hops |
| Crouch | 40u hull; mid-air crouch tucks feet 16u | Halo crouch-jump: the eye doesn't move |
| Hull / hitbox | 30×30×56 (QL) | Trees collide as circles so you glance off trunks |
| LG | 50 ms, 6 dmg, 768u, small knockback | 120 dps. Kill = 34 hits (1.65 s at 100%, ~4 s at 40%) |
| Vitals | 100 shield + 100 health | Shields recharge after 4 s untouched (70/s), then health regens |
| Lifesteal | Off / Half / Full (default Full) | Each hit heals the shooter by that share of the damage: health first, then shields |
| Ramps | Axis-aligned wedges | You ride the slope (rests on the highest touching edge, like a Quake box hull). The sides are walls; the beam hits the slope |
| Hit reg | Your beam leaves the exact camera position you saw and tests the bot box *as drawn on that frame* | Verified through the real frame loop at 60/144/240/jittery fps, standing or strafing+jumping: perfect aim = 100%, 0.8× half-width off = 100%, outside the box = 0% |
| Accuracy stat | hits ÷ cells fired (QL semantics), exactly 20 shots per second held | Shots at a dead/out-of-range/occluded target count as misses, as in QL |
| Sensitivity | raw counts × sens × m_yaw, applied the instant the mouse report arrives (`pointerrawupdate`) | Bogus first report after pointer lock and impossible spikes are dropped. **F2 in a match** = 360° test: degrees, counts vs predicted, raw on/off, mouse Hz |
| Launchers | Grav lift → treehouse, pad → shrine, man cannon south → north | Velocity solved at launch, so they land on target under any gravity |

## The bot
Same movement code and gun as you. Aim = perception delay + velocity extrapolation + smoothed crosshair + hand wobble,
so its accuracy comes from your movement, not dice. Movement: duel strafe rhythm (fakes, jumps, crouches, range
keeping, more erratic under fire), A* hunting on a 2.5D nav grid that knows the launchers, and retreating to recharge
shields at higher levels.

Calibrated accuracy (`npm run botsim`, 60 s per pattern at ~420u):

| Level | Still | Slow strafe | Human ADAD | ADAD + jumps |
|---|---|---|---|---|
| Easy | 90% | 49% | 2% | 18% |
| Normal | 97% | 67% | 19% | 33% |
| Hard | 100% | 70% | 32% | 44% |
| Pro | 100% | 78% | 42% | 63% |
| Nightmare | 100% | 84% | 50% | 76% |

Jumping in its sight is punished (it predicts arcs). That's on purpose: it teaches Halo-gravity movement.

Lifesteal changes match flow (bot vs bot, 3:00): equal levels trade only 3–5 frags (long fights won on misses),
an accuracy gap is decisive (Hard vs Nightmare 0–13 with Full lifesteal, 17–23 without), and time spent tracking
rises from ~55% to ~75%.

## Pinehollow
A forest bowl (~2000u across, 1000u radius). A mossy central hollow with a fallen log, a rock-plateau treehouse to
the west (stairs + grav lift), a stone shrine on the east knoll (stairs + pad, broken pillars to perch on), ruin walls
to the south with the man cannon, a north ridge with boulders. ~44 trunks inside the ring as cover, and a dense
outer forest. Dirt lanes link the landmarks.

Art (late autumn, golden hour): deep blue-green pines as the backdrop, with gold birches and orange maples (maples are
drawn from half the layout's birches; same trunk collider). The palette keeps lime out of the scene so the brightskin bot
pops. Canopies have a vertex gradient and sway in the vertex shader. Leaf-litter decals, pebbles and mushrooms are
instanced, one draw call each, and all under step height. Falling leaves and dust motes animate entirely on the GPU.
The clouds are one merged mesh. Visual-only scatter uses its own seeded RNG, so the layout (colliders) is untouched.

## White Room
A 1800×1800 grid-textured room with 440-tall walls. North/south platforms (116 high) and east/west wall ledges (72)
each have an orange ramp. Platforms are out of reach for a plain jump (91 + 18 ledge step = 109) but a crouch-jump makes
it (107 + 18 = 125). There are four tall pillars for cover and a low block in the middle. Bots use the ramps.

Adding a map: write a pure layout in `src/world/<name>Layout.js` (terrain, boxes, ramps, cylinders, pads, spawns),
register it in `src/world/maps.js`, add a visuals class with the `ForestVisuals` interface (`tex.glow`, `sun`, `update`)
to `VISUALS` in `game/Game.js`, then add checks to `tools/mechcheck.mjs`.

## Results screen
LG accuracy (and your best at that level), damage/min, longest unbroken track, airborne vs grounded accuracy, shield
breaks, the bot's accuracy on you, and **where your near-misses went** (behind / ahead / below / above the target),
with a coaching tip. History is kept per browser.

## Performance (measured at 2560×1440, RTX 5070, frames forced to GPU completion)
- Steady state: ~0.8 ms/frame p50, 1.4 ms p99, ~0.2 ms CPU. 42 s of live fighting at 144 fps had **no frame over 4 ms**
  (before: a 124 ms spike at match start, 13.5 ms on first fire, 6.6 ms on first shield flash).
- How to measure (the hitch scan): in the preview, `?debug=start&len=0`, then in the console loop `arcwarm.frame(1/144)` followed by
  `gl.readPixels(0,0,1,1,…)` (forces GPU completion) and time each iteration at 2560×1440. Also check that `renderer.info.programs.length` and
  `info.memory.textures` don't change during play (nothing compiles or uploads mid-match). If the machine is busy, compare old vs new
  visuals interleaved in the same session instead of trusting absolute numbers.
- Autumn pass (S9), old vs new forest interleaved on a loaded machine: p50 equal or lower (8.0 vs 8.4 ms), 40 vs 41 draw calls, +13k triangles.
- How: every shader is compiled at map load (`Game.warmup` renders a frame with all effects on); the sun shadow map is
  baked once per map (`shadowMap.autoUpdate = false`, the bot uses a blob shadow); static geometry is merged per material
  (9 draw calls for the forest); no point lights; the render loop allocates nothing; the HUD only writes to the DOM when a
  value changes; bot sounds share one positional panner.
- The browser caps frames at your monitor's refresh rate (rAF). The sim is a fixed 125 Hz, so feel doesn't depend on fps.

## Tools
- `npm run check`: mechanics checks (jump/hang per preset, accel, air control, crouch-jump, stairs, launchers ×
  gravity presets, trunk slide, walls, boundary, nav connectivity, hit registration (incl. through the frame loop at
  several frame rates), sens/FOV maths, ramps up/down/sides/beam, crouch-jump-only platforms, lifesteal maths).
- `npm run botsim`: bot accuracy vs scripted dodgers + full bot-vs-bot matches on both maps, with and without
  lifesteal (stuck/idle detection).
- `npm run shots -- <label> [map]`: Playwright (installed Chrome, software GL) captures the menu plus fixed staged views into
  `critique/shots/<label>/` (gitignored) via `arcwarm.stage()`. Use it for before/after art comparisons; critiques live in `critique/*.md`.
- Debug URLs: `?debug=spectate` (bot vs bot from its eyes), `?debug=start` (match without pointer lock), `&len=60`,
  `&map=whiteroom`.

## Stages
- [x] S0 Scaffold
- [x] S1 Hands: raw input, QL sens/FOV, 125 Hz movement, Halo gravity/air control, crouch-jump, collision
- [x] S2 Gun: LG hitscan, beam, hitsounds (shield vs health), knockback
- [x] S3 Bot: aim model, duel movement, A* + launchers, retreating, 5 calibrated levels
- [x] S4 Match: shields/health, spawns, countdown, timer, death cam, results + coaching, history
- [x] S5 Map + art: Pinehollow, procedural textures, shadows, ground cover, light shafts, brightskin model, viewmodel
- [x] S6 Live: GitHub repo + Pages deploy
- [x] S7 Lifesteal (menu option), ramps in the engine, White Room map, map select, heal glow, history per map
- [x] S8 Exact hitreg from the rendered camera, raw per-report mouse input + F2 sens test, hitch-free rendering
- [x] S9 Autumn forest art pass (critic round A: `critique/critic_art_A.md`), screenshot tool, first-frame negative-dt fix
- [ ] S10 Depth (proposals in `critique/critic_depth_A.md`, core untouched): warm-up stats → ladder rating → bot styles

## Where things stand (handoff)
- Everything above is built and committed. `npm run check` passes; `npm run botsim` matches the calibration table.
- **Not yet verified by a human:** whether Full lifesteal feels good vs a bot (fights run long by design), raw mouse feel / sens matching in a real pointer-locked session, Esc→pause→resume,
  procedural sounds, and performance at high resolution/refresh. First job next session: playtest and collect feel notes.
- Likely tuning knobs after playtest: `src/data/physics.js` (gravity, jump, airAccel, runSpeed), `src/data/weapons.js`
  (LG damage/knockback), `src/data/match.js` (shield delay/rate), `src/data/bots.js` (per-level reaction/lead/jitter).
- Known rough edges: the god-ray planes and dust motes are cosmetic and cheap; the menu camera orbits the hollow;
  bot nav is one height per cell, so it avoids standing on cliff-edge cells (by design).

- [ ] Next ideas: a playtest pass on feel numbers, an optional enemy shield bar, a second bot personality (aggressive rusher),
      a pickup or two (overshield), an Electron build for raw-input-without-browser, recorded replays of your worst misses
