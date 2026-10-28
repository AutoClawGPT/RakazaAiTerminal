import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Bring-your-own model (OpenAI-compatible /chat/completions), called from the server so browsers that are blocked by CORS can still use it.
 * The key arrives per request in a header, is used for exactly one upstream call and is never stored, logged or echoed back (it is scrubbed from every message).
 * The base URL is user supplied, so it is checked hard: https only, no credentials, no private / loopback / link-local / metadata addresses, no redirects.
 */
export interface Operator { id: string; label: string }
const OPERATORS: [RegExp, Operator][] = [
  [/(^|\.)openai\.com$/i, { id: "openai", label: "OpenAI" }],
  [/(^|\.)openrouter\.ai$/i, { id: "openrouter", label: "OpenRouter" }],
  [/(^|\.)anthropic\.com$/i, { id: "anthropic", label: "Anthropic (OpenAI-compatible endpoint)" }],
  [/(^|\.)groq\.com$/i, { id: "groq", label: "Groq" }],
  [/(^|\.)together\.(xyz|ai)$/i, { id: "together", label: "Together AI" }],
  [/(^|\.)deepseek\.com$/i, { id: "deepseek", label: "DeepSeek" }],
  [/(^|\.)mistral\.ai$/i, { id: "mistral", label: "Mistral" }],
  [/(^|\.)fireworks\.ai$/i, { id: "fireworks", label: "Fireworks" }],
  [/(^|\.)x\.ai$/i, { id: "xai", label: "xAI" }],
  [/(^|\.)googleapis\.com$/i, { id: "gemini", label: "Google Gemini (OpenAI-compatible endpoint)" }],
  [/(^|\.)cerebras\.ai$/i, { id: "cerebras", label: "Cerebras" }],
  [/(^|\.)perplexity\.ai$/i, { id: "perplexity", label: "Perplexity" }],
  [/(^|\.)nvidia\.com$/i, { id: "nvidia", label: "NVIDIA NIM" }],
  [/(^|\.)huggingface\.co$/i, { id: "huggingface", label: "Hugging Face" }],
  [/(^|\.)endpoints\.huggingface\.cloud$/i, { id: "huggingface", label: "Hugging Face" }],
  [/(^|\.)azure\.com$/i, { id: "azure", label: "Azure OpenAI" }],
  [/(^|\.)river\./i, { id: "river", label: "River" }],
];

export function operatorOf(host: string): Operator { for (const [re, op] of OPERATORS) if (re.test(host)) return op; return { id: "custom", label: "Custom (OpenAI-compatible)" }; }

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("::ffff:")) return isPrivateIp(x.slice(7));
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true;
}

export type Base = { ok: true; url: string; host: string; operator: Operator } | { ok: false; message: string };

/** Syntax only (no DNS): used by the unit tests and before the lookup. */
export function parseBase(raw: unknown): Base {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, message: "Base URL is empty. Example: https://api.openai.com/v1" };
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, message: "That is not a URL. Example: https://api.openai.com/v1" }; }
  if (u.protocol !== "https:") return { ok: false, message: "The base URL must start with https://" };
  if (u.username || u.password) return { ok: false, message: "Do not put a key or password inside the URL. Use the API key field." };
  if (u.search || u.hash) return { ok: false, message: "Remove the ?query and #fragment from the base URL." };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost") || (isIP(host) && isPrivateIp(host))) return { ok: false, message: "That address is private. The server can only reach public https endpoints." };
  let path = u.pathname.replace(/\/+$/, "");
  path = path.replace(/\/chat\/completions$/, "");
  return { ok: true, url: `https://${u.host}${path}`, host, operator: operatorOf(host) };
}

/** Syntax + DNS: every address the host resolves to must be public. */
export async function checkBase(raw: unknown): Promise<Base> {
  const b = parseBase(raw);
  if (!b.ok) return b;
  if (!isIP(b.host)) {
    try {
      const addrs = await lookup(b.host, { all: true });
      if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return { ok: false, message: "That host resolves to a private address. The server can only reach public https endpoints." };
    } catch { return { ok: false, message: `Could not find the host ${b.host}. Check the base URL.` }; }
  }
  return b;
}

export const cleanModelId = (v: unknown): string => (typeof v === "string" ? v.trim().replace(/[^\w.:/@+\-]/g, "").slice(0, 120) : "");
const scrub = (t: string, key: string) => { let s = t; if (key.length >= 6) s = s.split(key).join("[key]"); return s.replace(/\b(sk|rk|rkb|pk|key)[-_][A-Za-z0-9_\-]{12,}/g, "[key]"); };

export interface ByoCall { ok: boolean; pass: boolean; status: number; ms: number; text?: string; model?: string; operator?: string; error?: string; hint?: string }

function explain(status: number): string {
  if (status === 401 || status === 403) return "The provider rejected the API key (or the key has no access to this model).";
  if (status === 404) return "Not found. Check the base URL (it usually ends in /v1) and the model ID.";
  if (status === 400) return "The provider refused the request. Check the model ID.";
  if (status === 402) return "The provider says the account has no credit.";
  if (status === 429) return "Rate limited by the provider. Wait a moment and try again.";
  if (status >= 500) return "The provider had a server error. Try again in a moment.";
  return "Unexpected answer from the provider.";
}

export async function byoChat(o: { base: string; model: string; key: string; messages: { role: string; content: string }[]; maxTokens?: number; temperature?: number; timeoutMs?: number }): Promise<ByoCall> {
  const b = await checkBase(o.base);
  if (!b.ok) return { ok: false, pass: false, status: 0, ms: 0, error: b.message };
  const model = cleanModelId(o.model);
  if (!model) return { ok: false, pass: false, status: 0, ms: 0, operator: b.operator.label, error: "Model ID is empty." };
  const t0 = Date.now();
  try {
    const res = await fetch(`${b.url}/chat/completions`, {
      method: "POST", redirect: "manual", cache: "no-store",
      headers: { "content-type": "application/json", ...(o.key ? { authorization: `Bearer ${o.key}` } : {}) },
      body: JSON.stringify({ model, messages: o.messages, max_tokens: o.maxTokens ?? 160, temperature: o.temperature ?? 0 }),
      signal: AbortSignal.timeout(Math.max(800, Math.min(20_000, o.timeoutMs ?? 12_000))),
    });
    const ms = Date.now() - t0;
    const raw = (await res.text()).slice(0, 20_000);
    if (res.status >= 300 && res.status < 400) return { ok: false, pass: false, status: res.status, ms, operator: b.operator.label, error: "The endpoint redirected. Use the final https base URL.", hint: explain(res.status) };
    if (!res.ok) {
      let detail = "";
      try { const j = JSON.parse(raw) as { error?: { message?: unknown } | string }; const m = typeof j.error === "string" ? j.error : j.error?.message; if (typeof m === "string") detail = scrub(m, o.key).slice(0, 160); } catch { /* not json */ }
      return { ok: false, pass: false, status: res.status, ms, model, operator: b.operator.label, error: `HTTP ${res.status}${detail ? ": " + detail : ""}`, hint: explain(res.status) };
    }
    let j: { choices?: { message?: { content?: unknown } }[]; model?: unknown };
    try { j = JSON.parse(raw); } catch { return { ok: false, pass: false, status: res.status, ms, model, operator: b.operator.label, error: "The endpoint answered, but not with JSON. Is this an OpenAI-compatible /chat/completions URL?" }; }
    const content = j.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false, pass: false, status: res.status, ms, model, operator: b.operator.label, error: "Answered 200, but the reply has no choices[0].message.content." };
    return { ok: true, pass: true, status: res.status, ms, text: scrub(content, o.key).slice(0, 4000), model: typeof j.model === "string" ? j.model.slice(0, 120) : model, operator: b.operator.label };
  } catch (e) {
    const ms = Date.now() - t0;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, pass: false, status: 0, ms, model, operator: b.operator.label, error: timeout ? `No answer within ${Math.round(ms / 1000)} s.` : "Could not connect to the endpoint.", hint: timeout ? "The model is slow or the URL is wrong." : "Check the base URL and that it is public https." };
  }
}

/** The curl a person would run to do the same test by hand. The key is always the placeholder $API_KEY. */
export function curlOf(base: string, model: string): string {
  const b = parseBase(base);
  const url = (b.ok ? b.url : String(base).slice(0, 200)) + "/chat/completions";
  const body = JSON.stringify({ model: cleanModelId(model) || "MODEL_ID", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 16, temperature: 0 });
  return `curl -sS -X POST '${url.replace(/'/g, "")}' \\\n  -H 'Authorization: Bearer $API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '${body.replace(/'/g, "")}'`;
}

export async function byoTest(o: { base: string; model: string; key: string }) {
  const r = await byoChat({ ...o, messages: [{ role: "user", content: "Reply with exactly: OK" }], maxTokens: 16, temperature: 0, timeoutMs: 12_000 });
  const reply = (r.text ?? "").trim().slice(0, 120);
  return { ...r, text: undefined, reply, curl: curlOf(o.base, o.model), summary: r.pass ? `PASS · HTTP ${r.status} · ${r.ms} ms · reply "${reply}"` : `FAIL · ${r.error ?? "unknown error"}${r.status ? ` · ${r.ms} ms` : ""}` };
}

/** Optional: ask the endpoint which models it has (GET /models). Also says which operator it is. */
export async function byoDetect(o: { base: string; key: string }): Promise<{ ok: boolean; operator?: string; operatorId?: string; models?: string[]; message?: string; status?: number }> {
  const b = await checkBase(o.base);
  if (!b.ok) return { ok: false, message: b.message };
  try {
    const res = await fetch(`${b.url}/models`, { redirect: "manual", cache: "no-store", headers: o.key ? { authorization: `Bearer ${o.key}` } : {}, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, operator: b.operator.label, operatorId: b.operator.id, status: res.status, message: res.status === 401 || res.status === 403 ? "Operator recognised, but it needs a valid API key to list models. You can still type the model ID yourself." : `Operator recognised, but it does not list models here (HTTP ${res.status}). Type the model ID yourself.` };
    const j = (await res.json().catch(() => ({}))) as { data?: { id?: unknown }[]; models?: { name?: unknown; id?: unknown }[] };
    const raw = (j.data ?? j.models ?? []) as { id?: unknown; name?: unknown }[];
    const models = raw.map((m) => String(m.id ?? m.name ?? "").replace(/^models\//, "")).filter((x) => x && x.length < 120).slice(0, 60);
    return { ok: true, operator: b.operator.label, operatorId: b.operator.id, models, status: res.status, message: models.length ? `${models.length} model${models.length === 1 ? "" : "s"} found.` : "Operator recognised, no model list returned. Type the model ID yourself." };
  } catch { return { ok: false, operator: b.operator.label, operatorId: b.operator.id, message: "Could not reach the endpoint. Check the base URL." }; }
}
