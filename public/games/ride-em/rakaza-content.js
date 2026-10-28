/* ============================================================================
   RAKAZA CONTENT (v16) - pure data. Loaded by the browser game, the headless
   replay (node) and the docs generator. No DOM, no Math.random, no Date.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RakazaContent = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 'v16';
  const SIM_VERSION = 3; // 3 = strict three hits per run (v17): shields/echo/revives cannot cancel a hit; 2 = v16 hearts; v15 replays are not valid
  const LIVES = 3;

  // Flip to true on the live site when the platform token is live. Until then every
  // "Pay with $RAKAZA" button stays disabled. The game contains no wallet code.
  const CONFIG = { RAKAZA_TOKEN_ENABLED: false, TOKEN_NOTE: 'Pay with $RAKAZA - at launch' };

  // ---------------------------------------------------------------- stages
  // pal: skyTop, skyLow, far, near (building colours), ground, accent, win (window colours), sun
  const STAGES = [
    { id: 'sunset', at: 0, name: 'SUNSET ROOFTOPS', tag: 'warm up', weather: 'none', music: 'sunset', extra: [],
      pal: { skyTop: [83, 45, 96], skyLow: [236, 147, 107], far: '#352c4d', near: '#211c36', ground: '#191b29', edge: '#bc8e99', accent: '#f7c58d', win: ['#f4bd76', '#22d3ee'], sun: '#f7c58d', night: 0 } },
    { id: 'violet', at: 1200, name: 'VIOLET DISTRICT', tag: 'dusk', weather: 'none', music: 'violet', extra: [],
      pal: { skyTop: [36, 25, 73], skyLow: [119, 62, 128], far: '#2f2748', near: '#1d1833', ground: '#171a28', edge: '#9a7fb0', accent: '#d19bff', win: ['#f4bd76', '#22d3ee'], sun: '#e7a6ff', night: 0.3 } },
    { id: 'neon', at: 2400, name: 'NEON CORE', tag: 'night', weather: 'rain', music: 'neon', extra: [],
      pal: { skyTop: [7, 12, 29], skyLow: [24, 28, 57], far: '#241f3d', near: '#171429', ground: '#12141f', edge: '#6a668b', accent: '#22d3ee', win: ['#22d3ee', '#e451bb'], sun: '#cce3ff', night: 1 } },
    { id: 'blackout', at: 3600, name: 'BLACKOUT WARD', tag: 'lights out', weather: 'rain', music: 'blackout', extra: [],
      pal: { skyTop: [3, 5, 12], skyLow: [12, 14, 26], far: '#14122a', near: '#0d0c1b', ground: '#0a0b13', edge: '#4a4a66', accent: '#f43f5e', win: ['#f43f5e', '#3b3b55'], sun: '#8aa0c8', night: 1 } },
    { id: 'aurora', at: 4800, name: 'AURORA SPAN', tag: 'colour storm', weather: 'aurora', music: 'aurora', extra: [],
      pal: { skyTop: [10, 28, 52], skyLow: [26, 82, 98], far: '#1d3b4f', near: '#122836', ground: '#0f1c27', edge: '#5fe3c0', accent: '#5fe3c0', win: ['#5fe3c0', '#a78bfa'], sun: '#bff7e6', night: 1 } },
    { id: 'edge', at: 6000, name: 'THE EDGE', tag: 'no more roof', weather: 'stars', music: 'edge', extra: [],
      pal: { skyTop: [14, 6, 38], skyLow: [66, 22, 92], far: '#2a1a4d', near: '#1a1033', ground: '#120c26', edge: '#c084fc', accent: '#c084fc', win: ['#f0abfc', '#67e8f9'], sun: '#f5d0fe', night: 1 } },
    { id: 'harbor', at: 7200, name: 'CHROME HARBOR', tag: 'wet steel', weather: 'rain', music: 'harbor', extra: ['crate', 'hook'], isNew: true,
      pal: { skyTop: [18, 34, 52], skyLow: [92, 128, 150], far: '#3c5468', near: '#26394a', ground: '#1b2733', edge: '#a9c4d6', accent: '#7dd3fc', win: ['#e0f2fe', '#fcd34d'], sun: '#e0f2fe', night: 0.5 } },
    { id: 'glitch', at: 8400, name: 'GLITCH GRID', tag: 'unstable', weather: 'glitch', music: 'glitch', extra: ['glitch', 'wraith'], isNew: true,
      pal: { skyTop: [4, 14, 10], skyLow: [10, 48, 36], far: '#0f3a2c', near: '#082219', ground: '#06150f', edge: '#34d399', accent: '#4ade80', win: ['#4ade80', '#f0abfc'], sun: '#bbf7d0', night: 1 } },
    { id: 'foundry', at: 9600, name: 'CRIMSON FOUNDRY', tag: 'molten', weather: 'embers', music: 'foundry', extra: ['steam', 'golem'], isNew: true,
      pal: { skyTop: [38, 8, 8], skyLow: [150, 48, 24], far: '#4a1c16', near: '#2e100d', ground: '#1f0b09', edge: '#fb923c', accent: '#fb923c', win: ['#fbbf24', '#ef4444'], sun: '#fdba74', night: 0.7 } },
    { id: 'starfall', at: 10800, name: 'STARFALL BRIDGE', tag: 'meteors', weather: 'meteors', music: 'starfall', extra: ['shard', 'mech'], isNew: true,
      pal: { skyTop: [6, 4, 28], skyLow: [44, 26, 96], far: '#231a55', near: '#150f38', ground: '#0e0a26', edge: '#a5b4fc', accent: '#fde68a', win: ['#fde68a', '#93c5fd'], sun: '#fef3c7', night: 1 } },
    { id: 'frozen', at: 12000, name: 'FROZEN SKYLINE', tag: 'whiteout', weather: 'snow', music: 'frozen', extra: ['icicle', 'slime'], isNew: true,
      pal: { skyTop: [58, 88, 120], skyLow: [196, 226, 246], far: '#8fb0cc', near: '#5f86a8', ground: '#2c4258', edge: '#e0f2fe', accent: '#bae6fd', win: ['#fef9c3', '#7dd3fc'], sun: '#ffffff', night: 0.2 } },
  ];
  const NEW_STAGE_FIRST = 6, NEW_STAGE_COUNT = 5, STAGE_SPAN = 1200;
  function stageIndexAt(dist, theme) {
    if (theme != null && theme >= 0 && theme < STAGES.length) return theme | 0;
    let si = 0;
    for (let i = 0; i < NEW_STAGE_FIRST; i++) if (dist >= STAGES[i].at) si = i;
    if (dist >= STAGES[NEW_STAGE_FIRST].at) si = NEW_STAGE_FIRST + (Math.floor((dist - STAGES[NEW_STAGE_FIRST].at) / STAGE_SPAN) % NEW_STAGE_COUNT);
    return si;
  }

  // ---------------------------------------------------------------- hazards / monsters
  // span (width), top, bottom, enemy (stompable), cause text. Legacy kinds keep v14 geometry.
  const KINDS = {
    vent: { span: 42, top: 36, bottom: 0, cause: 'Clipped a rooftop vent' },
    tank: { span: 48, top: 62, bottom: 0, cause: 'Hit a water tank' },
    sign: { span: 72, top: 92, bottom: 31, cause: 'Caught by a low neon sign' },
    gap: { span: 68, top: 0, bottom: 0, cause: 'Lost to the rooftop gap' },
    dish: { span: 42, top: 49, bottom: 0, cause: 'Hit a satellite dish' },
    ac: { span: 46, top: 40, bottom: 0, cause: 'Hit an AC unit' },
    drone: { span: 48, top: 68, bottom: 30, cause: 'Intercepted by a drone' },
    pigeons: { span: 48, top: 23, bottom: 0, cause: 'Startled the rooftop pigeons' },
    laser: { span: 84, top: 104, bottom: 34, cause: 'Sliced by a laser gate' },
    stack: { span: 54, top: 86, bottom: 0, cause: 'Smashed into a vent stack' },
    critter: { span: 40, top: 30, bottom: 0, enemy: true, cause: 'Bitten by a critter' },
    brute: { span: 52, top: 58, bottom: 0, enemy: true, cause: 'Flattened by a brute' },
    bat: { span: 40, top: 64, bottom: 34, enemy: true, cause: 'Swooped by a bat' },
    // v15 hazards
    crate: { span: 46, top: 50, bottom: 0, cause: 'Crashed into a cargo crate' },
    hook: { span: 60, top: 100, bottom: 34, cause: 'Snagged by a crane hook' },
    glitch: { span: 44, top: 56, bottom: 0, cause: 'Phased into a glitch block' },
    steam: { span: 40, top: 84, bottom: 0, cause: 'Scalded by a steam jet' },
    shard: { span: 36, top: 66, bottom: 0, cause: 'Struck by a falling shard' },
    icicle: { span: 56, top: 104, bottom: 34, cause: 'Speared by an icicle' },
    // v15 monsters
    slime: { span: 36, top: 24, bottom: 0, enemy: true, cause: 'Engulfed by a frost slime' },
    golem: { span: 56, top: 72, bottom: 0, enemy: true, cause: 'Crushed by a golem' },
    wraith: { span: 40, top: 64, bottom: 34, enemy: true, cause: 'Haunted by a wraith' },
    mech: { span: 50, top: 52, bottom: 0, enemy: true, cause: 'Rammed by a patrol mech' },
    // boss pieces
    boss: { span: 96, top: 76, bottom: 0, enemy: true, cause: 'Flattened by the boss' },
  };
  const BASE_POOL = ['vent', 'tank', 'sign', 'gap', 'dish', 'ac', 'drone', 'pigeons', 'critter', 'laser', 'brute', 'stack', 'critter', 'bat', 'critter', 'laser', 'brute', 'stack'];
  const LOW_KINDS = ['sign', 'drone', 'laser', 'bat', 'hook', 'icicle', 'wraith'];

  // ---------------------------------------------------------------- bosses (fair: telegraphed pattern + one stomp to win)
  // pattern: [offset from zone start, kind] ; the body arrives at BODY. Every item is a normal hazard the player can beat.
  const BOSS_SPACING_M = 1500;
  const BOSSES = [
    { id: 'siege', name: 'SIEGE DRONE', color: '#f43f5e', reward: 40, pattern: [[300, 'drone'], [700, 'stack'], [1100, 'laser'], [1500, 'tank']], body: 1950 },
    { id: 'warden', name: 'CHROME WARDEN', color: '#7dd3fc', reward: 50, pattern: [[300, 'crate'], [660, 'hook'], [1020, 'crate'], [1380, 'hook']], body: 1900 },
    { id: 'hydra', name: 'GLITCH HYDRA', color: '#4ade80', reward: 60, pattern: [[300, 'glitch'], [620, 'wraith'], [940, 'glitch'], [1260, 'laser'], [1580, 'glitch']], body: 2050 },
    { id: 'colossus', name: 'FOUNDRY COLOSSUS', color: '#fb923c', reward: 75, pattern: [[300, 'steam'], [700, 'golem'], [1100, 'steam'], [1500, 'stack']], body: 1950 },
  ];
  const BOSS_ZONE_BACK = 700, BOSS_ZONE_LEN = 2300;
  const MINI_BOSS = { id: 'minibot', name: 'BOSS RUN: SCRAP BOT', color: '#fbbf24', reward: 25, pattern: [[300, 'dish'], [700, 'tank'], [1100, 'sign']], body: 1500 };

  // ---------------------------------------------------------------- events (position-based: same for everyone on a seed)
  const EVENTS = {
    coinRush: { name: 'COIN RUSH', sub: 'coins x3', lenM: 150, color: '#fbbf24' },
    meteor: { name: 'METEOR SHOWER', sub: 'dodge the shards', lenM: 190, color: '#fb923c' },
    glitchStorm: { name: 'GLITCH STORM', sub: 'unstable city', lenM: 170, color: '#4ade80' },
    bossRun: { name: 'BOSS RUN', sub: 'a scrap bot blocks the roof', lenM: 200, color: '#f43f5e' },
  };
  const EVENT_FIRST_M = 420, EVENT_EVERY_M = 700;
  const WEEKEND = { name: 'WEEKEND DOUBLE XP', sub: 'Saturday and Sunday (UTC)', xp: 2 };

  // ---------------------------------------------------------------- skills (25)
  // kind picks the sim handler. dur in seconds, cd cooldown, level gate, fx = visual id drawn by rakaza-fx.js
  const SKILLS = {
    ghost: { name: 'GHOST', desc: '2.5s invulnerable', cd: 16, level: 1, icon: '◇', dur: 2.5, fx: 'ghost', color: '#a78bfa' },
    magnetBurst: { name: 'MAGNET', desc: 'pull coins 6s', cd: 20, level: 2, icon: '⋔', dur: 6, fx: 'pulse', color: '#f17bc8' },
    freeze: { name: 'FREEZE', desc: 'slow-mo 3s', cd: 24, level: 3, icon: '◔', dur: 3, fx: 'frost', color: '#93c5fd' },
    surge: { name: 'SURGE', desc: '+30% speed, 2x coins', cd: 30, level: 5, icon: '⚡', dur: 4, fx: 'speed', color: '#fde047' },
    bomb: { name: 'BOMB', desc: 'clear hazards nearby', cd: 26, level: 4, icon: '✸', dur: 0, fx: 'blast', color: '#fb923c' },
    blink: { name: 'BLINK', desc: '2s phase + sprint', cd: 28, level: 6, icon: '⇢', dur: 2, fx: 'speed', color: '#67e8f9' },
    thunder: { name: 'THUNDER', desc: 'zap every monster near', cd: 24, level: 4, icon: '⚡', dur: 0, fx: 'bolt', color: '#fde047' },
    wall: { name: 'AEGIS', desc: 'armor: longer safety after the next hit', cd: 20, level: 5, icon: '⛨', dur: 0, fx: 'shield', color: '#22d3ee' },
    rain: { name: 'COIN RAIN', desc: '12 coins ahead', cd: 25, level: 6, icon: '☂', dur: 0, fx: 'gold', color: '#fbbf24' },
    overdrive: { name: 'OVERDRIVE', desc: '6s fast + 2x coins', cd: 34, level: 8, icon: '➤', dur: 6, fx: 'speed', color: '#f97316' },
    recall: { name: 'RECALL', desc: 'save me: phase 3s', cd: 40, level: 9, icon: '↺', dur: 3, fx: 'ghost', color: '#c4b5fd' },
    dash: { name: 'DASH', desc: 'skip 220 m ahead', cd: 30, level: 7, icon: '»', dur: 1.2, fx: 'speed', color: '#38bdf8' },
    timestop: { name: 'TIME STOP', desc: 'everything crawls 4s', cd: 34, level: 10, icon: '⏸', dur: 4, fx: 'frost', color: '#e0e7ff' },
    lucky: { name: 'LUCKY', desc: '3 power-ups now', cd: 36, level: 12, icon: '✧', dur: 0, fx: 'gold', color: '#fde68a' },
    // ---- v15 (11 new)
    vortex: { name: 'VORTEX', desc: 'huge magnet 4s', cd: 22, level: 3, icon: '◎', dur: 4, fx: 'vortex', color: '#c084fc' },
    prism: { name: 'PRISM', desc: '3s invulnerable + 2x coins', cd: 32, level: 7, icon: '◆', dur: 3, fx: 'prism', color: '#f0abfc' },
    hover: { name: 'HOVER', desc: 'no falling into gaps 4s', cd: 22, level: 2, icon: '⌓', dur: 4, fx: 'hover', color: '#7dd3fc' },
    quake: { name: 'QUAKE', desc: 'stun and stomp ground monsters', cd: 26, level: 5, icon: '≋', dur: 0, fx: 'quake', color: '#d6a35c' },
    midas: { name: 'MIDAS', desc: 'next 12 coins worth x3', cd: 30, level: 9, icon: '✪', dur: 0, fx: 'gold', color: '#facc15' },
    shrink: { name: 'SHRINK', desc: 'smaller body 5s', cd: 24, level: 4, icon: '⌖', dur: 5, fx: 'shrink', color: '#86efac' },
    springs: { name: 'SPRINGS', desc: 'triple jump 6s', cd: 28, level: 6, icon: '⇡', dur: 6, fx: 'springs', color: '#34d399' },
    harvest: { name: 'HARVEST', desc: 'turn hazards into coins', cd: 36, level: 11, icon: '❂', dur: 0, fx: 'harvest', color: '#a3e635' },
    echo: { name: 'ECHO', desc: 'armor for 8s: longer safety after a hit', cd: 32, level: 8, icon: '≈', dur: 8, fx: 'echo', color: '#60a5fa' },
    meteorSk: { name: 'METEOR', desc: 'smash hazards ahead', cd: 38, level: 13, icon: '☄', dur: 0, fx: 'meteor', color: '#f97316' },
    beacon: { name: 'BEACON', desc: '+20 combo, gold magnet 3s', cd: 30, level: 10, icon: '✦', dur: 3, fx: 'beacon', color: '#fef08a' },
  };
  // fairness: cap how many skills a ranked run may bring
  const RANKED = { maxSkills: 3, maxSkillsWithSlot: 4, allowUpgrades: false, allowBoosts: false, allowPassives: true, passiveCapPct: 10 };

  // ---------------------------------------------------------------- run upgrades (draft cards)
  const DRAFTS = [
    { id: 'shield', name: 'Shield Up', desc: 'longer safety after your next hit' },
    { id: 'magnet', name: 'Long Magnet', desc: 'magnet for 8s' },
    { id: 'slowmo', name: 'Time Dilation', desc: 'slow-mo 3s' },
    { id: 'coins', name: 'Coin Fever', desc: 'x2 coins 15s' },
    { id: 'ghost', name: 'Phase', desc: 'invulnerable 4s' },
  ];
  const DRAFT_PRIO = ['shield', 'ghost', 'coins', 'magnet', 'slowmo'];

  // ---------------------------------------------------------------- modes / campaign
  const MODES = {
    classic: { name: 'CLASSIC', desc: 'The city as designed. Three hearts: the third hit ends the run.', speedMul: 1, coinMul: 1, ghost: false, icon: '▶' },
    rush: { name: 'RUSH', desc: 'Faster from the first step, coins worth double.', speedMul: 1.28, coinMul: 2, ghost: false, icon: '»' },
    zen: { name: 'ZEN', desc: 'You cannot die. Chase coins and clean lines. Practice only: not on the leaderboard.', unranked: true, speedMul: 0.95, coinMul: 1, ghost: true, icon: '☯' },
    hardcore: { name: 'HARDCORE', desc: 'Double speed, no shield, triple coins.', speedMul: 1.6, coinMul: 3, ghost: false, icon: '☠' },
    campaign: { name: 'CAMPAIGN', desc: '7 stages that auto-advance: EASY to NIGHTMARE.', speedMul: 0.9, coinMul: 1, ghost: false, icon: '☰', campaign: true },
    survival: { name: 'SURVIVAL', desc: 'Speed keeps climbing, coins worth 1.5x.', speedMul: 1.12, coinMul: 1.5, ghost: false, icon: '⏱', survival: true },
  };
  const LADDER = [
    { name: 'EASY', goal: 400, speedMul: 0.85, coinMul: 1 },
    { name: 'NORMAL', goal: 600, speedMul: 1.0, coinMul: 1.2 },
    { name: 'HARD', goal: 800, speedMul: 1.15, coinMul: 1.4 },
    { name: 'EXPERT', goal: 1000, speedMul: 1.3, coinMul: 1.6 },
    { name: 'MASTER', goal: 1200, speedMul: 1.45, coinMul: 1.8 },
    { name: 'LEGEND', goal: 1500, speedMul: 1.6, coinMul: 2.2 },
    { name: 'NIGHTMARE', goal: 1800, speedMul: 1.8, coinMul: 3 },
  ];

  // ---------------------------------------------------------------- persistent upgrades (v14, unchanged numbers)
  const UPG = {
    shield: { name: 'Starting Shield', desc: 'Begin every run with armor: longer safety after your first hit.', cost: 300, icon: '◈' },
    magnet: { name: 'Magnet Start', desc: 'Spawn with the coin magnet active for 4s.', cost: 250, icon: '⋔' },
    slow: { name: 'Slow Start', desc: 'Spawn in slow motion for 2s.', cost: 250, icon: '◔' },
    head: { name: 'Head Start', desc: 'Begin 240 m up the skyline.', cost: 400, icon: '⇈' },
    revive: { name: 'Second Wind', desc: 'Retired: three hits end every run (no revives).', cost: 700, icon: '↺' },
    greed: { name: 'Coin Weight', desc: '+1 point per coin on the leaderboard score.', cost: 550, icon: '◉' },
    slot: { name: 'Extra Slot', desc: 'Equip a 4th skill instead of 3.', cost: 900, icon: '⬒' },
    cd: { name: 'Overclock', desc: 'All skill cooldowns 20% shorter.', cost: 650, icon: '⏱' },
    magnetR: { name: 'Wide Magnet', desc: 'Magnet reach +60%.', cost: 450, icon: '◎' },
    xp: { name: 'Fast Learner', desc: '+25% XP from every run.', cost: 500, icon: '▲' },
    lifeline: { name: 'Lifeline', desc: 'Retired: three hits end every run (no revives).', cost: 800, icon: '✚' },
    skillplus: { name: 'Skill Power', desc: 'Every skill lasts 25% longer.', cost: 700, icon: '✦' },
    coinbonus: { name: 'Coin Bonus', desc: '+2 points per coin on the board.', cost: 750, icon: '◇' },
    cushion: { name: 'Cushion', desc: 'Take one hit per run without dying.', cost: 950, icon: '⛨' },
    headstart2: { name: 'Big Head Start', desc: 'Begin 600 m in instead of 240 m.', cost: 1100, icon: '⇈' },
  };

  // ---------------------------------------------------------------- characters (15) with small, fair passives
  // perk keys are read by the sim and clamped by validateConfig (each <= passiveCapPct). cosmetic fields go to rakaza-char.js
  const CHARACTERS = [
    { id: 'cat', name: 'Neon Cat', blurb: 'The original runner. Pure style.', price: 0, rarity: 'common', perk: null, perkText: 'No perk - the classic.', legacy: true },
    { id: 'courier', name: 'Neon Courier', blurb: 'Pink-violet twin-tails, cyan visor, delivery-run jacket.', price: 0, rarity: 'common', perk: null, perkText: 'No perk - the default.', outfit: 0 },
    { id: 'sunset', name: 'Sunset Rider', blurb: 'Hot coral to magenta hair, gold visor, golden-hour trim.', price: 500, rarity: 'common', perk: { coinPct: 4 }, perkText: '+4% coin value', outfit: 1 },
    { id: 'ghost', name: 'Midnight Ghost', blurb: 'Pale-violet hair, red visor, black-out stealth kit.', price: 800, rarity: 'uncommon', perk: { hitInvulnPct: 10 }, perkText: '+10% invulnerability after a hit', outfit: 2 },
    { id: 'ember', name: 'Ember Oni', blurb: 'Molten red hair, curved horns, ember trim.', price: 1200, rarity: 'uncommon', perk: { stompCoins: 1 }, perkText: '+1 coin per stomp', outfit: 3 },
    { id: 'frost', name: 'Frost Warden', blurb: 'Ice-blue braids and a crystal crown.', price: 1200, rarity: 'uncommon', perk: { slowPct: 8 }, perkText: 'Slow-mo lasts 8% longer', outfit: 4 },
    { id: 'volt', name: 'Volt Runner', blurb: 'Static yellow hair, antenna ears, storm jacket.', price: 1400, rarity: 'rare', perk: { comboPct: 10 }, perkText: 'Combo timer +10%', outfit: 5 },
    { id: 'verdant', name: 'Verdant Scout', blurb: 'Mint hair, leaf ears, moss-green kit.', price: 1400, rarity: 'rare', perk: { magnetPct: 8 }, perkText: 'Magnet lasts 8% longer', outfit: 6 },
    { id: 'solar', name: 'Solar Priestess', blurb: 'Gold hair and a floating halo.', price: 1800, rarity: 'rare', perk: { coinPct: 5 }, perkText: '+5% coin value', outfit: 7 },
    { id: 'void', name: 'Void Cape', blurb: 'Black hair, violet visor and a long drifting cape.', price: 2200, rarity: 'epic', perk: { cdPct: 5 }, perkText: 'Skill cooldowns 5% shorter', outfit: 8 },
    { id: 'candy', name: 'Candy Pop', blurb: 'Pink-mint pigtails, cat ears and a big bow.', price: 1000, rarity: 'uncommon', perk: { nearBonus: 2 }, perkText: 'Near miss +2 points', outfit: 9 },
    { id: 'chrome', name: 'Chrome Pilot', blurb: 'Silver bob with flight goggles.', price: 1600, rarity: 'rare', perk: { slidePct: 8 }, perkText: 'Slides last 8% longer', outfit: 10 },
    { id: 'samurai', name: 'Crimson Ronin', blurb: 'Dark hair, crimson headband, steel visor.', price: 1900, rarity: 'rare', perk: { powerPct: 8 }, perkText: 'Power-ups last 8% longer', outfit: 11 },
    { id: 'pixel', name: 'Pixel Prime', blurb: 'Rainbow hair and a pixel crown.', price: 2400, rarity: 'epic', perk: { coinPct: 6 }, perkText: '+6% coin value', outfit: 12 },
    { id: 'angel', name: 'Starlight Seraph', blurb: 'Pearl hair, glowing wings.', price: 3000, rarity: 'legendary', perk: { hitInvulnPct: 10, coinPct: 3 }, perkText: '+10% post-hit invuln, +3% coins', outfit: 13 },
  ];

  // ---------------------------------------------------------------- effects (cosmetic only)
  // p: particle spec used by rakaza-fx.js. shape: dot|star|ring|square|bolt|petal|spark. rate = particles/second (trail/aura)
  const EFFECTS = {
    trail: [
      { id: 'none', name: 'Plain Echo', price: 0, rarity: 'common', p: null },
      { id: 'neon', name: 'Neon Ribbon', price: 300, rarity: 'common', p: { shape: 'ribbon', colors: ['#22d3ee', '#e451bb'], rate: 90, life: 0.45, size: 3, vy: 0 } },
      { id: 'ember', name: 'Ember Trail', price: 450, rarity: 'uncommon', p: { shape: 'dot', colors: ['#fb923c', '#fbbf24', '#ef4444'], rate: 70, life: 0.6, size: 2.6, vy: 40, grav: -60 } },
      { id: 'stardust', name: 'Stardust', price: 600, rarity: 'uncommon', p: { shape: 'star', colors: ['#fde68a', '#ffffff', '#a5b4fc'], rate: 50, life: 0.8, size: 3.4, vy: 10 } },
      { id: 'sakura', name: 'Sakura Drift', price: 750, rarity: 'rare', p: { shape: 'petal', colors: ['#fbcfe8', '#f9a8d4', '#ffffff'], rate: 40, life: 1.0, size: 3.6, vy: -20, grav: 30 } },
      { id: 'pixel', name: 'Pixel Bits', price: 900, rarity: 'rare', p: { shape: 'square', colors: ['#4ade80', '#22d3ee', '#f0abfc', '#fde047'], rate: 60, life: 0.5, size: 3, vy: 0 } },
      { id: 'lightning', name: 'Lightning Wake', price: 1300, rarity: 'epic', p: { shape: 'bolt', colors: ['#fde047', '#ffffff'], rate: 30, life: 0.25, size: 5, vy: 0 } },
    ],
    aura: [
      { id: 'none', name: 'No Aura', price: 0, rarity: 'common', p: null },
      { id: 'halo', name: 'Halo Ring', price: 500, rarity: 'uncommon', p: { shape: 'ring', colors: ['#fde68a'], r: 30, rate: 0 } },
      { id: 'flame', name: 'Flame Aura', price: 900, rarity: 'rare', p: { shape: 'dot', colors: ['#f97316', '#fbbf24', '#ef4444'], r: 22, rate: 55, life: 0.55, size: 3, vy: 70, grav: -90 } },
      { id: 'frost', name: 'Frost Aura', price: 900, rarity: 'rare', p: { shape: 'star', colors: ['#e0f2fe', '#7dd3fc'], r: 24, rate: 28, life: 0.9, size: 3, vy: -10, grav: 20 } },
      { id: 'volt', name: 'Volt Aura', price: 1200, rarity: 'epic', p: { shape: 'bolt', colors: ['#fde047', '#67e8f9'], r: 26, rate: 16, life: 0.2, size: 6, vy: 0 } },
      { id: 'void', name: 'Void Aura', price: 1500, rarity: 'epic', p: { shape: 'ring', colors: ['#7c3aed', '#c084fc'], r: 34, rate: 0, dark: true } },
    ],
    hit: [
      { id: 'none', name: 'Standard Hit', price: 0, rarity: 'common', p: null },
      { id: 'shatter', name: 'Shatter', price: 400, rarity: 'uncommon', p: { shape: 'square', colors: ['#e0f2fe', '#7dd3fc', '#ffffff'], n: 34, speed: 260, life: 0.7, size: 3.4 } },
      { id: 'glitch', name: 'Glitch Burst', price: 650, rarity: 'rare', p: { shape: 'square', colors: ['#4ade80', '#f0abfc', '#22d3ee'], n: 30, speed: 300, life: 0.5, size: 4, flicker: true } },
      { id: 'shock', name: 'Shockwave', price: 900, rarity: 'rare', p: { shape: 'ring', colors: ['#f43f5e', '#fde047'], n: 3, speed: 520, life: 0.45, size: 6 } },
    ],
    death: [
      { id: 'none', name: 'Standard Burst', price: 0, rarity: 'common', p: null },
      { id: 'supernova', name: 'Supernova', price: 700, rarity: 'rare', p: { shape: 'star', colors: ['#fde68a', '#ffffff', '#fb923c'], n: 70, speed: 380, life: 1.2, size: 4 } },
      { id: 'confetti', name: 'Confetti Pop', price: 600, rarity: 'uncommon', p: { shape: 'square', colors: ['#f472b6', '#60a5fa', '#facc15', '#4ade80'], n: 80, speed: 330, life: 1.4, size: 3.4, grav: 300 } },
      { id: 'ghostrise', name: 'Ghost Rise', price: 1100, rarity: 'epic', p: { shape: 'dot', colors: ['#e0e7ff', '#a78bfa'], n: 40, speed: 90, life: 1.6, size: 4, up: true } },
    ],
    coin: [
      { id: 'none', name: 'Plain Pickup', price: 0, rarity: 'common', p: null },
      { id: 'sparkle', name: 'Sparkle Coins', price: 350, rarity: 'common', p: { shape: 'star', colors: ['#fde68a', '#ffffff'], n: 7, speed: 120, life: 0.5, size: 3 } },
      { id: 'ringpulse', name: 'Ring Pulse', price: 500, rarity: 'uncommon', p: { shape: 'ring', colors: ['#fbbf24'], n: 1, speed: 160, life: 0.35, size: 4 } },
      { id: 'hearts', name: 'Heart Coins', price: 800, rarity: 'rare', p: { shape: 'heart', colors: ['#fb7185', '#f472b6'], n: 5, speed: 90, life: 0.8, size: 4 } },
    ],
  };

  // ---------------------------------------------------------------- boosts (consumed at run start; off in ranked / daily)
  const BOOSTS = [
    { id: 'shield', name: 'Shield Charge', desc: 'Start the next run with a shield.', price: 60, icon: '⛨' },
    { id: 'magnet', name: 'Magnet Charge', desc: 'Start with the magnet for 6s.', price: 50, icon: '⋔' },
    { id: 'double', name: 'Double Coins', desc: 'Start with 2x coins for 10s.', price: 80, icon: '◉' },
    { id: 'head', name: 'Sprint Start', desc: 'Begin 120 m up the skyline.', price: 90, icon: '⇈' },
    { id: 'xp', name: 'XP Tonic', desc: '+50% XP for the next run.', price: 70, icon: '▲' },
  ];

  // ---------------------------------------------------------------- shop assembly
  const RARITY_COLORS = { common: '#9ca3af', uncommon: '#34d399', rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24' };
  const tokenFor = (price) => Math.max(1, Math.round(price / 4)); // placeholder price in $RAKAZA; final numbers set at launch
  function buildItems() {
    const items = [];
    CHARACTERS.forEach((c) => items.push({ id: 'char:' + c.id, cat: 'characters', ref: c.id, name: c.name, desc: c.blurb, perkText: c.perkText, price: c.price, rarity: c.rarity, tokenPrice: tokenFor(c.price), cosmetic: true }));
    Object.keys(SKILLS).forEach((k) => items.push({ id: 'skill:' + k, cat: 'skills', ref: k, name: SKILLS[k].name, desc: SKILLS[k].desc + ' · ' + SKILLS[k].cd + 's cooldown', price: SKILLS[k].level >= 12 ? 1400 : SKILLS[k].level * 90 + 60, rarity: SKILLS[k].level >= 10 ? 'epic' : SKILLS[k].level >= 6 ? 'rare' : SKILLS[k].level >= 3 ? 'uncommon' : 'common', levelGate: SKILLS[k].level, tokenPrice: tokenFor(SKILLS[k].level * 90 + 60), cosmetic: false }));
    [['trail', 'trails'], ['aura', 'auras'], ['hit', 'effects'], ['death', 'effects'], ['coin', 'effects']].forEach(([slot, cat]) => {
      EFFECTS[slot].forEach((e) => items.push({ id: slot + ':' + e.id, cat, slot, ref: e.id, name: e.name, desc: slot.toUpperCase() + ' effect', price: e.price, rarity: e.rarity, tokenPrice: tokenFor(e.price), cosmetic: true }));
    });
    STAGES.forEach((s, i) => items.push({ id: 'stage:' + s.id, cat: 'stages', ref: s.id, idx: i, name: s.name, desc: 'Theme: start any run in this district (' + s.tag + '). Weather: ' + s.weather + '.', price: i < 3 ? 0 : s.isNew ? 1500 + (i - NEW_STAGE_FIRST) * 150 : 400 + (i - 3) * 150, rarity: s.isNew ? 'epic' : 'uncommon', tokenPrice: tokenFor(i < 3 ? 0 : 400 + i * 120), cosmetic: true }));
    Object.keys(UPG).forEach((k) => items.push({ id: 'upg:' + k, cat: 'upgrades', ref: k, name: UPG[k].name, desc: UPG[k].desc, price: UPG[k].cost, rarity: UPG[k].cost >= 900 ? 'epic' : UPG[k].cost >= 600 ? 'rare' : 'uncommon', tokenPrice: tokenFor(UPG[k].cost), cosmetic: false }));
    BOOSTS.forEach((b) => items.push({ id: 'boost:' + b.id, cat: 'boosts', ref: b.id, name: b.name, desc: b.desc, price: b.price, rarity: 'common', consumable: true, tokenPrice: tokenFor(b.price), cosmetic: false }));
    return items.map((it) => Object.assign({ tokenCurrency: 'RAKAZA' }, it));
  }
  const ITEMS = buildItems();
  const ITEM_BY_ID = {};
  ITEMS.forEach((it) => { ITEM_BY_ID[it.id] = it; });
  // items that start owned
  const FREE_IDS = ITEMS.filter((it) => it.price === 0 && it.cat !== 'boosts').map((it) => it.id);
  // default unlocked skills follow the v14 level gates (level unlock) AND the shop (skills category). Free = level <= 3 skills.
  const DEFAULT_SKILL_OWNED = Object.keys(SKILLS).filter((k) => SKILLS[k].level <= 3);
  DEFAULT_SKILL_OWNED.forEach((k) => { if (FREE_IDS.indexOf('skill:' + k) < 0) FREE_IDS.push('skill:' + k); });

  // seeded daily drop: pure function of the UTC day string
  function dayHash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    let n = seed >>> 0;
    return function () {
      n += 0x6D2B79F5; let t = n;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const DROP_POOL = ITEMS.filter((it) => it.cosmetic && it.price > 0);
  function dailyDrop(day) {
    const r = rng(dayHash('rakaza-drop:' + day));
    const pool = DROP_POOL.slice();
    const pick = (n) => { const out = []; for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]); return out; };
    // the free drop is always a cheaper item so everybody can win one; the drop shop rotates 6 limited items at a discount
    const cheap = pool.filter((it) => it.price <= 900);
    const free = cheap[Math.floor(r() * cheap.length)];
    pool.splice(pool.indexOf(free), 1);
    const shop = pick(6).map((it, i) => ({ id: it.id, price: Math.max(1, Math.round(it.price * (0.55 + (i % 3) * 0.1))), stock: it.rarity === 'legendary' || it.rarity === 'epic' ? 1 : 3 }));
    return { day, free: free.id, shop };
  }
  // UTC weekend check from a day string 'YYYY-MM-DD'
  function isWeekend(day) { const d = new Date(day + 'T00:00:00Z').getUTCDay(); return d === 0 || d === 6; }

  return { VERSION, SIM_VERSION, LIVES, CONFIG, STAGES, NEW_STAGE_FIRST, NEW_STAGE_COUNT, STAGE_SPAN, stageIndexAt, KINDS, BASE_POOL, LOW_KINDS,
    BOSSES, BOSS_SPACING_M, BOSS_ZONE_BACK, BOSS_ZONE_LEN, MINI_BOSS, EVENTS, EVENT_FIRST_M, EVENT_EVERY_M, WEEKEND, SKILLS, RANKED,
    DRAFTS, DRAFT_PRIO, MODES, LADDER, UPG, CHARACTERS, EFFECTS, BOOSTS, ITEMS, ITEM_BY_ID, FREE_IDS, RARITY_COLORS, DEFAULT_SKILL_OWNED,
    dailyDrop, dayHash, rng, isWeekend };
});
