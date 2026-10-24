import "server-only";
import { z } from "zod";
import bs58 from "bs58";

/**
 * Typed, validated server environment. Names mirror ENV-VARS.md 1:1.
 * - Parsed lazily (first call) so `next build` without env still compiles.
 * - Error messages list variable NAMES only, never values.
 * - Only NEXT_PUBLIC_* values are ever sent to the browser (see public-env.ts).
 */

const optStr = z.string().trim().min(1).optional();
const secret32 = z.string().min(32, "must be at least 32 characters");

const base58Pubkey = z
  .string()
  .trim()
  .refine((v) => {
    try {
      return bs58.decode(v).length === 32;
    } catch {
      return false;
    }
  }, "must be a base58 Solana public key (32 bytes)");

const boolFlag = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const numStr = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().finite().nonnegative());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Generated locally, required in every environment.
  SESSION_SECRET: secret32,
  CRON_SECRET: secret32,
  LIVE_SECRET: secret32,
  TREASURY_ENCRYPTION_KEY: z.string().min(32).optional(),

  // Auth (Phase 5). Optional in Phase 1, required by /login later.
  DASHBOARD_PASSWORD: optStr,
  API_SERVER_KEY: z.string().min(16).optional(),

  // Network and addresses
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3200"),
  NEXT_PUBLIC_SOLANA_NETWORK: z.enum(["devnet", "mainnet-beta"]).default("devnet"),
  TREASURY_PUBKEY: base58Pubkey.optional(),
  NEXT_PUBLIC_TOKEN_MINT: base58Pubkey.optional(),

  // Safety gates. EXECUTE_ENABLED must be literally "true" to ever allow a signature.
  EXECUTE_ENABLED: boolFlag,
  SPONSORED_ENABLED: boolFlag,
  MAX_LAUNCH_SOL: numStr(0.5),
  MAX_DAILY_SPEND_SOL: numStr(1),

  // RPC and market data
  HELIUS_MAINNET: optStr,
  HELIUS_DEVNET: optStr,
  PIMLICO_API_KEY: optStr,
  JUPITER_API_KEY: optStr,
  NEXT_PUBLIC_JUPITER_PUBLISHABLE_KEY: optStr,
  SOLANATRACKER_API_KEY: optStr,

  // Storage and cache
  PINATA_API_KEY: optStr,
  PINATA_API_SECRET: optStr,
  PINATA_JWT: optStr,
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: optStr,
  UPSTASH_READONLY_TOKEN: optStr,
  DATABASE_URL: optStr,

  // AI and voice
  RIVER_BASE_URL: z.url().default("https://api.river.ai/v1"),
  RIVER_AGENT: optStr,
  RIVER_RAKAZO: optStr,
  RIVER_MODEL_AGENT: optStr,
  RIVER_MODEL_PERSONA: optStr,
  NEON_AI_GATEWAY_TOKEN: optStr,
  NEON_AI_GATEWAY_BASE_URL: z.url().optional(),
  DEEPGRAM_API_KEY: optStr,
  BRAVE_SEARCH_API_KEY: optStr,
  FIRECRAWL_API_KEY: optStr,
  POLLINATIONS_API_KEY: optStr,
  POLLINATIONS_IMAGE_MODEL: z.string().trim().min(1).default("flux"),

  // Ops
  UPCLOUD_API_TOKEN: optStr,
  NEXT_PUBLIC_X_URL: z.url().optional(),
  NEXT_PUBLIC_TELEGRAM_URL: z.url().optional(),

  // Dev-only: lets the stub pages be viewed without an owner session. Ignored in production.
  DEV_PREVIEW_OWNER_PAGES: boolFlag,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Env var names that can only be set by us, with fallbacks to the box names. */
function readRaw(): Record<string, string | undefined> {
  const e = process.env;
  const emptyToUndef = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v);
  const out: Record<string, string | undefined> = {};
  for (const key of Object.keys(schema.shape)) out[key] = emptyToUndef(e[key]);
  out.UPSTASH_REDIS_REST_URL ??= emptyToUndef(e.UPSTASH_REST_URL);
  out.UPSTASH_REDIS_REST_TOKEN ??= emptyToUndef(e.UPSTASH_REST_TOKEN);
  out.NEXT_PUBLIC_JUPITER_PUBLISHABLE_KEY ??= emptyToUndef(e.JUPITER_PUBLISHABLE_KEY);
  out.TREASURY_PUBKEY ??= emptyToUndef(e.NEXT_PUBLIC_TREASURY_PUBKEY);
  return out;
}

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(readRaw());
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment (names only, values hidden):\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Key health: names -> "ok" | "missing". Never returns a value. */
export function keyHealth(): Record<string, "ok" | "missing"> {
  const e = getEnv();
  const names: (keyof Env)[] = [
    "HELIUS_MAINNET", "HELIUS_DEVNET", "JUPITER_API_KEY", "SOLANATRACKER_API_KEY", "PINATA_API_KEY",
    "PINATA_API_SECRET", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "UPSTASH_READONLY_TOKEN",
    "RIVER_AGENT", "RIVER_RAKAZO", "DEEPGRAM_API_KEY", "BRAVE_SEARCH_API_KEY", "FIRECRAWL_API_KEY", "POLLINATIONS_API_KEY",
    "UPCLOUD_API_TOKEN", "PIMLICO_API_KEY", "DASHBOARD_PASSWORD", "API_SERVER_KEY", "TREASURY_PUBKEY",
  ];
  return Object.fromEntries(names.map((n) => [n, e[n] ? "ok" : "missing"])) as Record<string, "ok" | "missing">;
}

/** Test helper: forget the cached env so a test can change process.env between checks. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}
