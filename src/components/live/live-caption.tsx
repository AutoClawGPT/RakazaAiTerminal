"use client";
/** Live captions driven by call events (avatar state + SWAIG tool user_events). Only rendered while live; does not change the dashboard. */
import { useAvatar, useBrain, useLive } from "@/lib/live/live-state";

export function LiveCaption() {
  const { live } = useLive();
  const { caption, mode } = useAvatar();
  const brain = useBrain();
  // BEA's own stage draws her captions itself.
  if (!live || !caption || brain === "bea") return null;
  return (
    <div className="pointer-events-none absolute bottom-[11.5rem] left-1/2 z-20 max-w-[80%] -translate-x-1/2 sm:bottom-24 sm:max-w-[45%]" data-testid="live-caption" data-mode={mode} aria-live="polite">
      <p className="rounded bg-black/70 px-3 py-1 text-center text-sm text-white">{caption}</p>
    </div>
  );
}
