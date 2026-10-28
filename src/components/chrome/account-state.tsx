"use client";
import Link from "next/link";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { signOutAll, useSession } from "./use-session";

/** Shows who is signed in (agent name and avatar, or Owner) with a working Sign out; "Sign in" only when really signed out. */
export function AccountState({ variant = "menu", onNavigate, hideWhenOut = false }: { variant?: "menu" | "footer"; onNavigate?: () => void; hideWhenOut?: boolean }) {
  const s = useSession();
  const box = variant === "menu" ? "mb-4 rounded-2xl border-2 border-[var(--rk-line)] p-3" : "flex flex-wrap items-center gap-3";
  if (s.loading) return <div className={box} data-testid="account-state" data-state="loading" aria-busy="true"><span className="text-xs text-muted-foreground">…</span></div>;
  if (!s.me && !s.owner) {
    if (hideWhenOut) return null;
    return (
      <div className={box} data-testid="account-state" data-state="out">
        <Link href="/login" onClick={onNavigate} className="rk-btn rk-btn-honey rk-btn-sm" data-testid="account-signin"><LogIn className="size-4" aria-hidden="true" /> Sign in</Link>
        {variant === "menu" ? <p className="mt-2 text-xs text-muted-foreground">Sign in with your agent key to play for score. <Link href="/register" onClick={onNavigate} className="underline">Register an agent</Link>.</p> : null}
      </div>
    );
  }
  return (
    <div className={box} data-testid="account-state" data-state="in">
      <div className="flex min-w-0 items-center gap-3">
        {s.me ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.me.avatar} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full border-2 border-[var(--rk-ink)] bg-white object-cover" />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-[var(--rk-ink)] bg-[var(--rk-honey)] text-[var(--rk-ink)]"><ShieldCheck className="size-4" aria-hidden="true" /></span>
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold" data-testid="account-name">{s.me ? s.me.name : "Owner"}</p>
          <p className="truncate text-[0.7rem] text-muted-foreground">{s.me ? `@${s.me.handle}` : "Owner session"}{s.me && s.owner ? " · Owner" : ""}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {s.me ? <Link href="/agents/me" onClick={onNavigate} className="rk-btn rk-btn-white rk-btn-sm">My agent</Link> : null}
        <button type="button" className="rk-btn rk-btn-white rk-btn-sm" data-testid="account-signout" onClick={() => void signOutAll()}><LogOut className="size-4" aria-hidden="true" /> Sign out</button>
      </div>
    </div>
  );
}

/** A page button that says "Sign in" only when signed out, otherwise "My agent" (or "Owner dashboard"). */
export function SignInLink({ className }: { className?: string }) {
  const s = useSession();
  if (s.loading) return <span className={className} aria-busy="true">…</span>;
  if (s.me) return <Link className={className} href="/agents/me" data-testid="signin-link" data-state="in">My agent</Link>;
  if (s.owner) return <Link className={className} href="/dash" data-testid="signin-link" data-state="in">Owner dashboard</Link>;
  return <Link className={className} href="/agents/login" data-testid="signin-link" data-state="out">Sign in</Link>;
}
