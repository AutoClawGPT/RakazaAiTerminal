"use client";
import { useEffect, useRef } from "react";
import { getSongState, songSpectrum } from "@/lib/stage/song-player";
import { getPrep } from "@/lib/stage/song-prep";

const BEAMS = [
  { x: 6, c: "255,95,168", s: 0.9, a: -22 },
  { x: 28, c: "140,110,255", s: 0.7, a: -8 },
  { x: 50, c: "255,196,60", s: 1.1, a: 0 },
  { x: 72, c: "90,220,255", s: 0.8, a: 10 },
  { x: 94, c: "255,95,168", s: 1.0, a: 24 },
];

/** Moving stage lights behind her while she gets ready for and performs a song. They pulse with the song's bass. */
export function StageLights() {
  const root = useRef<HTMLDivElement>(null);
  const beams = useRef<(HTMLDivElement | null)[]>([]);
  const floor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let k = 0;
    let pulse = 0;
    let last = performance.now();
    const vals = new Array<number>(8).fill(0);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const playing = getSongState().status === "playing";
      const prep = getPrep().active;
      const want = playing ? 1 : prep ? 0.6 : 0;
      k += (want - k) * Math.min(1, dt * 3);
      const el = root.current;
      if (el) {
        if (k < 0.01) {
          if (el.style.display !== "none") el.style.display = "none";
        } else {
          if (el.style.display === "none") el.style.display = "";
          let bass = 0.35 + 0.25 * Math.sin(now / 260);
          if (playing && songSpectrum(vals)) bass = (vals[0] + vals[1] + vals[2]) / 3;
          pulse += (bass - pulse) * Math.min(1, dt * (bass > pulse ? 30 : 7));
          const t = now / 1000;
          beams.current.forEach((b, i) => {
            if (!b) return;
            const d = BEAMS[i];
            b.style.opacity = String(k * (0.16 + 0.55 * pulse));
            b.style.transform = `rotate(${(d.a + Math.sin(t * d.s + i * 1.7) * 16).toFixed(1)}deg)`;
          });
          if (floor.current) floor.current.style.opacity = String(k * (0.3 + 0.6 * pulse));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ display: "none" }} aria-hidden="true" data-testid="stage-lights">
      {BEAMS.map((b, i) => (
        <div
          key={i}
          ref={(e) => { beams.current[i] = e; }}
          className="absolute -top-[8%] h-[125%] w-[34%] origin-top"
          style={{ left: `${b.x - 17}%`, background: `linear-gradient(to bottom, rgba(${b.c},0.95), rgba(${b.c},0) 82%)`, clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)", mixBlendMode: "screen", opacity: 0 }}
        />
      ))}
      <div ref={floor} className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(255,95,168,0.7), rgba(140,110,255,0.25) 55%, transparent 75%)", opacity: 0 }} />
    </div>
  );
}
