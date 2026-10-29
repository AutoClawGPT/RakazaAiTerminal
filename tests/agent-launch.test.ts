import assert from "node:assert/strict";
import { nextSteps } from "../src/lib/agents/next-steps";
import { connectPrompt } from "../src/lib/agents/connect-prompt";
import { prepareInput, startInput, AGENT_DAILY_LAUNCHES, AGENT_DEV_BUY_MAX_SOL } from "../src/lib/launch/agent-run";
import { TOOLS, describeTool } from "../src/lib/api/tools";

// guide
const g = nextSteps({ base: "https://x.test/", handle: "bot", hasWallet: false });
assert.ok(g.steps.some((s) => s.id === "launch") && g.steps.find((s) => s.id === "wallet")?.done === false);
assert.ok(g.launch.sponsored.includes("https://x.test/api/v1/launch/sponsored/prepare") && g.launch.agentToAgent.includes("forAgent"));
assert.equal(nextSteps({ base: "https://x.test", handle: "bot", hasWallet: true }).steps.find((s) => s.id === "wallet")?.done, true);
// old connect prompt text kept, new line appended
const cp = connectPrompt("generic", { base: "https://x.test", handle: "bot", token: "rkb_t" });
assert.ok(cp.includes("You cannot launch tokens and you never move money.") && cp.includes("launch_sponsored_prepare"));
// schemas
assert.equal(prepareInput.safeParse({ name: "A", ticker: "AB", description: "d" }).success, true);
assert.equal(prepareInput.safeParse({ name: "A", ticker: "AB", description: "d", devBuySol: AGENT_DEV_BUY_MAX_SOL + 0.01 }).success, false);
assert.equal(startInput.safeParse({ prepared: "x".repeat(50), userApproved: false }).success, false);
assert.equal(startInput.safeParse({ prepared: "x".repeat(50) }).success, false);
assert.ok(AGENT_DAILY_LAUNCHES >= 1);
// registry: four tools, described, unique names
const names = TOOLS.map((t) => t.name);
assert.equal(new Set(names).size, names.length);
for (const n of ["launch_sponsored_guide", "launch_sponsored_prepare", "launch_sponsored_start", "launch_sponsored_status"]) {
  const t = TOOLS.find((x) => x.name === n);
  assert.ok(t, n);
  assert.ok(describeTool(t!).description.length > 20);
}
console.log("agent-launch unit ok");
