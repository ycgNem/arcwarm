# Arcwarm: depth critique (A)

Scope: depth on top of the core. Movement, gravity, LG numbers, hitreg, sens/FOV, shields and lifesteal are treated as fixed.
Evidence comes from reading the source and from `npm run botsim` plus a 10-seed scratch run of bot-vs-bot matches (3:00, Pinehollow,
Full lifesteal) that logged score, accuracy and the engagement range at every shot.

## 1. Diagnosis

**Minute 1.** One click on PLAY gives Hard, Pinehollow, 3:00, Full lifesteal. `Sim.spawn` puts you far from the bot and out of its
sight, so the first 10–20 s is A* hide-and-seek. Then the fight starts, and it is good: the aim model in `BotBrain.aim` is honest,
and the beam feels right. Leave this alone.

**Minute 3.** It's the same fight again, at the same range. In my seeded runs **78–90% of all firing happened between 300 and 550u**,
because every level's `rangeGoal` sits at 340–460 ±90 (`BotBrain.newStrafe`). Close range (<300u) got 2–11% of shots. With
Full lifesteal at equal skill, a frag takes about 40 s (hard v hard: 3–4, 4–4, 5–3, 2–3…), so the scoreboard barely moves. Nothing on
either map gives you a reason to be anywhere except "near the bot". The treehouse, shrine and launchers are scenery and transport, not
decisions. The bot's only strategic choice, `mode = 'retreat'`, is the wrong one under lifesteal, because fighting heals you faster than
hiding does.

**Session 5.** You know your level. The step between bot levels is about 11 points of accuracy (pro bot 63% vs hard bot 52% in the
same match), and Full lifesteal turns any gap into a blowout: **pro v hard went 12–0, 12–0, 11–0, 8–0…; normal v hard went 0–9 … 0–17
in 10 of 10 seeds**. The competitive band is about ±3 accuracy points wide, and the five fixed levels are 11 points apart. So a player
either stomps a level or gets stomped by it, and the "VICTORY/DEFEAT" header is meaningless both ways. The results screen gives the same
eight numbers each time. `coachingTip` picks from four canned strings. The "best" shown is filtered only by difficulty and map
(`Menus.showResults`), so it mixes Quake-gravity and Halo-gravity matches and counts a 15 s match you ended early. History is a
40-row table with no trend. There is no goal, no ladder, nothing to unlock in your own play, and no answer to the one question a
warm-up should answer: **am I warm yet?**

The game is flat because **the outcome is binary, the range is fixed, and there is one bot behaviour, no map decision, and no trend line**. The core
is fine. Everything around it is a single default setting played on repeat.

## 2. Ranked proposals

### P1. Continuous ladder rating (the opponent finds your level). Size M

**What.** Add an Opponent option, "Ladder" (made the default), backed by a rating R from 0.0 to 4.0, where the integers are Easy…Nightmare. The bot's
params are interpolated per numeric field between `BOT_LEVELS[floor(R)]` and `[ceil(R)]`. After each match:
`R += clamp(0.5 · gap / 11, −0.5, +0.5)`, where `gap = yourAcc − botAcc` in points (11 ≈ one level, measured above). With
lifesteal Off, which is softer (17–23 at hard v nightmare), use the same formula with half the step. Keep one R per `gravity × lifesteal`
key, and share it across maps. The results screen shows `Ladder 2.4 → 2.7 (Hard+)`. Rematch picks up the new R automatically.

**Why it's depth for this game.** Lifesteal's cliff is the reason fixed levels fail. Under Full lifesteal the accuracy gap *is* the duel
("whoever misses more loses"), so it's the right ladder metric, and it's far less noisy than frags (hard v hard frag
diffs swung −6 to +2 while the accuracy gap stayed within ±7). Every match lands near the coin-flip band, which is where a warm-up does its work.
The ladder only moves between matches, so it never rubber-bands inside one.

**Interactions.** Halo gravity: `gravAware` interpolates too, so arc-prediction skill rises smoothly instead of jumping 0.35 → 0.6.
The bot's accuracy depends on your movement, so the gap measures aim plus dodging, which is what the duel is.

**Files.** `src/data/bots.js` (`LADDER = { step: 0.5, levelGap: 11, min: 0, max: 4, lsOffScale: 0.5 }`), new pure
`src/game/Ladder.js` (`levelAt(R)`, `update(R, result)`), `BotBrain` constructor takes a params object instead of the key
(`this.L = typeof level === 'string' ? BOT_LEVELS[level] : level`), `Sim` (bot name "Ladder 2.7"), `Settings.js` (`ladder: {}`),
`Menus.js` (Opponent segment, results line), `Game.endMatch`.

**Risk.** None to feel or frame time. It's a menu and data change, and the sim-side cost is zero.

**Verify.** `mechcheck`: `levelAt(2.0)` deep-equals `BOT_LEVELS.hard`, and every field is monotone in R. `botsim` adds a
**convergence section**: a spectate-bot "player" at Pro, starting from R=1, plays 8 × 2:00 ladder matches. Pass if R ends in 3.0 ± 0.3. The same
check from R=4 with a Normal player must end at 1.0 ± 0.3.

### P2. Stats that answer "am I warm?" Size S

**What.** Three additions to `makeStats` / `Sim.fireLG`, all with thresholds in a new `STATS` block in `src/data/match.js`:
- **Accuracy by range band**: <300 / 300–550 / 550–768u, using the shot's distance (`ox..tp`, which is already computed).
- **Accuracy per 30 s bucket**: arrays, so the results screen draws a 6-bar "warm-up curve" for 3:00.
- **Net damage** (`dmg − taken`) as a live HUD line under Full lifesteal. Write it through `Hud.set`, only when the integer changes. This is
  the real score of a lifesteal fight, and it moves every second while the frag count sits at 1–1.

**Cross-session readiness.** On the results screen, compare this match's last bucket with the median of your last 10 eligible matches at the same
key: "Warm: 41% vs your usual 39%". Fix the PB: key it on `map × gravity × lifesteal × level`, and only count matches of 60 s or more (a
15 s "End match" can currently set your best). Raise the history cap from 40 to about 200 (each entry is under 1 KB) and add a sparkline of
the last 20 accuracies to `showHistory`.

**Why.** It turns the results screen from a report into a goal ("beat my usual by the third bucket"), and the range bands expose
the 300–550 monoculture to the player. Coaching gets real inputs: "you're 48% mid but 22% close".

**Files.** `Sim.js` (`makeStats`, `fireLG`), `src/data/match.js`, `Game.endMatch`, `Menus.js` (`showResults`, `showHistory`,
`coachingTip`), `Hud.js`.

**Risk.** The HUD line must go through `Hud.set` (no per-frame DOM writes). In Sim it's two array increments per shot, which costs nothing.

**Verify.** `mechcheck`: the scripted 100%-aim test hits 100% in every band it visits, and the bucket sums equal `shots/hits`. `botsim`: print the
range-band shot share per matchup (this is the column that P3 must move).

### P3. Bot styles: range and rhythm archetypes, wired to coaching. Size M

**What.** Add a `BOT_STYLES` modifier table in `bots.js`, merged over the level params (or over the P1-interpolated ones). These change movement only and leave aim alone:

| Style | Changes | Trains |
|---|---|---|
| Duelist (default) | today's bot | mid-range LG |
| Rusher | `rangeGoal 200`, `jumpChance ×2`, `airReverse +0.2`, `retreat 0` | close-range, high angular speed, vertical arcs |
| Kiter | `rangeGoal 640`, `retreat ×1.5`, `switchMax ×1.2` | long-range micro-tracking, chasing to stay in 768u |
| Strafer | `jumpChance 0`, `fakeChance +0.15`, `switchMin ×0.8` | pure ground ADAD, the most QL-transferable pattern |
| Floater | `jumpChance 0.5`, `crouchChance +0.1` (crouch-jumps), `airReverse 0.9` | Halo arcs: "above/below" misses |

**Close the loop.** `coachingTip` already knows your dominant miss. Add a one-click button on the results screen: "Most misses below → Rematch vs
Floater". With P2's range bands it can say "22% close → Rematch vs Rusher". This is how training depth gets used without a
drill mode.

**Calibration gotcha (important).** `aim()` jitter and the lead error are in **world units**, so the bot's accuracy barely changes with range,
while yours falls off angularly. A Kiter at 640u would be unfairly sharp, and a Rusher at 200u unfairly sloppy. Add
`jitterRef: 420` and scale jitter by `dist/420` inside `aim()`. That leaves the 420u calibration table unchanged.

**Interactions.** Lifesteal: a Rusher with `retreat 0` suits Full lifesteal, and a Kiter that retreats works best with lifesteal Off.
Pinehollow trunks break up the Kiter's lanes, and the White Room favours it, which gives the two maps distinct personalities.

**Files.** `bots.js`, `BotBrain.newStrafe/aim/constructor`, `Sim` (name "Hard Rusher"), `Menus.js`, `Settings.js`.

**Risk.** It doesn't touch the feel of the core, but it does affect bot calibration. Mitigate with the botsim checks below.

**Verify.** `dodgeTest(level, pattern, dist)` already takes a distance. Add 250 and 650 columns and require bot accuracy within ±5 points of the 420
column after the range-scaling fix. Bot-vs-bot per style: the range-band share must actually move (target: Rusher >50% of shots
<300u, Kiter >40% >550u), with `stuck` ≤ 2 and longest idle < 2 s.

### P4. One timed item: the Overshield. Size L

**What.** This is QL duel's real depth (item control and timing), reduced to a single item. Overshield: +100 shield above the cap (to 200),
decaying 2/s back to 100, respawning 35 s after pickup (QL mega rhythm). One per map: **Pinehollow on the treehouse deck**
(grav lift or stairs, so taking it means a readable route), and **White Room on the centre block** (44u, open on all sides,
fully contested). Show no timer on the HUD (timing it is the skill). The Tab scoreboard shows "OS taken 3 / 2", and the results screen shows
"OS control".

**Why.** It's the only proposal that adds a *decision inside the match*. Lifesteal makes equal-skill fights long tug-of-wars, and a
100-point buffer (17 LG hits) is exactly the edge that decides one. So "do I disengage now to be on the deck at :35?" becomes a
real question, and taking the item while the bot holds the deck becomes the fight. Halo gravity helps: the lift arc to the
deck is long and readable, so contesting an item pickup in the air is an LG duel in miniature.

**Interactions / gotchas.** `Sim.heal()` computes `VITALS.shield − f.shield`, which goes **negative above the cap**, so lifesteal would
*drain* the overshield. That has to be clamped. Recharge (`f.shield < VITALS.shield`) is already safe. `Hud.js` scales the bar by
`sh / VITALS.shield`, so it needs a second segment. Bot: add a per-level `itemSense` (0, 0.3, 0.6, 0.85, 1). In `think()`, enter
`mode = 'item'` when `respawnIn < pathLength/300 + 1.5`, and path with the existing `followPath` (the nav already knows the lift).

**Files.** Layouts (`items: [{kind:'os', x, z}]`), `World.js` (pickup volume), `Sim.js` (spawn/pickup/decay events), `src/data/match.js`
(`ITEMS.os = {amount:100, cap:200, decay:2, respawn:35}`), `BotBrain.js`, `Hud.js`, `Menus.js` (match option "Items: Off/OS",
**default Off until playtested**), visuals (one low-poly icosahedron plus the existing `tex.glow` sprite, `castShadow=false` so the baked
shadow map is untouched, compiled in `Game.warmup`), and `Audio.js` (procedural pickup sound).

**Risk.** It takes time away from tracking, and a warm-up must not become a timing game. Gate it with botsim.

**Verify.** botsim lifesteal rows get `OS A/B` and `frags while OS'd`. Engaged time must stay ≥70% (it's 70–85% today), and a Hard
bot with `itemSense` must take more than 60% of the OS against a Hard bot without it. `mechcheck`: lifesteal never lowers shield above the cap, decay
stops at 100, and the bot reaches both item spots on both maps under all three gravity presets.

### P5. "Lost tracks": replay your three worst breaks. Size M

**What.** Record every tick into a preallocated ring buffer (`Float32Array`, 125 Hz × 300 s × 12 floats ≈ 1.8 MB, allocated in
`startMatch`, never in the loop). It holds the player's position, eye, yaw and pitch, and the bot's xyz and height. In `fireLG`, flag a **track break**: a miss
right after ≥10 consecutive hits (0.5 s), with the target in sight and not blocked, tagged with `classifyMiss`'s direction. The results screen gets a "Watch
worst 3 (≈6 s)" button. Each clip replays 1 s either side at 0.5× speed from your eye, with the hitbox outline (`showHitbox` already exists)
and your beam drawn.

**Why.** Near-miss percentages are abstract. Seeing your crosshair slide off the bot's back at the apex of a jump teaches more. It's
QL-relevant too: the breaks are reversal reactions, which transfer directly.

**Files.** New `src/game/Recorder.js` (pure), `Sim.fireLG` (break events), `Game.js` (`renderReplay` reusing the scene, `BotModel`
and `Beam`), and `Menus.js`.

**Risk.** It's optional and runs post-match, so it can't hurt the duel. The recording is per tick, while mouse look is per frame, so a
replay can show up to 8 ms of aim drift compared with what was rendered. Label it "approximate". Rematch stays one key away.

**Verify.** `mechcheck`: for each flagged break, re-cast the recorded ray against the recorded box with `rayBox`. The tick before must hit and the
flagged tick must miss. Run the hitch scan (PLAN.md) through a replay.

### P6. One-click "Warm-up set". Size S, after P1 and P2

**What.** A main-menu button next to PLAY: three 2:00 matches back to back at `R−0.6`, `R−0.3` and `R` (ramping up), with a 5 s results card
between them, then one summary showing the curve across the set against your usual. Optional style rotation: Strafer, then Floater, then
Duelist.

**Why.** It's how a warm-up should be structured (ramp, then test), and it's still one click. Settings come from the last-used
map and lifesteal.

**Files.** `Menus.js`, `Game.js` (a set controller around `startMatch/endMatch`), `src/data/match.js` (`WARMUP_SET`).

**Risk.** None. **Verify.** Unit-check the R schedule, and confirm the sets don't write ladder updates twice.

## 3. First slice

**Build P2, then P1.** P2 is small and gives P1 its measuring stick: the accuracy gap, buckets, PB keys that are correct, and range bands. It
also fixes two outright bugs in today's "best" number. P1 then removes the biggest structural problem, the 11-point level steps colliding with the
lifesteal cliff that produced 12–0 and 0–14 blowouts in every seeded run. Together they give a returning player a number that moves
every match (rating), a reason to replay (climb, or confirm "warm"), and fights that land near 50/50. Neither touches the core,
the render loop or the assets. The botsim convergence test makes it provable. P3 is next, because its coaching link needs P2's range bands.

## 4. What I would NOT do

- **Drill or scenario modes with a passive bot** (tracking-only targets, no return fire). The owner chose duel-only, and Kovaak's already
  covers that. Styles (P3) give the same targeted practice inside a real duel.
- **Mid-match adaptive difficulty or rubber-banding.** It hides your true accuracy, and a QL player will notice and resent it. The ladder
  moves between matches only.
- **The full QL item set (RA/YA/MH/Quad/Haste).** Quad and Haste change LG damage and movement, which is off-limits. Several armours turn a 3-minute
  warm-up into a route-learning game. One item at most.
- **Duel rounds (first to N).** At equal skill with Full lifesteal a frag takes about 40 s, so FT5 would run unbounded. QL duel isn't
  round-based either.
- **XP, unlocks, cosmetics or loot.** These are gimmicks to this audience. The ladder number and PBs are the progression.
- **Daily seeds or online leaderboards.** The bot reacts to you, so a seed doesn't make runs comparable, and it needs a server.
- **More maps as "depth".** That's content rather than depth, with an art and calibration cost. Give the two maps distinct roles first (P3 range
  styles, P4 item spot).
- **Making the bot retreat smarter as a headline feature.** Under lifesteal, fixing `retreat` (fight instead of hiding) is worth a one-line
  data tweak (`retreat` scaled by `1 − lifesteal`), not a system.
