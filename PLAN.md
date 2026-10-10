# Plan — Magnetic Hands

Source of truth for *what*: `Brief.md`. This file is *how*.

## 0. Dev loop (local only)

- `pnpm dev` → http://localhost:5173, opened in the built-in browser. No console preview
  during development (the console can't show the hand preview).
- Input = `public/preview/hand_preview_vertical.mp4` (1080×1920, 25 fps, 11.4 s loop; silent remux of the `.mov`) instead of the webcam. Portrait, so no crop.

**How the clip gets in.** The template already has a "video" input path
(`VITE_INPUT_SOURCE=video` + `VITE_INPUT_URL`), but `esbuild.config.mjs` never injects
those variables into `import.meta.env`, so that path is unreachable in this build. Both
`App.tsx` and `esbuild.config.mjs` are platform files (replaced on upgrade), so instead:

- (Removed later — see Status.) New creator file `src/DevVideoSource.tsx`, mounted from `Scene.tsx`, **dev-only**
  (`import.meta.env.DEV`). Once the session is up it calls
  `session.setMediaSource({ source: STREAM, stream })` with the template's own
  `streamFromVideoUrl("/preview/hand_preview_vertical.mp4")` (pre-mirrored like every non-webcam source).
- `?input=webcam` in the URL skips it, so webcam testing is the same dev server.
- Caveat: `public/` is copied into `dist/`, so the preview clips (~20 MB) would ship on publish. Before
  publishing, move it out of `public/` (or delete it from `dist/` in the release step).

## 1. Architecture

```
src/
  Scene.tsx                 mounts trackers + world + effects + HUD
  DevVideoSource.tsx        dev-only clip input (above)
  magnetic/
    config.ts               every tunable: field + gestures + per-personality params
    useHand.ts              landmarks → smoothed palm pose, velocity, gesture state
    oneEuro.ts              One Euro filter (jitter-free, low-lag)
    physics.ts              force model + integrator (no physics engine)
    personalities.ts        Heavy Cube, Feather, Magnet, Slime, Balloon
    MagneticObject.tsx      one body: state machine + mesh + per-type material
    materials/*.ts          procedural shaders (fresnel glow, slime wobble, field ripple)
    effects/Particles.tsx   one pooled instanced particle system (trails + bursts)
    effects/Shockwave.tsx   expanding ring shader
    effects/Boom.tsx        "BOOM" ScreenText pop
    HandField.tsx           faint field cue at the palm (orb + radius ring)
```

### Tracking

- **One model:** `<HandTracker>` only (21 landmarks). Palm, fist and pinch are classified from
  landmarks myself, so there is no second gesture-model download, and every gesture gets the
  same smoothing and hysteresis.
- **Palm point:** mean of wrist + 4 knuckles (MCPs). It is projected to the z = 0 plane through
  the camera's FOV and filtered with a One Euro filter (no jitter at rest, little lag in fast
  motion). Velocity comes from the filtered position (used for launch).
- **Gestures:**
  - Openness = mean fingertip-to-wrist distance ÷ palm size.
  - **Palm** when openness > 0.9 held 120 ms.
  - **Fist** when openness < 0.55 held 80 ms.
  - The dead band in between prevents flicker.
  - **Pinch** = thumb-tip to index-tip distance ÷ palm size, with separate on/off thresholds.
- **Lost hand:** after 250 ms the field fades out and orbiting objects are dropped (they don't
  fire).

### Interaction state machine (per object)

`idle → attracted → orbiting → launched → returning → idle`

| State | Trigger | Behaviour |
|---|---|---|
| idle | — | floats at its home slot, gentle personality idle motion |
| attracted | palm within field radius | force toward palm = `strength · falloff(d)`, tremble/rotate scale with intensity, trail particles above a speed threshold |
| orbiting | **open palm** + object within capture radius (nearest object only, one at a time) | locked to an unstable orbit (noisy radius/phase); a capture "pop" plays (flash + small burst) |
| launched | **fist** while orbiting | releases with hand velocity + orbit tangent velocity × personality. Effects: burst, shockwave, `BOOM` |
| returning | after ~2.5 s or off-screen | eases back to its home slot |

Pinch (in the brief's technical section) acts as an alternative grab, the same as palm.
Assumption until you say otherwise: **palm locks the orbit, fist launches.**

### Force model (`physics.ts`)

Semi-implicit Euler in `useFrame`, dt clamped to 1/30:

```
a = (F_attract · attractScale + F_personality) / mass − damping · v
v = clampLength(v + a·dt, maxVelocity)
```

`falloff(d)` is smooth: `(1 − smoothstep(0, radius, d))^exponent`. Each object's force,
radius, exponent, damping and max velocity are in `config.ts`.

### Personalities (distinct behaviour, not just looks)

| Object | Physics | Visual |
|---|---|---|
| **Heavy Cube** | mass 4, attractScale 0.35, low maxVel, high inertia | dark metal, impact camera shake + heavy shockwave + dust burst |
| **Feather** | mass 0.15, high drag, curl-noise wind, overshoots past the hand | thin flat blade, flutter rotation, soft wisps |
| **Magnet** | force ∝ 1/d² inside the radius; past a snap distance it jumps to the hand with a velocity impulse | red/steel, field-line ripple shader ring on snap, electric sparks |
| **Slime** | spring tether to home + attraction, so it stretches toward the hand; release snaps back with overshoot | vertex shader: stretch along the force direction + wobble noise, translucent green |
| **Balloon** | constant buoyancy upward, an "escape" force away from the palm inside the inner radius, resists downward velocity | glossy sphere, bob + squash on contact, confetti-ish pop burst |

## 2. Visual direction

- **Background:** the camera feed stays (it's how people understand their hand is in play), dimmed
  by a full-screen dark gradient plane (~85 %). Result: a clean, dark stage where you faintly see
  yourself.
- **Materials:** procedural only, no textures. The fresnel rim glow brightens with field intensity.
- **Lighting:** one point light at the palm, so objects light up as the hand approaches.
- **Particles:** one instanced pool (~1500 sprites, additive blending), reused for trails and
  bursts. No per-frame allocation.
- **Shockwave:** a ring plane with a distortion/fade shader.
- **BOOM:** `ScreenText` with a scale-pop + fade, colour taken from the launched object.
- **UI:** no other UI except a one-line hint ("Open your hand near an object") that fades after the
  first capture.

## 3. Build order (each step checked in the browser against the clip)

1. `DevVideoSource` + `HandTracker` + a debug palm marker and gesture label → verify the clip
   drives tracking and the marker sits on the palm.
2. `useHand` smoothing + gesture classification with hysteresis → tune thresholds on the clip.
3. One object (Magnet) through the full state machine.
4. The other four personalities, all from `config.ts`.
5. Effects: particles, shockwave, BOOM, palm light, field cue, dim background.
6. Polish + performance: hold 60 fps on desktop; check the frame budget; `pnpm typecheck`,
   `pnpm lint`, `pnpm build`.
7. Webcam pass (`?input=webcam`), then a phone preview via console when you want it.

## Status (2026-10-10)

- Built and tuned against a recorded clip. The clip and its dev-only loader have since
  been removed: input is the **webcam only**, in dev and production.
- Production cleanup:
  - **No dev code in the bundle.** Dev-only code is guarded by `process.env.NODE_ENV`, never
    `import.meta.env.DEV`: esbuild doesn't fold the latter (it is defined as an object), so code
    behind it ships.
  - **Instruction screen** (`Instructions.tsx`) whenever no hand is in view. While the hand model
    downloads it reads "Loading hand tracking…". It stays hidden until the camera runs.
  - **Shaders pre-warmed:** shockwave and palm-glow shaders compile at load, so the first BOOM doesn't
    stutter.
  - **Lighter work:** hand inference capped at 30 fps; slime geometry reduced.
- `?debug` (dev only) shows landmarks, the palm, the gesture and openness/pinch values.
- Not yet checked: real frame rate, webcam mirroring and the instruction screen live (the
  built-in browser blocks the camera), phone.
- Gotcha: `pnpm dev` serves `dist/`, and `pnpm build` overwrites it, so restart `pnpm dev` after a build.

## Assumed (not yet confirmed)

- Palm = capture into orbit, fist = launch, pinch = alternative grab.
- Dimmed camera feed rather than a fully black stage (`STAGE.dim` in `config.ts`).
