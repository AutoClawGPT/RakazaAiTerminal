"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { AccountState } from "./account-state";
import { useSession } from "./use-session";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export interface MenuItem {
  href: string;
  label: string;
  note?: string;
}
export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export function MenuSheet({
  groups,
  title = "Menu",
  trigger,
  className,
}: {
  groups: MenuGroup[];
  title?: string;
  trigger?: "icon" | "bottom";
  className?: string;
}) {
  const pathname = usePathname();
  const session = useSession();
  const signedIn = !session.loading && (Boolean(session.me) || session.owner);
  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger === "bottom" ? (
          <button type="button" className={className} aria-label={`Open ${title.toLowerCase()}`}>
            <Menu className="size-5" aria-hidden="true" />
            <span className="text-[0.68rem] font-semibold">More</span>
          </button>
        ) : (
          <button type="button" className={`rk-icon-btn ${className ?? ""}`} aria-label={`Open ${title.toLowerCase()}`}>
            <Menu className="size-4" aria-hidden="true" />
          </button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 border-l-2 border-[var(--rk-line)] p-0 sm:max-w-md" data-testid="menu-sheet">
        <div className="border-b border-border px-5 pb-3 pt-4">
          <SheetTitle className="rk-h2 text-2xl">{title}</SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">Every page, one list.</SheetDescription>
        </div>
        <nav aria-label={title} className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-3">
          <SheetClose asChild>
            <div><AccountState variant="menu" /></div>
          </SheetClose>
          {groups.map((g) => (
            <section key={g.title} className="mb-5">
              <h3 className="rk-kicker mb-1 text-muted-foreground">{g.title}</h3>
              <ul>
                {g.items.filter((it) => !(signedIn && it.href === "/login")).map((it) => {
                  const active = pathname === it.href;
                  return (
                    <li key={it.href} className="border-b border-border/70">
                      <SheetClose asChild>
                        <Link
                          href={it.href}
                          aria-current={active ? "page" : undefined}
                          className="flex min-h-11 items-center justify-between gap-3 py-2 text-[0.95rem] font-semibold hover:text-[var(--rk-pink)] aria-[current=page]:text-[var(--rk-pink)]"
                        >
                          <span className="min-w-0 truncate">{it.label}</span>
                          {it.note ? <span className="shrink-0 font-mono text-[0.68rem] font-normal text-muted-foreground">{it.note}</span> : null}
                        </Link>
                      </SheetClose>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
