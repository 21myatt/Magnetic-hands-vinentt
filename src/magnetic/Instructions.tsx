// Instruction screen: up whenever no hand is in view, gone the moment one is.
// While the hand model is still downloading it says so instead. Hidden until the
// camera runs, so it never covers the shell's loading or camera-error screens.
import { useRef } from "react";
import type { CSSProperties } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { XRModel } from "@vincentt-xr/sdk";
import {
  useXRError,
  useXRModel,
  useXRReady,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";

import { hand } from "./hand";

/** No hand for this long brings the screen back (s) — avoids flicker on a dropped frame. */
const RETURN_AFTER = 1.2;

const STEPS: [icon: string, text: string][] = [
  ["👋", "Move near an object"],
  ["🖐️", "Open palm to catch"],
  ["✊", "Fist to throw"],
];

const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const screen: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 18,
  padding: "0 28px",
  background: "radial-gradient(ellipse at center, rgba(4,6,12,.35), rgba(4,6,12,.75))",
  color: "#eef6ff",
  fontFamily: font,
  textAlign: "center",
  transition: "opacity 450ms ease",
  pointerEvents: "none",
  userSelect: "none",
};

const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.32em",
  color: "rgba(159,232,255,.8)",
};

const title: CSSProperties = { fontSize: 30, fontWeight: 700, letterSpacing: "0.01em", margin: 0 };

const stepRow: CSSProperties = { display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap", justifyContent: "center" };

const step: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  width: 92,
  padding: "12px 6px",
  borderRadius: 14,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.1)",
  fontSize: 12,
  lineHeight: 1.25,
  color: "rgba(238,246,255,.8)",
};

export const Instructions = () => {
  const { ready } = useXRModel<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const cameraReady = useXRReady();
  const cameraError = useXRError();
  const root = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const missing = useRef(RETURN_AFTER);
  const shown = useRef<boolean | null>(null);

  useFrame((_s, dt) => {
    missing.current = hand.present ? 0 : missing.current + dt;
    const show = cameraReady && !cameraError && (!ready || missing.current >= RETURN_AFTER);
    if (titleRef.current) {
      const text = ready ? "Raise your hand" : "Loading hand tracking…";
      if (titleRef.current.textContent !== text) titleRef.current.textContent = text;
    }
    if (show !== shown.current && root.current) {
      shown.current = show;
      root.current.style.opacity = show ? "1" : "0";
    }
  });

  return (
    <Html fullscreen zIndexRange={[22, 0]} pointerEvents="none">
      <div ref={root} style={{ ...screen, opacity: 0 }}>
        <div style={eyebrow}>MAGNETIC HANDS</div>
        <h1 ref={titleRef} style={title}>
          Raise your hand
        </h1>
        <div style={stepRow}>
          {STEPS.map(([icon, text]) => (
            <div key={text} style={step}>
              <span style={{ fontSize: 26 }} aria-hidden="true">
                {icon}
              </span>
              {text}
            </div>
          ))}
        </div>
      </div>
    </Html>
  );
};
