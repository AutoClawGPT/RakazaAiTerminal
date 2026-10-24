import Link from "next/link";
import { LogoPill } from "@/components/brand/logo";

const FOOT = [
  { href: "/roadmap", label: "Roadmap" },
  { href: "/stake", label: "Stake" },
  { href: "/giveaway", label: "Giveaway" },
  { href: "/docs", label: "Docs" },
  { href: "/docs/api", label: "API" },
  { href: "/docs/mcp", label: "MCP" },
  { href: "/skill.md", label: "skill.md" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t-2 border-[var(--rk-line)] bg-card text-card-foreground">
      <div className="rk-container py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <LogoPill />
          <ul className="flex flex-wrap gap-2" aria-label="Footer">
            {FOOT.map((f) => (
              <li key={f.href}>
                {f.href.endsWith(".md") ? (
                  <a className="rk-pill" href={f.href}>
                    {f.label}
                  </a>
                ) : (
                  <Link className="rk-pill" href={f.href}>
                    {f.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground" role="note">
          Rakaza is an experimental AI character and a community memecoin. It is not financial advice and not an offer of securities.
          Coins can go to zero. Risk checks are a hint, not a guarantee. We never ask for your seed phrase or private key, and nobody
          from the team will DM you first. You must be 18 or older to chat.
        </p>
        <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">© {new Date().getFullYear()} Rakaza. Built on Solana.</p>
      </div>
    </footer>
  );
}
