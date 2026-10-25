import "server-only";
import { ensureSchema, sql } from "@/lib/db";
import { publicEnv } from "@/lib/public-env";
import { siteUrl, PUBLIC_LAUNCH_STATUSES } from "@/lib/site";
import { isSolanaAddress } from "@/lib/tools/address";
import { candlesFromTrades, latestTrades } from "./candles";
import { indexMint, refreshStats } from "./indexer";
import { dexMarket, geckoCandles, type DexMarket } from "./mainnet";
import { cidOf, fetchable } from "./ipfs";
import { GRADUATING_PCT, type Candle, type Interval, type Network, type PublicToken, type PublicTrade } from "./types";

export type Tab = "new" | "graduating" | "graduated" | "trending";
export const TABS: Tab[] = ["new", "graduating", "graduated", "trending"];

interface Row {
  mint: string; name: string; symbol: string; mode: string; network: string; created_at: string; uri: string;
  progress_pct: number | null; complete: boolean | null; price_sol: number | null; mcap_sol: number | null;
  volume24h_sol: number | null; trades24h: number | null; last_trade_at: string | null;
  image_url: string | null; description: string | null; links: { website?: string; twitter?: string; telegram?: string } | null;
  meta_at: string | null; updated_at: string | null;
}

const COLS = `l.mint, l.name, l.symbol, l.mode, l.network, l.created_at, l.uri, s.progress_pct, s.complete, s.price_sol, s.mcap_sol, s.volume24h_sol, s.trades24h, s.last_trade_at, s.image_url, s.description, s.links, s.meta_at, s.updated_at`;
const FROM = `FROM launches l LEFT JOIN mint_stats s ON s.mint = l.mint`;
const PUBLIC_WHERE = `l.network = $1 AND l.status = ANY($2)`;

const httpsOnly = (u: unknown): string | undefined => {
  if (typeof u !== "string") return undefined;
  const v = u.trim();
  if (cidOf(v)) return v;
  try { return new URL(v).protocol === "https:" ? v : undefined; } catch { return undefined; }
};
/** What the public API shows for an image: IPFS images are served through our own route (ipfs.io no longer serves plain requests). */
const imageOut = (u: string | null | undefined): string | null => {
  if (!u) return null;
  const c = cidOf(u);
  return c ? `${siteUrl()}/api/public/ipfs/${c}` : u;
};
const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");

function toPublic(r: Row, usd?: DexMarket | null): PublicToken {
  const net = (r.network === "mainnet-beta" ? "mainnet-beta" : "devnet") as Network;
  const pct = r.progress_pct ?? 0;
  const complete = r.complete ?? false;
  return {
    mint: r.mint, name: r.name, symbol: r.symbol, description: r.description ?? "", image: imageOut(r.image_url ?? usd?.image ?? null),
    network: net, mode: r.mode === "self" ? "self" : "agent", launchedAt: new Date(r.created_at).toISOString(),
    links: {
      ...(r.links?.website ? { website: r.links.website } : {}), ...(r.links?.twitter ? { twitter: r.links.twitter } : {}), ...(r.links?.telegram ? { telegram: r.links.telegram } : {}),
      explorer: `https://explorer.solana.com/address/${r.mint}${net === "devnet" ? "?cluster=devnet" : ""}`,
      pumpfun: `https://pump.fun/coin/${r.mint}`,
      page: `${siteUrl()}/token/${r.mint}`,
    },
    curve: { progressPct: pct, complete, graduatingSoon: !complete && pct >= GRADUATING_PCT },
    market: {
      priceSol: r.price_sol ?? usd?.priceSol ?? null, marketCapSol: r.mcap_sol, priceUsd: usd?.priceUsd ?? null, marketCapUsd: usd?.marketCapUsd ?? null,
      volume24hSol: r.volume24h_sol ?? 0, trades24h: r.trades24h ?? 0, lastTradeAt: r.last_trade_at ? new Date(r.last_trade_at).toISOString() : null,
    },
  };
}

async function metaFor(uri: string): Promise<{ image?: string; description: string; links: Record<string, string> } | null> {
  const u = fetchable(uri);
  if (!u) return null;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(10000), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    const links: Record<string, string> = {};
    for (const k of ["website", "twitter", "telegram"] as const) { const v = httpsOnly(j[k]); if (v) links[k] = v; }
    return { image: httpsOnly(j.image), description: clean(j.description, 600), links };
  } catch { return null; }
}

async function fillMeta(rows: Row[]) {
  const q = sql();
  if (!q) return;
  const need = rows.filter((r) => !r.meta_at || (!r.image_url && Date.now() - new Date(r.meta_at).getTime() > 600_000));
  await Promise.all(need.map(async (r) => {
    const m = await metaFor(r.uri);
    await q`INSERT INTO mint_stats (mint, image_url, description, links, meta_at) VALUES (${r.mint}, ${m?.image ?? null}, ${m?.description ?? null}, ${m ? JSON.stringify(m.links) : null}::jsonb, now())
      ON CONFLICT (mint) DO UPDATE SET image_url = EXCLUDED.image_url, description = EXCLUDED.description, links = EXCLUDED.links, meta_at = now()`;
  }));
}

const withDeadline = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((res) => setTimeout(res, ms))]);

/** Refreshes the few launches whose cached numbers are old. Capped, so a page view never turns into a crawl. */
export async function refreshStale(network: Network, cap = 8, budgetMs = 9000): Promise<void> {
  const q = sql();
  if (!q) return;
  await ensureSchema();
  const stale = (await q.query(
    `SELECT l.mint, l.uri, s.meta_at, s.image_url FROM (SELECT mint, uri FROM launches WHERE ${PUBLIC_WHERE.replace(/l\./g, "")} ORDER BY created_at DESC LIMIT 60) l LEFT JOIN mint_stats s ON s.mint = l.mint
     WHERE s.mint IS NULL OR (NOT s.complete AND s.updated_at < now() - interval '30 seconds') OR (s.complete AND s.updated_at < now() - interval '10 minutes')
     ORDER BY s.updated_at NULLS FIRST LIMIT ${Math.max(1, Math.min(20, cap))}`,
    [network, [...PUBLIC_LAUNCH_STATUSES]],
  )) as unknown as { mint: string; uri: string; meta_at: string | null; image_url: string | null }[];
  if (stale.length === 0) return;
  const deadline = Date.now() + budgetMs - 500;
  await withDeadline(Promise.all([
    (async () => {
      await Promise.all(stale.map((s) => indexMint(network, s.mint, { maxSigs: 40, deadline }).catch(() => null)));
      await refreshStats(network, stale.map((s) => s.mint));
    })(),
    fillMeta(stale.map((s) => s as unknown as Row)),
  ]).catch(() => undefined), budgetMs);
}

const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export async function listTokens(o: { tab: Tab; q?: string; limit: number; offset: number; network?: Network; noRefresh?: boolean }): Promise<{ tokens: PublicToken[]; hasMore: boolean; network: Network }> {
  const network = o.network ?? publicEnv.network;
  const db = sql();
  if (!db) return { tokens: [], hasMore: false, network };
  await ensureSchema();
  if (!o.noRefresh) await refreshStale(network);
  const params: unknown[] = [network, [...PUBLIC_LAUNCH_STATUSES]];
  let where = PUBLIC_WHERE;
  const term = (o.q ?? "").trim().slice(0, 64);
  if (term) {
    params.push(`%${escLike(term)}%`, term);
    where += ` AND (l.name ILIKE $3 OR l.symbol ILIKE $3 OR l.mint = $4)`;
  }
  let order = "l.created_at DESC";
  if (o.tab === "graduating") { where += ` AND COALESCE(s.complete, false) = false AND COALESCE(s.progress_pct, 0) >= ${GRADUATING_PCT}`; order = "s.progress_pct DESC, l.created_at DESC"; }
  else if (o.tab === "graduated") { where += ` AND s.complete = true`; order = "s.updated_at DESC, l.created_at DESC"; }
  else if (o.tab === "trending") order = "COALESCE(s.trades24h, 0) DESC, COALESCE(s.volume24h_sol, 0) DESC, l.created_at DESC";
  const rows = (await db.query(`SELECT ${COLS} ${FROM} WHERE ${where} ORDER BY ${order} LIMIT ${o.limit + 1} OFFSET ${o.offset}`, params)) as unknown as Row[];
  const page = rows.slice(0, o.limit);
  let usd = new Map<string, DexMarket | null>();
  if (network === "mainnet-beta") usd = new Map(await Promise.all(page.map(async (r) => [r.mint, await dexMarket(r.mint)] as const)));
  return { tokens: page.map((r) => toPublic(r, usd.get(r.mint))), hasMore: rows.length > o.limit, network };
}

async function rowFor(mint: string): Promise<Row | null> {
  const db = sql();
  if (!db) return null;
  await ensureSchema();
  const rows = (await db.query(`SELECT ${COLS} ${FROM} WHERE l.mint = $1 AND l.status = ANY($2) LIMIT 1`, [mint, [...PUBLIC_LAUNCH_STATUSES]])) as unknown as Row[];
  return rows[0] ?? null;
}

async function lazyIndex(row: Row, minAgeMs: number) {
  const db = sql();
  if (!db) return;
  const net = (row.network === "mainnet-beta" ? "mainnet-beta" : "devnet") as Network;
  const cur = (await db`SELECT extract(epoch FROM (now() - last_run)) * 1000 AS age FROM index_cursor WHERE mint = ${row.mint}`) as unknown as { age: number }[];
  if (cur[0] && Number(cur[0].age) < minAgeMs) return;
  await withDeadline(indexMint(net, row.mint, { maxSigs: 100, deadline: Date.now() + 7000 }).catch(() => null), 8000);
}

/** Reads one public token straight from the cache, with no refresh. Fast enough for server rendering and share images. */
export async function peekToken(mintRaw: string): Promise<PublicToken | null> {
  const mint = mintRaw.trim();
  if (!isSolanaAddress(mint)) return null;
  const row = await rowFor(mint);
  return row ? toPublic(row, null) : null;
}

/** One public token, or null when it was not launched here (or does not exist). Refreshes stale numbers first. */
export async function getToken(mintRaw: string): Promise<PublicToken | null> {
  const mint = mintRaw.trim();
  if (!isSolanaAddress(mint)) return null;
  let row = await rowFor(mint);
  if (!row) return null;
  const net = (row.network === "mainnet-beta" ? "mainnet-beta" : "devnet") as Network;
  const stale = !row.updated_at || Date.now() - new Date(row.updated_at).getTime() > 15_000;
  if (stale) {
    await lazyIndex(row, 10_000);
    await refreshStats(net, [mint]).catch(() => undefined);
    row = (await rowFor(mint)) ?? row;
    await fillMeta([row]).catch(() => undefined);
    row = (await rowFor(mint)) ?? row;
  }
  const usd = net === "mainnet-beta" ? await dexMarket(mint) : null;
  return toPublic(row, usd);
}

/** Candles for a launched token. Own indexed trades on the curve; GeckoTerminal for a graduated mainnet token. */
export async function getCandles(mintRaw: string, interval: Interval, limit: number): Promise<{ candles: Candle[]; source: string } | null> {
  const mint = mintRaw.trim();
  if (!isSolanaAddress(mint)) return null;
  const row = await rowFor(mint);
  if (!row) return null;
  const net = (row.network === "mainnet-beta" ? "mainnet-beta" : "devnet") as Network;
  if (net === "mainnet-beta" && row.complete) {
    const m = await dexMarket(mint);
    const g = m ? await geckoCandles(m.pair, interval, limit) : null;
    if (g && g.length) return { candles: g, source: "geckoterminal" };
  }
  await lazyIndex(row, 4_000);
  return { candles: await candlesFromTrades(mint, interval, limit), source: "rakaza-index" };
}

export async function tradesFor(mintRaw: string, limit: number): Promise<{ trades: PublicTrade[] } | null> {
  const mint = mintRaw.trim();
  if (!isSolanaAddress(mint)) return null;
  const row = await rowFor(mint);
  if (!row) return null;
  await lazyIndex(row, 4_000);
  return { trades: await latestTrades(mint, limit) };
}

export async function networkOf(mintRaw: string): Promise<Network | null> {
  const row = isSolanaAddress(mintRaw.trim()) ? await rowFor(mintRaw.trim()) : null;
  return row ? ((row.network === "mainnet-beta" ? "mainnet-beta" : "devnet") as Network) : null;
}
