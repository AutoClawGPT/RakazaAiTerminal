import type { Metadata } from "next";
import Link from "next/link";
import { ToolHero } from "@/components/tools/tool-frame";
import { getRoute } from "@/lib/routes";
import { keyHealth } from "@/lib/env";
import { isExecuteEnabled } from "@/lib/execute-gate";
import { publicEnv } from "@/lib/public-env";
import { rpcHealth, solBalance } from "@/lib/chain";
import { ensureSchema, sql } from "@/lib/db";
import { HealthPanel } from "@/components/pages/health-panel";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

async function agentCount(): Promise<number | null> {
  try {
    if (!sql()) return null;
    await ensureSchema();
    const r = (await sql()!`SELECT count(*)::int AS n FROM agents WHERE NOT disabled`) as { n: number }[];
    return r[0]?.n ?? 0;
  } catch { return null; }
}

/** Server actions on this page run under this limit (Vercel function duration). */
export const maxDuration = 60;

export default async function Page() {
  const r = getRoute("/dash");
  const health = Object.values(keyHealth());
  const set = health.filter((h) => h === "ok").length;
  const t = publicEnv.treasuryPubkey;
  const [bal, rpc, agents] = await Promise.all([t ? solBalance(t) : Promise.resolve(null), rpcHealth(), agentCount()]);
  const exec = isExecuteEnabled();
  const stat = (label: string, value: string, note?: string) => (
    <div className="rk-card"><p className="text-xs opacity-70">{label}</p><p className="rk-h2 mt-1 text-2xl" data-testid={`stat-${label.toLowerCase().replace(/\W+/g, "-")}`}>{value}</p>{note ? <p className="mt-1 text-xs opacity-75">{note}</p> : null}</div>
  );
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid gap-5 py-8 md:py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stat("Network", publicEnv.network === "mainnet-beta" ? "Mainnet" : "Devnet", rpc.ok ? `RPC answered in ${rpc.ms} ms, slot ${rpc.slot?.toLocaleString()}` : "RPC did not answer")}
          {stat("Treasury", bal != null ? `${bal.toFixed(4)} SOL` : "unknown", t ? `${t.slice(0, 6)}…${t.slice(-6)}` : "Treasury address not set")}
          {stat("Launch execution", exec ? "On" : "Off", exec ? "Each launch still needs your approval." : "Nothing can be signed or sent. This is the kill switch.")}
          {stat("Keys set", `${set} of ${health.length}`, "Open Integrations to see which.")}
          {stat("Registered agents", agents == null ? "unknown" : String(agents), agents == null ? "Database not reachable" : "Open Operator agents to manage them.")}
        </div>
        <HealthPanel />
        <div className="rk-card">
          <h2 className="rk-h2 text-xl">Jump to</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {[["/launch", "Launch"], ["/scanner", "Scanner"], ["/vanity", "Vanity"], ["/keyvault", "Key vault"], ["/dash/agents", "Operator agents"], ["/settings/integrations", "Integrations"], ["/infra", "Infra"], ["/settings", "Settings"]].map(([h, l]) => <Link key={h} className="rk-btn rk-btn-white rk-btn-sm" href={h}>{l}</Link>)}
          </div>
        </div>
      </section>
    </>
  );
}
