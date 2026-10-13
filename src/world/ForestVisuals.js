// Dresses the Pinehollow collision layout: sky, sun + shadows, terrain, pines and birches, rocks, the treehouse,
// the shrine, ruins, launchers, ground cover, dust motes and light shafts. Every solid mesh matches its collider.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const SUN_DIR = new THREE.Vector3(0.55, 0.72, -0.42).normalize();

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
    this.tex = {
      ground: TX.groundDetail(),
      bark: TX.barkTexture(false),
      birch: TX.barkTexture(true),
      rock: TX.rockTexture(),
      plank: TX.plankTexture(),
      stone: TX.stoneBlockTexture(),
      fern: TX.fernTexture(),
      grass: TX.grassTexture(),
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
    this.buildAtmosphere();
  }

  buildSky() {
    const fogColor = new THREE.Color(0x9fb9b3);
    this.scene.fog = new THREE.Fog(fogColor, 900, 3600);
    this.scene.background = fogColor;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3a6c9c) },
        mid: { value: new THREE.Color(0xb3cdd0) },
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
          c += vec3(1.0, 0.88, 0.65) * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.35);
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
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x4a5a34, 1.75));
    const sun = new THREE.DirectionalLight(0xffe4bc, 3.1);
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

    // Colour: grass with moss in the hollow, needle litter under pines, dirt lanes, rock on the valley walls.
    const nrm = geo.attributes.normal;
    const col = new Float32Array(n1 * n1 * 3);
    const grassA = new THREE.Color(0x5f8a3a);
    const grassB = new THREE.Color(0x3d6428);
    const moss = new THREE.Color(0x3f6a33);
    const needles = new THREE.Color(0x7a5a3a);
    const dirt = new THREE.Color(0x8a6c4a);
    const rock = new THREE.Color(0x6f6a5e);
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
      for (const t of trees) {
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < t.r + 90) litter = Math.max(litter, 1 - d / (t.r + 90));
      }
      if (litter > 0) c.lerp(needles, Math.min(0.75, litter * 1.2));
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

  buildTrees() {
    const trees = this.layout.decor.trees;
    const pines = trees.filter((t) => t.type === 'pine');
    const birches = trees.filter((t) => t.type === 'birch');

    const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 10, 1, true).translate(0, 0.5, 0);
    const tiers = [];
    for (let k = 0; k < 5; k++) {
      const g = new THREE.ConeGeometry(1 - k * 0.17, 0.22, 10, 1);
      g.translate(0, 0.6 + k * 0.095, 0);
      g.rotateY(k * 0.7);
      tiers.push(g);
    }
    const pineGeo = mergeGeometries(tiers);
    const blobs = [
      new THREE.IcosahedronGeometry(1, 1).translate(0, 0, 0),
      new THREE.IcosahedronGeometry(0.75, 1).translate(0.55, 0.35, 0.2),
      new THREE.IcosahedronGeometry(0.7, 1).translate(-0.5, 0.45, -0.25),
      new THREE.IcosahedronGeometry(0.65, 1).translate(0.1, 0.8, -0.1),
    ];
    const birchGeo = mergeGeometries(blobs);

    const barkMat = new THREE.MeshStandardMaterial({ map: this.tex.bark, roughness: 1 });
    this.tex.bark.repeat.set(2, 6);
    const birchMat = new THREE.MeshStandardMaterial({ map: this.tex.birch, roughness: 0.9 });
    this.tex.birch.repeat.set(2, 5);
    const pineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 });

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
      const v = (t.x * 0.37 + t.z * 0.11) % 1;
      col.setHSL(0.3 + Math.abs(v) * 0.05, 0.42, 0.17 + Math.abs(v) * 0.07);
    });
    add(birches, birchMat, birchGeo, leafMat, (t, p, s, col) => {
      const cr = t.r * 6 + 50;
      p.set(t.x, t.y + t.height * 0.78, t.z);
      s.set(cr, cr * 1.15, cr);
      const v = Math.abs((t.x * 0.29 + t.z * 0.17) % 1);
      col.setHSL(0.22 + v * 0.06, 0.5, 0.3 + v * 0.1);
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
    const rockBase = new THREE.Color(0xc4c0b4);
    const stoneBase = new THREE.Color(0xc9c4b8);
    const mossC = new THREE.Color(0x4f7a34);

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
    place(this.layout.decor.tufts, cross(22, 12), this.tex.grass, new THREE.Color(0xe8f0d0));
  }

  buildAtmosphere() {
    // Drifting dust/pollen in the light.
    const N = 600;
    const pos = new Float32Array(N * 3);
    this.motes = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1000;
      const m = { x: Math.cos(a) * r, y: 10 + Math.random() * 280, z: Math.sin(a) * r, ph: Math.random() * 10 };
      this.motes.push(m);
      pos[i * 3] = m.x;
      pos[i * 3 + 1] = m.y;
      pos[i * 3 + 2] = m.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteGeo = geo;
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 2.2, map: this.tex.glow, color: 0xfff1c8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(pts);

    // God rays through the canopy: long additive planes along the sun direction, billboarded around that axis.
    this.shafts = [];
    const shaftMat = (this.shaftMat = new THREE.MeshBasicMaterial({
      map: this.tex.shaft,
      color: 0xfff0cc,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    for (let i = 0; i < 14; i++) {
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
    this.sky.position.copy(camera.position);
    const pa = this.moteGeo.attributes.position;
    const t = this.time;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      pa.setXYZ(i, m.x + Math.sin(t * 0.3 + m.ph) * 14, m.y + Math.sin(t * 0.21 + m.ph * 2) * 8, m.z + Math.cos(t * 0.27 + m.ph) * 14);
    }
    pa.needsUpdate = true;
    for (const s of this.shafts) s.lookAt(camera.position);
    // Shafts seen end-on (looking into the sun) turn into blobs: fade them out.
    camera.getWorldDirection(this._fwd || (this._fwd = new THREE.Vector3()));
    const into = Math.max(0, this._fwd.dot(SUN_DIR));
    this.shaftMat.opacity = 0.075 * (1 - into * into);
  }
}
