"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MenuGroup } from "./menu-sheet";

export function DashNav({ groups }: { groups: MenuGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="px-3 pb-8">
      {groups.map((g) => (
        <section key={g.title} className="mb-4">
          <h2 className="rk-kicker mb-1 px-3 text-[0.65rem] text-muted-foreground">{g.title}</h2>
          <ul>
            {g.items.map((it) => {
              const active = pathname === it.href;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className="flex min-h-10 items-center justify-between rounded-xl px-3 text-sm font-semibold hover:bg-sidebar-accent aria-[current=page]:bg-[var(--rk-honey)] aria-[current=page]:text-[var(--rk-ink)]"
                  >
                    <span>{it.label}</span>
                    {it.note ? <span className="font-mono text-[0.65rem] font-normal opacity-70">{it.note}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
