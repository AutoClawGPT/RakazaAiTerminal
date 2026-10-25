/**
 * One small polling helper for every live screen.
 *  - Runs `fn` every `ms` while the tab is visible and the browser is online. Hidden tab = no requests at all.
 *  - Never runs two calls at once (a slow server cannot pile up requests).
 *  - When the tab comes back (or the network returns) it catches up at once if the data is older than `ms`.
 *  - Small random jitter so many open tabs do not hit the server in the same second.
 *  - If `fn` throws or returns false the wait grows (x2, up to x6) and resets after the next success. The last good data stays on screen.
 * Returns a stop function. Safe to call from useEffect.
 */
export function startLive(fn: () => Promise<boolean | void> | boolean | void, ms: number, opts: { immediate?: boolean } = {}): () => void {
  if (typeof document === "undefined") return () => {};
  let stopped = false;
  let busy = false;
  let fails = 0;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const visible = () => document.visibilityState === "visible" && (typeof navigator === "undefined" || navigator.onLine !== false);
  const delay = () => Math.round(ms * Math.min(1 + fails, 6) * (0.9 + Math.random() * 0.2));
  const schedule = () => { if (timer) clearTimeout(timer); if (!stopped) timer = setTimeout(tick, delay()); };

  async function run() {
    if (stopped || busy || !visible()) return;
    busy = true;
    try {
      const r = await fn();
      fails = r === false ? Math.min(fails + 1, 5) : 0;
    } catch { fails = Math.min(fails + 1, 5); }
    last = Date.now();
    busy = false;
  }
  async function tick() { await run(); schedule(); }
  function wake() { if (!stopped && visible() && Date.now() - last >= ms) { if (timer) clearTimeout(timer); void tick(); } }

  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  if (opts.immediate) void tick(); else { last = Date.now(); schedule(); }
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", wake);
    window.removeEventListener("focus", wake);
  };
}
