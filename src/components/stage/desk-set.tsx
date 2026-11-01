"use client";
/**
 * The "president desk" news-anchor set for the live stage, built only from three.js primitives and canvas textures
 * (no external assets, so no third-party licenses). She stands close behind it, framed from the waist up.
 * The laptop screen shows a live-looking Rakaza Terminal readout; the nameplate faces the viewer.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const NEON = "#00ffd0";
const PINK = "#ff3d9a";

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { t, c };
}

function drawScreen(g: CanvasRenderingContext2D, tick: number) {
  const W = g.canvas.width, H = g.canvas.height;
  g.fillStyle = "#06021a";
  g.fillRect(0, 0, W, H);
  g.fillStyle = PINK;
  g.fillRect(0, 0, W, 34);
  g.fillStyle = "#fff";
  g.font = "bold 22px monospace";
  g.fillText("RAKAZA TERMINAL · LIVE", 12, 24);
  g.font = "16px monospace";
  const rows = ["NEW LAUNCHES  ▲", "$AB8BFF  0.28 SOL", "$AT8BFF  0.28 SOL", "TOP AGENT  ClawrenAI", "NETWORK  devnet"];
  rows.forEach((r, i) => {
    g.fillStyle = i === 0 || i === 3 ? NEON : "#d9fff6";
    g.fillText(r, 14, 64 + i * 26);
  });
  // little live chart
  g.strokeStyle = NEON;
  g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= 200; x += 8) {
    const y = 210 - 30 * Math.sin((x + tick * 40) / 30) - x * 0.15;
    if (x === 0) g.moveTo(W - 220 + x, y);
    else g.lineTo(W - 220 + x, y);
  }
  g.stroke();
  if (Math.floor(tick * 2) % 2) {
    g.fillStyle = NEON;
    g.fillRect(14, H - 26, 12, 18);
  }
}

export function DeskSet() {
  const screenTex = useMemo(() => canvasTex(512, 256, (g) => drawScreen(g, 0)), []);
  const screen = useRef(screenTex);
  const plate = useMemo(
    () =>
      canvasTex(512, 96, (g) => {
        g.fillStyle = "#120634";
        g.fillRect(0, 0, 512, 96);
        g.strokeStyle = "#ffcf4a";
        g.lineWidth = 6;
        g.strokeRect(4, 4, 504, 88);
        g.fillStyle = "#ffcf4a";
        g.font = "bold 46px sans-serif";
        g.textAlign = "center";
        g.fillText("RAKAZA", 256, 52);
        g.font = "20px monospace";
        g.fillStyle = NEON;
        g.fillText("AI HOST · ON AIR", 256, 82);
      }),
    [],
  );
  const lampLight = useRef<THREE.PointLight>(null);
  const ring = useRef<THREE.Mesh>(null);
  const last = useRef(0);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t - last.current > 0.25) {
      last.current = t;
      const sc = screen.current;
      drawScreen(sc.c.getContext("2d")!, t);
      sc.t.needsUpdate = true;
    }
    if (ring.current) ring.current.rotation.y = t * 0.8;
    if (lampLight.current) lampLight.current.intensity = 1.4 + 0.08 * Math.sin(t * 7);
  });

  const top = 0.86; // desk top height (just under her waist)
  return (
    <group position={[0, 0, 0.36]}>
      {/* desk top: dark walnut with a gold edge */}
      <mesh position={[0, top - 0.03, 0]}>
        <boxGeometry args={[1.7, 0.06, 0.62]} />
        <meshStandardMaterial color="#2a1530" roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[0, top - 0.005, 0.312]}>
        <boxGeometry args={[1.72, 0.012, 0.012]} />
        <meshStandardMaterial color="#ffcf4a" emissive="#ffcf4a" emissiveIntensity={0.6} />
      </mesh>
      {/* front modesty panel with neon trim */}
      <mesh position={[0, top / 2 - 0.03, 0.3]}>
        <boxGeometry args={[1.7, top - 0.06, 0.04]} />
        <meshStandardMaterial color="#160a2e" roughness={0.5} />
      </mesh>
      <mesh position={[0, top - 0.12, 0.322]}>
        <boxGeometry args={[1.62, 0.012, 0.005]} />
        <meshStandardMaterial color={NEON} emissive={NEON} emissiveIntensity={2} />
      </mesh>
      {/* nameplate on the front edge */}
      <group position={[0, top + 0.035, 0.24]} rotation={[-0.35, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.36, 0.07, 0.03]} />
          <meshStandardMaterial color="#120634" />
        </mesh>
        <mesh position={[0, 0, 0.016]}>
          <planeGeometry args={[0.35, 0.066]} />
          <meshBasicMaterial map={plate.t} toneMapped={false} />
        </mesh>
      </group>
      {/* laptop, angled so viewers see the glowing screen */}
      <group position={[0.42, top, 0.02]} rotation={[0, -0.75, 0]}>
        <mesh position={[0, 0.008, 0]}>
          <boxGeometry args={[0.34, 0.016, 0.23]} />
          <meshStandardMaterial color="#b9bccb" metalness={0.8} roughness={0.3} />
        </mesh>
        <group position={[0, 0.016, -0.11]} rotation={[0.25, Math.PI, 0]}>
          <mesh position={[0, 0.11, 0]}>
            <boxGeometry args={[0.34, 0.22, 0.01]} />
            <meshStandardMaterial color="#9fa3b4" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.11, -0.006]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.32, 0.2]} />
            <meshBasicMaterial map={screenTex.t} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 0.11, -0.15]} color={NEON} intensity={0.6} distance={0.8} />
        </group>
      </group>
      {/* coffee mug */}
      <group position={[-0.5, top, 0.08]}>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.04, 0.036, 0.1, 24]} />
          <meshStandardMaterial color={PINK} roughness={0.4} />
        </mesh>
        <mesh position={[0.045, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.025, 0.007, 8, 16]} />
          <meshStandardMaterial color={PINK} />
        </mesh>
      </group>
      {/* banker's lamp */}
      <group position={[-0.68, top, -0.12]}>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.02, 24]} />
          <meshStandardMaterial color="#ffcf4a" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.3, 8]} />
          <meshStandardMaterial color="#ffcf4a" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[0.05, 0.31, 0]} rotation={[0, 0, -1.1]}>
          <coneGeometry args={[0.07, 0.1, 24, 1, true]} />
          <meshStandardMaterial color="#0d6b4f" side={THREE.DoubleSide} emissive="#0d6b4f" emissiveIntensity={0.3} />
        </mesh>
        <pointLight ref={lampLight} position={[0.09, 0.27, 0.05]} color="#ffd9a0" intensity={1.4} distance={1.2} />
      </group>
      {/* small neon items: spinning ring trophy and a glowing cube */}
      <group position={[-0.3, top, -0.16]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.03, 0.035, 0.04, 16]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <mesh ref={ring} position={[0, 0.1, 0]}>
          <torusGeometry args={[0.05, 0.008, 12, 32]} />
          <meshStandardMaterial color={PINK} emissive={PINK} emissiveIntensity={2.2} />
        </mesh>
      </group>
      <mesh position={[0.72, top + 0.03, 0.12]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[0.06, 0.06, 0.06]} />
        <meshStandardMaterial color={NEON} emissive={NEON} emissiveIntensity={1.6} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
