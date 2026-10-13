// S0 placeholder: greybox arena preview with a slow orbit camera. Real loop lands in S1 (see PLAN.md).
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
scene.fog = new THREE.Fog(0x0b0d12, 800, 2600);

// Quake units: 1 unit ≈ 1 inch. Player eye height ≈ 56.
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 1, 5000);

scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x20242c, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(400, 900, 300);
scene.add(sun);

const grey = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.9 });
const box = (w, h, d, x, y, z, mat = grey) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  scene.add(m);
};
box(1600, 16, 1600, 0, -16, 0);
box(400, 128, 300, -500, 0, 0);
box(400, 128, 300, 500, 0, 0);
box(64, 256, 64, 0, 0, 420);
box(64, 256, 64, 0, 0, -420);
const grid = new THREE.GridHelper(1600, 50, 0x2a3040, 0x1a1e28);
scene.add(grid);

// Stand-in for the bot: QL hitbox 30×30×56, brightskin lime.
const bot = new THREE.Mesh(
  new THREE.BoxGeometry(30, 56, 30),
  new THREE.MeshStandardMaterial({ color: 0x7dff3a, emissive: 0x2a7a10 })
);
scene.add(bot);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop((t) => {
  const s = t / 1000;
  // Floaty low-grav hop preview: ~1.5 s hang time.
  const hop = (s % 1.5) / 1.5;
  bot.position.set(Math.sin(s * 0.9) * 300, 28 + 4 * 150 * hop * (1 - hop), Math.cos(s * 0.6) * 200);
  camera.position.set(Math.cos(s * 0.15) * 900, 420, Math.sin(s * 0.15) * 900);
  camera.lookAt(0, 60, 0);
  renderer.render(scene, camera);
});
