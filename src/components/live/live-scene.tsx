"use client";
import { useEffect } from "react";
import { setLive, useLive } from "@/lib/live/live-state";

/** Deterministic skyline (no randomness at render, so server and client match). */
const TOWERS = Array.from({ length: 22 }, (_, i) => {
  const h = 70 + ((i * 53) % 120) + (i % 5 === 2 ? 60 : 0);
  return { x: i * 46 - 6, w: 30 + ((i * 17) % 22), h };
});

/** Stream backdrop drawn BEHIND her VRM while live: night sky, neon sun, Solana-city skyline and a moving grid floor. */
export function LiveScene() {
  const { live } = useLive();
  if (!live) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="live-scene">
      <style>{`@keyframes rkFloor{from{background-position:0 0}to{background-position:0 48px}}@keyframes rkTwinkle{0%,100%{opacity:.35}50%{opacity:1}}`}</style>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_115%,#ff2d95_0%,#7b1fd1_28%,#1a0838_58%,#05010f_100%)]" />
      {[...Array(40)].map((_, i) => (
        <span key={i} className="absolute size-[2px] rounded-full bg-white" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 19) % 45}%`, animation: `rkTwinkle ${2 + (i % 4)}s ease-in-out ${i % 3}s infinite` }} />
      ))}
      <div className="absolute left-1/2 top-[22%] size-[38%] max-w-[22rem] -translate-x-1/2 rounded-full bg-[linear-gradient(#ffe45c,#ff7a3d_45%,#ff2d95)] shadow-[0_0_80px_20px_rgba(255,45,149,0.45)] [mask-image:repeating-linear-gradient(to_bottom,#000_0_14px,transparent_14px_18px)] aspect-square" />
      <svg className="absolute inset-x-0 bottom-[34%] h-[38%] w-full" viewBox="0 0 1000 260" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="rkTower" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1b0a3a" />
            <stop offset="1" stopColor="#07021a" />
          </linearGradient>
        </defs>
        {TOWERS.map((t, i) => (
          <g key={i}>
            <rect x={t.x} y={260 - t.h} width={t.w} height={t.h} fill="url(#rkTower)" stroke="#00ffd0" strokeOpacity={i % 3 ? 0.25 : 0.6} />
            {[...Array(Math.floor(t.h / 18))].map((_, r) => (
              <rect key={r} x={t.x + 5 + ((r + i) % 3) * 8} y={260 - t.h + 8 + r * 18} width={4} height={6} fill={(r + i) % 4 ? "#ff6bd6" : "#ffc933"} opacity={(r * 7 + i) % 5 ? 0.75 : 0.15} />
            ))}
          </g>
        ))}
      </svg>
      <div className="absolute inset-x-[-50%] bottom-0 h-[36%] origin-bottom [transform:perspective(260px)_rotateX(62deg)] bg-[linear-gradient(rgba(0,255,208,0.9)_2px,transparent_2px),linear-gradient(90deg,rgba(0,255,208,0.9)_2px,transparent_2px)] bg-[size:48px_48px] [background-color:#14042e]" style={{ animation: "rkFloor 1.2s linear infinite" }} />
      <div className="absolute inset-x-0 bottom-[34%] h-[3px] bg-[#00ffd0] shadow-[0_0_18px_4px_#00ffd0]" />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.03)_0_1px,transparent_1px_3px)]" />
    </div>
  );
}

/** Dev-only preview: turns the live look on without a call (the page gates it to non-production + DEV_PREVIEW_OWNER_PAGES). */
export function LivePreview() {
  useEffect(() => setLive(true), []);
  return null;
}
