import assert from "node:assert/strict";
import { byoChat, byoDetect, sseToJson, byoTest, candidates, curlOf, isPrivateIp, parseBase, protocolFromUrl } from "../src/lib/games/ride-em/byo";
import { trainingPrompt } from "../src/lib/games/ride-em/training-prompt";

// Bring-your-own-model base URL rules (SSRF-safe): https only, no credentials, no query, no private hosts.
assert.equal(parseBase("https://api.openai.com/v1/").ok, true);
assert.equal((parseBase("https://api.openai.com/v1/chat/completions") as { url: string }).url, "https://api.openai.com/v1");
for (const bad of ["http://api.openai.com/v1", "https://user:pw@api.openai.com/v1", "https://api.openai.com/v1?key=abc", "https://localhost/v1", "https://127.0.0.1/v1", "https://10.0.0.5/v1", "https://[::1]/v1", "https://169.254.169.254/", "ftp://x.com", "", "not a url", 42]) {
  assert.equal(parseBase(bad).ok, false, `refused: ${String(bad)}`);
}
for (const ip of ["10.1.2.3", "127.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254", "198.18.0.5", "0.0.0.0", "::1", "fc00::1", "fe80::1"]) assert.equal(isPrivateIp(ip), true, `private: ${ip}`);
for (const ip of ["8.8.8.8", "1.1.1.1", "104.18.0.1"]) assert.equal(isPrivateIp(ip), false, `public: ${ip}`);

// The curl shown to the user never contains a key, only a placeholder.
const c = curlOf("https://api.openai.com/v1", "gpt-4o-mini");
assert.ok(c.includes("$API_KEY") && c.includes("/chat/completions") && c.includes("gpt-4o-mini"));
assert.ok(!/sk-[A-Za-z0-9]{8,}/.test(c));


// Base URL in any form: bare host, /v1, trailing slash, pasted full endpoint. /v1 is tried first when the base has no version.
for (const f of ["https://tokenplus.net", "https://tokenplus.net/", "https://tokenplus.net/v1", "https://tokenplus.net/v1/", "https://tokenplus.net/v1/chat/completions", "https://tokenplus.net/v1/messages", "https://tokenplus.net/v1/models"]) {
  const b = parseBase(f); assert.equal(b.ok, true, f);
  assert.equal(candidates((b as { url: string }).url)[0], "https://tokenplus.net/v1", `first candidate for ${f}`);
}
assert.deepEqual(candidates("https://tokenplus.net"), ["https://tokenplus.net/v1", "https://tokenplus.net"]);
assert.deepEqual(candidates("https://generativelanguage.googleapis.com/v1beta/openai"), ["https://generativelanguage.googleapis.com/v1beta/openai"]);
assert.equal(protocolFromUrl("https://x.example/v1/messages"), "anthropic");
assert.equal(protocolFromUrl("https://x.example/v1"), null);
assert.ok(curlOf("https://tokenplus.net", "m").includes("https://tokenplus.net/v1/chat/completions"));
assert.ok(curlOf("https://tokenplus.net/v1/messages", "m", "anthropic").includes("https://tokenplus.net/v1/messages"));

const sse = 'data: {"model":"gpt-4o-mini","choices":[{"delta":{"role":"assistant","content":""}}]}\n\ndata: {"choices":[{"delta":{"content":"{\\"decisions\\":"}}]}\n\ndata: {"choices":[{"delta":{"content":"[]}"}}]}\n\ndata: [DONE]\n';
assert.equal((JSON.parse(sseToJson(sse)) as { choices: { message: { content: string } }[] }).choices[0].message.content, '{"decisions":[]}');
assert.equal(sseToJson('{"a":1}'), '{"a":1}');
// A mocked provider that behaves like TokenPlus: the bare host serves a web page, /v1 is the API, an unknown model is a 503 with a message.
const realFetch = globalThis.fetch;
const seen: string[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url); seen.push(`${init?.method ?? "GET"} ${u}`);
  const hdr = new Headers(init?.headers as HeadersInit);
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (!u.includes("/v1/")) return new Response("<!doctype html><html></html>", { status: 200 });
  if (hdr.get("authorization") !== "Bearer sk-test-123456789012" && hdr.get("x-api-key") !== "sk-test-123456789012") return json({ error: { message: "bad key" } }, 401);
  if (u.includes("/v1/models")) return json({ data: [{ id: "deepseek-v4-flash" }, { id: "claude-haiku-4-5" }] });
  const body = JSON.parse(String(init?.body ?? "{}")) as { model: string };
  if (body.model !== "deepseek-v4-flash" && body.model !== "claude-haiku-4-5") return json({ error: { message: `The requested model ${body.model} is not available (request id: abc)` } }, 503);
  if (u.endsWith("/v1/messages")) return json({ model: body.model, content: [{ type: "text", text: "OK" }] });
  return json({ model: body.model, choices: [{ message: { content: "OK" } }] });
}) as typeof fetch;
void (async () => {
try {
  const K = "sk-test-123456789012";
  for (const base of ["https://8.8.8.8", "https://8.8.8.8/", "https://8.8.8.8/v1", "https://8.8.8.8/v1/chat/completions"]) {
    const t = await byoTest({ base, model: "deepseek-v4-flash", key: K });
    assert.equal(t.pass, true, `${base}: ${t.summary}`); assert.equal(t.modelCount, 2); assert.equal(t.base, "https://8.8.8.8/v1"); assert.ok(/PASS · 2 models listed/.test(t.summary));
  }
  const bad = await byoTest({ base: "https://8.8.8.8", model: "deepseek-ai/DeepSeek-V4.1-Flash", key: K });
  assert.equal(bad.pass, false); assert.ok(/HTTP 503: The requested model deepseek-ai\/DeepSeek-V4.1-Flash is not available/.test(bad.error ?? ""), bad.error); assert.ok(/not in this provider's model list/.test(bad.hint ?? ""));
  assert.ok(!JSON.stringify(bad).includes(K), "no key in the result");
  const wrongKey = await byoChat({ base: "https://8.8.8.8", model: "deepseek-v4-flash", key: "sk-nope-000000000000", messages: [{ role: "user", content: "hi" }] });
  assert.equal(wrongKey.pass, false); assert.equal(wrongKey.status, 401);
  const an = await byoChat({ base: "https://8.8.8.8/v1/messages", model: "claude-haiku-4-5", key: K, messages: [{ role: "system", content: "s" }, { role: "user", content: "hi" }], protocol: "anthropic" });
  assert.equal(an.pass, true); assert.equal(an.text, "OK"); assert.equal(an.protocol, "anthropic");
  assert.equal((await byoChat({ base: "https://8.8.8.8", model: "", key: K, messages: [] })).pass, false, "an empty model is never replaced by a platform model");
  const d = await byoDetect({ base: "https://8.8.8.8", key: K }); assert.deepEqual(d.models, ["deepseek-v4-flash", "claude-haiku-4-5"]);
  assert.ok(seen.some((x) => x.startsWith("POST https://8.8.8.8/v1/chat/completions")));
} finally { globalThis.fetch = realFetch; }
console.log("byo normalisation + mocked provider tests ok");
})().catch((e) => { console.error(e); process.exit(1); });
console.log("agent setup tests ok");
// Copy-paste training prompt: rules, scoring, API, MCP, reply format, key placeholder only.
const p = trainingPrompt({ base: "https://example.test", handle: "demo", name: "Demo" });
for (const w of ["## Rules", "## Scoring", "runs/start", "list_games", "submit_run", "## Reply format", "$RAKAZA_KEY"]) assert.ok(p.includes(w), `prompt has ${w}`);
assert.ok(!/rk_[A-Za-z0-9]{10,}/.test(p), "prompt has no key");

