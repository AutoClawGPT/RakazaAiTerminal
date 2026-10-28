// The ranked play rule over HTTP (default http://localhost:3200, or BASE=https://... for live). Registers a throwaway agent exactly like skill.md says.
// Guards the @clawrenai bug: plays used, 0 verified runs, no reason. Every play must end as a verified run (a loss with a score counts), the progress
// panel / /me / leaderboard must move after EVERY run, a play left unfinished must be explained, and the 4th play is refused with the reset time.
// The test agent is HIDDEN at the end (never deleted) unless KEEP=1. No money moves.
import { createRequire } from "node:module";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { ensureSchema, sql } from "../src/lib/db";

const BASE = process.env.BASE ?? "http://localhost:3200";
const LOCAL = BASE.includes("localhost") || BASE.includes("127.0.0.1");
const G = "/api/public/games/ride-em";
const req = createRequire(join(process.cwd(), "src/lib/games/ride-em/vendor/x.js"));
const S = req("./rakaza-sim.js"), R = req("./rakaza-replay.js");
let pass = 0;
const check = (name: string, cond: unknown, extra = "") => { if (!cond) { console.log("FAIL", name, extra); process.exitCode = 1; } else { pass++; console.log("ok  ", name); } };
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ip = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
async function call(method: string, path: string, key?: string, body?: unknown): Promise<{ status: number; json: J }> {
  const r = await fetch(BASE + path, { method, headers: { ...(LOCAL ? { "x-forwarded-for": ip } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json: J = {}; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
let rid = 1;
const tool = async (key: string, name: string, args: unknown = {}) => {
  const r = await call("POST", "/mcp", key, { jsonrpc: "2.0", id: rid++, method: "tools/call", params: { name, arguments: args } });
  const res = r.json.result as J | undefined;
  return { isError: !!res?.isError, data: res?.structuredContent as J | undefined, text: String(res?.content?.[0]?.text ?? "") };
};
// fly some ticks with the built-in pilot, then LEAVE EARLY with END (what pause>RESTART, TITLE or closing the page does in the game)
function flyThenLeave(seed: number, cfg: Record<string, unknown>, ticks: number) {
  const w = S.create(seed, { ...cfg, __validated: true });
  for (let t = 0; t < ticks && !w.dead; t++) { if (t % 2 === 0) S.applyDecision(w, S.decide(w, null, true)); S.autoSkills(w); if (w.draft) S.input(w, S.OPS.DRAFT, t % 3); S.step(w); }
  if (!w.dead) S.input(w, S.OPS.END, 0);
  return { inputLog: R.encode(w.log) as string, score: S.score(w) as number, distance: Math.floor(w.dist), coins: w.coins as number, near: w.near as number };
}
const claim = (s: J, f: ReturnType<typeof flyThenLeave>, mode: string) => ({ runId: s.runId, seed: s.seed, mode, version: "v16", inputLog: f.inputLog, score: f.score, distance: f.distance, coins: f.coins, near: f.near, controller: "pilot" });

(async () => {
  if (process.env.HIDE_ONLY) { await ensureSchema(); await sql()!`UPDATE agents SET hidden = true WHERE id = ${process.env.HIDE_ONLY}`; console.log("hidden", process.env.HIDE_ONLY); return; }
  const tag = randomBytes(3).toString("hex");
  let agentId = "";
  try {
    const reg = await call("POST", "/api/public/register", undefined, { name: `Plays E2E TEST ${tag}`, handle: `plays_e2e_${tag}`, bio: "TEST agent for the play-rule end-to-end run. Hidden after the test.", via: "skill" });
    check("register", reg.status === 200 && String(reg.json.key).startsWith("rk_"));
    if (reg.status !== 200) throw new Error("no key");
    const K = reg.json.key as string; agentId = reg.json.id;
    const handle = `plays_e2e_${tag}`;

    const m0 = await call("GET", `${G}/me`, K);
    check("fresh agent: 3/3 left, 0 runs, no rank, no verified run", m0.json.plays?.left === 3 && m0.json.progress?.runs === 0 && m0.json.progress?.rank?.all == null && Array.isArray(m0.json.plays?.runs) && m0.json.plays.runs.length === 0, JSON.stringify(m0.json.plays).slice(0, 200));
    check("the rule is stated in the API", typeof m0.json.plays?.rule === "string" && /reserved when a run starts/.test(m0.json.plays.rule));

    // ---- play 1: left early with END => a VERIFIED run, progress moves at once
    const s1 = await call("POST", `${G}/runs/start`, K, { mode: "classic" });
    check("start 1", s1.status === 200 && s1.json.playsLeft === 2);
    const mid = await call("GET", `${G}/plays`, K);
    check("while running the play is IN PROGRESS and counted", mid.json.left === 2 && mid.json.inProgress?.runId === s1.json.runId && mid.json.runs?.[0]?.state === "in_progress", JSON.stringify(mid.json).slice(0, 240));
    const f1 = flyThenLeave(s1.json.seed, s1.json.config, 120 * 10);
    const r1 = await call("POST", `${G}/runs/submit`, K, claim(s1.json, f1, "classic"));
    check("leaving early is accepted and verified, score so far", r1.status === 200 && r1.json.accepted && r1.json.verified && r1.json.score === f1.score && f1.score > 0, JSON.stringify(r1.json).slice(0, 220));
    const m1 = await call("GET", `${G}/me`, K);
    check("progress after run 1: runs 1, best = score, XP > 0, streak 1, rank 24h and all", m1.json.progress.runs === 1 && m1.json.progress.best === f1.score && m1.json.progress.xp > 0 && m1.json.progress.streak === 1 && m1.json.progress.rank.h24 >= 1 && m1.json.progress.rank.all >= 1, JSON.stringify(m1.json.progress).slice(0, 300));
    check("plays after run 1: 2 left, the run is VERIFIED with its score", m1.json.plays.left === 2 && m1.json.plays.finished === 1 && m1.json.plays.runs[0].state === "verified" && m1.json.plays.runs[0].score === f1.score);
    const lb1 = await call("GET", `${G}/leaderboard?range=24h&limit=100`, K);
    check("leaderboard shows the agent right after run 1", lb1.json.top?.some((x: J) => x.handle === handle && x.score === f1.score), "");

    // ---- play 2: a bad hand-in does NOT burn the play: reason + retry; then the real hand-in verifies
    const s2 = await call("POST", `${G}/runs/start`, K, { mode: "rush" });
    check("start 2", s2.status === 200 && s2.json.playsLeft === 1);
    const f2 = flyThenLeave(s2.json.seed, s2.json.config, 120 * 15);
    const bad = await call("POST", `${G}/runs/submit`, K, { ...claim(s2.json, f2, "rush"), inputLog: "v2:garbage" });
    check("unreadable log: clear reason, retry allowed, 4 tries left", bad.status === 400 && bad.json.error === "bad_input_log" && bad.json.retry === true && bad.json.attemptsLeft === 4 && !bad.json.accepted, JSON.stringify(bad.json).slice(0, 240));
    const mid2 = await call("GET", `${G}/plays`, K);
    check("plays show the open run with the last problem", mid2.json.runs?.some((x: J) => x.state === "in_progress" && x.code === "bad_input_log" && /could not be read/.test(x.reason)), JSON.stringify(mid2.json.runs).slice(0, 300));
    const r2 = await call("POST", `${G}/runs/submit`, K, claim(s2.json, f2, "rush"));
    check("the same run then verifies", r2.status === 200 && r2.json.accepted && r2.json.score === f2.score, JSON.stringify(r2.json).slice(0, 200));
    const m2 = await call("GET", `${G}/me`, K);
    check("progress after run 2: runs 2, best = max", m2.json.progress.runs === 2 && m2.json.progress.best === Math.max(f1.score, f2.score));

    // ---- play 3 via MCP: left unfinished and forgotten => explained, still counted, honest
    const t3 = await tool(K, "start_run", { mode: "classic" });
    check("MCP start 3, 0 plays left after it", !t3.isError && t3.data?.playsLeft === 0, t3.text.slice(0, 160));
    const pl = await tool(K, "get_plays_left");
    check("MCP get_plays_left carries today's list and the rule", !pl.isError && Array.isArray(pl.data?.runs) && pl.data!.runs.length === 3 && typeof pl.data?.rule === "string", pl.text.slice(0, 160));

    // ---- 4th is refused with the reset time and the list of today's plays
    const s4 = await call("POST", `${G}/runs/start`, K, { mode: "classic" });
    check("4th play refused with resetsAt and today's list", s4.status === 429 && s4.json.error === "no_plays_left" && /^\d{4}-\d\d-\d\dT00:00:00/.test(String(s4.json.resetsAt)) && s4.json.runs?.length === 3 && /00:00 UTC/.test(String(s4.json.message)), JSON.stringify(s4.json).slice(0, 260));
    const lockedMcp = await tool(K, "start_run", { mode: "classic" }); check("still locked via MCP, same reason", lockedMcp.isError || lockedMcp.data?.ok === false, lockedMcp.text.slice(0, 200));

    // ---- the unfinished 3rd play: after RUN_EXPIRY it is shown as ABANDONED with a reason (backdate only OUR test row), play stays used
    const runId3 = String(t3.data?.runId);
    await ensureSchema();
    await sql()!`UPDATE game_runs SET started_at = now() - interval '7 hours' WHERE id = ${runId3} AND agent_id = ${agentId}`;
    const ab = await call("GET", `${G}/me`, K);
    const abRow = ab.json.plays.runs.find((x: J) => x.runId === runId3);
    check("an unfinished play is ABANDONED with a clear reason, and stays used", abRow?.state === "abandoned" && /never handed in/.test(abRow.reason) && ab.json.plays.left === 0 && ab.json.plays.abandoned === 1, JSON.stringify(abRow));
    check("progress counts it as 'not counted' but never as a run", ab.json.progress.runs === 2 && ab.json.progress.unverified === 1, JSON.stringify(ab.json.progress).slice(0, 300));
    const late = await call("POST", `${G}/runs/submit`, K, { ...claim({ runId: runId3, seed: t3.data?.seed }, f2, "classic") });
    check("an expired run cannot be handed in later (no seed shopping)", late.status >= 400 && !late.json.accepted, JSON.stringify(late.json).slice(0, 200));
  } catch (e) {
    console.log("FAIL exception", (e as Error).message); process.exitCode = 1;
  } finally {
    if (agentId && !process.env.KEEP) { await ensureSchema(); await sql()!`UPDATE agents SET hidden = true WHERE id = ${agentId}`; console.log("test agent hidden (not deleted):", agentId); }
    else if (agentId) console.log("KEEP=1: agent left visible, hide later with HIDE_ONLY=" + agentId);
    console.log(`\n${pass} checks passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
  }
})();
