/**
 * Sigmond-style call reactions for the VRM, layered additively on top of the idle rig each frame:
 *  listening: head tilts toward the viewer, small nods, attentive eyes
 *  thinking:  glance up and to the side, hand drifts toward the chin, slight frown-free "hmm"
 *  talking:   lip-sync comes from the audio bus; here we add beat-free conversational hand/head gestures driven by voice level
 *  idle:      nothing extra (the base rig already breathes and sways)
 * Pure function of (mode, time, level), so it is cheap and testable.
 */
import type { AvatarMode } from "@/lib/live/live-state";

type Node = { rotation: { x: number; y: number; z: number } } | null | undefined;

const W = { listening: 0, thinking: 0, talking: 0 };

export function liveReact(mode: AvatarMode, t: number, level: number, bone: (n: string) => Node, expr: (n: string, v: number) => void) {
  for (const k of ["listening", "thinking", "talking"] as const) W[k] += ((mode === k ? 1 : 0) - W[k]) * 0.12;
  for (const k of ["listening", "thinking", "talking"] as const) if (W[k] > 0.01) apply(k, W[k], t, level, bone, expr);
}

function apply(mode: Exclude<AvatarMode, "idle">, w: number, t: number, level: number, bone: (n: string) => Node, expr: (n: string, v: number) => void) {
  const head = bone("head");
  const neck = bone("neck");
  const rUp = bone("rightUpperArm");
  const rLo = bone("rightLowerArm");
  const lUp = bone("leftUpperArm");
  const lLo = bone("leftLowerArm");
  if (mode === "listening") {
    if (head) {
      head.rotation.z += w * (0.12);
      head.rotation.x += w * (0.05 + 0.04 * Math.sin(t * 3.2));
    }
    expr("happy", w * (0.25));
  } else if (mode === "thinking") {
    if (head) {
      head.rotation.x -= w * (0.14);
      head.rotation.y += w * (0.2 + 0.03 * Math.sin(t * 1.3));
    }
    if (neck) neck.rotation.z -= w * (0.05);
    if (rUp) rUp.rotation.z += w * (0.9);
    if (rLo) rLo.rotation.y += w * (1.6);
    expr("lookUp", w * (0.5));
  } else if (mode === "talking") {
    const g = Math.min(1, level * 1.4);
    if (head) {
      head.rotation.y += w * (0.08 * Math.sin(t * 2.1) * (0.4 + g));
      head.rotation.x += w * (0.05 * Math.sin(t * 3.7) * g);
    }
    if (rUp) rUp.rotation.z += w * (0.35 * g + 0.15 * Math.sin(t * 1.7));
    if (rLo) rLo.rotation.y += w * (0.6 * g);
    if (lUp) lUp.rotation.z -= w * (0.25 * g * (0.5 + 0.5 * Math.sin(t * 1.1 + 1)));
    if (lLo) lLo.rotation.y -= w * (0.4 * g);
    expr("happy", w * (0.15 + 0.2 * g));
  }
}

/* ── news-anchor desk behaviour (variant "desk") ───────────────────────────────── */
type V = [number, number, number];
/** Arms resting forward on the desk (left arm values; the right arm mirrors y and z). Tuned on screenshots. */
export const DESK_ARM = { u: [0.25, -0.35, 1.2] as V, l: [0, -1.05, 0] as V, h: [0, 0, 0] as V };
const DW = { listening: 0, thinking: 0, talking: 0 };
const setRot = (n: Node, v: V, k = 1) => {
  if (!n) return;
  n.rotation.x += (v[0] - n.rotation.x) * k;
  n.rotation.y += (v[1] - n.rotation.y) * k;
  n.rotation.z += (v[2] - n.rotation.z) * k;
};

/**
 * Behind the desk: arms rest on the desk, idle glances at the laptop, nods while listening,
 * types on the laptop while thinking, and gestures with her hands while talking. Blinks and breathing come from the base rig.
 */
export function deskReact(mode: AvatarMode, t: number, level: number, bone: (n: string) => Node, expr: (n: string, v: number) => void) {
  for (const k of ["listening", "thinking", "talking"] as const) DW[k] += ((mode === k ? 1 : 0) - DW[k]) * 0.1;
  const head = bone("head");
  const neck = bone("neck");
  const g = Math.min(1, level * 1.4);
  for (const side of ["left", "right"] as const) {
    const sg = side === "left" ? 1 : -1;
    const up = bone(`${side}UpperArm`);
    const lo = bone(`${side}LowerArm`);
    const hand = bone(`${side}Hand`);
    // typing: small alternating finger-tap motion of the forearms (laptop is on her left... viewer's right = her right hand side)
    const type = DW.thinking * (0.06 * Math.sin(t * 14 + (sg > 0 ? 0 : 1.7)));
    // talking: hands lift off the desk and open on the voice (right hand more)
    const talk = DW.talking * (side === "right" ? 0.55 * g + 0.18 * Math.sin(t * 1.6) : 0.3 * g * (0.5 + 0.5 * Math.sin(t * 1.1 + 1)));
    setRot(up, [DESK_ARM.u[0] + talk * 0.6, sg * DESK_ARM.u[1], sg * (DESK_ARM.u[2] - talk * 0.5)]);
    setRot(lo, [DESK_ARM.l[0], sg * (DESK_ARM.l[1] - talk * 0.6 + type * 2), sg * (DESK_ARM.l[2] + talk * 0.3)]);
    setRot(hand, [type * 3, 0, sg * (0.2 + talk * 0.5)]);
  }
  // idle: glance at the laptop (her right, viewer's left... laptop sits at +x world = her left) every few seconds
  const cyc = (t % 9) / 9;
  const glance = mode === "idle" ? Math.max(0, Math.sin(Math.min(1, Math.max(0, (cyc - 0.6) / 0.3)) * Math.PI)) : 0;
  const lookLaptop = Math.max(glance, DW.thinking);
  if (head) {
    head.rotation.x += 0.22 * lookLaptop + DW.listening * (0.06 + 0.07 * Math.max(0, Math.sin(t * 3.4)));
    head.rotation.y += 0.38 * lookLaptop + DW.talking * 0.07 * Math.sin(t * 2.1) * (0.4 + g);
    head.rotation.z += DW.listening * 0.1;
  }
  if (neck) neck.rotation.y += 0.12 * lookLaptop;
  expr("happy", DW.listening * 0.25 + DW.talking * (0.15 + 0.2 * g));
}
