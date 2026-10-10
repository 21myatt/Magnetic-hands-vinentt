// Every tunable in the experience. World units: the camera sits at z=5 with a
// 45° vertical FOV, so the z=0 stage is ~4.14 units tall and ~2.33 wide (9:16).

export const FIELD = {
  /** Reach of the attraction field around the palm. */
  radius: 1.5,
  /** Base attraction force (scaled per personality). */
  strength: 9,
  /** Falloff exponent: higher = force concentrated near the palm. */
  falloff: 1.7,
  /** A palm/pinch only captures an object this close. */
  captureRadius: 0.75,
  /** Field fades in/out over this long when the hand appears/disappears (s). */
  fadeTime: 0.25,
};

export const GESTURE = {
  /** Openness = mean(wrist→fingertip) / mean(wrist→knuckle). ~2 open, ~1 fist. */
  palmOn: 1.5,
  palmOff: 1.38,
  fistOn: 1.18,
  fistOff: 1.3,
  /** Thumb-tip ↔ index-tip distance / palm size. */
  pinchOn: 0.3,
  pinchOff: 0.45,
  /** A pose must persist this long before it counts (ms). */
  palmHoldMs: 120,
  fistHoldMs: 80,
  pinchHoldMs: 60,
  /** Hand counts as gone after this long without landmarks (ms). */
  lostMs: 250,
};

export const SMOOTHING = {
  /** One Euro filter: min cutoff (Hz) — lower = steadier at rest. */
  minCutoff: 1.6,
  /** Speed coefficient — higher = less lag in fast motion. */
  beta: 0.9,
  dCutoff: 1.0,
};

export const ORBIT = {
  radius: 0.5,
  /** rad/s */
  speed: 3.4,
  /** Radius wobble amplitude (fraction of radius) — keeps it unstable. */
  wobble: 0.22,
  /** Spring that holds the body on its orbit target. */
  stiffness: 55,
  damping: 8,
};

export const LAUNCH = {
  /** Weight of the hand's own velocity at release. */
  handVelocity: 1.0,
  /** Weight of the orbit's tangential velocity at release. */
  orbitVelocity: 1.0,
  /** Every launch is at least this fast, so a still fist still throws. */
  minSpeed: 5,
  /** Seconds free-flying before the body heads home. */
  flightTime: 2.2,
  /** Edge bounce energy kept. */
  restitution: 0.72,
};

export type PersonalityId = "heavy" | "feather" | "magnet" | "slime" | "balloon";

export type Personality = {
  id: PersonalityId;
  label: string;
  color: string;
  rim: string;
  /** Kg-ish. Divides every force. */
  mass: number;
  /** Multiplier on FIELD.strength. */
  attract: number;
  /** Multiplier on FIELD.radius. */
  reach: number;
  /** Velocity damping (1/s). */
  damping: number;
  maxVelocity: number;
  /** Home tether spring (always on, weak). */
  homeSpring: number;
  /** Fraction of the home spring that survives a full-strength field. */
  tether: number;
  /** Multiplier on the launch velocity. */
  launch: number;
  /** Tremble amplitude when the field is strong. */
  tremble: number;
  /** Orbit overrides. */
  orbitRadius: number;
  orbitSpeed: number;
  orbitStiffness: number;
  /** Personality extras (0 = off). */
  buoyancy: number;
  escape: number;
  wind: number;
  inverseSquare: number;
  snapDistance: number;
  snapImpulse: number;
  stretch: number;
  /** Shockwave / shake strength at release and impact. */
  impact: number;
  /** Material: fake subsurface, specular, palm-light response, accent part colour. */
  look: { sss: number; spec: number; light: number; accent: string };
};

export const PERSONALITIES: Personality[] = [
  {
    id: "heavy",
    label: "Heavy Cube",
    color: "#4a5068",
    rim: "#ffa64d",
    mass: 4,
    attract: 0.9,
    reach: 0.9,
    damping: 2.6,
    maxVelocity: 2.2,
    homeSpring: 3,
    tether: 0.3,
    launch: 0.75,
    tremble: 0.012,
    orbitRadius: 0.55,
    orbitSpeed: 1.9,
    orbitStiffness: 28,
    buoyancy: 0,
    escape: 0,
    wind: 0,
    inverseSquare: 0,
    snapDistance: 0,
    snapImpulse: 0,
    stretch: 0,
    impact: 1,
    look: { sss: 0, spec: 0.9, light: 0.35, accent: "#59607a" },
  },
  {
    id: "feather",
    label: "Feather",
    color: "#e8ecff",
    rim: "#9fd8ff",
    mass: 0.15,
    attract: 0.11,
    reach: 1.25,
    damping: 1.1,
    maxVelocity: 3.2,
    homeSpring: 0.6,
    tether: 0.25,
    launch: 0.55,
    tremble: 0.004,
    orbitRadius: 0.62,
    orbitSpeed: 2.6,
    orbitStiffness: 6,
    buoyancy: 0,
    escape: 0,
    wind: 0.22,
    inverseSquare: 0,
    snapDistance: 0,
    snapImpulse: 0,
    stretch: 0,
    impact: 0.25,
    look: { sss: 0.2, spec: 0.5, light: 1, accent: "#b8c6ff" },
  },
  {
    id: "magnet",
    label: "Magnet",
    color: "#d7263d",
    rim: "#7cf3ff",
    mass: 1,
    attract: 0.5,
    reach: 1.15,
    damping: 3.5,
    maxVelocity: 9,
    homeSpring: 1.2,
    tether: 0.08,
    launch: 1.15,
    tremble: 0.02,
    orbitRadius: 0.42,
    orbitSpeed: 4.6,
    orbitStiffness: 90,
    buoyancy: 0,
    escape: 0,
    wind: 0,
    inverseSquare: 1,
    snapDistance: 0.62,
    snapImpulse: 7,
    stretch: 0,
    impact: 0.7,
    look: { sss: 0, spec: 0.6, light: 1, accent: "#dfe6ee" },
  },
  {
    id: "slime",
    label: "Slime",
    color: "#39ff9f",
    rim: "#d8ffe9",
    mass: 1.2,
    attract: 1,
    reach: 1,
    damping: 3,
    maxVelocity: 5,
    homeSpring: 7,
    tether: 0.7,
    launch: 1,
    tremble: 0,
    orbitRadius: 0.5,
    orbitSpeed: 3,
    orbitStiffness: 22,
    buoyancy: 0,
    escape: 0,
    wind: 0,
    inverseSquare: 0,
    snapDistance: 0,
    snapImpulse: 0,
    stretch: 1,
    impact: 0.55,
    look: { sss: 1, spec: 0.5, light: 1, accent: "#39ff9f" },
  },
  {
    id: "balloon",
    label: "Balloon",
    color: "#ff5fa2",
    rim: "#ffe0ef",
    mass: 0.4,
    attract: 0.3,
    reach: 1.3,
    damping: 1.4,
    maxVelocity: 3.5,
    homeSpring: 2.4,
    tether: 0.08,
    launch: 0.9,
    tremble: 0.006,
    orbitRadius: 0.58,
    orbitSpeed: 2.4,
    orbitStiffness: 14,
    buoyancy: 0.75,
    escape: 1.1,
    wind: 0.05,
    inverseSquare: 0,
    snapDistance: 0,
    snapImpulse: 0,
    stretch: 0,
    impact: 0.45,
    look: { sss: 0.4, spec: 1.1, light: 1, accent: "#ff5fa2" },
  },
];

/** Resting slots in world units, in PERSONALITIES order. */
export const HOME_SLOTS: [number, number][] = [
  [-0.55, -0.95], // heavy — low, it's heavy
  [0.6, 0.72], // feather — up high
  [0.62, -0.6], // magnet
  [-0.6, 0.38], // slime
  [0.05, 0.95], // balloon — top, it floats (rests a little above this)
];

export const STAGE = {
  /** How dark the camera feed is dimmed (0 = untouched, 1 = black). */
  dim: 0.88,
};
