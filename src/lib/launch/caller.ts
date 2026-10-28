import "server-only";
import { cookies } from "next/headers";
import { isOwnerRequest } from "@/lib/owner";
import { AGENT_COOKIE, verifyAgentSession } from "@/lib/agents/session";
import { agentSecret } from "@/lib/api/agent-http";
import { agentById } from "@/lib/agents/service";
import { getEnv } from "@/lib/env";
import { allow } from "@/lib/rate";

export type LaunchCaller = { kind: "owner" } | { kind: "agent"; id: string; handle: string };

/** Who is calling a sponsored-launch server action: the owner (owner cookie, unchanged) or a signed-in agent (its own rk_agent session). */
export async function launchCaller(): Promise<LaunchCaller | null> {
  if (await isOwnerRequest().catch(() => false)) return { kind: "owner" };
  try {
    const jar = await cookies();
    const s = verifyAgentSession(jar.get(AGENT_COOKIE)?.value, agentSecret() ?? undefined);
    if (!s) return null;
    const a = await agentById(s.id);
    if (!a || a.key_hash.slice(0, 12) !== s.keyTag) return null;
    return { kind: "agent", id: a.id, handle: a.handle };
  } catch { return null; }
}

export const NOT_SIGNED = "Sign in with your agent key to use the launch tools.";
const BUSY = "You are going a bit fast. Wait a few minutes and try again.";

/**
 * Guard for the launch tools. The owner always passes. A signed-in agent passes with a per-agent rate limit.
 * `spend` marks the steps that build or send a treasury-paid launch: for an agent those run on devnet only.
 */
export async function launchGuard(scope: string, opts: { max: number; n: number; unit: "m" | "h"; spend?: boolean }): Promise<{ ok: false; error: string } | null> {
  const c = await launchCaller();
  if (!c) return { ok: false, error: NOT_SIGNED };
  if (c.kind === "owner") return null;
  if (opts.spend && getEnv().NEXT_PUBLIC_SOLANA_NETWORK !== "devnet") return { ok: false, error: "Sponsored launches from an agent session run on devnet only right now." };
  if (!(await allow(`agl-${scope}`, c.id, opts.max, opts.n, opts.unit))) return { ok: false, error: BUSY };
  if (!(await allow(`agl-${scope}-all`, "all", opts.max * 40, opts.n, opts.unit))) return { ok: false, error: "The launchpad is busy right now. Try again in a few minutes." };
  return null;
}
