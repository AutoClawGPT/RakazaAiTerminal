"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { readBands, readLevel } from "@/lib/stage/audio-bus";
import { confirmAdult, getStage, setBold } from "@/lib/stage/motion-bus";
import { startDemo, stopAudio } from "@/lib/stage/audio-bus";
import { getSongState, songFrame } from "@/lib/stage/song-player";
import { getPrep } from "@/lib/stage/song-prep";
import { newAnimState, stepRig, type AnimState } from "@/lib/stage/rig-anim";

/**
 * Deterministic capture hook (only reachable with ?rkdebug, used by scripts/stage-videos to record the real stage
 * frame by frame): when `feed` is set the stage does not read the clock or the audio, it advances exactly one
 * step per `pending` feed (dt, beat, bpm, energy, mouth values) and bumps `seq` once the pose is applied.
 */
type CaptureFeed = { pending: boolean; dt: number; beat: number; bpm: number; energy: number; level: number; low: number; mid: number; high: number };
type CaptureHook = { feed: CaptureFeed | null; seq: number; camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer; controls: { target: THREE.Vector3; update: () => void } | null };

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

/** Studio lights; in the 18+ club they dim and shift to a moody neon palette. */
function SceneLights() {
  const amb = useRef<THREE.AmbientLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const rimA = useRef<THREE.DirectionalLight>(null);
  const rimB = useRef<THREE.DirectionalLight>(null);
  const k = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    k.current += ((getStage().bold ? 1 : 0) - k.current) * Math.min(1, dt * 2.5);
    const c = k.current;
    if (amb.current) amb.current.intensity = THREE.MathUtils.lerp(1.15, 0.38, c);
    if (key.current) {
      key.current.intensity = THREE.MathUtils.lerp(2.1, 0.95, c);
      key.current.color.set(c > 0.5 ? "#ffd2ec" : "#fff4e8");
    }
    if (rimA.current) {
      rimA.current.intensity = THREE.MathUtils.lerp(1.1, 1.8, c);
      rimA.current.color.set(c > 0.5 ? "#7a4dff" : "#9d7bff");
    }
    if (rimB.current) {
      rimB.current.intensity = THREE.MathUtils.lerp(0.8, 1.6, c);
      rimB.current.color.set(c > 0.5 ? "#ff2f8e" : "#ff6fb5");
    }
  });
  return (
    <>
      <ambientLight ref={amb} intensity={1.15} />
      <directionalLight ref={key} position={[1.5, 2.5, 2.5]} intensity={2.1} color="#fff4e8" />
      <directionalLight ref={rimA} position={[-2, 1.2, -1.5]} intensity={1.1} color="#9d7bff" />
      <directionalLight ref={rimB} position={[2, 0.4, -2]} intensity={0.8} color="#ff6fb5" />
    </>
  );
}

function Avatar({ src, onReady, onFail }: Pick<Props, "src" | "onReady" | "onFail">) {
  const group = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const [lookObj] = useState(() => new THREE.Object3D());
  const anim = useRef<AnimState>(newAnimState());
  const accent = useRef<THREE.PointLight>(null);
  const neonL = useRef<THREE.PointLight>(null);
  const neonR = useRef<THREE.PointLight>(null);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as CaptureHook["controls"];

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
          w.__rkCtl = { setBold, confirmAdult, startDemo, stopAudio };
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

  // capture hook (see CaptureHook): only with ?rkdebug
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.search.includes("rkdebug")) return;
    const w = window as unknown as { __rkCap?: CaptureHook };
    w.__rkCap = { feed: w.__rkCap?.feed ?? null, seq: w.__rkCap?.seq ?? 0, camera, scene, gl, controls };
  }, [camera, scene, gl, controls]);

  const readyClock = useRef(0);
  const clockRef = useRef({ bt: 0, last: 0 });
  useFrame((_, dtRaw) => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    const cap = typeof window !== "undefined" ? (window as unknown as { __rkCap?: CaptureHook }).__rkCap : undefined;
    const feed = cap?.feed ?? null;
    if (feed && !feed.pending) return; // capture: hold the pose until the next step is fed
    if (feed) feed.pending = false;
    const dt = feed ? feed.dt : Math.min(dtRaw, 0.05);
    const h = vrm.humanoid;
    const m = getStage();
    // a real song takes over everything: beat grid from its audio, mouth from its spectrum
    const sf = feed ? { playing: true, beat: feed.beat, bpm: feed.bpm, time: 0, energy: feed.energy, level: feed.level, low: feed.low, mid: feed.mid, high: feed.high } : songFrame(dt);
    const level = sf.playing ? sf.level : readLevel();
    const bands = sf.playing ? { low: sf.low, mid: sf.mid, high: sf.high } : readBands();
    // ready pose: while a song is being prepared / loaded she stands ready (mic hand up, bouncing gently on her own clock)
    const ready = !sf.playing && (getPrep().active || getSongState().status === "loading");
    readyClock.current = ready ? readyClock.current + dt * (118 / 60) : 0;
    const rawBeat = sf.playing ? sf.beat : ready ? readyClock.current : 0;
    const rawBpm = sf.playing ? sf.bpm : ready ? 118 : 100;
    // 18+ club dances in half time: a continuous beat accumulator (no phase jumps when it toggles) that re-locks to every other beat
    const ck = clockRef.current;
    const rate = 1 - 0.5 * anim.current.wBold;
    const dB = rawBeat - ck.last;
    ck.last = rawBeat;
    if (dB < 0 || dB > 2) ck.bt = rawBeat * rate;
    else ck.bt += dB * rate;
    if (anim.current.wBold > 0.98) {
      const err = ((((ck.bt - rawBeat * 0.5) % 1) + 1.5) % 1) - 0.5;
      ck.bt -= err * Math.min(1, dt * 2);
    }
    const clock = { beat: ck.bt, bpm: rawBpm * rate };
    const motion = sf.playing || ready ? "perform" : "idle";
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
        { dt, motion, bold: m.bold, level, low: bands.low, mid: bands.mid, high: bands.high, beat: clock.beat, bpm: clock.bpm, cam: [camera.position.x, camera.position.y, camera.position.z], energy: sf.playing ? sf.energy : ready ? 0.2 : 0.6, pose: ready ? "mic" : undefined },
        (n) => h.getNormalizedBoneNode(n as Parameters<typeof h.getNormalizedBoneNode>[0]),
        (n, v) => em?.setValue(n, v),
        group.current,
        lookObj,
      );
    }
    // 18+ club: neon accent lights fade in and flash on the beat
    const wB = anim.current.wBold;
    const flash = 0.6 + 0.4 * Math.max(0, Math.cos(Math.PI * 2 * clock.beat));
    if (accent.current) accent.current.intensity = wB * 3.2;
    if (neonL.current) neonL.current.intensity = wB * 3.5 * flash;
    if (neonR.current) neonR.current.intensity = wB * 3.5 * (1.6 - flash);
    vrm.update(dt);
    if (feed && cap) cap.seq++;
  });

  return (
    <group ref={group}>
      <primitive object={lookObj} />
      <pointLight ref={accent} position={[0.6, 1.4, 1]} intensity={0} color="#ff3d9a" distance={4} />
      <pointLight ref={neonL} position={[-1.1, 1.2, 0.9]} intensity={0} color="#27d8ff" distance={4.5} />
      <pointLight ref={neonR} position={[1.1, 0.9, 0.9]} intensity={0} color="#c13bff" distance={4.5} />
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
    const want = getSongState().status === "playing" || getPrep().active ? 1 : 0;
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
      makeDefault
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
      <SceneLights />
      <Avatar src={src} onReady={onReady} onFail={onFail} />
      <Rig variant={variant} wheelZoom={props.wheelZoom} handleRef={props.handleRef} />
    </Canvas>
  );
}
