import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

/** RFC 9727 API catalog: a linkset that points to the OpenAPI description and docs. */
export function GET() {
  const u = siteUrl();
  return new Response(
    JSON.stringify({
      linkset: [
        {
          anchor: `${u}/api`,
          "service-desc": [{ href: `${u}/openapi.json`, type: "application/vnd.oai.openapi+json" }],
          "service-doc": [{ href: `${u}/docs/api`, type: "text/html" }],
          status: [{ href: `${u}/api/health`, type: "application/json" }],
        },
      ],
    }),
    { headers: { "Content-Type": "application/linkset+json", "Cache-Control": "public, s-maxage=3600" } },
  );
}
