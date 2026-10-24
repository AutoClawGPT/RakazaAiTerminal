"use server";
import { revalidatePath } from "next/cache";
import { isOwnerRequest } from "@/lib/owner";
import { sql } from "@/lib/db";

export async function setAgentDisabled(id: string, disabled: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await isOwnerRequest())) return { ok: false, error: "Owner only." };
  if (!/^ag_[0-9a-f]{12}$/.test(id) || !sql()) return { ok: false, error: "Bad request." };
  await sql()!`UPDATE agents SET disabled = ${disabled} WHERE id = ${id}`;
  revalidatePath("/dash/agents");
  return { ok: true };
}
