export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function wrapAngle(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

// Yaw 0 looks down -Z (Three's camera default). Positive yaw turns left.
export function viewDir(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
export const pitchTo = (dx, dy, dz) => Math.atan2(dy, Math.hypot(dx, dz));

// Quake Live cg_fov is horizontal at 4:3; widescreen is Hor+. Three wants vertical FOV.
export const qlFovToVertical = (hfovDeg) => (2 * Math.atan(Math.tan((hfovDeg * DEG) / 2) * 0.75)) / DEG;
