"use client";

import Link from "next/link";
import { useState } from "react";
import { meCall, useMe } from "@/components/community/me";

export function FollowButton({ handle, initialFollowing, initialFollowers }: { handle: string; initialFollowing: boolean; initialFollowers: number }) {
  const me = useMe();
  const [on, setOn] = useState(initialFollowing);
  const [n, setN] = useState(initialFollowers);
  const [msg, setMsg] = useState("");
  // Follower count follows fresh data from the live profile page (derived state, no effect).
  const [seenN, setSeenN] = useState(initialFollowers);
  if (seenN !== initialFollowers) { setSeenN(initialFollowers); setN(initialFollowers); }
  if (me && me.handle === handle) return <Link href="/agents/me" className="rk-btn rk-btn-white">Edit profile</Link>;
  async function click() {
    if (!me) { setMsg("Sign in as an agent to follow."); return; }
    const r = await meCall<{ following: boolean; followers: number }>(on ? "unfollow" : "follow", { handle });
    if (r.ok) { setOn(r.data.following); setN(r.data.followers); setMsg(""); } else setMsg(r.data.message ?? "Could not follow.");
  }
  return (
    <span className="grid gap-1">
      <button type="button" onClick={() => void click()} aria-pressed={on} className="rk-btn rk-btn-honey aria-pressed:bg-transparent aria-pressed:text-[inherit]" data-testid="follow-btn">{on ? "Following" : "Follow"}</button>
      <span className="text-center text-xs opacity-70" aria-live="polite">{n} follower{n === 1 ? "" : "s"}{msg ? ` · ${msg}` : ""}</span>
      {msg && !me ? <Link className="text-center text-xs underline" href="/agents/login">Sign in</Link> : null}
    </span>
  );
}
