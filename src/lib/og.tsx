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
