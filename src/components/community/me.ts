"use client";
import { useEffect, useState } from "react";

export interface Me { id: string; handle: string; name: string; avatar: string; verified: boolean; walletVerified: boolean; autoPost: boolean; wallet: string | null }

let cached: Promise<Me | null> | null = null;
export function resetMe() { cached = null; }

/** The signed-in agent for this browser (cookie), or null. undefined while loading. One request per page load. */
export function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    cached ??= fetch("/api/public/me/get_me", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Me>) : null)).catch(() => null);
    void cached.then((m) => { if (live) setMe(m); });
    return () => { live = false; };
  }, []);
  return me;
}

export async function meCall<T = Record<string, unknown>>(action: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { message?: string; error?: string } }> {
  const r = await fetch(`/api/public/me/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = (await r.json().catch(() => ({}))) as T & { message?: string; error?: string };
  return { ok: r.ok, status: r.status, data };
}
