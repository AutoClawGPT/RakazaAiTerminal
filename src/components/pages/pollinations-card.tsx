"use client";
import { useState, useTransition } from "react";
import { savePollinations, testPollinations, type KeyActionResult } from "@/app/(site)/settings/integrations/actions";

export function PollinationsCard({ initialStatus }: { initialStatus: string }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<KeyActionResult | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<KeyActionResult>, after?: (r: KeyActionResult) => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      after?.(r);
    });

  return (
    <div className="rk-card rk-card-hard" data-testid="pollinations-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="rk-h2 text-2xl">Pollinations (token images)</h2>
        <span className="rk-pill" data-testid="pollinations-status">{status}</span>
      </div>
      <p className="mt-2 text-[0.95rem] leading-snug">
        Makes the logo for each scanned token with FLUX Schnell, about $0.002 per image. Get a key at{" "}
        <a className="underline" href="https://enter.pollinations.ai" target="_blank" rel="noreferrer">enter.pollinations.ai</a>. The key is tested first, saved encrypted, and never shown again.
      </p>
      <label htmlFor="pol-key" className="mt-4 block text-sm font-semibold">Paste key</label>
      <input
        id="pol-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="sk_… (leave empty to test the saved key)"
        className="mt-1 w-full rounded-xl border-2 border-[var(--rk-ink)] bg-white px-3 py-2 font-mono text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rk-btn rk-btn-white rk-btn-sm" disabled={pending} onClick={() => run(() => testPollinations(value, false))}>
          Test key
        </button>
        <button className="rk-btn rk-btn-white rk-btn-sm" disabled={pending} onClick={() => run(() => testPollinations(value, true))}>
          Test with a sample image
        </button>
        <button
          className="rk-btn rk-btn-honey rk-btn-sm"
          disabled={pending || !value.trim()}
          onClick={() => run(() => savePollinations(value), (r) => { if (r.ok) { setValue(""); setStatus("Set (store)"); } })}
        >
          Test and save
        </button>
      </div>
      <p aria-live="polite" className="mt-3 text-sm" data-testid="pollinations-result">
        {pending ? "Working…" : result ? `${result.ok ? "OK. " : "Failed. "}${result.message}${result.balance !== undefined ? ` Balance: $${result.balance.toFixed(2)}.` : ""}` : ""}
      </p>
      {result?.imageB64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="Sample generated token logo" className="mt-3 size-40 rounded-2xl border-2 border-[var(--rk-ink)]" src={`data:image/png;base64,${result.imageB64}`} />
      ) : null}
    </div>
  );
}
