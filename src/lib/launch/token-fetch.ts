import "server-only";
import { getEnv } from "@/lib/env";
import { isSolanaAddress } from "@/lib/tools/address";

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  links: { website?: string; twitter?: string; telegram?: string };
  priceUsd?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  ageHours?: number;
  dex?: string;
  isPump: boolean;
  sources: string[];
  warnings: string[];
}

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const fixUri = (u: string) => (u.startsWith("ipfs://") ? IPFS_GATEWAY + u.slice(7) : u);
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
const safeHttp = (u: unknown) => {
  if (typeof u !== "string") return undefined;
  try {
    const x = new URL(fixUri(u));
    return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : undefined;
  } catch {
    return undefined;
  }
};

async function getJson<T>(url: string, init: RequestInit = {}, ms = 12_000): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms), cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

interface DexPair {
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  pairCreatedAt?: number;
  dexId?: string;
  info?: { imageUrl?: string; websites?: { url?: string }[]; socials?: { type?: string; url?: string }[] };
}

/** Collects what we can about one Solana token from DexScreener, Helius (on-chain metadata) and the token's own metadata file. */
export async function fetchToken(mintRaw: string): Promise<{ ok: true; token: TokenInfo } | { ok: false; error: string }> {
  const mint = mintRaw.trim();
  if (!isSolanaAddress(mint)) return { ok: false, error: "That is not a valid Solana address." };
  const env = getEnv();
  const t: TokenInfo = { mint, name: "", symbol: "", description: "", image: "", links: {}, isPump: mint.endsWith("pump"), sources: [], warnings: [] };

  const [dex, das] = await Promise.all([
    getJson<{ pairs?: DexPair[] }>(`https://api.dexscreener.com/latest/dex/tokens/${mint}`),
    env.HELIUS_MAINNET
      ? getJson<{ result?: { content?: { json_uri?: string; metadata?: { name?: string; symbol?: string; description?: string }; links?: { image?: string } } } }>(env.HELIUS_MAINNET, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "rk", method: "getAsset", params: { id: mint } }),
        })
      : Promise.resolve(null),
  ]);

  const pair = (dex?.pairs ?? []).filter((p) => p.baseToken?.address === mint).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  if (pair) {
    t.sources.push("DexScreener");
    t.name = clean(pair.baseToken?.name, 64);
    t.symbol = clean(pair.baseToken?.symbol, 16);
    t.priceUsd = pair.priceUsd ? Number(pair.priceUsd) : undefined;
    t.marketCapUsd = pair.marketCap ?? pair.fdv;
    t.liquidityUsd = pair.liquidity?.usd;
    t.volume24hUsd = pair.volume?.h24;
    t.dex = pair.dexId;
    if (pair.pairCreatedAt) t.ageHours = Math.max(0, (Date.now() - pair.pairCreatedAt) / 3_600_000);
    t.image = safeHttp(pair.info?.imageUrl) ?? "";
    t.links.website = safeHttp(pair.info?.websites?.[0]?.url);
    for (const s of pair.info?.socials ?? []) {
      if (s.type === "twitter") t.links.twitter = safeHttp(s.url);
      if (s.type === "telegram") t.links.telegram = safeHttp(s.url);
    }
  } else {
    t.warnings.push("No trading pair found on DexScreener yet.");
  }

  const content = das?.result?.content;
  if (content) {
    t.sources.push("Helius on-chain");
    t.name ||= clean(content.metadata?.name, 64);
    t.symbol ||= clean(content.metadata?.symbol, 16);
    t.description = clean(content.metadata?.description, 600);
    t.image ||= safeHttp(content.links?.image) ?? "";
    const uri = safeHttp(content.json_uri);
    if (uri) {
      const meta = await getJson<{ description?: string; image?: string; website?: string; twitter?: string; telegram?: string }>(uri, {}, 8_000);
      if (meta) {
        t.sources.push("Token metadata file");
        t.description ||= clean(meta.description, 600);
        t.image ||= safeHttp(meta.image) ?? "";
        t.links.website ||= safeHttp(meta.website);
        t.links.twitter ||= safeHttp(meta.twitter);
        t.links.telegram ||= safeHttp(meta.telegram);
      }
    }
  } else if (env.HELIUS_MAINNET) {
    t.warnings.push("Could not read on-chain metadata from Helius.");
  } else {
    t.warnings.push("HELIUS_MAINNET is not set, so on-chain metadata was skipped.");
  }

  if (!t.name && !t.symbol) return { ok: false, error: "I could not find that token on DexScreener or on-chain." };
  return { ok: true, token: t };
}
