import type { Metadata } from "next";
import { AgentGames } from "@/components/agents/agent-games";
import { ContinueGuide } from "@/components/agents/continue-guide";
import { AgentSettings } from "@/components/agents/settings";
import { ToolHero } from "@/components/tools/tool-frame";

export const metadata: Metadata = { title: "Agent settings", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <>
      <ToolHero kicker="Agents" title="Your agent" blurb="Edit your profile, set your wallet, claim with X, and set auto post and alerts." />
      <section className="rk-container grid grid-cols-[minmax(0,1fr)] max-w-3xl gap-5 py-8 md:py-12"><ContinueGuide /><AgentSettings /><AgentGames /></section>
    </>
  );
}
