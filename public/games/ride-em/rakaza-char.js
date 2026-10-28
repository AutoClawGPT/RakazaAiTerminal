/* RAKAZA CHARACTER (v14): cyber anime runner — pink/violet twin-tails, glowing visor, neon outfit.
   Same call shape as the engine's drawCat so every screen (title, skins, trails, ghost, share card) can use it.
   Hitbox stays identical to the cat (the engine owns collision); this is purely cosmetic. */
(() => {
  'use strict';
  const OUTFITS = [
    { id: 'courier', name: 'Neon Courier', blurb: 'Pink-violet twin-tails, cyan visor, delivery-run jacket.',
      hairA: '#ff5fc8', hairB: '#8b5cf6', visor: '#22d3ee', glow: '#22d3ee', boot: '#1b1630', sole: '#22d3ee', skirt: '#1b1630', skinTone: '#ffdcd2' },
    { id: 'sunset', name: 'Sunset Rider', blurb: 'Hot coral to magenta hair, gold visor, golden-hour trim.',
      hairA: '#ff9e6b', hairB: '#f43f8f', visor: '#ffd166', glow: '#ffb066', boot: '#2a1520', sole: '#ffd166', skirt: '#2a1520', skinTone: '#ffd9c7' },
    { id: 'ghost', name: 'Midnight Ghost', blurb: 'Pale-violet hair, red visor, black-out stealth kit.',
      hairA: '#e0d4ff', hairB: '#6d28d9', visor: '#f43f5e', glow: '#a78bfa', boot: '#0d0b18', sole: '#a78bfa', skirt: '#0d0b18', skinTone: '#f1e3ee' },
    { id: 'ember', name: 'Ember Rogue', blurb: 'Fire-red hair, amber visor, tiny horns.', hairA: '#fb923c', hairB: '#b91c1c', visor: '#fbbf24', glow: '#fb923c', boot: '#25100a', sole: '#fb923c', skirt: '#25100a', skinTone: '#ffd3bd', acc: 'horns', accCol: '#fbbf24' },
    { id: 'frost', name: 'Frost Warden', blurb: 'Ice-blue braids and a crystal crown.', hairA: '#e0f2fe', hairB: '#38bdf8', visor: '#bae6fd', glow: '#7dd3fc', boot: '#0b1a2b', sole: '#7dd3fc', skirt: '#0b1a2b', skinTone: '#f1f5f9', acc: 'crystal', accCol: '#bae6fd' },
    { id: 'volt', name: 'Volt Spark', blurb: 'Electric-yellow spikes, goggles, antenna.', hairA: '#fde047', hairB: '#a3e635', visor: '#ffffff', glow: '#fde047', boot: '#1a1a0b', sole: '#fde047', skirt: '#1a1a0b', skinTone: '#ffe2c4', acc: 'antenna', accCol: '#fde047' },
    { id: 'verdant', name: 'Verdant Scout', blurb: 'Leaf-green hair, pointed leaf ears.', hairA: '#86efac', hairB: '#15803d', visor: '#bbf7d0', glow: '#4ade80', boot: '#0a1f10', sole: '#4ade80', skirt: '#0a1f10', skinTone: '#fde2c8', acc: 'leaf', accCol: '#4ade80' },
    { id: 'solar', name: 'Solar Flare', blurb: 'Gold crown of light, white-hot visor.', hairA: '#fde68a', hairB: '#f59e0b', visor: '#ffffff', glow: '#fbbf24', boot: '#2a1c06', sole: '#fbbf24', skirt: '#2a1c06', skinTone: '#ffe0b8', acc: 'crown', accCol: '#fbbf24' },
    { id: 'void', name: 'Void Walker', blurb: 'Black-violet hair, violet cape, void visor.', hairA: '#6d28d9', hairB: '#0f0a1e', visor: '#c084fc', glow: '#7c3aed', boot: '#07050f', sole: '#7c3aed', skirt: '#07050f', skinTone: '#e9d5ff', acc: 'cape', accCol: '#4c1d95' },
    { id: 'candy', name: 'Candy Pop', blurb: 'Pastel swirl hair, cat ears and a big bow.', hairA: '#f9a8d4', hairB: '#a5f3fc', visor: '#fdf2f8', glow: '#f472b6', boot: '#2a1226', sole: '#f9a8d4', skirt: '#2a1226', skinTone: '#ffe4ec', acc: 'catbow', accCol: '#f472b6' },
    { id: 'chrome', name: 'Chrome Runner', blurb: 'Silver hair, mirrored visor, speed headband.', hairA: '#e2e8f0', hairB: '#64748b', visor: '#e2e8f0', glow: '#cbd5e1', boot: '#0f172a', sole: '#e2e8f0', skirt: '#0f172a', skinTone: '#e2e8f0', acc: 'goggles', accCol: '#38bdf8' },
    { id: 'samurai', name: 'Crimson Ronin', blurb: 'Dark hair, crimson headband, steel visor.', hairA: '#27272a', hairB: '#09090b', visor: '#f87171', glow: '#ef4444', boot: '#18181b', sole: '#ef4444', skirt: '#18181b', skinTone: '#ffdcc8', acc: 'headband', accCol: '#dc2626' },
    { id: 'pixel', name: 'Pixel Prime', blurb: 'Rainbow hair and a pixel crown.', hairA: '#f0abfc', hairB: '#60a5fa', visor: '#4ade80', glow: '#a78bfa', boot: '#111827', sole: '#4ade80', skirt: '#111827', skinTone: '#ffe0c8', acc: 'pixelcrown', accCol: '#fde047' },
    { id: 'angel', name: 'Starlight Seraph', blurb: 'Pearl hair, glowing halo and wings.', hairA: '#fefce8', hairB: '#fde68a', visor: '#fef9c3', glow: '#fde68a', boot: '#2a2411', sole: '#fde68a', skirt: '#faf5e6', skinTone: '#fff1e6', acc: 'wings', accCol: '#fff7cc' },
  ];

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  function leg(g, hx, hy, ph, air, col, sole, sil, lift) {
    // two-segment leg: hip -> knee -> foot
    let fx, fy;
    if (air) { fx = hx + (lift ? 9 : -7); fy = hy + (lift ? 4 : 7); }
    else { fx = hx + Math.sin(ph) * 11; fy = -1 - Math.max(0, -Math.cos(ph)) * 7; }
    const kx = (hx + fx) / 2 + 3, ky = (hy + fy) / 2 - 1;
    g.strokeStyle = col; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
    g.fillStyle = sil || col; rr(g, fx - 3, fy - 2, 9, 5, 2); g.fill();
    if (!sil) { g.fillStyle = sole; g.fillRect(fx - 3, fy + 2, 9, 1.6); }
  }


  // v15 accessories: back layer (cape, wings) and head layer (horns, crown, ears ...)
  function accBack(g, O, time, sliding, airborne, sil) {
    if (O.acc === 'cape') { const w1 = Math.sin(time * 10) * 6; g.fillStyle = sil || O.accCol; g.beginPath(); g.moveTo(-5, sliding ? -14 : -40); g.quadraticCurveTo(-26 - w1, -28, -38 - w1, sliding ? -2 : -8 + w1); g.lineTo(-20, -10); g.quadraticCurveTo(-12, -22, -3, -22); g.closePath(); g.fill(); if (!sil) { g.strokeStyle = O.glow; g.lineWidth = 1.2; g.stroke(); } }
    if (O.acc === 'wings') { const fl = Math.sin(time * (airborne ? 18 : 9)) * 7; g.fillStyle = sil || O.accCol; g.globalAlpha *= 0.92; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-3, (sliding ? -16 : -38) + i * 2); g.quadraticCurveTo(-22 - i * 6, (sliding ? -34 : -62) - fl + i * 8, -34 - i * 7, (sliding ? -20 : -44) + i * 7 - fl * 0.4); g.quadraticCurveTo(-18, (sliding ? -18 : -40) + i * 3, -3, (sliding ? -12 : -33) + i * 2); g.fill(); } g.globalAlpha /= 0.92; }
  }
  function accHead(g, O, hx, hyc, time, sil) {
    const c = sil || O.accCol; g.fillStyle = c; g.strokeStyle = c;
    switch (O.acc) {
      case 'horns': g.beginPath(); g.moveTo(hx - 5, hyc - 9); g.lineTo(hx - 8, hyc - 20); g.lineTo(hx - 1, hyc - 11); g.fill(); g.beginPath(); g.moveTo(hx + 4, hyc - 10); g.lineTo(hx + 8, hyc - 21); g.lineTo(hx + 9, hyc - 8); g.fill(); break;
      case 'crystal': for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(hx + 1 + i * 6 - 2.5, hyc - 9); g.lineTo(hx + 1 + i * 6, hyc - 19 - (i === 0 ? 4 : 0)); g.lineTo(hx + 1 + i * 6 + 2.5, hyc - 9); g.closePath(); g.fill(); } if (!sil) { g.strokeStyle = '#fff'; g.lineWidth = 0.7; g.stroke(); } break;
      case 'antenna': g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx + 2, hyc - 10); g.lineTo(hx + 5, hyc - 20); g.stroke(); g.beginPath(); g.arc(hx + 5, hyc - 21, 2.2 + Math.sin(time * 14) * 0.6, 0, 6.3); g.fill(); break;
      case 'leaf': g.beginPath(); g.moveTo(hx - 8, hyc - 3); g.quadraticCurveTo(hx - 17, hyc - 12, hx - 15, hyc - 16); g.quadraticCurveTo(hx - 8, hyc - 10, hx - 5, hyc - 8); g.fill(); g.beginPath(); g.moveTo(hx + 8, hyc - 5); g.quadraticCurveTo(hx + 16, hyc - 14, hx + 14, hyc - 18); g.quadraticCurveTo(hx + 8, hyc - 12, hx + 4, hyc - 9); g.fill(); break;
      case 'crown': g.beginPath(); g.moveTo(hx - 7, hyc - 9); g.lineTo(hx - 7, hyc - 17); g.lineTo(hx - 3, hyc - 12); g.lineTo(hx + 1, hyc - 19); g.lineTo(hx + 5, hyc - 12); g.lineTo(hx + 9, hyc - 17); g.lineTo(hx + 9, hyc - 9); g.closePath(); g.fill(); break;
      case 'catbow': g.beginPath(); g.moveTo(hx - 8, hyc - 6); g.lineTo(hx - 8, hyc - 18); g.lineTo(hx - 1, hyc - 10); g.fill(); g.beginPath(); g.moveTo(hx + 3, hyc - 10); g.lineTo(hx + 9, hyc - 18); g.lineTo(hx + 10, hyc - 5); g.fill(); g.beginPath(); g.moveTo(hx + 8, hyc + 1); g.lineTo(hx + 15, hyc - 3); g.lineTo(hx + 15, hyc + 5); g.closePath(); g.fill(); g.beginPath(); g.moveTo(hx + 8, hyc + 1); g.lineTo(hx + 1, hyc - 3); g.lineTo(hx + 1, hyc + 5); g.closePath(); g.fill(); break;
      case 'goggles': g.fillStyle = sil || '#334155'; g.fillRect(hx - 9, hyc - 9, 20, 3); g.fillStyle = c; g.beginPath(); g.arc(hx + 1, hyc - 9, 4, 3.14, 6.28); g.fill(); break;
      case 'headband': g.fillRect(hx - 9.5, hyc - 6, 21, 3); g.beginPath(); g.moveTo(hx - 9, hyc - 5); g.lineTo(hx - 22, hyc - 8 + Math.sin(time * 12) * 3); g.lineTo(hx - 20, hyc - 2 + Math.sin(time * 13) * 3); g.lineTo(hx - 9, hyc - 3); g.fill(); break;
      case 'pixelcrown': for (let i = 0; i < 4; i++) g.fillRect(hx - 8 + i * 5, hyc - 13 - (i % 2 ? 0 : 4), 4, 5 + (i % 2 ? 0 : 4)); g.fillRect(hx - 8, hyc - 10, 19, 2); break;
      case 'wings': g.globalAlpha *= 0.9; g.lineWidth = 1.6; g.strokeStyle = sil || '#fef08a'; g.beginPath(); g.ellipse(hx + 1, hyc - 16, 8, 2.6, 0, 0, 6.3); g.stroke(); g.globalAlpha /= 0.9; break;
      default: break;
    }
  }

  function draw(g, x, y, scale, skin, time, sliding, airborne, alpha, silhouette, outfitIdx, low) {
    const O = OUTFITS[(outfitIdx | 0) % OUTFITS.length] || OUTFITS[0];
    const sil = silhouette || '';
    const glow = !sil && !low;
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    g.globalAlpha *= (alpha == null ? 1 : alpha);
    const run = Math.sin(time * 19);
    const bob = airborne ? -1 : Math.sin(time * 38) * 1.1;
    g.translate(0, bob);
    if (O.acc) accBack(g, O, time, sliding, airborne, sil);
    const jacket = sil || skin.body, jdark = sil || skin.dark, trim = sil || skin.scarf;
    const hairA = sil || O.hairA, hairB = sil || O.hairB;

    // --- twin-tails (behind everything). Streams further back when fast / airborne
    const sway1 = Math.sin(time * 12) * 6, sway2 = Math.sin(time * 11 + 1.3) * 8;
    const hy0 = sliding ? -14 : -50, lift = airborne ? -9 : 0;
    function tail(oy, sw, col, wid) {
      g.strokeStyle = col; g.lineWidth = wid; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-6, hy0 + oy);
      g.bezierCurveTo(-22, hy0 + oy + 3 + lift, -30, hy0 + oy + 14 + sw + lift * 0.5, -46 + sw * 0.3, hy0 + oy + 22 + sw + lift);
      g.stroke();
    }
    tail(2, sway2, hairB, 6.5);
    tail(-2, sway1, hairA, 5.5);
    if (!sil) { // tail tips glow
      g.fillStyle = O.glow + 'cc';
      g.beginPath(); g.arc(-46 + sway1 * 0.3, hy0 + 20 + sway1 + lift, 2.2, 0, 6.3); g.fill();
    }
    // --- neon scarf / ribbon
    g.strokeStyle = trim; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-5, sliding ? -12 : -35);
    g.bezierCurveTo(-18, -33, -26, -22 + Math.sin(time * 12) * 5, -40, -30 + Math.sin(time * 11) * 7); g.stroke();

    if (sliding) {
      // sit-slide: legs forward, torso leaning back, head low
      leg(g, -4, -9, 0, true, jdark, O.sole, sil, true);
      g.strokeStyle = jdark; g.lineWidth = 5; g.beginPath(); g.moveTo(-6, -9); g.lineTo(18, -4); g.stroke();
      g.fillStyle = sil || O.boot; rr(g, 14, -8, 10, 6, 2.5); g.fill();
      if (!sil) { g.fillStyle = O.sole; g.fillRect(14, -3, 10, 1.6); }
      g.fillStyle = jacket; g.save(); g.translate(-3, -9); g.rotate(-0.95);
      rr(g, -6, -17, 12, 18, 5); g.fill(); g.fillStyle = trim; g.fillRect(-6, -4, 12, 2.4); g.restore();
      g.fillStyle = sil || O.skirt; g.beginPath(); g.moveTo(-7, -8); g.lineTo(7, -8); g.lineTo(10, -2); g.lineTo(-9, -3); g.closePath(); g.fill();
      g.translate(7, 9); // head sits low
    } else {
      leg(g, -3, -19, run * 1 + 0, airborne, jdark, O.sole, sil, false);
      g.save();
      // back leg uses opposite phase
      leg(g, 3, -19, Math.PI + Math.asin(Math.max(-1, Math.min(1, run))) * (airborne ? 0 : 1), airborne, jdark, O.sole, sil, true);
      g.restore();
      // swinging back arm
      g.strokeStyle = jdark; g.lineWidth = 4.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-3, -35); g.lineTo(-8 - (airborne ? 4 : run * 7), -26 + (airborne ? -4 : 0)); g.stroke();
      // skirt
      g.fillStyle = sil || O.skirt; g.beginPath(); g.moveTo(-8, -25); g.lineTo(8, -25); g.lineTo(11 + run * 1.5, -16); g.lineTo(-11 - run * 1.5, -17); g.closePath(); g.fill();
      if (!sil) { g.fillStyle = trim; g.fillRect(-9, -18.4, 20, 1.6); }
      // torso (jacket)
      g.fillStyle = jacket; rr(g, -8, -41, 16, 18, 6); g.fill();
      if (!sil) { g.fillStyle = trim; g.fillRect(-8, -30, 16, 2.2); g.fillStyle = '#ffffff30'; g.fillRect(-6, -39, 4, 1.6); }
      // front arm
      g.strokeStyle = jacket; g.lineWidth = 4.6;
      g.beginPath(); g.moveTo(4, -36); g.lineTo(12 + (airborne ? 3 : -run * 6), -27 + (airborne ? -9 : 0)); g.stroke();
      if (!sil) { g.fillStyle = O.skinTone; g.beginPath(); g.arc(12 + (airborne ? 3 : -run * 6), -27 + (airborne ? -9 : 0), 2.3, 0, 6.3); g.fill(); }
    }

    // --- head
    const hx = 1, hyc = -49;
    // cyber ear-fins (a nod to Taby)
    g.fillStyle = hairB;
    g.beginPath(); g.moveTo(hx - 8, hyc - 6); g.lineTo(hx - 7, hyc - 19); g.lineTo(hx - 0.5, hyc - 9); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(hx + 1, hyc - 9); g.lineTo(hx + 7, hyc - 19); g.lineTo(hx + 9, hyc - 5); g.closePath(); g.fill();
    if (!sil) { g.fillStyle = O.glow; g.beginPath(); g.moveTo(hx - 6.6, hyc - 9); g.lineTo(hx - 6.4, hyc - 15); g.lineTo(hx - 3, hyc - 10); g.closePath(); g.fill(); }
    // back hair mass
    g.fillStyle = hairB; g.beginPath(); g.arc(hx - 1, hyc, 10.3, 0, 6.3); g.fill();
    // face
    g.fillStyle = sil || O.skinTone; g.beginPath(); g.arc(hx + 2, hyc + 1, 8.4, 0, 6.3); g.fill();
    // fringe / bangs
    g.fillStyle = hairA;
    g.beginPath(); g.moveTo(hx - 9, hyc + 1); g.quadraticCurveTo(hx - 8, hyc - 11, hx + 4, hyc - 10);
    g.quadraticCurveTo(hx + 11, hyc - 9, hx + 11, hyc - 3); g.lineTo(hx + 6, hyc - 3); g.lineTo(hx + 3, hyc - 6);
    g.lineTo(hx - 1, hyc - 2); g.lineTo(hx - 4, hyc - 5); g.lineTo(hx - 6, hyc + 2); g.closePath(); g.fill();
    if (!sil) {
      // visor + eye
      if (glow) { g.shadowColor = O.visor; g.shadowBlur = 9; }
      g.fillStyle = '#14122a'; rr(g, hx - 1, hyc - 3, 15, 7.5, 3.2); g.fill();
      g.fillStyle = O.visor; rr(g, hx + 1, hyc - 1.4, 11.5, 3.8, 1.9); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ffffffcc'; g.fillRect(hx + 8, hyc - 0.6, 3, 1.3);
      // blush + mouth
      g.fillStyle = '#ff7aa766'; g.beginPath(); g.arc(hx + 4.5, hyc + 5.4, 1.7, 0, 6.3); g.fill();
      g.strokeStyle = '#8a2e5a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(hx + 7, hyc + 6.2); g.quadraticCurveTo(hx + 8.6, hyc + 7.2, hx + 10, hyc + 6.2); g.stroke();
      // hair highlight
      g.fillStyle = '#ffffff55'; g.fillRect(hx - 4, hyc - 8, 6, 1.6);
    }
    if (O.acc) accHead(g, O, hx, hyc, time, sil);
    g.restore();
  }

  function portrait(g, cx, groundY, scale, outfit, skin, t) {
    // full-body standing/run pose for menus and the share card
    draw(g, cx, groundY, scale, skin, t || 0.4, false, false, 1, '', outfit, false);
  }

  window.RakazaChar = { OUTFITS, draw, portrait, rr };
})();
