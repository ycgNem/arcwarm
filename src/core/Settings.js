// Player settings, persisted per browser. QL-compatible sensitivity and FOV.
import { DEG } from './math.js';

const KEY = 'arcwarm.settings.v1';

export const DEFAULT_KEYS = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  crouch: ['KeyC', 'ShiftLeft'], // not Ctrl: Ctrl+W closes the tab
  fire: ['Mouse0'],
  scores: ['Tab'],
  sensTest: ['F2'],
};

export const DEFAULTS = {
  sens: 2.0, // QL `sensitivity`
  mYaw: 0.022,
  mPitch: 0.022,
  invert: false,
  dpi: 800,
  fov: 110, // QL cg_fov (4:3 horizontal, Hor+)
  rawInput: true,
  crosshair: { style: 'cross', size: 9, gap: 3, thickness: 2, color: '#ffffff', dot: true, outline: true },
  hitColor: '#ff3d6e',
  enemyColor: '#7dff3a',
  drawGun: true,
  volume: 0.7,
  hitsound: true,
  gravity: 'halo',
  map: 'forest',
  lifesteal: 1, // fraction of damage dealt that heals you (see MATCH.lifesteal)
  difficulty: 'hard',
  length: 180,
  showFps: true,
  showHitbox: false,
  renderScale: 1,
  shadows: true,
  keys: DEFAULT_KEYS,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        ...DEFAULTS,
        ...s,
        crosshair: { ...DEFAULTS.crosshair, ...(s.crosshair || {}) },
        keys: { ...DEFAULT_KEYS, ...(s.keys || {}) },
      };
    }
  } catch {
    /* private window / blocked storage: defaults */
  }
  return structuredClone(DEFAULTS);
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// Radians of view rotation per raw mouse count.
export const yawPerCount = (s) => s.sens * s.mYaw * DEG;
export const pitchPerCount = (s) => s.sens * s.mPitch * DEG;
export const cmPer360 = (s) => (360 / (s.sens * s.mYaw) / s.dpi) * 2.54;
