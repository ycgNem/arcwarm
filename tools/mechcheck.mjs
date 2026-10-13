// Mechanics checks: run with `npm run check`. Prints measured numbers next to targets and fails loudly.
import { TICK, GRAVITY_PRESETS, HULL, MOVE } from '../src/data/physics.js';
import { LG } from '../src/data/weapons.js';
import { VITALS } from '../src/data/match.js';
import { World } from '../src/world/World.js';
import { Heightfield } from '../src/world/Heightfield.js';
import { buildForestLayout } from '../src/world/forestLayout.js';
import { NavGrid } from '../src/world/NavGrid.js';
import { makeBody, placeBody, stepBody } from '../src/game/Movement.js';

let fails = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
};
const f1 = (v) => v.toFixed(1);

const flat = new World({
  terrain: new Heightfield({ size: 4000, cells: 10, fn: () => 0 }),
  boxes: [],
  cylinders: [],
  pads: [],
  spawns: [
    { x: 0, z: 300, y: 0, yaw: 0 },
    { x: 0, z: -100, y: 0, yaw: Math.PI },
  ],
  boundaryR: 1900,
});
const cmd = (o = {}) => ({ wishX: 0, wishZ: 0, jump: false, crouch: false, ...o });
const settle = (b, w, phys, n = 30) => {
  for (let i = 0; i < n; i++) stepBody(b, cmd(), TICK, w, phys);
};

// --- Jump apex and hang time per gravity preset ---
for (const [key, phys] of Object.entries(GRAVITY_PRESETS)) {
  const b = makeBody();
  placeBody(b, 0, 0, 0);
  settle(b, flat, phys);
  let apex = 0;
  let t = 0;
  stepBody(b, cmd({ jump: true }), TICK, flat, phys);
  t += TICK;
  while (!b.onGround && t < 5) {
    stepBody(b, cmd(), TICK, flat, phys);
    t += TICK;
    apex = Math.max(apex, b.y);
  }
  const wantApex = phys.jumpVelocity ** 2 / (2 * phys.gravity);
  const wantHang = (2 * phys.jumpVelocity) / phys.gravity;
  check(`${key} jump apex`, Math.abs(apex - wantApex) < 1.5, `${f1(apex)}u (theory ${f1(wantApex)})`);
  check(`${key} hang time`, Math.abs(t - wantHang) < 0.02, `${t.toFixed(3)}s (theory ${wantHang.toFixed(3)})`);
}
const halo = GRAVITY_PRESETS.halo;

// --- Ground speed, acceleration, ADAD reversal ---
{
  const b = makeBody();
  placeBody(b, 0, 0, 0);
  settle(b, flat, halo);
  let t = 0;
  let t90 = null;
  for (let i = 0; i < 125; i++) {
    stepBody(b, cmd({ wishX: 1 }), TICK, flat, halo);
    t += TICK;
    if (t90 === null && b.vx >= 0.9 * MOVE.runSpeed) t90 = t;
  }
  check('run speed', Math.abs(b.vx - MOVE.runSpeed) < 2, `${f1(b.vx)} u/s`);
  check('time to 90% speed', t90 < 0.25, `${t90.toFixed(3)}s`);
  let tr = 0;
  while (b.vx > -0.9 * MOVE.runSpeed && tr < 2) {
    stepBody(b, cmd({ wishX: -1 }), TICK, flat, halo);
    tr += TICK;
  }
  check('ADAD reversal (+90% → -90%)', tr < 0.4, `${tr.toFixed(3)}s`);
  let ts = 0;
  while (Math.abs(b.vx) > 1 && ts < 2) {
    stepBody(b, cmd(), TICK, flat, halo);
    ts += TICK;
  }
  check('stop from full speed', ts < 0.3, `${ts.toFixed(3)}s`);
}

// --- Air control: steer, never gain speed ---
{
  const b = makeBody();
  placeBody(b, 0, 0, 0);
  settle(b, flat, halo);
  for (let i = 0; i < 60; i++) stepBody(b, cmd({ wishX: 1 }), TICK, flat, halo);
  stepBody(b, cmd({ wishX: 1, jump: true }), TICK, flat, halo);
  let maxSpeed = 0;
  let t = 0;
  while (!b.onGround && t < 3) {
    // classic bhop air-strafe input: sideways + turning wish
    const a = t * 2.5;
    stepBody(b, cmd({ wishX: Math.cos(a + 1.2), wishZ: Math.sin(a + 1.2) }), TICK, flat, halo);
    maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vz));
    t += TICK;
  }
  check('air strafe never exceeds run speed', maxSpeed <= MOVE.runSpeed + 0.5, `max ${f1(maxSpeed)} u/s`);
  const b2 = makeBody();
  placeBody(b2, 0, 0, 0);
  settle(b2, flat, halo);
  for (let i = 0; i < 60; i++) stepBody(b2, cmd({ wishX: 1 }), TICK, flat, halo);
  stepBody(b2, cmd({ wishX: 1, jump: true }), TICK, flat, halo);
  let tAir = 0;
  while (b2.vx > 0 && !b2.onGround) {
    stepBody(b2, cmd({ wishX: -1 }), TICK, flat, halo);
    tAir += TICK;
  }
  check('mid-air reverse possible before landing', !b2.onGround, `reversed in ${tAir.toFixed(2)}s of a ${(2 * halo.jumpVelocity / halo.gravity).toFixed(2)}s jump`);
  const b3 = makeBody();
  placeBody(b3, 0, 0, 0);
  settle(b3, flat, halo);
  stepBody(b3, cmd({ jump: true }), TICK, flat, halo);
  for (let i = 0; i < 60; i++) stepBody(b3, cmd({ wishZ: 1 }), TICK, flat, halo);
  check('standing jump can drift in air', Math.abs(b3.vz) > 150, `${f1(b3.vz)} u/s after 0.48s`);
}

// --- Crouch-jump adds the tuck height, eye doesn't pop ---
{
  const b = makeBody();
  placeBody(b, 0, 0, 0);
  settle(b, flat, halo);
  stepBody(b, cmd({ jump: true }), TICK, flat, halo);
  let apex = 0;
  let dEye = null;
  for (let i = 0; i < 400 && !b.onGround; i++) {
    const crouch = i >= 20;
    const eyeBefore = b.y + (b.crouched ? HULL.crouchEye : HULL.eye);
    const vy = b.vy;
    stepBody(b, cmd({ crouch }), TICK, flat, halo);
    if (i === 20) dEye = b.y + HULL.crouchEye - eyeBefore - vy * TICK;
    apex = Math.max(apex, b.y);
  }
  const want = halo.jumpVelocity ** 2 / (2 * halo.gravity) + HULL.crouchAirLift;
  check('crouch-jump feet apex', Math.abs(apex - want) < 2, `${f1(apex)}u (want ~${f1(want)})`);
  check('crouch in air keeps the eye still', Math.abs(dEye) < 0.5, `Δeye ${dEye.toFixed(2)}u beyond normal motion`);
}

// --- The real map ---
const layout = buildForestLayout();
const world = new World(layout);
console.log(`\nmap: ${layout.boxes.length} boxes, ${layout.cylinders.length} trunks, ${layout.decor.trees.length} trees, ${layout.pads.length} launchers, terrain ${f1(layout.terrain.minH)}..${f1(layout.terrain.maxH)}`);

for (const s of layout.spawns) {
  const free = world.hullFree(s.x, s.y + 0.5, s.z, HULL.halfWidth, HULL.height);
  check(`spawn (${s.x},${s.z}) clear`, free, `y=${f1(s.y)}`);
}

// Stairs: walk up the treehouse stairs from the bottom.
{
  const b = makeBody();
  const sx = -720 - 26 * 10;
  placeBody(b, sx, world.supportHeight(sx, 96, 15, 999) + 1, 96);
  settle(b, world, halo);
  let t = 0;
  while (t < 4 && b.x < -560) {
    stepBody(b, cmd({ wishX: 1 }), TICK, world, halo);
    t += TICK;
  }
  check('walk up treehouse stairs to the deck', Math.abs(b.y - 120) < 0.5 && b.x >= -560, `y=${f1(b.y)} x=${f1(b.x)} in ${t.toFixed(2)}s`);
}

// Launchers land on target under every gravity preset.
for (const p of layout.pads) {
  for (const [key, phys] of Object.entries(GRAVITY_PRESETS)) {
    const b = makeBody();
    placeBody(b, p.x + 8, world.supportHeight(p.x + 8, p.z, 15, 999) + 0.5, p.z - 5);
    let t = 0;
    let launched = false;
    let peak = -1e9;
    while (t < 6) {
      stepBody(b, cmd(), TICK, world, phys);
      t += TICK;
      if (b.padCooldown > 0) launched = true;
      peak = Math.max(peak, b.y);
      if (launched && b.onGround && t > 0.2) break;
    }
    const miss = Math.hypot(b.x - p.target.x, b.z - p.target.z);
    check(`${p.kind} lands on target (${key})`, launched && miss < 40, `miss ${f1(miss)}u, flight ${t.toFixed(2)}s, peak ${f1(peak)}`);
  }
}

// Trees: run into one, don't pass through, slide off.
{
  const tree = layout.cylinders.find((c) => c.kind === 'tree' && Math.hypot(c.x, c.z) < 800);
  const b = makeBody();
  const off = tree.r * 0.8;
  placeBody(b, tree.x - 120, world.supportHeight(tree.x - 120, tree.z + off, 15, 999) + 1, tree.z + off);
  settle(b, world, halo);
  let penetrated = false;
  for (let i = 0; i < 125; i++) {
    stepBody(b, cmd({ wishX: 1 }), TICK, world, halo);
    if (Math.hypot(b.x - tree.x, b.z - tree.z) < tree.r + 15 - 0.5) penetrated = true;
  }
  check('trunk blocks and slides', !penetrated && b.x > tree.x, `ended x=${f1(b.x - tree.x)} past trunk, z offset ${f1(b.z - tree.z)}`);
}

// Walls: the tall shrine pillar stops you.
{
  const pillar = layout.boxes.find((x) => x.kind === 'pillar');
  const b = makeBody();
  const cz = (pillar.z0 + pillar.z1) / 2;
  placeBody(b, pillar.x0 - 60, 105, cz);
  settle(b, world, halo);
  for (let i = 0; i < 100; i++) stepBody(b, cmd({ wishX: 1 }), TICK, world, halo);
  check('pillar blocks', b.x + 15 <= pillar.x0 + 0.05, `gap ${f1(pillar.x0 - (b.x + 15))}`);
}

// Boundary
{
  const b = makeBody();
  placeBody(b, 0, world.supportHeight(0, -300, 15, 999) + 1, -300);
  for (let i = 0; i < 125 * 6; i++) stepBody(b, cmd({ wishX: -0.3, wishZ: 1 }), TICK, world, halo);
  const r = Math.hypot(b.x, b.z);
  check('boundary holds', r <= layout.boundaryR - 14, `r=${f1(r)}`);
}

// Nav: every spawn can reach every other.
{
  const t0 = performance.now();
  const nav = new NavGrid(world);
  const tBuild = performance.now() - t0;
  let ok = 0;
  let total = 0;
  let tPath = 0;
  for (const a of layout.spawns) {
    for (const c of layout.spawns) {
      if (a === c) continue;
      total++;
      const t1 = performance.now();
      const p = nav.findPath(a.x, a.z, c.x, c.z);
      tPath += performance.now() - t1;
      if (p && p.length) ok++;
    }
  }
  check('nav: all spawn pairs connected', ok === total, `${ok}/${total}, build ${tBuild.toFixed(0)}ms, avg path ${(tPath / total).toFixed(2)}ms`);
}

// Hit registration: perfect tracking of a strafing, jumping bot from the player's seat (render-interpolated
// target, the way the game does it) should land ~every shot; aiming one hitbox-width off should land none.
{
  const { Sim } = await import('../src/game/Sim.js');
  const nav = new NavGrid(flat, { half: 1400, cell: 40 });
  const run = (offset) => {
    const sim = new Sim({ world: flat, nav, difficulty: 'hard', length: 0, seed: 2 });
    sim.state = 'live';
    const P = sim.player;
    const B = sim.bot;
    placeBody(P.body, 0, 0.5, 300);
    placeBody(B.body, 0, 0.5, -100);
    for (let i = 0; i < 125 * 20; i++) {
      // the frame we "saw": halfway between the last two ticks
      B.renderPos = { x: (B.prev.x + B.body.x) / 2, y: (B.prev.y + B.body.y) / 2, z: (B.prev.z + B.body.z) / 2, height: B.body.height };
      const t = B.renderPos;
      const dx = t.x - P.body.x;
      const dz = t.z - P.body.z;
      const d = Math.hypot(dx, dz);
      const sx = (-dz / d) * offset;
      const sz = (dx / d) * offset;
      const dy = t.y + t.height * 0.5 - P.eyeY();
      P.yaw = Math.atan2(-(dx + sx), -(dz + sz));
      P.pitch = Math.atan2(dy, d);
      sim.tick(TICK, { wishX: 0, wishZ: 0, jump: false, crouch: false, fire: true });
      B.health = 100;
      B.shield = 100;
      B.alive = true;
      P.health = 100;
      P.shield = 100;
      P.alive = true;
    }
    return P.stats;
  };
  const on = run(0);
  const off = run(HULL.halfWidth * 2 + 2);
  check('hitreg: perfect tracking of a dodging bot', on.hits / on.shots > 0.97, `${((100 * on.hits) / on.shots).toFixed(1)}% of ${on.shots} (air ${on.airShots})`);
  check('hitreg: aiming a hitbox-width off misses', off.hits === 0, `${off.hits} hits`);
}

// LG numbers
{
  const total = VITALS.health + VITALS.shield;
  const hits = Math.ceil(total / LG.damage);
  console.log(`\nLG: ${1 / LG.interval} hits/s × ${LG.damage} = ${LG.damage / LG.interval} dps. Kill = ${hits} hits = ${((hits - 1) * LG.interval).toFixed(2)}s at 100%, ${((hits / 0.4) * LG.interval).toFixed(2)}s at 40%`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall mechanics checks passed');
process.exit(fails ? 1 : 0);
