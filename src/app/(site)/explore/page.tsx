import type { Metadata } from "next";
import Link from "next/link";
import { ToolHero } from "@/components/tools/tool-frame";
import { nowMs } from "@/components/market/format";
import { ExploreClient } from "@/components/market/explore-client";
import { listTokens } from "@/lib/market/tokens";
import { publicEnv } from "@/lib/public-env";

export const metadata: Metadata = {
  title: "Explore tokens",
  description: "Every token launched through Rakaza on pump.fun. New, graduating soon, graduated and trending, with live charts.",
  alternates: { canonical: "/explore" },
};
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export default async function Page() {
  // Server-render the first page from the cache (no refresh, so it is instant). The client refreshes right after.
  const first = await listTokens({ tab: "new", limit: 24, offset: 0, noRefresh: true }).catch(() => null);
  const initial = first ? { ok: true, tokens: first.tokens, hasMore: first.hasMore, network: first.network } : null;
  return (
    <>
      <ToolHero
        kicker={publicEnv.network === "devnet" ? "Tokens launched here · devnet" : "Tokens launched here"}
        title="Explore"
        blurb="Every token launched through Rakaza. Watch the bonding curve fill, open a token for its live chart and trades."
      />
      <section className="rk-container grid gap-5 py-8 md:py-12">
        <ExploreClient initial={initial} initialNow={nowMs()} />
        <p className="text-xs opacity-70">
          Want yours here? <Link className="underline" href="/self-launch">Launch from your own wallet</Link>. Numbers come from the chain and our own trade index. Nothing here is financial advice.
        </p>
      </section>
    </>
  );
}
