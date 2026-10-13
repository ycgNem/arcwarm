// Collision world: terrain heightfield + axis-aligned boxes + vertical cylinders (tree trunks).
// Pure logic (no Three), so tools/ can run it in Node.
export const EPS = 0.01;

// Slab test. Returns entry t (0 if the origin is inside) or null.
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0;
  let tmax = maxT;
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.x0 || ox > b.x1) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (b.x0 - ox) * inv;
    let t2 = (b.x1 - ox) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.y0 || oy > b.y1) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (b.y0 - oy) * inv;
    let t2 = (b.y1 - oy) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.z0 || oz > b.z1) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (b.z0 - oz) * inv;
    let t2 = (b.z1 - oz) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}

// Vertical cylinder side hit (trunks are taller than anything you can stand on, so caps are ignored).
export function rayCylinder(ox, oy, oz, dx, dy, dz, c, maxT) {
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const fx = ox - c.x;
  const fz = oz - c.z;
  const b = fx * dx + fz * dz;
  const cc = fx * fx + fz * fz - c.r * c.r;
  let t;
  if (cc <= 0) t = 0;
  else {
    const disc = b * b - a * cc;
    if (disc < 0) return null;
    t = (-b - Math.sqrt(disc)) / a;
    if (t < 0) return null;
  }
  if (t > maxT) return null;
  const y = oy + dy * t;
  if (y < c.y0 || y > c.y1) return null;
  return t;
}

export function hullBox(x, y, z, hw, h, b) {
  return (
    x + hw > b.x0 + EPS &&
    x - hw < b.x1 - EPS &&
    z + hw > b.z0 + EPS &&
    z - hw < b.z1 - EPS &&
    y + h > b.y0 + EPS &&
    y < b.y1 - EPS
  );
}

// Against trunks the hull is treated as a circle (radius = half-width) so you glance off trees instead of snagging.
export function hullCylinder(x, y, z, hw, h, c) {
  if (y + h <= c.y0 || y >= c.y1) return false;
  const r = c.r + hw;
  const dx = x - c.x;
  const dz = z - c.z;
  return dx * dx + dz * dz < r * r - 0.01;
}

// Ramps: axis-aligned wedges solid down to y0. dir ('+x' | '-x' | '+z' | '-z') is the way the surface climbs,
// from lowY at one end of the footprint to highY at the other.
export function prepareRamp(r) {
  const along = r.dir[1] === 'x';
  const len = along ? r.x1 - r.x0 : r.z1 - r.z0;
  const s = (r.highY - r.lowY) / len;
  const P = (nx, ny, nz, d) => ({ nx, ny, nz, d });
  r.planes = [P(-1, 0, 0, -r.x0), P(1, 0, 0, r.x1), P(0, 0, -1, -r.z0), P(0, 0, 1, r.z1), P(0, -1, 0, -r.y0)];
  if (r.dir === '+x') r.planes.push(P(-s, 1, 0, r.lowY - s * r.x0));
  else if (r.dir === '-x') r.planes.push(P(s, 1, 0, r.lowY + s * r.x1));
  else if (r.dir === '+z') r.planes.push(P(0, 1, -s, r.lowY - s * r.z0));
  else r.planes.push(P(0, 1, s, r.lowY + s * r.z1));
  return r;
}

// Highest point of the ramp surface under a footprint (-Infinity if it doesn't overlap). Like boxes, a hull rests on
// whichever edge touches highest, which is what a Quake box hull does on a slope.
export function rampTop(r, fx0, fz0, fx1, fz1) {
  if (fx1 <= r.x0 || fx0 >= r.x1 || fz1 <= r.z0 || fz0 >= r.z1) return -Infinity;
  let t;
  if (r.dir === '+x') t = (Math.min(fx1, r.x1) - r.x0) / (r.x1 - r.x0);
  else if (r.dir === '-x') t = (r.x1 - Math.max(fx0, r.x0)) / (r.x1 - r.x0);
  else if (r.dir === '+z') t = (Math.min(fz1, r.z1) - r.z0) / (r.z1 - r.z0);
  else t = (r.z1 - Math.max(fz0, r.z0)) / (r.z1 - r.z0);
  return r.lowY + (r.highY - r.lowY) * Math.max(0, Math.min(1, t));
}

// Ray vs convex solid given as half-spaces n·p ≤ d.
export function rayConvex(ox, oy, oz, dx, dy, dz, planes, maxT) {
  let t0 = 0;
  let t1 = maxT;
  for (const p of planes) {
    const denom = p.nx * dx + p.ny * dy + p.nz * dz;
    const dist = p.nx * ox + p.ny * oy + p.nz * oz - p.d;
    if (Math.abs(denom) < 1e-9) {
      if (dist > 0) return null;
      continue;
    }
    const t = -dist / denom;
    if (denom < 0) {
      if (t > t0) t0 = t;
    } else if (t < t1) t1 = t;
    if (t0 > t1) return null;
  }
  return t0;
}

export class World {
  constructor(layout) {
    this.terrain = layout.terrain;
    this.boxes = layout.boxes;
    this.cylinders = layout.cylinders;
    this.ramps = (layout.ramps || []).map(prepareRamp);
    this.boundaryR = layout.boundaryR;
    this.pads = layout.pads;
    this.spawns = layout.spawns;
  }

  // Nearest solid hit along a normalized ray: { t, kind, obj } or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    let kind = null;
    let obj = null;
    for (const b of this.boxes) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, b, best);
      if (t !== null && t < best) {
        best = t;
        kind = 'box';
        obj = b;
      }
    }
    for (const c of this.cylinders) {
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, c, best);
      if (t !== null && t < best) {
        best = t;
        kind = 'tree';
        obj = c;
      }
    }
    for (const r of this.ramps) {
      const t = rayConvex(ox, oy, oz, dx, dy, dz, r.planes, best);
      if (t !== null && t < best) {
        best = t;
        kind = 'ramp';
        obj = r;
      }
    }
    const tt = this.terrain.raycast(ox, oy, oz, dx, dy, dz, best);
    if (tt !== null && tt < best) {
      best = tt;
      kind = 'terrain';
      obj = null;
    }
    return kind ? { t: best, kind, obj } : null;
  }

  segmentClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len) === null;
  }

  // Highest surface under the hull footprint that is at or below maxY (terrain always counts).
  supportHeight(x, z, hw, maxY) {
    let g = this.terrain.heightAt(x, z);
    for (const b of this.boxes) {
      if (b.y1 > maxY || b.y1 <= g) continue;
      if (x + hw > b.x0 && x - hw < b.x1 && z + hw > b.z0 && z - hw < b.z1) g = b.y1;
    }
    for (const r of this.ramps) {
      const t = rampTop(r, x - hw, z - hw, x + hw, z + hw);
      if (t > g && t <= maxY) g = t;
    }
    return g;
  }

  // Top of everything under the footprint, regardless of height (nav grid).
  surfaceTop(x, z, hw) {
    let g = this.terrain.heightAt(x, z);
    for (const b of this.boxes) {
      if (b.y1 <= g) continue;
      if (x + hw > b.x0 && x - hw < b.x1 && z + hw > b.z0 && z - hw < b.z1) g = b.y1;
    }
    for (const r of this.ramps) g = Math.max(g, rampTop(r, x - hw, z - hw, x + hw, z + hw));
    return g;
  }

  // Ramp surface the hull at feet height y is sunk into (highest), or -Infinity.
  rampAbove(x, y, z, hw, h) {
    let top = -Infinity;
    for (const r of this.ramps) {
      if (y + h <= r.y0) continue;
      const t = rampTop(r, x - hw, z - hw, x + hw, z + hw);
      if (t > y + EPS && t > top) top = t;
    }
    return top;
  }

  hullFree(x, y, z, hw, h) {
    for (const b of this.boxes) if (hullBox(x, y, z, hw, h, b)) return false;
    for (const c of this.cylinders) if (hullCylinder(x, y, z, hw, h, c)) return false;
    if (this.rampAbove(x, y, z, hw, h) > -Infinity) return false;
    return true;
  }
}
