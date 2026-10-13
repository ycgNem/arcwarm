// In-match HUD (DOM + two small canvases): crosshair with hit flash, score + clock, Halo shield/health bars,
// live LG accuracy, damage-direction arcs, center messages, kill feed, Tab scoreboard.
import { VITALS } from '../data/match.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (h, s) => (s ? Math.round((100 * h) / s) : 0);

export class Hud {
  constructor(settings) {
    this.settings = settings;
    const root = el('div');
    root.id = 'hud';
    this.root = root;
    this.vignette = el('div', 'vignette');
    root.append(this.vignette);
    this.dmg = el('canvas');
    this.dmg.id = 'dmgfx';
    root.append(this.dmg);
    this.cross = el('canvas');
    this.cross.id = 'crosshair';
    this.cross.width = this.cross.height = 128;
    root.append(this.cross);

    const top = el('div', 'hud-top');
    this.score = el(
      'div',
      'score',
      `<div class="side you"><small>YOU</small><b data-k="you">0</b></div><div class="clock" data-k="clock">0:00</div><div class="side bot"><b data-k="bot">0</b><small data-k="botname">BOT</small></div>`,
    );
    top.append(this.score);
    root.append(top);

    this.vitals = el(
      'div',
      'hud-vitals',
      `<div class="bar shield"><div class="fill"></div><span class="tag">SHIELD</span><span class="num">100</span></div>
       <div class="bar health"><div class="fill"></div><span class="tag">HEALTH</span><span class="num">100</span></div>`,
    );
    root.append(this.vitals);
    this.shieldBar = this.vitals.querySelector('.shield');
    this.healthBar = this.vitals.querySelector('.health');

    this.br = el('div', 'hud-br');
    root.append(this.br);
    this.fps = el('div', 'hud-fps');
    root.append(this.fps);
    this.msg = el('div', 'center-msg', '<div class="big"></div><div class="small"></div>');
    root.append(this.msg);
    this.feedEl = el('div', 'feed');
    root.append(this.feedEl);
    this.board = el('div', 'scoreboard');
    root.append(this.board);
    this.sens = el('div', 'senstest');
    root.append(this.sens);
    document.body.append(root);

    this.hitT = 0;
    this.msgT = 0;
    this.arcs = [];
    this.redFlash = 0;
    this.lastCross = '';
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    // Square canvas just big enough for the arcs, instead of a full-screen layer.
    const size = Math.ceil(Math.min(innerWidth, innerHeight) * 0.4);
    this.dmg.width = this.dmg.height = size;
    this.arcsDrawn = true;
  }

  show(on) {
    this.root.classList.toggle('on', on);
  }

  // ---------- crosshair ----------
  drawCrosshair(color) {
    const s = this.settings.crosshair;
    if (color === this.lastCross) return; // Game resets lastCross when settings change
    this.lastCross = color;
    const g = this.cross.getContext('2d');
    const c = 64;
    g.clearRect(0, 0, 128, 128);
    const lines = [];
    if (s.style === 'cross' || s.style === 'crossdot') {
      lines.push([c, c - s.gap - s.size, c, c - s.gap], [c, c + s.gap, c, c + s.gap + s.size], [c - s.gap - s.size, c, c - s.gap, c], [c + s.gap, c, c + s.gap + s.size, c]);
    }
    const pass = (outline) => {
      g.strokeStyle = outline ? 'rgba(0,0,0,0.85)' : color;
      g.fillStyle = g.strokeStyle;
      g.lineWidth = s.thickness + (outline ? 2 : 0);
      g.lineCap = 'butt';
      for (const [x0, y0, x1, y1] of lines) {
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      if (s.style === 'circle') {
        g.beginPath();
        g.arc(c, c, s.gap + s.size / 2, 0, Math.PI * 2);
        g.stroke();
      }
      if (s.dot || s.style === 'dot' || s.style === 'crossdot') {
        const r = Math.max(1, s.thickness * 0.75) + (outline ? 1 : 0);
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.fill();
      }
    };
    if (s.outline) pass(true);
    pass(false);
  }

  sensTest(html) {
    this.set('sensOn', this.sens, 'on', !!html);
    if (html) this.set('sensHtml', this.sens, 'html', html);
  }

  hit() {
    this.hitT = 0.07;
  }

  damageFrom(relAngle) {
    this.arcs.push({ a: relAngle, life: 1 });
    this.redFlash = Math.min(0.3, this.redFlash + 0.06); // capped: under sustained LG fire it must not hide the target
  }

  message(big, small = '', dur = 1.5) {
    this.msg.querySelector('.big').textContent = big;
    this.msg.querySelector('.small').textContent = small;
    this.msg.classList.add('on');
    this.msgT = dur;
  }

  feed(html) {
    const d = el('div', null, html);
    this.feedEl.append(d);
    setTimeout(() => d.remove(), 4000);
    while (this.feedEl.children.length > 4) this.feedEl.firstChild.remove();
  }

  // Only touch the DOM when a value changes (writing text/styles every frame forces style + layout work).
  set(key, el, prop, value) {
    const c = this.cache || (this.cache = {});
    if (c[key] === value) return;
    c[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'transform') el.style.transform = value;
    else if (prop === 'opacity') el.style.opacity = value;
    else if (prop === 'display') el.style.display = value;
    else el.classList.toggle(prop, value);
  }

  update(dt, sim, fps, showBoard) {
    const P = sim.player;
    const B = sim.bot;
    if (!this.els) {
      const q = (k) => this.score.querySelector(`[data-k="${k}"]`);
      this.els = {
        you: q('you'),
        bot: q('bot'),
        botname: q('botname'),
        clock: q('clock'),
        sFill: this.shieldBar.querySelector('.fill'),
        hFill: this.healthBar.querySelector('.fill'),
        sNum: this.shieldBar.querySelector('.num'),
        hNum: this.healthBar.querySelector('.num'),
      };
    }
    const E = this.els;
    this.set('you', E.you, 'text', String(P.stats.frags));
    this.set('bot', E.bot, 'text', String(B.stats.frags));
    this.set('botname', E.botname, 'text', B.name.toUpperCase());
    const left = sim.length > 0 ? Math.max(0, sim.length - sim.clock) : sim.clock;
    this.set('clock', E.clock, 'text', sim.state === 'countdown' ? 'WARM' : fmtClock(left));

    const sh = Math.ceil(P.shield);
    const hp = Math.ceil(P.health);
    this.set('sFill', E.sFill, 'transform', `scaleX(${sh / VITALS.shield})`);
    this.set('hFill', E.hFill, 'transform', `scaleX(${hp / VITALS.health})`);
    this.set('sNum', E.sNum, 'text', String(sh));
    this.set('hNum', E.hNum, 'text', String(hp));
    this.set('broken', this.shieldBar, 'broken', P.alive && P.shield <= 0);
    this.set('low', this.healthBar, 'low', P.health < 35);
    // Lifesteal feedback: bars glow green while your hits are healing you.
    const total = P.health + P.shield;
    if (P.alive && !P.recharging && total > (this.lastTotal ?? total) + 0.01) this.healT = 0.15;
    this.lastTotal = total;
    this.healT = (this.healT || 0) - dt;
    this.set('healing', this.vitals, 'healing', this.healT > 0);

    const st = P.stats;
    this.set('br', this.br, 'html', `LG <b>${pct(st.hits, st.shots)}%</b><br>${st.dmg} dmg · ${st.shieldBreaks} breaks`);
    this.set('fps', this.fps, 'text', this.settings.showFps ? `${fps} fps` : '');

    this.hitT -= dt;
    this.drawCrosshair(this.hitT > 0 ? this.settings.hitColor : this.settings.crosshair.color);
    this.set('crossDisp', this.cross, 'display', P.alive ? '' : 'none');

    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.msg.classList.remove('on');
    }

    // Damage arcs around the crosshair, pointing at the shooter. Only redrawn while there is something to show.
    if (this.arcs.length || this.arcsDrawn) {
      const g = this.dmg.getContext('2d');
      const W = this.dmg.width;
      g.clearRect(0, 0, W, W);
      const c = W / 2;
      const R = Math.min(innerWidth, innerHeight) * 0.16;
      for (let i = this.arcs.length - 1; i >= 0; i--) {
        const a = this.arcs[i];
        a.life -= dt * 1.4;
        if (a.life <= 0) {
          this.arcs.splice(i, 1);
          continue;
        }
        const ang = -Math.PI / 2 - a.a;
        g.strokeStyle = `rgba(255,70,70,${a.life * 0.8})`;
        g.lineWidth = 7;
        g.beginPath();
        g.arc(c, c, R, ang - 0.32, ang + 0.32);
        g.stroke();
      }
      this.arcsDrawn = this.arcs.length > 0;
    }
    this.redFlash = Math.max(0, this.redFlash - dt * 2.2);
    const vig = Math.min(0.45, this.redFlash + (P.alive && P.shield <= 0 ? 0.25 + 0.1 * Math.sin(performance.now() / 90) : 0));
    this.set('vig', this.vignette, 'opacity', String(Math.round(vig * 50) / 50));

    this.set('boardOn', this.board, 'on', showBoard);
    if (showBoard) {
      const row = (f) =>
        `<tr><td>${f.name}</td><td>${f.stats.frags}</td><td>${f.stats.deaths}</td><td>${pct(f.stats.hits, f.stats.shots)}%</td><td>${f.stats.dmg}</td><td>${f.stats.taken}</td></tr>`;
      this.set('board', this.board, 'html', `<table><tr><th></th><th>K</th><th>D</th><th>LG</th><th>DMG</th><th>TAKEN</th></tr>${row(P)}${row(B)}</table>`);
    }
  }
}
