/**
 * Pixel Arcade - Declarative Trophy Engine (Milestone T0/T1)
 * Evaluates rules, manages persistence, awards XP, and triggers retro toast alerts.
 */
(function(root) {
  'use strict';

  const STORAGE_KEY = 'pixelarcade.trophies';

  // Predicate evaluation engine
  function evalCondition(cond, ctx) {
    if (!cond) return true;
    if (cond.all) return cond.all.every(c => evalCondition(c, ctx));
    if (cond.any) return cond.any.some(c => evalCondition(c, ctx));
    if (cond.not) return !evalCondition(cond.not, ctx);

    if (cond.field !== undefined) {
      const val = ctx[cond.field];
      if ('eq' in cond) return val === cond.eq;
      if ('ne' in cond) return val !== cond.ne;
      if ('gt' in cond) return typeof val === 'number' && val > cond.gt;
      if ('gte' in cond) return typeof val === 'number' && val >= cond.gte;
      if ('lt' in cond) return typeof val === 'number' && val < cond.lt;
      if ('lte' in cond) return typeof val === 'number' && val <= cond.lte;
      if ('in' in cond && Array.isArray(cond.in)) return cond.in.includes(val);
    }
    return false;
  }

  let memStorage = null;

  // Load / Save from LocalStorage with in-memory fallback
  function loadStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && typeof d === 'object') {
            return { v: 1, unlocked: d.unlocked || {}, progress: d.progress || {}, owned: d.owned || {} };
          }
        }
      }
    } catch (_) {}
    if (memStorage) return memStorage;
    return { v: 1, unlocked: {}, progress: {}, owned: {} };
  }

  function saveStorage(data) {
    memStorage = data;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arcade:trophies', { detail: data }));
      }
    } catch (_) {}
  }

  // Sound jingle for trophy unlock
  function playTrophyChime() {
    try {
      if (root.Shared && root.Shared.sound && !root.Shared.sound.get()) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 fanfare
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.26);
      });
    } catch (_) {}
  }

  // Toast notification UI
  let toastContainer = null;
  const toastQueue = [];
  let isToastActive = false;

  function ensureToastContainer() {
    if (typeof document === 'undefined') return null;
    if (!toastContainer) {
      toastContainer = document.getElementById('arcade-trophy-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'arcade-trophy-toast-container';
        toastContainer.className = 'fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none select-none';
        document.body.appendChild(toastContainer);
      }
    }
    return toastContainer;
  }

  const TIER_COLORS = {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#00f0ff'
  };

  function displayToast(trophy) {
    const cont = ensureToastContainer();
    if (!cont) return;

    isToastActive = true;
    playTrophyChime();

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto bg-slate-950/95 border-2 rounded-xl p-3 shadow-2xl flex items-center gap-3 transition-all duration-300 transform translate-y-4 opacity-0 max-w-sm';
    toast.style.borderColor = TIER_COLORS[trophy.tier] || '#ffd700';

    toast.innerHTML = `
      <div class="w-10 h-10 rounded-lg flex items-center justify-center bg-black/60 border border-slate-700 shrink-0">
        <svg viewBox="0 0 16 16" class="w-6 h-6" style="fill: ${TIER_COLORS[trophy.tier] || '#ffd700'}">
          <path d="M4 2h8v2H4zM3 4h10v3c0 2.2-1.8 4-4 4h-2c-2.2 0-4-1.8-4-4V4zM1 4h2v2c0 1.1-.9 2-2 2V4zm14 0v4c-1.1 0-2-.9-2-2V4h2zM7 11h2v3H7zm-2 3h6v1H5z"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-1">
          <span class="text-[7px] uppercase font-bold tracking-widest text-amber-400">TROPHY UNLOCKED</span>
          <span class="text-[7px] text-slate-400 font-mono">+${trophy.xp} XP</span>
        </div>
        <div class="text-[9px] font-bold text-white truncate">${trophy.name}</div>
        <div class="text-[7px] text-slate-400 line-clamp-1">${trophy.desc}</div>
      </div>
    `;

    toast.onclick = () => {
      toast.remove();
      pumpQueue();
    };

    cont.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    // Auto dismiss after 4.2 seconds
    setTimeout(() => {
      toast.classList.add('translate-y-4', 'opacity-0');
      setTimeout(() => {
        toast.remove();
        isToastActive = false;
        pumpQueue();
      }, 300);
    }, 4200);
  }

  function pumpQueue() {
    if (isToastActive || toastQueue.length === 0) return;
    const next = toastQueue.shift();
    displayToast(next);
  }

  // Check platinum completion for a game
  function checkPlatinum(store, gameId) {
    if (!gameId || gameId === 'arcade') return;
    const list = ArcadeTrophies.list(gameId);
    const nonPlat = list.filter(t => t.tier !== 'platinum');
    if (nonPlat.length > 0 && nonPlat.every(t => store.unlocked[t.id])) {
      ArcadeTrophies.emit('trophy_unlocked', { gameCompleted: gameId });
    }
  }

  // Main Trophy Engine API
  const ArcadeTrophies = {
    getAllDefinitions() {
      if (root.ArcadeTrophiesData) return root.ArcadeTrophiesData;
      if (typeof require !== 'undefined') {
        try { return require('./trophies-data.js'); } catch(_) {}
      }
      return [];
    },

    list(gameFilter) {
      const defs = this.getAllDefinitions();
      if (!gameFilter || gameFilter === 'all') return defs;
      return defs.filter(t => t.game === gameFilter);
    },

    isUnlocked(trophyId) {
      const store = loadStorage();
      return !!store.unlocked[trophyId];
    },

    getSummary() {
      const defs = this.getAllDefinitions();
      const store = loadStorage();
      const unlockedIds = Object.keys(store.unlocked);

      const counts = { bronze: 0, silver: 0, gold: 0, platinum: 0, total: 0 };
      defs.forEach(t => {
        if (store.unlocked[t.id]) {
          counts[t.tier] = (counts[t.tier] || 0) + 1;
          counts.total++;
        }
      });

      return {
        totalAvailable: defs.length,
        totalUnlocked: counts.total,
        percentage: defs.length > 0 ? Math.round((counts.total / defs.length) * 100) : 0,
        counts,
        unlocked: store.unlocked
      };
    },

    emit(eventName, payload = {}, options = {}) {
      const defs = this.getAllDefinitions();
      const store = loadStorage();
      const currentGame = options.game || payload.game;
      const currentMode = options.mode || payload.mode || 'cpu';

      const newlyUnlocked = [];

      defs.forEach(trophy => {
        // Skip already unlocked
        if (store.unlocked[trophy.id]) return;

        // Event match
        if (trophy.on !== eventName) return;

        // Game match (if trophy is game-specific)
        if (trophy.game !== 'arcade' && currentGame && trophy.game !== currentGame) return;

        // Mode match
        if (trophy.modes && !trophy.modes.includes('all') && !trophy.modes.includes(currentMode)) return;

        // Evaluate conditions
        const context = Object.assign({}, payload, {
          totalUnlocked: Object.keys(store.unlocked).length
        });

        if (evalCondition(trophy.when, context)) {
          // Grant Trophy
          store.unlocked[trophy.id] = {
            t: Date.now(),
            src: trophy.scope || 'local',
            mode: currentMode
          };
          newlyUnlocked.push(trophy);

          // Award XP via Shared economy
          if (root.Shared && root.Shared.addXP) {
            root.Shared.addXP(trophy.game, trophy.xp || 10);
          }
        }
      });

      if (newlyUnlocked.length > 0) {
        saveStorage(store);

        // Queue notifications
        newlyUnlocked.forEach(t => {
          toastQueue.push(t);
        });
        pumpQueue();

        // Check for platinum / arcade meta-trophies
        if (currentGame) {
          checkPlatinum(store, currentGame);
        }
        this.emit('trophy_unlocked', { totalUnlocked: Object.keys(store.unlocked).length });
      }

      return newlyUnlocked;
    },

    reset() {
      memStorage = { v: 1, unlocked: {}, progress: {}, owned: {} };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (_) {}
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arcade:trophies', { detail: { v: 1, unlocked: {}, progress: {} } }));
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArcadeTrophies;
  } else {
    root.ArcadeTrophies = ArcadeTrophies;
  }
})(typeof window !== 'undefined' ? window : globalThis);
