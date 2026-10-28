/* ============================================================================
   RAKAZA REPLAY (v15) - input-log codec, headless deterministic replay, config validation.
   Pure JS (UMD). No DOM. RakazaReplay.replay(seed, inputLog, config) -> exact same result as
   the real played run, because both use rakaza-sim.js with the same fixed 120 Hz ticks.
   ========================================================================== */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const C = isNode ? require('./rakaza-content.js') : root.RakazaContent;
  const S = isNode ? require('./rakaza-sim.js') : root.RakazaSim;
  if (isNode) module.exports = factory(C, S); else root.RakazaReplay = factory(C, S);
})(typeof self !== 'undefined' ? self : this, function (C, S) {
  'use strict';
  const PREFIX = 'v1:';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const B64R = {}; for (let i = 0; i < 64; i++) B64R[B64[i]] = i;
  const MAX_TICKS = 120 * 3600; // 1 hour of play

  function bytesToB64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      const n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
      if (i + 2 < bytes.length) out += B64[n & 63];
    }
    return out;
  }
  function b64ToBytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i += 4) {
      const c = [0, 0, 0, 0]; let k = 0;
      for (; k < 4 && i + k < str.length; k++) { const v = B64R[str[i + k]]; if (v === undefined) throw new Error('bad inputLog character'); c[k] = v; }
      const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
      out.push((n >> 16) & 255); if (k > 2) out.push((n >> 8) & 255); if (k > 3) out.push(n & 255);
    }
    return out;
  }
  function putVar(out, v) { v = v >>> 0; while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); }
  function getVar(bytes, st) {
    let r = 0, shift = 0;
    for (;;) {
      if (st.i >= bytes.length) throw new Error('truncated inputLog');
      const b = bytes[st.i++]; r |= (b & 127) << shift; if (!(b & 128)) break; shift += 7; if (shift > 28) throw new Error('bad varint');
    }
    return r >>> 0;
  }
  // events: [[tick, op, arg], ...] sorted by tick (stable)
  function encode(events) {
    const out = []; let last = 0;
    for (const e of events) { putVar(out, e[0] - last); out.push(e[1] & 255); putVar(out, e[2] >>> 0); last = e[0]; }
    return PREFIX + bytesToB64(out);
  }
  function decode(str) {
    if (typeof str !== 'string' || str.indexOf(PREFIX) !== 0) throw new Error('inputLog must start with "v1:"');
    const bytes = b64ToBytes(str.slice(PREFIX.length)); const st = { i: 0 }; const ev = []; let t = 0;
    while (st.i < bytes.length) {
      t += getVar(bytes, st); const op = bytes[st.i++]; const arg = getVar(bytes, st);
      if (op === undefined || op < 1 || op > 9) throw new Error('bad op in inputLog');
      ev.push([t, op, arg]);
      if (ev.length > 400000) throw new Error('inputLog too long');
    }
    return ev;
  }

  // ---- config validation (the site runs this before accepting a run; ranked = fair play)
  function validateConfig(cfg, opts) {
    opts = opts || {};
    const ranked = !!(cfg && cfg.ranked) || !!opts.ranked;
    const errors = []; const out = {};
    cfg = cfg || {};
    out.mode = C.MODES[cfg.mode] ? cfg.mode : 'classic'; if (cfg.mode && !C.MODES[cfg.mode]) errors.push('unknown mode');
    out.character = C.CHARACTERS.some((c) => c.id === cfg.character) ? cfg.character : 'courier';
    out.theme = cfg.theme == null ? -1 : (cfg.theme | 0);
    if (out.theme < -1 || out.theme >= C.STAGES.length) { errors.push('bad theme'); out.theme = -1; }
    const maxSk = ranked ? C.RANKED.maxSkills : C.RANKED.maxSkillsWithSlot;
    const sk = Array.isArray(cfg.skills) ? cfg.skills : [];
    out.skills = sk.filter((s) => C.SKILLS[s]).slice(0, maxSk);
    if (sk.length > maxSk) errors.push('too many skills for this run type (max ' + maxSk + ')');
    if (ranked) { out.upg = {}; out.boosts = {}; out.noHead = true; out.ladder = 0; out.startDist = 0; }
    else { out.upg = {}; Object.keys(cfg.upg || {}).forEach((k) => { if (C.UPG[k] && cfg.upg[k]) out.upg[k] = 1; }); out.boosts = {}; Object.keys(cfg.boosts || {}).forEach((k) => { if (C.BOOSTS.some((b) => b.id === k)) out.boosts[k] = cfg.boosts[k] ? 1 : 0; }); out.noHead = !!cfg.noHead; out.ladder = Math.max(0, Math.min(C.LADDER.length - 1, cfg.ladder | 0)); out.startDist = opts.allowStartDist ? Math.max(0, +cfg.startDist || 0) : 0; }
    // character passives come from the table, never from the client
    const ch = C.CHARACTERS.find((c) => c.id === out.character);
    out.perk = ch && ch.perk ? ch.perk : null;
    out.ranked = ranked; out.noEvents = !!cfg.noEvents && !ranked; out.noDraft = !!cfg.noDraft && !ranked;
    return { ok: errors.length === 0, errors, config: out };
  }

  // ---- replay: run the real sim headless
  function replay(seed, inputLog, config, opts) {
    opts = opts || {};
    const events = typeof inputLog === 'string' ? decode(inputLog) : (inputLog || []);
    const cfg = config && config.__validated ? config : validateConfig(config, opts).config;
    const w = S.create(seed >>> 0, cfg);
    w.rec = false; w.noEvents = true;
    const maxTicks = Math.min(opts.maxTicks || MAX_TICKS, MAX_TICKS);
    let idx = 0, guard = 0;
    while (w.tick < maxTicks && !w.over) {
      while (idx < events.length && events[idx][0] <= w.tick) { const e = events[idx++]; S.input(w, e[1], e[2]); if (w.over) break; }
      if (w.over) break;
      if (w.paused) { if (idx >= events.length) break; if (++guard > 5) break; continue; }
      guard = 0;
      if (idx >= events.length && opts.stopAtLogEnd) break;
      S.step(w);
    }
    return { distance: Math.floor(w.dist), coins: w.coins, near: w.near, kills: w.kills, bossKills: w.bossKills, score: S.score(w), ticks: w.tick, cause: w.cause, dead: w.dead, over: !!w.over, hits: w.hits, lives: w.lives, mode: cfg.mode };
  }
  return { PREFIX, MAX_TICKS, encode, decode, validateConfig, replay, bytesToB64, b64ToBytes };
});
