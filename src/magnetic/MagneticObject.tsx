// One body: physics step + how it looks while it moves. Geometry is minimal;
// the personality shows in motion, deformation and light.
import { useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, Vector3 } from "three";
import { RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";

import { HOME_SLOTS, PERSONALITIES, type Personality } from "./config";
import { makeBodyMaterial, type BodyUniforms } from "./bodyMaterial";
import { hand } from "./hand";
import { makeBody, stepBody, type Body } from "./physics";
import { world } from "./world";

const STRING_POINTS = 10;
const stretchTarget = new Vector3();
const local = new Vector3();
const seg = new Vector3();

const Shape = ({ p, materials }: { p: Personality; materials: ReturnType<typeof makeBodyMaterial>[] }) => {
  const [main, accent] = materials;
  switch (p.id) {
    case "heavy":
      return <RoundedBox args={[0.42, 0.42, 0.42]} radius={0.05} smoothness={4} material={main.material} />;
    case "feather":
      return (
        <group>
          <mesh scale={[0.11, 0.36, 0.022]} material={main.material}>
            <icosahedronGeometry args={[1, 3]} />
          </mesh>
          <mesh position={[0, -0.05, 0]} material={accent.material}>
            <cylinderGeometry args={[0.008, 0.004, 0.62, 6]} />
          </mesh>
        </group>
      );
    case "magnet":
      return (
        <group>
          <mesh rotation={[0, 0, 0]} material={main.material}>
            <torusGeometry args={[0.15, 0.065, 20, 48, Math.PI]} />
          </mesh>
          {[-0.15, 0.15].map((x) => (
            <group key={x} position={[x, -0.07, 0]}>
              <mesh material={main.material}>
                <cylinderGeometry args={[0.065, 0.065, 0.14, 24]} />
              </mesh>
              <mesh position={[0, -0.11, 0]} material={accent.material}>
                <cylinderGeometry args={[0.065, 0.065, 0.08, 24]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case "slime":
      return (
        <mesh material={main.material}>
          <icosahedronGeometry args={[0.24, 4]} />
        </mesh>
      );
    case "balloon":
      return (
        <group>
          <mesh scale={[1, 1.16, 1]} material={main.material}>
            <sphereGeometry args={[0.2, 40, 28]} />
          </mesh>
          <mesh position={[0, -0.245, 0]} rotation={[Math.PI, 0, 0]} material={main.material}>
            <coneGeometry args={[0.035, 0.05, 12]} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
};

export const MagneticObject = ({ index }: { index: number }) => {
  const p = PERSONALITIES[index];
  const group = useRef<Group>(null);
  const { viewport, camera } = useThree();

  const body = useMemo<Body>(() => {
    const b = makeBody(p.id, p, HOME_SLOTS[index]);
    world.bodies[index] = b;
    return b;
  }, [p, index]);
  const materials = useMemo(() => {
    const { sss, spec, light, accent: accentColor } = p.look;
    const main = makeBodyMaterial(p.color, p.rim, { sss, spec, light });
    const accent = makeBodyMaterial(accentColor, p.rim, { spec: 0.9, light });
    return [main, accent];
  }, [p]);

  // Slime stretch is its own damped spring, so it overshoots when released.
  const stretch = useRef({ v: new Vector3(), x: new Vector3() });
  const stringGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(STRING_POINTS * 3), 3));
    return g;
  }, []);
  const stringLine = useMemo(
    () => new Line(stringGeo, new LineBasicMaterial({ color: p.rim, transparent: true, opacity: 0.6 })),
    [stringGeo, p.rim],
  );
  const stringTrail = useMemo(() => Array.from({ length: STRING_POINTS }, () => new Vector3()), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const t = state.clock.elapsedTime;
    const { width, height } = viewport.getCurrentViewport(camera, [0, 0, 0]);
    stepBody(body, dt, t, { hw: width / 2, hh: height / 2 });

    const g = group.current;
    if (!g) return;
    const inten = body.state === "orbit" ? 1 : body.intensity;

    // Tremble: grows with the field, never in flight.
    const tr = body.state === "launched" ? 0 : p.tremble * inten * (1 + (body.state === "orbit" ? 1.5 : 0));
    const s = body.seed;
    g.position.set(
      body.pos.x + Math.sin(t * 61 + s) * tr,
      body.pos.y + Math.sin(t * 53 + s * 2) * tr,
      body.pos.z,
    );

    // Idle float, so nothing is ever perfectly still.
    if (body.state === "idle") g.position.y += Math.sin(t * 1.2 + s) * 0.025;

    const toHand = local.copy(hand.palm).sub(body.pos);
    const handAngle = Math.atan2(toHand.y, toHand.x);
    const k = 1 - Math.exp(-dt * 6);

    switch (p.id) {
      case "heavy": {
        // Slow, reluctant tumble that picks up as the field takes hold.
        g.rotation.x += dt * (0.15 + inten * 1.4 + body.vel.length() * 0.4);
        g.rotation.y += dt * (0.22 + inten * 0.9);
        break;
      }
      case "feather": {
        g.rotation.z = Math.sin(t * 2.4 + s) * 0.5 - body.vel.x * 0.35;
        g.rotation.y += dt * (0.5 + body.vel.length() * 1.5);
        g.rotation.x = Math.sin(t * 1.7 + s) * 0.35;
        break;
      }
      case "magnet": {
        // Poles turn to face the hand as the field grows.
        const want = inten > 0.05 ? handAngle + Math.PI / 2 : Math.sin(t * 0.8 + s) * 0.25;
        let delta = want - g.rotation.z;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        g.rotation.z += delta * (inten > 0.05 ? 1 - Math.exp(-dt * 14) : k * 0.3);
        if (body.state === "launched") g.rotation.z += dt * 12;
        break;
      }
      case "slime": {
        // Target stretch: toward the hand when tugged, trailing when moving.
        stretchTarget.set(0, 0, 0);
        if (body.state === "attracted" || body.state === "idle") {
          stretchTarget.copy(toHand).normalize().multiplyScalar(0.42 * body.intensity);
        } else if (body.state !== "returning") {
          stretchTarget.copy(body.vel).multiplyScalar(-0.035).clampLength(0, 0.35);
        }
        const st = stretch.current;
        st.v.addScaledVector(local.copy(stretchTarget).sub(st.x), 120 * dt);
        st.v.multiplyScalar(Math.exp(-dt * 7));
        st.x.addScaledVector(st.v, dt);
        materials[0].uniforms.uStretch.value.copy(st.x);
        materials[0].uniforms.uWobble.value = 0.012 + 0.03 * inten + 0.05 * body.flash;
        // Squash on wall impact.
        const sq = body.sinceImpact < 0.3 ? body.impact * (1 - body.sinceImpact / 0.3) * 0.35 : 0;
        g.scale.set(1 + sq, 1 - sq, 1 + sq);
        break;
      }
      case "balloon": {
        g.rotation.z = -body.vel.x * 0.18 + Math.sin(t * 1.3 + s) * 0.06;
        g.rotation.x = body.vel.y * 0.05;
        const sq = body.sinceImpact < 0.25 ? body.impact * (1 - body.sinceImpact / 0.25) * 0.25 : 0;
        g.scale.set(1 + sq, 1 - sq, 1 + sq);
        break;
      }
      default:
        break;
    }

    // Capture/launch pop.
    if (p.id !== "slime" && p.id !== "balloon") {
      const pop = 1 + body.flash * 0.18;
      g.scale.setScalar(pop);
    }

    for (const m of materials) {
      const u: BodyUniforms = m.uniforms;
      u.uTime.value = t;
      u.uGlow.value = inten;
      u.uFlash.value = body.flash * 0.8;
      u.uLight.value.copy(hand.palm);
      u.uLightAmt.value = hand.field * (0.5 + inten);
    }

    // Balloon string: a lagging chain hanging from the knot.
    if (p.id === "balloon") {
      const knot = local.set(g.position.x, g.position.y - 0.27, g.position.z);
      stringTrail[0].copy(knot);
      for (let i = 1; i < STRING_POINTS; i += 1) {
        const prev = stringTrail[i - 1];
        const cur = stringTrail[i];
        cur.y -= 0.6 * dt;
        cur.x += Math.sin(t * 2 + i * 0.7 + s) * 0.0015;
        seg.copy(cur).sub(prev).setLength(0.045);
        cur.copy(prev).add(seg);
      }
      const pos = stringGeo.getAttribute("position") as BufferAttribute;
      stringTrail.forEach((v, i) => pos.setXYZ(i, v.x, v.y, v.z));
      pos.needsUpdate = true;
    }
  });

  return (
    <>
      <group ref={group} position={body.pos}>
        <Shape p={p} materials={materials} />
      </group>
      {p.id === "balloon" ? <primitive object={stringLine} /> : null}
    </>
  );
};

export const MagneticObjects = () => (
  <>
    {PERSONALITIES.map((p, i) => (
      <MagneticObject key={p.id} index={i} />
    ))}
  </>
);
