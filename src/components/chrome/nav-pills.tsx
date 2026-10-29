"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { NavGroup } from "@/lib/routes";

const PILL = "inline-flex min-h-8 items-center rounded-full px-1.5 text-[0.72rem] font-medium whitespace-nowrap hover:bg-muted aria-[current=page]:bg-[var(--rk-honey)] aria-[current=page]:text-[var(--rk-ink)]";

/** A pill that opens a small list (Launch, Roadmap). Click, Enter or Space toggles; Escape and an outside click close it. */
function GroupPill({ group, pathname }: { group: NavGroup; pathname: string }) {
  // Open for one pathname only, so a page change closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));
  const ref = useRef<HTMLLIElement>(null);
  const active = group.items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <li ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-current={active ? "page" : undefined} data-testid={`nav-group-${group.label.toLowerCase()}`} onClick={() => setOpen((o) => !o)} className={`${PILL} gap-0.5`}>
        {group.label}<ChevronDown className="size-3" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 min-w-56 pt-1">
          <ul role="menu" className="rounded-2xl border-[1.5px] border-[var(--rk-line)] bg-[var(--card)] p-1.5 shadow-lg">
            {group.items.map((i) => (
              <li key={i.href} role="none">
                <Link role="menuitem" href={i.href} className="flex flex-col rounded-xl px-3 py-2 text-[0.8rem] font-semibold hover:bg-muted" onClick={() => setOpen(false)}>
                  {i.label}
                  {i.note ? <span className="text-[0.68rem] font-normal text-muted-foreground">{i.note}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function NavPills({ items, groups = [] }: { items: { href: string; label: string; short?: string }[]; groups?: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden min-w-0 nav:block">
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
                className={PILL}
              >
                {it.short ?? it.label}
              </Link>
            </li>
          );
        })}
        {groups.map((g) => <GroupPill key={g.label} group={g} pathname={pathname} />)}
      </ul>
    </nav>
  );
}
