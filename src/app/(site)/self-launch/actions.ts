"use server";
import { PublicKey } from "@solana/web3.js";
import { getEnv } from "@/lib/env";
import { isSelfLaunchEnabled } from "@/lib/execute-gate";
import { allow, clientIp } from "@/lib/rate";
import { generateImage } from "@/lib/pollinations";
import { pinImage, pinMetadata, PinError } from "@/lib/launch/pin";
import { buildLaunch, LaunchBuildError } from "@/lib/launch/build-tx";
import { signApproval, type LaunchPlan } from "@/lib/launch/approval";
import { connectionFor, LaunchExecError } from "@/lib/launch/execute";
import { selfTx, selfRelay, SelfLaunchError, type SelfStep } from "@/lib/launch/self-launch";
import { RelayError } from "@/lib/launch/relay";
import { selfSplit, treasuryClash } from "@/lib/tools/splits";
import type { SplitReport } from "@/lib/launch/verify-split";

/**
 * PUBLIC self-launch actions: anyone may call them, so every one is size-limited and rate-limited.
 * Nothing here signs, and nothing spends treasury funds. The user's own wallet is the creator and pays every fee.
 * EXECUTE_ENABLED does not apply here (it guards the sponsored path); isSelfLaunchEnabled() does.
 */
type Fail = { ok: false; error: string };

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_MAX_DEV_BUY_SOL = 50;
const isPk = (s: unknown): s is string => { try { return typeof s === "string" && s.length <= 44 && new PublicKey(s).toBase58() === s; } catch { return false; } };
const httpsOrEmpty = (v: unknown): string | undefined => (typeof v === "string" && /^https:\/\/[^\s]{3,200}$/.test(v.trim()) ? v.trim() : undefined);

async function gate(scope: string, max: number, n: number, unit: "s" | "m" | "h", globalMax?: number): Promise<Fail | null> {
  if (!isSelfLaunchEnabled()) return { ok: false, error: "Self launch is switched off on this server." };
  const ip = await clientIp();
  if (!(await allow(scope, ip, max, n, unit))) return { ok: false, error: "You are going a bit fast. Wait a minute and try again." };
  if (globalMax && !(await allow(`${scope}-all`, "all", globalMax, n, unit))) return { ok: false, error: "The launchpad is busy right now. Try again in a few minutes." };
  return null;
}

/** Makes the token image from a prompt. Rate limited because the platform pays for the image service. */
export async function publicImageAction(prompt: string): Promise<{ ok: true; dataUrl: string } | Fail> {
  const g = await gate("pl-image", 4, 10, "m", 120);
  if (g) return g;
  const p = String(prompt ?? "").trim().slice(0, 300);
  if (p.length < 5) return { ok: false, error: "Describe the image in a few words first." };
  try {
    const r = await generateImage(p, { size: "512x512" });
    if (!r.ok) return { ok: false, error: "The image service did not answer. Try again, or upload your own picture." };
    return { ok: true, dataUrl: `data:${r.mime};base64,${r.b64}` };
  } catch { return { ok: false, error: "The image service did not answer. Try again, or upload your own picture." }; }
}

export interface PublicSelfInput {
  name: string; ticker: string; description: string; imageDataUrl: string;
  links?: { website?: string; twitter?: string; telegram?: string };
  feeWallet: string; devBuySol: number; wallet: string; mint: string; confirmSplit: boolean;
}

function sniff(b: Buffer, mime: string): boolean {
  if (mime === "image/png") return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
  if (mime === "image/webp") return b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  return false;
}

/** Validates everything, pins the image and metadata, and returns the plan and approval ticket. Signs and sends nothing. */
export async function preparePublicSelfLaunchAction(input: PublicSelfInput): Promise<{ ok: true; plan: LaunchPlan; ticket: string; imageUrl: string } | Fail> {
  const g = await gate("pl-prepare", 5, 1, "h", 400);
  if (g) return g;
  try {
    const env = getEnv();
    if (!env.TREASURY_PUBKEY) return { ok: false, error: "This launchpad is not fully set up yet (the platform sponsorship wallet is missing)." };
    if (!input || typeof input !== "object") return { ok: false, error: "Bad request." };
    const name = String(input.name ?? "").trim(), ticker = String(input.ticker ?? "").trim().toUpperCase();
    const description = String(input.description ?? "").trim();
    if (name.length < 1 || name.length > 32) return { ok: false, error: "The name must be 1 to 32 characters." };
    if (!/^[A-Z0-9]{2,10}$/.test(ticker)) return { ok: false, error: "The ticker must be 2 to 10 letters or digits." };
    if (description.length > 280) return { ok: false, error: "The description is limited to 280 characters." };
    if (!isPk(input.wallet)) return { ok: false, error: "Connect a wallet first." };
    if (!isPk(input.mint)) return { ok: false, error: "The mint address is not valid." };
    if (!isPk(input.feeWallet)) return { ok: false, error: "The fee wallet address is not valid." };
    const clash = treasuryClash(input.feeWallet, env.TREASURY_PUBKEY) ?? treasuryClash(input.wallet, env.TREASURY_PUBKEY);
    if (clash) return { ok: false, error: clash };
    if (input.confirmSplit !== true) return { ok: false, error: "Confirm the fee split first: you keep 95% of creator fees and 5% sponsors the platform. It is permanent once set." };
    const dev = Number(input.devBuySol);
    if (!Number.isFinite(dev) || dev < 0 || dev > MAX_MAX_DEV_BUY_SOL) return { ok: false, error: `The dev buy must be between 0 and ${MAX_MAX_DEV_BUY_SOL} SOL.` };
    const data = typeof input.imageDataUrl === "string" && input.imageDataUrl.length < MAX_IMAGE_BYTES * 1.4 ? input.imageDataUrl : "";
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!m) return { ok: false, error: "Add an image first (upload one or generate one). It must be PNG, JPEG or WebP under 1.5 MB." };
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !sniff(bytes, m[1])) return { ok: false, error: "That image is not a valid PNG, JPEG or WebP under 1.5 MB." };
    const conn = connectionFor(env.NEXT_PUBLIC_SOLANA_NETWORK);
    if (await conn.getAccountInfo(new PublicKey(input.mint))) return { ok: false, error: "That mint address already exists. Reload the page and try again." };
    const links = { website: httpsOrEmpty(input.links?.website), twitter: httpsOrEmpty(input.links?.twitter), telegram: httpsOrEmpty(input.links?.telegram) };
    const shareholders = selfSplit(input.feeWallet, env.TREASURY_PUBKEY);
    const img = await pinImage(Uint8Array.from(bytes), `${ticker.toLowerCase()}.${m[1].split("/")[1]}`, m[1]);
    const meta = await pinMetadata({ name, symbol: ticker, description, image: img.url, ...links });
    const plan: LaunchPlan = { network: env.NEXT_PUBLIC_SOLANA_NETWORK, mode: "own-wallet", creator: input.wallet, mint: input.mint, name, symbol: ticker, uri: meta.uri, devBuySol: dev, shareholders: shareholders.map((s) => ({ address: s.address, shareBps: s.shareBps })) };
    // Build the exact create transaction once so a bad name or size is caught before the wallet pops up.
    await buildLaunch(conn, { creator: new PublicKey(plan.creator), mint: new PublicKey(plan.mint), name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders, devBuySol: 0 });
    return { ok: true, plan, ticket: signApproval(plan, env.SESSION_SECRET), imageUrl: img.url };
  } catch (e) {
    if (e instanceof PinError || e instanceof LaunchBuildError || e instanceof LaunchExecError) return { ok: false, error: e.message };
    console.error("preparePublicSelfLaunch failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "Could not prepare the launch right now. Please try again in a moment." };
  }
}

export async function publicSelfTxAction(plan: LaunchPlan, ticket: string, step: SelfStep): Promise<{ ok: true; tx: string; bytes: number } | Fail> {
  const g = await gate("pl-tx", 30, 10, "m");
  if (g) return g;
  if (step !== "create" && step !== "split" && step !== "buy") return { ok: false, error: "Unknown step." };
  try { const r = await selfTx(plan, String(ticket ?? ""), step); return { ok: true, tx: r.tx, bytes: r.bytes }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "Blocked." }; }
}

export async function publicSelfRelayAction(plan: LaunchPlan, ticket: string, step: SelfStep, signedTx: string): Promise<{ ok: true; sig: string; split?: SplitReport } | Fail> {
  const g = await gate("pl-relay", 30, 10, "m");
  if (g) return g;
  if (step !== "create" && step !== "split" && step !== "buy") return { ok: false, error: "Unknown step." };
  if (typeof signedTx !== "string" || signedTx.length < 100 || signedTx.length > 2400) return { ok: false, error: "That is not a valid signed transaction." };
  try { return { ok: true, ...(await selfRelay(plan, String(ticket ?? ""), step, signedTx)) }; }
  catch (e) {
    if (e instanceof SelfLaunchError || e instanceof RelayError || e instanceof LaunchExecError) return { ok: false, error: e.message };
    console.error("publicSelfRelay failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "Blocked." };
  }
}
