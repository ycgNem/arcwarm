// Movement + world physics. Quake units (1 unit ≈ 1 inch), seconds.
export const TICK_RATE = 125; // QL com_maxfps heritage
export const TICK = 1 / TICK_RATE;

// Jump velocity stays QL's 270; gravity is what makes it Halo.
export const GRAVITY_PRESETS = {
  halo: { label: 'Halo', gravity: 400, jumpVelocity: 270 }, // ~91u apex, 1.35 s hang
  quake: { label: 'Quake', gravity: 800, jumpVelocity: 270 }, // ~46u apex, 0.68 s hang
  moon: { label: 'Moon', gravity: 250, jumpVelocity: 240 }, // ~115u apex, 1.9 s hang
};

export const HULL = {
  halfWidth: 15, // QL player box 30×30
  height: 56,
  crouchHeight: 40,
  eye: 50, // QL viewheight: origin 24 above feet + 26
  crouchEye: 34,
  crouchAirLift: 16, // crouching mid-air tucks the feet up and the head stays put (Halo crouch-jump)
};

export const MOVE = {
  runSpeed: 300,
  crouchSpeedScale: 0.5,
  groundAccel: 12, // Quake accelerate factor: snappy Halo-style ADAD
  friction: 8,
  stopSpeed: 100,
  airAccel: 2.5, // Halo air control: steer freely, never gain speed (no bhop)
  stepHeight: 18,
  groundSnap: 18,
  jumpBuffer: 0.12, // a press this soon before landing still jumps; holding auto-hops
  maxFallSpeed: 1600,
  jumpRise: 72, // tallest ledge the bots treat as jumpable
};
