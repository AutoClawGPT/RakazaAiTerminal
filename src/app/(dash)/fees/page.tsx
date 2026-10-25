import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { LedgerView } from "@/components/launch/ledger-view";
import { getRoute } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
export const metadata: Metadata = { title: "Fees" };
export const dynamic = "force-dynamic";

/** Server actions on this page run under this limit (Vercel function duration). */
export const maxDuration = 60;

export default function Page() {
  const r = getRoute("/fees");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb="What every wallet has earned, what is waiting to be sent, and what has been sent." />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <LedgerView view="fees" treasury={publicEnv.treasuryPubkey} />
      </section>
    </>
  );
}
