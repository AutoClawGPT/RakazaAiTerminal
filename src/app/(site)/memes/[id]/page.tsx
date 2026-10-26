import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemeActions, MemeMedia } from "@/components/pages/meme-card";
import { MEME_ITEMS, getMeme } from "@/lib/memes";
import { SITE_NAME } from "@/lib/site";

export const dynamicParams = false;
export function generateStaticParams() {
  return MEME_ITEMS.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: PageProps<"/memes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const m = getMeme(id);
  if (!m) return { title: "Meme", robots: { index: false, follow: false } };
  const label = m.kind === "image" ? "meme" : m.kind === "video" ? "video meme" : "slopcore clip";
  const title = `${m.text} · Rakaza ${label}`;
  const description = `${m.alt}. Download it or post it on X. Rakaza is a fictional character; entertainment only.`;
  const images = [{ url: m.og, width: 1200, height: 630, alt: m.alt }];
  return {
    title,
    description,
    alternates: { canonical: `/memes/${m.id}` },
    openGraph: { type: "website", siteName: SITE_NAME, title, description, url: `/memes/${m.id}`, images },
    twitter: { card: "summary_large_image", title, description, images: [m.og] },
  };
}

export default async function Page({ params }: PageProps<"/memes/[id]">) {
  const { id } = await params;
  const m = getMeme(id);
  if (!m) notFound();
  return (
    <section className="rk-container py-10 md:py-14">
      <p className="rk-kicker mb-3"><Link href="/memes" className="underline">Memes</Link> · {m.kind}</p>
      <h1 className="rk-h2 mb-6 text-3xl md:text-4xl">{m.text}</h1>
      <div className="rk-card rk-card-hard mx-auto flex max-w-md flex-col gap-4 !p-3">
        <MemeMedia m={m} eager />
        <MemeActions m={m} />
      </div>
      <p className="mx-auto mt-6 max-w-md text-xs text-muted-foreground">{m.alt}. Rakaza is a fictional character voiced by an AI language model. Entertainment only, not financial advice.</p>
    </section>
  );
}
