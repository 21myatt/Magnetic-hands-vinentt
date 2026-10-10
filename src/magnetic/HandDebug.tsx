// Dev-only (lazy-loaded by Scene.tsx). `?debug` — landmarks, smoothed palm and the live gesture readout.
import { useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, type Mesh } from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

import { hand } from "./hand";

const HandDebug = () => {
  const palmRef = useRef<Mesh>(null);
  const textRef = useRef<HTMLPreElement>(null);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(21 * 3), 3));
    return g;
  }, []);

  useFrame(() => {
    const pos = geometry.getAttribute("position") as BufferAttribute;
    hand.landmarks.forEach((p, i) => pos.setXYZ(i, p.x, p.y, 0.01));
    pos.needsUpdate = true;
    if (palmRef.current) {
      palmRef.current.position.copy(hand.palm);
      palmRef.current.visible = hand.present;
    }
    if (textRef.current) {
      textRef.current.textContent =
        `${hand.present ? "hand" : "no hand"}  ${hand.gesture}\n` +
        `open ${hand.openness.toFixed(2)}  pinch ${hand.pinch.toFixed(2)}\n` +
        `field ${hand.field.toFixed(2)}  v ${hand.velocity.length().toFixed(1)}`;
    }
  });

  return (
    <>
      <points geometry={geometry} renderOrder={50}>
        <pointsMaterial size={6} sizeAttenuation={false} color="#00e5ff" depthTest={false} />
      </points>
      <mesh ref={palmRef} renderOrder={51}>
        <ringGeometry args={[0.06, 0.08, 32]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} />
      </mesh>
      <Html fullscreen zIndexRange={[30, 0]} pointerEvents="none">
        <pre
          ref={textRef}
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            margin: 0,
            font: "11px/1.4 ui-monospace, monospace",
            color: "#9ff",
            background: "rgba(0,0,0,.5)",
            padding: "6px 8px",
            borderRadius: 6,
          }}
        />
      </Html>
    </>
  );
};

export default HandDebug;
