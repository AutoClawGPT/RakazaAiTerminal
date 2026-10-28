"use client";
import { useEffect, useState } from "react";
import { resetMe, useMe, type Me } from "@/components/community/me";
import { clearCreds } from "@/components/agents/credentials";

export interface Session { loading: boolean; me: Me | null; owner: boolean }

let ownerP: Promise<boolean> | null = null;
function ownerState(): Promise<boolean> {
  ownerP ??= fetch("/api/auth/session", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<{ owner?: boolean }>) : { owner: false })).then((j) => Boolean(j.owner)).catch(() => false);
  return ownerP;
}

/** The real session of this browser: an agent (cookie) and/or the owner (cookie). Drives every "Sign in" / "Sign out" shown in the chrome. */
export function useSession(): Session {
  const me = useMe();
  const [owner, setOwner] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void ownerState().then((o) => { if (live) setOwner(o); });
    return () => { live = false; };
  }, []);
  return { loading: me === undefined || owner === undefined, me: me ?? null, owner: owner === true };
}

/** Ends the browser session only. Nothing on the server (plays, scores, profile) is deleted. */
export async function signOutAll(): Promise<void> {
  await Promise.all([
    fetch("/api/public/agents/logout", { method: "POST" }).catch(() => null),
    fetch("/api/auth/logout", { method: "POST" }).catch(() => null),
  ]);
  clearCreds();
  resetMe();
  ownerP = null;
  window.location.assign("/");
}
