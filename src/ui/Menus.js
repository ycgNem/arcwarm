// Menus: main, settings, pause, results (with tracking breakdown + coaching), history.
import { BOT_LEVELS, BOT_ORDER } from '../data/bots.js';
import { GRAVITY_PRESETS } from '../data/physics.js';
import { MATCH } from '../data/match.js';
import { MAPS, MAP_ORDER } from '../world/maps.js';
import { DEFAULTS, DEFAULT_KEYS, saveSettings, cmPer360 } from '../core/Settings.js';
import { qlFovToVertical } from '../core/math.js';

const HKEY = 'arcwarm.history.v1';
export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HKEY)) || [];
  } catch {
    return [];
  }
}
export function pushHistory(entry) {
  const h = [entry, ...loadHistory()].slice(0, 40);
  try {
    localStorage.setItem(HKEY, JSON.stringify(h));
  } catch {
    /* ignore */
  }
  return h;
}

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const pct = (h, s) => (s ? Math.round((100 * h) / s) : 0);
const ENEMY_COLORS = ['#7dff3a', '#ff3b3b', '#3bf0ff', '#ffe93b', '#ff3bf0', '#ffffff'];
const ACTION_LABELS = { forward: 'Forward', back: 'Back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', crouch: 'Crouch', fire: 'Fire', scores: 'Scores', sensTest: 'Sens test' };
const keyName = (c) =>
  ({ Mouse0: 'Mouse1', Mouse1: 'Mouse3', Mouse2: 'Mouse2', Mouse3: 'Mouse4', Mouse4: 'Mouse5', Space: 'Space', ShiftLeft: 'LShift', ControlLeft: 'LCtrl' })[c] ||
  c.replace(/^Key/, '').replace(/^Digit/, '');

export function coachingTip(r) {
  const m = r.you.miss;
  const total = m.ahead + m.behind + m.above + m.below;
  const tips = [];
  if (total > 30) {
    const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    const share = top[1] / total;
    if (share > 0.34) {
      tips.push(
        {
          behind: 'Most misses trail the target: you react to strafes instead of tracking them. Match their speed and pre-move into the direction change.',
          ahead: 'Most misses overshoot: you anticipate direction changes too early. Let the strafe commit, then follow. Smooth beats fast.',
          below: 'Most misses are low: low gravity keeps them airborne longer than your hands expect. Ride the arc up and stay with it at the apex.',
          above: 'Most misses are high: you lose them on the way down. Follow the fall all the way to the landing, as the arc speeds up.',
        }[top[0]],
      );
    }
  }
  if (r.you.airShots > 60 && r.you.gndShots > 60) {
    const a = r.you.airHits / r.you.airShots;
    const g = r.you.gndHits / r.you.gndShots;
    if (a < g - 0.08) tips.push(`Airborne targets are your weak spot (${Math.round(a * 100)}% vs ${Math.round(g * 100)}% grounded). In Halo gravity, jumps are the easiest frags if you track the arc.`);
  }
  if (r.bot.acc > 40) tips.push(`The bot hit ${r.bot.acc}% on you: your movement was readable. Vary strafe lengths and don't jump in its sight (it predicts arcs).`);
  else if (r.bot.acc < 22 && r.you.deaths <= r.you.frags) tips.push(`Only ${r.bot.acc}% of the bot's beam landed. Good dodging; try the next difficulty.`);
  return tips.length ? tips : ['Clean round. Keep the crosshair glued at chest height and let your movement do the dodging.'];
}

export class Menus {
  constructor(settings, cb) {
    this.s = settings;
    this.cb = cb;
    this.screens = {};
    for (const id of ['main', 'settings', 'pause', 'results', 'history']) {
      const sc = el(`<div class="screen" id="screen-${id}"><div class="panel"></div></div>`);
      document.body.append(sc);
      this.screens[id] = sc;
    }
    this.listening = null;
    addEventListener('keydown', (e) => this.onBindKey(e), true);
    addEventListener('mousedown', (e) => this.onBindMouse(e), true);
  }

  hideAll() {
    for (const s of Object.values(this.screens)) s.classList.remove('on');
    this.current = null;
  }

  show(id) {
    this.hideAll();
    this.screens[id].classList.add('on');
    this.current = id;
  }

  panel(id) {
    return this.screens[id].querySelector('.panel');
  }

  segment(options, value, onPick) {
    const seg = el('<div class="seg"></div>');
    for (const [v, label] of options) {
      const b = el(`<button>${label}</button>`);
      if (v === value) b.classList.add('on');
      b.onclick = () => {
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        onPick(v);
      };
      seg.append(b);
    }
    return seg;
  }

  // ---------- Main ----------
  showMain() {
    const s = this.s;
    const p = this.panel('main');
    p.innerHTML = `
      <div class="logo">ARCWARM</div>
      <div class="tagline">Low-gravity lightning gun duel · warm up your tracking</div>
      <h3>Map</h3><div class="row" data-slot="map"></div>
      <h3>Opponent</h3><div data-slot="diff"></div>
      <h3>Match</h3><div class="row" data-slot="len"></div>
      <h3>Gravity</h3><div class="row" data-slot="grav"></div>
      <h3>Lifesteal <span class="hint" style="text-transform:none;letter-spacing:0">· hits heal you, so the one who misses more loses</span></h3><div class="row" data-slot="ls"></div>
      <div class="actions">
        <button class="primary" data-a="play">PLAY</button>
        <button data-a="settings">Settings</button>
        <button data-a="history">History</button>
        <span class="hint">Sens ${s.sens} · ${cmPer360(s).toFixed(1)} cm/360 @ ${s.dpi} dpi · FOV ${s.fov}</span>
      </div>
      <p class="hint" style="margin-top:18px">
        <span class="kbd">WASD</span> move · <span class="kbd">Space</span> jump (hold to hop) · <span class="kbd">C</span> crouch, also mid-air for a higher jump ·
        <span class="kbd">Mouse1</span> beam · <span class="kbd">Tab</span> scores · <span class="kbd">Esc</span> pause.
        Shields soak damage and recharge after 4s without being hit. With lifesteal on, every hit heals you. Pads and the grav lift fling you around the map.
      </p>`;
    p.querySelector('[data-slot="map"]').append(
      this.segment(
        MAP_ORDER.map((k) => [k, MAPS[k].label]),
        s.map,
        (v) => {
          s.map = v;
          saveSettings(s);
          this.cb.onMapChange(v);
        },
      ),
    );
    p.querySelector('[data-slot="ls"]').append(
      this.segment(
        MATCH.lifesteal.map((l) => [l.v, `${l.label}${l.v ? ` <span class="hint">${Math.round(l.v * 100)}%</span>` : ''}`]),
        s.lifesteal,
        (v) => {
          s.lifesteal = v;
          saveSettings(s);
        },
      ),
    );
    p.querySelector('[data-slot="diff"]').append(
      this.segment(
        BOT_ORDER.map((k) => [k, BOT_LEVELS[k].label]),
        s.difficulty,
        (v) => {
          s.difficulty = v;
          saveSettings(s);
        },
      ),
    );
    p.querySelector('[data-slot="len"]').append(
      this.segment(
        MATCH.lengths.map((l) => [l.s, l.label]),
        s.length,
        (v) => {
          s.length = v;
          saveSettings(s);
        },
      ),
    );
    p.querySelector('[data-slot="grav"]').append(
      this.segment(
        Object.entries(GRAVITY_PRESETS).map(([k, g]) => [k, `${g.label} <span class="hint">${((2 * g.jumpVelocity) / g.gravity).toFixed(2)}s air</span>`]),
        s.gravity,
        (v) => {
          s.gravity = v;
          saveSettings(s);
        },
      ),
    );
    p.querySelector('[data-a="play"]').onclick = () => this.cb.onPlay();
    p.querySelector('[data-a="settings"]').onclick = () => this.showSettings('main');
    p.querySelector('[data-a="history"]').onclick = () => this.showHistory();
    this.show('main');
  }

  // ---------- Settings ----------
  showSettings(back) {
    const s = this.s;
    const p = this.panel('settings');
    const num = (key, label, step, min, max, obj = s) =>
      `<label class="field">${label}<input type="number" data-k="${key}" step="${step}" min="${min}" max="${max}" value="${key.split('.').reduce((o, k) => o[k], obj)}"></label>`;
    const chk = (key, label) => `<label class="field">${label}<input type="checkbox" data-k="${key}" ${key.split('.').reduce((o, k) => o[k], s) ? 'checked' : ''}></label>`;
    p.innerHTML = `
      <h2>Settings</h2>
      <h3>Mouse (Quake Live compatible)</h3>
      <div class="grid2">
        ${num('sens', 'Sensitivity', 0.01, 0.05, 20)}
        ${num('dpi', 'Mouse DPI', 50, 100, 32000)}
        ${num('mYaw', 'm_yaw', 0.001, 0.001, 0.1)}
        ${num('mPitch', 'm_pitch', 0.001, 0.001, 0.1)}
        ${chk('invert', 'Invert pitch')}
        ${chk('rawInput', 'Raw input (no OS accel)')}
      </div>
      <div class="readout" data-r="cm"></div>
      <h3>View</h3>
      <div class="grid2">
        ${num('fov', 'FOV (cg_fov)', 1, 60, 130)}
        <label class="field">Render scale<input type="range" data-k="renderScale" min="0.5" max="2" step="0.25" value="${s.renderScale}"></label>
        ${chk('drawGun', 'Draw gun')}
        ${chk('shadows', 'Shadows')}
        ${chk('showFps', 'Show FPS')}
        ${chk('showHitbox', 'Show enemy hitbox')}
      </div>
      <div class="readout" data-r="fov"></div>
      <h3>Crosshair</h3>
      <div class="grid2">
        <label class="field">Style<select data-k="crosshair.style">
          ${['cross', 'crossdot', 'dot', 'circle'].map((v) => `<option ${s.crosshair.style === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>
        ${num('crosshair.size', 'Size', 1, 1, 40)}
        ${num('crosshair.gap', 'Gap', 1, 0, 30)}
        ${num('crosshair.thickness', 'Thickness', 1, 1, 8)}
        <label class="field">Colour<input type="color" data-k="crosshair.color" value="${s.crosshair.color}"></label>
        <label class="field">Hit colour<input type="color" data-k="hitColor" value="${s.hitColor}"></label>
        ${chk('crosshair.dot', 'Centre dot')}
        ${chk('crosshair.outline', 'Outline')}
      </div>
      <h3>Enemy brightskin</h3>
      <div class="swatches" data-slot="sw"></div>
      <h3>Audio</h3>
      <div class="grid2">
        <label class="field">Volume<input type="range" data-k="volume" min="0" max="1" step="0.05" value="${s.volume}"></label>
        ${chk('hitsound', 'Hitsounds')}
      </div>
      <h3>Keys</h3>
      <table class="keys">${Object.keys(ACTION_LABELS)
        .map((a) => `<tr><td>${ACTION_LABELS[a]}</td><td><button data-bind="${a}">${(s.keys[a] || []).map(keyName).join(' / ') || '-'}</button></td></tr>`)
        .join('')}</table>
      <p class="hint">Click a key, then press the new key or mouse button. Esc cancels. Crouch defaults to C / Shift because Ctrl+W closes the tab.</p>
      <div class="actions"><button class="primary" data-a="back">Done</button><button data-a="reset">Reset all</button></div>`;

    const refresh = () => {
      p.querySelector('[data-r="cm"]').textContent = `${cmPer360(s).toFixed(2)} cm/360° · ${(s.sens * s.mYaw).toFixed(4)}°/count`;
      p.querySelector('[data-r="fov"]').textContent = `cg_fov ${s.fov} → ${qlFovToVertical(s.fov).toFixed(1)}° vertical (Hor+ on widescreen, same as QL)`;
    };
    refresh();
    const setPath = (path, v) => {
      const ks = path.split('.');
      let o = s;
      while (ks.length > 1) o = o[ks.shift()];
      o[ks[0]] = v;
    };
    p.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      const handler = () => {
        let v;
        if (inp.type === 'checkbox') v = inp.checked;
        else if (inp.type === 'number' || inp.type === 'range') {
          v = parseFloat(inp.value);
          if (!Number.isFinite(v)) return;
        } else v = inp.value;
        setPath(k, v);
        saveSettings(s);
        refresh();
        this.cb.onSettingsChanged();
      };
      inp.addEventListener('input', handler);
      inp.addEventListener('change', handler);
    });
    const sw = p.querySelector('[data-slot="sw"]');
    for (const c of ENEMY_COLORS) {
      const b = el(`<button style="background:${c}"></button>`);
      if (c === s.enemyColor) b.classList.add('on');
      b.onclick = () => {
        s.enemyColor = c;
        sw.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        saveSettings(s);
        this.cb.onSettingsChanged();
      };
      sw.append(b);
    }
    p.querySelectorAll('[data-bind]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        p.querySelectorAll('[data-bind]').forEach((x) => x.classList.remove('listening'));
        b.classList.add('listening');
        b.textContent = 'press…';
        this.listening = { action: b.dataset.bind, button: b, armed: performance.now() + 150 };
      };
    });
    p.querySelector('[data-a="back"]').onclick = () => (back === 'pause' ? this.cb.onPauseMenu() : this.showMain());
    p.querySelector('[data-a="reset"]').onclick = () => {
      const fresh = structuredClone(DEFAULTS);
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, fresh, { keys: structuredClone(DEFAULT_KEYS) });
      saveSettings(s);
      this.cb.onSettingsChanged();
      this.showSettings(back);
    };
    this.show('settings');
  }

  bind(code) {
    const l = this.listening;
    if (!l) return;
    this.listening = null;
    if (code !== 'Escape') {
      this.s.keys[l.action] = [code];
      saveSettings(this.s);
    }
    l.button.classList.remove('listening');
    l.button.textContent = (this.s.keys[l.action] || []).map(keyName).join(' / ');
  }
  onBindKey(e) {
    if (!this.listening) return;
    e.preventDefault();
    e.stopPropagation();
    this.bind(e.code);
  }
  onBindMouse(e) {
    if (!this.listening || performance.now() < this.listening.armed) return;
    e.preventDefault();
    e.stopPropagation();
    this.bind('Mouse' + e.button);
  }

  // ---------- Pause ----------
  showPause(lockFailed) {
    const p = this.panel('pause');
    p.innerHTML = `
      <h2>Paused</h2>
      <p class="hint">${lockFailed ? 'The browser needs a moment before it gives the mouse back. Click Resume again.' : 'Click Resume (or anywhere on this panel\'s button) to grab the mouse again.'}</p>
      <div class="actions">
        <button class="primary" data-a="resume">Resume</button>
        <button data-a="settings">Settings</button>
        <button data-a="restart">Restart</button>
        <button data-a="end">End match</button>
        <button data-a="quit">Quit to menu</button>
      </div>`;
    p.querySelector('[data-a="resume"]').onclick = () => this.cb.onResume();
    p.querySelector('[data-a="settings"]').onclick = () => this.showSettings('pause');
    p.querySelector('[data-a="restart"]').onclick = () => this.cb.onPlay();
    p.querySelector('[data-a="end"]').onclick = () => this.cb.onEnd();
    p.querySelector('[data-a="quit"]').onclick = () => this.cb.onQuit();
    this.show('pause');
  }

  // ---------- Results ----------
  showResults(r) {
    const p = this.panel('results');
    const outcome = r.you.frags > r.you.deaths ? ['win', 'VICTORY'] : r.you.frags < r.you.deaths ? ['loss', 'DEFEAT'] : ['draw', 'DRAW'];
    const m = r.you.miss;
    const mt = Math.max(1, m.ahead + m.behind + m.above + m.below);
    const bar = (k, label) => `<div class="miss"><span>${label}</span><div class="track"><div style="width:${(100 * m[k]) / mt}%"></div></div><span>${Math.round((100 * m[k]) / mt)}%</span></div>`;
    const prev = loadHistory().filter((h) => h.difficulty === r.difficulty && (h.map ?? 'forest') === r.map);
    const best = prev.length ? Math.max(...prev.map((h) => h.you.acc)) : null;
    p.innerHTML = `
      <div class="result-head ${outcome[0]}">${outcome[1]}</div>
      <div class="hint">${r.you.frags} – ${r.you.deaths} vs ${BOT_LEVELS[r.difficulty].label} Bot · ${MAPS[r.map]?.label ?? ''} · ${GRAVITY_PRESETS[r.gravity].label} gravity · lifesteal ${r.lifesteal ? Math.round(r.lifesteal * 100) + '%' : 'off'} · ${Math.round(r.seconds)}s</div>
      <div class="stats">
        <div class="stat"><small>LG accuracy</small><b>${r.you.acc}%</b>${best != null ? `<div class="hint">best ${best}%</div>` : ''}</div>
        <div class="stat"><small>Damage</small><b>${r.you.dmg}</b><div class="hint">${Math.round((r.you.dmg / Math.max(1, r.seconds)) * 60)}/min</div></div>
        <div class="stat"><small>Taken</small><b>${r.you.taken}</b></div>
        <div class="stat"><small>Longest track</small><b>${r.you.track.toFixed(2)}s</b></div>
        <div class="stat"><small>vs airborne</small><b>${pct(r.you.airHits, r.you.airShots)}%</b></div>
        <div class="stat"><small>vs grounded</small><b>${pct(r.you.gndHits, r.you.gndShots)}%</b></div>
        <div class="stat"><small>${r.lifesteal ? 'Healed' : 'Shield breaks'}</small><b>${r.lifesteal ? r.you.healed : r.you.breaks}</b></div>
        <div class="stat"><small>Bot's LG on you</small><b>${r.bot.acc}%</b></div>
      </div>
      <h3>Where your near-misses went</h3>
      <div class="misses">${bar('behind', 'Behind')}${bar('ahead', 'Ahead')}${bar('below', 'Below')}${bar('above', 'Above')}</div>
      ${coachingTip(r)
        .map((t) => `<div class="tip">${t}</div>`)
        .join('')}
      <div class="actions">
        <button class="primary" data-a="again">Rematch</button>
        <button data-a="menu">Menu</button>
        <button data-a="history">History</button>
        <span class="hint"><span class="kbd">R</span> / <span class="kbd">Enter</span> rematch</span>
      </div>`;
    p.querySelector('[data-a="again"]').onclick = () => this.cb.onPlay();
    p.querySelector('[data-a="menu"]').onclick = () => this.showMain();
    p.querySelector('[data-a="history"]').onclick = () => this.showHistory();
    this.show('results');
  }

  showHistory() {
    const h = loadHistory();
    const p = this.panel('history');
    p.innerHTML = `
      <h2>History</h2>
      ${
        h.length
          ? `<table class="history"><tr><th>When</th><th>Map</th><th>Bot</th><th>Grav</th><th>LS</th><th>K–D</th><th>LG</th><th>Air</th><th>Track</th><th>Bot LG</th></tr>
        ${h
          .map(
            (r) =>
              `<tr><td>${new Date(r.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>${MAPS[r.map ?? 'forest']?.label ?? r.map}</td><td>${BOT_LEVELS[r.difficulty]?.label ?? r.difficulty}</td><td>${GRAVITY_PRESETS[r.gravity]?.label ?? r.gravity}</td><td>${r.lifesteal ? Math.round(r.lifesteal * 100) + '%' : '-'}</td><td>${r.you.frags}–${r.you.deaths}</td><td>${r.you.acc}%</td><td>${pct(r.you.airHits, r.you.airShots)}%</td><td>${r.you.track.toFixed(1)}s</td><td>${r.bot.acc}%</td></tr>`,
          )
          .join('')}</table>`
          : '<p class="hint">No matches yet.</p>'
      }
      <div class="actions"><button class="primary" data-a="back">Back</button></div>`;
    p.querySelector('[data-a="back"]').onclick = () => this.showMain();
    this.show('history');
  }
}
