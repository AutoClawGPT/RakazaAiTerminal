// The ranked PLAY RULE, pure (no database, no network). `npx tsx tests/play-rule.test.ts`
// Bug this guards: an agent (@clawrenai) showed "PLAYS LEFT TODAY 0/3" with 0 verified runs, 0 XP, no rank and no reason. A play was reserved at start and a run
// that was left early / never handed in / could not be checked yet stayed 'started' forever: the play was gone and nothing said why.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { MAX_SUBMIT_ATTEMPTS, OPEN_CODES, PLAY_RULE, RUN_EXPIRY_HOURS, VERSION, playRowOf, rankedConfig, reasonOf, verifyRun, type DayRow } from "../src/lib/games/ride-em/engine";

const root = process.cwd();
const req = createRequire(join(root, "src/lib/games/ride-em/vendor/x.js"));
const S = req("./rakaza-sim.js"), R = req("./rakaza-replay.js");
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name); };

const base: DayRow = { id: "run_" + "a".repeat(24), slot: 1, mode: "classic", status: "started", reject_code: null, score: null, distance: null, attempts: 0, last_error: null, started_at: new Date().toISOString() };
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

ok("a run that is still open is IN PROGRESS and says until when", () => {
  const r = playRowOf(base);
  assert.equal(r.state, "in_progress");
  assert.ok(r.expiresAt && Date.parse(r.expiresAt) > Date.now());
});
ok("a run never handed in is shown as ABANDONED with a reason (the exact @clawrenai case), not as nothing", () => {
  const r = playRowOf({ ...base, started_at: ago(RUN_EXPIRY_HOURS + 1) });
  assert.equal(r.state, "abandoned");
  assert.equal(r.code, "abandoned");
  assert.match(r.reason ?? "", /never handed in/);
  assert.match(r.reason ?? "", /stays used/);
  assert.equal(r.expiresAt, null);
});
ok("an open run keeps the reason of its last failed hand-in", () => {
  const r = playRowOf({ ...base, attempts: 1, last_error: "wrong_version" });
  assert.equal(r.state, "in_progress");
  assert.equal(r.code, "wrong_version");
  assert.match(r.reason ?? "", /Reload the game/);
  const old = playRowOf({ ...base, attempts: 2, last_error: "bad_input_log", started_at: ago(9) });
  assert.equal(old.state, "abandoned");
  assert.match(old.reason ?? "", /Last hand-in problem: The input log could not be read/);
});
ok("verified and rejected runs carry score or reason", () => {
  const v = playRowOf({ ...base, status: "accepted", score: 1234, distance: 1000 });
  assert.equal(v.state, "verified"); assert.equal(v.score, 1234); assert.equal(v.reason, null);
  const x = playRowOf({ ...base, status: "rejected", reject_code: "replay_mismatch" });
  assert.equal(x.state, "rejected"); assert.match(x.reason ?? "", /did not reproduce/);
});
ok("every code the referee can return has a human reason", () => {
  for (const c of ["wrong_version", "bad_input_log", "run_not_finished", "replay_mismatch", "impossible_input_rate", "impossible_score", "run_too_long", "replay_failed", "duplicate_replay", "run_expired", "too_many_attempts", "abandoned"]) assert.ok(reasonOf(c).length > 10, c);
  assert.equal(reasonOf(null), "");
});
ok("the rule is written down: reserved at start, END to leave early, open codes, expiry, no refund", () => {
  assert.match(PLAY_RULE, /reserved when a run starts/);
  assert.match(PLAY_RULE, /END input/);
  assert.match(PLAY_RULE, new RegExp(`${MAX_SUBMIT_ATTEMPTS} tries`));
  assert.match(PLAY_RULE, new RegExp(`${RUN_EXPIRY_HOURS} hours`));
  assert.match(PLAY_RULE, /stays used/);
});

// ---- a run left early is handed in with END and verifies with the score reached so far (what RESTART / TITLE / closing the page do)
function flyUntil(seed: number, mode: string, ticks: number, end: boolean) {
  const rc = rankedConfig({}, mode);
  assert.ok(rc.ok);
  const cfg = (rc as { config: Record<string, unknown> }).config;
  const w = S.create(seed, { ...cfg, __validated: true });
  for (let t = 0; t < ticks && !w.dead; t++) { if (t % 2 === 0) S.applyDecision(w, S.decide(w, null, true)); S.autoSkills(w); if (w.draft) S.input(w, S.OPS.DRAFT, t % 3); S.step(w); }
  if (end) S.input(w, S.OPS.END, 0);
  return { cfg, log: R.encode(w.log) as string, real: { score: S.score(w), distance: Math.floor(w.dist), coins: w.coins, near: w.near }, dead: !!w.dead };
}
ok("leaving a ranked run early (END at the current tick) is a VERIFIED run with the score so far", () => {
  const f = flyUntil(777001, "classic", 120 * 12, true);
  const v = verifyRun({ seed: 777001, mode: "classic", config: f.cfg, inputLog: f.log, claim: f.real, version: VERSION });
  assert.ok(v.ok, JSON.stringify(v));
  if (v.ok) { assert.equal(v.result.score, f.real.score); assert.ok(v.result.score > 0); }
});
ok("leaving early WITHOUT the END input does not reproduce (the replay plays on to its end): that is why the game appends END, and why cheating codes stay final", () => {
  const f = flyUntil(777002, "classic", 120 * 12, false);
  const v = verifyRun({ seed: 777002, mode: "classic", config: f.cfg, inputLog: f.log, claim: f.real, version: VERSION });
  assert.ok(!v.ok);
  if (!v.ok) assert.equal(v.code, "replay_mismatch");
  assert.ok(OPEN_CODES.has("run_not_finished") && OPEN_CODES.has("wrong_version") && OPEN_CODES.has("bad_input_log"));
  assert.ok(!OPEN_CODES.has("replay_mismatch") && !OPEN_CODES.has("impossible_input_rate"), "cheating codes stay final");
});

// ---- the shipped game files do it
const html = readFileSync(join(root, "public/games/ride-em/index.html"), "utf8");
const agent = readFileSync(join(root, "public/games/ride-em/rakaza-agent.js"), "utf8");
const adapter = readFileSync(join(root, "public/games/ride-em/rakaza-adapter.js"), "utf8");
ok("pause menu RESTART and TITLE end a ranked run instead of dropping it", () => {
  assert.match(html, /\$\('pause-retry'\)\.onclick = \(\) => \{\s*forfeitRanked\(\);/);
  assert.match(html, /\$\('pause-home'\)\.onclick = \(\) => \{\s*if \(!forfeitRanked\(\)\)/);
  assert.match(html, /function forfeitRanked\(\)[\s\S]*Sim\.input\(game, Sim\.OPS\.END, 0\)[\s\S]*endGame\(\)/);
  assert.match(html, /forfeitRanked, endGame/);
});
ok("closing the page hands the live ranked run in (keepalive), and a failed hand-in is retried and kept", () => {
  assert.match(agent, /addEventListener\('pagehide'[\s\S]*forfeitRanked/);
  assert.match(agent, /async function submitWithRetry/);
  assert.match(agent, /rz_pending_run_v1/);
  assert.match(agent, /async function resendPending/);
  assert.match(adapter, /keepalive: keep/);
  assert.match(adapter, /transient: true/);
});

console.log(`\n${n} play-rule checks passed`);
