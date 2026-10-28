// Rakaza input kit: one input API for touch, keyboard, mouse and gamepad.
// The game calls RakazaInput.configure(...) to get on-screen touch controls, reads
// RakazaInput.read() every frame, and uses RakazaInput.on(action, fn) for menus.
(function () {
  if (window.RakazaInput) return;

  // Common gamepad stick deadzone; the widescreen prompt already used this value.
  var DEADZONE = 0.15;
  // Unvalidated: stick radius and button size, picked above the 44pt minimum touch target.
  var STICK_RADIUS = 56;
  var BUTTON_SIZE = 68;
  // v14: Ride 'Em Rakaza lays the buttons out itself (big JUMP bottom-right, SLIDE bottom-left)
  var BIG_A = 96, BIG_B = 80;
  var PAUSE_SIZE = 44;
  // Default share of the screen width and height, from the bottom-left corner, that catches move touches.
  // Games can change it with configure({ moveArea: { width, height } }).
  var MOVE_AREA = 0.45;
  // Unvalidated: pixels of mouse or touch drag that count as a full look input.
  var LOOK_PIXELS = 24;
  // iPhone safe-area insets; a page inside an iframe gets no env() values.
  var SAFE = { portrait: { top: 59, bottom: 34, side: 16 }, landscape: { top: 16, bottom: 21, side: 59 } };

  var MOVE_KEYS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  var ACTION_KEYS = { Space: 'a', Enter: 'a', KeyJ: 'a', KeyZ: 'a', ShiftLeft: 'b', ShiftRight: 'b', KeyK: 'b', KeyX: 'b', Escape: 'pause', KeyP: 'pause' };
  var GAMEPAD_BUTTONS = { 0: 'a', 1: 'b', 2: 'b', 9: 'pause' };
  var ACTIONS = ['a', 'b', 'pause'];

  var config = null;
  var controlsShown = true;
  var device = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches ? 'touch' : 'keyboard';
  var keys = {};
  var held = { a: false, b: false, pause: false };
  var sources = { keyboard: {}, touch: {}, gamepad: {} };
  var pressed = { a: false, b: false, pause: false };
  var listeners = { a: [], b: [], pause: [], device: [] };
  var stick = { x: 0, y: 0, pointer: null, originX: 0, originY: 0 };
  var gamepad = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
  var lookDrag = { x: 0, y: 0, pointer: null, lastX: 0, lastY: 0 };
  var ui = null;

  function clamp(value) { return Math.max(-1, Math.min(1, value)); }
  function deadzone(value) { return Math.abs(value) < DEADZONE ? 0 : value; }
  function limit(vector) {
    var length = Math.hypot(vector.x, vector.y);
    return length > 1 ? { x: vector.x / length, y: vector.y / length } : vector;
  }

  function setDevice(next) {
    if (device === next) return;
    device = next;
    render();
    listeners.device.forEach(function (fn) { fn(device); });
  }

  function setAction(source, action, down) {
    sources[source][action] = down;
    var now = Boolean(sources.keyboard[action] || sources.touch[action] || sources.gamepad[action]);
    if (now && !held[action]) {
      pressed[action] = true;
      listeners[action].forEach(function (fn) { fn(); });
    }
    held[action] = now;
  }

  function keyboardMove() {
    var x = 0, y = 0;
    Object.keys(MOVE_KEYS).forEach(function (code) {
      if (keys[code]) { x += MOVE_KEYS[code][0]; y += MOVE_KEYS[code][1]; }
    });
    return limit({ x: x, y: y });
  }

  function isTextField(target) {
    return Boolean(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));
  }

  addEventListener('keydown', function (event) {
    if (!MOVE_KEYS[event.code] && !ACTION_KEYS[event.code]) return;
    if (isTextField(event.target)) return;
    // Buttons and links keep their own Enter and Space.
    if (!/^(BUTTON|A)$/.test(event.target && event.target.tagName)) event.preventDefault();
    setDevice('keyboard');
    keys[event.code] = true;
    if (ACTION_KEYS[event.code]) setAction('keyboard', ACTION_KEYS[event.code], true);
  });
  addEventListener('keyup', function (event) {
    keys[event.code] = false;
    if (ACTION_KEYS[event.code]) setAction('keyboard', ACTION_KEYS[event.code], Object.keys(ACTION_KEYS).some(function (code) {
      return keys[code] && ACTION_KEYS[code] === ACTION_KEYS[event.code];
    }));
  });
  addEventListener('blur', function () {
    keys = {};
    ACTIONS.forEach(function (action) { setAction('keyboard', action, false); });
  });

  addEventListener('pointerdown', function (event) {
    setDevice(event.pointerType === 'touch' ? 'touch' : 'keyboard');
  }, true);
  addEventListener('pointermove', function (event) {
    if (event.pointerType === 'mouse' && (document.pointerLockElement || event.buttons)) {
      lookDrag.x += event.movementX;
      lookDrag.y += event.movementY;
    }
  });

  function pollGamepads() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var active = null;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { active = pads[i]; break; }
    if (active) {
      var axes = active.axes;
      var button = function (index) { return Boolean(active.buttons[index] && active.buttons[index].pressed); };
      var dx = (button(15) ? 1 : 0) - (button(14) ? 1 : 0);
      var dy = (button(13) ? 1 : 0) - (button(12) ? 1 : 0);
      gamepad.move = limit({ x: deadzone(axes[0] || 0) || dx, y: deadzone(axes[1] || 0) || dy });
      gamepad.look = { x: deadzone(axes[2] || 0), y: deadzone(axes[3] || 0) };
      var used = gamepad.move.x || gamepad.move.y || gamepad.look.x || gamepad.look.y;
      Object.keys(GAMEPAD_BUTTONS).forEach(function (index) {
        if (button(Number(index))) used = true;
      });
      ACTIONS.forEach(function (action) {
        setAction('gamepad', action, Object.keys(GAMEPAD_BUTTONS).some(function (index) {
          return GAMEPAD_BUTTONS[index] === action && button(Number(index));
        }));
      });
      if (used) setDevice('gamepad');
    } else {
      gamepad.move = { x: 0, y: 0 };
      gamepad.look = { x: 0, y: 0 };
      ACTIONS.forEach(function (action) { setAction('gamepad', action, false); });
    }
    requestAnimationFrame(pollGamepads);
  }
  requestAnimationFrame(pollGamepads);

  function el(tag, style, parent) {
    var node = document.createElement(tag);
    node.style.cssText = style;
    if (parent) parent.appendChild(node);
    return node;
  }

  var ROUND = 'position:absolute;border-radius:50%;box-sizing:border-box;background:rgba(255,255,255,0.14);border:2px solid rgba(255,255,255,0.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#fff;font:700 16px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;pointer-events:auto;';

  function buildUi() {
    ui = el('div', 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;');
    ui.id = 'rakaza-input-ui';
    ui.addEventListener('contextmenu', function (event) { event.preventDefault(); });

    ui.moveZone = el('div', 'position:absolute;left:0;bottom:0;pointer-events:auto;touch-action:none;', ui);
    ui.base = el('div', ROUND + 'width:' + STICK_RADIUS * 2 + 'px;height:' + STICK_RADIUS * 2 + 'px;opacity:0.9;', ui.moveZone);
    ui.knob = el('div', ROUND + 'width:' + STICK_RADIUS + 'px;height:' + STICK_RADIUS + 'px;background:rgba(255,255,255,0.4);', ui.base);
    ui.knob.style.left = ui.knob.style.top = STICK_RADIUS / 2 - 2 + 'px';
    ui.moveZone.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      stick.pointer = event.pointerId;
      ui.moveZone.setPointerCapture(event.pointerId);
      var zone = ui.moveZone.getBoundingClientRect();
      stick.originX = event.clientX - zone.left;
      stick.originY = event.clientY - zone.top;
      ui.base.style.left = stick.originX - STICK_RADIUS + 'px';
      ui.base.style.top = stick.originY - STICK_RADIUS + 'px';
      moveStick(event);
    });
    ui.moveZone.addEventListener('pointermove', function (event) { if (event.pointerId === stick.pointer) moveStick(event); });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      ui.moveZone.addEventListener(type, function (event) {
        if (event.pointerId !== stick.pointer) return;
        stick.pointer = null;
        stick.x = stick.y = 0;
        ui.knob.style.transform = '';
        placeStick();
      });
    });

    ui.lookZone = el('div', 'position:absolute;right:0;top:0;width:55%;height:100%;pointer-events:auto;touch-action:none;', ui);
    ui.lookZone.addEventListener('pointerdown', function (event) {
      lookDrag.pointer = event.pointerId;
      lookDrag.lastX = event.clientX;
      lookDrag.lastY = event.clientY;
      ui.lookZone.setPointerCapture(event.pointerId);
    });
    ui.lookZone.addEventListener('pointermove', function (event) {
      if (event.pointerId !== lookDrag.pointer) return;
      lookDrag.x += event.clientX - lookDrag.lastX;
      lookDrag.y += event.clientY - lookDrag.lastY;
      lookDrag.lastX = event.clientX;
      lookDrag.lastY = event.clientY;
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      ui.lookZone.addEventListener(type, function (event) { if (event.pointerId === lookDrag.pointer) lookDrag.pointer = null; });
    });

    ui.buttons = {};
    ACTIONS.forEach(function (action) {
      var size = action === 'pause' ? PAUSE_SIZE : action === 'a' ? BIG_A : BIG_B;
      var button = el('div', ROUND + 'width:' + size + 'px;height:' + size + 'px;', ui);
      button.dataset.action = action;
      button.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        event.stopPropagation();
        button.setPointerCapture(event.pointerId);
        button.style.filter = 'brightness(1.8)'; button.style.transform = 'scale(.94)';
        setAction('touch', action, true);
      });
      ['pointerup', 'pointercancel'].forEach(function (type) {
        button.addEventListener(type, function () {
          button.style.filter = ''; button.style.transform = '';
          setAction('touch', action, false);
        });
      });
      ui.buttons[action] = button;
    });
    ui.buttons.pause.textContent = 'II';
    document.body.appendChild(ui);
    addEventListener('resize', layout);
  }

  function moveStick(event) {
    var zone = ui.moveZone.getBoundingClientRect();
    var dx = event.clientX - zone.left - stick.originX;
    var dy = event.clientY - zone.top - stick.originY;
    var value = limit({ x: dx / STICK_RADIUS, y: dy / STICK_RADIUS });
    stick.x = value.x;
    stick.y = value.y;
    ui.knob.style.transform = 'translate(' + value.x * STICK_RADIUS * 0.6 + 'px,' + value.y * STICK_RADIUS * 0.6 + 'px)';
  }

  function placeStick() {
    var safe = SAFE[innerWidth > innerHeight ? 'landscape' : 'portrait'];
    var zone = ui.moveZone.getBoundingClientRect();
    ui.base.style.left = safe.side + 8 + 'px';
    ui.base.style.top = zone.height - safe.bottom - 8 - STICK_RADIUS * 2 + 'px';
  }

  function layout() {
    if (!ui || !config) return;
    var landscape = innerWidth > innerHeight;
    var safe = SAFE[landscape ? 'landscape' : 'portrait'];
    var gap = 14;
    ui.moveZone.style.display = config.move ? 'block' : 'none';
    ui.moveZone.style.width = config.moveArea.width * 100 + '%';
    ui.moveZone.style.height = config.moveArea.height * 100 + '%';
    ui.lookZone.style.display = config.look ? 'block' : 'none';
    var a = ui.buttons.a, b = ui.buttons.b, pause = ui.buttons.pause;
    a.style.display = config.buttons.a ? 'flex' : 'none';
    b.style.display = config.buttons.b ? 'flex' : 'none';
    pause.style.display = 'none'; // v14 has its own pause button in the HUD
    a.textContent = config.buttons.a || '';
    b.textContent = config.buttons.b || '';
    a.style.right = Math.max(14, safe.side - 6) + 'px';
    a.style.bottom = Math.max(18, safe.bottom - 6) + 'px';
    b.style.left = Math.max(14, safe.side - 6) + 'px';
    b.style.right = '';
    b.style.bottom = Math.max(18, safe.bottom - 6) + 'px';
    a.style.fontSize = '17px'; b.style.fontSize = '14px'; a.style.letterSpacing = b.style.letterSpacing = '.08em';
    a.style.background = 'rgba(244,114,182,0.22)'; a.style.borderColor = 'rgba(244,114,182,0.7)';
    b.style.background = 'rgba(34,211,238,0.16)'; b.style.borderColor = 'rgba(34,211,238,0.6)';
    // Portrait: top-center, since games put their score in the top corners and the room kit's Invite button sits
    // top-left. Landscape keeps the top-right spot that games already out were made around, which score top-center.
    pause.style.left = landscape ? '' : 'calc(50% - ' + PAUSE_SIZE / 2 + 'px)';
    pause.style.right = landscape ? safe.side + 'px' : '';
    pause.style.top = safe.top + 'px';
    if (stick.pointer === null) placeStick();
  }

  function render() {
    if (!ui) return;
    ui.style.display = config && controlsShown && device === 'touch' ? 'block' : 'none';
    layout();
  }

  function whenReady(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  window.RakazaInput = {
    // Shows on-screen touch controls for the actions the game uses.
    configure: function (options) {
      options = options || {};
      var area = options.moveArea || {};
      var fraction = function (value) { return typeof value === 'number' && value > 0 && value <= 1 ? value : MOVE_AREA; };
      config = {
        move: options.move !== false,
        moveArea: { width: fraction(area.width), height: fraction(area.height) },
        look: Boolean(options.look),
        buttons: options.buttons || { a: 'A' },
        pause: options.pause !== false,
      };
      whenReady(function () {
        if (!ui) buildUi();
        render();
      });
    },
    // Hides the touch controls on menus and game-over screens so their buttons can be tapped.
    showControls: function (shown) {
      controlsShown = shown !== false;
      render();
    },
    // Current input; call once per frame. pressed is true once for each new press.
    read: function () {
      var move = keyboardMove();
      if (!move.x && !move.y) move = { x: stick.x, y: stick.y };
      if (!move.x && !move.y) move = gamepad.move;
      var look = limit({ x: clamp(lookDrag.x / LOOK_PIXELS) || gamepad.look.x, y: clamp(lookDrag.y / LOOK_PIXELS) || gamepad.look.y });
      lookDrag.x = lookDrag.y = 0;
      var state = {
        move: { x: move.x, y: move.y },
        look: look,
        a: held.a,
        b: held.b,
        pause: held.pause,
        pressed: { a: pressed.a, b: pressed.b, pause: pressed.pause },
        device: device,
      };
      pressed = { a: false, b: false, pause: false };
      return state;
    },
    // Runs fn on each new press of 'a', 'b' or 'pause', or with the device name on 'device'.
    on: function (action, fn) {
      if (!Object.prototype.hasOwnProperty.call(listeners, action)) {
        console.warn('RakazaInput.on: unknown action "' + action + '". Use a, b, pause or device.');
        return function () {};
      }
      listeners[action].push(fn);
      return function () { listeners[action] = listeners[action].filter(function (item) { return item !== fn; }); };
    },
    get device() { return device; },
  };
})();
