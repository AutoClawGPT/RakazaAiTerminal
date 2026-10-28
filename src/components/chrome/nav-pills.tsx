"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavPills({ items }: { items: { href: string; label: string; short?: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden nav:block">
      <ul className="flex items-center gap-0.5 rounded-full border-[1.5px] border-[var(--rk-line)] p-[3px]">
        {items.map((it) => {
          const active = !it.href.includes("#") && (pathname === it.href || pathname.startsWith(it.href + "/"));
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                title={it.short ? it.label : undefined}
                aria-label={it.short ? it.label : undefined}
                aria-current={active ? "page" : undefined}
                className="inline-flex min-h-8 items-center rounded-full px-2 text-[0.74rem] font-medium whitespace-nowrap hover:bg-muted aria-[current=page]:bg-[var(--rk-honey)] aria-[current=page]:text-[var(--rk-ink)]"
              >
                {it.short ?? it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
