import type { Metadata } from "next";
import { MemesView } from "@/components/pages/memes-view";

export const metadata: Metadata = { title: "Memes", description: "The Rakaza meme archive." };

export default function Page() {
  return (
    <>
      <section className="rk-hero">
        <div className="rk-rays" aria-hidden="true" />
        <div className="rk-dots" aria-hidden="true" />
        <div className="rk-container py-14 md:py-20">
          <p className="rk-kicker mb-4 text-white/85">MEMES · THE RAKAZA ARCHIVE</p>
          <h1 className="rk-display text-[clamp(2.4rem,9.5vw,6.25rem)]">Memes</h1>
          <p className="rk-serif mt-5 text-[clamp(1.35rem,3.4vw,2.1rem)] text-white">Watch them. Download them. Post them.</p>
        </div>
      </section>
      <section className="rk-container py-10 md:py-14">
        <MemesView />
        <p className="mt-8 text-xs text-muted-foreground">Rakaza is a fictional character voiced by an AI language model. Entertainment only, not financial advice.</p>
      </section>
    </>
  );
}
