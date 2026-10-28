/* ============================================================================
   RAKAZA SIM (v15) - the pure, deterministic game core.
   - No DOM, no Math.random, no Date, no timers, no Math.sin/cos/pow/exp/log.
   - Fixed 120 Hz ticks. Every player input goes through Sim.input() and is logged by tick,
     so RakazaReplay.replay(seed, inputLog, cfg) rebuilds a run exactly.
   - Runs in the browser (window.RakazaSim) and in node (headless replay, tests, agents).
   ========================================================================== */
(function (root, factory) {
  const C = (typeof module === 'object' && module.exports) ? require('./rakaza-content.js') : root.RakazaContent;
  if (typeof module === 'object' && module.exports) module.exports = factory(C);
  else root.RakazaSim = factory(C);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  const DT = 1 / 120;
  const TICK_HZ = 120;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  // sine tables (literals so every JS engine agrees)
  const ARC5 = [0, 0.7071067811865476, 1, 0.7071067811865476, 0];
  const ARC12 = [0, 0.281733, 0.540641, 0.75575, 0.909632, 0.989821, 0.989821, 0.909632, 0.75575, 0.540641, 0.281733, 0];
  const POWERS = ['shield', 'magnet', 'slow', 'double'];
  const BONUS = ['gem', 'gem', 'star', 'bolt', 'heart'];
  const TIMERS = ['slide', 'slideLock', 'invulnerable', 'magnet', 'slow', 'double', 'comboTimer', 'jumpBuffer', 'surge', 'overdrive', 'blinkT', 'tstop', 'hoverT', 'shrinkT', 'springT', 'echoT', 'prismT', 'vortexT'];
  const OPS = { JUMP: 1, DOUBLE: 2, SLIDE: 3, HOLD_ON: 4, HOLD_OFF: 5, SKILL: 6, DRAFT: 7, FASTFALL: 8, END: 9 };

  // integer hash -> [0,1)
  function H(seed, n) {
    let h = (seed ^ Math.imul((n + 0x9E3779B9) | 0, 0x85EBCA6B)) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x7FEB352D) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846CA68B) >>> 0; h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function mulberry(seed) {
    let n = seed >>> 0;
    return function () {
      n += 0x6D2B79F5; let t = n;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const charById = (id) => C.CHARACTERS.find((c) => c.id === id) || null;

  // ------------------------------------------------------------------ config
  function normalize(cfg) {
    cfg = cfg || {};
    const mode = C.MODES[cfg.mode] ? cfg.mode : 'classic';
    const ch = charById(cfg.character);
    const out = {
      mode, theme: cfg.theme == null ? -1 : cfg.theme | 0, character: ch ? ch.id : 'courier',
      skills: Array.isArray(cfg.skills) ? cfg.skills.filter((s) => C.SKILLS[s]).slice(0, 4) : [],
      upg: Object.assign({}, cfg.upg || {}), boosts: Object.assign({}, cfg.boosts || {}),
      ladder: cfg.ladder | 0, startDist: Math.max(0, +cfg.startDist || 0), noHead: !!cfg.noHead,
      noEvents: !!cfg.noEvents, noZones: !!cfg.noZones, noDraft: !!cfg.noDraft, trainer: !!cfg.trainer,
      perk: cfg.perk || (ch && ch.perk) || null, ranked: !!cfg.ranked, weekendXp: !!cfg.weekendXp,
    };
    return out;
  }

  // ------------------------------------------------------------------ create
  function create(seed, cfgIn) {
    const cfg = normalize(cfgIn);
    seed = seed >>> 0;
    const mo = C.MODES[cfg.mode];
    const w = {
      seed, cfg, rand: mulberry(seed), rand2: mulberry((seed ^ 0xA5A5F00D) >>> 0), tick: 0, time: 0, travel: 0, dist: 0, speed: 0.35, velocity: 183.5,
      y: 0, vy: 0, grounded: true, jumps: 0, coyote: 0.09, jumpBuffer: 0, hold: 0, airTime: 0, held: false,
      slide: 0, slideLock: 0, invulnerable: 0, shield: 0, magnet: 0, slow: 0, double: 0,
      surge: 0, overdrive: 0, blinkT: 0, tstop: 0, hoverT: 0, shrinkT: 0, springT: 0, echoT: 0, prismT: 0, vortexT: 0, midasN: 0,
      coins: 0, coinCarry: 0, combo: 0, comboTimer: 0, near: 0, collisions: 0, kills: 0, bossKills: 0, dead: false, cause: '', over: false, lives: C.LIVES || 3, hits: 0,
      obstacles: [], pickups: [], nextObstacle: 620, obstacleIndex: 0, nextPower: 480, powerIndex: 0, nextCoins: 210, nextBonus: 900, bonusIndex: 0,
      lastJump: -10, nextId: 1, coinSpawned: 0, headStart: 0, skipped: 0,
      cd: {}, skillsFired: 0, revives: 0, revivesUsed: 0, runXP: 0, nextDraft: 420, draft: null, paused: false,
      ladder: cfg.ladder, campStart: 0, ladderUps: 0, zone: null, zoneAnn: '', zdone: {}, zcache: {}, ev: [], noEvents: !!cfg.trainer,
      log: [], rec: !cfg.trainer, lastLogKey: '', stage: 0, modeSpeed: mo.speedMul, modeCoin: mo.coinMul,
      perk: cfg.perk || {}, ghostMode: !!mo.ghost, log2: 0,
    };
    // start-of-run effects (persistent upgrades and boosts)
    const u = cfg.upg, b = cfg.boosts;
    if (u.shield && !mo.ghost && cfg.mode !== 'hardcore') w.shield = 1;
    if (u.cushion && !mo.ghost && cfg.mode !== 'hardcore') w.shield = 1;
    if (b.shield && cfg.mode !== 'hardcore') w.shield = 1;
    if (u.magnet) w.magnet = Math.max(w.magnet, 4);
    if (b.magnet) w.magnet = Math.max(w.magnet, 6);
    if (u.slow) w.slow = Math.max(w.slow, 2);
    if (b.double) w.double = Math.max(w.double, 10);
    if (!cfg.noHead) {
      let t = 0;
      if (u.headstart2) t = 5000; else if (u.head) t = 2000;
      if (b.head) t += 1000;
      w.travel += t;
    }
    if (cfg.startDist > 0) w.travel = Math.round(cfg.startDist / 0.12);
    w.dist = w.travel * 0.12;
    w.headStart = w.dist; w.campStart = w.dist;
    w.revives = (u.revive ? 1 : 0) + (u.lifeline ? 1 : 0);
    w.cdMul = 1 - (u.cd ? 0.2 : 0) - ((w.perk.cdPct || 0) / 100);
    w.sklMul = u.skillplus ? 1.25 : 1;
    w.magR = u.magnetR ? 1.6 : 1;
    w.stage = C.stageIndexAt(w.dist, cfg.theme);
    fillWorld(w);
    return w;
  }

  // ------------------------------------------------------------------ zones (bosses + events, pure functions of seed and x)
  const BOSS_X = 12500; // 1500 m
  function eventAtBlock(w, j) {
    if (j < 0) return null;
    const u = H(w.seed, 9000 + j);
    let type = null;
    if (u < 0.18) type = null; else if (u < 0.42) type = 'coinRush'; else if (u < 0.66) type = 'meteor'; else if (u < 0.86) type = 'glitchStorm'; else type = 'bossRun';
    return type;
  }
  function zoneAt(w, x) {
    if (w.cfg.noZones || w.cfg.trainer) return null;
    // boss zone k>=1: [k*BOSS_X-700, +2300)
    const k = Math.floor((x + C.BOSS_ZONE_BACK) / BOSS_X);
    if (k >= 1) {
      const xs = k * BOSS_X - C.BOSS_ZONE_BACK;
      if (x >= xs && x < xs + C.BOSS_ZONE_LEN) {
        const key = 'b' + k;
        return w.zcache[key] || (w.zcache[key] = { key, type: 'boss', xs, xe: xs + C.BOSS_ZONE_LEN, boss: C.BOSSES[(k - 1) % C.BOSSES.length], idx: k });
      }
    }
    if (w.cfg.noEvents) return null;
    const m = x * 0.12;
    const j = Math.floor((m - C.EVENT_FIRST_M) / C.EVENT_EVERY_M);
    if (j >= 0) {
      const type = eventAtBlock(w, j);
      if (type) {
        const xs = Math.round((C.EVENT_FIRST_M + j * C.EVENT_EVERY_M) / 0.12);
        const xe = xs + Math.round(C.EVENTS[type].lenM / 0.12);
        if (x >= xs && x < xe) {
          // keep events clear of boss zones
          const kb = Math.round(xs / BOSS_X);
          const bxs = kb * BOSS_X - C.BOSS_ZONE_BACK;
          if (kb >= 1 && xs < bxs + C.BOSS_ZONE_LEN + 400 && xe > bxs - 400) return null;
          const key = 'e' + j;
          return w.zcache[key] || (w.zcache[key] = { key, type, xs, xe, idx: j });
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ generation
  function poolFor(w, x) {
    const si = C.stageIndexAt(x * 0.12, w.cfg.theme);
    const st = C.STAGES[si];
    if (!st.extra.length) return C.BASE_POOL;
    if (!w.poolCache) w.poolCache = {};
    return w.poolCache[si] || (w.poolCache[si] = C.BASE_POOL.concat(st.extra, st.extra, st.extra));
  }
  function makeObstacle(w, kind, x, spanOverride) {
    const k = C.KINDS[kind];
    return { id: w.nextId++, kind, enemy: !!k.enemy, dead: false, x, width: spanOverride || k.span, top: k.top, bottom: k.bottom, hit: false, passed: false, seed: 0 };
  }
  function addCoinsLine(w, x0, n, step, y) {
    for (let c = 0; c < n; c++) { w.pickups.push({ kind: 'coin', x: x0 + c * step, y, taken: false }); w.coinSpawned++; }
  }
  function addArc(w, ox, rushy) {
    for (let c = 0; c < 5; c++) { w.pickups.push({ kind: 'coin', x: ox - 82 + c * 38, y: 44 + ARC5[c] * 79, taken: false }); w.coinSpawned++; }
    if (rushy) for (let c = 0; c < 5; c++) { w.pickups.push({ kind: 'coin', x: ox + 120 + c * 38, y: 44 + ARC5[c] * 79, taken: false }); w.coinSpawned++; }
  }
  function genScript(w, z, boss) {
    const base = z.xs;
    let last = base;
    boss.pattern.forEach((p) => {
      const o = makeObstacle(w, p[1], base + 150 + p[0]);
      o.seed = H(w.seed, 77000 + o.id); o.zone = z.key; w.obstacles.push(o);
      const low = C.LOW_KINDS.indexOf(p[1]) >= 0;
      if (low) addCoinsLine(w, o.x - 54, 4, 36, 13); else addArc(w, o.x, false);
      last = o.x;
    });
    const body = makeObstacle(w, 'boss', base + 150 + boss.body);
    body.boss = boss.id; body.bossName = boss.name; body.reward = boss.reward; body.seed = H(w.seed, 78000 + body.id); body.zone = z.key;
    w.obstacles.push(body);
    for (let c = 0; c < 8; c++) { w.pickups.push({ kind: 'coin', x: body.x - 120 + c * 38, y: 50 + ARC12[c + 2] * 95, taken: false }); w.coinSpawned++; }
    w.zdone[z.key] = true;
    return base + 150 + boss.body + 400;
  }
  function fillObstacles(w, horizon) {
    while (w.nextObstacle < horizon) {
      const z = zoneAt(w, w.nextObstacle);
      if (z && (z.type === 'boss' || z.type === 'bossRun')) {
        if (!w.zdone[z.key]) {
          w.nextObstacle = Math.max(w.nextObstacle, 0);
          const endx = genScript(w, z, z.type === 'boss' ? z.boss : C.MINI_BOSS);
          w.nextObstacle = endx;
          continue;
        }
        w.nextObstacle = z.xe + 300; continue;
      }
      const i = w.obstacleIndex++;
      const pool = poolFor(w, w.nextObstacle);
      let kind = i < 8 ? C.BASE_POOL[i] : pool[Math.floor(w.rand() * pool.length)];
      if (z && z.type === 'meteor' && i >= 8 && w.rand() < 0.7) kind = 'shard';
      else if (z && z.type === 'glitchStorm' && i >= 8) { const gp = ['glitch', 'glitch', 'wraith', 'laser', 'crate']; kind = gp[Math.floor(w.rand() * gp.length)]; }
      let span = C.KINDS[kind].span;
      if (kind === 'gap') span = 68 + w.rand() * 25;
      const o = makeObstacle(w, kind, w.nextObstacle, span);
      o.seed = w.rand();
      w.obstacles.push(o);
      const rushy = !!(z && z.type === 'coinRush');
      if (kind !== 'sign' && kind !== 'drone' && C.LOW_KINDS.indexOf(kind) < 0) addArc(w, o.x, rushy);
      else addCoinsLine(w, o.x - 54, 4, 36, 13);
      const predictedSpeed = 145 + (0.35 + clamp(o.x * 0.12 / 4000, 0, 1) * 1.15) * 110;
      const rush = clamp(o.x / 14000, 0, 1);
      const gapMul = 2.15 - rush * 0.62;
      let gap = predictedSpeed * (gapMul + w.rand() * (0.65 - rush * 0.3)) + span;
      if (z && z.type === 'meteor') gap *= 0.85;
      w.nextObstacle += gap;
    }
  }
  function nearObstacle(w, x, pad) {
    for (let i = 0; i < w.obstacles.length; i++) { const o = w.obstacles[i]; if (Math.abs(o.x - x) < o.width * 0.5 + pad) return o; }
    return null;
  }
  function fillWorld(w) {
    const horizon = w.travel + 2200;
    fillObstacles(w, horizon);
    // coins / power / bonus are capped so obstacle knowledge is always complete (timing independent)
    const cap = Math.min(horizon, w.nextObstacle - 200);
    while (w.nextCoins < cap) {
      const x = w.nextCoins;
      const z = zoneAt(w, x);
      if (!nearObstacle(w, x, 135)) addCoinsLine(w, x, 3, 27, 23);
      w.nextCoins += (z && z.type === 'coinRush') ? 140 : 325;
    }
    while (w.nextPower < cap) {
      let x = w.nextPower;
      for (let tries = 0; tries < 12; tries++) {
        const c = nearObstacle(w, x, 100);
        if (!c) break;
        x = c.x + c.width * 0.5 + 145;
      }
      w.pickups.push({ kind: POWERS[w.powerIndex++ % 4], x, y: 25, taken: false });
      w.nextPower += 1060;
    }
    while (w.nextBonus < cap) {
      let x = w.nextBonus;
      for (let tries = 0; tries < 12; tries++) {
        const c = nearObstacle(w, x, 100);
        if (!c) break;
        x = c.x + c.width * 0.5 + 145;
      }
      const idx = w.bonusIndex++;
      const kind = BONUS[Math.floor(H(w.seed, 5000 + idx) * BONUS.length)];
      w.pickups.push({ kind, x, y: 30 + (idx % 2) * 50, taken: false });
      w.nextBonus += 780 + Math.floor(H(w.seed, 6000 + idx) * 500);
    }
  }
  function isGap(w, x) {
    for (let i = 0; i < w.obstacles.length; i++) { const o = w.obstacles[i]; if (o.kind === 'gap' && x > o.x - o.width / 2 + 3 && x < o.x + o.width / 2 - 3) return true; }
    return false;
  }
  function steamActive(w, o) { return ((w.time + o.seed * 3.7) % 2.4) < 1.5; }

  // ------------------------------------------------------------------ events out (client drains w.ev)
  function emit(w, type, a, b, c) { if (!w.noEvents) w.ev.push([type, a, b, c]); }

  // ------------------------------------------------------------------ coin math (fractional carry keeps small perks real)
  function coinMult(w) {
    let m = w.modeCoin;
    if (w.double > 0) m *= 2;
    if (w.surge > 0 || w.overdrive > 0 || w.prismT > 0) m *= 2;
    if (w.zone && w.zone.type === 'coinRush') m *= 3;
    if (w.perk.coinPct) m *= 1 + w.perk.coinPct / 100;
    return m;
  }
  function addCoins(w, base, noMidas) {
    let m = coinMult(w) * base;
    if (!noMidas && w.midasN > 0) { m *= 3; w.midasN--; }
    w.coinCarry += m;
    const n = Math.floor(w.coinCarry);
    w.coinCarry -= n;
    w.coins += n;
    return n;
  }
  function hitInvuln(w) { return 1.1 * (1 + (w.perk.hitInvulnPct || 0) / 100); }
  function powerMul(w) { return 1 + (w.perk.powerPct || 0) / 100; }
  function comboWin(w) { return 2.5 * (1 + (w.perk.comboPct || 0) / 100); }

  // ------------------------------------------------------------------ actions
  function jumpLimit(w) { return w.springT > 0 ? 3 : 2; }
  function triggerJump(w, power, doubleOnly) {
    if (w.dead || w.time - w.lastJump < 0.105) return false;
    const canGround = w.grounded || (w.coyote > 0 && w.jumps === 0);
    if (doubleOnly && canGround) return false;
    if (canGround) w.jumps = 1;
    else if (w.jumps < jumpLimit(w)) w.jumps++;
    else { w.jumpBuffer = 0.12; return false; }
    w.vy = 440;
    w.hold = 0.06 + clamp(power, 0, 1) * 0.25;
    w.grounded = false; w.coyote = 0; w.slide = 0; w.airTime = 0; w.lastJump = w.time; w.jumpBuffer = 0;
    emit(w, 'jump', w.travel, w.y, w.jumps);
    return true;
  }
  function triggerSlide(w) {
    if (w.slideLock <= 0 && !w.dead) {
      w.slide = 0.62 * (1 + (w.perk.slidePct || 0) / 100); w.slideLock = 0.14;
      if (w.grounded) emit(w, 'slide', w.travel, w.y);
    }
  }
  // v16 rule: a run has C.LIVES (3) hearts. Every unblocked hit (wall, obstacle, hazard, monster, gap fall) costs one heart and
  // grants a short invulnerability window. The shield skill / shield pickup / echo still absorb a hit without costing a heart.
  // ZEN (ghostMode) never loses a heart. A revive (draft / upgrade) only saves the run at the last heart.
  function kill(w, cause) {
    if (w.dead) return;
    if (w.ghostMode) { w.invulnerable = Math.max(w.invulnerable, 0.6); return; }
    w.lives = Math.max(0, w.lives - 1); w.hits++; w.collisions++;
    emit(w, 'hit', w.travel, w.y, w.lives <= 0 && w.revives <= 0 ? 1 : 0);
    if (w.lives > 0) { w.invulnerable = Math.max(w.invulnerable, hitInvuln(w)); return; }
    if (w.revives > 0) {
      w.revives--; w.revivesUsed++; w.lives = 1;
      w.invulnerable = Math.max(w.invulnerable, 2.2); w.y = Math.max(w.y, 0);
      if (!w.grounded && w.y < 0) { w.y = 0; w.vy = 0; w.grounded = true; w.jumps = 0; }
      emit(w, 'revive', w.travel, w.y);
      return;
    }
    w.dead = true; w.over = true; w.cause = cause;
  }
  // A gap fall costs a heart; while hearts remain the runner is put back on the roof and hovers across the rest of the gap.
  function fallKill(w) {
    kill(w, 'Lost to the rooftop gap');
    if (w.dead) return;
    let end = w.travel;
    for (let i = 0; i < w.obstacles.length; i++) { const o = w.obstacles[i]; if (o.kind === 'gap' && w.travel > o.x - o.width / 2 - 40 && w.travel < o.x + o.width / 2) end = Math.max(end, o.x + o.width / 2); }
    w.y = 0; w.vy = 0; w.grounded = true; w.jumps = 0; w.airTime = 0; w.coyote = 0.09;
    w.hoverT = Math.max(w.hoverT, (end - w.travel) / Math.max(1, w.velocity) + 0.45);
  }

  // ------------------------------------------------------------------ skills
  function skillReady(w, id) { return !((w.cd[id] || 0) > 0); }
  function useSkill(w, id) {
    const sk = C.SKILLS[id];
    if (!sk || w.dead || w.paused || (w.cfg.skills.indexOf(id) < 0)) return false;
    if (!skillReady(w, id)) return false;
    const sm = w.sklMul;
    const inr = (o, r) => Math.abs(o.x - w.travel) < r;
    let toast = sk.name;
    switch (id) {
      case 'ghost': w.invulnerable = Math.max(w.invulnerable, 2.5 * sm); break;
      case 'magnetBurst': w.magnet = Math.max(w.magnet, 6 * sm * powerMul(w)); break;
      case 'freeze': w.slow = Math.max(w.slow, 3 * sm * (1 + (w.perk.slowPct || 0) / 100)); break;
      case 'surge': w.surge = 4 * sm; break;
      case 'bomb': { let n = 0; for (const o of w.obstacles) if (o.kind !== 'gap' && o.kind !== 'boss' && !o.hit && inr(o, 260)) { if (o.enemy) { o.dead = true; w.kills++; } o.hit = true; n++; } toast = 'BOMB · ' + n + ' cleared'; break; }
      case 'blink': w.invulnerable = Math.max(w.invulnerable, 2 * sm); w.blinkT = 2 * sm; break;
      case 'thunder': { let n = 0; for (const o of w.obstacles) if (o.enemy && o.kind !== 'boss' && !o.dead && inr(o, 620)) { o.dead = true; o.hit = true; w.kills++; addCoins(w, 2, true); n++; } toast = 'THUNDER · ' + n + ' monsters'; break; }
      case 'wall': w.shield = 1; break;
      case 'rain': for (let i = 0; i < 12; i++) { w.pickups.push({ kind: 'coin', x: w.travel + 150 + i * 42, y: 55 + ARC12[i] * 85, taken: false }); w.coinSpawned++; } break;
      case 'overdrive': w.overdrive = 6 * sm; break;
      case 'recall': w.invulnerable = Math.max(w.invulnerable, 3 * sm); break;
      case 'dash': w.travel += 1830; w.dist = w.travel * 0.12; w.headStart += 220; w.skipped += 220; w.invulnerable = Math.max(w.invulnerable, 1.2); break;
      case 'timestop': w.slow = Math.max(w.slow, 4 * sm); w.tstop = 4 * sm; break;
      case 'lucky': for (let i = 0; i < 3; i++) w.pickups.push({ kind: POWERS[Math.floor(w.rand2() * 4)], x: w.travel + 200 + i * 260, y: 40, taken: false }); break;
      case 'vortex': w.vortexT = 4 * sm; break;
      case 'prism': w.invulnerable = Math.max(w.invulnerable, 3 * sm); w.prismT = 3 * sm; break;
      case 'hover': w.hoverT = 4 * sm; if (!w.grounded && w.y < 0) { w.y = 0; w.vy = 0; w.grounded = true; w.jumps = 0; } break;
      case 'quake': { let n = 0; for (const o of w.obstacles) if (o.enemy && o.bottom === 0 && o.kind !== 'boss' && !o.dead && inr(o, 420)) { o.dead = true; o.hit = true; w.kills++; addCoins(w, 1, true); n++; } toast = 'QUAKE · ' + n + ' stomped'; break; }
      case 'midas': w.midasN = 12; break;
      case 'shrink': w.shrinkT = 5 * sm; break;
      case 'springs': w.springT = 6 * sm; break;
      case 'harvest': { let n = 0; for (const o of w.obstacles) if (o.kind !== 'gap' && o.kind !== 'boss' && !o.hit && o.x > w.travel - 40 && o.x - w.travel < 500) { if (o.enemy) { o.dead = true; w.kills++; } o.hit = true; addCoinsLine(w, o.x - 27, 3, 27, 40); n++; } toast = 'HARVEST · ' + n; break; }
      case 'echo': w.echoT = 8 * sm; break;
      case 'meteorSk': { let n = 0; for (const o of w.obstacles) if (o.kind !== 'gap' && o.kind !== 'boss' && !o.hit && o.x > w.travel - 40 && o.x - w.travel < 900) { if (o.enemy) { o.dead = true; w.kills++; } o.hit = true; n++; } toast = 'METEOR · ' + n + ' smashed'; break; }
      case 'beacon': w.combo += 20; w.comboTimer = comboWin(w); w.magnet = Math.max(w.magnet, 3 * sm); break;
      default: return false;
    }
    w.cd[id] = sk.cd * w.cdMul;
    w.skillsFired++;
    emit(w, 'skill', id, toast);
    return true;
  }

  // ------------------------------------------------------------------ run draft (level-up cards, paused sim until a choice is input)
  function openDraft(w) {
    const pool = C.DRAFTS.slice(); const out = [];
    for (let i = 0; i < 3; i++) out.push(pool.splice(Math.floor(w.rand2() * pool.length), 1)[0].id);
    w.draft = out; w.paused = true;
    emit(w, 'draft', out);
  }
  function applyDraft(w, id) {
    if (id === 'shield') w.shield = 1;
    else if (id === 'magnet') w.magnet = Math.max(w.magnet, 8 * powerMul(w));
    else if (id === 'slowmo') w.slow = Math.max(w.slow, 3 * (1 + (w.perk.slowPct || 0) / 100));
    else if (id === 'coins') w.double = Math.max(w.double, 15 * powerMul(w));
    else if (id === 'ghost') w.invulnerable = Math.max(w.invulnerable, 4);
    else if (id === 'revive') w.revives++;
    emit(w, 'draftPick', id);
  }

  // ------------------------------------------------------------------ input (logged)
  function input(w, op, arg) {
    arg = arg | 0;
    if (w.over && op !== OPS.END) return false;
    if (w.rec) {
      const key = w.tick + ':' + op + ':' + arg;
      if (key !== w.lastLogKey) { w.log.push([w.tick, op, arg]); w.lastLogKey = key; }
    }
    if (w.paused && op !== OPS.DRAFT && op !== OPS.END) return false;
    switch (op) {
      case OPS.JUMP: return triggerJump(w, clamp(arg / 4, 0, 1), false);
      case OPS.DOUBLE: return triggerJump(w, clamp(arg / 4, 0, 1), true);
      case OPS.SLIDE: triggerSlide(w); return true;
      case OPS.HOLD_ON: w.held = true; return true;
      case OPS.HOLD_OFF: w.held = false; return true;
      case OPS.SKILL: return useSkill(w, w.cfg.skills[arg]);
      case OPS.DRAFT:
        if (w.draft && w.draft[arg]) { const id = w.draft[arg]; w.draft = null; w.paused = false; applyDraft(w, id); return true; }
        return false;
      case OPS.FASTFALL: if (!w.grounded && w.vy > -200) { w.vy = -200; w.hold = 0; } return true;
      case OPS.END: if (!w.dead) { w.dead = true; w.over = true; w.cause = w.cause || 'Run ended'; } return true;
      default: return false;
    }
  }

  // ------------------------------------------------------------------ step
  function bodyH(w) { const h = w.slide > 0 ? 20 : 44; return w.shrinkT > 0 ? h * 0.7 : h; }
  function step(w) {
    if (w.dead || w.paused) return;
    w.tick++;
    fillWorld(w);
    w.time += DT;
    // zone / stage tracking
    w.zone = zoneAt(w, w.travel);
    const ann = zoneAt(w, w.travel + 520);
    const annKey = ann ? ann.key : '';
    if (annKey !== w.zoneAnn) {
      w.zoneAnn = annKey;
      if (ann) emit(w, 'zone', ann.type, ann.type === 'boss' ? ann.boss.name : C.EVENTS[ann.type].name, ann.idx);
    }
    const si = C.stageIndexAt(w.dist, w.cfg.theme);
    if (si !== w.stage) { w.stage = si; emit(w, 'stage', si); }
    // mode curve
    const mode = w.cfg.mode;
    if (mode === 'survival') w.modeSpeed = 1.12 + Math.min(0.9, w.dist / 4000);
    if (mode === 'campaign') {
      const st = C.LADDER[Math.min(w.ladder, C.LADDER.length - 1)];
      w.modeSpeed = st.speedMul; w.modeCoin = st.coinMul;
      if (w.dist >= w.campStart + st.goal) {
        w.campStart = w.dist; w.ladderUps++; const done = w.ladder;
        w.ladder = Math.min(C.LADDER.length - 1, w.ladder + 1);
        emit(w, 'ladder', done, w.ladder);
      }
    }
    w.speed = 0.35 + clamp(w.dist / 4000, 0, 1) * 1.15;
    const slowFactor = w.slow > 0 ? 0.68 : 1;
    let sk = 1;
    if (w.surge > 0) sk *= 1.3;
    if (w.overdrive > 0) sk *= 1.2;
    if (w.blinkT > 0) sk *= 1.35;
    if (w.tstop > 0) sk *= 0.75;
    w.velocity = (145 + w.speed * 110) * slowFactor * w.modeSpeed * sk;
    w.travel += w.velocity * DT;
    w.dist = w.travel * 0.12;
    for (let i = 0; i < TIMERS.length; i++) { const k = TIMERS[i]; const v = w[k] - DT; w[k] = v > 0 ? v : 0; }
    for (const k in w.cd) { const v = w.cd[k] - DT; w.cd[k] = v > 0 ? v : 0; }
    if (w.comboTimer === 0) w.combo = 0;

    const hole = w.hoverT > 0 ? false : isGap(w, w.travel);
    if (w.grounded && hole) { w.grounded = false; w.coyote = 0.09; w.jumps = 0; w.airTime = 0; }
    if (!w.grounded) {
      w.coyote = w.coyote - DT > 0 ? w.coyote - DT : 0;
      w.airTime += DT;
      const useHold = (w.held || w.hold > 0) && w.vy > 0 && w.airTime < 0.31;
      w.vy -= 1400 * (useHold ? 0.48 : 1) * DT;
      w.y += w.vy * DT;
      w.hold = w.hold - DT > 0 ? w.hold - DT : 0;
      if (w.y <= 0 && w.vy <= 0 && !hole && w.y > -32) {
        w.y = 0; w.vy = 0; w.grounded = true; w.jumps = 0; w.coyote = 0.09;
        emit(w, 'land', w.travel, 0);
        if (w.jumpBuffer > 0) triggerJump(w, 1, false);
      }
    } else { w.y = 0; w.vy = 0; w.coyote = 0.09; }
    if (w.y < -200) { fallKill(w); if (w.dead) return; }

    const bh = bodyH(w);
    const hm = w.shrinkT > 0 ? 6 : 11;
    for (let i = 0; i < w.obstacles.length; i++) {
      const o = w.obstacles[i];
      const dx = o.x - w.travel;
      if (o.enemy && !o.dead && Math.abs(dx) < o.width / 2 + 14) {
        const stomping = w.vy < -30 && w.y > o.top - 24 && w.y < o.top + 46;
        if (stomping) {
          o.dead = true; o.hit = true; w.vy = 330; w.kills++;
          if (o.kind === 'boss') {
            w.bossKills++; addCoins(w, o.reward, true);
            emit(w, 'bossDown', o.bossName, o.reward, o.x);
          } else addCoins(w, 3 + (w.perk.stompCoins || 0), true);
          w.combo++; w.comboTimer = comboWin(w);
          emit(w, 'stomp', o.x, o.top, o.kind === 'boss' ? 1 : 0);
          continue;
        }
      }
      if (o.kind !== 'gap' && !o.hit && Math.abs(dx) < o.width / 2 + hm) {
        if (o.kind === 'steam' && !steamActive(w, o)) { /* vent is quiet right now */ }
        else if (w.y < o.top - 2 && w.y + bh > o.bottom + 2 && w.y > -45) {
          if (w.invulnerable <= 0) {
            o.hit = true;
            if (w.shield) { w.shield = 0; w.invulnerable = hitInvuln(w); emit(w, 'hit', w.travel, w.y, 0); }
            else if (w.echoT > 0) { w.echoT = 0; w.invulnerable = hitInvuln(w); emit(w, 'hit', w.travel, w.y, 0); emit(w, 'echo'); }
            else { kill(w, C.KINDS[o.kind].cause); if (w.dead) return; }
          }
        }
      }
      if (!o.passed && dx + o.width / 2 < -12) {
        o.passed = true;
        if (!o.hit && o.kind !== 'gap') {
          const close = w.slide > 0 || Math.abs(w.y - o.top) < 28;
          if (close) { const nb = 10 + (w.perk.nearBonus || 0); w.near += nb; w.combo++; w.comboTimer = comboWin(w); emit(w, 'near', nb); }
        }
      }
    }

    const magOn = w.magnet > 0 || w.vortexT > 0;
    const reach = 150 * w.magR * (w.vortexT > 0 ? 2.4 : 1) * (1 + (w.perk.magnetPct || 0) / 400);
    for (let i = 0; i < w.pickups.length; i++) {
      const p = w.pickups[i];
      if (p.taken) continue;
      if (magOn && p.kind === 'coin' && Math.abs(p.x - w.travel) < reach) {
        const f = Math.min(1, DT * 8);
        p.x += (w.travel - p.x) * f; p.y += (w.y + bh * 0.5 - p.y) * f;
      }
      if (Math.abs(p.x - w.travel) < 23 && p.y > w.y - 10 && p.y < w.y + bh + 13) {
        p.taken = true;
        if (p.kind === 'coin') { addCoins(w, 1); w.combo++; w.comboTimer = comboWin(w); emit(w, 'coin', p.x, p.y); }
        else if (p.kind === 'gem') { addCoins(w, 10); w.combo += 3; w.comboTimer = comboWin(w); emit(w, 'gem', p.x, p.y); }
        else if (p.kind === 'star') { w.near += 25; w.combo += 5; w.comboTimer = comboWin(w); emit(w, 'star', p.x, p.y); }
        else if (p.kind === 'bolt') { for (const k in w.cd) w.cd[k] = Math.max(0, w.cd[k] - 8); emit(w, 'bolt', p.x, p.y); }
        else if (p.kind === 'heart') { if (!w.shield) w.shield = 1; else addCoins(w, 5); emit(w, 'heart', p.x, p.y); }
        else {
          const pm = powerMul(w);
          if (p.kind === 'shield') w.shield = 1;
          else if (p.kind === 'magnet') w.magnet = 8 * pm;
          else if (p.kind === 'slow') w.slow = 3 * pm * (1 + (w.perk.slowPct || 0) / 100);
          else if (p.kind === 'double') w.double = 10 * pm;
          emit(w, 'power', p.x, p.y, p.kind);
        }
      }
    }
    // prune
    let n = 0;
    for (let i = 0; i < w.obstacles.length; i++) { const o = w.obstacles[i]; if (o.x + o.width > w.travel - 250) w.obstacles[n++] = o; }
    w.obstacles.length = n;
    n = 0;
    for (let i = 0; i < w.pickups.length; i++) { const p = w.pickups[i]; if (!p.taken && p.x > w.travel - 180) w.pickups[n++] = p; }
    w.pickups.length = n;
    // run xp -> draft
    w.runXP = Math.max(w.runXP, w.dist * 0.5 + w.coins * 3 + w.kills * 15);
    if (!w.cfg.noDraft && !w.cfg.trainer && w.runXP >= w.nextDraft) { w.nextDraft = w.runXP + 520; openDraft(w); }
  }

  // ------------------------------------------------------------------ score
  function coinWeight(cfg) { const u = cfg.upg || {}; return 6 + (u.greed ? 1 : 0) + (u.coinbonus ? 2 : 0); }
  function score(w) { return Math.floor(w.dist) + w.coins * coinWeight(w.cfg) + w.near; }

  // ------------------------------------------------------------------ built-in pilot (scripted heuristic, no learning, no model)
  const defaultGenome = [0.32, 0.30, 0.88, 0.15];
  function decide(w, genes, safety, override) {
    genes = genes || defaultGenome;
    const velocity = Math.max(1, w.velocity);
    let o = null;
    for (let i = 0; i < w.obstacles.length; i++) {
      const c = w.obstacles[i];
      if (!c.hit && c.x + c.width / 2 > w.travel - 12 && (o === null || c.x < o.x)) o = c;
    }
    const APEX = 0.47;
    if (o) {
      const dx = (o.x - o.width / 2 - w.travel - 11) / velocity;
      const end = (o.x + o.width / 2 - w.travel + 12) / velocity;
      const low = C.LOW_KINDS.indexOf(o.kind) >= 0;
      const forced = override && override[o.id] ? override[o.id] : null; // River brain: the action TYPE for this obstacle
      if (forced === 'wait' && o.kind !== 'gap' && o.enemy !== true && !low) {
        // trust the brain only when it cannot be fatal for a non-enemy
      }
      const wantSlide = forced ? forced === 'slide' : low;
      const wantStomp = forced ? forced === 'stomp' : (o.enemy && !low);
      if (wantSlide && low) {
        const lead = clamp(0.24 + genes[1] * 0.26, 0.22, 0.42);
        if (dx < lead && end > -0.45 && w.slide <= 0.14 && w.slideLock <= 0 && w.grounded) return { action: 'SLIDE', power: 0, reason: 'Sliding the ' + o.kind + ' - low coin line.', src: forced ? 'river' : 'pilot' };
        if (!w.grounded && dx < 0.40 && dx > -0.20) return { action: 'WAIT', power: 0, reason: 'Dropping to slide under.' };
      } else if (wantStomp && o.enemy && !low) {
        const stompLead = 0.48 + genes[0] * 0.14;
        if ((w.grounded || w.coyote > 0) && dx < stompLead && dx > 0.1 && end > -0.1) return { action: 'JUMP', power: 0.5, reason: 'Stomp the ' + o.kind + ' - coins on the bounce.', src: forced ? 'river' : 'pilot' };
      } else {
        const lead = clamp(APEX + (genes[0] - 0.32) * 0.16, 0.36, 0.56);
        if ((w.grounded || w.coyote > 0) && dx <= lead && end > 0) return { action: 'JUMP', power: 1, reason: o.kind === 'gap' ? 'Gap - long arc, coins on the way.' : 'Apex on the coin line over the ' + o.kind + '.', src: forced ? 'river' : 'pilot' };
        const doubleThreshold = lerp(-140, 220, genes[2]);
        const jl = jumpLimit(w);
        if (!w.grounded && w.jumps < jl && w.airTime > 0.14 && dx < 0.30 && end > 0 && w.vy < doubleThreshold) {
          if (o.kind === 'gap' || w.y < o.top + 42) return { action: 'DOUBLE_JUMP', power: 1, reason: 'Second arc to reach the coins and land clean.' };
        }
        if (safety && !w.grounded && w.jumps < jl && w.y < 5 && end > 0 && dx < 0) return { action: 'DOUBLE_JUMP', power: 1, reason: 'Edge recovery, one jump left.' };
      }
    }
    if (w.grounded) {
      let lowBarSoon = false;
      for (let i = 0; i < w.obstacles.length; i++) {
        const x = w.obstacles[i];
        if (C.LOW_KINDS.indexOf(x.kind) >= 0 && x.kind !== 'bat' && x.x + x.width / 2 > w.travel - 20 && (x.x - x.width / 2 - w.travel) / velocity < 1.05) { lowBarSoon = true; break; }
      }
      const clearAhead = !lowBarSoon && (!o || (o.x - w.travel) / velocity > 0.85);
      if (clearAhead) {
        for (let i = 0; i < w.pickups.length; i++) {
          const p = w.pickups[i];
          if (p.kind === 'coin' && !p.taken && p.x > w.travel && p.y > 42 && (p.x - w.travel) / velocity < 0.40) return { action: 'JUMP', power: 1, reason: 'Coin arc ahead - taking it.' };
        }
      }
    }
    return { action: 'WAIT', power: 0, reason: 'Clear roof. Saving the next jump.' };
  }
  function applyDecision(w, d) {
    if (!w || w.dead || !d) return;
    const p = Math.round(clamp(d.power, 0, 1) * 4);
    if (d.action === 'JUMP') { if (w.grounded || w.coyote > 0) input(w, OPS.JUMP, p); }
    else if (d.action === 'DOUBLE_JUMP') input(w, OPS.DOUBLE, p);
    else if (d.action === 'SLIDE') input(w, OPS.SLIDE, 0);
  }
  // pilot skill use (same guard-then-value logic as v14, tick based)
  function autoSkills(w) {
    const eq = w.cfg.skills; if (!eq.length) return;
    const has = (k) => eq.indexOf(k) >= 0 && skillReady(w, k);
    const fire = (k) => { input(w, OPS.SKILL, eq.indexOf(k)); return true; };
    const ahead = w.obstacles.filter((o) => !o.hit && o.x - w.travel > -24 && o.x - w.travel < 340).sort((a, b) => a.x - b.x);
    const hz = ahead[0]; const dx = hz ? (hz.x - w.travel) / Math.max(1, w.velocity) : 99;
    if (hz && dx < 0.5) for (const k of ['recall', 'prism', 'ghost', 'blink', 'wall', 'freeze', 'echo']) if (has(k)) return fire(k);
    const mon = ahead.find((o) => o.enemy && !o.dead && o.kind !== 'boss');
    if (mon && has('thunder')) return fire('thunder');
    if (mon && has('quake') && mon.bottom === 0) return fire('quake');
    if (hz && dx < 0.34 && has('bomb')) return fire('bomb');
    let coins = 0; for (const p of w.pickups) if (p.kind === 'coin' && !p.taken && p.x > w.travel && p.x - w.travel < 320) coins++;
    if (coins >= 6 && has('vortex')) return fire('vortex');
    if (coins >= 6 && has('magnetBurst')) return fire('magnetBurst');
    if (coins >= 5 && has('midas')) return fire('midas');
    if (coins >= 5 && has('rain')) return fire('rain');
    if (w.tick - (w.lastAiSkill || -9999) > 720) { for (const k of ['overdrive', 'surge', 'beacon', 'springs']) if (has(k)) { w.lastAiSkill = w.tick; return fire(k); } }
  }

  // compact observation for brains (River / BYO)
  function observe(w, maxObs) {
    const v = Math.max(1, w.velocity); const obs = [];
    const list = w.obstacles.filter((o) => !o.hit && o.x + o.width / 2 > w.travel - 12).sort((a, b) => a.x - b.x).slice(0, maxObs || 4);
    for (const o of list) {
      const low = C.LOW_KINDS.indexOf(o.kind) >= 0;
      obs.push({ id: o.id, kind: o.kind, type: o.kind === 'gap' ? 'gap' : low ? 'low' : o.enemy ? 'monster' : 'block', t: Math.round((o.x - o.width / 2 - w.travel) / v * 100) / 100, w: Math.round(o.width), h: o.top });
    }
    let coinsAhead = 0; for (const p of w.pickups) if (p.kind === 'coin' && !p.taken && p.x > w.travel && p.x - w.travel < 500) coinsAhead++;
    return { v: 1, speed: Math.round(v), state: w.grounded ? (w.slide > 0 ? 'sliding' : 'ground') : 'air', jumpsLeft: jumpLimit(w) - w.jumps, shield: !!w.shield, lives: w.lives, obstacles: obs, coinsAhead, dist: Math.round(w.dist) };
  }

  return { DT, TICK_HZ, OPS, create, step, input, score, coinWeight, zoneAt, steamActive, decide, applyDecision, autoSkills, observe, skillReady, H, mulberry, fillWorld, jumpLimit, bodyH, coinMult, normalize, ARC5, ARC12 };
});
