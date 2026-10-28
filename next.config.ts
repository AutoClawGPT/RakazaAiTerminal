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

/**
 * The game itself (public/games/ride-em, our own static code) is shown in an iframe on /games/ride-em, so it alone may be framed by this site.
 * It also lets players point the pilot at their own OpenAI-compatible model (https, or localhost for a local model), so connect-src is wider
 * on this path only. The key they type stays in their browser.
 */
const gameCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'self'",
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
    return [
      // every path except the game's static files gets the strict headers (frame-ancestors none, X-Frame-Options DENY)
      { source: "/:path((?!games/ride-em/).*)", headers: securityHeaders },
      {
        source: "/games/ride-em/:file+",
        headers: [
          { key: "Content-Security-Policy", value: gameCsp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(), camera=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
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
