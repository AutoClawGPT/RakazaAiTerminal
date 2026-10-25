"use server";
import { Keypair, PublicKey } from "@solana/web3.js";
import { isOwnerRequest } from "@/lib/owner";
import { getEnv } from "@/lib/env";
import { isSolanaAddress } from "@/lib/tools/address";
import { vampScan } from "@/lib/launch/vamp";
import { analyzeAndDraft, flagRisk, type AutoDraft, type FlagRisk } from "@/lib/launch/auto";
import { pinImage, pinMetadata, PinError } from "@/lib/launch/pin";
import { buildLaunch, simulateOnly, LaunchBuildError } from "@/lib/launch/build-tx";
import { signApproval, type LaunchPlan } from "@/lib/launch/approval";
import { sealBytes } from "@/lib/launch/seal";
import { connectionFor, LaunchExecError } from "@/lib/launch/execute";
import { platformSplit, validateSplit } from "@/lib/tools/splits";
import { trustCheck } from "@/lib/api/agent-kit-tools";
import type { PrepareOut } from "./actions";

type Fail = { ok: false; error: string };
const guard = async (): Promise<Fail | null> => ((await isOwnerRequest()) ? null : { ok: false, error: "The launch tools are for the owner and the agent only." });

/** Step: River analyses the flagged tokens and proposes the new token. The scan is re-run on the server so the browser cannot feed River forged facts. */
export async function autoAnalyzeAction(mint: string, avoid: string[] = []): Promise<{ ok: true; draft: AutoDraft } | Fail> {
  const g = await guard();
  if (g) return g;
  const m = String(mint ?? "").trim();
  if (!isSolanaAddress(m)) return { ok: false, error: "That is not a valid Solana address." };
  const v = await vampScan(m);
  if (!v.ok) return v;
  const safeAvoid = (Array.isArray(avoid) ? avoid : []).filter((x) => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 12);
  return { ok: true, draft: await analyzeAndDraft(v.result, safeAvoid) };
}

/** Step: how likely is the new name and ticker to be flagged as a copy? */
export async function autoRiskAction(name: string, ticker: string): Promise<{ ok: true; risk: FlagRisk } | Fail> {
  const g = await guard();
  if (g) return g;
  const r = await flagRisk(String(name ?? "").slice(0, 40), String(ticker ?? "").slice(0, 12));
  return r.ok ? { ok: true, risk: r.risk } : r;
}

/** Step: pin the image, then the metadata JSON, to IPFS through Pinata. */
export async function autoPinAction(input: { name: string; ticker: string; description: string; imageDataUrl: string; links?: { website?: string; twitter?: string; telegram?: string } }): Promise<{ ok: true; imageUrl: string; imageCid: string; uri: string; metaCid: string } | Fail> {
  const g = await guard();
  if (g) return g;
  try {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.imageDataUrl ?? "");
    if (!m) return { ok: false, error: "Make the image first." };
    const bytes = Uint8Array.from(Buffer.from(m[2], "base64"));
    const img = await pinImage(bytes, `${input.ticker.toLowerCase().replace(/[^a-z0-9]/g, "")}.${m[1].split("/")[1]}`, m[1]);
    const meta = await pinMetadata({ name: input.name, symbol: input.ticker, description: input.description, image: img.url, ...input.links });
    return { ok: true, imageUrl: img.url, imageCid: img.cid, uri: meta.uri, metaCid: meta.cid };
  } catch (e) {
    return { ok: false, error: e instanceof PinError ? e.message : "Could not upload to IPFS." };
  }
}

export interface AutoTrust { wallet: string; ok: boolean; blocked: boolean; notes: string[]; balanceSol: number; said: { registered: boolean; tier: string } | null; network: string }

/** Step: trust_check on the fee wallet, before anything is built. A wallet that cannot hold fees is blocked. */
export async function autoTrustAction(wallet: string): Promise<{ ok: true; trust: AutoTrust } | Fail> {
  const g = await guard();
  if (g) return g;
  const w = String(wallet ?? "").trim();
  if (!isSolanaAddress(w)) return { ok: false, error: "That is not a valid Solana wallet address." };
  try {
    const t = await trustCheck(w);
    return { ok: true, trust: { wallet: w, ok: t.normalWallet, blocked: !t.normalWallet, notes: t.notes, balanceSol: t.balanceSol, said: t.said, network: t.network } };
  } catch {
    return { ok: false, error: "Could not check that wallet right now. Try again." };
  }
}

/** Reads a 64-byte keypair JSON made by the grinder. The key is only used to sign the one create transaction. */
async function groundMintKeypair(json: string | undefined): Promise<Keypair | null> {
  if (!json || !json.trim()) return null;
  let arr: unknown;
  try { arr = JSON.parse(json); } catch { throw new LaunchBuildError("The ground key file is not valid JSON."); }
  if (!Array.isArray(arr) || arr.length !== 64 || arr.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new LaunchBuildError("The ground key file must be a JSON array of 64 numbers.");
  try { return Keypair.fromSecretKey(Uint8Array.from(arr as number[])); } catch { throw new LaunchBuildError("The ground key file does not match its own address."); }
}

export interface AutoPrepareInput { name: string; ticker: string; description: string; uri: string; imageUrl: string; feeWallet: string; devBuySol: number; groundMint?: string }

/** Step: the only thing the user gives is the fee wallet. Builds the sponsored launch with the permanent 70/30 split, dry-runs it and hands back the approval ticket. Signs and sends nothing. */
export async function autoPrepareAction(input: AutoPrepareInput): Promise<{ ok: true; out: PrepareOut; grounded: boolean } | Fail> {
  const g = await guard();
  if (g) return g;
  try {
    const env = getEnv();
    if (!env.TREASURY_PUBKEY) return { ok: false, error: "The treasury address is not set (TREASURY_PUBKEY)." };
    if (!isSolanaAddress(input.feeWallet)) return { ok: false, error: "The fee wallet is not a valid Solana address." };
    if (!/^(https:\/\/|ipfs:\/\/)/.test(input.uri ?? "")) return { ok: false, error: "Upload the metadata first." };
    const shareholders = platformSplit(input.feeWallet, env.TREASURY_PUBKEY);
    const chk = validateSplit(shareholders);
    if (!chk.ok) return { ok: false, error: chk.errors?.[0] ?? "The fee split is not valid." };
    const conn = connectionFor(env.NEXT_PUBLIC_SOLANA_NETWORK);
    const ground = await groundMintKeypair(input.groundMint);
    if (ground && (await conn.getAccountInfo(ground.publicKey))) return { ok: false, error: "That ground address is already used on this network. Grind a new one." };
    const mintKp = ground ?? Keypair.generate();
    const plan: LaunchPlan = { network: env.NEXT_PUBLIC_SOLANA_NETWORK, mode: "sponsored", creator: env.TREASURY_PUBKEY, mint: mintKp.publicKey.toBase58(), name: input.name, symbol: input.ticker, uri: input.uri, devBuySol: Number(input.devBuySol) || 0, shareholders: shareholders.map((s) => ({ address: s.address, shareBps: s.shareBps })) };
    const built = await buildLaunch(conn, { creator: new PublicKey(plan.creator), mint: mintKp.publicKey, name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders, devBuySol: plan.devBuySol });
    const sim = await simulateOnly(conn, built.tx1);
    const simulation = sim.err ? { ok: false, note: /AccountNotFound/.test(JSON.stringify(sim.err)) ? "The paying wallet has no SOL on this network yet, so the dry run could not finish." : `The dry run failed: ${JSON.stringify(sim.err)}` } : { ok: true, note: `Dry run passed using about ${sim.unitsConsumed ?? "?"} compute units.` };
    const out: PrepareOut = { plan, ticket: signApproval(plan, env.SESSION_SECRET), sealedMint: sealBytes(mintKp.secretKey, env.SESSION_SECRET), imageUrl: input.imageUrl, tx1Bytes: built.tx1Bytes, tx2Bytes: built.tx2Bytes, simulation };
    return { ok: true, out, grounded: Boolean(ground) };
  } catch (e) {
    if (e instanceof PinError || e instanceof LaunchBuildError || e instanceof LaunchExecError) return { ok: false, error: e.message };
    console.error("autoPrepare failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "Could not prepare the launch. Check the Settings page for which key failed." };
  }
}
