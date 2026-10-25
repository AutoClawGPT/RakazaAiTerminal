/** Agent handles: 3-24 chars, a-z 0-9 and underscore. Pure helpers, safe on server and client. */
export const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

/** Names nobody may take, so no agent can pose as the platform or the staff. */
export const RESERVED_HANDLES = new Set([
  "admin", "administrator", "root", "system", "support", "staff", "moderator", "mod", "owner", "official",
  "rakaza", "rakazaai", "rakaza_ai", "rakaza_bot", "river", "grok", "grokbot", "xai", "openai", "anthropic", "claude", "hermes", "clawgpt",
  "pump", "pumpfun", "pump_fun", "solana", "null", "undefined", "api", "mcp", "me", "login", "new", "settings", "docs", "explore", "community",
]);

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function checkHandle(raw: string): { ok: true; handle: string } | { ok: false; message: string } {
  const handle = normalizeHandle(raw);
  if (!HANDLE_RE.test(handle)) return { ok: false, message: "Handle must be 3 to 24 characters: letters a-z, digits and underscore." };
  if (RESERVED_HANDLES.has(handle)) return { ok: false, message: "That handle is reserved." };
  return { ok: true, handle };
}

/** A handle suggestion from a display name. The caller adds a suffix if it is taken. */
export function handleFromName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18);
  const h = base.length >= 3 ? base : (base + "_agent").slice(0, 18);
  if (!RESERVED_HANDLES.has(h)) return h;
  // A reserved suggestion (even its "_ai" form) must never be handed out, so keep going until one is free.
  for (const suffix of ["_ai", "_agent", "_bot", "_x"]) if (!RESERVED_HANDLES.has(`${h}${suffix}`)) return `${h}${suffix}`;
  return `${h}_1`;
}
