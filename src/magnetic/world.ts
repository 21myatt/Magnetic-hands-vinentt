// Shared world state + the effect bus. Effects register their implementations
// on mount; bodies call them without knowing who draws what.
import type { Vector3 } from "three";
import { useFrame } from "@react-three/fiber";

import { FIELD } from "./config";
import type { Body } from "./physics";

export const world = {
  /** Id of the body currently orbiting the hand (one at a time). */
  captured: null as string | null,
  /** Closest capturable body last frame — only it may be captured. */
  nearest: null as string | null,
  /** Each body writes its palm distance here every frame. */
  distances: new Map<string, number>(),
  captures: 0,
  launches: 0,
  bodies: [] as Body[],
};

if (process.env.NODE_ENV !== "production") (window as unknown as { __world: typeof world }).__world = world;

export type EmitOptions = {
  position: Vector3;
  count: number;
  color: string;
  /** Random speed range. */
  speed?: [number, number];
  /** Base velocity added to every particle. */
  velocity?: Vector3;
  size?: number;
  life?: number;
  drag?: number;
  gravity?: number;
  /** Spawn jitter radius. */
  spread?: number;
};

const noop = () => {};

export const fx = {
  emit: noop as (o: EmitOptions) => void,
  shockwave: noop as (position: Vector3, color: string, strength: number) => void,
  boom: noop as (position: Vector3, color: string) => void,
  shake: noop as (amount: number) => void,
};

/** Picks `nearest` from last frame's distances. Runs before the bodies. */
export const WorldRig = () => {
  useFrame(() => {
    let best: string | null = null;
    let bestD = FIELD.captureRadius;
    world.distances.forEach((d, id) => {
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    });
    world.nearest = best;
  }, -0.5);
  return null;
};
