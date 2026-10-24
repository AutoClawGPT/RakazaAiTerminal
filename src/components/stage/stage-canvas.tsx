"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { readLevel } from "@/lib/stage/audio-bus";

export type StageVariant = "hero" | "bust" | "panel";
export type StageHandle = { zoom: (dir: 1 | -1) => void; reset: () => void };

type Props = {
  variant: StageVariant;
  src: string;
  /** wheel/pinch zoom; off on the home hero so the page can still scroll */
  wheelZoom: boolean;
  visible: boolean;
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
  const state = useRef({ t: 0, nextBlink: 1.6, blink: -1, mouth: 0 });
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
      em.setValue("happy", 0.22 + (open > 0.05 ? 0.1 : 0));
    }
    vrm.update(dt);
  });

  return (
    <group ref={group}>
      <primitive object={lookObj} />
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
      dpr={[1, 1.75]}
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
