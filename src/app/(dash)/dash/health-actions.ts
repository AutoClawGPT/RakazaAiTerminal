"use server";
import { isOwnerRequest } from "@/lib/owner";
import { integrationsHealth, type HealthReport } from "@/lib/health";

/** Owner-only. Runs a real minimal call to every integration. Returns statuses only, never a secret. */
export async function healthAction(): Promise<{ ok: true; report: HealthReport } | { ok: false; error: string }> {
  if (!(await isOwnerRequest())) return { ok: false, error: "The health check is for the owner and the agent only." };
  try { return { ok: true, report: await integrationsHealth() }; } catch { return { ok: false, error: "The health check could not run. Check that the server environment is valid." }; }
}
