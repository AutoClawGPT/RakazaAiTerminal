"use server";
import { launchGuard } from "@/lib/launch/caller";
import { fetchToken, type TokenInfo } from "@/lib/launch/token-fetch";
import { optimizeToken, type Draft } from "@/lib/launch/optimize";
import { generateImage } from "@/lib/pollinations";

type Fail = { ok: false; error: string };

/** Owner (owner cookie, unchanged) or a signed-in agent with its own session; agents are rate-limited and spend steps are devnet-only. */
type GuardOpts = Parameters<typeof launchGuard>[1];
async function guard(scope = "misc", o: GuardOpts = { max: 20, n: 1, unit: "h" }): Promise<Fail | null> {
  return launchGuard(scope, o);
}

export async function scanTokenAction(mint: string): Promise<{ ok: true; token: TokenInfo } | Fail> {
  const g = await guard("scan", { max: 20, n: 1, unit: "h" });
  if (g) return g;
  try { return await fetchToken(String(mint ?? "")); } catch { return { ok: false, error: "The token lookup failed. Try again in a moment." }; }
}

export async function draftAction(token: TokenInfo): Promise<{ ok: true; draft: Draft } | Fail> {
  const g = await guard("draft", { max: 12, n: 1, unit: "h" });
  if (g) return g;
  if (!token || typeof token.mint !== "string") return { ok: false, error: "Scan a token first." };
  // Re-fetch on the server so the browser cannot feed the brain forged facts.
  try {
    const fresh = await fetchToken(token.mint);
    if (!fresh.ok) return fresh;
    return { ok: true, draft: await optimizeToken(fresh.token) };
  } catch { return { ok: false, error: "The draft could not be made right now. Try again in a moment." }; }
}

export async function imageAction(prompt: string): Promise<{ ok: true; dataUrl: string; ms: number } | Fail> {
  const g = await guard("image", { max: 12, n: 1, unit: "h" });
  if (g) return g;
  const p = String(prompt ?? "").trim();
  if (p.length < 5) return { ok: false, error: "Write an image prompt first." };
  let r: Awaited<ReturnType<typeof generateImage>>;
  try { r = await generateImage(p, { size: "512x512" }); } catch { return { ok: false, error: "The image service did not answer. Try again in a moment." }; }
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, dataUrl: `data:${r.mime};base64,${r.b64}`, ms: r.ms };
}

// ---------------- Prepare and launch (Phase 6) ----------------
import { Keypair, PublicKey } from "@solana/web3.js";
import { getEnv } from "@/lib/env";
import { isExecuteEnabled } from "@/lib/execute-gate";
import { pinImage, pinMetadata, PinError } from "@/lib/launch/pin";
import { buildLaunch, simulateOnly, LaunchBuildError } from "@/lib/launch/build-tx";
import { signApproval, type LaunchPlan } from "@/lib/launch/approval";
import { sealBytes, openBytes } from "@/lib/launch/seal";
import { connectionFor, executeSponsoredLaunch, resumeSplit, LaunchExecError, type ExecResult } from "@/lib/launch/execute";
import { platformSplit, treasuryClash } from "@/lib/tools/splits";

export interface PrepareInput { name: string; ticker: string; description: string; imageDataUrl: string; links?: { website?: string; twitter?: string; telegram?: string }; feeWallet: string; devBuySol: number }
export interface PrepareOut { plan: LaunchPlan; ticket: string; sealedMint: string; imageUrl: string; tx1Bytes: number; tx2Bytes: number; simulation: { ok: boolean; note: string } }

/** Pins the image and metadata, builds the two transactions, simulates the first, and hands back an approval ticket. Signs and sends nothing. */
export async function prepareLaunchAction(input: PrepareInput): Promise<{ ok: true; out: PrepareOut } | Fail> {
  const g = await guard("prepare", { max: 6, n: 1, unit: "h", spend: true });
  if (g) return g;
  try {
    const env = getEnv();
    if (!env.TREASURY_PUBKEY) return { ok: false, error: "The treasury address is not set (TREASURY_PUBKEY)." };
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.imageDataUrl ?? "");
    if (!m) return { ok: false, error: "Make the image first." };
    const bytes = Uint8Array.from(Buffer.from(m[2], "base64"));
    const clash = treasuryClash(input.feeWallet, env.TREASURY_PUBKEY);
    if (clash) return { ok: false, error: clash };
    // The sponsored launch: the platform treasury is the creator and pays. The fee wallet only receives its 70%.
    const creator = env.TREASURY_PUBKEY;
    const shareholders = platformSplit(input.feeWallet, env.TREASURY_PUBKEY);
    const img = await pinImage(bytes, `${input.ticker.toLowerCase()}.${m[1].split("/")[1]}`, m[1]);
    const meta = await pinMetadata({ name: input.name, symbol: input.ticker, description: input.description, image: img.url, ...input.links });
    const mintKp = Keypair.generate();
    const plan: LaunchPlan = { network: env.NEXT_PUBLIC_SOLANA_NETWORK, mode: "sponsored", creator, mint: mintKp.publicKey.toBase58(), name: input.name, symbol: input.ticker, uri: meta.uri, devBuySol: Number(input.devBuySol) || 0, shareholders: shareholders.map((s) => ({ address: s.address, shareBps: s.shareBps })) };
    const conn = connectionFor(plan.network);
    const built = await buildLaunch(conn, { creator: new PublicKey(creator), mint: mintKp.publicKey, name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders, devBuySol: plan.devBuySol });
    const sim = await simulateOnly(conn, built.tx1);
    const simulation = sim.err ? { ok: false, note: /AccountNotFound/.test(JSON.stringify(sim.err)) ? "The paying wallet has no SOL on this network yet, so the dry run could not finish." : `The dry run failed: ${JSON.stringify(sim.err)}` } : { ok: true, note: `Dry run passed using about ${sim.unitsConsumed ?? "?"} compute units.` };
    const out: PrepareOut = { plan, ticket: signApproval(plan, env.SESSION_SECRET), sealedMint: sealBytes(mintKp.secretKey, env.SESSION_SECRET), imageUrl: img.url, tx1Bytes: built.tx1Bytes, tx2Bytes: built.tx2Bytes, simulation };
    return { ok: true, out };
  } catch (e) {
    if (e instanceof PinError || e instanceof LaunchBuildError || e instanceof LaunchExecError) return { ok: false, error: e.message };
    console.error("prepareLaunch failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "Could not prepare the launch. Check the Settings page for which key failed." };
  }
}

/** The one button that moves money. Needs EXECUTE_ENABLED, the ticket from prepare, and the caps. */
export async function launchAction(plan: LaunchPlan, ticket: string, sealedMint: string): Promise<{ ok: true; result: ExecResult } | Fail> {
  const g = await guard("launch", { max: 3, n: 1, unit: "h", spend: true });
  if (g) return g;
  try {
    if (!isExecuteEnabled()) return { ok: false, error: "Launching is switched off (EXECUTE_ENABLED is not true)." };
    const mintSecret = openBytes(sealedMint, getEnv().SESSION_SECRET);
    return { ok: true, result: await executeSponsoredLaunch(plan, ticket, mintSecret) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Launch blocked." };
  }
}

export async function retrySplitAction(plan: LaunchPlan, ticket: string): Promise<{ ok: true; result: ExecResult } | Fail> {
  const g = await guard("retry", { max: 6, n: 1, unit: "h", spend: true });
  if (g) return g;
  try { return { ok: true, result: await resumeSplit(plan, ticket) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Blocked." }; }
}
