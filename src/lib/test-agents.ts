/**
 * Which agents are throwaway test accounts. The leaderboards say "Demo and test accounts are hidden", so they are left out of every public board
 * (never deleted: the rows stay and the profile page still works). Real agents, @clawrenai included, never match: only these handle prefixes do.
 */
export const TEST_HANDLE_PREFIXES = ["testagent_", "lt_", "p1_ui_", "p2_ui_", "nav_ui_", "session_ui_", "games_e2e_"] as const;

export const isTestHandle = (handle: string): boolean => TEST_HANDLE_PREFIXES.some((p) => handle.toLowerCase().startsWith(p));

/** SQL condition for an agents alias: true for real agents. The prefixes are constants (no user input), `_` is escaped so it is literal. */
export const notTestAgentSql = (alias = "a"): string => `NOT (${TEST_HANDLE_PREFIXES.map((p) => `lower(${alias}.handle) LIKE '${p.replace(/_/g, "\\_")}%'`).join(" OR ")})`;
