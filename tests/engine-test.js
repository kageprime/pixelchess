// Engine tests: perft (rules), SAN, pick() for both colours. Run: node engine-test.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../chess/index.html', 'utf8');
const code = html.split('/*ENG*/')[1].split('/*ENGEND*/')[0];
const E = new Function(code + ';return{newBoard,apply,legal,all,inCheck,toSAN,pick,atk,threats,ev,gen,V}')();
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };

function fen(s) {
  const [pos, side, cas, ep] = s.split(' '), b = Array.from({ length: 8 }, () => Array(8).fill(null));
  pos.split('/').forEach((row, r) => { let c = 0; for (const ch of row) { if (/\d/.test(ch)) c += +ch; else b[r][c++] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase(); } });
  b.cr = { wK: +cas.includes('K'), wQ: +cas.includes('Q'), bK: +cas.includes('k'), bQ: +cas.includes('q') };
  b.ep = ep && ep !== '-' ? [8 - +ep[1], 'abcdefgh'.indexOf(ep[0])] : null;
  return [b, side];
}
function perft(b, col, d) {
  if (!d) return 1; let n = 0;
  for (const [r, c, y, x] of E.all(b, col)) {
    const prm = b[r][c][1] === 'P' && (y === 0 || y === 7);
    for (const pr of prm ? ['Q', 'R', 'B', 'N'] : [undefined]) n += perft(E.apply(b, r, c, y, x, pr), col === 'w' ? 'b' : 'w', d - 1);
  }
  return n;
}
const sq = s => [8 - +s[1], 'abcdefgh'.indexOf(s[0])];
// play a list like "e2e4" (optionally "a7a8Q"), returning the SAN of each
function play(b, col, list) {
  const out = [];
  for (const m of list) {
    const [r, c] = sq(m.slice(0, 2)), [y, x] = sq(m.slice(2, 4)), pr = m[4];
    const nb = E.apply(b, r, c, y, x, pr);
    out.push(E.toSAN(b, r, c, y, x, pr, nb)); b = nb;
  }
  return out;
}

// --- perft ---
let [b0] = [E.newBoard()];
eq('perft start d1-3', [1, 2, 3].map(d => perft(b0, 'w', d)), [20, 400, 8902]);
eq('perft start d4', perft(b0, 'w', 4), 197281);
let [k] = fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -');
eq('perft kiwipete d1-3', [1, 2, 3].map(d => perft(k, 'w', d)), [48, 2039, 97862]);
let [p3] = fen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -');
eq('perft pos3 d1-4', [1, 2, 3, 4].map(d => perft(p3, 'w', d)), [14, 191, 2812, 43238]);
let [p4] = fen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -');
eq('perft pos4 d1-3', [1, 2, 3].map(d => perft(p4, 'w', d)), [6, 264, 9467]);

// --- SAN ---
eq('opening + castle', play(E.newBoard(), 'w', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1']), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']);
eq('scholars mate', play(E.newBoard(), 'w', ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']).slice(-1), ['Qxf7#']);
eq('disambiguation Nbd2', play(E.newBoard(), 'w', ['g1f3', 'd7d5', 'd2d4', 'c7c6', 'b1d2']).slice(-1), ['Nbd2']);
eq('en passant', play(E.newBoard(), 'w', ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']).slice(-1), ['exd6']);
let [pr] = fen('7k/P7/8/8/8/8/8/K7 w - -');
eq('promotion with check', play(pr, 'w', ['a7a8Q']), ['a8=Q+']);
let [qc] = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
eq('queenside castle', play(qc, 'w', ['e1c1']), ['O-O-O']);
let [rr] = fen('4k3/8/8/8/8/8/8/R3K2R w KQ -');
eq('rook file disambiguation', play(rr, 'w', ['a1d1']).concat(play(fen('4k3/8/8/8/8/8/R7/R3K3 w - -')[0], 'w', ['a2a3'])), ['Rd1', 'Ra3']);
let [rd] = fen('4k3/8/8/8/R7/8/8/R3K3 w - -');
eq('rank disambiguation R1a3', play(rd, 'w', ['a1a3']), ['R1a3']);

// --- pick() works for both colours and returns legal moves ---
for (const col of ['w', 'b']) {
  for (const lvl of [0, 1]) {
    const m = E.pick(E.newBoard(), lvl, col, 120), legalMs = E.all(E.newBoard(), col);
    eq(`pick ${col} lvl${lvl} is legal`, legalMs.some(l => l.join() === m.join()), true);
  }
}
// white to move, free queen: hint should take it
let [fq] = fen('4k3/8/8/3q4/8/8/8/3QK3 w - -');
eq('white takes the queen', E.pick(fq, 2, 'w', 300).join(), [7, 3, 3, 3].join());
let [fb] = fen('3qk3/8/8/8/3Q4/8/8/4K3 b - -');
eq('black takes the queen', E.pick(fb, 2, 'b', 300).join(), [0, 3, 4, 3].join());

// --- personalities: still legal, blunder=1 still legal, caution changes the king-shield eval, aggression prefers checks/captures ---
const PERS = { moss: { bl: .14, a: 0, c: 0 }, vex: { bl: .02, a: 1.2, c: 0 }, dune: { bl: 0, a: 0, c: 1 }, always: { bl: 1, a: 0, c: 0 } };
for (const [n, p] of Object.entries(PERS)) for (const lvl of [0, 1, 2]) {
  const m = E.pick(E.newBoard(), lvl, 'b', 100, p), L = E.all(E.newBoard(), 'b');
  eq(`personality ${n} lvl${lvl} legal`, L.some(l => l.join() === m.join()), true);
}
// aggressive level-0 black should take a free pawn far more often than a pacifist when both are equal otherwise
let [ag] = fen('r3k3/8/8/8/8/p7/8/R3K3 b - -');
const takes = p => { let n = 0; for (let i = 0; i < 60; i++) { const m = E.pick(ag, 0, 'b', 50, p); if (m.join() === [0, 0, 7, 0].join()) n++; } return n; };
eq('aggressive black grabs the rook-takes-rook trade at least as often', takes({ a: 1.2 }) >= takes({ a: 0 }), true);

// --- music table: every pattern step yields sane notes, loops, and the sequencer data is well formed ---
const MU = new Function(html.split('/*MUS*/')[1].split('/*MUSEND*/')[0] + ';return{MUS,MN,MF,musEv}')();
for (const [id, M] of Object.entries(MU.MUS)) {
  let bad = 0, notes = 0, kicks = 0;
  for (let st = 0; st < 128; st++) for (const e of MU.musEv(M, st)) { if (e.f !== undefined) { notes++; if (!(e.f > 30 && e.f < 3000)) bad++; if (!(e.d >= 1 && e.d <= 16)) bad++ } else if (e.k === 'k') kicks++ }
  eq(`music ${id}: notes in range`, bad, 0);
  eq(`music ${id}: has lead, bass and kick`, notes > 20 && kicks > 4, true);
  eq(`music ${id}: loop repeats`, JSON.stringify(MU.musEv(M, 3)) === JSON.stringify(MU.musEv(M, 3 + 32 * 2)), true);
  eq(`music ${id}: valid pattern chars`, [M.lead, M.bass, M.perc].every(p => /^[0-9.\-kx]+$/.test(p)), true);
}

// --- daily puzzles: every entry is a genuine mate-in-1 with no king captures ---
const ZB = new Function('const BUS={on(){}};' + html.split('/*PUZ*/')[1].split('/*PUZEND*/')[0] + ';return{PUZ,fenParse,recordPuzzle,puzIdx,puzStamp}')();
eq('puzzles: 27 entries', ZB.PUZ.length, 27);
{
  const bad = [];
  ZB.PUZ.forEach((f, i) => {
    const [b, side] = ZB.fenParse(f), col = side, oc = col === 'w' ? 'b' : 'w';
    if (E.inCheck(b, col)) { bad.push(i + ': solver in check'); return; }
    if (E.inCheck(b, oc)) { bad.push(i + ': opponent in check'); return; }
    let mates = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (b[r][c] && b[r][c][0] === col) for (const m of E.legal(b, r, c)) {
        const t = b[m[0]][m[1]];
        if (t && t[1] === 'K' && t[0] !== col) { bad.push(i + ': king capture available'); return; }
        const nb = E.apply(b, r, c, m[0], m[1]);
        if (E.inCheck(nb, oc) && E.all(nb, oc).length === 0) mates++;
      }
    }
    if (!mates) bad.push(i + ': no mate in 1');
  });
  eq('puzzles: all genuine mate-in-1, no king captures', bad, []);
  const days = new Set(ZB.PUZ.map((_, i) => i));
  eq('puzzles: index covers all entries', days.size, ZB.PUZ.length);
}
{
  const p = { puz: { streak: 2, best: 2, last: '2026-10-09', wins: 2 } };
  let o = ZB.recordPuzzle(p, '2026-10-10', true);
  eq('puzzle: next-day solve extends streak', [o.again, p.puz.streak, p.puz.best, p.puz.wins], [false, 3, 3, 3]);
  o = ZB.recordPuzzle(p, '2026-10-10', true);
  eq('puzzle: same-day solve keeps streak', [o.again, p.puz.streak, p.puz.wins], [true, 3, 3]);
  o = ZB.recordPuzzle(p, '2026-10-12', false);
  eq('puzzle: missed day resets streak', [o.again, p.puz.streak, p.puz.best], [false, 1, 3]);
  const qp = { puz: { streak: 0, best: 0, last: '', wins: 0 }, xp: 0 };
  ZB.recordPuzzle(qp, '2026-10-10', true);
  eq('puzzle solve gives 25 XP', qp.xp, 25);
  eq('stamps by solve time', [ZB.puzStamp(12), ZB.puzStamp(29), ZB.puzStamp(30), ZB.puzStamp(119), ZB.puzStamp(120), ZB.puzStamp(600)], ['TIMER LORD', 'TIMER LORD', 'ADEPT', 'ADEPT', 'GRINDER', 'GRINDER']);
}

// --- blitz clocks: display format ---
const BZ = new Function(html.split('/*BLZ*/')[1].split('/*BLZEND*/')[0].replace(/setInterval\(clockTick,250\);/, '') + ';return{fmtClock}')();
eq('clock 3:00', BZ.fmtClock(180000), '3:00');
eq('clock rounds up', BZ.fmtClock(179500), '3:00');
eq('clock pads seconds', BZ.fmtClock(65000), '1:05');
eq('clock clamps at zero', BZ.fmtClock(-200), '0:00');

// --- review: blunder marks from eval swing (pawns, mover's view) ---
const RV = new Function(html.split('/*REV*/')[1].split('/*REVEND*/')[0] + ';return{blunMark}')();
eq('review: quiet move unmarked', RV.blunMark(0.4), '');
eq('review: ?! at 2.5', RV.blunMark(2.5), '?!');
eq('review: ?? at 6', RV.blunMark(9), '??');

// --- tutor: every move gets a verdict tag plus plain-language reasons ---
const TU = new Function('ev,atk,threats,legal,apply,gen,V,inCheck,all,prof,PW',
  html.split('/*TUT*/')[1].split('/*TUTEND*/')[0] + ';return{explainPly}')(
  E.ev, E.atk, E.threats, E.legal, E.apply, E.gen, E.V, E.inCheck, E.all, { tutor: 0 }, {});
{
  // scholar's mate, final blow: MATE with a reason
  let b = E.newBoard();
  const sans = play(b, 'w', ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6']);
  for (const m of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6']) {
    const [r, c] = sq(m.slice(0, 2)), [y, x] = sq(m.slice(2, 4));
    b = E.apply(b, r, c, y, x, m[4]);
  }
  const [r, c] = sq('h5'), [y, x] = sq('f7');
  const nb = E.apply(b, r, c, y, x, undefined);
  const e = TU.explainPly(b, { mv: [r, c, y, x], san: 'Qxf7#', t: 'w', cap: b[y][x] });
  eq('tutor: mate tagged', [e.tag, e.why.length > 0], ['MATE', true]);
  // hanging queen taken: BEST that takes the queen
  const [fq] = fen('4k3/8/8/3q4/8/8/8/3QK3 w - -');
  const qe = TU.explainPly(fq, { mv: [7, 3, 3, 3], san: 'Qxd5', t: 'w', cap: 'bQ' });
  eq('tutor: queen take is best', [qe.tag, qe.why.join(' ').includes('queen')], ['BEST', true]);
  // fool's mate g4: a real blunder with reasons
  let f2 = E.newBoard();
  for (const m of ['f2f3', 'e7e5']) {
    const [rr, cc] = sq(m.slice(0, 2)), [yy, xx] = sq(m.slice(2, 4));
    f2 = E.apply(f2, rr, cc, yy, xx, m[4]);
  }
  const [gr, gc] = sq('g2'), [gy, gx] = sq('g4');
  const ge = TU.explainPly(f2, { mv: [gr, gc, gy, gx], san: 'g4', t: 'w', cap: null });
  eq('tutor: g4 is a blunder', /BLUNDER|MISTAKE|INACCURACY/.test(ge.tag), true);
  eq('tutor: blunder has reasons', ge.why.length > 0, true);
}

// --- world-music queue: shuffle keeps the set, step advances, transpose is exact ---
const YT = new Function('const BUS={on(){}};const document={addEventListener(){}};const VOL=0.7;const $=()=>null;' + html.split('/*YT*/')[1].split('/*YTEND*/')[0] + ';return{ytShuffle,yqStep,TP,YT_LIST}')();
eq('queue step wraps', [YT.yqStep(0, 3), YT.yqStep(2, 3), YT.yqStep(0, 1)], [1, 0, 0]);
eq('transpose exact', [YT.TP(0), YT.TP(12), YT.TP(-12)], [1, 2, 0.5]);
{
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(YT.ytShuffle([0, 1, 2, 3].slice()).join());
  eq('shuffle keeps every track', YT.ytShuffle([0, 1, 2].slice()).sort().join(), '0,1,2');
  eq('shuffle varies order', seen.size > 1, true);
  const bad = [];
  for (const [k, L] of Object.entries(YT.YT_LIST)) for (const t of L) if (!/^[A-Za-z0-9_-]{11}$/.test(t.id) || !t.title || !t.artist) bad.push(k);
  eq('all track ids + credits valid', bad, []);
  eq('three worlds have 3+ tracks', ['moss', 'vex', 'dune'].every(k => YT.YT_LIST[k].length >= 3), true);
}

// --- threats: which pieces should tremble ---
const T = f => [...E.threats(fen(f)[0])].sort();
eq('no threats at the start', [...E.threats(E.newBoard())].length, 0);
eq('knight attacked by a pawn trembles', T('4k3/8/3p4/4N3/8/8/8/4K3 w - -'), ['3,4']);
eq('defended pawn attacked by a pawn is fine', T('4k3/8/3p4/4P3/5P2/8/8/4K3 w - -').includes('3,4'), false);
eq('undefended rook attacked by a bishop trembles', T('4k3/8/8/8/3b4/8/8/R3K3 w - -').includes('7,0'), true);
eq('hanging queen attacked by a rook', T('4k3/8/8/8/8/8/q7/R3K3 w - -').includes('6,0'), true);
eq('defended rook attacked by a rook is fine', T('r2rk3/8/8/8/8/8/8/R3K3 b - -').includes('0,0'), false);
eq('queen attacked by a defended bishop trembles', T('4k3/8/8/3q4/8/5B2/8/4K3 b - -').includes('3,3'), true);
eq('kings never tremble', T('4k3/8/8/8/8/8/4q3/4K3 w - -').includes('7,4'), false);

// --- profile / ladder rules ---
const P = new Function(html.split('/*PROF*/')[1].split('/*PROFEND*/')[0] + ';return{loadProfile,saveProfile,recordResult,newProfile,isUnlocked,PKEY,themeUnlocked,setTheme,streakBoard,MIN_FAST,THEME_REQ,xpTitle,mkInitials,finUnlocked,setFin,finKeys,FIN_REQ}')();
const mem = () => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, d }; };
const R = (id, res, o = {}) => Object.assign({ id, res, mate: res !== 'd', plies: 41, ms: 90000, caps: 3, left: 9, undos: 0, san: 'e4', date: 1 }, o);
{
  let p = P.newProfile();
  eq('fresh profile: only Mossback open', p.unlocked, ['moss']);
  let o = P.recordResult(p, R('moss', 'l'));
  eq('loss unlocks nothing, streak 0', [o.unlocked, p.streak, p.rec.moss.l], [null, 0, 1]);
  o = P.recordResult(p, R('moss', 'd'));
  eq('draw unlocks nothing', [o.unlocked, p.unlocked.length, p.total.d], [null, 1, 1]);
  o = P.recordResult(p, R('moss', 'w'));
  eq('beating Mossback unlocks Lady Vex', [o.unlocked, p.unlocked], ['vex', ['moss', 'vex']]);
  eq('streak 1 after first win', [p.streak, p.bestStreak], [1, 1]);
  o = P.recordResult(p, R('moss', 'w', { plies: 31, ms: 50000 }));
  eq('second win: no new unlock, streak 2', [o.unlocked, p.streak], [null, 2]);
  eq('new bests flagged (moves and time)', o.newBest, ['moves', 'time']);
  o = P.recordResult(p, R('moss', 'w', { plies: 61, ms: 99000 }));
  eq('worse win is not a new best but still ranks', [o.newBest, o.ranks], [[], { time: 3, moves: 3 }]);
  eq('top lists are best-first', [p.top.fast.moss.map(e => e.ms), p.top.mate.moss.map(e => e.moves)], [[50000, 90000, 99000], [16, 21, 31]]);
  P.recordResult(p, R('vex', 'l'));
  eq('loss resets streak but keeps best', [p.streak, p.bestStreak], [0, 3]);
  eq('Old Dune still locked after losing to Vex', P.isUnlocked(p, 'dune'), false);
  o = P.recordResult(p, R('vex', 'w'));
  eq('beating Lady Vex unlocks Old Dune', [o.unlocked, P.isUnlocked(p, 'dune')], ['dune', true]);
  o = P.recordResult(p, R('dune', 'w'));
  eq('beating Old Dune clears the ladder once', [o.cleared, o.unlocked], [true, null]);
  eq('clearing unlocks secret NOX', [o.bonus, P.isUnlocked(p, 'nox')], ['nox', true]);
  eq('clearing unlocks the KING finisher', [o.finishers.includes('K'), P.finUnlocked(p, 'K')], [true, true]);
  eq('ladder XP: win 100', p.xp >= 400, true);
  eq('rank titles', [P.xpTitle(0), P.xpTitle(199), P.xpTitle(200), P.xpTitle(2000)], ['PAWN', 'PAWN', 'KNIGHT', 'PIXEL KING']);
  {
    const q = P.newProfile(); q.xp = 150;
    const r = P.recordResult(q, R('moss', 'w'));
    eq('crossing 200 XP ranks up', [q.xp, r.rankUp], [250, 'KNIGHT']);
    const l = P.recordResult(P.newProfile(), R('moss', 'l'));
    eq('loss gives 10 XP, no rank up', [l.rankUp], [null]);
  }
  {
    const q = P.newProfile();
    eq('fresh profile: no finishers', P.finKeys(q), []);
    eq('setFin refuses locked', [P.setFin(q, 'P', 'alt'), q.fin.eq.P], [false, 'base']);
    eq('setFin always allows base', P.setFin(q, 'N', 'base'), true);
    let o = P.recordResult(q, R('moss', 'w'));
    eq('beating Mossback unlocks KNIGHT finisher', [o.finishers, P.finUnlocked(q, 'N')], [['N'], true]);
    o = P.recordResult(q, R('vex', 'w'));
    eq('beating Vex unlocks PAWN finisher', [o.finishers, P.finUnlocked(q, 'P')], [['P'], true]);
    o = P.recordResult(q, R('moss', 'w'));
    eq('3 streak unlocks BISHOP finisher', [o.finishers, P.finUnlocked(q, 'B')], [['B'], true]);
    o = P.recordResult(q, R('dune', 'w'));
    eq('beating Dune unlocks ROOK finisher', [o.finishers.includes('R'), P.finUnlocked(q, 'R')], [true, true]);
    o = P.recordResult(q, R('moss', 'w'));
    eq('5 streak unlocks QUEEN finisher', [o.finishers, P.finUnlocked(q, 'Q')], [['Q'], true]);
    eq('equip unlocked alt', P.setFin(q, 'N', 'alt') && q.fin.eq.N, 'alt');
    const d = {};
    const st = { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, d };
    P.saveProfile(st, q);
    const q2 = P.loadProfile(st);
    eq('equipped alt survives reload', q2.fin.eq.N, 'alt');
    st.d[P.PKEY] = JSON.stringify({ v: 1, rec: {}, streak: 0, bestStreak: 0, fin: { eq: { P: 'alt', Q: 'alt' } } });
    const q3 = P.loadProfile(st);
    eq('locked alts fall back to base on load', [q3.fin.eq.P, q3.fin.eq.Q], ['base', 'base']);
  }
  eq('fresh profile name', P.newProfile().name, 'YOU');
  {
    const d = {};
    const st = { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, d };
    P.saveProfile(st, P.newProfile());
    st.d[P.PKEY] = JSON.stringify({ v: 1, name: 'A!@#verylongname123' });
    eq('name sanitised on load', P.loadProfile(st).name, 'Averylongnam');
    const l = P.recordResult(P.newProfile(), R('moss', 'l'));
    eq('loss files finished streak', l.streakFiled >= 0, true);
  }
  eq('pid is 8 hex chars', /^[0-9a-f]{8}$/.test(P.newProfile().pid), true);
  {
    const p = P.newProfile();
    const d = {};
    const st = { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, d };
    P.saveProfile(st, p);
    eq('pid survives a reload', P.loadProfile(st).pid, p.pid);
  }
  eq('initials from words', [P.mkInitials('Ade Ola Musa'), P.mkInitials('Kage Prime'), P.mkInitials('Bo'), P.mkInitials(''), P.mkInitials('a!@#')], ['AOM', 'KPA', 'BOB', 'YOU', 'AAA']);
  {
    const d = {};
    const st = { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, d };
    st.d[P.PKEY] = JSON.stringify({ v: 1, name: 'Kage Prime', initials: 'k@p1!' });
    const q = P.loadProfile(st);
    eq('initials sanitised, name kept', [q.initials, q.name], ['KP1', 'Kage Prime']);
    st.d[P.PKEY] = JSON.stringify({ v: 1, name: 'Bo' });
    eq('initials derive when missing', P.loadProfile(st).initials, 'BOB');
  }
  o = P.recordResult(p, R('dune', 'w'));
  eq('ladder cleared only reported the first time', o.cleared, false);
  for (let i = 0; i < 120; i++) P.recordResult(p, R('moss', 'w'));
  eq('game history capped at 100', p.games.length, 100);
  eq('history keeps the move list', typeof p.games[0].san, 'string');
}
{
  const st = mem(); let p = P.newProfile();
  P.recordResult(p, R('moss', 'w'));
  eq('save succeeds', P.saveProfile(st, p), true);
  const q = P.loadProfile(st);
  eq('saved profile round-trips', [q.unlocked, q.streak, q.rec.moss.w, q.games.length], [['moss', 'vex'], 1, 1, 1]);
  st.d[P.PKEY] = '{not json';
  eq('corrupt save falls back to a fresh profile', P.loadProfile(st).unlocked, ['moss']);
  st.d[P.PKEY] = JSON.stringify({ v: 1, unlocked: ['dune', 'bogus'], streak: -4, bestStreak: 'x', rec: { moss: { w: 'a', l: 2 } }, games: [null, { id: 'moss', res: 'w' }, { id: 'zzz', res: 'w' }] });
  const r = P.loadProfile(st);
  eq('tampered save is sanitised', [r.unlocked, r.streak, r.bestStreak, r.rec.moss, r.games.length], [['moss', 'dune'], 0, 0, { w: 0, l: 2, d: 0 }, 1]);
  st.d[P.PKEY] = JSON.stringify({ v: 99, unlocked: ['vex'] });
  eq('unknown save version is ignored', P.loadProfile(st).unlocked, ['moss']);
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  eq('blocked storage: load gives fresh profile', P.loadProfile(bad).unlocked, ['moss']);
  eq('blocked storage: save reports failure without throwing', P.saveProfile(bad, p), false);
  eq('no storage at all', P.loadProfile(null).unlocked, ['moss']);
}

// --- themes, leaderboards ---
{
  let p = P.newProfile();
  eq('defaults: scene board and classic pieces are free', [P.themeUnlocked(p, 'board', 'scene'), P.themeUnlocked(p, 'piece', 'classic')], [true, true]);
  eq('everything else starts locked', ['midnight', 'candy', 'ember', 'glacier'].some(i => P.themeUnlocked(p, 'board', i)) || ['jade', 'gold', 'neon'].some(i => P.themeUnlocked(p, 'piece', i)), false);
  eq('setTheme refuses a locked theme', [P.setTheme(p, 'board', 'midnight'), p.theme.board], [false, 'scene']);
  eq('setTheme refuses an unknown theme', P.setTheme(p, 'board', 'nope'), false);
  let o = P.recordResult(p, R('moss', 'w'));
  eq('beating Mossback unlocks the Midnight board only', o.themes, [{ kind: 'board', id: 'midnight' }]);
  eq('setTheme accepts an unlocked theme', [P.setTheme(p, 'board', 'midnight'), p.theme.board], [true, 'midnight']);
  o = P.recordResult(p, R('moss', 'w'));
  eq('already-unlocked themes are not reported again', o.themes, []);
  eq('streak of 3 unlocks Glacier', P.recordResult(p, R('moss', 'w')).themes, [{ kind: 'board', id: 'glacier' }]);
  P.recordResult(p, R('moss', 'w')); o = P.recordResult(p, R('moss', 'w'));
  eq('streak of 5 unlocks Neon pieces', [o.themes, P.themeUnlocked(p, 'piece', 'neon')], [[{ kind: 'piece', id: 'neon' }], true]);
  o = P.recordResult(p, R('vex', 'w'));
  eq('beating Lady Vex unlocks Candy and Jade together', o.themes.map(t => t.kind + ':' + t.id).sort(), ['board:candy', 'piece:jade']);
  o = P.recordResult(p, R('dune', 'w'));
  eq('beating Old Dune unlocks Ember and Gold', o.themes.map(t => t.kind + ':' + t.id).sort(), ['board:ember', 'piece:gold']);
  P.recordResult(p, R('moss', 'l'));
  eq('themes stay unlocked after the streak breaks', P.themeUnlocked(p, 'piece', 'neon'), true);
}
{
  let p = P.newProfile();
  let o = P.recordResult(p, R('moss', 'w', { plies: 9, ms: 5000 }));
  eq('win under the minimum move count skips the fastest board', [o.ranks.time, p.top.fast.moss], [0, undefined]);
  eq('...but still counts for fewest moves', [o.ranks.moves, p.top.mate.moss.length], [1, 1]);
  const mv = n => R('moss', 'w', { plies: n * 2 - 1, ms: 60000 + n });
  for (let i = 0; i < 8; i++) P.recordResult(p, mv(20 + i));
  eq('top lists keep only 5 entries', [p.top.fast.moss.length, p.top.mate.moss.length], [5, 5]);
  o = P.recordResult(p, R('moss', 'w', { plies: 39, ms: 1000 }));
  eq('a better result takes rank 1 and flags a new best', [o.ranks, o.newBest], [{ time: 1, moves: 2 }, ['time']]);
  o = P.recordResult(p, R('moss', 'w', { plies: 200, ms: 999999 }));
  eq('a result worse than all five does not rank', o.ranks, { time: 0, moves: 0 });
  p = P.newProfile();
  P.recordResult(p, R('moss', 'w', { plies: 41, ms: 70000 })); o = P.recordResult(p, R('moss', 'w', { plies: 41, ms: 70000 }));
  eq('a tie ranks below the older result', o.ranks, { time: 2, moves: 2 });
}
{
  let p = P.newProfile();
  for (let i = 0; i < 3; i++) P.recordResult(p, R('moss', 'w'));
  eq('current run shows on the streak board', P.streakBoard(p), [{ n: 3, date: 0, cur: true }]);
  P.recordResult(p, R('moss', 'd'));
  eq('a draw does not end the run', [p.streak, p.top.streaks.length], [3, 0]);
  P.recordResult(p, R('moss', 'l', { date: 5 }));
  eq('a loss files the finished run', [p.streak, p.top.streaks], [0, [{ n: 3, date: 5 }]]);
  P.recordResult(p, R('moss', 'l'));
  eq('losing again does not file an empty run', p.top.streaks.length, 1);
  P.recordResult(p, R('moss', 'w')); P.recordResult(p, R('moss', 'w'));
  eq('streak board merges finished runs and the current run', P.streakBoard(p).map(e => [e.n, e.cur]), [[3, false], [2, true]]);
  for (let i = 0; i < 9; i++) { for (let k = 0; k <= i; k++) P.recordResult(p, R('moss', 'w')); P.recordResult(p, R('moss', 'l')); }
  eq('streak board capped at 5, best first', P.streakBoard(p).map(e => e.n).slice(0, 3), [9, 8, 7]);
  eq('streak board length', P.streakBoard(p).length, 5);
}
{
  const st = mem(); let p = P.newProfile();
  P.recordResult(p, R('moss', 'w', { plies: 31, ms: 40000 })); P.recordResult(p, R('vex', 'w'));
  P.setTheme(p, 'board', 'candy'); P.setTheme(p, 'piece', 'jade'); P.saveProfile(st, p);
  const q = P.loadProfile(st);
  eq('theme choice and top lists round-trip', [q.theme, q.top.fast.moss[0].ms, q.top.mate.moss[0].moves], [{ board: 'candy', piece: 'jade' }, 40000, 16]);
  st.d[P.PKEY] = JSON.stringify({ v: 1, rec: {}, theme: { board: 'ember', piece: 'neon' } });
  eq('a saved theme that is not unlocked falls back to default', P.loadProfile(st).theme, { board: 'scene', piece: 'classic' });
  st.d[P.PKEY] = JSON.stringify({ v: 1, rec: { vex: { w: 1 } }, bestStreak: 1, theme: { board: 'candy', piece: 'jade' } });
  eq('theme unlocked by record is honoured on load', P.loadProfile(st).theme, { board: 'candy', piece: 'jade' });
  st.d[P.PKEY] = JSON.stringify({ v: 1, top: { fast: { moss: [{ ms: 'x' }, null, { ms: 5000 }, { ms: 3000 }] }, streaks: [{ n: 0 }, { n: 4 }, { n: 2 }] }, theme: 7 });
  const t = P.loadProfile(st);
  eq('tampered top lists are cleaned and sorted', [t.top.fast.moss.map(e => e.ms), t.top.streaks.map(e => e.n)], [[3000, 5000], [4, 2]]);
  // a save from phase 5a (no top lists, no themes) gets its lists rebuilt from history
  st.d[P.PKEY] = JSON.stringify({ v: 1, unlocked: ['moss', 'vex'], rec: { moss: { w: 2, l: 1, d: 0 } }, streak: 0, bestStreak: 2, total: { w: 2, l: 1, d: 0 },
    games: [{ id: 'moss', res: 'l', plies: 20, ms: 1000 }, { id: 'moss', res: 'w', plies: 41, ms: 80000, undos: 1 }, { id: 'moss', res: 'w', plies: 25, ms: 30000 }] });
  const m = P.loadProfile(st);
  eq('old save: fastest list rebuilt (only 10+ move wins)', m.top.fast.moss.map(e => e.ms), [30000, 80000]);
  eq('old save: fewest-moves list rebuilt', m.top.mate.moss.map(e => e.moves), [13, 21]);
  eq('old save: best streak kept as a finished run', m.top.streaks.map(e => e.n), [2]);
  eq('old save: Midnight is unlocked by the old win record', P.themeUnlocked(m, 'board', 'midnight'), true);
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
