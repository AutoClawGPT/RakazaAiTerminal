import "server-only";
import { ensureSchema, sql } from "@/lib/db";
import { PUBLIC_LAUNCH_STATUSES } from "@/lib/site";
import { publicEnv } from "@/lib/public-env";

/** Newest public launches on this deployment's network. Never throws: no database means an empty list. */
export async function listPublicMints(limit = 200): Promise<{ mint: string; createdAt: Date }[]> {
  try {
    const q = sql();
    if (!q) return [];
    await ensureSchema();
    const rows = (await q`SELECT mint, created_at FROM launches WHERE network = ${publicEnv.network} AND NOT hidden AND status = ANY(${[...PUBLIC_LAUNCH_STATUSES]}) ORDER BY created_at DESC LIMIT ${limit}`) as unknown as { mint: string; created_at: string }[];
    return rows.map((r) => ({ mint: r.mint, createdAt: new Date(r.created_at) }));
  } catch {
    return [];
  }
}

/** How many tokens were launched through Rakaza on this network. Null when unknown. */
export async function publicLaunchCount(): Promise<number | null> {
  try {
    const q = sql();
    if (!q) return null;
    await ensureSchema();
    const rows = (await q`SELECT count(*)::int AS c FROM launches WHERE network = ${publicEnv.network} AND NOT hidden AND status = ANY(${[...PUBLIC_LAUNCH_STATUSES]})`) as unknown as { c: number }[];
    return rows[0]?.c ?? 0;
  } catch {
    return null;
  }
}
