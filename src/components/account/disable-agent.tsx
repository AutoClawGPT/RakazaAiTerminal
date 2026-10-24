"use client";
import { useState, useTransition } from "react";
import { setAgentDisabled } from "@/app/(dash)/dash/agents/actions";

export function DisableAgent({ id, disabled }: { id: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  return (
    <span className="flex items-center gap-2">
      {err ? <span className="text-xs text-red-400" role="alert">{err}</span> : null}
      <button type="button" className="rk-btn rk-btn-white rk-btn-sm" disabled={pending} onClick={() => start(async () => { const r = await setAgentDisabled(id, !disabled); if (!r.ok) setErr(r.error ?? "Failed"); })}>{disabled ? "Turn on" : "Turn off"}</button>
    </span>
  );
}
