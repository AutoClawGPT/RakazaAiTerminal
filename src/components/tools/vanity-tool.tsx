"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { expectedKeys, tierFor, validatePattern, type Pattern, type WorkerOut } from "@/lib/tools/vanity";
import { humanTime } from "@/lib/tools/shield";

interface Found {
  addr: string;
  secret: string;
  count: number;
}

export function VanityTool() {
  const [pattern, setPattern] = useState<Pattern>({ start: "", end: "", ignoreCase: false });
  const [threads, setThreads] = useState(2);
  const [maxThreads, setMaxThreads] = useState(4);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [rate, setRate] = useState(0);
  const [best, setBest] = useState<{ addr: string; score: number } | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState("");
  const workers = useRef<Worker[]>([]);
  const counts = useRef<number[]>([]);
  const t0 = useRef(0);

  useEffect(() => {
    const cores = navigator.hardwareConcurrency || 4;
    const cap = Math.min(16, cores);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaxThreads(cap);
    setThreads(Math.max(1, Math.min(8, cores - 1)));
  }, []);

  const check = useMemo(() => validatePattern(pattern), [pattern]);
  const expected = check.ok ? expectedKeys(pattern) : 0;
  const eta = rate > 0 && expected ? expected / rate : 0;

  const stop = useCallback(() => {
    workers.current.forEach((w) => {
      w.postMessage({ type: "stop" });
      w.terminate();
    });
    workers.current = [];
    setRunning(false);
  }, []);
  useEffect(() => stop, [stop]);

  const start = () => {
    if (!check.ok) return;
    stop();
    setFound(null);
    setError("");
    setReveal(false);
    setBest(null);
    setTotal(0);
    setRate(0);
    counts.current = Array(threads).fill(0);
    t0.current = performance.now();
    setRunning(true);
    workers.current = Array.from({ length: threads }, (_, i) => {
      const w = new Worker(new URL("../../lib/tools/vanity.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === "ready") w.postMessage({ type: "start", pattern });
        else if (m.type === "progress") {
          counts.current[i] = m.count;
          const sum = counts.current.reduce((a, b) => a + b, 0);
          setTotal(sum);
          setRate(sum / Math.max(0.001, (performance.now() - t0.current) / 1000));
          setBest((b) => (m.best && (!b || m.best.score > b.score) ? m.best : b));
        } else if (m.type === "found") {
          counts.current[i] = m.count;
          setTotal(counts.current.reduce((a, b) => a + b, 0));
          setFound({ addr: m.addr, secret: m.secret, count: m.count });
          stop();
        } else if (m.type === "error") {
          setError(m.message);
          stop();
        }
      };
      w.onerror = (e) => {
        setError(e.message || "The grinder could not start in this browser.");
        stop();
      };
      return w;
    });
  };

  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1500);
  };

  return (
    <div className="grid gap-5">
      <SlidePanel title="Pattern" hint="Letters your address starts and ends with" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="v-start">Starts with</label>
            <input id="v-start" className={`${fieldCls} font-mono`} value={pattern.start} onChange={(e) => setPattern((p) => ({ ...p, start: e.target.value.trim() }))} placeholder="e.g. Rkz" spellCheck={false} autoComplete="off" disabled={running} />
          </div>
          <div>
            <label className={labelCls} htmlFor="v-end">Ends with</label>
            <input id="v-end" className={`${fieldCls} font-mono`} value={pattern.end} onChange={(e) => setPattern((p) => ({ ...p, end: e.target.value.trim() }))} placeholder="e.g. pump" spellCheck={false} autoComplete="off" disabled={running} />
          </div>
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--rk-honey)]" checked={pattern.ignoreCase} onChange={(e) => setPattern((p) => ({ ...p, ignoreCase: e.target.checked }))} disabled={running} />
          Ignore upper and lower case (much faster)
        </label>
        <label className={`${labelCls} mt-3`} htmlFor="v-threads">Threads: {threads} of {maxThreads}</label>
        <input id="v-threads" type="range" min={1} max={maxThreads} value={threads} onChange={(e) => setThreads(Number(e.target.value))} className="w-full accent-[var(--rk-honey)]" disabled={running} />
        <div role="status" aria-live="polite" className="mt-3 text-sm" data-testid="vanity-estimate">
          {!check.ok && (pattern.start || pattern.end) ? (
            <ul className="list-disc space-y-1 rounded-xl border-2 border-[var(--rk-pink)] p-3 pl-8">
              {check.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : check.ok ? (
            <p>
              About <strong>{Math.round(expected).toLocaleString("en-US")}</strong> keys on average.
              {rate > 0 ? ` At ${Math.round(rate).toLocaleString("en-US")} keys per second that is roughly ${humanTime(eta)} (${tierFor(eta)}).` : " Start to measure your speed."}
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {running ? (
            <button type="button" className="rk-btn rk-btn-white" onClick={stop}>Stop</button>
          ) : (
            <button type="button" className="rk-btn rk-btn-honey" onClick={start} disabled={!check.ok}>Start grinding</button>
          )}
        </div>
      </SlidePanel>

      <SlidePanel title="Progress" hint={running ? "Grinding in your browser" : found ? "Found one" : "Idle"} defaultOpen>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="rk-kicker text-muted-foreground">Keys tried</dt>
            <dd className="mt-1 font-mono font-bold" data-testid="vanity-total">{total.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt className="rk-kicker text-muted-foreground">Speed</dt>
            <dd className="mt-1 font-mono font-bold">{Math.round(rate).toLocaleString("en-US")}/s</dd>
          </div>
        </dl>
        {best && !found ? <p className="mt-3 break-all font-mono text-xs text-muted-foreground">Closest so far: {best.addr} ({Math.round(best.score * 100)}%)</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-xl border-2 border-[var(--rk-pink)] p-3 text-sm">{error}</p> : null}
      </SlidePanel>

      {found ? (
        <SlidePanel title="Your address" hint="Back up the secret key now" defaultOpen>
          <p className="break-all font-mono text-sm font-bold" data-testid="vanity-addr">{found.addr}</p>
          <p className="mt-3 text-sm">The secret key was made in this browser and has not been sent anywhere. Anyone who has it controls the address. Store it offline before you use this address.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => setReveal((r) => !r)}>{reveal ? "Hide secret key" : "Show secret key"}</button>
            <button type="button" className="rk-btn rk-btn-mint rk-btn-sm" onClick={() => copy("addr", found.addr)}>{copied === "addr" ? "Copied" : "Copy address"}</button>
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => copy("sk", found.secret)}>{copied === "sk" ? "Copied" : "Copy secret key"}</button>
            <a className="rk-btn rk-btn-honey rk-btn-sm" href="/keyvault" data-testid="to-vault" onClick={() => sessionStorage.setItem("rk.pending", JSON.stringify({ address: found.addr, secret: found.secret }))}>Save to key vault</a>
          </div>
          {reveal ? <pre className="mt-3 overflow-x-auto break-all whitespace-pre-wrap rounded-xl bg-[var(--rk-ink)] p-3 font-mono text-xs text-white" data-testid="vanity-secret">{found.secret}</pre> : null}
        </SlidePanel>
      ) : null}
    </div>
  );
}
