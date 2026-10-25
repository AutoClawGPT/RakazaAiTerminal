import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { getEnv } from "@/lib/env";
import { PERSONA_MODEL_DEFAULT } from "@/lib/brain/river";
import { sql } from "@/lib/db";
import { redis, redisReadOnly } from "@/lib/upstash";
import { loadTreasurySigner } from "@/lib/launch/execute";

export type HealthStatus = "ok" | "missing" | "failed";
export interface HealthRow { id: string; label: string; status: HealthStatus; ms: number; detail: string; envNames: string[]; note?: string }
export interface HealthReport { at: string; network: string; ok: boolean; counts: Record<HealthStatus, number>; rows: HealthRow[] }

/** Every secret value in the environment, so no message can ever carry one out. */
function secretValues(): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (v && v.length >= 6 && /KEY|TOKEN|SECRET|PRIVATE|PASSWORD|DATABASE|HELIUS|URL|JWT|BOT|AUTH/i.test(k)) out.push(v);
  }
  return out.sort((a, b) => b.length - a.length);
}
export function scrub(text: string): string {
  let t = String(text);
  for (const s of secretValues()) t = t.split(s).join("[hidden]");
  return t.replace(/(api-key|apikey|key|token|secret)=([^&\s"']+)/gi, "$1=[hidden]").slice(0, 200);
}

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"; // same id the pump SDK exports
const TIMEOUT = 9000;
class Missing extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function http(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
}

/** One check: a real minimal call, one retry on a network error or a 5xx/429. Details never include a key or a URL that holds one. */
async function check(id: string, label: string, envNames: string[], fn: () => Promise<string>, note?: string): Promise<HealthRow> {
  const t0 = Date.now();
  let lastErr = "failed";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const detail = await fn();
      return { id, label, status: "ok", ms: Date.now() - t0, detail: scrub(detail), envNames, note };
    } catch (e) {
      if (e instanceof Missing) return { id, label, status: "missing", ms: Date.now() - t0, detail: scrub(e.message), envNames, note };
      lastErr = e instanceof Error ? e.message : "failed";
      if (/rejected|401|403/.test(lastErr)) break;
      await sleep(400);
    }
  }
  return { id, label, status: "failed", ms: Date.now() - t0, detail: scrub(lastErr.includes("timed out") || lastErr.includes("aborted") ? "timed out" : lastErr), envNames, note };
}

const need = (v: string | undefined, name: string) => { if (!v) throw new Missing(`${name} is not set`); return v; };
const status = (r: Response, who: string) => {
  if (r.status === 401 || r.status === 403) throw new Error(`${who} rejected the key (${r.status})`);
  if (!r.ok) throw new Error(`${who} answered ${r.status}`);
};

async function rpcSlot(url: string): Promise<number> {
  const r = await http(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [] }) });
  status(r, "RPC");
  const j = (await r.json()) as { result?: number; error?: unknown };
  if (typeof j.result !== "number") throw new Error("RPC returned no slot");
  return j.result;
}

async function river(key: string | undefined, name: string, model?: string): Promise<string> {
  const e = getEnv();
  const k = need(key, name);
  const m = model ?? PERSONA_MODEL_DEFAULT;
  const r = await http(`${e.RIVER_BASE_URL}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${k}`, "content-type": "application/json" }, body: JSON.stringify({ model: m, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }) });
  status(r, "River");
  const j = (await r.json()) as { choices?: unknown[] };
  if (!j.choices?.length) throw new Error("River returned no choices");
  return `answered with model ${m}`;
}

/** Real, minimal, read-only call to every integration. Never returns or logs a secret. */
export async function integrationsHealth(): Promise<HealthReport> {
  const e = getEnv();
  const net = e.NEXT_PUBLIC_SOLANA_NETWORK;
  const rpcUrl = net === "mainnet-beta" ? e.HELIUS_MAINNET : e.HELIUS_DEVNET;
  const rows = await Promise.all([
    check("helius", `Helius RPC (${net})`, [net === "mainnet-beta" ? "HELIUS_MAINNET" : "HELIUS_DEVNET"], async () => `slot ${await rpcSlot(need(rpcUrl, net === "mainnet-beta" ? "HELIUS_MAINNET" : "HELIUS_DEVNET"))}`),
    check("helius-main", "Helius RPC (mainnet, scans and fee reads)", ["HELIUS_MAINNET"], async () => `slot ${await rpcSlot(need(e.HELIUS_MAINNET, "HELIUS_MAINNET"))}`),
    check("river-agent", "River agent key", ["RIVER_AGENT", "RIVER_MODEL_AGENT"], () => river(e.RIVER_AGENT, "RIVER_AGENT", e.RIVER_MODEL_AGENT)),
    check("river-persona", "River persona key", ["RIVER_RAKAZO", "RIVER_MODEL_PERSONA"], () => river(e.RIVER_RAKAZO ?? e.RIVER_AGENT, "RIVER_RAKAZO", e.RIVER_MODEL_PERSONA)),
    check("pinata", "Pinata (IPFS)", ["PINATA_API_KEY", "PINATA_API_SECRET"], async () => {
      const k = need(process.env.PINATA_API_KEY, "PINATA_API_KEY"), s = need(process.env.PINATA_API_SECRET, "PINATA_API_SECRET");
      const r = await http("https://api.pinata.cloud/data/testAuthentication", { headers: { pinata_api_key: k, pinata_secret_api_key: s } });
      status(r, "Pinata");
      return "authentication accepted";
    }),
    check("pollinations", "Pollinations (image)", ["POLLINATIONS_API_KEY", "POLLINATIONS_IMAGE_MODEL"], async () => {
      const k = need(e.POLLINATIONS_API_KEY, "POLLINATIONS_API_KEY");
      const r = await http("https://gen.pollinations.ai/account/balance", { headers: { Authorization: `Bearer ${k}` } });
      status(r, "Pollinations");
      const j = (await r.json()) as { balance?: number };
      return `key accepted, balance ${Number(j.balance ?? 0).toFixed(2)}, model ${e.POLLINATIONS_IMAGE_MODEL}`;
    }),
    check("deepgram", "Deepgram (voice)", ["DEEPGRAM_API_KEY"], async () => {
      const k = need(e.DEEPGRAM_API_KEY, "DEEPGRAM_API_KEY");
      const r = await http("https://api.deepgram.com/v1/projects", { headers: { authorization: `Token ${k}` } });
      status(r, "Deepgram");
      return "key accepted";
    }),
    check("pumpfun", "pump.fun program (on-chain SDK)", [], async () => {
      const url = need(rpcUrl, "an RPC URL");
      const info = await new Connection(url, "confirmed").getAccountInfo(new PublicKey(PUMP_PROGRAM));
      if (!info?.executable) throw new Error(`pump.fun program not found on ${net}`);
      return `program live on ${net}`;
    }, "The code uses the on-chain pump.fun SDK. It needs no pump.fun API key."),
    check("neon", "Neon Postgres", ["DATABASE_URL"], async () => {
      const q = sql();
      if (!q) throw new Missing("DATABASE_URL is not set");
      const r = (await q`SELECT 1 AS ok`) as { ok: number }[];
      if (r[0]?.ok !== 1) throw new Error("unexpected answer");
      return "query ran";
    }),
    check("upstash", "Upstash Redis (read and write)", ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], async () => {
      const r = redis();
      if (!r) throw new Missing("UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not set");
      if ((await r.ping()) !== "PONG") throw new Error("no PONG");
      return "PONG";
    }),
    check("upstash-ro", "Upstash read-only token", ["UPSTASH_READONLY_TOKEN"], async () => {
      const r = redisReadOnly();
      if (!r) throw new Missing("UPSTASH_READONLY_TOKEN is not set");
      await r.get("rk:health");
      return "read ok";
    }),
    check("telegram", "Telegram bot", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_ID"], async () => {
      const t = need(process.env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
      const r = await http(`https://api.telegram.org/bot${t}/getMe`);
      if (r.status === 401 || r.status === 404) throw new Error("Telegram rejected the bot token");
      status(r, "Telegram");
      const j = (await r.json()) as { result?: { username?: string } };
      return `bot @${j.result?.username ?? "unknown"}${process.env.TELEGRAM_ADMIN_ID ? ", admin id set" : ", TELEGRAM_ADMIN_ID missing"}`;
    }),
    check("treasury", "Treasury wallet and signer", ["TREASURY_PUBKEY", "TREASURY_PRIVATE_KEY"], async () => {
      const pub = need(e.TREASURY_PUBKEY, "TREASURY_PUBKEY");
      const url = need(rpcUrl, "an RPC URL");
      let signer: string;
      try { signer = loadTreasurySigner().publicKey.toBase58(); } catch { throw new Missing("TREASURY_PRIVATE_KEY is not set or not readable"); }
      if (signer !== pub) throw new Error("the signing key does not match TREASURY_PUBKEY");
      const lamports = await new Connection(url, "confirmed").getBalance(new PublicKey(pub));
      return `signer matches, balance ${(lamports / 1e9).toFixed(4)} SOL on ${net}`;
    }),
    check("jupiter", "Jupiter prices", ["JUPITER_API_KEY"], async () => {
      const k = need(e.JUPITER_API_KEY, "JUPITER_API_KEY");
      const r = await http("https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112", { headers: { "x-api-key": k } });
      status(r, "Jupiter");
      return "price answered";
    }),
    check("dexscreener", "DexScreener (no key)", [], async () => {
      const r = await http("https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112");
      status(r, "DexScreener");
      return "answered";
    }),
  ]);
  const counts: Record<HealthStatus, number> = { ok: 0, missing: 0, failed: 0 };
  for (const r of rows) counts[r.status]++;
  return { at: new Date().toISOString(), network: net, ok: counts.missing + counts.failed === 0, counts, rows };
}

/** Plain-text version for Telegram and the agent. */
export function healthText(h: HealthReport): string {
  const icon = { ok: "OK", missing: "MISSING", failed: "FAILED" } as const;
  return [`Integrations on ${h.network}: ${h.counts.ok} ok, ${h.counts.missing} missing, ${h.counts.failed} failed`, ...h.rows.map((r) => `${icon[r.status]}  ${r.label}: ${r.detail}${r.status === "ok" ? ` (${r.ms} ms)` : r.envNames.length ? ` [${r.envNames.join(", ")}]` : ""}`)].join("\n");
}
