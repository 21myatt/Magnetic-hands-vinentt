// One procedural material for every body: key light + a point light that
// lives at the palm + a fresnel rim that glows with field intensity. Optional
// vertex stretch (slime) and wobble.
import { Color, ShaderMaterial, Vector3 } from "three";

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uWobble;
uniform vec3 uStretch;
varying vec3 vN;
varying vec3 vWorld;

void main() {
  vec3 p = position;
  if (uWobble > 0.0) {
    float n = sin(p.x * 9.0 + uTime * 3.1) * sin(p.y * 7.0 + uTime * 2.3) * sin(p.z * 8.0 + uTime * 2.7);
    p += normal * n * uWobble;
  }
  float sl = length(uStretch);
  if (sl > 1e-4) {
    vec3 d = uStretch / sl;
    float k = dot(normalize(position), d);
    // Leading side pulls out, trailing side lags: a tug, not a translation.
    p += d * sl * smoothstep(-0.3, 1.0, k) * (0.3 + 0.7 * max(k, 0.0));
    p -= d * sl * 0.2;
    // Thin out perpendicular to the pull to keep volume-ish.
    vec3 perp = p - d * dot(p, d);
    p -= perp * min(sl * 0.6, 0.35);
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRim;
uniform vec3 uLight;
uniform float uLightAmt;
uniform float uGlow;
uniform float uFlash;
uniform float uSss;
uniform float uSpec;
uniform float uLightMul;
varying vec3 vN;
varying vec3 vWorld;

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 Lk = normalize(vec3(0.35, 0.85, 0.6));
  float key = max(dot(N, Lk), 0.0);
  vec3 toL = uLight + vec3(0.0, 0.0, 0.6) - vWorld;
  float dl = length(toL);
  float pl = max(dot(N, toL / dl), 0.0) * uLightAmt / (1.0 + dl * dl * 1.6);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
  float spec = pow(max(dot(N, normalize(Lk + V)), 0.0), 56.0) * uSpec;

  vec3 col = uColor * (0.16 + 0.7 * key);
  col += uColor * uSss * (1.0 - fres) * 0.45;
  col += uRim * pl * uLightMul;
  col += uRim * fres * (0.18 + 1.5 * uGlow);
  col += vec3(spec);
  col += uRim * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export type BodyUniforms = {
  uTime: { value: number };
  uWobble: { value: number };
  uStretch: { value: Vector3 };
  uColor: { value: Color };
  uRim: { value: Color };
  uLight: { value: Vector3 };
  uLightAmt: { value: number };
  uGlow: { value: number };
  uFlash: { value: number };
  uSss: { value: number };
  uSpec: { value: number };
  uLightMul: { value: number };
};

export const makeBodyMaterial = (
  color: string,
  rim: string,
  opts: { sss?: number; spec?: number; light?: number } = {},
) => {
  const uniforms: BodyUniforms = {
    uTime: { value: 0 },
    uWobble: { value: 0 },
    uStretch: { value: new Vector3() },
    uColor: { value: new Color(color) },
    uRim: { value: new Color(rim) },
    uLight: { value: new Vector3() },
    uLightAmt: { value: 0 },
    uGlow: { value: 0 },
    uFlash: { value: 0 },
    uSss: { value: opts.sss ?? 0 },
    uSpec: { value: opts.spec ?? 0.5 },
    uLightMul: { value: opts.light ?? 1 },
  };
  const material = new ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  return { material, uniforms };
};
