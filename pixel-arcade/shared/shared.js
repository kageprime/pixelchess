/* Pixel Arcade shared module: one profile for every game.
   Storage key pixelchess.v1 is shared with Pixel Chess. This module only ever adds fields (xp, byGame, name),
   never rewrites chess's own fields, and never changes "v": Pixel Chess ignores any save whose v is not 1. */
(function (g) {
  'use strict';
  const KEY = 'pixelchess.v1', SOUND = 'pixelarcade.sound';
  const GAMES = ['chess', 'ayo', 'draughts', 'shogi', 'pool', 'scrabble'];
  /* PLACEHOLDER rank ladder: replace the numbers and titles when the XP economy is decided */
  const RANKS = [[0, 'ROOKIE'], [100, 'CADET'], [300, 'VETERAN'], [700, 'ACE'], [1500, 'LEGEND']];
  const nn = (x, d = 0) => Number.isFinite(x) && x >= 0 ? Math.floor(x) : d;
  let st = null, mem = null, ac = null;
  try { const s = g.localStorage; s.setItem('_s', '1'); s.removeItem('_s'); st = s; } catch (e) { st = null; }

  let memOnly = !st; /* true when storage is blocked or full: keep the profile in memory for this session only */
  function read() {
    let o = null;
    if (!memOnly) { try { const t = st.getItem(KEY); if (t) o = JSON.parse(t); } catch (e) { o = null; } }
    else o = mem;
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  }
  function write(o) {
    mem = o;
    if (memOnly) return false;
    try { st.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { memOnly = true; return false; }
  }
  function rank(xp) {
    let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
    const nx = RANKS[i + 1];
    return { title: RANKS[i][1], min: RANKS[i][0], next: nx ? nx[0] : null };
  }
  function changed() { try { g.dispatchEvent(new CustomEvent('shared:profile')); } catch (e) {} }

  /* PLACEHOLDER XP amounts, owned by the hub. Games must use these, never their own numbers. */
  const XP = { win: 25, loss: 5 };
  const Shared = {
    games: GAMES.slice(),
    XP,
    /* Records a finished game for the per-game best line (wins, losses, streak, best streak). Does not award XP. */
    recordGame(game, won) {
      if (!GAMES.includes(game)) return null;
      const o = read() || { v: 1 };
      if (!o.byGame || typeof o.byGame !== 'object' || Array.isArray(o.byGame)) o.byGame = {};
      const b = o.byGame[game] && typeof o.byGame[game] === 'object' ? o.byGame[game] : (o.byGame[game] = {});
      if (won) { b.w = nn(b.w) + 1; b.streak = nn(b.streak) + 1; b.best = Math.max(nn(b.best), b.streak); }
      else { b.l = nn(b.l) + 1; b.streak = 0; b.best = nn(b.best); }
      write(o); changed();
      return { w: nn(b.w), l: nn(b.l), streak: b.streak, best: b.best };
    },
    /* Games call this and nothing else to award XP. Returns {xp, rank, game} or null when the call is invalid. */
    addXP(game, n) {
      n = Math.floor(Number(n));
      if (!GAMES.includes(game) || !Number.isFinite(n) || n <= 0) return null;
      const o = read() || { v: 1 };
      o.xp = nn(o.xp) + n;
      if (!o.byGame || typeof o.byGame !== 'object' || Array.isArray(o.byGame)) o.byGame = {};
      const b = o.byGame[game] && typeof o.byGame[game] === 'object' ? o.byGame[game] : (o.byGame[game] = {});
      b.xp = nn(b.xp) + n;
      write(o); changed();
      return { game, xp: o.xp, rank: rank(o.xp) };
    },
    setName(name) {
      name = String(name || '').trim().slice(0, 12);
      const o = read() || { v: 1 };
      if (name) o.name = name; else delete o.name;
      write(o); changed();
    },
    /* Read-only view for the hub header and best lines. */
    profile() {
      const o = read() || {}, xp = nn(o.xp);
      const t = o.total && typeof o.total === 'object' ? o.total : {};
      return {
        name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 12).toUpperCase() : 'PLAYER',
        xp, rank: rank(xp),
        chess: { streak: nn(o.streak), best: Math.max(nn(o.bestStreak), nn(o.streak)), played: nn(t.w) + nn(t.l) + nn(t.d) },
        games: Object.fromEntries(GAMES.map(k => { const b = o.byGame && o.byGame[k] && typeof o.byGame[k] === 'object' ? o.byGame[k] : {}; return [k, { w: nn(b.w), l: nn(b.l), streak: nn(b.streak), best: nn(b.best), played: nn(b.w) + nn(b.l) }]; })),
        persistent: !!st
      };
    },
    sound: {
      get() { try { return !(st && st.getItem(SOUND) === '0'); } catch (e) { return true; } },
      set(on) { try { st && st.setItem(SOUND, on ? '1' : '0'); } catch (e) {} changed(); },
      toggle() { const v = !this.get(); this.set(v); return v; }
    },
    /* Short click blip, only when sound is on. Safe to call anywhere. */
    blip(freq) {
      if (!Shared.sound.get()) return;
      try {
        ac = ac || new (g.AudioContext || g.webkitAudioContext)();
        if (ac.state === 'suspended') ac.resume();
        const t = ac.currentTime, o = ac.createOscillator(), v = ac.createGain();
        o.type = 'square'; o.frequency.value = freq || 660;
        v.gain.setValueAtTime(.05, t); v.gain.exponentialRampToValueAtTime(.0001, t + .06);
        o.connect(v); v.connect(ac.destination); o.start(t); o.stop(t + .07);
      } catch (e) {}
    }
  };
  g.addEventListener('storage', e => { if (e.key === KEY || e.key === SOUND) changed(); });
  g.Shared = Object.freeze(Shared);
})(window);
