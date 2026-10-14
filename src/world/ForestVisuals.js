// Dresses the Pinehollow collision layout in late autumn: golden-hour sky, sun + shadows, terrain with leaf litter,
// pines, birches and maples (canopies sway in the wind), rocks, the treehouse, the shrine, ruins, launchers, ground
// cover, pebbles and mushrooms, distant mountains and clouds, falling leaves, dust motes and light shafts.
// Every solid mesh matches its collider; everything else is too small or too high to matter for movement or the beam.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const SUN_DIR = new THREE.Vector3(0.55, 0.62, -0.42).normalize();

// Seeded RNG for visual-only scatter (the layout's own RNG must not change: it places the colliders).
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (x, z) => {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// Wind sway for instanced canopies, done in the vertex shader (no CPU cost). The offset is added in world space after
// the instance matrix, weighted by the local height between y0 (still) and y1 (full sway).
function addSway(mat, timeUniform, y0, y1, amp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.windTime = timeUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          float ph = instanceMatrix[3].x * 0.011 + instanceMatrix[3].z * 0.017;
          float w = clamp((transformed.y - ${y0.toFixed(3)}) / ${(y1 - y0).toFixed(3)}, 0.0, 1.0);
          w *= w * ${amp.toFixed(2)};
          mvPosition.x += (sin(windTime * 0.9 + ph) + 0.35 * sin(windTime * 2.3 + ph * 1.7)) * w;
          mvPosition.z += (cos(windTime * 0.7 + ph * 1.3) * 0.6) * w;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  mat.customProgramCacheKey = () => `sway${y0},${y1},${amp}`;
}

// Cheap smooth 2D noise for colour variation.
const noise = (x, z) =>
  Math.sin(x * 0.0071 + 1.7) * Math.sin(z * 0.0083 - 0.4) * 0.5 +
  Math.sin(x * 0.019 - z * 0.013 + 2.1) * 0.3 +
  Math.sin(x * 0.047 + z * 0.041) * 0.2;

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

// Planar UVs in world units (non-indexed geometry, after normals are computed).
function worldUV(geo, scale, offset = new THREE.Vector3()) {
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
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Tint top-facing vertices toward moss.
function mossColors(geo, base, moss, amount = 1) {
  const n = geo.attributes.normal;
  const p = geo.attributes.position;
  const col = new Float32Array(n.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    const up = Math.max(0, n.getY(i));
    const k = Math.min(1, Math.max(0, (up - 0.35) * 1.8)) * amount * (0.75 + 0.25 * noise(p.getX(i) * 9, p.getZ(i) * 9));
    c.copy(base).lerp(moss, k);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export class ForestVisuals {
  constructor(scene, layout, { shadows = true } = {}) {
    this.scene = scene;
    this.layout = layout;
    this.time = 0;
    this.padMats = [];
    this.wind = { value: 0 }; // shared time uniform for canopy sway, falling leaves and motes
    this.tex = {
      ground: TX.groundDetail(),
      bark: TX.barkTexture(false),
      birch: TX.barkTexture(true),
      rock: TX.rockTexture(),
      plank: TX.plankTexture(),
      stone: TX.stoneBlockTexture(),
      fern: TX.fernTexture(),
      grass: TX.grassTexture(),
      leaves: TX.leafLitterTexture(),
      glow: TX.glowTexture(),
      shaft: TX.shaftTexture(),
    };
    this.buildSky();
    this.buildLights(shadows);
    this.buildTerrain();
    this.buildTrees();
    this.buildStructures();
    this.buildPads();
    this.buildCover();
    this.buildLitter();
    this.buildDistance();
    this.buildAtmosphere();
  }

  buildSky() {
    // Golden hour: warm haze low down, clear blue overhead.
    const fogColor = new THREE.Color(0xc8bea2);
    this.fogColor = fogColor;
    this.scene.fog = new THREE.Fog(fogColor, 900, 3600);
    this.scene.background = fogColor;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3f74a8) },
        mid: { value: new THREE.Color(0xe2d2b0) },
        bottom: { value: fogColor.clone() },
        sunDir: { value: SUN_DIR },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 c = d.y > 0.0 ? mix(mid, top, pow(clamp(d.y * 1.4, 0.0, 1.0), 0.7)) : bottom;
          float s = max(dot(d, sunDir), 0.0);
          c += vec3(1.0, 0.82, 0.55) * (pow(s, 900.0) * 3.0 + pow(s, 10.0) * 0.45);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 32, 16), mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  buildLights(shadows) {
    this.scene.add(new THREE.HemisphereLight(0xd6e4f4, 0x5a4a30, 1.7));
    const sun = new THREE.DirectionalLight(0xffd6a2, 3.2);
    sun.position.copy(SUN_DIR).multiplyScalar(2200);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(4096, 4096);
    const cam = sun.shadow.camera;
    cam.left = -1350;
    cam.right = 1350;
    cam.top = 1350;
    cam.bottom = -1350;
    cam.near = 300;
    cam.far = 5000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 2.5;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  buildTerrain() {
    const T = this.layout.terrain;
    const n = T.n;
    const n1 = n + 1;
    const pos = new Float32Array(n1 * n1 * 3);
    const uv = new Float32Array(n1 * n1 * 2);
    for (let j = 0; j < n1; j++) {
      for (let i = 0; i < n1; i++) {
        const k = j * n1 + i;
        const x = T.origin + i * T.step;
        const z = T.origin + j * T.step;
        pos[k * 3] = x;
        pos[k * 3 + 1] = T.h[k];
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 150;
        uv[k * 2 + 1] = z / 150;
      }
    }
    const idx = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * n1 + i;
        const b = a + 1;
        const c = a + n1;
        const d = c + 1;
        idx.push(a, c, d, a, d, b); // same diagonal as Heightfield.heightAt
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    // Colour: autumn grass with moss in the hollow, needle litter under pines, fallen leaves under maples and birches,
    // dirt lanes, rock on the valley walls.
    const nrm = geo.attributes.normal;
    const col = new Float32Array(n1 * n1 * 3);
    const grassA = new THREE.Color(0x66763e);
    const grassB = new THREE.Color(0x46562e);
    const moss = new THREE.Color(0x4a6a2e);
    const needles = new THREE.Color(0x6e4f33);
    const leaves = { maple: new THREE.Color(0x9c4f26), birch: new THREE.Color(0xa88232) };
    const dirt = new THREE.Color(0x8a6a46);
    const rock = new THREE.Color(0x77705f);
    const lanes = [
      [-760, 96, -300, 40],
      [-300, 40, 150, -80],
      [150, -80, 800, -60],
      [-60, 600, -20, 200],
      [-20, 200, 40, -640],
      [440, 780, 380, 380],
    ];
    const trees = this.layout.decor.trees;
    const c = new THREE.Color();
    for (let k = 0; k < n1 * n1; k++) {
      const x = pos[k * 3];
      const z = pos[k * 3 + 2];
      const r = Math.hypot(x, z);
      const nz = noise(x, z);
      c.copy(grassA).lerp(grassB, 0.5 + 0.5 * nz);
      const hollow = Math.max(0, 1 - r / 420);
      c.lerp(moss, hollow * 0.7);
      let litter = 0;
      let litterC = needles;
      for (const t of trees) {
        const kind = this.treeKind(t);
        const reach = t.r + (kind === 'pine' ? 90 : 150);
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < reach && 1 - d / reach > litter) {
          litter = 1 - d / reach;
          litterC = kind === 'pine' ? needles : leaves[kind];
        }
      }
      if (litter > 0) c.lerp(litterC, Math.min(0.75, litter * 1.2));
      let lane = 0;
      for (const [ax, az, bx, bz] of lanes) {
        const d = segDist(x, z, ax, az, bx, bz) + nz * 10;
        if (d < 34) lane = Math.max(lane, 1 - d / 34);
      }
      if (lane > 0) c.lerp(dirt, Math.min(0.8, lane * 1.5));
      const slope = 1 - nrm.getY(k);
      if (r > 950) c.lerp(rock, Math.min(0.85, (r - 950) / 300 + slope * 1.5));
      c.multiplyScalar(0.92 + 0.12 * Math.sin(x * 0.13) * Math.sin(z * 0.11));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.tex.ground, roughness: 0.97, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  // Visual variety only: half the layout's birches are drawn as maples (same trunk collider, bark trunk, red canopy).
  treeKind(t) {
    if (t.type === 'pine') return 'pine';
    return hash(t.x, t.z) < 0.5 ? 'maple' : 'birch';
  }

  buildTrees() {
    const trees = this.layout.decor.trees;
    const pines = trees.filter((t) => this.treeKind(t) === 'pine');
    const birches = trees.filter((t) => this.treeKind(t) === 'birch');
    const maples = trees.filter((t) => this.treeKind(t) === 'maple');

    // Darken each vertex toward the bottom of its own tier/blob: cheap self-shadowing that separates the layers.
    const shade = (g, lo, hi, dark) => {
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const k = Math.min(1, Math.max(0, (p.getY(i) - lo) / (hi - lo)));
        const v = dark + (1 - dark) * k;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };
    const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 10, 1, true).translate(0, 0.5, 0);
    const tiers = [];
    for (let k = 0; k < 5; k++) {
      const g = shade(new THREE.ConeGeometry(1 - k * 0.17, 0.22, 10, 1), -0.11, 0.11, 0.68);
      g.translate(0, 0.6 + k * 0.095, 0);
      g.rotateY(k * 0.7);
      tiers.push(g);
    }
    const pineGeo = mergeGeometries(tiers);
    const blob = (r, x, y, z) => shade(new THREE.IcosahedronGeometry(r, 1), -r, r, 0.72).translate(x, y, z);
    const blobs = [blob(1, 0, 0, 0), blob(0.75, 0.55, 0.35, 0.2), blob(0.7, -0.5, 0.45, -0.25), blob(0.65, 0.1, 0.8, -0.1)];
    const birchGeo = mergeGeometries(blobs);

    const barkMat = new THREE.MeshStandardMaterial({ map: this.tex.bark, roughness: 1 });
    this.tex.bark.repeat.set(2, 6);
    const birchMat = new THREE.MeshStandardMaterial({ map: this.tex.birch, roughness: 0.9 });
    this.tex.birch.repeat.set(2, 5);
    const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    // Tall pines lean a little at the tip; leafy crowns rustle more.
    addSway(pineMat, this.wind, 0.6, 1.1, 5);
    addSway(leafMat, this.wind, -1, 1.5, 6);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);

    const add = (list, trunkMat, canopyGeo, canopyMat, canopyFn) => {
      if (!list.length) return;
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, (t.x * 13.1 + t.z * 7.7) % 6.28);
        p.set(t.x, t.y - 12, t.z);
        s.set(t.r, t.height, t.r);
        trunks.setMatrixAt(i, m.compose(p, q, s));
        canopyFn(t, p, s, col);
        canopy.setMatrixAt(i, m.compose(p, q, s));
        canopy.setColorAt(i, col);
      });
      for (const im of [trunks, canopy]) {
        im.castShadow = true;
        im.receiveShadow = true;
        this.scene.add(im);
      }
    };
    add(pines, barkMat, pineGeo, pineMat, (t, p, s, col) => {
      const cr = t.r * 4 + 26 + (t.big ? 30 : 0);
      p.set(t.x, t.y - 12, t.z);
      s.set(cr, t.height * 1.02, cr);
      // Deep, slightly blue greens: the evergreen backdrop the warm trees (and the bright bot) stand out against.
      const v = Math.abs((t.x * 0.37 + t.z * 0.11) % 1);
      col.setHSL(0.36 + v * 0.05, 0.4, 0.2 + v * 0.07);
    });
    const crown = (t, p, s) => {
      const cr = t.r * 6 + 50;
      p.set(t.x, t.y + t.height * 0.78, t.z);
      s.set(cr, cr * 1.15, cr);
    };
    add(birches, birchMat, birchGeo, leafMat, (t, p, s, col) => {
      crown(t, p, s);
      const v = hash(t.z, t.x);
      col.setHSL(0.085 + v * 0.03, 0.8, 0.52 + v * 0.06); // gold
    });
    add(maples, barkMat, birchGeo, leafMat, (t, p, s, col) => {
      crown(t, p, s);
      const v = hash(t.z, t.x);
      col.setHSL(0.015 + v * 0.05, 0.7, 0.42 + v * 0.08); // crimson to orange
    });
  }

  buildStructures() {
    const mats = {
      rock: new THREE.MeshStandardMaterial({ map: this.tex.rock, vertexColors: true, roughness: 0.95, flatShading: true }),
      plank: new THREE.MeshStandardMaterial({ map: this.tex.plank, roughness: 0.85 }),
      rail: new THREE.MeshStandardMaterial({ map: this.tex.plank, color: 0x9a8070, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ map: this.tex.stone, vertexColors: true, roughness: 0.92 }),
      bark: new THREE.MeshStandardMaterial({ map: this.tex.bark, roughness: 1 }),
    };
    const rockBase = new THREE.Color(0xc6bba8);
    const stoneBase = new THREE.Color(0xcdc2ae);
    const mossC = new THREE.Color(0x5b7a2e);

    const boxMesh = (b, mat, { jag = 0, seed = 1, moss = 0, base = rockBase, uvScale = 96, segs = 1 } = {}) => {
      const sx = b.x1 - b.x0;
      const sy = b.y1 - b.y0;
      const sz = b.z1 - b.z0;
      let geo = new THREE.BoxGeometry(sx, sy, sz, segs, segs, segs);
      if (jag > 0) {
        // Pull vertices inward only (the visual never pokes outside the collider), more at corners.
        const pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const x = pa.getX(i);
          const y = pa.getY(i);
          const z = pa.getZ(i);
          const ux = (2 * x) / sx;
          const uy = (2 * y) / sy;
          const uz = (2 * z) / sz;
          const corner = (Math.abs(ux) * Math.abs(uz) + Math.max(0, uy) * (Math.abs(ux) + Math.abs(uz)) * 0.5) * 0.5;
          const h = Math.sin(x * 0.21 + seed) * Math.cos(z * 0.19 - seed) * Math.sin(y * 0.23 + seed * 0.5);
          const k = 1 - jag * (0.35 + 0.65 * corner) - jag * 0.35 * (0.5 + 0.5 * h);
          pa.setXYZ(i, x * Math.min(1, k + (uy < -0.6 ? 0.2 : 0)), y * (uy > 0 ? 1 - jag * 0.25 * corner : 1), z * Math.min(1, k + (uy < -0.6 ? 0.2 : 0)));
        }
      }
      geo = geo.toNonIndexed();
      geo.computeVertexNormals();
      const center = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      worldUV(geo, uvScale, center);
      if (mat.vertexColors) mossColors(geo, base, mossC, moss);
      geo.translate(center.x, center.y, center.z);
      batch(mat, geo);
    };
    // Static geometry is merged into one mesh per material: a handful of draw calls instead of ~50.
    const batches = new Map();
    const batch = (mat, geo) => {
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push(geo);
    };

    for (const b of this.layout.boxes) {
      switch (b.kind) {
        case 'rock':
          boxMesh(b, mats.rock, { jag: 0.16, seed: (b.seed % 100) / 10, moss: 0.9, segs: 4 });
          break;
        case 'plateau': {
          boxMesh({ ...b, y1: b.y1 - 4 }, mats.rock, { jag: 0.025, seed: 3, moss: 0.4, segs: 6 });
          boxMesh({ ...b, x0: b.x0 - 4, x1: b.x1 + 4, z0: b.z0 - 4, z1: b.z1 + 4, y0: b.y1 - 6 }, mats.plank, { uvScale: 128 });
          break;
        }
        case 'rail':
        case 'stair':
          boxMesh(b, b.kind === 'rail' ? mats.rail : mats.plank, { uvScale: 96 });
          break;
        case 'slab':
        case 'stoneStair':
        case 'pillar':
        case 'fallen':
        case 'wall':
          boxMesh(b, mats.stone, { moss: b.kind === 'pillar' ? 0.6 : 0.85, base: stoneBase, uvScale: 110 });
          break;
        case 'log': {
          const len = b.x1 - b.x0;
          const geo = new THREE.CylinderGeometry(b.radius + 0.5, b.radius + 0.5, len, 18, 1, false);
          geo.rotateZ(Math.PI / 2);
          this.tex.bark.repeat.set(2, 6);
          geo.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
          batch(mats.bark, geo.toNonIndexed());
          break;
        }
      }
    }
    for (const [mat, geos] of batches) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  buildPads() {
    const colors = { lift: new THREE.Color(0x58b6ff), pad: new THREE.Color(0x46ffd2), cannon: new THREE.Color(0xffa63d) };
    for (const p of this.layout.pads) {
      const color = colors[p.kind];
      const group = new THREE.Group();
      group.position.set(p.x, p.y, p.z);
      const discMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 }, color: { value: color } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv;
          void main(){
            float r = length(vUv - 0.5) * 2.0;
            float rings = smoothstep(0.65, 1.0, sin((r * 6.0 - time * 3.0) * 3.14159) * 0.5 + 0.5);
            float a = (rings * 0.7 + 0.25) * smoothstep(1.0, 0.9, r) + smoothstep(0.82, 0.95, r) * smoothstep(1.0, 0.95, r) * 1.5;
            gl_FragColor = vec4(color * a, a);
          }`,
      });
      this.padMats.push(discMat);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r, 48), discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 1.2;
      group.add(disc);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(p.r + 2, 3.5, 8, 48),
        new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.7, roughness: 0.35, emissive: color, emissiveIntensity: 0.35 }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 1;
      rim.castShadow = true;
      group.add(rim);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(p.r + 6, p.r + 10, 10, 32), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.8 }));
      base.position.y = -4;
      base.receiveShadow = true;
      group.add(base);

      const height = p.kind === 'lift' ? 230 : 70;
      const colMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 }, color: { value: color }, strength: { value: p.kind === 'lift' ? 0.55 : 0.35 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float time; uniform vec3 color; uniform float strength; varying vec2 vUv;
          void main(){
            float bands = sin((vUv.y * 8.0 - time * 2.5) * 6.2831) * 0.5 + 0.5;
            float a = strength * (1.0 - vUv.y) * (0.35 + 0.65 * bands * bands);
            gl_FragColor = vec4(color * a, a);
          }`,
      });
      this.padMats.push(colMat);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.92, p.r * 0.92, height, 32, 1, true), colMat);
      column.position.y = height / 2 + 1;
      group.add(column);

      if (p.kind !== 'lift') {
        // Chevrons on the pad pointing where it throws you.
        const shape = new THREE.Shape();
        shape.moveTo(-12, -6);
        shape.lineTo(0, 6);
        shape.lineTo(12, -6);
        shape.lineTo(12, -1);
        shape.lineTo(0, 11);
        shape.lineTo(-12, -1);
        const chev = new THREE.ShapeGeometry(shape);
        const chevMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
        const ang = Math.atan2(p.target.x - p.x, p.target.z - p.z);
        for (let k = 0; k < 2; k++) {
          const m = new THREE.Mesh(chev, chevMat);
          m.rotation.x = -Math.PI / 2;
          m.rotation.z = Math.PI + ang;
          m.position.set(Math.sin(ang) * (k * 14 - 6), 2, Math.cos(ang) * (k * 14 - 6));
          group.add(m);
        }
      }
      this.scene.add(group);
    }
  }

  buildCover() {
    const cross = (w, h) => {
      const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
      const b = a.clone().rotateY(Math.PI / 2);
      return mergeGeometries([a, b]);
    };
    const place = (items, geo, map, tint) => {
      const mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide });
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      const c = new THREE.Color();
      const up = new THREE.Vector3(0, 1, 0);
      items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rot);
        p.set(it.x, it.y - 1, it.z);
        s.set(it.s, it.s, it.s);
        im.setMatrixAt(i, m.compose(p, q, s));
        c.copy(tint).multiplyScalar(0.8 + 0.4 * ((it.x * 0.13 + it.z * 0.07) % 1 + 1) * 0.5);
        im.setColorAt(i, c);
      });
      im.receiveShadow = true;
      this.scene.add(im);
    };
    place(this.layout.decor.ferns, cross(40, 24), this.tex.fern, new THREE.Color(0xffffff));
    place(this.layout.decor.tufts, cross(22, 12), this.tex.grass, new THREE.Color(0xf0e8b8));
  }

  // Ground clutter that never reaches step height: leaf-litter decals, pebbles, mushrooms. One draw call each.
  buildLitter() {
    const L = this.layout;
    const rng = mulberry(91);
    const H = (x, z) => L.terrain.heightAt(x, z);
    const clear = (x, z, margin) => {
      for (const b of L.boxes) if (x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin) return false;
      for (const p of L.pads) if (Math.hypot(x - p.x, z - p.z) < p.r + margin + 10) return false;
      for (const c of L.cylinders) if (Math.hypot(x - c.x, z - c.z) < c.r + 2) return false;
      return Math.hypot(x, z) < 1300;
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const q2 = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const tilt = (x, z) => n.set(H(x - 8, z) - H(x + 8, z), 16, H(x, z - 8) - H(x, z + 8)).normalize();
    const deciduous = L.decor.trees.filter((t) => this.treeKind(t) !== 'pine');

    // Leaf drifts: flat decals lying on the slope, under the maples and birches and blown along the lanes.
    const drifts = [];
    for (const t of deciduous) {
      const k = t.outer ? 2 : 6;
      for (let i = 0; i < k; i++) {
        const a = rng() * Math.PI * 2;
        const d = t.r + 10 + rng() * 110;
        drifts.push({ x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d, kind: this.treeKind(t) });
      }
    }
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 1000;
      drifts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, kind: rng() < 0.5 ? 'maple' : 'birch' });
    }
    const leafCols = { maple: [0xa8743e, 0x946238, 0xb4844a], birch: [0xc89a3c, 0xb08a42, 0xbe9448] };
    const keep = drifts.filter((d) => clear(d.x, d.z, 4));
    const leafMat = new THREE.MeshLambertMaterial({ map: this.tex.leaves, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const leafIm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), leafMat, keep.length);
    keep.forEach((d, i) => {
      q.setFromUnitVectors(up, tilt(d.x, d.z)).multiply(q2.setFromAxisAngle(up, rng() * 6.28));
      const w = 30 + rng() * 30;
      leafIm.setMatrixAt(i, m.compose(p.set(d.x, H(d.x, d.z) + 0.8, d.z), q, s.set(w, 1, w)));
      const pal = leafCols[d.kind];
      leafIm.setColorAt(i, c.set(pal[Math.floor(rng() * pal.length)]));
    });
    leafIm.receiveShadow = true;
    this.scene.add(leafIm);

    // Pebbles: flattened low-poly stones, mostly along the lanes and around rocks.
    const pebbles = [];
    for (let i = 0; pebbles.length < 170 && i < 2000; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 1050;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (clear(x, z, 3)) pebbles.push({ x, z });
    }
    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 });
    const pebbleIm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), pebbleMat, pebbles.length);
    pebbles.forEach((d, i) => {
      q.setFromEuler(new THREE.Euler(rng() * 0.5, rng() * 6.28, rng() * 0.5));
      const w = 2.5 + rng() * 4;
      pebbleIm.setMatrixAt(i, m.compose(p.set(d.x, H(d.x, d.z) + 0.3, d.z), q, s.set(w, w * (0.4 + rng() * 0.25), w * (0.7 + rng() * 0.3))));
      const v = 0.07 + rng() * 0.07; // linear
      pebbleIm.setColorAt(i, c.setRGB(v * 1.08, v, v * 0.85));
    });
    pebbleIm.castShadow = false;
    pebbleIm.receiveShadow = true;
    this.scene.add(pebbleIm);

    // Mushrooms: little clusters at the foot of trunks, logs and rocks. Stem + cap in one geometry (vertex colours).
    const stem = new THREE.CylinderGeometry(0.8, 1, 4, 6, 1).translate(0, 2, 0);
    const cap = new THREE.SphereGeometry(2.6, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, 3.6, 0);
    const paint = (g, hex) => {
      const col = new THREE.Color(hex);
      const a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) [a[i], a[i + 1], a[i + 2]] = [col.r, col.g, col.b];
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    const shroomGeo = mergeGeometries([paint(stem.toNonIndexed(), 0xe8dcc0), paint(cap.toNonIndexed(), 0xffffff)]);
    const spots = [];
    for (const t of L.decor.trees) if (!t.outer && rng() < 0.45) spots.push({ x: t.x, z: t.z, r: t.r + 3 });
    for (const b of L.boxes) {
      if (b.kind !== 'rock' && b.kind !== 'log') continue;
      spots.push({ x: b.x0 - 3, z: (b.z0 + b.z1) / 2, r: 0 }, { x: b.x1 + 3, z: (b.z0 + b.z1) / 2, r: 0 });
    }
    const shrooms = [];
    for (const sp of spots) {
      const a0 = rng() * 6.28;
      const k = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < k; i++) {
        const a = a0 + (rng() - 0.5) * 1.2;
        const d = sp.r + 2 + rng() * 9;
        const x = sp.x + Math.cos(a) * d;
        const z = sp.z + Math.sin(a) * d;
        if (clear(x, z, 1)) shrooms.push({ x, z });
      }
    }
    const capCols = [0xa8784a, 0x8c6a48, 0xd8ccb0];
    const shroomIm = new THREE.InstancedMesh(shroomGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), shrooms.length);
    shrooms.forEach((d, i) => {
      q.setFromAxisAngle(n.set(rng() - 0.5, 4, rng() - 0.5).normalize(), 0.25);
      const w = 0.7 + rng() * 0.8;
      shroomIm.setMatrixAt(i, m.compose(p.set(d.x, H(d.x, d.z) - 0.5, d.z), q, s.set(w, w, w)));
      shroomIm.setColorAt(i, c.set(capCols[Math.floor(rng() * capCols.length)]));
    });
    shroomIm.receiveShadow = true;
    this.scene.add(shroomIm);
  }

  // Low-poly clouds high over the bowl, lit warm from below by the low sun. One merged mesh, slowly turning.
  buildDistance() {
    const rng = mulberry(17);
    const parts = [];
    const top = new THREE.Color(0xf6efe4);
    const under = new THREE.Color(0xdcc0a8);
    const tmp = new THREE.Color();
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + rng() * 0.4;
      const r = 3000 + rng() * 2000;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 2700 + rng() * 700;
      const n = 4 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const sz = 110 + rng() * 140;
        const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
        g.scale(sz * 1.6, sz * 0.55, sz);
        g.rotateY(rng() * 6.28);
        g.translate(cx + (i - n / 2) * sz * 1.1 + rng() * 80, cy + rng() * 60, cz + (rng() - 0.5) * 220);
        const pa = g.attributes.position;
        const col = new Float32Array(pa.count * 3);
        for (let v = 0; v < pa.count; v += 3) {
          // Flat colour per facet, by which way it faces: tops bright, undersides warm.
          const ny = (pa.getY(v) + pa.getY(v + 1) + pa.getY(v + 2)) / 3 - cy;
          tmp.copy(under).lerp(top, Math.min(1, Math.max(0, 0.5 + ny / 120)));
          for (let j = 0; j < 3; j++) col.set([tmp.r, tmp.g, tmp.b], (v + j) * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.deleteAttribute('normal');
        g.deleteAttribute('uv');
        parts.push(g);
      }
    }
    this.clouds = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    this.scene.add(this.clouds);
  }

  buildAtmosphere() {
    // Drifting dust/pollen in the light. The drift runs in the vertex shader, so the CPU never touches it.
    const N = 450;
    const pos = new Float32Array(N * 3);
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1000;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 10 + Math.random() * 280;
      pos[i * 3 + 2] = Math.sin(a) * r;
      phase[i] = Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    const moteMat = new THREE.PointsMaterial({ size: 2.2, map: this.tex.glow, color: 0xffe6b8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
    moteMat.onBeforeCompile = (sh) => {
      sh.uniforms.windTime = this.wind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float windTime;\nattribute float phase;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position + vec3(sin(windTime * 0.3 + phase) * 14.0, sin(windTime * 0.21 + phase * 2.0) * 8.0, cos(windTime * 0.27 + phase) * 14.0);`,
        );
    };
    moteMat.customProgramCacheKey = () => 'motes';
    const pts = new THREE.Points(geo, moteMat);
    pts.frustumCulled = false;
    this.scene.add(pts);

    // Falling leaves under the maples and birches: one instanced quad, the whole fall + flutter computed on the GPU.
    const deciduous = this.layout.decor.trees.filter((t) => !t.outer && this.treeKind(t) !== 'pine');
    const rng = mulberry(5);
    const NL = 90;
    const seed = new Float32Array(NL * 4); // x, z, phase, spin
    const span = new Float32Array(NL * 2); // top y, ground y
    const tint = new Float32Array(NL * 3);
    const c = new THREE.Color();
    const pal = { maple: [0xc85a26, 0xe0882c, 0xb0502a], birch: [0xb88a3a, 0xa07a34] };
    for (let i = 0; i < NL; i++) {
      const t = deciduous[i % deciduous.length];
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * (t.r * 6 + 50);
      const x = t.x + Math.cos(a) * d;
      const z = t.z + Math.sin(a) * d;
      seed.set([x, z, rng() * 100, 1.5 + rng() * 2.5], i * 4);
      span.set([t.y + t.height * 0.72, this.layout.terrain.heightAt(x, z) + 1], i * 2);
      const p = pal[this.treeKind(t)];
      c.set(p[Math.floor(rng() * p.length)]);
      tint.set([c.r, c.g, c.b], i * 3);
    }
    const leafGeo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(4.5, 3.2);
    leafGeo.index = quad.index;
    leafGeo.setAttribute('position', quad.attributes.position);
    leafGeo.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 4));
    leafGeo.setAttribute('span', new THREE.InstancedBufferAttribute(span, 2));
    leafGeo.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
    leafGeo.instanceCount = NL;
    const fallMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      fog: true,
      uniforms: { ...THREE.UniformsLib.fog, windTime: this.wind, sunDir: { value: SUN_DIR } },
      vertexShader: `uniform float windTime; attribute vec4 seed; attribute vec2 span; attribute vec3 tint;
        varying vec3 vCol;
        #include <fog_pars_vertex>
        void main(){
          float h = span.x - span.y;
          float life = h / 38.0;                                 // seconds to fall at ~38 u/s
          float t = mod(windTime + seed.z, life) / life;           // 0 at the crown, 1 on the ground
          float a = windTime * seed.w + seed.z;
          // Flutter: spin around a tilted axis while swinging side to side.
          vec3 p = position;
          float ca = cos(a), sa = sin(a), cb = cos(a * 0.7), sb = sin(a * 0.7);
          p = vec3(p.x * ca - p.y * sa, p.x * sa + p.y * ca, p.z);
          p = vec3(p.x, p.y * cb - p.z * sb, p.y * sb + p.z * cb);
          vec3 n = vec3(-sa * cb, ca * cb, sb);                    // the rotated plane normal, for a cheap glint
          vec3 w = vec3(seed.x + sin(a * 0.35) * 18.0 + t * 30.0, mix(span.x, span.y, t), seed.y + cos(a * 0.3) * 14.0);
          vCol = tint * (0.5 + 0.3 * abs(dot(n, vec3(${SUN_DIR.x.toFixed(3)}, ${SUN_DIR.y.toFixed(3)}, ${SUN_DIR.z.toFixed(3)}))));
          vec4 mvPosition = viewMatrix * vec4(w + p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 vCol;
        #include <fog_pars_fragment>
        void main(){
          gl_FragColor = vec4(vCol, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const fall = new THREE.Mesh(leafGeo, fallMat);
    fall.frustumCulled = false;
    this.scene.add(fall);

    // God rays through the canopy: long additive planes along the sun direction, billboarded around that axis.
    this.shafts = [];
    const shaftMat = (this.shaftMat = new THREE.MeshBasicMaterial({
      map: this.tex.shaft,
      color: 0xffe2b0,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 150 + Math.random() * 800;
      const w = 50 + Math.random() * 90;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 1100), shaftMat);
      mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r).addScaledVector(SUN_DIR, 420);
      mesh.up.copy(SUN_DIR);
      this.shafts.push(mesh);
      this.scene.add(mesh);
    }
  }

  update(dt, camera) {
    this.time += dt;
    for (const m of this.padMats) m.uniforms.time.value = this.time;
    this.wind.value = this.time;
    this.sky.position.copy(camera.position);
    this.clouds.rotation.y = this.time * 0.004;
    for (const s of this.shafts) s.lookAt(camera.position);
    // Shafts seen end-on (looking into the sun) turn into blobs: fade them out.
    camera.getWorldDirection(this._fwd || (this._fwd = new THREE.Vector3()));
    const into = Math.max(0, this._fwd.dot(SUN_DIR));
    this.shaftMat.opacity = 0.075 * (1 - into * into);
  }
}
