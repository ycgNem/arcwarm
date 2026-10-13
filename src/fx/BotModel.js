// Brightskin opponent: a blocky armoured figure that fills the QL hitbox (30×30×56, 40 crouched), with run/air/crouch
// poses, a gold Halo shield flare when hit, and its own lightning gun. Faces -Z at yaw 0.
import * as THREE from 'three';
import { HULL } from '../data/physics.js';

export class BotModel {
  constructor(scene, color) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.skin = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.55 });
    this.dark = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), emissive: color, emissiveIntensity: 0.18 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.6, roughness: 0.25, emissive: 0x332200, emissiveIntensity: 0.4 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.7, roughness: 0.4 });
    const coilMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff });
    // Back faces only: reads as a glowing halo around the body instead of a solid box.
    this.shieldMat = new THREE.MeshBasicMaterial({ color: 0xffc640, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });

    const box = (w, h, d, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // Legs pivot at the hip; geometry hangs below the pivot.
    this.hips = new THREE.Group();
    this.root.add(this.hips);
    this.legs = [-6, 6].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.x = x;
      this.hips.add(pivot);
      box(9, 14, 10, this.skin, pivot, 0, -7, 0);
      const shin = new THREE.Group();
      shin.position.y = -14;
      pivot.add(shin);
      box(8, 12, 9, this.dark, shin, 0, -6, 0.5);
      box(9, 3, 12, this.dark, shin, 0, -11.5, -1.5);
      return { pivot, shin };
    });

    this.torso = new THREE.Group();
    this.root.add(this.torso);
    box(24, 20, 13, this.skin, this.torso, 0, 10, 0);
    box(26, 6, 14, this.dark, this.torso, 0, 17, 0); // shoulder plate
    box(16, 8, 4, this.dark, this.torso, 0, 9, 7); // backpack
    this.head = new THREE.Group();
    this.head.position.y = 20;
    this.torso.add(this.head);
    box(12, 10, 12, this.skin, this.head, 0, 5, 0);
    box(10, 4, 2, visor, this.head, 0, 5.5, -6.2);

    // Arms + gun aim with pitch.
    this.arms = new THREE.Group();
    this.arms.position.set(0, 16, 0);
    this.torso.add(this.arms);
    box(6, 6, 16, this.skin, this.arms, -10, -4, -6);
    box(6, 6, 16, this.skin, this.arms, 10, -4, -6);
    const gun = new THREE.Group();
    gun.position.set(5, -6, -16);
    this.arms.add(gun);
    box(6, 7, 18, gunMat, gun, 0, 0, 0);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 12, 10).rotateX(Math.PI / 2), gunMat);
    barrel.position.set(0, 0.5, -14);
    gun.add(barrel);
    for (const z of [-4, -1, 2]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.9, 6, 14), coilMat);
      coil.position.set(0, 0.5, z - 8);
      gun.add(coil);
    }
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.5, -21);
    gun.add(this.muzzle);

    // Shield shell: the same silhouette, slightly inflated, flashing gold.
    this.shell = new THREE.Mesh(new THREE.BoxGeometry(34, 60, 24), this.shieldMat);
    this.shell.position.y = 28;
    this.root.add(this.shell);

    this.hitbox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(HULL.halfWidth * 2, 1, HULL.halfWidth * 2).translate(0, 0.5, 0)),
      new THREE.LineBasicMaterial({ color: 0xff3355 }),
    );
    scene.add(this.hitbox);
    this.hitbox.visible = false;

    this.phase = 0;
    this.crouch = 0;
    this.flash = 0;
    this.flashColor = new THREE.Color();
  }

  setColor(hex) {
    this.skin.color.set(hex);
    this.skin.emissive.set(hex);
    this.dark.color.set(hex).multiplyScalar(0.45);
    this.dark.emissive.set(hex);
  }

  hit(shieldHit) {
    this.flash = 1;
    this.shieldMat.color.set(shieldHit ? 0xffc640 : 0xff5040);
  }

  update(dt, s, showHitbox) {
    this.root.visible = s.alive;
    this.hitbox.visible = showHitbox && s.alive;
    if (!s.alive) return;
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = s.yaw;
    this.crouch += ((s.crouched ? 1 : 0) - this.crouch) * Math.min(1, dt * 18);
    const c = this.crouch;
    const legLen = 26 - 14 * c;
    this.hips.position.y = legLen;
    this.torso.position.y = legLen;
    this.torso.scale.y = 1 - 0.1 * c;
    this.head.scale.y = 1 / this.torso.scale.y;

    const speed = Math.hypot(s.vx, s.vz);
    // Legs swing in the direction of travel relative to facing.
    const fwd = -(s.vx * -Math.sin(s.yaw) + s.vz * -Math.cos(s.yaw)) / 300;
    const strafe = (s.vx * Math.cos(s.yaw) - s.vz * Math.sin(s.yaw)) / 300;
    for (const [i, leg] of this.legs.entries()) {
      const sgn = i === 0 ? 1 : -1;
      if (!s.onGround) {
        leg.pivot.rotation.set(-0.5 - 0.3 * sgn * Math.sign(fwd || 1), 0, 0.15 * sgn);
        leg.shin.rotation.x = 0.9;
      } else if (c > 0.5) {
        leg.pivot.rotation.set(-1.2, 0, 0.1 * sgn);
        leg.shin.rotation.x = 2.0;
      } else {
        this.phase += (speed / 300) * dt * 6 * (i === 0 ? 1 : 0);
        const sw = Math.sin(this.phase + i * Math.PI) * Math.min(1, speed / 200);
        leg.pivot.rotation.set(sw * 0.7 * (fwd >= 0 ? -1 : 1) * Math.max(0.3, Math.abs(fwd)), 0, sw * 0.45 * strafe);
        leg.shin.rotation.x = Math.max(0, -Math.sin(this.phase + i * Math.PI)) * 0.8 * Math.min(1, speed / 200);
      }
    }
    if (c > 0.5) this.legs.forEach((leg) => (leg.pivot.position.z = 0));
    this.arms.rotation.x = s.pitch;
    this.head.rotation.x = s.pitch * 0.6;
    this.torso.rotation.z = -strafe * 0.12;

    this.flash = Math.max(0, this.flash - dt * 9);
    this.shieldMat.opacity = this.flash * 0.7;
    this.shell.visible = this.flash > 0.01;
    this.shell.scale.y = (legLen + 30 * this.torso.scale.y) / 56;
    this.shell.position.y = ((legLen + 30 * this.torso.scale.y) / 2) * 1.0;

    this.hitbox.position.set(s.hx ?? s.x, s.hy ?? s.y, s.hz ?? s.z);
    this.hitbox.scale.y = s.height;
  }

  muzzleWorld(out) {
    this.root.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(out);
  }
}
