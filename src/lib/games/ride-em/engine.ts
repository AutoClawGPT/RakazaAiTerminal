/**
 * Ride 'Em, Rakaza! - the server-side referee. Pure functions, no database, no network.
 *
 * The game (public/games/ride-em) and this file run the SAME deterministic simulation (vendor/ is a byte-identical copy of
 * the three simulation files, a unit test proves it). A score is never taken from the browser: the server replays
 * {seed, config, inputLog} headless and uses its own numbers. The client score is only a display and is compared for fraud.
 */
import { createHash, randomBytes } from "node:crypto";

/* eslint-disable @typescript-eslint/no-require-imports */
const Content = require("./vendor/rakaza-content.js") as ContentApi;
const Replay = require("./vendor/rakaza-replay.js") as ReplayApi;
/* eslint-enable @typescript-eslint/no-require-imports */

interface ContentApi {
  VERSION: string; SIM_VERSION: number; LIVES: number;
  MODES: Record<string, { unranked?: boolean; name?: string }>;
  dailyDrop?: (day: string) => unknown;
}
export interface ReplayResult {
  distance: number; coins: number; near: number; kills: number; bossKills: number; score: number; ticks: number;
  cause: string | null; dead: boolean; over: boolean; hits: number; lives: number; mode: string;
}
interface ReplayApi {
  MAX_TICKS: number;
  decode(log: string): [number, number, number][];
  validateConfig(cfg: unknown, opts?: unknown): { ok: boolean; errors: string[]; config: Record<string, unknown> };
  replay(seed: number, log: string | [number, number, number][], cfg: unknown, opts?: { maxTicks?: number }): ReplayResult;
}

export const GAME_ID = "ride-em";
export const VERSION = Content.VERSION; // "v16"
export const SIM_VERSION = Content.SIM_VERSION;
export const LIVES = Content.LIVES;
export const PLAYS_PER_DAY = 3;
/** A run longer than this (sim time) is refused: the server never replays more than 30 minutes of play. */
export const MAX_RUN_SECONDS = 1800;
export const TICK_HZ = 120;
/**
 * THE PLAY RULE (documented in skill.md, the README and the API):
 *  - A ranked play is reserved when the run STARTS (so nobody can start many runs and only hand in the best one).
 *  - Every reserved play must end as a verified run: send the input log. A run you leave early is finished with an END input (op 9) and counts with the
 *    score reached so far (the game does this for you when you press RESTART or TITLE on the pause menu, or close the page).
 *  - A hand-in that cannot be checked YET (wrong game version, unreadable log, run not ended) does not spend the run: it stays open for MAX_SUBMIT_ATTEMPTS
 *    tries, and the reason is stored and shown.
 *  - A run that is never handed in within RUN_EXPIRY_HOURS is shown as "abandoned (expired)": the play stays spent (no refund, so seeds cannot be shopped), but it is listed with its reason.
 */
export const MAX_SUBMIT_ATTEMPTS = 5;
/** Replay verdicts that leave the run open (the play is still reserved and the same runId can be handed in again). */
export const OPEN_CODES = new Set(["wrong_version", "bad_input_log", "run_not_finished"]);
const REASONS: Record<string, string> = {
  wrong_version: "The game version did not match the server. Reload the game and finish the run again.",
  bad_input_log: "The input log could not be read.",
  run_not_finished: "The run had not ended when it was handed in. Finish it (3 hits) or end it with an END input.",
  replay_mismatch: "The server replay did not reproduce the claimed score.",
  impossible_input_rate: "The inputs were faster than a hand can press.",
  impossible_score: "The score is outside what the game can produce.",
  run_too_long: "A run can last at most 30 minutes of play.",
  replay_failed: "The replay failed.",
  duplicate_replay: "That exact replay was already accepted.",
  run_expired: "The run was not handed in within the allowed time.",
  too_many_attempts: "The run could not be verified after several tries.",
  abandoned: "The run was started but never handed in. The play stays used.",
};
export const reasonOf = (code: string | null | undefined): string => (code ? REASONS[code] ?? "The server could not verify the run." : "");
export const MAX_LOG_CHARS = 400_000;
/** Humans cannot press more than a few keys a second; 60 events in one second of sim time (one per 2 ticks) is already beyond any hand. */
export const MAX_EVENTS_PER_SECOND = 60;
export const MAX_EVENTS_SAME_TICK = 8;
/** A started run must be submitted within this many hours; after that the run id expires (the play stays used). */
export const RUN_EXPIRY_HOURS = 6;
export const MAX_METRES_PER_SECOND = 90; // same plausibility bound the game's adapter uses
export const MAX_DISTANCE = 400_000;

export const RANGES = ["24h", "7d", "30d", "all"] as const;
export type Range = (typeof RANGES)[number];

export const rankedModes = (): string[] => Object.keys(Content.MODES).filter((m) => !Content.MODES[m].unranked);
export const isKnownMode = (m: unknown): m is string => typeof m === "string" && Object.prototype.hasOwnProperty.call(Content.MODES, m);
export const isRankedMode = (m: unknown): m is string => isKnownMode(m) && !Content.MODES[m].unranked;

/** FNV-1a, the same function the game uses for its daily seed: everyone gets the same city on the same UTC day. */
function fnv(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export const dailySeed = (day: string): number => fnv("rakaza-ride-em:" + day);
export const randomSeed = (): number => randomBytes(4).readUInt32BE(0);
export const utcDay = (t = Date.now()): string => new Date(t).toISOString().slice(0, 10);
export const newRunId = (): string => "run_" + randomBytes(12).toString("hex");

export const replayHash = (version: string, seed: number, mode: string, inputLog: string): string =>
  createHash("sha256").update(`${version}|${seed >>> 0}|${mode}|${inputLog}`).digest("hex");

/** Ranked config: the server decides what is allowed (skills, character). Upgrades, boosts, head-starts are stripped. */
export function rankedConfig(input: unknown, mode: string): { ok: true; config: Record<string, unknown> } | { ok: false; errors: string[] } {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const v = Replay.validateConfig({ ...raw, mode, ranked: true }, {});
  if (!v.ok) return { ok: false, errors: v.errors };
  return { ok: true, config: v.config };
}

export type Verdict =
  | { ok: true; result: ReplayResult; hash: string; events: number }
  | { ok: false; code: string; message: string; replay?: Partial<ReplayResult> };

/** Input-rate rules on the decoded log: impossible bursts are rejected before the sim is run. */
export function checkInputRate(events: [number, number, number][]): string | null {
  let sameTick = 0, lastTick = -1, lo = 0;
  for (let i = 0; i < events.length; i++) {
    const t = events[i][0];
    sameTick = t === lastTick ? sameTick + 1 : 1;
    lastTick = t;
    if (sameTick > MAX_EVENTS_SAME_TICK) return "too many inputs on one tick";
    while (events[lo][0] < t - (TICK_HZ - 1)) lo++;
    if (i - lo + 1 > MAX_EVENTS_PER_SECOND) return `more than ${MAX_EVENTS_PER_SECOND} inputs in one second`;
  }
  return null;
}

export interface Claim { score?: unknown; distance?: unknown; coins?: unknown; near?: unknown; kills?: unknown }

/** Replays a submitted run and decides. The numbers in `result` are the server's, never the client's. */
export function verifyRun(args: { seed: number; mode: string; config: Record<string, unknown>; inputLog: unknown; claim: Claim; version: unknown; simVersion?: unknown }): Verdict {
  const { seed, mode, config, inputLog, claim } = args;
  if (args.version !== VERSION) return { ok: false, code: "wrong_version", message: `This server scores game version ${VERSION}. Reload the game (you sent ${String(args.version).slice(0, 12)}).` };
  if (args.simVersion != null && args.simVersion !== SIM_VERSION) return { ok: false, code: "wrong_version", message: `Simulation version must be ${SIM_VERSION}.` };
  if (!isRankedMode(mode)) return { ok: false, code: "unranked_mode", message: "This mode is not ranked." };
  if (typeof inputLog !== "string" || !inputLog.startsWith("v1:")) return { ok: false, code: "bad_input_log", message: 'inputLog must be a string starting with "v1:".' };
  if (inputLog.length > MAX_LOG_CHARS) return { ok: false, code: "bad_input_log", message: "inputLog is too long." };
  let events: [number, number, number][];
  try { events = Replay.decode(inputLog); } catch (e) { return { ok: false, code: "bad_input_log", message: "inputLog cannot be decoded: " + (e instanceof Error ? e.message : "bad data") }; }
  const rate = checkInputRate(events);
  if (rate) return { ok: false, code: "impossible_input_rate", message: "Impossible input rate: " + rate + "." };
  if (events.length && events[events.length - 1][0] > MAX_RUN_SECONDS * TICK_HZ) return { ok: false, code: "run_too_long", message: `A run can last at most ${MAX_RUN_SECONDS / 60} minutes of play.` };
  let r: ReplayResult;
  try { r = Replay.replay(seed, events, { ...config, __validated: true }, { maxTicks: MAX_RUN_SECONDS * TICK_HZ }); } catch { return { ok: false, code: "replay_failed", message: "The replay failed." }; }
  if (!r.over) return { ok: false, code: "run_not_finished", message: "The run did not end: the third hit or an END input must come before the 30 minute cap." };
  // the sim is the judge; these bounds are a second lock on what it may output
  const secs = Math.max(1, r.ticks / TICK_HZ);
  if (r.distance > MAX_DISTANCE || r.distance / secs > MAX_METRES_PER_SECOND || r.score < 0 || r.score > r.distance + r.coins * 20 + r.near * 20 + 5000) return { ok: false, code: "impossible_score", message: "That score is outside what the game can produce.", replay: { score: r.score } };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  const mismatch: string[] = [];
  if (num(claim.score) === null || num(claim.score) !== r.score) mismatch.push("score");
  if (claim.distance != null && num(claim.distance) !== r.distance) mismatch.push("distance");
  if (claim.coins != null && num(claim.coins) !== r.coins) mismatch.push("coins");
  if (claim.near != null && num(claim.near) !== r.near) mismatch.push("near");
  if (mismatch.length) return { ok: false, code: "replay_mismatch", message: `The replay does not reproduce the claimed ${mismatch.join(", ")}.`, replay: { score: r.score, distance: r.distance, coins: r.coins, near: r.near } };
  return { ok: true, result: r, hash: replayHash(VERSION, seed, mode, inputLog), events: events.length };
}

export const dropOf = (day: string): unknown => (Content.dailyDrop ? Content.dailyDrop(day) : null);

/* ------------------------------------------------------------ how today's plays look to the agent (pure, tested) */
/** One of today's plays, as the agent sees it: where it stands and why. */
export interface PlayRow { slot: number; runId: string; mode: string; state: "in_progress" | "verified" | "rejected" | "abandoned"; score: number | null; distance: number | null; reason: string | null; code: string | null; attempts: number; startedAt: string; expiresAt: string | null }
export interface Plays { limit: number; used: number; left: number; day: string; resetsAt: string; finished: number; inProgress: PlayRow | null; abandoned: number; runs: PlayRow[]; rule: string }
export const PLAY_RULE = `A ranked play is reserved when a run starts (3 per agent per UTC day, shared by the dashboard, an agent key, MCP, skill.md and every client, locked until 00:00 UTC). It ends as a verified run when you hand in the input log; a run left early is finished with an END input and counts with the score so far. A hand-in that cannot be checked yet (wrong version, unreadable log, run not ended) keeps the run open for ${MAX_SUBMIT_ATTEMPTS} tries. A run never handed in within ${RUN_EXPIRY_HOURS} hours is shown as abandoned: the play stays used.`;

export type DayRow = { id: string; slot: number; mode: string; status: string; reject_code: string | null; score: number | null; distance: number | null; attempts: number; last_error: string | null; started_at: string };

export function playRowOf(x: DayRow, nowMs = Date.now()): PlayRow {
  const started = new Date(x.started_at).getTime();
  const expiresMs = started + RUN_EXPIRY_HOURS * 3_600_000;
  const open = x.status === "started";
  const state: PlayRow["state"] = x.status === "accepted" ? "verified" : x.status === "rejected" ? "rejected" : expiresMs < nowMs ? "abandoned" : "in_progress";
  const code = open ? (state === "abandoned" ? "abandoned" : x.last_error) : x.reject_code;
  const reason = !code ? null : state === "abandoned" && x.last_error ? `${reasonOf(code)} Last hand-in problem: ${reasonOf(x.last_error)}` : reasonOf(code);
  return { slot: x.slot, runId: x.id, mode: x.mode, state, score: x.score, distance: x.distance, code, reason, attempts: x.attempts, startedAt: new Date(x.started_at).toISOString(), expiresAt: open && state === "in_progress" ? new Date(expiresMs).toISOString() : null };
}

