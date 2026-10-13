// Halo-style vitals: shields soak first and recharge after a quiet period, health regens once shields are full.
export const VITALS = {
  health: 100,
  shield: 100,
  shieldDelay: 4.0,
  shieldRate: 70, // ~1.4 s from empty
  healthRate: 30,
};

export const MATCH = {
  countdown: 3,
  respawnDelay: 1.5,
  lengths: [
    { label: '2:00', s: 120 },
    { label: '3:00', s: 180 },
    { label: '5:00', s: 300 },
    { label: 'Endless', s: 0 },
  ],
};
