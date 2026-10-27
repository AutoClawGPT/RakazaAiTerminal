import test from "node:test";
import assert from "node:assert/strict";
import { newAnimState, stepRig, type FrameInput } from "../src/lib/stage/rig-anim";

type Rot = { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
const mkBone = (): { rotation: Rot } => {
  const r: Rot = { x: 0, y: 0, z: 0, set(x, y, z) { r.x = x; r.y = y; r.z = z; } };
  return { rotation: r };
};
const NAMES = ["hips","spine","chest","upperChest","neck","head","leftShoulder","rightShoulder","leftUpperArm","rightUpperArm","leftLowerArm","rightLowerArm","leftHand","rightHand","leftUpperLeg","rightUpperLeg","leftLowerLeg","rightLowerLeg","leftFoot","rightFoot","leftToes","rightToes","leftEye","rightEye"];

function run(motion: FrameInput["motion"], bold: boolean, seconds: number, level = 0) {
  const bones = new Map(NAMES.map((n) => [n, mkBone()]));
  const exprs: Record<string, number> = {};
  const root = { position: { x: 0, y: 0, z: 0, set() {} }, rotation: { x: 0, y: 0, z: 0, set() {} } };
  const st = newAnimState(1);
  const frames: Record<string, number[]>[] = [];
  let beat = 0;
  for (let i = 0; i < seconds * 60; i++) {
    beat += (1 / 60) * (112 / 60);
    stepRig(st, { dt: 1 / 60, motion, bold, level: level * (0.5 + 0.5 * Math.sin(i / 5)), low: 0.3, mid: 0.4, high: 0.2, beat, bpm: 112, cam: [0, 1, 3] },
      (n) => bones.get(n) ?? null, (n, v) => { exprs[n] = v; }, root, { position: { set() {} } } as never);
    if (i % 15 === 0) frames.push(Object.fromEntries([...bones].map(([n, b]) => [n, [b.rotation.x, b.rotation.y, b.rotation.z]])));
  }
  return { frames, exprs };
}
const range = (frames: Record<string, number[]>[], bone: string) => {
  let m = 0;
  for (let k = 0; k < 3; k++) { const xs = frames.map((f) => f[bone][k]); m = Math.max(m, Math.max(...xs) - Math.min(...xs)); }
  return m;
};

test("rig animator: moves over time in every mode, never NaN, never a T-pose", () => {
  for (const [motion, bold, lvl] of [["idle", false, 0], ["idle", false, 0.5], ["sing", false, 0.5], ["dance", false, 0], ["dance", true, 0]] as const) {
    const { frames, exprs } = run(motion, bold, 8, lvl);
    for (const f of frames) for (const n of NAMES) for (const v of f[n]) assert.ok(Number.isFinite(v), `${motion} ${n} finite`);
    for (const v of Object.values(exprs)) assert.ok(Number.isFinite(v));
    // arms hang down (not T-pose): left upper arm z about +1.15 (lowered) except when raised on purpose
    const last = frames[frames.length - 1];
    if (motion === "idle") assert.ok(last.leftUpperArm[2] > 0.8, "idle arms are lowered");
    assert.ok(range(frames, "head") > 0.01, `${motion} head moves`);
    assert.ok(range(frames, "spine") > 0.003, `${motion} spine moves`);
    if (motion === "dance") {
      assert.ok(range(frames, "leftUpperLeg") > 0.2 && range(frames, "rightUpperLeg") > 0.2, "legs move while dancing");
      assert.ok(range(frames, "leftUpperArm") > 0.5, "arms move while dancing");
      assert.ok(range(frames, "hips") > 0.05, "hips move while dancing");
    }
    if (motion === "sing") assert.ok(range(frames, "rightUpperArm") > 0.2 || range(frames, "leftUpperArm") > 0.2, "arms move while singing");
  }
});

test("rig animator: mouth follows the audio level", () => {
  const quiet = run("idle", false, 3, 0).exprs;
  const loud = run("idle", false, 3, 0.9).exprs;
  const open = (e: Record<string, number>) => (e.aa ?? 0) + (e.oh ?? 0) + (e.ih ?? 0) + (e.ou ?? 0) + (e.ee ?? 0);
  assert.ok(open(quiet) < 0.02, "silent mouth stays closed");
  // sample mid-speech: run and track the max opening
  const bones = new Map(NAMES.map((n) => [n, mkBone()]));
  const st = newAnimState(2);
  let maxOpen = 0;
  const e: Record<string, number> = {};
  for (let i = 0; i < 120; i++) {
    stepRig(st, { dt: 1 / 60, motion: "idle", bold: false, level: 0.6, low: 0.2, mid: 0.5, high: 0.2, beat: 0, bpm: 100, cam: [0, 1, 3] }, (n) => bones.get(n) ?? null, (n, v) => { e[n] = v; }, null, null);
    maxOpen = Math.max(maxOpen, open(e));
  }
  assert.ok(maxOpen > 0.3, "loud audio opens the mouth");
  void loud;
});

test("rig animator: sing-along mouth moves when the voice is muted (synth)", () => {
  const bones = new Map(NAMES.map((n) => [n, mkBone()]));
  const st = newAnimState(3);
  const e: Record<string, number> = {};
  const seen: number[] = [];
  for (let i = 0; i < 240; i++) {
    stepRig(st, { dt: 1 / 60, motion: "sing", bold: false, level: 0, low: 0, mid: 0, high: 0, beat: (i / 60) * 1.6, bpm: 96, cam: [0, 1, 3], synth: true }, (n) => bones.get(n) ?? null, (n, v) => { e[n] = v; }, null, null);
    seen.push((e.aa ?? 0) + (e.oh ?? 0));
  }
  assert.ok(Math.max(...seen) > 0.2 && Math.max(...seen) - Math.min(...seen.slice(30)) > 0.1, "mouth opens and closes");
});
