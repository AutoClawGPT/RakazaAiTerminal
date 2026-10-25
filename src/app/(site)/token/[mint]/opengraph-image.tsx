import { ImageResponse } from "next/og";
import { OG_SIZE, OG_TYPE, ogFont } from "@/lib/og";
import { peekToken } from "@/lib/market/tokens";
import { isSolanaAddress } from "@/lib/tools/address";
import { siteUrl } from "@/lib/site";

export const alt = "Token on Rakaza";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const dynamic = "force-dynamic";

/** The bundled display font only has Latin glyphs, so anything else is dropped from the share image. */
const latin = (s: string, max: number) => s.replace(/[^\x20-\x7E]/g, "").trim().slice(0, max);

export default async function Image({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const [font, t] = await Promise.all([ogFont(), isSolanaAddress(mint) ? peekToken(mint).catch(() => null) : Promise.resolve(null)]);
  const name = latin(t?.name ?? "", 28) || "Token";
  const sym = latin(t?.symbol ?? "", 10) || "TOKEN";
  const pct = t ? (t.curve.complete ? 100 : Math.max(0, Math.min(100, t.curve.progressPct))) : 0;
  const status = !t ? "ON RAKAZA" : t.curve.complete ? "GRADUATED" : t.curve.graduatingSoon ? "GRADUATING SOON" : "BONDING CURVE";
  const net = t?.network === "mainnet-beta" ? "MAINNET" : "DEVNET";
  const mcap = t?.market.marketCapUsd != null ? `$${Math.round(t.market.marketCapUsd).toLocaleString("en-US")}` : t?.market.marketCapSol != null ? `${t.market.marketCapSol.toFixed(2)} SOL` : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px", background: "linear-gradient(150deg,#7347ff,#3a17a8 60%,#1e0a63)", color: "#fff", fontFamily: "Dela" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, letterSpacing: 2 }}>
          <span style={{ color: "#ffc933" }}>RAKAZA</span>
          <span style={{ color: "#3ff0c3" }}>{net}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ width: 168, height: 168, borderRadius: 36, border: "6px solid #e4d9ff", background: "#6b3bff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 96 }}>{(sym[0] ?? "?").toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 96, lineHeight: 1, color: "#e4d9ff", textShadow: "5px 6px 0 #ff4da6" }}>{`$${sym}`}</div>
            <div style={{ fontSize: 40, opacity: 0.95 }}>{name}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28 }}>
            <span>{status}</span>
            <span>{`${pct.toFixed(pct >= 100 || pct === 0 ? 0 : 1)}%${mcap ? `  ·  MKT CAP ${mcap}` : ""}`}</span>
          </div>
          <div style={{ display: "flex", height: 30, borderRadius: 999, border: "4px solid #e4d9ff", background: "rgba(0,0,0,0.3)", overflow: "hidden" }}>
            <div style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`, background: t?.curve.complete ? "#3ff0c3" : "linear-gradient(90deg,#ffc933,#ff4da6)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, opacity: 0.85 }}>
            <span>LIVE CHART · TRADES · HOLDERS</span>
            <span>{new URL(siteUrl()).host.toUpperCase()}</span>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Dela", data: font, weight: 400, style: "normal" }] },
  );
}
