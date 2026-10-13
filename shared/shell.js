/* Pixel Arcade shell: one cross-game chrome (sidebar drawer, start-screen helpers, snapshots).
   Dependency-free on purpose: some games (chess) do not load shared.js. Games opt in via
   ArcadeShell.init() and call save()/load() with JSON-serialisable state. Snapshots live under
   pixelarcade.save.<game> as {v:1, t, state}. All user-derived strings are set with
   textContent, never innerHTML. */
(function (g) {
  'use strict';
  var KEY = 'pixelarcade.save.';
  var store = null;
  try { var s = g.localStorage; s.setItem('_sh', '1'); s.removeItem('_sh'); store = s; } catch (e) { store = null; }

  function readRaw(game) {
    if (!store) return null;
    try {
      var t = store.getItem(KEY + game);
      if (!t) return null;
      var o = JSON.parse(t);
      return o && typeof o === 'object' && o.v === 1 && o.state && typeof o.state === 'object' ? o : null;
    } catch (e) { return null; }
  }

  var Shell = {
    /* ---- snapshots ---- */
    save: function (game, state) {
      if (!game || !state || typeof state !== 'object') return false;
      if (!store) return false;
      try { store.setItem(KEY + game, JSON.stringify({ v: 1, t: Date.now(), state: state })); return true; }
      catch (e) { return false; }
    },
    load: function (game) { return readRaw(game); },
    has: function (game) { return !!readRaw(game); },
    clear: function (game) { try { store && store.removeItem(KEY + game); } catch (e) {} },
    /* every game with a snapshot, newest first (for a hub Continue Playing row) */
    list: function () {
      var out = [];
      if (!store) return out;
      try {
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i);
          if (k && k.indexOf(KEY) === 0) {
            var o = readRaw(k.slice(KEY.length));
            if (o) out.push({ game: k.slice(KEY.length), t: o.t || 0 });
          }
        }
      } catch (e) {}
      out.sort(function (a, b) { return b.t - a.t; });
      return out;
    },
    /* fn() returns state to snapshot, or null to skip. Wires pagehide autosave. */
    autosave: function (game, fn) {
      g.addEventListener('pagehide', function () {
        try { var st = fn(); if (st) Shell.save(game, st); } catch (e) {}
      });
    },

    /* ---- sidebar drawer ----
       cfg: { game, title, mount (selector for inline FAB, else floating),
              who (string for the profile line, '' to hide),
              canResume(), onResume(), canRestart(), onRestart(),
              soundLabel(), onSound(), foot } */
    init: function (cfg) {
      cfg = cfg || {};
      var game = cfg.game || 'game', title = cfg.title || 'ARCADE';
      var lastFocus = null;

      var fab = document.createElement('button');
      fab.type = 'button'; fab.className = 'sh-fab';
      fab.setAttribute('aria-label', 'Open arcade menu'); fab.setAttribute('aria-haspopup', 'dialog');
      fab.textContent = '\u2630';
      var mount = cfg.mount ? document.querySelector(cfg.mount) : null;
      if (mount) { mount.classList.add('sh-mount'); mount.appendChild(fab); }
      else document.body.appendChild(fab);
      if (cfg.fabClass) fab.className += ' ' + cfg.fabClass;

      var scrim = document.createElement('div');
      scrim.className = 'sh-scrim';
      var dw = document.createElement('aside');
      dw.className = 'sh-drawer'; dw.setAttribute('role', 'dialog');
      dw.setAttribute('aria-modal', 'true'); dw.setAttribute('aria-label', title + ' arcade menu');
      dw.setAttribute('aria-hidden', 'true');

      var h = document.createElement('h2'); h.textContent = title;
      var sub = document.createElement('p'); sub.className = 'sh-sub'; sub.textContent = 'ARCADE MENU';
      dw.appendChild(h); dw.appendChild(sub);

      var who = document.createElement('p'); who.className = 'sh-who'; who.hidden = !cfg.who;
      dw.appendChild(who);

      function mkBtn(label, primary) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'sh-btn' + (primary ? ' primary' : '');
        b.textContent = label; dw.appendChild(b); return b;
      }
      var bResume = mkBtn('\u25B6 CONTINUE', true);
      var bRestart = mkBtn('\u21BB RESTART', false);
      var bSound = mkBtn('SOUND: ON', false);
      if (cfg.sound === false) bSound.hidden = true;
      var bQuit = document.createElement('a');
      bQuit.className = 'sh-btn'; bQuit.href = '../index.html'; bQuit.textContent = '\u25A0 QUIT TO ARCADE';
      dw.appendChild(bQuit);
      var bClose = mkBtn('\u2715 CLOSE', false);
      var foot = document.createElement('p'); foot.className = 'sh-foot';
      foot.textContent = cfg.foot || 'PROGRESS SAVES WHEN YOU QUIT';
      dw.appendChild(foot);
      document.body.appendChild(scrim); document.body.appendChild(dw);

      function refresh() {
        var w = null;
        try { w = (typeof cfg.who === 'function') ? cfg.who() : cfg.who; } catch (e) {}
        who.hidden = !w; if (w) who.textContent = w;
        var rs = false;
        try { rs = !!(cfg.canResume ? cfg.canResume() : Shell.has(game)); } catch (e) {}
        bResume.hidden = !rs;
        var rr = true;
        try { rr = cfg.canRestart ? !!cfg.canRestart() : true; } catch (e) {}
        bRestart.hidden = !rr;
        var label = 'SOUND: ON';
        try { label = cfg.soundLabel ? cfg.soundLabel() : label; } catch (e) {}
        bSound.textContent = label;
      }
      function open() {
        lastFocus = document.activeElement;
        refresh();
        scrim.classList.add('on'); dw.classList.add('on');
        dw.setAttribute('aria-hidden', 'false');
        var first = dw.querySelector('.sh-btn:not([hidden])');
        if (first) first.focus({ preventScroll: true });
      }
      function close() {
        scrim.classList.remove('on'); dw.classList.remove('on');
        dw.setAttribute('aria-hidden', 'true');
        if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
        fab.focus({ preventScroll: true });
      }
      function isOpen() { return dw.classList.contains('on'); }
      fab.addEventListener('click', open);
      bClose.addEventListener('click', close);
      scrim.addEventListener('click', close);
      dw.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      });
      bResume.addEventListener('click', function () { close(); try { cfg.onResume && cfg.onResume(); } catch (e) {} });
      bRestart.addEventListener('click', function () { close(); try { cfg.onRestart && cfg.onRestart(); } catch (e) {} });
      bSound.addEventListener('click', function () { try { cfg.onSound && cfg.onSound(); } catch (e) {} refresh(); });
      bQuit.addEventListener('click', function () {
        try { cfg.onQuit && cfg.onQuit(); } catch (e) {}
      });
      return { open: open, close: close, isOpen: isOpen, refresh: refresh, fab: fab, drawer: dw };
    }
  };
  g.ArcadeShell = Object.freeze(Shell);
})(window);
