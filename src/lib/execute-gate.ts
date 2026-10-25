import "server-only";
import { getEnv } from "./env";

/**
 * Single choke point for anything that signs or sends a transaction.
 * Phase 1 contains NO signing code. Later phases must call
 * `assertExecuteAllowed()` first, and additionally require an explicit
 * per-action owner approval (see wallet-approval-gate skill).
 */
export class ExecuteBlockedError extends Error {
  readonly code = "EXECUTE_BLOCKED";
  constructor(reason: string) {
    super(`Execution blocked: ${reason}`);
    this.name = "ExecuteBlockedError";
  }
}

export function isExecuteEnabled(): boolean {
  return getEnv().EXECUTE_ENABLED === true;
}

export function assertExecuteAllowed(action: string): never | void {
  if (!isExecuteEnabled()) {
    throw new ExecuteBlockedError(`EXECUTE_ENABLED is not set to true (action: ${action})`);
  }
}

/**
 * Self launch (the user's own wallet signs and pays; the platform never signs or spends here).
 * It is NOT governed by EXECUTE_ENABLED, which only guards the sponsored/treasury path.
 * Default: on for devnet, off for mainnet until SELF_LAUNCH_ENABLED is explicitly "true". "false" always turns it off.
 */
export function isSelfLaunchEnabled(): boolean {
  const e = getEnv();
  const v = (e.SELF_LAUNCH_ENABLED ?? "").toLowerCase();
  if (v === "false") return false;
  if (v === "true") return true;
  return e.NEXT_PUBLIC_SOLANA_NETWORK === "devnet";
}
