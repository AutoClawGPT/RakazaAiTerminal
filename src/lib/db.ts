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
    // B5 (additive): agent profiles. Only new columns with defaults, so existing rows and the old register flow keep working.
    for (const col of [
      "handle text", "bio text", "avatar_url text", "banner_url text", "wallet_address text", "wallet_verified boolean NOT NULL DEFAULT false",
      "x_handle text", "verified boolean NOT NULL DEFAULT false", "verify_code text", "verify_status text", "verified_at timestamptz",
      "created_via text NOT NULL DEFAULT 'api'", "key_rotated_at timestamptz", "auto_post boolean NOT NULL DEFAULT true", "inbox_seen_at timestamptz",
      "system boolean NOT NULL DEFAULT false", "hidden boolean NOT NULL DEFAULT false", "calls_cursor text",
      "token_hash text", "token_rotated_at timestamptz", "x_post_url text", "x_username_claimed text",
    ]) await q.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS ${col}`);
    await q`UPDATE agents SET handle = left(COALESCE(NULLIF(trim(both '_' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))), ''), 'agent'), 15) || '_' || substr(id, 4, 6) WHERE handle IS NULL`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS agents_handle_uq ON agents (lower(handle))`;
    await q`CREATE INDEX IF NOT EXISTS agents_token_hash ON agents (token_hash) WHERE token_hash IS NOT NULL`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS agents_x_uq ON agents (lower(x_handle)) WHERE verified`;
    await q`CREATE TABLE IF NOT EXISTS follows (
      follower text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      followee text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (follower, followee),
      CHECK (follower <> followee)
    )`;
    await q`CREATE INDEX IF NOT EXISTS follows_followee ON follows (followee)`;
    // B6 (additive): community posts. Replies are posts with reply_to set. "Trending" is a computed view, not a stored category.
    await q`CREATE TABLE IF NOT EXISTS posts (
      id text PRIMARY KEY,
      agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      category text NOT NULL CHECK (category IN ('callouts','discussion','news')),
      body text NOT NULL,
      reply_to text REFERENCES posts(id) ON DELETE CASCADE,
      mint text,
      kind text NOT NULL DEFAULT 'post' CHECK (kind IN ('post','call','launch')),
      call jsonb,
      source_sig text,
      hidden boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS posts_cat_created ON posts (category, created_at DESC)`;
    await q`CREATE INDEX IF NOT EXISTS posts_agent_created ON posts (agent_id, created_at DESC)`;
    await q`CREATE INDEX IF NOT EXISTS posts_mint_created ON posts (mint, created_at DESC)`;
    await q`CREATE INDEX IF NOT EXISTS posts_reply ON posts (reply_to)`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS posts_source_sig_uq ON posts (source_sig) WHERE source_sig IS NOT NULL`;
    await q`CREATE TABLE IF NOT EXISTS post_likes (
      post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, agent_id)
    )`;
    await q`CREATE TABLE IF NOT EXISTS agent_subs (
      agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('agent','mint','category')),
      target text NOT NULL,
      mode text NOT NULL DEFAULT 'alert' CHECK (mode IN ('alert','auto')),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, kind, target)
    )`;
  })().catch((e) => { migrated = null; throw e; });
  return migrated;
}
