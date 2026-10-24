"use client";
import { useEffect, useRef } from "react";
import { readLevel } from "@/lib/stage/audio-bus";

/**
 * Original 2D Rakaza (pure SVG + CSS). Used as the "2D" mode and as the fallback when WebGL is
 * unavailable. Blinks with CSS and its mouth follows the same audio level as the 3D avatar.
 */
export function CssAvatar({ className = "" }: { className?: string }) {
  const mouth = useRef<SVGEllipseElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const l = readLevel();
      mouth.current?.setAttribute("ry", String(2.2 + l * 9));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <svg viewBox="0 0 300 460" className={`rk-css-avatar ${className}`} role="img" aria-label="Rakaza, illustrated">
      <defs>
        <linearGradient id="rk-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd75e" />
          <stop offset="1" stopColor="#f2a91f" />
        </linearGradient>
      </defs>
      {/* back hair */}
      <path d="M150 28C70 28 40 90 46 170c4 60-14 120 4 170 14 36 40 28 52 4 8-30 8-70 8-110h80c0 40 0 80 8 110 12 24 38 32 52-4 18-50 0-110 4-170C260 90 230 28 150 28z" fill="url(#rk-hair)" stroke="#170a36" strokeWidth="5" strokeLinejoin="round" />
      {/* body */}
      <path d="M90 300c-40 10-62 50-66 110l-2 50h256l-2-50c-4-60-26-100-66-110z" fill="#6b3bff" stroke="#170a36" strokeWidth="5" strokeLinejoin="round" />
      <path d="M126 300c8 26 40 26 48 0" fill="#f6c9b0" stroke="#170a36" strokeWidth="5" />
      <text x="150" y="400" textAnchor="middle" fontFamily="var(--font-dela), sans-serif" fontSize="44" fill="#ffc933" stroke="#170a36" strokeWidth="2" paintOrder="stroke">R</text>
      {/* neck + face */}
      <rect x="128" y="250" width="44" height="60" rx="16" fill="#f6c9b0" stroke="#170a36" strokeWidth="5" />
      <ellipse cx="150" cy="170" rx="86" ry="96" fill="#fbd9c4" stroke="#170a36" strokeWidth="5" />
      {/* fringe */}
      <path d="M62 150C60 80 100 44 150 44s90 36 88 106c-20-18-34-52-40-60-10 30-50 48-84 44-14-2-28 6-52 16z" fill="url(#rk-hair)" stroke="#170a36" strokeWidth="5" strokeLinejoin="round" />
      {/* cheeks */}
      <ellipse cx="96" cy="198" rx="17" ry="9" fill="#ff7db8" opacity=".55" />
      <ellipse cx="204" cy="198" rx="17" ry="9" fill="#ff7db8" opacity=".55" />
      {/* eyes */}
      <g className="rk-css-eye">
        <ellipse cx="108" cy="168" rx="16" ry="24" fill="#fff" stroke="#170a36" strokeWidth="4" />
        <ellipse cx="110" cy="172" rx="11" ry="18" fill="#7a3d1a" />
        <circle cx="113" cy="164" r="5" fill="#fff" />
      </g>
      <g className="rk-css-eye">
        <ellipse cx="192" cy="168" rx="16" ry="24" fill="#fff" stroke="#170a36" strokeWidth="4" />
        <ellipse cx="190" cy="172" rx="11" ry="18" fill="#7a3d1a" />
        <circle cx="193" cy="164" r="5" fill="#fff" />
      </g>
      {/* mouth */}
      <ellipse ref={mouth} cx="150" cy="222" rx="13" ry="2.4" fill="#c2325f" stroke="#170a36" strokeWidth="3" />
    </svg>
  );
}
