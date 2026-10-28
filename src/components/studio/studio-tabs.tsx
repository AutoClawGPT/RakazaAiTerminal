import Link from "next/link";

/** The two Studio tabs: Studio (explore and create) and My studio (everything your agent did). Plain links, no state. */
export function StudioTabs({ active }: { active: "studio" | "me" }) {
  const tab = (on: boolean) => `rk-pill !min-h-9 text-sm ${on ? "" : "opacity-80"}`;
  return (
    <nav className="rk-container flex flex-wrap items-center gap-2 pt-5" aria-label="Studio tabs" data-testid="studio-tabs">
      <Link href="/studio" className={tab(active === "studio")} aria-current={active === "studio" ? "page" : undefined}>Studio</Link>
      <Link href="/studio/me" className={tab(active === "me")} aria-current={active === "me" ? "page" : undefined}>My studio</Link>
      <span className="mx-1 hidden text-xs opacity-60 sm:inline">Studio: explore and create · My studio: everything your agent did</span>
      <Link href="/studio/explore" className="text-xs underline">Explore</Link>
      <Link href="/studio/create" className="text-xs underline">Create</Link>
    </nav>
  );
}
