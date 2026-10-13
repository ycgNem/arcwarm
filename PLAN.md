# Arcwarm: plan

A 3-to-5 minute aim warm-up you play as a game: a Quake Live style lightning gun duel against a bot,
with Halo-style low gravity so every fight turns into long, floaty jump arcs you have to track.
It sits between KovaaK's and a real match. You warm up your tracking, but there's an opponent, a
score, and a reason to want "one more".

Stack: Three.js 0.186.1 + Vite, plain JavaScript (same as verdant-relay). Runs in the browser via
`Play.bat` / `npm run dev` on port 5200.

---

## 1. Core loop

1. Launch → main menu → pick **Warm-up** or **Duel** → pick bot level → spawn.
2. You and the bot both have only the LG. Low gravity, jump pads, small arena.
3. Round ends (timer or frag limit) → results screen with tracking stats → "Again" is one key (R).

### Modes
| Mode | What happens | Why |
|---|---|---|
| **Warm-up** (core) | 90 s. The bot dodges hard but never shoots. Score = damage dealt, with a combo multiplier for unbroken tracking. | This is the 2-minute "hop on" mode. Pure tracking, with no dying and no downtime. |
| **Duel** | First to 10 frags or 3 min. The bot shoots back with a tunable human-like aim (reaction delay, overshoot, tracking lag). 100 HP / 100 armor, instant respawn. | You track while moving and dodging, which is what a real QL duel feels like. |
| *(later)* **Gauntlet** | Bot gets harder every frag until you lose. | A high-score chase. |

---

## 2. Feel targets (the part that has to be right)

Anyone warming up for QL needs the game to *feel like QL in the hand*. Copy QL numbers wherever we can:

- **Sensitivity matching**: enter your QL `sensitivity` and the game uses `m_yaw 0.022` deg/count. It reads raw
  mouse counts through Pointer Lock with `unadjustedMovement: true` (raw input, no Windows accel). It also
  shows cm/360 if you enter DPI.
- **FOV matching**: enter your QL `cg_fov` (4:3 horizontal, Hor+). It's converted to Three's vertical FOV:
  `vfov = 2·atan(tan(hfov/2) · 3/4)`.
- **LG**: hitscan beam, 50 ms fire interval (20 ticks/s), 6 dmg per tick (QL value, tunable), 768-unit range,
  small knockback. The QL **hitsound** pitch rises with damage. Hits show a beam impact flash, and damage
  numbers are optional.
- **Hitbox**: QL player box 30×30×56 units (crouch 40), shown as a bright "brightskin" model (green/lime, QL style).
- **Physics**: fixed 125 Hz tick (QL `com_maxfps 125` heritage) with render interpolation, so the result
  doesn't change with frame rate. Quake units throughout (1 unit ≈ 1 inch).
- **Gravity, the Halo part**: QL is 800 u/s² with jump 270 (≈0.68 s hang). Arcwarm starts at **~400 u/s² with
  jump ~300 (≈1.5 s hang)**. It's a slider in settings, with presets: *Quake 800* / *Halo 400* / *Moon 250*.
- **Movement**: Quake-style ground accel/friction and air strafing, with no bunny-hop speed cap (or a toggle).
  Jump pads and gravity lifts (Halo) launch both of you into big arcs.

---

## 3. The bot (what makes it a game and not a scenario)

The bot's movement *is* the content. Its behavior is a weighted mix of real duel dodge patterns, plus a
reaction-time model so the changes aren't perfectly random:

- **ADAD strafes** with variable rhythm (short-short-long), and the same with crouch.
- **Jump arcs**: strafe-jumps, jump-and-reverse mid-air (air control in low grav = nasty), jump-pad launches.
- **Juke on damage**: when it's being tracked successfully, it panics and changes direction more (like a human).
- **Range play**: it tries to hold its preferred LG range and backs off or pushes.
- **Navigation**: a hand-placed waypoint graph per map (small arenas don't need a navmesh).

**Levels** (Easy → Nightmare) change move speed, how often it changes direction, how unpredictable its
air control is, and in Duel its aim (reaction ms, tracking lag, accuracy cap).

---

## 4. Stats (the warm-up value)

The results screen and session history (localStorage) show:
- LG accuracy %, damage, DPS, and frags
- **Longest track streak** (seconds on target without a break)
- **Miss direction breakdown**: did you miss mostly *ahead*, *behind*, *above* or *below* the target? This tells
  you whether you over-track, under-track, or lose vertical arcs. It's the most useful number here.
- Accuracy on **airborne vs grounded** targets (low grav makes this the interesting split)
- Trend chart of your last N sessions per mode/level

---

## 5. Arena

The MVP is one compact custom duel arena in greybox, then lit and textured: a central pit, two raised
platforms, pillars to break line of sight, two jump pads and one gravity lift. It's sized so you're always within
LG range. It's built from boxes, so collision is simple AABB sweeps (no physics engine).

Later, there's an optional remake of a classic duel layout (Aerowalk or Blood Run style) and a Halo map
nod (Lockout / Guardian feel) re-tuned for low grav.

**Assets**: procedural / Web Audio + generated textures by default. If you want the real thing,
OpenArena's LG sounds and models are GPL and drop-in. If you own Quake Live, you can extract its sounds
from your own install for personal use (see the direction questions).

---

## 6. Folder map (planned)

```
arcwarm/
  index.html, vite.config.js, package.json, Play.bat
  PLAN.md, CLAUDE.md
  public/            sounds, textures (when added)
  src/
    main.js          boot, renderer, main loop (fixed 125 Hz tick + interpolated render)
    data/            ALL tuning: weapons.js, physics.js, bots.js, modes.js
    core/            Input (pointer lock, raw), Settings (sens/FOV/keys), Stats, Session history
    game/            Player movement (pm_move port), Weapon (LG), Bot brain, Match/Mode logic
    world/           Arena builder, collision (AABB), jump pads, waypoints
    fx/              beam, hit flash, hitsound, crosshair
    ui/              menus, HUD, results screen, settings
```

---

## 7. Stages

- [x] **S0 Scaffold**: folder, Vite + Three, Play.bat, placeholder scene
- [ ] **S1 Hands**: pointer lock raw input, QL sens/FOV matching, Quake movement at 125 Hz, low-grav jump, greybox arena + collision
- [ ] **S2 Gun**: LG beam, hitscan vs hitbox, hitsound, crosshair, ammo/accuracy counters
- [ ] **S3 Bot moves**: waypoint nav, dodge-pattern brain, jump pads/lift, levels → **Warm-up mode playable**
- [ ] **S4 Results**: stats (miss direction, airborne split, streaks), results screen, session history
- [ ] **S5 Duel**: bot aim model, HP/armor, respawns, frag limit/timer
- [ ] **S6 Polish**: real sounds, arena art pass, settings menu (keybinds, colors, crosshair), menus
- [ ] **S7 Extras**: Gauntlet mode, second map, trend charts, optional Electron desktop build

S1–S3 is the first thing you'd actually warm up on.

---

## 8. Open direction questions (answer before S1)

1. **Mode focus**: Warm-up first (bot never shoots) and Duel second? *(recommended)*
2. **Your movement**: full Quake air-strafe/bhop, or calmer Halo-style movement (fixed air speed, floaty)?
   *(recommended: Quake movement, Halo gravity)*
3. **Gravity default**: Halo 400 / Moon 250 / something else?
4. **Arena**: custom compact arena first *(recommended)*, or a classic map remake right away?
5. **Sounds/models**: procedural, OpenArena (GPL), or extract from your own Quake Live install?
6. **Bot look**: QL-style brightskin humanoid, or abstract (a glowing capsule/drone)?
