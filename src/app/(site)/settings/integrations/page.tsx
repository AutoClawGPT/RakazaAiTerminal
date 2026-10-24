import type { Metadata } from "next";
import { PollinationsCard } from "@/components/pages/pollinations-card";
import { keyHealth } from "@/lib/env";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

const LINKS: Record<string, string> = {
  HELIUS_MAINNET: "https://dashboard.helius.dev",
  HELIUS_DEVNET: "https://dashboard.helius.dev",
  JUPITER_API_KEY: "https://portal.jup.ag",
  SOLANATRACKER_API_KEY: "https://www.solanatracker.io/data-api",
  PINATA_API_KEY: "https://app.pinata.cloud/developers/api-keys",
  PINATA_API_SECRET: "https://app.pinata.cloud/developers/api-keys",
  UPSTASH_REDIS_REST_URL: "https://console.upstash.com",
  UPSTASH_REDIS_REST_TOKEN: "https://console.upstash.com",
  UPSTASH_READONLY_TOKEN: "https://console.upstash.com",
  RIVER_AGENT: "https://river.ai",
  RIVER_RAKAZO: "https://river.ai",
  DEEPGRAM_API_KEY: "https://console.deepgram.com",
  BRAVE_SEARCH_API_KEY: "https://brave.com/search/api/",
  FIRECRAWL_API_KEY: "https://www.firecrawl.dev/app/api-keys",
  POLLINATIONS_API_KEY: "https://enter.pollinations.ai",
  UPCLOUD_API_TOKEN: "https://hub.upcloud.com",
  PIMLICO_API_KEY: "https://dashboard.pimlico.io",
};

export default async function Page() {
  const health = keyHealth();
  const rows = Object.entries(health);
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-12 md:py-16">
          <p className="rk-kicker mb-4 text-white/85">SETTINGS · OWNER ONLY</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]">Integrations</h1>
          <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">Owner status. Keys are never shown.</p>
        </div>
      </section>
      <section className="rk-container grid gap-6 py-10 md:grid-cols-2 md:py-14">
        <PollinationsCard />
        <div className="rk-card rk-card-hard" data-testid="key-health">
          <h2 className="rk-h2 text-2xl">Key status</h2>
          <p className="mt-2 text-sm text-muted-foreground">Only set or missing is shown. Values never leave the server.</p>
          <ul className="mt-3 divide-y divide-black/10">
            {rows.map(([name, st]) => (
              <li key={name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-mono text-[0.78rem]">{name}</span>
                <span className="flex items-center gap-2">
                  {st === "missing" && LINKS[name] ? (
                    <a className="text-xs underline" href={LINKS[name]} target="_blank" rel="noreferrer">get key</a>
                  ) : null}
                  <span className={`rk-pill ${st === "ok" ? "" : "!border-red-600 text-red-700"}`}>{st === "ok" ? "set" : "missing"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
