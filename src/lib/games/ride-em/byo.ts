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
  path = path.replace(/\/(chat\/completions|completions|messages|models)$/i, "").replace(/\/+$/, ""); // pasted a full endpoint URL: keep only the base
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

export type Protocol = "openai" | "anthropic";
export const cleanProtocol = (v: unknown): Protocol => (v === "anthropic" ? "anthropic" : "openai");
/** Pasting an Anthropic-style endpoint (…/v1/messages) selects the Anthropic protocol on its own. */
export const protocolFromUrl = (raw: unknown): Protocol | null => (typeof raw === "string" && /\/messages\/?(\?.*)?$/i.test(raw.trim()) ? "anthropic" : null);

/** A base that already ends in a version segment (/v1, /v1beta/openai, /api/v3, /openai) is used as it is. Otherwise /v1 is tried first, then the bare URL. */
const versioned = (url: string) => /\/(v\d+[a-z]*|openai|openapi)(\/[a-z0-9_-]+)?$/i.test(new URL(url).pathname) || /\/api\/v\d+$/i.test(new URL(url).pathname);
export const candidates = (url: string): string[] => (versioned(url) ? [url] : [`${url}/v1`, url]);

export interface ByoCall { ok: boolean; pass: boolean; status: number; ms: number; text?: string; model?: string; operator?: string; error?: string; hint?: string; base?: string; protocol?: Protocol }

function explain(status: number): string {
  if (status === 401 || status === 403) return "The provider rejected the API key (or the key has no access to this model).";
  if (status === 404) return "Not found. Check the base URL (it usually ends in /v1) and the model ID.";
  if (status === 400) return "The provider refused the request. Check the model ID.";
  if (status === 402) return "The provider says the account has no credit.";
  if (status === 429) return "Rate limited by the provider. Wait a moment and try again.";
  if (status === 503 || status === 502) return "The provider could not serve this request. If it says the model is not available, pick another model from the list.";
  if (status >= 500) return "The provider had a server error. Try again in a moment.";
  return "Unexpected answer from the provider.";
}

const authHeaders = (key: string, proto: Protocol): Record<string, string> => {
  const h: Record<string, string> = {};
  if (key) { h.authorization = `Bearer ${key}`; if (proto === "anthropic") { h["x-api-key"] = key; h["anthropic-version"] = "2023-06-01"; } }
  return h;
};
const looksHtml = (raw: string) => /^\s*<(!doctype|html)/i.test(raw);
const detailOf = (raw: string, key: string): string => {
  try { const j = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown }; const m = typeof j.error === "string" ? j.error : j.error?.message ?? j.message; if (typeof m === "string") return scrub(m, key).replace(/\s*\(request id:[^)]*\)/i, "").slice(0, 220); } catch { /* not json */ }
  return "";
};

/** One real chat call from our server. OpenAI style (POST {base}/chat/completions) or Anthropic style (POST {base}/messages). The base may be given with or without /v1. */
export async function byoChat(o: { base: string; model: string; key: string; messages: { role: string; content: string }[]; maxTokens?: number; temperature?: number; timeoutMs?: number; protocol?: Protocol }): Promise<ByoCall> {
  const proto = o.protocol ?? protocolFromUrl(o.base) ?? "openai";
  const b = await checkBase(o.base);
  if (!b.ok) return { ok: false, pass: false, status: 0, ms: 0, error: b.message };
  const model = cleanModelId(o.model);
  if (!model) return { ok: false, pass: false, status: 0, ms: 0, operator: b.operator.label, error: "Model ID is empty. Pick one from the provider's list or type it." };
  const t0 = Date.now();
  const budget = Math.max(800, Math.min(20_000, o.timeoutMs ?? 12_000));
  let last: ByoCall = { ok: false, pass: false, status: 0, ms: 0, error: "No answer." };
  for (const base of candidates(b.url)) {
    try {
      const sys = o.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const msgs = o.messages.filter((m) => m.role !== "system");
      const payload = proto === "anthropic"
        ? { model, max_tokens: o.maxTokens ?? 160, temperature: o.temperature ?? 0, ...(sys ? { system: sys } : {}), messages: msgs }
        : { model, messages: o.messages, max_tokens: o.maxTokens ?? 160, temperature: o.temperature ?? 0 };
      const res = await fetch(`${base}/${proto === "anthropic" ? "messages" : "chat/completions"}`, {
        method: "POST", redirect: "manual", cache: "no-store",
        headers: { "content-type": "application/json", ...authHeaders(o.key, proto) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.max(800, budget - (Date.now() - t0))),
      });
      const ms = Date.now() - t0;
      const raw = (await res.text()).slice(0, 40_000);
      const common = { status: res.status, ms, model, operator: b.operator.label, base, protocol: proto } as const;
      if (res.status >= 300 && res.status < 400) { last = { ok: false, pass: false, ...common, error: "The endpoint redirected. Use the final https base URL.", hint: explain(res.status) }; continue; }
      if (res.status === 404 || res.status === 405 || (res.ok && looksHtml(raw))) { last = { ok: false, pass: false, ...common, error: looksHtml(raw) ? `HTTP ${res.status}: ${base} answered with a web page, not an API. The base URL probably needs /v1.` : `HTTP ${res.status}${detailOf(raw, o.key) ? ": " + detailOf(raw, o.key) : ""}`, hint: explain(res.status) }; continue; }
      if (!res.ok) { const d = detailOf(raw, o.key); return { ok: false, pass: false, ...common, error: `HTTP ${res.status}${d ? ": " + d : ""}`, hint: explain(res.status) }; }
      let j: { choices?: { message?: { content?: unknown } }[]; content?: { type?: string; text?: unknown }[]; model?: unknown };
      try { j = JSON.parse(raw); } catch { return { ok: false, pass: false, ...common, error: "The endpoint answered, but not with JSON. Is this an OpenAI-compatible /chat/completions or Anthropic /messages endpoint?" }; }
      const content = proto === "anthropic" ? (Array.isArray(j.content) ? j.content.filter((c) => c?.type === "text" || typeof c?.text === "string").map((c) => String(c.text ?? "")).join("") : undefined) : j.choices?.[0]?.message?.content;
      if (typeof content !== "string") return { ok: false, pass: false, ...common, error: `Answered 200, but the reply has no ${proto === "anthropic" ? "content[].text" : "choices[0].message.content"}.` };
      return { ok: true, pass: true, ...common, text: scrub(content, o.key).slice(0, 4000), model: typeof j.model === "string" ? j.model.slice(0, 120) : model };
    } catch (e) {
      const ms = Date.now() - t0;
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      return { ok: false, pass: false, status: 0, ms, model, operator: b.operator.label, base, protocol: proto, error: timeout ? `No answer within ${Math.round(ms / 1000)} s.` : "Could not connect to the endpoint.", hint: timeout ? "The model is slow or the endpoint is down. Raise the timeout or try a faster model." : "Check the base URL, and that the endpoint is public https." };
    }
  }
  return last;
}

/** The curl a person would run to do the same test by hand. The key is always the placeholder $API_KEY. */
export function curlOf(base: string, model: string, protocol: Protocol = "openai"): string {
  const b = parseBase(base);
  const root = (b.ok ? candidates(b.url)[0] : String(base).slice(0, 200)).replace(/'/g, "");
  const m = cleanModelId(model) || "MODEL_ID";
  if (protocol === "anthropic") {
    const body = JSON.stringify({ model: m, max_tokens: 16, messages: [{ role: "user", content: "Reply with exactly: OK" }] });
    return `curl -sS -X POST '${root}/messages' \\\n  -H 'x-api-key: $API_KEY' \\\n  -H 'anthropic-version: 2023-06-01' \\\n  -H 'Content-Type: application/json' \\\n  -d '${body.replace(/'/g, "")}'`;
  }
  const body = JSON.stringify({ model: m, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 16, temperature: 0 });
  return `curl -sS -X POST '${root}/chat/completions' \\\n  -H 'Authorization: Bearer $API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '${body.replace(/'/g, "")}'`;
}

export interface Detected { ok: boolean; operator?: string; operatorId?: string; models?: string[]; message?: string; status?: number; base?: string; protocol?: Protocol; count?: number; ms?: number }
/** Ask the endpoint which models it has: GET {base}/models (base with or without /v1, key sent as Bearer and, for Anthropic style, x-api-key). */
export async function byoDetect(o: { base: string; key: string; protocol?: Protocol }): Promise<Detected> {
  const proto = o.protocol ?? protocolFromUrl(o.base) ?? "openai";
  const b = await checkBase(o.base);
  if (!b.ok) return { ok: false, message: b.message };
  const t0 = Date.now();
  let last: Detected = { ok: false, operator: b.operator.label, operatorId: b.operator.id, message: "Could not read the model list." };
  for (const base of candidates(b.url)) {
    try {
      const res = await fetch(`${base}/models?limit=1000`, { redirect: "manual", cache: "no-store", headers: authHeaders(o.key, proto), signal: AbortSignal.timeout(9000) });
      const raw = (await res.text()).slice(0, 400_000);
      const ms = Date.now() - t0;
      if (res.status === 404 || res.status === 405 || (res.ok && looksHtml(raw))) { last = { ok: false, operator: b.operator.label, operatorId: b.operator.id, status: res.status, base, ms, message: `${base}/models is not an API route (HTTP ${res.status}).` }; continue; }
      if (!res.ok) return { ok: false, operator: b.operator.label, operatorId: b.operator.id, status: res.status, base, ms, message: res.status === 401 || res.status === 403 ? "The provider needs a valid API key to list its models. Enter the key, or type a model ID by hand." : `The provider answered HTTP ${res.status} for its model list${detailOf(raw, o.key) ? ": " + detailOf(raw, o.key) : ""}.` };
      let j: { data?: { id?: unknown }[]; models?: { name?: unknown; id?: unknown }[] } = {};
      try { j = JSON.parse(raw); } catch { /* not json */ }
      const list = (j.data ?? j.models ?? []) as { id?: unknown; name?: unknown }[];
      const models = Array.from(new Set(list.map((m) => String(m.id ?? m.name ?? "").replace(/^models\//, "")).filter((x) => x && x.length < 120))).slice(0, 500);
      return { ok: true, operator: b.operator.label, operatorId: b.operator.id, models, count: models.length, status: res.status, base, protocol: proto, ms, message: models.length ? `${models.length} model${models.length === 1 ? "" : "s"} found at ${base}/models.` : "The endpoint answered, but returned no model list. Type a model ID by hand." };
    } catch { last = { ok: false, operator: b.operator.label, operatorId: b.operator.id, base, message: "Could not reach the endpoint. Check the base URL." }; }
  }
  return last;
}

/** The whole Test: (1) pull the provider's model list, (2) one tiny real chat call with the chosen model, (3) report pass/fail, latency and the real provider error. */
export async function byoTest(o: { base: string; model: string; key: string; protocol?: Protocol }) {
  const protocol = o.protocol ?? protocolFromUrl(o.base) ?? "openai";
  const det = await byoDetect({ base: o.base, key: o.key, protocol });
  const r = await byoChat({ ...o, protocol, base: det.base ?? o.base, messages: [{ role: "user", content: "Reply with exactly: OK" }], maxTokens: 16, temperature: 0, timeoutMs: 15_000 });
  const reply = (r.text ?? "").trim().slice(0, 120);
  const inList = det.models?.length ? det.models.includes(cleanModelId(o.model)) : null;
  const hint = !r.pass && inList === false ? `"${cleanModelId(o.model)}" is not in this provider's model list (${det.count} models). Pick one from the list.` : r.hint;
  const listLine = det.ok ? `${det.count} models listed` : "model list unavailable";
  return {
    ...r, text: undefined, reply, hint, protocol, base: r.base ?? det.base, curl: curlOf(det.base ?? o.base, o.model, protocol),
    models: det.models ?? [], modelCount: det.count ?? 0, modelsOk: det.ok, modelsMessage: det.message, inList,
    summary: r.pass ? `PASS · ${listLine} · HTTP ${r.status} · ${r.ms} ms · reply "${reply}"` : `FAIL · ${r.error ?? "unknown error"}${r.status ? ` · ${r.ms} ms` : ""} · ${listLine}`,
  };
}
