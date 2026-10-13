# Arcwarm: plan

A 2–5 minute aim warm-up you play as a game: a **Quake Live lightning gun duel against a bot**, with
**Halo gravity, air control and shields**, on one custom forest map (**Pinehollow**). The duel *is* the warm-up.
You track while you move and dodge, and the bot's beam punishes predictable movement.

Stack: Three.js 0.186.1 + Vite, plain JavaScript. `Play.bat` / `npm run dev` → http://localhost:5200.

## Decisions (from you)
- Mode: duel only (the bot fights back). No separate scenario mode.
- Feel: Halo gravity + Halo movement (air control without bhop speed gain). The LG and hitbox use QL numbers.
- Map: one custom forest map.
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
| Hit reg | Your beam tests the bot *where you saw it* (interpolated) | Verified: perfect tracking = 100%, one hitbox-width off = 0% |
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

## Pinehollow
A forest bowl (~2000u across, 1000u radius). A mossy central hollow with a fallen log, a rock-plateau treehouse to
the west (stairs + grav lift), a stone shrine on the east knoll (stairs + pad, broken pillars to perch on), ruin walls
to the south with the man cannon, a north ridge with boulders. ~44 trunks inside the ring as cover, and a dense
outer forest. Dirt lanes link the landmarks.

## Results screen
LG accuracy (and your best at that level), damage/min, longest unbroken track, airborne vs grounded accuracy, shield
breaks, the bot's accuracy on you, and **where your near-misses went** (behind / ahead / below / above the target),
with a coaching tip. History is kept per browser.

## Tools
- `npm run check`: mechanics checks (jump/hang per preset, accel, air control, crouch-jump, stairs, launchers ×
  gravity presets, trunk slide, walls, boundary, nav connectivity, hit registration).
- `npm run botsim`: bot accuracy vs scripted dodgers + full bot-vs-bot matches (stuck/idle detection).
- Debug URLs: `?debug=spectate` (bot vs bot from its eyes), `?debug=start` (match without pointer lock), `&len=60`.

## Stages
- [x] S0 Scaffold
- [x] S1 Hands: raw input, QL sens/FOV, 125 Hz movement, Halo gravity/air control, crouch-jump, collision
- [x] S2 Gun: LG hitscan, beam, hitsounds (shield vs health), knockback
- [x] S3 Bot: aim model, duel movement, A* + launchers, retreating, 5 calibrated levels
- [x] S4 Match: shields/health, spawns, countdown, timer, death cam, results + coaching, history
- [x] S5 Map + art: Pinehollow, procedural textures, shadows, ground cover, light shafts, brightskin model, viewmodel
- [ ] Next ideas: a playtest pass on feel numbers, an optional enemy shield bar, a second bot personality (aggressive rusher),
      a pickup or two (overshield), an Electron build for raw-input-without-browser, recorded replays of your worst misses
