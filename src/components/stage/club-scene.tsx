"use client";
import { useEffect, useRef } from "react";
import { getStage } from "@/lib/stage/motion-bus";
import { getSongState, songSpectrum } from "@/lib/stage/song-player";

/**
 * The 18+ club scene around her: a dark moody backdrop, neon beams in cyan / magenta / violet, a glowing floor, haze and a neon sign.
 * `layer="back"` sits behind the 3D canvas, `layer="front"` (vignette + sign) in front of it. Both fade in and out together.
 */
export function ClubScene({ layer }: { layer: "back" | "front" }) {
  const root = useRef<HTMLDivElement>(null);
  const beams = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    let k = 0;
    let pulse = 0;
    let last = performance.now();
    const vals = new Array<number>(8).fill(0);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      k += ((getStage().bold ? 1 : 0) - k) * Math.min(1, dt * 2.5);
      const el = root.current;
      if (el) {
        if (k < 0.01) {
          if (el.style.display !== "none") el.style.display = "none";
          el.dataset.on = "0";
        } else {
          if (el.style.display === "none") el.style.display = "";
          el.dataset.on = k > 0.9 ? "1" : "fade";
          el.style.opacity = String(k);
          if (layer === "back") {
            let bass = 0.4 + 0.2 * Math.sin(now / 520);
            if (getSongState().status === "playing" && songSpectrum(vals)) bass = (vals[0] + vals[1] + vals[2]) / 3;
            pulse += (bass - pulse) * Math.min(1, dt * (bass > pulse ? 25 : 6));
            const t = now / 1000;
            beams.current.forEach((b, i) => {
              if (!b) return;
              b.style.opacity = String(0.22 + 0.6 * pulse);
              b.style.transform = `rotate(${(i % 2 ? 1 : -1) * (14 + Math.sin(t * 0.5 + i * 2.1) * 20)}deg)`;
            });
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [layer]);

  if (layer === "back") {
    const B = [
      { x: 8, c: "39,216,255" },
      { x: 34, c: "255,47,142" },
      { x: 66, c: "176,59,255" },
      { x: 92, c: "39,216,255" },
    ];
    return (
      <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ display: "none", background: "linear-gradient(180deg,#07010f 0%,#14042a 52%,#28063d 100%)" }} aria-hidden="true" data-testid="club-back" data-on="0">
        {B.map((b, i) => (
          <div
            key={i}
            ref={(e) => { beams.current[i] = e; }}
            className="absolute -top-[8%] h-[130%] w-[40%] origin-top"
            style={{ left: `${b.x - 20}%`, background: `linear-gradient(to bottom, rgba(${b.c},0.9), rgba(${b.c},0) 85%)`, clipPath: "polygon(47% 0, 53% 0, 100% 100%, 0 100%)", mixBlendMode: "screen" }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-2/5" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(255,47,142,0.75), rgba(176,59,255,0.3) 50%, transparent 75%)" }} />
        <div className="absolute inset-x-0 bottom-0 h-1/4 opacity-50" style={{ background: "repeating-linear-gradient(90deg, rgba(39,216,255,0.35) 0 1px, transparent 1px 38px), repeating-linear-gradient(0deg, rgba(39,216,255,0.3) 0 1px, transparent 1px 22px)", maskImage: "linear-gradient(to top, #000, transparent)", WebkitMaskImage: "linear-gradient(to top, #000, transparent)" }} />
      </div>
    );
  }
  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ display: "none", boxShadow: "inset 0 0 60px 6px rgba(255,47,142,0.55), inset 0 0 0 2px rgba(255,47,142,0.8)", background: "radial-gradient(ellipse at 50% 45%, transparent 38%, rgba(5,0,12,0.72) 100%)" }} aria-hidden="true" data-testid="club-front" data-on="0">
      <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md border-2 border-[#ff2f8e] bg-black/30 px-2 py-0.5 font-mono text-[0.7rem] font-extrabold tracking-[0.25em] text-[#ff9ccd]" style={{ textShadow: "0 0 6px #ff2f8e, 0 0 16px #ff2f8e", boxShadow: "0 0 12px rgba(255,47,142,0.8), inset 0 0 8px rgba(255,47,142,0.5)" }} data-testid="club-badge">
        18+ CLUB
      </span>
    </div>
  );
}
