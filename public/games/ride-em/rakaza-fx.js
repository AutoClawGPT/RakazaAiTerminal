/* ============================================================================
   RAKAZA FX (v15) - game-feel layer: camera trauma, hitstop, chromatic pulse, speed lines,
   combo flames, weather, per-effect trails/auras/hit/death/coin particles, glow sprites.
   Cosmetic only (uses Math.random on purpose) - never touches the deterministic sim.
   Pooled particles (fixed size), honours reduce-motion and FX LOW.
   ========================================================================== */
(function () {
  'use strict';
  const C = window.RakazaContent, Art = window.RakazaArt;
  const TAU = Math.PI * 2, rnd = Math.random;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const POOL = 700;
  const pool = []; for (let i = 0; i < POOL; i++) pool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 3, shape: 'dot', col: '#fff', rot: 0, vr: 0, fl: false, scr: false, dark: false });
  let ptr = 0, alive = 0;
  let equip = { trail: 'none', aura: 'none', hit: 'none', death: 'none', coin: 'none' };
  let low = false, reduced = false;
  let trauma = 0, hitstopReq = 0, chroma = 0, flashA = 0, flashCol = '#fff', lvl = 0, zoomPunch = 0, squashT = 0, squashK = 0, landT = 0;
  let overlay = null, octx = null, ow = 0, oh = 0, dpr = 1, off = null, offc = null;
  let trailAcc = 0, auraAcc = 0, ribbon = [], ribT = 0;
  let weatherP = []; let weatherType = 'none'; let tAbs = 0;
  let evTint = null, evTintT = 0, strobe = 0, lastCombo = 0, flameT = 0;
  const stat = { spawned: 0, maxAlive: 0, frames: 0 };

  const effOf = (slot) => { const arr = C.EFFECTS[slot]; const e = arr && arr.find((x) => x.id === equip[slot]); return e && e.p ? e.p : null; };
  const pick = (a) => a[(rnd() * a.length) | 0];
  function spawn(o) {
    if (low && !o.keep) { if (rnd() < 0.5) return; }
    for (let k = 0; k < POOL; k++) {
      const p = pool[ptr]; ptr = (ptr + 1) % POOL;
      if (!p.on) {
        p.on = true; p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.g = o.g || 0; p.life = p.max = o.life || 0.5; p.size = o.size || 3; p.shape = o.shape || 'dot';
        p.col = o.col || '#fff'; p.rot = o.rot || 0; p.vr = o.vr || 0; p.fl = !!o.fl; p.scr = !!o.scr; p.dark = !!o.dark; alive++; stat.spawned++; return;
      }
    }
  }

  // ---------- public juice controls ----------
  const SHAKE = { light: 0.18, medium: 0.34, heavy: 0.6, death: 0.9, boss: 0.5 };
  function shake(preset) { trauma = Math.min(1, trauma + (SHAKE[preset] || SHAKE.light)); }
  function flash(col, a) { flashCol = col || '#fff'; flashA = Math.max(flashA, a == null ? 0.5 : a); }
  function levelUp() { lvl = 1; flash('#fde68a', 0.35); zoomPunch = 1; shake('light'); }

  // ---------- event handling (sim events -> juice) ----------
  function playerPos(w) { return { x: w.travel, y: w.y + 20 }; }
  function burst(spec, x, y, extra) {
    if (!spec) return; const n = spec.n || 8;
    for (let i = 0; i < n; i++) {
      const a = spec.up ? -Math.PI / 2 + (rnd() - 0.5) * 1.4 : rnd() * TAU; const sp = (spec.speed || 120) * (0.35 + rnd() * 0.8);
      if (spec.shape === 'ring') { spawn({ x, y, shape: 'ring', col: pick(spec.colors), life: spec.life, size: spec.size * (1 + i * 0.5), vx: 0, vy: 0, vr: sp, keep: true }); continue; }
      spawn({ x, y, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp * (spec.up ? 0.5 : 1) + (spec.up ? 60 : 0), g: spec.grav == null ? -140 : -spec.grav, life: spec.life * (0.6 + rnd() * 0.6), size: spec.size * (0.7 + rnd() * 0.7), shape: spec.shape, col: pick(spec.colors), rot: rnd() * TAU, vr: (rnd() - 0.5) * 8, fl: spec.flicker, keep: !!(extra && extra.keep) });
    }
  }
  const basicBurst = (x, y, cols, n, speed, life) => burst({ shape: 'square', colors: cols, n, speed, life, size: 2.6 }, x, y);

  function onEvents(w, evs, info) {
    let hs = 0; info = info || {};
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i], t = e[0];
      if (t === 'jump') { basicBurst(e[1], e[2] + 2, ['#d9d0ff', '#8e86b3'], e[3] > 1 ? 9 : 4, 60, 0.35); squashT = 0.16; squashK = 1; if (e[3] > 1) spawn({ x: e[1], y: e[2] + 4, shape: 'ring', col: '#a5b4fc', life: 0.3, size: 4, vr: 120, keep: true }); }
      else if (t === 'land') { basicBurst(e[1], 2, ['#bfb8dc', '#7c7599'], 5, 90, 0.3); landT = 0.14; }
      else if (t === 'slide') { basicBurst(e[1] + 12, 2, ['#fde68a', '#f59e0b'], 5, 110, 0.25); }
      else if (t === 'coin') { const sp = effOf('coin'); if (sp) burst(sp, e[1], e[2]); else basicBurst(e[1], e[2], ['#fde68a', '#e8b85e'], 3, 70, 0.3); }
      else if (t === 'gem') { burst({ shape: 'star', colors: ['#67e8f9', '#fff'], n: 9, speed: 140, life: 0.5, size: 3 }, e[1], e[2]); flash('#22d3ee', 0.08); }
      else if (t === 'star') { burst({ shape: 'star', colors: ['#fde047', '#fff'], n: 12, speed: 170, life: 0.6, size: 3.4 }, e[1], e[2]); flash('#fde047', 0.1); }
      else if (t === 'bolt') { burst({ shape: 'bolt', colors: ['#fde047', '#a5b4fc'], n: 8, speed: 200, life: 0.3, size: 6 }, e[1], e[2]); chroma = Math.max(chroma, 0.4); }
      else if (t === 'heart') { burst({ shape: 'heart', colors: ['#fb7185', '#f9a8d4'], n: 8, speed: 100, life: 0.8, size: 4, grav: -40 }, e[1], e[2]); }
      else if (t === 'power') { burst({ shape: 'ring', colors: ['#22d3ee', '#a995ff'], n: 2, speed: 160, life: 0.4, size: 5 }, e[1], e[2]); }
      else if (t === 'stomp') { const big = e[3] === 1; burst({ shape: 'star', colors: big ? ['#fde047', '#fb923c', '#fff'] : ['#fff', '#fde68a'], n: big ? 16 : 8, speed: big ? 260 : 170, life: 0.5, size: 3.4 }, e[1], e[2] || 30); shake(big ? 'medium' : 'light'); hs = Math.max(hs, big ? 0.08 : 0.05); }
      else if (t === 'bossDown') { shake('heavy'); hs = 0.14; flash('#fde68a', 0.55); chroma = 1; zoomPunch = 1; const p = playerPos(w); burst({ shape: 'star', colors: ['#fde047', '#fb923c', '#fff', '#f43f5e'], n: 60, speed: 380, life: 1.1, size: 4 }, e[3] || p.x + 60, 50); }
      else if (t === 'near') { chroma = Math.max(chroma, 0.25); const p = playerPos(w); spawn({ x: p.x + 14, y: p.y, shape: 'spark', col: '#67e8f9', life: 0.2, size: 8, vx: 200, keep: true }); }
      else if (t === 'hit') {
        const p = playerPos(w); const death = e[3] === 1; const sp = effOf(death ? 'death' : 'hit');
        if (death) { shake('death'); hs = 0.16; chroma = 1; flash('#f43f5e', 0.45); if (sp) burst(sp, p.x, p.y, { keep: true }); else basicBurst(p.x, p.y, ['#f43f5e', '#fde68a', '#fff'], 36, 280, 0.9); }
        else { shake('medium'); hs = 0.1; chroma = 0.8; flash('#22d3ee', 0.3); const h = effOf('hit'); if (h) burst(h, p.x, p.y, { keep: true }); else basicBurst(p.x, p.y, ['#22d3ee', '#fff'], 22, 220, 0.5); }
        info.split = 0.35;
      }
      else if (t === 'revive') { flash('#fde68a', 0.5); shake('medium'); const p = playerPos(w); burst({ shape: 'star', colors: ['#fde047', '#fff'], n: 24, speed: 220, life: 0.8, size: 3.4 }, p.x, p.y); }
      else if (t === 'skill') { const p = playerPos(w); burst({ shape: 'ring', colors: ['#a855f7', '#22d3ee'], n: 3, speed: 260, life: 0.5, size: 6 }, p.x, p.y, { keep: true }); chroma = Math.max(chroma, 0.35); shake('light'); const id = e[1]; if (id === 'thunder') { flash('#fff', 0.45); shake('medium'); hs = 0.06; } if (id === 'bomb' || id === 'quake' || id === 'meteorSk') { shake('heavy'); flash('#fb923c', 0.3); } if (id === 'timestop') flash('#93c5fd', 0.3); if (id === 'overdrive' || id === 'surge') zoomPunch = 1; }
      else if (t === 'stage') { levelUp(); flash('#fff', 0.4); }
      else if (t === 'zone') { evTint = e[1] === 'coinRush' ? '#fbbf24' : e[1] === 'meteor' ? '#fb923c' : e[1] === 'glitchStorm' ? '#4ade80' : e[1] === 'boss' || e[1] === 'bossRun' ? '#f43f5e' : null; evTintT = 3; flash(evTint || '#fff', 0.2); shake('light'); }
      else if (t === 'ladder') { levelUp(); }
    }
    if (hs > hitstopReq) hitstopReq = hs;
    return info;
  }
  const takeHitstop = () => { const h = reduced ? Math.min(hitstopReq, 0.05) : hitstopReq; hitstopReq = 0; return h; };

  // ---------- per-frame update ----------
  function update(dt, w, running, env) {
    tAbs += dt; reduced = !!(env && env.reduced); low = !!(env && env.low);
    trauma = Math.max(0, trauma - dt * 1.7); chroma = Math.max(0, chroma - dt * 3.2); flashA = Math.max(0, flashA - dt * 1.8); lvl = Math.max(0, lvl - dt * 1.4);
    zoomPunch = Math.max(0, zoomPunch - dt * 2.2); squashT = Math.max(0, squashT - dt); landT = Math.max(0, landT - dt); evTintT = Math.max(0, evTintT - dt);
    // particles
    let n = 0;
    for (let i = 0; i < POOL; i++) {
      const p = pool[i]; if (!p.on) continue; p.life -= dt; if (p.life <= 0) { p.on = false; alive--; continue; }
      if (p.shape === 'ring') p.size += p.vr * dt * 0.1 * (p.max > 0 ? 1 : 0); else { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
      n++;
    }
    if (n > stat.maxAlive) stat.maxAlive = n; stat.frames++;
    stepWeather(dt, env);
    if (!running || !w || w.dead) { return; }
    // emitters
    const tr = effOf('trail'), au = effOf('aura'); const px = w.travel, py = w.y + 18;
    if (tr && !reduced) {
      if (tr.shape === 'ribbon') { ribT -= dt; if (ribT <= 0) { ribT = 0.02; ribbon.push({ x: px - 6, y: py + (w.slide > 0 ? -8 : 0) }); if (ribbon.length > 22) ribbon.shift(); } }
      else { trailAcc += dt * tr.rate * (low ? 0.4 : 1); while (trailAcc >= 1) { trailAcc -= 1; spawn({ x: px - 8 - rnd() * 6, y: py + (rnd() - 0.5) * 18, vx: -30 - rnd() * 30, vy: (tr.vy || 0) + (rnd() - 0.5) * 20, g: tr.grav == null ? 0 : -tr.grav, life: tr.life * (0.7 + rnd() * 0.6), size: tr.size, shape: tr.shape, col: pick(tr.colors), rot: rnd() * TAU, vr: (rnd() - 0.5) * 6 }); } }
    } else if (ribbon.length) ribbon.length = 0;
    if (au && au.rate > 0 && !reduced) { auraAcc += dt * au.rate * (low ? 0.4 : 1); while (auraAcc >= 1) { auraAcc -= 1; const a = rnd() * TAU; spawn({ x: px + 4 + Math.cos(a) * au.r * 0.7, y: py + Math.sin(a) * au.r * 0.9, vx: 0, vy: au.vy || 0, g: au.grav == null ? 0 : -au.grav, life: au.life, size: au.size, shape: au.shape, col: pick(au.colors), rot: rnd() * TAU, vr: (rnd() - 0.5) * 6 }); } }
    // speed trail at high speed (cosmetic)
    if (w.velocity > 300 && !reduced && !low && rnd() < 0.5) spawn({ x: px - 10, y: py + (rnd() - 0.5) * 30, vx: -120, life: 0.18, size: 6, shape: 'spark', col: '#ffffff80', keep: true });
  }

  // ---------- weather ----------
  function stepWeather(dt, env) {
    const wt = env && env.weather || 'none';
    if (wt !== weatherType) { weatherType = wt; weatherP.length = 0; }
    if (reduced) { weatherP.length = 0; return; }
    const want = ({ rain: low ? 40 : 110, snow: low ? 40 : 100, embers: low ? 24 : 60, meteors: low ? 2 : 4, glitch: low ? 6 : 14, stars: low ? 0 : 3, aurora: 0, none: 0 })[wt] || 0;
    while (weatherP.length < want) weatherP.push({ x: rnd(), y: rnd(), z: 0.4 + rnd() * 0.8, ph: rnd() * TAU, life: rnd() });
    if (weatherP.length > want) weatherP.length = want;
    for (const p of weatherP) {
      if (wt === 'rain') { p.y += dt * (1.6 + p.z); p.x -= dt * 0.25; }
      else if (wt === 'snow') { p.y += dt * (0.12 + p.z * 0.16); p.x += Math.sin(tAbs + p.ph) * dt * 0.05 - dt * 0.03; }
      else if (wt === 'embers') { p.y -= dt * (0.08 + p.z * 0.14); p.x += Math.sin(tAbs * 2 + p.ph) * dt * 0.05 - dt * 0.05; }
      else if (wt === 'meteors') { p.x -= dt * (0.8 + p.z); p.y += dt * (0.5 + p.z * 0.6); if (p.y > 0.8 || p.x < -0.2) { p.x = 0.6 + rnd() * 0.6; p.y = -0.1 - rnd() * 0.3; } }
      else if (wt === 'glitch') { p.life -= dt; if (p.life < 0) { p.life = 0.1 + rnd() * 0.3; p.x = rnd(); p.y = rnd(); p.z = rnd(); } }
      else if (wt === 'stars') { p.x -= dt * 0.5; p.y += dt * 0.25; if (p.y > 0.7) { p.x = 1 + rnd() * 0.5; p.y = rnd() * 0.3; } }
      if (p.y > 1.05) { p.y = -0.05; p.x = rnd(); } if (p.y < -0.1 && wt === 'embers') { p.y = 1.0; p.x = rnd(); } if (p.x < -0.1) p.x += 1.2; if (p.x > 1.1 && wt !== 'meteors' && wt !== 'stars') p.x -= 1.2;
    }
  }

  // ---------- camera ----------
  function camera(w, t) {
    if (reduced) return null;
    const s = trauma * trauma; const sp = w ? clamp((w.velocity - 183) / 400, 0, 1) : 0;
    return { tx: (Math.sin(t * 91) + Math.sin(t * 53)) * 5 * s, ty: (Math.sin(t * 77) + Math.cos(t * 61)) * 4 * s, rot: Math.sin(t * 43) * 0.012 * s, zoom: 1 + sp * 0.035 + zoomPunch * 0.02 };
  }
  function squash(w) {
    if (reduced || !w) return null; let sx = 1, sy = 1;
    if (squashT > 0) { const k = squashT / 0.16; sx = 1 - 0.1 * k; sy = 1 + 0.16 * k; }
    if (landT > 0) { const k = landT / 0.14; sx = 1 + 0.16 * k; sy = 1 - 0.14 * k; }
    return (sx === 1 && sy === 1) ? null : { sx, sy };
  }

  // ---------- glow sprites (cached, drawn additively = cheap bloom) ----------
  const glowCache = {};
  function glowSprite(col) { let c = glowCache[col]; if (c) return c; c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, col); gr.addColorStop(0.4, col + '66'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (glowCache[col] = c); }
  function glow(ctx, x, y, r, col, a) { if (low || reduced) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a == null ? 0.6 : a; ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2); ctx.restore(); }

  // ---------- world-layer drawing (under the runner) ----------
  function drawShape(g, p, x, y, u, a) {
    const s = p.size * u; g.globalAlpha = a; g.fillStyle = p.col; g.strokeStyle = p.col;
    switch (p.shape) {
      case 'square': g.save(); g.translate(x, y); g.rotate(p.rot); g.fillRect(-s / 2, -s / 2, s, s); g.restore(); break;
      case 'star': g.save(); g.translate(x, y); g.rotate(p.rot); g.beginPath(); g.moveTo(0, -s * 1.5); g.lineTo(s * 0.4, -s * 0.4); g.lineTo(s * 1.5, 0); g.lineTo(s * 0.4, s * 0.4); g.lineTo(0, s * 1.5); g.lineTo(-s * 0.4, s * 0.4); g.lineTo(-s * 1.5, 0); g.lineTo(-s * 0.4, -s * 0.4); g.closePath(); g.fill(); g.restore(); break;
      case 'ring': g.lineWidth = Math.max(1, u * 1.6); g.beginPath(); g.arc(x, y, s * 2.2, 0, TAU); g.stroke(); break;
      case 'bolt': g.save(); g.translate(x, y); g.rotate(p.rot); g.lineWidth = Math.max(1, u * 1.6); g.beginPath(); g.moveTo(-s, -s); g.lineTo(0, -s * 0.2); g.lineTo(-s * 0.3, s * 0.2); g.lineTo(s, s); g.stroke(); g.restore(); break;
      case 'petal': g.save(); g.translate(x, y); g.rotate(p.rot); g.beginPath(); g.ellipse(0, 0, s * 1.3, s * 0.7, 0, 0, TAU); g.fill(); g.restore(); break;
      case 'heart': g.save(); g.translate(x, y); g.scale(s / 8, s / 8); g.beginPath(); g.moveTo(0, 5); g.bezierCurveTo(-10, -2, -5, -9, 0, -4); g.bezierCurveTo(5, -9, 10, -2, 0, 5); g.fill(); g.restore(); break;
      case 'spark': g.lineWidth = Math.max(1, u * 1.2); g.beginPath(); g.moveTo(x, y); g.lineTo(x - s * 2.4, y); g.stroke(); break;
      default: g.beginPath(); g.arc(x, y, s * 0.6, 0, TAU); g.fill();
    }
  }
  function drawWorld(env) {
    const g = env.ctx, u = env.unit, gy = env.groundY, wx = env.worldX, tv = env.travel;
    const w = env.game; const au = effOf('aura'), tr = effOf('trail');
    g.save();
    if (tr && tr.shape === 'ribbon' && ribbon.length > 2) {
      g.lineCap = 'round'; for (let k = 1; k < ribbon.length; k++) { const a = ribbon[k - 1], b = ribbon[k]; const f = k / ribbon.length; g.strokeStyle = f > 0.5 ? tr.colors[0] : tr.colors[1]; g.globalAlpha = f * 0.8; g.lineWidth = (1 + f * 5) * u; g.beginPath(); g.moveTo(wx(a.x, tv), gy - a.y * u); g.lineTo(wx(b.x, tv), gy - b.y * u); g.stroke(); }
    }
    if (au && au.shape === 'ring' && w && !w.dead) { const cx = env.playerX, cy = gy - (w.y + 22) * u; const col = au.colors[0]; const pulse = 1 + Math.sin(env.visualTime * 4) * 0.06; g.globalAlpha = au.dark ? 0.7 : 0.55; g.strokeStyle = col; g.lineWidth = 2.2 * u; g.beginPath(); g.ellipse(cx, cy, au.r * u * pulse, au.r * 1.25 * u * pulse, 0, 0, TAU); g.stroke(); if (au.dark) { g.globalAlpha = 0.25; g.strokeStyle = au.colors[1]; g.lineWidth = 6 * u; g.stroke(); } else glow(g, cx, cy, au.r * 1.8 * u, col, 0.3); }
    for (let i = 0; i < POOL; i++) {
      const p = pool[i]; if (!p.on) continue; const a = clamp(p.life / (p.max * 0.6), 0, 1) * (p.fl && ((p.life * 40) | 0) % 2 ? 0.2 : 1);
      drawShape(g, p, wx(p.x, tv), gy - p.y * u, u, a);
    }
    g.restore(); g.globalAlpha = 1;
  }

  // ---------- screen overlay ----------
  function ensureOverlay(world) {
    if (!overlay) {
      overlay = document.createElement('canvas'); overlay.id = 'rzfx2'; overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
      world.parentNode.insertBefore(overlay, world.nextSibling); octx = overlay.getContext('2d');
      off = document.createElement('canvas'); offc = off.getContext('2d');
    }
    const r = world.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; ow = r.width; oh = r.height; }
    ow = r.width; oh = r.height;
  }
  function drawOverlay(world, w, running, env) {
    ensureOverlay(world); const g = octx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, ow, oh);
    if (env.hide) return;
    const pal = env.pal || {}; const wt = weatherType;
    // weather
    if (!reduced || wt === 'aurora') {
      if (wt === 'rain') { g.strokeStyle = 'rgba(160,200,235,.35)'; g.lineWidth = 1; g.beginPath(); for (const p of weatherP) { const x = p.x * ow, y = p.y * oh; g.moveTo(x, y); g.lineTo(x - 5 * p.z, y + 16 * p.z); } g.stroke(); }
      else if (wt === 'snow') { g.fillStyle = 'rgba(240,248,255,.8)'; for (const p of weatherP) { g.globalAlpha = 0.4 + p.z * 0.5; g.beginPath(); g.arc(p.x * ow, p.y * oh, 1 + p.z * 1.6, 0, TAU); g.fill(); } g.globalAlpha = 1; }
      else if (wt === 'embers') { g.globalCompositeOperation = 'lighter'; for (const p of weatherP) { g.fillStyle = p.z > 0.9 ? '#fbbf24' : '#f97316'; g.globalAlpha = 0.35 + p.z * 0.4; g.fillRect(p.x * ow, p.y * oh, 2 + p.z * 2, 2 + p.z * 2); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      else if (wt === 'meteors') { g.lineCap = 'round'; for (const p of weatherP) { const x = p.x * ow, y = p.y * oh; const gr = g.createLinearGradient(x, y, x + 90, y - 55); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(251,146,60,0)'); g.strokeStyle = gr; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 90, y - 55); g.stroke(); } }
      else if (wt === 'glitch') { for (const p of weatherP) { g.fillStyle = p.z > 0.5 ? 'rgba(74,222,128,.35)' : 'rgba(240,171,252,.3)'; g.fillRect(p.x * ow, p.y * oh, 20 + p.z * 90, 2 + p.z * 3); } }
      else if (wt === 'stars') { g.fillStyle = '#fff'; for (const p of weatherP) { g.globalAlpha = 0.9; g.fillRect(p.x * ow, p.y * oh, 2, 2); g.globalAlpha = 0.4; g.fillRect(p.x * ow + 4, p.y * oh - 2, 14, 1); } g.globalAlpha = 1; }
      else if (wt === 'aurora') { g.globalCompositeOperation = 'lighter'; for (let b = 0; b < 3; b++) { const gr = g.createLinearGradient(0, 0, 0, oh * 0.45); const c = ['34,211,238', '74,222,128', '168,85,247'][b]; gr.addColorStop(0, 'rgba(' + c + ',0)'); gr.addColorStop(0.5, 'rgba(' + c + ',' + (reduced ? 0.08 : 0.12 + 0.05 * Math.sin(tAbs + b)) + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= ow + 20; x += 20) g.lineTo(x, oh * (0.08 + b * 0.05) + Math.sin(x * 0.01 + tAbs * 0.5 + b * 2) * oh * 0.05); g.lineTo(ow, oh * 0.5); g.lineTo(0, oh * 0.5); g.closePath(); g.fill(); } g.globalCompositeOperation = 'source-over'; }
    }
    if (running && w) {
      // speed lines
      const sp = clamp((w.velocity - 220) / 280, 0, 1) + (w.surge > 0 || w.overdrive > 0 ? 0.5 : 0);
      if (sp > 0.05 && !reduced) { g.strokeStyle = 'rgba(255,255,255,' + (0.1 + sp * 0.18).toFixed(2) + ')'; g.lineWidth = 1; g.beginPath(); const n = Math.round(6 + sp * (low ? 10 : 22)); for (let i = 0; i < n; i++) { const y = ((i * 0.6180339 + 0.1) % 1) * oh * 0.8 + 6, x = ((tAbs * (700 + i * 30) + i * 233) % (ow + 200)); g.moveTo(ow - x, y); g.lineTo(ow - x + 40 + sp * 80, y); } g.stroke(); }
      // combo flames along the bottom edge
      if (w.combo >= 12 && !reduced) { const k = clamp((w.combo - 12) / 38, 0, 1); const n = low ? 8 : 18; g.globalCompositeOperation = 'lighter'; for (let i = 0; i < n; i++) { const x = (i + 0.5) / n * ow, hh = oh * (0.05 + k * 0.1) * (0.6 + 0.4 * Math.sin(tAbs * 9 + i * 1.7)); const gr = g.createLinearGradient(0, oh, 0, oh - hh); gr.addColorStop(0, 'rgba(244,63,94,' + (0.3 + k * 0.3) + ')'); gr.addColorStop(0.5, 'rgba(251,146,60,' + (0.2 + k * 0.2) + ')'); gr.addColorStop(1, 'rgba(253,224,71,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - ow / n * 0.7, oh); g.quadraticCurveTo(x, oh - hh * 1.4, x + ow / n * 0.7, oh); g.fill(); } g.globalCompositeOperation = 'source-over'; }
      // event tint
      if (evTint && evTintT > 0) { g.globalAlpha = Math.min(0.12, evTintT * 0.05) + (w.zone && (w.zone.type === 'glitchStorm') && !reduced ? (((tAbs * 8) | 0) % 5 === 0 ? 0.05 : 0) : 0); g.fillStyle = evTint; g.fillRect(0, 0, ow, oh); g.globalAlpha = 1; }
      else if (w.zone && w.zone.type && w.zone.type !== 'boss') { g.globalAlpha = 0.04; g.fillStyle = w.zone.type === 'coinRush' ? '#fbbf24' : w.zone.type === 'meteor' ? '#fb923c' : w.zone.type === 'glitchStorm' ? '#4ade80' : '#f43f5e'; g.fillRect(0, 0, ow, oh); g.globalAlpha = 1; }
      // slow-mo / timestop / ghost tint
      if (w.tstop > 0 || w.slow > 0) { g.globalAlpha = w.tstop > 0 ? 0.14 : 0.06; g.fillStyle = '#93c5fd'; g.fillRect(0, 0, ow, oh); g.globalAlpha = 1; }
    }
    // chromatic-aberration pulse (split copy of the game canvas, additive)
    if (chroma > 0.04 && !reduced) {
      const sw = Math.max(2, Math.round(world.width / 2)), sh = Math.max(2, Math.round(world.height / 2)); if (off.width !== sw || off.height !== sh) { off.width = sw; off.height = sh; }
      const d = 6 * chroma * (ow / 800 + 0.4);
      for (let k = 0; k < 2; k++) { offc.globalCompositeOperation = 'source-over'; offc.clearRect(0, 0, sw, sh); offc.drawImage(world, 0, 0, sw, sh); offc.globalCompositeOperation = 'multiply'; offc.fillStyle = k ? '#00ffff' : '#ff0044'; offc.fillRect(0, 0, sw, sh); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.28 * chroma; g.drawImage(off, (k ? d : -d), 0, ow, oh); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    // flashes
    if (flashA > 0.01) { g.globalAlpha = Math.min(0.6, flashA * (reduced ? 0.4 : 1)); g.fillStyle = flashCol; g.fillRect(0, 0, ow, oh); g.globalAlpha = 1; }
    if (lvl > 0 && !reduced) { g.globalAlpha = lvl * 0.4; const gr = g.createRadialGradient(ow / 2, oh * 0.55, 10, ow / 2, oh * 0.55, ow * 0.6); gr.addColorStop(0, 'rgba(253,230,138,.7)'); gr.addColorStop(1, 'rgba(253,230,138,0)'); g.fillStyle = gr; g.fillRect(0, 0, ow, oh); g.globalAlpha = 1; }
  }

  function setEquip(e) { equip = Object.assign({ trail: 'none', aura: 'none', hit: 'none', death: 'none', coin: 'none' }, e || {}); ribbon.length = 0; }
  function reset() { for (const p of pool) p.on = false; alive = 0; trauma = chroma = flashA = lvl = zoomPunch = 0; hitstopReq = 0; ribbon.length = 0; evTint = null; evTintT = 0; weatherP.length = 0; }
  function previewBurst(slot, x, y) { const sp = effOf(slot); if (sp) burst(sp, x, y); }
  window.RakazaFX = { onEvents, update, drawWorld, drawOverlay, camera, squash, takeHitstop, glow, shake, flash, levelUp, setEquip, reset, previewBurst, stat, get alive() { return alive; }, get trauma() { return trauma; }, spawn, burst, POOL };
})();
