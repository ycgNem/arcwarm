// Player/bot movement. Quake-style ground accel + friction, Halo air control (steer, no speed gain),
// low gravity, crouch-jump, step-up, ground snap, launch pads. Bots and the player run the exact same code.
import { HULL, MOVE } from '../data/physics.js';
import { hullBox, hullCylinder, EPS } from '../world/World.js';

export function makeBody() {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: false,
    crouched: false,
    height: HULL.height,
    jumpBuffer: 0,
    padCooldown: 0,
    airTime: 0,
  };
}

export function placeBody(b, x, y, z) {
  b.x = x;
  b.y = y;
  b.z = z;
  b.vx = b.vy = b.vz = 0;
  b.onGround = false;
  b.crouched = false;
  b.height = HULL.height;
  b.jumpBuffer = 0;
  b.padCooldown = 0;
  b.airTime = 0;
}

export const eyeHeight = (b) => (b.crouched ? HULL.crouchEye : HULL.eye);

function friction(b, dt) {
  const speed = Math.hypot(b.vx, b.vz);
  if (speed < 0.5) {
    b.vx = b.vz = 0;
    return;
  }
  const control = speed < MOVE.stopSpeed ? MOVE.stopSpeed : speed;
  const scale = Math.max(0, speed - control * MOVE.friction * dt) / speed;
  b.vx *= scale;
  b.vz *= scale;
}

function accelerate(b, dx, dz, wishSpeed, accel, dt) {
  if (wishSpeed <= 0) return;
  const add = wishSpeed - (b.vx * dx + b.vz * dz);
  if (add <= 0) return;
  const a = Math.min(accel * dt * wishSpeed, add);
  b.vx += a * dx;
  b.vz += a * dz;
}

function updateCrouch(b, want, world) {
  const hw = HULL.halfWidth;
  if (want && !b.crouched) {
    b.crouched = true;
    b.height = HULL.crouchHeight;
    if (!b.onGround) b.y += HULL.crouchAirLift; // tuck the legs; head and eye stay where they were
  } else if (!want && b.crouched) {
    if (b.onGround) {
      if (world.hullFree(b.x, b.y, b.z, hw, HULL.height)) {
        b.crouched = false;
        b.height = HULL.height;
      }
    } else {
      const dropY = b.y - HULL.crouchAirLift;
      if (world.hullFree(b.x, dropY, b.z, hw, HULL.height) && world.terrain.heightAt(b.x, b.z) <= dropY) {
        b.y = dropY;
        b.crouched = false;
        b.height = HULL.height;
      } else if (world.hullFree(b.x, b.y, b.z, hw, HULL.height)) {
        b.crouched = false;
        b.height = HULL.height;
      }
    }
  }
}

function moveAxis(b, axisX, d, world, grounded) {
  if (d === 0) return;
  const hw = HULL.halfWidth;
  if (axisX) b.x += d;
  else b.z += d;

  // Terrain: walk up gentle rises, stop at anything steeper than a step.
  const th = world.terrain.heightAt(b.x, b.z);
  if (th > b.y) {
    if (th - b.y <= MOVE.stepHeight + 0.001) b.y = th;
    else {
      if (axisX) {
        b.x -= d;
        b.vx = 0;
      } else {
        b.z -= d;
        b.vz = 0;
      }
      return;
    }
  }

  // Ramps: ride up the slope (any rise a step could take, even mid-jump); the steep sides are walls.
  const rt = world.rampAbove(b.x, b.y, b.z, hw, b.height);
  if (rt > -Infinity) {
    if (rt - b.y <= MOVE.stepHeight + 0.001 && world.hullFree(b.x, rt, b.z, hw, b.height)) b.y = rt;
    else {
      if (axisX) {
        b.x -= d;
        b.vx = 0;
      } else {
        b.z -= d;
        b.vz = 0;
      }
      return;
    }
  }

  for (const box of world.boxes) {
    if (!hullBox(b.x, b.y, b.z, hw, b.height, box)) continue;
    const rise = box.y1 - b.y;
    if (rise <= MOVE.stepHeight && (grounded || b.vy <= 0) && world.hullFree(b.x, box.y1, b.z, hw, b.height)) {
      b.y = box.y1; // step up (stairs, ledges, landing on an edge)
      continue;
    }
    if (axisX) {
      b.x = d > 0 ? box.x0 - hw - EPS : box.x1 + hw + EPS;
      b.vx = 0;
    } else {
      b.z = d > 0 ? box.z0 - hw - EPS : box.z1 + hw + EPS;
      b.vz = 0;
    }
  }
}

// Slide around trunks: circle vs circle, push out along the normal and drop the velocity into it.
function resolveCylinders(b, world) {
  const hw = HULL.halfWidth;
  for (const c of world.cylinders) {
    if (!hullCylinder(b.x, b.y, b.z, hw, b.height, c)) continue;
    let nx = b.x - c.x;
    let nz = b.z - c.z;
    const d = Math.hypot(nx, nz);
    if (d < 1e-4) {
      nx = 1;
      nz = 0;
    } else {
      nx /= d;
      nz /= d;
    }
    const pen = c.r + hw - d + EPS;
    b.x += nx * pen;
    b.z += nz * pen;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      b.vx -= vn * nx;
      b.vz -= vn * nz;
    }
  }
}

function resolveBoundary(b, world) {
  const R = world.boundaryR - HULL.halfWidth;
  const r = Math.hypot(b.x, b.z);
  if (r <= R) return;
  const nx = b.x / r;
  const nz = b.z / r;
  b.x = nx * R;
  b.z = nz * R;
  const vn = b.vx * nx + b.vz * nz;
  if (vn > 0) {
    b.vx -= vn * nx;
    b.vz -= vn * nz;
  }
}

function resolveVertical(b, prevY, world, events) {
  const hw = HULL.halfWidth;
  if (b.y < prevY) {
    for (const box of world.boxes) {
      if (!hullBox(b.x, b.y, b.z, hw, b.height, box)) continue;
      if (prevY >= box.y1 - 0.5 || box.y1 - b.y <= MOVE.stepHeight) b.y = box.y1;
    }
    // Landing on a slope: fast falls can sink more than a tick's worth into it.
    const rt = world.rampAbove(b.x, b.y, b.z, hw, b.height);
    if (rt > -Infinity && rt <= prevY + 0.5) b.y = rt;
  } else if (b.y > prevY) {
    for (const box of world.boxes) {
      if (!hullBox(b.x, b.y, b.z, hw, b.height, box)) continue;
      if (prevY + b.height <= box.y0 + 0.5) {
        b.y = box.y0 - b.height - EPS;
        if (b.vy > 0) b.vy = 0;
        events?.push({ type: 'bonk' });
      }
    }
  }
}

// Ballistic launch from (x,y,z) that peaks apexAbove over the higher end and lands on target.
export function solveLaunch(x, y, z, target, apexAbove, gravity) {
  const apexY = Math.max(y, target.y) + apexAbove;
  const vy = Math.sqrt(2 * gravity * (apexY - y));
  const T = vy / gravity + Math.sqrt((2 * (apexY - target.y)) / gravity);
  return { vx: (target.x - x) / T, vy, vz: (target.z - z) / T, T };
}

/**
 * Advance one body one tick.
 * cmd: { wishX, wishZ (world-space, length ≤ 1), jump, crouch }
 * phys: { gravity, jumpVelocity }
 */
export function stepBody(b, cmd, dt, world, phys, events) {
  b.padCooldown = Math.max(0, b.padCooldown - dt);
  updateCrouch(b, cmd.crouch, world);

  // Holding jump keeps the buffer full, so it auto-hops on landing (QL habit). No speed gain either way.
  if (cmd.jump) b.jumpBuffer = MOVE.jumpBuffer;
  else b.jumpBuffer = Math.max(0, b.jumpBuffer - dt);

  let wx = cmd.wishX;
  let wz = cmd.wishZ;
  let wl = Math.hypot(wx, wz);
  if (wl > 1) {
    wx /= wl;
    wz /= wl;
    wl = 1;
  }
  const dirX = wl > 1e-6 ? wx / wl : 0;
  const dirZ = wl > 1e-6 ? wz / wl : 0;
  const wishSpeed = MOVE.runSpeed * (b.crouched ? MOVE.crouchSpeedScale : 1) * wl;

  let jumped = false;
  if (b.onGround && b.jumpBuffer > 0) {
    b.vy = phys.jumpVelocity;
    b.onGround = false;
    b.jumpBuffer = 0;
    jumped = true;
    events?.push({ type: 'jump' });
  }

  if (b.onGround) {
    friction(b, dt);
    accelerate(b, dirX, dirZ, wishSpeed, MOVE.groundAccel, dt);
  } else {
    const before = Math.hypot(b.vx, b.vz);
    accelerate(b, dirX, dirZ, wishSpeed, MOVE.airAccel, dt);
    const after = Math.hypot(b.vx, b.vz);
    const cap = Math.max(before, wishSpeed);
    if (after > cap) {
      b.vx *= cap / after;
      b.vz *= cap / after;
    }
  }

  const wasOnGround = b.onGround;
  moveAxis(b, true, b.vx * dt, world, wasOnGround);
  moveAxis(b, false, b.vz * dt, world, wasOnGround);
  resolveCylinders(b, world);
  resolveBoundary(b, world);

  const prevY = b.y;
  const fallSpeed = -b.vy;
  if (wasOnGround && !jumped) b.vy = 0;
  else {
    // Exact for constant gravity, so jump apex is v²/2g regardless of tick rate.
    b.y += b.vy * dt - 0.5 * phys.gravity * dt * dt;
    b.vy = Math.max(-MOVE.maxFallSpeed, b.vy - phys.gravity * dt);
  }
  resolveVertical(b, prevY, world, events);

  const g = world.supportHeight(b.x, b.z, HULL.halfWidth, b.y + 0.5);
  if (b.vy <= 0 && b.y - g <= 0.5) {
    if (!wasOnGround) events?.push({ type: 'land', speed: fallSpeed, airTime: b.airTime });
    b.y = g;
    b.vy = 0;
    b.onGround = true;
  } else if (wasOnGround && !jumped && b.vy <= 0 && b.y - g <= MOVE.groundSnap) {
    b.y = g; // follow slopes and steps down instead of skipping off them
    b.onGround = true;
  } else {
    b.onGround = false;
  }
  b.airTime = b.onGround ? 0 : b.airTime + dt;

  if (b.padCooldown <= 0) {
    for (const p of world.pads) {
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      if (dx * dx + dz * dz > p.r * p.r) continue;
      if (b.y > p.y + p.h || b.y + b.height < p.y - 4) continue;
      const v = solveLaunch(b.x, b.y, b.z, p.target, p.apexAbove, phys.gravity);
      b.vx = v.vx;
      b.vy = v.vy;
      b.vz = v.vz;
      b.y += 0.5;
      b.onGround = false;
      b.padCooldown = 0.6;
      events?.push({ type: 'pad', pad: p });
      break;
    }
  }
}
