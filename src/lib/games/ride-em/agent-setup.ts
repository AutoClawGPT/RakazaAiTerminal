import "server-only";
import { ensureSchema, sql } from "@/lib/db";
import type { AgentRow } from "@/lib/agents/service";
import { riverChat } from "@/lib/brain/river";
import { siteUrl } from "@/lib/site";
import { GAME_ID, RUN_EXPIRY_HOURS } from "./engine";
import { SYSTEM as BRAIN_SYSTEM, cleanObs } from "./brain";
import { byoChat, byoDetect, byoTest, checkBase, cleanModelId, cleanProtocol, parseBase, protocolFromUrl, type Protocol } from "./byo";
import { playsLeft, type R } from "./service";

/** Everything /agents/me needs for the game: the settings, the progress by agent id, the saved game state and the agent chat. No key is ever read from or written to the database. */
const q = () => { const c = sql(); if (!c) throw new Error("DATABASE_URL is not set."); return c; };
async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> { return (await q().query(text, params)) as T[]; }
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): R => ({ status, body: { ok: false, error, message, ...extra } });

export interface Setup { brain: "builtin" | "river" | "byo"; byoBase: string; byoModel: string; byoTimeout: number; byoProtocol: Protocol; pilotStage: number; pilotMax: 5 | 6; remind: boolean; remindHour: number }
const DEFAULTS: Setup = { brain: "builtin", byoBase: "", byoModel: "", byoTimeout: 4000, byoProtocol: "openai", pilotStage: 1, pilotMax: 5, remind: false, remindHour: 18 };

/** AI pilot stages 1-6. Stage 6 (the expert) is locked: only the owner can unlock it per agent (dash action), it is never settable from here. */
export function pilotStageOf(n: unknown, unlocked: boolean): number { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.max(1, Math.min(unlocked ? 6 : 5, v)) : 1; }

export async function getSetup(agentId: string): Promise<Setup> {
  await ensureSchema();
  const r = await rows<{ brain_mode: string; byo_base: string | null; byo_model: string | null; byo_timeout: number; byo_protocol: string | null; pilot_stage: number; expert_unlocked: boolean; remind: boolean; remind_hour: number }>(`SELECT brain_mode, byo_base, byo_model, byo_timeout, byo_protocol, pilot_stage, expert_unlocked, remind, remind_hour FROM agent_game_config WHERE agent_id = $1`, [agentId]);
  const x = r[0];
  if (!x) return { ...DEFAULTS };
  return { brain: x.brain_mode === "river" || x.brain_mode === "byo" ? x.brain_mode : "builtin", byoBase: x.byo_base ?? "", byoModel: x.byo_model ?? "", byoTimeout: x.byo_timeout, byoProtocol: cleanProtocol(x.byo_protocol), pilotMax: x.expert_unlocked ? 6 : 5, pilotStage: pilotStageOf(x.pilot_stage, x.expert_unlocked), remind: x.remind, remindHour: x.remind_hour };
}

export async function saveSetup(agent: AgentRow, b: Record<string, unknown>): Promise<R> {
  const cur = await getSetup(agent.id);
  const next: Setup = { ...cur };
  if (b.brain !== undefined) { if (b.brain !== "builtin" && b.brain !== "river" && b.brain !== "byo") return fail(400, "bad_brain", "brain must be builtin, river or byo."); next.brain = b.brain; }
  if (b.byoBase !== undefined) {
    if (b.byoBase === "" || b.byoBase === null) next.byoBase = "";
    else { const p = parseBase(b.byoBase); if (!p.ok) return fail(400, "bad_base_url", p.message); next.byoBase = p.url; if (b.byoProtocol === undefined) { const pr = protocolFromUrl(b.byoBase); if (pr) next.byoProtocol = pr; } }
  }
  if (b.byoProtocol !== undefined) next.byoProtocol = cleanProtocol(b.byoProtocol);
  if (b.byoModel !== undefined) next.byoModel = cleanModelId(b.byoModel);
  if (b.byoTimeout !== undefined) { const n = Number(b.byoTimeout); if (!Number.isFinite(n)) return fail(400, "bad_timeout", "byoTimeout must be a number of milliseconds."); next.byoTimeout = Math.max(800, Math.min(15000, Math.round(n))); }
  if (b.pilotStage !== undefined) {
    const n = Number(b.pilotStage);
    if (!Number.isInteger(n) || n < 1 || n > 6) return fail(400, "bad_stage", "pilotStage is a whole number from 1 to 6.");
    if (n > cur.pilotMax) return fail(403, "stage_locked", "Stage 6 is locked. It has to be unlocked by the owner.");
    next.pilotStage = n;
  }
  if (b.remind !== undefined) next.remind = b.remind === true;
  if (b.remindHour !== undefined) { const n = Number(b.remindHour); if (!Number.isInteger(n) || n < 0 || n > 23) return fail(400, "bad_hour", "remindHour is an hour 0-23 (UTC)."); next.remindHour = n; }
  if (next.brain === "byo" && (!next.byoBase || !next.byoModel)) return fail(400, "byo_incomplete", "Bring-your-own needs a base URL and a model ID.");
  await ensureSchema();
  await rows(`INSERT INTO agent_game_config (agent_id, brain_mode, byo_base, byo_model, byo_timeout, byo_protocol, pilot_stage, remind, remind_hour, updated_at) VALUES ($1,$2,$3,$4,$5,$8,$9,$6,$7, now())
    ON CONFLICT (agent_id) DO UPDATE SET brain_mode = $2, byo_base = $3, byo_model = $4, byo_timeout = $5, byo_protocol = $8, pilot_stage = $9, remind = $6, remind_hour = $7, updated_at = now()`,
    [agent.id, next.brain, next.byoBase || null, next.byoModel || null, next.byoTimeout, next.remind, next.remindHour, next.byoProtocol, next.pilotStage]);
  return { status: 200, body: { ok: true, setup: next } };
}

/* -------------------------------------------------------------- progress (by agent id, from the verified runs) */
export interface Progress { runs: number; best: number; bestMode: string | null; totalDistance: number; totalCoins: number; last: string | null; streak: number; rank: { h24: number | null; all: number | null }; level: number; xp: number; nextAt: number; byMode: { mode: string; runs: number; best: number }[]; unverified: number }

/** `unverified` = plays that ended without a verified run (rejected, or never handed in and expired). They are listed with their reason in `plays.runs`. */
export async function progressOf(agentId: string): Promise<Progress> {
  await ensureSchema();
  const [tot, modes, days, rk, unv] = await Promise.all([
    rows<{ runs: string; best: number | null; dist: string | null; coins: string | null; last: string | null }>(`SELECT count(*)::text AS runs, max(score) AS best, sum(distance)::text AS dist, sum(coins)::text AS coins, max(submitted_at)::text AS last FROM game_runs WHERE agent_id = $1 AND game = $2 AND status = 'accepted'`, [agentId, GAME_ID]),
    rows<{ mode: string; runs: string; best: number }>(`SELECT mode, count(*)::text AS runs, max(score) AS best FROM game_runs WHERE agent_id = $1 AND game = $2 AND status = 'accepted' GROUP BY mode ORDER BY max(score) DESC`, [agentId, GAME_ID]),
    rows<{ d: string }>(`SELECT DISTINCT (submitted_at AT TIME ZONE 'utc')::date::text AS d FROM game_runs WHERE agent_id = $1 AND game = $2 AND status = 'accepted' ORDER BY d DESC LIMIT 60`, [agentId, GAME_ID]),
    rows<{ rk: number; range: string }>(`SELECT x.rk, x.range FROM (
        SELECT 'all' AS range, (SELECT count(*)::int + 1 FROM (SELECT r.agent_id, max(r.score) m FROM game_runs r JOIN agents a ON a.id = r.agent_id WHERE r.game = $2 AND r.status='accepted' AND NOT a.hidden AND NOT a.disabled GROUP BY r.agent_id) t WHERE t.m > COALESCE((SELECT max(score) FROM game_runs WHERE agent_id = $1 AND game = $2 AND status='accepted'), 2147483647)) AS rk
        UNION ALL
        SELECT '24h', (SELECT count(*)::int + 1 FROM (SELECT r.agent_id, max(r.score) m FROM game_runs r JOIN agents a ON a.id = r.agent_id WHERE r.game = $2 AND r.status='accepted' AND NOT a.hidden AND NOT a.disabled AND r.submitted_at >= now() - interval '24 hours' GROUP BY r.agent_id) t WHERE t.m > COALESCE((SELECT max(score) FROM game_runs WHERE agent_id = $1 AND game = $2 AND status='accepted' AND submitted_at >= now() - interval '24 hours'), 2147483647))
      ) x`, [agentId, GAME_ID]),
    rows<{ n: string }>(`SELECT count(*)::text AS n FROM game_runs WHERE agent_id = $1 AND game = $2 AND (status = 'rejected' OR (status = 'started' AND started_at < now() - make_interval(hours => $3)))`, [agentId, GAME_ID, RUN_EXPIRY_HOURS]),
  ]);
  const t = tot[0];
  const runs = Number(t?.runs ?? 0), dist = Number(t?.dist ?? 0), coins = Number(t?.coins ?? 0);
  // streak = consecutive UTC days with a verified run, counting today or yesterday as the end
  const set = new Set(days.map((x) => x.d));
  const day = (off: number) => new Date(Date.now() - off * 86_400_000).toISOString().slice(0, 10);
  let off = set.has(day(0)) ? 0 : set.has(day(1)) ? 1 : -1, streak = 0;
  if (off >= 0) while (set.has(day(off))) { streak++; off++; }
  const xp = Math.floor(dist / 10) + coins * 2 + runs * 50;
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const nextAt = (level * level) * 100;
  const hasRun = runs > 0;
  const rkOf = (r: string) => (hasRun ? rk.find((x) => x.range === r)?.rk ?? null : null);
  return { runs, best: t?.best ?? 0, bestMode: modes[0]?.mode ?? null, totalDistance: dist, totalCoins: coins, last: t?.last ? new Date(t.last).toISOString() : null, streak, rank: { h24: rkOf("24h"), all: rkOf("all") }, level, xp, nextAt, byMode: modes.map((m) => ({ mode: m.mode, runs: Number(m.runs), best: m.best })), unverified: Number(unv[0]?.n ?? 0) };
}

export async function me(agent: AgentRow): Promise<R> {
  const [setup, progress, plays] = await Promise.all([getSetup(agent.id), progressOf(agent.id), playsLeft(agent.id)]);
  return { status: 200, body: { ok: true, agent: { id: agent.id, handle: agent.handle, name: agent.name, avatar: agent.avatar_url ?? `/api/public/agents/${agent.handle}/avatar`, verified: agent.verified }, plays, progress, setup, game: { id: GAME_ID, url: `${siteUrl()}/games/ride-em`, playsPerDay: plays.limit } } };
}

/* -------------------------------------------------------------- saved game state (cosmetics, shop, skills) by agent id */
const MAX_STATE = 60_000;
function cleanState(v: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.slice(0, 200);
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => cleanState(x, depth + 1)).filter((x) => x !== undefined);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 200)) { if (/^[\w.:-]{1,40}$/.test(k) && k !== "__proto__") { const c = cleanState(x, depth + 1); if (c !== undefined) o[k] = c; } }
    return o;
  }
  return undefined;
}
export async function getState(agent: AgentRow): Promise<R> {
  await ensureSchema();
  const r = await rows<{ state: unknown; updated_at: string }>(`SELECT state, updated_at FROM agent_game_state WHERE agent_id = $1 AND game = $2`, [agent.id, GAME_ID]);
  return { status: 200, body: { ok: true, agentId: agent.id, handle: agent.handle, state: r[0]?.state ?? null, updatedAt: r[0] ? new Date(r[0].updated_at).toISOString() : null } };
}
export async function putState(agent: AgentRow, b: Record<string, unknown>): Promise<R> {
  const s = cleanState(b.state);
  if (!s || typeof s !== "object" || Array.isArray(s)) return fail(400, "bad_state", "state must be an object.");
  const text = JSON.stringify(s);
  if (text.length > MAX_STATE) return fail(413, "state_too_large", `Saved state is limited to ${MAX_STATE} characters.`);
  await ensureSchema();
  await rows(`INSERT INTO agent_game_state (agent_id, game, state, updated_at) VALUES ($1,$2,$3::jsonb, now()) ON CONFLICT (agent_id, game) DO UPDATE SET state = $3::jsonb, updated_at = now()`, [agent.id, GAME_ID, text]);
  return { status: 200, body: { ok: true, saved: true, bytes: text.length } };
}

/* -------------------------------------------------------------- BYO test / detect */
const protoOf = (b: Record<string, unknown>): Protocol => (b.protocol === "anthropic" || b.protocol === "openai" ? b.protocol : protocolFromUrl(b.base) ?? "openai");
export async function byoTestFor(b: Record<string, unknown>, key: string): Promise<R> {
  return { status: 200, body: { ...(await byoTest({ base: String(b.base ?? ""), model: String(b.model ?? ""), key, protocol: protoOf(b) })), ok: true } };
}
export async function byoDetectFor(b: Record<string, unknown>, key: string): Promise<R> {
  const base = await checkBase(b.base);
  if (!base.ok) return { status: 200, body: { ok: false, message: base.message } };
  return { status: 200, body: { ...(await byoDetect({ base: String(b.base), key, protocol: protoOf(b) })) } };
}

/** One game decision from the player's own model. The prompt is fixed by us (the route cannot be used as a general proxy). */
export async function byoRelay(cfg: { base: string; model: string; timeoutMs: number; protocol?: Protocol }, system: string, user: string, key: string) {
  return byoChat({ base: cfg.base, model: cfg.model, protocol: cfg.protocol, key, messages: [{ role: "system", content: system }, { role: "user", content: user }], maxTokens: 160, temperature: 0, timeoutMs: cfg.timeoutMs });
}

/* -------------------------------------------------------------- chat with the agent */
const clean = (t: unknown, n: number) => String(t ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
export async function chatWithAgent(agent: AgentRow, b: Record<string, unknown>, key: string): Promise<R> {
  const message = clean(b.message, 600);
  if (!message) return fail(400, "empty_message", "Write a message first.");
  const hist = Array.isArray(b.history) ? (b.history as unknown[]).slice(-8).map((m) => m as { role?: unknown; content?: unknown }).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m) => ({ role: m.role as "user" | "assistant", content: clean(m.content, 500) })) : [];
  const [setup, progress, plays] = await Promise.all([getSetup(agent.id), progressOf(agent.id), playsLeft(agent.id)]);
  const system = `You are ${agent.name} (@${agent.handle}), an AI agent that plays "Ride 'Em, Rakaza!", an endless rooftop runner with 3 lives and 3 ranked plays per UTC day. Scores are replayed and verified by the server.
Your verified record so far: ${progress.runs} runs, best ${progress.best}${progress.bestMode ? ` (${progress.bestMode})` : ""}, ${progress.totalCoins} coins, streak ${progress.streak} day(s), level ${progress.level}. Plays left today: ${plays.left} of ${plays.limit}.
Talk like a friendly teammate, short (1-3 sentences). Give real game tips (jump gaps and blocks, slide under low drones, stomp monsters, double jump tall blocks). Never give financial advice, never ask for or repeat any key or secret, never claim a score you do not have above.`;
  const messages = [{ role: "system", content: system }, ...hist, { role: "user", content: message }];
  const given = b.byo && typeof b.byo === "object" ? (b.byo as Record<string, unknown>) : null;
  // the chat window talks to the model the player just tested (sent along), else to the saved own model, else the platform brain
  const own = given && given.base && given.model ? { base: String(given.base), model: String(given.model), protocol: protoOf(given) } : setup.brain === "byo" && setup.byoBase && setup.byoModel ? { base: setup.byoBase, model: setup.byoModel, protocol: setup.byoProtocol } : null;
  if (own) {
    if (!key) return fail(400, "key_needed", "Enter the API key for your model (it stays in this browser) and chat again.", { via: "byo" });
    const r = await byoChat({ base: own.base, model: own.model, protocol: own.protocol, key, messages, maxTokens: 220, temperature: 0.7, timeoutMs: 20_000 });
    if (!r.pass) return fail(502, "byo_failed", `Your model did not answer. ${r.error ?? ""}`.trim(), { via: "byo", hint: r.hint });
    return { status: 200, body: { ok: true, reply: r.text, via: "byo", model: r.model } };
  }
  const out = await riverChat(messages as { role: "system" | "user" | "assistant"; content: string }[], { maxTokens: 220, temperature: 0.7, timeoutMs: 20_000, attempts: 2 });
  if (!out.ok) return fail(502, "brain_unavailable", "The platform brain did not answer. Try again in a moment.", { via: "platform" });
  return { status: 200, body: { ok: true, reply: out.text, via: "platform", model: out.model } };
}

/** The relay the game uses: the browser sends the observation, the server builds the (fixed) prompt, calls the player's model and hands back the raw reply. */
export async function relayFor(b: Record<string, unknown>, key: string): Promise<R> {
  const obs = cleanObs(b.obs);
  if (!obs) return fail(400, "bad_obs", "Send {base, model, obs:{obstacles:[…]}}.");
  const t = Number(b.timeout);
  const r = await byoRelay({ base: String(b.base ?? ""), model: String(b.model ?? ""), timeoutMs: Number.isFinite(t) ? t : 4000, protocol: protoOf(b) }, BRAIN_SYSTEM, "obs=" + JSON.stringify(obs), key);
  if (!r.pass) return { status: 200, body: { ok: false, status: r.status, ms: r.ms, error: r.error ?? "failed" } };
  return { status: 200, body: { ok: true, status: 200, ms: r.ms, model: r.model, choices: [{ message: { content: r.text } }] } };
}
