import Link from "next/link";
import { Send } from "lucide-react";
import { LogoPill } from "@/components/brand/logo";
import { NAV_GROUPS, PRIMARY_NAV, publicMenu } from "@/lib/routes";
import { publicEnv } from "@/lib/public-env";
import { MenuSheet, type MenuGroup, type MenuItem } from "./menu-sheet";
import { HeaderAccount } from "./account-state";
import { NavPills } from "./nav-pills";
import { NotificationBell } from "./notification-bell";
import { ThemeControls } from "./theme-controls";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const LAUNCH_NOTES: Record<string, string> = { "/launch": "agent launch · sponsored 70/30", "/self-launch": "Phantom · you keep 100%" };

export function menuGroups(): MenuGroup[] {
  const extra: Record<string, { href: string; label: string; note?: string }[]> = {
    // Added after the existing items so the old order stays; Agent launch is the public how-to for agents, Integrations sits under Roadmap.
    Launch: [{ href: "/docs/agent-launch", label: "Agent launch", note: "an agent launches by itself" }],
    "Her world": [{ href: "/settings/integrations", label: "Integrations", note: "under Roadmap" }],
  };
  return [
    { title: "Quick links", items: PRIMARY_NAV.map((n) => ({ href: n.href, label: n.label })) },
    ...publicMenu().map((g) => {
      const items: MenuItem[] = g.items.map((r) => ({ href: r.path, label: r.label, note: LAUNCH_NOTES[r.path] ?? (r.access === "O" ? "owner" : r.access === "U" ? "sign in" : undefined) }));
      const more = extra[g.title] ?? [];
      const at = g.title === "Her world" ? items.findIndex((i) => i.href === "/roadmap") : -1;
      if (more.length && at >= 0) items.splice(at + 1, 0, ...more);
      else items.push(...more);
      return { title: g.title, items };
    }),
  ];
}

export function SiteHeader() {
  const xUrl = publicEnv.xUrl;
  const tgUrl = publicEnv.telegramUrl;
  return (
    <header className="rk-header">
      <div className="rk-container flex h-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <LogoPill />
        </div>
        <NavPills items={PRIMARY_NAV} groups={NAV_GROUPS} />
        <div className="flex items-center gap-1.5 sm:gap-2">
          {xUrl ? (
            <a className="rk-icon-btn hidden nav:grid" href={xUrl} target="_blank" rel="noopener noreferrer" aria-label="Rakaza on X">
              <XIcon />
            </a>
          ) : null}
          {tgUrl ? (
            <a className="rk-icon-btn hidden nav:grid" href={tgUrl} target="_blank" rel="noopener noreferrer" aria-label="Rakaza on Telegram">
              <Send className="size-4" />
            </a>
          ) : null}
          <HeaderAccount />
          <NotificationBell />
          <ThemeControls />
          <Link href="/talk" className="rk-btn rk-btn-honey rk-btn-sm" aria-label="Try Rakaza">
            Try<span className="hidden min-[430px]:inline">&nbsp;Rakaza</span>
          </Link>
          <MenuSheet groups={menuGroups()} title="Menu" />
        </div>
      </div>
    </header>
  );
}
