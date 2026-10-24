"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sparkles, Sun } from "lucide-react";

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-skin"] });
  return () => mo.disconnect();
}
function useHtmlAttr(name: string, server: string) {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.getAttribute(name) ?? server,
    () => server,
  );
}

export function ThemeControls() {
  const theme = useHtmlAttr("data-theme", "dark");
  const skin = useHtmlAttr("data-skin", "classic");

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    const d = document.documentElement;
    d.setAttribute("data-theme", next);
    d.classList.toggle("dark", next === "dark");
    d.style.colorScheme = next;
    try {
      localStorage.setItem("rk-theme", next);
    } catch {}
  }
  function toggleSkin() {
    const next = skin === "pop" ? "classic" : "pop";
    document.documentElement.setAttribute("data-skin", next);
    try {
      localStorage.setItem("rk-skin", next);
    } catch {}
  }

  return (
    <>
      <button type="button" className="rk-icon-btn" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Light / dark">
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <button type="button" className="rk-icon-btn" data-on={skin === "pop"} onClick={toggleSkin} aria-label="Pop mode" aria-pressed={skin === "pop"} title="Pop mode">
        <Sparkles className="size-4" />
      </button>
    </>
  );
}
