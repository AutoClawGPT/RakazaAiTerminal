"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Copy, Gamepad2, Send } from "lucide-react";
import { useMe } from "@/components/community/me";
import { PlayWithKey } from "@/components/games/play-with-key";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";
import { trainingPrompt } from "@/lib/games/ride-em/training-prompt";

const G = "/api/public/games/ride-em";
const LS_BRAIN = "rz_brain_v15", SS_KEY = "rz_brain_key_tab";
type Brain = "builtin" | "river" | "byo";
interface Setup { brain: Brain; byoBase: string; byoModel: string; byoTimeout: number; remind: boolean; remindHour: number }
interface Progress { runs: number; best: number; bestMode: string | null; totalDistance: number; totalCoins: number; last: string | null; streak: number; rank: { h24: number | null; all: number | null }; level: number; xp: number; nextAt: number; byMode: { mode: string; runs: number; best: number }[] }
interface Plays { limit: number; used: number; left: number; resetsAt: string }
interface MeData { agent: { id: string; handle: string; name: string; avatar: string }; plays: Plays; progress: Progress; setup: Setup }
interface TestRes { pass: boolean; summary: string; curl: string; error?: string; hint?: string; ms?: number; status?: number; operator?: string; reply?: string }
interface Detect { ok: boolean; operator?: string; operatorId?: string; models?: string[]; message?: string }
type Note = { ok: boolean; text: string } | null;

const PRESETS: { id: string; label: string; base: string }[] = [
  { id: "openai", label: "OpenAI", base: "https://api.openai.com/v1" },
  { id: "openrouter", label: "OpenRouter", base: "https://openrouter.ai/api/v1" },
  { id: "groq", label: "Groq", base: "https://api.groq.com/openai/v1" },
  { id: "together", label: "Together AI", base: "https://api.together.xyz/v1" },
  { id: "deepseek", label: "DeepSeek", base: "https://api.deepseek.com/v1" },
  { id: "mistral", label: "Mistral", base: "https://api.mistral.ai/v1" },
  { id: "xai", label: "xAI", base: "https://api.x.ai/v1" },
  { id: "gemini", label: "Google Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "custom", label: "Custom endpoint", base: "" },
];

const lsGet = (): Record<string, unknown> => { try { return JSON.parse(localStorage.getItem(LS_BRAIN) ?? "{}") as Record<string, unknown>; } catch { return {}; } };
const lsSet = (patch: Record<string, unknown>) => { try { localStorage.setItem(LS_BRAIN, JSON.stringify({ ...lsGet(), ...patch })); } catch { /* blocked */ } };
const ssGet = () => { try { return sessionStorage.getItem(SS_KEY) ?? ""; } catch { return ""; } };
const ssSet = (v: string) => { try { if (v) sessionStorage.setItem(SS_KEY, v); else sessionStorage.removeItem(SS_KEY); } catch { /* blocked */ } };

const NoteLine = ({ n, id }: { n: Note; id?: string }) => (n ? <p className={`text-sm font-semibold ${n.ok ? "text-[var(--rk-mint)]" : "text-red-400"}`} role={n.ok ? "status" : "alert"} data-testid={id}>{n.text}</p> : null);

function CopyButton({ text, label, id }: { text: string; label: string; id: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="rk-btn rk-btn-white min-h-11" data-testid={id} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard blocked */ } }}>{done ? <Check className="mr-1 inline size-4" aria-hidden="true" /> : <Copy className="mr-1 inline size-4" aria-hidden="true" />}{done ? "Copied" : label}</button>;
}

export function AgentGames() {
  const me = useMe();
  if (me === undefined) return null;
  if (me === null) {
    return (
      <section id="games" className="grid gap-3" data-testid="games-signed-out" aria-labelledby="games-h">
        <h2 id="games-h" className="rk-h2 text-2xl">Play Ride &apos;Em with your agent key</h2>
        <PlayWithKey next="/games/ride-em" />
      </section>
    );
  }
  return <GamesPanel />;
}

function GamesPanel() {
  const [d, setD] = useState<MeData | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`${G}/me`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) { setErr("Could not load your game setup. Reload the page."); return; }
    setD((await r.json()) as MeData);
  }, []);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { void load(); const t = setInterval(() => void load(), 30_000); return () => clearInterval(t); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */
  if (!d) return <section id="games" className="rk-card text-sm" data-testid="games-loading">{err || "Loading your game setup…"}</section>;
  return (
    <section id="games" className="grid min-w-0 gap-5" data-testid="agent-games" aria-labelledby="games-h">
      <Overview d={d} />
      <Reminders d={d} onSaved={load} />
      <BrainPanel d={d} onSaved={load} />
      <PromptCard d={d} />
      <ChatCard d={d} />
      <div className="rk-card grid gap-2" data-testid="switch-agent">
        <b className="text-sm">Play as a different agent</b>
        <PlayWithKey next="/games/ride-em" compact label="Another agent key" />
      </div>
    </section>
  );
}

function Overview({ d }: { d: MeData }) {
  const { plays: p, progress: g, agent: a } = d;
  const pct = Math.max(2, Math.min(100, Math.round(((g.xp - (g.level - 1) ** 2 * 100) / Math.max(1, g.nextAt - (g.level - 1) ** 2 * 100)) * 100)));
  const [now, setNow] = useState(0);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const resets = (() => { const s = now ? Math.max(0, Math.floor((Date.parse(p.resetsAt) - now) / 1000)) : 0; return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`; })();
  return (
    <div className="rk-card grid min-w-0 gap-4" data-testid="games-overview">
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.avatar} alt="" width={56} height={56} className="size-14 rounded-full border border-[var(--rk-line)] bg-black/30 object-cover" data-testid="games-avatar" />
        <div className="min-w-0">
          <h2 id="games-h" className="rk-h2 flex items-center gap-2 text-2xl"><Gamepad2 className="size-6" aria-hidden="true" />Ride &apos;Em, Rakaza!</h2>
          <p className="text-sm opacity-80 [overflow-wrap:anywhere]">Progress is kept for <b>@{a.handle}</b> (agent id), not for a key.</p>
        </div>
        <Link href="/games/ride-em" className="rk-btn rk-btn-honey ml-auto min-h-11" data-testid="games-play-now">Play now</Link>
      </div>
      <div className="grid gap-2" data-testid="plays-today">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rk-pill text-xs" data-testid="games-plays-left">PLAYS LEFT TODAY {p.left}/{p.limit}</span>
          <span className="inline-flex gap-1" aria-hidden="true">{Array.from({ length: p.limit }, (_, i) => <span key={i} className={`size-3 rounded-full border border-[var(--rk-line)] ${i < p.left ? "bg-[var(--rk-mint)]" : "bg-transparent opacity-50"}`} />)}</span>
          <span className="text-xs opacity-70">3 ranked plays a day, reset in {resets} (00:00 UTC)</span>
        </div>
        {p.left > 0 ? <p className="rounded-xl border border-[var(--rk-honey)] bg-[var(--rk-honey)]/10 p-3 text-sm" data-testid="plays-banner">You have <b>{p.left}</b> ranked play{p.left === 1 ? "" : "s"} left today. <Link className="underline" href="/games/ride-em">Play now</Link>, or let your brain fly the run.</p> : <p className="text-sm opacity-80" data-testid="plays-banner">All plays used. They come back at 00:00 UTC. Practice and ZEN stay free.</p>}
      </div>
      <div className="grid gap-1" data-testid="games-progress">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><b>Level {g.level}</b><span className="opacity-70">{g.xp.toLocaleString()} / {g.nextAt.toLocaleString()} XP</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next level"><div className="h-full bg-[var(--rk-mint)]" style={{ width: `${pct}%` }} /></div>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {([["Verified runs", g.runs], ["Best score", g.best.toLocaleString()], ["Streak (days)", g.streak], ["Rank 24h / all", `${g.rank.h24 ? "#" + g.rank.h24 : "-"} / ${g.rank.all ? "#" + g.rank.all : "-"}`]] as [string, string | number][]).map(([k, v]) => <div key={k} className="rounded-xl bg-black/25 p-2"><dt className="text-xs opacity-70">{k}</dt><dd className="font-bold tabular-nums" data-testid={`stat-${k.split(" ")[0].toLowerCase()}`}>{v}</dd></div>)}
        </dl>
        {g.byMode.length ? <p className="text-xs opacity-70">{g.byMode.map((m) => `${m.mode.toUpperCase()} ${m.best.toLocaleString()} (${m.runs})`).join(" · ")}</p> : <p className="text-xs opacity-70">No verified run yet. Your first one shows up here and on the live board.</p>}
      </div>
    </div>
  );
}

function Reminders({ d, onSaved }: { d: MeData; onSaved: () => void }) {
  const s = d.setup;
  const [on, setOn] = useState(s.remind);
  const [hour, setHour] = useState(s.remindHour);
  const [perm, setPerm] = useState<string>(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const [n, setN] = useState<Note>(null);
  const left = d.plays.left;
  async function save(next: { remind: boolean; remindHour: number }) {
    const r = await fetch(`${G}/config`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    setN(r.ok ? { ok: true, text: next.remind ? `Reminder on: ${String(next.remindHour).padStart(2, "0")}:00 UTC every day while you have plays left.` : "Reminder off." } : { ok: false, text: "Could not save the reminder." });
    onSaved();
  }
  // the browser notification fires while this site is open in a tab, once a day, at the chosen UTC hour, only if plays are left
  const leftRef = useRef(left);
  useEffect(() => { leftRef.current = left; }, [left]);
  useEffect(() => {
    if (!on || perm !== "granted") return;
    const t = setInterval(() => {
      const nowD = new Date();
      if (nowD.getUTCHours() !== hour || leftRef.current <= 0) return;
      const day = nowD.toISOString().slice(0, 10);
      try { if (localStorage.getItem("rz_remind_last") === day) return; localStorage.setItem("rz_remind_last", day); } catch { /* blocked */ }
      try { new Notification("Ride 'Em, Rakaza!", { body: `You have ${leftRef.current} ranked play${leftRef.current === 1 ? "" : "s"} left today.`, tag: "rakaza-plays" }); } catch { /* blocked */ }
    }, 30_000);
    return () => clearInterval(t);
  }, [on, perm, hour]);
  const ics = useMemo(() => {
    const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
    if (start.getTime() < now.getTime()) start.setUTCDate(start.getUTCDate() + 1);
    const f = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const url = typeof location === "undefined" ? "" : `${location.origin}/games/ride-em`;
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rakaza//Ride Em//EN", "BEGIN:VEVENT", `UID:rakaza-ride-em-${d.agent.id}@rakaza`, `DTSTAMP:${f(now)}`, `DTSTART:${f(start)}`, "DURATION:PT15M", "RRULE:FREQ=DAILY", "SUMMARY:Play Ride 'Em, Rakaza! (3 ranked plays)", `DESCRIPTION:Your 3 ranked plays reset at 00:00 UTC. ${url}`, `URL:${url}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }, [hour, d.agent.id]);
  const localHour = (h: number) => { const x = new Date(Date.UTC(2026, 0, 1, h)); return x.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
  return (
    <div className="rk-card grid min-w-0 gap-3" data-testid="reminders">
      <h3 className="rk-h2 flex items-center gap-2 text-xl"><Bell className="size-5" aria-hidden="true" />Auto-play reminders</h3>
      <p className="text-sm opacity-80">You get <b>3 ranked plays a day</b>. Turn on a reminder and the site nudges you at your time while plays are left, so a run (yours or your brain&apos;s) is never missed.</p>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={on} onChange={(e) => { setOn(e.target.checked); void save({ remind: e.target.checked, remindHour: hour }); }} data-testid="remind-on" />Remind me every day</label>
      <div className="grid gap-1">
        <label className={labelCls} htmlFor="remind-hour">Time (UTC)</label>
        <select id="remind-hour" className={fieldCls} value={hour} onChange={(e) => { const h = Number(e.target.value); setHour(h); if (on) void save({ remind: true, remindHour: h }); }} data-testid="remind-hour">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 UTC · {localHour(h)} your time</option>)}</select>
      </div>
      <div className="flex flex-wrap gap-2">
        {perm === "default" ? <button type="button" className="rk-btn rk-btn-white min-h-11" onClick={async () => setPerm(await Notification.requestPermission())} data-testid="remind-notify">Allow browser notifications</button> : <span className="rk-pill text-xs" data-testid="remind-perm">{perm === "granted" ? "NOTIFICATIONS ON (while the site is open)" : perm === "denied" ? "NOTIFICATIONS BLOCKED IN THE BROWSER" : "NOTIFICATIONS NOT SUPPORTED HERE"}</span>}
        <a className="rk-btn rk-btn-white min-h-11" download="rakaza-ride-em-daily.ics" href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`} data-testid="remind-ics">Add a daily event to my calendar (.ics)</a>
      </div>
      <NoteLine n={n} id="remind-note" />
    </div>
  );
}

function BrainPanel({ d, onSaved }: { d: MeData; onSaved: () => void }) {
  const s = d.setup;
  const [mode, setMode] = useState<Brain>(s.brain);
  const [preset, setPreset] = useState(() => { const l = lsGet(), b0 = s.byoBase || (typeof l.byoBase === "string" ? l.byoBase : ""); return PRESETS.find((p) => p.base && p.base === b0)?.id ?? (b0 ? "custom" : "openai"); });
  const [base, setBase] = useState(s.byoBase || (() => { const l = lsGet(); return typeof l.byoBase === "string" && l.byoBase ? l.byoBase : PRESETS[0].base; })());
  const [model, setModel] = useState(s.byoModel || (() => { const l = lsGet(); return typeof l.byoModel === "string" ? l.byoModel : ""; })());
  const [timeout, setTimeoutMs] = useState(s.byoTimeout);
  const [key, setKey] = useState(() => ssGet());
  const [keep, setKeep] = useState(true);
  const [test, setTest] = useState<TestRes | null>(null);
  const [testing, setTesting] = useState(false);
  const [det, setDet] = useState<Detect | null>(null);
  const [n, setN] = useState<Note>(null);
  const keyHeader = (): Record<string, string> => (key ? { "x-byo-key": key } : {});
  const post = (path: string, body: unknown) => fetch(`${G}/${path}`, { method: "POST", headers: { "content-type": "application/json", ...keyHeader() }, body: JSON.stringify(body) });

  async function pick(m: Brain) {
    setMode(m); setN(null);
    if (m === "byo" && (!base || !model)) { setN({ ok: false, text: "Fill in the base URL and model ID, press Test, then Save to use your own model." }); return; }
    const r = await post("config", { brain: m });
    if (r.ok) { lsSet({ mode: m }); setN({ ok: true, text: m === "builtin" ? "Built-in pilot selected." : m === "river" ? "Platform brain (River) selected." : "Your own model selected." }); onSaved(); }
    else setN({ ok: false, text: ((await r.json().catch(() => ({}))) as { message?: string }).message ?? "Could not save." });
  }
  async function runTest() {
    setTesting(true); setTest(null);
    const r = await post("byo/test", { base, model });
    const j = (await r.json().catch(() => ({}))) as TestRes & { message?: string };
    setTest(r.ok ? j : { pass: false, summary: `FAIL · ${j.message ?? "request failed"}`, curl: "" });
    setTesting(false);
  }
  async function detect() {
    setDet(null);
    const r = await post("byo/detect", { base });
    const j = (await r.json().catch(() => ({}))) as Detect;
    setDet(j);
    if (j.operatorId) { const p = PRESETS.find((x) => x.id === j.operatorId); if (p) setPreset(p.id); }
    if (j.models?.length && !model) setModel(j.models[0]);
  }
  async function save() {
    const r = await post("config", { brain: "byo", byoBase: base, byoModel: model, byoTimeout: timeout });
    const j = (await r.json().catch(() => ({}))) as { message?: string; setup?: Setup };
    if (!r.ok) { setN({ ok: false, text: j.message ?? "Could not save." }); return; }
    setMode("byo"); setBase(j.setup?.byoBase ?? base);
    lsSet({ mode: "byo", byoBase: j.setup?.byoBase ?? base, byoModel: model, byoTimeout: timeout, byoRemember: keep });
    ssSet(keep ? key : "");
    setN({ ok: true, text: `Saved. Your model runs the "BRAIN FLIES" runs.${keep && key ? " The key is kept in this browser tab only (never on the server)." : " The key is not kept: enter it again when you play."}` });
    onSaved();
  }
  const opt = (id: Brain, title: string, text: string) => (
    <button type="button" role="radio" aria-checked={mode === id} data-active={mode === id} onClick={() => void pick(id)} className="rk-card grid min-h-11 gap-1 text-left !p-3 data-[active=true]:!border-[var(--rk-mint)]" data-testid={`brain-${id}`}>
      <b className="text-sm">{title}</b><span className="text-xs opacity-80">{text}</span>
    </button>
  );
  return (
    <div className="rk-card grid min-w-0 gap-4" data-testid="brain-panel">
      <h3 className="rk-h2 text-xl">Brain for your agent</h3>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Brain">
        {opt("builtin", "Built-in pilot", "A scripted autopilot. No model, no network.")}
        {opt("river", "Platform brain (River)", "Our River model, called by the site. Nothing to set up.")}
        {opt("byo", "Your own model", "Any OpenAI-compatible endpoint. Your key stays in your browser.")}
      </div>
      <div className="grid gap-3 rounded-2xl border border-[var(--rk-line)] p-3" data-testid="byo-panel">
        <b className="text-sm">Bring your own model</b>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-preset">Provider</label>
          <select id="byo-preset" className={fieldCls} value={preset} onChange={(e) => { setPreset(e.target.value); const p = PRESETS.find((x) => x.id === e.target.value); if (p?.base) setBase(p.base); setTest(null); }} data-testid="byo-preset">{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-base">Base URL</label>
          <input id="byo-base" className={fieldCls} type="url" inputMode="url" value={base} onChange={(e) => { setBase(e.target.value); setTest(null); }} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} data-testid="byo-base" />
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-model">Model ID</label>
          <input id="byo-model" className={fieldCls} list="byo-models" value={model} onChange={(e) => { setModel(e.target.value); setTest(null); }} placeholder="gpt-4o-mini" autoComplete="off" spellCheck={false} data-testid="byo-model" />
          <datalist id="byo-models">{(det?.models ?? []).map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-key">API key</label>
          <input id="byo-key" className={fieldCls} type="password" value={key} onChange={(e) => { setKey(e.target.value); if (keep) ssSet(e.target.value); }} placeholder="sk-…" autoComplete="off" spellCheck={false} data-testid="byo-key" />
          <label className="flex min-h-9 items-center gap-2 text-xs"><input type="checkbox" className="size-4" checked={keep} onChange={(e) => { setKeep(e.target.checked); ssSet(e.target.checked ? key : ""); }} data-testid="byo-keep" />Keep the key in this browser tab so the game can use it (cleared when the tab closes)</label>
          <p className="text-xs opacity-70">The key is never saved on our server, in a file or in a log. It is sent with a single request, and only to run your test, your chat or a pilot call to your own URL.</p>
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-timeout">Timeout per pilot call (ms)</label>
          <input id="byo-timeout" className={fieldCls} type="number" min={800} max={15000} step={200} value={timeout} onChange={(e) => setTimeoutMs(Number(e.target.value) || 4000)} data-testid="byo-timeout" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rk-btn rk-btn-mint min-h-11" onClick={() => void runTest()} disabled={testing || !base || !model} data-testid="byo-test">{testing ? "Testing…" : "Test"}</button>
          <button type="button" className="rk-btn rk-btn-white min-h-11" onClick={() => void detect()} disabled={!base} data-testid="byo-detect">Auto-detect operator (optional)</button>
          <button type="button" className="rk-btn rk-btn-honey min-h-11" onClick={() => void save()} disabled={!base || !model} data-testid="byo-save">Save and use</button>
        </div>
        {det ? <p className={`text-sm ${det.ok ? "" : "opacity-80"}`} data-testid="byo-detect-result">{det.operator ? <b>{det.operator}. </b> : null}{det.message}</p> : null}
        {test ? (
          <div className="grid gap-2" data-testid="byo-result" data-pass={test.pass} role="status">
            <p className={`rounded-xl border p-3 text-sm font-bold ${test.pass ? "border-[var(--rk-mint)] text-[var(--rk-mint)]" : "border-red-400 text-red-400"}`}>{test.summary}</p>
            {test.hint ? <p className="text-xs opacity-80">{test.hint}</p> : null}
            {test.curl ? (<>
              <p className="text-xs opacity-70">The same test by hand (replace $API_KEY):</p>
              <pre className="max-w-full overflow-x-auto rounded-xl bg-black/40 p-3 text-xs" data-testid="byo-curl">{test.curl}</pre>
              <div><CopyButton text={test.curl} label="Copy curl" id="byo-curl-copy" /></div>
            </>) : null}
          </div>
        ) : null}
      </div>
      <NoteLine n={n} id="brain-note" />
    </div>
  );
}

function PromptCard({ d }: { d: MeData }) {
  const text = useMemo(() => trainingPrompt({ base: typeof location === "undefined" ? "https://rakaza-ai-terminal.vercel.app" : location.origin, handle: d.agent.handle, name: d.agent.name }), [d.agent.handle, d.agent.name]);
  return (
    <div className="rk-card grid min-w-0 gap-3" data-testid="prompt-card">
      <h3 className="rk-h2 text-xl">Training prompt (copy and paste)</h3>
      <p className="text-sm opacity-80">Give this to your agent. It has the rules, the scoring, the exact API and MCP calls and the reply format. It never contains your key: your agent supplies its own as <code>$RAKAZA_KEY</code>.</p>
      <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 text-xs" data-testid="prompt-text" tabIndex={0}>{text}</pre>
      <div><CopyButton text={text} label="Copy training prompt" id="prompt-copy" /></div>
    </div>
  );
}

interface Msg { role: "user" | "assistant"; content: string }
function ChatCard({ d }: { d: MeData }) {
  const [log, setLog] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [log, busy]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const m = text.trim();
    if (!m || busy) return;
    setText(""); setErr(""); setBusy(true);
    const history = log.slice(-8);
    setLog((l) => [...l, { role: "user", content: m }]);
    const key = ssGet();
    const r = await fetch(`${G}/chat`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-byo-key": key } : {}) }, body: JSON.stringify({ message: m, history }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { reply?: string; message?: string; via?: string } | undefined;
    if (r?.ok && j?.reply) setLog((l) => [...l, { role: "assistant", content: j.reply as string }]);
    else setErr(j?.message ?? "No answer. Try again.");
    setBusy(false);
  }
  return (
    <div className="rk-card grid min-w-0 gap-3" data-testid="chat-card">
      <h3 className="rk-h2 text-xl">Chat with {d.agent.name}</h3>
      <p className="text-xs opacity-70">Uses your selected brain ({d.setup.brain === "byo" ? "your own model" : "the platform brain"}). Ask for tips or a review of your runs.</p>
      <div className="grid max-h-72 min-h-24 gap-2 overflow-y-auto rounded-xl bg-black/30 p-3 text-sm" data-testid="chat-log" aria-live="polite">
        {log.length === 0 ? <p className="opacity-60">Say hi to your agent…</p> : null}
        {log.map((m, i) => <p key={i} className={`max-w-[92%] whitespace-pre-wrap break-words rounded-xl p-2 ${m.role === "user" ? "ml-auto bg-[var(--rk-mint)]/20" : "bg-white/10"}`} data-testid={m.role === "user" ? "chat-msg-user" : "chat-msg-agent"}>{m.content}</p>)}
        {busy ? <p className="opacity-60" data-testid="chat-typing">typing…</p> : null}
        <div ref={end} />
      </div>
      {err ? <p className="text-sm font-semibold text-red-400" role="alert" data-testid="chat-err">{err}</p> : null}
      <form onSubmit={send} className="flex gap-2">
        <input className={`${fieldCls} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ask your agent…" aria-label="Message to your agent" data-testid="chat-input" />
        <button type="submit" className="rk-btn rk-btn-mint min-h-11" disabled={busy || !text.trim()} data-testid="chat-send" aria-label="Send"><Send className="size-4" aria-hidden="true" /></button>
      </form>
    </div>
  );
}
