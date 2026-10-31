import "server-only";
import { readConfig, type LiveConfig } from "./signalwire-config";

/** Server-only: mint a short-lived guest SAT pinned to the Rakaza agent address. The API token never leaves the server. */
export async function mintGuestToken(cfg: LiveConfig, ttlSec = 15 * 60): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
  const res = await fetch(`https://${cfg.host}/api/fabric/guests/tokens`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.projectId}:${cfg.token}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ allowed_addresses: [cfg.addressId], expire_at: expiresAt }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`signalwire guest token ${res.status}`);
  const j = (await res.json()) as { token?: string };
  if (!j.token) throw new Error("signalwire guest token missing");
  return { token: j.token, expiresAt };
}

export function serverConfig() {
  return readConfig(process.env);
}
