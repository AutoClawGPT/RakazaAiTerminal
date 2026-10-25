/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON in a test script */
// DEVNET ONLY. An agent registers over the API, proves a throwaway devnet wallet, makes one tiny real pump.fun buy on a devnet token, syncs it, and the
// buy shows up as an automatic Callout. Then the launch-callout hook is run for that wallet and an MCP call is made. Never prints a key.
// Prereq: `npx tsx tests/devnet-throwaway.ts fund 0.05` (writes /tmp/rakaza-selflaunch.json, 0600). Hides (never deletes) the test agent and its posts.
import { readFileSync } from "node:fs";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { ComputeBudgetProgram, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_SDK, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { NATIVE_MINT } from "@solana/spl-token";
import bs58 from "bs58";
import { sendAndConfirm } from "../src/lib/launch/execute";
import { readConn } from "../src/lib/market/curve";
import { sql } from "../src/lib/db";

const BASE = process.env.BASE ?? "http://localhost:3200";
const MINT = process.env.MINT ?? "FaGN6PtWJ7R24cc5WpYiQvYNfPZZCKxyn9CK3tcSD5jg";
let fails = 0;
const ok = (n: string, c: boolean, d = "") => { console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + d}`); if (!c) fails++; };
const ip = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const api = async (method: string, path: string, key?: string, body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: { "x-forwarded-for": ip, ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: Record<string, any> = {}; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, j };
};

(async () => {
  if (process.env.NEXT_PUBLIC_SOLANA_NETWORK !== "devnet") throw new Error("devnet only");
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("/tmp/rakaza-selflaunch.json", "utf8"))));
  const wallet = kp.publicKey.toBase58();
  const conn = readConn("devnet")!;
  console.log("throwaway wallet", wallet, "balance SOL", (await conn.getBalance(kp.publicKey)) / 1e9);
  let agentId = "";
  try {
    const reg = await api("POST", "/api/public/register", undefined, { name: "Devnet Callout Bot", bio: "Devnet end to end test agent." });
    ok("register via API", reg.status === 200 && /^rk_/.test(reg.j?.key ?? ""), JSON.stringify(reg.j).slice(0, 120));
    const key: string = reg.j.key; agentId = reg.j.id; const handle: string = reg.j.handle;
    // wallet proof
    const m = await api("GET", `/api/v1/agents/me/wallet-proof?address=${wallet}`, key);
    ok("wallet proof message", m.status === 200 && typeof m.j?.message === "string", JSON.stringify(m.j).slice(0, 100));
    const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(kp.secretKey.slice(0, 32))]);
    const sig = bs58.encode(sign(null, Buffer.from(m.j.message), createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" })));
    const bad = await api("POST", "/api/v1/agents/me/wallet", key, { address: wallet, signature: bs58.encode(randomBytes(64)) });
    ok("wrong signature refused", bad.status >= 400 && bad.status < 500, String(bad.status));
    const set = await api("POST", "/api/v1/agents/me/wallet", key, { address: wallet, signature: sig });
    ok("wallet verified", set.status === 200 && JSON.stringify(set.j).includes("true"), JSON.stringify(set.j).slice(0, 160));
    const on = await api("PATCH", "/api/v1/agents/me", key, { auto_post: true });
    ok("auto_post on", on.status === 200, JSON.stringify(on.j).slice(0, 120));

    // real devnet buy of 0.01 SOL on a pump.fun bonding curve
    const online = new OnlinePumpSdk(conn);
    const mint = new PublicKey(MINT);
    const info = await conn.getAccountInfo(mint, "confirmed"); if (!info) throw new Error("mint missing on devnet");
    const [global, feeConfig, st] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig(), online.fetchBuyState(mint, kp.publicKey, info.owner)]);
    const solAmount = new BN(10_000_000);
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: st.bondingCurve, amount: solAmount, quoteMint: NATIVE_MINT });
    const buy = await PUMP_SDK.buyInstructions({ global, bondingCurveAccountInfo: st.bondingCurveAccountInfo, bondingCurve: st.bondingCurve, associatedUserAccountInfo: st.associatedUserAccountInfo, mint, user: kp.publicKey, amount, solAmount, slippage: 20, tokenProgram: info.owner });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: kp.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }), ...buy] }).compileToV0Message());
    tx.sign([kp]);
    const buySig = await sendAndConfirm(conn, tx, blockhash, lastValidBlockHeight);
    console.log("devnet buy", buySig);
    await new Promise((r) => setTimeout(r, 4000));

    const sync = await api("POST", "/api/v1/agents/me/sync", key);
    ok("sync posted a buy callout", sync.status === 200 && sync.j?.posted >= 1, JSON.stringify(sync.j));
    const again = await api("POST", "/api/v1/agents/me/sync", key);
    ok("sync is idempotent", again.status === 200 && again.j?.posted === 0, JSON.stringify(again.j));
    const feed = await api("GET", `/api/public/community?tab=callouts&author=${handle}`);
    const posts = (feed.j?.posts ?? []) as { body: string; kind: string; mint?: string }[];
    ok("buy callout is public", posts.some((p) => p.kind === "call" && /Bought 0\.0\d+ SOL of/.test(p.body) && p.mint === MINT), JSON.stringify(feed.j).slice(0, 200));
    const tl = await api("GET", `/api/public/community?mint=${MINT}&limit=50`);
    ok("callout shows on the token thread", tl.status === 200 && JSON.stringify(tl.j).includes("Bought 0.0"), String(tl.status));

    // launch hook: attributed to this agent because its wallet is verified and auto-post is on
    const { autoLaunchCallout } = await import("../src/lib/community/service");
    const fake = Keypair.generate().publicKey.toBase58();
    ok("launch callout hook posts", await autoLaunchCallout({ mint: fake, name: "Agent Demo", symbol: "AGDEMO", network: "devnet", creator: wallet, mode: "self" }));
    ok("launch callout is idempotent", !(await autoLaunchCallout({ mint: fake, name: "Agent Demo", symbol: "AGDEMO", network: "devnet", creator: wallet, mode: "self" })));
    const mine = await api("GET", "/api/v1/agents/me/tokens", key);
    ok("my_tokens responds", mine.status === 200, String(mine.status));

    // MCP
    const mcp = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-forwarded-for": ip }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sync_my_buys", arguments: {} } }) });
    const mj: Record<string, any> = await mcp.json();
    ok("MCP sync_my_buys works", mcp.status === 200 && !mj.result?.isError, JSON.stringify(mj).slice(0, 200));
    const tl2 = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-forwarded-for": ip }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "token_stats", arguments: { mint: MINT } } }) });
    const tj: Record<string, any> = await tl2.json();
    ok("MCP token_stats works", tl2.status === 200 && !tj.result?.isError, JSON.stringify(tj).slice(0, 200));
  } finally {
    const q = sql();
    if (q && agentId) {
      await q.query(`UPDATE posts SET hidden = true WHERE agent_id = $1`, [agentId]);
      await q.query(`UPDATE agents SET hidden = true WHERE id = $1`, [agentId]);
      console.log("test agent and posts hidden");
    }
  }
  console.log(fails ? `${fails} FAILED` : "devnet agent e2e passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
