// Canvas-painted textures (no image assets). Most are near-grey detail maps tinted by vertex colors.
import * as THREE from 'three';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { repeat = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  return t;
}

const R = Math.random;

export function groundDetail() {
  const [c, g] = canvas(512);
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + R() * 105;
    g.strokeStyle = `rgba(${v},${v},${v},${0.25 + R() * 0.35})`;
    g.lineWidth = 1 + R() * 1.5;
    const x = R() * 512;
    const y = R() * 512;
    const a = -Math.PI / 2 + (R() - 0.5) * 1.2;
    const l = 4 + R() * 9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 260; i++) {
    const v = 120 + R() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.beginPath();
    g.arc(R() * 512, R() * 512, 2 + R() * 7, 0, Math.PI * 2);
    g.fill();
  }
  return toTex(c);
}

export function barkTexture(light = false) {
  const [c, g] = canvas(256, 512);
  g.fillStyle = light ? '#e6e2da' : '#6b4a33';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 160; i++) {
    const x = R() * 256;
    const w = 2 + R() * 7;
    if (light) {
      g.fillStyle = `rgba(30,30,30,${0.35 + R() * 0.5})`;
      g.fillRect(x, R() * 512, w * 2.5, 2 + R() * 4);
    } else {
      const v = R() < 0.5 ? 'rgba(30,18,10,' : 'rgba(140,105,75,';
      g.fillStyle = v + (0.25 + R() * 0.35) + ')';
      g.fillRect(x, 0, w, 512);
    }
  }
  if (!light) {
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(20,12,6,${0.4 + R() * 0.4})`;
      g.fillRect(R() * 256, R() * 512, 1 + R() * 2, 20 + R() * 70);
    }
  }
  return toTex(c);
}

export function rockTexture() {
  const [c, g] = canvas(512);
  g.fillStyle = '#b4b4ae';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const v = 130 + R() * 100;
    g.fillStyle = `rgba(${v},${v},${v - 4},${0.15 + R() * 0.3})`;
    g.beginPath();
    g.arc(R() * 512, R() * 512, 1 + R() * 14, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(40,40,40,0.45)';
  for (let i = 0; i < 26; i++) {
    g.lineWidth = 1 + R() * 1.5;
    g.beginPath();
    let x = R() * 512;
    let y = R() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (R() - 0.5) * 70;
      y += (R() - 0.5) * 70;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTex(c);
}

export function plankTexture() {
  const [c, g] = canvas(512);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const v = 0.85 + R() * 0.25;
    g.fillStyle = `rgb(${Math.floor(150 * v)},${Math.floor(110 * v)},${Math.floor(72 * v)})`;
    g.fillRect(0, (r * 512) / rows, 512, 512 / rows);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,38,20,${0.1 + R() * 0.2})`;
      g.fillRect(R() * 512, (r * 512) / rows + R() * (512 / rows), 30 + R() * 120, 1 + R() * 2);
    }
    g.fillStyle = 'rgba(30,18,8,0.8)';
    g.fillRect(0, (r * 512) / rows, 512, 3);
    const seam = R() * 512;
    g.fillRect(seam, (r * 512) / rows, 3, 512 / rows);
  }
  return toTex(c);
}

export function stoneBlockTexture() {
  const [c, g] = canvas(512);
  g.fillStyle = '#5c5a55';
  g.fillRect(0, 0, 512, 512);
  const rows = 6;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -60 : 0;
    while (x < 512) {
      const w = 90 + R() * 80;
      const v = 150 + R() * 50;
      g.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
      g.fillRect(x + 3, r * rh + 3, w - 6, rh - 6);
      for (let i = 0; i < 25; i++) {
        const s = 90 + R() * 80;
        g.fillStyle = `rgba(${s},${s},${s},0.25)`;
        g.fillRect(x + 3 + R() * (w - 10), r * rh + 3 + R() * (rh - 10), 2 + R() * 6, 2 + R() * 6);
      }
      x += w;
    }
  }
  return toTex(c);
}

function frond(g, x, y, len, ang, color) {
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y);
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 - len * 0.12, ex, ey);
  g.stroke();
  g.fillStyle = color;
  for (let k = 1; k < 12; k++) {
    const t = k / 12;
    const px = x + (ex - x) * t;
    const py = y + (ey - y) * t - Math.sin(t * Math.PI) * len * 0.06;
    const l = (1 - t) * len * 0.22 + 3;
    for (const side of [-1, 1]) {
      const a = ang + side * 1.1;
      g.beginPath();
      g.ellipse(px + Math.cos(a) * l * 0.5, py + Math.sin(a) * l * 0.5, l * 0.5, 2.2, a, 0, Math.PI * 2);
      g.fill();
    }
  }
}

export function fernTexture() {
  const [c, g] = canvas(256);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.38 + (R() - 0.5) * 0.1;
    const v = 0.75 + R() * 0.3;
    frond(g, 128, 250, 120 + R() * 90, a, `rgb(${Math.floor(70 * v)},${Math.floor(130 * v)},${Math.floor(50 * v)})`);
  }
  return toTex(c);
}

export function grassTexture() {
  const [c, g] = canvas(128);
  for (let i = 0; i < 46; i++) {
    const x = 20 + R() * 88;
    const h = 50 + R() * 75;
    const lean = (R() - 0.5) * 40;
    const v = 0.7 + R() * 0.45;
    g.strokeStyle = `rgb(${Math.floor(95 * v)},${Math.floor(150 * v)},${Math.floor(60 * v)})`;
    g.lineWidth = 2 + R() * 2;
    g.beginPath();
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h);
    g.stroke();
  }
  return toTex(c);
}

export function glowTexture() {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return toTex(c, { srgb: false });
}

export function shaftTexture() {
  const [c, g] = canvas(64, 256);
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  const fade = g.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.2, 'rgba(0,0,0,1)');
  fade.addColorStop(0.8, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, 64, 256);
  return toTex(c, { srgb: false });
}
