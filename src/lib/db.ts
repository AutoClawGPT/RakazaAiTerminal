import "server-only";
import { neon } from "@neondatabase/serverless";
import { getEnv } from "./env";

/** Neon over HTTPS (works from serverless and from networks that block port 5432). */
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
  })().catch((e) => { migrated = null; throw e; });
  return migrated;
}
