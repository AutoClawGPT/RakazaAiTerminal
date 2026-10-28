import "server-only";
import { riverChat, PERSONA_MODEL_DEFAULT } from "@/lib/brain/river";
import { getEnv } from "@/lib/env";

/**
 * The River brain for the game's pilot panel (ported from the preview function). The key stays on the server (RIVER_RAKAZO, fallback RIVER_AGENT).
 * Anything that goes wrong answers {fallback:true, reason}: the page then flies the built-in pilot, so a River problem never stops a run.
 * Guards: sign-in required (the route), 4 KB body cap, strict observation schema, per-agent rate limit (the route), 2 s upstream timeout, one attempt.
 */
export const MAX_BODY = 4096;
export const UPSTREAM_TIMEOUT_MS = 2000;
export const RATE = { max: 40, windowMin: 1 };
const ACTIONS = ["jump", "slide", "stomp", "double", "wait"];
const TYPES = ["gap", "low", "monster", "block"];
const VERIFIED = new Set([PERSONA_MODEL_DEFAULT, "deepseek-ai/DeepSeek-V4.1-Flash-1017"]);

const SYSTEM = "You pilot a rooftop runner. You get the next obstacles (id, type, t = seconds until contact, w = width, h = height). "
  + "Choose one action per obstacle: jump (over blocks and gaps), slide (under low things like drones/signs), stomp (jump onto a monster), double (double jump over tall blocks), wait. "
  + 'Reply with ONLY compact JSON: {"decisions":[{"id":<number>,"do":"jump|slide|stomp|double|wait"}]} and nothing else.';

export const SAMPLE = { v: 1, speed: 52, state: "run", jumpsLeft: 2, shield: 0, coinsAhead: 3, obstacles: [{ id: 1, kind: "gap", type: "gap", t: 1.1, w: 90, h: 0 }, { id: 2, kind: "drone", type: "low", t: 2.0, w: 40, h: 60 }] };

const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? x : null);

export interface CleanObs { speed: number; state: string; jumpsLeft: number; shield: number; coinsAhead: number; obstacles: { id: number; type: string; kind: string; t: number; w: number; h: number }[] }

export function cleanObs(o: unknown): CleanObs | null {
  const r = o as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || !Array.isArray(r.obstacles)) return null;
  const obstacles: CleanObs["obstacles"] = [];
  for (const x0 of r.obstacles.slice(0, 5)) {
    const x = x0 as Record<string, unknown> | null;
    if (!x || typeof x !== "object") return null;
    const id = num(x.id, 0, 1e9), t = num(x.t, -5, 60), w = num(x.w, 0, 5000), h = num(x.h, -5000, 5000);
    if (id === null || t === null || w === null || h === null || !TYPES.includes(String(x.type))) return null;
    obstacles.push({ id: id | 0, type: String(x.type), kind: String(x.kind ?? "").replace(/[^a-z0-9_]/gi, "").slice(0, 16), t, w: Math.round(w), h: Math.round(h) });
  }
  if (!obstacles.length) return null;
  return { speed: num(r.speed, 0, 400) || 0, state: String(r.state ?? "run").replace(/[^a-z]/gi, "").slice(0, 10), jumpsLeft: num(r.jumpsLeft, 0, 5) || 0, shield: r.shield ? 1 : 0, coinsAhead: num(r.coinsAhead, 0, 999) || 0, obstacles };
}

export function parseDecisions(text: unknown): { id: number; do: string }[] | null {
  if (typeof text !== "string" || text.length > 4000) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { decisions?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  if (!j || !Array.isArray(j.decisions)) return null;
  const out: { id: number; do: string }[] = [];
  for (const d0 of j.decisions.slice(0, 8)) {
    const d = d0 as { id?: unknown; do?: unknown; action?: unknown } | null;
    if (!d || !Number.isFinite(Number(d.id))) continue;
    const a = String(d.do ?? d.action ?? "").toLowerCase();
    if (!ACTIONS.includes(a)) continue;
    out.push({ id: Number(d.id), do: a });
  }
  return out.length ? out : null;
}

let modelCache: { at: number; list: string[] | null } = { at: 0, list: null };
export async function listModels(): Promise<string[]> {
  const t = Date.now();
  if (modelCache.list && t - modelCache.at < 600_000) return modelCache.list;
  const e = getEnv(); const key = e.RIVER_RAKAZO ?? e.RIVER_AGENT;
  if (!key) throw new Error("no key");
  const r = await fetch(`${e.RIVER_BASE_URL}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(3000), cache: "no-store" });
  if (!r.ok) throw new Error("models http " + r.status);
  const d = (await r.json()) as { data?: { id?: unknown }[] };
  const list = (d.data ?? []).map((m) => String(m.id)).filter((id) => id.length < 80);
  if (!list.length) throw new Error("empty model list");
  modelCache = { at: t, list };
  return list;
}

export const modelChoices = (list: string[]) => list.slice(0, 40).map((id) => ({ id, ok: VERIFIED.has(id) ? true : null }));

export async function decide(obs: CleanObs, wanted: unknown): Promise<Record<string, unknown>> {
  let model = typeof wanted === "string" ? wanted.slice(0, 80) : PERSONA_MODEL_DEFAULT;
  let list: string[] | null = null;
  try { list = await listModels(); } catch { /* the default model only */ }
  if (!(list ? list.includes(model) : model === PERSONA_MODEL_DEFAULT)) model = PERSONA_MODEL_DEFAULT;
  const t0 = Date.now();
  const r = await riverChat([{ role: "system", content: SYSTEM }, { role: "user", content: "obs=" + JSON.stringify(obs) }], { model, maxTokens: 160, temperature: 0, timeoutMs: UPSTREAM_TIMEOUT_MS, attempts: 1 });
  const ms = Date.now() - t0;
  if (!r.ok) return { fallback: true, reason: /not set/.test(r.error) ? "river key not configured on this deployment" : /abort|timeout/i.test(r.error) ? `river timeout (${UPSTREAM_TIMEOUT_MS} ms)` : /40[13]/.test(r.error) ? "river rejected the key" : "river unavailable", ms };
  const decisions = parseDecisions(r.text);
  if (!decisions) return { fallback: true, reason: "river answer not in the expected format", ms, model };
  const ids = new Set(obs.obstacles.map((x) => x.id));
  const kept = decisions.filter((d) => ids.has(d.id));
  if (!kept.length) return { fallback: true, reason: "river answered for unknown obstacles", ms, model };
  const first = kept[0].do;
  return { live: true, decisions: kept, jump: first === "jump" || first === "double" || first === "stomp", slide: first === "slide", ms, model };
}

export { SAMPLE as BRAIN_SAMPLE };
