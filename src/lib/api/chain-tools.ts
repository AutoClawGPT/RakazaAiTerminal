import "server-only";
import { simulationSigner } from "@/lib/launch/sim-signer";
import { Connection, PublicKey } from "@solana/web3.js";
import { bondingCurvePda, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import { getEnv } from "@/lib/env";
import { ensureSchema, sql } from "@/lib/db";
import { connectionFor, loadTreasurySigner } from "@/lib/launch/execute";
import { verifySplitOnChain } from "@/lib/launch/verify-split";
import { isExecuteEnabled } from "@/lib/execute-gate";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";

/** Read-only live chain facts for agents. Nothing here signs, sends or reveals a key. */
const net = () => getEnv().NEXT_PUBLIC_SOLANA_NETWORK;
const sol = (l: number) => l / 1e9;

export async function walletBalance(wallet: string) {
  const conn = connectionFor(net());
  const lamports = await conn.getBalance(new PublicKey(wallet), "confirmed");
  return { ok: true, network: net(), wallet, lamports, sol: sol(lamports) };
}

export async function jupiterQuote(i: { inputMint: string; outputMint: string; amount: string; slippageBps: number }) {
  const key = getEnv().JUPITER_API_KEY;
  const u = new URL("https://api.jup.ag/swap/v1/quote");
  u.search = new URLSearchParams({ inputMint: i.inputMint, outputMint: i.outputMint, amount: i.amount, slippageBps: String(i.slippageBps) }).toString();
  const r = await fetch(u, { headers: key ? { "x-api-key": key } : {}, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!r.ok) return { ok: false, error: `Jupiter answered ${r.status}. ${r.status === 400 ? "Check the mints and the amount (in the token's smallest unit)." : ""}`.trim() };
  const q = (await r.json()) as { inAmount: string; outAmount: string; priceImpactPct: string; slippageBps: number; routePlan?: { swapInfo?: { label?: string } }[] };
  return { ok: true, inAmount: q.inAmount, outAmount: q.outAmount, priceImpactPct: q.priceImpactPct, slippageBps: q.slippageBps, route: (q.routePlan ?? []).map((p) => p.swapInfo?.label).filter(Boolean), note: "Quote only. Nothing was swapped." };
}

export async function jupiterPrice(mints: string[]) {
  const key = getEnv().JUPITER_API_KEY;
  const r = await fetch(`https://api.jup.ag/price/v3?ids=${mints.join(",")}`, { headers: key ? { "x-api-key": key } : {}, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!r.ok) return { ok: false, error: `Jupiter answered ${r.status}.` };
  const j = (await r.json()) as Record<string, { usdPrice?: number; liquidity?: number; priceChange24h?: number }>;
  return { ok: true, prices: mints.map((m) => ({ mint: m, usd: j[m]?.usdPrice ?? null, liquidityUsd: j[m]?.liquidity ?? null, change24hPct: j[m]?.priceChange24h ?? null })) };
}

/** Everything that proves a launch is correct: the token, the curve, the fee config, and what our records say. */
export async function verifyLaunch(mint: string) {
  const conn = connectionFor(net());
  const m = new PublicKey(mint);
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const mintInfo = await conn.getAccountInfo(m, "confirmed");
  checks.push({ name: "Token exists on-chain", ok: !!mintInfo, detail: mintInfo ? `Owned by ${mintInfo.owner.toBase58()}.` : "No account at this address on this network." });
  const curve = await conn.getAccountInfo(bondingCurvePda(m), "confirmed");
  checks.push({ name: "Pump.fun bonding curve exists", ok: !!curve, detail: curve ? "Found." : "Not found: this token was not created on pump.fun, or is not created yet." });

  let record: { status: string; mode: string; creator: string; shareholders: { address: string; shareBps: number }[]; tx1: string | null; tx2: string | null } | undefined;
  const q = sql();
  if (q) { await ensureSchema(); record = ((await q`SELECT status, mode, creator, shareholders, tx1, tx2 FROM launches WHERE mint = ${mint} AND network = ${net()} LIMIT 1`) as never[])[0]; }
  checks.push({ name: "Launched through this platform", ok: !!record, detail: record ? `Recorded as ${record.status} (${record.mode === "sponsored" ? "agent launch" : "self launch"}).` : "No record in our ledger." });

  const cfgAcct = await conn.getAccountInfo(feeSharingConfigPda(m), "confirmed");
  let split: Awaited<ReturnType<typeof verifySplitOnChain>> | undefined;
  let fees: { distributableLamports: number; minimumRequiredLamports: number; canDistribute: boolean } | undefined;
  if (record) {
    split = await verifySplitOnChain(conn, mint, record.shareholders);
    checks.push({ name: "Fee split matches what was promised", ok: split.ok, detail: split.ok ? "Both wallets and shares match, and the config can no longer be changed." : split.problems.join(" ") });
  } else {
    checks.push({ name: "Fee sharing is configured", ok: !!cfgAcct, detail: cfgAcct ? "A sharing config exists. Not a platform launch, so it is not compared to a promised split." : "No sharing config." });
  }
  if (cfgAcct && (!record || split?.ok)) {
    try { const r = await new OnlinePumpSdk(conn).getMinimumDistributableFee(m, simulationSigner()); fees = { distributableLamports: Number(r.distributableFees.toString()), minimumRequiredLamports: Number(r.minimumRequired.toString()), canDistribute: r.canDistribute }; } catch { /* leave fees undefined */ }
  }
  return { ok: checks.every((c) => c.ok), network: net(), mint, checks, onChainShareholders: split?.shareholders, fees, txs: { create: record?.tx1 ?? null, split: record?.tx2 ?? null } };
}

export async function walletFees(wallet: string) {
  const q = sql();
  if (!q) return { ok: false, error: "The database is not configured." };
  await ensureSchema();
  const launches = (await q`SELECT mint, name, symbol, status, shareholders FROM launches WHERE network = ${net()} AND shareholders @> ${JSON.stringify([{ address: wallet }])}::jsonb ORDER BY created_at DESC LIMIT 50`) as unknown as { mint: string; name: string; symbol: string; status: string; shareholders: { address: string; shareBps: number }[] }[];
  const paid = (await q`SELECT mint, SUM(lamports)::text AS s FROM fee_payouts WHERE wallet = ${wallet} AND network = ${net()} GROUP BY mint`) as unknown as { mint: string; s: string }[];
  const sent = new Map(paid.map((p) => [p.mint, Number(p.s)]));
  return { ok: true, network: net(), wallet, tokens: launches.map((l) => ({ mint: l.mint, name: l.name, symbol: l.symbol, status: l.status, sharePercent: (l.shareholders.find((s) => s.address === wallet)?.shareBps ?? 0) / 100, sentSol: sol(sent.get(l.mint) ?? 0) })), totalSentSol: sol([...sent.values()].reduce((a, b) => a + b, 0)) };
}

export interface TreasuryHealth { ok: boolean; problems: string[]; network?: string; treasury?: string | null; executeEnabled?: boolean; sponsoredEnabled?: boolean; maxLaunchSol?: number; maxDailySpendSol?: number; balanceSol?: number; signerReady?: boolean; database?: boolean; rpc?: { ok: boolean } }
export async function treasuryHealth(): Promise<TreasuryHealth> {
  const e = getEnv();
  const out: Record<string, unknown> = { network: e.NEXT_PUBLIC_SOLANA_NETWORK, treasury: e.TREASURY_PUBKEY ?? null, executeEnabled: isExecuteEnabled(), sponsoredEnabled: !!e.SPONSORED_ENABLED, maxLaunchSol: e.MAX_LAUNCH_SOL, maxDailySpendSol: e.MAX_DAILY_SPEND_SOL };
  const problems: string[] = [];
  let conn: Connection | undefined;
  try { conn = connectionFor(e.NEXT_PUBLIC_SOLANA_NETWORK); out.rpc = { ok: (await conn.getSlot("confirmed")) > 0 }; } catch (x) { out.rpc = { ok: false }; problems.push(x instanceof Error ? x.message : "RPC unavailable."); }
  if (!e.TREASURY_PUBKEY) problems.push("TREASURY_PUBKEY is not set.");
  else if (conn) { const b = await conn.getBalance(new PublicKey(e.TREASURY_PUBKEY), "confirmed"); out.balanceSol = sol(b); if (b < 0.05e9) problems.push(`Treasury balance is low (${sol(b).toFixed(4)} SOL).`); }
  try { loadTreasurySigner(); out.signerReady = true; } catch (x) { out.signerReady = false; problems.push(x instanceof Error ? x.message : "Treasury key not ready."); }
  out.database = !!sql();
  if (!sql()) problems.push("DATABASE_URL is not set.");
  return { ok: problems.length === 0, ...(out as Omit<TreasuryHealth, "ok" | "problems">), problems };
}
