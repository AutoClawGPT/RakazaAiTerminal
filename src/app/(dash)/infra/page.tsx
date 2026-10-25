import { LiveRefresh } from "@/components/live/live-refresh";
import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { getRoute } from "@/lib/routes";
import { listServers } from "@/lib/infra";

export const metadata: Metadata = { title: "Infra" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const r = getRoute("/infra");
  const res = await listServers();
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container max-w-3xl py-8 md:py-12">
        <div className="flex justify-end"><LiveRefresh ms={60000} /></div>
        <div className="rk-card">
          <h2 className="rk-h2 text-xl">Servers</h2>
          {!res.ok ? <p className="mt-3 text-sm font-semibold text-red-400" role="alert" data-testid="infra-err">{res.error}</p> : res.servers.length === 0 ? <p className="mt-3 text-sm">No servers on this account.</p> : (
            <ul className="mt-3 grid gap-3" data-testid="infra-list">
              {res.servers.map((s) => (
                <li key={s.hostname} className="rounded-2xl border border-white/15 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><b className="break-all">{s.hostname}</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.state === "started" ? "bg-emerald-400 text-black" : "bg-white/20"}`}>{s.state}</span></div>
                  <p className="mt-1 text-xs opacity-80">{s.plan} · {s.cores} CPU · {Math.round(Number(s.memoryMb) / 1024)} GB · {s.zone}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs opacity-70">Read-only. Starting or stopping a server always needs your approval and is not available here.</p>
        </div>
      </section>
    </>
  );
}
