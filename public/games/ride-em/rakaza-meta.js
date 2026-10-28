/* ============================================================================
   RAKAZA META v15 - UI + progression around the pure simulation (rakaza-sim.js).
   Shop (10 categories + drop shop), skills loadout, missions, modes, board,
   settings (brain + dev panel), draft overlay, skills rail, banners.
   The simulation owns physics, bosses, events, drafts and the ladder; this file
   only builds the run config, reacts to sim events and banks the rewards.
   No wallet code, no payments: every item has a $RAKAZA price that stays locked
   behind RakazaContent.CONFIG.RAKAZA_TOKEN_ENABLED.
   ========================================================================== */
(() => {
  'use strict';
  const RC = window.RakazaContent;
  const Sim = window.RakazaSim;
  const Replay = window.RakazaReplay;
  const API = window.RakazaAPI;
  const Prefs = window.RakazaPrefs;
  const VERSION = RC.VERSION || 'v15';
  const QS = new URLSearchParams(location.search);
  const DEV = QS.get('dev') === '1';
  const KEY = DEV ? 'rz_meta_v5_dev' : 'rz_meta_v5';
  const HK = () => (window.RakazaHooks = window.RakazaHooks || {});
  const sfx = (k) => { try { window.RakazaAudio && window.RakazaAudio.sfx(k); window.RakazaFeel && window.RakazaFeel.vib(k); } catch (e) {} };
  const $m = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const today = () => new Date().toISOString().slice(0, 10);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  // ---------------------------------------------------------------- content
  const UPG = RC.UPG, SKILLS = RC.SKILLS, STAGES = RC.STAGES, MODES = RC.MODES, LADDER = RC.LADDER, ITEMS = RC.ITEMS, BY_ID = RC.ITEM_BY_ID;
  const DEV_COINS = 9999000;
    const MODE_CH = {
    classic: { label: 'Classic · run 1200 m', goal: 1200, stat: 'dist' },
    rush: { label: 'Rush · run 800 m', goal: 800, stat: 'dist' },
    zen: { label: 'Zen · run 1500 m', goal: 1500, stat: 'dist' },
    hardcore: { label: 'Hardcore · run 500 m', goal: 500, stat: 'dist' },
    campaign: { label: 'Campaign · clear stage 3', goal: 3, stat: 'stage' },
    survival: { label: 'Survival · run 1000 m', goal: 1000, stat: 'dist' },
  };
    const MISSIONS = [
    { id: 'dist800', label: 'Run 800 m in one go', goal: 800, reward: 40 },
    { id: 'coins150', label: 'Collect 150 coins', goal: 150, reward: 35 },
    { id: 'skills3', label: 'Fire 3 skills', goal: 3, reward: 30 },
    { id: 'runs3', label: 'Finish 3 runs', goal: 3, reward: 25 },
    { id: 'kills15', label: 'Stomp 15 monsters', goal: 15, reward: 45 },
    { id: 'stages2', label: 'Reach stage 2', goal: 2, reward: 30 },
  ];
  const ACHS = [
    { id: 'first', name: 'First Steps', desc: 'Finish a run', icon: '①' },
    { id: 'k1', name: 'Skyline', desc: '1000 m in one run', icon: '⌂' },
    { id: 'k3', name: 'High Rise', desc: '3000 m in one run', icon: '⌸' },
    { id: 'c1k', name: 'Coin Vault', desc: '1000 lifetime coins', icon: '◎' },
    { id: 'lv5', name: 'Climber', desc: 'Reach level 5', icon: '★' },
    { id: 'lv10', name: 'Rooftop Royalty', desc: 'Reach level 10', icon: '✦' },
    { id: 'shop1', name: 'Investor', desc: 'Buy an upgrade', icon: '◈' },
    { id: 'sk5', name: 'Skill Issue', desc: 'Fire 5 skills', icon: '◇' },
    { id: 'zen', name: 'Zen Master', desc: 'Survive 500 m in ZEN', icon: '☯' },
    { id: 'hard', name: 'Hardcore', desc: '300 m in HARDCORE', icon: '☠' },
  ];
  ACHS.push(
    { id: 'boss', name: 'Giant Slayer', desc: 'Stomp a boss', icon: '♛' },
    { id: 'stage7', name: 'Night Shift', desc: 'Reach the 7th district', icon: '☾' },
    { id: 'collector', name: 'Collector', desc: 'Own 15 shop items', icon: '❖' },
  );

  // ---------------------------------------------------------------- model
  const def = () => ({
    v: 5, xp: 0, level: 1, points: 0, owned: {}, upgrades: {},
    equip: { char: 'courier', trail: 'none', aura: 'none', hit: 'none', death: 'none', coin: 'none', stage: 'cycle' },
    loadout: ['ghost', 'magnetBurst', 'freeze'], boostStock: {}, drops: { day: '', free: false, bought: {} }, shopTab: 'characters',
    skillsFired: 0, runs: 0, best: 0, coins: 0, kills: 0, bossKills: 0, bestByMode: {},
    settings: { sound: true, fx: true, shake: true }, ui: { collapsed: false },
    lbName: '', mode: 'classic', modeCh: {}, campaign: { stage: 0, cleared: 0 },
    missions: { date: today(), prog: {}, claimed: {} }, achs: {}, devStart: 0,
  });
  let M;
  let lastSaved = 0;
  function loadModel() {
    let raw = null, legacy = false;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (!raw && !DEV) { for (const k of ['rz_meta_v4', 'rz_meta_v3']) { try { raw = localStorage.getItem(k); } catch (e) {} if (raw) { legacy = true; break; } } }
    let m;
    try { m = Object.assign(def(), JSON.parse(raw || '{}')); } catch (e) { m = def(); }
    m.equip = Object.assign(def().equip, m.equip || {});
    m.drops = Object.assign(def().drops, m.drops || {});
    ['owned', 'upgrades', 'boostStock', 'bestByMode', 'modeCh', 'achs'].forEach((k) => { if (!m[k] || typeof m[k] !== 'object') m[k] = {}; });
    if (!m.settings) m.settings = def().settings;
    if (!m.ui) m.ui = { collapsed: false };
    if (!m.campaign) m.campaign = { stage: 0, cleared: 0 };
    if (!m.missions || m.missions.date !== today()) m.missions = { date: today(), prog: {}, claimed: {} };
    if (legacy) {
      // v14 -> v15: upgrades become owned items; skills the player had unlocked by level stay unlocked
      Object.keys(m.upgrades || {}).forEach((k) => { if (m.upgrades[k]) m.owned['upg:' + k] = 1; });
      Object.keys(SKILLS).forEach((k) => { if (SKILLS[k].level <= m.level && !SKILLS[k].isNew) m.owned['skill:' + k] = 1; });
      const eq = Array.isArray(m.equipped) ? m.equipped.filter((k) => SKILLS[k]) : [];
      if (eq.length) m.loadout = eq;
    }
    if (!Array.isArray(m.loadout) || !m.loadout.length) m.loadout = def().loadout;
    m.loadout = m.loadout.filter((k) => SKILLS[k]);
    if (DEV && m.points < DEV_COINS) m.points = DEV_COINS;
    return m;
  }
  M = loadModel();
  const uid = (() => {
    try {
      let u = localStorage.getItem('rz_uid');
      if (!u) { u = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('rz_uid', u); }
      return u;
    } catch (e) { return 'anon'; }
  })();
  let pushTimer = null;
  const pushProfile = () => {
    if (DEV) return; // dev profile never leaves the browser
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      API.saveProfile(uid, M).then((d) => {
        if (!d) return;
        const el = $m('#rmSaved', panel);
        if (el) el.textContent = (d.local ? 'saved on this device · ' : 'synced · ') + new Date(d.savedAt * 1000).toLocaleTimeString();
      }).catch(() => {});
    }, 1200);
  };
  const save = () => {
    syncLegacy();
    try { localStorage.setItem(KEY, JSON.stringify(M)); lastSaved = Date.now(); } catch (e) {}
    pushProfile();
  };
  const needFor = (lvl) => Math.round(120 * Math.pow(lvl, 1.35));
  const addXP = (n) => { M.xp += n; let up = 0; while (M.xp >= needFor(M.level)) { M.xp -= needFor(M.level); M.level++; up++; } return up; };
  // M.upgrades is the legacy map other modules (extras) read; it is derived from owned items
  function syncLegacy() { const u = {}; Object.keys(UPG).forEach((k) => { if (owns('upg:' + k)) u[k] = 1; }); M.upgrades = u; }
  const isDev = () => DEV;
  const FREE = new Set(RC.FREE_IDS);
  function owns(id) { return DEV || FREE.has(id) || !!M.owned[id]; }
  const ownedCount = () => ITEMS.filter((it) => M.owned[it.id] && !FREE.has(it.id)).length;

    // ---------------------------------------------------------------- styles
  const css = document.createElement('style');
  css.textContent = `
  :root{--rm-gold:#d9b26a;--rm-ink:#eef0f3;--rm-dim:#8b8f96;--rm-line:#ffffff14}
  #rmTop{position:fixed;left:0;right:0;top:0;z-index:80;display:flex;align-items:center;gap:8px;flex-wrap:wrap;
    padding:calc(6px + env(safe-area-inset-top)) 10px 6px;background:linear-gradient(180deg,#050608f7,#08090be8);
    border-bottom:1px solid var(--rm-line);backdrop-filter:blur(12px);
    font:600 11px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.07em;transition:transform .22s ease}
  #rmTop.hidden{transform:translateY(-110%)}
  #rmBrand{color:var(--rm-gold);display:flex;align-items:center;gap:6px;padding-right:6px;border-right:1px solid var(--rm-line)}
  #rmBrand b{color:#fff}
  #rmTabs{display:flex;flex-wrap:wrap;gap:5px;flex:1;align-items:center}

  #rmTabs button{all:unset;cursor:pointer;padding:7px 10px;border-radius:8px;color:#aeb4bd;border:1px solid transparent;
    white-space:nowrap;text-transform:uppercase}
  #rmTabs button:hover{color:#fff;background:#ffffff0d}
  #rmTabs button.on{color:#17130a;background:linear-gradient(180deg,#f0cf8f,#d9b26a);border-color:#00000033}
  #rmStat{display:flex;align-items:center;gap:9px;color:var(--rm-dim);font-size:10px}
  #rmStat .lv{color:var(--rm-gold)}
  #rmStat .bar{width:56px;height:4px;border-radius:99px;background:#ffffff18;overflow:hidden}
  #rmStat .fill{height:100%;width:0;background:linear-gradient(90deg,#a855f7,#d9b26a);transition:width .3s}
  #rmAll{display:none;all:unset;cursor:pointer;padding:7px 10px;border-radius:8px;border:1px solid var(--rm-line);color:#aeb4bd}
  #rmHide{all:unset;cursor:pointer;padding:6px 9px;border-radius:8px;border:1px solid var(--rm-line);color:#aeb4bd}
  #rmShow{position:fixed;top:8px;left:10px;z-index:80;display:none;cursor:pointer;padding:8px 11px;border-radius:10px;
    background:#08090be0;border:1px solid var(--rm-line);color:var(--rm-gold);
    font:700 10px/1 ui-sans-serif;letter-spacing:.1em;backdrop-filter:blur(8px)}
  #rmShow.on{display:block}
  .rmPanel{position:fixed;inset:0;z-index:70;display:none;place-items:center;padding:64px 18px 18px;
    background:radial-gradient(120% 90% at 50% 0%,#0b0d10f5,#050608e0 60%,#050608fa);backdrop-filter:blur(6px);
    font:14px/1.5 ui-sans-serif,system-ui,sans-serif;color:var(--rm-ink)}
  .rmPanel.on{display:grid}
  .rmCard{width:min(980px,100%);max-height:calc(100vh - 96px);overflow:auto;background:linear-gradient(180deg,#0e1013,#0b0d10);
    border:1px solid var(--rm-line);border-radius:14px;padding:22px;box-shadow:0 30px 80px #000a;animation:rmIn .18s ease both}
  @keyframes rmIn{from{transform:translateY(8px) scale(.99);opacity:0}to{transform:none;opacity:1}}
  .rmCard h2{margin:0 0 4px;font-size:19px}
  .rmCard .lead{color:var(--rm-dim);font-size:12.5px;margin:0 0 16px}
  .rmGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px}
  .rmItem{background:#12151a;border:1px solid var(--rm-line);border-radius:11px;padding:14px;position:relative;
    transition:transform .12s,border-color .12s}
  .rmItem:hover{transform:translateY(-2px);border-color:#ffffff2e}
  .rmItem .ic{font-size:20px;color:var(--rm-gold)}
  .rmItem h3{margin:6px 0 2px;font-size:13.5px}
  .rmItem p{margin:0 0 10px;color:var(--rm-dim);font-size:11.5px;line-height:1.45}
  .rmItem .buy{all:unset;cursor:pointer;display:block;text-align:center;padding:9px;border-radius:8px;
    background:var(--rm-gold);color:#17130a;font:700 11px/1 ui-sans-serif;letter-spacing:.06em}
  .rmItem .buy.off{background:#1b2029;color:#6b7280;cursor:not-allowed}
  .rmItem.owned{border-color:#34d39955}
  .rmItem.sel{border-color:var(--rm-gold);box-shadow:0 0 0 1px #d9b26a55 inset}
  .rmItem .tag{position:absolute;top:11px;right:11px;font-size:9px;letter-spacing:.1em;color:var(--rm-dim);text-transform:uppercase}
  .rmItem .prog{height:4px;border-radius:99px;background:#ffffff14;overflow:hidden;margin:0 0 9px}
  .rmItem .prog i{display:block;height:100%;background:linear-gradient(90deg,#a855f7,#d9b26a)}
  .rmTable{width:100%;border-collapse:collapse;font:12.5px ui-sans-serif;font-variant-numeric:tabular-nums}
  .rmTable th{text-align:left;padding:6px;font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--rm-dim);
    border-bottom:1px solid #ffffff10}
  .rmTable td{padding:7px 6px;border-bottom:1px solid #ffffff08}
  .rmRow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #ffffff08}
  .rmSw{width:46px;height:26px;border-radius:99px;background:#1b2029;border:1px solid var(--rm-line);position:relative;cursor:pointer;flex:0 0 auto}
  .rmSw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:99px;background:#6b7280;transition:.16s}
  .rmSw.on{background:#d9b26a44;border-color:#d9b26a88}
  .rmSw.on::after{left:23px;background:var(--rm-gold)}
  #rmSkills{position:fixed;right:12px;bottom:14px;z-index:59;display:none;flex-direction:column;gap:8px}
  #rmSkills.on{display:flex}
  #rmSkills button{all:unset;cursor:pointer;width:78px;padding:8px 6px;border-radius:11px;text-align:center;
    background:#0b0d10dd;border:1px solid #ffffff1f;color:var(--rm-ink);font:700 10px/1.3 ui-sans-serif;letter-spacing:.06em;
    backdrop-filter:blur(8px)}
  #rmSkills button small{display:block;color:var(--rm-dim);font-weight:500;font-size:9px;margin-top:2px}
  #rmSkills button.cool{opacity:.42}
  #rmToast{position:fixed;left:50%;top:76px;transform:translateX(-50%);z-index:85;display:flex;flex-direction:column;
    gap:8px;align-items:center;pointer-events:none;font:600 13px/1.4 ui-sans-serif,system-ui,sans-serif}
  .rmT{background:#0b0d10e6;border:1px solid #d9b26a66;color:#f4e3bd;padding:9px 16px;border-radius:99px;
    animation:rmPop .28s cubic-bezier(.2,1.5,.4,1) both;box-shadow:0 10px 30px #0008}
  @keyframes rmPop{from{transform:translateY(-10px) scale(.92);opacity:0}to{transform:none;opacity:1}}
  #rmFx{position:fixed;inset:0;z-index:54;pointer-events:none}
  #rmEvent{position:fixed;left:50%;top:15%;transform:translate(-50%,0);z-index:58;pointer-events:none;
    font:800 24px/1 ui-sans-serif,system-ui;letter-spacing:.14em;color:#ffd88a;text-shadow:0 0 24px #f0a35e88;
    opacity:0;transition:opacity .25s,transform .25s}
  #rmEvent.on{opacity:1;transform:translate(-50%,-6px)}
  #rmDock{position:fixed;left:0;right:0;bottom:0;z-index:79;display:none;gap:4px;justify-content:space-around;
    padding:6px 6px calc(6px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#08090bdd,#050608f7);
    border-top:1px solid var(--rm-line);backdrop-filter:blur(12px);font:700 10px/1 ui-sans-serif;letter-spacing:.06em}
  #rmDock button{all:unset;cursor:pointer;padding:9px 8px;border-radius:9px;color:#aeb4bd;text-transform:uppercase}
  #rmDock button.on{color:#17130a;background:linear-gradient(180deg,#f0cf8f,#d9b26a)}
  @media (max-width:820px){
    #rmTop{padding:4px 6px;gap:4px;row-gap:2px}
    #rmBrand b{display:none}
    #rmBrand{padding-right:2px;font-size:10px}
    #rmTabs{order:3;flex:1 0 100%;width:100%;min-width:100%;flex-wrap:wrap;gap:3px;margin-top:2px;justify-content:flex-start}
    #rmTabs button{padding:5px 7px;font-size:9px;letter-spacing:.03em;border-radius:6px}
    #rmStat{font-size:8.5px;gap:5px}
    #rmStat .bar{width:28px}
    #rmAll{display:block !important}
    #rmStat{font-size:9px;gap:6px}
    #rmStat .bar{width:34px}
    #rmDock{display:none !important}
    #rmSkills{bottom:calc(10px + env(safe-area-inset-bottom));right:8px}
    #rmSkills button{width:66px;font-size:9px}
    .rmPanel{padding:96px 10px 18px}
    #rmToast{top:110px}
  }`;
  document.head.appendChild(css);


  // ---------------------------------------------------------------- shell
  const top = document.createElement('div');
  top.id = 'rmTop';
  top.innerHTML = `
    <div id="rmBrand">◈ <b>RAKAZA</b><span id="rmVer" style="color:#5f646c;font-size:9px">${VERSION}${DEV ? ' · DEV' : ''}</span></div>
    <div id="rmTabs">
      <button data-tab="none" class="on">PLAY</button>
      <button data-tab="shop">SHOP</button>
      <button data-tab="skills">SKILLS</button>
      <button data-tab="missions">MISSIONS</button>
      <button data-tab="modes">MODES</button>
      <button data-tab="progress">PROGRESS</button>
      <button data-tab="settings">SETTINGS</button>
    </div>
    <div id="rmStat">
      <span class="lv">LVL <b id="rmLvl">1</b></span>
      <span class="bar"><i class="fill" id="rmXpFill"></i></span>
      <span id="rmPts">0 ◈</span>
      <span id="rmMode" style="color:#d9b26a">CLASSIC</span><span id="rmStage">S1</span><span id="rmKills">0 ☠</span><span id="rmBest">0 m</span>
    </div>
    <button id="rmAll" title="all tabs">☰</button>
    <button id="rmHide" title="hide tabs">▴</button>`;
  document.body.appendChild(top);
  const dock = document.createElement('div');
  dock.id = 'rmDock';
  dock.innerHTML = `
    <button data-tab="none" class="on">PLAY</button>
    <button data-tab="shop">SHOP</button>
    <button data-tab="missions">MISS</button>
    <button data-tab="modes">MODES</button>`;
  document.body.appendChild(dock);
  const showBtn = document.createElement('div');
  showBtn.id = 'rmShow';
  showBtn.textContent = '▾ MENU';
  document.body.appendChild(showBtn);
  const panel = document.createElement('div');
  panel.className = 'rmPanel';
  panel.id = 'rmPanel';
  panel.innerHTML = '<div class="rmCard" id="rmCard"></div>';
  document.body.appendChild(panel);
  const skillsEl = document.createElement('div');
  skillsEl.id = 'rmSkills';
  document.body.appendChild(skillsEl);
  const toast = document.createElement('div');
  toast.id = 'rmToast';
  document.body.appendChild(toast);
  const evBanner = document.createElement('div');
  evBanner.id = 'rmEvent';
  document.body.appendChild(evBanner);
  const draftEl = document.createElement('div');
  draftEl.className = 'rmPanel';
  draftEl.id = 'rmDraft';
  document.body.appendChild(draftEl);
  const devChip = document.createElement('div');
  devChip.id = 'rmDevChip';
  devChip.textContent = 'DEV MODE · progress is separate · runs are not ranked';
  if (DEV) document.body.appendChild(devChip);

  const pop = (msg) => {
    const el = document.createElement('div');
    el.className = 'rmT'; el.textContent = msg;
    toast.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; }, 1900);
    setTimeout(() => el.remove(), 2300);
  };
  let bannerT = 0;
  const banner = (txt, color) => {
    evBanner.textContent = txt;
    evBanner.style.setProperty('--ev', color || '#d9b26a');
    evBanner.classList.add('on');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => evBanner.classList.remove('on'), 2100);
  };
  function applyChrome() {
    top.classList.toggle('hidden', !!M.ui.collapsed);
    showBtn.classList.toggle('on', !!M.ui.collapsed);
  }
  $m('#rmHide', top).addEventListener('click', () => { M.ui.collapsed = true; save(); applyChrome(); });
  showBtn.addEventListener('click', () => { M.ui.collapsed = false; save(); applyChrome(); });
  applyChrome();
  function renderHUD() {
    $m('#rmLvl', top).textContent = M.level;
    $m('#rmPts', top).textContent = fmt(M.points) + ' ◈';
    $m('#rmXpFill', top).style.width = Math.min(100, Math.round(100 * M.xp / needFor(M.level))) + '%';
    $m('#rmBest', top).textContent = Math.round(M.best) + ' m';
    $m('#rmMode', top).textContent = (MODES[M.mode] || MODES.classic).name;
  }

  // ---------------------------------------------------------------- panels
  function setTab(name) {
    $$('#rmTabs button', top).forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $$('#rmDock button', dock).forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  }
  function autoPause() {
    const A = window.__rz2;
    if (A && A.state === 'play' && A.pauseGame) A.pauseGame();
  }
  let curTab = 'none';
  function openTab(t, sub) {
    stopShopLoops();
    if (t === 'none') { panel.classList.remove('on'); setTab('none'); boardLive(false); curTab = 'none'; return; }
    autoPause();
    if (t === 'shop' && sub) M.shopTab = sub;
    panel.classList.add('on'); setTab(t); curTab = t; renderPanel(t);
  }
  top.addEventListener('click', (e) => {
    if (!e.target.closest('#rmAll')) return;
    autoPause();
    panel.classList.add('on'); renderMenu();
  });
  function renderMenu() {
    const card = $m('#rmCard', panel);
    card.innerHTML = `<h2>All tabs</h2><p class="lead">Everything in the game, one tap away.</p>
      <div class="rmGrid">${[
        ['shop', '◈', 'Shop', '10 categories + daily drop shop'],
        ['skills', '◇', 'Skills', 'loadout of 3 (4 with a slot)'],
        ['missions', '✓', 'Missions', 'daily goals'],
        ['modes', '▶', 'Modes', 'classic / rush / zen / hardcore / campaign / survival'],
        ['progress', '★', 'Progress', 'level, coins, achievements'],
        ['settings', '⚙', 'Settings', 'sound, effects, brain'],
        ['none', '↩', 'Play', 'back to the game'],
      ].map(([t, ic, nm, d]) => `<div class="rmItem" data-tab2="${t}" style="cursor:pointer">
        <div class="ic">${ic}</div><h3>${nm}</h3><p>${d}</p></div>`).join('')}</div>`;
    card.onclick = (e) => { const b = e.target.closest('[data-tab2]'); if (b) openTab(b.dataset.tab2); };
  }
  dock.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) openTab(b.dataset.tab); });
  top.addEventListener('click', (e) => { const b = e.target.closest('#rmTabs button'); if (b) openTab(b.dataset.tab); });

  // ---------------------------------------------------------------- shop
  const SHOP_TABS = [['characters', 'Characters'], ['outfits', 'Outfits'], ['skills', 'Skills'], ['trails', 'Trails'], ['auras', 'Auras'], ['effects', 'Effects'], ['stages', 'Stages'], ['upgrades', 'Upgrades'], ['boosts', 'Boosts'], ['drops', 'Drops']];
  const CAT_ICON = { characters: '☺', skills: '◇', trails: '≋', auras: '◎', effects: '✸', stages: '⌂', upgrades: '▲', boosts: '⛨' };
  const skillOk = (k) => DEV || M.level >= SKILLS[k].level;
  const slots = () => (owns('upg:slot') ? 4 : 3);
  const equippedId = (it) => {
    if (it.cat === 'characters') return M.equip.char === it.ref;
    if (it.cat === 'trails') return M.equip.trail === it.ref;
    if (it.cat === 'auras') return M.equip.aura === it.ref;
    if (it.cat === 'effects') return M.equip[it.slot] === it.ref;
    if (it.cat === 'stages') return M.equip.stage === it.ref;
    if (it.cat === 'skills') return M.loadout.includes(it.ref);
    return false;
  };
  const tokenOn = () => !!RC.CONFIG.RAKAZA_TOKEN_ENABLED;
  const tokenBtn = (it, price) => `<button class="tok" data-token="${it.id}" ${tokenOn() ? '' : 'disabled'} title="${tokenOn() ? 'ask the Rakaza site wallet' : 'locked until the $RAKAZA token launches'}">${tokenOn() ? 'PAY WITH $RAKAZA' : '🔒 Pay with $RAKAZA · at launch'}<small>${price == null ? it.tokenPrice : Math.max(1, Math.round(price / 4))} $RAKAZA</small></button>`;
  function itemCard(it, o) {
    o = o || {};
    const own = owns(it.id), eq = equippedId(it);
    const price = o.price != null ? o.price : it.price;
    const lockedLvl = it.cat === 'skills' && !skillOk(it.ref);
    let act;
    if (it.cat === 'boosts') {
      act = `<button class="buy" data-buy="${it.id}">${price} ◈ · BUY</button><div class="stk">in stock: ${M.boostStock[it.ref] || 0}</div>`;
    } else if (it.cat === 'upgrades') {
      act = own ? '<button class="buy off">OWNED</button>' : `<button class="buy" data-buy="${it.id}">${price} ◈ · BUY</button>`;
    } else if (!own) {
      act = `<button class="buy" data-buy="${it.id}">${price} ◈ · BUY</button>`;
    } else if (lockedLvl) {
      act = `<button class="buy off">LEVEL ${SKILLS[it.ref].level}</button>`;
    } else {
      act = `<button class="buy ${eq ? 'off' : ''}" data-equip="${it.id}">${eq ? (it.cat === 'stages' ? 'THEME LOCKED ✓' : 'EQUIPPED ✓') : (it.cat === 'stages' ? 'LOCK THEME' : 'EQUIP')}</button>`;
    }
    const prev = it.cat === 'effects' || it.cat === 'trails' || it.cat === 'auras'
      ? `<button class="pv" data-preview="${it.id}">PREVIEW</button>` : '';
    const art = it.cat === 'characters' ? `<canvas class="cv" width="96" height="96" data-char="${it.ref}"></canvas>`
      : it.cat === 'skills' ? `<div class="ic" style="color:${SKILLS[it.ref].color}">${SKILLS[it.ref].icon}</div>`
      : it.cat === 'stages' ? `<div class="stg" style="background:linear-gradient(180deg,${stageCss(it.idx, 0)},${stageCss(it.idx, 1)})"><i style="background:${STAGES[it.idx].pal.edge}"></i></div>`
      : it.cat === 'boosts' ? `<div class="ic">${(RC.BOOSTS.find((b) => b.id === it.ref) || {}).icon || '◈'}</div>`
      : `<div class="ic">${CAT_ICON[it.cat] || '◈'}</div>`;
    return `<div class="rmItem rz-card ${own ? 'owned' : ''} ${eq ? 'sel' : ''}" data-id="${it.id}" style="--rar:${RC.RARITY_COLORS[it.rarity] || '#9ca3af'}">
      <div class="tag">${it.rarity || ''}${o.stock != null ? ' · ' + o.stock + ' left' : ''}</div>${art}
      <h3>${esc(it.name)}</h3><p>${esc(it.desc)}</p>${it.perkText && it.cat === 'characters' ? `<p class="perk">${esc(it.perkText)}</p>` : ''}
      <div class="acts">${act}${prev}</div>${it.cat === 'boosts' || own && it.cat === 'upgrades' ? '' : tokenBtn(it, price)}</div>`;
  }
  function stageCss(i, k) { const p = STAGES[i].pal; const c = k ? p.skyLow : p.skyTop; return 'rgb(' + c.join(',') + ')'; }
  function outfitCards() {
    const A = window.__rz2; const skins = (A && A.skins) || []; const sv = (A && A.saved) || {};
    if (!skins.length) return '<p class="lead">Wardrobe colours load with the game.</p>';
    return skins.map((s, i) => {
      const ok = DEV || (sv.total || 0) >= (s.cost || 0) || (s.cost || 0) === 0;
      const eq = (sv.skin | 0) === i;
      return `<div class="rmItem rz-card ${ok ? 'owned' : ''} ${eq ? 'sel' : ''}" style="--rar:#9ca3af"><div class="tag">colour</div>
        <div class="ic" style="color:${esc(s.c || s.color || s.jacket || '#fff')}">◐</div><h3>${esc(s.name || 'Outfit ' + (i + 1))}</h3>
        <p>${ok ? 'unlocked' : 'unlocks at ' + fmt(s.cost) + ' lifetime coins'}</p>
        <div class="acts">${ok ? `<button class="buy ${eq ? 'off' : ''}" data-skin="${i}">${eq ? 'WORN ✓' : 'WEAR'}</button>` : `<button class="buy off">${fmt(s.cost)} coins</button>`}</div></div>`;
    }).join('');
  }
  const utcLeft = () => { const n = new Date(); const e = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1); const s = Math.floor((e - n.getTime()) / 1000); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
  function dropsHTML() {
    const day = API.utcDay(); const drop = RC.dailyDrop(day);
    if (M.drops.day !== day) M.drops = { day, free: false, bought: {} };
    const free = BY_ID[drop.free];
    const items = drop.shop.map((s) => { const it = BY_ID[s.id]; const left = Math.max(0, s.stock - (M.drops.bought[s.id] || 0)); return { it, s, left }; });
    return `<div class="dropHead"><div><b>DAILY DROP</b> · seed day ${day} (UTC)</div><div>next rotation in <b id="rmDropT">${utcLeft()}</b></div></div>
      <div class="rmGrid"><div class="rmItem rz-card ${M.drops.free ? 'owned' : ''}" style="--rar:${RC.RARITY_COLORS[free.rarity]}"><div class="tag">free today</div>
        <div class="ic">🎁</div><h3>${esc(free.name)}</h3><p>${esc(free.desc)}</p>
        <div class="acts">${M.drops.free ? '<button class="buy off">CLAIMED ✓</button>' : '<button class="buy" data-claimdrop="1">CLAIM FREE DROP</button>'}</div></div></div>
      <h2 style="margin:18px 0 6px;font-size:15px">Drop shop · limited, rotates every UTC day</h2>
      <p class="lead">Same six items for everybody today, picked from the day's seed. Stock here is tracked on this device; the site tracks global stock when it goes live.</p>
      <div class="rmGrid">${items.map((x) => itemCard(Object.assign({}, x.it), { price: x.s.price, stock: x.left, dropId: x.s.id })
        .replace(/data-buy="([^"]+)"/g, `data-dropbuy="$1"`).replace(/(<button class="buy)(" data-dropbuy)/, x.left ? '$1$2' : '$1 off$2')).join('')}</div>`;
  }
  function shopHTML() {
    const tab = M.shopTab || 'characters';
    const head = `<h2>Shop</h2><p class="lead">Prices in ◈ (earned by running). ${DEV ? '<b style="color:#4ade80">DEV MODE: everything unlocked, 9,999,000 ◈.</b>' : 'Every item also carries a $RAKAZA price that opens at token launch.'}</p>
      <div class="rz-subtabs">${SHOP_TABS.map(([k, l]) => `<button data-shoptab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    let body;
    if (tab === 'drops') body = dropsHTML();
    else if (tab === 'outfits') body = `<p class="lead">Wardrobe colours unlock by lifetime coins and tint your runner.</p><div class="rmGrid">${outfitCards()}</div>`;
    else body = `<div class="rmGrid">${ITEMS.filter((it) => it.cat === tab).map((it) => itemCard(it)).join('')}</div>`;
    return head + body;
  }
  let shopRaf = 0, dropTimer = 0;
  function stopShopLoops() { cancelAnimationFrame(shopRaf); shopRaf = 0; clearInterval(dropTimer); dropTimer = 0; }
  function startShopLoops() {
    stopShopLoops();
    const tab = M.shopTab;
    if (curTab !== 'shop') return;
    if (tab === 'drops') dropTimer = setInterval(() => { const el = $m('#rmDropT'); if (el) el.textContent = utcLeft(); }, 1000);
    const cvs = $$('canvas[data-char]', panel);
    if (cvs.length && window.RakazaChar) {
      const t0 = performance.now();
      const loop = () => {
        const t = (performance.now() - t0) / 1000;
        cvs.forEach((c) => {
          const ch = RC.CHARACTERS.find((x) => x.id === c.dataset.char);
          const g = c.getContext('2d'); g.clearRect(0, 0, 96, 96);
          try {
            if (ch.id === 'cat') window.RakazaChar.drawCat ? window.RakazaChar.drawCat(g, 48, 84, 1.7, t) : null;
            else window.RakazaChar.draw(g, 48, 84, 1.7, '#d9b26a', t, false, false, 1, false, ch.outfit, false);
          } catch (e) {}
        });
        shopRaf = requestAnimationFrame(loop);
      };
      loop();
    }
  }
  function equipItem(it) {
    if (!owns(it.id)) return;
    if (it.cat === 'characters') { M.equip.char = it.ref; syncChar(); }
    else if (it.cat === 'trails') M.equip.trail = it.ref;
    else if (it.cat === 'auras') M.equip.aura = it.ref;
    else if (it.cat === 'effects') M.equip[it.slot] = it.ref;
    else if (it.cat === 'stages') M.equip.stage = M.equip.stage === it.ref ? 'cycle' : it.ref;
    else if (it.cat === 'skills') {
      if (!skillOk(it.ref)) { pop('LEVEL ' + SKILLS[it.ref].level + ' NEEDED'); return; }
      if (M.loadout.includes(it.ref)) M.loadout = M.loadout.filter((x) => x !== it.ref);
      else if (M.loadout.length >= slots()) { pop('LOADOUT FULL · ' + slots() + ' MAX'); return; }
      else M.loadout.push(it.ref);
    }
    save(); fxEquip(); renderRailIdle(); pop(it.name.toUpperCase() + ' · ' + (equippedId(it) ? 'ON' : 'OFF')); sfx('ui');
  }
  function syncChar() {
    const ch = RC.CHARACTERS.find((c) => c.id === M.equip.char) || RC.CHARACTERS[1];
    try { if (ch.id === 'cat') Prefs.set('char', 'cat'); else { Prefs.set('char', 'rakaza'); Prefs.set('outfit', ch.outfit | 0); } } catch (e) {}
  }
  function buyItem(it, price, drop) {
    if (!it) return false;
    if (it.cat !== 'boosts' && owns(it.id)) { pop('ALREADY OWNED'); return false; }
    if (it.cat === 'boosts' && (M.boostStock[it.ref] || 0) >= 9) { pop('MAX 9 IN STOCK'); return false; }
    price = price != null ? price : it.price;
    if (M.points < price) { pop('NOT ENOUGH ◈'); sfx('hit'); return false; }
    if (drop) { const s = RC.dailyDrop(API.utcDay()).shop.find((x) => x.id === it.id); if (!s || (M.drops.bought[it.id] || 0) >= s.stock) { pop('SOLD OUT TODAY'); return false; } M.drops.bought[it.id] = (M.drops.bought[it.id] || 0) + 1; }
    M.points -= price;
    if (it.cat === 'boosts') M.boostStock[it.ref] = (M.boostStock[it.ref] || 0) + 1; else M.owned[it.id] = 1;
    M.achs.shop1 = true; if (ownedCount() >= 15) M.achs.collector = true;
    save(); renderHUD(); sfx('coin'); pop('BOUGHT · ' + it.name);
    return true;
  }
  function claimFreeDrop() {
    const day = API.utcDay(); const d = RC.dailyDrop(day);
    if (M.drops.day !== day) M.drops = { day, free: false, bought: {} };
    if (M.drops.free) return;
    const it = BY_ID[d.free]; M.drops.free = true;
    if (owns(it.id)) { M.points += 120; pop('ALREADY OWNED · +120 ◈ INSTEAD'); } else { M.owned[it.id] = 1; pop('DROP CLAIMED · ' + it.name); }
    save(); renderHUD(); sfx('power');
  }
  function previewEffect(it, el) {
    const FX = window.RakazaFX; if (!FX) return;
    const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top;
    const slot = it.slot || (it.cat === 'trails' ? 'trail' : 'aura');
    const spec = (RC.EFFECTS[slot] || []).find((e) => e.id === it.ref);
    if (!spec || !spec.p) { pop('NO EFFECT · THE PLAIN ONE'); return; }
    if (slot === 'trail' || slot === 'aura') { FX.burst && FX.burst(Object.assign({ n: 18, speed: 70, life: 0.7 }, spec.p), x, y, true); } else FX.previewBurst(slot, x, y);
    sfx('ui');
  }
  const shopClick = (e) => {
    const t = e.target.closest('[data-shoptab]');
    if (t) { M.shopTab = t.dataset.shoptab; save(); renderPanel('shop'); return true; }
    const b = e.target.closest('[data-buy]');
    if (b) { const it = BY_ID[b.dataset.buy]; if (buyItem(it)) renderPanel('shop'); return true; }
    const db = e.target.closest('[data-dropbuy]');
    if (db) { const it = BY_ID[db.dataset.dropbuy]; const s = RC.dailyDrop(API.utcDay()).shop.find((x) => x.id === it.id); if (buyItem(it, s && s.price, true)) renderPanel('shop'); return true; }
    const q = e.target.closest('[data-equip]');
    if (q) { equipItem(BY_ID[q.dataset.equip]); renderPanel('shop'); return true; }
    const pv = e.target.closest('[data-preview]');
    if (pv) { previewEffect(BY_ID[pv.dataset.preview], pv); return true; }
    const cd = e.target.closest('[data-claimdrop]');
    if (cd) { claimFreeDrop(); renderPanel('shop'); return true; }
    const sk = e.target.closest('[data-skin]');
    if (sk) { const A = window.__rz2; if (A && A.saved) { A.saved.skin = +sk.dataset.skin; try { A.persist ? A.persist() : localStorage.setItem('rz_v2', JSON.stringify(A.saved)); } catch (er) {} } renderPanel('shop'); return true; }
    const tk = e.target.closest('[data-token]');
    if (tk && tokenOn()) {
      const it = BY_ID[tk.dataset.token];
      try { (window.parent !== window ? window.parent : window).postMessage({ type: 'rakaza-token-purchase-request', itemId: it.id, tokenPrice: it.tokenPrice, currency: 'RAKAZA', v: 1 }, '*'); } catch (er) {}
      pop('REQUEST SENT TO THE SITE WALLET'); return true;
    }
    return false;
  };

  // ---------------------------------------------------------------- skills tab
  const skillsHTML = () => {
    const ids = Object.keys(SKILLS).sort((a, b) => SKILLS[a].level - SKILLS[b].level);
    return `<h2>Skills</h2><p class="lead">Loadout ${M.loadout.length}/${slots()} · keys 1-${slots()} fire them in a run. Buy skills in the Shop, level gates apply.</p>
      <div class="rmGrid">${ids.map((k) => {
        const s = SKILLS[k]; const own = owns('skill:' + k); const ok = skillOk(k); const eq = M.loadout.includes(k);
        const act = !own ? '<button class="buy off">BUY IN SHOP</button>' : !ok ? `<button class="buy off">LEVEL ${s.level}</button>` : `<button class="buy ${eq ? 'off' : ''}" data-equip="skill:${k}">${eq ? 'EQUIPPED ✓' : 'EQUIP'}</button>`;
        return `<div class="rmItem rz-card ${eq ? 'sel' : ''} ${own && ok ? 'owned' : ''}" style="--rar:${s.color}"><div class="tag">lvl ${s.level}${s.isNew ? ' · new' : ''}</div>
          <div class="ic" style="color:${s.color}">${s.icon}</div><h3>${esc(s.name)}</h3><p>${esc(s.desc)} · ${s.cd}s</p><div class="acts">${act}</div></div>`;
      }).join('')}</div>`;
  };

    const missionsHTML = () => `<h2>Daily missions</h2>
    <p class="lead">Reset every day at midnight UTC. Claim each one for claw points.</p>
    <div class="rmGrid">${MISSIONS.map((mi) => {
      const prog = Math.min(mi.goal, M.missions.prog[mi.id] || 0);
      const done = prog >= mi.goal;
      const claimed = !!M.missions.claimed[mi.id];
      return `<div class="rmItem ${claimed ? 'owned' : ''}">
        <div class="tag">${mi.reward} ◈</div>
        <h3>${mi.label}</h3>
        <div class="prog"><i style="width:${Math.round(100 * prog / mi.goal)}%"></i></div>
        <p>${prog} / ${mi.goal}</p>
        <button class="buy ${done && !claimed ? '' : 'off'}" data-claim="${mi.id}">
          ${claimed ? 'CLAIMED' : done ? 'CLAIM' : 'IN PROGRESS'}</button>
      </div>`;
    }).join('')}</div>
    ${modeChHTML()}`;

  const modeChHTML = () => `<h2 style="margin-top:24px;font-size:15px">Challenges per mode</h2>
    <p class="lead" style="margin:4px 0 12px">Each mode has its own goal. The active one is highlighted.</p>
    <div class="rmGrid">${Object.entries(MODE_CH).map(([k, c]) => {
      const prog = Math.min(c.goal, M.modeCh[k] || 0);
      const done = prog >= c.goal;
      return `<div class="rmItem ${done ? 'owned' : M.mode === k ? 'sel' : ''}">
        <div class="tag">${done ? 'cleared' : prog + ' / ' + c.goal}</div>
        <div class="ic">${MODES[k].icon}</div><h3>${MODES[k].name}</h3>
        <p>${c.label}</p>
        <div class="prog"><i style="width:${Math.round(100 * prog / c.goal)}%"></i></div>
      </div>`;
    }).join('')}</div>`;

  const modesHTML = () => `<h2>Modes</h2>
    <p class="lead">Same city, different rules. Best distance is tracked per mode.</p>
    <div class="rmGrid">${Object.entries(MODES).map(([k, mo]) => `
      <div class="rmItem ${M.mode === k ? 'sel' : ''}">
        <div class="tag">${k === 'campaign' ? 'stage ' + (M.campaign.stage + 1) + '/7' : Math.round(M.bestByMode[k] || 0) + ' m best'}</div>
        <div class="ic">${mo.icon}</div><h3>${mo.name}</h3><p>${mo.desc}</p>
        <button class="buy ${M.mode === k ? 'off' : ''}" data-mode="${k}">${M.mode === k ? 'ACTIVE' : 'SELECT'}</button>
      </div>`).join('')}</div>`;

    async function serverStats() {
    try {
      const d = await API.getBoard({ range: 'all' });
      const top = (d.top || [])[0];
      const mine = (d.top || []).findIndex((x) => M.lbName && x.name === M.lbName);
      return { source: d.source, count: d.count || 0, topScore: top ? top.score : 0, topName: top ? top.name : '—', rank: mine >= 0 ? mine + 1 : null };
    } catch (e) { return null; }
  }
  function paintServerStats() {
    serverStats().then((s) => {
      const el = $m('#rmServer'); if (!el) return;
      if (!s) { el.innerHTML = '<p class="lead">leaderboard stats unavailable</p>'; return; }
      el.innerHTML = `
        <div class="rmGrid">
          <div class="rmItem"><div class="ic">≡</div><h3>${s.count.toLocaleString('en-US')} runs</h3><p>recorded ${s.source === 'server' ? 'on the server' : 'on this device'}</p></div>
          <div class="rmItem"><div class="ic">◆</div><h3>${(s.topScore || 0).toLocaleString('en-US')}</h3><p>top score · ${s.topName}</p></div>
          <div class="rmItem"><div class="ic">#</div><h3>${s.rank ? 'rank ' + s.rank : 'unranked'}</h3><p>${M.lbName ? 'as ' + M.lbName : 'set a handle below'}</p></div>
        </div>`;
    });
  }

  const progressHTML = () => `<h2>Progress</h2>
    <p class="lead">Everything banked on this device.</p>
    <div class="rmGrid">
      <div class="rmItem"><div class="ic">★</div><h3>Level ${M.level}</h3><p>${M.xp} / ${needFor(M.level)} xp</p></div>
      <div class="rmItem"><div class="ic">◈</div><h3>${M.points.toLocaleString('en-US')} points</h3><p>spend in the shop</p></div>
      <div class="rmItem"><div class="ic">➤</div><h3>${Math.round(M.best)} m best</h3><p>${M.runs} runs played</p></div>
      <div class="rmItem"><div class="ic">◎</div><h3>${M.coins.toLocaleString('en-US')} coins</h3><p>lifetime</p></div>
    </div>
    <h2 style="margin-top:22px;font-size:15px">Achievements</h2>
    <div class="rmGrid" style="margin-top:10px">${ACHS.map((a) => `
      <div class="rmItem ${M.achs[a.id] ? 'owned' : ''}">
        <div class="tag">${M.achs[a.id] ? 'unlocked' : 'locked'}</div>
        <div class="ic">${a.icon}</div><h3>${a.name}</h3><p>${a.desc}</p>
      </div>`).join('')}</div>
    <div class="rmRow" style="margin-top:16px"><span>Leaderboard handle</span>
      <input id="rmName" value="${(M.lbName || '').replace(/"/g, '&quot;')}" maxlength="16" placeholder="your handle"
        style="background:#0b0d10;border:1px solid var(--rm-line);border-radius:8px;color:var(--rm-ink);padding:8px 10px;font:inherit;width:150px"/>
      <button data-act="saveName" style="all:unset;cursor:pointer;padding:8px 14px;border-radius:8px;background:var(--rm-gold);color:#17130a;font:700 11px/1 ui-sans-serif">SAVE</button>
    </div>`;


  // ---------------------------------------------------------------- settings (brain + dev + agent)
  const BRAIN_SECTION = () => {
    const B = window.RakazaBrain; const st = B ? B.status() : null;
    const A = window.RakazaGame;
    return `<h2 style="margin-top:22px;font-size:15px">AI brain for agents</h2>
      <div class="rmRow"><div><b>Pilot brain</b><div style="color:var(--rm-dim);font-size:11.5px">${esc(st ? st.label : 'Built-in scripted autopilot')}</div></div>
        <button data-act="brain" class="rz-btn">BRAIN SETTINGS</button></div>
      <div class="rmRow"><div><b>Agent session</b><div style="color:var(--rm-dim);font-size:11.5px">${A ? esc(A.sessionLabel()) : 'agent protocol not loaded'}</div></div>
        <button data-act="agent" class="rz-btn">PLAYS · PROTOCOL</button></div>`;
  };
  const DEV_SECTION = () => DEV ? `<h2 style="margin-top:22px;font-size:15px;color:#4ade80">Dev panel</h2>
      <p class="lead">Test mode: its own profile (never mixes with the real one), everything unlocked, no ranked submission.</p>
      <div class="rz-dev">
        <button data-dev="grant" class="rz-btn">+ ${fmt(DEV_COINS)} ◈</button>
        <button data-dev="unlock" class="rz-btn">UNLOCK ALL ITEMS</button>
        <button data-dev="lvl" class="rz-btn">LEVEL 30</button>
        <label>Start next run at <input id="rzDevM" type="number" min="0" step="50" value="${M.devStart | 0}"> m</label>
        <label>Jump to stage <select id="rzDevStage"><option value="">—</option>${STAGES.map((s, i) => `<option value="${s.at}">${i + 1}. ${esc(s.name)} (${s.at} m)</option>`).join('')}</select></label>
        <button data-dev="startpos" class="rz-btn">SET START</button>
        <button data-dev="clear" class="rz-btn">RESET DEV PROFILE</button>
      </div>` : '';
  const settingsHTML = () => {
    let h = SETTINGS_BASE();
    const i = h.indexOf('<div style="margin-top:18px;display:flex;gap:10px');
    return h.slice(0, i) + BRAIN_SECTION() + DEV_SECTION() + h.slice(i);
  };
  const SETTINGS_BASE = () => `<h2>Settings</h2>
    <p class="lead">Nothing here changes the physics.</p>
    <div class="rmRow"><div><b>Sound</b><div style="color:var(--rm-dim);font-size:11.5px">music + hit feedback</div></div>
      <div class="rmSw ${M.settings.sound ? 'on' : ''}" data-sw="sound"></div></div>
    <div class="rmRow"><div><b>Master volume</b><div style="color:var(--rm-dim);font-size:11.5px" id="rmVolV">${Math.round(Prefs.get('volume') * 100)}%</div></div>
      <input id="rmVol" type="range" min="0" max="100" step="1" value="${Math.round(Prefs.get('volume') * 100)}" style="width:150px;accent-color:#d9b26a"/></div>
    <div class="rmRow"><div><b>Music</b><div style="color:var(--rm-dim);font-size:11.5px">synth soundtrack, speeds up with the run</div></div>
      <div class="rmSw ${Prefs.get('music') ? 'on' : ''}" data-sw="music"></div></div>
    <div class="rmRow"><div><b>Sound effects</b><div style="color:var(--rm-dim);font-size:11.5px">jumps, coins, hits, skills</div></div>
      <div class="rmSw ${Prefs.get('sfx') ? 'on' : ''}" data-sw="sfx"></div></div>
    <div class="rmRow"><div><b>Haptics</b><div style="color:var(--rm-dim);font-size:11.5px">phone vibration on jump, hit, stomp</div></div>
      <div class="rmSw ${Prefs.get('haptics') ? 'on' : ''}" data-sw="haptics"></div></div>
    <div class="rmRow"><div><b>Effects</b><div style="color:var(--rm-dim);font-size:11.5px">weather, trails, flashes</div></div>
      <div class="rmSw ${M.settings.fx ? 'on' : ''}" data-sw="fx"></div></div>
    <div class="rmRow"><div><b>Reduced motion</b><div style="color:var(--rm-dim);font-size:11.5px">no screen shake, colour split, flashes or speed streaks</div></div>
      <div class="rmSw ${Prefs.get('reduceMotion') ? 'on' : ''}" data-sw="reduceMotion"></div></div>
    <div class="rmRow"><div><b>Best-run ghost</b><div style="color:var(--rm-dim);font-size:11.5px">a see-through copy of your best run races you</div></div>
      <div class="rmSw ${Prefs.get('ghost') ? 'on' : ''}" data-sw="ghost"></div></div>
    <div class="rmRow"><div><b>Tutorial</b><div style="color:var(--rm-dim);font-size:11.5px">show the first-run tips again on your next run</div></div>
      <button data-act="tutorial" style="all:unset;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid var(--rm-line);color:#b9bec6;font:600 11px/1 ui-sans-serif">REPLAY</button></div>
    <div class="rmRow"><div><b>Profile data</b>
      <div style="color:var(--rm-dim);font-size:11.5px" id="rmSaved">${API.mode() === 'server' ? 'device + server' : 'this device (standalone)'} · id ${uid.slice(0, 12)}…</div></div>
      <div class="chip" style="padding:4px 10px;border:1px solid var(--rm-line);border-radius:99px;font-size:10px">${API.mode() === 'server' ? 'SYNC ON' : 'LOCAL'}</div></div>
    <div class="rmRow"><div><b>Top tabs</b><div style="color:var(--rm-dim);font-size:11.5px">show the navigation bar</div></div>
      <div class="rmSw ${M.ui.collapsed ? '' : 'on'}" data-sw="tabs"></div></div>
    <div class="rmRow" style="margin-top:6px"><div><b>Profile data</b>
      <div style="color:var(--rm-dim);font-size:11.5px">saved on this device · export/import any time</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button data-act="export" style="all:unset;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid var(--rm-line);color:#b9bec6;font:600 11px/1 ui-sans-serif">EXPORT</button>
        <button data-act="import" style="all:unset;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid var(--rm-line);color:#b9bec6;font:600 11px/1 ui-sans-serif">IMPORT</button>
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
      <button data-act="reset" style="all:unset;cursor:pointer;padding:10px 14px;border-radius:9px;border:1px solid #f43f5e55;color:#f43f5e;font:600 11px/1 ui-sans-serif;letter-spacing:.06em">RESET PROGRESS</button>
      <button data-act="resetgame" style="all:unset;cursor:pointer;padding:10px 14px;border-radius:9px;border:1px solid var(--rm-line);color:#b9bec6;font:600 11px/1 ui-sans-serif;letter-spacing:.06em">RESET GAME SAVE</button>
    </div>`;


  function renderPanel(t) {
    stopShopLoops();
    const card = $m('#rmCard', panel);
    if (t === 'shop') card.innerHTML = shopHTML();
    else if (t === 'skills') card.innerHTML = skillsHTML();
    else if (t === 'missions') card.innerHTML = missionsHTML();
    else if (t === 'modes') card.innerHTML = modesHTML();
    else if (t === 'progress') { card.innerHTML = progressHTML(); paintServerStats(); }
    else if (t === 'settings') card.innerHTML = settingsHTML();
    card.oninput = (e) => {
      if (e.target.id === 'rmVol') { Prefs.set('volume', (+e.target.value) / 100); window.RakazaAudio && window.RakazaAudio.applyVolume(); const l = $m('#rmVolV', card); if (l) l.textContent = e.target.value + '%'; }
    };
    card.onchange = (e) => { if (e.target.id === 'rmVol') sfx('ui'); if (e.target.id === 'rzDevStage' && e.target.value !== '') { const i = $m('#rzDevM', card); if (i) i.value = e.target.value; } };
    card.onclick = (e) => {
      const rg = e.target.closest('[data-range]');
      if (rg) { boardRange = rg.dataset.range; return renderPanel('board'); }
      if (shopClick(e)) return;
      const mode = e.target.closest('[data-mode]'), sw = e.target.closest('[data-sw]'), act = e.target.closest('[data-act]'),
        claim = e.target.closest('[data-claim]'), dv = e.target.closest('[data-dev]');
      if (mode) return onMode(mode.dataset.mode);
      if (sw) return onSwitch(sw.dataset.sw);
      if (claim) return onClaim(claim.dataset.claim);
      if (dv) return onDev(dv.dataset.dev);
      if (act) return onAction(act.dataset.act);
    };
    renderHUD();
    if (t === 'shop') startShopLoops();
  }
  function onDev(a) {
    if (!DEV) return;
    if (a === 'grant') { M.points += DEV_COINS; pop('+' + fmt(DEV_COINS) + ' ◈'); }
    if (a === 'unlock') { ITEMS.forEach((it) => { if (it.cat !== 'boosts') M.owned[it.id] = 1; }); Object.keys(RC.BOOSTS).forEach(() => {}); RC.BOOSTS.forEach((b) => { M.boostStock[b.id] = 9; }); pop('ALL ITEMS UNLOCKED'); }
    if (a === 'lvl') { M.level = Math.max(M.level, 30); pop('LEVEL 30'); }
    if (a === 'startpos') { M.devStart = Math.max(0, Math.min(60000, +($m('#rzDevM', panel).value) || 0)); pop(M.devStart ? 'NEXT RUN STARTS AT ' + M.devStart + ' m' : 'START RESET'); }
    if (a === 'clear') { if (!confirm('Reset the dev profile?')) return; M = def(); M.points = DEV_COINS; }
    save(); renderHUD(); renderPanel('settings');
  }
  function onMode(k) { M.mode = k; save(); renderPanel('modes'); pop(MODES[k].name + ' SELECTED'); }
    function onClaim(id) {
    const mi = MISSIONS.find((x) => x.id === id); if (!mi) return;
    if ((M.missions.prog[id] || 0) < mi.goal || M.missions.claimed[id]) return;
    M.missions.claimed[id] = true; M.points += mi.reward;
    save(); renderHUD(); renderPanel('missions'); pop('+' + mi.reward + ' ◈ CLAIMED');
  }
    function onSwitch(k) {
    if (['music', 'sfx', 'haptics', 'reduceMotion', 'ghost'].includes(k)) {
      Prefs.set(k, !Prefs.get(k));
      renderPanel('settings'); pop(k.toUpperCase() + ' UPDATED'); sfx('ui');
      return;
    }
    if (k === 'tabs') { M.ui.collapsed = !M.ui.collapsed; save(); applyChrome(); }
    else {
      M.settings[k] = !M.settings[k]; save();
      const g2 = window.__rz2;
      if (g2 && g2.saved) { if (k === 'sound') g2.saved.mute = !M.settings.sound; if (k === 'fx') g2.saved.low = !M.settings.fx; }
    }
    renderPanel('settings'); pop(k.toUpperCase() + ' UPDATED');
  }
  function onAction(a) {
    if (a === 'brain') { const H = HK(); if (H.openBrain) { panel.classList.remove('on'); setTab('none'); H.openBrain(); } return; }
    if (a === 'agent') { const A = window.RakazaGame; if (A && A.openPanel) { panel.classList.remove('on'); setTab('none'); A.openPanel(); } return; }
        if (a === 'export') {
      const blob = new Blob([JSON.stringify(M, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'rakaza-profile.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      pop('PROFILE EXPORTED');
    }
    if (a === 'import') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const d = JSON.parse(String(rd.result));
            M = Object.assign(def(), d); save(); renderHUD(); renderPanel('settings'); pop('PROFILE IMPORTED');
          } catch (err) { pop('BAD FILE'); }
        };
        rd.readAsText(f);
      };
      inp.click();
    }
    if (a === 'tutorial') { Prefs.set('tutorialDone', false); pop('TUTORIAL WILL SHOW NEXT RUN'); }
    if (a === 'saveName') { M.lbName = ($m('#rmName', panel)?.value || '').slice(0, 16); save(); pop('HANDLE SAVED'); }
    if (a === 'reset') {
      if (!confirm('Reset level, points, upgrades and missions? Best distance stays.')) return;
      const keep = { settings: M.settings, lbName: M.lbName, best: M.best, ui: M.ui };
      M = Object.assign(def(), keep); save(); renderHUD(); renderPanel('settings'); pop('PROGRESS RESET');
    }
    if (a === 'resetgame') {
      if (!confirm('Also clear the game save (best distance, coins, skins)?')) return;
      localStorage.removeItem('rz_v2'); pop('GAME SAVE CLEARED'); setTimeout(() => location.reload(), 600);
    }
  }
    // ---------------------------------------------------------------- leaderboard
  let boardTimer = null, boardUpdated = 0, boardRange = 'all';
  function boardLive(on) {
    clearInterval(boardTimer);
    boardTimer = null;
    if (on) boardTimer = setInterval(() => { loadBoard(true); }, 4000);
  }
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function loadBoard(quiet) {
    const box = $m('#rmLb', panel); if (!box) return;
    try {
      const opts = boardRange === 'daily' ? { range: 'all', seedDay: API.utcDay() } : { range: boardRange };
      const d = await API.getBoard(opts);
      const lead = $m('#rmLbLead', panel);
      if (lead) lead.textContent = boardRange === 'daily'
        ? 'Daily seed ' + (window.RakazaDaily ? window.RakazaDaily.code() : '') + ' · same city for everyone on ' + API.utcDay() + ' (UTC). Score = metres + coins×6 + near-misses.'
        : (boardRange === '24h' ? 'Best runs from the last 24 hours. ' : 'All-time best runs. ') + 'Score = metres + coins×6 + near-misses.';
      const rows = (d.top || []).map((x, i) =>
        `<tr${M.lbName && x.name === M.lbName ? ' style="color:#d9b26a"' : ''}><td>${i + 1}</td><td>${esc(x.name)}</td>
         <td>${(x.score || 0).toLocaleString('en-US')}</td><td>${esc(x.metres)}</td><td>${esc(x.coins)}</td>
         <td>${x.pro ? 'AI' : 'HUMAN'}</td></tr>`).join('');
      boardUpdated = Date.now();
      const myName = M.lbName || 'you';
      const mine = (d.top || []).findIndex((x) => (x.name || '').toLowerCase() === myName.toLowerCase()) + 1;
      const live = d.source === 'server';
      box.innerHTML = `<table class="rmTable"><thead><tr><th>#</th><th>player</th><th>score</th><th>metres</th><th>coins</th><th>pilot</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="color:#8b8f96">no runs yet — be the first</td></tr>'}</tbody></table>
        <p class="lead" style="margin-top:12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <span style="color:${live ? '#34d399' : '#d9b26a'}">● ${live ? 'LIVE' : 'LOCAL · this device'}</span>
          <span>${d.count || 0} runs</span>
          <span>your rank: <b style="color:#d9b26a">${mine ? '#' + mine : '—'}</b></span>
          <span>updated ${new Date(boardUpdated).toLocaleTimeString()}</span>
        </p>
        ${live ? '' : '<p class="lead" style="font-size:11px">This standalone preview keeps the board in your browser. The Rakaza site plugs its real server in through the adapter (same API shape) for the global 24h board.</p>'}`;
    } catch (e) { box.innerHTML = '<p class="lead">leaderboard unavailable right now</p>'; }
  }
  async function submitRun(run) {
    try {
      const res = await API.submitRun(run);
      if (!M.lbName) { M.lbName = 'you'; save(); }
      return res;
    } catch (e) { return { ok: false }; }
  }

  // ---------------------------------------------------------------- run hooks
  // a daily-seed run plays by CLASSIC rules so the shared city is comparable

  // ---------------------------------------------------------------- run config
  let lastCfg = null;
  function stageIdxOf(ref) { const i = STAGES.findIndex((s) => s.id === ref); return i < 0 ? -1 : i; }
  function buildConfig(control, opts) {
    opts = opts || {};
    const ranked = !!opts.daily || !!opts.ranked;
    const mode = opts.daily ? 'classic' : (opts.mode || M.mode);
    const cfg = { mode, character: M.equip.char, theme: M.equip.stage === 'cycle' || !owns('stage:' + M.equip.stage) ? -1 : stageIdxOf(M.equip.stage), ranked, weekendXp: RC.isWeekend(today()), noHead: ranked };
    const mx = ranked ? RC.RANKED.maxSkills : slots();
    cfg.skills = M.loadout.filter((k) => owns('skill:' + k) && skillOk(k)).slice(0, mx);
    cfg.upg = {}; cfg.boosts = {}; cfg.ladder = 0; cfg.startDist = 0;
    if (!ranked) {
      Object.keys(UPG).forEach((k) => { if (owns('upg:' + k)) cfg.upg[k] = 1; });
      if (mode === 'campaign') cfg.ladder = Math.min(M.campaign.stage, LADDER.length - 1);
      cfg.noHead = false;
      // boosts armed from stock; consumed here, once per run
      RC.BOOSTS.forEach((b) => { if ((M.boostStock[b.id] || 0) > 0) { cfg.boosts[b.id] = 1; if (!DEV) M.boostStock[b.id]--; } });
      if (DEV && M.devStart > 0) { cfg.startDist = M.devStart; cfg.noHead = true; }
      save();
    }
    if (ranked && Replay) { const v = Replay.validateConfig(cfg, { ranked: true }).config; v.weekendXp = cfg.weekendXp; lastCfg = v; return v; }
    lastCfg = cfg;
    return cfg;
  }
  function fxEquip() {
    const FX = window.RakazaFX; if (!FX) return;
    FX.setEquip({ trail: M.equip.trail, aura: M.equip.aura, hit: M.equip.hit, death: M.equip.death, coin: M.equip.coin });
  }

  // ---------------------------------------------------------------- skills rail + draft overlay
  const isAI = (g) => !!(g && window.__rz2 && window.__rz2.ai);
  let railIds = [];
  function renderRailIdle() { buildRail(M.loadout.filter((k) => owns('skill:' + k) && skillOk(k)).slice(0, slots())); }
  function buildRail(ids) {
    railIds = ids.slice();
    skillsEl.innerHTML = railIds.map((k, i) => {
      const s = SKILLS[k];
      return `<button data-si="${i}" style="--sc:${s.color}"><i class="cd"></i><span class="k">${i + 1}</span>${s.icon} ${esc(s.name)}<small>${esc(s.desc)}</small></button>`;
    }).join('');
  }
  skillsEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-si]'); if (!b) return;
    e.preventDefault(); fireSkill(+b.dataset.si);
  });
  function fireSkill(i) {
    const A = window.__rz2; const g = A && A.game;
    if (!g || A.state !== 'play' || g.paused || g.dead || isAI(g)) return;
    if (g.cfg.skills[i] == null) return;
    const ok = Sim.input(g, Sim.OPS.SKILL, i);
    if (ok === false) { sfx('ui'); }
  }
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key >= '1' && e.key <= '4' && !e.ctrlKey && !e.metaKey && !e.altKey) fireSkill(+e.key - 1);
  });
  let draftOpen = false;
  function showDraft(g, ids) {
    draftOpen = true;
    const opts = ids.map((id) => RC.DRAFTS.find((d) => d.id === id) || { id, name: id, desc: '' });
    draftEl.innerHTML = `<div class="rmCard" style="max-width:760px">
      <div class="lbl" style="color:var(--rm-gold);font:700 10px/1 ui-sans-serif;letter-spacing:.14em">${isAI(g) ? 'THE PILOT CHOOSES' : 'RUN UPGRADE'}</div>
      <h2 style="margin:6px 0 4px">Choose a run upgrade</h2><p class="lead">It lasts for this run only. Pick one (keys 1-3).</p>
      <div class="rmGrid">${opts.map((d, i) => `<div class="rmItem" data-pick="${i}" style="cursor:pointer"><div class="tag">${i + 1}</div><div class="ic">✦</div><h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p><button class="buy">TAKE IT</button></div>`).join('')}</div></div>`;
    draftEl.classList.add('on');
    draftEl.onclick = (e) => { const c = e.target.closest('[data-pick]'); if (c) pickDraft(g, +c.dataset.pick); };
    if (isAI(g)) {
      const prio = RC.DRAFT_PRIO || [];
      let best = 0, bp = 1e9;
      ids.forEach((id, i) => { const p = prio.indexOf(id); if (p >= 0 && p < bp) { bp = p; best = i; } });
      setTimeout(() => { if (draftOpen && g.draft) { pop('PILOT PICKED · ' + opts[best].name); pickDraft(g, best); } }, 520);
    }
  }
  function pickDraft(g, i) {
    if (!g.draft) { hideDraft(); return; }
    Sim.input(g, Sim.OPS.DRAFT, i); hideDraft(); sfx('power');
  }
  function hideDraft() { draftOpen = false; draftEl.classList.remove('on'); }
  window.addEventListener('keydown', (e) => {
    if (!draftOpen || e.key < '1' || e.key > '3') return;
    const A = window.__rz2; if (A && A.game && !isAI(A.game)) pickDraft(A.game, +e.key - 1);
  });

  // ---------------------------------------------------------------- sim events -> UI
  function onSimEvents(g, evs) {
    for (const e of evs) {
      switch (e[0]) {
        case 'zone': {
          const t = e[1];
          if (t === 'boss') banner('BOSS · ' + String(e[2]).toUpperCase(), '#f43f5e');
          else { const ev = RC.EVENTS[t]; banner(ev.name + ' · ' + ev.sub, ev.color); }
          break;
        }
        case 'stage': {
          const si = e[1] | 0; const st = STAGES[si];
          if (st) { banner('DISTRICT ' + (si + 1) + ' · ' + st.name, st.pal.accent); if (!g.cfg.trainer) { M.points += 10 + si * 5; renderHUD(); } }
          break;
        }
        case 'bossDown': pop('BOSS DOWN · +' + e[2] + ' coins'); sfx('bossdown'); break;
        case 'skill': if (e[2]) pop(String(e[2]).toUpperCase()); break;
        case 'revive': pop('REVIVED'); break;
        case 'ladder': {
          const done = e[1] | 0;
          M.campaign.cleared = Math.max(M.campaign.cleared, done + 1); M.campaign.stage = Math.min(LADDER.length - 1, e[2] | 0);
          M.points += 40 + done * 15; banner('CAMPAIGN · ' + LADDER[Math.min(done, LADDER.length - 1)].name + ' CLEARED', '#34d399'); renderHUD();
          break;
        }
        case 'draft': if (!g.cfg.trainer) showDraft(g, e[1]); break;
        case 'draftPick': hideDraft(); break;
        default: break;
      }
    }
  }

  // ---------------------------------------------------------------- run end
  function achievements(g, dist) {
    const A = M.achs; const gained = [];
    const set = (id, c) => { if (c && !A[id]) { A[id] = true; gained.push(id); } };
    set('first', true); set('k1', dist >= 1000); set('k3', dist >= 3000); set('c1k', M.coins >= 1000); set('lv5', M.level >= 5); set('lv10', M.level >= 10);
    set('sk5', M.skillsFired >= 5); set('zen', g.cfg.mode === 'zen' && dist >= 500); set('hard', g.cfg.mode === 'hardcore' && dist >= 300);
    set('boss', g.bossKills > 0); set('stage7', g.stage >= 6); set('collector', ownedCount() >= 15);
    return gained;
  }
  function onOver(g, score) {
    if (!g || g.cfg.trainer) return null;
    const dist = Math.floor(g.dist), coins = g.coins;
    const mo = MODES[g.cfg.mode] || MODES.classic;
    const xpMul = (mo.speedMul > 1 ? 1.3 : 1) * (g.cfg.upg.xp ? 1.25 : 1) * (g.cfg.boosts.xp ? 1.5 : 1) * (g.cfg.weekendXp ? RC.WEEKEND.xp : 1);
    const gainedXP = Math.round((dist * 0.6 + coins * 5 + g.kills * 8 + g.bossKills * 100) * xpMul);
    const gainedPts = Math.round(dist / 200 + coins * 0.25 + 2 + g.bossKills * 20);
    const lv0 = M.level; const ups = addXP(gainedXP);
    M.points += gainedPts; M.runs++; M.coins += coins; M.kills += g.kills; M.bossKills += g.bossKills; M.skillsFired += g.skillsFired;
    M.best = Math.max(M.best, dist); M.bestByMode[g.cfg.mode] = Math.max(M.bestByMode[g.cfg.mode] || 0, dist);
    const ms = M.missions.prog;
    ms.dist800 = Math.max(ms.dist800 || 0, dist); ms.coins150 = (ms.coins150 || 0) + coins; ms.skills3 = (ms.skills3 || 0) + g.skillsFired;
    ms.runs3 = (ms.runs3 || 0) + 1; ms.kills15 = (ms.kills15 || 0) + g.kills; ms.stages2 = Math.max(ms.stages2 || 0, g.stage + 1);
    const ch = MODE_CH[g.cfg.mode]; if (ch) { const v = ch.stat === 'stage' ? Math.min(M.campaign.cleared, ch.goal) : dist; M.modeCh[g.cfg.mode] = Math.max(M.modeCh[g.cfg.mode] || 0, v); }
    const newAch = achievements(g, dist);
    if (ups) { banner('LEVEL ' + M.level + ' · skills unlocked by level are open', '#a78bfa'); const FX = window.RakazaFX; FX && FX.levelUp && FX.levelUp(); }
    save(); renderHUD();
    const run = {
      name: M.lbName || 'you', metres: dist, coins, near: g.near, kills: g.kills, bossKills: g.bossKills, score,
      pro: !!g.everAI, mode: g.cfg.mode, seed: g.seed, daily: !!g.daily, elapsed: +g.time.toFixed(2), headStart: g.headStart || 0, ver: VERSION,
      ranked: !!g.cfg.ranked, dev: DEV || (g.cfg.startDist | 0) > 0, character: g.cfg.character,
      inputLog: Replay ? Replay.encode(g.log) : '', config: g.cfg, ticks: g.tick, runId: g.agentRun ? g.agentRun.runId : null, agentRun: g.agentRun || null,
    };
    try { window.parent !== window && window.parent.postMessage({ type: 'rakaza-score', metres: dist, coins, score, mode: g.cfg.mode, pro: !!g.everAI, ver: VERSION }, '*'); } catch (e) {}
    const done = (res) => window.dispatchEvent(new CustomEvent('rakaza-run', { detail: { run, res, gainedXP, gainedPts, levelUps: ups, level: M.level, newAch, lv0 } }));
    if (run.dev) done({ ok: true, dev: true }); else if (g.agentRun) done({ ok: true, pending: 'agent-submit' }); else submitRun(run).then(done);
    return run;
  }

  // ---------------------------------------------------------------- per-frame chrome
  let railSig = '';
  function frame() {
    const A = window.__rz2; const g = A && A.game;
    if (g && A.state === 'play') {
      const sig = g.cfg.skills.join(',');
      if (sig !== railSig) { railSig = sig; buildRail(g.cfg.skills); }
      const btns = skillsEl.children;
      for (let i = 0; i < btns.length; i++) {
        const id = railIds[i]; const cd = g.cd[id] || 0; const s = SKILLS[id];
        const tot = (s.cd || 10) * 0.8; const f = cd > 0 ? Math.min(1, cd / Math.max(tot, cd)) : 0;
        btns[i].style.setProperty('--cd', f.toFixed(3)); btns[i].classList.toggle('cool', cd > 0);
      }
      $m('#rmKills', top).textContent = g.kills + ' ☠'; $m('#rmStage', top).textContent = 'S' + (g.stage + 1);
      skillsEl.classList.add('on');
    } else if (A) { skillsEl.classList.remove('on'); if (railSig !== 'idle') { railSig = 'idle'; renderRailIdle(); } }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- hooks + export
  const H = HK();
  H.buildConfig = buildConfig;
  H.fxEquip = fxEquip;
  H.onSimEvents = onSimEvents;
  H.onOverMeta = onOver;
  H.onStartMeta = (g) => { hideDraft(); g.dev = DEV; railSig = ''; };
  H.openShop = (sub) => openTab('shop', sub);
  window.__rzMeta = {
    get meta() { return M; }, save, renderHUD, addXP, openTab, openBoard: () => {} /* the board lives on the site's leaderboard page, never inside the game */, uid, banner, pop, owns, buyItem,
    equipItem, isDev, buildConfig, claimFreeDrop, itemById: (id) => BY_ID[id], get lastCfg() { return lastCfg; }, version: VERSION, fireSkill,
    setStart: (m) => { M.devStart = m | 0; save(); }, unlockAll: () => onDev('unlock'),
  };
  syncChar(); syncLegacy(); renderHUD(); renderRailIdle(); fxEquip();
  requestAnimationFrame(frame);
  (API.mode() === 'server' && !DEV ? API.getProfile(uid) : Promise.resolve(null)).then((d) => {
    if (!d || !d.found || !d.profile) return;
    const p = d.profile;
    if ((p.savedAt || 0) * 1000 >= (lastSaved || 0) && (p.v || 0) >= 5) { M = Object.assign(def(), p, { savedAt: undefined }); try { localStorage.setItem(KEY, JSON.stringify(M)); } catch (e) {} renderHUD(); pop('PROFILE SYNCED'); }
  }).catch(() => {});
})();
