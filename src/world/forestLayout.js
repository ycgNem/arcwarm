// "Pinehollow": the one custom forest duel map. Pure data + collision layout (no Three),
// shared by the game, the nav grid and the Node test tools. ForestVisuals.js dresses it.
import { Heightfield } from './Heightfield.js';
import { mulberry32, rand } from '../core/rng.js';

export const MAP_NAME = 'Pinehollow';
const BOUNDARY_R = 1000;

const bump = (d, R) => (d >= R ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / R));
const dist = (x, z, cx, cz) => Math.hypot(x - cx, z - cz);

export function forestHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = 0;
  h -= 34 * bump(r, 420); // central hollow
  h += 70 * bump(dist(x, z, 60, -640), 460); // north ridge
  h += 46 * bump(dist(x, z, -80, 660), 380); // south rise (ruins)
  h += 40 * bump(dist(x, z, 660, -60), 300); // east knoll (shrine)
  h += 18 * bump(dist(x, z, -700, -420), 260); // north-west mound
  h += 5 * Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.013) + 3 * Math.sin(x * 0.027 - z * 0.019);
  if (r > 940) h += Math.pow((r - 940) / 60, 1.6) * 14; // the valley walls beyond the playable ring
  return h;
}

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export function buildForestLayout(seed = 7) {
  const rng = mulberry32(seed);
  const terrain = new Heightfield({ size: 2800, cells: 112, fn: forestHeight });
  const H = (x, z) => terrain.heightAt(x, z);
  const footMin = (x0, z0, x1, z1) =>
    Math.min(H(x0, z0), H(x1, z0), H(x0, z1), H(x1, z1), H((x0 + x1) / 2, (z0 + z1) / 2));

  const boxes = [];
  const cylinders = [];
  const pads = [];
  const box = (kind, x0, y0, z0, x1, y1, z1, extra = {}) => {
    const b = { kind, x0, y0, z0, x1, y1, z1, ...extra };
    boxes.push(b);
    return b;
  };
  // A box that rises `height` above the lowest ground under it and sinks below the highest.
  const grounded = (kind, x0, z0, x1, z1, height, extra) => {
    const g = footMin(x0, z0, x1, z1);
    return box(kind, x0, g - 14, z0, x1, g + height, z1, extra);
  };
  const absolute = (kind, x0, z0, x1, z1, top, extra) => box(kind, x0, footMin(x0, z0, x1, z1) - 14, z0, x1, top, z1, extra);

  // Stairs walking outward from a platform edge until they meet the ground.
  const stairs = (kind, ex, ez, dirX, dirZ, width, topY) => {
    const rise = 14;
    const depth = 26;
    for (let k = 1; k < 20; k++) {
      const top = topY - rise * k;
      const c = depth * (k - 0.5);
      const cx = ex + dirX * c;
      const cz = ez + dirZ * c;
      const hx = dirX !== 0 ? depth / 2 : width / 2;
      const hz = dirZ !== 0 ? depth / 2 : width / 2;
      const g = footMin(cx - hx, cz - hz, cx + hx, cz + hz);
      if (top <= g + 2) break;
      box(kind, cx - hx, g - 14, cz - hz, cx + hx, top, cz + hz, { step: k });
    }
  };

  // --- West: the treehouse (rock plateau with a plank deck and a pine growing through it) ---
  const DECK_TOP = 120;
  absolute('plateau', -720, -60, -480, 140, DECK_TOP);
  box('rail', -720, DECK_TOP, -60, -480, DECK_TOP + 28, -52);
  box('rail', -720, DECK_TOP, 132, -480, DECK_TOP + 28, 140);
  box('rail', -488, DECK_TOP, -60, -480, DECK_TOP + 28, 0);
  box('rail', -488, DECK_TOP, 80, -480, DECK_TOP + 28, 140);
  box('rail', -720, DECK_TOP, -60, -712, DECK_TOP + 28, 56);
  stairs('stair', -720, 96, -1, 0, 72, DECK_TOP);
  cylinders.push({ x: -650, z: -5, r: 24, y0: -40, y1: 900, kind: 'deckTree' });

  // --- East: the shrine (stone slab on the knoll, broken pillars on top) ---
  const SLAB_TOP = 104;
  absolute('slab', 530, -170, 750, 50, SLAB_TOP);
  stairs('stoneStair', 750, -60, 1, 0, 80, SLAB_TOP);
  box('pillar', 551, SLAB_TOP - 2, -149, 579, SLAB_TOP + 110, -121);
  box('pillar', 701, SLAB_TOP - 2, -149, 729, SLAB_TOP + 72, -121);
  box('pillar', 551, SLAB_TOP - 2, 1, 579, SLAB_TOP + 90, 29);
  box('pillar', 701, SLAB_TOP - 2, 1, 729, SLAB_TOP + 46, 29); // low enough to perch on
  box('fallen', 640, SLAB_TOP - 2, -26, 700, SLAB_TOP + 24, -2);

  // --- South: ruin walls (cover) ---
  grounded('wall', -260, 500, -120, 516, 64);
  grounded('wall', -136, 516, -120, 600, 64);
  grounded('wall', 60, 700, 200, 716, 48);
  grounded('wall', 200, 640, 216, 716, 40);

  // --- Centre: fallen log across the hollow ---
  {
    const y0 = H(0, 120) - 20;
    box('log', -170, y0, 96, 170, y0 + 48, 144, { radius: 24 });
  }

  // --- Boulders: [cx, cz, sx, height, sz] ---
  const ROCKS = [
    [-170, -170, 80, 50, 64],
    [260, 140, 60, 44, 70],
    [-380, -330, 120, 70, 90],
    [380, 380, 90, 60, 110],
    [-400, 400, 70, 40, 60],
    [300, -460, 100, 90, 70],
    [-120, -560, 130, 60, 80],
    [740, 330, 80, 50, 70],
    [-760, -320, 90, 100, 120],
    [520, 650, 90, 60, 80],
    [-560, -700, 100, 80, 90],
    [60, 330, 50, 30, 50],
    [160, -330, 60, 36, 50],
    [-300, 150, 60, 34, 60],
  ];
  for (const [cx, cz, sx, sy, sz] of ROCKS) {
    grounded('rock', cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, sy, { seed: Math.floor(rng() * 1e6) });
  }

  // Surface a launcher aims at (top of whatever's there, else terrain).
  const surface = (x, z) => {
    let g = H(x, z);
    for (const b of boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 > g) g = b.y1;
    return g;
  };

  // --- Launchers. Velocity is solved at launch from the jumper's own position, so any gravity lands on target. ---
  const pad = (kind, x, z, tx, tz, apexAbove, r = 40) =>
    pads.push({ kind, x, z, y: H(x, z), r, h: 28, target: { x: tx, y: surface(tx, tz), z: tz }, apexAbove });
  pad('lift', -405, 40, -545, 60, 70); // grav lift up to the treehouse deck
  pad('pad', 150, -80, 590, -80, 80); // hollow → shrine
  pad('cannon', -60, 600, 40, -640, 200, 44); // man cannon: south ruins → north ridge

  // --- Spawns ---
  const spawns = [
    [-820, 300],
    [-330, -720],
    [330, -780],
    [830, 230],
    [440, 780],
    [-520, 720],
    [-560, 100],
    [660, -100],
    [-250, 250],
  ].map(([x, z]) => ({ x, z, y: surface(x, z), yaw: Math.atan2(x, z) })); // face the centre

  // --- Trees ---
  const blocked = (x, z, margin) => {
    for (const b of boxes) if (x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin) return true;
    for (const p of pads) {
      if (dist(x, z, p.x, p.z) < p.r + margin) return true;
      if (segDist(x, z, p.x, p.z, p.target.x, p.target.z) < margin + 20) return true;
    }
    for (const s of spawns) if (dist(x, z, s.x, s.z) < margin + 40) return true;
    return false;
  };
  const trees = [];
  const placeTrees = (count, rMin, rMax, spacing, margin, make) => {
    let tries = 0;
    while (count > 0 && tries++ < count * 400) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rand(rng, rMin * rMin, rMax * rMax));
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (blocked(x, z, margin)) continue;
      if (cylinders.some((c) => dist(x, z, c.x, c.z) < spacing)) continue;
      if (trees.some((t) => dist(x, z, t.x, t.z) < spacing)) continue;
      trees.push(make(x, z));
      count--;
    }
  };
  // Inside the ring: these collide and block the beam.
  placeTrees(44, 250, 950, 110, 45, (x, z) => {
    const t = { x, z, r: rand(rng, 9, 15), height: rand(rng, 420, 640), type: rng() < 0.78 ? 'pine' : 'birch', y: H(x, z) };
    cylinders.push({ x, z, r: t.r, y0: t.y - 20, y1: t.y + t.height, kind: 'tree' });
    return t;
  });
  // Outer forest wall: visual only (the boundary keeps you in).
  placeTrees(260, 1010, 1380, 62, 0, (x, z) => ({
    x,
    z,
    r: rand(rng, 12, 22),
    height: rand(rng, 520, 820),
    type: rng() < 0.85 ? 'pine' : 'birch',
    y: H(x, z),
    outer: true,
  }));
  const deckTree = cylinders.find((c) => c.kind === 'deckTree');
  trees.push({ x: deckTree.x, z: deckTree.z, r: deckTree.r, height: 760, type: 'pine', y: H(deckTree.x, deckTree.z), big: true });

  // --- Ground cover (visual only) ---
  const ferns = [];
  const tufts = [];
  for (let i = 0; i < 2600; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 1250;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (blocked(x, z, 6)) continue;
    if (cylinders.some((c) => dist(x, z, c.x, c.z) < c.r + 4)) continue;
    const item = { x, z, y: H(x, z), s: rand(rng, 0.7, 1.4), rot: rng() * Math.PI };
    // Ferns cluster around trees and the hollow's rim; grass everywhere else.
    if (rng() < 0.35) ferns.push(item);
    else tufts.push(item);
  }

  return {
    name: MAP_NAME,
    terrain,
    boxes,
    cylinders,
    pads,
    spawns,
    boundaryR: BOUNDARY_R,
    decor: { trees, ferns, tufts },
  };
}
