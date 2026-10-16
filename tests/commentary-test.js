// Commentator tests: motif detection, move grading, teaching text. Run: node commentary-test.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../chess/index.html', 'utf8');
const E = new Function(html.split('/*ENG*/')[1].split('/*ENGEND*/')[0] + ';return{newBoard,apply,legal,all,inCheck,toSAN,pick,ev,gen,V}')();
const PCN = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const C = new Function('V,gen,apply,inCheck,legal,all,ev,toSAN,PCN,PW',
  html.split('/*CMT*/')[1].split('/*CMTEND*/')[0] +
  ';return{cmSq,cmWin,cmBand,cmGrade,cmAtkList,cmFork,cmPins,cmSkewers,cmDiscovered,cmRemovesDefender,cmEnPrise,cmPawnCanAttack,cmPassed,cmTemptingLosses,cmMate1,cmMotifs,cmExplain,CM_GLOSS,CM_MOTIFS,CM_SUF,CM_QUIP,cmQuip}')(
  E.V, E.gen, E.apply, E.inCheck, E.legal, E.all, E.ev, E.toSAN, PCN, {});
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };

function fen(s) {
  const [pos, side, cas, ep] = s.split(' '), b = Array.from({ length: 8 }, () => Array(8).fill(null));
  pos.split('/').forEach((row, r) => { let c = 0; for (const ch of row) { if (/\d/.test(ch)) c += +ch; else b[r][c++] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase(); } });
  b.cr = { wK: cas.includes('K'), wQ: cas.includes('Q'), bK: cas.includes('k'), bQ: cas.includes('q') };
  b.ep = ep && ep !== '-' ? [8 - +ep[1], 'abcdefgh'.indexOf(ep[0])] : null;
  return [b, side];
}
const sq = s => [8 - +s[1], 'abcdefgh'.indexOf(s[0])];
function mv(b, col, from, to, pr) {
  const [r, c] = sq(from), [y, x] = sq(to);
  const nb = E.apply(b, r, c, y, x, pr);
  return { bb: b, nb, h: { t: col, mv: [r, c, y, x], san: E.toSAN(b, r, c, y, x, pr, nb), cap: b[y][x] } };
}

// --- notation + win% curve + bands ---
eq('square names', [C.cmSq(0, 0), C.cmSq(7, 4), C.cmSq(4, 3)], ['a8', 'e1', 'd4']);
eq('win curve even', Math.round(C.cmWin(0)), 50);
eq('win curve grows', C.cmWin(3) > C.cmWin(1) && C.cmWin(1) > 50, true);
eq('band excellent', C.cmBand(0.02), 'EXCELLENT');
eq('band good', C.cmBand(0.03), 'GOOD');
eq('band inaccuracy', C.cmBand(0.07), 'INACCURACY');
eq('band mistake', C.cmBand(0.15), 'MISTAKE');
eq('band blunder', C.cmBand(0.21), 'BLUNDER');

// --- grading rules (chess.com-style, with our overrides) ---
eq('grade best', C.cmGrade({ isBest: 1, loss: 0, secondGap: 0.05 }), 'BEST');
eq('grade great needs only-move', C.cmGrade({ isBest: 1, secondGap: 0.2, wpB: 55 }), 'GREAT');
eq('grade great skipped when winning big', C.cmGrade({ isBest: 1, secondGap: 0.2, wpB: 95 }), 'BEST');
eq('grade brilliant needs sacrifice', C.cmGrade({ isBest: 1, sacrifice: 1, sound: 1, wpB: 55, secondGap: 0.05 }), 'BRILLIANT!');
eq('grade no brilliant when crushing', C.cmGrade({ isBest: 1, sacrifice: 1, sound: 1, wpB: 95 }), 'BEST');
eq('grade miss when winning chance dropped', C.cmGrade({ isBest: 0, wpBest: 80, wpA: 50, loss: 0.3 }), 'MISS');
eq('grade mate', C.cmGrade({ mates: 1 }), 'MATE');
eq('grade allows mate is a blunder', C.cmGrade({ allowsMate: 1, isBest: 1 }), 'BLUNDER');
eq('grade plain band', C.cmGrade({ isBest: 0, loss: 0.03 }), 'GOOD');

// --- attack maps ---
eq('two pawns guard e3', C.cmAtkList(E.newBoard(), 5, 4, 'w').length, 2);
let[bNP] = fen('4k3/8/8/2n5/4P3/3P4/8/4K3 w - -');
eq('pawn guarded by pawn is not loose', C.cmEnPrise(bNP, 4, 4), null);
let[bND] = fen('4k3/8/3p4/4N3/8/8/8/4K3 w - -');
eq('undefended knight is loose', !!C.cmEnPrise(bND, 3, 4), true);

// --- fork: Nc7+ forks the king on e8 and the rook on a8 ---
let[bFk] = fen('r3k3/8/N7/8/8/8/8/4K3 w - -');
let fk = mv(bFk, 'w', 'a6', 'c7');
eq('fork finds both targets', C.cmFork(fk.nb, 1, 2).length >= 2, true);
eq('fork includes the king', C.cmFork(fk.nb, 1, 2).some(t => t.t == 'K'), true);
eq('move motifs find the fork', C.cmMotifs(bFk, fk.h).M.some(m => m.k == 'fork'), true);

// --- pin: Bb5 pins the c6 knight to the e8 king ---
let[bPn] = fen('4k3/8/2n5/8/8/8/8/4KB2 w - -');
let pn = mv(bPn, 'w', 'f1', 'b5');
eq('pin is absolute', C.cmPins(pn.nb, 3, 1).some(p => p.abs && p.t == 'N'), true);

// --- skewer: Re1 checks the e6 king with the e7 queen behind ---
let[bSk] = fen('8/4q3/4k3/8/8/8/8/R6K w - -');
let sk = mv(bSk, 'w', 'a1', 'e1');
eq('skewer king in front, queen behind', C.cmSkewers(sk.nb, 7, 4).some(s => s.front == 'K' && s.behind == 'Q'), true);

// --- discovered: Ne5-d7 unmasks Bb2 on the g7 king ---
let[bDs] = fen('8/6k1/8/4N3/8/8/1B6/4K3 w - -');
let ds = mv(bDs, 'w', 'e5', 'd7');
eq('discovered check found', C.cmDiscovered(bDs, 3, 4, 1, 3, ds.nb, 'w').some(d => d.chk), true);

// --- removes defender: Bxe7 leaves the d5 queen undefended and hanging to Rd1 ---
let[bRd] = fen('4k3/4n3/8/3q2B1/8/8/8/1K1R4 w - -');
let rd = mv(bRd, 'w', 'g5', 'e7');
eq('defender removed', C.cmRemovesDefender(bRd, rd.h, rd.nb).some(x => x.t == 'Q'), true);

// --- poison: Qxb2 loses the queen to Rxb2 ---
let[bTr] = fen('4k3/8/1q6/8/8/8/1P6/1R2K3 w - -');
eq('poisoned capture flagged', C.cmTemptingLosses(bTr, 'b').some(x => x.san == 'Qxb2'), true);

// --- passed pawns ---
let[bPs] = fen('4k3/8/8/8/4P3/8/8/4K3 w - -');
eq('clear board pawn is passed', C.cmPassed(bPs, 4, 4, 'w'), true);
let[bPb] = fen('4k3/8/4p3/8/4P3/8/8/4K3 w - -');
eq('enemy pawn ahead blocks the pass', C.cmPassed(bPb, 4, 4, 'w'), false);
eq('no enemy pawn can chase e5', C.cmPawnCanAttack(fen('4k3/8/8/4N3/8/8/8/4K3 w - -')[0], 3, 4, 'b'), false);

// --- fool's mate g4: blunder with the mate warning and suggestions ---
let[bG4] = fen('rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq -');
let g4 = mv(bG4, 'w', 'g2', 'g4');
eq('g4 gives mate in one to black', !!C.cmMate1(g4.nb, 'b'), true);
const ex = C.cmExplain(bG4, g4.h);
eq('g4 is a blunder', ex.tag, 'BLUNDER');
eq('g4 explains the mate', ex.why.concat(ex.head).join(' ').includes('MATE'), true);
eq('g4 suggests alternatives', ex.alt.length >= 1 && !ex.alt.some(a => a.san == 'g4'), true);
eq('g4 alternatives have reasons', ex.alt.every(a => a.san && a.why), true);
eq('g4 alternatives carry board moves', ex.alt.every(a => Array.isArray(a.mv) && a.mv.length == 4), true);
eq('g4 teaches a lesson', ex.learn.length >= 1, true);

// --- scholar's mate finish: MATE ---
let sB = E.newBoard();
for (const m of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6']) {
  const [r, c] = sq(m.slice(0, 2)), [y, x] = sq(m.slice(2, 4));
  sB = E.apply(sB, r, c, y, x);
}
let qf = mv(sB, 'w', 'h5', 'f7');
const ex2 = C.cmExplain(sB, qf.h);
eq('scholar mate tagged MATE', ex2.tag, 'MATE');
eq('mate names the ending', ex2.why[0].includes('CHECKMATE'), true);

// --- free queen: BEST, names the piece, teaches counting ---
let[bQ] = fen('4k3/8/8/3q4/8/8/8/3QK3 w - -');
let qx = mv(bQ, 'w', 'd1', 'd5');
const ex3 = C.cmExplain(bQ, qx.h);
eq('free queen is BEST', ex3.tag, 'BEST');
eq('free queen names the piece', ex3.why.join(' ').includes('QUEEN'), true);
eq('capture lesson teaches counting', ex3.learn.some(s => s.includes('ATTACKERS')), true);

// --- determinism + glossary completeness ---
eq('explain is deterministic', JSON.stringify(C.cmExplain(bG4, g4.h)) === JSON.stringify(ex), true);
eq('every motif has a lesson', C.CM_MOTIFS.every(k => typeof C.CM_GLOSS[k] == 'string' && C.CM_GLOSS[k].length > 20), true);
eq('lessons are plain uppercase ascii', C.CM_MOTIFS.every(k => /^[A-Z0-9 .,:;()'-]+$/.test(C.CM_GLOSS[k])), true);
eq('suffixes cover every tag', ['BEST', 'EXCELLENT', 'GOOD', 'INACCURACY', 'MISTAKE', 'BLUNDER', 'MISS', 'GREAT', 'BRILLIANT!', 'MATE', 'DRAW'].every(t => t in C.CM_SUF), true);

// --- kibitz quips ---
const TAGS = ['BEST', 'EXCELLENT', 'GOOD', 'INACCURACY', 'MISTAKE', 'BLUNDER', 'MISS', 'GREAT', 'BRILLIANT!', 'MATE', 'DRAW'];
eq('every tag has a quip', TAGS.every(t => Array.isArray(C.CM_QUIP[t]) && C.CM_QUIP[t].length >= 2), true);
eq('quips are plain uppercase ascii', TAGS.every(t => C.CM_QUIP[t].every(q => /^[A-Z0-9 .,:;()'!-]+$/.test(q) && q.length > 10)), true);
eq('quip selection is stable', [1, 2, 3, 4, 5].every(p => C.cmQuip('BLUNDER', p) === C.cmQuip('BLUNDER', p)), true);
eq('quip cycles through its set', new Set([1, 2, 3].map(p => C.cmQuip('BEST', p))).size >= 2, true);
eq('unknown tags fall back to a quip', C.cmQuip('NOPE', 1) === C.cmQuip('GOOD', 1), true);

console.log(fail ? fail + ' FAILED' : 'all ok');
process.exit(fail ? 1 : 0);
