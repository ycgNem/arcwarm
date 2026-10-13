// Bot levels. Accuracy is never rolled with dice: it comes from the aim model below, so it drops
// when you dodge well (direction changes beat their reaction time) and rises when you're predictable.
//   reaction   s of perception delay (they aim where you were, then extrapolate)
//   lead       how well they extrapolate your velocity across that delay (1 = perfect for straight lines)
//   gravAware  how well they predict low-grav jump arcs (0 = treat you as flying straight)
//   tau        s, smoothing of their crosshair (higher = laggier tracking)
//   jitter     units of hand wobble on the aim point
//   switch*    s between strafe direction changes; fakeChance = very short "fake" strafes
export const BOT_LEVELS = {
  easy: {
    label: 'Easy',
    reaction: 0.28,
    lead: 0.85,
    gravAware: 0.0,
    tau: 0.12,
    jitter: 22,
    switchMin: 0.5,
    switchMax: 1.4,
    fakeChance: 0.05,
    jumpChance: 0.1,
    crouchChance: 0.03,
    airReverse: 0.1,
    retreat: 0.0,
    rangeGoal: 460,
  },
  normal: {
    label: 'Normal',
    reaction: 0.23,
    lead: 0.88,
    gravAware: 0.35,
    tau: 0.09,
    jitter: 17,
    switchMin: 0.38,
    switchMax: 1.05,
    fakeChance: 0.14,
    jumpChance: 0.16,
    crouchChance: 0.06,
    airReverse: 0.25,
    retreat: 0.25,
    rangeGoal: 420,
  },
  hard: {
    label: 'Hard',
    reaction: 0.19,
    lead: 0.9,
    gravAware: 0.6,
    tau: 0.07,
    jitter: 13,
    switchMin: 0.3,
    switchMax: 0.85,
    fakeChance: 0.22,
    jumpChance: 0.2,
    crouchChance: 0.09,
    airReverse: 0.4,
    retreat: 0.4,
    rangeGoal: 380,
  },
  pro: {
    label: 'Pro',
    reaction: 0.165,
    lead: 0.93,
    gravAware: 0.8,
    tau: 0.055,
    jitter: 10.5,
    switchMin: 0.24,
    switchMax: 0.72,
    fakeChance: 0.28,
    jumpChance: 0.22,
    crouchChance: 0.11,
    airReverse: 0.55,
    retreat: 0.5,
    rangeGoal: 360,
  },
  nightmare: {
    label: 'Nightmare',
    reaction: 0.145,
    lead: 0.95,
    gravAware: 0.9,
    tau: 0.045,
    jitter: 8.5,
    switchMin: 0.2,
    switchMax: 0.62,
    fakeChance: 0.32,
    jumpChance: 0.24,
    crouchChance: 0.13,
    airReverse: 0.7,
    retreat: 0.45,
    rangeGoal: 340,
  },
};

export const BOT_ORDER = ['easy', 'normal', 'hard', 'pro', 'nightmare'];

export const BOT = {
  losEvery: 4, // ticks between line-of-sight checks
  engageRange: 950,
  losGrace: 0.35, // s without sight before switching to hunting
  repath: 0.5,
  stuckSpeed: 50,
  stuckTime: 0.45,
  fireTolerance: 1.6, // × hitbox half-width, angular, to start holding fire
  retreatShieldDone: 85, // stop retreating once shields are back to this
  retreatMaxTime: 6,
  underFireWindow: 0.35, // s after taking damage the bot strafes more erratically
};
