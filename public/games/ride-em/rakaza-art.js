/* ============================================================================
   RAKAZA ART (v15) - stage palettes, hazard / monster / boss / pickup drawing.
   Pure canvas drawing (client only). Local coords: origin = ground at obstacle x, y up is NEGATIVE.
   ========================================================================== */
(function () {
  'use strict';
  const C = window.RakazaContent;
  const TAU = Math.PI * 2;
  const NEW_KINDS = { crate: 1, hook: 1, glitch: 1, steam: 1, shard: 1, icicle: 1, slime: 1, golem: 1, wraith: 1, mech: 1, boss: 1 };
  const NEW_PICKS = { gem: 1, star: 1, bolt: 1, heart: 1 };

  // ---------- palettes ----------
  const hexCache = {};
  function hex(h) {
    if (Array.isArray(h)) return h;
    let v = hexCache[h]; if (v) return v;
    const s = h.replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
    v = hexCache[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return v;
  }
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a) => a == null ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')' : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function stageIdxAt(dist, theme) { return C.stageIndexAt(dist, theme); }
  function nextStageIdx(i) { return i < 5 ? i + 1 : i === 5 ? 6 : 6 + ((i - 6 + 1) % 5); }
  function segEnd(dist, i) { return i < 6 ? C.STAGES[i].at + C.STAGE_SPAN : 7200 + (Math.floor((dist - 7200) / C.STAGE_SPAN) + 1) * C.STAGE_SPAN; }

  const P = { skyTop: '', skyLow: '', far: '', near: '', ground: '', edge: '', accent: '', win: [[34, 211, 238], [244, 189, 118]], sun: [247, 197, 141], night: 0, sunA: 1, stage: 0, weather: 'none', music: 'sunset', name: '' };
  function palAt(dist, theme) {
    const i = stageIdxAt(dist, theme); const st = C.STAGES[i]; const a = st.pal;
    let k = 0, b = a, bi = i;
    if (theme == null || theme < 0) { bi = nextStageIdx(i); b = C.STAGES[bi].pal; k = smooth(segEnd(dist, i) - 260, segEnd(dist, i), dist); }
    const m = (x, y) => mixc(hex(x), hex(y), k);
    P.skyTop = css(mixc(a.skyTop, b.skyTop, k)); P.skyLow = css(mixc(a.skyLow, b.skyLow, k));
    P.far = css(m(a.far, b.far)); P.near = css(m(a.near, b.near)); P.ground = css(m(a.ground, b.ground)); P.edge = css(m(a.edge, b.edge)); P.accent = css(m(a.accent, b.accent));
    P.win = [mixc(hex(a.win[0]), hex(b.win[0]), k), mixc(hex(a.win[1]), hex(b.win[1]), k)];
    P.sun = mixc(hex(a.sun), hex(b.sun), k);
    P.night = a.night + (b.night - a.night) * k;
    P.sunA = (1 - P.night) * 0.95;
    P.stage = k > 0.5 ? bi : i; P.weather = (k > 0.5 ? C.STAGES[bi] : st).weather; P.music = (k > 0.5 ? C.STAGES[bi] : st).music; P.name = (k > 0.5 ? C.STAGES[bi] : st).name;
    P.k = k; P.accentRGB = mixc(hex(a.accent), hex(b.accent), k);
    return P;
  }

  // ---------- helpers ----------
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function eyes(g, x, y, gap, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x - gap, y, r, 0, TAU); g.arc(x + gap, y, r, 0, TAU); g.fill(); }
  function stripes(g, x, y, w, h, c1, c2) {
    g.save(); rr(g, x, y, w, h, 3); g.clip(); g.fillStyle = c1; g.fillRect(x, y, w, h); g.fillStyle = c2;
    for (let i = -h; i < w + h; i += 12) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + 6, y + h); g.lineTo(x + i + 6 + h, y); g.lineTo(x + i + h, y); g.fill(); }
    g.restore();
  }

  // ---------- obstacle art (local coords) ----------
  const DRAW = {
    crate(g, o, w, t) {
      const h = o.top || 50, hw = 23;
      g.fillStyle = '#3b4252'; rr(g, -hw, -h, hw * 2, h, 4); g.fill();
      g.strokeStyle = '#9aa5b8'; g.lineWidth = 2; rr(g, -hw + 2, -h + 2, hw * 2 - 4, h - 4, 3); g.stroke();
      g.strokeStyle = '#6b7488'; g.beginPath(); g.moveTo(-hw + 4, -h + 4); g.lineTo(hw - 4, -4); g.moveTo(hw - 4, -h + 4); g.lineTo(-hw + 4, -4); g.stroke();
      stripes(g, -hw, -h * 0.5 - 5, hw * 2, 10, '#facc15', '#1f2937');
      g.fillStyle = '#e5e7eb'; for (const [x, y] of [[-17, -h + 8], [17, -h + 8], [-17, -8], [17, -8]]) { g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); }
    },
    hook(g, o, w, t) {
      const sway = Math.sin(t * 2.2 + o.x * 0.01) * 4, topY = -(o.top || 104), botY = -(o.bottom || 34);
      g.strokeStyle = '#4b5563'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -420); g.lineTo(sway * 0.4, topY); g.stroke();
      g.strokeStyle = '#9ca3af'; g.lineWidth = 1.5; for (let y = topY; y < botY - 14; y += 9) { g.beginPath(); g.ellipse(sway * (1 - (y - topY) / 80) * 0.4, y, 3.5, 5, 0, 0, TAU); g.stroke(); }
      g.save(); g.translate(sway * 0.3, botY - 8); g.fillStyle = '#facc15'; rr(g, -9, -14, 18, 12, 3); g.fill();
      g.strokeStyle = '#fde68a'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(0, 6, 10, Math.PI * 1.1, Math.PI * 2.4, false); g.stroke();
      g.fillStyle = '#ef4444'; g.beginPath(); g.moveTo(8, 14); g.lineTo(14, 8); g.lineTo(10, 18); g.fill(); g.restore();
    },
    glitch(g, o, w, t, low) {
      const h = o.top || 56, hw = 22; const j = Math.floor(t * 18) % 5;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(244,63,94,.75)'; g.fillRect(-hw - 2 + j, -h, hw * 2, h);
      g.fillStyle = 'rgba(34,211,238,.75)'; g.fillRect(-hw + 2 - j, -h + 2, hw * 2, h - 2);
      g.fillStyle = 'rgba(74,222,128,.55)'; g.fillRect(-hw, -h - 2, hw * 2, h);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#04120c'; for (let i = 0; i < 6; i++) { const yy = -h + ((i * 17 + Math.floor(t * 9) * 7) % h); g.fillRect(-hw - 3, yy, hw * 2 + 6, 2.5); }
      g.fillStyle = '#e8fff4'; g.font = 'bold 12px monospace'; g.textAlign = 'center'; g.fillText(j % 2 ? '#?!' : '0x0F', 0, -h * 0.45);
    },
    steam(g, o, w, t) {
      const ph = ((w.time || 0) + (o.seed || 0) * 3.7) % 2.4, active = ph < 1.5, warn = ph > 2.0;
      g.fillStyle = '#374151'; rr(g, -14, -16, 28, 16, 3); g.fill(); g.fillStyle = '#6b7280'; g.fillRect(-9, -22, 18, 7);
      g.fillStyle = warn ? '#f43f5e' : '#4b5563'; g.beginPath(); g.arc(0, -8, 3, 0, TAU); g.fill();
      if (active) { for (let i = 0; i < 6; i++) { const k = ((t * 1.6 + i / 6) % 1); g.fillStyle = 'rgba(226,232,240,' + (0.55 * (1 - k)).toFixed(2) + ')'; g.beginPath(); g.arc(Math.sin(i * 2.3 + t * 3) * 6, -22 - k * 70, 9 + k * 12, 0, TAU); g.fill(); } }
      else { for (let i = 0; i < 2; i++) { const k = ((t * 0.9 + i / 2) % 1); g.fillStyle = 'rgba(226,232,240,' + (0.3 * (1 - k)).toFixed(2) + ')'; g.beginPath(); g.arc(Math.sin(i * 4 + t) * 3, -22 - k * 22, 4 + k * 4, 0, TAU); g.fill(); } }
    },
    shard(g, o, w, t) {
      const fall = Math.max(0, ((o.x - w.travel) - 300) * 0.8); g.translate(0, -fall);
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(165,180,252,.18)'; g.beginPath(); g.moveTo(-8, -50); g.lineTo(8, -50); g.lineTo(2, -50 - 140); g.lineTo(-2, -50 - 140); g.fill(); g.restore();
      const gr = g.createLinearGradient(0, -80, 0, 0); gr.addColorStop(0, '#e0e7ff'); gr.addColorStop(1, '#6366f1');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(-13, -34); g.lineTo(-5, -70); g.lineTo(6, -52); g.lineTo(14, -30); g.closePath(); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#ffffff90'; g.beginPath(); g.moveTo(-5, -66); g.lineTo(-1, -30); g.lineTo(-9, -34); g.fill();
    },
    icicle(g, o, w, t) {
      const top = o.top || 104, bot = o.bottom || 34; const gr = g.createLinearGradient(0, -top - 24, 0, -bot); gr.addColorStop(0, '#e0f2fe'); gr.addColorStop(1, '#38bdf8');
      g.fillStyle = '#7dd3fc'; g.fillRect(-26, -top - 24, 52, 14);
      g.fillStyle = gr; g.beginPath(); g.moveTo(-17, -top - 10); g.lineTo(17, -top - 10); g.lineTo(5, -bot - 14); g.lineTo(0, -bot); g.lineTo(-5, -bot - 14); g.closePath(); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#ffffffb0'; g.fillRect(-8, -top - 4, 3, 30);
      g.fillStyle = '#e0f2fe'; g.beginPath(); g.moveTo(-26, -top - 10); g.lineTo(-20, -top + 2); g.lineTo(-13, -top - 10); g.moveTo(14, -top - 10); g.lineTo(22, -top + 4); g.lineTo(27, -top - 10); g.fill();
    },
    slime(g, o, w, t) {
      const sq = 1 + Math.sin(t * 6 + o.x) * 0.1; g.scale(1 / sq, sq);
      const gr = g.createLinearGradient(0, -34, 0, 0); gr.addColorStop(0, '#86efac'); gr.addColorStop(1, '#16a34a');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-20, 0); g.quadraticCurveTo(-24, -24, -4, -32); g.quadraticCurveTo(22, -34, 20, 0); g.closePath(); g.fill();
      g.fillStyle = '#ffffff55'; g.beginPath(); g.ellipse(-8, -22, 5, 3, -0.5, 0, TAU); g.fill();
      eyes(g, 0, -17, 6, 3.4, '#052e16'); g.fillStyle = '#fff'; g.fillRect(-7.5, -19, 2, 2); g.fillRect(4.5, -19, 2, 2);
      g.strokeStyle = '#052e16'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, -10, 4, 0.2, Math.PI - 0.2); g.stroke();
    },
    golem(g, o, w, t) {
      const h = o.top || 72; g.fillStyle = '#57534e'; rr(g, -25, -h + 18, 50, h - 18, 6); g.fill();
      g.fillStyle = '#78716c'; rr(g, -19, -h, 38, 26, 6); g.fill(); rr(g, -33, -h + 20, 14, 34, 5); g.fill(); rr(g, 19, -h + 20, 14, 34, 5); g.fill();
      g.strokeStyle = '#fb923c'; g.lineWidth = 2; g.shadowColor = '#fb923c'; g.shadowBlur = 8; g.beginPath(); g.moveTo(-8, -h + 34); g.lineTo(-2, -h + 44); g.lineTo(-10, -h + 54); g.moveTo(10, -h + 30); g.lineTo(4, -h + 40); g.stroke(); g.shadowBlur = 0;
      eyes(g, 0, -h + 12, 7, 3, '#fbbf24'); g.fillStyle = '#44403c'; g.fillRect(-20, -14, 14, 14); g.fillRect(6, -14, 14, 14);
    },
    wraith(g, o, w, t) {
      const bob = Math.sin(t * 3 + o.x) * 4; g.translate(0, bob - 12); g.globalAlpha *= 0.92;
      const gr = g.createLinearGradient(0, -52, 0, 12); gr.addColorStop(0, '#c4b5fd'); gr.addColorStop(1, 'rgba(76,29,149,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-18, 10); g.quadraticCurveTo(-22, -40, 0, -52); g.quadraticCurveTo(22, -40, 18, 10);
      for (let i = 4; i >= -4; i--) g.lineTo(i * 4.5, 10 + (i % 2 ? 7 : 0) + Math.sin(t * 6 + i) * 2); g.closePath(); g.fill();
      g.fillStyle = '#1e1b4b'; g.beginPath(); g.ellipse(0, -30, 11, 13, 0, 0, TAU); g.fill();
      g.shadowColor = '#f0abfc'; g.shadowBlur = 8; eyes(g, 0, -31, 4.5, 2.6, '#f0abfc'); g.shadowBlur = 0;
    },
    mech(g, o, w, t) {
      const step = Math.sin(t * 9 + o.x) * 4; g.fillStyle = '#334155'; rr(g, -22, -52, 44, 34, 5); g.fill();
      g.fillStyle = '#94a3b8'; g.fillRect(-14, -46, 28, 8); g.fillStyle = '#ef4444'; g.shadowColor = '#ef4444'; g.shadowBlur = 8; g.beginPath(); g.arc(0, -32, 6, 0, TAU); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = '#64748b'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-12, -18); g.lineTo(-14 + step, -2); g.moveTo(12, -18); g.lineTo(14 - step, -2); g.stroke();
      g.strokeStyle = '#94a3b8'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -52); g.lineTo(0, -62); g.stroke(); g.fillStyle = '#facc15'; g.beginPath(); g.arc(0, -63, 2.4, 0, TAU); g.fill();
    },
    boss(g, o, w, t) {
      const b = C.BOSSES.find((x) => x.id === o.boss) || C.MINI_BOSS || C.BOSSES[0]; const col = b.color || '#f43f5e'; const h = o.top || 76, hw = (o.width || 96) / 2;
      const bob = Math.sin(t * 4) * 2;
      g.fillStyle = '#0f172a'; rr(g, -hw, -h + 10, hw * 2, h - 10, 12); g.fill();
      g.strokeStyle = col; g.lineWidth = 3; g.shadowColor = col; g.shadowBlur = 12; rr(g, -hw + 2, -h + 12, hw * 2 - 4, h - 14, 10); g.stroke(); g.shadowBlur = 0;
      g.fillStyle = col + '55'; rr(g, -hw + 8, -h + 20, hw * 2 - 16, 22, 6); g.fill();
      g.fillStyle = '#e2e8f0'; g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.fillText(b.name, 0, -h + 34);
      eyes(g, 0, -h + 54, 16, 5, col); g.fillStyle = '#0f172a'; g.beginPath(); g.arc(-16, -h + 54, 2, 0, TAU); g.arc(16, -h + 54, 2, 0, TAU); g.fill();
      g.fillStyle = '#1e293b'; rr(g, -14, -h - 4 + bob, 28, 16, 4); g.fill(); g.fillStyle = col; g.fillRect(-3, -h - 14 + bob, 6, 12);
      g.fillStyle = '#475569'; g.fillRect(-hw + 6, -10, 22, 10); g.fillRect(hw - 28, -10, 22, 10);
      // stomp-me hint (fair telegraph): bouncing chevron above the weak point
      const hb = Math.sin(t * 6) * 3; g.fillStyle = '#fde047'; g.beginPath(); g.moveTo(-8, -h - 38 + hb); g.lineTo(8, -h - 38 + hb); g.lineTo(0, -h - 26 + hb); g.closePath(); g.fill();
    },
  };
  function drawObstacle(g, o, w, t, low) { const f = DRAW[o.kind]; if (!f) return false; f(g, o, w, t, low); return true; }

  // ---------- pickups (local coords, already translated/scaled) ----------
  function drawPickup(g, p, t) {
    if (!NEW_PICKS[p.kind]) return false;
    g.translate(0, Math.sin(t * 4 + p.x) * 3);
    if (p.kind === 'gem') { g.rotate(Math.sin(t * 2 + p.x) * 0.1); g.fillStyle = '#22d3ee'; g.shadowColor = '#22d3ee'; g.shadowBlur = 10; g.beginPath(); g.moveTo(0, -11); g.lineTo(10, -3); g.lineTo(0, 11); g.lineTo(-10, -3); g.closePath(); g.fill(); g.shadowBlur = 0; g.fillStyle = '#ecfeff'; g.beginPath(); g.moveTo(0, -11); g.lineTo(-10, -3); g.lineTo(-2, -3); g.closePath(); g.fill(); }
    else if (p.kind === 'star') { g.rotate(t * 2); g.fillStyle = '#fde047'; g.shadowColor = '#facc15'; g.shadowBlur = 12; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 12; const a = i * Math.PI / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.shadowBlur = 0; }
    else if (p.kind === 'bolt') { g.fillStyle = '#1e1b4b'; g.strokeStyle = '#a5b4fc'; g.lineWidth = 2; g.shadowColor = '#818cf8'; g.shadowBlur = 10; rr(g, -13, -13, 26, 26, 7); g.fill(); g.stroke(); g.shadowBlur = 0; g.fillStyle = '#fde047'; g.beginPath(); g.moveTo(2, -10); g.lineTo(-7, 2); g.lineTo(-1, 2); g.lineTo(-3, 10); g.lineTo(7, -2); g.lineTo(1, -2); g.closePath(); g.fill(); }
    else if (p.kind === 'heart') { const s = 1 + Math.sin(t * 7) * 0.08; g.scale(s, s); g.fillStyle = '#fb7185'; g.shadowColor = '#f43f5e'; g.shadowBlur = 12; g.beginPath(); g.moveTo(0, 9); g.bezierCurveTo(-16, -2, -9, -14, 0, -6); g.bezierCurveTo(9, -14, 16, -2, 0, 9); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff5'; g.beginPath(); g.ellipse(-5, -6, 2.5, 1.6, -0.6, 0, TAU); g.fill(); }
    return true;
  }

  window.RakazaArt = { palAt, P, drawObstacle, drawPickup, NEW_KINDS, NEW_PICKS, hex, css, mixc, smooth, rr };
})();
