// Scene.tsx — Magnetic Hands. The hand is an invisible force field; objects
// respond to it. See Brief.md (what) and PLAN.md (how).
import { lazy, Suspense } from "react";
import { HandTracker } from "@vincentt-xr/sdk/tracking";

import { ExperienceStatus } from "./magnetic/ExperienceStatus";
import { HandRig } from "./magnetic/hand";
import { Instructions } from "./magnetic/Instructions";
import { MagneticObjects } from "./magnetic/MagneticObject";
import { Boom, CameraShake, HandField, Hint, Particles, Shockwaves, Stage } from "./magnetic/effects";
import { WorldRig } from "./magnetic/world";

// Dev-only `?debug` overlay, lazy and behind a build-time constant. It must be
// `process.env.NODE_ENV`: esbuild defines it as a string literal and folds the
// branch away, so the chunk is never emitted. (`import.meta.env` is defined as an
// object, which esbuild does NOT fold — code behind it ships.)
const HandDebug =
  process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("debug")
    ? lazy(() => import("./magnetic/HandDebug"))
    : null;

export const Scene = () => (
  <>
    {/* 30 fps inference is plenty: the One Euro filter smooths between samples. */}
    <HandTracker targetFps={30} />
    <HandRig />
    <ExperienceStatus />
    <WorldRig />

    <Stage />
    <HandField />
    <MagneticObjects />
    <Particles />
    <Shockwaves />
    <CameraShake />
    <Boom />
    <Hint />
    <Instructions />

    {HandDebug ? (
      <Suspense fallback={null}>
        <HandDebug />
      </Suspense>
    ) : null}
  </>
);
