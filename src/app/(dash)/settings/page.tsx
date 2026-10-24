import type { Metadata } from "next";
import Link from "next/link";
import { ToolHero } from "@/components/tools/tool-frame";
import { LogoutButton } from "@/components/account/logout-button";
import { getRoute } from "@/lib/routes";
import { keyHealth } from "@/lib/env";
import { isExecuteEnabled } from "@/lib/execute-gate";
import { publicEnv } from "@/lib/public-env";
import { rpcHealth } from "@/lib/chain";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const r = getRoute("/settings");
  const rpc = await rpcHealth();
  const health = Object.entries(keyHealth());
  const missing = health.filter(([, v]) => v === "missing").map(([k]) => k);
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <div className="rk-card grid gap-2 text-sm">
          <h2 className="rk-h2 text-xl">Server</h2>
          <p>Network: <b>{publicEnv.network === "mainnet-beta" ? "mainnet" : "devnet"}</b> (set with NEXT_PUBLIC_SOLANA_NETWORK)</p>
          <p>RPC: <b>{rpc.ok ? `answering in ${rpc.ms} ms` : "not answering"}</b></p>
          <p>Launch execution: <b>{isExecuteEnabled() ? "on" : "off"}</b> (set with EXECUTE_ENABLED)</p>
          <p>Limits: 60 API calls a minute per key, 6 a minute for slow tools, 20 chat messages a minute per visitor.</p>
        </div>
        <div className="rk-card grid gap-2 text-sm">
          <h2 className="rk-h2 text-xl">Keys</h2>
          <p>{health.length - missing.length} of {health.length} set.{missing.length ? ` Missing: ${missing.join(", ")}.` : ""}</p>
          <p><Link className="underline" href="/settings/integrations">Open integrations</Link> for details and the image test.</p>
        </div>
        <div><LogoutButton /></div>
      </section>
    </>
  );
}
