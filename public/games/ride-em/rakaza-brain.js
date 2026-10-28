/* ============================================================================
   RAKAZA BRAIN (v15) - who flies the AI pilot.
     1) BUILT-IN  : a scripted autopilot (heuristic, no model, no learning).
     2) RIVER     : real River AI call through the preview's own /api/river-brain
                    function. River picks an action TYPE per upcoming obstacle
                    (jump | slide | stomp | double | wait); the scripted
                    controller executes the timing. Any error -> built-in pilot,
                    and the UI says FELL BACK.
     3) BYO MODEL : any OpenAI-compatible chat-completions endpoint the player
                    configures (base URL, model id, API key). The key lives in
                    memory (optionally sessionStorage for this tab), is never
                    logged and is only ever sent to the player's own base URL.
   Nothing here talks to any other host.
   ========================================================================== */
(() => {
  'use strict';
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const SS = {
    get(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) {} },
  };
  const KEY = 'rz_brain_v15', SKEY = 'rz_brain_key_tab';
  const ACTIONS = ['jump', 'slide', 'stomp', 'double', 'wait'];
  const cfg = Object.assign({ mode: 'builtin', riverModel: 'deepseek-ai/DeepSeek-V4.1-Flash', byoBase: '', byoModel: '', byoProtocol: 'openai', byoTimeout: 4000, byoRemember: false }, LS.get(KEY, {}));
  if (cfg.mode !== 'builtin' && cfg.mode !== 'river' && cfg.mode !== 'byo') cfg.mode = 'builtin';
  let byoKey = cfg.byoRemember ? SS.get(SKEY) : '';          // memory only unless remembered for this tab
  const save = () => LS.set(KEY, cfg);                        // the key is NOT part of cfg

  const SYSTEM = 'You pilot a rooftop runner. You get the next obstacles (id, type, t = seconds until contact, w = width, h = height). '
    + 'Choose one action per obstacle: jump (over blocks and gaps), slide (under low things like drones/signs), stomp (jump onto a monster), double (double jump over tall blocks), wait. '
    + 'Reply with ONLY compact JSON: {"decisions":[{"id":<number>,"do":"jump|slide|stomp|double|wait"}]} and nothing else.';
  const userMsg = (obs) => 'obs=' + JSON.stringify(obs);

  const stats = { calls: 0, live: 0, fellBack: 0, errors: 0, msTotal: 0, lastMs: 0, lastModel: '', lastReason: '', lastLive: false, source: '' };
  const resetStats = () => { Object.assign(stats, { calls: 0, live: 0, fellBack: 0, errors: 0, msTotal: 0, lastMs: 0, lastModel: '', lastReason: '', lastLive: false }); };

  // ---------------------------------------------------------------- strict parser
  // accepts {"decisions":[{id,do}]} (and the compat {jump,slide}); everything else is rejected
  function parseDecisions(text) {
    if (typeof text !== 'string' || text.length > 4000) return null;
    let t = text.trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let j;
    try { j = JSON.parse(m[0]); } catch (e) { return null; }
    if (!j || typeof j !== 'object') return null;
    const out = {};
    let n = 0;
    if (Array.isArray(j.decisions)) {
      for (const d of j.decisions.slice(0, 8)) {
        if (!d || !Number.isFinite(+d.id)) continue;
        const a = String(d.do || d.action || '').toLowerCase();
        if (ACTIONS.indexOf(a) < 0) continue;
        out[+d.id] = a; n++;
      }
      return n ? out : null;
    }
    if (typeof j.jump === 'boolean' || typeof j.slide === 'boolean') return { __compat: { jump: !!j.jump, slide: !!j.slide } };
    return null;
  }

  // ---------------------------------------------------------------- planning state
  let plan = {};            // obstacleId -> action
  let planAt = 0;
  let inflight = null;
  let nextAllowed = 0;
  let epoch = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function abort() {
    epoch++;
    if (inflight && inflight.ctl) { try { inflight.ctl.abort(); } catch (e) {} }
    inflight = null; plan = {};
  }

  function riverUrl() {
    const c = window.RAKAZA_CONFIG || {};
    return c.riverUrl || '/api/river-brain';
  }
  function validBase(u) {
    try {
      const x = new URL(u);
      if (x.protocol === 'https:') return true;
      return x.protocol === 'http:' && (x.hostname === 'localhost' || x.hostname === '127.0.0.1' || x.hostname === '[::1]');
    } catch (e) { return false; }
  }

  async function postJSON(url, body, headers, timeoutMs, cred) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    const t0 = now();
    try {
      const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: JSON.stringify(body), signal: ctl.signal, cache: 'no-store', credentials: cred || 'omit', referrerPolicy: 'no-referrer' });
      const ms = Math.round(now() - t0);
      let data = null, text = '';
      try { text = await r.text(); data = JSON.parse(text); } catch (e) { /* not JSON */ }
      return { status: r.status, ok: r.ok, data, text, ms };
    } catch (e) {
      return { status: 0, ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network', ms: Math.round(now() - t0) };
    } finally { clearTimeout(to); }
  }

  // ---- River: via our own function
  async function riverCall(obs, test) {
    const r = await postJSON(riverUrl(), test ? { test: true, model: cfg.riverModel } : { model: cfg.riverModel, obs }, null, 3200, 'same-origin');
    if (r.error) return { live: false, reason: r.error, ms: r.ms };
    if (!r.ok || !r.data) return { live: false, reason: 'http ' + r.status, ms: r.ms };
    const d = r.data;
    if (d.fallback || !d.live) return { live: false, reason: String(d.reason || 'fallback').slice(0, 80), ms: d.ms || r.ms };
    const dec = {};
    let n = 0;
    for (const x of (d.decisions || [])) { if (x && Number.isFinite(+x.id) && ACTIONS.indexOf(x.do) >= 0) { dec[+x.id] = x.do; n++; } }
    if (!n) return { live: false, reason: 'empty answer', ms: r.ms };
    return { live: true, decisions: dec, ms: r.ms, upstreamMs: d.ms, model: d.model || cfg.riverModel };
  }

  function relayUrl() { const u = riverUrl(); return /\/brain$/.test(u) ? u.replace(/\/brain$/, '/byo/relay') : ''; }
  // ---- BYO: OpenAI-compatible chat completions straight from the browser to the player's URL
  async function byoCall(obs) {
    if (!validBase(cfg.byoBase)) return { live: false, reason: 'bad base url' };
    if (!cfg.byoModel) return { live: false, reason: 'no model id' };
    const proto = cfg.byoProtocol === 'anthropic' || /\/messages\/?$/i.test(cfg.byoBase) ? 'anthropic' : 'openai';
    // the base may be pasted with or without /v1, with a trailing slash or as the full /chat/completions URL: keep the base, add /v1 when it has no version
    let root = cfg.byoBase.trim().replace(/\/+$/, '').replace(/\/(chat\/completions|completions|messages|models)$/i, '').replace(/\/+$/, '');
    if (!/\/(v\d+[a-z]*|openai|openapi)(\/[a-z0-9_-]+)?$/i.test(root)) root += '/v1';
    const url = root + '/chat/completions';
    const headers = byoKey ? { authorization: 'Bearer ' + byoKey } : {};
    const body = { model: cfg.byoModel, temperature: 0, max_tokens: 160, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg(obs) }] };
    const tmo = Math.max(800, Math.min(15000, cfg.byoTimeout | 0 || 4000));
    let r = null;
    // Optional relay through the site's own server (only when signed in): it lets providers that block browser CORS work.
    // The key travels in one header for that single call and is never stored or logged. Any relay problem falls back to the direct call.
    const rel = cfg.byoRelay !== false ? relayUrl() : '';
    if (rel) {
      const rr = await postJSON(rel, { base: cfg.byoBase, model: cfg.byoModel, protocol: proto, timeout: tmo, obs }, byoKey ? { 'x-byo-key': byoKey } : {}, tmo + 2500, 'same-origin');
      if (rr.status === 200 && rr.data && rr.data.ok === true) r = { status: 200, ok: true, data: rr.data, ms: rr.data.ms || rr.ms };
      else if (rr.status === 200 && rr.data && rr.data.ok === false) r = { status: rr.data.status || 0, ok: false, error: rr.data.status ? '' : String(rr.data.error || 'network').slice(0, 60), ms: rr.data.ms || rr.ms };
    }
    if (!r && proto === 'anthropic') return { live: false, reason: 'anthropic style needs the site relay (sign in)' };
    if (!r) r = await postJSON(url, body, headers, tmo);
    if (r.error) return { live: false, reason: r.error, ms: r.ms };
    if (r.status === 401 || r.status === 403) return { live: false, reason: 'unauthorized (' + r.status + ')', ms: r.ms };
    if (!r.ok) return { live: false, reason: 'http ' + r.status, ms: r.ms };
    const content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
    if (typeof content !== 'string') return { live: false, reason: 'bad response shape', ms: r.ms };
    const dec = parseDecisions(content);
    if (!dec) return { live: false, reason: 'answer is not the expected JSON', ms: r.ms };
    if (dec.__compat) {
      // compat answer {jump,slide}: map onto the first obstacle only
      const first = obs && obs.obstacles && obs.obstacles[0];
      if (!first) return { live: false, reason: 'no obstacle to map', ms: r.ms };
      const a = dec.__compat.slide ? 'slide' : dec.__compat.jump ? 'jump' : 'wait';
      return { live: true, decisions: { [first.id]: a }, ms: r.ms, model: cfg.byoModel, compat: true };
    }
    return { live: true, decisions: dec, ms: r.ms, model: cfg.byoModel };
  }

  const sampleObs = { v: 1, speed: 190, state: 'ground', jumpsLeft: 2, shield: false, coinsAhead: 3, dist: 120, obstacles: [{ id: 7, kind: 'vent', type: 'block', t: 0.9, w: 40, h: 30 }, { id: 8, kind: 'drone', type: 'low', t: 1.7, w: 50, h: 60 }] };

  function record(res) {
    stats.calls++;
    stats.lastMs = res.ms || 0;
    stats.msTotal += res.ms || 0;
    if (res.live) { stats.live++; stats.lastLive = true; stats.lastModel = res.model || ''; stats.lastReason = ''; }
    else { stats.fellBack++; stats.lastLive = false; stats.lastReason = res.reason || 'fallback'; if (/timeout|network|http|bad|empty|answer|unauthorized/.test(res.reason || '')) stats.errors++; }
  }

  // ---------------------------------------------------------------- per-run hooks used by the engine
  function tick(game, dt) {
    if (cfg.mode === 'builtin' || !game || game.paused || game.dead) return;
    const t = now();
    // drop plan entries for obstacles that are gone
    const alive = {};
    for (const o of game.obstacles) alive[o.id] = true;
    for (const k of Object.keys(plan)) if (!alive[k]) delete plan[k];
    if (inflight || t < nextAllowed) return;
    const Sim = window.RakazaSim;
    const obs = Sim.observe(game, 5);
    const need = obs.obstacles.filter((o) => !plan[o.id] && o.t > 0.25);
    if (!need.length) return;
    inflight = { ctl: null };
    const my = epoch;
    nextAllowed = t + (cfg.mode === 'river' ? 1500 : 900);
    const p = cfg.mode === 'river' ? riverCall({ v: obs.v, speed: obs.speed, state: obs.state, jumpsLeft: obs.jumpsLeft, shield: obs.shield, coinsAhead: obs.coinsAhead, obstacles: obs.obstacles.slice(0, 4) }) : byoCall(obs);
    p.then((res) => {
      if (my !== epoch) return;
      inflight = null;
      record(res);
      if (res.live) { Object.assign(plan, res.decisions); planAt = now(); }
      else nextAllowed = now() + 2500;      // back off after a failure; the scripted pilot flies meanwhile
    }).catch(() => { if (my === epoch) { inflight = null; record({ live: false, reason: 'error' }); nextAllowed = now() + 2500; } });
  }

  function override(game) {
    if (cfg.mode === 'builtin') return null;
    return plan;
  }

  const modeName = () => (cfg.mode === 'river' ? 'River AI' : cfg.mode === 'byo' ? 'Your model' : 'Built-in pilot');
  function srcLabel() {
    if (cfg.mode === 'river') return 'River AI · LIVE';
    if (cfg.mode === 'byo') return 'your model · LIVE';
    return 'built-in pilot';
  }
  function status() {
    if (cfg.mode === 'builtin') return { mode: 'builtin', label: 'BUILT-IN PILOT (scripted autopilot)', live: false };
    const s = stats;
    const avg = s.calls ? Math.round(s.msTotal / s.calls) : 0;
    if (!s.calls) return { mode: cfg.mode, label: modeName().toUpperCase() + ' · waiting for the first call', live: false, stats: Object.assign({ avgMs: avg }, s) };
    return { mode: cfg.mode, label: s.lastLive ? modeName().toUpperCase() + ' · LIVE' : modeName().toUpperCase() + ' · FELL BACK to built-in (' + s.lastReason + ')', live: s.lastLive, stats: Object.assign({ avgMs: avg }, s) };
  }

  // ---------------------------------------------------------------- models list (River)
  let modelCache = null;
  async function riverModels() {
    if (modelCache) return modelCache;
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 3500);
      const r = await fetch(riverUrl() + '?models=1', { cache: 'no-store', credentials: 'same-origin', signal: ctl.signal });
      clearTimeout(to);
      const d = await r.json();
      if (d && Array.isArray(d.models) && d.models.length) { modelCache = d.models.map((x) => ({ id: String(x.id), ok: x.ok })); return modelCache; }
    } catch (e) { /* fall through */ }
    return [{ id: cfg.riverModel, ok: null }];
  }

  async function testRiver() {
    const r = await riverCall(null, true);
    record(r);
    return r;
  }
  async function testByo() {
    const r = await byoCall(sampleObs);
    record(r);
    return r;
  }

  // ---------------------------------------------------------------- UI (a menu screen in the game shell)
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (id) => document.getElementById(id);

  function open() {
    const A = window.__rz2; if (!A) return;
    const st = status();
    const s = stats;
    A.showMenu('brain', `
      <header>
        <div class="brand">AI BRAIN</div>
        <h2>Who flies your pilot?</h2>
        <p class="subtitle">Pick the brain the AI PILOT uses. Skills and timing are always executed by the game's controller, so no brain can break the rules.</p>
      </header>
      <div class="rz-brain">
        <label class="rz-opt ${cfg.mode === 'builtin' ? 'on' : ''}"><input type="radio" name="bm" value="builtin" ${cfg.mode === 'builtin' ? 'checked' : ''}>
          <b>1 · Built-in pilot</b><span>A scripted autopilot (heuristic rules). No model, no learning, no network. Honest baseline.</span></label>
        <label class="rz-opt ${cfg.mode === 'river' ? 'on' : ''}"><input type="radio" name="bm" value="river" ${cfg.mode === 'river' ? 'checked' : ''}>
          <b>2 · River AI</b><span>A real River model call per obstacle plan, through this site's own <code>/api/river-brain</code> function (the key stays on the server). Falls back to the built-in pilot on any error and says so.</span></label>
        <div class="rz-sub ${cfg.mode === 'river' ? '' : 'hidden'}" id="rb-river">
          <label>Model <select id="rb-model"><option>${esc(cfg.riverModel)}</option></select></label>
          <button id="rb-test-river" type="button">TEST RIVER</button>
        </div>
        <label class="rz-opt ${cfg.mode === 'byo' ? 'on' : ''}"><input type="radio" name="bm" value="byo" ${cfg.mode === 'byo' ? 'checked' : ''}>
          <b>3 · Bring your own model</b><span>Any OpenAI-compatible <code>/chat/completions</code> endpoint. Your browser talks straight to your URL; signed in on the site, each call is relayed by the site's server so providers that block browsers still work. The key is sent for that one call only and is never stored.</span></label>
        <div class="rz-sub ${cfg.mode === 'byo' ? '' : 'hidden'}" id="rb-byo">
          <label>Base URL <input id="rb-base" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://api.example.com/v1" value="${esc(cfg.byoBase)}"></label>
          <label>Model ID <input id="rb-bmodel" type="text" autocomplete="off" spellcheck="false" placeholder="your-model-id" value="${esc(cfg.byoModel)}"></label>
          <label>API key <input id="rb-key" type="password" autocomplete="off" spellcheck="false" placeholder="${byoKey ? 'key set for this tab' : 'sk-...'}" value=""></label>
          <label>Timeout (ms) <input id="rb-to" type="number" min="800" max="15000" step="100" value="${cfg.byoTimeout | 0}"></label>
          <label class="rz-chk"><input id="rb-rem" type="checkbox" ${cfg.byoRemember ? 'checked' : ''}> keep the key for this tab only (sessionStorage)</label>
          <p class="rz-warn">Your key is kept in memory (or this tab's sessionStorage if ticked), is never logged and is sent only to the base URL above. Use a key with a low limit. The endpoint must allow CORS from this page. Only https URLs (or localhost) are accepted.</p>
          <div class="rz-row"><button id="rb-test-byo" type="button">TEST</button><button id="rb-skip" type="button">SKIP · USE BUILT-IN</button></div>
        </div>
        <div class="rz-status" id="rb-status" role="status">${esc(st.label)}${s.calls ? ` · ${s.live} live / ${s.fellBack} fell back · last ${s.lastMs} ms` : ''}</div>
      </div>
      <div class="menu-grid">
        <button class="primary" id="rb-save">SAVE</button>
        <button id="rb-back">BACK</button>
      </div>`);
    const setSel = () => {
      const v = (document.querySelector('input[name=bm]:checked') || {}).value || 'builtin';
      $('rb-river').classList.toggle('hidden', v !== 'river');
      $('rb-byo').classList.toggle('hidden', v !== 'byo');
      A.panel.querySelectorAll('.rz-opt').forEach((l) => l.classList.toggle('on', l.querySelector('input').value === v));
    };
    A.panel.querySelectorAll('input[name=bm]').forEach((r) => { r.onchange = setSel; });
    const apply = () => {
      const v = (document.querySelector('input[name=bm]:checked') || {}).value || 'builtin';
      cfg.mode = v;
      const ms = $('rb-model'); if (ms && ms.value) cfg.riverModel = ms.value;
      cfg.byoBase = ($('rb-base').value || '').trim();
      cfg.byoModel = ($('rb-bmodel').value || '').trim();
      cfg.byoTimeout = Math.max(800, Math.min(15000, +$('rb-to').value || 4000));
      cfg.byoRemember = $('rb-rem').checked;
      const k = $('rb-key').value.trim();
      if (k) byoKey = k;
      SS.set(SKEY, cfg.byoRemember ? byoKey : '');
      save(); abort(); resetStats();
    };
    const say = (html) => { const el = $('rb-status'); if (el) el.innerHTML = html; };
    riverModels().then((list) => {
      const sel = $('rb-model'); if (!sel) return;
      sel.innerHTML = list.map((m) => `<option value="${esc(m.id)}" ${m.id === cfg.riverModel ? 'selected' : ''}>${esc(m.id)}${m.ok === false ? ' (untested)' : ''}</option>`).join('');
      if (!list.some((m) => m.id === cfg.riverModel)) sel.value = list[0].id;
    });
    $('rb-test-river').onclick = async () => {
      apply(); cfg.mode = 'river'; save(); say('Calling River…');
      const r = await testRiver();
      say(r.live ? `<b class="ok">LIVE</b> · real River answer in ${r.ms} ms (model ${esc(r.model)}) · ${Object.keys(r.decisions).length} decisions` : `<b class="bad">FELL BACK</b> · ${esc(r.reason)} · the built-in pilot would fly`);
    };
    $('rb-test-byo').onclick = async () => {
      apply(); cfg.mode = 'byo'; save(); say('Calling your model…');
      const r = await testByo();
      say(r.live ? `<b class="ok">OK</b> · valid answer in ${r.ms} ms · ${Object.keys(r.decisions).length} decisions` : `<b class="bad">FAILED</b> · ${esc(r.reason)}`);
    };
    $('rb-skip').onclick = () => { cfg.mode = 'builtin'; save(); abort(); open(); };
    $('rb-save').onclick = () => { apply(); A.toast('Brain: ' + modeName()); A.title(); };
    $('rb-back').onclick = () => A.title();
  }

  window.RakazaBrain = {
    cfg, get mode() { return cfg.mode; }, tick, override, abort, srcLabel, status, stats, resetStats,
    parseDecisions, riverModels, testRiver, testByo, open, SYSTEM, userMsg, validBase,
    set(o) { const { byoKey: k, ...rest } = o || {}; Object.assign(cfg, rest); if (k != null) byoKey = String(k); save(); abort(); },
    get hasKey() { return !!byoKey; },
  };
  const H = (window.RakazaHooks = window.RakazaHooks || {});
  H.openBrain = open;
})();
