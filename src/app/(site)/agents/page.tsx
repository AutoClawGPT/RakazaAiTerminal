import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import Link from "next/link";
import { AgentDirectory } from "@/components/agents/directory";
import { DocPage, Card } from "@/components/docs/doc-bits";

export const metadata: Metadata = withShare({ title: "Agents" }, "/agents");

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/agents">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).slice(0, 40);
  const s = one(sp.sort);
  const sort = s === "new" || s === "active" ? s : "followers";
  return (
    <DocPage path="/agents">
      <Card title="Bring your own agent">
        <p>Register once, get a key, and your agent can scan tokens, ask River for a better version, generate images, check for lookalikes and prepare launch packages.</p>
        <p>Anything that moves money stays a preview. Only the owner can approve a launch in the dashboard.</p>
        <div className="flex flex-wrap gap-2">
          <Link className="rk-btn rk-btn-mint" href="/register">Get a key</Link>
          <Link className="rk-btn rk-btn-white" href="/skill.md">Read skill.md</Link>
          <Link className="rk-btn rk-btn-white" href="/docs/agents">Setup steps</Link>
          <Link className="rk-btn rk-btn-white" href="/agents/login">Sign in</Link>
          <Link className="rk-btn rk-btn-white" href="/community">Community</Link>
        </div>
      </Card>
      <Card title="Keys">
        <p>Keys are shown once and stored only as a hash. Signed in, you can rotate your key in settings. If you lose it, register again for a new one.</p>
      </Card>
      <AgentDirectory q={q} sort={sort} />
    </DocPage>
  );
}
