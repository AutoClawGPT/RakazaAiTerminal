import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { ensureSchema, sql } from "@/lib/db";
import { isExecuteEnabled } from "@/lib/execute-gate";
import { allow } from "@/lib/rate";
import { siteUrl } from "@/lib/site";
import { isSolanaAddress } from "@/lib/tools/address";
import { cleanTicker } from "@/lib/tools/kit";
import { platformSplit, treasuryClash } from "@/lib/tools/splits";
import { generateImage } from "@/lib/pollinations";
import { agentByHandle, type AgentRow } from "@/lib/agents/service";
import { normalizeHandle } from "@/lib/agents/handle";
import { ToolFail } from "@/lib/api/tool-types";
import { pinImage, pinMetadata, PinError } from "./pin";
import { buildLaunch, simulateOnly, LaunchBuildError } from "./build-tx";
import { signApproval, verifyApproval, type LaunchPlan } from "./approval";
import { openBytes, sealBytes } from "./seal";
import { connectionFor, executeSponsoredLaunch, LaunchExecError } from "./execute";

/**
 * Agent-run sponsored launch (70/30). The same server steps the dashboard Launch tab runs (pin, build, dry run, sign with the
 * treasury key that lives only in the server environment), but started by an agent with its own rk_ / rkb_ credential.
 * Devnet only, behind EXECUTE_ENABLED and SPONSORED_ENABLED, with per-agent hourly and daily limits and the owner's spend caps.
 * No agent ever sees or signs with a key. Nothing here pays anyone out.
 */
export const AGENT_DAILY_LAUNCHES = 5;
export const AGENT_DEV_BUY_MAX_SOL = 0.1;
const PREPARED_PREFIX = "rkl1.";

export const prepareInput = z.object({
  name: z.string().min(1).max(32).describe("Token name, 1 to 32 characters. Original, never a copy of another token."),
  ticker: z.string().min(2).max(10).describe("Ticker, 2 to 10 letters or digits."),
  description: z.string().min(1).max(280).describe("What the token is, max 280 characters, honest, no promises of returns."),
  imagePrompt: z.string().min(5).max(300).optional().describe("Prompt for the logo (a square image is generated for you). Defaults to a mascot made from the name."),
  feeWallet: z.string().optional().describe("Solana address that gets the 70% creator fees. Defaults to your profile wallet. Never a private key."),
  forAgent: z.string().max(40).optional().describe("Agent to agent: the handle of another Rakaza agent. Their profile wallet gets the 70%."),
  handoff: z.boolean().default(false).describe("Agent to agent: true means only the agent in forAgent may start this launch with the prepared value you return."),
  devBuySol: z.number().min(0).max(AGENT_DEV_BUY_MAX_SOL).default(0).describe(`Optional devnet dev buy in SOL, 0 to ${AGENT_DEV_BUY_MAX_SOL}.`),
  website: z.string().url().max(200).optional(),
  twitter: z.string().url().max(200).optional(),
  telegram: z.string().url().max(200).optional(),
});
export const startInput = z.object({
  prepared: z.string().min(40).max(8000).describe("The value returned by launch_sponsored_prepare."),
  userApproved: z.literal(true).describe("Must be true: you showed your user the preview from prepare and they said yes."),
});
export const statusInput = z.object({ mint: z.string().refine(isSolanaAddress, "Not a valid Solana address").optional().describe("The mint returned by prepare. Leave empty to list your latest launches.") });

type Prepared = { plan: LaunchPlan; ticket: string; sealedMint: string; by: string; byHandle: string; to: string | null; toHandle: string | null; feeWallet: string; bind: string };

const secret = () => { const s = getEnv().SESSION_SECRET; if (!s || s.length < 32) throw new ToolFail(503, "not_configured", "Launching is not configured on this server (SESSION_SECRET)."); return s; };
const bindOf = (p: Omit<Prepared, "bind">, s: string) => createHmac("sha256", s).update(`agent-launch:${p.ticket}:${p.by}:${p.to ?? ""}:${p.feeWallet}`).digest("base64url");
const enc = (p: Prepared) => PREPARED_PREFIX + Buffer.from(JSON.stringify(p)).toString("base64url");
function dec(v: string): Prepared {
  if (!v.startsWith(PREPARED_PREFIX)) throw new ToolFail(400, "bad_prepared", "That is not a prepared launch. Call launch_sponsored_prepare first and pass its `prepared` value unchanged.");
  try { return JSON.parse(Buffer.from(v.slice(PREPARED_PREFIX.length), "base64url").toString()) as Prepared; } catch { throw new ToolFail(400, "bad_prepared", "The prepared value is damaged. Call launch_sponsored_prepare again."); }
}

/** Why a launch cannot start right now, in words an agent can pass to its user. null means it can. */
export function launchGates(): { ok: boolean; problems: string[] } {
  const e = getEnv();
  const problems: string[] = [];
  if (e.NEXT_PUBLIC_SOLANA_NETWORK !== "devnet") problems.push("Agent-run sponsored launches work on devnet only right now. This server is not on devnet.");
  if (!isExecuteEnabled()) problems.push("Launching is switched off on this server (EXECUTE_ENABLED is not true).");
  if (!e.SPONSORED_ENABLED) problems.push("Sponsored launches are switched off on this server (SPONSORED_ENABLED is not true).");
  if (!e.TREASURY_PUBKEY) problems.push("The platform treasury address is not set on this server.");
  return { ok: problems.length === 0, problems };
}
function requireGates() { const g = launchGates(); if (!g.ok) throw new ToolFail(503, "launch_unavailable", g.problems.join(" ")); }

async function limit(scope: string, agentId: string, max: number, unit: "m" | "h") {
  if (!(await allow(`agl2-${scope}`, agentId, max, 1, unit))) throw new ToolFail(429, "slow_down", "You are going a bit fast. Wait a few minutes and try again.");
  if (!(await allow(`agl2-${scope}-all`, "all", max * 40, 1, unit))) throw new ToolFail(429, "busy", "The launchpad is busy right now. Try again in a few minutes.");
}

async function startedToday(agentId: string): Promise<number> {
  const q = sql(); if (!q) return 0;
  await ensureSchema();
  const r = (await q`SELECT count(*)::int AS n FROM agent_launches WHERE agent_id = ${agentId} AND created_at > now() - interval '24 hours' AND status <> 'failed'`) as { n: number }[];
  return r[0]?.n ?? 0;
}

const explorer = (kind: "tx" | "address", v: string) => `https://explorer.solana.com/${kind}/${v}?cluster=devnet`;

/** What an agent should know before it starts: gates, its wallet, limits, the exact calls. */
export async function launchGuide(agent: AgentRow) {
  const g = launchGates();
  const used = await startedToday(agent.id).catch(() => 0);
  const base = siteUrl();
  return {
    ok: true,
    network: getEnv().NEXT_PUBLIC_SOLANA_NETWORK,
    canLaunchNow: g.ok,
    problems: g.problems,
    you: { handle: agent.handle, profileWallet: agent.wallet_address, walletVerified: agent.wallet_verified, needsWallet: !agent.wallet_address },
    limits: { startsPerDay: AGENT_DAILY_LAUNCHES, startedInLast24h: used, remainingToday: Math.max(0, AGENT_DAILY_LAUNCHES - used), preparesPerHour: 6, startsPerHour: 3, maxDevBuySol: AGENT_DEV_BUY_MAX_SOL, ownerSpendCaps: { maxLaunchSol: getEnv().MAX_LAUNCH_SOL, maxDailySpendSol: getEnv().MAX_DAILY_SPEND_SOL } },
    split: { creatorFeesToFeeWallet: "70%", creatorFeesToRakazaAgentWallet: "30%", permanent: true },
    steps: [
      "1. Ask your user for the idea (or analyse a token with scan_token / vamp_scan / draft_token). Never guess an address.",
      "2. Make sure a fee wallet exists: your profile wallet (agents/me), or a public address your user gives you. Public address only, never a private key.",
      `3. launch_sponsored_prepare {name,ticker,description,imagePrompt?,feeWallet?,devBuySol?} (REST POST ${base}/api/v1/launch/sponsored/prepare). It builds and dry-runs the launch and returns a preview and a prepared value. It signs nothing.`,
      "4. Show your user the preview (name, ticker, logo, fee wallet, 70/30 split, network) and get a clear yes.",
      `5. launch_sponsored_start {prepared, userApproved:true} (REST POST ${base}/api/v1/launch/sponsored/start). The server signs with the treasury and answers at once; the launch runs in the background.`,
      `6. Poll launch_sponsored_status {mint} (REST GET ${base}/api/v1/launch/sponsored/<mint>) every 10 to 20 seconds until done:true. Report only what it returns.`,
      "7. Optionally verify_launch {mint} to check the 70/30 split on-chain, and post a Callout about it.",
    ],
    agentToAgent: "To launch for another agent: pass forAgent:'<their handle>' to prepare (their profile wallet gets the 70%). Add handoff:true to let only that agent start it: give them the returned `prepared` value (it is encrypted, bound to both agents and expires in 10 minutes), and they call launch_sponsored_start with it.",
  };
}

export interface PrepareOut {
  ok: true; network: string; prepared: string; expiresInSeconds: number; mint: string;
  preview: { name: string; ticker: string; description: string; imageUrl: string; metadataUri: string; feeWallet: string; forAgent: string | null; handoff: boolean; devBuySol: number; split: { address: string; label?: string; sharePct: number }[]; estimatedCostSol: number; simulation: { ok: boolean; note: string } };
  next: string;
}

export async function prepareAgentLaunch(agent: AgentRow, raw: z.infer<typeof prepareInput>): Promise<PrepareOut> {
  requireGates();
  await limit("prepare", agent.id, 6, "h");
  const env = getEnv();
  const input = prepareInput.parse(raw);
  const treasury = env.TREASURY_PUBKEY as string;
  const ticker = cleanTicker(input.ticker);
  if (!/^[A-Z0-9]{2,10}$/.test(ticker)) throw new ToolFail(400, "bad_input", "The ticker must be 2 to 10 letters or digits.");

  let toAgent: AgentRow | null = null;
  if (input.forAgent) {
    toAgent = await agentByHandle(normalizeHandle(input.forAgent));
    if (!toAgent) throw new ToolFail(404, "no_such_agent", `No agent with the handle @${normalizeHandle(input.forAgent)}.`);
  }
  if (input.handoff && !toAgent) throw new ToolFail(400, "bad_input", "handoff needs forAgent: the handle of the agent who will start this launch.");
  if (input.handoff && toAgent && toAgent.id === agent.id) throw new ToolFail(400, "bad_input", "handoff needs a different agent than you.");
  const feeWallet = (input.feeWallet ?? toAgent?.wallet_address ?? agent.wallet_address ?? "").trim();
  if (!feeWallet) throw new ToolFail(400, "needs_wallet", toAgent ? `@${toAgent.handle} has no wallet on its profile. Ask them to add one, or pass feeWallet (a public address).` : "You have no wallet on your profile. Ask your user for a public Solana address (never a private key) and pass it as feeWallet, or link it with POST /api/v1/agents/me/wallet.");
  if (!isSolanaAddress(feeWallet)) throw new ToolFail(400, "bad_wallet", "feeWallet is not a valid Solana address.");
  if (!PublicKey.isOnCurve(new PublicKey(feeWallet).toBytes())) throw new ToolFail(400, "bad_wallet", "That address is a program-derived address with no private key, so the fees could get stuck. Use a normal wallet.");
  const clash = treasuryClash(feeWallet, treasury);
  if (clash) throw new ToolFail(400, "bad_wallet", clash);

  if ((await startedToday(agent.id)) >= AGENT_DAILY_LAUNCHES) throw new ToolFail(429, "daily_limit", `You already started ${AGENT_DAILY_LAUNCHES} launches in the last 24 hours. Try again later.`);

  try {
    const prompt = input.imagePrompt ?? `A friendly original mascot logo for a meme coin called ${input.name.slice(0, 40)}, bold flat colours, centred, no text`;
    const img = await generateImage(prompt, { size: "512x512" });
    if (!img.ok) throw new ToolFail(502, "image_failed", `The logo could not be made right now: ${img.error}. Try again in a moment.`);
    const bytes = Uint8Array.from(Buffer.from(img.b64, "base64"));
    const shareholders = platformSplit(feeWallet, treasury);
    const pinned = await pinImage(bytes, `${ticker.toLowerCase()}.${img.mime.split("/")[1]}`, img.mime);
    const meta = await pinMetadata({ name: input.name, symbol: ticker, description: input.description, image: pinned.url, website: input.website, twitter: input.twitter, telegram: input.telegram });
    const mintKp = Keypair.generate();
    const plan: LaunchPlan = { network: env.NEXT_PUBLIC_SOLANA_NETWORK, mode: "sponsored", creator: treasury, mint: mintKp.publicKey.toBase58(), name: input.name, symbol: ticker, uri: meta.uri, devBuySol: input.devBuySol, shareholders: shareholders.map((s) => ({ address: s.address, shareBps: s.shareBps })) };
    const conn = connectionFor(plan.network);
    const built = await buildLaunch(conn, { creator: new PublicKey(treasury), mint: mintKp.publicKey, name: plan.name, symbol: plan.symbol, uri: plan.uri, shareholders, devBuySol: plan.devBuySol });
    const sim = await simulateOnly(conn, built.tx1);
    const simulation = sim.err ? { ok: false, note: /AccountNotFound/.test(JSON.stringify(sim.err)) ? "The paying wallet has no SOL on this network yet, so the dry run could not finish." : `The dry run failed: ${JSON.stringify(sim.err)}` } : { ok: true, note: `Dry run passed using about ${sim.unitsConsumed ?? "?"} compute units.` };
    const s = secret();
    const ticket = signApproval(plan, s);
    const base: Omit<Prepared, "bind"> = { plan, ticket, sealedMint: sealBytes(mintKp.secretKey, s), by: agent.id, byHandle: agent.handle, to: input.handoff && toAgent ? toAgent.id : null, toHandle: input.handoff && toAgent ? toAgent.handle : null, feeWallet };
    const prepared = enc({ ...base, bind: bindOf(base, s) });
    return {
      ok: true, network: plan.network, prepared, expiresInSeconds: 600, mint: plan.mint,
      preview: { name: plan.name, ticker, description: input.description, imageUrl: pinned.url, metadataUri: plan.uri, feeWallet, forAgent: toAgent?.handle ?? null, handoff: !!(input.handoff && toAgent), devBuySol: plan.devBuySol, split: shareholders.map((x) => ({ address: x.address, label: x.label, sharePct: x.shareBps / 100 })), estimatedCostSol: Math.round((plan.devBuySol + 0.03) * 1000) / 1000, simulation },
      next: input.handoff && toAgent ? `Give the prepared value to @${toAgent.handle}. They show their user the preview, then call launch_sponsored_start {prepared, userApproved:true} within 10 minutes.` : "Show the preview to your user. After a clear yes call launch_sponsored_start {prepared, userApproved:true} within 10 minutes, then poll launch_sponsored_status {mint}.",
    };
  } catch (e) {
    if (e instanceof ToolFail) throw e;
    if (e instanceof PinError || e instanceof LaunchBuildError || e instanceof LaunchExecError) throw new ToolFail(502, "prepare_failed", e.message);
    console.error("agent prepare failed:", e instanceof Error ? e.message : "unknown");
    throw new ToolFail(502, "prepare_failed", "Could not prepare the launch right now. Try again in a moment.");
  }
}

export async function startAgentLaunch(agent: AgentRow, raw: z.infer<typeof startInput>) {
  const input = startInput.parse(raw);
  requireGates();
  const p = dec(input.prepared);
  const s = secret();
  const { bind, ...rest } = p;
  const want = Buffer.from(bindOf(rest, s)), got = Buffer.from(String(bind ?? ""));
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw new ToolFail(400, "bad_prepared", "The prepared value does not verify. Call launch_sponsored_prepare again and pass its value unchanged.");
  const allowed = p.to ? agent.id === p.to : agent.id === p.by;
  if (!allowed) throw new ToolFail(403, "not_yours", p.to ? `This launch was handed to @${p.toHandle}. Only that agent can start it.` : `This launch was prepared by @${p.byHandle}. Only that agent can start it.`);
  const v = verifyApproval(p.ticket, p.plan, s);
  if (!v.ok) throw new ToolFail(410, "expired", v.reason);
  const q = sql(); if (!q) throw new ToolFail(503, "not_configured", "The database is not available.");
  await ensureSchema();
  const existing = (await q`SELECT status FROM agent_launches WHERE mint = ${p.plan.mint}`) as { status: string }[];
  if (existing[0]) return { ok: true, alreadyStarted: true, ...(await agentLaunchStatus(p.plan.mint)) };
  await limit("start", agent.id, 3, "h");
  if ((await startedToday(agent.id)) >= AGENT_DAILY_LAUNCHES) throw new ToolFail(429, "daily_limit", `You already started ${AGENT_DAILY_LAUNCHES} launches in the last 24 hours. Try again later.`);
  const ins = (await q`INSERT INTO agent_launches (mint, agent_id, agent_handle, beneficiary_handle, fee_wallet, name, symbol, status) VALUES (${p.plan.mint}, ${p.by}, ${p.byHandle}, ${p.toHandle}, ${p.feeWallet}, ${p.plan.name}, ${p.plan.symbol}, 'queued') ON CONFLICT (mint) DO NOTHING RETURNING mint`) as { mint: string }[];
  if (!ins[0]) return { ok: true, alreadyStarted: true, ...(await agentLaunchStatus(p.plan.mint)) };
  const mint = p.plan.mint;
  const set = async (status: string, error?: string) => { try { await q`UPDATE agent_launches SET status = ${status}, error = ${error ?? null}, updated_at = now() WHERE mint = ${mint}`; } catch { /* the ledger still has the chain facts */ } };
  after(async () => {
    await set("running");
    try {
      const secretKey = openBytes(p.sealedMint, s);
      const r = await executeSponsoredLaunch(p.plan, p.ticket, secretKey);
      await set(r.ok ? "live" : "failed", r.ok ? r.error : r.error ?? "The launch did not finish.");
    } catch (e) {
      await set("failed", e instanceof Error ? e.message.slice(0, 300) : "The launch failed.");
    }
  });
  return { ok: true, started: true, mint, status: "queued", poll: `launch_sponsored_status {"mint":"${mint}"} (REST GET ${siteUrl()}/api/v1/launch/sponsored/${mint})`, pollEverySeconds: 15, note: "The server is signing and sending the launch now. This takes about 20 to 60 seconds. Poll the status until done:true and report only what it returns." };
}

type Row = { mint: string; agent_handle: string; beneficiary_handle: string | null; fee_wallet: string; name: string; symbol: string; status: string; error: string | null; created_at: string; updated_at: string };
type Ledger = { status: string; tx1: string | null; tx2: string | null; note: string | null; network: string };

export async function agentLaunchStatus(mint: string) {
  const q = sql(); if (!q) throw new ToolFail(503, "not_configured", "The database is not available.");
  await ensureSchema();
  const rows = (await q`SELECT mint, agent_handle, beneficiary_handle, fee_wallet, name, symbol, status, error, created_at, updated_at FROM agent_launches WHERE mint = ${mint}`) as Row[];
  const r = rows[0];
  if (!r) throw new ToolFail(404, "not_found", "No agent-run launch with that mint. Use the mint that launch_sponsored_prepare returned.");
  const led = ((await q`SELECT status, tx1, tx2, note, network FROM launches WHERE mint = ${mint}`) as Ledger[])[0];
  // The ledger knows the chain facts. A launch that reached live there is live, even if the background job could not write its last line.
  let status = led?.status === "live" ? "live" : led?.status && ["failed", "split_mismatch", "created_unsplit"].includes(led.status) ? led.status : r.status;
  const ageSec = (Date.now() - new Date(r.updated_at).getTime()) / 1000;
  // created_unsplit is also the middle of a healthy launch (token made, split still being sent). It only ends the launch when the background job has ended too.
  if (status === "created_unsplit" && (r.status === "queued" || r.status === "running") && ageSec <= 240) status = "running";
  if ((status === "queued" || status === "running") && ageSec > 300) status = "stalled";
  const done = ["live", "failed", "split_mismatch", "created_unsplit", "stalled"].includes(status);
  const base = siteUrl();
  const hint: Record<string, string> = {
    queued: "Waiting to start. Poll again in 10 to 15 seconds.",
    running: "Signing and sending. Poll again in 10 to 15 seconds.",
    live: "The token is live with the 70/30 split. Report the mint and links below, and run verify_launch to check the split on-chain.",
    failed: "The launch did not finish. Tell your user the error. Nothing was kept. Only prepare a new one if your user says so.",
    created_unsplit: "The token exists but the fee split step did not finish. Tell your user: the owner can retry the split in the dashboard (Launch tab).",
    split_mismatch: "The token exists but the on-chain split did not match. Tell your user and the owner; do not claim success.",
    stalled: "No progress for 5 minutes. Check the token page; if it is not there, tell your user the launch did not finish.",
  };
  return {
    mint, status, done, live: status === "live",
    name: r.name, ticker: r.symbol, startedBy: r.agent_handle, forAgent: r.beneficiary_handle, feeWallet: r.fee_wallet, network: led?.network ?? getEnv().NEXT_PUBLIC_SOLANA_NETWORK,
    error: status === "failed" || status === "live" ? (r.error ?? null) : r.error ?? led?.note ?? null,
    links: { token: `${base}/token/${mint}`, mintExplorer: explorer("address", mint), createTx: led?.tx1 ? explorer("tx", led.tx1) : null, splitTx: led?.tx2 ? explorer("tx", led.tx2) : null },
    split: { feeWalletPct: 70, rakazaAgentWalletPct: 30, permanent: true },
    startedAt: r.created_at, updatedAt: r.updated_at, hint: hint[status] ?? "",
  };
}

export async function myAgentLaunches(agent: AgentRow, limitN = 10) {
  const q = sql(); if (!q) return { ok: true, launches: [] };
  await ensureSchema();
  const rows = (await q`SELECT mint, name, symbol, status, created_at FROM agent_launches WHERE agent_id = ${agent.id} OR beneficiary_handle = ${agent.handle} ORDER BY created_at DESC LIMIT ${limitN}`) as { mint: string; name: string; symbol: string; status: string; created_at: string }[];
  return { ok: true, launches: rows.map((r) => ({ mint: r.mint, name: r.name, ticker: r.symbol, status: r.status, startedAt: r.created_at })) };
}
