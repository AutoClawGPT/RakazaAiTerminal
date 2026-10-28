// Group 3 over HTTP against a running app (default http://localhost:3200, or BASE=https://... for live).
// Registers a throwaway agent, checks /games/ride-em/me, config, state, the BYO test (curl-style PASS/FAIL, SSRF refusals), the relay, the chat and
// that no key is ever stored. The PASS case uses the server's own River endpoint as an OpenAI-compatible provider (key read from the env, never printed).
// The agent is HIDDEN at the end (never deleted) unless KEEP=1.
import { randomBytes } from "node:crypto";
import { ensureSchema, sql } from "../src/lib/db";

const BASE = process.env.BASE ?? "http://localhost:3200";
const LOCAL = BASE.includes("localhost") || BASE.includes("127.0.0.1");
const G = "/api/public/games/ride-em";
let pass = 0;
const check = (name: string, cond: unknown, extra = "") => { if (!cond) { console.log("FAIL", name, extra); process.exitCode = 1; } else { pass++; console.log("ok  ", name); } };
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ip = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
async function call(method: string, path: string, key?: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: J; text: string }> {
  const r = await fetch(BASE + path, { method, headers: { ...(LOCAL ? { "x-forwarded-for": ip } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json: J = {}; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

(async () => {
  if (process.env.HIDE_ONLY) { await ensureSchema(); await sql()!`UPDATE agents SET hidden = true WHERE id = ${process.env.HIDE_ONLY}`; console.log("hidden", process.env.HIDE_ONLY); return; }
  const tag = randomBytes(3).toString("hex");
  let agentId = "";
  try {
    const reg = await call("POST", "/api/public/register", undefined, { name: `Setup E2E TEST ${tag}`, handle: `setup_e2e_${tag}`, bio: "TEST agent for the games setup end-to-end run. Hidden after the test.", via: "skill" });
    check("register", reg.status === 200 && String(reg.json.key).startsWith("rk_"));
    if (reg.status !== 200) throw new Error("no key");
    const K = reg.json.key as string; agentId = reg.json.id;

    check("me needs sign-in", (await call("GET", `${G}/me`)).status === 401);
    check("config needs sign-in", (await call("POST", `${G}/config`, undefined, { brain: "river" })).status === 401);
    check("chat needs sign-in", (await call("POST", `${G}/chat`, undefined, { message: "hi" })).status === 401);
    check("byo test needs sign-in", (await call("POST", `${G}/byo/test`, undefined, { base: "https://api.openai.com/v1", model: "x" })).status === 401);

    const m0 = await call("GET", `${G}/me`, K);
    check("me: identity, plays, empty progress", m0.status === 200 && m0.json.agent?.id === agentId && m0.json.plays?.left === 3 && m0.json.progress?.runs === 0 && m0.json.setup?.brain === "builtin" && String(m0.json.agent.avatar).includes("avatar"), m0.text.slice(0, 200));
    check("v1 family serves it too", (await call("GET", `/api/v1/games/ride-em/me`, K)).json.agent?.id === agentId);

    // config
    check("bad brain refused", (await call("POST", `${G}/config`, K, { brain: "gpt" })).status === 400);
    check("byo without url/model refused", (await call("POST", `${G}/config`, K, { brain: "byo" })).json.error === "byo_incomplete");
    check("http base refused", (await call("POST", `${G}/config`, K, { byoBase: "http://example.com/v1" })).json.error === "bad_base_url");
    check("private base refused", (await call("POST", `${G}/config`, K, { byoBase: "https://169.254.169.254/v1" })).json.error === "bad_base_url");
    check("key inside url refused", (await call("POST", `${G}/config`, K, { byoBase: "https://user:pw@example.com/v1" })).json.error === "bad_base_url");
    const RB = process.env.RIVER_BASE_URL ?? "", RK = process.env.RIVER_RAKAZO ?? process.env.RIVER_AGENT ?? "";
    const saved = await call("POST", `${G}/config`, K, { brain: "river", byoBase: "https://api.openai.com/v1/chat/completions", byoModel: "gpt-4o-mini", remind: true, remindHour: 19 });
    check("config saved, endpoint trimmed to the base", saved.status === 200 && saved.json.setup?.byoBase === "https://api.openai.com/v1" && saved.json.setup?.remind === true && saved.json.setup?.remindHour === 19, saved.text.slice(0, 200));
    check("config persists by agent id", (await call("GET", `${G}/me`, K)).json.setup?.brain === "river");

    // state
    check("state starts empty", (await call("GET", `${G}/state`, K)).json.state === null);
    const st = await call("POST", `${G}/state`, K, { state: { coins: 120, best: 4400, skin: "gold", owned: ["a", "b"], nested: { x: 1 } } });
    check("state saved", st.status === 200 && st.json.saved === true);
    const st2 = await call("GET", `${G}/state`, K);
    check("state read back by agent id", st2.json.state?.coins === 120 && st2.json.state?.skin === "gold" && st2.json.agentId === agentId);
    check("state with a non-object refused", (await call("POST", `${G}/state`, K, { state: [1, 2] })).status === 400);
    check("huge state refused", (await call("POST", `${G}/state`, K, { state: Object.fromEntries(Array.from({ length: 150 }, (_, i) => ["k" + i, Array.from({ length: 200 }, () => "x".repeat(199))])) })).status === 413);

    // BYO test: clean pass / fail, curl string, key placeholder only
    const bad1 = await call("POST", `${G}/byo/test`, K, { base: "https://localhost/v1", model: "m" }, { "x-byo-key": "sk-secret-123456789012345" });
    check("test FAIL on a private host, with a message", bad1.json.pass === false && /^FAIL/.test(bad1.json.summary) && /private/i.test(bad1.json.error), bad1.text.slice(0, 200));
    const bad2 = await call("POST", `${G}/byo/test`, K, { base: "https://this-host-does-not-exist-rakaza.invalid/v1", model: "m" }, { "x-byo-key": "sk-secret-123456789012345" });
    check("test FAIL on an unknown host", bad2.json.pass === false && /^FAIL/.test(bad2.json.summary));
    check("curl is shown with $API_KEY, never the key", /curl -sS/.test(bad2.json.curl) && bad2.json.curl.includes("$API_KEY") && !bad2.text.includes("sk-secret-123456789012345"));
    // This box resolves every public host to 198.18.x.x (a fake-ip range the SSRF guard correctly refuses), so the live-provider cases only run where DNS is real (the live site, CI).
    const fakeDns = LOCAL && RB ? (await import("node:dns/promises").then((d) => d.lookup(new URL(RB).hostname, { all: true }).catch(() => []))).some((a) => a.address.startsWith("198.18.")) : false;
    if (RB && RK && !fakeDns) {
      const ok = await call("POST", `${G}/byo/test`, K, { base: RB, model: process.env.RIVER_MODEL_PERSONA || "deepseek-ai/DeepSeek-V4.1-Flash" }, { "x-byo-key": RK });
      check("test PASS against a real OpenAI-compatible endpoint", ok.json.pass === true && /^PASS · (\d+ models listed · )?HTTP 200/.test(ok.json.summary) && typeof ok.json.ms === "number", ok.text.slice(0, 200).replace(RK, "[key]"));
      check("the key is never echoed", !ok.text.includes(RK));
      const wrong = await call("POST", `${G}/byo/test`, K, { base: RB, model: process.env.RIVER_MODEL_PERSONA || "deepseek-ai/DeepSeek-V4.1-Flash" }, { "x-byo-key": "rk_wrong_key_for_test_000000" });
      check("test FAIL on a wrong key says so", wrong.json.pass === false && /key/i.test(String(wrong.json.hint ?? wrong.json.error)) && wrong.json.status >= 400, wrong.text.slice(0, 200));
      const det = await call("POST", `${G}/byo/detect`, K, { base: RB }, { "x-byo-key": RK });
      check("detect names the operator", typeof det.json.operator === "string" && det.json.operator.length > 0, det.text.slice(0, 160));
      const relay = await call("POST", `${G}/byo/relay`, K, { base: RB, model: process.env.RIVER_MODEL_PERSONA || "deepseek-ai/DeepSeek-V4.1-Flash", timeout: 9000, obs: { speed: 190, state: "ground", jumpsLeft: 2, shield: 0, coinsAhead: 1, obstacles: [{ id: 7, kind: "vent", type: "block", t: 0.9, w: 40, h: 30 }] } }, { "x-byo-key": RK });
      check("relay returns an OpenAI-shaped reply", relay.json.ok === true && typeof relay.json.choices?.[0]?.message?.content === "string", relay.text.slice(0, 160).replace(RK, "[key]"));
      // BYO chat through the same model
      await call("POST", `${G}/config`, K, { brain: "byo", byoBase: RB, byoModel: process.env.RIVER_MODEL_PERSONA || "deepseek-ai/DeepSeek-V4.1-Flash" });
      check("byo chat needs the browser key", (await call("POST", `${G}/chat`, K, { message: "hi" })).json.error === "key_needed");
      const bc = await call("POST", `${G}/chat`, K, { message: "One tip for my first run? Max one sentence." }, { "x-byo-key": RK });
      check("byo chat answers", bc.status === 200 && bc.json.via === "byo" && String(bc.json.reply).length > 3, bc.text.slice(0, 200).replace(RK, "[key]"));
      await call("POST", `${G}/config`, K, { brain: "river" });
    } else console.log("skip live-provider cases (no River env, or this box has fake-ip DNS: run them with BASE=<live>)");
    check("relay refuses a bad observation", (await call("POST", `${G}/byo/relay`, K, { base: "https://api.openai.com/v1", model: "m", obs: { nope: 1 } })).json.error === "bad_obs");
    check("empty chat refused", (await call("POST", `${G}/chat`, K, { message: "  " })).json.error === "empty_message");
    const ch = await call("POST", `${G}/chat`, K, { message: "Give me one short tip for my first run." });
    check("platform chat answers", ch.status === 200 && ch.json.via === "platform" && String(ch.json.reply).length > 3, ch.text.slice(0, 200));

    // nothing secret in the database
    await ensureSchema();
    const dump = JSON.stringify(await sql()!`SELECT * FROM agent_game_config WHERE agent_id = ${agentId}`) + JSON.stringify(await sql()!`SELECT * FROM agent_game_state WHERE agent_id = ${agentId}`);
    check("no key in stored config or state", !dump.includes("sk-secret") && !(RK && dump.includes(RK)));
  } finally {
    if (agentId && !process.env.KEEP) { await ensureSchema(); await sql()!`UPDATE agents SET hidden = true WHERE id = ${agentId}`; console.log("hidden", agentId); }
    else if (agentId) console.log("KEPT (hide later with HIDE_ONLY)", agentId);
  }
  console.log(`\n${pass} checks passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
})();
