/* RAKAZA AUDIO + HAPTICS (v15). Pure WebAudio synth, no files, no network.
   Layers: kick / clap / hats / saw bass / pulse arp / pad. Tempo + density follow speed and distance. */
(() => {
  'use strict';
  const P = () => window.RakazaPrefs;
  let ctx = null, master = null, musicBus = null, sfxBus = null, comp = null, noiseBuf = null;
  let nextT = 0, step = 0, bar = 0;

  const isMuted = () => !!(window.__rz2 && window.__rz2.saved && window.__rz2.saved.mute);

  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
        master = ctx.createGain(); musicBus = ctx.createGain(); sfxBus = ctx.createGain();
        musicBus.gain.value = 0.5; sfxBus.gain.value = 0.95;
        musicBus.connect(master); sfxBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.6);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        applyVolume(true);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { ctx = null; }
  }
  function applyVolume(now) {
    if (!ctx) return;
    const v = isMuted() ? 0 : Math.pow(Math.max(0, Math.min(1, P().get('volume'))), 1.6);
    master.gain.setTargetAtTime(v, ctx.currentTime, now ? 0 : 0.03);
  }
  const ready = () => ctx && ctx.state === 'running';

  function osc(type, f0, f1, dur, vol, delay, bus, lp) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let tail = o;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); tail = f; }
    tail.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) {} };
  }
  function noise(dur, vol, ftype, f0, f1, delay, bus) {
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.03);
    s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
  }

  const MAJ = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const hz = (base, semis) => base * Math.pow(2, semis / 12);

  function sfx(kind, combo) {
    unlock();
    if (!ready() || !P().get('sfx')) return;
    applyVolume();
    switch (kind) {
      case 'jump': osc('triangle', 250, 700, 0.13, 0.07); noise(0.05, 0.02, 'highpass', 2500, 4000); break;
      case 'coin': {
        const n = MAJ[Math.min(MAJ.length - 1, Math.floor((combo || 0) / 2))];
        const f = hz(659, n);
        osc('sine', f, f, 0.12, 0.06); osc('sine', f * 1.5, f * 1.5, 0.16, 0.03, 0.045);
        break;
      }
      case 'hit': noise(0.28, 0.12, 'lowpass', 1800, 160); osc('sawtooth', 190, 38, 0.3, 0.09); break;
      case 'power': [0, 4, 7, 12].forEach((s, i) => osc('triangle', hz(440, s), hz(440, s), 0.18, 0.05, i * 0.055)); break;
      case 'land': noise(0.08, 0.05, 'lowpass', 500, 120); break;
      case 'slide': noise(0.34, 0.05, 'bandpass', 2200, 500); break;
      case 'stomp': osc('sine', 420, 110, 0.14, 0.09); osc('square', 880, 1320, 0.07, 0.03); noise(0.06, 0.05, 'highpass', 1500, 3000); break;
      case 'level': [0, 4, 7, 12, 16, 19].forEach((s, i) => osc('square', hz(523.25, s), hz(523.25, s), 0.16, 0.035, i * 0.065, sfxBus, 3000)); break;
      case 'skill': noise(0.32, 0.06, 'highpass', 400, 5000); osc('triangle', 300, 1100, 0.28, 0.05); break;
      case 'stage': [0, 7, 12].forEach((s, i) => osc('sawtooth', hz(392, s), hz(392, s), 0.3, 0.04, i * 0.1, sfxBus, 2600)); break;
      case 'rush': for (let i = 0; i < 6; i++) osc('sine', hz(880, MAJ[i]), hz(880, MAJ[i]), 0.1, 0.035, i * 0.05); break;
      case 'ui': osc('sine', 880, 1175, 0.05, 0.04); break;
      case 'over': [0, -3, -7, -12].forEach((s, i) => osc('triangle', hz(330, s), hz(330, s) * 0.97, 0.3, 0.06, i * 0.14)); break;
      case 'snap': noise(0.05, 0.08, 'highpass', 3000, 6000); osc('square', 1800, 1200, 0.04, 0.04, 0.03); break;
      case 'near': osc('triangle', 900, 1500, 0.08, 0.04); noise(0.07, 0.03, 'bandpass', 3500, 6500); break;
      case 'gem': [0, 7, 12, 19].forEach((n, i) => { osc('sine', hz(880, n), hz(880, n), 0.2, 0.045, i * 0.04); osc('triangle', hz(1760, n), hz(1760, n), 0.1, 0.02, i * 0.04); }); break;
      case 'star': for (let i = 0; i < 8; i++) osc('square', hz(660, MAJ[i]), hz(660, MAJ[i]), 0.07, 0.025, i * 0.035, sfxBus, 3600); break;
      case 'bolt': noise(0.22, 0.09, 'highpass', 1200, 7000); osc('sawtooth', 1400, 90, 0.2, 0.05); osc('square', 110, 55, 0.25, 0.05, 0.02); break;
      case 'heart': [0, 4, 7].forEach((n, i) => osc('sine', hz(523, n), hz(523, n), 0.35, 0.05, i * 0.08)); osc('sine', 130, 130, 0.4, 0.06); break;
      case 'bossdown': noise(0.7, 0.14, 'lowpass', 2600, 120); osc('sawtooth', 220, 30, 0.7, 0.1); [0, 4, 7, 12, 16].forEach((n, i) => osc('square', hz(523, n), hz(523, n), 0.22, 0.04, 0.35 + i * 0.08, sfxBus, 3200)); break;
      case 'event': [0, 3, 7, 10].forEach((n, i) => osc('sawtooth', hz(220, n), hz(220, n) * 1.01, 0.28, 0.035, i * 0.07, sfxBus, 1800)); noise(0.3, 0.04, 'bandpass', 600, 2400); break;
      case 'revive': osc('sine', 200, 900, 0.5, 0.07); [0, 7, 12].forEach((n, i) => osc('triangle', hz(523, n), hz(523, n), 0.3, 0.04, 0.25 + i * 0.07)); break;
      case 'draft': [0, 5, 9].forEach((n, i) => osc('triangle', hz(440, n), hz(440, n), 0.12, 0.04, i * 0.05)); osc('sine', 1760, 1760, 0.2, 0.02, 0.15); break;
      case 'warn': osc('square', 440, 440, 0.12, 0.04); osc('square', 330, 330, 0.12, 0.04, 0.16); break;
      default: break;
    }
  }

  // ------------------------------------------------------------- music
  // chord = [root semitone from A, minor?]  progressions (A2 = 110 Hz base)
  const PROG = {
    sunset: [[0, 1], [-4, 0], [3, 0], [-2, 0]],      // Am F C G
    violet: [[-7, 1], [-11, 0], [-4, 0], [3, 0]],    // Dm Bb F C
    neon: [[-5, 1], [3, 0], [-2, 0], [-9, 0]],       // Em C G D
    edge: [[0, 1], [-2, 0], [-4, 0], [-5, 1]],       // Am G F Em
    harbor: [[-2, 0], [-4, 0], [0, 1], [-5, 1]],     // G F Am Em
    glitch: [[0, 1], [1, 1], [0, 1], [-1, 0]],       // Am Bbm Am G#  (chromatic wobble)
    foundry: [[-7, 1], [-7, 1], [-4, 0], [-2, 0]],   // Dm Dm F G
    starfall: [[3, 0], [-4, 0], [0, 1], [-2, 0]],    // C F Am G
    frozen: [[-9, 0], [-5, 1], [-2, 0], [-7, 1]],    // D Em G Dm
    boss: [[0, 1], [1, 0], [0, 1], [-2, 1]],         // dark, fast
  };
  // per stage index: progression, bpm base, wave of the bass/arp, drum style, arp pattern, hat density (0..1)
  const STAGE_MUSIC = [
    { p: 'sunset', bpm: 104, bass: 'sawtooth', arp: 'square', drums: 'four', pat: [0, 1, 2, 3, 2, 1, 3, 4] },
    { p: 'violet', bpm: 108, bass: 'sawtooth', arp: 'square', drums: 'four', pat: [0, 2, 1, 3, 2, 4, 3, 1] },
    { p: 'neon', bpm: 112, bass: 'sawtooth', arp: 'triangle', drums: 'break', pat: [0, 1, 2, 1, 3, 2, 4, 2] },
    { p: 'edge', bpm: 116, bass: 'square', arp: 'square', drums: 'four', pat: [0, 0, 2, 0, 3, 0, 2, 4] },
    { p: 'sunset', bpm: 110, bass: 'triangle', arp: 'sawtooth', drums: 'half', pat: [0, 2, 4, 2, 1, 3, 4, 3] },
    { p: 'violet', bpm: 118, bass: 'sawtooth', arp: 'square', drums: 'break', pat: [4, 3, 2, 1, 0, 1, 2, 3] },
    { p: 'harbor', bpm: 106, bass: 'triangle', arp: 'triangle', drums: 'half', pat: [0, 1, 3, 1, 2, 4, 2, 1] },
    { p: 'glitch', bpm: 124, bass: 'square', arp: 'square', drums: 'glitch', pat: [0, 3, 1, 4, 0, 2, 4, 1] },
    { p: 'foundry', bpm: 100, bass: 'sawtooth', arp: 'sawtooth', drums: 'march', pat: [0, 0, 1, 0, 2, 0, 1, 3] },
    { p: 'starfall', bpm: 112, bass: 'triangle', arp: 'sine', drums: 'four', pat: [0, 2, 3, 4, 3, 2, 1, 2] },
    { p: 'frozen', bpm: 96, bass: 'sine', arp: 'triangle', drums: 'half', pat: [0, 1, 2, 4, 2, 1, 0, 3] },
  ];
  const ARP_N = (third) => [0, third, 7, 12, 19];
  function music(dt, state, game) {
    if (state !== 'play' || !game) { nextT = 0; step = 0; bar = 0; return; }
    if (!ctx) return;
    applyVolume();
    if (!ready() || !P().get('music') || isMuted()) { nextT = 0; return; }
    const dist = game.dist || 0;
    const sm = STAGE_MUSIC[Math.min(STAGE_MUSIC.length - 1, Math.max(0, game.stage | 0))] || STAGE_MUSIC[0];
    const zt = game.zone && game.zone.type;
    const boss = zt === 'boss' || zt === 'bossRun';
    const inten = Math.min(1, dist / 3500 + Math.min(0.3, (game.combo || 0) / 80) + (boss ? 0.35 : 0) + (zt && !boss ? 0.15 : 0));
    const bpm = (boss ? 132 : sm.bpm) + Math.min(1, dist / 4000) * 26;
    const sd = 60 / bpm / 4;
    const now = ctx.currentTime;
    if (nextT < now - 0.25 || nextT === 0) nextT = now + 0.06;
    const prog = PROG[boss ? 'boss' : sm.p];
    while (nextT < now + 0.14) {
      const s = step % 16, ch = prog[Math.floor(step / 16) % 4];
      const root = hz(110, ch[0]), third = ch[1] ? 3 : 4;
      const d = nextT - now;
      const dr = boss ? 'break' : sm.drums;
      // drums by style
      const kick = dr === 'four' ? s % 4 === 0 : dr === 'half' ? s % 8 === 0 : dr === 'march' ? s % 4 === 0 : dr === 'glitch' ? [0, 3, 7, 10, 12].includes(s) : [0, 6, 10].includes(s);
      if (kick && (inten > 0.2 || s % 8 === 0)) osc('sine', 150, 42, 0.16, 0.2, d, musicBus);
      const snare = dr === 'half' ? s === 8 : dr === 'march' ? s % 4 === 2 : (s === 4 || s === 12);
      if (snare && inten > 0.1) noise(0.11, 0.07, 'bandpass', 1900, 1300, d, musicBus);
      if (boss && (s === 14 || s === 15)) osc('sine', 110, 70, 0.12, 0.1, d, musicBus);
      if (s % 2 === 1 || (inten > 0.6 && s % 2 === 0) || (dr === 'glitch' && s % 3 === 0)) noise(0.035, 0.022 + inten * 0.012, 'highpass', 7000, 8000, d, musicBus);
      // bass: syncopated 8ths
      if ([0, 3, 6, 8, 10, 14].includes(s)) {
        const oct = (s === 6 || s === 14) ? 2 : 1;
        osc(sm.bass, root * oct, root * oct, sd * 1.8, 0.075, d, musicBus, 520 + inten * 500);
      }
      // arp enters with intensity
      if (inten > 0.12) {
        const n = ARP_N(third)[sm.pat[s % 8]];
        const f = root * 4 * Math.pow(2, n / 12);
        osc(sm.arp, f, f, sd * 1.3, 0.016 + inten * 0.006, d, musicBus, 2400 + inten * 1500);
      }
      // pad on bar start
      if (s === 0) [0, third, 7].forEach((n) => osc('triangle', root * 2 * Math.pow(2, n / 12), root * 2 * Math.pow(2, n / 12), sd * 15, 0.02, d, musicBus));
      // lead hook at high combo or in a boss fight
      if (((game.combo || 0) >= 25 || boss) && [0, 6, 10, 12].includes(s)) {
        const f = hz(root * 8, [0, third, 7, 12][(s >> 2) % 4]);
        osc(boss ? 'sawtooth' : 'triangle', f, f, sd * 2, boss ? 0.02 : 0.025, d, musicBus, 3000);
      }
      nextT += sd; step++;
    }
  }

  window.RakazaAudio = { unlock, sfx, music, applyVolume, ctx: () => ctx };

  // ------------------------------------------------------------- haptics
  const PAT = { near: 6, gem: 16, star: 22, bolt: 30, heart: 20, bossdown: [40, 30, 40, 30, 120], event: [20, 30, 20], revive: [30, 20, 60], draft: 10, jump: 8, slide: 10, hit: [45, 30, 80], power: 18, stomp: 24, level: [20, 40, 20], stage: [30, 40, 30], over: [60, 40, 110], skill: 14, ui: 5, snap: 12 };
  window.RakazaFeel = {
    vib(kind) {
      try {
        if (!P().get('haptics') || !navigator.vibrate) return false;
        const p = PAT[kind]; if (!p) return false;
        return navigator.vibrate(p);
      } catch (e) { return false; }
    },
  };
})();
