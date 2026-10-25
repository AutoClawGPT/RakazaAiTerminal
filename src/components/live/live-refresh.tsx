"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { startLive } from "@/lib/live/start-live";

const typing = () => {
  const e = document.activeElement as HTMLElement | null;
  return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable);
};

/**
 * Keeps a server-rendered page fresh without a reload. Every `ms` (only while the tab is visible) it asks Next to re-render the
 * server parts of THIS page; client state (open menus, scroll, text being typed) is kept. It waits while the user is typing in a field.
 * Shows a small "Live" pill so people can see the page updates on its own.
 */
export function LiveRefresh({ ms = 20000, className = "" }: { ms?: number; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<number | null>(null);
  const busy = useRef(false);
  useEffect(() => { busy.current = pending; }, [pending]);
  useEffect(() => {
    return startLive(async () => {
      if (busy.current || typing()) return;
      start(() => { router.refresh(); });
      setAt(Date.now());
    }, ms);
  }, [router, ms]);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--rk-line)] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${className}`} data-testid="live-badge" data-updated={at ?? ""} title={`Updates by itself every ${Math.round(ms / 1000)} seconds`}>
      <span className={`size-2 rounded-full bg-[var(--rk-mint)] ${pending ? "animate-pulse" : ""}`} aria-hidden="true" />
      Live
    </span>
  );
}
