/**
 * Procedural full-body animation for the Rakaza VRM (no clips needed).
 *
 * Every frame the pose is rebuilt from scratch from a few layers, so nothing accumulates and nothing can
 * freeze or drift:  idle (breathing, weight shift, sway, micro head/eye motion, blinking, finger life)
 *  + talking (nods, hand gestures, vowel-shaped mouth from the audio spectrum)
 *  + singing (mic hand, sway on the beat, held vowels, closed-eye moments)
 *  + dancing (9 choreography phrases of 8 beats on the beat clock, a new one every 8 beats: pump, hands up, hips, point,
 *    arm waves, disco, a single eased spin, sway, mic; each with its own hip / twist / step / body-roll amounts)
 *  + perform (a song is playing: the dance body with the singing face, mouth driven by the song spectrum)
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

/** One performance pipeline: she idles, or performs (dance body + singing face) to the song that is playing. */
export type Motion = "idle" | "perform";
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
  /** 0..1 loudness of the song right now (calmer phrases when quiet, bigger moves when loud) */
  energy?: number;
  /** hold this choreography phrase (the ready pose before a song starts); release it to dance on */
  pose?: Phrase;
};

const TAU = Math.PI * 2;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
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

export const PHRASES = ["pump", "handsUp", "hips", "point", "armWaves", "disco", "spin", "sway", "mic", "roll", "hairFlip", "kiss", "waist"] as const;
export type Phrase = (typeof PHRASES)[number];
/** The 18+ club set: slow, sultry, suggestive but never explicit. */
export const BOLD_PHRASES: readonly Phrase[] = ["hips", "sway", "roll", "hairFlip", "kiss", "waist"];
export const PHRASE_BEATS = 8;
const PI = Math.PI;

/** How much of each body motion a phrase uses (multiplies the base formulas). */
type Body = { hip: number; twist: number; lift: number; bounce: number; bob: number; roll: number };
const BODY: Record<Phrase, Body> = {
  pump: { hip: 0.8, twist: 0.7, lift: 1, bounce: 1.3, bob: 1.2, roll: 0.3 },
  handsUp: { hip: 1.3, twist: 1, lift: 0.8, bounce: 1, bob: 0.8, roll: 0.6 },
  hips: { hip: 1.7, twist: 0.8, lift: 0.5, bounce: 0.8, bob: 0.7, roll: 0.5 },
  point: { hip: 1, twist: 1.2, lift: 1.2, bounce: 1, bob: 1, roll: 0.4 },
  armWaves: { hip: 1, twist: 0.8, lift: 0.8, bounce: 0.9, bob: 1, roll: 1.5 },
  disco: { hip: 0.9, twist: 1.4, lift: 1.3, bounce: 1.1, bob: 1, roll: 0.4 },
  spin: { hip: 0.5, twist: 0.2, lift: 1.4, bounce: 1, bob: 0.6, roll: 0.3 },
  sway: { hip: 1.4, twist: 0.6, lift: 0.4, bounce: 0.6, bob: 1.4, roll: 1.2 },
  mic: { hip: 0.9, twist: 0.8, lift: 0.7, bounce: 0.9, bob: 1.1, roll: 0.6 },
  roll: { hip: 1.9, twist: 0.9, lift: 0.15, bounce: 0.4, bob: 1, roll: 2.4 },
  hairFlip: { hip: 1.6, twist: 0.7, lift: 0.15, bounce: 0.4, bob: 0.5, roll: 1.4 },
  kiss: { hip: 1.5, twist: 0.9, lift: 0.15, bounce: 0.4, bob: 0.8, roll: 1 },
  waist: { hip: 2, twist: 0.7, lift: 0.15, bounce: 0.4, bob: 0.6, roll: 1.8 },
};
const mixBody = (a: Body, b: Body, k: number): Body => ({
  hip: lerp(a.hip, b.hip, k),
  twist: lerp(a.twist, b.twist, k),
  lift: lerp(a.lift, b.lift, k),
  bounce: lerp(a.bounce, b.bounce, k),
  bob: lerp(a.bob, b.bob, k),
  roll: lerp(a.roll, b.roll, k),
});

/** Arms for one phrase at global beat `beat` (`bip` = beats since the phrase started). Returns [left, right] in LEFT-arm terms. */
function phraseArms(p: Phrase, bip: number, beat: number, bold: boolean): [Arm, Arm] {
  const pulse = 0.5 + 0.5 * Math.cos(TAU * beat);
  const alt = Math.sin(PI * beat);
  const wob = (a: Arm, amp: number): Arm => ({ u: [a.u[0], a.u[1], a.u[2] - amp], l: a.l, h: a.h });
  switch (p) {
    case "pump": {
      const l = sat(0.5 + 0.5 * alt);
      return [mixArm(POSES.pump, POSES.pumpHigh, l), mixArm(POSES.pump, POSES.pumpHigh, 1 - l)];
    }
    case "handsUp": {
      const w = Math.sin(PI * beat * 0.5);
      return [wob(mixArm(POSES.upWide, POSES.up, sat(0.5 + 0.5 * w)), 0.12 * pulse), wob(mixArm(POSES.upWide, POSES.up, sat(0.5 - 0.5 * w)), 0.12 * pulse)];
    }
    case "hips": {
      const R = bold ? mixArm(POSES.hip, POSES.hair, smooth(sat(bip / 1.6))) : POSES.hip;
      return [wob(POSES.hip, -0.08 * pulse), R];
    }
    case "point": {
      const q = sat(0.5 + 0.5 * alt);
      return [mixArm(POSES.fwd, POSES.point, q), mixArm(POSES.fwd, POSES.point, 1 - q)];
    }
    case "armWaves": {
      // a wave travelling from one hand to the other: each arm swings between hanging and overhead
      const kl = smooth(sat(0.5 + 0.55 * Math.sin(PI * beat * 0.5)));
      const kr = smooth(sat(0.5 + 0.55 * Math.sin(PI * beat * 0.5 - 1.3)));
      const L = mixArm(POSES.pump, POSES.upWide, kl);
      const R = mixArm(POSES.pump, POSES.upWide, kr);
      L.h[2] += 0.35 * Math.sin(TAU * beat);
      R.h[2] += 0.35 * Math.sin(TAU * beat - 1);
      return [L, R];
    }
    case "disco": {
      // one hand up and out, the other on the hip, switching every 2 beats
      const q = smooth(sat(0.5 + 0.85 * Math.sin(PI * beat * 0.5)));
      const L = mixArm(POSES.hip, POSES.point, q);
      const R = mixArm(POSES.point, POSES.hip, q);
      L.u[2] -= 0.12 * pulse * q;
      R.u[2] -= 0.12 * pulse * (1 - q);
      return [L, R];
    }
    case "spin":
      return [wob(mixArm(POSES.upWide, POSES.up, 0.35), 0.06 * pulse), wob(mixArm(POSES.upWide, POSES.up, 0.35), 0.06 * pulse)];
    case "sway": {
      // slow lighter-wave: both hands rise and fall together overhead
      const k = smooth(sat(0.5 + 0.5 * Math.sin(PI * beat * 0.5)));
      const L = mixArm(POSES.chest, POSES.up, 0.35 + 0.65 * k);
      const R = mixArm(POSES.chest, POSES.up, 0.35 + 0.65 * (1 - k));
      L.h[2] += 0.25 * Math.sin(PI * beat);
      R.h[2] += 0.25 * Math.sin(PI * beat + 1.5);
      return [L, R];
    }
    case "roll": {
      // both hands trail up the body into the hair and slide back down, slowly
      const k = smooth(sat(0.5 + 0.5 * Math.sin(PI * beat * 0.5 - 0.5)));
      const k2 = smooth(sat(0.5 + 0.5 * Math.sin(PI * beat * 0.5 - 1.1)));
      return [mixArm(POSES.hip, POSES.hair, k), mixArm(POSES.hip, POSES.hair, k2)];
    }
    case "hairFlip": {
      // right hand rises into the hair, a flip at beat 3, then back to the hip
      const k = smooth(sat(bip / 1.4)) * (1 - smooth(sat((bip - 5.2) / 1.4)));
      const R = mixArm(POSES.hip, POSES.hair, k);
      R.h[2] += 0.5 * Math.sin(PI * (bip - 2.4) * 1.2) * sat(1 - Math.abs(bip - 3.2) / 1.2) * k;
      return [wob(POSES.hip, -0.08 * pulse), R];
    }
    case "kiss": {
      // 4-beat loop: hand to the lips, hold, blow it out toward the viewer, back
      const c = bip % 4;
      const lips = smooth(sat(c / 0.9)) * (1 - smooth(sat((c - 2.5) / 0.9)));
      const blow = smooth(sat((c - 1.6) / 0.5)) * (1 - smooth(sat((c - 2.3) / 0.7)));
      const R = mixArm(mixArm(POSES.hip, POSES.mic, lips), POSES.fwd, blow * 0.8);
      return [wob(POSES.hip, -0.06 * pulse), R];
    }
    case "waist": {
      // hands travel along the waist: from the hip up the ribs and back, alternating
      const q = smooth(sat(0.5 + 0.5 * Math.sin(PI * beat * 0.5)));
      return [mixArm(POSES.hip, POSES.chest, q * 0.7), mixArm(POSES.hip, POSES.chest, (1 - q) * 0.7)];
    }
    default: {
      // mic: right hand sings into an invisible mic (written as the left-arm pose, mirrored by the caller), left reaches out
      const reach = sat(0.5 + 0.5 * Math.sin(PI * beat * 0.25 - 0.6));
      const L = mixArm(POSES.chest, mixArm(POSES.point, POSES.fwd, 0.4), reach);
      L.u[2] += 0.1 * Math.sin(TAU * beat);
      return [L, POSES.mic];
    }
  }
}

/** Choose the next 8-beat phrase: quiet music prefers sway / hips / arm waves, loud prefers pump / disco / spin; never a repeat. */
export function pickPhrase(prev: Phrase | null, history: Phrase[], energy: number, bold: boolean, rnd: () => number): Phrase {
  const e = clamp01(energy);
  const w: Record<Phrase, number> = {
    pump: 0.5 + 1.4 * e,
    handsUp: 0.7 + 0.9 * e,
    hips: 1.2 - 0.4 * e + (bold ? 0.6 : 0),
    point: 0.8,
    armWaves: 1.3 - 0.5 * e,
    disco: 0.4 + 1.3 * e,
    spin: e > 0.5 && !bold && !history.slice(-3).includes("spin") ? 0.5 + 1.5 * e : 0,
    sway: Math.max(0.2, 1.5 - 1.3 * e) + (bold ? 0.5 : 0),
    mic: 0.9,
    roll: 0,
    hairFlip: 0,
    kiss: 0,
    waist: 0,
  };
  w.roll = bold ? 1.5 : 0;
  w.hairFlip = bold ? 1.2 : 0;
  w.kiss = bold ? 1.1 : 0;
  w.waist = bold ? 1.4 : 0;
  if (bold) for (const p of PHRASES) if (!BOLD_PHRASES.includes(p)) w[p] = 0;
  if (prev) w[prev] = 0;
  for (const h of history.slice(-2)) w[h] *= 0.35;
  let total = 0;
  for (const p of PHRASES) total += Math.max(0, w[p]);
  let r = rnd() * total;
  for (const p of PHRASES) {
    r -= Math.max(0, w[p]);
    if (r <= 0) return p;
  }
  return "handsUp";
}

/** 0..2PI eased turn for the spin phrase: still for 1.5 beats, one full turn over beats 1.5..6.5, then done (2PI == 0 so the next phrase starts clean). */
export function spinAngle(bip: number): number {
  return TAU * smooth(sat((bip - 1.5) / 5));
}

export type AnimState = {
  t: number;
  wDance: number;
  wBold: number;
  wPerf: number;
  /** held phrase (ready pose) and the beat offset of its start */
  forced: Phrase | null;
  barOff: number;
  /** the 18+ set was on at the last phrase change (switching it re-picks right away) */
  boldSet: boolean;
  pickBeat: number;
  repick: boolean;
  /** how far (in beats) the previous phrase had run when it was replaced */
  prevAge: number;
  prevBoldSet: boolean;
  wTalk: number;
  /** choreography state */
  phrase: Phrase;
  prevPhrase: Phrase;
  bar: number;
  history: Phrase[];
  energy: number;
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
    wBold: 0,
    wPerf: 0,
    forced: null,
    barOff: 0,
    boldSet: false,
    pickBeat: -999,
    repick: false,
    prevAge: 8,
    prevBoldSet: false,
    wTalk: 0,
    phrase: "handsUp",
    prevPhrase: "handsUp",
    bar: -999,
    history: [],
    energy: 0.6,
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
  const inp: FrameInput = inp0;
  const dt = Math.min(0.05, Math.max(0, inp.dt));
  s.t += dt;
  const t = s.t + s.seed;
  const ease = (cur: number, to: number, k: number) => cur + (to - cur) * Math.min(1, dt * k);
  const dancing = inp.motion === "perform";
  s.wDance = ease(s.wDance, dancing ? 1 : 0, dancing ? 2 : 1.7); // slow, smooth in and out of idle
  s.wPerf = ease(s.wPerf, inp.motion === "perform" ? 1 : 0, 4);
  s.energy = ease(s.energy, inp.energy ?? 0.6, 2);
  s.wBold = ease(s.wBold, inp.bold ? 1 : 0, 2.5);
  const talkNow = clamp01((inp.level - 0.06) * 6);
  s.wTalk = ease(s.wTalk, talkNow, talkNow > s.wTalk ? 8 : 1.4);
  const wd = smooth(sat(s.wDance)); // eased twice: starts and ends gently
  const wb = s.wBold;
  const wf = s.wPerf; // singing face (mouth, eyes, smile) while performing
  const wt = s.wTalk * (1 - wd * 0.7) * (1 - s.wPerf);
  const bold = wb;
  const beat = inp.beat;
  const BP = TAU * beat; // phase of one beat
  const pulse = 0.5 + 0.5 * Math.cos(BP); // 1 on every beat
  const alt = Math.sin(Math.PI * beat); // side flips every beat
  const alt2 = Math.sin(Math.PI * beat * 0.5); // every two beats
  const tempoScale = lerp(1, 0.78, bold); // bold dance is slower; handled by the caller's bpm, here for amplitude only

  // choreography: a new 8-beat phrase on every bar line of the beat clock
  const bar = Math.floor(Math.max(0, beat) / PHRASE_BEATS);
  if (inp.pose) {
    // ready pose: switch to the held phrase once, blended from where she is, and keep it
    if (s.forced !== inp.pose) {
      s.prevAge = s.bar < 0 ? 8 : Math.min(12, Math.max(0, beat) - s.bar * PHRASE_BEATS - s.barOff);
      s.prevBoldSet = s.boldSet;
      s.prevPhrase = s.bar === -999 ? "handsUp" : s.phrase;
      s.phrase = inp.pose;
      s.forced = inp.pose;
      s.bar = bar;
      s.barOff = Math.max(0, beat) - bar * PHRASE_BEATS;
      s.pickBeat = beat;
    }
  } else {
    if (!s.forced && s.bar !== -999 && s.boldSet !== bold > 0.5) s.repick = true; // 18+ toggled: pick from the other set now
    if (s.forced) {
      s.forced = null; // pose released: pick the first real phrase and blend from the pose
      s.repick = true;
    }
    if (s.repick || (bar !== s.bar && beat - s.pickBeat >= 3)) {
      s.repick = false;
      s.prevBoldSet = s.boldSet;
      s.prevAge = s.bar < 0 ? 8 : Math.min(12, Math.max(0, beat) - s.bar * PHRASE_BEATS - s.barOff);
      s.prevPhrase = s.bar === -999 ? "handsUp" : s.phrase;
      s.phrase = pickPhrase(s.bar === -999 ? null : s.phrase, s.history, s.energy, bold > 0.5, rnd);
      s.history.push(s.phrase);
      if (s.history.length > 8) s.history.shift();
      const into = Math.max(0, beat) - bar * PHRASE_BEATS;
      s.barOff = into > 0.25 ? into : 0; // a pick off the bar line (pose release, 18+ toggle) starts its own phrase clock at 0
      s.pickBeat = beat;
      s.bar = bar;
      s.boldSet = bold > 0.5;
    }
  }
  let bip = Math.max(0, beat) - s.bar * PHRASE_BEATS - s.barOff;
  if (bip > PHRASE_BEATS - 0.01) bip = 2 + ((bip - 2) % (PHRASE_BEATS - 2));
  const pk = smooth(sat(bip / 1.2)); // blend from the previous phrase over about one beat
  const body = mixBody(BODY[s.prevPhrase], BODY[s.phrase], pk);

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

  // ------------------------------------------------------------------ dancing
  if (wd > 0.01) {
    const [cl, cr] = phraseArms(s.phrase, bip, beat, s.boldSet);
    let dl = cl;
    let dr = cr;
    if (pk < 1) {
      const [pl, pr] = phraseArms(s.prevPhrase, bip + s.prevAge, beat, s.prevBoldSet);
      dl = mixArm(pl, cl, pk);
      dr = mixArm(pr, cr, pk);
    }
    L = mixArm(L, dl, wd);
    R = mixArm(R, mir(dr), wd);
    const k = pulse; // knees bend on the beat
    const liftL = Math.max(0, alt);
    const liftR = Math.max(0, -alt);
    const loud = 0.78 + 0.32 * s.energy; // quiet passages are calmer, loud ones bigger
    const amp = wd * lerp(1, 1.35, bold) * loud;
    const B = body;
    // hips and torso: side to side with a twist, a travelling body roll up the spine, bold adds a slow hip circle
    add("hips", amp * (0.03 * Math.sin(BP)), amp * alt2 * 0.34 * tempoScale * B.hip + wb * 0.1 * Math.sin(BP / 2), amp * alt * -0.13 * B.hip + wb * 0.12 * Math.cos(BP / 2));
    add("spine", amp * (-0.05 + 0.05 * pulse), amp * -alt2 * 0.2 * B.twist, amp * (alt * 0.1 + B.roll * 0.07 * Math.sin(BP / 2)));
    add("chest", amp * (0.03 * Math.sin(BP + 1) + B.roll * 0.03 * Math.sin(BP / 2 - 0.8)), amp * -alt2 * 0.22 * B.twist, amp * (alt * -0.05 + B.roll * 0.07 * Math.sin(BP / 2 - 0.7)));
    add("upperChest", amp * B.roll * 0.025 * Math.sin(BP / 2 - 1.4), 0, amp * B.roll * 0.06 * Math.sin(BP / 2 - 1.4));
    add("neck", amp * 0.03, amp * -alt2 * 0.1, 0);
    add("head", amp * (0.05 - 0.09 * pulse * B.bob), amp * alt2 * 0.2, amp * alt * -0.1 * B.bob + wb * 0.1);
    add("leftShoulder", 0, 0, amp * alt * -0.07);
    add("rightShoulder", 0, 0, amp * alt * -0.07);
    // legs: step-touch, the free leg lifts and bends, the standing leg dips with the knee bounce
    const lf = B.lift * clamp(1 - (inp.bpm - 110) * 0.00625, 0.6, 1) * (1 - 0.55 * wb); // fast songs get smaller steps
    add("leftUpperLeg", amp * (0.14 + 0.1 * k * B.bounce + 0.5 * liftL * lf), 0, amp * (-0.07 - 0.08 * liftL * lf));
    add("rightUpperLeg", amp * (0.14 + 0.1 * k * B.bounce + 0.5 * liftR * lf), 0, amp * (0.07 + 0.08 * liftR * lf));
    add("leftLowerLeg", amp * -(0.18 + 0.2 * k * B.bounce + 0.85 * liftL * lf), 0, 0);
    add("rightLowerLeg", amp * -(0.18 + 0.2 * k * B.bounce + 0.85 * liftR * lf), 0, 0);
    add("leftFoot", amp * (0.12 + 0.3 * liftL * lf), 0, 0);
    add("rightFoot", amp * (0.12 + 0.3 * liftR * lf), 0, 0);
  }

  // ------------------------------------------------------------------ bold style (never explicit): sultry sway, hand placement
  if (wb > 0.01) {
    const calm = 1 - wd;
    add("hips", 0, calm * wb * Math.sin(t * 0.9) * 0.1, calm * wb * 0.05);
    add("spine", 0, 0, calm * wb * -0.04);
    add("head", 0, 0, wb * 0.08);
    R = mixArm(R, mir(POSES.hip), wb * calm);
    if (wd > 0.01) {
      // club choreography on top of the dance body: pelvic tilt and a body roll travelling up the spine
      const k = wb * wd;
      add("hips", k * 0.1 * Math.sin(BP / 2), 0, k * 0.06 * Math.cos(BP / 2));
      add("spine", k * 0.09 * Math.sin(BP / 2 - 0.9), 0, 0);
      add("chest", k * 0.11 * Math.sin(BP / 2 - 1.8), 0, 0);
      add("upperChest", k * 0.09 * Math.sin(BP / 2 - 2.6), 0, 0);
      if (s.phrase === "hairFlip") {
        const toss = Math.sin(PI * sat((bip - 2.4) / 1.6)) * pk;
        add("head", k * -0.14 * toss, k * 0.45 * toss, k * -0.35 * toss);
        add("neck", 0, k * 0.15 * toss, k * -0.1 * toss);
      }
      if (s.phrase === "kiss") {
        const c = bip % 4;
        const lean = Math.sin(PI * sat((c - 1.5) / 1.3)) * pk;
        add("head", k * -0.05 * lean, 0, k * 0.2 * lean);
        add("spine", k * -0.05 * lean, 0, 0);
      }
    }
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
  const inPhrase = (p: Phrase) => (s.phrase === p ? pk : 0) + (s.prevPhrase === p && s.phrase !== p ? 1 - pk : 0);
  const fistL = wd * inPhrase("pump");
  const fistR = wd * Math.max(inPhrase("pump"), inPhrase("mic"));
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

  // ------------------------------------------------------------------ root: bounce, drift, turn
  if (root) {
    const bounce = wd * (pulse - 0.5) * 0.045 * lerp(1, 1.2, bold) * body.bounce;
    const dip = wd * -0.035;
    root.position.set(wd * alt2 * 0.06 * tempoScale, dip + bounce + Math.sin(t * 1.9) * 0.002, 0);
    // the spin is only the current phrase's own eased turn (full turn == 0, so the next phrase starts clean)
    const swayK = s.phrase === "spin" ? 1 - sat(bip - 1) * (1 - sat((bip - 6.5) / 1.5)) : 1;
    const spin = s.phrase === "spin" ? spinAngle(bip) * wd : 0;
    root.rotation.set(0, wd * alt2 * 0.22 * swayK + spin + wb * wd * Math.sin(t * 0.8) * 0.08, wd * alt * 0.025);
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
  blink = Math.max(blink, wf * held * 0.5, wb * (0.3 + 0.08 * Math.sin(t * 0.6))); // 18+: half-lidded eyes
  expr("blink", Math.min(1, blink));

  // vowel-shaped mouth from the real spectrum
  const m = s.mouth;
  const lvl = clamp01(inp.level * 1.25);
  const attack = s.wPerf > 0.5 ? 0.9 : 0.7; // song lip-sync is already shaped by lipsync.ts
  const release = s.wPerf > 0.5 ? 0.6 : 0.4;
  m.open += (lvl - m.open) * (lvl > m.open ? attack : release);
  const tot = Math.max(0.0001, inp.low + inp.mid + inp.high);
  const fl = inp.low / tot;
  const fm = inp.mid / tot;
  const fh = inp.high / tot;
  const tgt = { aa: m.open * (0.35 + fm * 1.3), ih: m.open * fh * 0.9, ou: m.open * fl * 0.7, ee: m.open * fh * 0.6, oh: m.open * fl * 0.8 };
  const vib = wf * held * (0.5 + 0.5 * Math.sin(t * 6.5)) * 0.12;
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
  expr("happy", Math.min(1, 0.2 + 0.25 * pulseSmile + (m.open > 0.05 ? 0.08 : 0) + wd * 0.55 + wf * 0.35 + wb * 0.3));
  expr("relaxed", Math.min(1, wb * 0.65 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.25))));

  // playful wink (bold style)
  s.nextWink -= dt;
  const cue = (s.phrase === "kiss" && bip % 4 > 1.7 && bip % 4 < 2) || (s.phrase === "hairFlip" && bip > 3.2 && bip < 3.5);
  if (wb > 0.5 && s.wink < 0 && (cue || s.nextWink <= 0)) {
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
