// Pooled particles: beam-impact sparks, and brightskin gibs when someone gets fragged.
import * as THREE from 'three';

export class Effects {
  constructor(scene, glowTex) {
    this.scene = scene;
    this.gravity = 400;
    // Sparks
    this.maxSparks = 400;
    this.sparks = [];
    const geo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(this.maxSparks * 3);
    this.sparkCol = new Float32Array(this.maxSparks * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    geo.setDrawRange(0, 0);
    this.sparkGeo = geo;
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 3.5, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    pts.frustumCulled = false;
    scene.add(pts);
    // Gibs
    this.maxGibs = 80;
    this.gibs = [];
    this.gibMat = new THREE.MeshLambertMaterial({ color: 0x7dff3a, emissive: 0x7dff3a, emissiveIntensity: 0.5 });
    this.gibMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.gibMat, this.maxGibs);
    this.gibMesh.count = 0;
    this.gibMesh.frustumCulled = false;
    scene.add(this.gibMesh);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3();
    this.p = new THREE.Vector3();
  }

  setGibColor(hex) {
    this.gibMat.color.set(hex);
    this.gibMat.emissive.set(hex);
  }

  sparksAt(p, color, n = 3, speed = 160) {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= this.maxSparks) this.sparks.shift();
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.8);
      this.sparks.push({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * r * v, vy: u * v + 60, vz: Math.sin(a) * r * v, life: 0.25 + Math.random() * 0.3, c: color });
    }
  }

  gibsAt(p, vel) {
    for (let i = 0; i < 22; i++) {
      if (this.gibs.length >= this.maxGibs) this.gibs.shift();
      const size = 3 + Math.random() * 6;
      this.gibs.push({
        x: p.x + (Math.random() - 0.5) * 20,
        y: p.y + 10 + Math.random() * 40,
        z: p.z + (Math.random() - 0.5) * 20,
        vx: vel.x * 0.5 + (Math.random() - 0.5) * 320,
        vy: 90 + Math.random() * 260,
        vz: vel.z * 0.5 + (Math.random() - 0.5) * 320,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        wx: (Math.random() - 0.5) * 14,
        wy: (Math.random() - 0.5) * 14,
        size,
        life: 2.2 + Math.random(),
        ground: p.y,
      });
    }
  }

  update(dt, groundAt) {
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy -= this.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
    }
    for (const s of this.sparks) {
      this.sparkPos[n * 3] = s.x;
      this.sparkPos[n * 3 + 1] = s.y;
      this.sparkPos[n * 3 + 2] = s.z;
      const f = Math.min(1, s.life * 4);
      this.sparkCol[n * 3] = s.c.r * f;
      this.sparkCol[n * 3 + 1] = s.c.g * f;
      this.sparkCol[n * 3 + 2] = s.c.b * f;
      n++;
    }
    this.sparkGeo.setDrawRange(0, n);
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;

    let g = 0;
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const b = this.gibs[i];
      b.life -= dt;
      if (b.life <= 0) this.gibs.splice(i, 1);
    }
    for (const b of this.gibs) {
      b.vy -= this.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      const floor = groundAt(b.x, b.z) + b.size * 0.5;
      if (b.y < floor) {
        b.y = floor;
        b.vy *= -0.3;
        b.vx *= 0.6;
        b.vz *= 0.6;
        b.wx *= 0.6;
        b.wy *= 0.6;
      }
      b.rx += b.wx * dt;
      b.ry += b.wy * dt;
      const sc = b.size * Math.min(1, b.life * 1.5);
      this.m.compose(this.p.set(b.x, b.y, b.z), this.q.setFromEuler(this.e.set(b.rx, b.ry, 0)), this.s.set(sc, sc, sc));
      this.gibMesh.setMatrixAt(g++, this.m);
    }
    this.gibMesh.count = g;
    this.gibMesh.instanceMatrix.needsUpdate = true;
  }
}
