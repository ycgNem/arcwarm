// Lightning beam: a camera-facing ribbon with a crackling, endpoint-pinned jitter, a soft glow layer, an impact
// flare. (No point light: it would cost every lit pixel on screen.) Drawn from the muzzle to wherever the beam actually stops this frame.
import * as THREE from 'three';

const N = 32;
const tmp = new THREE.Vector3();
const tan = new THREE.Vector3();
const side = new THREE.Vector3();
const toCam = new THREE.Vector3();

function ribbon(width, color, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((N + 1) * 2 * 3);
  const uv = new Float32Array((N + 1) * 2 * 2);
  for (let i = 0; i <= N; i++) {
    uv[i * 4] = i / N;
    uv[i * 4 + 1] = 0;
    uv[i * 4 + 2] = i / N;
    uv[i * 4 + 3] = 1;
  }
  const idx = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; uniform float time; varying vec2 vUv;
      void main(){
        float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float flick = 0.8 + 0.2 * sin(vUv.x * 90.0 - time * 60.0);
        float a = pow(edge, 1.6) * opacity * flick;
        gl_FragColor = vec4(color * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return { mesh, width, pos: geo.attributes.position, mat };
}

export class Beam {
  constructor(scene, { color = 0x8fd0ff, glowTex }) {
    this.layers = [ribbon(16, color, 0.42), ribbon(5, 0xdff4ff, 0.95), ribbon(1.6, 0xffffff, 1)];
    for (const l of this.layers) scene.add(l.mesh);
    this.pts = Array.from({ length: N + 1 }, () => new THREE.Vector3());
    this.off = Array.from({ length: N + 1 }, () => ({ a: 0, b: 0, ta: 0, tb: 0 }));
    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flare.renderOrder = 11;
    scene.add(this.flare);
    this.u = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.t = 0;
    this.retarget = 0;
    this.setVisible(false);
  }

  setVisible(on) {
    for (const l of this.layers) l.mesh.visible = on;
    this.flare.visible = on;
    this.visible = on;
  }

  update(dt, start, end, camPos, impact) {
    this.setVisible(true);
    this.t += dt;
    const dir = tmp.subVectors(end, start);
    const len = Math.max(1, dir.length());
    dir.divideScalar(len);
    // A basis perpendicular to the beam for the jitter.
    this.u.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.9) this.u.set(1, 0, 0);
    this.u.cross(dir).normalize();
    this.v.crossVectors(dir, this.u);

    this.retarget -= dt;
    const amp = 2.2 + len * 0.009;
    if (this.retarget <= 0) {
      this.retarget = 0.03;
      for (const o of this.off) {
        o.ta = (Math.random() * 2 - 1) * amp;
        o.tb = (Math.random() * 2 - 1) * amp;
      }
    }
    const k = 1 - Math.exp(-dt * 40);
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const o = this.off[i];
      o.a += (o.ta - o.a) * k;
      o.b += (o.tb - o.b) * k;
      const taper = Math.sin(Math.PI * s) ** 0.8;
      const wave = Math.sin(s * 18 - this.t * 30) * 0.6;
      this.pts[i].copy(start).addScaledVector(dir, len * s).addScaledVector(this.u, (o.a + wave) * taper).addScaledVector(this.v, o.b * taper);
    }
    for (const l of this.layers) {
      l.mat.uniforms.time.value = this.t;
      const pa = l.pos;
      for (let i = 0; i <= N; i++) {
        const p = this.pts[i];
        const q = this.pts[Math.min(N, i + 1)];
        const r = this.pts[Math.max(0, i - 1)];
        tan.subVectors(q, r).normalize();
        toCam.subVectors(camPos, p).normalize();
        side.crossVectors(tan, toCam).normalize().multiplyScalar(l.width * 0.5 * (i === 0 ? 0.5 : 1));
        pa.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z);
        pa.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
      }
      pa.needsUpdate = true;
    }
    this.flare.position.copy(end);
    const fs = impact ? 34 + Math.random() * 18 : 0;
    this.flare.scale.set(fs, fs, 1);
    this.flare.visible = impact;
  }
}
