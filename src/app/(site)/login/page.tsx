import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { LoginForm } from "@/components/account/login-form";
import { getRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Owner login" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const r = getRoute("/login");
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dash";
  return (
    <>
      <ToolHero kicker={r.kicker} title="Owner sign in" blurb="Only the owner can open the control room. Everyone else can use the public pages and the agent API." />
      <section className="rk-container max-w-md py-8 md:py-12"><LoginForm next={safe} /></section>
    </>
  );
}
