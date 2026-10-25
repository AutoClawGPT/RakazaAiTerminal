import type { Metadata } from "next";
import { Coins, LayoutDashboard, Lock, Rocket, Wallet } from "lucide-react";
import { LogoPill } from "@/components/brand/logo";
import { BottomNav } from "@/components/chrome/bottom-nav";
import { DashNav } from "@/components/chrome/dash-nav";
import type { MenuGroup } from "@/components/chrome/menu-sheet";
import { MenuSheet } from "@/components/chrome/menu-sheet";
import { RakazaWidget } from "@/components/widget/rakaza-widget";
import { ThemeControls } from "@/components/chrome/theme-controls";
import { getEnv } from "@/lib/env";
import { isExecuteEnabled } from "@/lib/execute-gate";
import { dashMenu } from "@/lib/routes";

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default function DashLayout({ children }: LayoutProps<"/">) {
  const env = getEnv();
  const preview = env.NODE_ENV !== "production" && env.DEV_PREVIEW_OWNER_PAGES;
  const groups: MenuGroup[] = dashMenu().map((g) => ({
    title: g.title,
    items: g.items.map((r) => ({ href: r.path, label: r.label, note: r.phase > 1 ? `P${r.phase}` : undefined })),
  }));
  const allGroups: MenuGroup[] = [{ title: "Site", items: [{ href: "/", label: "Public site" }] }, ...groups];
  const execOn = isExecuteEnabled();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-[var(--rk-honey)] focus:px-4 focus:py-2 focus:text-[var(--rk-ink)]">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r-2 border-[var(--rk-line)] bg-sidebar text-sidebar-foreground lg:flex" aria-label="Sidebar">
        <div className="flex items-center gap-2 p-4">
          <LogoPill href="/dash" />
        </div>
        <DashNav groups={allGroups} />
      </aside>
      <div className="min-w-0">
        <header className="rk-header" style={{ position: "sticky" }}>
          <div className="flex h-full items-center justify-between gap-2 px-[var(--rk-gutter)]">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <LogoPill href="/dash" />
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <Lock className="size-4" aria-hidden="true" />
              <span className="font-display text-sm font-black" style={{ fontVariationSettings: '"wdth" 125' }}>
                Owner dashboard
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="rk-pill hidden !min-h-8 font-mono text-[0.7rem] sm:inline-flex" data-testid="chip-network">
                {env.NEXT_PUBLIC_SOLANA_NETWORK}
              </span>
              <span
                className={`rk-pill !min-h-8 font-mono text-[0.7rem] ${execOn ? "!border-[var(--rk-pink)] text-[var(--rk-pink)]" : ""}`}
                data-testid="chip-execute"
                title="EXECUTE_ENABLED gate"
              >
                {execOn ? "execute: ON" : "execute: blocked"}
              </span>
              <ThemeControls />
              <span className="lg:hidden">
                <MenuSheet groups={allGroups} title="Dashboard menu" />
              </span>
            </div>
          </div>
        </header>
        {preview ? (
          <div role="status" className="border-b-2 border-[var(--rk-ink)] bg-[var(--rk-honey)] px-[var(--rk-gutter)] py-2 text-xs font-semibold text-[var(--rk-ink)]" data-testid="preview-banner">
            Dev preview: owner login arrives in Phase 5. This page is visible only because DEV_PREVIEW_OWNER_PAGES is on locally. In production it redirects to /login.
          </div>
        ) : null}
        <main id="main" className="rk-page-pad-lg">{children}</main>
      </div>
      <RakazaWidget />
      <BottomNav
        visibleFrom="lg"
        menuTitle="Dashboard menu"
        groups={allGroups}
        items={[
          { href: "/dash", label: "Dash", icon: <LayoutDashboard className="size-5" /> },
          { href: "/launch", label: "Launch", icon: <Rocket className="size-5" /> },
          { href: "/vault", label: "Vault", icon: <Wallet className="size-5" /> },
          { href: "/trade", label: "Trade", icon: <Coins className="size-5" /> },
        ]}
      />
    </div>
  );
}
