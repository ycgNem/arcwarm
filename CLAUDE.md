# Arcwarm

Three.js + Vite, plain JavaScript. Low-gravity Quake Live LG duel warm-up vs a bot. Maps: Pinehollow (forest) and
White Room, registered in `src/world/maps.js`. Lifesteal (hits heal the shooter) is a match option, default Full.
Read `PLAN.md` (mechanics table, bot calibration, map, tools) before working.

- Run with `npm run dev` (port 5200) or `Play.bat`.
- Live build: https://ycgnem.github.io/arcwarm/ (repo github.com/ycgNem/arcwarm). Every push to `main` redeploys via
  `.github/workflows/deploy.yml`.
- **Mechanics are the product.** After touching movement, collision, weapons, the bot or the map, run `npm run check`
  (must all pass) and `npm run botsim` (compare against the table in PLAN.md).
- Simulation (`src/game/Sim.js`, `Movement.js`, `BotBrain.js`, `src/world/World.js`, `NavGrid.js`, `*Layout.js`, `maps.js`) is pure
  logic, with no Three or DOM, so tools/ can run it in Node. Keep it that way; visuals live in `ForestVisuals.js` and `src/fx/`.
- Quake units everywhere (1 unit ≈ 1 inch); physics ticks at a fixed 125 Hz, rendering interpolates, mouse look is immediate.
- All tuning lives in `src/data/`. Don't hardcode numbers in gameplay code.
- Visual meshes must match colliders (rocks are jagged *inward* only; trunks are cylinders; the terrain mesh uses the same
  triangle diagonal as `Heightfield.heightAt`; ramp wedges are built from the same numbers as their colliders).
- Ledge reach: plain jump 91 + 18 step = 109, crouch-jump 125, bots climb ≤ 72 (`MOVE.jumpRise`). Size ledges with that.
- Feel must match QL: sens uses `m_yaw 0.022`, cg_fov is 4:3 horizontal Hor+, raw input via pointer lock `unadjustedMovement`.
- **No stutter allowed.** Keep the render loop allocation-free (reuse scratch objects), compile new effects in
  `Game.warmup`, keep world shadows static (set `renderer.shadowMap.needsUpdate` if the world changes), merge static meshes,
  no point lights, and only write to the DOM when a value changes (`Hud.set`). Re-run the hitch scan described in PLAN.md
  (drive `arcwarm.frame()` and time each frame with `gl.readPixels`) after visual changes.
- Hitreg: the player shoots from `renderEye` at `renderPos` (both set by Game from `lerpPose` each frame). Bots use live state.
- Art changes: capture `npm run shots -- before|after` (run outside the sandbox) and compare; keep lime out of the palette so the bot reads.
- Debug URLs: `?debug=spectate`, `?debug=start`, `&len=<seconds>`, `&map=whiteroom`; `window.arcwarm` is the Game in the console.
- Tick the checkboxes in `PLAN.md` as stages land.
