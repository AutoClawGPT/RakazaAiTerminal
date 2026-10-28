"use server";
import { revalidatePath } from "next/cache";
import { isOwnerRequest } from "@/lib/owner";
import { ensureSchema, sql } from "@/lib/db";

export async function setAgentDisabled(id: string, disabled: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await isOwnerRequest())) return { ok: false, error: "Owner only." };
  if (!/^ag_[0-9a-f]{12}$/.test(id) || !sql()) return { ok: false, error: "Bad request." };
  await sql()!`UPDATE agents SET disabled = ${disabled} WHERE id = ${id}`;
  revalidatePath("/dash/agents");
  return { ok: true };
}

/** Owner only: unlock (or lock again) the stage 6 expert AI pilot for one agent. Not a public route, not in the API or MCP. No payment or wallet is involved. */
export async function setExpertUnlock(id: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await isOwnerRequest())) return { ok: false, error: "Owner only." };
  if (!/^ag_[0-9a-f]{12}$/.test(id) || !sql()) return { ok: false, error: "Bad request." };
  await ensureSchema();
  await sql()!`INSERT INTO agent_game_config (agent_id, expert_unlocked, pilot_stage, updated_at) VALUES (${id}, ${on}, 1, now())
    ON CONFLICT (agent_id) DO UPDATE SET expert_unlocked = ${on}, pilot_stage = CASE WHEN ${on} THEN agent_game_config.pilot_stage ELSE LEAST(agent_game_config.pilot_stage, 5) END, updated_at = now()`;
  revalidatePath("/dash/agents");
  return { ok: true };
}
