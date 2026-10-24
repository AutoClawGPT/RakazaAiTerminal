import "server-only";
import { getEnv } from "./env";

export interface ServerRow { hostname: string; plan: string; zone: string; state: string; cores: string; memoryMb: string }

/** Read-only list of UpCloud servers. Never starts or stops anything. */
export async function listServers(): Promise<{ ok: true; servers: ServerRow[] } | { ok: false; error: string }> {
  const k = getEnv().UPCLOUD_API_TOKEN;
  if (!k) return { ok: false, error: "UPCLOUD_API_TOKEN is not set. Get one at https://hub.upcloud.com." };
  try {
    const r = await fetch("https://api.upcloud.com/1.3/server", { headers: { Authorization: `Bearer ${k}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { ok: false, error: r.status === 401 || r.status === 403 ? "UpCloud rejected the token. Make a new one at https://hub.upcloud.com." : `UpCloud answered ${r.status}.` };
    const j = (await r.json()) as { servers?: { server?: { hostname: string; plan: string; zone: string; state: string; core_number: string; memory_amount: string }[] } };
    return { ok: true, servers: (j.servers?.server ?? []).map((s) => ({ hostname: s.hostname, plan: s.plan, zone: s.zone, state: s.state, cores: s.core_number, memoryMb: s.memory_amount })) };
  } catch { return { ok: false, error: "Could not reach UpCloud." }; }
}
