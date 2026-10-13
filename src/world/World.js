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

export class World {
  constructor(layout) {
    this.terrain = layout.terrain;
    this.boxes = layout.boxes;
    this.cylinders = layout.cylinders;
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
    return g;
  }

  // Top of everything under the footprint, regardless of height (nav grid).
  surfaceTop(x, z, hw) {
    let g = this.terrain.heightAt(x, z);
    for (const b of this.boxes) {
      if (b.y1 <= g) continue;
      if (x + hw > b.x0 && x - hw < b.x1 && z + hw > b.z0 && z - hw < b.z1) g = b.y1;
    }
    return g;
  }

  hullFree(x, y, z, hw, h) {
    for (const b of this.boxes) if (hullBox(x, y, z, hw, h, b)) return false;
    for (const c of this.cylinders) if (hullCylinder(x, y, z, hw, h, c)) return false;
    return true;
  }
}
