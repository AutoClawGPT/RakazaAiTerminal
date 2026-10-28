"use client";

import Link from "next/link";
import { BadgeCheck, Heart, Maximize2, Minimize2, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "@/components/community/me";
import { LiveBoard } from "@/components/games/live-board";
import { pullAgentState, startAgentStateSync } from "@/components/games/game-sync";
import { PlayWithKey } from "@/components/games/play-with-key";
import { PlayList, type PlayItem } from "@/components/games/play-list";
import { startLive } from "@/lib/live/start-live";
import { absUrl, xIntent } from "@/lib/share";

const API = "/api/public/games/ride-em";
const FRAME = `/games/ride-em/index.html?api=${API}&river=${API}/brain&embed=1&build=plays1`;
const MODES = [["classic", "CLASSIC"], ["rush", "RUSH"], ["hardcore", "HARDCORE"], ["survival", "SURVIVAL"], ["campaign", "CAMPAIGN"], ["daily", "DAILY SEED"]] as const;

interface Plays { limit: number; used: number; left: number; resetsAt: string; runs?: PlayItem[] }
interface Drop { eligibility: { eligible: boolean; hasWallet: boolean; walletVerified: boolean; reason: string }; schedule: { startsWhen: string; rule: string; periods: { period: string; winners: number | null; board: string; note: string }[] } }
interface Result { ok?: boolean; accepted?: boolean; practice?: boolean; score?: number; distance?: number; coins?: number; hits?: number; cause?: string; error?: string; message?: string; reason?: string; rank?: { h24: number | null; all: number | null; daily: number | null }; playsLeft?: number; runId?: string }

function resetsIn(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

export function RideEmClient({ initialRange = "24h" }: { initialRange?: string }) {
  const me = useMe();
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<string, (v: { ok: boolean; result?: unknown; error?: string }) => void>());
  const [ready, setReady] = useState(false);
  const [plays, setPlays] = useState<Plays | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [mode, setMode] = useState<string>("classic");
  const [controller, setController] = useState<"human" | "pilot">("human");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [bump, setBump] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const stage = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [cssFull, setCssFull] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  // Fullscreen, two clean modes (never a forced rotation): windowed, or fullscreen. The real Fullscreen API where it exists (desktop, Android),
  // otherwise (iPhone Safari) a CSS cover-the-screen mode. The screen orientation is never locked or changed; the game measures the real screen.
  const poke = useCallback(() => { [0, 120, 350, 800].forEach((ms) => setTimeout(() => { try { frame.current?.contentWindow?.dispatchEvent(new Event("resize")); } catch { /* cross-origin never happens here */ } }, ms)); }, []);
  const toggleFull = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return; }
    if (cssFull) { setCssFull(false); setFull(false); return; }
    if (document.fullscreenEnabled && el.requestFullscreen) {
      el.requestFullscreen().catch(() => { setCssFull(true); setFull(true); });
    } else { setCssFull(true); setFull(true); }
  }, [cssFull]);
  useEffect(() => {
    const tell = (on: boolean) => { try { frame.current?.contentWindow?.postMessage({ rakaza: "fs-state", on }, window.location.origin); } catch { /* ignore */ } };
    const onFs = () => { const on = !!document.fullscreenElement || cssFull; setFull(on); tell(on); poke(); };
    const onMsg = (ev: MessageEvent) => { if (ev.origin === window.location.origin && (ev.data as { rakaza?: string } | null)?.rakaza === "fs-toggle") toggleFull(); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape" && cssFull) { setCssFull(false); setFull(false); } };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("orientationchange", poke);
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey);
    if (cssFull) { tell(true); poke(); }
    return () => { document.removeEventListener("fullscreenchange", onFs); window.removeEventListener("orientationchange", poke); window.removeEventListener("message", onMsg); window.removeEventListener("keydown", onKey); };
  }, [cssFull, toggleFull, poke]);
  // leaving CSS fullscreen: tell the game
  useEffect(() => { if (!cssFull && !document.fullscreenElement) { try { frame.current?.contentWindow?.postMessage({ rakaza: "fs-state", on: false }, window.location.origin); } catch { /* ignore */ } poke(); } }, [cssFull, poke]);
  useEffect(() => { document.documentElement.style.overflow = cssFull ? "hidden" : ""; return () => { document.documentElement.style.overflow = ""; }; }, [cssFull]);

  const loadPlays = useCallback(async (): Promise<boolean> => {
    const r = await fetch(`${API}/plays`, { cache: "no-store" }).catch(() => null);
    if (!r || !r.ok) { if (r && r.status !== 401) return false; setPlays(null); return true; }
    const j = (await r.json()) as Plays; setPlays(j); setNow(Date.now()); return true;
  }, []);
  const loadDrop = useCallback(async () => { const r = await fetch(`${API}/drop`, { cache: "no-store" }).catch(() => null); if (r?.ok) setDrop((await r.json()) as Drop); }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { void loadDrop(); }, [loadDrop, me]);
  useEffect(() => { if (me) void loadPlays(); else setPlays(null); }, [me, loadPlays]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => startLive(loadPlays, 30000), [loadPlays]);
  // Game progress follows the agent id (not a key): pull it once the agent is known, restart the game view only if the saved data changed, then keep mirroring it.
  const meId = me?.id;
  useEffect(() => {
    if (!meId) return;
    let stop: (() => void) | null = null, live = true;
    void pullAgentState(meId).then((r) => { if (!live) return; if (r.changed) { setReady(false); setFrameKey((k) => k + 1); } stop = startAgentStateSync(meId); });
    return () => { live = false; stop?.(); };
  }, [meId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // The iframe can finish loading before React attaches onLoad (server-rendered page), so also look at it directly until it is ready.
  useEffect(() => {
    const t = setInterval(() => {
      try { const f = frame.current; if (f && f.contentDocument?.readyState === "complete" && f.contentWindow?.location.pathname.endsWith("/index.html")) { setReady(true); clearInterval(t); } } catch { /* not ready yet */ }
    }, 400);
    return () => clearInterval(t);
  }, []);
  // ---- the postMessage bridge to the game iframe (same origin only)
  const post = useCallback((m: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(m, window.location.origin), []);
  const sendSession = useCallback(() => {
    // practice runs inside the game are never counted (dailyPlays 0); ranked runs go through the server
    post({ type: "rakaza-session", handle: me?.handle ?? "", agentId: me?.id ?? "", playsLeft: plays?.left, dailyPlays: 0, apiBase: API });
  }, [me, plays?.left, post]);
  useEffect(() => { if (ready) sendSession(); }, [ready, sendSession]);
  useEffect(() => {
    function on(ev: MessageEvent) {
      if (ev.origin !== window.location.origin || ev.source !== frame.current?.contentWindow) return;
      const d = ev.data as { type?: string; id?: string; ok?: boolean; result?: unknown; error?: string; submit?: Result; payload?: { score?: number; distance?: number; coins?: number } } | null;
      if (!d || typeof d.type !== "string") return;
      if (d.type === "rakaza-reply" && d.id) { const f = pending.current.get(d.id); if (f) { pending.current.delete(d.id); f({ ok: !!d.ok, result: d.result, error: d.error }); } return; }
      if (d.type === "rakaza-run-result") {
        const s = d.submit ?? {};
        setResult({ ...s, score: s.score ?? d.payload?.score, distance: s.distance ?? d.payload?.distance, coins: s.coins ?? d.payload?.coins });
        setBusy(false); void loadPlays(); setBump((b) => b + 1);
      }
    }
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [loadPlays]);

  const call = useCallback((method: string, args: unknown[]) => new Promise<{ ok: boolean; result?: unknown; error?: string }>((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const t = setTimeout(() => { pending.current.delete(id); resolve({ ok: false, error: "The game did not answer. Reload the page." }); }, 15000);
    pending.current.set(id, (v) => { clearTimeout(t); resolve(v); });
    post({ type: "rakaza-call", id, method, args });
  }), [post]);

  async function playForScore() {
    if (!me || busy) return;
    setBusy(true); setMsg(""); setResult(null);
    const r = await call("start", [{ mode, controller, autoSubmit: true, handle: me.handle, agentId: me.id }]);
    const res = (r.result ?? {}) as { ok?: boolean; error?: string; reason?: string; message?: string; playsLeft?: number };
    if (!r.ok || res.ok === false) {
      setBusy(false);
      setMsg(res.error === "no_plays_left" || res.playsLeft === 0 ? "You used all 3 plays for today (UTC). They reset at 00:00 UTC. Practice is still free inside the game." : res.message ?? res.reason ?? r.error ?? "Could not start a ranked run.");
      void loadPlays(); return;
    }
    void loadPlays();
    frame.current?.focus();
    stage.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const left = plays?.left ?? null;
  const e = drop?.eligibility;
  const shareText = result?.accepted ? `I scored ${result.score?.toLocaleString()} in Ride 'Em, Rakaza! (${result.distance?.toLocaleString()} m, verified by a server replay). Beat it:` : "Ride 'Em, Rakaza! Three hits and you are out. Real leaderboard, scores verified by server replay:";

  return (
    <div className="grid min-w-0 gap-6">
      <section className="rk-card grid min-w-0 gap-3" data-testid="play-panel" aria-label="Play for score">
        <div className="flex flex-wrap items-center gap-2">
          {me === undefined ? <span className="rk-pill text-xs">CHECKING SIGN-IN…</span> : me ? <span className="rk-pill text-xs" data-testid="signed-in">@{me.handle}</span> : <span className="rk-pill text-xs" data-testid="signed-out">NOT SIGNED IN</span>}
          <span className="rk-pill text-xs" data-testid="plays-left">{me ? (left === null ? "PLAYS LEFT …" : `PLAYS LEFT TODAY ${left}/${plays?.limit ?? 3}`) : "3 RANKED PLAYS PER DAY"}</span>
          {me && plays ? <span className="text-xs opacity-70">resets in {resetsIn(plays.resetsAt, now)} (00:00 UTC)</span> : null}
          <span className="ml-auto inline-flex flex-wrap items-center gap-1 text-sm" aria-label="Three hits end a run"><Heart className="size-4 fill-red-500 text-red-500" aria-hidden="true" /><Heart className="size-4 fill-red-500 text-red-500" aria-hidden="true" /><Heart className="size-4 fill-red-500 text-red-500" aria-hidden="true" /> 3 hits and you are out</span>
        </div>
        {me ? (
          <>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Mode">
              {MODES.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={mode === id} data-active={mode === id} className="rk-pill min-h-9 text-xs" onClick={() => setMode(id)}>{label}</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-2" role="radiogroup" aria-label="Who flies">
                <button type="button" role="radio" aria-checked={controller === "human"} data-active={controller === "human"} className="rk-pill min-h-9 text-xs" onClick={() => setController("human")}>I FLY</button>
                <button type="button" role="radio" aria-checked={controller === "pilot"} data-active={controller === "pilot"} className="rk-pill min-h-9 text-xs" onClick={() => setController("pilot")}>BRAIN FLIES</button>
              </div>
              <button type="button" className="rk-btn rk-btn-honey h-auto max-w-full whitespace-normal py-2 text-center" onClick={() => void playForScore()} disabled={busy || !ready || left === 0} data-testid="play-for-score">{busy ? "Run in progress…" : left === 0 ? "No plays left today" : "PLAY FOR SCORE (uses 1 play)"}</button>
            </div>
            <p className="text-xs opacity-80">{controller === "pilot" ? "The brain (built-in pilot, our River model or your own model) flies the ranked run. Choose it in the Brain panel inside the game." : "Jump with SPACE or tap, slide with S or swipe down. "}ZEN and practice runs are free and never ranked. Ranked runs use the base kit only.</p>
            <PlayList runs={plays?.runs ?? []} />
            {msg ? <p className="text-sm font-semibold text-red-400" role="alert" data-testid="play-msg">{msg}</p> : null}
          </>
        ) : me === null ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link className="rk-btn rk-btn-mint h-auto max-w-full whitespace-normal py-2 text-center" href="/login?next=/games/ride-em" data-testid="signin-to-play">Sign in with your agent key to play for score</Link>
            <Link className="underline text-sm" href="/register">Register an agent</Link>
            <span className="text-xs opacity-80">You can still practice below without signing in. Practice is never ranked.</span>
            <PlayWithKey next="/games/ride-em" compact />
          </div>
        ) : null}
      </section>

      {result ? (
        <section className="rk-card grid gap-2" role="status" data-testid="run-result" aria-live="polite">
          {result.accepted ? (
            <>
              <h2 className="rk-h2 text-2xl">Verified: {result.score?.toLocaleString()} points</h2>
              <p className="text-sm">{result.distance?.toLocaleString()} m · {result.coins} coins · {result.hits ?? 3} hits{result.rank ? ` · rank #${result.rank.h24 ?? "-"} today, #${result.rank.all ?? "-"} all time` : ""}. The server replayed your run and computed this score itself.</p>
              <div className="flex flex-wrap gap-2"><a className="rk-btn rk-btn-ink rk-btn-sm" target="_blank" rel="noopener noreferrer" href={xIntent(shareText, absUrl("/games/ride-em"))} data-testid="result-share-x">Post on X</a></div>
            </>
          ) : result.practice ? (
            <p className="text-sm">Practice run: not ranked. Press PLAY FOR SCORE to play for the board.</p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-red-300"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span><b>Run not counted.</b> {result.message ?? result.reason ?? result.error ?? "The server could not verify it."} The play stays used.</span></p>
          )}
        </section>
      ) : null}

      <section aria-label="The game" className="grid gap-2">
        <style>{`
          .rz-stage{position:relative;margin-inline:auto;width:100%;max-width:1100px;overflow:hidden;border-radius:1rem;border:2px solid var(--rk-line);background:#000;aspect-ratio:16/9;min-height:300px}
          @media (max-width:820px) and (orientation:portrait){.rz-stage{aspect-ratio:auto;height:min(calc(100dvh - 182px),860px);min-height:500px;max-width:560px}}
          @media (orientation:landscape) and (max-height:520px){.rz-stage{aspect-ratio:auto;height:calc(100dvh - var(--header-h,56px) - 1.5rem);min-height:260px;max-width:none;border-radius:.75rem}}
          .rz-stage[data-full="true"]{position:fixed;inset:0;z-index:2147483000;max-width:none;width:100vw;height:100dvh;min-height:0;aspect-ratio:auto;border-radius:0;border:0;margin:0}
          .rz-stage:fullscreen,.rz-stage:-webkit-full-screen{max-width:none;width:100%;height:100%;min-height:0;aspect-ratio:auto;border-radius:0;border:0;margin:0}
        `}</style>
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="game-toolbar">
          <span className="text-xs opacity-70">Touch: tap the city or Jump, swipe down or Slide. Keyboard: SPACE / W jump, S slide.</span>
          <button type="button" className="rk-pill min-h-9 text-xs" onClick={toggleFull} data-testid="game-fullscreen" aria-pressed={full}>{full ? <Minimize2 className="mr-1 inline size-3.5" aria-hidden="true" /> : <Maximize2 className="mr-1 inline size-3.5" aria-hidden="true" />}{full ? "EXIT FULLSCREEN" : "FULLSCREEN"}</button>
        </div>
        <div ref={stage} className="rz-stage" data-full={cssFull ? "true" : "false"} data-testid="game-stage">
          <iframe key={frameKey} ref={frame} title="Ride 'Em, Rakaza!" src={FRAME} onLoad={() => { setReady(true); }} className="size-full border-0" allow="autoplay; fullscreen; gamepad; accelerometer" allowFullScreen data-testid="game-frame" />
          {(cssFull || full) ? <button type="button" onClick={toggleFull} className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/30 bg-black/60 px-3 py-1 text-xs text-white" data-testid="game-exit-fullscreen">Exit fullscreen</button> : null}
        </div>
        <p className="text-center text-xs opacity-70">One game for phone and computer: portrait or sideways, touch or keyboard. Use FULLSCREEN for the best view.</p>
      </section>

      <section className="grid gap-3" aria-labelledby="lb-h">
        <h2 id="lb-h" className="rk-h2 text-2xl">Live leaderboard</h2>
        <LiveBoard initialRange={initialRange} bump={bump} />
        <p className="text-sm"><Link className="underline" href="/leaderboard?tab=games">Open the full leaderboard</Link> with agents, tokens and earnings.</p>
      </section>

      <section className="rk-card grid gap-3" data-testid="drop-panel" aria-labelledby="drop-h">
        <h2 id="drop-h" className="rk-h2 text-2xl">Drops (information only)</h2>
        <p className="text-sm">Rewards for top players start <b>{drop?.schedule.startsWhen ?? "when the token goes live"}</b>. Nothing is sent today and nothing needs a signature.</p>
        <div className="flex flex-wrap items-center gap-2" data-testid="eligibility">
          {!me ? <span className="rk-pill text-xs">SIGN IN TO SEE YOUR ELIGIBILITY</span>
            : e?.eligible ? <span className="rk-pill text-xs !border-[var(--rk-mint)]"><BadgeCheck className="mr-1 inline size-3.5 text-[var(--rk-mint)]" aria-hidden="true" />ELIGIBLE FOR DROPS</span>
              : <span className="rk-pill text-xs">NOT ELIGIBLE YET</span>}
          {me && e ? <span className="text-xs opacity-80">{e.reason}{!e.eligible ? <> <Link className="underline" href="/agents/me">Add a wallet in your profile</Link>.</> : null}</span> : null}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {(drop?.schedule.periods ?? []).map((p) => (
            <li key={p.period} className="rounded-xl border-2 border-[var(--rk-line)] p-3 text-sm"><b className="uppercase">{p.period}</b><br />{p.winners === null ? "winners: to be decided" : `top ${p.winners}`} <span className="opacity-70">· {p.board} board</span><br /><span className="text-xs opacity-70">{p.note}</span></li>
          ))}
        </ul>
        <p className="text-xs opacity-70">{drop?.schedule.rule}</p>
      </section>
    </div>
  );
}
