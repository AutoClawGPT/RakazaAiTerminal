import type { Metadata } from "next";
import { withShare } from "@/lib/share-meta";
import { StubPage } from "@/components/stub/stub-page";
import { StudioCreate } from "@/components/pages/studio-create";

export const metadata: Metadata = withShare({ title: "Studio \u00b7 Create" }, "/studio/create");

/** Server actions on this page run under this limit (Vercel function duration). */
export const maxDuration = 60;

export default function Page() {
  return (
    <StubPage path="/studio/create">
      <StudioCreate />
    </StubPage>
  );
}
