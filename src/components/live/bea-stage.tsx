"use client";
/** /live only: while live on the BEA brain, her own BEA stage (the avatar set up in the BEA dashboard) replaces our VRM desk; SignalWire keeps the VRM. */
import type { ReactNode } from "react";
import { useBrain, useLive } from "@/lib/live/live-state";

export function BeaStageSwitch({ children }: { children: ReactNode }) {
  const { live } = useLive();
  const bea = useBrain() === "bea" && live;
  return (
    <>
      <div style={{ display: bea ? "none" : "contents" }}>{children}</div>
      {bea ? <iframe src="/api/live/bea/stage" title="Rakaza live stage (BEA)" data-testid="bea-stage" className="absolute inset-0 z-[1] h-full w-full border-0 bg-transparent" allow="autoplay" style={{ colorScheme: "normal" }} /> : null}
    </>
  );
}
