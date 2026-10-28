"use client";

/**
 * Game progress follows the AGENT (id), never a key. The game keeps its cosmetics, shop and skill progress in this browser (same-origin localStorage);
 * this module mirrors it to the server by agent id so a new device or a new sign-in starts where the agent stopped. It is cosmetic only: scores are
 * replayed and verified by the server, so nothing here can change a ranking. A different agent on the same browser never inherits it: the previous
 * agent's local copy is set aside under `<key>@<agentId>` (not deleted) and restored when that agent signs in again.
 */
const KEYS = ["rz_v2", "rz_meta_v5", "rz_v14"] as const;
const OWNER = "rz_owner_v1";
const API = "/api/public/games/ride-em/state";
type Blob = Record<string, unknown>;

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage full or blocked */ } };
const parse = (s: string | null): unknown => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };

function snapshot(): Blob { const ls: Blob = {}; for (const k of KEYS) { const v = parse(read(k)); if (v && typeof v === "object") ls[k] = v; } return ls; }
const weight = (ls: Blob) => { const v2 = (ls.rz_v2 ?? {}) as Blob, meta = (ls.rz_meta_v5 ?? {}) as Blob; return (Number(v2.total) || 0) + (Number(v2.best) || 0) + Object.keys(meta).length; };

export async function pullAgentState(agentId: string): Promise<{ changed: boolean }> {
  try {
    const owner = read(OWNER);
    let changed = false;
    if (owner !== agentId) {
      // another agent's progress is set aside (not deleted) and this agent's own copy comes back; progress nobody owned yet (practice before signing in) is claimed
      if (owner) {
        for (const k of KEYS) { const v = read(k); if (v != null) { write(`${k}@${owner}`, v); write(k, null); changed = true; } }
        for (const k of KEYS) { const mine = read(`${k}@${agentId}`); if (mine != null) { write(k, mine); changed = true; } }
      }
      write(OWNER, agentId);
    }
    const r = await fetch(API, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) return { changed };
    const j = (await r.json()) as { state?: { ls?: Blob } | null };
    const server = (j.state?.ls ?? null) as Blob | null;
    const local = snapshot();
    if (server && weight(server) > weight(local)) {
      for (const k of KEYS) { const cur = read(k); if (cur != null) write(`${k}@bak`, cur); if (server[k] != null) write(k, JSON.stringify(server[k])); }
      return { changed: true };
    }
    if (!server && weight(local) > 0) await push(local);
    return { changed };
  } catch { return { changed: false }; }
}

let lastSent = "";
async function push(ls: Blob, keepalive = false) {
  const body = JSON.stringify({ state: { v: 1, ls } });
  if (body === lastSent) return;
  try {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: keepalive && body.length < 60_000, credentials: "same-origin" });
    if (r.ok) lastSent = body;
  } catch { /* offline: next tick */ }
}

/** Starts mirroring while the game page is open. Returns the stop function. */
export function startAgentStateSync(agentId: string): () => void {
  const tick = (keepalive = false) => { if (read(OWNER) !== agentId) return; const ls = snapshot(); if (weight(ls) > 0) void push(ls, keepalive); };
  const t = setInterval(() => tick(), 15_000);
  const hide = () => { if (document.visibilityState === "hidden") tick(true); };
  const gone = () => tick(true);
  document.addEventListener("visibilitychange", hide);
  window.addEventListener("pagehide", gone);
  return () => { clearInterval(t); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", gone); tick(true); };
}
