// The duel itself: fixed-tick simulation of two fighters, the lightning gun, Halo vitals, spawns, the match clock
// and tracking stats. No Three, no DOM, so tools/ can run whole matches in Node.
import { HULL, GRAVITY_PRESETS } from '../data/physics.js';
import { LG } from '../data/weapons.js';
import { VITALS, MATCH } from '../data/match.js';
import { BOT_LEVELS } from '../data/bots.js';
import { viewDir } from '../core/math.js';
import { mulberry32 } from '../core/rng.js';
import { makeBody, placeBody, stepBody, eyeHeight } from './Movement.js';
import { rayBox } from '../world/World.js';
import { BotBrain } from './BotBrain.js';

const IDLE = { wishX: 0, wishZ: 0, jump: false, crouch: false, fire: false };
const D = { x: 0, y: 0, z: 0 };
const TRACK_GAP = 0.16; // a track survives one dropped hit (two intervals) before it counts as broken

export function makeStats() {
  return {
    shots: 0,
    hits: 0,
    dmg: 0,
    taken: 0,
    frags: 0,
    deaths: 0,
    airShots: 0,
    airHits: 0,
    gndShots: 0,
    gndHits: 0,
    miss: { ahead: 0, behind: 0, above: 0, below: 0 },
    trackLongest: 0,
    trackStart: -1,
    lastHitT: -9,
    shieldBreaks: 0,
    healed: 0,
  };
}

// The pose the renderer shows at `alpha` (0..1) between the previous and current tick. Game draws with this, and
// the player's beam is tested against exactly this (shooter eye and target box), so hits match the screen.
export function lerpPose(f, alpha, out) {
  const p = f.prev;
  const b = f.body;
  out.x = p.x + (b.x - p.x) * alpha;
  out.y = p.y + (b.y - p.y) * alpha;
  out.z = p.z + (b.z - p.z) * alpha;
  out.eye = p.y + p.eye + (b.y + eyeHeight(b) - p.y - p.eye) * alpha;
  out.height = b.height;
  return out;
}

export class Fighter {
  constructor(id, name, isBot) {
    this.id = id;
    this.name = name;
    this.isBot = isBot;
    this.body = makeBody();
    this.prev = { x: 0, y: 0, z: 0, eye: HULL.eye };
    this.yaw = 0;
    this.pitch = 0;
    this.health = VITALS.health;
    this.shield = VITALS.shield;
    this.alive = false;
    this.respawnIn = 0;
    this.lastDamageAt = -99;
    this.recharging = false;
    this.lgTimer = 0;
    this.firing = false;
    this.renderPos = null; // where the opponent last SAW this fighter on screen (favor-the-shooter hit test)
    this.renderEye = null; // where this (human) fighter's camera was on that same frame
    this.spawnCount = 0;
    this.stats = makeStats();
  }
  eyeY() {
    return this.body.y + eyeHeight(this.body);
  }
}

export class Sim {
  constructor({ world, nav, difficulty = 'hard', gravity = 'halo', length = 180, lifesteal = 1, spectate = null, seed = null }) {
    this.world = world;
    this.nav = nav;
    this.difficulty = difficulty;
    this.phys = GRAVITY_PRESETS[gravity] || GRAVITY_PRESETS.halo;
    this.length = length;
    this.lifesteal = lifesteal;
    this.rng = seed == null ? Math.random : mulberry32(seed);
    this.time = 0;
    this.clock = 0;
    this.state = 'countdown';
    this.countdown = MATCH.countdown;
    this.events = [];
    this.player = new Fighter(0, 'You', false);
    this.bot = new Fighter(1, `${BOT_LEVELS[difficulty].label} Bot`, true);
    this.fighters = [this.player, this.bot];
    this.brains = new Map();
    this.brains.set(this.bot, new BotBrain(this.bot, difficulty, this));
    if (spectate) this.brains.set(this.player, new BotBrain(this.player, spectate, this));
    this.spawn(this.player, null);
    this.spawn(this.bot, this.player);
  }

  other(f) {
    return f === this.player ? this.bot : this.player;
  }

  // Duel spawn logic: far from the enemy, preferably out of their sight, with a little randomness.
  spawn(f, enemy) {
    const w = this.world;
    let best = null;
    let bestS = -Infinity;
    for (const s of w.spawns) {
      let score = this.rng() * 250;
      if (enemy && enemy.alive) {
        const eb = enemy.body;
        score += Math.hypot(s.x - eb.x, s.z - eb.z);
        if (w.segmentClear(eb.x, enemy.eyeY(), eb.z, s.x, s.y + 40, s.z)) score -= 500;
      }
      if (score > bestS) {
        bestS = score;
        best = s;
      }
    }
    placeBody(f.body, best.x, best.y + 0.5, best.z);
    f.prev.x = best.x;
    f.prev.y = best.y + 0.5;
    f.prev.z = best.z;
    f.prev.eye = HULL.eye;
    f.yaw = best.yaw;
    f.pitch = 0;
    f.health = VITALS.health;
    f.shield = VITALS.shield;
    f.alive = true;
    f.lastDamageAt = -99;
    f.recharging = false;
    f.lgTimer = 0;
    f.firing = false;
    f.renderPos = null;
    f.renderEye = null;
    f.spawnCount++;
    this.events.push({ type: 'spawn', who: f.id });
  }

  tick(dt, input) {
    const ev = this.events;
    this.time += dt;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after > 0) ev.push({ type: 'count', n: after });
      if (this.countdown <= 0) {
        this.state = 'live';
        ev.push({ type: 'go' });
      }
    } else if (this.state === 'live') {
      this.clock += dt;
      if (this.length > 0 && this.clock >= this.length) {
        this.state = 'over';
        for (const f of this.fighters) f.firing = false;
        ev.push({ type: 'end' });
        return;
      }
    } else return;
    const live = this.state === 'live';

    for (const f of this.fighters) {
      f.prev.x = f.body.x;
      f.prev.y = f.body.y;
      f.prev.z = f.body.z;
      f.prev.eye = eyeHeight(f.body);
    }

    const cmds = this.fighters.map((f) => {
      const brain = this.brains.get(f);
      if (!brain) return input || IDLE;
      const other = this.other(f);
      brain.observe(other, this.time);
      return brain.think(dt, this.time, other, live);
    });

    this.fighters.forEach((f, i) => {
      if (!f.alive) return;
      const out = this._moveEvents || (this._moveEvents = []);
      out.length = 0;
      stepBody(f.body, cmds[i], dt, this.world, this.phys, out);
      for (const e of out) {
        e.who = f.id;
        ev.push(e);
      }
    });

    this.fighters.forEach((f, i) => {
      const wantFire = live && f.alive && cmds[i].fire;
      f.lgTimer -= dt;
      if (!wantFire) {
        if (f.lgTimer < 0) f.lgTimer = 0;
        f.firing = false;
        return;
      }
      f.firing = true;
      while (f.lgTimer <= 0) {
        this.fireLG(f, this.other(f));
        f.lgTimer += LG.interval;
        if (!f.alive) break;
      }
    });

    for (const f of this.fighters) {
      if (!f.alive) {
        f.respawnIn -= dt;
        if (f.respawnIn <= 0) this.spawn(f, this.other(f));
        continue;
      }
      if (this.time - f.lastDamageAt < VITALS.shieldDelay) continue;
      if (f.shield < VITALS.shield) {
        if (!f.recharging) {
          f.recharging = true;
          ev.push({ type: 'recharge', who: f.id });
        }
        f.shield = Math.min(VITALS.shield, f.shield + VITALS.shieldRate * dt);
      } else if (f.health < VITALS.health) {
        f.health = Math.min(VITALS.health, f.health + VITALS.healthRate * dt);
      }
    }
  }

  fireLG(f, t) {
    const b = f.body;
    // The player shoots from the camera position they saw; bots from their live eye.
    const eye = !f.isBot ? f.renderEye : null;
    const ox = eye ? eye.x : b.x;
    const oy = eye ? eye.y : f.eyeY();
    const oz = eye ? eye.z : b.z;
    viewDir(f.yaw, f.pitch, D);
    const wh = this.world.raycast(ox, oy, oz, D.x, D.y, D.z, LG.range);
    const maxT = wh ? wh.t : LG.range;
    const st = f.stats;
    const now = this.time;

    let hitT = null;
    let tp = null;
    if (t.alive) {
      // The player hits what they saw on screen; bots hit the live tick state.
      tp = !f.isBot && t.renderPos ? t.renderPos : t.body;
      const hw = HULL.halfWidth;
      const box = { x0: tp.x - hw, x1: tp.x + hw, y0: tp.y, y1: tp.y + (tp.height ?? t.body.height), z0: tp.z - hw, z1: tp.z + hw };
      hitT = rayBox(ox, oy, oz, D.x, D.y, D.z, box, maxT);
    }

    st.shots++;
    const airborne = t.alive && !t.body.onGround;
    if (airborne) st.airShots++;
    else st.gndShots++;

    if (hitT !== null) {
      st.hits++;
      if (airborne) st.airHits++;
      else st.gndHits++;
      if (now - st.lastHitT > TRACK_GAP) st.trackStart = now;
      st.lastHitT = now;
      st.trackLongest = Math.max(st.trackLongest, now - st.trackStart + LG.interval);
      this.damage(t, LG.damage, f);
    } else if (tp) {
      this.classifyMiss(f, t, tp, ox, oy, oz, maxT);
    }
    this.events.push({ type: 'shot', who: f.id, hit: hitT !== null, dist: hitT ?? maxT, blocked: !!wh && hitT === null });
  }

  // Near misses only (target in sight, ray passed within 100u): were you ahead, behind, above or below?
  classifyMiss(f, t, tp, ox, oy, oz, maxT) {
    const h = tp.height ?? t.body.height;
    const cx = tp.x - ox;
    const cy = tp.y + h * 0.5 - oy;
    const cz = tp.z - oz;
    const tc = cx * D.x + cy * D.y + cz * D.z;
    if (tc <= 0 || tc > LG.range || tc > maxT) return;
    const ex = D.x * tc - cx;
    const ey = D.y * tc - cy;
    const ez = D.z * tc - cz;
    if (Math.hypot(ex, ey, ez) > 100) return;
    const rx = Math.cos(f.yaw);
    const rz = -Math.sin(f.yaw);
    const eh = ex * rx + ez * rz;
    const nh = Math.abs(eh) / HULL.halfWidth;
    const nv = Math.abs(ey) / (h * 0.5);
    const m = f.stats.miss;
    if (nv > nh) {
      if (ey > 0) m.above++;
      else m.below++;
      return;
    }
    const lateral = (t.body.vx - f.body.vx) * rx + (t.body.vz - f.body.vz) * rz;
    if (Math.abs(lateral) < 60) return;
    if (Math.sign(eh) === Math.sign(lateral)) m.ahead++;
    else m.behind++;
  }

  heal(f, amount) {
    const h = Math.min(amount, VITALS.health - f.health);
    f.health += h;
    const sh = Math.min(amount - h, VITALS.shield - f.shield);
    f.shield += sh;
    f.stats.healed += h + sh;
  }

  damage(t, dmg, attacker) {
    let rem = dmg;
    let shieldHit = false;
    if (t.shield > 0) {
      const a = Math.min(t.shield, rem);
      t.shield -= a;
      rem -= a;
      shieldHit = true;
      if (t.shield <= 0) {
        t.shield = 0;
        attacker.stats.shieldBreaks++;
        this.events.push({ type: 'shieldBreak', who: t.id });
      }
    }
    t.health -= rem;
    t.lastDamageAt = this.time;
    t.recharging = false;
    attacker.stats.dmg += dmg;
    t.stats.taken += dmg;
    if (this.lifesteal > 0) this.heal(attacker, dmg * this.lifesteal);
    const k = LG.knockback;
    t.body.vx += D.x * k;
    t.body.vz += D.z * k;
    if (!t.body.onGround) t.body.vy += D.y * k * LG.knockbackUpScale;
    this.events.push({ type: 'damage', who: t.id, by: attacker.id, amount: dmg, shield: shieldHit && rem === 0 });
    if (t.health <= 0) {
      t.health = 0;
      t.alive = false;
      t.firing = false;
      t.respawnIn = MATCH.respawnDelay;
      t.stats.deaths++;
      attacker.stats.frags++;
      this.events.push({ type: 'kill', who: t.id, by: attacker.id, x: t.body.x, y: t.body.y, z: t.body.z });
    }
  }
}
