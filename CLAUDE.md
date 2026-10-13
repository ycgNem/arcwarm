# Arcwarm

Three.js + Vite, plain JavaScript. Low-gravity Quake Live LG duel warm-up. Read `PLAN.md` (design, feel targets, folder map, stages) before working.

- Run with `npm run dev` (port 5200) or `Play.bat`.
- Quake units everywhere (1 unit ≈ 1 inch); physics ticks at a fixed 125 Hz, rendering interpolates.
- All tuning lives in `src/data/`. Don't hardcode numbers in gameplay code.
- Feel is the product: sens/FOV must match QL exactly (`m_yaw 0.022`, cg_fov 4:3 Hor+), raw input via pointer lock `unadjustedMovement`.
- Tick the checkboxes in `PLAN.md` as stages land.
