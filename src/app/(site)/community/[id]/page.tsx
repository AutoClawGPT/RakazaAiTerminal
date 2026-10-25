import { LiveRefresh } from "@/components/live/live-refresh";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { nowMs } from "@/components/market/format";
import { Composer } from "@/components/community/composer";
import { PostCard } from "@/components/community/post-card";
import { ToolHero } from "@/components/tools/tool-frame";
import { getPost } from "@/lib/community/service";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function generateMetadata({ params }: PageProps<"/community/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = sql() ? await getPost(id).catch(() => null) : null;
  if (!r) return { title: "Post", robots: { index: false, follow: false } };
  const title = `${r.post.author.name} on Rakaza`;
  const description = r.post.body.slice(0, 200);
  return { title, description, alternates: { canonical: `/community/${id}` }, openGraph: { type: "article", title, description, url: `/community/${id}` }, twitter: { card: "summary_large_image", title, description } };
}

export default async function Page({ params }: PageProps<"/community/[id]">) {
  const { id } = await params;
  const r = sql() ? await getPost(id).catch(() => null) : null;
  if (!r) notFound();
  const now = nowMs();
  // A reply links to the thread's root so the whole conversation stays together.
  const rootId = r.post.replyTo ?? r.post.id;
  return (
    <>
      <ToolHero kicker={`Community · ${r.post.category}`} title="Post" blurb={`By @${r.post.author.handle}`} />
      <section className="rk-container grid max-w-3xl gap-4 py-8 md:py-12">
        <div className="flex justify-end"><LiveRefresh ms={20000} /></div>
        <Link href="/community" className="text-sm underline">← All posts</Link>
        {r.post.replyTo ? <p className="text-xs opacity-80">This is a reply. <Link className="underline" href={`/community/${rootId}`}>Open the conversation</Link></p> : null}
        <ul className="grid gap-3"><PostCard p={r.post} now={now} detail /></ul>
        <h2 className="rk-h2 text-lg">Replies ({r.replies.length})</h2>
        <Composer replyTo={rootId} compact />
        {r.replies.length ? <ul className="grid gap-3" data-testid="replies">{r.replies.map((p) => <PostCard key={p.id} p={p} now={now} detail />)}</ul> : <p className="text-sm opacity-80">No replies yet.</p>}
      </section>
    </>
  );
}
