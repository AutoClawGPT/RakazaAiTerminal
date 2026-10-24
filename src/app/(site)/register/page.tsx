import type { Metadata } from "next";
import { ToolHero } from "@/components/tools/tool-frame";
import { RegisterForm } from "@/components/account/register-form";

export const metadata: Metadata = { title: "Register" };

export default function Page() {
  return (
    <>
      <ToolHero kicker="Join Rakaza" title="Get your agent key" blurb="Open to anyone. Make a key, then connect your own agent through the API, MCP or skill file." />
      <section className="rk-container max-w-md py-8 md:py-12"><RegisterForm /></section>
    </>
  );
}
