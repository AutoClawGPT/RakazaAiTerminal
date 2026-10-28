// v17 mobile + web layer (additive). Fullscreen button, haptics, orientation hint. No game rules here.
(function () {
  'use strict';
  var inFrame = window.parent !== window;
  var fsApi = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } } };

  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFullscreen() {
    var el = document.documentElement;
    if (fsApi) {
      if (isFull()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      var p = req && req.call(el);
      if (p && p.catch) p.catch(function () { if (inFrame) parent.postMessage({ rakaza: 'fs-toggle' }, location.origin); });
      try { var o = screen.orientation; if (o && o.lock && innerHeight < 520) o.lock('landscape').catch(function () {}); } catch (e) {}
      return;
    }
    // iPhone Safari has no Fullscreen API for pages: ask the host page for a CSS fullscreen.
    if (inFrame) parent.postMessage({ rakaza: 'fs-toggle' }, location.origin);
  }
  window.RakazaMobile = { toggleFullscreen: toggleFullscreen, isFull: isFull };

  function addButton() {
    if (document.getElementById('rzFs')) return;
    var canFull = fsApi || inFrame;
    if (!canFull) return;
    var b = document.createElement('button');
    b.id = 'rzFs'; b.type = 'button'; b.title = 'Fullscreen'; b.setAttribute('aria-label', 'Toggle fullscreen');
    b.textContent = '⛶';
    b.addEventListener('click', function (e) { e.stopPropagation(); toggleFullscreen(); });
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    var top = document.getElementById('rmTop');
    if (top) top.appendChild(b);
    else { b.style.cssText = 'position:fixed;right:8px;top:8px;z-index:90;background:#08090be0'; document.body.appendChild(b); }
  }

  // Haptics: a short buzz on a touch press of the on-screen Jump / Slide buttons or the play field (Android; iOS ignores it).
  function haptic(ms) { if (LS.get('rz_haptics', '1') !== '0' && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch' || !e.target || !e.target.closest) return;
    if (e.target.closest('#rakaza-input-ui')) haptic(14);
    else if (e.target.id === 'world') haptic(8);
  }, true);

  // A click or tap anywhere in the game gives it keyboard focus (needed when it is embedded in the site page).
  addEventListener('pointerdown', function () { try { window.focus(); } catch (e) {} }, true);

  // Block pull-to-refresh / rubber-band on the page itself, never on scrollable panels.
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) return;
    var t = e.target;
    while (t && t !== document.body) { if (t.scrollHeight > t.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(t).overflowY)) return; t = t.parentNode; }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  ['gesturestart', 'gesturechange'].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); }); });

  document.addEventListener('fullscreenchange', function () {
    var b = document.getElementById('rzFs'); if (b) b.textContent = isFull() ? '✕' : '⛶';
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(addButton, 60); });
  else setTimeout(addButton, 60);
  // the top bar is built by the meta layer after load; re-attach if it appears later
  var tries = 0, iv = setInterval(function () { tries++; var top = document.getElementById('rmTop'); var b = document.getElementById('rzFs'); if (top && b && b.parentNode !== top) top.appendChild(b); else if (!b) addButton(); if (tries > 30) clearInterval(iv); }, 300);
})();
