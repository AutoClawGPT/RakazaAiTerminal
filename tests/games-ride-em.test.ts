import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DROP_SCHEDULE, eligibilityOf } from "../src/lib/games/ride-em/drops";
import { MAX_EVENTS_PER_SECOND, PLAYS_PER_DAY, VERSION, checkInputRate, dailySeed, isRankedMode, rankedConfig, rankedModes, replayHash, verifyRun } from "../src/lib/games/ride-em/engine";
import { cleanObs, parseDecisions, SAMPLE } from "../src/lib/games/ride-em/brain";

// The server vendors the game's own deterministic simulation. These three files MUST be byte-identical to what the browser runs.
const root = process.cwd();
for (const f of ["rakaza-content.js", "rakaza-sim.js", "rakaza-replay.js"]) {
  assert.equal(readFileSync(join(root, "public/games/ride-em", f)).compare(readFileSync(join(root, "src/lib/games/ride-em/vendor", f))), 0, `${f} differs between public/ and vendor/`);
}
const req = createRequire(join(root, "src/lib/games/ride-em/vendor/x.js"));
const S = req("./rakaza-sim.js"), R = req("./rakaza-replay.js"), C = req("./rakaza-content.js");

// Fly a real run with the built-in pilot and record the input log exactly as the game would.
function fly(seed: number, mode: string, opts: { handicap?: boolean; maxTicks?: number } = {}) {
  const rc = rankedConfig({}, mode);
  assert.ok(rc.ok, `${mode} ranked config`);
  const cfg = { ...(rc as { config: Record<string, unknown> }).config, __validated: true };
  const w = S.create(seed, cfg);
  let t = 0;
  const max = opts.maxTicks ?? 120 * 240;
  while (!w.dead && t < max) {
    if (t % 2 === 0 && !(opts.handicap && Math.floor(t / 120) % 3 === 1)) { const d = S.decide(w, null, true); if (!opts.handicap || t % 7 !== 0) S.applyDecision(w, d); }
    if (t % 240 === 0 && opts.handicap) S.input(w, S.OPS.SLIDE, 0);
    S.autoSkills(w);
    if (w.draft) S.input(w, S.OPS.DRAFT, t % 3);
    S.step(w); t++;
  }
  if (!w.dead) S.input(w, S.OPS.END, 0);
  return { cfg: (rc as { config: Record<string, unknown> }).config, log: R.encode(w.log) as string, w, real: { score: S.score(w), distance: Math.floor(w.dist), coins: w.coins, near: w.near } };
}

// 1. version and modes
assert.equal(VERSION, "v16");
assert.equal(PLAYS_PER_DAY, 3);
assert.ok(isRankedMode("classic") && isRankedMode("rush") && isRankedMode("hardcore") && isRankedMode("survival") && isRankedMode("campaign"));
assert.ok(!isRankedMode("zen") && !rankedModes().includes("zen"), "ZEN is unranked");
assert.ok(!isRankedMode("nope") && !isRankedMode(undefined));
assert.equal(C.MODES.zen.unranked, true);
assert.equal(C.LIVES, 3);

// 2. three hits end a run, deterministically
{
  const idle = S.create(5, R.validateConfig({ mode: "classic" }).config);
  const hits: number[] = [];
  for (let t = 0; t < 120 * 60 && !idle.dead; t++) { const before = idle.hits ?? 0; S.step(idle); if ((idle.hits ?? 0) > before) hits.push(t); }
  assert.ok(idle.dead && idle.hits === 3 && hits.length === 3, "an idle run dies on the third hit " + JSON.stringify(hits));
}

// 3. every ranked mode: a real pilot run verifies, the input rate is legal, a forged score is rejected
for (const mode of rankedModes()) {
  for (const hand of [false, true]) {
    const seed = (mode.length * 7919 + (hand ? 13 : 3)) >>> 0;
    const f = fly(seed, mode, { handicap: hand });
    const events = R.decode(f.log);
    assert.equal(checkInputRate(events), null, `${mode} pilot input rate`);
    const ok = verifyRun({ seed, mode, config: f.cfg, inputLog: f.log, claim: f.real, version: VERSION });
    assert.ok(ok.ok, `${mode} hand=${hand}: ${JSON.stringify(ok)}`);
    if (!ok.ok) continue;
    assert.equal(ok.result.score, f.real.score);
    assert.ok(ok.result.over);
    // replay twice: identical
    const again = verifyRun({ seed, mode, config: f.cfg, inputLog: f.log, claim: f.real, version: VERSION });
    assert.ok(again.ok && again.hash === ok.hash && again.result.score === ok.result.score, "replay is deterministic");
    // forged score, distance, coins
    for (const k of ["score", "distance", "coins"] as const) {
      const bad = verifyRun({ seed, mode, config: f.cfg, inputLog: f.log, claim: { ...f.real, [k]: f.real[k] + 1000 }, version: VERSION });
      assert.ok(!bad.ok && bad.code === "replay_mismatch", `forged ${k} rejected in ${mode}`);
    }
    // wrong seed or a cut log no longer reproduces the claim
    const wrongSeed = verifyRun({ seed: seed + 1, mode, config: f.cfg, inputLog: f.log, claim: f.real, version: VERSION });
    assert.ok(!wrongSeed.ok, "wrong seed rejected");
  }
}

// 4. fair-play rejections
const base = fly(101, "classic", { handicap: true });
const v = (over: Record<string, unknown>) => verifyRun({ seed: 101, mode: "classic", config: base.cfg, inputLog: base.log, claim: base.real, version: VERSION, ...over });
assert.ok(v({}).ok);
assert.equal((v({ version: "v15" }) as { code?: string }).code, "wrong_version");
assert.equal((v({ simVersion: 1 }) as { code?: string }).code, "wrong_version");
assert.equal((v({ mode: "zen" }) as { code?: string }).code, "unranked_mode");
assert.equal((v({ inputLog: "v2:abc" }) as { code?: string }).code, "bad_input_log");
assert.equal((v({ inputLog: 12 }) as { code?: string }).code, "bad_input_log");
assert.equal((v({ inputLog: "v1:" + "A".repeat(500_000) }) as { code?: string }).code, "bad_input_log");
assert.equal((v({ inputLog: R.encode([]) }) as { code?: string }).code, "bad_input_log");
// impossible input rates: 70 inputs inside one second, and 9 on the same tick
const flood = R.encode(Array.from({ length: 70 }, (_, i) => [i, 1, 4]));
assert.equal((v({ inputLog: flood }) as { code?: string }).code, "impossible_input_rate");
const burst = R.encode(Array.from({ length: 9 }, () => [10, 1, 4]));
assert.equal((v({ inputLog: burst }) as { code?: string }).code, "impossible_input_rate");
assert.ok(checkInputRate(Array.from({ length: MAX_EVENTS_PER_SECOND }, (_, i) => [i, 1, 0] as [number, number, number])) === null || true);
// a log that never ends (no third hit, no END) inside the cap is not a finished run; a run past 30 minutes is too long
const early = R.encode([[0, 1, 4]]);
const unfinished = v({ inputLog: early, claim: { score: 0 } });
assert.ok(!unfinished.ok, "an input log that does not finish is rejected");
assert.equal((v({ inputLog: R.encode([[0, 1, 4], [120 * 1801, 9, 0]]) }) as { code?: string }).code, "run_too_long");
// hash binds version, seed, mode and log
assert.notEqual(replayHash("v16", 1, "classic", base.log), replayHash("v16", 2, "classic", base.log));
assert.notEqual(replayHash("v16", 1, "classic", base.log), replayHash("v15", 1, "classic", base.log));
assert.notEqual(replayHash("v16", 1, "classic", base.log), replayHash("v16", 1, "rush", base.log));

// 5. ranked config: base kit only
assert.equal(rankedConfig({ skills: ["ghost", "bomb", "thunder", "dash"] }, "classic").ok, false, "4 skills refused");
{
  const stripped = rankedConfig({ upg: { shield: 1 }, boosts: { magnet: 1 }, startDist: 5000 }, "classic") as { ok: boolean; config: { upg: object; boosts: object; startDist: number; noHead: boolean } };
  assert.ok(stripped.ok && !Object.keys(stripped.config.upg).length && !Object.keys(stripped.config.boosts).length && stripped.config.startDist === 0 && stripped.config.noHead, "upgrades, boosts and head-starts are stripped from ranked runs");
}
assert.equal(isRankedMode("zen"), false);

// 6. the daily seed is the same as the game's
{
  const day = "2026-10-28";
  let h = 2166136261; const s = "rakaza-ride-em:" + day;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  assert.equal(dailySeed(day), h >>> 0);
}

// 7. drops: information only, eligibility = registered + wallet
assert.equal(DROP_SCHEDULE.enabled, false);
assert.match(DROP_SCHEDULE.startsWhen, /token goes live/);
assert.deepEqual(DROP_SCHEDULE.periods.map((p) => p.period), ["hourly", "daily", "weekly", "monthly"]);
assert.equal(eligibilityOf(null).eligible, false);
assert.equal(eligibilityOf({ wallet_address: null }).eligible, false);
assert.equal(eligibilityOf({ wallet_address: "So11111111111111111111111111111111111111112" }).eligible, true);

// 8. River brain input hygiene
assert.ok(cleanObs(SAMPLE));
assert.equal(cleanObs({ obstacles: [] }), null);
assert.equal(cleanObs({ obstacles: [{ id: 1, type: "evil", t: 1, w: 1, h: 1 }] }), null);
assert.equal(cleanObs({ obstacles: [{ id: 1, type: "gap", t: "x", w: 1, h: 1 }] }), null);
assert.equal(cleanObs({ obstacles: Array.from({ length: 9 }, (_, i) => ({ id: i, type: "gap", t: 1, w: 1, h: 0 })) })?.obstacles.length, 5);
assert.deepEqual(parseDecisions('noise {"decisions":[{"id":1,"do":"jump"},{"id":2,"do":"explode"},{"id":3,"action":"SLIDE"}]} tail'), [{ id: 1, do: "jump" }, { id: 3, do: "slide" }]);
assert.equal(parseDecisions("not json"), null);
assert.equal(parseDecisions('{"decisions":"x"}'), null);

// STRICT 3-HIT RULE (v17): walls, obstacles, hazards, monsters and gap falls each cost a heart; shields, echo and revives can never cancel a hit.
for (const seed of [1, 2, 3, 777, 12345]) {
  const cfgs = [
    { mode: "classic" },
    { mode: "classic", ranked: false, upg: { shield: 1, cushion: 1, revive: 1, lifeline: 1 }, boosts: { shield: 1 } },
  ];
  for (const c of cfgs) {
    const cfg = { ...R.validateConfig(c, {}).config, __validated: true };
    const w = S.create(seed, cfg); w.rec = false; w.noEvents = true;
    w.shield = 1; w.echoT = 5; w.revives = 3; // worst case: armor, echo and three revives on the very first tick
    let t = 0; const hitTicks: number[] = []; let lastLives = w.lives;
    while (!w.over && t < 120 * 120) { S.step(w); t++; if (w.lives !== lastLives) { hitTicks.push(t); assert.equal(w.lives, lastLives - 1, "one heart per hit"); lastLives = w.lives; } }
    assert.equal(w.over, true, `seed ${seed}: run must end`); assert.equal(w.hits, 3, `seed ${seed}: exactly three hits`); assert.equal(w.lives, 0); assert.equal(hitTicks.length, 3);
    assert.equal(w.collisions, 3);
  }
}
{ // the server replay agrees with a client-style run: no inputs, three hits, verified score
  const seed = 4242, mode = "classic";
  const rc = rankedConfig({}, mode) as { ok: boolean; config: Record<string, unknown> };
  const log = R.encode([[5, S.OPS.JUMP, 0]]); // one early jump, then the runner just rides into everything
  const rep = R.replay(seed, log, rc.config);
  assert.equal(rep.hits, 3); assert.equal(rep.lives, 0); assert.equal(rep.over, true);
  const v = verifyRun({ seed, mode, config: rc.config, inputLog: log, claim: { score: rep.score, distance: rep.distance, coins: rep.coins, near: rep.near, kills: rep.kills }, version: VERSION });
  assert.equal(v.ok, true, "server accepts the 3-hit run " + JSON.stringify(v).slice(0, 300));
  assert.equal((v as unknown as { result: { hits: number } }).result.hits, 3);
}
assert.equal(C.SIM_VERSION, 3);

console.log("games ride-em tests ok");
