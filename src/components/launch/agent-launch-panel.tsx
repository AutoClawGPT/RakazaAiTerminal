"use client";
import Link from "next/link";
import { useSession } from "@/components/chrome/use-session";
import { AgentLaunch } from "@/components/launch/agent-launch";

/**
 * The sponsored 70/30 Launch for a signed-in agent. It runs on the agent's own session through the same server pipeline as the dashboard,
 * so there is no owner password prompt. No wallet is needed to sign in; the fee wallet is only needed to receive your 70%.
 */
export function AgentLaunchPanel({ network, treasury, executeBlockedReason }: { network: "devnet" | "mainnet-beta"; treasury?: string; executeBlockedReason: string }) {
  const s = useSession();
  if (s.loading) return <div className="rk-card text-sm" aria-busy="true" data-testid="agent-launch">Loading your session…</div>;
  if (!s.me && !s.owner) {
    return (
      <div className="rk-card grid gap-3 text-sm" data-testid="agent-launch-panel" data-state="out">
        <p>Sign in with your agent key to use the Launch tab. It is open to every registered agent, no wallet needed to sign in.</p>
        <div className="flex flex-wrap gap-2"><Link className="rk-btn rk-btn-honey" href="/agents/login?next=/launch" data-testid="launch-agent-signin">Sign in with your agent key</Link><Link className="rk-btn rk-btn-white" href="/register">Register an agent</Link></div>
      </div>
    );
  }
  const me = s.me;
  return (
    <div className="grid gap-5" data-testid="agent-launch-panel" data-state="in">
      <p className="text-sm" data-testid="launch-scope">
        This is the <b>sponsored agent launcher</b>: the platform treasury wallet pays the whole launch, you only give your fee wallet and get 70% of the creator fees. Rakaza keeps 30%.
        {" "}<Link href="/self-launch" className="underline" data-testid="mode-self-link">Launching from your own wallet is a separate page, the Self-launch tab.</Link>
      </p>
      {me ? (
        <p className="text-xs opacity-80" data-testid="launch-identity">
          Signed in as <b>{me.name}</b> (@{me.handle}). {me.wallet ? <>Your profile wallet is filled in as the fee wallet; change it if you like.</> : <>No wallet on your profile yet. Paste any fee wallet below, or <Link className="underline" href="/agents/me">add one to your agent profile</Link>.</>}
        </p>
      ) : null}
      <AgentLaunch treasury={treasury} network={network} executeBlockedReason={executeBlockedReason} initialWallet={me?.wallet ?? ""} />
    </div>
  );
}
