/* ============================================================================
   RAKAZA EXTRAS (v15) — daily seed, ghost, share card + photo mode, character
   select, first-run tutorial, performance guard. Plugs into the engine through
   window.RakazaHooks; touches nothing outside this page. No analytics.
   ========================================================================== */
(() => {
  'use strict';
  const H = (window.RakazaHooks = window.RakazaHooks || {});
  const P = window.RakazaPrefs, API = window.RakazaAPI, D = window.RakazaDaily;
  const SITE = 'https://rakaza-ai-terminal.vercel.app';
  const $ = (id) => document.getElementById(id);
  const A = () => window.__rz2;
  const sfx = (k) => { try { window.RakazaAudio && window.RakazaAudio.sfx(k); window.RakazaFeel && window.RakazaFeel.vib(k); } catch (e) {} };
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const isTouch = () => !!(window.RakazaInput && window.RakazaInput.device === 'touch');
  const MODE_NAMES = { classic: 'CLASSIC', rush: 'RUSH', zen: 'ZEN', hardcore: 'HARDCORE', campaign: 'CAMPAIGN', survival: 'SURVIVAL', daily: 'DAILY SEED' };
  const meta = () => (window.__rzMeta && window.__rzMeta.meta) || { upgrades: {}, mode: 'classic' };
  const hhmm = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + 'h ' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + 'm'; };

  // ------------------------------------------------------------------ run bookkeeping
  let pending = null;   // {daily, key} for the run that is starting
  let rec = null;       // ghost recording for the current run
  let ghost = null;     // best-run samples being replayed
  let lastRun = null;   // last finished run, for sharing
  const ghostKey = (key) => 'rz_ghost_v14:' + key;

  H.beforeStart = (mode, opts) => {
    const manualish = mode === 'manual';
    if (manualish) {
      const r = opts.daily ? API.consumePlaySync() : { ok: true };
      // the "N plays a day" rule (off in the standalone build unless ?plays=N / host config) counts daily-seed runs
      if (!r.ok) {
        A().toast('No daily plays left — resets in ' + hhmm(API.nextUtcMidnight() - Date.now()));
        sfx('hit');
        return false;
      }
    }
    pending = { daily: !!opts.daily, key: opts.daily ? 'daily:' + D.day() : 'm:' + (meta().mode || 'classic') };
    return true;
  };

  H.onStart = (game) => {
    const pend = pending || { daily: false, key: 'm:classic' };
    game.ghostKey = pend.key;
    rec = { key: pend.key, next: 0, pts: [] };
    ghost = null;
    if (P.get('ghost')) {
      const g = LS.get(ghostKey(pend.key), null);
      if (g && Array.isArray(g.p) && g.p.length > 4) ghost = { p: g.p, dist: g.dist, final: false };
    }
    ghostChip(null);
    tutorial.start(game);
    perf.reset();
    if (H.onStartMeta) H.onStartMeta(game);
  };

  H.onOver = (game, score) => {
    tutorial.finish(true);
    ghostChip(null);
    if (H.onOverMeta) H.onOverMeta(game, score);
    const dist = Math.round(game.dist || 0);
    const manual = !game.everAI && !game.dead_ai;
    const board = score;
    lastRun = { near: game.near || 0, kills: game.kills || 0, bossKills: game.bossKills || 0, character: game.cfg && game.cfg.character, score: board, distance: dist, coins: game.coins || 0, mode: game.daily ? 'daily' : (meta().mode || 'classic'), daily: !!game.daily, seed: game.seed, ai: !!game.everAI, cause: game.cause };
    if (rec && manual && rec.pts.length > 4 && dist > 30) {
      const prev = LS.get(ghostKey(rec.key), null);
      if (!prev || dist > (prev.dist || 0)) LS.set(ghostKey(rec.key), { dist, p: rec.pts, ts: Date.now() });
    }
    rec = null;
  };

  document.addEventListener('rakaza-run', (e) => {
    const d = e.detail || {};
    const el = $('rz-rank');
    if (el && d.res) {
      const rank = d.res.rank;
      el.innerHTML = d.res.ok === false ? 'Run not recorded (' + esc(d.res.reason || 'rejected') + ')'
        : (rank ? 'Rank <b>#' + rank + '</b> ' + (d.res.source === 'server' ? 'on the live 24h board' : 'on this device’s 24h board') : 'Recorded ' + (d.res.source === 'server' ? 'on the live board' : 'on this device'));
    }
  });

  H.afterOver = (game, panel) => {
    const run = lastRun; if (!run) return;
    const stats = panel.querySelector('.stat-grid');
    const strip = document.createElement('div');
    strip.className = 'rz-strip';
    const best = run.daily ? D.best() : null;
    strip.innerHTML = `<div><span class="eyebrow">BOARD SCORE</span><b class="cyan">${fmt(run.score)}</b></div>
      <div id="rz-rank" class="rz-rank">Saving run…</div>
      ${run.daily ? `<div><span class="eyebrow">TODAY’S BEST · SEED ${D.code()}</span><b class="gold">${fmt(Math.max(best.score, run.score))}</b></div>` : ''}`;
    if (stats && stats.parentNode) stats.parentNode.insertBefore(strip, stats.nextSibling);
    const grid = panel.querySelector('.menu-grid');
    if (grid) {
      const share = document.createElement('button');
      share.id = 'share-button'; share.className = 'gold'; share.textContent = 'SHARE CARD';
      grid.insertBefore(share, grid.children[1] || null);
      share.onclick = () => openShare(run);
    }
    A().setupButtons();
  };

  // ------------------------------------------------------------------ ghost
  function ghostChip(text, cls) {
    const el = $('ghost-chip'); if (!el) return;
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.textContent = text; el.className = cls || '';
  }
  function ghostAt(t) {
    // samples are [travel, y, slide] every 0.1 s of run time
    const p = ghost.p, f = t * 10, i = Math.floor(f);
    if (i >= p.length - 1) return null;
    const a = p[i], b = p[i + 1], k = f - i;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, slide: a[2] };
  }
  let topN = 0;
  function measureTop() {
    const t = document.getElementById('rmTop');
    const h = t && !t.classList.contains('hidden') ? Math.round(t.getBoundingClientRect().bottom) : 0;
    const r = document.documentElement.style;
    if (r.getPropertyValue('--rz-top') !== h + 'px') r.setProperty('--rz-top', h + 'px');
  }
  H.onFrame = (game, state, dt, now) => {
    if (++topN % 20 === 1) measureTop();
    perf.frame(now, state);
    if (state !== 'play' || !game || game.dead) return;
    if (A().ai) game.everAI = true;
    tutorial.frame(game);
    if (rec && !game.everAI) {
      while (game.time >= rec.next && rec.pts.length < 5000) {
        rec.pts.push([Math.round(game.travel), Math.round(game.y * 10) / 10, game.slide > 0 ? 1 : 0]);
        rec.next += 0.1;
      }
    }
    if (ghost && P.get('ghost') && !game.everAI) {
      const gp = ghostAt(game.time);
      if (gp) {
        const diff = (game.travel - gp.x) * 0.12;
        ghostChip('GHOST ' + (diff >= 0 ? '+' : '−') + Math.abs(Math.round(diff)) + ' m', diff >= 0 ? 'ahead' : 'behind');
      } else ghostChip('GHOST DONE · BEST ' + fmt(ghost.dist) + ' m', 'done');
    } else ghostChip(null);
  };
  H.onDraw = (c) => {
    if (!ghost || !P.get('ghost') || c.game.everAI || c.game.dead) return;
    const gp = ghostAt(c.game.time); if (!gp) return;
    const x = c.worldX(gp.x, c.travel);
    if (x < -80 || x > c.ctx.canvas.width + 80) return;
    const y = c.groundY - gp.y * c.unit;
    c.drawCat(c.ctx, x, y, c.unit, c.skin, c.visualTime, !!gp.slide, gp.y > 3, 0.36, '#22d3ee');
    c.ctx.save();
    c.ctx.fillStyle = '#22d3eecc'; c.ctx.font = '700 ' + Math.max(8, 9 * c.unit) + 'px ui-sans-serif,system-ui';
    c.ctx.textAlign = 'center'; c.ctx.fillText('BEST', x, y - 66 * c.unit);
    c.ctx.restore();
  };

  // ------------------------------------------------------------------ daily seed screen
  H.showDaily = () => {
    const a = A(), day = D.day(), best = D.best(), info = API.playsInfo();
    const g = LS.get(ghostKey('daily:' + day), null);
    a.showMenu('daily', `
      <header>
        <div class="brand">DAILY SEED · ${esc(day)} UTC</div>
        <h2>Same city. Everyone. Today.</h2>
        <p class="subtitle">Seed <span class="gold">${D.code()}</span> builds the exact same rooftops for every player until midnight UTC (${hhmm(API.nextUtcMidnight() - Date.now())} left). Classic rules, no head start — pure skill.</p>
      </header>
      <div class="card stat-grid">
        <div><div class="eyebrow">YOUR BEST TODAY</div><div class="stat-value gold">${fmt(best.score)}</div></div>
        <div><div class="eyebrow">DISTANCE</div><div class="stat-value">${fmt(best.distance)}<small>m</small></div></div>
        <div><div class="eyebrow">RUNS TODAY</div><div class="stat-value">${best.runs}</div></div>
        <div><div class="eyebrow">${info.limit ? 'PLAYS LEFT' : 'GHOST'}</div><div class="stat-value cyan">${info.limit ? info.left : (g ? fmt(g.dist) + '<small>m</small>' : '—')}</div></div>
      </div>
      <div class="menu-grid">
        <button class="primary wide" id="daily-go">START DAILY RUN</button>
        <button id="daily-back">BACK</button>
      </div>
      <div class="footer"><span>${info.limit ? info.limit + ' daily plays per UTC day. AI runs are free but not ranked.' : 'Unlimited plays in this build. Your best-run ghost races you.'}</span></div>`);
    $('daily-go').onclick = () => a.startGame('manual', { daily: true, seed: D.seed() });
    $('daily-back').onclick = a.title;
  };

  H.openSettings = () => { if (window.__rzMeta) window.__rzMeta.openTab('settings'); };

  // ------------------------------------------------------------------ character select
  H.showChar = () => {
    if (window.__rzMeta && window.__rzMeta.openTab) return window.__rzMeta.openTab('shop', 'characters');
    const a = A(), C = window.RakazaChar;
    const cur = P.get('char') === 'cat' ? -1 : P.get('outfit');
    a.showMenu('char', `
      <header>
        <div class="brand">CHARACTER SELECT</div>
        <h2>Pick your rider.</h2>
        <p class="subtitle">Cosmetic only — the same hitbox and the same fire. Wardrobe colours tint the jacket.</p>
      </header>
      <div class="skin-grid">
        ${C.OUTFITS.map((o, i) => `
          <button class="skin-tile ${cur === i ? 'equipped' : ''}" data-outfit="${i}">
            <canvas data-char="${i}"></canvas>
            <span class="skin-name">${esc(o.name)}</span>
            <span class="skin-status">${cur === i ? 'EQUIPPED' : 'SELECT'}</span><span class="rz-blurb">${esc(o.blurb || '')}</span>
          </button>`).join('')}
        <button class="skin-tile ${cur === -1 ? 'equipped' : ''}" data-outfit="-1">
          <canvas data-char="cat"></canvas>
          <span class="skin-name">OG Roof Cat</span>
          <span class="skin-status">${cur === -1 ? 'EQUIPPED' : 'SELECT'}</span><span class="rz-blurb">The original rooftop cat from v13.</span>
        </button>
      </div>
      <button id="char-back">BACK TO ROOFTOPS</button>`);
    a.panel.querySelectorAll('[data-outfit]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.outfit);
        if (i < 0) P.set('char', 'cat'); else { P.set('char', 'rakaza'); P.set('outfit', i); }
        sfx('power'); H.showChar();
      };
    });
    $('char-back').onclick = a.title;
  };
  H.drawCharPreviews = (vt) => {
    const a = A(), C = window.RakazaChar, dpr = a.dims.dpr;
    a.panel.querySelectorAll('[data-char]').forEach((cv) => {
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const k = cv.dataset.char, skin = a.skins[a.saved.skin] || a.skins[0];
      g.fillStyle = '#ffffff12'; g.beginPath(); g.ellipse(w * 0.54, h - 5, 34, 5, 0, 0, 6.3); g.fill();
      const sc = Math.min(0.84, h / 68), y = h - 4 + Math.sin(vt * 2 + (k === 'cat' ? 3 : +k)) * 1.5;
      if (k === 'cat') a.drawCat(g, w * 0.54, y, sc, skin, vt * 0.3, false, false, 1, '', 'cat');
      else C.draw(g, w * 0.54, y, sc, skin, vt * 0.3 + (+k), false, false, 1, '', +k, false);
    });
  };

  // ------------------------------------------------------------------ share card (PNG) + photo mode
  function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  function makeCard(run) {
    const W = 1200, Hh = 675, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
    const g = cv.getContext('2d'), r = rng((run.seed || 7) ^ 0xA5A5);
    const O = (window.RakazaChar.OUTFITS[P.get('outfit') % window.RakazaChar.OUTFITS.length] || window.RakazaChar.OUTFITS[0]);
    let sky = g.createLinearGradient(0, 0, 0, Hh);
    sky.addColorStop(0, '#120a2e'); sky.addColorStop(0.55, '#6a1b9a'); sky.addColorStop(0.82, '#f0548f'); sky.addColorStop(1, '#ffb36b');
    g.fillStyle = sky; g.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.6) + ')'; g.fillRect(r() * W, r() * Hh * 0.5, 2, 2); }
    const sun = g.createRadialGradient(840, 470, 10, 840, 470, 250);
    sun.addColorStop(0, 'rgba(255,230,160,.95)'); sun.addColorStop(0.35, 'rgba(255,120,170,.55)'); sun.addColorStop(1, 'rgba(255,120,170,0)');
    g.fillStyle = sun; g.fillRect(500, 200, 700, 475);
    for (let layer = 0; layer < 2; layer++) {
      g.fillStyle = layer ? '#0c0a1d' : '#2a1550'; let x = -20;
      while (x < W) { const bw = 50 + r() * 90, bh = (layer ? 110 : 180) + r() * (layer ? 130 : 160); g.fillRect(x, 560 - bh + (layer ? 40 : 0), bw, bh + 80); if (layer) { g.fillStyle = '#ffd36e'; for (let k = 0; k < 4; k++) if (r() > 0.5) g.fillRect(x + 8 + r() * (bw - 16), 560 - bh + 60 + r() * bh * 0.6, 4, 6); g.fillStyle = '#0c0a1d'; } x += bw + 4 + r() * 10; }
    }
    g.fillStyle = '#0c0a1d'; g.fillRect(0, 590, W, 85);
    g.fillStyle = O.visor || '#22d3ee'; g.globalAlpha = 0.8; g.fillRect(0, 590, W, 3); g.globalAlpha = 1;
    // Rakaza
    const a = A(), skin = a.skins[a.saved.skin] || a.skins[0];
    if (P.get('char') === 'cat') a.drawCat(g, 930, 590, 4.6, skin, 0.5, false, false, 1, '', 'cat');
    else window.RakazaChar.draw(g, 930, 590, 4.6, skin, 0.5, false, false, 1, '', P.get('outfit'), false);
    // text
    g.textBaseline = 'alphabetic'; g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 14;
    g.fillStyle = '#fff'; g.font = '800 28px ui-sans-serif,system-ui,sans-serif'; g.fillText("RIDE 'EM,", 64, 92);
    const gr = g.createLinearGradient(64, 90, 520, 170); gr.addColorStop(0, '#ff7ac8'); gr.addColorStop(1, '#67e8f9');
    g.fillStyle = gr; g.font = '900 92px ui-sans-serif,system-ui,sans-serif'; g.fillText('RAKAZA!', 60, 170);
    g.fillStyle = '#e9d5ff'; g.font = '700 22px ui-sans-serif,system-ui,sans-serif'; g.fillText((MODE_NAMES[run.mode] || 'CLASSIC') + (run.ai ? ' · AI PILOT' : '') + (run.daily ? ' · SEED ' + D.code() : ''), 66, 214);
    g.fillStyle = '#ffffffcc'; g.font = '700 24px ui-sans-serif,system-ui,sans-serif'; g.fillText('SCORE', 66, 330);
    g.fillStyle = '#fff'; g.font = '900 150px ui-sans-serif,system-ui,sans-serif'; g.fillText(fmt(run.score), 58, 458);
    g.font = '800 34px ui-sans-serif,system-ui,sans-serif'; g.fillStyle = '#ffe9a8';
    g.fillText(fmt(run.distance) + ' m  ·  ' + fmt(run.coins) + ' coins', 66, 520);
    g.shadowBlur = 0; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 622, W, 53);
    g.fillStyle = '#fff'; g.font = '700 22px ui-sans-serif,system-ui,sans-serif'; g.fillText(SITE.replace('https://', ''), 64, 656);
    g.textAlign = 'right'; g.fillStyle = '#ffffffaa'; g.fillText(new Date().toISOString().slice(0, 10), W - 64, 656);
    return cv;
  }
  const shareText = (run) => `I scored ${fmt(run.score)} (${fmt(run.distance)} m) in Ride 'Em, Rakaza!${run.daily ? ' Daily seed ' + D.code() + '.' : ''} Can you beat it?`;
  const xUrl = (text) => 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(SITE);

  function closeModal() { const m = $('rz-modal'); if (m) m.remove(); }
  function openModal(canvas, text, filename, title) {
    closeModal();
    const m = document.createElement('div'); m.id = 'rz-modal'; m.setAttribute('role', 'dialog');
    const url = canvas.toDataURL('image/png');
    m.innerHTML = `<div class="rz-box"><h3>${esc(title)}</h3><img alt="Share card preview" src="${url}">
      <div class="rz-actions">
        <a class="primary" id="rz-dl" href="${url}" download="${esc(filename)}">DOWNLOAD PNG</a>
        <a class="gold" id="rz-x" href="${esc(xUrl(text))}" target="_blank" rel="noopener noreferrer">SHARE ON X</a>
        <button id="rz-copy" type="button">COPY TEXT</button>
        <button id="rz-native" type="button" class="hidden">SHARE IMAGE…</button>
        <button id="rz-close" type="button">CLOSE</button>
      </div><p class="rz-note">${esc(text)}</p></div>`;
    document.body.appendChild(m);
    $('rz-close').onclick = () => { closeModal(); };
    m.addEventListener('pointerdown', (e) => { if (e.target === m) closeModal(); });
    $('rz-copy').onclick = async () => { try { await navigator.clipboard.writeText(text + ' ' + SITE); A().toast('Copied'); } catch (e) { A().toast('Copy not available here'); } };
    canvas.toBlob((blob) => {
      try {
        const f = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          const b = $('rz-native'); if (!b) return; b.classList.remove('hidden');
          b.onclick = () => navigator.share({ files: [f], text, url: SITE }).catch(() => {});
        }
      } catch (e) {}
    }, 'image/png');
    sfx('snap');
  }
  function openShare(run) { openModal(makeCard(run), shareText(run), 'ride-em-rakaza-' + run.score + '.png', 'YOUR SCORE CARD'); }
  window.RakazaShare = { open: openShare, makeCard };
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('rz-modal')) { closeModal(); e.stopPropagation(); } }, true);

  // photo mode: freeze (pause), hide every UI layer, snap the canvas with a watermark
  let photoBar = null;
  H.photo = () => {
    document.body.classList.add('rz-photo');
    photoBar = document.createElement('div'); photoBar.id = 'rz-photobar';
    photoBar.innerHTML = '<button id="rz-snap" class="primary" type="button">SNAP</button><button id="rz-exit" type="button">EXIT PHOTO MODE</button>';
    document.body.appendChild(photoBar);
    $('rz-exit').onclick = exitPhoto;
    $('rz-snap').onclick = () => {
      const src = A() && document.getElementById('world'), out = document.createElement('canvas');
      out.width = src.width; out.height = src.height;
      const g = out.getContext('2d'); g.drawImage(src, 0, 0);
      const s = out.width / 1200;
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, out.height - 46 * s, out.width, 46 * s);
      g.fillStyle = '#fff'; g.font = '800 ' + 20 * s + 'px ui-sans-serif,system-ui'; g.textBaseline = 'middle';
      g.fillText("RIDE 'EM, RAKAZA!  ·  " + SITE.replace('https://', ''), 22 * s, out.height - 23 * s);
      const gm = A().game; g.textAlign = 'right';
      if (gm) g.fillText(fmt(gm.dist) + ' m  ·  ' + fmt(gm.coins) + ' coins', out.width - 22 * s, out.height - 23 * s);
      const run = { score: gm ? API.boardScore(gm.dist, gm.coins, meta().upgrades) : 0, distance: gm ? gm.dist : 0, coins: gm ? gm.coins : 0, daily: !!(gm && gm.daily) };
      openModal(out, 'Caught mid-run in Ride \'Em, Rakaza! ' + fmt(run.distance) + ' m and still going.', 'ride-em-rakaza-photo.png', 'PHOTO');
    };
  };
  function exitPhoto() {
    document.body.classList.remove('rz-photo');
    if (photoBar) { photoBar.remove(); photoBar = null; }
    closeModal();
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('rz-photo') && !$('rz-modal')) { exitPhoto(); e.stopPropagation(); } }, true);

  // ------------------------------------------------------------------ first-run tutorial
  const tutorial = (() => {
    let step = -1, t0 = 0, shownAt = 0, el = null, doneLater = false, sawAir = false, sawSlide = false;
    const LOW = ['sign', 'drone', 'laser', 'bat'];
    const tip = () => el || (el = $('rz-tip'));
    function show(html) { const e = tip(); if (!e) return; if (e.dataset.k !== html) { e.dataset.k = html; e.innerHTML = html + '<button type="button" id="rz-skip">SKIP</button>'; const s = $('rz-skip'); if (s) s.onclick = () => finish(true); } e.classList.remove('hidden'); }
    function hide() { const e = tip(); if (e) { e.classList.add('hidden'); e.dataset.k = ''; } }
    function start(game) {
      doneLater = false; sawAir = false; sawSlide = false;
      if (P.get('tutorialDone') || A().ai || game.daily) { step = -1; hide(); return; }
      step = 0; t0 = game.time;
    }
    function finish(done) { if (step >= 0 && done) P.set('tutorialDone', true); step = -1; hide(); }
    function nextAhead(game, pred) {
      for (const o of game.obstacles) { const dx = o.x - game.travel; if (dx > 40 && dx < 420 && !o.dead && pred(o)) return dx; }
      return -1;
    }
    function frame(game) {
      if (step < 0) return;
      if (A().ai) { finish(false); return; }
      const touch = isTouch();
      if (step === 0) {
        show(touch ? '<b>TAP</b> anywhere or hit <b>JUMP</b> to leap the gaps' : 'Press <b>SPACE</b> (or ↑ / W) to <b>JUMP</b>');
        if (!game.grounded) sawAir = true;
        if (sawAir && game.grounded) { step = 1; t0 = game.time; sfx('ui'); }
        else if (game.time - t0 > 14) { step = 1; t0 = game.time; }
      } else if (step === 1) {
        const dx = nextAhead(game, (o) => LOW.includes(o.kind));
        if (game.slide > 0) sawSlide = true;
        if (dx > 0 && !sawSlide) show(touch ? 'Low signs and drones! <b>SWIPE DOWN</b> or tap <b>SLIDE</b>' : 'Low bar ahead — hold <b>S / ↓ / SHIFT</b> to <b>SLIDE</b>');
        else if (sawSlide) { step = 2; t0 = game.time; sfx('ui'); }
        else if (game.time - t0 > 40 || game.dist > 700) { step = 2; t0 = game.time; }
        else if (!game.__tipSlide) hide();
      } else if (step === 2) {
        const dx = nextAhead(game, (o) => o.enemy && o.kind !== 'bat');
        if (dx > 0) show('Land <b>on top</b> of critters to <b>STOMP</b> them (+3 coins)');
        else hide();
        if ((game.kills || 0) > 0) { step = 3; t0 = game.time; sfx('ui'); }
        else if (game.time - t0 > 45 || game.dist > 1100) { step = 3; t0 = game.time; }
      } else if (step === 3) {
        show('Chain coins for a <b>COMBO</b> · grab shields & magnets · use <b>SKILLS</b> on the side rail');
        if (game.time - t0 > 6) finish(true);
      }
    }
    return { start, frame, finish };
  })();

  // ------------------------------------------------------------------ performance guard
  const perf = (() => {
    let last = 0, acc = 0, n = 0, warm = 0, cool = 0;
    window.__rzDprCap = window.__rzDprCap || 2;
    function reset() { acc = 0; n = 0; warm = 90; }
    function degrade() {
      const a = A();
      if (window.__rzDprCap > 1.5) window.__rzDprCap = 1.5;
      else if (window.__rzDprCap > 1) window.__rzDprCap = 1;
      else if (!a.saved.low) { a.saved.low = true; a.persist(); const b = $('fx-toggle'); if (b) b.textContent = 'FX LOW'; }
      else return;
      window.dispatchEvent(new Event('resize'));
      a.toast('Performance guard: eased render quality to keep it smooth');
    }
    function frame(now, state) {
      if (state !== 'play') { last = 0; return; }
      if (!last) { last = now; return; }
      const dt = now - last; last = now;
      if (dt > 250) return;                // tab was hidden / debugger — don't count
      if (warm > 0) { warm--; return; }
      acc += dt; n++;
      if (n >= 90) {
        const avg = acc / n; acc = 0; n = 0;
        if (cool > 0) { cool--; return; }
        if (avg > 26) { degrade(); cool = 3; }
      }
    }
    return { frame, reset };
  })();

  // ------------------------------------------------------------------ misc polish
  document.addEventListener('contextmenu', (e) => { if (e.target && e.target.id === 'world') e.preventDefault(); });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  if (window.RakazaPrefs && P.get('reduceMotion')) document.documentElement.classList.add('rz-reduce');
  document.addEventListener('click', () => { if (window.RakazaAudio) window.RakazaAudio.unlock(); }, { once: true, capture: true });
})();
