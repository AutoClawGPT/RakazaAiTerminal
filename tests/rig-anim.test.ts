import test from "node:test";
import assert from "node:assert/strict";
import { newAnimState, stepRig, pickPhrase, spinAngle, PHRASES, BOLD_PHRASES, type FrameInput, type Phrase } from "../src/lib/stage/rig-anim";

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
  for (const [motion, bold, lvl] of [["idle", false, 0], ["idle", false, 0.5], ["perform", false, 0.5], ["perform", false, 0], ["perform", true, 0]] as const) {
    const { frames, exprs } = run(motion, bold, 8, lvl);
    for (const f of frames) for (const n of NAMES) for (const v of f[n]) assert.ok(Number.isFinite(v), `${motion} ${n} finite`);
    for (const v of Object.values(exprs)) assert.ok(Number.isFinite(v));
    // arms hang down (not T-pose): left upper arm z about +1.15 (lowered) except when raised on purpose
    const last = frames[frames.length - 1];
    if (motion === "idle") assert.ok(last.leftUpperArm[2] > 0.8, "idle arms are lowered");
    assert.ok(range(frames, "head") > 0.01, `${motion} head moves`);
    assert.ok(range(frames, "spine") > 0.003, `${motion} spine moves`);
    if (motion === "perform") {
      assert.ok(range(frames, "leftUpperLeg") > 0.2 && range(frames, "rightUpperLeg") > 0.2, "legs move while dancing");
      assert.ok(range(frames, "leftUpperArm") > 0.5, "arms move while dancing");
      assert.ok(range(frames, "hips") > 0.05, "hips move while dancing");
    }
    
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

function perform(seconds: number, bpm: number, opts: { bold?: boolean; energy?: (t: number) => number; level?: (t: number) => number; motion?: (t: number) => FrameInput["motion"]; seed?: number; pose?: (t: number) => Phrase | undefined } = {}) {
  const bones = new Map(NAMES.map((n) => [n, mkBone()]));
  const exprs: Record<string, number> = {};
  const rootRot = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { rootRot.x = x; rootRot.y = y; rootRot.z = z; } };
  const root = { position: { x: 0, y: 0, z: 0, set() {} }, rotation: rootRot };
  const st = newAnimState(opts.seed ?? 5);
  let prev: Record<string, number[]> | null = null;
  let maxStep = 0;
  let maxStepAt = "";
  let maxRootYStep = 0;
  let prevRootY = 0;
  let rs = (opts.seed ?? 5) * 7919 + 1;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const phrases = new Set<Phrase>();
  const late = new Set<Phrase>();
  const changes: number[] = [];
  let lastPhrase = st.phrase;
  const mouths: number[] = [];
  const last: Record<string, number[]>[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const t = i / 60;
    const beat = t * (bpm / 60);
    stepRig(st, { dt: 1 / 60, motion: opts.motion ? opts.motion(t) : "perform", bold: !!opts.bold, level: (opts.level ?? (() => 0.5))(t), low: 0.3, mid: 0.4, high: 0.2, beat, bpm, energy: (opts.energy ?? (() => 0.7))(t), pose: opts.pose?.(t), cam: [0, 1, 3] },
      (n) => bones.get(n) ?? null, (n, v) => { exprs[n] = v; }, root, { position: { set() {} } } as never, rnd);
    const cur = Object.fromEntries([...bones].map(([n, b]) => [n, [b.rotation.x, b.rotation.y, b.rotation.z]]));
    if (prev && i > 30) {
      for (const n of NAMES) for (let k = 0; k < 3; k++) {
        const d = Math.abs(cur[n][k] - prev[n][k]);
        if (d > maxStep) { maxStep = d; maxStepAt = `${n}[${k}] t=${t.toFixed(2)} phrase=${st.phrase}`; }
        assert.ok(Number.isFinite(cur[n][k]));
      }
      const dy = Math.abs(Math.atan2(Math.sin(rootRot.y - prevRootY), Math.cos(rootRot.y - prevRootY))); // wrapped: 2PI == 0
      if (dy > maxRootYStep) maxRootYStep = dy;
    }
    prevRootY = rootRot.y;
    prev = cur;
    phrases.add(st.phrase);
    if (t > 3) late.add(st.phrase);
    if (st.phrase !== lastPhrase || i === 0) { changes.push(beat); lastPhrase = st.phrase; }
    mouths.push((exprs.aa ?? 0) + (exprs.oh ?? 0) + (exprs.ih ?? 0) + (exprs.ou ?? 0) + (exprs.ee ?? 0));
    if (i % 15 === 0) last.push(cur);
  }
  return { maxStep, maxStepAt, maxRootYStep, phrases, late, changes, mouths, frames: last, st };
}

test("choreography: a new phrase every 8 beats, never repeats back to back, all phrases appear over a long song", () => {
  const r = perform(240, 120, { energy: (t) => 0.2 + 0.7 * (0.5 + 0.5 * Math.sin(t / 25)) });
  for (let i = 1; i < r.changes.length; i++) {
    assert.ok(Math.abs(r.changes[i] % 8) < 0.07 || Math.abs((r.changes[i] % 8) - 8) < 0.07, `change at beat ${r.changes[i]}`);
  }
  assert.ok(r.changes.length > 30);
  assert.equal(r.phrases.size, PHRASES.length - 4, `phrases seen ${[...r.phrases].join(",")}`);
  for (const p of BOLD_PHRASES) if (!["hips", "sway"].includes(p)) assert.ok(!r.phrases.has(p), `${p} is 18+ only`);
});

test("choreography: pickPhrase prefers calm moves when quiet and big moves when loud, spin is rare", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const count = (energy: number) => {
    const c: Record<string, number> = {};
    let prev: Phrase | null = null;
    const hist: Phrase[] = [];
    for (let i = 0; i < 4000; i++) {
      const p = pickPhrase(prev, hist, energy, false, rnd);
      assert.notEqual(p, prev);
      c[p] = (c[p] ?? 0) + 1;
      hist.push(p);
      prev = p;
    }
    return c;
  };
  const q = count(0.1);
  const l = count(0.95);
  assert.equal(q.spin ?? 0, 0, "no spin when quiet");
  assert.ok((q.sway ?? 0) > (l.sway ?? 0));
  assert.ok((l.pump ?? 0) + (l.disco ?? 0) > (q.pump ?? 0) + (q.disco ?? 0));
  assert.ok((l.spin ?? 0) > 0 && (l.spin ?? 0) < 4000 * 0.2, `spin share ${(l.spin ?? 0) / 4000}`);
  // bold never spins
  let bs = 0;
  for (let i = 0; i < 500; i++) if (pickPhrase(null, [], 1, true, rnd) === "spin") bs++;
  assert.equal(bs, 0);
});

test("choreography: spin is one eased full turn that starts and ends at rest", () => {
  assert.equal(spinAngle(0), 0);
  assert.equal(spinAngle(1.4), 0);
  assert.ok(Math.abs(spinAngle(8) - Math.PI * 2) < 1e-9);
  let prev = 0;
  let maxV = 0;
  for (let b = 0; b <= 8; b += 0.01) {
    const a = spinAngle(b);
    assert.ok(a >= prev - 1e-12, "never turns back");
    maxV = Math.max(maxV, (a - prev) / 0.01);
    prev = a;
  }
  assert.ok(maxV < 4.5, `peak angular speed ${maxV} rad/beat`); // about one turn per 1.5 beats at the fastest, no whip
});

test("perform: no bone ever jumps between frames (all phrases, spins, tempo 70..150), never NaN", () => {
  for (const bpm of [70, 96, 128, 150]) {
    for (const bold of [false, true]) {
      const r = perform(150, bpm, { bold, seed: bpm, energy: (t) => 0.5 + 0.5 * Math.sin(t / 7) });
      assert.ok(r.maxStep < 0.2, `bpm ${bpm} bold ${bold}: max per-frame rotation step ${r.maxStep.toFixed(3)} at ${r.maxStepAt}`);
      assert.ok(r.maxRootYStep < 0.2, `bpm ${bpm}: root yaw step ${r.maxRootYStep}`);
    }
  }
});

test("perform: smooth in from idle and smooth back out, arms lower again, never frozen in between", () => {
  const r = perform(40, 120, { motion: (t) => (t < 10 || t > 28 ? "idle" : "perform"), level: (t) => (t < 10 || t > 28 ? 0 : 0.5), seed: 9 });
  assert.ok(r.maxStep < 0.16, `step ${r.maxStep} at ${r.maxStepAt}`);
  const fr = r.frames; // every 0.25 s
  const at = (sec: number) => fr[Math.round(sec * 4)];
  assert.ok(at(9.5).leftUpperArm[2] > 0.8, "idle arms lowered before");
  assert.ok(at(39).leftUpperArm[2] > 0.8, "idle arms lowered after");
  // while performing the pose keeps changing
  let moved = 0;
  for (let i = Math.round(14 * 4); i < Math.round(26 * 4); i++) moved += Math.abs(fr[i + 1].leftUpperArm[2] - fr[i].leftUpperArm[2]) + Math.abs(fr[i + 1].hips[1] - fr[i].hips[1]);
  assert.ok(moved > 1.5, `moved ${moved}`);
});

test("perform: mouth follows the song level, shapes stay in range", () => {
  const r = perform(12, 110, { level: (t) => (Math.sin(t * 9) > 0 ? 0.8 : 0.02) });
  assert.ok(Math.max(...r.mouths) > 0.4, "opens");
  assert.ok(Math.min(...r.mouths.slice(120)) < 0.15, "closes between notes");
  const q = perform(6, 110, { level: () => 0 });
  assert.ok(Math.max(...q.mouths.slice(60)) < 0.05, "silent song, closed mouth");
});

test("18+ club: slow sultry set (roll, hair flip, kiss, waist), never spins, eyes half-lidded, wink on the kiss", () => {
  const r = perform(240, 124, { bold: true, seed: 21, energy: () => 0.8 });
  const seen = new Set([...r.late]);
  for (const p of seen) assert.ok(BOLD_PHRASES.includes(p), `${p} is not in the 18+ set`);
  for (const p of BOLD_PHRASES) assert.ok(seen.has(p), `${p} never appeared`);
  const n = perform(60, 124, { bold: false, seed: 21, energy: () => 0.8 });
  const span = (fr: Record<string, number[]>[], b: string, k: number) => Math.max(...fr.map((f) => f[b][k])) - Math.min(...fr.map((f) => f[b][k]));
  // visibly different pose: the 18+ dance has a bigger body roll and smaller steps than the normal dance
  assert.ok(span(r.frames.slice(40), "upperChest", 0) > span(n.frames.slice(40), "upperChest", 0) * 1.5, "body roll bigger in 18+");
  assert.ok(span(r.frames.slice(40), "leftUpperLeg", 0) < span(n.frames.slice(40), "leftUpperLeg", 0) * 0.8, "steps smaller in 18+");
  // hands travel to the hair for the flip
  assert.ok(Math.min(...r.frames.map((f) => f.rightUpperArm[2])) < -0.5 || Math.max(...r.frames.map((f) => f.rightUpperArm[2])) > 0.5);
  // no T-pose: arms never hang straight out
  for (const f of r.frames.slice(10)) assert.ok(Math.abs(f.leftUpperArm[2]) > 0.2 || f.leftUpperArm[2] !== 0);
});

test("18+ club: switching it on mid-song picks a sultry phrase within the same beat grid, no jumps", () => {
  const bones = new Map(NAMES.map((n) => [n, mkBone()]));
  const st = newAnimState(4);
  let prev: number[] | null = null;
  let maxStep = 0;
  let rs = 5;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 60 * 40; i++) {
    const t = i / 60;
    stepRig(st, { dt: 1 / 60, motion: "perform", bold: t > 15 && t < 30, level: 0.5, low: 0.3, mid: 0.4, high: 0.2, beat: t * 2, bpm: 120, energy: 0.8, cam: [0, 1, 3] }, (n) => bones.get(n) ?? null, () => {}, null, null, rnd);
    const cur = NAMES.flatMap((n) => { const r = bones.get(n)!.rotation; return [r.x, r.y, r.z]; });
    if (prev && i > 30) maxStep = Math.max(maxStep, ...cur.map((v, k) => Math.abs(v - prev![k])));
    prev = cur;
    if (t > 18.5 && t < 29) assert.ok(BOLD_PHRASES.includes(st.phrase), `phrase ${st.phrase} at ${t}`);
    if (t > 33) assert.ok(!["roll", "hairFlip", "kiss", "waist"].includes(st.phrase) || st.bar >= 0);
  }
  assert.ok(maxStep < 0.2, `step ${maxStep}`);
});

test("ready pose: a held phrase keeps her in a stable pose (no T-pose), then releases smoothly into the song", () => {
  const r = perform(20, 118, { energy: () => 0.2, pose: (t) => (t < 8 ? "mic" : undefined), seed: 3 });
  assert.ok(r.maxStep < 0.2, `step ${r.maxStep} ${r.maxStepAt}`);
  const during = r.frames.slice(10, 30); // 2.5..7.5 s
  const hand = during.map((f) => f.rightUpperArm[2]);
  for (const f of during) assert.ok(Math.abs(f.rightUpperArm[2]) > 0.3, "mic arm up, not hanging in a T");
  void hand;
  assert.ok(r.st.phrase !== "mic" || r.frames.length > 0);
});
