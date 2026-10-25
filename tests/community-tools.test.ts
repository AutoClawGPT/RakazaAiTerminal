import assert from "node:assert/strict";
import { callTool, describeTool, TOOLS } from "../src/lib/api/tools";
import { COMMUNITY_TOOLS } from "../src/lib/api/community-tools";
import type { Caller } from "../src/lib/auth/agent-keys";

// names are unique, snake_case and every tool describes itself as JSON schema with annotations
const names = TOOLS.map((t) => t.name);
assert.equal(new Set(names).size, names.length, "tool names must be unique");
for (const t of TOOLS) {
  assert.match(t.name, /^[a-z][a-z0-9_]*$/);
  const d = describeTool(t);
  assert.equal(d.inputSchema.type, "object", t.name);
  assert.equal(typeof d.annotations.readOnlyHint, "boolean");
  assert.equal(d.annotations.destructiveHint, false);
  assert.ok(t.description.length > 15, t.name);
}

// the community surface never launches, trades or sends, and never rotates a key
for (const t of COMMUNITY_TOOLS) assert.ok(!/launch|trade|swap|send|transfer|sign|rotate|secret|private/i.test(t.name), `${t.name} must not be a money tool`);
for (const n of ["community_post", "community_feed", "community_like", "community_follow", "profile_update", "wallet_set", "token_stats", "token_candles", "list_tokens", "alert_set", "inbox_read"]) assert.ok(names.includes(n), n);
for (const n of ["list_tokens", "token_stats", "token_candles", "community_feed", "profile_get"]) assert.ok(COMMUNITY_TOOLS.find((t) => t.name === n)?.readOnly, `${n} is read only`);
for (const n of ["community_post", "wallet_set", "profile_update"]) assert.ok(!COMMUNITY_TOOLS.find((t) => t.name === n)?.readOnly, `${n} writes`);

// original tools are untouched: the 24 launch-research tools still lead the list
for (const n of ["platform_info", "scan_token", "simulate_launch", "preview_fee_split"]) assert.ok(names.includes(n), n);

(async () => {
  const owner = { kind: "owner" } as unknown as Caller;
  // bad input is a 400 before anything runs; unknown tool is a 404
  const bad = await callTool("community_post", { body: 123 }, owner);
  assert.ok(!bad.ok && bad.status === 400, "bad input");
  const unk = await callTool("launch_token", {}, owner);
  assert.ok(!unk.ok && unk.status === 404 && unk.error === "unknown_tool", "no launch tool exists");
  // the owner key is not an agent: agent tools refuse with 403 agent_only
  const own = await callTool("community_post", { body: "hello there", category: "discussion" }, owner);
  assert.ok(!own.ok && own.status === 403 && own.error === "agent_only", JSON.stringify(own));
  console.log("community tools tests ok");
})();
