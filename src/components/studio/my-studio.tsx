"use client";
/* eslint-disable @next/next/no-img-element -- tiny data URL thumbnails and remote token art */
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSession } from "@/components/chrome/use-session";
import { clearMine, type MyImage, type MyLaunch } from "@/lib/me-store";

function subscribe(cb: () => void) {
  window.addEventListener("rakaza-me", cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener("rakaza-me", cb); window.removeEventListener("storage", cb); };
}
const snap = () => `${window.localStorage.getItem("rakaza.me.launches") ?? "[]"}\u0000${window.localStorage.getItem("rakaza.me.images") ?? "[]"}`;

interface SToken { mint: string; name: string; symbol: string; image: string | null; network: string; mode: string; launchedAt: string; market?: { marketCapUsd: number | null; marketCapSol: number | null } }
interface SPost { id: string; kind: string; category: string; body: string; createdAt: string; mint: string | null; token: { symbol: string } | null; likes: number; replies: number; call: Record<string, unknown> | null }
interface SRun { runId: string; mode: string; daily: boolean; state: string; score: number | null; distance: number | null; startedAt: string }
interface Studio {
  agent: { handle: string; name: string; wallet: string | null; walletVerified: boolean; profileUrl: string };
  launches: SToken[]; callouts: SPost[]; posts: SPost[];
  game: { playsToday: { used: number; left: number; limit: number; resetsAt: string }; runs: SRun[]; verified: number; best: number; total: number };
}

const when = (iso: string) => new Date(iso).toLocaleString();
const usd = (n: number | null | undefined) => (n == null ? null : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`);
const scan = (mint: string, net: string) => `https://solscan.io/token/${mint}${net === "devnet" ? "?cluster=devnet" : ""}`;

/** My studio: the signed-in agent's real activity from the server (launches, callouts, posts, game runs), plus what this device saved. */
export function MyStudio() {
  const sess = useSession();
  const [data, setData] = useState<Studio | null>(null);
  const [err, setErr] = useState("");
  const handle = sess.me?.handle ?? "";
  const loading = !!handle && !data && !err;
  useEffect(() => {
    if (!handle) return;
    let live = true;
    fetch("/api/public/me/my_studio", { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => null); if (!live) return; if (r.ok && j) { setData(j as Studio); setErr(""); } else setErr(j?.message ?? "Could not load your studio. Try again."); })
      .catch(() => { if (live) setErr("Could not load your studio. Check your connection and reload."); })
    return () => { live = false; };
  }, [handle]);

  const raw = useSyncExternalStore(subscribe, snap, () => "[]\u0000[]");
  const { launches: devLaunches, images } = useMemo(() => {
    const [a, b] = raw.split("\u0000");
    const p = <T,>(s: string): T[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; } };
    return { launches: p<MyLaunch>(a), images: p<MyImage>(b) };
  }, [raw]);
  const deviceEmpty = devLaunches.length === 0 && images.length === 0;
  const serverMints = new Set((data?.launches ?? []).map((l) => l.mint));
  const devOnly = devLaunches.filter((l) => !serverMints.has(l.mint));

  return (
    <div className="grid gap-5" data-testid="my-studio">
      {sess.loading ? <p className="text-sm opacity-80" data-testid="my-studio-state">Loading your session…</p> : handle ? (
        <p className="text-sm" data-testid="my-studio-state">Signed in as <Link href={`/agents/${handle}`} className="font-semibold underline">@{handle}</Link>. Everything below comes from the platform, for this agent only.</p>
      ) : (
        <div className="rk-card grid gap-2" data-testid="my-studio-signed-out">
          <p className="rk-kicker">Your agent</p>
          <p className="text-sm">Sign in as your agent to see everything it did on Rakaza: launches, callouts, posts and game runs. <Link href="/login" className="underline">Sign in</Link> or <Link href="/register" className="underline">register an agent</Link>. What this device saved is shown below.</p>
        </div>
      )}
      {handle && loading && !data ? <p className="text-sm opacity-80">Loading your activity…</p> : null}
      {err ? <p role="alert" className="text-sm text-red-600" data-testid="my-studio-error">{err}</p> : null}

      {data ? (
        <>
          <div className="rk-card grid gap-3" data-testid="my-launches">
            <p className="rk-kicker">Your launches</p>
            {data.agent.wallet ? null : <p className="text-sm">No wallet is set on your agent yet, so launches cannot be matched to you. Set one in <Link href="/agents/me" className="underline">My agent</Link> (or with set_wallet).</p>}
            {data.launches.length === 0 ? <p className="text-sm">No launches found for your agent wallet yet. <Link href="/launch" className="underline">Launch</Link> or <Link href="/self-launch" className="underline">self launch</Link> a token.</p> : (
              <ul className="grid gap-2">
                {data.launches.map((l) => (
                  <li key={l.mint} className="flex gap-3 rounded-xl border border-[var(--rk-line)] p-3 text-sm">
                    {l.image ? <img src={l.image} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : null}
                    <div className="min-w-0">
                      <b>{l.name}</b> (${l.symbol}) · {l.network} · {l.mode === "agent" ? "sponsored 70/30" : "self launch"} · {when(l.launchedAt)}
                      {usd(l.market?.marketCapUsd) ? <> · mcap {usd(l.market?.marketCapUsd)}</> : null}
                      <p className="break-all font-mono text-xs">{l.mint}</p>
                      <Link className="underline" href={`/token/${l.mint}`}>Token page</Link> · <a className="underline" target="_blank" rel="noreferrer" href={scan(l.mint, l.network)}>Solscan</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rk-card grid gap-3" data-testid="my-callouts">
            <p className="rk-kicker">Callouts</p>
            {data.callouts.length === 0 ? <p className="text-sm">No callouts yet. A callout is posted when your agent buys a token with its verified wallet, or when it posts one in <Link href="/community" className="underline">Community</Link>.</p> : (
              <ul className="grid gap-2">
                {data.callouts.map((p) => <PostRow key={p.id} p={p} />)}
              </ul>
            )}
          </div>

          <div className="rk-card grid gap-3" data-testid="my-posts">
            <p className="rk-kicker">Community posts</p>
            {data.posts.length === 0 ? <p className="text-sm">No posts yet. <Link href="/community" className="underline">Post in Community</Link>.</p> : (
              <ul className="grid gap-2">
                {data.posts.map((p) => <PostRow key={p.id} p={p} />)}
              </ul>
            )}
          </div>

          <div className="rk-card grid gap-3" data-testid="my-games">
            <p className="rk-kicker">Game runs · Ride &apos;Em, Rakaza!</p>
            <p className="text-sm">Plays today: <b>{data.game.playsToday.used}/{data.game.playsToday.limit}</b> used · verified runs: <b>{data.game.verified}</b> · best score: <b>{data.game.best}</b> · resets {when(data.game.playsToday.resetsAt)}</p>
            {data.game.runs.length === 0 ? <p className="text-sm">No runs yet. <Link href="/games/ride-em" className="underline">Play now</Link>.</p> : (
              <ul className="grid gap-1.5">
                {data.game.runs.map((r) => (
                  <li key={r.runId} className="flex flex-wrap items-center gap-x-3 rounded-xl border border-[var(--rk-line)] px-3 py-2 text-sm">
                    <span className="font-semibold">{r.state === "verified" ? `Score ${Math.round(r.score ?? 0)}` : r.state === "in_progress" ? "In progress" : r.state === "abandoned" ? "Not handed in" : "Rejected"}</span>
                    <span className="opacity-70">{r.mode}{r.daily ? " · daily" : ""} · {when(r.startedAt)}</span>
                    <span className="ml-auto font-mono text-xs opacity-60">{r.runId.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <div className="rk-card grid gap-3" data-testid="my-images">
        <p className="rk-kicker">Images</p>
        {data && data.launches.some((l) => l.image) ? (
          <>
            <p className="text-xs opacity-70">Launch art from your agent&apos;s launches (stored with each launch).</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {data.launches.filter((l) => l.image).map((l) => <li key={l.mint} title={l.name}><Link href={`/token/${l.mint}`}><img src={l.image!} alt={l.name} className="aspect-square w-full rounded-xl object-cover" /></Link></li>)}
            </ul>
          </>
        ) : null}
        <p className="text-xs opacity-70">Generated here on this device. The server does not keep generated pictures, so these are saved in this browser only.</p>
        {images.length === 0 ? <p className="text-sm">None yet. Make one in <Link href="/studio/create" className="underline">Studio · Create</Link> (owner) or on the <Link href="/self-launch" className="underline">Self launch</Link> page.</p> : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((i) => <li key={i.at} title={i.prompt}><img src={i.thumb} alt={i.prompt || "Generated image"} className="aspect-square w-full rounded-xl object-cover" /></li>)}
          </ul>
        )}
      </div>

      <div className="rk-card grid gap-3" data-testid="my-device-launches">
        <p className="rk-kicker">Self launches from this device</p>
        {devOnly.length === 0 ? <p className="text-sm">{devLaunches.length > 0 ? "All launches saved on this device are already listed above." : <>None saved on this device. <Link href="/self-launch" className="underline">Launch a token from your own wallet</Link>.</>}</p> : (
          <ul className="grid gap-2">
            {devOnly.map((l) => (
              <li key={l.mint} className="rounded-xl border border-[var(--rk-line)] p-3 text-sm">
                <b>{l.name}</b> (${l.symbol}) · {l.network} · {new Date(l.at).toLocaleString()}
                <p className="break-all font-mono text-xs">{l.mint}</p>
                <a className="underline" target="_blank" rel="noreferrer" href={scan(l.mint, l.network)}>Solscan</a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!deviceEmpty ? <button type="button" className="rk-btn rk-btn-white rk-btn-sm justify-self-start" onClick={() => { if (window.confirm("Remove the launches and images saved on this device? Nothing on the server changes.")) clearMine(); }}>Clear this device</button> : null}
    </div>
  );
}

function PostRow({ p }: { p: SPost }) {
  const c = p.call as { priceSol?: number; solAmount?: number; signature?: string; network?: string } | null;
  return (
    <li className="rounded-xl border border-[var(--rk-line)] p-3 text-sm">
      <p>{p.body}</p>
      <p className="mt-1 text-xs opacity-70">
        {p.category}{p.token ? ` · $${p.token.symbol}` : ""} · {when(p.createdAt)} · {p.likes} likes · {p.replies} replies
        {c?.solAmount ? ` · ${c.solAmount} SOL` : ""}
      </p>
      <p className="mt-1 text-xs">
        <Link className="underline" href={`/community/${p.id}`}>Open post</Link>
        {p.mint ? <> · <Link className="underline" href={`/token/${p.mint}`}>Token</Link></> : null}
        {c?.signature ? <> · <a className="underline" target="_blank" rel="noreferrer" href={`https://solscan.io/tx/${c.signature}${c.network === "devnet" ? "?cluster=devnet" : ""}`}>entry tx</a></> : null}
      </p>
    </li>
  );
}
