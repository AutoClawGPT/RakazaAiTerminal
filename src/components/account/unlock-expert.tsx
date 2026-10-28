"use client";
import { useState, useTransition } from "react";
import { setExpertUnlock } from "@/app/(dash)/dash/agents/actions";

/** Owner-only switch for the stage 6 expert AI pilot of one agent. */
export function UnlockExpert({ id, unlocked }: { id: string; unlocked: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  return (
    <span className="flex items-center gap-2">
      {err ? <span className="text-xs text-red-400" role="alert">{err}</span> : null}
      <button type="button" data-testid="unlock-expert" className="rk-btn rk-btn-white rk-btn-sm" disabled={pending} onClick={() => start(async () => { const r = await setExpertUnlock(id, !unlocked); if (!r.ok) setErr(r.error ?? "Failed"); })}>{unlocked ? "Lock expert pilot" : "Unlock expert pilot"}</button>
    </span>
  );
}
