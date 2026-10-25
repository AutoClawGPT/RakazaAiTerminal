import { Gamepad2, Home, MessageCircle, Palette } from "lucide-react";
import { BottomNav } from "@/components/chrome/bottom-nav";
import { SiteFooter } from "@/components/chrome/site-footer";
import { RakazaWidget } from "@/components/widget/rakaza-widget";
import { SiteHeader, menuGroups } from "@/components/chrome/site-header";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-[var(--rk-honey)] focus:px-4 focus:py-2 focus:text-[var(--rk-ink)]">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="rk-page-pad">
        {children}
        <SiteFooter />
      </main>
      <RakazaWidget />
      <BottomNav
        menuTitle="Menu"
        groups={menuGroups()}
        items={[
          { href: "/", label: "Home", icon: <Home className="size-5" /> },
          { href: "/talk", label: "Talk", icon: <MessageCircle className="size-5" /> },
          { href: "/games", label: "Games", icon: <Gamepad2 className="size-5" /> },
          { href: "/studio", label: "Studio", icon: <Palette className="size-5" /> },
        ]}
      />
    </>
  );
}
