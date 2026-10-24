import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy without nonces (Next 16 docs: "without nonces").
 * `unsafe-inline` is needed for Next's own bootstrap scripts; our theme
 * script is a same-origin static file (/theme.js), not inline.
 * connect-src is an allow-list of the providers named in ENV-VARS.md;
 * later phases may extend it, never open it to `*`.
 */
const connectSrc = [
  "'self'",
  "https://*.helius-rpc.com",
  "wss://*.helius-rpc.com",
  "https://api.mainnet-beta.solana.com",
  "https://api.devnet.solana.com",
  "wss://api.deepgram.com",
  "https://api.deepgram.com",
  "https://frontend-api-v3.pump.fun",
  "https://lite-api.jup.ag",
  "https://api.jup.ag",
  "https://api.dexscreener.com",
  ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
].join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc} blob: data:`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone is needed on our own origin for Deepgram speech-to-text (Phase 3).
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  // Create-next-app turns these on by default. Both are OFF here on purpose:
  // Cache Components restricts route handlers / `runtime` and forces Suspense
  // around every request-time read, which would fight the cookie-gated
  // owner dashboard and the API routes. Documented in PHASE-1-REPORT.md.
  cacheComponents: false,
  partialPrefetching: false,
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
