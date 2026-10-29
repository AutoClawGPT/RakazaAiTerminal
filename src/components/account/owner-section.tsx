"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useSession } from "@/components/chrome/use-session";

/**
 * The owner sign-in box. A signed-in agent (not the owner) does not need it, so it is folded away for them; the owner can still open it.
 * With `foldForVisitors` a signed-out visitor who came for an agent page (Launch, Games) also gets it folded, so a normal user never meets a password box.
 * The sign-in logic itself is unchanged: the same form is inside, one click (or the #owner link) opens it.
 */
export function OwnerSection({ children, foldForVisitors = false }: { children: ReactNode; foldForVisitors?: boolean }) {
  const s = useSession();
  const ref = useRef<HTMLDetailsElement>(null);
  const folded = (!s.loading && s.me && !s.owner) || (foldForVisitors && !s.owner);
  useEffect(() => {
    const open = () => { if (ref.current && location.hash === "#owner") ref.current.open = true; };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [folded]);
  if (folded) {
    return (
      <details ref={ref} className="rk-card text-sm" id="owner" data-testid="owner-signin-folded">
        <summary className="cursor-pointer font-semibold">Owner of the control room? Owner sign in</summary>
        <div className="mt-3 grid gap-3">{children}</div>
        {s.me ? <p className="mt-3 text-xs opacity-80">You are signed in as @{s.me.handle}. You do not need this to use Launch, Games or the community.</p> : null}
      </details>
    );
  }
  return <>{children}</>;
}
