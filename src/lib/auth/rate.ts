const mem = new Map<string, number[]>();
/** Simple per-key sliding window (per server instance). Upstash-backed limits are used on public chat. */
export function allow(id: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (mem.get(id) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { mem.set(id, hits); return false; }
  hits.push(now);
  mem.set(id, hits);
  if (mem.size > 5000) for (const [k, v] of mem) if (!v.some((t) => now - t < windowMs)) mem.delete(k);
  return true;
}
