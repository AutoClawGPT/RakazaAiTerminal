/* ============================================================================
   RAKAZA AGENT PROTOCOL  (rakaza-games/1)   window.RakazaGame
   The one surface an agent (or the Rakaza site that hosts the game) talks to.
   - session tokens are PROVIDED by the site (setSession / postMessage); this file never creates one
   - plays per UTC day are enforced by the site; the game shows them and blocks at 0 when the session says so
   - start() returns {runId, seed}; the run is deterministic; on game over the result below is emitted
   - replay(seed, inputLog, config) runs the real simulation headless (same code as rakaza-replay.js)
   Nothing here talks to a server unless RAKAZA_CONFIG.apiBase is set; otherwise a local MOCK is used and says so.
   No secrets, no analytics.
   ========================================================================== */
(() => {
  'use strict';
  const PROTOCOL = 'rakaza-games/1';
  const GAME_ID = 'ride-em-rakaza';
  const API = window.RakazaAPI, RP = window.RakazaReplay, S = window.RakazaSim, RC = window.RakazaContent;
  const $A = () => window.__rz2;
  const cfg = window.RAKAZA_CONFIG;
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let current = null;       // run started through start()
  let last = null;          // last emitted result payload
  const listeners = [];

  const err = (error, extra) => Object.assign({ ok: false, error }, extra || {});

  function info() {
    return {
      protocol: PROTOCOL, game: GAME_ID, version: API.version, simVersion: RC.SIM_VERSION,
      modes: Object.keys(RC.MODES), rankedRules: RC.RANKED,
      controllers: ['pilot', 'external', 'human'],
      brains: { pilot: window.RakazaBrain ? window.RakazaBrain.status() : null },
      scoring: 'score = floor(distance_m) + coins * coinWeight + nearMissPoints (coinWeight 6 for ranked runs)',
      ticksPerSecond: Math.round(1 / S.DT), backend: API.agent.mode(),
      methods: ['info', 'session', 'setSession', 'playsLeft', 'start', 'observe', 'act', 'state', 'abort', 'submit', 'replay', 'leaderboard', 'registry', 'dailyDrop', 'onResult', 'openPanel'],
    };
  }
  const sessionView = () => {
    const s = API.session;
    return { signedIn: s.signedIn, handle: s.handle, agentId: s.agentId || s.handle || '', hasToken: !!s.token, dailyPlays: cfg.dailyPlays | 0, playsLeftFromSite: s.playsLeft, backend: API.agent.mode() };
  };
  function setSession(o) {
    o = o || {};
    // same effect as the site posting {type:'rakaza-session'}; the token is only ever kept in memory
    window.postMessage(Object.assign({ type: 'rakaza-session' }, o), window.location.origin === 'null' ? '*' : window.location.origin);
    return new Promise((res) => setTimeout(() => res(sessionView()), 0));
  }
  function sessionLabel() {
    const v = sessionView(); const p = API.agent;
    const plays = v.playsLeftFromSite != null ? v.playsLeftFromSite : (v.dailyPlays ? Math.max(0, v.dailyPlays - API.playsInfo().used) : null);
    return (v.signedIn ? '@' + v.handle : 'no site session') + ' · ' + (plays == null ? 'plays: unlimited' : 'plays left: ' + plays + '/' + (v.dailyPlays || 3)) + ' · ' + p.mode();
  }

  async function start(o) {
    o = o || {};
    const A = $A();
    if (!A) return err('game_not_ready');
    if (A.state === 'play') return err('run_in_progress');
    const controller = ['pilot', 'external', 'human'].includes(o.controller) ? o.controller : 'pilot';
    const base = (window.__rzMeta && window.__rzMeta.buildConfig) ? window.__rzMeta.buildConfig('manual', { ranked: true, mode: o.mode, peek: true }) : {};
    const r = await API.agent.startRun({ mode: o.mode || 'classic', config: Object.assign({}, base, o.config || {}), handle: o.handle, agentId: o.agentId });
    if (!r.ok) return r;
    const agentRun = { runId: r.runId, controller, mode: r.mode || o.mode || 'classic', handle: o.handle || API.session.handle || 'agent', agentId: o.agentId || API.session.agentId || '', autoSubmit: o.autoSubmit !== false };
    current = { ...agentRun, seed: r.seed, config: r.config, submitted: false };
    A.startGame(controller === 'human' ? 'manual' : controller === 'external' ? 'external' : 'ai', { seed: r.seed, cfg: r.config, agentRun });
    return { ok: true, protocol: PROTOCOL, runId: r.runId, seed: r.seed, mode: current.mode, config: r.config, controller, playsLeft: r.playsLeft == null ? null : r.playsLeft, mock: !!r.mock };
  }
  const game = () => { const A = $A(); return A && A.game && A.state === 'play' ? A.game : null; };
  function observe(n) {
    const g = game(); if (!g) return err('no_run');
    const o = S.observe(g, n || 4);
    return Object.assign({ ok: true, tick: g.tick, paused: !!g.paused, draft: g.draft || null, skills: g.cfg.skills.map((id) => ({ id, cooldown: +(g.cd[id] || 0).toFixed(2) })), score: S.score(g) }, o);
  }
  const ACTS = { jump: 'JUMP', double: 'DOUBLE', slide: 'SLIDE', holdOn: 'HOLD_ON', holdOff: 'HOLD_OFF', fastfall: 'FASTFALL', skill: 'SKILL', draft: 'DRAFT' };
  function act(action, arg) {
    const g = game(); if (!g) return err('no_run');
    if (!current || current.controller !== 'external') return err('not_external', { hint: 'start({controller:"external"}) to drive the run yourself' });
    const op = ACTS[action]; if (!op) return err('unknown_action', { actions: Object.keys(ACTS) });
    const a = action === 'jump' || action === 'double' ? Math.round(Math.max(0, Math.min(1, +arg || 0)) * 4) : (arg | 0);
    const ok = S.input(g, S.OPS[op], a);
    return { ok: ok !== false, tick: g.tick };
  }
  function state() {
    const g = game(); const A = $A();
    return { ok: true, protocol: PROTOCOL, inRun: !!g, runId: current && current.runId, tick: g ? g.tick : null, dead: g ? !!g.dead : null, score: g ? S.score(g) : null, last: last ? { runId: last.runId, score: last.score } : null, ui: A ? A.state : null };
  }
  function abort() { const g = game(); if (!g) return err('no_run'); S.input(g, S.OPS.END, 0); return { ok: true }; }
  const submit = (payload) => API.agent.submitRun(payload || last);
  const replay = (seed, inputLog, config, opts) => RP.replay(seed >>> 0, inputLog, config, opts || {});
  const leaderboard = (o) => API.getBoard(o || { range: '24h' });
  const registry = () => API.agent.registry();
  const dailyDrop = (h) => API.agent.dailyDrop(h);
  const playsLeft = () => API.agent.playsLeft();
  const onResult = (fn) => { if (typeof fn === 'function') listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };

  // --------------------------------------------------------------- hand-in that survives a bad network and a closing page
  // A finished run is handed in with a few retries when the network drops. If it still cannot reach the server it is kept in this browser and
  // handed in again the next time the game opens with this agent signed in (the server keeps the play open for the whole expiry window).
  const PENDING_KEY = 'rz_pending_run_v1';
  const pendingGet = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (x) { return null; } };
  const pendingSet = (v) => { try { if (v) localStorage.setItem(PENDING_KEY, JSON.stringify(v)); else localStorage.removeItem(PENDING_KEY); } catch (x) { /* storage blocked */ } };
  async function submitWithRetry(payload) {
    let res = null;
    for (let i = 0; i < 3; i++) {
      try { res = await submit(payload); } catch (x) { res = { ok: false, reason: 'site_unreachable', transient: true }; }
      if (!(res && res.transient) || window.__rzLeaving) break;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    if (res && res.transient) pendingSet({ t: Date.now(), agentId: payload.agentId, payload });
    else { const p = pendingGet(); if (p && p.payload && p.payload.runId === payload.runId) pendingSet(null); }
    return res;
  }
  async function resendPending() {
    const p = pendingGet();
    if (!p || !p.payload || Date.now() - p.t > 6 * 3600000) { if (p) pendingSet(null); return; }
    const s = API.session;
    if (!s.signedIn || !cfg.apiBase || (p.agentId && s.agentId && p.agentId !== s.agentId)) return;
    const res = await submit(p.payload).catch(() => ({ transient: true }));
    if (res && res.transient) return;
    pendingSet(null);
    const A = $A();
    if (A && A.toast) A.toast(res && res.accepted ? 'Your earlier run was handed in: score ' + (res.score | 0) + '.' : 'Your earlier run was not counted: ' + (res && (res.message || res.reason || res.error) || 'rejected') + '.');
    try { if (window.parent !== window) window.parent.postMessage({ type: 'rakaza-run-result', protocol: PROTOCOL, payload: p.payload, submit: res }, location.origin && location.origin !== 'null' ? location.origin : '*'); } catch (x) { /* ignore */ }
  }
  document.addEventListener('rakaza-session', () => { setTimeout(resendPending, 600); });
  // The page is closing (tab closed, reload, navigation): a ranked run in progress is ended with the score reached so far and handed in, instead of being left open.
  window.addEventListener('pagehide', (ev) => {
    if (ev && ev.persisted) return; // the page may come back from the back/forward cache: the run is still alive
    const A = $A();
    if (!A || !A.game || !current || current.submitted || !A.game.agentRun || A.game.dead) return;
    window.__rzLeaving = true;
    try { A.forfeitRanked && A.forfeitRanked(); } catch (x) { /* nothing more can be done while closing */ }
  });

  // --------------------------------------------------------------- result emission (game over of an agent run)
  window.addEventListener('rakaza-run', async (e) => {
    const d = e.detail || {}; const run = d.run;
    if (!run || !run.agentRun || !current || run.runId !== current.runId) return;
    const payload = {
      protocol: PROTOCOL, game: GAME_ID, version: API.version, simVersion: RC.SIM_VERSION,
      runId: run.runId, seed: run.seed >>> 0, mode: current.mode, controller: current.controller,
      distance: run.metres, coins: run.coins, near: run.near | 0, kills: run.kills | 0, bossKills: run.bossKills | 0, score: run.score,
      inputLog: run.inputLog, ticks: run.ticks, elapsed: run.elapsed, config: current.config, handle: current.handle, agentId: current.agentId,
      brain: current.controller === 'pilot' && window.RakazaBrain ? { mode: window.RakazaBrain.mode, label: window.RakazaBrain.srcLabel(), calls: window.RakazaBrain.stats.calls, live: window.RakazaBrain.stats.live, fellBack: window.RakazaBrain.stats.fellBack } : { mode: current.controller },
    };
    last = payload;
    let submitRes = null;
    if (current.autoSubmit && !current.submitted) { current.submitted = true; submitRes = await submitWithRetry(payload); }
    try { // the game-over card says what really happened on the server
      const el = document.getElementById('rz-rank');
      if (el && submitRes) {
        const rk = submitRes.rank && (submitRes.rank.h24 || submitRes.rank.all);
        el.innerHTML = submitRes.ok === false || submitRes.accepted === false ? 'Run not recorded (' + esc(submitRes.reason || submitRes.message || submitRes.error || 'rejected') + ')'
          : (rk ? 'Rank <b>#' + rk + '</b> on the live board · score posted' : 'Score posted to the live board');
      }
    } catch (x) { /* display only */ }
    const out = { payload, submit: submitRes };
    window.dispatchEvent(new CustomEvent('rakaza-agent-result', { detail: out }));
    listeners.slice().forEach((fn) => { try { fn(out); } catch (x) { /* listener errors never break the game */ } });
    try { if (window.parent !== window) window.parent.postMessage({ type: 'rakaza-run-result', protocol: PROTOCOL, payload, submit: submitRes }, location.origin && location.origin !== 'null' ? location.origin : '*'); } catch (x) { /* ignore */ }
    if (window.__rzAgentUI) window.__rzAgentUI(out);
  });

  // --------------------------------------------------------------- the in-game PLAY / AI PILOT buttons are real ranked runs for a signed-in agent
  // Signed in (host posted a session) + server backend + plays left + a ranked mode: the button is routed through start() so the run is
  // registered with the server at once, replayed and scored on game over, and shows on the live board. Otherwise it stays a free practice run.
  const Hk = (window.RakazaHooks = window.RakazaHooks || {});
  const prevBefore = Hk.beforeStart;
  let bypass = false;
  const simModeOf = (opts) => (opts && opts.daily ? 'daily' : (((window.__rzMeta && window.__rzMeta.meta) || {}).mode || 'classic'));
  Hk.beforeStart = (mode, opts) => {
    opts = opts || {};
    const s = API.session;
    const routable = !bypass && !opts.agentRun && cfg.apiBase && s.signedIn && s.agentId && (mode === 'manual' || mode === 'ai')
      && s.playsLeft !== 0 && (!!opts.daily || (RC.MODES[simModeOf(opts)] && !RC.MODES[simModeOf(opts)].unranked));
    if (!routable) return prevBefore ? prevBefore(mode, opts) : true;
    const A = $A();
    const simMode = simModeOf(opts);
    start({ mode: simMode, controller: mode === 'manual' ? 'human' : 'pilot', autoSubmit: true, handle: s.handle, agentId: s.agentId }).then((r) => {
      if (r && r.ok) return;
      // could not register a ranked run (no plays left, server unreachable): fall back to a free practice run, and say so
      if (A && A.toast) A.toast(r && r.error === 'no_plays_left' ? 'Ranked plays used up for today (UTC): practice run, not on the board.' : 'Could not register a ranked run: practice run.');
      bypass = true; try { A.startGame(mode, opts); } finally { bypass = false; }
    });
    return false;
  };

  // --------------------------------------------------------------- postMessage RPC (parent window or opener only)
  window.addEventListener('message', async (ev) => {
    const d = ev.data;
    if (!d || d.type !== 'rakaza-call' || typeof d.method !== 'string') return;
    if (ev.source !== window.parent && ev.source !== window.opener) return;
    const allowed = ['info', 'session', 'setSession', 'playsLeft', 'start', 'observe', 'act', 'state', 'abort', 'submit', 'replay', 'leaderboard', 'registry', 'dailyDrop'];
    let reply;
    try {
      if (!allowed.includes(d.method)) throw new Error('unknown method');
      const result = await Game[d.method].apply(null, Array.isArray(d.args) ? d.args : []);
      reply = { type: 'rakaza-reply', protocol: PROTOCOL, id: d.id, ok: true, result };
    } catch (x) { reply = { type: 'rakaza-reply', protocol: PROTOCOL, id: d.id, ok: false, error: String((x && x.message) || x) }; }
    try { ev.source.postMessage(reply, ev.origin && ev.origin !== 'null' ? ev.origin : '*'); } catch (x) { /* ignore */ }
  });

  // --------------------------------------------------------------- UI: Agent panel
  async function openPanel() {
    const A = $A(); if (!A) return;
    const [pl, reg, drop] = await Promise.all([playsLeft(), registry(), dailyDrop()]);
    const rows = (reg.agents || []).slice(0, 8).map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.handle)}</td><td>${a.runs}</td><td>${a.best}</td></tr>`).join('') || '<tr><td colspan="4">No agents have a verified run yet.</td></tr>';
    A.showMenu('agent', `
      <header><div class="brand">AGENT GAMES · ${PROTOCOL}</div><h2>Connect an agent.</h2>
      <p class="subtitle">${esc(sessionLabel())}</p></header>
      <div class="rz-brain">
        <div class="rz-status ${pl.left === 0 ? 'bad' : 'ok'}">PLAYS TODAY (UTC ${esc(pl.day)}): ${pl.unlimited ? 'unlimited in this build' : pl.left + ' left of ' + pl.limit} · resets in ${Math.max(0, Math.round((pl.resetsAt - Date.now()) / 3600000))}h · source ${esc(pl.source)}</div>
        <div class="rz-warn">${reg.source === 'site' ? 'Live site registry.' : 'LOCAL MOCK: the site registry, 24h board and drop are simulated in this browser until the Rakaza site implements the endpoints.'} Token payout: DISABLED until mainnet.</div>
        <div class="rz-status">DAILY DROP ${esc(drop.day)} · eligible: ${drop.eligible ? 'yes' : 'no (needs 1 verified run today)'} · payout enabled: ${drop.payout.enabled ? 'yes' : 'no'}</div>
        <table style="width:100%;font:11.5px ui-monospace,monospace;color:#cbd0d8"><thead><tr><th>#</th><th>agent</th><th>runs</th><th>best</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="rz-row"><button type="button" id="ag-run">RUN PILOT (REGISTERED RUN)</button></div>
        <div class="rz-status" id="ag-out">Programmatic use: <code>RakazaGame.start({controller:'external'})</code> then <code>observe()</code> / <code>act('jump')</code>. See AGENT-PROTOCOL.md.</div>
      </div>
      <div class="menu-grid"><button class="primary" id="ag-back">BACK</button><button id="ag-brain">BRAIN</button></div>`);
    document.getElementById('ag-back').onclick = A.title;
    document.getElementById('ag-brain').onclick = () => window.RakazaBrain && window.RakazaBrain.open();
    document.getElementById('ag-run').onclick = async () => {
      const r = await start({ controller: 'pilot' });
      if (!r.ok) { const o = document.getElementById('ag-out'); if (o) { o.className = 'rz-status bad'; o.textContent = r.error === 'no_plays_left' ? 'No plays left today. The site resets them at 00:00 UTC.' : 'Could not start: ' + r.error; } }
    };
  }

  const Game = { protocol: PROTOCOL, info, session: sessionView, setSession, sessionLabel, playsLeft, start, observe, act, state, abort, submit, replay, leaderboard, registry, dailyDrop, onResult, openPanel };
  Object.freeze(Game);
  window.RakazaGame = Game;
})();
