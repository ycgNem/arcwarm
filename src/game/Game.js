// Browser side of the duel: owns the Sim, turns input into commands at a fixed 125 Hz, renders with interpolation,
// and routes sim events to sound, HUD and effects.
import * as THREE from 'three';
import { TICK, HULL } from '../data/physics.js';
import { LG } from '../data/weapons.js';
import { MATCH } from '../data/match.js';
import { DEG, clamp, viewDir, qlFovToVertical, yawTo } from '../core/math.js';
import { yawPerCount, pitchPerCount, cmPer360 } from '../core/Settings.js';
import { MAPS } from '../world/maps.js';
import { World, rayBox } from '../world/World.js';
import { NavGrid } from '../world/NavGrid.js';
import { ForestVisuals } from '../world/ForestVisuals.js';
import { WhiteRoomVisuals } from '../world/WhiteRoomVisuals.js';

const VISUALS = { forest: ForestVisuals, whiteroom: WhiteRoomVisuals };
import { Sim, lerpPose } from './Sim.js';
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
// Per-frame scratch objects (no allocations in the render loop → no GC hitches).
const VIEW = {};
const BOTPOSE = {};
const BOT_RENDER = { x: 0, y: 0, z: 0, height: 56 };
const PLAYER_EYE = { x: 0, y: 0, z: 0 };
const PLAYER_BOX = { x: 0, y: 0, z: 0, height: 56 };
const BOT_STATE = {};
const BOT_EYE = new THREE.Vector3();
const BOT_MUZZLE = new THREE.Vector3();
const END_A = { p: new THREE.Vector3(), impact: false, hitTarget: false };
const END_B = { p: new THREE.Vector3(), impact: false, hitTarget: false };
const TARGET_BOX = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
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

    this.camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 1, 9000);
    this.camera.rotation.order = 'YXZ';
    this.viewmodel = new Viewmodel();
    this.maps = {};
    this.loadMap(MAPS[settings.map] ? settings.map : 'forest');

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

  // Each map gets its own scene, collision world, nav grid and actors, built once and cached.
  loadMap(id) {
    if (!this.maps[id]) {
      const layout = MAPS[id].build();
      const world = new World(layout);
      const scene = new THREE.Scene();
      const visuals = new VISUALS[id](scene, layout, { shadows: this.s.shadows });
      this.maps[id] = {
        layout,
        world,
        nav: new NavGrid(world),
        scene,
        visuals,
        botModel: new BotModel(scene, this.s.enemyColor),
        playerBeam: new Beam(scene, { color: 0x8fd0ff, glowTex: visuals.tex.glow }),
        botBeam: new Beam(scene, { color: 0x9dffb0, glowTex: visuals.tex.glow }),
        fx: new Effects(scene, visuals.tex.glow),
      };
    }
    const fresh = !this.maps[id].warmed;
    Object.assign(this, this.maps[id]);
    this.groundAt = (x, z) => this.world.supportHeight(x, z, 2, 1e6);
    this.mapId = id;
    this.applySettings();
    if (fresh) {
      this.warmup();
      this.maps[id].warmed = true;
    }
  }

  // Render one frame with every effect forced on, so all shaders compile now (while loading) instead of the first
  // time you fire, hit, get a shield flash or frag someone mid-match.
  warmup() {
    const r = this.renderer;
    const cam = this.camera;
    cam.position.set(0, 120, 400);
    cam.lookAt(0, 40, 0);
    const a = new THREE.Vector3(-40, 60, 0);
    const b = new THREE.Vector3(40, 60, 0);
    this.playerBeam.update(0.016, a, b, cam.position, true);
    this.botBeam.update(0.016, b, a, cam.position, true);
    this.fx.sparksAt(a, SPARK_BEAM, 4);
    this.fx.gibsAt(a, { x: 0, z: 0 });
    this.fx.update(0.016, this.groundAt);
    const st = { alive: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouched: false, onGround: true, vx: 0, vz: 0, height: 56, ground: 0 };
    this.botModel.update(0.016, st, true);
    this.botModel.hit(true);
    this.botModel.update(0.001, st, true);
    r.shadowMap.needsUpdate = true;
    r.compile(this.scene, cam);
    r.clear();
    r.render(this.scene, cam);
    this.viewmodel.update(0.016, { firing: true, speed: 0, onGround: true, time: 0 });
    this.viewmodel.render(r);
    // Back to normal.
    this.playerBeam.setVisible(false);
    this.botBeam.setVisible(false);
    this.fx.sparks.length = 0;
    this.fx.gibs.length = 0;
    this.fx.update(0, this.groundAt);
    this.botModel.flash = 0;
    this.botModel.shell.visible = false;
    this.botModel.shieldMat.opacity = 0;
    this.botModel.update(0, { alive: false }, false);
    this.hud.hitT = 0;
  }

  applySettings() {
    const s = this.s;
    this.camera.fov = qlFovToVertical(s.fov);
    this.camera.updateProjectionMatrix();
    this.audio.setVolume(s.volume);
    this.botModel.setColor(s.enemyColor);
    this.fx.setGibColor(s.enemyColor);
    this.visuals.sun.castShadow = s.shadows;
    this.renderer.shadowMap.needsUpdate = true;
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
    if (s.map !== this.mapId && MAPS[s.map]) this.loadMap(s.map);
    this.sim = new Sim({
      lifesteal: s.lifesteal,
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
    this.sensTest = null;
    this.state = 'playing';
    this.hud.show(true);
    this.hud.message('WARM UP', `${this.sim.bot.name} · first beam at 0`, 1.2);
  }

  // F2: sensitivity test. Mark a spot, swipe a full turn, compare degrees/counts with what your QL sens predicts.
  toggleSensTest() {
    if (this.state !== 'playing') return;
    if (this.sensTest) this.sensTest = null;
    else this.sensTest = { x0: this.input.counts.x, yaw0: this.sim.player.yaw, spikes0: this.input.counts.spikes };
  }

  sensTestHtml() {
    const t = this.sensTest;
    if (!t) return null;
    const s = this.s;
    const i = this.input;
    const counts = i.counts.x - t.x0;
    const deg = -(this.sim.player.yaw - t.yaw0) / DEG;
    const per360 = 360 / (s.sens * s.mYaw);
    return `SENS TEST · <span class="kbd">F2</span> to close<br><b>${deg.toFixed(1)}°</b> turned · ${counts} counts<br>
      ${per360.toFixed(1)} counts = 360° at sens ${s.sens} (${cmPer360(s).toFixed(2)} cm @ ${s.dpi} dpi)<br>
      raw input ${i.raw ? '<span style="color:var(--health)">ON</span>' : '<span style="color:var(--danger)">OFF (OS accel may apply)</span>'} ·
      ${i.rawEvents ? 'per-report events' : 'per-frame events'} · ${i.rate.hz} Hz${i.counts.spikes - t.spikes0 ? ` · ${i.counts.spikes - t.spikes0} spikes dropped` : ''}`;
  }

  // Debug (tools/shots.mjs): freeze a posed moment. Positions are [x, z]; heights come from the map.
  stage({ p, b, botAir = 0, fire = false, botFire = false, pitchBias = 0 }) {
    if (!this.sim) this.startMatch();
    const sim = this.sim;
    sim.state = 'live';
    const place = (f, x, z, air) => {
      const y = this.world.supportHeight(x, z, HULL.halfWidth, 1e6) + air;
      Object.assign(f.body, { x, y, z, vx: 0, vy: 0, vz: 0, onGround: air === 0, crouched: false, height: HULL.height });
      Object.assign(f.prev, { x, y, z, eye: HULL.eye });
      f.alive = true;
      f.health = f.shield = 100;
    };
    const P = sim.player;
    const B = sim.bot;
    place(P, p[0], p[1], 0);
    place(B, b[0], b[1], botAir);
    const dx = B.body.x - P.body.x;
    const dz = B.body.z - P.body.z;
    P.yaw = yawTo(dx, dz);
    P.pitch = Math.atan2(B.body.y + 30 - P.eyeY(), Math.hypot(dx, dz)) + pitchBias;
    B.yaw = yawTo(-dx, -dz);
    B.pitch = -Math.atan2(B.body.y + 30 - P.eyeY(), Math.hypot(dx, dz));
    P.firing = fire;
    B.firing = botFire;
    this.state = 'paused';
    this.hud.msg.classList.remove('on');
    for (let i = 0; i < 4; i++) this.renderMatch(1 / 60, 1);
    return true;
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
      map: this.mapId,
      lifesteal: sim.lifesteal,
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
        healed: Math.round(P.healed),
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
          else a.play('recharge', { vol: 0.9, bot: true });
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
          else a.play('jump', { vol: 0.8, bot: true });
          break;
        case 'land':
          if (e.who === P.id) {
            if (e.speed > 180) {
              a.play('land', { vol: Math.min(0.7, e.speed / 600) });
              this.viewmodel.land = Math.min(1, e.speed / 400);
            }
          } else if (e.speed > 180) a.play('land', { vol: 0.9, bot: true });
          break;
        case 'pad':
          a.play('pad', { vol: e.who === P.id ? 0.6 : 0.9, bot: e.who !== P.id });
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
      lerpPose(P, alpha, VIEW);
      cam.position.set(VIEW.x, VIEW.eye + this.crouchComp, VIEW.z);
      cam.rotation.set(P.pitch, P.yaw, 0);
      // Your next shots leave from exactly this camera position (what you're looking through right now).
      PLAYER_EYE.x = cam.position.x;
      PLAYER_EYE.y = cam.position.y;
      PLAYER_EYE.z = cam.position.z;
      P.renderEye = PLAYER_EYE;
    } else if (this.deathView) {
      // Death cam: hold position, turn toward whoever fragged you.
      const d = this.deathView;
      cam.position.set(d.x, d.y - 20, d.z);
      const ty = yawTo(B.body.x - d.x, B.body.z - d.z);
      d.yaw += Math.atan2(Math.sin(ty - d.yaw), Math.cos(ty - d.yaw)) * Math.min(1, dt * 4);
      cam.rotation.set(-0.15, d.yaw, 0.1);
    }

    // Bot body where it is on screen, which is also exactly where the player's beam registers.
    lerpPose(B, alpha, BOTPOSE);
    const bx = BOTPOSE.x;
    const by = BOTPOSE.y;
    const bz = BOTPOSE.z;
    if (B.alive) {
      BOT_RENDER.x = bx;
      BOT_RENDER.y = by;
      BOT_RENDER.z = bz;
      BOT_RENDER.height = B.body.height;
      B.renderPos = BOT_RENDER;
    } else B.renderPos = null;
    const st = BOT_STATE;
    st.alive = B.alive;
    st.x = bx;
    st.y = by;
    st.z = bz;
    st.yaw = B.yaw;
    st.pitch = B.pitch;
    st.crouched = B.body.crouched;
    st.onGround = B.body.onGround;
    st.vx = B.body.vx;
    st.vz = B.body.vz;
    st.height = B.body.height;
    st.ground = B.alive ? this.world.supportHeight(bx, bz, HULL.halfWidth, by + 1) : 0;
    this.botModel.update(dt, st, this.s.showHitbox);

    // Player beam (true lightning: always where the crosshair points right now).
    if (P.alive && P.firing) {
      const start = this.s.drawGun ? this.muzzleWorld(v3) : v3.copy(cam.position).add(v3b.set(0, -9, -6).applyEuler(cam.rotation));
      const end = this.traceBeam(END_A, B, cam.position, P.yaw, P.pitch, B.renderPos);
      this.playerBeam.update(dt, start, end.p, cam.position, end.impact);
      if (end.impact && Math.random() < 0.7) this.fx.sparksAt(end.p, end.hitTarget ? (B.shield > 0 ? SPARK_SHIELD : SPARK_FLESH) : SPARK_BEAM, 2);
    } else this.playerBeam.setVisible(false);

    if (B.alive && B.firing) {
      const start = this.botModel.muzzleWorld(BOT_MUZZLE);
      BOT_EYE.set(B.body.x, B.eyeY(), B.body.z);
      let pp = null;
      if (P.alive) {
        PLAYER_BOX.x = P.body.x;
        PLAYER_BOX.y = P.body.y;
        PLAYER_BOX.z = P.body.z;
        PLAYER_BOX.height = P.body.height;
        pp = PLAYER_BOX;
      }
      const end = this.traceBeam(END_B, P, BOT_EYE, B.yaw, B.pitch, pp);
      this.botBeam.update(dt, start, end.p, cam.position, end.impact);
      if (end.impact && !end.hitTarget && Math.random() < 0.5) this.fx.sparksAt(end.p, SPARK_BEAM, 1);
    } else this.botBeam.setVisible(false);

    this.fx.update(dt, this.groundAt);
    this.visuals.update(dt, cam);

    // Audio: every positional sound comes from the bot, through one shared panner that follows it.
    const a = this.audio;
    viewDir(P.alive ? P.yaw : cam.rotation.y, P.alive ? P.pitch : 0, D);
    a.setListener(cam.position, D);
    a.setBotPosition(bx, by + 40, bz);
    const live = this.state === 'playing';
    a.setLoop('lgSelf', live && P.alive && P.firing);
    a.setLoop('lgBot', live && B.alive && B.firing);
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
        a.play('step', { vol: 1.2, rate: 0.8 + Math.random() * 0.4, bot: true });
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
    this.hud.sensTest(this.sensTestHtml());
  }

  // Where a beam from `eye` along yaw/pitch stops: world geometry or the target's hitbox (at targetPos). Writes `out`.
  traceBeam(out, target, eye, yaw, pitch, targetPos) {
    viewDir(yaw, pitch, D);
    const wh = this.world.raycast(eye.x, eye.y, eye.z, D.x, D.y, D.z, LG.range);
    let t = wh ? wh.t : LG.range;
    out.hitTarget = false;
    if (targetPos && target.alive) {
      const hw = HULL.halfWidth;
      const tb = TARGET_BOX;
      tb.x0 = targetPos.x - hw;
      tb.x1 = targetPos.x + hw;
      tb.y0 = targetPos.y;
      tb.y1 = targetPos.y + targetPos.height;
      tb.z0 = targetPos.z - hw;
      tb.z1 = targetPos.z + hw;
      const ht = rayBox(eye.x, eye.y, eye.z, D.x, D.y, D.z, tb, t);
      if (ht !== null) {
        t = ht;
        out.hitTarget = true;
      }
    }
    out.p.set(eye.x + D.x * t, eye.y + D.y * t, eye.z + D.z * t);
    out.impact = !!wh || out.hitTarget;
    return out;
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
    cam.position.set(Math.cos(a) * 300, this.mapId === 'whiteroom' ? 180 : 95, Math.sin(a) * 300);
    cam.lookAt(-Math.cos(a) * 500, 30, -Math.sin(a) * 500);
    this.botModel.update(dt, { alive: false });
    this.playerBeam.setVisible(false);
    this.botBeam.setVisible(false);
    this.visuals.update(dt, cam);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
  }
}

