"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

/** The chat panel (and with it the 3D avatar, three.js and the VRM) is only fetched the first time the bubble is opened. */
const Panel = dynamic(() => import("./widget-panel").then((m) => m.WidgetPanel), {
  ssr: false,
  loading: () => (
    <div className="rk-widget-panel" aria-busy="true">
      <p className="m-auto animate-pulse text-sm">Waking Rakaza up…</p>
    </div>
  ),
});

/** Floating bubble, bottom-right. Mounted once in the public-site and dashboard layouts (not on /talk, which is the full version). */
export function RakazaWidget() {
  const [open, setOpen] = useState(false);
  // On a touch phone the bubble would sit on top of the game's Jump button, so it steps aside on the game page (Talk and the menu are still one tap away).
  const onGame = (usePathname() ?? "").startsWith("/games/ride-em");
  const [everOpened, setEverOpened] = useState(false);
  const toggle = useCallback(() => {
    setOpen((o) => !o);
    setEverOpened(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  return (
    <div className="rk-widget" data-testid="rakaza-widget" data-open={open} data-on-game={onGame}>
      {everOpened ? <Panel open={open} onMinimize={() => setOpen(false)} /> : null}
      <button type="button" className="rk-widget-bubble" onClick={toggle} aria-expanded={open} aria-label={open ? "Minimize the Rakaza chat" : "Chat with Rakaza"} data-testid="widget-bubble">
        {open ? <span aria-hidden="true" className="text-xl leading-none">×</span> : <MessageCircle className="size-6" aria-hidden="true" />}
        <span className="rk-widget-label">{open ? "Hide" : "Ask Rakaza"}</span>
      </button>
    </div>
  );
}
