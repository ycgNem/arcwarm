# Arcwarm

Three.js + Vite, plain JavaScript. Low-gravity Quake Live LG duel warm-up vs a bot on one forest map (Pinehollow).
Read `PLAN.md` (mechanics table, bot calibration, map, tools) before working.

- Run with `npm run dev` (port 5200) or `Play.bat`.
- **Mechanics are the product.** After touching movement, collision, weapons, the bot or the map, run `npm run check`
  (must all pass) and `npm run botsim` (compare against the table in PLAN.md).
- Simulation (`src/game/Sim.js`, `Movement.js`, `BotBrain.js`, `src/world/World.js`, `NavGrid.js`, `forestLayout.js`) is pure
  logic, with no Three or DOM, so tools/ can run it in Node. Keep it that way; visuals live in `ForestVisuals.js` and `src/fx/`.
- Quake units everywhere (1 unit ≈ 1 inch); physics ticks at a fixed 125 Hz, rendering interpolates, mouse look is immediate.
- All tuning lives in `src/data/`. Don't hardcode numbers in gameplay code.
- Visual meshes must match colliders (rocks are jagged *inward* only; trunks are cylinders; the terrain mesh uses the same
  triangle diagonal as `Heightfield.heightAt`).
- Feel must match QL: sens uses `m_yaw 0.022`, cg_fov is 4:3 horizontal Hor+, raw input via pointer lock `unadjustedMovement`.
- Debug URLs: `?debug=spectate`, `?debug=start`, `&len=<seconds>`; `window.arcwarm` is the Game in the console.
- Tick the checkboxes in `PLAN.md` as stages land.
