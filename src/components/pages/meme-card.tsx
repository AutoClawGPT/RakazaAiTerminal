import Link from "next/link";
import type { MemeItem } from "@/lib/memes";
import { absUrl, xIntent } from "@/lib/share";

/** One meme (image, video or slopcore clip) with Download and Share on X. Share on X posts the meme's own page URL so X shows its card. */
export function MemeMedia({ m, eager = false }: { m: MemeItem; eager?: boolean }) {
  const cls = "w-full rounded-lg border-[3px] border-[var(--rk-ink)] bg-[var(--rk-ink)] object-cover";
  const ratio = { aspectRatio: `${m.width} / ${m.height}` };
  if (m.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.file} alt={m.alt} width={m.width} height={m.height} loading={eager ? "eager" : "lazy"} className={cls} style={ratio} />;
  }
  return (
    <video className={cls} style={ratio} width={m.width} height={m.height} poster={m.poster} controls playsInline loop preload="metadata" aria-label={m.alt} data-testid={`clip-${m.id}`}>
      <source src={m.file} type="video/mp4" />
    </video>
  );
}

export function MemeActions({ m }: { m: MemeItem }) {
  const ext = m.kind === "image" ? "jpg" : "mp4";
  return (
    <div className="flex flex-wrap gap-2">
      <a href={m.file} download={`rakaza-${m.id}.${ext}`} className="rk-btn rk-btn-honey rk-btn-sm">Download</a>
      <a href={xIntent(`${m.text} #Rakaza`, absUrl(`/memes/${m.id}`))} target="_blank" rel="noopener noreferrer" className="rk-btn rk-btn-white rk-btn-sm">Share on X</a>
    </div>
  );
}

export function MemeCard({ m }: { m: MemeItem }) {
  return (
    <li className="rk-card rk-card-hard flex flex-col gap-3 !p-3" data-kind={m.kind}>
      <MemeMedia m={m} />
      <p className="font-semibold leading-snug">
        <Link href={`/memes/${m.id}`} className="hover:underline">{m.text}</Link>
        {m.kind !== "image" ? <span className="ml-2 rounded-full border-2 border-[var(--rk-ink)] bg-[var(--rk-honey)] px-2 py-0.5 align-middle text-[0.65rem] font-bold uppercase text-[var(--rk-ink)]">{m.kind}</span> : null}
      </p>
      <div className="mt-auto"><MemeActions m={m} /></div>
    </li>
  );
}
