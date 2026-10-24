import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StubPage } from "@/components/stub/stub-page";

export const metadata: Metadata = { title: "Token detail" };

export default async function Page({ params }: PageProps<"/token/[mint]">) {
  const { mint } = await params;
  // Phase 7 replaces this with strict base58 / 32-byte validation.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(mint)) notFound();
  return (
    <StubPage path="/token/example" variant="dash">
      <p className="mt-5 break-all font-mono text-xs text-muted-foreground">Requested mint: {mint}</p>
    </StubPage>
  );
}
