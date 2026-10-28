/* Rakaza AI pilot stages (1-6). The stage only decides how often the built-in pilot loses focus on an obstacle.
   Stage 6 is the full expert pilot, untouched: it is returned as-is. The score never depends on the stage - the server replays the input log and is the only score source.
   The stage a player may use comes from the server (owner-controlled cap); nothing here can raise a score or unlock stage 6 on the server. */
(function (root) {
  'use strict';
  // chance, per obstacle, that the pilot loses focus on it (decided by a hash of the run seed and the obstacle id, so a replay of the same run is identical)
  var MISS = [0, 0.5, 0.26, 0.13, 0.055, 0.018, 0];
  var NAMES = ['', 'Beginner', 'Apprentice', 'Rider', 'Veteran', 'Master', 'Expert'];
  function h(seed, id) {
    var x = ((seed >>> 0) ^ Math.imul(((id | 0) + 0x9E3779B9) | 0, 0x85EBCA6B)) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x2C1B3C6D) >>> 0; x = Math.imul(x ^ (x >>> 12), 0x297A2D39) >>> 0; x = (x ^ (x >>> 15)) >>> 0;
    return x / 4294967296;
  }
  function target(w) { // the obstacle the pilot is dealing with (same rule as the sim's own decide)
    var o = null;
    for (var i = 0; i < w.obstacles.length; i++) { var c = w.obstacles[i]; if (!c.hit && c.x + c.width / 2 > w.travel - 12 && (o === null || c.x < o.x)) o = c; }
    return o;
  }
  // exempt(o): true only when the user's OWN model (bring-your-own) gave a live answer for that obstacle. Nothing else is exempt: not the platform brain, not an empty plan, not the champion.
  function shape(w, d, stage, exempt) {
    stage = stage | 0;
    if (stage >= 6 || !w || !d) return d;
    if (stage < 1) stage = 1;
    var o = target(w);
    if (!o || (exempt && exempt(o)) || h(w.seed, o.id) >= MISS[stage]) return d;
    return { action: 'WAIT', power: 0, reason: NAMES[stage] + ' pilot lost focus on the ' + o.kind + '.' };
  }
  var cur = { stage: 1, max: 5, signedIn: false }; var subs = [];
  var KEY = 'rz_stage_guest';
  function clamp(n, lo, hi) { n = Math.round(Number(n)); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
  function stage() {
    if (cur.signedIn) return clamp(cur.stage, 1, cur.max);
    var g = 1; try { g = clamp(root.localStorage && root.localStorage.getItem(KEY), 1, 5); } catch (e) { /* ignore */ }
    return g;
  }
  function load() {
    if (typeof fetch !== 'function') return;
    fetch('/api/public/games/ride-em/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var s = j && j.setup; if (!s) return;
      cur = { stage: clamp(s.pilotStage, 1, 6), max: s.pilotMax === 6 ? 6 : 5, signedIn: true };
      subs.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
    }).catch(function () { /* guests keep the local stage */ });
  }
  // choose a stage: signed-in agents save it on the server (which refuses 6 unless the owner unlocked it); guests keep it on this device (1-5 only)
  function pick(n) {
    n = clamp(n, 1, 6);
    if (cur.signedIn) {
      if (n > cur.max) return Promise.resolve({ ok: false, locked: true });
      return fetch('/api/public/games/ride-em/config', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pilotStage: n }) })
        .then(function (r) { if (r.ok) { cur.stage = n; subs.forEach(function (f) { f(); }); } return { ok: r.ok, locked: r.status === 403 }; }).catch(function () { return { ok: false }; });
    }
    if (n > 5) return Promise.resolve({ ok: false, locked: true });
    try { root.localStorage.setItem(KEY, String(n)); } catch (e) { /* ignore */ }
    subs.forEach(function (f) { f(); });
    return Promise.resolve({ ok: true });
  }
  var api = { pick: pick, max: function () { return cur.signedIn ? cur.max : 5; }, onChange: function (f) { subs.push(f); }, shape: shape, stage: stage, name: function () { return NAMES[stage()]; }, MISS: MISS.slice(), NAMES: NAMES.slice(), refresh: load, set: function (n) { if (!cur.signedIn) { try { root.localStorage.setItem(KEY, String(clamp(n, 1, 5))); } catch (e) { /* ignore */ } } } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.RakazaStages = api; load(); }
})(typeof window !== 'undefined' ? window : globalThis);
