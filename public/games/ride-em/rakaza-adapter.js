/* ============================================================================
   RAKAZA ADAPTER (v15) — one place for everything that would talk to a server.
   Standalone by default: profile + leaderboard live in localStorage.
   Same API shape as the v13 server so the real Rakaza site can plug in later:

     GET  {apiBase}/lb[?range=24h|all&seed=YYYY-MM-DD]  -> { top:[{name,metres,coins,score,pro,ts}], count }
     POST {apiBase}/lb   {name,metres,coins,score,pro,seed,mode,elapsed,ver}
                         -> { ok, rank?, accepted, reason? }
     GET  {apiBase}/profile?id=...                    -> { found, profile, savedAt }
     POST {apiBase}/profile {id, profile}             -> { ok, savedAt }
     GET  {apiBase}/plays                             -> { left, limit, resetsAt }   (3 plays / UTC day)
     POST {apiBase}/plays   {}                        -> { ok, left }

   v15 agent endpoints (see AGENT-PROTOCOL.md; every one has a local mock when apiBase is not set):
     POST {apiBase}/runs/start   {handle,agentId,mode,config}  -> { runId, seed, config, playsLeft }
     POST {apiBase}/runs/submit  {runId,seed,mode,distance,coins,near,score,inputLog,version,...}
                                                           -> { ok, accepted, verified, score, rank?, reason? }
     GET  {apiBase}/agents                                -> { agents:[{handle,agentId,runs,best,ts}] }
     GET  {apiBase}/drop?handle=..                        -> { day, drop, eligible, payout:{enabled:false} }

   Configure from the host page BEFORE this file loads, or at any time:
     window.RAKAZA_CONFIG = { apiBase:'/rakaza/api', dailyPlays:3, getAuth:()=>({handle,token}) }
   or let the embedding site post:  {type:'rakaza-session', handle, token, dailyPlays}
   No secrets, no analytics: nothing leaves the browser unless apiBase is set.
   ========================================================================== */
(() => {
  'use strict';
  const VER = 'v16';
  const cfg = (window.RAKAZA_CONFIG = Object.assign({ apiBase: null, dailyPlays: 0, getAuth: null }, window.RAKAZA_CONFIG || {}));
  const qs = new URLSearchParams(location.search);
  if (qs.has('plays')) cfg.dailyPlays = Math.max(0, parseInt(qs.get('plays'), 10) || 0);
  if (qs.get('api') && /^\/[A-Za-z0-9/_-]*$/.test(qs.get('api'))) cfg.apiBase = qs.get('api'); // same-origin path only
  if (qs.get('river') && /^\/[A-Za-z0-9/_-]*$/.test(qs.get('river'))) cfg.riverUrl = qs.get('river'); // the site's own River route

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const utcDay = (t) => new Date(t == null ? Date.now() : t).toISOString().slice(0, 10);
  const nextUtcMidnight = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };

  // ------------------------------------------------------------- preferences (v14 extras only)
  const PREF_KEY = 'rz_v14';
  const prefDefaults = {
    char: 'rakaza', outfit: 0, volume: 0.7, music: true, sfx: true, haptics: true,
    reduceMotion: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
    ghost: true, tutorialDone: false, perfNote: false,
  };
  const prefs = Object.assign({}, prefDefaults, LS.get(PREF_KEY, {}));
  const Prefs = {
    data: prefs,
    get(k) { return prefs[k]; },
    set(k, v) { prefs[k] = v; LS.set(PREF_KEY, prefs); },
  };
  window.RakazaPrefs = Prefs;

  // ------------------------------------------------------------- session (sign-in is the host site's job)
  const session = { signedIn: false, handle: '', agentId: '', token: null, playsLeft: null };
  const readAuth = () => {
    try {
      const a = typeof cfg.getAuth === 'function' ? cfg.getAuth() : null;
      if (a && a.handle) { session.signedIn = true; session.handle = String(a.handle).slice(0, 16); session.token = a.token || null; }
    } catch (e) { /* ignore */ }
  };
  readAuth();
  window.addEventListener('message', (ev) => {
    const d = ev && ev.data;
    if (!d || d.type !== 'rakaza-session') return;
    if (ev.source !== window && ev.source !== window.parent && ev.source !== window.opener) return; // only the embedding site (or this page) may set a session
    session.signedIn = !!d.handle; session.handle = String(d.handle || '').slice(0, 16); session.token = d.token || null;
    session.agentId = d.agentId ? String(d.agentId).slice(0, 40) : session.agentId || '';
    session.playsLeft = typeof d.playsLeft === 'number' ? Math.max(0, d.playsLeft | 0) : null;
    if (typeof d.dailyPlays === 'number') cfg.dailyPlays = Math.max(0, d.dailyPlays | 0);
    if (typeof d.apiBase === 'string' && /^(https:\/\/|\/)/.test(d.apiBase)) cfg.apiBase = d.apiBase;
    document.dispatchEvent(new CustomEvent('rakaza-session', { detail: { handle: session.handle } }));
  });

  // ------------------------------------------------------------- score rules (shared with the server later)
  // board = round(m + coins * (6 + greed + coinbonus))
  const boardScore = (metres, coins, upg) => Math.round(metres + coins * (6 + (upg && upg.greed ? 1 : 0) + (upg && upg.coinbonus ? 2 : 0)));
  // plausibility: top speed is (145 + 1.5*110) * 1.8 * 0.12 ≈ 67 m/s with campaign nightmare + surge + dash
  const MAX_MPS = 90;
  function validate(run) {
    if (!run || typeof run !== 'object') return 'bad run';
    const m = Number(run.metres), c = Number(run.coins), s = Number(run.score), e = Number(run.elapsed);
    if (![m, c, s].every(Number.isFinite) || m < 0 || c < 0 || s < 0) return 'bad numbers';
    if (m > 400000 || c > 200000) return 'out of range';
    if (Number.isFinite(e) && e > 0 && (m - (run.headStart || 0)) / e > MAX_MPS) return 'too fast for the clock';
    const n = Number(run.near) || 0; // score = floor(dist) + coins*weight + near-miss points (weight 6..9)
    const minScore = m + c * 6 + n, maxScore = m + c * 9 + n;
    if (s < minScore - 1 || s > maxScore + 1) return 'score does not match metres/coins';
    return '';
  }

  // ------------------------------------------------------------- local store
  const BOARD_KEY = 'rz_board_v15';
  const PROF_KEY = 'rz_profile_v15';
  const PLAY_KEY = 'rz_plays_v15';
  const localBoard = () => LS.get(BOARD_KEY, []);
  const MAX_ROWS = 200;

  async function http(method, path, body) {
    const base = cfg.apiBase;
    if (!base) throw new Error('no api');
    const headers = { 'content-type': 'application/json' };
    if (session.token) headers.authorization = 'Bearer ' + session.token;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(base.replace(/\/$/, '') + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctl.signal });
      if (!r.ok) {
        const er = new Error('http ' + r.status); er.status = r.status;
        try { er.body = await r.json(); } catch (x) { er.body = null; }
        throw er;
      }
      return await r.json();
    } finally { clearTimeout(to); }
  }

  const API = {
    version: VER,
    config: cfg,
    session,
    mode() { return cfg.apiBase ? 'server' : 'local'; },
    utcDay, nextUtcMidnight, boardScore, validate,

    // ---- profile
    async getProfile(id) {
      if (cfg.apiBase && cfg.profileSync) { try { return await http('GET', '/profile?id=' + encodeURIComponent(id)); } catch (e) { /* fall through */ } }
      const p = LS.get(PROF_KEY + ':' + id, null);
      return p ? { found: true, profile: p.profile, savedAt: p.savedAt } : { found: false };
    },
    async saveProfile(id, profile) {
      const savedAt = Math.floor(Date.now() / 1000);
      LS.set(PROF_KEY + ':' + id, { profile, savedAt });
      if (cfg.apiBase && cfg.profileSync) { try { const d = await http('POST', '/profile', { id, profile }); return Object.assign({ ok: true }, d, { savedAt: d.savedAt || savedAt }); } catch (e) { /* local copy kept */ } }
      return { ok: true, savedAt, local: true };
    },

    // ---- leaderboard. range: '24h' | 'all'; seedDay: 'YYYY-MM-DD' for the daily-seed board
    async getBoard(opts) {
      opts = opts || {};
      const range = opts.range || 'all';
      if (cfg.apiBase) {
        try {
          const q = '?range=' + range + (opts.seedDay ? '&seed=' + opts.seedDay : '');
          const d = await http('GET', '/lb' + q);
          if (d && Array.isArray(d.top)) return Object.assign({ source: 'server' }, d);
        } catch (e) { /* fall back to local */ }
      }
      let rows = localBoard();
      if (opts.seedDay) rows = rows.filter((r) => r.daily === opts.seedDay);
      if (range === '24h') { const cut = Date.now() / 1000 - 86400; rows = rows.filter((r) => r.ts >= cut); }
      rows = rows.slice().sort((a, b) => b.score - a.score);
      return { source: 'local', top: rows.slice(0, 25), count: rows.length };
    },
    async submitRun(run) {
      const bad = validate(run);
      if (bad) return { ok: false, accepted: false, reason: bad };
      const row = {
        name: String(run.name || 'you').slice(0, 16), metres: Math.round(run.metres), coins: Math.round(run.coins),
        score: Math.round(run.score), pro: !!run.pro, ts: Math.floor(Date.now() / 1000), mode: run.mode || 'classic',
        seed: run.seed >>> 0, daily: run.daily ? utcDay() : null, ver: VER, near: Math.round(run.near || 0),
        agent: run.agentId ? String(run.agentId).slice(0, 40) : null, verified: !!run.verified,
      };
      const rows = localBoard(); rows.push(row);
      rows.sort((a, b) => b.score - a.score);
      LS.set(BOARD_KEY, rows.slice(0, MAX_ROWS));
      let rank = null;
      // site mode: practice runs are never sent to the server board. Only a started run (runs/start) that the server replays can score.
      if (cfg.apiBase) return { ok: true, accepted: false, practice: true, source: 'local', reason: 'practice run: not ranked. Press PLAY FOR SCORE on the page to put a run on the live board.' };
      const day = rows.filter((r) => r.ts >= Date.now() / 1000 - 86400).sort((a, b) => b.score - a.score);
      rank = day.findIndex((r) => r.ts === row.ts && r.score === row.score) + 1 || null;
      return { ok: true, accepted: true, source: 'local', rank };
    },

    // ---- plays per UTC day. dailyPlays = 0 means unlimited (standalone default)
    playsInfo() {
      const limit = cfg.dailyPlays | 0;
      const st = LS.get(PLAY_KEY, { day: '', used: 0 });
      const used = st.day === utcDay() ? st.used : 0;
      return { limit, used, left: limit ? Math.max(0, limit - used) : Infinity, resetsAt: nextUtcMidnight() };
    },
    async consumePlay() {
      const info = API.playsInfo();
      if (!info.limit) return { ok: true, left: Infinity };
      if (info.left <= 0) return { ok: false, left: 0, resetsAt: info.resetsAt };
      if (cfg.apiBase) {
        try { const d = await http('POST', '/plays', {}); if (d && d.ok === false) return { ok: false, left: 0, resetsAt: info.resetsAt }; } catch (e) { /* local count still applies */ }
      }
      LS.set(PLAY_KEY, { day: utcDay(), used: info.used + 1 });
      return { ok: true, left: info.left - 1 };
    },
    consumePlaySync() {
      const info = API.playsInfo();
      if (!info.limit) return { ok: true, left: Infinity };
      if (info.left <= 0) return { ok: false, left: 0, resetsAt: info.resetsAt };
      LS.set(PLAY_KEY, { day: utcDay(), used: info.used + 1 });
      return { ok: true, left: info.left - 1 };
    },
  };

  // ------------------------------------------------------------- v15 agent endpoints (HTTP when apiBase is set, local MOCK otherwise)
  // The local mock is honest about what it is: it enforces plays and re-runs the real headless replay, but it trusts
  // nothing beyond this browser. The Rakaza site implements the same three calls server-side.
  const AGENT_KEY = 'rz_agent_v15';
  const agentStore = () => LS.get(AGENT_KEY, { pending: {}, agents: {}, n: 0 });
  const agentSave = (st) => {
    const keys = Object.keys(st.pending);
    if (keys.length > 40) keys.sort((a, b) => st.pending[a].t - st.pending[b].t).slice(0, keys.length - 40).forEach((k) => delete st.pending[k]);
    LS.set(AGENT_KEY, st);
  };
  const RC = () => window.RakazaContent, RP = () => window.RakazaReplay;
  const playsState = () => { // site-provided number wins; else the local counter
    const info = API.playsInfo();
    const limit = cfg.dailyPlays | 0;
    if (!limit && session.playsLeft == null) return { limit: 0, left: null, resetsAt: info.resetsAt };
    const left = session.playsLeft != null ? session.playsLeft : info.left;
    return { limit, left, resetsAt: info.resetsAt };
  };
  API.agent = {
    mode() { return cfg.apiBase ? 'site' : 'local-mock'; },
    playsLeft() { const p = playsState(); return Promise.resolve({ day: utcDay(), limit: p.limit, left: p.left, unlimited: p.left == null, resetsAt: p.resetsAt, source: cfg.apiBase ? 'site-session' : 'local-mock' }); },
    async startRun(req) {
      req = req || {};
      const handle = String(req.handle || session.handle || 'agent').slice(0, 16);
      const agentId = String(req.agentId || session.agentId || handle).slice(0, 40);
      const daily = req.mode === 'daily' || !!req.daily;
      const mode = (RC().MODES[req.mode] ? req.mode : 'classic');
      const p = playsState();
      if (p.left !== null && p.left <= 0) return { ok: false, error: 'no_plays_left', playsLeft: 0, resetsAt: p.resetsAt };
      const v = RP().validateConfig(Object.assign({}, req.config || {}, { mode, ranked: true }), {});
      if (!v.ok) return { ok: false, error: 'bad_config', details: v.errors };
      if (cfg.apiBase) {
        try {
          const d = await http('POST', '/runs/start', { handle, agentId, mode, daily, config: v.config });
          if (d && d.runId && d.seed != null) { if (typeof d.playsLeft === 'number') session.playsLeft = d.playsLeft; return Object.assign({ ok: true, config: v.config }, d, { config: d.config || v.config }); }
          return { ok: false, error: (d && d.error) || 'site_refused' };
        } catch (e) {
          if (e && e.body && typeof e.body === 'object') { if (typeof e.body.playsLeft === 'number') session.playsLeft = e.body.playsLeft; return Object.assign({ ok: false, error: e.body.error || 'site_refused' }, e.body); }
          return { ok: false, error: 'site_unreachable' };
        }
      }
      const st = agentStore(); st.n++;
      const seed = req.mode === 'daily' ? window.RakazaDaily.seed() : hashStr('rakaza-run:' + utcDay() + ':' + (session.handle || handle) + ':' + st.n + ':' + Date.now()) >>> 0;
      const runId = 'loc_' + seed.toString(36) + '_' + st.n;
      st.pending[runId] = { seed, config: v.config, mode, handle, agentId, t: Date.now(), used: false };
      agentSave(st);
      const cons = API.consumePlaySync();
      const left = session.playsLeft != null ? Math.max(0, session.playsLeft - 1) : cons.left;
      if (session.playsLeft != null) session.playsLeft = left;
      return { ok: true, runId, seed, mode, config: v.config, playsLeft: left == null || left === Infinity ? null : left, mock: true };
    },
    async submitRun(pl) {
      if (!pl || typeof pl !== 'object' || !pl.runId) return { ok: false, accepted: false, reason: 'missing runId' };
      if (typeof pl.inputLog !== 'string' || pl.inputLog.length > 400000) return { ok: false, accepted: false, reason: 'bad inputLog' };
      if (cfg.apiBase) {
        try { return await http('POST', '/runs/submit', pl); } catch (e) {
          if (e && e.body && typeof e.body === 'object') return Object.assign({ ok: false, accepted: false }, e.body);
          return { ok: false, accepted: false, reason: 'site_unreachable' };
        }
      }
      const st = agentStore(); const rec = st.pending[pl.runId];
      if (!rec) return { ok: false, accepted: false, reason: 'unknown runId' };
      if (rec.used) return { ok: false, accepted: false, reason: 'runId already submitted' };
      if ((pl.seed >>> 0) !== rec.seed) return { ok: false, accepted: false, reason: 'seed mismatch' };
      let r;
      try { r = RP().replay(rec.seed, pl.inputLog, rec.config, {}); } catch (e) { return { ok: false, accepted: false, reason: 'replay failed' }; }
      const same = r.distance === (pl.distance | 0) && r.coins === (pl.coins | 0) && r.near === (pl.near | 0) && r.score === (pl.score | 0);
      if (!same) return { ok: false, accepted: false, verified: false, reason: 'replay does not reproduce the claimed result', replay: { distance: r.distance, coins: r.coins, near: r.near, score: r.score } };
      rec.used = true;
      const a = st.agents[rec.agentId] || { handle: rec.handle, agentId: rec.agentId, runs: 0, best: 0, ts: 0, day: '', todayRuns: 0 };
      a.runs++; a.best = Math.max(a.best, r.score); a.ts = Math.floor(Date.now() / 1000);
      a.todayRuns = (a.day === utcDay() ? a.todayRuns : 0) + 1; a.day = utcDay();
      st.agents[rec.agentId] = a; agentSave(st);
      const res = await API.submitRun({ name: rec.handle, metres: r.distance, coins: r.coins, near: r.near, score: r.score, pro: true, seed: rec.seed, mode: rec.mode, elapsed: r.ticks / 120, headStart: 0, agentId: rec.agentId, verified: true });
      return { ok: true, accepted: true, verified: true, score: r.score, rank: res.rank || null, source: 'local-mock', replay: { distance: r.distance, coins: r.coins, near: r.near, score: r.score, ticks: r.ticks } };
    },
    async registry() {
      if (cfg.apiBase) { try { const d = await http('GET', '/agents'); if (d && Array.isArray(d.agents)) return Object.assign({ source: 'site' }, d); } catch (e) { /* fall back */ } }
      const st = agentStore();
      return { source: 'local-mock', agents: Object.values(st.agents).sort((x, y) => y.best - x.best) };
    },
    async dailyDrop(handle) {
      const day = utcDay(); const drop = RC().dailyDrop(day);
      const payout = { enabled: false, currency: 'RAKAZA', network: 'solana-mainnet', reason: 'token payout stays disabled until the mainnet launch; documented in AGENT-PROTOCOL.md' };
      if (cfg.apiBase) { try { const d = await http('GET', '/drop?handle=' + encodeURIComponent(handle || session.handle || '')); if (d && d.day) return Object.assign({ source: 'site', payout }, d); } catch (e) { /* fall back */ } }
      const st = agentStore(); const a = Object.values(st.agents).find((x) => x.handle === (handle || session.handle) || x.agentId === (handle || session.agentId));
      const eligible = !!(a && a.day === day && a.todayRuns >= 1);
      return { source: 'local-mock', day, drop, eligible, rule: 'one verified run on the UTC day makes an agent eligible; winners come from the 24h board', fair: 'drop contents are a pure function of the UTC day (FNV-1a seeded), same for everyone', payout };
    },
  };
  window.RakazaAPI = API;

  // ------------------------------------------------------------- daily seed (same obstacles for everyone per UTC day)
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  window.RakazaDaily = {
    day: () => utcDay(),
    seed: (day) => hashStr('rakaza-ride-em:' + (day || utcDay())) >>> 0,
    code: (day) => (hashStr('rakaza-ride-em:' + (day || utcDay())) >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 6),
    best() { return LS.get('rz_daily_' + utcDay(), { score: 0, distance: 0, coins: 0, runs: 0 }); },
    record(run) {
      const b = LS.get('rz_daily_' + utcDay(), { score: 0, distance: 0, coins: 0, runs: 0 });
      b.runs++;
      if (run.score > b.score) { b.score = run.score; b.distance = run.distance; b.coins = run.coins; }
      LS.set('rz_daily_' + utcDay(), b);
      return b;
    },
  };
})();
