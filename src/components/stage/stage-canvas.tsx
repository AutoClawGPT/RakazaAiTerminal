"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { hasAudio, readBands, readLevel } from "@/lib/stage/audio-bus";
import { getMotion, playMotion, setBold } from "@/lib/stage/motion-bus";
import { startDemo, stopAudio } from "@/lib/stage/audio-bus";
import { beatNow } from "@/lib/stage/music";
import { newAnimState, stepRig, type AnimState } from "@/lib/stage/rig-anim";

export type StageVariant = "hero" | "bust" | "panel";
export type StageHandle = { zoom: (dir: 1 | -1) => void; reset: () => void };

type Props = {
  variant: StageVariant;
  src: string;
  /** wheel/pinch zoom; off on the home hero so the page can still scroll */
  wheelZoom: boolean;
  visible: boolean;
  lite?: boolean;
  onReady: () => void;
  onFail: (why: string) => void;
  handleRef: React.RefObject<StageHandle | null>;
};

/** h/w = world-space height/width that must stay in frame; cy = look-at height */
const CAM: Record<StageVariant, { cy: number; h: number; w: number; fov: number }> = {
  hero: { cy: 0.84, h: 1.66, w: 1.15, fov: 26 },
  bust: { cy: 1.3, h: 0.66, w: 0.66, fov: 28 },
  panel: { cy: 0.9, h: 1.74, w: 1.2, fov: 26 },
};

function fitDistance(v: StageVariant, aspect: number) {
  const c = CAM[v];
  const t = Math.tan((c.fov * Math.PI) / 360);
  return Math.max(c.h / 2 / t, c.w / 2 / (t * aspect));
}

function Avatar({ src, onReady, onFail }: Pick<Props, "src" | "onReady" | "onFail">) {
  const group = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const [lookObj] = useState(() => new THREE.Object3D());
  const anim = useRef<AnimState>(newAnimState());
  const accent = useRef<THREE.PointLight>(null);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    let dead = false;
    const holder = group.current;
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    loader.load(
      src,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (dead || !vrm) {
          if (!vrm) onFail("not a VRM file");
          return;
        }
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.traverse((o) => {
          o.frustumCulled = false;
        });
        // relaxed A-pose: arms down, slight elbow bend
        const h = vrm.humanoid;
        const set = (name: Parameters<typeof h.getNormalizedBoneNode>[0], x: number, y: number, z: number) => {
          const n = h.getNormalizedBoneNode(name);
          if (n) n.rotation.set(x, y, z);
        };
        set("leftUpperArm", 0, 0, 1.15);
        set("rightUpperArm", 0, 0, -1.15);
        set("leftLowerArm", 0, 0, 0.12);
        set("rightLowerArm", 0, 0, -0.12);
        if (vrm.lookAt) vrm.lookAt.target = lookObj;
        holder?.add(vrm.scene);
        vrmRef.current = vrm;
        if (typeof window !== "undefined" && window.location.search.includes("rkdebug")) {
          const w = window as unknown as { __rkVrm?: VRM; __rkCtl?: unknown };
          w.__rkVrm = vrm;
          w.__rkCtl = { playMotion, setBold, startDemo, stopAudio };
        }
        onReady();
      },
      undefined,
      (e) => !dead && onFail(e instanceof Error ? e.message : "load failed"),
    );
    return () => {
      dead = true;
      const v = vrmRef.current;
      if (v) {
        holder?.remove(v.scene);
        VRMUtils.deepDispose(v.scene);
        vrmRef.current = null;
      }
    };
  }, [src, onReady, onFail, lookObj]);

  useFrame((_, dtRaw) => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    const dt = Math.min(dtRaw, 0.05);
    const h = vrm.humanoid;
    const m = getMotion();
    const level = readLevel();
    const bands = readBands();
    const clock = beatNow(m.motion === "idle" ? "none" : m.motion, m.since);
    const dbg = typeof window !== "undefined" ? (window as unknown as { __rkPose?: Record<string, [number, number, number]> | null }).__rkPose : undefined;
    const em = vrm.expressionManager;
    if (dbg) {
      // debug pose lab (only reachable with ?rkdebug): hold a given pose instead of animating
      for (const [name, r] of Object.entries(dbg)) {
        const n = h.getNormalizedBoneNode(name as Parameters<typeof h.getNormalizedBoneNode>[0]);
        if (n) n.rotation.set(r[0], r[1], r[2]);
      }
    } else {
      stepRig(
        anim.current,
        { dt, motion: m.motion, bold: m.bold, level, low: bands.low, mid: bands.mid, high: bands.high, beat: clock.beat, bpm: clock.bpm, cam: [camera.position.x, camera.position.y, camera.position.z], synth: m.motion === "sing" && !hasAudio() },
        (n) => h.getNormalizedBoneNode(n as Parameters<typeof h.getNormalizedBoneNode>[0]),
        (n, v) => em?.setValue(n, v),
        group.current,
        lookObj,
      );
    }
    // bold style: soft rose accent light fades in
    if (accent.current) accent.current.intensity = anim.current.wBold * 2.2;
    vrm.update(dt);
  });

  return (
    <group ref={group}>
      <primitive object={lookObj} />
      <pointLight ref={accent} position={[0.6, 1.4, 1]} intensity={0} color="#ff5fa8" distance={4} />
    </group>
  );
}

function Rig({ variant, wheelZoom, handleRef }: Pick<Props, "variant" | "wheelZoom" | "handleRef">) {
  const cfg = CAM[variant];
  const ctl = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dist = fitDistance(variant, size.width / Math.max(1, size.height));
  const min = dist * 0.45;
  const max = dist * 1.6;

  useEffect(() => {
    camera.position.set(0, cfg.cy + 0.04, dist);
    ctl.current?.target.set(0, cfg.cy, 0);
    ctl.current?.update();
  }, [camera, cfg, dist]);

  useEffect(() => {
    handleRef.current = {
      reset: () => {
        camera.position.set(0, cfg.cy + 0.04, dist);
        ctl.current?.target.set(0, cfg.cy, 0);
        ctl.current?.update();
      },
      zoom: (dir) => {
        const c = ctl.current;
        if (!c) return;
        const v = camera.position.clone().sub(c.target);
        const d = THREE.MathUtils.clamp(v.length() * (dir > 0 ? 0.8 : 1.25), min, max);
        camera.position.copy(c.target).add(v.setLength(d));
        c.update();
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [cfg, camera, handleRef, dist, min, max]);

  // dance / sing pull the camera back so the whole body is in frame, then ease back (bust view only)
  const pull = useRef({ k: 0 });
  useFrame((_, dtRaw) => {
    const c = ctl.current;
    if (!c || variant !== "bust") return;
    const m = getMotion().motion;
    const want = m === "dance" ? 1 : m === "sing" ? 0.35 : 0;
    const prev = pull.current.k;
    const next = prev + (want - prev) * Math.min(1, Math.min(dtRaw, 0.05) * 3);
    if (Math.abs(next - prev) < 1e-5) return;
    pull.current.k = next;
    const f = (1 + next * 1.35) / (1 + prev * 1.35);
    c.maxDistance = max * 2.4;
    const v = camera.position.clone().sub(c.target).multiplyScalar(f);
    c.target.y += (next - prev) * -0.38;
    camera.position.copy(c.target).add(v);
    c.update();
    if (next < 0.001) c.maxDistance = max;
  });

  return (
    <OrbitControls
      ref={ctl}
      target={[0, cfg.cy, 0]}
      enablePan={false}
      enableZoom={wheelZoom}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      minDistance={min}
      maxDistance={max}
      minPolarAngle={Math.PI * 0.32}
      maxPolarAngle={Math.PI * 0.62}
      minAzimuthAngle={-Math.PI * 0.5}
      maxAzimuthAngle={Math.PI * 0.5}
    />
  );
}

export default function StageCanvas(props: Props) {
  const { variant, src, visible, onReady, onFail } = props;
  const cfg = CAM[variant];
  const [lost, setLost] = useState(false);
  // phones: fewer pixels (the avatar is soft-shaded, so it still looks sharp); desktop keeps up to 1.75x
  const [dpr] = useState<[number, number]>(() => {
    const coarse = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    return props.lite ? [1, 1.25] : coarse ? [1, 1.4] : [1, 1.75];
  });
  useEffect(() => {
    if (lost) onFail("webgl context lost");
  }, [lost, onFail]);
  return (
    <Canvas
      frameloop={visible ? "always" : "never"}
      dpr={dpr}
      camera={{ position: [0, cfg.cy + 0.04, 3.4], fov: cfg.fov, near: 0.1, far: 30 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "default" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        // let the page scroll vertically on touch; horizontal drags orbit (pinch-zoom only where wheelZoom is on)
        gl.domElement.style.touchAction = props.wheelZoom ? "none" : "pan-y";
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setLost(true);
        });
      }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <ambientLight intensity={1.15} />
      <directionalLight position={[1.5, 2.5, 2.5]} intensity={2.1} color="#fff4e8" />
      <directionalLight position={[-2, 1.2, -1.5]} intensity={1.1} color="#9d7bff" />
      <directionalLight position={[2, 0.4, -2]} intensity={0.8} color="#ff6fb5" />
      <Avatar src={src} onReady={onReady} onFail={onFail} />
      <Rig variant={variant} wheelZoom={props.wheelZoom} handleRef={props.handleRef} />
    </Canvas>
  );
}
