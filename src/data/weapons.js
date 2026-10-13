// Lightning gun. Fire rate, damage and range are Quake Live's.
export const LG = {
  interval: 0.05, // 20 hits/s
  damage: 6,
  range: 768,
  knockback: 12, // u/s pushed into the target per hit, along the beam
  knockbackUpScale: 0.35, // less vertical push so low gravity doesn't juggle forever
};
