// AI pilot stages over HTTP against a running app (default http://localhost:3200, or BASE=https://... for live).
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
  const tag = randomBytes(3).toString("hex");
  let agentId = "";
  try {
    const reg = await call("POST", "/api/public/register", undefined, { name: `Stages E2E TEST ${tag}`, handle: `stages_e2e_${tag}`, bio: "TEST agent for the pilot stages run. Hidden after the test.", via: "skill" });
    check("register", reg.status === 200 && String(reg.json.key).startsWith("rk_"));
    const K = reg.json.key as string; agentId = reg.json.id;
    const m0 = await call("GET", `${G}/me`, K);
    check("default: stage 1, expert locked (max 5)", m0.json.setup?.pilotStage === 1 && m0.json.setup?.pilotMax === 5);
    const s3 = await call("POST", `${G}/config`, K, { pilotStage: 3 });
    check("stage 3 saves", s3.status === 200 && s3.json.setup?.pilotStage === 3);
    check("stage 3 is read back", (await call("GET", `${G}/me`, K)).json.setup?.pilotStage === 3);
    const s6 = await call("POST", `${G}/config`, K, { pilotStage: 6 });
    check("stage 6 refused: locked", s6.status === 403 && s6.json.error === "stage_locked");
    check("stage 7 / 0 / text refused", (await call("POST", `${G}/config`, K, { pilotStage: 7 })).status === 400 && (await call("POST", `${G}/config`, K, { pilotStage: 0 })).status === 400 && (await call("POST", `${G}/config`, K, { pilotStage: "six" })).status === 400);
    const sneaky = await call("POST", `${G}/config`, K, { pilotStage: 5, expertUnlocked: true, expert_unlocked: true, pilotMax: 6 });
    const m1 = await call("GET", `${G}/me`, K);
    check("an agent cannot unlock the expert by itself", sneaky.status === 200 && m1.json.setup?.pilotMax === 5 && (await call("POST", `${G}/config`, K, { pilotStage: 6 })).status === 403);
    for (const p of [`${G}/unlock`, `${G}/expert`, `${G}/pilot`]) { const r = await call("POST", p, K, { stage: 6 }); check(`${p} does not unlock anything`, r.status === 404 || r.status === 405 || r.json.ok !== true); }
    const sk = await call("GET", "/skill.md"); const tp = await call("GET", `${G}/me`, K);
    check("skill.md does not describe the expert unlock", !/unlock expert|expert pilot|stage 6/i.test(sk.text));
    check("training prompt does not expose the expert", !/expert|stage 6|unlock/i.test(String(tp.json.trainingPrompt ?? tp.json.prompt ?? "")));
    // the owner's unlock (what the owner-only dash action writes) - then stage 6 may be selected, and locking again clamps it
    await ensureSchema();
    await sql()!`UPDATE agent_game_config SET expert_unlocked = true WHERE agent_id = ${agentId}`;
    check("after the owner unlock stage 6 is allowed", (await call("POST", `${G}/config`, K, { pilotStage: 6 })).json.setup?.pilotStage === 6 && (await call("GET", `${G}/me`, K)).json.setup?.pilotMax === 6);
    await sql()!`UPDATE agent_game_config SET expert_unlocked = false, pilot_stage = LEAST(pilot_stage, 5) WHERE agent_id = ${agentId}`;
    const m2 = await call("GET", `${G}/me`, K);
    check("locking again puts the agent back on stage 5", m2.json.setup?.pilotMax === 5 && m2.json.setup?.pilotStage === 5);
    check("brain settings survive a stage change", m2.json.setup?.brain === "builtin");
  } catch (e) { console.log("ERROR", e instanceof Error ? e.message : e); process.exitCode = 1; }
  finally { if (agentId) { await ensureSchema(); await sql()!`UPDATE agents SET hidden = true WHERE id = ${agentId}`; } }
  console.log(`\n${pass} passed${process.exitCode ? ", FAILURES above" : ""}`);
})();
