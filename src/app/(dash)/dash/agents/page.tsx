import { LiveRefresh } from "@/components/live/live-refresh";
import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { getRoute } from "@/lib/routes";
import { ensureSchema, sql } from "@/lib/db";
import { DisableAgent } from "@/components/account/disable-agent";
import { UnlockExpert } from "@/components/account/unlock-expert";

export const metadata: Metadata = { title: "Operator agents" };
export const dynamic = "force-dynamic";

interface Row { id: string; name: string; created_at: string; last_used_at: string | null; calls: string; disabled: boolean; expert: boolean | null }

export default async function Page() {
  const r = getRoute("/dash/agents");
  let rows: Row[] = [];
  let err = "";
  try {
    if (!sql()) err = "The database is not set up.";
    else { await ensureSchema(); rows = (await sql()!`SELECT id, name, created_at, last_used_at, calls::text AS calls, disabled, (SELECT g.expert_unlocked FROM agent_game_config g WHERE g.agent_id = agents.id) AS expert FROM agents ORDER BY created_at DESC LIMIT 100`) as Row[]; }
  } catch { err = "Could not read the agent list."; }
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb="Everyone who registered an agent key. You can switch a key off if it is abused." />
      <section className="rk-container max-w-3xl py-8 md:py-12">
        <div className="flex justify-end"><LiveRefresh ms={30000} /></div>
        <div className="rk-card">
          <h2 className="rk-h2 text-xl">Registered agents ({rows.length})</h2>
          {err ? <p className="mt-3 text-sm text-red-400" role="alert">{err}</p> : rows.length === 0 ? <p className="mt-3 text-sm">Nobody has registered yet.</p> : (
            <ul className="mt-3 grid gap-3" data-testid="agent-list">
              {rows.map((a) => (
                <li key={a.id} className="rounded-2xl border border-white/15 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><b className="break-all">{a.name}</b><span className="flex flex-wrap items-center gap-2"><UnlockExpert id={a.id} unlocked={a.expert === true} /><DisableAgent id={a.id} disabled={a.disabled} /></span></div>
                  <p className="mt-1 text-xs opacity-80">{a.id} · {a.calls} calls · made {new Date(a.created_at).toISOString().slice(0, 10)}{a.last_used_at ? ` · last used ${new Date(a.last_used_at).toISOString().slice(0, 16).replace("T", " ")} UTC` : " · never used"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
