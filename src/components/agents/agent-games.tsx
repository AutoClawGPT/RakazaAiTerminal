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
type Protocol = "openai" | "anthropic";
interface Setup { brain: Brain; byoBase: string; byoModel: string; byoProtocol?: Protocol; byoTimeout: number; pilotStage?: number; pilotMax?: number; remind: boolean; remindHour: number }
interface Progress { runs: number; best: number; bestMode: string | null; totalDistance: number; totalCoins: number; last: string | null; streak: number; rank: { h24: number | null; all: number | null }; level: number; xp: number; nextAt: number; byMode: { mode: string; runs: number; best: number }[] }
interface Plays { limit: number; used: number; left: number; resetsAt: string }
interface MeData { agent: { id: string; handle: string; name: string; avatar: string }; plays: Plays; progress: Progress; setup: Setup }
interface TestRes { pass: boolean; summary: string; curl: string; error?: string; hint?: string; ms?: number; status?: number; operator?: string; reply?: string; base?: string; models?: string[]; modelCount?: number }
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
  { id: "custom", label: "Custom endpoint (any OpenAI or Anthropic style URL)", base: "" },
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
      <PilotStages d={d} onSaved={load} />
      <BrainPanel d={d} onSaved={load} />
      <PromptCard d={d} />
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

const STAGES = [
  { n: 1, name: "Beginner", note: "Often loses focus: it can hit walls and lose a run." },
  { n: 2, name: "Apprentice", note: "Misses a lot less." },
  { n: 3, name: "Rider", note: "Solid, but still slips." },
  { n: 4, name: "Veteran", note: "Rarely slips." },
  { n: 5, name: "Master", note: "Almost never slips." },
  { n: 6, name: "Expert", note: "The fully trained pilot that never loses." },
];

/** AI pilot level of the in-game AI PILOT. Same stages and the same score rules for everybody (the server replay is the only score). Stage 6 is locked: only the owner can unlock it. */
function PilotStages({ d, onSaved }: { d: MeData; onSaved: () => void }) {
  const cur = d.setup.pilotStage ?? 1, max = d.setup.pilotMax === 6 ? 6 : 5;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pick = async (n: number) => {
    setBusy(true); setMsg("");
    const r = await fetch(`${G}/config`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pilotStage: n }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok) { setMsg(`AI pilot is now stage ${n} (${STAGES[n - 1].name}).`); onSaved(); } else setMsg((j as { message?: string }).message ?? "Could not save.");
  };
  return (
    <div className="rk-card grid gap-3" data-testid="pilot-stages">
      <div><b className="text-sm">AI pilot level</b><p className="mt-1 text-xs opacity-80">The built-in pilot you start with the AI PILOT button. Higher stages slip less. Everyone plays by the same rules and the score always comes from the server replay. Upgrades will come with the Rakaza token later; nothing is bought today.</p></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {STAGES.map((s) => {
          const locked = s.n > max, on = s.n === cur;
          return (
            <button key={s.n} type="button" data-testid={`pilot-stage-${s.n}`} aria-pressed={on} disabled={busy || locked} onClick={() => void pick(s.n)} className={`rounded-2xl border p-3 text-left text-sm ${on ? "border-white bg-white/10" : "border-white/20"} ${locked ? "opacity-60" : ""}`}>
              <b>Stage {s.n} · {s.name}</b>{on ? <span className="ml-2 text-xs">current</span> : null}{locked ? <span className="ml-2 text-xs" data-testid="pilot-locked">🔒 Locked</span> : null}
              <span className="mt-1 block text-xs opacity-80">{locked ? "Locked. Only the owner can unlock this stage." : s.note}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs opacity-80" role="status" data-testid="pilot-stage-msg">{msg}</p>
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
  const [preset, setPreset] = useState(() => { const l = lsGet(), b0 = s.byoBase || (typeof l.byoBase === "string" ? l.byoBase : ""); return PRESETS.find((p) => p.base && p.base === b0)?.id ?? (b0 ? "custom" : "custom"); });
  const [base, setBase] = useState(s.byoBase || (() => { const l = lsGet(); return typeof l.byoBase === "string" ? l.byoBase : ""; })());
  const [protocol, setProtocol] = useState<Protocol>(s.byoProtocol ?? "openai");
  const [model, setModel] = useState(s.byoModel || (() => { const l = lsGet(); return typeof l.byoModel === "string" ? l.byoModel : ""; })());
  const [timeout, setTimeoutMs] = useState(s.byoTimeout);
  const [key, setKey] = useState(() => ssGet());
  const [keep, setKeep] = useState(true);
  const [test, setTest] = useState<TestRes | null>(null);
  const [testing, setTesting] = useState(false);
  const [det, setDet] = useState<Detect | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [tested, setTested] = useState<{ base: string; model: string; protocol: Protocol } | null>(null);
  const [n, setN] = useState<Note>(null);
  const keyHeader = (): Record<string, string> => (key ? { "x-byo-key": key } : {});
  const post = (path: string, body: unknown) => fetch(`${G}/${path}`, { method: "POST", headers: { "content-type": "application/json", ...keyHeader() }, body: JSON.stringify(body) });
  const proto: Protocol = /\/messages\/?$/i.test(base.trim()) ? "anthropic" : protocol;
  const models = det?.models ?? [];

  // pull the provider's model list (GET {base}/v1/models with the key) as soon as there is a base URL and a key
  const detectRef = useRef(0);
  const loadModels = useCallback(async (b: string, k: string, pr: Protocol) => {
    const my = ++detectRef.current;
    setLoadingModels(true);
    const r = await fetch(`${G}/byo/detect`, { method: "POST", headers: { "content-type": "application/json", ...(k ? { "x-byo-key": k } : {}) }, body: JSON.stringify({ base: b, protocol: pr }) }).catch(() => null);
    const j = ((await r?.json().catch(() => ({}))) ?? { ok: false, message: "Could not reach our server." }) as Detect;
    if (my !== detectRef.current) return;
    setDet(j); setLoadingModels(false);
    if (j.operatorId) { const p = PRESETS.find((x) => x.id === j.operatorId); if (p) setPreset(p.id); }
  }, []);
  useEffect(() => {
    if (!/^https:\/\/\S+\.\S+/.test(base.trim()) || !key) return;
    const t = setTimeout(() => void loadModels(base, key, proto), 700);
    return () => clearTimeout(t);
  }, [base, key, proto, loadModels]);

  async function pick(m: Brain) {
    setMode(m); setN(null);
    if (m === "byo" && (!base || !model)) { setN({ ok: false, text: "Enter your base URL and API key, pick a model, press Test, then press Use for the game." }); return; }
    const r = await post("config", { brain: m });
    if (r.ok) { lsSet({ mode: m }); setN({ ok: true, text: m === "builtin" ? "Built-in pilot selected." : m === "river" ? "Platform brain (River) selected." : "Your own model selected." }); onSaved(); }
    else setN({ ok: false, text: ((await r.json().catch(() => ({}))) as { message?: string }).message ?? "Could not save." });
  }
  async function runTest() {
    setTesting(true); setTest(null); setTested(null);
    const r = await post("byo/test", { base, model, protocol: proto });
    const j = (await r.json().catch(() => ({}))) as TestRes & { message?: string };
    const res: TestRes = r.ok ? j : { pass: false, summary: `FAIL · ${j.message ?? "request failed"}`, curl: "" };
    setTest(res);
    if (res.models?.length) setDet({ ok: true, models: res.models, operator: res.operator, message: `${res.models.length} models found.` });
    if (res.pass && res.base) { setBase(res.base); setTested({ base: res.base, model, protocol: proto }); if (res.ms) setTimeoutMs((t) => Math.max(t, Math.min(15000, Math.ceil((res.ms ?? 0) * 3 / 200) * 200))); }
    setTesting(false);
  }
  async function save() {
    const useBase = tested?.base ?? base;
    const r = await post("config", { brain: "byo", byoBase: useBase, byoModel: model, byoProtocol: proto, byoTimeout: timeout });
    const j = (await r.json().catch(() => ({}))) as { message?: string; setup?: Setup };
    if (!r.ok) { setN({ ok: false, text: j.message ?? "Could not save." }); return; }
    setMode("byo"); setBase(j.setup?.byoBase ?? useBase);
    lsSet({ mode: "byo", byoBase: j.setup?.byoBase ?? useBase, byoModel: model, byoProtocol: proto, byoTimeout: timeout, byoRemember: keep });
    ssSet(keep ? key : "");
    setN({ ok: true, text: `Your model "${model}" is now the game brain. It makes the decisions in the "BRAIN FLIES" runs.${keep && key ? " The key is kept in this browser tab only (never on the server)." : " The key is not kept: enter it again when you play."}` });
    onSaved();
  }
  const opt = (id: Brain, title: string, text: string) => (
    <button type="button" role="radio" aria-checked={mode === id} data-active={mode === id} onClick={() => void pick(id)} className="rk-card grid min-h-11 gap-1 text-left !p-3 data-[active=true]:!border-[var(--rk-mint)]" data-testid={`brain-${id}`}>
      <b className="text-sm">{title}</b><span className="text-xs opacity-80">{text}</span>
    </button>
  );
  const edit = () => { setTest(null); setTested(null); };
  return (
    <div className="rk-card grid min-w-0 gap-4" data-testid="brain-panel">
      <h3 className="rk-h2 text-xl">Brain for your agent</h3>
      <p className="text-xs opacity-70">Two choices: the platform brain (the default, nothing to set up) or your own model. Your own model is optional and lives only here.</p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Brain">
        {opt("builtin", "Built-in pilot", "A scripted autopilot. No model, no network.")}
        {opt("river", "Platform brain (River)", "Our River model, called by the site. Nothing to set up.")}
        {opt("byo", "Your own model", "Any OpenAI-style or Anthropic-style endpoint. Your key stays in your browser.")}
      </div>
      <div className="grid gap-3 rounded-2xl border border-[var(--rk-line)] p-3" data-testid="byo-panel">
        <b className="text-sm">Your own model (optional)</b>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-preset">Provider</label>
          <select id="byo-preset" className={fieldCls} value={preset} onChange={(e) => { setPreset(e.target.value); const p = PRESETS.find((x) => x.id === e.target.value); if (p?.base) setBase(p.base); edit(); setDet(null); }} data-testid="byo-preset">{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-base">Base URL</label>
          <input id="byo-base" className={fieldCls} type="url" inputMode="url" value={base} onChange={(e) => { setBase(e.target.value); edit(); }} placeholder="https://api.example.com  (with or without /v1)" autoComplete="off" spellCheck={false} data-testid="byo-base" />
          <p className="text-xs opacity-70">Any form works: <code>https://host</code>, <code>https://host/v1</code>, a trailing slash, or the full <code>/v1/chat/completions</code> or <code>/v1/messages</code> URL.</p>
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-proto">API style</label>
          <select id="byo-proto" className={fieldCls} value={proto} onChange={(e) => { setProtocol(e.target.value as Protocol); edit(); }} data-testid="byo-proto">
            <option value="openai">OpenAI-compatible (/v1/chat/completions)</option>
            <option value="anthropic">Anthropic-style (/v1/messages)</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-key">API key</label>
          <input id="byo-key" className={fieldCls} type="password" value={key} onChange={(e) => { setKey(e.target.value); if (keep) ssSet(e.target.value); edit(); }} placeholder="sk-…" autoComplete="off" spellCheck={false} data-testid="byo-key" />
          <label className="flex min-h-9 items-center gap-2 text-xs"><input type="checkbox" className="size-4" checked={keep} onChange={(e) => { setKeep(e.target.checked); ssSet(e.target.checked ? key : ""); }} data-testid="byo-keep" />Keep the key in this browser tab only (needed for the game and the chat below)</label>
          <p className="text-xs opacity-70">The key is never saved on our server, in a file or in a log. It is sent with a single request, and only to run your test, your chat or a pilot call to your own URL.</p>
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-model-select">Model {loadingModels ? "(loading the provider's list…)" : models.length ? `(${models.length} from your provider)` : ""}</label>
          <select id="byo-model-select" className={fieldCls} value={models.includes(model) ? model : ""} onChange={(e) => { if (e.target.value) { setModel(e.target.value); edit(); } }} disabled={!models.length} data-testid="byo-model-select" aria-label="Models from your provider">
            <option value="">{models.length ? "Pick a model from your provider…" : "Enter the base URL and key to load the model list"}</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input id="byo-model" className={fieldCls} value={model} onChange={(e) => { setModel(e.target.value); edit(); }} placeholder="or type a model ID" autoComplete="off" spellCheck={false} aria-label="Model ID" data-testid="byo-model" />
        </div>
        <div className="grid gap-1">
          <label className={labelCls} htmlFor="byo-timeout">Timeout per pilot call (ms)</label>
          <input id="byo-timeout" className={fieldCls} type="number" min={800} max={15000} step={200} value={timeout} onChange={(e) => setTimeoutMs(Number(e.target.value) || 4000)} data-testid="byo-timeout" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rk-btn rk-btn-mint min-h-11" onClick={() => void runTest()} disabled={testing || !base || !model} data-testid="byo-test">{testing ? "Testing…" : "Test"}</button>
          <button type="button" className="rk-btn rk-btn-white min-h-11" onClick={() => void loadModels(base, key, proto)} disabled={!base || loadingModels} data-testid="byo-detect">Load model list</button>
          <button type="button" className="rk-btn rk-btn-honey min-h-11" onClick={() => void save()} disabled={!base || !model || !tested} data-testid="byo-save" title={tested ? "" : "Press Test first"}>Use for the game</button>
        </div>
        {det ? <p className={`text-sm ${det.ok ? "" : "opacity-80"}`} data-testid="byo-detect-result">{det.operator ? <b>{det.operator}. </b> : null}{det.message}</p> : null}
        {test ? (
          <div className="grid gap-2" data-testid="byo-result" data-pass={test.pass} role="status">
            <p className={`rounded-xl border p-3 text-sm font-bold [overflow-wrap:anywhere] ${test.pass ? "border-[var(--rk-mint)] text-[var(--rk-mint)]" : "border-red-400 text-red-400"}`}>{test.summary}</p>
            {test.hint ? <p className="text-xs opacity-80">{test.hint}</p> : null}
            {test.pass ? <p className="text-xs opacity-80" data-testid="byo-speed-note">In the game your model answers every second or so: pick a fast model (a quick “flash”/“mini”/“haiku” one). A reply slower than the timeout above lets the built-in pilot fly that moment, so a run never stalls.</p> : null}
            {test.curl ? (<>
              <p className="text-xs opacity-70">The same test by hand (replace $API_KEY):</p>
              <pre className="max-w-full overflow-x-auto rounded-xl bg-black/40 p-3 text-xs" data-testid="byo-curl">{test.curl}</pre>
              <div><CopyButton text={test.curl} label="Copy curl" id="byo-curl-copy" /></div>
            </>) : null}
          </div>
        ) : null}
        {tested ? <ModelChat cfg={tested} keyValue={key} /> : <p className="text-xs opacity-70" data-testid="chat-locked">After a successful Test you can chat with your model here and set it as the game brain.</p>}
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
/** A small chat with the player's OWN tested model (our server makes the call; the key goes in one header and is never stored). */
function ModelChat({ cfg, keyValue }: { cfg: { base: string; model: string; protocol: Protocol }; keyValue: string }) {
  const [log, setLog] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [via, setVia] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [log, busy]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const m = text.trim();
    if (!m || busy) return;
    setText(""); setErr(""); setBusy(true);
    const history = log.slice(-8);
    setLog((l) => [...l, { role: "user", content: m }]);
    const r = await fetch(`${G}/chat`, { method: "POST", headers: { "content-type": "application/json", ...(keyValue ? { "x-byo-key": keyValue } : {}) }, body: JSON.stringify({ message: m, history, byo: cfg }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { reply?: string; message?: string; model?: string } | undefined;
    if (r?.ok && j?.reply) { setLog((l) => [...l, { role: "assistant", content: j.reply as string }]); setVia(j.model ?? cfg.model); }
    else setErr(j?.message ?? "No answer. Try again.");
    setBusy(false);
  }
  return (
    <div className="grid min-w-0 gap-2 rounded-xl border border-[var(--rk-mint)]/50 p-3" data-testid="chat-card">
      <b className="text-sm">Chat with your model: <span className="font-mono [overflow-wrap:anywhere]">{cfg.model}</span></b>
      <div className="grid max-h-60 min-h-20 gap-2 overflow-y-auto rounded-xl bg-black/30 p-3 text-sm" data-testid="chat-log" aria-live="polite">
        {log.length === 0 ? <p className="opacity-60">Say hi to your model…</p> : null}
        {log.map((m, i) => <p key={i} className={`max-w-[92%] whitespace-pre-wrap break-words rounded-xl p-2 ${m.role === "user" ? "ml-auto bg-[var(--rk-mint)]/20" : "bg-white/10"}`} data-testid={m.role === "user" ? "chat-msg-user" : "chat-msg-agent"}>{m.content}</p>)}
        {busy ? <p className="opacity-60" data-testid="chat-typing">typing…</p> : null}
        <div ref={end} />
      </div>
      {via ? <p className="text-xs opacity-60" data-testid="chat-via">answered by {via}</p> : null}
      {err ? <p className="text-sm font-semibold text-red-400 [overflow-wrap:anywhere]" role="alert" data-testid="chat-err">{err}</p> : null}
      <form onSubmit={send} className="flex gap-2">
        <input className={`${fieldCls} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ask your model…" aria-label="Message to your model" data-testid="chat-input" />
        <button type="submit" className="rk-btn rk-btn-mint min-h-11" disabled={busy || !text.trim()} data-testid="chat-send" aria-label="Send"><Send className="size-4" aria-hidden="true" /></button>
      </form>
    </div>
  );
}
