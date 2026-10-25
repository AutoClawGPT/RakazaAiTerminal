/** Small retry helper for network calls. Retries only errors that look temporary, never a rejected key or a failed on-chain program. */
const TRANSIENT = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|timed out|timeout|aborted|429|502|503|504|(error|answered|returned) (500|408)|Too Many Requests|rate limit|Blockhash not found|node is behind|connection terminated|Connection terminated|temporarily/i;

export function isTransient(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return TRANSIENT.test(m);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: { tries?: number; baseMs?: number; retryIf?: (e: unknown) => boolean } = {}): Promise<T> {
  const tries = opts.tries ?? 3, base = opts.baseMs ?? 500, retryIf = opts.retryIf ?? isTransient;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(i); }
    catch (e) {
      last = e;
      if (i === tries - 1 || !retryIf(e)) break;
      await sleep(base * 2 ** i);
    }
  }
  throw last;
}
