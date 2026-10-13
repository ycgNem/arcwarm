// Browser side of the duel: owns the Sim, turns input into commands at a fixed 125 Hz, renders with interpolation,
// and routes sim events to sound, HUD and effects.
import * as THREE from 'three';
import { TICK, HULL } from '../data/physics.js';
import { LG } from '../data/weapons.js';
import { MATCH } from '../data/match.js';
import { DEG, clamp, viewDir, qlFovToVertical, yawTo } from '../core/math.js';
import { yawPerCount, pitchPerCount } from '../core/Settings.js';
import { buildForestLayout } from '../world/forestLayout.js';
import { World, rayBox } from '../world/World.js';
import { NavGrid } from '../world/NavGrid.js';
import { ForestVisuals } from '../world/ForestVisuals.js';
import { Sim } from './Sim.js';
import { eyeHeight } from './Movement.js';
import { Beam } from '../fx/Beam.js';
import { BotModel } from '../fx/BotModel.js';
import { Viewmodel } from '../fx/Viewmodel.js';
import { Effects } from '../fx/Effects.js';
import { pushHistory } from '../ui/Menus.js';

const lerp = (a, b, t) => a + (b - a) * t;
const D = { x: 0, y: 0, z: 0 };
const v3 = new THREE.Vector3();
const v3b = new THREE.Vector3();
const SPARK_BEAM = new THREE.Color(0x9fdcff);
const SPARK_SHIELD = new THREE.Color(0xffc640);
const SPARK_FLESH = new THREE.Color(0x9dff6a);

export class Game {
  constructor({ renderer, settings, audio, input, hud, menus, debug }) {
    this.renderer = renderer;
    this.s = settings;
    this.audio = audio;
    this.input = input;
    this.hud = hud;
    this.menus = menus;
    this.debug = debug;

    this.layout = buildForestLayout();
    this.world = new World(this.layout);
    this.nav = new NavGrid(this.world);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 1, 9000);
    this.camera.rotation.order = 'YXZ';
    this.visuals = new ForestVisuals(this.scene, this.layout, { shadows: settings.shadows });
    this.botModel = new BotModel(this.scene, settings.enemyColor);
    this.playerBeam = new Beam(this.scene, { color: 0x8fd0ff, glowTex: this.visuals.tex.glow });
    this.botBeam = new Beam(this.scene, { color: 0x9dffb0, glowTex: this.visuals.tex.glow });
    this.fx = new Effects(this.scene, this.visuals.tex.glow);
    this.fx.setGibColor(settings.enemyColor);
    this.viewmodel = new Viewmodel();

    this.sim = null;
    this.state = 'menu';
    this.acc = 0;
    this.time = 0;
    this.fpsFrames = 0;
    this.fpsT = 0;
    this.fps = 0;
    this.crouchComp = 0;
    this.lastCrouched = false;
    this.lowBeepT = 0;
    this.hurtT = 0;
    this.stepT = 0;
    this.deathView = null;
    this.menuOrbit = 0;

    input.onLook = (dx, dy) => this.look(dx, dy);
    this.applySettings();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  applySettings() {
    const s = this.s;
    this.camera.fov = qlFovToVertical(s.fov);
    this.camera.updateProjectionMatrix();
    this.audio.setVolume(s.volume);
    this.botModel.setColor(s.enemyColor);
    this.fx.setGibColor(s.enemyColor);
    this.visuals.sun.castShadow = s.shadows;
    this.renderer.setPixelRatio(s.renderScale);
    this.resize();
    this.hud.lastCross = '';
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(innerWidth / innerHeight);
  }

  look(dx, dy) {
    if (this.state !== 'playing' || !this.sim || this.debug.spectate) return;
    const P = this.sim.player;
    if (!P.alive) return;
    P.yaw -= dx * yawPerCount(this.s);
    P.pitch = clamp(P.pitch - dy * pitchPerCount(this.s) * (this.s.invert ? -1 : 1), -89 * DEG, 89 * DEG);
  }

  startMatch() {
    const s = this.s;
    this.sim = new Sim({
      world: this.world,
      nav: this.nav,
      difficulty: s.difficulty,
      gravity: s.gravity,
      length: this.debug.length ?? s.length,
      spectate: this.debug.spectate ? s.difficulty : null,
    });
    this.fx.gravity = this.sim.phys.gravity;
    this.acc = 0;
    this.deathView = null;
    this.state = 'playing';
    this.hud.show(true);
    this.hud.message('WARM UP', `${this.sim.bot.name} · first beam at 0`, 1.2);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.setLoop('lgSelf', false);
    this.audio.setLoop('lgBot', false);
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing';
  }

  endMatch() {
    const sim = this.sim;
    if (!sim) return null;
    this.state = 'results';
    this.hud.show(false);
    this.audio.setLoop('lgSelf', false);
    this.audio.setLoop('lgBot', false);
    const P = sim.player.stats;
    const B = sim.bot.stats;
    const r = {
      date: Date.now(),
      difficulty: sim.difficulty,
      gravity: this.s.gravity,
      seconds: sim.clock,
      you: {
        frags: P.frags,
        deaths: P.deaths,
        acc: P.shots ? Math.round((100 * P.hits) / P.shots) : 0,
        dmg: P.dmg,
        taken: P.taken,
        airShots: P.airShots,
        airHits: P.airHits,
        gndShots: P.gndShots,
        gndHits: P.gndHits,
        track: P.trackLongest,
        miss: { ...P.miss },
        breaks: P.shieldBreaks,
      },
      bot: { acc: B.shots ? Math.round((100 * B.hits) / B.shots) : 0, frags: B.frags },
    };
    this.menus.showResults(r);
    if (!this.debug.any) pushHistory(r);
    return r;
  }

  playerCmd() {
    const P = this.sim.player;
    const i = this.input;
    const f = (i.action('forward') ? 1 : 0) - (i.action('back') ? 1 : 0);
    const r = (i.action('right') ? 1 : 0) - (i.action('left') ? 1 : 0);
    const sy = Math.sin(P.yaw);
    const cy = Math.cos(P.yaw);
    return {
      wishX: -sy * f + cy * r,
      wishZ: -cy * f - sy * r,
      jump: i.action('jump'),
      crouch: i.action('crouch'),
      fire: i.action('fire'),
    };
  }

  frame(dt) {
    this.time += dt;
    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsT);
      this.fpsFrames = 0;
      this.fpsT = 0;
    }

    const sim = this.sim;
    if (this.state === 'playing' && sim) {
      this.acc += Math.min(dt, 0.1);
      while (this.acc >= TICK) {
        sim.tick(TICK, this.debug.spectate ? null : this.playerCmd());
        this.acc -= TICK;
        if (sim.state === 'over') break;
      }
      this.handleEvents();
      if (sim.state === 'over' && this.state === 'playing') {
        this.endMatch();
        this.input.unlock();
      }
    }

    if (sim && this.state !== 'menu') this.renderMatch(dt, this.state === 'playing' ? this.acc / TICK : 1);
    else this.renderMenu(dt);
  }

  // ---------- events → sound / HUD / fx ----------
  handleEvents() {
    const sim = this.sim;
    const P = sim.player;
    const B = sim.bot;
    const a = this.audio;
    const botPos = { x: B.body.x, y: B.body.y + 30, z: B.body.z };
    for (const e of sim.events) {
      switch (e.type) {
        case 'damage':
          if (e.by === P.id) {
            if (this.s.hitsound) a.play(e.shield ? 'hitShield' : 'hitHealth', { vol: 0.55 });
            this.hud.hit();
            this.botModel.hit(e.shield);
          } else {
            if (this.hurtT <= 0) {
              a.play('hurt', { vol: 0.5 });
              this.hurtT = 0.12;
            }
            this.hud.damageFrom(yawTo(B.body.x - P.body.x, B.body.z - P.body.z) - P.yaw);
          }
          break;
        case 'shieldBreak':
          if (e.who === B.id) {
            a.play('shieldPop', { vol: 0.8 });
            this.hud.feed('<span style="color:var(--shield)">Shields down</span>');
          } else a.play('shieldPop', { vol: 0.6, rate: 0.8 });
          break;
        case 'recharge':
          if (e.who === P.id) a.play('recharge', { vol: 0.5 });
          else a.play('recharge', { vol: 0.9, at: botPos });
          break;
        case 'kill':
          if (e.by === P.id) {
            a.play('kill', { vol: 0.8 });
            this.hud.message('FRAGGED', `${B.name}  ·  ${P.stats.frags} – ${B.stats.frags}`, 1.4);
            this.hud.feed(`You <span style="color:var(--beam)">⚡</span> ${B.name}`);
            this.fx.gibsAt(e, B.body);
          } else {
            a.play('death', { vol: 0.8 });
            this.hud.message('FRAGGED BY', B.name, MATCH.respawnDelay);
            this.hud.feed(`${B.name} <span style="color:var(--accent)">⚡</span> You`);
            this.deathView = { x: P.body.x, y: P.eyeY(), z: P.body.z, yaw: P.yaw, pitch: P.pitch };
          }
          break;
        case 'spawn':
          if (e.who === P.id) this.deathView = null;
          break;
        case 'jump':
          if (e.who === P.id) a.play('jump', { vol: 0.35 });
          else a.play('jump', { vol: 0.8, at: botPos });
          break;
        case 'land':
          if (e.who === P.id) {
            if (e.speed > 180) {
              a.play('land', { vol: Math.min(0.7, e.speed / 600) });
              this.viewmodel.land = Math.min(1, e.speed / 400);
            }
          } else if (e.speed > 180) a.play('land', { vol: 0.9, at: botPos });
          break;
        case 'pad':
          a.play('pad', { vol: e.who === P.id ? 0.6 : 0.9, at: e.who === P.id ? null : botPos });
          break;
        case 'count':
          a.play('count', { vol: 0.6 });
          this.hud.message(String(e.n), 'beam goes live at 0', 1);
          break;
        case 'go':
          a.play('go', { vol: 0.7 });
          this.hud.message('FIGHT', '', 0.8);
          break;
      }
    }
    sim.events.length = 0;
  }

  // ---------- rendering ----------
  renderMatch(dt, alpha) {
    const sim = this.sim;
    const P = sim.player;
    const B = sim.bot;
    const cam = this.camera;

    // Camera: interpolated eye; view angles straight from the mouse (no smoothing, no delay).
    if (P.alive) {
      const crouchedOnGround = P.body.crouched && P.body.onGround;
      if (crouchedOnGround !== this.lastCrouched && P.body.onGround) this.crouchComp += (crouchedOnGround ? 1 : -1) * (HULL.eye - HULL.crouchEye);
      this.lastCrouched = crouchedOnGround;
      this.crouchComp *= Math.exp(-dt / 0.045);
      const ey0 = P.prev.y + P.prev.eye;
      const ey1 = P.body.y + eyeHeight(P.body);
      cam.position.set(lerp(P.prev.x, P.body.x, alpha), lerp(ey0, ey1, alpha) + this.crouchComp, lerp(P.prev.z, P.body.z, alpha));
      cam.rotation.set(P.pitch, P.yaw, 0);
    } else if (this.deathView) {
      // Death cam: hold position, turn toward whoever fragged you.
      const d = this.deathView;
      cam.position.set(d.x, d.y - 20, d.z);
      const ty = yawTo(B.body.x - d.x, B.body.z - d.z);
      d.yaw += Math.atan2(Math.sin(ty - d.yaw), Math.cos(ty - d.yaw)) * Math.min(1, dt * 4);
      cam.rotation.set(-0.15, d.yaw, 0.1);
    }

    // Bot body where it is on screen, which is also where the player's beam registers.
    const bx = lerp(B.prev.x, B.body.x, alpha);
    const by = lerp(B.prev.y, B.body.y, alpha);
    const bz = lerp(B.prev.z, B.body.z, alpha);
    B.renderPos = B.alive ? { x: bx, y: by, z: bz, height: B.body.height } : null;
    this.botModel.update(
      dt,
      { alive: B.alive, x: bx, y: by, z: bz, yaw: B.yaw, pitch: B.pitch, crouched: B.body.crouched, onGround: B.body.onGround, vx: B.body.vx, vz: B.body.vz, height: B.body.height },
      this.s.showHitbox,
    );

    // Player beam (true lightning: always where the crosshair points right now).
    if (P.alive && P.firing) {
      const start = this.s.drawGun ? this.muzzleWorld(v3) : v3.copy(cam.position).add(v3b.set(0, -9, -6).applyEuler(cam.rotation));
      const end = this.traceBeam(B, cam.position, P.yaw, P.pitch, B.renderPos);
      this.playerBeam.update(dt, start, end.p, cam.position, end.impact);
      if (end.impact && Math.random() < 0.7) this.fx.sparksAt(end.p, end.hitTarget ? (B.shield > 0 ? SPARK_SHIELD : SPARK_FLESH) : SPARK_BEAM, 2);
    } else this.playerBeam.setVisible(false);

    if (B.alive && B.firing) {
      const start = this.botModel.muzzleWorld(new THREE.Vector3());
      const eye = new THREE.Vector3(B.body.x, B.eyeY(), B.body.z);
      const pp = P.alive ? { x: P.body.x, y: P.body.y, z: P.body.z, height: P.body.height } : null;
      const end = this.traceBeam(P, eye, B.yaw, B.pitch, pp);
      this.botBeam.update(dt, start, end.p, cam.position, end.impact);
      if (end.impact && !end.hitTarget && Math.random() < 0.5) this.fx.sparksAt(end.p, SPARK_BEAM, 1);
    } else this.botBeam.setVisible(false);

    this.fx.update(dt, (x, z) => this.world.supportHeight(x, z, 2, 1e6));
    this.visuals.update(dt, cam);

    // Audio
    const a = this.audio;
    viewDir(P.alive ? P.yaw : cam.rotation.y, P.alive ? P.pitch : 0, D);
    a.setListener(cam.position, D);
    const live = this.state === 'playing';
    a.setLoop('lgSelf', live && P.alive && P.firing);
    a.setLoop('lgBot', live && B.alive && B.firing, { x: bx, y: by + 40, z: bz });
    this.hurtT -= dt;
    if (live && P.alive && P.shield <= 0) {
      this.lowBeepT -= dt;
      if (this.lowBeepT <= 0) {
        a.play('lowShield', { vol: 0.35 });
        this.lowBeepT = 0.4;
      }
    } else this.lowBeepT = 0;
    if (live && B.alive && B.body.onGround && Math.hypot(B.body.vx, B.body.vz) > 150) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        a.play('step', { vol: 1.2, rate: 0.8 + Math.random() * 0.4, at: { x: bx, y: by, z: bz } });
        this.stepT = 0.3;
      }
    }

    // Draw
    const r = this.renderer;
    r.clear();
    r.render(this.scene, cam);
    if (this.s.drawGun && P.alive && !this.debug.spectate) {
      this.viewmodel.update(dt, { firing: P.firing, speed: Math.hypot(P.body.vx, P.body.vz), onGround: P.body.onGround, time: this.time });
      this.viewmodel.render(r);
    }
    this.hud.update(dt, sim, this.fps, live && this.input.action('scores'));
  }

  // Where a beam from `eye` along yaw/pitch stops: world geometry or the target's hitbox (at targetPos).
  traceBeam(target, eye, yaw, pitch, targetPos) {
    viewDir(yaw, pitch, D);
    const wh = this.world.raycast(eye.x, eye.y, eye.z, D.x, D.y, D.z, LG.range);
    let t = wh ? wh.t : LG.range;
    let hitTarget = false;
    if (targetPos && target.alive) {
      const hw = HULL.halfWidth;
      const ht = rayBox(
        eye.x,
        eye.y,
        eye.z,
        D.x,
        D.y,
        D.z,
        { x0: targetPos.x - hw, x1: targetPos.x + hw, y0: targetPos.y, y1: targetPos.y + targetPos.height, z0: targetPos.z - hw, z1: targetPos.z + hw },
        t,
      );
      if (ht !== null) {
        t = ht;
        hitTarget = true;
      }
    }
    return { p: new THREE.Vector3(eye.x + D.x * t, eye.y + D.y * t, eye.z + D.z * t), impact: !!wh || hitTarget, hitTarget };
  }

  // The viewmodel muzzle, unprojected from its screen position into the world at a short depth.
  muzzleWorld(out) {
    const ndc = this.viewmodel.muzzleNDC();
    out.set(ndc.x, ndc.y, 0.5).unproject(this.camera);
    out.sub(this.camera.position).normalize();
    const fwd = v3b.set(0, 0, -1).applyEuler(this.camera.rotation);
    const depth = 22 / Math.max(0.2, out.dot(fwd));
    return out.multiplyScalar(depth).add(this.camera.position);
  }

  renderMenu(dt) {
    // Slow orbit over Pinehollow behind the menus.
    this.menuOrbit += dt * 0.04;
    const cam = this.camera;
    const a = this.menuOrbit;
    cam.position.set(Math.cos(a) * 300, 95, Math.sin(a) * 300);
    cam.lookAt(-Math.cos(a) * 500, 30, -Math.sin(a) * 500);
    this.botModel.update(dt, { alive: false });
    this.playerBeam.setVisible(false);
    this.botBeam.setVisible(false);
    this.visuals.update(dt, cam);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
  }
}

