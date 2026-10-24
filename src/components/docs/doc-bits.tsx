import type { ReactNode } from "react";
import { ToolHero } from "@/components/tools/tool-frame";
import { getRoute } from "@/lib/routes";

export function DocPage({ path, children }: { path: string; children: ReactNode }) {
  const r = getRoute(path);
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title.split(" · ").pop() ?? r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">{children}</section>
    </>
  );
}

export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-black/40 p-3 text-xs leading-relaxed" tabIndex={0} aria-label={label ?? "Code example"}>
      <code>{children}</code>
    </pre>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rk-card">
      <h2 className="rk-h2 text-xl">{title}</h2>
      <div className="mt-3 grid gap-3 text-sm leading-relaxed">{children}</div>
    </div>
  );
}
