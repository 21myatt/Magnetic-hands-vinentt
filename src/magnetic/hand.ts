// Hand state: raw landmarks → smoothed palm pose, velocity and a debounced
// gesture. One mutable module-level object, written once per frame by
// <HandRig /> (useFrame priority -1, so it runs before every reader).
import { Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { XRModel } from "@vincentt-xr/sdk";
import { useXRContext, type XRModelNodeHandTracking } from "@vincentt-xr/sdk/low-level";

import { FIELD, GESTURE, SMOOTHING } from "./config";
import { OneEuro } from "./oneEuro";

export type Gesture = "none" | "palm" | "fist" | "pinch";

export type HandState = {
  /** Landmarks are arriving. */
  present: boolean;
  /** 0..1, eased in/out with presence. Scales the whole field. */
  field: number;
  /** Smoothed palm centre on the z=0 stage. */
  palm: Vector3;
  /** Palm velocity (units/s), from the smoothed position. */
  velocity: Vector3;
  /** Wrist→middle-knuckle length in world units. */
  palmSize: number;
  openness: number;
  pinch: number;
  gesture: Gesture;
  /** Seconds since `gesture` last changed. */
  gestureAge: number;
  /** All 21 landmarks on the stage (unsmoothed), for debug drawing. */
  landmarks: Vector3[];
};

export const hand: HandState = {
  present: false,
  field: 0,
  palm: new Vector3(),
  velocity: new Vector3(),
  palmSize: 0.3,
  openness: 1.5,
  pinch: 1,
  gesture: "none",
  gestureAge: 0,
  landmarks: Array.from({ length: 21 }, () => new Vector3()),
};

if (process.env.NODE_ENV !== "production") (window as unknown as { __hand: HandState }).__hand = hand;

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const FINGERS: [mcp: number, tip: number][] = [
  [5, 8],
  [9, 12],
  [13, 16],
  [17, 20],
];

const fx = new OneEuro(SMOOTHING.minCutoff, SMOOTHING.beta, SMOOTHING.dCutoff);
const fy = new OneEuro(SMOOTHING.minCutoff, SMOOTHING.beta, SMOOTHING.dCutoff);
const fOpen = new OneEuro(3, 0.2);
const fPinch = new OneEuro(3, 0.2);
const prevPalm = new Vector3();
const rawPalm = new Vector3();
const instVel = new Vector3();

let lastSeen = -Infinity;
let candidate: Gesture = "none";
let candidateMs = 0;

const dist2 = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y);

/** Hysteresis: the pose we'd call this frame, given what we're in now. */
const classify = (openness: number, pinch: number, current: Gesture): Gesture => {
  const pinching = current === "pinch" ? pinch < GESTURE.pinchOff : pinch < GESTURE.pinchOn;
  if (pinching && openness > GESTURE.fistOff) return "pinch";
  if (current === "fist" ? openness < GESTURE.fistOff : openness < GESTURE.fistOn) return "fist";
  if (current === "palm" ? openness > GESTURE.palmOff : openness > GESTURE.palmOn) return "palm";
  return "none";
};

const HOLD_MS: Record<Gesture, number> = {
  palm: GESTURE.palmHoldMs,
  fist: GESTURE.fistHoldMs,
  pinch: GESTURE.pinchHoldMs,
  none: 60,
};

export const HandRig = () => {
  const { session } = useXRContext();
  const { viewport, camera } = useThree();

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const now = state.clock.elapsedTime * 1000;
    hand.gestureAge += dt;

    // Stage half-extents at z=0 for the current camera.
    const { width, height } = viewport.getCurrentViewport(camera, [0, 0, 0]);
    const hw = width / 2;
    const hh = height / 2;

    const node = session.getModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
    const coords = node?.hands?.[0]?.coordinates ?? node?.coordinates;

    if (coords && coords.length >= 21) {
      lastSeen = now;
      for (let i = 0; i < 21; i += 1) {
        hand.landmarks[i].set(coords[i].x * hw, coords[i].y * hh, 0);
      }
      const L = hand.landmarks;

      // Palm centre = wrist + four knuckles.
      rawPalm.copy(L[WRIST]);
      for (const [mcp] of FINGERS) rawPalm.add(L[mcp]);
      rawPalm.multiplyScalar(1 / 5);

      const wasPresent = hand.present;
      if (!wasPresent) {
        fx.reset();
        fy.reset();
      }
      prevPalm.copy(hand.palm);
      hand.palm.set(fx.filter(rawPalm.x, dt), fy.filter(rawPalm.y, dt), 0);
      if (wasPresent) {
        // Velocity, lightly low-passed so a single noisy frame can't fling things.
        const k = 1 - Math.exp(-dt * 18);
        instVel.subVectors(hand.palm, prevPalm).multiplyScalar(1 / dt);
        hand.velocity.lerp(instVel, k);
      } else {
        hand.velocity.set(0, 0, 0);
      }

      hand.palmSize = Math.max(0.05, dist2(L[WRIST], L[MIDDLE_MCP]));
      let tipSum = 0;
      let mcpSum = 0;
      for (const [mcp, tip] of FINGERS) {
        tipSum += dist2(L[WRIST], L[tip]);
        mcpSum += dist2(L[WRIST], L[mcp]);
      }
      hand.openness = fOpen.filter(tipSum / Math.max(mcpSum, 1e-4), dt);
      hand.pinch = fPinch.filter(dist2(L[THUMB_TIP], L[INDEX_TIP]) / hand.palmSize, dt);
      hand.present = true;
    } else if (now - lastSeen > GESTURE.lostMs) {
      hand.present = false;
      hand.velocity.multiplyScalar(0.8);
    }

    // Debounced gesture.
    const next = hand.present ? classify(hand.openness, hand.pinch, hand.gesture) : "none";
    if (next === hand.gesture) {
      candidate = next;
      candidateMs = 0;
    } else {
      if (next !== candidate) {
        candidate = next;
        candidateMs = 0;
      }
      candidateMs += dt * 1000;
      if (candidateMs >= HOLD_MS[next] || !hand.present) {
        hand.gesture = next;
        hand.gestureAge = 0;
      }
    }

    // Field fades with presence.
    const target = hand.present ? 1 : 0;
    const step = dt / FIELD.fadeTime;
    hand.field += Math.max(-step, Math.min(step, target - hand.field));
  }, -1);

  return null;
};
