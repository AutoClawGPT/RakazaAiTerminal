"use client";
import { useLive } from "@/lib/live/live-state";

/** OFFLINE / LIVE badge that switches when the owner goes live. kind "stage" = corner badge, "pill" = card pill. */
export function LiveBadge({ kind }: { kind: "stage" | "pill" }) {
  const { live } = useLive();
  if (kind === "pill") return <span className="rk-pill !min-h-7 text-[0.7rem]" style={live ? { background: "#ff2d55", color: "#fff", borderColor: "#ff2d55" } : undefined}>{live ? "● LIVE" : "OFFLINE"}</span>;
  return (
    <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rk-ink)] bg-white px-3 py-1 font-mono text-[0.7rem] font-bold text-[var(--rk-ink)]" style={live ? { background: "#ff2d55", color: "#fff" } : undefined} data-testid="live-badge">
      <span className={`size-1.5 rounded-full ${live ? "animate-pulse bg-white" : "bg-zinc-400"}`} aria-hidden="true" /> {live ? "LIVE" : "OFFLINE"}
    </span>
  );
}

/** Status card heading: original offline copy when off, on-air copy when live. */
export function LiveStatusText() {
  const { live } = useLive();
  return live ? (
    <>
      <h2 id="live-off" className="rk-h2 mt-3 text-2xl">She’s live right now.</h2>
      <p className="mt-2 text-sm text-muted-foreground">Rakaza is on air: talking, answering chat and showing the platform live.</p>
    </>
  ) : (
    <>
      <h2 id="live-off" className="rk-h2 mt-3 text-2xl">She’s not live right now.</h2>
      <p className="mt-2 text-sm text-muted-foreground">Her next show will be announced on her socials once they exist. Until then she waits on the stage.</p>
    </>
  );
}
