// Bot brain: produces the same command a player would (wish direction, jump, crouch, fire) plus view angles.
// Aim = delayed perception + velocity extrapolation + smoothed crosshair + hand wobble. Movement = duel
// strafe rhythm while engaged, A* hunting when it can't see you, retreating to recharge shields (Halo).
import { BOT_LEVELS, BOT } from '../data/bots.js';
import { LG } from '../data/weapons.js';
import { HULL, MOVE } from '../data/physics.js';
import { yawTo, pitchTo, clamp, viewDir } from '../core/math.js';
import { eyeHeight } from './Movement.js';

const HIST = 200; // 1.6 s of samples at 125 Hz
const V = { x: 0, y: 0, z: 0 };

export class BotBrain {
  constructor(self, level, sim) {
    this.f = self;
    this.level = level;
    this.L = BOT_LEVELS[level];
    this.sim = sim;
    this.hist = Array.from({ length: HIST }, () => ({ t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: true, h: 56 }));
    this.histN = 0;
    this.histHead = 0;
    this.targetSpawn = -1;
    this.mySpawn = -1;
    this.cmd = { wishX: 0, wishZ: 0, jump: false, crouch: false, fire: false };
    const r = sim.rng;
    this.ph = [r() * 10, r() * 10, r() * 10, r() * 10, r() * 10, r() * 10];
    this.noiseT = 0;
    this.pullT = 0;
    this.stuckCount = 0;
    this.aimX = this.aimY = this.aimZ = 0;
    this.aimTX = this.aimTY = this.aimTZ = 0;
    this.aimInit = false;
    this.reset();
  }

  reset() {
    const r = this.sim.rng;
    this.mode = 'hunt';
    this.strafeSign = r() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.crouchT = 0;
    this.jumpQueued = false;
    this.losTick = 0;
    this.hasLos = false;
    this.seenFor = 0;
    this.lostFor = 99;
    this.path = null;
    this.pathI = 0;
    this.repathT = 0;
    this.firing = false;
    this.stuckT = 0;
    this.flying = false;
    this.retreatT = 0;
    this.retreatGoal = null;
    this.roamGoal = null;
    this.prevShield = this.f.shield;
    this.rangeGoal = this.L.rangeGoal;
  }

  observe(T, now) {
    if (T.spawnCount !== this.targetSpawn) {
      this.targetSpawn = T.spawnCount;
      this.histN = 0; // new life: forget where it was
    }
    if (!T.alive) return;
    const s = this.hist[this.histHead];
    const b = T.body;
    s.t = now;
    s.x = b.x;
    s.y = b.y;
    s.z = b.z;
    s.vx = b.vx;
    s.vy = b.vy;
    s.vz = b.vz;
    s.g = b.onGround;
    s.h = b.height;
    this.histHead = (this.histHead + 1) % HIST;
    if (this.histN < HIST) this.histN++;
  }

  // Newest sample at or before time tq (what the bot has "processed" by now).
  perceive(tq) {
    for (let i = 1; i <= this.histN; i++) {
      const s = this.hist[(this.histHead - i + HIST) % HIST];
      if (s.t <= tq) return s;
    }
    return null;
  }

  canSee(T) {
    const b = this.f.body;
    const w = this.sim.world;
    const e = b.y + eyeHeight(b);
    const tb = T.body;
    return (
      w.segmentClear(b.x, e, b.z, tb.x, tb.y + tb.height * 0.8, tb.z) ||
      w.segmentClear(b.x, e, b.z, tb.x, tb.y + tb.height * 0.3, tb.z)
    );
  }

  think(dt, now, T, live) {
    const f = this.f;
    const b = f.body;
    const L = this.L;
    const c = this.cmd;
    c.wishX = c.wishZ = 0;
    c.jump = c.crouch = c.fire = false;
    if (!f.alive) {
      this.firing = false;
      return c;
    }
    if (f.spawnCount !== this.mySpawn) {
      this.mySpawn = f.spawnCount;
      this.reset();
    }

    if (--this.losTick <= 0) {
      this.losTick = BOT.losEvery;
      this.hasLos = T.alive && this.canSee(T);
    }
    if (this.hasLos) {
      this.seenFor += dt;
      this.lostFor = 0;
    } else {
      this.seenFor = 0;
      this.lostFor += dt;
    }

    const tb = T.body;
    const dx = tb.x - b.x;
    const dz = tb.z - b.z;
    const dist = Math.hypot(dx, dz);
    const dist3 = Math.hypot(dist, tb.y + tb.height * 0.5 - (b.y + eyeHeight(b)));

    if (this.prevShield > 0 && f.shield <= 0 && this.mode !== 'retreat' && this.sim.rng() < L.retreat) {
      this.mode = 'retreat';
      this.retreatT = 0;
      this.retreatGoal = null;
      this.path = null;
    }
    this.prevShield = f.shield;

    this.aim(dt, now);
    this.trigger(T, dist3, live);

    if (this.mode === 'retreat') {
      this.retreatT += dt;
      if (f.shield >= BOT.retreatShieldDone || this.retreatT > BOT.retreatMaxTime || (this.hasLos && dist < 340) || !T.alive) {
        this.mode = 'hunt';
        this.path = null;
      }
    }
    if (this.mode !== 'retreat') {
      const engage = T.alive && (this.hasLos || this.lostFor < BOT.losGrace) && dist < BOT.engageRange;
      if (engage && this.mode !== 'engage') this.strafeT = 0;
      if (!engage && this.mode === 'engage') this.path = null;
      this.mode = engage ? 'engage' : 'hunt';
    }

    if (this.mode === 'engage') this.engage(dt, now, dx, dz, dist);
    else if (this.mode === 'retreat') this.retreat(dt, T);
    else this.hunt(dt, T);

    this.unstick(dt);
    if (this.crouchT > 0) {
      this.crouchT -= dt;
      c.crouch = true;
    }
    if (this.jumpQueued && b.onGround) {
      c.jump = true;
      this.jumpQueued = false;
    }
    return c;
  }

  aim(dt, now) {
    const f = this.f;
    const b = f.body;
    const L = this.L;
    const s = this.perceive(now - L.reaction);
    if (!s) return;
    // Extrapolate across perception delay + crosshair lag. Straight lines get tracked; direction changes don't.
    const lead = (L.reaction + L.tau) * L.lead;
    const px = s.x + s.vx * lead;
    const pz = s.z + s.vz * lead;
    let py = s.y;
    if (!s.g) {
      const linear = s.vy * lead;
      const ballistic = linear - 0.5 * this.sim.phys.gravity * lead * lead;
      py += L.gravAware * ballistic + (1 - L.gravAware) * linear;
    }
    this.noiseT += dt;
    const n = this.noiseT;
    const p = this.ph;
    const jx = (Math.sin(n * 1.7 + p[0]) * 0.6 + Math.sin(n * 4.3 + p[1]) * 0.4) * L.jitter;
    const jy = (Math.sin(n * 1.9 + p[2]) * 0.6 + Math.sin(n * 3.7 + p[3]) * 0.4) * L.jitter * 0.8;
    const jz = (Math.sin(n * 1.3 + p[4]) * 0.6 + Math.sin(n * 5.1 + p[5]) * 0.4) * L.jitter;
    const ax = px + jx;
    const ay = py + s.h * 0.55 + jy;
    const az = pz + jz;
    // Smooth the aim POINT in world space: the crosshair lags the target's motion (tau), never the bot's own
    // strafing (humans compensate their own movement for free).
    if (!this.aimInit) {
      this.aimX = ax;
      this.aimY = ay;
      this.aimZ = az;
      this.aimInit = true;
    } else {
      const k = 1 - Math.exp(-dt / L.tau);
      this.aimX += (ax - this.aimX) * k;
      this.aimY += (ay - this.aimY) * k;
      this.aimZ += (az - this.aimZ) * k;
    }
    const ex = b.x;
    const ey = b.y + eyeHeight(b);
    const ez = b.z;
    f.yaw = yawTo(this.aimX - ex, this.aimZ - ez);
    f.pitch = clamp(pitchTo(this.aimX - ex, this.aimY - ey, this.aimZ - ez), -1.5, 1.5);
    this.aimTX = px;
    this.aimTY = py + s.h * 0.55;
    this.aimTZ = pz;
  }

  trigger(T, dist3, live) {
    const L = this.L;
    if (!live || !T.alive || !this.hasLos || this.seenFor < L.reaction || dist3 > LG.range + 30) {
      this.firing = false;
      return;
    }
    const f = this.f;
    const b = f.body;
    viewDir(f.yaw, f.pitch, V);
    const ex = b.x;
    const ey = b.y + eyeHeight(b);
    const ez = b.z;
    let ax = this.aimTX - ex;
    let ay = this.aimTY - ey;
    let az = this.aimTZ - ez;
    const l = Math.hypot(ax, ay, az) || 1;
    ax /= l;
    ay /= l;
    az /= l;
    const err = Math.acos(clamp(V.x * ax + V.y * ay + V.z * az, -1, 1));
    const tol = Math.atan2(HULL.halfWidth * BOT.fireTolerance, dist3);
    this.firing = this.firing ? err < tol * 2 : err < tol;
    this.cmd.fire = this.firing;
  }

  engage(dt, now, dx, dz, dist) {
    const f = this.f;
    const c = this.cmd;
    const underFire = now - f.lastDamageAt < BOT.underFireWindow;
    this.strafeT -= dt * (underFire ? 1.7 : 1);
    if (this.strafeT <= 0) this.newStrafe();
    const inv = 1 / Math.max(dist, 1);
    const fx = dx * inv;
    const fz = dz * inv;
    const rangeErr = clamp((dist - this.rangeGoal) / 250, -1, 1) * 0.75;
    const wish = () => [-fz * this.strafeSign + fx * rangeErr, fx * this.strafeSign + fz * rangeErr];
    let [wx, wz] = wish();
    let p = this.probe(wx, wz);
    if (p === 'wall') {
      this.strafeSign *= -1;
      this.strafeT = Math.max(this.strafeT, 0.25);
      [wx, wz] = wish();
      p = this.probe(wx, wz);
      if (p === 'wall') {
        wx = fx * (rangeErr || 0.5);
        wz = fz * (rangeErr || 0.5);
        p = this.probe(wx, wz);
      }
    }
    if (p === 'jump') this.jumpQueued = true;
    c.wishX = wx;
    c.wishZ = wz;
  }

  newStrafe() {
    const L = this.L;
    const b = this.f.body;
    const r = this.sim.rng;
    const airborne = !b.onGround;
    if (!airborne || r() < L.airReverse) this.strafeSign *= -1;
    this.strafeT = r() < L.fakeChance ? 0.1 + r() * 0.12 : L.switchMin + r() * (L.switchMax - L.switchMin);
    if (!airborne && r() < L.jumpChance) this.jumpQueued = true;
    if (!airborne && r() < L.crouchChance) this.crouchT = 0.25 + r() * 0.4;
    this.rangeGoal = L.rangeGoal + (r() - 0.5) * 180;
  }

  // What's 44 units ahead: 'ok', 'jump' (a ledge worth hopping) or 'wall'.
  probe(wx, wz) {
    const l = Math.hypot(wx, wz);
    if (l < 1e-3) return 'ok';
    const b = this.f.body;
    const px = b.x + (wx / l) * 44;
    const pz = b.z + (wz / l) * 44;
    if (Math.hypot(px, pz) > this.sim.world.boundaryR - 30) return 'wall';
    const nav = this.sim.nav;
    const cell = nav.cellAt(px, pz);
    if (cell < 0 || !nav.ok[cell]) return 'wall';
    const rise = nav.h[cell] - b.y;
    if (rise > MOVE.jumpRise) return 'wall';
    if (rise > MOVE.stepHeight) return 'jump';
    return 'ok';
  }

  hunt(dt, T) {
    if (T.alive) {
      this.followPath(dt, T.body.x, T.body.z, T.body.onGround ? T.body.y : null);
      return;
    }
    const b = this.f.body;
    if (!this.roamGoal || Math.hypot(this.roamGoal.x - b.x, this.roamGoal.z - b.z) < 60) {
      const nav = this.sim.nav;
      for (let i = 0; i < 30; i++) {
        const k = (this.sim.rng() * nav.n * nav.n) | 0;
        if (nav.ok[k]) {
          this.roamGoal = { x: nav.cx(k), z: nav.cz(k) };
          this.path = null;
          break;
        }
      }
    }
    if (this.roamGoal) this.followPath(dt, this.roamGoal.x, this.roamGoal.z);
  }

  retreat(dt, T) {
    if (!this.retreatGoal) this.retreatGoal = this.pickHide(T);
    if (!this.retreatGoal) {
      this.mode = 'hunt';
      return;
    }
    const b = this.f.body;
    if (Math.hypot(this.retreatGoal.x - b.x, this.retreatGoal.z - b.z) < 40) {
      // Behind cover waiting for shields: shuffle so it isn't a free target if you round the corner.
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeSign *= -1;
        this.strafeT = 0.3 + this.sim.rng() * 0.4;
      }
      const ang = Math.atan2(T.body.z - b.z, T.body.x - b.x);
      const wx = -Math.sin(ang) * this.strafeSign * 0.5;
      const wz = Math.cos(ang) * this.strafeSign * 0.5;
      if (this.probe(wx, wz) === 'ok') {
        this.cmd.wishX = wx;
        this.cmd.wishZ = wz;
      }
      return;
    }
    this.followPath(dt, this.retreatGoal.x, this.retreatGoal.z);
  }

  pickHide(T) {
    const nav = this.sim.nav;
    const w = this.sim.world;
    const r = this.sim.rng;
    const b = this.f.body;
    const tb = T.body;
    const te = tb.y + eyeHeight(tb);
    let best = null;
    let bestS = -Infinity;
    for (let i = 0; i < 60; i++) {
      const k = (r() * nav.n * nav.n) | 0;
      if (!nav.ok[k]) continue;
      const x = nav.cx(k);
      const z = nav.cz(k);
      const dT = Math.hypot(x - tb.x, z - tb.z);
      const dB = Math.hypot(x - b.x, z - b.z);
      if (dT < 350 || dB > 900) continue;
      if (w.segmentClear(tb.x, te, tb.z, x, nav.h[k] + 40, z)) continue;
      const s = dT * 0.6 - dB;
      if (s > bestS) {
        bestS = s;
        best = { x, z };
      }
    }
    return best;
  }

  followPath(dt, gx, gz, gy = null) {
    const b = this.f.body;
    const c = this.cmd;
    const nav = this.sim.nav;
    if (!b.onGround && b.padCooldown > 0.2) this.flying = true;
    if (this.flying) {
      if (!b.onGround) return; // ride the launcher; it's aimed at the landing spot
      this.flying = false;
      this.path = null;
    }
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || this.pathI >= this.path.length) {
      this.path = nav.findPath(b.x, b.z, gx, gz, b.onGround ? b.y : null, gy);
      this.pathI = 0;
      this.repathT = BOT.repath;
      this.pullT = 0;
    }
    if (!this.path || this.pathI >= this.path.length) {
      const wx = gx - b.x;
      const wz = gz - b.z;
      const l = Math.hypot(wx, wz);
      if (l > 8) {
        c.wishX = wx / l;
        c.wishZ = wz / l;
        if (this.probe(c.wishX, c.wishZ) === 'jump') this.jumpQueued = true;
      }
      return;
    }
    const path = this.path;
    let node = path[this.pathI];
    while (!node.pad && this.pathI < path.length - 1 && Math.hypot(node.x - b.x, node.z - b.z) < 22) node = path[++this.pathI];

    // String-pull: skip ahead along flat runs we can see straight down (centre + both hull edges).
    this.pullT -= dt;
    if (this.pullT <= 0) {
      this.pullT = 0.1;
      const w = this.sim.world;
      for (let k = Math.min(path.length - 1, this.pathI + 6); k > this.pathI; k--) {
        let flat = true;
        for (let m = this.pathI; m <= k; m++) {
          if (path[m].jump || path[m].pad) {
            flat = false;
            break;
          }
        }
        if (!flat) continue;
        const n2 = path[k];
        const ddx = n2.x - b.x;
        const ddz = n2.z - b.z;
        const l = Math.hypot(ddx, ddz) || 1;
        const ox = (-ddz / l) * HULL.halfWidth;
        const oz = (ddx / l) * HULL.halfWidth;
        const y0 = b.y + 22;
        const y1 = n2.h + 22;
        if (
          w.segmentClear(b.x, y0, b.z, n2.x, y1, n2.z) &&
          w.segmentClear(b.x + ox, y0, b.z + oz, n2.x + ox, y1, n2.z + oz) &&
          w.segmentClear(b.x - ox, y0, b.z - oz, n2.x - ox, y1, n2.z - oz)
        ) {
          this.pathI = k;
          node = n2;
          break;
        }
      }
    }

    const tx = node.pad ? node.pad.x : node.x;
    const tz = node.pad ? node.pad.z : node.z;
    const wx = tx - b.x;
    const wz = tz - b.z;
    const l = Math.hypot(wx, wz) || 1;
    c.wishX = wx / l;
    c.wishZ = wz / l;
    const rise = node.h - b.y;
    if (b.onGround && rise > MOVE.jumpRise + 8 && l < 48) this.path = null; // can't climb that: replan
    else if ((node.jump || rise > MOVE.stepHeight) && b.onGround && l < 64) this.jumpQueued = true;
  }

  unstick(dt) {
    const b = this.f.body;
    const c = this.cmd;
    const wants = Math.hypot(c.wishX, c.wishZ) > 0.3;
    if (wants && b.onGround && Math.hypot(b.vx, b.vz) < BOT.stuckSpeed) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > BOT.stuckTime) {
      this.stuckT = 0;
      this.stuckCount++;
      this.jumpQueued = true;
      this.strafeSign *= -1;
      this.path = null;
    }
  }
}
