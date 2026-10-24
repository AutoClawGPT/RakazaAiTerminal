"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MenuSheet, type MenuGroup } from "./menu-sheet";

export interface BottomItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export function BottomNav({ items, groups, menuTitle, visibleFrom = "md" }: { items: BottomItem[]; groups: MenuGroup[]; menuTitle: string; visibleFrom?: "md" | "lg" }) {
  const pathname = usePathname();
  const hide = visibleFrom === "lg" ? "lg:hidden" : "md:hidden";
  const cell = "flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[var(--card-foreground)]";
  return (
    <nav className={`rk-bottom-nav ${hide}`} aria-label="Primary">
      <ul className="mx-auto grid h-full max-w-xl grid-cols-5">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <li key={it.href} className="min-w-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`${cell} ${active ? "font-bold text-[var(--rk-pink)]" : "opacity-85"}`}
              >
                <span aria-hidden="true">{it.icon}</span>
                <span className="max-w-full truncate text-[0.68rem] font-semibold">{it.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <MenuSheet groups={groups} title={menuTitle} trigger="bottom" className={`${cell} w-full`} />
        </li>
      </ul>
    </nav>
  );
}
