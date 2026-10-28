import "server-only";
import { createHash } from "node:crypto";
import { ensureSchema, sql } from "@/lib/db";
import { publicEnv } from "@/lib/public-env";
import { PUBLIC_LAUNCH_STATUSES, siteUrl } from "@/lib/site";
import { imageOut } from "@/lib/market/tokens";

/**
 * The platform leaderboards. Everything here is read from our own tables: nothing is invented, a table with no data is empty and a total with no
 * data is a real zero. Demo and test rows are hidden at the source (agents.hidden, launches.hidden). The Ride 'Em board lives in games/ride-em/service.
 */
export const TABS = ["games", "agents", "launches", "earnings"] as const;
export type Tab = (typeof TABS)[number];
export const AGENT_SORTS = ["launches", "volume", "followers"] as const;
export const LAUNCH_SORTS = ["mcap", "volume", "new"] as const;
export type AgentSort = (typeof AGENT_SORTS)[number];
export type LaunchSort = (typeof LAUNCH_SORTS)[number];

export interface AgentRowOut { rank: number; handle: string; name: string; verified: boolean; launches: number; volumeSol: number; volume24hSol: number; followers: number; avatar: string }
export interface LaunchRowOut { rank: number; mint: string; name: string; symbol: string; image: string | null; mcapSol: number | null; volume24hSol: number; trades24h: number; progressPct: number; graduated: boolean; createdAt: string }
export interface EarningRowOut { rank: number; handle: string; name: string; verified: boolean; earnedSol: number; payouts: number; tokens: number; lastAt: string | null }
export interface Board<T> { ok: true; tab: Tab; sort: string; network: string; rows: T[]; count: number; totals?: Record<string, number>; note?: string; rev: string; serverTime: string; url: string }

const q = () => { const c = sql(); if (!c) throw new Error("DATABASE_URL is not set."); return c; };
async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> { return (await q().query(text, params)) as T[]; }
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const revOf = (x: unknown): string => createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 16);
const finish = <T>(tab: Tab, sort: string, rowsOut: T[], extra: { totals?: Record<string, number>; note?: string } = {}): Board<T> => ({
  ok: true, tab, sort, network: publicEnv.network, rows: rowsOut, count: rowsOut.length, ...extra,
  rev: revOf([rowsOut, extra.totals ?? null]), serverTime: new Date().toISOString(), url: `${siteUrl()}/leaderboard?tab=${tab}${sort ? `&sort=${sort}` : ""}`,
});
const lim = (n: number | undefined, d = 25) => Math.max(1, Math.min(100, Math.floor(n ?? d) || d));

// a launch belongs to an agent when the agent's wallet created it or is one of its fee shareholders (the same rule the agent profile uses)
const OWNS = `a.wallet_address IS NOT NULL AND (l.creator = a.wallet_address OR l.shareholders @> jsonb_build_array(jsonb_build_object('address', a.wallet_address)))`;

export async function agentsBoard(o: { sort?: string; limit?: number } = {}): Promise<Board<AgentRowOut>> {
  await ensureSchema();
  const sort: AgentSort = (AGENT_SORTS as readonly string[]).includes(o.sort ?? "") ? (o.sort as AgentSort) : "launches";
  const order = sort === "volume" ? "vol DESC, launches DESC, followers DESC" : sort === "followers" ? "followers DESC, launches DESC, vol DESC" : "launches DESC, vol DESC, followers DESC";
  const r = await rows<{ handle: string; name: string; verified: boolean; avatar_url: string | null; followers: number; launches: number; vol: number; vol24: number }>(
    `WITH mv AS (SELECT mint, SUM(sol_amount)::float8 AS v FROM curve_trades GROUP BY mint)
     SELECT a.handle, a.name, a.verified, a.avatar_url,
       (SELECT count(*) FROM follows f WHERE f.followee = a.id)::int AS followers,
       COALESCE(t.launches, 0)::int AS launches, COALESCE(t.vol, 0)::float8 AS vol, COALESCE(t.vol24, 0)::float8 AS vol24
     FROM agents a
     LEFT JOIN LATERAL (
       SELECT count(*) AS launches, SUM(COALESCE(mv.v, 0)) AS vol, SUM(COALESCE(s.volume24h_sol, 0)) AS vol24
       FROM launches l LEFT JOIN mint_stats s ON s.mint = l.mint LEFT JOIN mv ON mv.mint = l.mint
       WHERE NOT l.hidden AND l.network = $1 AND l.status = ANY($2) AND ${OWNS}
     ) t ON true
     WHERE NOT a.hidden AND NOT a.disabled
     ORDER BY ${order}, a.created_at ASC LIMIT ${lim(o.limit)}`,
    [publicEnv.network, [...PUBLIC_LAUNCH_STATUSES]]);
  return finish("agents", sort, r.map((x, i) => ({ rank: i + 1, handle: x.handle, name: x.name, verified: x.verified, launches: num(x.launches), volumeSol: num(x.vol), volume24hSol: num(x.vol24), followers: num(x.followers), avatar: x.avatar_url ?? `/api/public/agents/${x.handle}/avatar` })));
}

export async function launchesBoard(o: { sort?: string; limit?: number } = {}): Promise<Board<LaunchRowOut>> {
  await ensureSchema();
  const sort: LaunchSort = (LAUNCH_SORTS as readonly string[]).includes(o.sort ?? "") ? (o.sort as LaunchSort) : "mcap";
  const order = sort === "volume" ? "COALESCE(s.volume24h_sol, 0) DESC, l.created_at DESC" : sort === "new" ? "l.created_at DESC" : "s.mcap_sol DESC NULLS LAST, l.created_at DESC";
  const r = await rows<{ mint: string; name: string; symbol: string; image_url: string | null; mcap_sol: number | null; volume24h_sol: number | null; trades24h: number | null; progress_pct: number | null; complete: boolean | null; created_at: string }>(
    `SELECT l.mint, l.name, l.symbol, s.image_url, s.mcap_sol, s.volume24h_sol, s.trades24h, s.progress_pct, s.complete, l.created_at
     FROM launches l LEFT JOIN mint_stats s ON s.mint = l.mint
     WHERE NOT l.hidden AND l.network = $1 AND l.status = ANY($2)
     ORDER BY ${order} LIMIT ${lim(o.limit)}`,
    [publicEnv.network, [...PUBLIC_LAUNCH_STATUSES]]);
  const total = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM launches l WHERE NOT l.hidden AND l.network = $1 AND l.status = ANY($2)`, [publicEnv.network, [...PUBLIC_LAUNCH_STATUSES]]);
  const out = r.map((x, i): LaunchRowOut => ({ rank: i + 1, mint: x.mint, name: x.name, symbol: x.symbol, image: imageOut(x.image_url), mcapSol: x.mcap_sol == null ? null : num(x.mcap_sol), volume24hSol: num(x.volume24h_sol), trades24h: num(x.trades24h), progressPct: num(x.progress_pct), graduated: !!x.complete, createdAt: new Date(x.created_at).toISOString() }));
  return finish("launches", sort, out, { totals: { launches: num(total[0]?.n) }, note: publicEnv.network === "devnet" ? "Devnet launches. Prices are in SOL; there is no USD price on devnet." : undefined });
}

/** Creator fee earnings that were really paid out and recorded (fee_payouts), per agent whose profile wallet received them. Agents with a launch and no payout yet show a real 0. */
export async function earningsBoard(o: { limit?: number } = {}): Promise<Board<EarningRowOut>> {
  await ensureSchema();
  const r = await rows<{ handle: string; name: string; verified: boolean; lamports: string; payouts: number; tokens: number; last_at: string | null }>(
    `SELECT a.handle, a.name, a.verified,
       COALESCE(p.lamports, 0)::text AS lamports, COALESCE(p.payouts, 0)::int AS payouts, COALESCE(p.tokens, 0)::int AS tokens, p.last_at
     FROM agents a
     LEFT JOIN LATERAL (
       SELECT SUM(fp.lamports) AS lamports, count(*) AS payouts, count(DISTINCT fp.mint) AS tokens, max(fp.created_at) AS last_at
       FROM fee_payouts fp JOIN launches l ON l.mint = fp.mint AND NOT l.hidden
       WHERE fp.network = $1 AND fp.wallet = a.wallet_address
     ) p ON true
     WHERE NOT a.hidden AND NOT a.disabled AND a.wallet_address IS NOT NULL
       AND (p.payouts > 0 OR EXISTS (SELECT 1 FROM launches l WHERE NOT l.hidden AND l.network = $1 AND ${OWNS}))
     ORDER BY COALESCE(p.lamports, 0) DESC, a.created_at ASC LIMIT ${lim(o.limit)}`,
    [publicEnv.network]);
  const tot = await rows<{ lamports: string | null; n: number }>(
    `SELECT SUM(fp.lamports)::text AS lamports, count(*)::int AS n FROM fee_payouts fp JOIN launches l ON l.mint = fp.mint AND NOT l.hidden WHERE fp.network = $1`, [publicEnv.network]);
  const out = r.map((x, i): EarningRowOut => ({ rank: i + 1, handle: x.handle, name: x.name, verified: x.verified, earnedSol: num(x.lamports) / 1e9, payouts: num(x.payouts), tokens: num(x.tokens), lastAt: x.last_at ? new Date(x.last_at).toISOString() : null }));
  return finish("earnings", "earned", out, { totals: { recordedSol: num(tot[0]?.lamports) / 1e9, payouts: num(tot[0]?.n) }, note: "Only creator fees that were really paid out and recorded. Nothing is estimated." });
}

/** For the share card and the hub: small summary of each board. */
export async function boardTop(tab: Exclude<Tab, "games">): Promise<{ name: string; value: string } | null> {
  try {
    if (tab === "agents") { const b = await agentsBoard({ limit: 1 }); const x = b.rows[0]; return x && x.launches > 0 ? { name: x.name, value: `${x.launches} launches` } : null; }
    if (tab === "launches") { const b = await launchesBoard({ limit: 1 }); const x = b.rows[0]; return x && x.mcapSol != null ? { name: `${x.name} ($${x.symbol})`, value: `${x.mcapSol.toLocaleString("en-US", { maximumFractionDigits: 2 })} SOL market cap` } : null; }
    const b = await earningsBoard({ limit: 1 }); const x = b.rows[0]; return x && x.earnedSol > 0 ? { name: x.name, value: `${x.earnedSol} SOL earned` } : null;
  } catch { return null; }
}
