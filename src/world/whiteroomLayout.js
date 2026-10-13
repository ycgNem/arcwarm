// "White Room": a bright, plain aim-trainer arena. Two raised platforms (north/south) and two wall ledges
// (east/west), each reached by a ramp, four tall pillars to break sight, a low block in the middle.
// Platforms are 116 high: a plain jump + ledge step reaches 109, a crouch-jump + step reaches 125.
import { Heightfield } from './Heightfield.js';

export const WHITEROOM_NAME = 'White Room';

export function buildWhiteRoomLayout() {
  const terrain = new Heightfield({ size: 2400, cells: 6, fn: () => 0 });
  const boxes = [];
  const ramps = [];
  const box = (kind, x0, y0, z0, x1, y1, z1) => boxes.push({ kind, x0, y0, z0, x1, y1, z1 });
  const ramp = (x0, z0, x1, z1, dir, highY) => ramps.push({ kind: 'ramp', x0, z0, x1, z1, y0: -10, lowY: 0, highY, dir });

  const W = 900; // half-size of the room
  const T = 40; // wall thickness
  const H = 440;
  box('wall', -W - T, -10, -W - T, W + T, H, -W);
  box('wall', -W - T, -10, W, W + T, H, W + T);
  box('wall', -W - T, -10, -W, -W, H, W);
  box('wall', W, -10, -W, W + T, H, W);

  // North / south platforms with ramps running down toward the middle.
  const PLAT = 116;
  box('platform', -300, -10, -720, 300, PLAT, -480);
  ramp(-70, -480, 70, -240, '-z', PLAT);
  box('platform', -300, -10, 480, 300, PLAT, 720);
  ramp(-70, 240, 70, 480, '+z', PLAT);

  // East / west ledges against the walls.
  const LEDGE = 72;
  box('platform', -W, -10, -260, -680, LEDGE, 260);
  ramp(-680, -60, -480, 60, '-x', LEDGE);
  box('platform', 680, -10, -260, W, LEDGE, 260);
  ramp(480, -60, 680, 60, '+x', LEDGE);

  // Cover.
  for (const [x, z] of [
    [-420, -300],
    [420, -300],
    [-420, 300],
    [420, 300],
  ]) {
    box('pillar', x - 36, -10, z - 36, x + 36, 260, z + 36);
  }
  box('block', -60, -10, -60, 60, 44, 60);

  const surface = (x, z) => {
    let g = 0;
    for (const b of boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 > g) g = b.y1;
    return g;
  };
  const spawns = [
    [-720, -720],
    [720, -720],
    [-720, 720],
    [720, 720],
    [0, -620],
    [0, 620],
    [-790, 0],
    [790, 0],
    [-560, 420],
    [560, -420],
  ].map(([x, z]) => ({ x, z, y: surface(x, z), yaw: Math.atan2(x, z) }));

  return {
    name: WHITEROOM_NAME,
    terrain,
    boxes,
    ramps,
    cylinders: [],
    pads: [],
    spawns,
    boundaryR: 1300, // the walls do the real work; the circle sits outside them
    decor: { trees: [], ferns: [], tufts: [] },
  };
}
