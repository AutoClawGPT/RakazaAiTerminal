import data from "./routes-data.json";

export type Access = "P" | "U" | "O" | "A" | "OA";
export type Group = "account" | "site" | "studio" | "games" | "docs" | "legal" | "dash" | "system";

export interface RouteDef {
  path: string;
  title: string;
  label: string;
  group: Group;
  access: Access;
  phase: number;
  kicker: string;
  blurb: string;
  bullets: string[];
  hidden?: boolean;
  raw?: boolean;
  api?: boolean;
}

export const PHASES = data.phases as Record<string, string>;
export const ROUTES = data.routes as RouteDef[];

export function phaseName(n: number): string {
  return PHASES[String(n)] ?? `Phase ${n}`;
}

export function getRoute(path: string): RouteDef {
  const r = ROUTES.find((x) => x.path === path);
  if (!r) throw new Error(`Unknown route in routes-data.json: ${path}`);
  return r;
}

export const ACCESS_LABEL: Record<Access, string> = {
  P: "Public",
  U: "Signed-in user",
  O: "Owner only",
  A: "Agent key",
  OA: "Owner + agent",
};

/** Paths that need an owner session or an agent bearer key (default deny). */
export function isProtectedPath(pathname: string): boolean {
  if (pathname === "/mcp" || pathname.startsWith("/api/v1/") || pathname.startsWith("/api/agent") || pathname.startsWith("/api/owner")) {
    return true;
  }
  return ROUTES.some((r) => r.access !== "P" && r.group !== "system" && (r.path === pathname || (r.path === "/token/example" && pathname.startsWith("/token/"))));
}

/** Pages shown in the public desktop nav pills (agi1: 6 pills). */
export const PRIMARY_NAV: { href: string; label: string }[] = [
  { href: "/#evaluations", label: "Evaluations" },
  { href: "/#model-card", label: "Model card" },
  { href: "/#playground", label: "Playground" },
  { href: "/#checker", label: "Risk check your coins on pump.fun" },
  { href: "/diary", label: "Diary" },
  { href: "/memes", label: "Memes" },
];

export const publicMenu = (): { title: string; items: RouteDef[] }[] => {
  const vis = ROUTES.filter((r) => (r.access === "P" || r.access === "U") && !r.hidden && !r.api && !r.raw);
  const by = (g: Group[]) => vis.filter((r) => g.includes(r.group));
  return [
    { title: "Her world", items: by(["site"]) },
    { title: "Join", items: by(["account"]) },
    { title: "Games", items: by(["games"]) },
    { title: "Studio", items: by(["studio"]) },
    { title: "Docs", items: [...by(["docs"]), ...ROUTES.filter((r) => r.path === "/skill.md")] },
    { title: "Legal", items: by(["legal"]) },
  ].filter((g) => g.items.length > 0);
};

export const dashMenu = (): { title: string; items: RouteDef[] }[] => {
  const vis = ROUTES.filter((r) => r.group === "dash" && !r.hidden);
  const pick = (paths: string[]) => paths.map((p) => vis.find((r) => r.path === p)).filter((r): r is RouteDef => Boolean(r));
  return [
    { title: "Control room", items: pick(["/dash", "/launch", "/vanity", "/splits", "/shield", "/lab"]) },
    { title: "Money", items: pick(["/vault", "/fees", "/trade", "/rewards", "/revenue", "/history"]) },
    { title: "Intelligence", items: pick(["/explore", "/scanner", "/dash/agents"]) },
    { title: "System", items: pick(["/infra", "/settings"]) },
  ];
};
