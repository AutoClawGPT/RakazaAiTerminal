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
