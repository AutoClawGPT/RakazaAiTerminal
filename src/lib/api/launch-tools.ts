import "server-only";
import { z } from "zod";
import { agentById } from "@/lib/agents/service";
import type { Caller } from "@/lib/auth/agent-keys";
import { ToolFail } from "./tool-types";
import { agentLaunchStatus, launchGuide, myAgentLaunches, prepareAgentLaunch, prepareInput, startAgentLaunch, startInput, statusInput } from "@/lib/launch/agent-run";
import type { Tool } from "./tools";

/**
 * Agent-run sponsored launch tools (additive). The agent starts the launch itself with its own rk_ / rkb_ credential; the server signs with the
 * platform treasury on devnet. Same guards as the dashboard (EXECUTE_ENABLED, SPONSORED_ENABLED, devnet only, owner spend caps) plus per-agent limits.
 */
export type LaunchTool = Tool & { readOnly: boolean };

async function agentOf(caller: Caller) {
  if (caller.kind !== "agent") throw new ToolFail(403, "agent_only", "This tool needs an agent key. Register an agent profile and use its key or token (the owner key is not an agent).");
  const a = await agentById(caller.id);
  if (!a) throw new ToolFail(401, "unauthorized", "This agent key is no longer valid.");
  return a;
}

function mk<S extends z.ZodObject<z.ZodRawShape>>(t: { name: string; title: string; description: string; schema: S; readOnly: boolean; heavy?: boolean; run: (i: z.infer<S>, c: Caller) => Promise<unknown> }): LaunchTool {
  return { name: t.name, title: t.title, description: t.description, schema: t.schema, heavy: t.heavy, readOnly: t.readOnly, run: t.run as Tool["run"] };
}

export const LAUNCH_TOOLS: LaunchTool[] = [
  mk({
    name: "launch_sponsored_guide", title: "Sponsored launch: am I ready, what do I call",
    description: "Before you launch: whether launching is switched on (devnet only), your profile wallet, your limits for today, and the exact steps. Read-only. Start here when your user asks you to launch a token.",
    schema: z.object({}), readOnly: true,
    run: async (_i, c) => launchGuide(await agentOf(c)),
  }),
  mk({
    name: "launch_sponsored_prepare", title: "Sponsored launch: prepare and preview (signs nothing)",
    description: "Step 1 of launching a token yourself (sponsored 70/30, the platform treasury pays on devnet). Makes the logo, pins it, builds the launch and dry-runs it. Returns a preview for your user and a `prepared` value. It signs and sends nothing. Agent to agent: pass forAgent (and handoff:true) so another agent's wallet gets the 70% and only that agent can start it.",
    schema: prepareInput, readOnly: false, heavy: true,
    run: async (i, c) => prepareAgentLaunch(await agentOf(c), i),
  }),
  mk({
    name: "launch_sponsored_start", title: "Sponsored launch: start it (after your user said yes)",
    description: "Step 2. Starts the prepared launch. The server signs with the platform treasury (devnet only) and answers at once; the launch runs in the background. Needs userApproved:true, which means your user saw the preview and agreed. Then poll launch_sponsored_status.",
    schema: startInput, readOnly: false,
    run: async (i, c) => startAgentLaunch(await agentOf(c), i),
  }),
  mk({
    name: "launch_sponsored_status", title: "Sponsored launch: status",
    description: "Step 3: poll a launch you started (or one handed to you) by its mint until done:true. Returns status (queued, running, live, failed, created_unsplit, split_mismatch, stalled), the token page, devnet explorer links and a plain hint. Without a mint it lists your latest agent-run launches.",
    schema: statusInput, readOnly: true,
    run: async (i, c) => { const a = await agentOf(c); return i.mint ? agentLaunchStatus(i.mint) : myAgentLaunches(a); },
  }),
];
