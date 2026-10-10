// Effects: pooled particles, shockwave rings, BOOM, camera shake, the dimmed
// stage and the palm field cue. Each registers itself on the `fx` bus.
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";

import { FIELD, STAGE } from "./config";
import { hand } from "./hand";
import { fx, world, type EmitOptions } from "./world";

// ─── Particles ────────────────────────────────────────────────────────────────

const MAX_PARTICLES = 1600;

const particleVert = /* glsl */ `
attribute vec3 color;
attribute float size;
attribute float alpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * alpha * 900.0 / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const particleFrag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float a = smoothstep(0.5, 0.0, r);
  a *= a;
  gl_FragColor = vec4(vColor * (1.0 + a), a * vAlpha);
}
`;

export const Particles = () => {
  const { geometry, material, sim } = useMemo(() => {
    const g = new BufferGeometry();
    const position = new Float32Array(MAX_PARTICLES * 3);
    const color = new Float32Array(MAX_PARTICLES * 3);
    const size = new Float32Array(MAX_PARTICLES);
    const alpha = new Float32Array(MAX_PARTICLES);
    g.setAttribute("position", new BufferAttribute(position, 3));
    g.setAttribute("color", new BufferAttribute(color, 3));
    g.setAttribute("size", new BufferAttribute(size, 1));
    g.setAttribute("alpha", new BufferAttribute(alpha, 1));
    const m = new ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return {
      geometry: g,
      material: m,
      sim: {
        position,
        color,
        size,
        alpha,
        vel: new Float32Array(MAX_PARTICLES * 3),
        life: new Float32Array(MAX_PARTICLES),
        maxLife: new Float32Array(MAX_PARTICLES),
        drag: new Float32Array(MAX_PARTICLES),
        gravity: new Float32Array(MAX_PARTICLES),
        cursor: 0,
      },
    };
  }, []);

  useEffect(() => {
    const c = new Color();
    fx.emit = (o: EmitOptions) => {
      c.set(o.color);
      const [lo, hi] = o.speed ?? [0.5, 2];
      for (let n = 0; n < o.count; n += 1) {
        const i = sim.cursor;
        sim.cursor = (sim.cursor + 1) % MAX_PARTICLES;
        // Random direction, biased to the screen plane.
        const th = Math.random() * Math.PI * 2;
        const z = (Math.random() - 0.5) * 0.6;
        const sp = lo + Math.random() * (hi - lo);
        const spread = o.spread ?? 0.02;
        sim.position[i * 3] = o.position.x + (Math.random() - 0.5) * spread;
        sim.position[i * 3 + 1] = o.position.y + (Math.random() - 0.5) * spread;
        sim.position[i * 3 + 2] = o.position.z + (Math.random() - 0.5) * spread;
        sim.vel[i * 3] = Math.cos(th) * sp + (o.velocity?.x ?? 0);
        sim.vel[i * 3 + 1] = Math.sin(th) * sp + (o.velocity?.y ?? 0);
        sim.vel[i * 3 + 2] = z * sp + (o.velocity?.z ?? 0);
        const v = 0.8 + Math.random() * 0.4;
        sim.color[i * 3] = c.r * v;
        sim.color[i * 3 + 1] = c.g * v;
        sim.color[i * 3 + 2] = c.b * v;
        const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.6);
        sim.life[i] = life;
        sim.maxLife[i] = life;
        sim.size[i] = (o.size ?? 0.06) * (0.5 + Math.random());
        sim.drag[i] = o.drag ?? 1.5;
        sim.gravity[i] = o.gravity ?? 0;
      }
    };
    return () => {
      fx.emit = () => {};
    };
  }, [sim]);

  useFrame((_s, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (sim.life[i] <= 0) {
        sim.alpha[i] = 0;
        continue;
      }
      sim.life[i] -= dt;
      const f = Math.exp(-sim.drag[i] * dt);
      sim.vel[i * 3] *= f;
      sim.vel[i * 3 + 1] = sim.vel[i * 3 + 1] * f - sim.gravity[i] * dt;
      sim.vel[i * 3 + 2] *= f;
      sim.position[i * 3] += sim.vel[i * 3] * dt;
      sim.position[i * 3 + 1] += sim.vel[i * 3 + 1] * dt;
      sim.position[i * 3 + 2] += sim.vel[i * 3 + 2] * dt;
      sim.alpha[i] = Math.max(0, sim.life[i] / sim.maxLife[i]);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.alpha.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={10} />;
};

// ─── Shockwaves ───────────────────────────────────────────────────────────────

const RINGS = 8;

const ringFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uProgress;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float edge = uProgress;
  float w = 0.04 + 0.12 * (1.0 - uProgress);
  float ring = smoothstep(w, 0.0, abs(r - edge));
  float inner = smoothstep(edge, 0.0, r) * 0.18 * (1.0 - uProgress);
  float a = (ring + inner) * (1.0 - uProgress) * (1.0 - uProgress);
  gl_FragColor = vec4(uColor * 1.6, a);
}
`;

const ringVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const Shockwaves = () => {
  const meshes = useRef<(Mesh | null)[]>([]);
  const rings = useMemo(
    () =>
      Array.from({ length: RINGS }, () => ({
        t: 1,
        duration: 0.6,
        size: 1,
        material: new ShaderMaterial({
          uniforms: { uColor: { value: new Color() }, uProgress: { value: 1 } },
          vertexShader: ringVert,
          fragmentShader: ringFrag,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      })),
    [],
  );
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  const cursor = useRef(0);
  // Draw every ring (invisible, progress 1) for the first frames so the shader
  // compiles at load, not as a hitch on the first BOOM.
  const warm = useRef(3);

  useEffect(() => {
    fx.shockwave = (position: Vector3, color: string, strength: number) => {
      const i = cursor.current;
      cursor.current = (i + 1) % RINGS;
      const r = rings[i];
      r.t = 0;
      r.duration = 0.45 + 0.35 * strength;
      r.size = 0.6 + 2.2 * strength;
      r.material.uniforms.uColor.value.set(color);
      const m = meshes.current[i];
      if (m) m.position.set(position.x, position.y, position.z + 0.05);
    };
    return () => {
      fx.shockwave = () => {};
    };
  }, [rings]);

  useFrame((_s, dt) => {
    if (warm.current > 0) warm.current -= 1;
    rings.forEach((r, i) => {
      const m = meshes.current[i];
      if (!m) return;
      r.t = Math.min(1, r.t + dt / r.duration);
      // Ease-out: fast punch, slow settle.
      const p = 1 - (1 - r.t) ** 3;
      r.material.uniforms.uProgress.value = p;
      m.visible = r.t < 1 || warm.current > 0;
      m.scale.setScalar(r.size);
    });
  });

  return (
    <>
      {rings.map((r, i) => (
        <mesh
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geometry}
          material={r.material}
          visible={false}
          renderOrder={11}
        />
      ))}
    </>
  );
};

// ─── BOOM ─────────────────────────────────────────────────────────────────────

export const Boom = () => {
  const el = useRef<HTMLDivElement>(null);
  const { camera } = useThree();

  useEffect(() => {
    const ndc = new Vector3();
    fx.boom = (position: Vector3, color: string) => {
      const node = el.current;
      if (!node) return;
      ndc.copy(position).project(camera);
      const x = Math.min(80, Math.max(20, (ndc.x * 0.5 + 0.5) * 100));
      const y = Math.min(80, Math.max(15, (-ndc.y * 0.5 + 0.5) * 100 - 14));
      node.style.left = `${x}%`;
      node.style.top = `${y}%`;
      node.style.color = "#fff";
      node.style.textShadow = `0 0 18px ${color}, 0 0 42px ${color}, 0 4px 0 rgba(0,0,0,.35)`;
      node.getAnimations().forEach((a) => a.cancel());
      node.animate(
        [
          { opacity: 0, transform: "translate(-50%,-50%) scale(0.3) rotate(-8deg)" },
          { opacity: 1, transform: "translate(-50%,-50%) scale(1.25) rotate(3deg)", offset: 0.18 },
          { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(0deg)", offset: 0.4 },
          { opacity: 0, transform: "translate(-50%,-70%) scale(1.05) rotate(0deg)" },
        ],
        { duration: 1000, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
      );
    };
    return () => {
      fx.boom = () => {};
    };
  }, [camera]);

  return (
    <Html fullscreen zIndexRange={[25, 0]} pointerEvents="none">
      <div
        ref={el}
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          opacity: 0,
          transform: "translate(-50%,-50%)",
          font: '800 64px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          letterSpacing: "0.04em",
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        BOOM
      </div>
    </Html>
  );
};

// ─── Camera shake ─────────────────────────────────────────────────────────────

export const CameraShake = () => {
  const { camera } = useThree();
  const amp = useRef(0);
  const base = useRef<Vector3 | null>(null);

  useEffect(() => {
    fx.shake = (amount: number) => {
      amp.current = Math.min(0.2, amp.current + amount);
    };
    return () => {
      fx.shake = () => {};
    };
  }, []);

  useFrame((state, dt) => {
    if (!base.current) base.current = camera.position.clone();
    const t = state.clock.elapsedTime;
    const a = amp.current;
    camera.position.set(
      base.current.x + Math.sin(t * 71) * a,
      base.current.y + Math.sin(t * 59 + 1.3) * a,
      base.current.z,
    );
    amp.current = Math.max(0, a - dt * (0.25 + a * 4));
  });

  return null;
};

// ─── Stage: dims the camera feed into a dark, clean backdrop ─────────────────

const stageFrag = /* glsl */ `
uniform float uDim;
uniform vec3 uHand;
uniform float uField;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float vig = smoothstep(0.25, 0.85, length(vUv - 0.5) * 1.4);
  float d = length(vWorld.xy - uHand.xy);
  // The camera shows through a little more around the hand.
  float halo = uField * smoothstep(1.2, 0.0, d) * 0.22;
  float a = clamp(uDim + vig * 0.18 - halo, 0.0, 0.97);
  gl_FragColor = vec4(vec3(0.02, 0.025, 0.045), a);
}
`;

const stageVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const Stage = () => {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uDim: { value: STAGE.dim }, uHand: { value: new Vector3() }, uField: { value: 0 } },
        vertexShader: stageVert,
        fragmentShader: stageFrag,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useFrame(() => {
    material.uniforms.uHand.value.copy(hand.palm);
    material.uniforms.uField.value = hand.field;
  });
  return (
    <mesh position={[0, 0, -1.5]} material={material} renderOrder={-500}>
      <planeGeometry args={[8, 10]} />
    </mesh>
  );
};

// ─── Field cue at the palm ────────────────────────────────────────────────────

const glowFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRing;
uniform float uRingR;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float core = exp(-r * r * 9.0) * 0.9;
  float body = smoothstep(1.0, 0.0, r) * 0.25;
  float ripple = (0.5 + 0.5 * sin(r * 22.0 - uTime * 6.0)) * smoothstep(1.0, 0.2, r) * 0.12;
  float ring = smoothstep(0.03, 0.0, abs(r - uRingR)) * uRing;
  gl_FragColor = vec4(uColor, (core + body + ripple) * uAlpha + ring);
}
`;

export const HandField = () => {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color("#9fe8ff") },
          uAlpha: { value: 0 },
          uRing: { value: 0 },
          uRingR: { value: FIELD.captureRadius / FIELD.radius },
          uTime: { value: 0 },
        },
        vertexShader: ringVert,
        fragmentShader: glowFrag,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  const ring = useRef(0);
  const warm = useRef(3);

  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m) return;
    m.position.set(hand.palm.x, hand.palm.y, 0.02);
    m.scale.setScalar(FIELD.radius * 2);
    const orbiting = world.captured !== null;
    const grabbing = hand.gesture === "palm" || hand.gesture === "pinch";
    let glow = 0.28;
    if (orbiting) glow = 0.55;
    else if (hand.gesture === "fist") glow = 0.12;
    material.uniforms.uAlpha.value = hand.field * glow;
    const ringTarget = hand.field * (grabbing && !orbiting ? 0.28 : 0);
    ring.current += (ringTarget - ring.current) * (1 - Math.exp(-dt * 8));
    material.uniforms.uRing.value = ring.current;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    if (warm.current > 0) warm.current -= 1;
    m.visible = hand.field > 0.01 || warm.current > 0;
  });

  return (
    <mesh ref={mesh} material={material} renderOrder={5}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
};

// ─── One-line hint, gone once you've got it ──────────────────────────────────

export const Hint = () => {
  const el = useRef<HTMLDivElement>(null);
  const shown = useRef("");

  useFrame(() => {
    const node = el.current;
    if (!node) return;
    let text = "";
    if (world.launches === 0) {
      if (world.captured !== null) text = "Make a fist to throw";
      else if (world.captures === 0 && hand.present) text = "Open your hand near something";
    }
    if (text !== shown.current) {
      shown.current = text;
      node.style.opacity = text ? "1" : "0";
      if (text) node.textContent = text;
    }
  });

  return (
    <Html fullscreen zIndexRange={[20, 0]} pointerEvents="none">
      <div
        ref={el}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "max(36px, env(safe-area-inset-bottom))",
          textAlign: "center",
          color: "rgba(235, 245, 255, 0.82)",
          font: '500 15px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          letterSpacing: "0.06em",
          transition: "opacity 400ms ease",
          opacity: 0,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </Html>
  );
};
