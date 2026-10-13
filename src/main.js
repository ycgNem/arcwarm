// Boot: renderer, settings, input, audio, UI, and the frame loop.
// Debug URLs: ?debug=start (match without pointer lock), ?debug=spectate (watch bot vs bot from its eyes), &len=60.
import './ui/style.css';
import * as THREE from 'three';
import { loadSettings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { Audio } from './core/Audio.js';
import { Hud } from './ui/Hud.js';
import { Menus } from './ui/Menus.js';
import { Game } from './game/Game.js';

const params = new URLSearchParams(location.search);
const mode = params.get('debug');
const debug = {
  any: !!mode,
  spectate: mode === 'spectate',
  length: params.has('len') ? Number(params.get('len')) : undefined,
};

const canvas = document.createElement('canvas');
canvas.id = 'game';
document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const settings = loadSettings();
const audio = new Audio();
const input = new Input(canvas, settings);
const hud = new Hud(settings);

let game;
const menus = new Menus(settings, {
  onPlay: () => play(),
  onResume: () => resume(),
  onPauseMenu: () => menus.showPause(),
  onEnd: () => game.endMatch(),
  onQuit: () => {
    game.state = 'menu';
    game.sim = null;
    hud.show(false);
    menus.showMain();
  },
  onSettingsChanged: () => game.applySettings(),
});
game = new Game({ renderer, settings, audio, input, hud, menus, debug });
window.arcwarm = game; // console poking

async function play() {
  audio.resume();
  menus.hideAll();
  game.startMatch();
  if (debug.any) return;
  if (!(await input.lock())) {
    game.pause();
    menus.showPause(true);
  }
}

async function resume() {
  audio.resume();
  if (await input.lock()) {
    menus.hideAll();
    game.resume();
  } else menus.showPause(true);
}

input.onLockChange = (locked) => {
  if (!locked && game.state === 'playing' && !debug.any) {
    game.pause();
    menus.showPause();
  }
};
input.onKey = (code) => {
  if (game.state === 'results' && menus.current === 'results' && (code === 'KeyR' || code === 'Enter')) play();
};

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.frame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (debug.any) play();
else menus.showMain();
