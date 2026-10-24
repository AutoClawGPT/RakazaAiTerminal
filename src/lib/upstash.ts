import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { getEnv } from "./env";

/** Read/write client (server writes). Returns null when Upstash is not configured. */
let rw: Redis | null | undefined;
export function redis(): Redis | null {
  if (rw !== undefined) return rw;
  const e = getEnv();
  rw = e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN })
    : null;
  return rw;
}

/** Read-only client for public GET routes, so a bug there cannot write. */
let ro: Redis | null | undefined;
export function redisReadOnly(): Redis | null {
  if (ro !== undefined) return ro;
  const e = getEnv();
  ro = e.UPSTASH_REDIS_REST_URL && e.UPSTASH_READONLY_TOKEN
    ? new Redis({ url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_READONLY_TOKEN })
    : null;
  return ro;
}

/** Sliding-window rate limiter factory (used from Phase 3 on). */
export function limiter(prefix: string, requests: number, window: `${number} ${"s" | "m" | "h"}`): Ratelimit | null {
  const r = redis();
  return r ? new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(requests, window), prefix: `rl:${prefix}` }) : null;
}
