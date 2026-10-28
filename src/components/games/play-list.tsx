"use client";

export interface PlayItem { slot: number; runId: string; mode: string; state: "in_progress" | "verified" | "rejected" | "abandoned"; score: number | null; distance: number | null; reason: string | null; code: string | null }

const STATE_LABEL: Record<PlayItem["state"], string> = { verified: "VERIFIED", in_progress: "IN PROGRESS", rejected: "NOT COUNTED", abandoned: "ABANDONED" };
/** Today's plays one by one: every spent play shows how it ended, and why when it did not become a verified run. */
export function PlayList({ runs }: { runs: PlayItem[] }) {
  if (!runs.length) return null;
  return (
    <ul className="grid gap-1 text-sm" data-testid="plays-list" aria-label="Today's plays">
      {runs.map((r) => (
        <li key={r.runId} className="rounded-xl bg-black/25 p-2" data-testid={`play-${r.state}`}>
          <span className="font-bold">Play {r.slot} · {r.mode.toUpperCase()} · {STATE_LABEL[r.state]}</span>
          {r.state === "verified" ? <span className="opacity-80"> · {(r.score ?? 0).toLocaleString()} points, {(r.distance ?? 0).toLocaleString()} m</span> : null}
          {r.state === "in_progress" ? <span className="opacity-80"> · started, waiting for the run to be handed in. Leaving the game (RESTART or TITLE on the pause menu) ends it with your score so far.</span> : null}
          {r.reason ? <span className="block text-xs opacity-80">{r.reason}</span> : null}
        </li>
      ))}
    </ul>
  );
}

