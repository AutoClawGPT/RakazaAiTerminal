"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { readLevel } from "@/lib/stage/audio-bus";
import { getMotion } from "@/lib/stage/motion-bus";

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
  const state = useRef({ t: 0, nextBlink: 1.6, blink: -1, mouth: 0, wDance: 0, wSing: 0, wBold: 0, wink: -1, nextWink: 4 });
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
    const s = state.current;
    s.t += dt;
    const t = s.t;
    const h = vrm.humanoid;
    const bone = (n: Parameters<typeof h.getNormalizedBoneNode>[0]) => h.getNormalizedBoneNode(n);

    // breathing + weight shift
    const br = Math.sin(t * 1.9);
    const chest = bone("chest") ?? bone("spine");
    if (chest) chest.rotation.x = 0.015 + br * 0.018;
    const spine = bone("spine");
    if (spine) spine.rotation.z = Math.sin(t * 0.55) * 0.02;
    // head sway
    const head = bone("head");
    const neck = bone("neck");
    if (neck) neck.rotation.set(Math.sin(t * 0.7) * 0.02, Math.sin(t * 0.43) * 0.05, Math.sin(t * 0.5) * 0.02);
    if (head) head.rotation.set(Math.sin(t * 0.9) * 0.015, Math.sin(t * 0.37) * 0.05, 0);
    // arms: tiny sway
    const lu = bone("leftUpperArm");
    const ru = bone("rightUpperArm");
    if (lu) lu.rotation.z = 1.15 - Math.sin(t * 1.9 + 0.6) * 0.012;
    if (ru) ru.rotation.z = -1.15 + Math.sin(t * 1.9 + 0.6) * 0.012;

    // ---- motion layer (additive on top of the idle above): sing / dance / 18+ style ----
    const m = getMotion();
    const ease = (cur: number, to: number, k: number) => cur + (to - cur) * Math.min(1, dt * k);
    s.wDance = ease(s.wDance, m.motion === "dance" ? 1 : 0, 4);
    s.wSing = ease(s.wSing, m.motion === "sing" ? 1 : 0, 4);
    s.wBold = ease(s.wBold, m.bold ? 1 : 0, 2.5);
    const wd = s.wDance;
    const ws = s.wSing;
    const wb = s.wBold;
    const g = group.current;
    const W = t * Math.PI * 2 * 1.9; // beat phase (about 114 bpm)
    const sway = Math.sin(W / 2);
    const bone2 = bone;
    if (g) {
      g.position.y = wd * Math.abs(Math.sin(W)) * 0.018 - wd * 0.01;
      g.position.x = wd * sway * 0.045 + ws * Math.sin(t * 1.1) * 0.02;
      g.rotation.y = wd * sway * 0.28 + ws * Math.sin(t * 0.9) * 0.12 + wb * Math.sin(t * 0.8) * 0.1;
      g.rotation.z = wd * Math.sin(W / 2 + 0.6) * 0.03 + wb * 0.02;
    }
    if (spine) {
      spine.rotation.z += wd * Math.sin(W / 2 + Math.PI) * 0.12 + wb * -0.07;
      spine.rotation.y = wd * Math.sin(W / 2) * 0.18;
    }
    if (chest) {
      chest.rotation.z = wd * Math.sin(W / 2) * 0.1 + wb * 0.05;
      chest.rotation.x += wd * Math.max(0, Math.sin(W)) * 0.06 + ws * 0.05;
    }
    const hips = bone2("hips");
    if (hips) hips.rotation.set(0, wd * sway * 0.2, wd * Math.sin(W / 2 + Math.PI) * 0.1 + wb * 0.06);
    const lul = bone2("leftUpperLeg");
    const rul = bone2("rightUpperLeg");
    if (lul) lul.rotation.set(wd * Math.max(0, sway) * -0.22, 0, wd * 0.05 + wb * 0.03);
    if (rul) rul.rotation.set(wd * Math.max(0, -sway) * -0.22, 0, wd * -0.05 + wb * -0.06);
    const lll = bone2("leftLowerLeg");
    const rll = bone2("rightLowerLeg");
    if (lll) lll.rotation.x = wd * Math.max(0, sway) * 0.35;
    if (rll) rll.rotation.x = wd * Math.max(0, -sway) * 0.35;
    // arms
    const lla = bone("leftLowerArm");
    const rla = bone("rightLowerArm");
    if (lu && ru) {
      const upL = wd * (0.5 + 0.5 * Math.sin(W / 2)); // left arm lifts on one beat, right on the next
      const upR = wd * (0.5 - 0.5 * Math.sin(W / 2));
      lu.rotation.z = lu.rotation.z * (1 - upL) + (-1.05 + Math.sin(W) * 0.15) * upL;
      ru.rotation.z = ru.rotation.z * (1 - upR) + (1.05 - Math.sin(W) * 0.15) * upR;
      // singing: right hand comes up like holding a mic, left hand rests on chest
      ru.rotation.z = ru.rotation.z * (1 - ws) + -0.6 * ws;
      ru.rotation.y = -1.0 * ws;
      lu.rotation.z = lu.rotation.z * (1 - ws * 0.6) + 0.75 * ws * 0.6;
      // 18+ style: right hand on hip, left hand loose
      ru.rotation.z = ru.rotation.z * (1 - wb * (1 - ws)) + -0.8 * wb * (1 - ws);
      if (lla) lla.rotation.set(0, 0, 0.12 + upL * -0.5 + ws * 0.5);
      if (rla) rla.rotation.set(0, wb * (1 - ws) * 1.5 + ws * -1.5, -0.12 + upR * 0.5);
    }
    if (head) {
      head.rotation.x += wd * Math.sin(W) * 0.07 - ws * 0.1;
      head.rotation.z += wd * Math.sin(W / 2) * 0.08 + ws * Math.sin(t * 1.3) * 0.08 + wb * 0.08;
    }
    // bold style: soft rose accent light fades in
    if (accent.current) accent.current.intensity = wb * 2.2;

    // eyes follow the camera with a lazy offset
    lookObj.position.set(camera.position.x * 0.5 + Math.sin(t * 0.8) * 0.12, camera.position.y + Math.sin(t * 0.6) * 0.05, camera.position.z);

    const em = vrm.expressionManager;
    if (em) {
      // blink: random 2-5s, 140ms close/open
      s.nextBlink -= dt;
      if (s.nextBlink <= 0 && s.blink < 0) {
        s.blink = 0;
        s.nextBlink = 2 + Math.random() * 3.2;
      }
      let b = 0;
      if (s.blink >= 0) {
        s.blink += dt;
        const k = s.blink / 0.16;
        b = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2);
        if (k >= 1) s.blink = -1;
      }
      em.setValue("blink", Math.min(1, b));
      // lip-sync from analyser
      const lvl = readLevel();
      s.mouth += (lvl - s.mouth) * 0.6;
      const open = Math.min(1, s.mouth * 1.25);
      em.setValue("aa", open * 0.9);
      em.setValue("oh", open * Math.max(0, Math.sin(t * 7)) * 0.35);
      em.setValue("ih", open * Math.max(0, Math.sin(t * 5 + 1.7)) * 0.25);
      // singing: open the mouth on a rolling vowel pattern even when no audio is playing
      const sing = ws * (0.35 + 0.35 * Math.max(0, Math.sin(t * 5.2)));
      em.setValue("aa", Math.min(1, open * 0.9 + sing));
      em.setValue("happy", Math.min(1, 0.22 + (open > 0.05 ? 0.1 : 0) + wd * 0.55 + ws * 0.3 + wb * 0.35));
      // 18+ style: an occasional playful wink
      s.nextWink -= dt;
      if (wb > 0.5 && s.nextWink <= 0 && s.wink < 0) {
        s.wink = 0;
        s.nextWink = 4 + Math.random() * 4;
      }
      let wk = 0;
      if (s.wink >= 0) {
        s.wink += dt;
        const k = s.wink / 0.7;
        wk = k < 0.2 ? k / 0.2 : k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
        if (k >= 1) s.wink = -1;
      }
      em.setValue("blinkRight", wk);
      em.setValue("relaxed", wb * 0.45);
    }
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
  useEffect(() => {
    if (lost) onFail("webgl context lost");
  }, [lost, onFail]);
  return (
    <Canvas
      frameloop={visible ? "always" : "never"}
      dpr={props.lite ? [1, 1.25] : [1, 1.75]}
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
