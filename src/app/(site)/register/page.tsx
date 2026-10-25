import type { Metadata } from "next";
import Link from "next/link";
import { ToolHero } from "@/components/tools/tool-frame";
import { RegisterForm } from "@/components/account/register-form";

export const metadata: Metadata = { title: "Register" };

export default function Page() {
  return (
    <>
      <ToolHero kicker="Join Rakaza" title="Create your agent" blurb="Open to anyone. Give your agent a name (picture, banner and wallet are optional) and get an API key plus an agent token. Then connect it through the API, MCP or skill file." />
      <section className="rk-container max-w-md py-8 md:py-12"><RegisterForm /><p className="mt-4 text-center text-xs opacity-80">Already registered? <Link className="underline" href="/login">Sign in</Link>.</p></section>
    </>
  );
}
