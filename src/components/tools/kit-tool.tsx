"use client";
import { useEffect, useMemo, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { autoChecks, buildMetadata, buildThread, CHECKLIST, emptyKit, type CheckId, type KitInput } from "@/lib/tools/kit";

const KEY = "rk.kit";

export function KitTool() {
  const [k, setK] = useState<KitInput>(emptyKit);
  const [ticks, setTicks] = useState<Partial<Record<CheckId, boolean>>>({});
  const [copied, setCopied] = useState("");

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (v?.k) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setK({ ...emptyKit, ...v.k });
        setTicks(v.ticks ?? {});
      }
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ k, ticks }));
    } catch {}
  }, [hydrated, k, ticks]);

  const meta = useMemo(() => JSON.stringify(buildMetadata(k), null, 2), [k]);
  const thread = useMemo(() => buildThread(k), [k]);
  const auto = useMemo(() => autoChecks(k), [k]);
  const done = CHECKLIST.filter((c) => (c.manual ? ticks[c.id] : auto[c.id])).length;
  const set = (key: keyof KitInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setK((s) => ({ ...s, [key]: e.target.value }));
  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1500);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([meta], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "metadata.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const F = ({ id, label, k: key, ph, area }: { id: string; label: string; k: keyof KitInput; ph?: string; area?: boolean }) => (
    <div className={area ? "sm:col-span-2" : ""}>
      <label className={labelCls} htmlFor={id}>{label}</label>
      {area ? <textarea id={id} className={`${fieldCls} min-h-24 py-2`} value={k[key]} onChange={set(key)} placeholder={ph} /> : <input id={id} className={fieldCls} value={k[key]} onChange={set(key)} placeholder={ph} spellCheck={false} />}
    </div>
  );

  return (
    <div className="grid gap-5">
      <SlidePanel title="Your coin" hint="Fill it in once, everything below follows" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-2">
          {F({ id: "k-name", label: "Name", k: "name" })}
          {F({ id: "k-ticker", label: "Ticker", k: "ticker", ph: "TICKER" })}
          {F({ id: "k-desc", label: "Description", k: "description", area: true })}
          {F({ id: "k-image", label: "Image URL", k: "image", ph: "https://… or ipfs://…" })}
          {F({ id: "k-ca", label: "Contract address (optional)", k: "ca" })}
          {F({ id: "k-web", label: "Website", k: "website" })}
          {F({ id: "k-x", label: "X link", k: "twitter" })}
          {F({ id: "k-tg", label: "Telegram link", k: "telegram" })}
          {F({ id: "k-dev", label: "Dev buy (SOL, optional)", k: "devBuy" })}
        </div>
      </SlidePanel>

      <SlidePanel title="Checklist" hint={`${done} of ${CHECKLIST.length} done`}>
        <ul className="grid gap-2">
          {CHECKLIST.map((c) => {
            const on = c.manual ? Boolean(ticks[c.id]) : Boolean(auto[c.id]);
            return (
              <li key={c.id}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--rk-mint)]" checked={on} disabled={!c.manual} onChange={(e) => setTicks((t) => ({ ...t, [c.id]: e.target.checked }))} />
                  <span>{c.label}</span>
                  {!c.manual ? <span className="rk-pill text-[0.65rem]">auto</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      </SlidePanel>

      <SlidePanel title="Token metadata" hint="Upload this file and use its link at launch">
        <pre className="max-h-72 overflow-auto rounded-xl bg-[var(--rk-ink)] p-3 font-mono text-xs text-white" data-testid="kit-meta">{meta}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rk-btn rk-btn-mint rk-btn-sm" onClick={() => copy("meta", meta)}>{copied === "meta" ? "Copied" : "Copy JSON"}</button>
          <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={download}>Download</button>
        </div>
      </SlidePanel>

      <SlidePanel title="Launch post" hint="Template-based, each post must fit 280 characters">
        {thread.posts.map((p, i) => (
          <div key={i} className="mb-3">
            <pre className="whitespace-pre-wrap rounded-xl border border-border p-3 text-sm" data-testid="kit-post">{p}</pre>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className={thread.lengths[i] > 280 ? "text-[var(--rk-pink)]" : "text-muted-foreground"}>{thread.lengths[i]} / 280</span>
              <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => copy(`p${i}`, p)}>{copied === `p${i}` ? "Copied" : "Copy"}</button>
            </div>
          </div>
        ))}
      </SlidePanel>
    </div>
  );
}
