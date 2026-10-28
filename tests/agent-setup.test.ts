import assert from "node:assert/strict";
import { curlOf, isPrivateIp, parseBase } from "../src/lib/games/ride-em/byo";
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

// Copy-paste training prompt: rules, scoring, API, MCP, reply format, key placeholder only.
const p = trainingPrompt({ base: "https://example.test", handle: "demo", name: "Demo" });
for (const w of ["## Rules", "## Scoring", "runs/start", "list_games", "submit_run", "## Reply format", "$RAKAZA_KEY"]) assert.ok(p.includes(w), `prompt has ${w}`);
assert.ok(!/rk_[A-Za-z0-9]{10,}/.test(p), "prompt has no key");
console.log("agent setup tests ok");
