"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { decodeLink, encodeLink, makePoolKeypair, openResult, sealResult, type Opened, type PoolKeypair, type PoolLink } from "@/lib/tools/pool";
import { expectedKeys, validatePattern, type Pattern, type WorkerOut } from "@/lib/tools/vanity";
import { humanTime } from "@/lib/tools/shield";

const SKEY = "rk.poolkey";

export function PoolTool() {
  const [mode, setMode] = useState<"loading" | "create" | "join">("loading");
  const [joinLink, setJoinLink] = useState<PoolLink | null>(null);
  const [joinErr, setJoinErr] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const h = window.location.hash;
    if (h.includes("pool=")) {
      try {
        setJoinLink(decodeLink(h.slice(h.indexOf("pool=") + 5)));
        setMode("join");
        return;
      } catch (e) {
        setJoinErr(e instanceof Error ? e.message : "Bad link.");
      }
    }
    setMode("create");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (mode === "loading") return <div className="rk-card text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="grid gap-5">
      {joinErr ? <p role="alert" className="rk-card text-sm font-semibold text-red-700">{joinErr}</p> : null}
      {mode === "join" && joinLink ? <Contribute link={joinLink} /> : <Create />}
    </div>
  );
}

function Create() {
  const router = useRouter();
  const [pattern, setPattern] = useState<Pattern>({ start: "", end: "", ignoreCase: false });
  const [label, setLabel] = useState("");
  const [kp, setKp] = useState<PoolKeypair | null>(null);
  const [codes, setCodes] = useState("");
  const [opened, setOpened] = useState<Opened[]>([]);
  const [errs, setErrs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SKEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setKp(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated && kp) sessionStorage.setItem(SKEY, JSON.stringify(kp));
  }, [kp, hydrated]);

  const check = useMemo(() => validatePattern(pattern), [pattern]);
  const link = useMemo(() => (kp && check.ok && typeof window !== "undefined" ? `${window.location.origin}/pool#pool=${encodeLink({ v: 1, label, pattern, pk: kp.pk })}` : ""), [kp, check.ok, label, pattern]);

  const make = async () => setKp(await makePoolKeypair());
  const openAll = async () => {
    if (!kp) return;
    const lines = codes.split(/\s+/).filter(Boolean);
    const ok: Opened[] = [];
    const bad: string[] = [];
    for (const c of lines) {
      try { ok.push(await openResult(c, kp)); } catch (e) { bad.push(`${c.slice(0, 12)}…: ${e instanceof Error ? e.message : "failed"}`); }
    }
    setOpened(ok); setErrs(bad);
  };
  const download = () => {
    if (!kp) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(kp)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "rakaza-pool-key.json"; a.click(); URL.revokeObjectURL(url);
  };
  const load = async (f: File | undefined) => {
    if (!f) return;
    try { const j = JSON.parse(await f.text()); if (j.pk && j.sk) setKp({ pk: j.pk, sk: j.sk }); } catch { setErrs(["That file is not a pool key."]); }
  };
  const stashForVault = (o: Opened) => { sessionStorage.setItem("rk.pending", JSON.stringify({ address: o.address, secret: o.secret })); router.push("/keyvault"); };

  return (
    <>
      <SlidePanel title="1. Pattern and link" hint="What the team should grind for" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="p-start">Starts with</label>
            <input id="p-start" className={`${fieldCls} font-mono`} value={pattern.start} onChange={(e) => setPattern((p) => ({ ...p, start: e.target.value.trim() }))} spellCheck={false} autoComplete="off" />
          </div>
          <div>
            <label className={labelCls} htmlFor="p-end">Ends with</label>
            <input id="p-end" className={`${fieldCls} font-mono`} value={pattern.end} onChange={(e) => setPattern((p) => ({ ...p, end: e.target.value.trim() }))} spellCheck={false} autoComplete="off" />
          </div>
        </div>
        <label className={`${labelCls} mt-3`} htmlFor="p-label">Pool name (optional)</label>
        <input id="p-label" className={fieldCls} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        {!check.ok && (pattern.start || pattern.end) ? <p className="mt-2 text-sm text-red-700" role="alert">{check.errors[0]}</p> : null}
        {check.ok ? <p className="mt-2 text-xs text-muted-foreground">About {Math.round(expectedKeys(pattern)).toLocaleString()} tries on average, roughly {humanTime(expectedKeys(pattern) / 2e4)} for a four-core laptop.</p> : null}
        <button type="button" className="rk-btn rk-btn-mint mt-4" onClick={make} disabled={!check.ok}>{kp ? "Make a new pool key (old links stop working)" : "Create pool link"}</button>
        {link ? (
          <div className="mt-4">
            <p className={labelCls}>Share this link</p>
            <p className="break-all rounded-xl bg-[var(--rk-ink)] p-3 font-mono text-xs text-white" data-testid="pool-link">{link}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy link"}</button>
              <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={download}>Download pool key</button>
              <label className="rk-btn rk-btn-white rk-btn-sm cursor-pointer">Load pool key<input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} /></label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">The pool key is held only in this tab. Download it, or you cannot open codes after closing the tab.</p>
          </div>
        ) : (
          <label className="rk-btn rk-btn-white rk-btn-sm mt-3 cursor-pointer">Load a saved pool key<input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} /></label>
        )}
      </SlidePanel>

      <SlidePanel title="2. Open result codes" hint="Paste the GH1. codes your team sends back" defaultOpen={false}>
        <label className={labelCls} htmlFor="p-codes">Codes, one per line</label>
        <textarea id="p-codes" className={`${fieldCls} min-h-28 font-mono text-xs`} value={codes} onChange={(e) => setCodes(e.target.value)} spellCheck={false} />
        <button type="button" className="rk-btn rk-btn-mint mt-3" onClick={openAll} disabled={!kp || !codes.trim()}>Open codes</button>
        {!kp ? <p className="mt-2 text-xs text-muted-foreground">Create or load your pool key first.</p> : null}
        {errs.map((e) => <p key={e} className="mt-2 text-sm text-red-700" role="alert" data-testid="pool-err">{e}</p>)}
        <ul className="mt-3 grid gap-3">
          {opened.map((o) => (
            <li key={o.address} className="rounded-xl border border-black/10 p-3" data-testid="pool-opened">
              <p className="break-all font-mono text-sm font-bold">{o.address}</p>
              {o.note ? <p className="text-xs text-muted-foreground">From {o.note}</p> : null}
              <button type="button" className="rk-btn rk-btn-honey rk-btn-sm mt-2" onClick={() => stashForVault(o)}>Save to key vault</button>
            </li>
          ))}
        </ul>
      </SlidePanel>
    </>
  );
}

function Contribute({ link }: { link: PoolLink }) {
  const [threads, setThreads] = useState(2);
  const [maxThreads, setMaxThreads] = useState(4);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const workers = useRef<Worker[]>([]);
  const counts = useRef<number[]>([]);

  useEffect(() => {
    const cores = navigator.hardwareConcurrency || 4;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaxThreads(Math.min(16, cores));
    setThreads(Math.max(1, Math.min(8, cores - 1)));
  }, []);

  const stop = useCallback(() => {
    workers.current.forEach((w) => { w.postMessage({ type: "stop" }); w.terminate(); });
    workers.current = [];
    setRunning(false);
  }, []);
  useEffect(() => stop, [stop]);

  const start = () => {
    stop(); setCode(""); setError(""); setTotal(0);
    counts.current = Array(threads).fill(0);
    setRunning(true);
    workers.current = Array.from({ length: threads }, (_, i) => {
      const w = new Worker(new URL("../../lib/tools/vanity.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = async (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === "ready") w.postMessage({ type: "start", pattern: link.pattern });
        else if (m.type === "progress") { counts.current[i] = m.count; setTotal(counts.current.reduce((a, b) => a + b, 0)); }
        else if (m.type === "found") {
          stop();
          setCode(await sealResult(link.pk, m.addr, m.secret, name.trim()));
        } else if (m.type === "error") { setError(m.message); stop(); }
      };
      w.onerror = (e) => { setError(e.message || "The grinder could not start in this browser."); stop(); };
      return w;
    });
  };

  return (
    <>
      <div className="rk-card" data-testid="pool-join">
        <p className="rk-kicker">You were invited{link.label ? `: ${link.label}` : ""}</p>
        <p className="mt-2 text-sm">Your browser will search for an address that starts with <b className="font-mono">{link.pattern.start || "anything"}</b>{link.pattern.end ? <> and ends with <b className="font-mono">{link.pattern.end}</b></> : null}. When it finds one, it locks the result so only the pool owner can read it, and gives you a code to send back. The secret key is never shown to you or sent anywhere.</p>
      </div>
      <SlidePanel title="Grind" hint={running ? "Working in your browser" : code ? "Found one" : "Ready"} defaultOpen>
        <label className={labelCls} htmlFor="j-name">Your name (optional, shown to the owner)</label>
        <input id="j-name" className={fieldCls} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} disabled={running} />
        <label className={`${labelCls} mt-3`} htmlFor="j-threads">Threads: {threads}</label>
        <input id="j-threads" type="range" min={1} max={maxThreads} value={threads} onChange={(e) => setThreads(Number(e.target.value))} disabled={running} className="w-full accent-[var(--rk-honey)]" />
        <div className="mt-4 flex gap-2">
          {!running ? <button type="button" className="rk-btn rk-btn-mint" onClick={start}>Start grinding</button> : <button type="button" className="rk-btn rk-btn-white" onClick={stop}>Stop</button>}
        </div>
        <p className="mt-3 text-sm" aria-live="polite">{total.toLocaleString()} addresses checked</p>
        {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </SlidePanel>
      {code ? (
        <div className="rk-card" data-testid="pool-code-box">
          <p className="rk-h2 text-xl">Send this code to the pool owner</p>
          <p className="mt-2 break-all rounded-xl bg-[var(--rk-ink)] p-3 font-mono text-xs text-white" data-testid="pool-code">{code}</p>
          <button type="button" className="rk-btn rk-btn-mint rk-btn-sm mt-3" onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy code"}</button>
        </div>
      ) : null}
    </>
  );
}
