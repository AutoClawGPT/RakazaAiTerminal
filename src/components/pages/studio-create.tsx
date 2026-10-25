"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { studioGenerateAction, type StudioResult } from "@/app/(site)/studio/create/actions";

const MODES = [
  { id: "design", label: "Character design" },
  { id: "picture", label: "Picture" },
  { id: "logo", label: "Token logo" },
] as const;

/** Studio generator. Generation is owner-only; everyone else sees the sign-in hint. */
export function StudioCreate() {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("picture");
  const [prompt, setPrompt] = useState("");
  const [big, setBig] = useState(false);
  const [res, setRes] = useState<StudioResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-6 border-t-2 border-[var(--rk-line)] pt-5" data-testid="studio-create">
      <h3 className="rk-h2 text-xl">Make an image (FLUX Schnell)</h3>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" className="rk-pill !min-h-8 text-xs" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs"><input type="checkbox" checked={big} onChange={(e) => setBig(e.target.checked)} /> 1024px</label>
      </div>
      <label htmlFor="studio-prompt" className="sr-only">Describe the image</label>
      <textarea id="studio-prompt" rows={3} maxLength={600} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A purple-haired cat-ear streamer with star hairpins…" className="mt-3 w-full rounded-xl border-2 border-[var(--rk-violet)] bg-card p-2 text-sm" />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className="rk-btn rk-btn-honey rk-btn-sm" disabled={pending || prompt.trim().length < 5} onClick={() => start(async () => setRes(await studioGenerateAction({ prompt, mode, size: big ? "1024x1024" : "512x512" })))}>
          {pending ? "Drawing…" : "Generate"}
        </button>
        <span className="text-xs text-muted-foreground">Owner only. <Link href="/login" className="underline">Sign in</Link></span>
      </div>
      <p aria-live="polite" className="mt-2 text-sm" data-testid="studio-result">{res ? (res.ok ? `Made in ${(res.ms / 1000).toFixed(1)}s with ${res.model}.` : res.error) : ""}</p>
      {res?.ok ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Generated image" src={res.dataUrl} className="mt-3 w-full max-w-sm rounded-2xl border-2 border-[var(--rk-ink)]" />
          <a href={res.dataUrl} download="rakaza-studio.png" className="rk-pill mt-2 inline-flex !min-h-8 text-xs">Download</a>
        </>
      ) : null}
    </div>
  );
}
