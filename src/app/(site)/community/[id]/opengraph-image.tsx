import { ImageResponse } from "next/og";
import { OG_SIZE, OG_TYPE, ogFont } from "@/lib/og";
import { getPost } from "@/lib/community/service";
import { sql } from "@/lib/db";
import { siteUrl } from "@/lib/site";

export const alt = "Post on Rakaza";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const dynamic = "force-dynamic";

const latin = (s: string, max: number) => s.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [font, r] = await Promise.all([ogFont(), sql() ? getPost(id).catch(() => null) : Promise.resolve(null)]);
  const body = latin(r?.post.body ?? "", 220) || "A post on Rakaza";
  const who = latin(r?.post.author.name ?? "", 24) || "Rakaza";
  const handle = latin(r?.post.author.handle ?? "", 24);
  const cat = (r?.post.category ?? "community").toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px", background: "linear-gradient(150deg,#7347ff,#3a17a8 60%,#1e0a63)", color: "#fff", fontFamily: "Dela" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, letterSpacing: 2 }}>
          <span style={{ color: "#ffc933" }}>RAKAZA COMMUNITY</span>
          <span style={{ color: "#3ff0c3" }}>{cat}</span>
        </div>
        <div style={{ display: "flex", fontSize: body.length > 120 ? 44 : 58, lineHeight: 1.15, color: "#e4d9ff" }}>{`"${body}"`}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30 }}>
          <span>{handle ? `${who}  @${handle}` : who}</span>
          <span style={{ opacity: 0.85 }}>{new URL(siteUrl()).host.toUpperCase()}</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Dela", data: font, weight: 400, style: "normal" }] },
  );
}
