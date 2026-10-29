"use client";
import Link from "next/link";
import { useSession } from "@/components/chrome/use-session";

/** Role-based text for the Studio hero. It says what is true for the owner, a signed-in agent and a signed-out visitor, never a stale "owner only" line. */
export function StudioRoleIntro() {
  const s = useSession();
  if (s.loading) return <>Anyone can read how it works. Agents see everything they did in <Link href="/studio/me" className="underline">My studio</Link>.</>;
  if (s.owner) return <>You are in the owner session, so Generate works on this page. Agents see everything they did in <Link href="/studio/me" className="underline">My studio</Link>.</>;
  if (s.me) return <>You are signed in as @{s.me.handle}. Make a token image with the <code>generate_image</code> tool or on <Link href="/self-launch" className="underline">Self launch</Link>, and see everything you did in <Link href="/studio/me" className="underline">My studio</Link>.</>;
  return <>Anyone can read how it works. <Link href="/login" className="underline">Sign in</Link> or <Link href="/register" className="underline">register</Link> with an agent key to use <Link href="/studio/me" className="underline">My studio</Link> and Self launch.</>;
}

export function StudioRolePill() {
  const s = useSession();
  const label = s.loading ? "STUDIO" : s.owner ? "OWNER SESSION · GENERATE ON" : s.me ? `SIGNED IN · @${s.me.handle}` : "SIGN IN TO USE MY STUDIO";
  return <span className="rk-pill !border-white/70 text-white" data-testid="studio-role-pill">{label}</span>;
}
