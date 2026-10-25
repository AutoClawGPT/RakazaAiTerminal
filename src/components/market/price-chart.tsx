"use client";

import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { Candle } from "@/lib/market/types";
import { fmtPrice, fmtSol, SUPPLY } from "./format";
import { startLive } from "@/lib/live/start-live";

const INTERVALS = ["15s", "1m", "5m", "15m", "1h", "1d"] as const;
type Iv = (typeof INTERVALS)[number];
type Mode = "mcap" | "price";
const UP = "#3ff0c3";
const DOWN = "#ff4da6";

/** Real-time candlestick chart. Polls our own /api/public endpoint while the tab is visible. */
export function PriceChart({ mint, pollMs = 3000 }: { mint: string; pollMs?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fitted = useRef(false);
  const last = useRef<Candle[]>([]);
  const [iv, setIv] = useState<Iv>("1m");
  const [mode, setMode] = useState<Mode>("mcap");
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [source, setSource] = useState("");
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const modeRef = useRef<Mode>("mcap");

  // Create the chart once.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const text = getComputedStyle(el).color || "#ddd";
    const c = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontFamily: "inherit", attributionLogo: true },
      grid: { vertLines: { color: "rgba(150,140,200,0.12)" }, horzLines: { color: "rgba(150,140,200,0.12)" } },
      rightPriceScale: { borderColor: "rgba(150,140,200,0.35)", scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: {
        borderColor: "rgba(150,140,200,0.35)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      localization: { timeFormatter: (t: number) => new Date(t * 1000).toLocaleString() },
      crosshair: { mode: 1 },
    });
    const cs = c.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
      priceFormat: { type: "custom", minMove: 1e-12, formatter: (p: number) => (modeRef.current === "mcap" ? fmtSol(p, 3) : fmtPrice(p)) },
    });
    const vs = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", color: "rgba(150,140,200,0.45)" });
    vs.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chart.current = c; candles.current = cs; volume.current = vs;
    return () => { c.remove(); chart.current = null; candles.current = null; volume.current = null; };
  }, []);

  function paint(list: Candle[], m: Mode) {
    const k = m === "mcap" ? SUPPLY : 1;
    candles.current?.setData(list.map((x) => ({ time: x.t as UTCTimestamp, open: x.o * k, high: x.h * k, low: x.l * k, close: x.c * k })));
    volume.current?.setData(list.map((x) => ({ time: x.t as UTCTimestamp, value: x.v, color: x.c >= x.o ? "rgba(63,240,195,0.45)" : "rgba(255,77,166,0.45)" })));
  }

  // Poll candles.
  useEffect(() => {
    let stop = false;
    fitted.current = false;
    async function load() {
      try {
        const r = await fetch(`/api/public/tokens/${mint}/candles?interval=${iv}&limit=300`, { cache: "no-store" });
        const j = (await r.json()) as { ok: boolean; candles?: Candle[]; source?: string };
        if (stop) return;
        if (!r.ok || !j.ok || !j.candles) throw new Error("bad");
        last.current = j.candles;
        paint(j.candles, modeRef.current);
        setSource(j.source ?? "");
        setLiveAt(Date.now());
        if (j.candles.length === 0) setState("empty");
        else { setState("ready"); if (!fitted.current) { chart.current?.timeScale().fitContent(); fitted.current = true; } }
      } catch { if (!stop) setState((s) => (s === "ready" ? s : "error")); return false; }
    }
    void load();
    const stopLive = startLive(() => load(), pollMs);
    return () => { stop = true; stopLive(); };
  }, [mint, iv, pollMs]);

  // Switch between market cap and price without refetching.
  useEffect(() => { modeRef.current = mode; paint(last.current, mode); chart.current?.timeScale().fitContent(); }, [mode]);

  const pill = "min-h-9 cursor-pointer rounded-full border-[1.5px] border-[var(--rk-line)] px-3 text-xs font-bold aria-pressed:border-[var(--rk-ink)] aria-pressed:bg-[var(--rk-honey)] aria-pressed:text-[var(--rk-ink)]";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Candle size">
          {INTERVALS.map((x) => <button key={x} type="button" aria-pressed={iv === x} className={pill} onClick={() => { if (x !== iv) { setState("loading"); setIv(x); } }}>{x}</button>)}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Chart unit">
          <button type="button" aria-pressed={mode === "mcap"} className={pill} onClick={() => setMode("mcap")}>Market cap</button>
          <button type="button" aria-pressed={mode === "price"} className={pill} onClick={() => setMode("price")}>Price</button>
        </div>
      </div>
      <div className="relative h-[20rem] w-full overflow-hidden rounded-2xl border-2 border-[var(--rk-line)] bg-black/20 sm:h-[26rem]" data-testid="chart-box">
        <div ref={box} className="absolute inset-0" aria-label="Price chart" role="img" />
        {state !== "ready" ? (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm" role="status">
            {state === "loading" ? "Loading chart..." : state === "empty" ? "No trades yet. The chart starts with the first buy." : "Chart is unavailable right now. Retrying."}
          </div>
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 text-xs opacity-80">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-2 animate-pulse rounded-full bg-[var(--rk-mint)] motion-reduce:animate-none" />Live{liveAt ? "" : "..."}</span>
        <span>{mode === "mcap" ? "Market cap in SOL" : "Price in SOL"}</span>
        {source ? <span>Source: {source === "geckoterminal" ? "GeckoTerminal (DEX pool)" : "Rakaza curve index"}</span> : null}
      </p>
    </div>
  );
}
