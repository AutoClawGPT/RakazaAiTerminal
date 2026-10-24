"use client";
import { useState, useTransition } from "react";
import { quoteAction, type QuoteResult } from "@/app/(dash)/trade/actions";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function TradeQuote() {
  const [inM, setIn] = useState(SOL);
  const [outM, setOut] = useState(USDC);
  const [amt, setAmt] = useState("100000000");
  const [slip, setSlip] = useState("50");
  const [res, setRes] = useState<QuoteResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="rk-card grid gap-3">
      <p className="text-sm opacity-80">This gets a live price from Jupiter. It cannot swap anything: sending a swap is not switched on.</p>
      <div><label className={labelCls} htmlFor="t-in">You pay (token address)</label><input id="t-in" className={fieldCls} value={inM} onChange={(e) => setIn(e.target.value)} /></div>
      <div><label className={labelCls} htmlFor="t-out">You get (token address)</label><input id="t-out" className={fieldCls} value={outM} onChange={(e) => setOut(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls} htmlFor="t-amt">Amount, smallest unit</label><input id="t-amt" inputMode="numeric" className={fieldCls} value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
        <div><label className={labelCls} htmlFor="t-slip">Slippage, basis points</label><input id="t-slip" inputMode="numeric" className={fieldCls} value={slip} onChange={(e) => setSlip(e.target.value)} /></div>
      </div>
      <button className="rk-btn rk-btn-mint min-h-11" data-testid="quote-go" disabled={pending} onClick={() => start(async () => setRes(await quoteAction({ inputMint: inM, outputMint: outM, amount: amt, slippageBps: Number(slip) })))}>{pending ? "Getting quote…" : "Get quote"}</button>
      {res && !res.ok ? <p className="text-sm text-red-400" role="alert" data-testid="quote-err">{res.error}</p> : null}
      {res && res.ok ? <dl className="grid gap-2 text-sm" data-testid="quote-out"><div><dt className="rk-kicker">You would receive</dt><dd className="font-semibold">{res.outAmount} (smallest unit)</dd></div><div><dt className="rk-kicker">Price impact</dt><dd>{(Number(res.priceImpactPct) * 100).toFixed(3)}%</dd></div><div><dt className="rk-kicker">Route</dt><dd>{res.route.join(", ") || "direct"}</dd></div></dl> : null}
    </div>
  );
}
