"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { healthAction } from "@/app/(dash)/dash/health-actions";
import type { HealthReport } from "@/lib/health";

const CLS = { ok: "bg-emerald-400/90 text-black", missing: "bg-[var(--rk-honey)] text-black", failed: "bg-red-400 text-black" } as const;

export function HealthPanel() {
  const [r, setR] = useState<HealthReport | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);
  const apply = useCallback((x: Awaited<ReturnType<typeof healthAction>>) => {
    if (x.ok) { setR(x.report); setErr(""); } else setErr(x.error);
    setBusy(false);
  }, []);
  const run = useCallback(async () => { setBusy(true); apply(await healthAction()); }, [apply]);
  useEffect(() => { let live = true; void healthAction().then((x) => { if (live) apply(x); }); return () => { live = false; }; }, [apply]);
  return (
    <div className="rk-card" data-testid="health-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="rk-h2 text-xl">Integrations health</h2>
          <p className="text-xs opacity-80">A real, minimal call to each service. Keys and secrets are never shown.</p>
        </div>
        <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => void run()} disabled={busy} aria-label="Run the health check again"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" /> {busy ? "Checking…" : "Check again"}</button>
      </div>
      {err ? <p className="mt-2 text-sm text-red-400" role="alert">{err}</p> : null}
      {r ? (
        <>
          <p className="mt-2 text-sm font-semibold" data-testid="health-summary">{r.counts.ok} ok · {r.counts.missing} missing · {r.counts.failed} failed on {r.network}</p>
          <ul className="mt-2 divide-y divide-white/10 text-sm">
            {r.rows.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-health={x.id} data-status={x.status}>
                <span><b>{x.label}</b> <span className="text-xs opacity-80">{x.detail}</span>{x.note ? <span className="block text-[11px] opacity-60">{x.note}</span> : null}{x.status !== "ok" && x.envNames.length ? <span className="block font-mono text-[11px] opacity-70">{x.envNames.join(", ")}</span> : null}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CLS[x.status]}`}>{x.status}{x.status === "ok" ? ` · ${x.ms} ms` : ""}</span>
              </li>
            ))}
          </ul>
        </>
      ) : !err ? <p className="mt-2 text-sm opacity-80">Checking…</p> : null}
    </div>
  );
}
