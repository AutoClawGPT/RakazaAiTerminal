import type { VampResult } from "@/lib/launch/vamp";
import type { AutoDraft, FlagRisk } from "@/lib/launch/auto";
import type { ExecResult } from "@/lib/launch/execute";
import type { LaunchPlan } from "@/lib/launch/approval";
import type { Ledger } from "@/lib/launch/ledger";
import type { AutoPrepareInput, AutoTrust } from "@/app/(dash)/launch/auto-actions";
import type { PrepareOut } from "@/app/(dash)/launch/actions";

type Fail = { ok: false; error: string };
export interface PinInput { name: string; ticker: string; description: string; imageDataUrl: string; links?: { website?: string; twitter?: string; telegram?: string } }

/**
 * The server calls the launch pipeline needs. The owner Agent launch (/launch) wires the owner-only actions; the public Self launch
 * (/self-launch) wires the rate-limited public ones. The pipeline component is shared and never imports either set itself.
 */
export interface LaunchApi {
  scan(ca: string): Promise<{ ok: true; result: VampResult } | Fail>;
  analyze(ca: string, avoid: string[]): Promise<{ ok: true; draft: AutoDraft } | Fail>;
  risk(name: string, ticker: string): Promise<{ ok: true; risk: FlagRisk } | Fail>;
  image(prompt: string): Promise<{ ok: true; dataUrl: string; ms: number } | Fail>;
  pin(i: PinInput): Promise<{ ok: true; imageUrl: string; uri: string } | Fail>;
  /** Sponsored launch only. */
  trust?(wallet: string): Promise<{ ok: true; trust: AutoTrust } | Fail>;
  prepare?(i: AutoPrepareInput): Promise<{ ok: true; out: PrepareOut; grounded: boolean } | Fail>;
  launch?(plan: LaunchPlan, ticket: string, sealed: string): Promise<{ ok: true; result: ExecResult } | Fail>;
  ledger?(): Promise<Ledger | Fail>;
}
