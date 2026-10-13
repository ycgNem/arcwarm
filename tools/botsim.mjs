// Bot calibration: `npm run botsim`.
//  1. Each bot level shoots at scripted dodgers (still / slow strafe / human ADAD / ADAD + low-grav jumps).
//     Accuracy here comes purely from the aim model, so it should drop as the dodging gets better.
//  2. Full 3-minute bot-vs-bot matches on Pinehollow: frags, accuracy, time engaged, stuck events, launcher use.
import { TICK } from '../src/data/physics.js';
import { BOT_ORDER } from '../src/data/bots.js';
import { World } from '../src/world/World.js';
import { Heightfield } from '../src/world/Heightfield.js';
import { MAPS } from '../src/world/maps.js';
import { NavGrid } from '../src/world/NavGrid.js';
import { Sim } from '../src/game/Sim.js';
import { mulberry32 } from '../src/core/rng.js';
import { placeBody } from '../src/game/Movement.js';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
};
const SECONDS = Number(arg('seconds', 60));
const pct = (h, s) => (s ? ((100 * h) / s).toFixed(1) + '%' : '  -  ');

// ---------- 1. Dodge patterns on a flat field ----------
const flatLayout = {
  terrain: new Heightfield({ size: 3000, cells: 10, fn: () => 0 }),
  boxes: [],
  cylinders: [],
  pads: [],
  spawns: [
    { x: 0, z: 200, y: 0, yaw: 0 },
    { x: 0, z: -200, y: 0, yaw: Math.PI },
  ],
  boundaryR: 1400,
};
const flat = new World(flatLayout);
const flatNav = new NavGrid(flat, { half: 1400, cell: 40 });

const PATTERNS = {
  still: () => ({ side: 0, jump: false }),
  slowStrafe: (t) => ({ side: Math.floor(t / 1.6) % 2 ? 1 : -1, jump: false }),
  adad: (t, st, rng) => {
    if (t >= st.next) {
      st.side = -(st.side || 1);
      st.next = t + 0.22 + rng() * 0.5;
    }
    return { side: st.side, jump: false };
  },
  adadJump: (t, st, rng) => {
    let jump = false;
    if (t >= st.next) {
      st.side = -(st.side || 1);
      st.next = t + 0.22 + rng() * 0.5;
      jump = rng() < 0.35;
    }
    return { side: st.side, jump };
  },
};

function dodgeTest(level, pattern, dist = 420) {
  const sim = new Sim({ world: flat, nav: flatNav, difficulty: level, length: 0, seed: 11 });
  sim.state = 'live';
  const rng = mulberry32(5);
  const st = { side: 1, next: 0 };
  const P = sim.player;
  const B = sim.bot;
  placeBody(P.body, 0, 0.5, dist / 2);
  placeBody(B.body, 0, 0.5, -dist / 2);
  for (let i = 0; i < SECONDS / TICK; i++) {
    const t = i * TICK;
    const mv = PATTERNS[pattern](t, st, rng);
    // Strafe across the bot's line of sight and hold the distance, like a player would.
    const dx = B.body.x - P.body.x;
    const dz = B.body.z - P.body.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = dx / d;
    const fz = dz / d;
    const keep = Math.max(-1, Math.min(1, (d - dist) / 150)) * 0.6;
    P.yaw = Math.atan2(-fx, -fz);
    sim.tick(TICK, { wishX: -fz * mv.side + fx * keep, wishZ: fx * mv.side + fz * keep, jump: mv.jump, crouch: false, fire: false });
    // Dummy can't die: we're measuring aim, not the match.
    P.health = 100;
    P.shield = 100;
    P.alive = true;
  }
  return B.stats;
}

console.log(`\n== Bot accuracy vs scripted dodgers (${SECONDS}s each, ~420u) ==`);
console.log('level       still   slowStrafe  adad    adad+jump   air-shot acc (adad+jump)');
for (const level of BOT_ORDER) {
  const row = [];
  let air = '';
  for (const p of Object.keys(PATTERNS)) {
    const s = dodgeTest(level, p);
    row.push(pct(s.hits, s.shots).padEnd(p === 'slowStrafe' ? 12 : p === 'adadJump' ? 12 : 8));
    if (p === 'adadJump') air = pct(s.airHits, s.airShots);
  }
  console.log(`${level.padEnd(11)} ${row.join('')}${air}`);
}

// ---------- 2. Full matches on each map ----------
const worlds = {};
for (const id of Object.keys(MAPS)) {
  const w = new World(MAPS[id].build());
  worlds[id] = { world: w, nav: new NavGrid(w) };
}

function match(mapId, levelA, levelB, seed, lifesteal) {
  const { world, nav } = worlds[mapId];
  const sim = new Sim({ world, nav, difficulty: levelB, spectate: levelA, length: 180, seed, lifesteal });
  const brainA = sim.brains.get(sim.player);
  const brainB = sim.brains.get(sim.bot);
  const modes = { engage: 0, hunt: 0, retreat: 0 };
  let pads = 0;
  let maxStill = 0;
  const still = [0, 0];
  const t0 = performance.now();
  while (sim.state !== 'over') {
    sim.tick(TICK, null);
    if (sim.state === 'live') modes[brainB.mode] = (modes[brainB.mode] || 0) + TICK;
    for (const e of sim.events) if (e.type === 'pad') pads++;
    sim.events.length = 0;
    sim.fighters.forEach((f, i) => {
      if (f.alive && Math.hypot(f.body.vx, f.body.vz) < 5 && !(i === 1 ? brainB : brainA).firing) still[i] += TICK;
      else still[i] = 0;
      maxStill = Math.max(maxStill, still[i]);
    });
  }
  const ms = performance.now() - t0;
  return { sim, modes, pads, ms, maxStill, stuck: brainA.stuckCount + brainB.stuckCount };
}

const pairs = [
  ['normal', 'normal'],
  ['hard', 'hard'],
  ['nightmare', 'nightmare'],
  ['hard', 'nightmare'],
];
const runs = [
  ['forest', 1],
  ['whiteroom', 1],
  ['forest', 0],
];
for (const [mapId, ls] of runs) {
  console.log(`
== Bot vs bot, 3:00 on ${MAPS[mapId].label}, lifesteal ${ls ? Math.round(ls * 100) + '%' : 'off'} ==`);
  console.log('matchup               score    acc A   acc B   air-acc B  dmg/min B  healed B  engaged  retreat  pads  stuck  longest idle  sim ms');
  for (const [a, b] of pairs) {
    const r = match(mapId, a, b, 3, ls);
    const A = r.sim.player.stats;
    const B = r.sim.bot.stats;
    const live = r.sim.clock;
    console.log(
      `${(a + ' v ' + b).padEnd(21)} ${(A.frags + '-' + B.frags).padEnd(8)} ${pct(A.hits, A.shots).padEnd(7)} ${pct(B.hits, B.shots).padEnd(7)} ${pct(B.airHits, B.airShots).padEnd(10)} ${((B.dmg / live) * 60).toFixed(0).padEnd(10)} ${String(Math.round(B.healed)).padEnd(9)} ${pct(r.modes.engage, live).padEnd(8)} ${pct(r.modes.retreat, live).padEnd(8)} ${String(r.pads).padEnd(5)} ${String(r.stuck).padEnd(6)} ${r.maxStill.toFixed(1).padEnd(13)} ${r.ms.toFixed(0)}`,
    );
  }
}
