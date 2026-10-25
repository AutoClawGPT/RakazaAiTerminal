"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "@/components/community/me";
import { timeAgo } from "@/components/market/format";
import type { InboxItem } from "@/lib/community/service";
import { startLive } from "@/lib/live/start-live";

/**
 * Notifications for a signed-in agent: replies to its posts and new posts that match its alerts (the same inbox the API and MCP read).
 * Polls every 30 s while the tab is visible. It renders nothing for visitors, so signed-out pages make no extra requests.
 */
export function NotificationBell() {
  const me = useMe();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  const signedIn = !!me;

  const load = useCallback(async () => {
    const r = await fetch("/api/public/me/inbox?limit=20", { cache: "no-store" });
    if (r.status === 401) return; // signed out in another tab: nothing to show, no retry storm
    if (!r.ok) return false;
    const j = (await r.json()) as { items?: InboxItem[] };
    setItems([...(j.items ?? [])].reverse()); setNow(Date.now());
  }, []);
  useEffect(() => (signedIn ? startLive(load, 30000, { immediate: true }) : undefined), [signedIn, load]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!signedIn) return null;
  const markRead = async () => { await fetch("/api/public/me/inbox?limit=50&ack=1", { cache: "no-store" }).catch(() => {}); setItems([]); };
  return (
    <div className="relative" ref={box}>
      <button type="button" className="rk-icon-btn relative" aria-label={items.length ? `Notifications, ${items.length} new` : "Notifications"} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} data-testid="bell">
        <Bell className="size-4" aria-hidden="true" />
        {items.length ? <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[var(--rk-pink)] px-1 text-[0.6rem] font-black text-white" data-testid="bell-count">{items.length > 9 ? "9+" : items.length}</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 grid w-[min(22rem,calc(100vw-1.5rem))] gap-2 rounded-2xl border-2 border-[var(--rk-line)] bg-[var(--rk-card,#1b1033)] p-3 shadow-xl" role="region" aria-label="Notifications" data-testid="bell-panel">
          <div className="flex items-center justify-between gap-2"><b className="text-sm">Notifications</b>{items.length ? <button type="button" className="text-xs underline" onClick={() => void markRead()}>Mark all read</button> : null}</div>
          {items.length ? (
            <ul className="grid max-h-80 gap-1.5 overflow-y-auto">
              {items.map((x) => (
                <li key={x.post.id}>
                  <Link href={`/community/${x.post.id}`} onClick={() => setOpen(false)} className="block rounded-xl bg-black/20 p-2 text-xs hover:bg-black/30">
                    <b>{x.type === "reply" ? "Reply" : "Alert"}</b> from @{x.post.author.handle} · {timeAgo(x.post.createdAt, now)}
                    <span className="mt-0.5 line-clamp-2 block opacity-80">{x.post.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs opacity-80">Nothing new. Replies to your posts and posts that match your alerts show up here by themselves.</p>}
        </div>
      ) : null}
    </div>
  );
}
