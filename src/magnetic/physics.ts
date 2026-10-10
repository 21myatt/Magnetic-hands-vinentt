// The force model. No physics engine: each body is a point mass integrated with
// semi-implicit Euler, and every behaviour difference comes from Personality.
import { Vector3 } from "three";

import { FIELD, LAUNCH, ORBIT, type Personality } from "./config";
import { hand } from "./hand";
import { fx, world } from "./world";

export type BodyState = "idle" | "attracted" | "orbit" | "launched" | "returning";

export type Body = {
  id: string;
  p: Personality;
  home: Vector3;
  pos: Vector3;
  vel: Vector3;
  state: BodyState;
  stateTime: number;
  /** Smoothed 0..1 field intensity at this body. */
  intensity: number;
  orbitAngle: number;
  orbitDir: number;
  snapped: boolean;
  /** Flash 0..1, decays. Drives the material + capture feedback. */
  flash: number;
  /** Seconds since last wall bounce (for impact effects). */
  sinceImpact: number;
  /** Last impact speed, for squash. */
  impact: number;
  seed: number;
};

export const makeBody = (id: string, p: Personality, home: [number, number]): Body => ({
  id,
  p,
  home: new Vector3(home[0], home[1], 0),
  pos: new Vector3(home[0], home[1], 0),
  vel: new Vector3(),
  state: "idle",
  stateTime: 0,
  intensity: 0,
  orbitAngle: 0,
  orbitDir: 1,
  snapped: false,
  flash: 0,
  sinceImpact: 10,
  impact: 0,
  seed: Math.random() * 100,
});

const acc = new Vector3();
const toHand = new Vector3();
const tmp = new Vector3();
const target = new Vector3();

/** Bodies closer than this push apart. */
const SEPARATION = 0.46;

const setState = (b: Body, s: BodyState) => {
  b.state = s;
  b.stateTime = 0;
};

/** Smooth field falloff: 1 at the palm, 0 at the edge of reach. */
const falloff = (d: number, reach: number) => {
  if (d >= reach) return 0;
  const x = d / reach;
  const s = 1 - x * x * (3 - 2 * x);
  return s ** FIELD.falloff;
};

const launch = (b: Body) => {
  const { p } = b;
  tmp.copy(b.vel).multiplyScalar(LAUNCH.orbitVelocity);
  tmp.addScaledVector(hand.velocity, LAUNCH.handVelocity);
  tmp.z = 0;
  if (tmp.length() < LAUNCH.minSpeed) {
    // A still fist still throws: outward from the palm, along the orbit.
    const out = tmp.lengthSq() > 1e-4 ? tmp.normalize() : toHand.copy(b.pos).sub(hand.palm).normalize();
    tmp.copy(out).multiplyScalar(LAUNCH.minSpeed);
  }
  tmp.multiplyScalar(p.launch).clampLength(0, 14);
  b.vel.copy(tmp);
  setState(b, "launched");
  b.flash = 1;
  world.captured = null;
  world.launches += 1;

  fx.boom(hand.palm, p.rim);
  fx.shockwave(hand.palm, p.rim, 0.6 + p.impact);
  fx.emit({
    position: hand.palm,
    count: Math.round(40 + 70 * p.impact),
    color: p.rim,
    speed: [1.5, 5 + 3 * p.impact],
    size: 0.09,
    life: 0.9,
    drag: 2.2,
  });
  fx.emit({ position: b.pos, count: 30, color: p.color, speed: [0.5, 2.5], size: 0.07, life: 0.7 });
  fx.shake(0.04 + 0.1 * p.impact);
};

export const stepBody = (b: Body, dt: number, t: number, bounds: { hw: number; hh: number }) => {
  const { p } = b;
  b.stateTime += dt;
  b.sinceImpact += dt;
  b.flash = Math.max(0, b.flash - dt * 2.5);

  toHand.copy(hand.palm).sub(b.pos);
  toHand.z = 0;
  const d = Math.max(toHand.length(), 1e-4);
  const dir = toHand.multiplyScalar(1 / d);
  const reach = FIELD.radius * p.reach;
  const rawIntensity = falloff(d, reach) * hand.field;
  b.intensity += (rawIntensity - b.intensity) * (1 - Math.exp(-dt * 10));
  const free = b.state === "idle" || b.state === "attracted";
  world.distances.set(b.id, free && hand.present ? d : Infinity);

  acc.set(0, 0, 0);
  let { maxVelocity: maxVel, damping } = p;

  switch (b.state) {
    case "idle":
    case "attracted": {
      const inten = rawIntensity;
      // The field overrides the home tether as it strengthens.
      tmp.copy(b.home).sub(b.pos).multiplyScalar(p.homeSpring * (1 - (1 - p.tether) * Math.min(1, inten * 2)));
      acc.add(tmp);

      if (inten > 0) {
        let mag = FIELD.strength * p.attract * inten;
        if (p.inverseSquare) mag *= Math.min(6, Math.max(0.4, 0.22 / (d * d + 0.02)));
        acc.addScaledVector(dir, mag);

        if (p.escape) {
          // Balloon: it likes the field until it gets close, then shies away.
          const inner = reach * 0.5;
          if (d < inner) acc.addScaledVector(dir, -p.escape * FIELD.strength * 0.5 * (1 - d / inner) * hand.field);
        }
        if (p.snapDistance && !b.snapped && d < p.snapDistance && hand.field > 0.5) {
          b.snapped = true;
          b.vel.addScaledVector(dir, p.snapImpulse);
          b.flash = 1;
          fx.shockwave(b.pos, p.rim, 0.35);
          fx.emit({ position: b.pos, count: 26, color: p.rim, speed: [1.5, 4], size: 0.05, life: 0.35, drag: 4 });
        }
      }
      if (b.snapped && d > p.snapDistance * 1.6) b.snapped = false;

      if (b.state === "idle" && inten > 0.03) setState(b, "attracted");
      if (b.state === "attracted" && inten < 0.01) setState(b, "idle");

      const grabbing = hand.gesture === "palm" || hand.gesture === "pinch";
      if (grabbing && world.captured === null && world.nearest === b.id && d < FIELD.captureRadius) {
        setState(b, "orbit");
        world.captured = b.id;
        world.captures += 1;
        b.orbitAngle = Math.atan2(b.pos.y - hand.palm.y, b.pos.x - hand.palm.x);
        // Keep spinning the way it was already moving.
        b.orbitDir = -dir.x * b.vel.y + dir.y * b.vel.x >= 0 ? 1 : -1;
        b.flash = 1;
        fx.emit({ position: b.pos, count: 22, color: p.rim, speed: [0.6, 2], size: 0.06, life: 0.5 });
        fx.shockwave(hand.palm, p.rim, 0.25);
      }
      acc.multiplyScalar(1 / p.mass);
      if (p.buoyancy) acc.y += p.buoyancy * 2.2;

      // Feather: air currents (an acceleration — mass doesn't damp a breeze),
      // plus the wash of a moving hand nearby.
      if (p.wind) {
        const s = b.seed;
        acc.x += Math.sin(t * 1.3 + b.pos.y * 2.1 + s) * p.wind * 2.2;
        acc.y += Math.cos(t * 1.07 + b.pos.x * 2.7 + s) * p.wind * 1.6;
        const near = falloff(d, reach * 1.3) * hand.field;
        acc.addScaledVector(hand.velocity, p.wind * 5 * near);
      }
      break;
    }

    case "orbit": {
      if (hand.field < 0.3) {
        // Hand lost: drop it, no fanfare.
        world.captured = null;
        setState(b, "returning");
        break;
      }
      if (hand.gesture === "fist") {
        launch(b);
        break;
      }
      const s = b.seed;
      b.orbitAngle += b.orbitDir * p.orbitSpeed * dt * (1 + 0.3 * Math.sin(t * 2.3 + s));
      const r =
        p.orbitRadius *
        (1 + ORBIT.wobble * Math.sin(t * 4.7 + s) + 0.08 * Math.sin(t * 13.1 + s * 2)) *
        Math.max(0.6, hand.palmSize / 0.3) ** 0.5;
      target.set(
        hand.palm.x + Math.cos(b.orbitAngle) * r,
        hand.palm.y + Math.sin(b.orbitAngle) * r * 0.82 + (p.buoyancy ? 0.18 : 0),
        Math.sin(b.orbitAngle) * r * 0.45,
      );
      const k = p.orbitStiffness;
      acc.copy(target).sub(b.pos).multiplyScalar(k);
      // Under-damped on purpose: the orbit should feel barely held.
      damping = 2 * Math.sqrt(k) * 0.45;
      maxVel = 12;
      break;
    }

    case "launched": {
      maxVel = 16;
      damping = p.damping * 0.3;
      if (p.buoyancy) acc.y += p.buoyancy * 2.2;
      if (p.id === "heavy") acc.y -= 5;
      if (p.wind) acc.x += Math.sin(t * 2 + b.seed) * p.wind * 6;
      acc.z = -b.pos.z * 6;
      if (b.stateTime > LAUNCH.flightTime) setState(b, "returning");
      break;
    }

    case "returning": {
      tmp.copy(b.home).sub(b.pos);
      acc.copy(tmp).multiplyScalar(9);
      damping = 5;
      maxVel = 6;
      if (tmp.length() < 0.04 && b.vel.length() < 0.25) setState(b, "idle");
      break;
    }

    default:
      break;
  }

  if (b.state !== "orbit") acc.z += -b.pos.z * 8;

  // Bodies keep their personal space, so the palm never becomes a pile.
  for (let i = 0; i < world.bodies.length; i += 1) {
    const o = world.bodies[i];
    if (o && o !== b) {
      tmp.copy(b.pos).sub(o.pos);
      tmp.z = 0;
      const od = tmp.length();
      if (od < SEPARATION && od > 1e-4) acc.addScaledVector(tmp, ((SEPARATION - od) / od) * 55 / p.mass ** 0.5);
    }
  }

  // Soft stage walls for everything not in free flight.
  if (b.state !== "launched") {
    const lx = bounds.hw - 0.22;
    const ly = bounds.hh - 0.28;
    if (Math.abs(b.pos.x) > lx) acc.x -= (b.pos.x - Math.sign(b.pos.x) * lx) * 60;
    if (Math.abs(b.pos.y) > ly) acc.y -= (b.pos.y - Math.sign(b.pos.y) * ly) * 60;
  }
  acc.addScaledVector(b.vel, -damping);
  b.vel.addScaledVector(acc, dt).clampLength(0, maxVel);
  b.pos.addScaledVector(b.vel, dt);

  // Walls: only in free flight, so a throw stays on stage.
  if (b.state === "launched") {
    const m = 0.2;
    const hit = (axis: "x" | "y", lim: number) => {
      if (Math.abs(b.pos[axis]) > lim && Math.sign(b.pos[axis]) === Math.sign(b.vel[axis])) {
        const speed = Math.abs(b.vel[axis]);
        b.pos[axis] = Math.sign(b.pos[axis]) * lim;
        b.vel[axis] *= -LAUNCH.restitution;
        if (speed > 2 && b.sinceImpact > 0.12) {
          b.sinceImpact = 0;
          b.impact = Math.min(1, speed / 10);
          fx.shockwave(b.pos, p.rim, 0.25 + 0.6 * p.impact * b.impact);
          fx.emit({
            position: b.pos,
            count: Math.round(10 + 40 * p.impact * b.impact),
            color: p.rim,
            speed: [0.5, 3],
            size: 0.05,
            life: 0.5,
          });
          if (p.impact > 0.8) fx.shake(0.08 * b.impact);
        }
      }
    };
    hit("x", bounds.hw - m);
    hit("y", bounds.hh - m);
  }

  // Trails: only when moving with purpose.
  const speed = b.vel.length();
  if ((b.state !== "idle" && speed > 1.4) || (b.state === "orbit" && Math.random() < 0.5)) {
    if (Math.random() < Math.min(1, speed / 6)) {
      tmp.copy(b.vel).multiplyScalar(-0.08);
      fx.emit({
        position: b.pos,
        count: 1,
        color: b.state === "orbit" ? p.rim : p.color,
        speed: [0, 0.2],
        velocity: tmp,
        size: 0.05,
        life: 0.45,
        spread: 0.06,
      });
    }
  }
};
