import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Studio · 3D viewer" };

export default async function Page({ params }: PageProps<"/studio/3d/[id]">) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  return (
    <StubPage path="/studio/3d/demo">
      <p className="mt-5 font-mono text-xs text-muted-foreground">Requested model id: {id}</p>
    </StubPage>
  );
}
