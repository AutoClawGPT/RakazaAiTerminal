import "server-only";
import { neon, neonConfig } from "@neondatabase/serverless";
import { getEnv } from "./env";

/** Neon over HTTPS (works from serverless and from networks that block port 5432). */
// A dropped connection is retried a few times. Payout rows are unique per (signature, wallet), so a repeat can never double count.
neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
  let last: unknown;
  for (let i = 0; i < 4; i++) {
    try { return await fetch(input, init); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
  }
  throw last;
};

let client: ReturnType<typeof neon> | null | undefined;
export function sql() {
  if (client === undefined) {
    const url = getEnv().DATABASE_URL;
    client = url ? neon(url) : null;
  }
  return client;
}

let migrated: Promise<void> | null = null;
/** Idempotent. Only ever adds tables. */
export function ensureSchema(): Promise<void> {
  migrated ??= (async () => {
    const q = sql();
    if (!q) throw new Error("DATABASE_URL is not set.");
    await q`CREATE TABLE IF NOT EXISTS agents (
      id text PRIMARY KEY,
      name text NOT NULL,
      key_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz,
      calls bigint NOT NULL DEFAULT 0,
      disabled boolean NOT NULL DEFAULT false
    )`;
    await q`CREATE TABLE IF NOT EXISTS launches (
      mint text PRIMARY KEY,
      network text NOT NULL,
      mode text NOT NULL,
      name text NOT NULL,
      symbol text NOT NULL,
      uri text NOT NULL,
      creator text NOT NULL,
      dev_buy_sol numeric NOT NULL DEFAULT 0,
      shareholders jsonb NOT NULL,
      status text NOT NULL,
      tx1 text,
      tx2 text,
      note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE TABLE IF NOT EXISTS fee_payouts (
      id bigserial PRIMARY KEY,
      mint text NOT NULL,
      network text NOT NULL,
      wallet text NOT NULL,
      lamports numeric NOT NULL,
      sig text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (sig, wallet)
    )`;
    // B2 (additive): public market data. A trade per row decoded from the pump program's own events, one cursor and one stats row per mint.
    await q`CREATE TABLE IF NOT EXISTS curve_trades (
      signature text NOT NULL,
      mint text NOT NULL,
      ts timestamptz NOT NULL,
      side text NOT NULL,
      sol_amount double precision NOT NULL,
      token_amount double precision NOT NULL,
      price_sol double precision NOT NULL,
      trader text NOT NULL,
      PRIMARY KEY (signature, mint)
    )`;
    await q`CREATE INDEX IF NOT EXISTS curve_trades_mint_ts ON curve_trades (mint, ts DESC)`;
    await q`CREATE TABLE IF NOT EXISTS index_cursor (
      mint text PRIMARY KEY,
      newest_sig text,
      backfilled boolean NOT NULL DEFAULT false,
      last_run timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE TABLE IF NOT EXISTS mint_stats (
      mint text PRIMARY KEY,
      progress_pct real NOT NULL DEFAULT 0,
      complete boolean NOT NULL DEFAULT false,
      price_sol double precision,
      mcap_sol double precision,
      price_usd double precision,
      mcap_usd double precision,
      volume24h_sol double precision NOT NULL DEFAULT 0,
      trades24h integer NOT NULL DEFAULT 0,
      last_trade_at timestamptz,
      image_url text,
      description text,
      links jsonb,
      meta_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS mint_stats_progress ON mint_stats (progress_pct DESC)`;
    await q`CREATE INDEX IF NOT EXISTS launches_network_created ON launches (network, created_at DESC)`;
  })().catch((e) => { migrated = null; throw e; });
  return migrated;
}
