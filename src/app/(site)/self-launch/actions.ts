"use server";
import { PublicKey } from "@solana/web3.js";
import { isSelfLaunchEnabled } from "@/lib/execute-gate";
import { allow, clientIp } from "@/lib/rate";
import { generateImage } from "@/lib/pollinations";
import { vampScan, type VampResult } from "@/lib/launch/vamp";
import { analyzeAndDraft, flagRisk, type AutoDraft, type FlagRisk } from "@/lib/launch/auto";
import { pinImage, pinMetadata, PinError } from "@/lib/launch/pin";
import { LaunchBuildError } from "@/lib/launch/build-tx";
import type { LaunchPlan } from "@/lib/launch/approval";
import { LaunchExecError } from "@/lib/launch/execute";
import { selfPrepare, selfTx, selfRelay, SelfLaunchError, type Breakdown, type SelfStep, type SelfRelayResult } from "@/lib/launch/self-launch";
import { RelayError } from "@/lib/launch/relay";
import { isSolanaAddress } from "@/lib/tools/address";

/**
 * PUBLIC self-launch actions: anyone may call them, so every one is size-limited and rate-limited (per IP, per wallet where it matters, and globally).
 * Nothing here signs, nothing spends treasury funds and there is no owner session: the user's own wallet is the creator and pays every fee.
 * The same pipeline as the owner Agent launch (Vamp scan, River, risk, Pollinations, Pinata), with caps so the platform's River, Pollinations and Pinata quotas cannot be burned.
 * EXECUTE_ENABLED does not apply here (it guards the sponsored path); isSelfLaunchEnabled() does.
 */
type Fail = { ok: false; error: string };

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_DEV_BUY_SOL = 50;
const isPk = (s: unknown): s is string => { try { return typeof s === "string" && s.length <= 44 && new PublicKey(s).toBase58() === s; } catch { return false; } };
const httpsOrEmpty = (v: unknown): string | undefined => (typeof v === "string" && /^https:\/\/[^\s]{3,200}$/.test(v.trim()) ? v.trim() : undefined);
const BUSY = "You are going a bit fast. Wait a minute and try again.";

async function gate(scope: string, max: number, n: number, unit: "s" | "m" | "h", globalMax?: number): Promise<Fail | null> {
  if (!isSelfLaunchEnabled()) return { ok: false, error: "Self launch is switched off on this server." };
  const ip = await clientIp();
  if (!(await allow(scope, ip, max, n, unit))) return { ok: false, error: BUSY };
  if (globalMax && !(await allow(`${scope}-all`, "all", globalMax, n, unit))) return { ok: false, error: "The launchpad is busy right now. Try again in a few minutes." };
  return null;
}

/** Step 2: Vamp Radar and Shield scan of the token the user pasted. */
export async function publicScanAction(mint: string): Promise<{ ok: true; result: VampResult } | Fail> {
  const g = await gate("pl-scan", 8, 10, "m", 300);
  if (g) return g;
  const m = String(mint ?? "").trim();
  if (!isSolanaAddress(m)) return { ok: false, error: "That is not a valid Solana address." };
  try { return await vampScan(m); } catch { return { ok: false, error: "The scan failed to run. Try again in a moment." }; }
}

/** Step 3: River studies the flagged tokens and drafts the new token. The scan is re-run on the server so nobody can feed River forged facts. 12 calls per hour per IP (a full run uses up to 3). */
export async function publicAnalyzeAction(mint: string, avoid: string[] = []): Promise<{ ok: true; draft: AutoDraft } | Fail> {
  const g = await gate("pl-analyze", 12, 1, "h", 240);
  if (g) return g;
  const m = String(mint ?? "").trim();
  if (!isSolanaAddress(m)) return { ok: false, error: "That is not a valid Solana address." };
  let v: Awaited<ReturnType<typeof vampScan>>;
  try { v = await vampScan(m); } catch { return { ok: false, error: "The scan failed to run. Try again in a moment." }; }
  if (!v.ok) return v;
  const safeAvoid = (Array.isArray(avoid) ? avoid : []).filter((x) => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 12);
  try { return { ok: true, draft: await analyzeAndDraft(v.result, safeAvoid) }; } catch { return { ok: false, error: "The analysis failed to run. Try again in a moment." }; }
}

/** Step 4: how likely is the new name and ticker to be flagged as a copy? */
export async function publicRiskAction(name: string, ticker: string): Promise<{ ok: true; risk: FlagRisk } | Fail> {
  const g = await gate("pl-risk", 30, 1, "h", 600);
  if (g) return g;
  try {
    const r = await flagRisk(String(name ?? "").slice(0, 40), String(ticker ?? "").slice(0, 12));
    return r.ok ? { ok: true, risk: r.risk } : r;
  } catch { return { ok: false, error: "The copycat check failed to run. Try again in a moment." }; }
}

/**
 * Step 5: Pollinations FLUX image. The platform pays for it, so it is capped: 4 per wallet and 6 per IP per 24 hours, 300 per day for everybody.
 * A user can always upload their own picture instead, which costs nothing.
 */
export async function publicImageAction(prompt: string, wallet: string): Promise<{ ok: true; dataUrl: string; ms: number } | Fail> {
  const g = await gate("pl-image", 6, 24, "h", 300);
  if (g) return g;
  if (!isPk(wallet)) return { ok: false, error: "Connect your wallet first." };
  if (!(await allow("pl-image-w", wallet, 4, 24, "h"))) return { ok: false, error: "You used today's free image generations for this wallet. Upload your own picture instead, it is free and has no limit." };
  const p = String(prompt ?? "").trim().slice(0, 300);
  if (p.length < 5) return { ok: false, error: "Describe the image in a few words first." };
  try {
    const r = await generateImage(p, { size: "512x512" });
    if (!r.ok) return { ok: false, error: "The image service did not answer. Try again, or upload your own picture." };
    return { ok: true, dataUrl: `data:${r.mime};base64,${r.b64}`, ms: r.ms };
  } catch { return { ok: false, error: "The image service did not answer. Try again, or upload your own picture." }; }
}

function sniff(b: Buffer, mime: string): boolean {
  if (mime === "image/png") return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
  if (mime === "image/webp") return b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  return false;
}

export interface PublicPinInput { name: string; ticker: string; description: string; imageDataUrl: string; links?: { website?: string; twitter?: string; telegram?: string } }

/** Step 6: the image, then the metadata JSON, to IPFS through Pinata (server side, the key never reaches the browser). 12 per hour per IP. */
export async function publicPinAction(input: PublicPinInput): Promise<{ ok: true; imageUrl: string; uri: string } | Fail> {
  const g = await gate("pl-pin", 12, 1, "h", 300);
  if (g) return g;
  try {
    if (!input || typeof input !== "object") return { ok: false, error: "Bad request." };
    const name = String(input.name ?? "").trim(), ticker = String(input.ticker ?? "").trim().toUpperCase();
    const description = String(input.description ?? "").trim();
    if (name.length < 1 || name.length > 32) return { ok: false, error: "The name must be 1 to 32 characters." };
    if (!/^[A-Z0-9]{2,10}$/.test(ticker)) return { ok: false, error: "The ticker must be 2 to 10 letters or digits." };
    if (description.length > 280) return { ok: false, error: "The description is limited to 280 characters." };
    const data = typeof input.imageDataUrl === "string" && input.imageDataUrl.length < MAX_IMAGE_BYTES * 1.4 ? input.imageDataUrl : "";
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!m) return { ok: false, error: "Add an image first (generate one or upload one). It must be PNG, JPEG or WebP under 1.5 MB." };
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !sniff(bytes, m[1])) return { ok: false, error: "That image is not a valid PNG, JPEG or WebP under 1.5 MB." };
    const links = { website: httpsOrEmpty(input.links?.website), twitter: httpsOrEmpty(input.links?.twitter), telegram: httpsOrEmpty(input.links?.telegram) };
    const img = await pinImage(Uint8Array.from(bytes), `${ticker.toLowerCase()}.${m[1].split("/")[1]}`, m[1]);
    const meta = await pinMetadata({ name, symbol: ticker, description, image: img.url, ...links });
    return { ok: true, imageUrl: img.url, uri: meta.uri };
  } catch (e) {
    return { ok: false, error: e instanceof PinError ? e.message : "Could not upload to IPFS. Try again in a moment." };
  }
}

export interface PublicPrepareInput { name: string; ticker: string; uri: string; wallet: string; mint: string; devBuySol: number }
export type PublicPrepareOut = { ok: true; plan: LaunchPlan; ticket: string; breakdown: Breakdown; simNote: string } | Fail;

/**
 * Step 8: quote and dry run. Converts the flat service fee from USD to SOL at the live price (or the fixed SOL fallback),
 * dry-runs the exact create transaction, and returns the signed plan, the cost breakdown and the short-lived quote. Signs and sends nothing.
 */
export async function publicPrepareAction(input: PublicPrepareInput): Promise<PublicPrepareOut> {
  const g = await gate("pl-prepare", 20, 1, "h", 600);
  if (g) return g;
  try {
    if (!input || typeof input !== "object") return { ok: false, error: "Bad request." };
    const name = String(input.name ?? "").trim(), ticker = String(input.ticker ?? "").trim().toUpperCase();
    if (name.length < 1 || name.length > 32) return { ok: false, error: "The name must be 1 to 32 characters." };
    if (!/^[A-Z0-9]{2,10}$/.test(ticker)) return { ok: false, error: "The ticker must be 2 to 10 letters or digits." };
    if (!isPk(input.wallet)) return { ok: false, error: "Connect a wallet first." };
    if (!isPk(input.mint)) return { ok: false, error: "The mint address is not valid." };
    if (!/^https:\/\/[^\s]{8,190}$/.test(String(input.uri ?? ""))) return { ok: false, error: "Upload the metadata to IPFS first." };
    const dev = Number(input.devBuySol);
    if (!Number.isFinite(dev) || dev < 0 || dev > MAX_DEV_BUY_SOL) return { ok: false, error: `The dev buy must be between 0 and ${MAX_DEV_BUY_SOL} SOL.` };
    const r = await selfPrepare({ name, symbol: ticker, uri: input.uri, creator: input.wallet, mint: input.mint, devBuySol: dev });
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof SelfLaunchError || e instanceof PinError || e instanceof LaunchBuildError || e instanceof LaunchExecError) return { ok: false, error: e.message };
    console.error("publicPrepare failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "Could not prepare the launch right now. Please try again in a moment." };
  }
}

export async function publicSelfTxAction(plan: LaunchPlan, ticket: string, step: SelfStep): Promise<{ ok: true; tx: string; bytes: number } | Fail> {
  const g = await gate("pl-tx", 30, 10, "m");
  if (g) return g;
  if (step !== "create" && step !== "buy") return { ok: false, error: "Unknown step." };
  try { const r = await selfTx(plan, String(ticket ?? ""), step); return { ok: true, tx: r.tx, bytes: r.bytes }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "Blocked." }; }
}

export async function publicSelfRelayAction(plan: LaunchPlan, ticket: string, step: SelfStep, signedTx: string): Promise<({ ok: true } & SelfRelayResult) | Fail> {
  const g = await gate("pl-relay", 30, 10, "m");
  if (g) return g;
  if (step !== "create" && step !== "buy") return { ok: false, error: "Unknown step." };
  if (typeof signedTx !== "string" || signedTx.length < 100 || signedTx.length > 2400) return { ok: false, error: "That is not a valid signed transaction." };
  try { return { ok: true, ...(await selfRelay(plan, String(ticket ?? ""), step, signedTx)) }; }
  catch (e) {
    if (e instanceof SelfLaunchError || e instanceof RelayError || e instanceof LaunchExecError) return { ok: false, error: e.message };
    console.error("publicSelfRelay failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "Blocked." };
  }
}
