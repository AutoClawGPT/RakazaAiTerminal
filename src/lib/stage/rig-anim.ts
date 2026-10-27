/**
 * Procedural full-body animation for the Rakaza VRM (no clips needed).
 *
 * Every frame the pose is rebuilt from scratch from a few layers, so nothing accumulates and nothing can
 * freeze or drift:  idle (breathing, weight shift, sway, micro head/eye motion, blinking, finger life)
 *  + talking (nods, hand gestures, vowel-shaped mouth from the audio spectrum)
 *  + singing (mic hand, sway on the beat, held vowels, closed-eye moments)
 *  + dancing (a 16-beat looping choreography on the beat clock: step-touch, arm sections, torso and hip work)
 *  + bold style (age-gated 18+: slower hip work, hand-in-hair, wink; never explicit).
 *
 * Axis notes for VRM 0.x normalised bones (the model faces -Z, her left arm points -X):
 *  - arms: z > 0 lowers the LEFT arm (z < 0 raises it); mirror for the right arm. x > 0 swings an arm forward.
 *  - forearm: left y < 0 bends the elbow forward (mirror: right y > 0).
 *  - upper leg x > 0 lifts the thigh forward; lower leg x < 0 bends the knee.
 *  - head/chest x > 0 leans back, x < 0 bows; y > 0 turns toward her left; z > 0 leans toward her left.
 */

export type V3 = [number, number, number];
type Node3 = { rotation: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => unknown } };
export type BoneGetter = (name: string) => Node3 | null | undefined;
export type ExprSetter = (name: string, v: number) => void;
export type RootLike = { position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => unknown }; rotation: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => unknown } };
export type LookLike = { position: { set: (x: number, y: number, z: number) => unknown } };

export type Motion = "idle" | "sing" | "dance";
export type FrameInput = {
  dt: number;
  motion: Motion;
  bold: boolean;
  /** 0..1 smoothed mouth level from the voice analyser */
  level: number;
  /** spectrum split of the voice: each 0..1 */
  low: number;
  mid: number;
  high: number;
  /** beats since the motion started (continuous) and the tempo */
  beat: number;
  bpm: number;
  /** where the camera is, so her eyes can find the viewer */
  cam: V3;
  /** sing-along mouth when there is no voice audio (voice muted) */
  synth?: boolean;
};

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (x: number) => x * x * (3 - 2 * x);
const sat = (x: number) => Math.min(1, Math.max(0, x));

type Arm = { u: V3; l: V3; h: V3 };
const arm = (ux: number, uy: number, uz: number, lx: number, ly: number, lz: number, hx = 0, hy = 0, hz = 0): Arm => ({ u: [ux, uy, uz], l: [lx, ly, lz], h: [hx, hy, hz] });
/** Poses are written for the LEFT arm; the right arm mirrors y and z. */
export const POSES = {
  down: arm(0, 0, 1.15, 0, 0, 0.12),
  /** both fists up by the shoulders, the "pump" */
  pump: arm(0.45, 0, 0.45, 0, -2.2, 0),
  pumpHigh: arm(0.6, 0, -0.35, 0, -2.0, -0.2),
  /** arms overhead, hands waving */
  up: arm(0.15, 0, -2.45, 0, 0, -0.25),
  upWide: arm(0, 0, -1.55, 0, 0, -0.1),
  /** hand on hip, elbow out */
  hip: arm(-0.2, 0, 0.95, 0, 0, 1.55),
  /** reaching forward */
  fwd: arm(0, -1.25, 0.25, 0, -0.15, 0),
  /** pointing diagonally up and out */
  point: arm(0.5, 0, -0.95, 0, 0, -0.15),
  /** hand up by the mouth like holding a mic */
  mic: arm(0, -0.9, 0.7, 0, -2.15, -0.3),
  /** hand in the hair, behind the head */
  hair: arm(0, 0.3, -1.3, 0, -2.1, 0.2),
  /** hand on the chest */
  chest: arm(0, -0.6, 0.9, 0, -1.9, 0),
  /** hand raised and waving (forearm out in front) */
  wave: arm(0, 0, 0.35, 0, -1.5, 0),
} as const;
export const mixArm = (a: Arm, b: Arm, k: number): Arm => ({
  u: [lerp(a.u[0], b.u[0], k), lerp(a.u[1], b.u[1], k), lerp(a.u[2], b.u[2], k)],
  l: [lerp(a.l[0], b.l[0], k), lerp(a.l[1], b.l[1], k), lerp(a.l[2], b.l[2], k)],
  h: [lerp(a.h[0], b.h[0], k), lerp(a.h[1], b.h[1], k), lerp(a.h[2], b.h[2], k)],
});

/** 16 beats of choreography, 4 sections of 4 beats. Each returns [leftArm, rightArm] for that moment. */
function danceArms(beat: number, bold: boolean): [Arm, Arm] {
  const b = ((beat % 16) + 16) % 16;
  const sec = Math.floor(b / 4);
  const inSec = b - sec * 4;
  const pulse = 0.5 + 0.5 * Math.cos(TAU * beat); // 1 on the beat
  const alt = Math.sin(Math.PI * beat); // flips every beat
  const wob = (a: Arm, k: number, amp: number): Arm => mixArm(a, { ...a, u: [a.u[0], a.u[1], a.u[2] - amp], l: [a.l[0], a.l[1], a.l[2]], h: a.h }, k);
  let L: Arm;
  let R: Arm;
  if (sec === 0) {
    // pump: fists alternate up and down on each beat
    const l = sat(0.5 + 0.5 * alt);
    L = mixArm(POSES.pump, POSES.pumpHigh, l);
    R = mixArm(POSES.pump, POSES.pumpHigh, 1 - l);
  } else if (sec === 1) {
    // hands up, waving side to side with the hips
    const w = Math.sin(Math.PI * beat * 0.5);
    L = mixArm(POSES.upWide, POSES.up, sat(0.5 + 0.5 * w));
    R = mixArm(POSES.upWide, POSES.up, sat(0.5 - 0.5 * w));
    L = wob(L, 1, 0.12 * pulse);
    R = wob(R, 1, 0.12 * pulse);
  } else if (sec === 2) {
    // hips: hands on hips (bold: one hand in the hair)
    L = POSES.hip;
    R = bold ? mixArm(POSES.hip, POSES.hair, smooth(sat(inSec / 0.8))) : POSES.hip;
    L = wob(L, 1, -0.08 * pulse);
  } else {
    // point and clap: arms forward, alternating point up
    const p = sat(0.5 + 0.5 * alt);
    L = mixArm(POSES.fwd, POSES.point, p);
    R = mixArm(POSES.fwd, POSES.point, 1 - p);
  }
  // blend between sections over half a beat so nothing snaps
  const prevSec = (sec + 3) % 4;
  const k = smooth(sat(inSec / 0.5));
  if (k < 1) {
    const [pl, pr] = sectionEnd(prevSec, bold);
    L = mixArm(pl, L, k);
    R = mixArm(pr, R, k);
  }
  return [L, R];
}
function sectionEnd(sec: number, bold: boolean): [Arm, Arm] {
  switch (sec) {
    case 0:
      return [POSES.pump, POSES.pumpHigh];
    case 1:
      return [POSES.upWide, POSES.upWide];
    case 2:
      return [POSES.hip, bold ? POSES.hair : POSES.hip];
    default:
      return [POSES.fwd, POSES.point];
  }
}

export type AnimState = {
  t: number;
  wDance: number;
  wSing: number;
  wBold: number;
  wTalk: number;
  nextBlink: number;
  blink: number;
  doubleBlink: boolean;
  nextWink: number;
  wink: number;
  nextSaccade: number;
  sacc: V3;
  saccTarget: V3;
  mouth: { aa: number; ih: number; ou: number; ee: number; oh: number; open: number };
  smile: number;
  nextSmile: number;
  smileT: number;
  seed: number;
};

export function newAnimState(seed = Math.random() * 100): AnimState {
  return {
    t: 0,
    wDance: 0,
    wSing: 0,
    wBold: 0,
    wTalk: 0,
    nextBlink: 1.4,
    blink: -1,
    doubleBlink: false,
    nextWink: 3,
    wink: -1,
    nextSaccade: 0.8,
    sacc: [0, 0, 0],
    saccTarget: [0, 0, 0],
    mouth: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, open: 0 },
    smile: 0.2,
    nextSmile: 5,
    smileT: -1,
    seed,
  };
}

const FINGERS = ["Index", "Middle", "Ring", "Little"] as const;

/** One frame. Writes every bone it owns from scratch. */
export function stepRig(s: AnimState, inp0: FrameInput, bone: BoneGetter, expr: ExprSetter, root: RootLike | null, look: LookLike | null, rnd: () => number = Math.random) {
  // no voice audio while singing (muted / blocked): sing-along mouth on the beat so she still performs
  const inp: FrameInput = inp0.synth
    ? { ...inp0, level: 0.3 + 0.3 * Math.abs(Math.sin(Math.PI * inp0.beat * 1.5)), low: 0.3, mid: 0.45 + 0.2 * Math.sin(inp0.beat * 2.3), high: 0.2 }
    : inp0;
  const dt = Math.min(0.05, Math.max(0, inp.dt));
  s.t += dt;
  const t = s.t + s.seed;
  const ease = (cur: number, to: number, k: number) => cur + (to - cur) * Math.min(1, dt * k);
  s.wDance = ease(s.wDance, inp.motion === "dance" ? 1 : 0, 3.5);
  s.wSing = ease(s.wSing, inp.motion === "sing" ? 1 : 0, 3.5);
  s.wBold = ease(s.wBold, inp.bold ? 1 : 0, 2.5);
  const talkNow = clamp01((inp.level - 0.06) * 6);
  s.wTalk = ease(s.wTalk, talkNow, talkNow > s.wTalk ? 8 : 1.4);
  const wd = s.wDance;
  const ws = s.wSing;
  const wb = s.wBold;
  const wt = s.wTalk * (1 - wd * 0.7);
  const wi = 1 - Math.max(wd, ws);
  const bold = wb;
  const beat = inp.beat;
  const BP = TAU * beat; // phase of one beat
  const pulse = 0.5 + 0.5 * Math.cos(BP); // 1 on every beat
  const alt = Math.sin(Math.PI * beat); // side flips every beat
  const alt2 = Math.sin(Math.PI * beat * 0.5); // every two beats
  const tempoScale = lerp(1, 0.78, bold); // bold dance is slower; handled by the caller's bpm, here for amplitude only

  const acc = new Map<string, V3>();
  const get = (n: string): V3 => {
    let v = acc.get(n);
    if (!v) {
      v = [0, 0, 0];
      acc.set(n, v);
    }
    return v;
  };
  const add = (n: string, x: number, y: number, z: number) => {
    const v = get(n);
    v[0] += x;
    v[1] += y;
    v[2] += z;
  };
  const setv = (n: string, v: V3) => {
    const a = get(n);
    a[0] = v[0];
    a[1] = v[1];
    a[2] = v[2];
  };

  // ------------------------------------------------------------------ idle (always on, never still)
  const br = Math.sin(t * 1.9);
  const br2 = Math.sin(t * 1.9 + 0.8);
  add("spine", -0.012 + br * 0.012, Math.sin(t * 0.41) * 0.025, Math.sin(t * 0.55) * 0.022);
  add("chest", 0.015 + br * 0.02, Math.sin(t * 0.47 + 1) * 0.02, Math.sin(t * 0.52 + 2) * 0.012);
  add("upperChest", br2 * 0.012, 0, 0);
  add("hips", 0, Math.sin(t * 0.33) * 0.03, Math.sin(t * 0.55 + 0.7) * -0.012);
  add("neck", Math.sin(t * 0.7) * 0.02, Math.sin(t * 0.43) * 0.05, Math.sin(t * 0.5) * 0.02);
  add("head", Math.sin(t * 0.9) * 0.018 + Math.sin(t * 2.3) * 0.004, Math.sin(t * 0.37) * 0.05 + Math.sin(t * 1.7) * 0.01, Math.sin(t * 0.61) * 0.02);
  // shoulders breathe
  add("leftShoulder", 0, 0, -br * 0.015);
  add("rightShoulder", 0, 0, br * 0.015);
  // arms hang in a relaxed A pose with a lazy sway
  const aL: Arm = {
    u: [Math.sin(t * 0.8) * 0.03, Math.sin(t * 0.6) * 0.03, POSES.down.u[2] + Math.sin(t * 1.9 + 0.6) * 0.02],
    l: [0, Math.sin(t * 0.9 + 1) * 0.06 - 0.05, POSES.down.l[2] + Math.sin(t * 1.1) * 0.03],
    h: [Math.sin(t * 1.3) * 0.05, 0, Math.sin(t * 0.9) * 0.05],
  };
  const aR: Arm = {
    u: [Math.sin(t * 0.8 + 1.3) * 0.03, -Math.sin(t * 0.6 + 0.7) * 0.03, -(POSES.down.u[2] + Math.sin(t * 1.9 + 0.9) * 0.02)],
    l: [0, -(Math.sin(t * 0.9 + 2) * 0.06 - 0.05), -(POSES.down.l[2] + Math.sin(t * 1.1 + 1) * 0.03)],
    h: [Math.sin(t * 1.3 + 1) * 0.05, 0, -Math.sin(t * 0.9 + 2) * 0.05],
  };
  let L: Arm = aL;
  let R: Arm = aR;
  const mir = (a: Arm): Arm => ({ u: [a.u[0], -a.u[1], -a.u[2]], l: [a.l[0], -a.l[1], -a.l[2]], h: [a.h[0], -a.h[1], -a.h[2]] });

  // ------------------------------------------------------------------ talking gestures (additive on the idle arms)
  if (wt > 0.01) {
    const g1 = Math.sin(t * 3.1) * 0.5 + 0.5;
    const g2 = Math.sin(t * 2.3 + 1) * 0.5 + 0.5;
    const gl = wt * inp.level;
    L = mixArm(L, arm(0.55, 0, 0.75, 0, -0.9, 0.12), sat(gl * g1 * 1.3));
    R = mixArm(R, mir(arm(0.45, 0, 0.7, 0, -1.1, 0.1)), sat(gl * g2 * 1.1));
    add("head", -wt * inp.level * 0.07 * Math.max(0, Math.sin(t * 5.3)) + wt * Math.sin(t * 2.2) * 0.02, Math.sin(t * 1.9) * 0.03 * wt, Math.sin(t * 1.4) * 0.03 * wt);
    add("chest", wt * inp.level * 0.03 * Math.sin(t * 4.1), 0, 0);
  }

  // ------------------------------------------------------------------ singing
  if (ws > 0.01) {
    const sway = Math.sin(BP / 2);
    const held = clamp01((inp.level - 0.12) * 3.2);
    // right hand holds an invisible mic, left hand swings and reaches on the beat
    R = mixArm(R, mir(POSES.mic), ws);
    const reach = sat(0.5 + 0.5 * Math.sin(BP / 4 - 0.6));
    const lSing = mixArm(POSES.chest, mixArm(POSES.point, POSES.fwd, 0.4), reach);
    lSing.u[2] += 0.12 * Math.sin(BP);
    L = mixArm(L, lSing, ws);
    add("hips", 0, ws * sway * 0.12, ws * sway * -0.05);
    add("spine", ws * -0.04, ws * sway * -0.1, ws * sway * 0.06);
    add("chest", ws * (0.02 + 0.06 * held), ws * sway * -0.1, ws * sway * 0.05);
    add("neck", ws * (-0.02 + 0.1 * held), 0, 0);
    add("head", ws * (0.05 + 0.14 * held) + ws * -0.05 * pulse, ws * sway * 0.14, ws * Math.sin(BP / 2 + 0.6) * 0.1);
    add("leftUpperLeg", ws * 0.04, 0, 0);
    add("rightUpperLeg", ws * 0.04, 0, 0);
  }

  // ------------------------------------------------------------------ dancing
  if (wd > 0.01) {
    const [dl, dr] = danceArms(beat, bold > 0.5);
    L = mixArm(L, dl, wd);
    R = mixArm(R, mir(dr), wd);
    const k = pulse; // knees bend on the beat
    const liftL = Math.max(0, alt);
    const liftR = Math.max(0, -alt);
    const amp = wd * lerp(1, 1.35, bold);
    // hips and torso: side to side with a twist, bold adds a slow hip circle
    add("hips", amp * (0.03 * Math.sin(BP)), amp * alt2 * 0.34 * tempoScale + wb * 0.1 * Math.sin(BP / 2), amp * alt * -0.13 + wb * 0.12 * Math.cos(BP / 2));
    add("spine", amp * (-0.05 + 0.05 * pulse), amp * -alt2 * 0.2, amp * alt * 0.1);
    add("chest", amp * (0.03 * Math.sin(BP + 1)), amp * -alt2 * 0.22, amp * alt * -0.05);
    add("neck", amp * 0.03, amp * -alt2 * 0.1, 0);
    add("head", amp * (0.05 - 0.09 * pulse), amp * alt2 * 0.2, amp * alt * -0.1 + wb * 0.1);
    add("leftShoulder", 0, 0, amp * alt * -0.07);
    add("rightShoulder", 0, 0, amp * alt * -0.07);
    // legs: step-touch, the free leg lifts and bends, the standing leg dips with the knee bounce
    add("leftUpperLeg", amp * (0.14 + 0.1 * k + 0.5 * liftL), 0, amp * (-0.07 - 0.08 * liftL));
    add("rightUpperLeg", amp * (0.14 + 0.1 * k + 0.5 * liftR), 0, amp * (0.07 + 0.08 * liftR));
    add("leftLowerLeg", amp * -(0.18 + 0.2 * k + 0.85 * liftL), 0, 0);
    add("rightLowerLeg", amp * -(0.18 + 0.2 * k + 0.85 * liftR), 0, 0);
    add("leftFoot", amp * (0.12 + 0.3 * liftL), 0, 0);
    add("rightFoot", amp * (0.12 + 0.3 * liftR), 0, 0);
  }

  // ------------------------------------------------------------------ bold style (never explicit): sultry sway, hand placement
  if (wb > 0.01) {
    const calm = 1 - wd;
    add("hips", 0, calm * wb * Math.sin(t * 0.9) * 0.1, calm * wb * 0.05);
    add("spine", 0, 0, calm * wb * -0.04);
    add("head", 0, 0, wb * 0.08);
    R = mixArm(R, mir(POSES.hip), wb * calm * (1 - ws));
  }

  // ------------------------------------------------------------------ write arms and fingers
  const writeArm = (side: "left" | "right", a: Arm) => {
    setv(`${side}UpperArm`, a.u);
    setv(`${side}LowerArm`, a.l);
    setv(`${side}Hand`, a.h);
  };
  writeArm("left", L);
  writeArm("right", R);
  // fingers: relaxed curl that breathes, tighter into a fist while pumping or holding the mic
  const fistL = wd * (Math.floor(((beat % 16) + 16) % 16 / 4) === 0 ? 1 : 0) + ws * 0.3;
  const fistR = wd * (Math.floor(((beat % 16) + 16) % 16 / 4) === 0 ? 1 : 0) + ws * 0.9;
  for (const side of ["left", "right"] as const) {
    const sg = side === "left" ? 1 : -1;
    const fist = side === "left" ? fistL : fistR;
    FINGERS.forEach((f, i) => {
      const cur = 0.28 + 0.07 * Math.sin(t * 0.8 + i * 0.7) + fist * 0.6;
      add(`${side}${f}Proximal`, 0, 0, sg * cur);
      add(`${side}${f}Intermediate`, 0, 0, sg * (cur * 1.1 + 0.05));
      add(`${side}${f}Distal`, 0, 0, sg * (cur * 0.8));
    });
    add(`${side}ThumbMetacarpal`, 0, 0, 0);
  }

  // ------------------------------------------------------------------ commit bones
  for (const [name, v] of acc) {
    const n = bone(name);
    if (n) n.rotation.set(v[0], v[1], v[2]);
  }
  void wi;

  // ------------------------------------------------------------------ root: bounce, drift, turn
  if (root) {
    const bounce = wd * (pulse - 0.5) * 0.045 * lerp(1, 1.2, bold);
    const dip = wd * -0.035 - ws * 0.005;
    root.position.set(wd * alt2 * 0.06 * tempoScale + ws * Math.sin(t * 1.1) * 0.015, dip + bounce + Math.sin(t * 1.9) * 0.002, 0);
    root.rotation.set(0, wd * alt2 * 0.22 + ws * Math.sin(t * 0.9) * 0.1 + wb * Math.sin(t * 0.8) * 0.08, wd * alt * 0.025);
  }

  // ------------------------------------------------------------------ eyes: gaze finds the viewer, saccades, blinking
  s.nextSaccade -= dt;
  if (s.nextSaccade <= 0) {
    s.nextSaccade = 0.5 + rnd() * 2.2;
    s.saccTarget = [(rnd() - 0.5) * 0.34, (rnd() - 0.5) * 0.18, 0];
  }
  s.sacc[0] = ease(s.sacc[0], s.saccTarget[0], 14);
  s.sacc[1] = ease(s.sacc[1], s.saccTarget[1], 14);
  if (look) {
    look.position.set(inp.cam[0] * 0.5 + s.sacc[0] + Math.sin(t * 0.8) * 0.08 + wd * alt2 * 0.2, inp.cam[1] + s.sacc[1] + Math.sin(t * 0.6) * 0.04, inp.cam[2]);
  }

  // ------------------------------------------------------------------ expressions
  s.nextBlink -= dt;
  if (s.nextBlink <= 0 && s.blink < 0) {
    s.blink = 0;
    s.doubleBlink = rnd() < 0.18;
    s.nextBlink = 1.8 + rnd() * 3.4;
  }
  let blink = 0;
  if (s.blink >= 0) {
    s.blink += dt;
    const k = s.blink / 0.16;
    blink = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2);
    if (k >= 1) {
      if (s.doubleBlink) {
        s.blink = 0;
        s.doubleBlink = false;
      } else s.blink = -1;
    }
  }
  // singing: eyes soften and close on held notes
  const held = clamp01((inp.level - 0.2) * 3);
  blink = Math.max(blink, ws * held * 0.55);
  expr("blink", Math.min(1, blink));

  // vowel-shaped mouth from the real spectrum
  const m = s.mouth;
  const lvl = clamp01(inp.level * 1.25);
  const attack = ws > 0.5 ? 0.55 : 0.7;
  const release = ws > 0.5 ? 0.22 : 0.4;
  m.open += (lvl - m.open) * (lvl > m.open ? attack : release);
  const tot = Math.max(0.0001, inp.low + inp.mid + inp.high);
  const fl = inp.low / tot;
  const fm = inp.mid / tot;
  const fh = inp.high / tot;
  const tgt = { aa: m.open * (0.35 + fm * 1.3), ih: m.open * fh * 0.9, ou: m.open * fl * 0.7, ee: m.open * fh * 0.6, oh: m.open * fl * 0.8 };
  const vib = ws * held * (0.5 + 0.5 * Math.sin(t * 6.5)) * 0.12;
  (Object.keys(tgt) as (keyof typeof tgt)[]).forEach((k) => {
    m[k] += (tgt[k] - m[k]) * 0.5;
  });
  expr("aa", Math.min(1, m.aa * 0.95 + vib));
  expr("ih", Math.min(1, m.ih));
  expr("ou", Math.min(1, m.ou));
  expr("ee", Math.min(1, m.ee * 0.7));
  expr("oh", Math.min(1, m.oh));

  // smile: always a soft one, a bigger one now and then, full on while dancing or singing
  s.nextSmile -= dt;
  if (s.nextSmile <= 0 && s.smileT < 0) {
    s.smileT = 0;
    s.nextSmile = 5 + rnd() * 6;
  }
  let pulseSmile = 0;
  if (s.smileT >= 0) {
    s.smileT += dt;
    const k = s.smileT / 2.2;
    pulseSmile = Math.sin(Math.min(1, k) * Math.PI);
    if (k >= 1) s.smileT = -1;
  }
  expr("happy", Math.min(1, 0.2 + 0.25 * pulseSmile + (m.open > 0.05 ? 0.08 : 0) + wd * 0.55 + ws * 0.35 + wb * 0.3));
  expr("relaxed", Math.min(1, wb * 0.45 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.25))));

  // playful wink (bold style)
  s.nextWink -= dt;
  if (wb > 0.5 && s.nextWink <= 0 && s.wink < 0) {
    s.wink = 0;
    s.nextWink = 3.5 + rnd() * 4;
  }
  let wk = 0;
  if (s.wink >= 0) {
    s.wink += dt;
    const k = s.wink / 0.7;
    wk = k < 0.2 ? k / 0.2 : k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    if (k >= 1) s.wink = -1;
  }
  expr("blinkRight", wk);
}
