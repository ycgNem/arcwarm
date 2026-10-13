// First-person lightning gun, rendered in its own scene/camera so it never clips into walls. Also tells the
// world where its muzzle is on screen, so the beam leaves the barrel exactly.
import * as THREE from 'three';

const ndc = new THREE.Vector3();

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.5, 300);
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a3020, 1.4));
    const key = new THREE.DirectionalLight(0xffe6c4, 2.2);
    key.position.set(0.6, 1, 0.4);
    this.scene.add(key);

    const metal = new THREE.MeshStandardMaterial({ color: 0x6a7380, metalness: 0.25, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x34383f, metalness: 0.2, roughness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x9a7a3a, metalness: 0.35, roughness: 0.4 });
    this.coilMat = new THREE.MeshStandardMaterial({ color: 0x3f7fc0, emissive: 0x3a9cff, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.3 });

    this.gun = new THREE.Group();
    this.scene.add(this.gun);
    const add = (geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      this.gun.add(m);
      return m;
    };
    // Long, slim QL-style lightning gun: receiver, top rail, grip, coil-wrapped barrel, emitter tip.
    add(new THREE.BoxGeometry(2.6, 3.0, 11), metal, 0, 0, 1.5);
    add(new THREE.BoxGeometry(1.6, 1.2, 9.5), trim, 0, 2.0, 1.2);
    add(new THREE.BoxGeometry(1.8, 4.5, 2.2), dark, 0, -3.2, 4.2, -0.35);
    add(new THREE.CylinderGeometry(0.75, 0.95, 13, 14), dark, 0, 0.3, -10.5, Math.PI / 2);
    this.coils = [];
    for (let i = 0; i < 5; i++) {
      this.coils.push(add(new THREE.TorusGeometry(1.25, 0.22, 8, 20), this.coilMat, 0, 0.3, -6 - i * 2.1));
    }
    this.tip = add(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xbfe6ff }), 0, 0.3, -17.3);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.3, -17.6);
    this.gun.add(this.muzzle);

    this.base = new THREE.Vector3(6.2, -6.6, -16.5);
    this.gun.position.copy(this.base);
    this.gun.rotation.set(0.03, 0.07, 0);
    this.bob = 0;
    this.kick = 0;
    this.land = 0;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  update(dt, { firing, speed, onGround, time }) {
    if (onGround) this.bob += dt * (speed / 300) * 9;
    const amp = onGround ? Math.min(1, speed / 300) : 0;
    this.kick += ((firing ? 1 : 0) - this.kick) * Math.min(1, dt * 20);
    this.land = Math.max(0, this.land - dt * 5);
    this.gun.position.set(
      this.base.x + Math.sin(this.bob) * 0.35 * amp + (firing ? (Math.random() - 0.5) * 0.12 : 0),
      this.base.y + Math.abs(Math.cos(this.bob)) * 0.3 * amp - this.land * 0.9 + (firing ? (Math.random() - 0.5) * 0.12 : 0),
      this.base.z + this.kick * 0.7,
    );
    for (const [i, c] of this.coils.entries()) c.rotation.z = time * (firing ? 25 : 2) + i;
    this.coilMat.emissiveIntensity = firing ? 1.0 + Math.random() * 0.5 : 0.35;
    this.tip.scale.setScalar(firing ? 1.4 + Math.random() * 0.8 : 1);
  }

  // Muzzle position in NDC (shared between this camera and the world camera's screen).
  muzzleNDC(out = ndc) {
    this.gun.updateMatrixWorld(true);
    this.muzzle.getWorldPosition(out);
    return out.project(this.camera);
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
