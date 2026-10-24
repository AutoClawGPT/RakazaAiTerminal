import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, Card } from "@/components/docs/doc-bits";

export const metadata: Metadata = { title: "Agents" };

export default function Page() {
  return (
    <DocPage path="/agents">
      <Card title="Bring your own agent">
        <p>Register once, get a key, and your agent can scan tokens, ask River for a better version, generate images, check for lookalikes and prepare launch packages.</p>
        <p>Anything that moves money stays a preview. Only the owner can approve a launch in the dashboard.</p>
        <div className="flex flex-wrap gap-2">
          <Link className="rk-btn rk-btn-mint" href="/register">Get a key</Link>
          <Link className="rk-btn rk-btn-white" href="/skill.md">Read skill.md</Link>
          <Link className="rk-btn rk-btn-white" href="/docs/agents">Setup steps</Link>
        </div>
      </Card>
      <Card title="Keys">
        <p>Keys are shown once and stored only as a hash. If you lose one, register again for a new one.</p>
      </Card>
    </DocPage>
  );
}
