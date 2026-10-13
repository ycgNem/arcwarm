// Dresses the White Room: grid-textured white surfaces, tinted platforms and ramps, soft shadows, open sky.
// Same interface as ForestVisuals (tex.glow, sun, update).
import * as THREE from 'three';
import * as TX from './textures.js';

const SUN_DIR = new THREE.Vector3(0.45, 0.85, 0.3).normalize();

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f5f7';
  g.fillRect(0, 0, 512, 512);
  // 512 px = 256 units: minor line every 32 units, major every 128.
  for (let i = 0; i <= 512; i += 64) {
    const major = i % 256 === 0;
    g.fillStyle = major ? '#c9ced6' : '#e0e3e8';
    const w = major ? 4 : 2;
    g.fillRect(i - w / 2, 0, w, 512);
    g.fillRect(0, i - w / 2, 512, w);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Planar UVs in world units (non-indexed geometry with normals).
function worldUV(geo, scale, offset) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset.x;
    const y = p.getY(i) + offset.y;
    const z = p.getZ(i) + offset.z;
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Wedge mesh matching World ramp colliders exactly.
function rampGeometry(r) {
  const { x0, x1, z0, z1, y0, lowY, highY, dir } = r;
  const top = (x, z) => {
    let t;
    if (dir === '+x') t = (x - x0) / (x1 - x0);
    else if (dir === '-x') t = (x1 - x) / (x1 - x0);
    else if (dir === '+z') t = (z - z0) / (z1 - z0);
    else t = (z1 - z) / (z1 - z0);
    return lowY + (highY - lowY) * t;
  };
  const c = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const T = c.map(([x, z]) => [x, top(x, z), z]);
  const B = c.map(([x, z]) => [x, y0, z]);
  const tris = [];
  const quad = (a, b, cc, d) => tris.push(a, b, cc, a, cc, d);
  quad(T[0], T[3], T[2], T[1]); // top (normal up)
  quad(B[0], B[1], B[2], B[3]); // bottom
  quad(B[0], T[0], T[1], B[1]); // -z side
  quad(B[1], T[1], T[2], B[2]); // +x side
  quad(B[2], T[2], T[3], B[3]); // +z side
  quad(B[3], T[3], T[0], B[0]); // -x side
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
  geo.computeVertexNormals();
  return geo;
}

export class WhiteRoomVisuals {
  constructor(scene, layout, { shadows = true } = {}) {
    this.scene = scene;
    this.layout = layout;
    this.tex = { glow: TX.glowTexture(), grid: gridTexture() };
    const bg = new THREE.Color(0xc9d6e2);
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 2200, 5200);

    scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x9aa3ad, 1.15));
    const sun = new THREE.DirectionalLight(0xfff6ea, 1.9);
    sun.position.copy(SUN_DIR).multiplyScalar(1800);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(4096, 4096);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -1100;
    cam.right = cam.top = 1100;
    cam.near = 200;
    cam.far = 4000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 2;
    scene.add(sun, sun.target);
    this.sun = sun;

    const mat = (color) => new THREE.MeshStandardMaterial({ color, map: this.tex.grid, roughness: 0.85, metalness: 0 });
    const mats = {
      floor: mat(0xd9dce1),
      wall: mat(0xeef0f3),
      platform: mat(0x9fbde0),
      pillar: mat(0xe2e5ea),
      block: mat(0xe6b98e),
      ramp: mat(0xf0a160),
    };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), mats.floor);
    floor.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = v * (1800 / 256)));
    floor.receiveShadow = true;
    scene.add(floor);

    for (const b of layout.boxes) {
      let geo = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0).toNonIndexed();
      geo.computeVertexNormals();
      const center = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      worldUV(geo, 256, center);
      const m = new THREE.Mesh(geo, mats[b.kind] || mats.wall);
      m.position.copy(center);
      m.castShadow = b.kind !== 'wall';
      m.receiveShadow = true;
      scene.add(m);
    }
    for (const r of layout.ramps || []) {
      const geo = rampGeometry(r);
      worldUV(geo, 256, new THREE.Vector3());
      const m = new THREE.Mesh(geo, mats.ramp);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }

  update() {}
}
