import "server-only";
import { getEnv } from "@/lib/env";
import { riverChat } from "@/lib/brain/river";

export interface Stats {
  solUsd?: number;
  solChange24h?: number;
  tps?: number;
  slot?: number;
  at: string;
}
export interface DiaryEntry {
  at: string;
  title: string;
  body: string;
  stats: Stats;
  fromRiver: boolean;
}

const TTL = 30 * 60_000;
let cache: { at: number; entry: DiaryEntry } | null = null;
let inflight: Promise<DiaryEntry> | null = null;

async function gatherStats(): Promise<Stats> {
  const s: Stats = { at: new Date().toISOString() };
  const e = getEnv();
  await Promise.all([
    fetch("https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112", { cache: "no-store", signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then((j: { pairs?: { chainId: string; priceUsd?: string; priceChange?: { h24?: number }; liquidity?: { usd?: number }; baseToken: { address: string } }[] }) => {
        const p = (j.pairs ?? []).filter((x) => x.chainId === "solana" && x.baseToken.address.startsWith("So1111")).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        if (p?.priceUsd) { s.solUsd = Number(p.priceUsd); s.solChange24h = p.priceChange?.h24; }
      })
      .catch(() => {}),
    e.HELIUS_MAINNET
      ? fetch(e.HELIUS_MAINNET, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "getRecentPerformanceSamples", params: [3] }, { jsonrpc: "2.0", id: 2, method: "getSlot" }]), signal: AbortSignal.timeout(10000) })
          .then((r) => r.json())
          .then((j: { id: number; result: unknown }[]) => {
            for (const x of j) {
              if (x.id === 1) {
                const arr = x.result as { numTransactions: number; samplePeriodSecs: number }[];
                const tx = arr.reduce((a, b) => a + b.numTransactions, 0), secs = arr.reduce((a, b) => a + b.samplePeriodSecs, 0);
                if (secs) s.tps = Math.round(tx / secs);
              } else if (x.id === 2) s.slot = Number(x.result);
            }
          })
          .catch(() => {})
      : Promise.resolve(),
  ]);
  return s;
}

const SYSTEM = `You are Rakaza, a playful, warm AI character on a Solana launch platform, writing a short diary entry in first person.
Use ONLY the numbers in the JSON stats given. Never invent prices, launches, users or events. If a number is missing, do not mention it.
The platform has not launched any tokens yet, you may say you are still getting ready. No financial advice, no hype about returns.
Write 3 to 5 sentences, charming and a little funny. Reply with JSON only: {"title":"short title","body":"the entry"}`;

function plain(s: Stats): DiaryEntry {
  const bits = [s.solUsd != null ? `SOL is at $${s.solUsd.toFixed(2)}${s.solChange24h != null ? `, ${s.solChange24h >= 0 ? "up" : "down"} ${Math.abs(s.solChange24h).toFixed(1)}% today` : ""}` : null, s.tps != null ? `the network is moving about ${s.tps} transactions a second` : null].filter(Boolean);
  return { at: s.at, title: "Checking the pulse", body: bits.length ? `Quick note from me: ${bits.join(", and ")}. I’m still getting ready to launch, so for now I’m watching.` : "I couldn’t reach the market feeds just now, so I’m resting and watching.", stats: s, fromRiver: false };
}

async function write(): Promise<DiaryEntry> {
  const stats = await gatherStats();
  const r = await riverChat([{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ solUsd: stats.solUsd, solChange24hPercent: stats.solChange24h, transactionsPerSecond: stats.tps, slot: stats.slot, utc: stats.at }) }], { key: "persona", maxTokens: 350 });
  if (r.ok) {
    try {
      const j = JSON.parse(r.text.replace(/^```(?:json)?|```$/gm, "").trim()) as { title?: string; body?: string };
      if (j.title && j.body) return { at: stats.at, title: String(j.title).slice(0, 80), body: String(j.body).slice(0, 700), stats, fromRiver: true };
    } catch {}
  }
  return plain(stats);
}

/** One entry per 30 minutes, shared by every visitor so a busy page cannot run up River calls. */
export async function currentDiary(): Promise<DiaryEntry> {
  if (cache && Date.now() - cache.at < TTL) return cache.entry;
  inflight ??= write().then((entry) => {
    cache = { at: Date.now(), entry };
    return entry;
  }).finally(() => { inflight = null; });
  return inflight;
}
