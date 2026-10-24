import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * A launch approval is a short-lived signed ticket bound to the exact plan the owner saw.
 * Change anything in the plan (name, split, wallet, dev buy, network) and the ticket stops matching.
 */
export interface LaunchPlan {
  network: "devnet" | "mainnet-beta";
  mode: "own-wallet" | "sponsored";
  creator: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  devBuySol: number;
  shareholders: { address: string; shareBps: number }[];
}

const TTL_MS = 10 * 60 * 1000;
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function planHash(p: LaunchPlan): string {
  const canon = JSON.stringify({ ...p, shareholders: [...p.shareholders].sort((a, b) => a.address.localeCompare(b.address)) });
  return createHash("sha256").update(canon).digest("hex");
}

export function signApproval(plan: LaunchPlan, secret: string, now = Date.now()): string {
  if (secret.length < 32) throw new Error("SESSION_SECRET too short");
  const payload = b64(JSON.stringify({ h: planHash(plan), exp: now + TTL_MS }));
  return `${payload}.${b64(createHmac("sha256", secret).update(`launch:${payload}`).digest())}`;
}

export function verifyApproval(token: string | undefined, plan: LaunchPlan, secret: string | undefined, now = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (!token || !secret || secret.length < 32) return { ok: false, reason: "No approval ticket." };
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return { ok: false, reason: "Malformed approval ticket." };
  const want = createHmac("sha256", secret).update(`launch:${payload}`).digest();
  let got: Buffer;
  try { got = Buffer.from(mac, "base64url"); } catch { return { ok: false, reason: "Malformed approval ticket." }; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "Approval ticket is not valid." };
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { h?: string; exp?: number };
    if (typeof p.exp !== "number" || p.exp < now) return { ok: false, reason: "Approval expired. Prepare the launch again." };
    if (p.h !== planHash(plan)) return { ok: false, reason: "The plan changed after you approved it." };
    return { ok: true };
  } catch { return { ok: false, reason: "Malformed approval ticket." }; }
}

/** Caps the owner sets in env. Returns an error string, or null when the plan is within limits. */
export function checkCaps(plan: LaunchPlan, caps: { maxLaunchSol: number; spentTodaySol: number; maxDailySol: number }): string | null {
  const estimated = plan.devBuySol + 0.03; // rent, fees and priority fee, rounded up
  if (estimated > caps.maxLaunchSol) return `This launch needs about ${estimated.toFixed(3)} SOL, over the per-launch cap of ${caps.maxLaunchSol} SOL.`;
  if (caps.spentTodaySol + estimated > caps.maxDailySol) return `This would pass the daily cap of ${caps.maxDailySol} SOL.`;
  return null;
}
