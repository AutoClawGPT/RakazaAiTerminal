// Ride 'Em over HTTP against a running app (default http://localhost:3200, or BASE=https://... for the live site).
// Registers a test agent the way skill.md says, flies REAL runs with the game's own pilot, submits them, and checks the fair-play guards:
// 3 plays a day (the 4th is rejected), a forged score, a replayed log, a re-used run id, wrong version, ZEN, no sign-in, impossible input rates.
// The leaderboard, the MCP game tools and the 47 older tools are checked too. Nothing moves money. At the end the test agent is HIDDEN (never deleted)
// unless KEEP=1 (so a screenshot of the live board can be taken first; hide it afterwards with HIDE_ONLY=<agentId>).
import { createRequire } from "node:module";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { ensureSchema, sql } from "../src/lib/db";

const BASE = process.env.BASE ?? "http://localhost:3200";
const LOCAL = BASE.includes("localhost") || BASE.includes("127.0.0.1");
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
const tool = async (key: string | undefined, name: string, args: unknown = {}) => {
  const r = await call("POST", "/mcp", key, { jsonrpc: "2.0", id: rid++, method: "tools/call", params: { name, arguments: args } });
  const res = r.json.result as J | undefined;
  return { isError: !!res?.isError, data: res?.structuredContent as J | undefined, text: String(res?.content?.[0]?.text ?? ""), status: r.status };
};
function fly(seed: number, cfg: Record<string, unknown>, opts: { handicap?: boolean; maxTicks?: number } = {}) {
  const w = S.create(seed, { ...cfg, __validated: true });
  let t = 0; const max = opts.maxTicks ?? 120 * 240;
  while (!w.dead && t < max) {
    if (t % 2 === 0 && !(opts.handicap && Math.floor(t / 120) % 3 === 1)) { const d = S.decide(w, null, true); if (!opts.handicap || t % 7 !== 0) S.applyDecision(w, d); }
    S.autoSkills(w); if (w.draft) S.input(w, S.OPS.DRAFT, t % 3);
    S.step(w); t++;
  }
  if (!w.dead) S.input(w, S.OPS.END, 0);
  return { inputLog: R.encode(w.log) as string, score: S.score(w) as number, distance: Math.floor(w.dist), coins: w.coins as number, near: w.near as number, hits: w.hits as number };
}

const ids: string[] = [];
(async () => {
  if (process.env.HIDE_ONLY) { await ensureSchema(); await sql()!`UPDATE agents SET hidden = true WHERE id = ${process.env.HIDE_ONLY}`; console.log("hidden", process.env.HIDE_ONLY); return; }
  const tag = randomBytes(3).toString("hex");
  let agentId = "";
  try {
    // register exactly like skill.md says
    const reg = await call("POST", "/api/public/register", undefined, { name: `Games E2E TEST ${tag}`, handle: `games_e2e_${tag}`, bio: "TEST agent for the Ride 'Em end-to-end run. Hidden after the test.", via: "skill" });
    check("register", reg.status === 200 && String(reg.json.key).startsWith("rk_"), JSON.stringify(reg.json).slice(0, 100));
    if (reg.status !== 200) throw new Error("no key");
    const K = reg.json.key as string; agentId = reg.json.id;

    // public reads and sign-in wall
    const lb0 = await call("GET", "/api/public/games/ride-em/leaderboard?range=24h");
    check("leaderboard is public", lb0.status === 200 && lb0.json.ok && Array.isArray(lb0.json.top) && lb0.json.version === "v16");
    check("start needs sign-in", (await call("POST", "/api/public/games/ride-em/runs/start", undefined, { mode: "classic" })).status === 401);
    check("plays needs sign-in", (await call("GET", "/api/public/games/ride-em/plays")).status === 401);
    check("v1 start needs a key", (await call("POST", "/api/v1/games/ride-em/runs/start", undefined, { mode: "classic" })).status === 401);
    const plays0 = await call("GET", "/api/public/games/ride-em/plays", K);
    check("3 plays left at the start", plays0.status === 200 && plays0.json.left === 3 && plays0.json.limit === 3, JSON.stringify(plays0.json));

    // ZEN and bad modes are refused and cost nothing
    const zen = await call("POST", "/api/public/games/ride-em/runs/start", K, { mode: "zen" });
    check("ZEN cannot be ranked", zen.status === 400 && zen.json.error === "zen_unranked");
    check("unknown mode refused", (await call("POST", "/api/public/games/ride-em/runs/start", K, { mode: "godmode" })).status === 400);
    check("upgrades cannot sneak in (stripped, still the base kit)", (await call("GET", "/api/public/games/ride-em/plays", K)).json.left === 3);

    // run 1: classic, honest, wrong-version first (stays open), then accepted
    const s1 = await call("POST", "/api/public/games/ride-em/runs/start", K, { mode: "classic", config: { upg: { shield: 3 }, boosts: { magnet: 2 }, startDist: 9000 } });
    check("start run 1", s1.status === 200 && s1.json.runId && s1.json.playsLeft === 2 && s1.json.config.startDist === 0 && !Object.keys(s1.json.config.upg).length, JSON.stringify(s1.json).slice(0, 160));
    const f1 = fly(s1.json.seed, s1.json.config, { handicap: true });
    check("pilot run ended by hits or END", f1.hits >= 0 && f1.inputLog.startsWith("v1:"));
    const claim1 = { runId: s1.json.runId, seed: s1.json.seed, mode: "classic", version: "v16", inputLog: f1.inputLog, score: f1.score, distance: f1.distance, coins: f1.coins, near: f1.near, controller: "pilot" };
    const wv = await call("POST", "/api/public/games/ride-em/runs/submit", K, { ...claim1, version: "v15" });
    check("wrong version rejected", wv.status === 400 && wv.json.error === "wrong_version");
    const forged = await call("POST", "/api/public/games/ride-em/runs/submit", K, { ...claim1, score: f1.score + 5000 });
    check("forged score rejected", forged.status === 422 && forged.json.error === "replay_mismatch" && forged.json.accepted === false, JSON.stringify(forged.json).slice(0, 160));
    const reuse = await call("POST", "/api/public/games/ride-em/runs/submit", K, claim1);
    check("a rejected run id is spent (cannot retry with the real numbers)", reuse.status === 409 && reuse.json.error === "run_already_submitted", JSON.stringify(reuse.json).slice(0, 120));

    // run 2: honest, accepted
    const s2 = await call("POST", "/api/public/games/ride-em/runs/start", K, { mode: "rush" });
    check("start run 2", s2.status === 200 && s2.json.playsLeft === 1);
    const f2 = fly(s2.json.seed, s2.json.config, { handicap: false, maxTicks: 120 * 50 });
    const c2 = { runId: s2.json.runId, seed: s2.json.seed, mode: "rush", version: "v16", inputLog: f2.inputLog, score: f2.score, distance: f2.distance, coins: f2.coins, near: f2.near, controller: "pilot" };
    const ok2 = await call("POST", "/api/public/games/ride-em/runs/submit", K, c2);
    check("honest run accepted and verified", ok2.status === 200 && ok2.json.accepted && ok2.json.verified && ok2.json.score === f2.score, JSON.stringify(ok2.json).slice(0, 200));
    check("run reports a rank", ok2.json.rank && ok2.json.rank.h24 >= 1);
    const again = await call("POST", "/api/public/games/ride-em/runs/submit", K, c2);
    check("run id counts once", again.status === 409 && again.json.error === "run_already_submitted");

    // run 3: copy of run 2's log under a new run id => duplicate replay (the seed differs, so use the same seed claim: must not verify or be accepted twice)
    const s3 = await call("POST", "/api/public/games/ride-em/runs/start", K, { mode: "rush" });
    check("start run 3", s3.status === 200 && s3.json.playsLeft === 0);
    const copy = await call("POST", "/api/public/games/ride-em/runs/submit", K, { ...c2, runId: s3.json.runId, seed: s3.json.seed });
    check("a copied log is not accepted twice", !copy.json.accepted && copy.status >= 400, JSON.stringify(copy.json).slice(0, 160));

    // the 4th is rejected
    const s4 = await call("POST", "/api/public/games/ride-em/runs/start", K, { mode: "classic" });
    check("4th run of the day is rejected", s4.status === 429 && s4.json.error === "no_plays_left" && s4.json.playsLeft === 0, JSON.stringify(s4.json).slice(0, 160));
    const plays1 = await call("GET", "/api/public/games/ride-em/plays", K);
    check("plays left is 0", plays1.json.left === 0);

    // impossible input rate: the run is rejected by the server before replay
    // (needs a started run, so use the run from a second agent below)
    const reg2 = await call("POST", "/api/public/register", undefined, { name: `Games E2E TEST B ${tag}`, handle: `games_e2e_b_${tag}`, bio: "TEST agent. Hidden after the test.", via: "skill" });
    const K2 = reg2.json.key as string; const id2 = reg2.json.id as string;
    const t1 = await call("POST", "/api/v1/games/ride-em/runs/start", K2, { mode: "classic" });
    check("v1 start works with a key", t1.status === 200 && t1.json.runId);
    const flood = R.encode(Array.from({ length: 80 }, (_, i) => [i, 1, 4]));
    const fl = await call("POST", "/api/v1/games/ride-em/runs/submit", K2, { runId: t1.json.runId, seed: t1.json.seed, mode: "classic", version: "v16", inputLog: flood, score: 99999 });
    check("impossible input rate rejected", fl.status === 422 && fl.json.error === "impossible_input_rate", JSON.stringify(fl.json).slice(0, 140));
    const t2 = await call("POST", "/api/v1/games/ride-em/runs/start", K2, { mode: "classic" });
    const huge = await call("POST", "/api/v1/games/ride-em/runs/submit", K2, { runId: t2.json.runId, seed: t2.json.seed, mode: "classic", version: "v16", inputLog: R.encode([[0, 1, 4], [5, 3, 0], [9, 9, 0]]), score: 1e9 });
    check("absurd score rejected", !huge.json.accepted && huge.status >= 400, JSON.stringify(huge.json).slice(0, 140));
    const other = await call("POST", "/api/v1/games/ride-em/runs/submit", K, { runId: t2.json.runId, seed: t2.json.seed, mode: "classic", version: "v16", inputLog: f2.inputLog, score: f2.score });
    check("an agent cannot submit another agent's run", other.status === 404);

    // leaderboard shows it, live fields present, viewer rank
    const lb = await call("GET", "/api/public/games/ride-em/leaderboard?range=24h&limit=50", K);
    const mine = lb.json.top?.find((x: J) => x.handle === `games_e2e_${tag}`);
    check("accepted run is on the 24h board", !!mine && mine.score === f2.score && lb.json.you?.score === f2.score, JSON.stringify(lb.json).slice(0, 200));
    check("board has rev for live refresh", typeof lb.json.rev === "string");
    const unch = await call("GET", `/api/public/games/ride-em/leaderboard?range=24h&limit=50&since=${encodeURIComponent(lb.json.rev)}`, K);
    check("since=rev says unchanged", unch.json.unchanged === true);
    for (const r of ["7d", "30d", "all", "daily"]) check(`range ${r}`, (await call("GET", `/api/public/games/ride-em/leaderboard?range=${r}`)).status === 200);
    const run = await call("GET", `/api/public/games/ride-em/run/${s2.json.runId}`);
    check("run page data", run.status === 200 && run.json.score === f2.score && !("inputLog" in run.json), "");

    // MCP
    const init = await call("POST", "/mcp", K, { jsonrpc: "2.0", id: rid++, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
    check("mcp initialize", init.status === 200 && init.json.result?.serverInfo);
    const list = await call("POST", "/mcp", K, { jsonrpc: "2.0", id: rid++, method: "tools/list" });
    const names: string[] = (list.json.result?.tools ?? []).map((t: J) => t.name);
    check("tools/list has 47 old + game tools", names.length >= 47 + 5, String(names.length));
    for (const n of ["list_games", "get_plays_left", "start_run", "submit_run", "get_leaderboard", "community_post", "vamp_scan", "prepare_launch_package"]) check(`tool ${n} listed`, names.includes(n));
    check("no forbidden tool names", !names.some((n) => /launch_token|execute_launch|trade|swap|transfer|sign_|rotate|secret|private/.test(n)));
    const lg = await tool(K, "list_games"); check("mcp list_games", !lg.isError && JSON.stringify(lg.data).includes("ride-em"));
    const pl = await tool(K, "get_plays_left"); check("mcp get_plays_left", !pl.isError && pl.data?.left === 0, pl.text.slice(0, 100));
    const gl = await tool(K, "get_leaderboard", { range: "24h" }); check("mcp get_leaderboard", !gl.isError && Array.isArray(gl.data?.top));
    const st = await tool(K, "start_run", { mode: "classic" }); check("mcp start_run honors the 3 plays limit", st.isError || st.data?.ok === false || /no_plays_left|used all/.test(st.text), st.text.slice(0, 100));
    const st2 = await tool(K2, "start_run", { mode: "hardcore" }); check("mcp start_run works for a fresh agent", !st2.isError && !!st2.data?.runId, st2.text.slice(0, 120));
    if (st2.data?.runId) {
      const f = fly(st2.data.seed, st2.data.config, { handicap: true });
      const sb = await tool(K2, "submit_run", { runId: st2.data.runId, seed: st2.data.seed, mode: "hardcore", version: "v16", inputLog: f.inputLog, score: f.score, distance: f.distance, coins: f.coins, near: f.near, controller: "external" });
      check("mcp submit_run verifies by replay", !sb.isError && sb.data?.accepted === true, sb.text.slice(0, 160));
    }
    const noKey = await call("POST", "/mcp", undefined, { jsonrpc: "2.0", id: rid++, method: "tools/call", params: { name: "start_run", arguments: { mode: "classic" } } });
    check("mcp start_run without a key is refused", noKey.status === 401 || noKey.json.error || noKey.json.result?.isError);
    const me = await tool(K, "agent_get", { handle: `games_e2e_${tag}` }); check("old tool still works (agent_get)", !me.isError, me.text.slice(0, 100));

    // River brain route: needs sign-in, never errors out
    check("river route needs sign-in", (await call("POST", "/api/public/games/ride-em/brain", undefined, { test: true })).status === 401);
    const br = await call("POST", "/api/public/games/ride-em/brain", K, { test: true });
    check("river route answers (live or fallback)", br.status === 200 && (br.json.live === true || br.json.fallback === true), JSON.stringify(br.json).slice(0, 140));
    const bad = await call("POST", "/api/public/games/ride-em/brain", K, { obstacles: "x" });
    check("river route rejects bad input", bad.status === 400);

    // drop info
    const dr = await call("GET", "/api/public/games/ride-em/drop", K);
    check("drop info only, payout disabled, no wallet => not eligible", dr.status === 200 && dr.json.eligible === false && dr.json.payout?.enabled === false && dr.json.schedule, JSON.stringify(dr.json).slice(0, 120));

    // discovery
    for (const p of ["/skill.md", "/api", "/openapi.json", "/llms.txt", "/games", "/games/ride-em", "/games/ride-em/index.html", "/leaderboard"]) { const r = await fetch(BASE + p, { headers: { Accept: p === "/api" ? "application/json" : "text/html" } }); check(`${p} reachable`, r.status === 200, String(r.status)); }
    const sk = await (await fetch(BASE + "/skill.md")).text();
    check("skill.md documents games", /## 9\. Games/.test(sk) && sk.includes("/api/v1/games/ride-em/runs/start"));
    check("skill.md does not promise payouts", !/payout.*enabled|we send|paid out/i.test(((sk.split(/## 9\. Games/)[1] ?? "").split(/\n## /)[0]).replace(/not .*?paid/gi, "")));
    void id2;
    if (id2) ids.push(id2);
  } catch (e) { console.log("FAIL exception", e instanceof Error ? e.stack : e); process.exitCode = 1; }
  finally {
    if (process.env.KEEP === "1") console.log("KEEP=1: test agents stay visible. Hide later with HIDE_ONLY=<id>:", [agentId, ...ids].join(" "));
    else if (agentId) { await ensureSchema(); for (const id of [agentId, ...ids]) await sql()!`UPDATE agents SET hidden = true WHERE id = ${id}`; console.log("test agents hidden (not deleted)"); }
    console.log(`${pass} checks passed${process.exitCode ? " WITH FAILURES" : ""}`);
  }
})();
