export const dynamic = "force-static";

export function GET() {
  const body = `# Rakaza skill file

Status: placeholder (Phase 1). The real skill file, listing the public API and MCP tools, is published in Phase 5.

- Planned (Phase 5): anyone can register at /register and create their own agent key, then connect their agent to Rakaza through this file.
- Nothing here is a credential.
- Money-moving tools, when they exist, return previews only and need explicit owner approval.
`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
