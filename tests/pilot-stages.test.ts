import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { rankedConfig } from "../src/lib/games/ride-em/engine";
import { trainingPrompt } from "../src/lib/games/ride-em/training-prompt";

// AI pilot stages: 1 = beginner (loses), 2-5 progressively stronger, 6 = the untouched expert (locked). The score is never touched here: it is the server replay.
const root = process.cwd();
const req = createRequire(join(root, "src/lib/games/ride-em/vendor/x.js"));
const S = req("./rakaza-sim.js"), R = req("./rakaza-replay.js");
const ST = createRequire(join(root, "public/games/ride-em/x.js"))("./rakaza-stages.js");

const rc = rankedConfig({}, "classic") as { ok: boolean; config: Record<string, unknown> };
assert.ok(rc.ok);
function fly(seed: number, stage: number, maxTicks: number) {
  const w = S.create(seed, { ...rc.config, __validated: true });
  let t = 0;
  while (!w.dead && t < maxTicks) {
    if (t % 2 === 0) S.applyDecision(w, ST.shape(w, S.decide(w, null, true), stage));
    S.autoSkills(w);
    if (w.draft) S.input(w, S.OPS.DRAFT, t % 3);
    S.step(w); t++;
  }
  return { w, t, log: R.encode(w.log) as string };
}
const seeds = [11, 222, 3333, 44444, 555555, 6666666, 77777, 8888];
const MAX = 120 * 150; // 150 s
const surv: Record<number, number> = {};
for (const st of [1, 2, 3, 4, 5, 6]) {
  let total = 0;
  for (const sd of seeds) total += fly(sd, st, MAX).t;
  surv[st] = total / seeds.length;
}
// stage 1 really loses and hits things, every time
for (const sd of seeds) { const r = fly(sd, 1, MAX); assert.ok(r.w.dead, `stage 1 loses (seed ${sd})`); assert.ok(r.t < 120 * 90, "stage 1 loses early"); }
// progressively stronger
assert.ok(surv[1] < surv[2] && surv[2] < surv[3] && surv[3] < surv[4] && surv[4] <= surv[5] && surv[5] <= surv[6], `monotonic: ${JSON.stringify(surv)}`);
// stage 6 is the expert, unchanged: identical input log to the plain, un-staged pilot, byte for byte (whatever it does today, it still does)
for (const sd of seeds) {
  const staged = fly(sd, 6, MAX);
  const w = S.create(sd, { ...rc.config, __validated: true }); let t = 0;
  while (!w.dead && t < MAX) { if (t % 2 === 0) S.applyDecision(w, S.decide(w, null, true)); S.autoSkills(w); if (w.draft) S.input(w, S.OPS.DRAFT, t % 3); S.step(w); t++; }
  assert.equal(staged.log, R.encode(w.log), `stage 6 identical to the expert (seed ${sd})`);

}
// deterministic (a replay of a staged run is the same run)
assert.equal(fly(11, 3, 120 * 40).log, fly(11, 3, 120 * 40).log);
// a staged run is still verified by the normal replay, which is the only score
const r3 = fly(222, 2, 120 * 40);
const re = R.replay(222, R.decode ? R.decode(r3.log) : r3.log, { ...rc.config, __validated: true });
assert.ok(re, "replay works for a staged run");

// the guest/local stage is capped at 5 and defaults to 1
assert.equal(ST.stage(), 1);
// the training prompt never mentions the expert stage or the pilot internals
const prompt = trainingPrompt({ base: "https://example.test", handle: "x", name: "x" }).toLowerCase();
for (const bad of ["stage 6", "expert", "unlock", "pilotmax", "pilotstage", "defaultgenome", "never loses"]) assert.ok(!prompt.includes(bad), `training prompt does not expose "${bad}"`);
// no payment or wallet code in the stage files
const files = ["public/games/ride-em/rakaza-stages.js", "src/components/account/unlock-expert.tsx"].map((f) => readFileSync(join(root, f), "utf8").toLowerCase());
for (const f of files) for (const bad of ["wallet", "solana", "payout", "transfer("]) assert.ok(!f.includes(bad), `no ${bad} in stage files`);
console.log("pilot-stages: ok", JSON.stringify(surv));
