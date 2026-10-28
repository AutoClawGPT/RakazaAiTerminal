import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { publicLaunchCount } from "@/lib/market/counts";
import { publicEnv } from "@/lib/public-env";
import { siteUrl } from "@/lib/site";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_TYPE = "image/png";

let fontCache: Buffer | null = null;
/** Latin subset of Dela Gothic One (OFL), bundled for share images. */
export async function ogFont(): Promise<Buffer> {
  fontCache ??= await readFile(join(process.cwd(), "src/assets/fonts/DelaGothicOne-latin.ttf"));
  return fontCache;
}

async function shareArt(): Promise<string> {
  const jpg = await readFile(join(process.cwd(), "public/brand/share.jpg"));
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

/** Site share image: the Rakaza art with a live strip along the bottom (tokens launched so far). */
export async function siteShareImage(): Promise<ImageResponse> {
  const [font, art, count] = await Promise.all([ogFont(), shareArt(), publicLaunchCount()]);
  const net = publicEnv.network === "mainnet-beta" ? "MAINNET" : "DEVNET";
  const strip = count === null ? `${net} · EXPLORE EVERY LAUNCH LIVE` : `${count} TOKEN${count === 1 ? "" : "S"} LAUNCHED · ${net} · EXPLORE LIVE`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#120828" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", background: "rgba(18,8,40,0.82)", color: "#fff", fontFamily: "Dela", fontSize: 22, letterSpacing: 1 }}>
          <span style={{ color: "#3be8b0" }}>{strip}</span>
          <span style={{ color: "#ffc93c" }}>{new URL(siteUrl()).host.toUpperCase()}</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Dela", data: font, weight: 400, style: "normal" }] },
  );
}

/** A simple branded share card (title, subtitle and a few live lines). Latin text only (the bundled font). */
export async function titleShareImage(opts: { kicker: string; title: string; sub?: string; lines?: string[] }): Promise<ImageResponse> {
  const font = await ogFont();
  const latin = (s: string, n: number) => s.replace(/[^\x20-\x7E]/g, "").trim().slice(0, n);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px", background: "linear-gradient(150deg,#7347ff,#3a17a8 60%,#1e0a63)", color: "#fff", fontFamily: "Dela" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, letterSpacing: 2 }}>
          <span style={{ color: "#ffc933" }}>{latin(opts.kicker, 40).toUpperCase()}</span>
          <span style={{ color: "#3ff0c3" }}>{publicEnv.network === "mainnet-beta" ? "MAINNET" : "DEVNET"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 92, lineHeight: 1, color: "#e4d9ff", textShadow: "5px 6px 0 #ff4da6" }}>{latin(opts.title, 30)}</div>
          {opts.sub ? <div style={{ display: "flex", fontSize: 34, opacity: 0.95 }}>{latin(opts.sub, 90)}</div> : null}
          {(opts.lines ?? []).slice(0, 3).map((l, i) => <div key={i} style={{ display: "flex", fontSize: 30, color: "#3ff0c3" }}>{latin(l, 70)}</div>)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}>
          <span>REAL-TIME, SERVER-VERIFIED</span>
          <span style={{ color: "#ffc933" }}>{new URL(siteUrl()).host.toUpperCase()}</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Dela", data: font, weight: 400, style: "normal" }] },
  );
}
