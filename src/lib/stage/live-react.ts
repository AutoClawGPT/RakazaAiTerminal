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
