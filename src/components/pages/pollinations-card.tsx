"use client";
import { useState, useTransition } from "react";
import { testPollinations, type KeyActionResult } from "@/app/(site)/settings/integrations/actions";

/** Owner health check only. Keys are set once on the server (env / Vercel); nothing is pasted or stored from the browser. */
export function PollinationsCard() {
  const [result, setResult] = useState<KeyActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (withImage: boolean) =>
    start(async () => {
      setResult(await testPollinations(withImage));
    });

  return (
    <div className="rk-card rk-card-hard" data-testid="pollinations-card">
      <h2 className="rk-h2 text-2xl">Image generation check</h2>
      <p className="mt-2 text-[0.95rem] leading-snug">
        Token logos are made by the platform&apos;s own Pollinations key (FLUX Schnell, about $0.002 per image). Users never see or set keys. This only checks that the server key still works.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rk-btn rk-btn-white rk-btn-sm" disabled={pending} onClick={() => run(false)}>Test key</button>
        <button className="rk-btn rk-btn-honey rk-btn-sm" disabled={pending} onClick={() => run(true)}>Test with a sample image</button>
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
