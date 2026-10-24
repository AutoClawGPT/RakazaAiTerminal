import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { getRoute } from "@/lib/routes";
import { treasuryHealth } from "@/lib/api/chain-tools";
import { sql, ensureSchema } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Vault" };
export const dynamic = "force-dynamic";

type Audit = { at: string; kind: string; what: string };

async function audit(): Promise<Audit[]> {
  const q = sql(); if (!q) return [];
  await ensureSchema();
  const net = getEnv().NEXT_PUBLIC_SOLANA_NETWORK;
  const a = (await q`SELECT created_at AS at, 'Launch' AS kind, name || ' (' || symbol || '): ' || status AS what FROM launches WHERE network = ${net} ORDER BY created_at DESC LIMIT 15`) as unknown as Audit[];
  const b = (await q`SELECT created_at AS at, 'Fee payout' AS kind, (lamports::float / 1e9)::text || ' SOL to ' || left(wallet, 4) || '…' || right(wallet, 4) AS what FROM fee_payouts WHERE network = ${net} ORDER BY created_at DESC LIMIT 15`) as unknown as Audit[];
  return [...a, ...b].sort((x, y) => +new Date(y.at) - +new Date(x.at)).slice(0, 20);
}

export default async function Page() {
  const r = getRoute("/vault");
  const [h, log] = await Promise.all([treasuryHealth().catch(() => null), audit().catch(() => [] as Audit[])]);
  const row = (k: string, v: string) => <div key={k}><dt className="rk-kicker">{k}</dt><dd className="text-sm font-semibold" data-testid={`vault-${k.toLowerCase().replace(/\W+/g, "-")}`}>{v}</dd></div>;
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb="The treasury's balance, its spending limits and a record of what it has done. The secret key is never shown." />
      <section className="rk-container grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 py-8 md:py-12">
        {!h ? <p className="rk-card text-sm text-red-400" role="alert">Could not read the treasury. Check the Settings page.</p> : (
          <>
            <div className="rk-card"><dl className="grid grid-cols-2 gap-4">
              {row("Network", String(h.network))}
              {row("Balance", h.balanceSol != null ? `${Number(h.balanceSol).toFixed(4)} SOL` : "not available")}
              {row("Per launch cap", `${String(h.maxLaunchSol)} SOL`)}
              {row("Daily cap", `${String(h.maxDailySpendSol)} SOL`)}
              {row("Signing key", h.signerReady ? "Ready" : "Not set up")}
              {row("Sending enabled", h.executeEnabled ? "Yes" : "No")}
            </dl>
            <p className="mt-3 break-all font-mono text-xs opacity-80">{String(h.treasury ?? "No treasury address set")}</p></div>
            {h.problems.length ? <div className="rk-card"><h2 className="rk-h2 text-xl">Needs attention</h2><ul className="mt-2 grid gap-1 text-sm">{h.problems.map((p) => <li key={p}>{p}</li>)}</ul></div> : <p className="rk-card text-sm">Everything the treasury needs is in place.</p>}
          </>
        )}
        <div className="rk-card"><h2 className="rk-h2 text-xl">Withdrawals</h2><p className="mt-2 text-sm opacity-80">Withdrawals are not enabled in this build. Moving money out of the treasury will need your explicit approval on a separate step before it is ever switched on.</p></div>
        <div className="rk-card"><h2 className="rk-h2 text-xl">Recent activity</h2>
          {log.length === 0 ? <p className="mt-2 text-sm opacity-80">Nothing has happened yet.</p> : <ul className="mt-3 grid gap-2 text-sm" data-testid="vault-audit">{log.map((l, i) => <li key={i} className="flex flex-wrap justify-between gap-2 rounded-xl bg-white/5 p-3"><span><b>{l.kind}:</b> {l.what}</span><span className="text-xs opacity-70">{new Date(l.at).toISOString().slice(0, 16).replace("T", " ")} UTC</span></li>)}</ul>}
        </div>
      </section>
    </>
  );
}
