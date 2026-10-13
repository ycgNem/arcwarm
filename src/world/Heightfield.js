// Terrain heightfield. heightAt() interpolates exactly like the rendered triangles (diagonal 00→11),
// so what you see is what you stand on and what the beam hits.
export class Heightfield {
  constructor({ size, cells, fn }) {
    this.size = size;
    this.n = cells;
    this.step = size / cells;
    this.origin = -size / 2;
    const n1 = cells + 1;
    this.h = new Float32Array(n1 * n1);
    let max = -Infinity;
    let min = Infinity;
    for (let j = 0; j < n1; j++) {
      for (let i = 0; i < n1; i++) {
        const v = fn(this.origin + i * this.step, this.origin + j * this.step);
        this.h[j * n1 + i] = v;
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
    this.maxH = max;
    this.minH = min;
  }

  heightAt(x, z) {
    const n = this.n;
    const n1 = n + 1;
    let fx = (x - this.origin) / this.step;
    let fz = (z - this.origin) / this.step;
    if (fx < 0) fx = 0;
    else if (fx > n - 1e-6) fx = n - 1e-6;
    if (fz < 0) fz = 0;
    else if (fz > n - 1e-6) fz = n - 1e-6;
    const i = fx | 0;
    const j = fz | 0;
    const u = fx - i;
    const v = fz - j;
    const k = j * n1 + i;
    const h00 = this.h[k];
    const h10 = this.h[k + 1];
    const h01 = this.h[k + n1];
    const h11 = this.h[k + n1 + 1];
    return v >= u ? h00 + (h11 - h01) * u + (h01 - h00) * v : h00 + (h10 - h00) * u + (h11 - h10) * v;
  }

  // Direction must be normalized. Marches then bisects; returns t or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    const STEP = 6;
    if (oy < this.heightAt(ox, oz)) return 0;
    let prevT = 0;
    for (let t = STEP; ; t += STEP) {
      const tt = t > maxT ? maxT : t;
      const y = oy + dy * tt;
      if (y < this.heightAt(ox + dx * tt, oz + dz * tt)) {
        let lo = prevT;
        let hi = tt;
        for (let k = 0; k < 10; k++) {
          const m = (lo + hi) * 0.5;
          if (oy + dy * m < this.heightAt(ox + dx * m, oz + dz * m)) hi = m;
          else lo = m;
        }
        return hi;
      }
      if (tt >= maxT) return null;
      if (dy >= 0 && y > this.maxH) return null;
      prevT = tt;
    }
  }
}
