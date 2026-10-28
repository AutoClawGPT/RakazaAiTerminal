import "server-only";
import { ensureSchema, sql } from "@/lib/db";
import type { AgentRow } from "@/lib/agents/service";
import { siteUrl } from "@/lib/site";
import { DROP_SCHEDULE, eligibilityOf } from "./drops";
import { GAME_ID, MAX_RUN_SECONDS, PLAYS_PER_DAY, RANGES, RUN_EXPIRY_HOURS, SIM_VERSION, VERSION, dailySeed, dropOf, isKnownMode, isRankedMode, newRunId, rankedModes, randomSeed, rankedConfig, utcDay, verifyRun, type Range } from "./engine";

/** Everything the games layer does against the database. The REST routes, the web UI and the MCP tools all call these. */
export type R = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): R => ({ status, body: { ok: false, error, message, ...extra } });
const q = () => { const c = sql(); if (!c) throw new Error("DATABASE_URL is not set."); return c; };
async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> { return (await q().query(text, params)) as T[]; }

const nextMidnightIso = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString(); };

export async function playsLeft(agentId: string): Promise<{ limit: number; used: number; left: number; day: string; resetsAt: string }> {
  await ensureSchema();
  const r = await rows<{ n: string }>(`SELECT count(*)::text AS n FROM game_runs WHERE agent_id = $1 AND game = $2 AND day = (now() AT TIME ZONE 'utc')::date`, [agentId, GAME_ID]);
  const used = Math.min(PLAYS_PER_DAY, Number(r[0]?.n ?? 0));
  return { limit: PLAYS_PER_DAY, used, left: PLAYS_PER_DAY - used, day: utcDay(), resetsAt: nextMidnightIso() };
}

export function listGames() {
  return {
    games: [{
      id: GAME_ID, name: "Ride 'Em, Rakaza!", version: VERSION, simVersion: SIM_VERSION, url: `${siteUrl()}/games/ride-em`,
      playsPerDay: PLAYS_PER_DAY, lives: 3, rankedModes: ["daily", ...rankedModes()],
      rules: "Three hits end the run. The score is computed by the server replaying your seed and inputLog; the score you send is only checked against it.",
      leaderboard: `${siteUrl()}/leaderboard?tab=games`, leaderboardRanges: [...RANGES, "daily"], protocol: `${siteUrl()}/skill.md#games`,
    }],
  };
}

export async function startRun(agent: AgentRow, input: { mode?: string; daily?: boolean; config?: unknown }): Promise<R> {
  await ensureSchema();
  const daily = input.mode === "daily" || !!input.daily;
  const mode = input.mode === "daily" || !input.mode ? "classic" : input.mode;
  if (!isKnownMode(mode)) return fail(400, "bad_mode", "Unknown mode.");
  if (!isRankedMode(mode)) return fail(400, "zen_unranked", "ZEN is practice only: it cannot be ranked. Pick another mode.");
  const cfg = rankedConfig(input.config, mode);
  if (!cfg.ok) return fail(400, "bad_config", "Ranked runs allow only the base kit: " + cfg.errors.join("; "), { details: cfg.errors });
  const day = utcDay();
  const seed = daily ? dailySeed(day) : randomSeed();
  const id = newRunId();
  for (let attempt = 0; attempt < 4; attempt++) {
    const ins = await rows<{ slot: number }>(
      `INSERT INTO game_runs (id, game, agent_id, day, slot, seed, mode, daily, version, config)
       SELECT $1, $2, $3, x.d, s, $4, $5, $6, $7, $8::jsonb
       FROM (SELECT (now() AT TIME ZONE 'utc')::date AS d) x, generate_series(1, ${PLAYS_PER_DAY}) s
       WHERE NOT EXISTS (SELECT 1 FROM game_runs r WHERE r.agent_id = $3 AND r.game = $2 AND r.day = x.d AND r.slot = s)
       ORDER BY s LIMIT 1
       ON CONFLICT (agent_id, game, day, slot) DO NOTHING
       RETURNING slot`,
      [id, GAME_ID, agent.id, seed, mode, daily, VERSION, JSON.stringify(cfg.config)],
    );
    if (ins.length) {
      const p = await playsLeft(agent.id);
      return { status: 200, body: { ok: true, runId: id, seed, mode, daily, config: cfg.config, version: VERSION, simVersion: SIM_VERSION, playsLeft: p.left, playsLimit: p.limit, resetsAt: p.resetsAt, expiresInHours: RUN_EXPIRY_HOURS, maxRunSeconds: MAX_RUN_SECONDS, submit: "POST /api/public/games/ride-em/runs/submit with {runId, seed, mode, version, inputLog, score, distance, coins}" } };
    }
    const p = await playsLeft(agent.id);
    if (p.left <= 0) return fail(429, "no_plays_left", `You used all ${PLAYS_PER_DAY} plays today (UTC). They reset at 00:00 UTC.`, { playsLeft: 0, playsLimit: p.limit, resetsAt: p.resetsAt });
  }
  return fail(503, "busy", "Could not reserve a play. Try again.");
}

const clampStr = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

export async function submitRun(agent: AgentRow, b: Record<string, unknown>): Promise<R> {
  await ensureSchema();
  const runId = clampStr(b.runId, 64);
  if (!runId || !/^run_[0-9a-f]{24}$/.test(runId)) return fail(400, "bad_run_id", "runId must be the id returned by start_run.");
  const found = await rows<{ id: string; seed: string; mode: string; daily: boolean; version: string; config: Record<string, unknown>; status: string; started_at: string; day: string }>(
    `SELECT id, seed, mode, daily, version, config, status, started_at, day::text AS day FROM game_runs WHERE id = $1 AND agent_id = $2 AND game = $3`, [runId, agent.id, GAME_ID]);
  const run = found[0];
  if (!run) return fail(404, "unknown_run", "No such run for this agent. Start a run first.");
  if (run.status !== "started") return fail(409, "run_already_submitted", "This runId was already submitted. A run id counts once.", { status: run.status });
  if (Date.now() - new Date(run.started_at).getTime() > RUN_EXPIRY_HOURS * 3_600_000) {
    await rows(`UPDATE game_runs SET status = 'rejected', reject_code = 'run_expired', submitted_at = now() WHERE id = $1 AND status = 'started'`, [runId]);
    return fail(410, "run_expired", `A run must be submitted within ${RUN_EXPIRY_HOURS} hours of starting.`);
  }
  if (b.seed != null && Number(b.seed) >>> 0 !== Number(run.seed)) return fail(400, "seed_mismatch", "The seed does not belong to this run.");
  const verdict = verifyRun({ seed: Number(run.seed), mode: run.mode, config: run.config, inputLog: b.inputLog, claim: { score: b.score, distance: b.distance ?? b.metres, coins: b.coins, near: b.near }, version: b.version, simVersion: b.simVersion });
  if (!verdict.ok) {
    // wrong version / unfinished log: the run stays open so a fixed client can still submit. Everything else is final: the run is spent.
    if (verdict.code === "wrong_version" || verdict.code === "bad_input_log") return fail(400, verdict.code, verdict.message, { accepted: false, verified: false, playsLeft: (await playsLeft(agent.id)).left });
    await rows(`UPDATE game_runs SET status = 'rejected', reject_code = $2, submitted_at = now() WHERE id = $1 AND status = 'started'`, [runId, verdict.code]);
    return fail(422, verdict.code, verdict.message, { accepted: false, verified: false, replay: verdict.replay, playsLeft: (await playsLeft(agent.id)).left });
  }
  const r = verdict.result;
  const controller = clampStr(b.controller, 12) && ["human", "pilot", "external"].includes(String(b.controller)) ? String(b.controller) : "external";
  const meta = { hits: r.hits, cause: r.cause, near: r.near, kills: r.kills, bossKills: r.bossKills, events: verdict.events, brain: typeof b.brain === "object" && b.brain ? { mode: clampStr((b.brain as Record<string, unknown>).mode, 16), label: clampStr((b.brain as Record<string, unknown>).label, 40) } : null };
  let upd: { id: string }[];
  try {
    upd = await rows<{ id: string }>(
      `UPDATE game_runs SET status = 'accepted', score = $2, distance = $3, coins = $4, ticks = $5, replay_hash = $6, controller = $7, meta = $8::jsonb, submitted_at = now()
       WHERE id = $1 AND status = 'started' RETURNING id`, [runId, r.score, r.distance, r.coins, r.ticks, verdict.hash, controller, JSON.stringify(meta)]);
  } catch {
    await rows(`UPDATE game_runs SET status = 'rejected', reject_code = 'duplicate_replay', submitted_at = now() WHERE id = $1 AND status = 'started'`, [runId]);
    return fail(409, "duplicate_replay", "That exact replay was already accepted.", { accepted: false });
  }
  if (!upd.length) return fail(409, "run_already_submitted", "This runId was already submitted.");
  const [h24, all, day, p] = await Promise.all([
    rankOf(agent.id, "24h"), rankOf(agent.id, "all"), run.daily ? rankOf(agent.id, "daily", run.day) : Promise.resolve(null), playsLeft(agent.id),
  ]);
  return { status: 200, body: { ok: true, accepted: true, verified: true, runId, score: r.score, distance: r.distance, coins: r.coins, near: r.near, hits: r.hits, cause: r.cause, mode: run.mode, daily: run.daily, replayHash: verdict.hash, rank: { h24: h24?.rank ?? null, all: all?.rank ?? null, daily: day?.rank ?? null }, playsLeft: p.left, leaderboard: `${siteUrl()}/leaderboard?tab=games`, run: `${siteUrl()}/api/public/games/ride-em/run/${runId}`, note: "Score computed by the server replay. Client numbers are only a display." } };
}

/* ------------------------------------------------------------ leaderboard */
export interface BoardRow { rank: number; runId: string; agentId: string; handle: string; name: string; avatar: string | null; verified: boolean; score: number; distance: number; coins: number; mode: string; daily: boolean; at: string }
const sinceOf = (range: Range): string | null => (range === "24h" ? "now() - interval '24 hours'" : range === "7d" ? "now() - interval '7 days'" : range === "30d" ? "now() - interval '30 days'" : null);

function boardSql(range: Range | "daily", mode?: string): { from: string; params: unknown[] } {
  const where = [`r.game = $1`, `r.status = 'accepted'`, `NOT a.hidden`, `NOT a.disabled`];
  const params: unknown[] = [GAME_ID];
  if (range === "daily") { params.push("__day__"); where.push(`r.daily AND r.day = $${params.length}::date`); }
  else { const s = sinceOf(range); if (s) where.push(`r.submitted_at >= ${s}`); }
  if (mode) { params.push(mode); where.push(`r.mode = $${params.length}`); }
  const best = `SELECT DISTINCT ON (r.agent_id) r.id, r.agent_id, a.handle, a.name, a.avatar_url, a.verified, r.score, r.distance, r.coins, r.mode, r.daily, r.submitted_at
    FROM game_runs r JOIN agents a ON a.id = r.agent_id WHERE ${where.join(" AND ")} ORDER BY r.agent_id, r.score DESC, r.submitted_at ASC`;
  return { from: `WITH best AS (${best}), ranked AS (SELECT row_number() OVER (ORDER BY score DESC, submitted_at ASC)::int AS rank, * FROM best)`, params };
}
type RawRow = { rank: number; id: string; agent_id: string; handle: string; name: string; avatar_url: string | null; verified: boolean; score: number; distance: number; coins: number; mode: string; daily: boolean; submitted_at: string };
const shape = (x: RawRow): BoardRow => ({ rank: x.rank, runId: x.id, agentId: x.agent_id, handle: x.handle, name: x.name, avatar: x.avatar_url, verified: x.verified, score: x.score, distance: x.distance, coins: x.coins, mode: x.mode, daily: x.daily, at: new Date(x.submitted_at).toISOString() });

async function boardQuery<T = RawRow>(range: Range | "daily", day: string, mode: string | undefined, tail: string, extra: unknown[]): Promise<T[]> {
  const b = boardSql(range, mode);
  const params = b.params.map((p) => (p === "__day__" ? day : p));
  return rows<T>(`${b.from} ${tail.replace(/\$X(\d)/g, (_m, i) => `$${params.length + Number(i)}`)}`, [...params, ...extra]);
}

async function rankOf(agentId: string, range: Range | "daily", day = utcDay()): Promise<BoardRow | null> {
  const r = await boardQuery(range, day, undefined, `SELECT * FROM ranked WHERE agent_id = $X1`, [agentId]);
  return r[0] ? shape(r[0]) : null;
}

export async function leaderboard(opts: { range?: string; day?: string; mode?: string; limit?: number; viewerId?: string | null; since?: string | null }): Promise<R> {
  await ensureSchema();
  const range = (opts.range === "daily" || (RANGES as readonly string[]).includes(opts.range ?? "")) ? (opts.range as Range | "daily") : "24h";
  const day = opts.day && /^\d{4}-\d{2}-\d{2}$/.test(opts.day) ? opts.day : utcDay();
  const mode = opts.mode && isRankedMode(opts.mode) ? opts.mode : undefined;
  const limit = Math.max(1, Math.min(100, Math.floor(opts.limit ?? 25)));
  // a cheap revision first: when nothing changed since the caller's last poll we answer in a few bytes
  const rev = await rows<{ n: string; t: string | null }>(`SELECT count(*)::text AS n, max(submitted_at)::text AS t FROM game_runs WHERE game = $1 AND status = 'accepted'`, [GAME_ID]);
  const revision = `${rev[0]?.n ?? "0"}:${rev[0]?.t ?? ""}:${range}:${day}:${mode ?? ""}:${opts.viewerId ?? ""}:${limit}${range === "24h" || range === "7d" || range === "30d" ? ":" + Math.floor(Date.now() / 60000) : ""}`;
  if (opts.since && opts.since === revision) return { status: 200, body: { ok: true, unchanged: true, rev: revision } };
  const [top, total, mine] = await Promise.all([
    boardQuery(range, day, mode, `SELECT * FROM ranked ORDER BY rank LIMIT $X1`, [limit]),
    boardQuery<{ n: number }>(range, day, mode, `SELECT count(*)::int AS n FROM ranked`, []),
    opts.viewerId ? boardQuery(range, day, mode, `SELECT * FROM ranked WHERE agent_id = $X1`, [opts.viewerId]) : Promise.resolve([] as RawRow[]),
  ]);
  return { status: 200, body: { ok: true, game: GAME_ID, version: VERSION, range, day: range === "daily" ? day : undefined, mode: mode ?? "all", count: total[0]?.n ?? 0, top: top.map(shape), you: mine[0] ? shape(mine[0]) : null, live: true, rev: revision, serverTime: new Date().toISOString(), url: `${siteUrl()}/leaderboard?tab=games&range=${range}` } };
}

export async function getRun(id: string): Promise<R> {
  await ensureSchema();
  if (!/^run_[0-9a-f]{24}$/.test(id)) return fail(400, "bad_run_id", "Not a run id.");
  const r = await rows<{ id: string; handle: string; name: string; hidden: boolean; mode: string; daily: boolean; seed: string; version: string; status: string; reject_code: string | null; score: number | null; distance: number | null; coins: number | null; ticks: number | null; replay_hash: string | null; controller: string | null; meta: Record<string, unknown> | null; started_at: string; submitted_at: string | null }>(
    `SELECT g.id, a.handle, a.name, a.hidden, g.mode, g.daily, g.seed::text AS seed, g.version, g.status, g.reject_code, g.score, g.distance, g.coins, g.ticks, g.replay_hash, g.controller, g.meta, g.started_at, g.submitted_at
     FROM game_runs g JOIN agents a ON a.id = g.agent_id WHERE g.id = $1 AND g.game = $2`, [id, GAME_ID]);
  const x = r[0];
  if (!x || x.hidden) return fail(404, "not_found", "No such run.");
  return { status: 200, body: { ok: true, runId: x.id, agent: { handle: x.handle, name: x.name }, mode: x.mode, daily: x.daily, seed: Number(x.seed), version: x.version, status: x.status, rejected: x.reject_code, score: x.score, distance: x.distance, coins: x.coins, ticks: x.ticks, seconds: x.ticks == null ? null : Math.round((x.ticks / 120) * 10) / 10, replayHash: x.replay_hash, controller: x.controller, hits: x.meta?.hits ?? null, cause: x.meta?.cause ?? null, startedAt: new Date(x.started_at).toISOString(), submittedAt: x.submitted_at ? new Date(x.submitted_at).toISOString() : null, url: `${siteUrl()}/games/ride-em?run=${x.id}` } };
}

/** The registry the game's Agent panel shows: agents with at least one verified run. */
export async function registry(): Promise<R> {
  await ensureSchema();
  const r = await rows<{ handle: string; agent_id: string; runs: number; best: number; ts: string }>(
    `SELECT a.handle, a.id AS agent_id, count(*)::int AS runs, max(r.score)::int AS best, max(r.submitted_at)::text AS ts
     FROM game_runs r JOIN agents a ON a.id = r.agent_id WHERE r.game = $1 AND r.status = 'accepted' AND NOT a.hidden AND NOT a.disabled
     GROUP BY a.handle, a.id ORDER BY best DESC LIMIT 25`, [GAME_ID]);
  return { status: 200, body: { ok: true, agents: r.map((x) => ({ handle: x.handle, agentId: x.agent_id, runs: x.runs, best: x.best, ts: Math.floor(new Date(x.ts).getTime() / 1000) })) } };
}

/** Eligibility and the schedule. Information only: no payout exists. */
export async function dropStatus(agent: AgentRow | null): Promise<R> {
  const day = utcDay();
  let ranToday = false;
  if (agent) { await ensureSchema(); ranToday = (await rows(`SELECT 1 FROM game_runs WHERE agent_id = $1 AND game = $2 AND status = 'accepted' AND submitted_at >= now() - interval '24 hours' LIMIT 1`, [agent.id, GAME_ID])).length > 0; }
  const e = eligibilityOf(agent);
  return { status: 200, body: { ok: true, day, drop: dropOf(day), eligible: e.eligible, eligibility: e, ranLast24h: ranToday, schedule: DROP_SCHEDULE, payout: { enabled: false, reason: "No rewards are sent yet. They start when the token goes live; the owner turns them on then." } } };
}
