// 2.5D nav grid for the bots: one walkable height per cell. Edges: walk (rise ≤ step), jump (rise ≤ jumpRise),
// drop (any fall), plus one-way launcher links. A* with a binary heap; ~4k cells, so it's cheap.
import { HULL, MOVE } from '../data/physics.js';

export class NavGrid {
  constructor(world, { half = 1024, cell = 32 } = {}) {
    this.world = world;
    this.half = half;
    this.cell = cell;
    this.n = Math.round((2 * half) / cell);
    const N = this.n * this.n;
    this.h = new Float32Array(N);
    this.ok = new Uint8Array(N);
    this.links = new Map(); // cell → [{ to, cost, pad }]
    this.build();
    this._g = new Float32Array(N);
    this._f = new Float32Array(N);
    this._from = new Int32Array(N);
    this._stamp = new Uint32Array(N);
    this._closed = new Uint32Array(N);
    this._run = 0;
  }

  cellAt(x, z) {
    const i = Math.floor((x + this.half) / this.cell);
    const j = Math.floor((z + this.half) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }

  cx(idx) {
    return (idx % this.n) * this.cell - this.half + this.cell / 2;
  }
  cz(idx) {
    return Math.floor(idx / this.n) * this.cell - this.half + this.cell / 2;
  }

  build() {
    const w = this.world;
    const hw = HULL.halfWidth;
    for (let idx = 0; idx < this.n * this.n; idx++) {
      const x = this.cx(idx);
      const z = this.cz(idx);
      let ok = Math.hypot(x, z) < w.boundaryR - 24;
      if (ok) {
        for (const c of w.cylinders) {
          if (Math.hypot(x - c.x, z - c.z) < c.r + hw + 2) {
            ok = false;
            break;
          }
        }
      }
      // Cells straddling a cliff (plateau/slab edges) are ambiguous about which level you're on: avoid them.
      if (ok) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const [ox, oz] of [[0, 0], [-14, -14], [14, -14], [-14, 14], [14, 14]]) {
          const s = w.surfaceTop(x + ox, z + oz, 2);
          if (s < lo) lo = s;
          if (s > hi) hi = s;
        }
        if (hi - lo > MOVE.jumpRise) ok = false;
      }
      this.ok[idx] = ok ? 1 : 0;
      this.h[idx] = w.surfaceTop(x, z, hw - 1);
    }
    for (const p of w.pads) {
      const from = this.cellAt(p.x, p.z);
      const to = this.cellAt(p.target.x, p.target.z);
      if (from < 0 || to < 0) continue;
      const flight = Math.hypot(p.target.x - p.x, p.target.z - p.z);
      if (!this.links.has(from)) this.links.set(from, []);
      this.links.get(from).push({ to, cost: 120 + flight * 0.35, pad: p });
    }
  }

  passable(a, b) {
    return this.ok[b] && this.h[b] - this.h[a] <= MOVE.jumpRise;
  }

  // Nearest usable cell, preferring one at the height you're actually standing at (y).
  nearestOk(idx, y = null, maxRing = 5) {
    if (idx < 0) return -1;
    if (this.ok[idx] && (y === null || Math.abs(this.h[idx] - y) <= MOVE.stepHeight)) return idx;
    const n = this.n;
    const i0 = idx % n;
    const j0 = Math.floor(idx / n);
    let best = -1;
    let bestS = Infinity;
    for (let r = 0; r <= maxRing; r++) {
      if (best >= 0 && r * this.cell > bestS) break;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const k = j * n + i;
          if (!this.ok[k]) continue;
          const s = r * this.cell + (y === null ? 0 : Math.abs(this.h[k] - y) * 2);
          if (s < bestS) {
            bestS = s;
            best = k;
          }
        }
      }
    }
    return best;
  }

  // Returns [{ x, z, h, jump, pad }] from the cell after start up to goal, or null.
  findPath(sx, sz, gx, gz, sy = null, gy = null) {
    const start = this.nearestOk(this.cellAt(sx, sz), sy);
    const goal = this.nearestOk(this.cellAt(gx, gz), gy);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [];
    const run = ++this._run;
    const n = this.n;
    const g = this._g;
    const f = this._f;
    const from = this._from;
    const stamp = this._stamp;
    const closed = this._closed;
    const heur = (k) => Math.hypot(this.cx(k) - this.cx(goal), this.cz(k) - this.cz(goal));
    const heap = [];
    const push = (k) => {
      heap.push(k);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (f[heap[p]] <= f[heap[i]]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const padVia = new Map();
    const relax = (cur, k, cost, pad) => {
      const ng = g[cur] + cost;
      if (stamp[k] === run && ng >= g[k]) return;
      stamp[k] = run;
      g[k] = ng;
      f[k] = ng + heur(k);
      from[k] = cur;
      if (pad) padVia.set(k, pad);
      else padVia.delete(k);
      push(k);
    };
    stamp[start] = run;
    g[start] = 0;
    f[start] = heur(start);
    from[start] = -1;
    push(start);
    let found = false;
    let expanded = 0;
    while (heap.length) {
      const cur = pop();
      if (closed[cur] === run) continue;
      closed[cur] = run;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expanded > 6000) break;
      const i = cur % n;
      const j = Math.floor(cur / n);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const k = jj * n + ii;
          if (closed[k] === run || !this.passable(cur, k)) continue;
          if (di && dj && (!this.passable(cur, j * n + ii) || !this.passable(cur, jj * n + i))) continue;
          const rise = this.h[k] - this.h[cur];
          const cost = this.cell * (di && dj ? 1.4142 : 1) + (rise > MOVE.stepHeight ? 48 : 0);
          relax(cur, k, cost, null);
        }
      }
      const links = this.links.get(cur);
      if (links) for (const l of links) if (closed[l.to] !== run) relax(cur, l.to, l.cost, l.pad);
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== start; k = from[k]) cells.push(k);
    cells.reverse();
    let prevH = this.h[start];
    return cells.map((k) => {
      const node = {
        x: this.cx(k),
        z: this.cz(k),
        h: this.h[k],
        jump: this.h[k] - prevH > MOVE.stepHeight,
        pad: padVia.get(k) || null,
      };
      prevH = this.h[k];
      return node;
    });
  }
}
