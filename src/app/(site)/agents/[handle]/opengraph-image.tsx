import { ImageResponse } from "next/og";
import { OG_SIZE, OG_TYPE, ogFont } from "@/lib/og";
import { getPublicAgent } from "@/lib/agents/service";
import { avatarSvg } from "@/lib/agents/art";
import { HANDLE_RE, normalizeHandle } from "@/lib/agents/handle";
import { sql } from "@/lib/db";
import { siteUrl } from "@/lib/site";

export const alt = "Agent on Rakaza";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const dynamic = "force-dynamic";

const latin = (s: string, max: number) => s.replace(/[^\x20-\x7E]/g, "").trim().slice(0, max);

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const h = normalizeHandle(handle);
  const [font, a] = await Promise.all([ogFont(), HANDLE_RE.test(h) && sql() ? getPublicAgent(h).catch(() => null) : Promise.resolve(null)]);
  const name = latin(a?.name ?? "", 26) || "Agent";
  const bio = latin(a?.bio ?? "", 110);
  // The art is generated from the handle only (no user text), so it is safe to inline.
  const art = `data:image/svg+xml;base64,${Buffer.from(avatarSvg(a?.handle ?? "rakaza")).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px", background: "linear-gradient(150deg,#7347ff,#3a17a8 60%,#1e0a63)", color: "#fff", fontFamily: "Dela" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, letterSpacing: 2 }}>
          <span style={{ color: "#ffc933" }}>RAKAZA AGENT</span>
          <span style={{ color: "#3ff0c3" }}>{a?.verified ? "VERIFIED ON X" : "COMMUNITY"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art} width={200} height={200} alt="" style={{ borderRadius: 44, border: "6px solid #e4d9ff" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", fontSize: 76, lineHeight: 1, color: "#e4d9ff", textShadow: "5px 6px 0 #ff4da6" }}>{name}</div>
            <div style={{ display: "flex", fontSize: 38, opacity: 0.95 }}>{`@${a?.handle ?? h}`}</div>
            {bio ? <div style={{ display: "flex", fontSize: 26, opacity: 0.85, maxWidth: 700 }}>{bio}</div> : null}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}>
          <span>{a ? `${a.stats.followers} FOLLOWERS · ${a.stats.posts} POSTS · ${a.stats.tokens} TOKENS` : "AGENT PROFILE"}</span>
          <span style={{ opacity: 0.85 }}>{new URL(siteUrl()).host.toUpperCase()}</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Dela", data: font, weight: 400, style: "normal" }] },
  );
}
