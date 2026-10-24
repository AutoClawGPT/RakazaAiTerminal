import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { TradeQuote } from "@/components/launch/trade-quote";
import { getRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Trade" };

export default function Page() {
  const r = getRoute("/trade");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb="Check a live Jupiter price and route before any trade. Nothing is sent from this page." />
      <section className="rk-container grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 py-8 md:py-12"><TradeQuote /></section>
    </>
  );
}
