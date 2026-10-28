"use client";
import type { ReactNode } from "react";
import { useSession } from "@/components/chrome/use-session";

/** The owner sign-in box. A signed-in agent (not the owner) does not need it, so it is folded away for them; the owner can still open it. */
export function OwnerSection({ children }: { children: ReactNode }) {
  const s = useSession();
  if (!s.loading && s.me && !s.owner) {
    return (
      <details className="rk-card text-sm" id="owner" data-testid="owner-signin-folded">
        <summary className="cursor-pointer font-semibold">Owner of the control room? Owner sign in</summary>
        <div className="mt-3 grid gap-3">{children}</div>
        <p className="mt-3 text-xs opacity-80">You are signed in as @{s.me.handle}. You do not need this to use Launch, Games or the community.</p>
      </details>
    );
  }
  return <>{children}</>;
}
