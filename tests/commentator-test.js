// Commentator end-to-end: headline, worker analysis, sheet, board preview, AI hold. Run: node commentator-test.js
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  const pg = await br.newPage({ viewport: { width: 390, height: 780 } });
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto('file://' + __dirname + '/../chess/index.html');

  // ---- the switch is the old tutor switch, and old saves migrate ----
  await pg.evaluate(() => { localStorage.setItem('pixelchess.v1', JSON.stringify({ v: 1, tutor: 1 })); });
  await pg.reload();
  ok('old tutor save migrates to commentator', await pg.evaluate(() => cmt === 1 && prof.cmt === 1));
  ok('settings switch shows comment on', await pg.evaluate(() => document.getElementById('swTut').classList.contains('on') && document.getElementById('swTut').getAttribute('aria-checked') === 'true'));
  await pg.evaluate(() => setCmt(1));
  ok('commentator switch turns on cleanly', await pg.evaluate(() => cmt === 1 && prof.cmt === 1));

  // ---- local 2P game: headline + sheet + preview ----
  await pg.click('[data-m="2"]');
  await pg.evaluate(() => { fx = false; snd = false; });
  const mv = async (a, b2) => { await pg.evaluate(([a, b2]) => { const q = s => [8 - +s[1], 'abcdefgh'.indexOf(s[0])]; const [r, c] = q(a), [y, x] = q(b2); play(r, c, y, x, 'Q'); }, [a, b2]); await pg.waitForTimeout(80); };
  await mv('e2', 'e4');
  ok('headline appears after a move', await pg.evaluate(() => document.querySelector('#bub').classList.contains('on') && document.getElementById('bt').textContent.length > 3));
  ok('headline names a verdict', await pg.evaluate(() => /BEST|GOOD|GREAT|INACCURACY|EXCELLENT|BOOK|MISS|MISTAKE|BLUNDER|BRILLIANT|MATE/.test(document.getElementById('bt').textContent)));
  ok('instant analysis is stored', await pg.evaluate(() => !!cmtLog[1] && cmtLog[1].head.length > 0));
  ok('second worker refines the analysis', await pg.waitForFunction(() => cmtLog[hist.length] && cmtLog[hist.length].worker === 1, null, { timeout: 15000 }).then(() => true).catch(() => false));
  const ex1 = await pg.evaluate(() => ({ alts: cmtLog[1].alt.length, mv: cmtLog[1].alt[0] && cmtLog[1].alt[0].mv.length, plan: cmtLog[1].plan.length, learn: cmtLog[1].learn.length }));
  ok('analysis carries alternatives with board moves', ex1.alts >= 1 && ex1.mv === 4, JSON.stringify(ex1));
  ok('analysis carries plans and concepts', ex1.plan >= 1 && ex1.learn >= 1);

  await pg.click('#bub');
  ok('tapping the bubble opens the sheet', await pg.evaluate(() => document.querySelector('#s-cmt').classList.contains('on')));
  ok('sheet shows the verdict section', /VERDICT/.test(await pg.locator('#cmtS').innerText()));
  ok('sheet shows what the move does', /WHAT IT DOES/.test(await pg.locator('#cmtS').innerText()));
  ok('sheet has alternative buttons', (await pg.locator('#cmtS [data-cma]').count()) >= 1);
  ok('sheet names kibitz and his title', /KIBITZ/.test(await pg.locator('#cmtbox').innerText()));
  ok('sheet shows a kibitz quip', await pg.evaluate(() => document.getElementById('cmtQ').textContent.length > 10));
  ok('kibitz portrait is drawn', await pg.evaluate(() => { const d = document.getElementById('ck').getContext('2d').getImageData(0, 0, 16, 16).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }) > 40);
  const port1 = await pg.evaluate(() => document.getElementById('ck').toDataURL());

  const altMv = await pg.evaluate(() => cmtLog[1].alt[0].mv);
  await pg.locator('#cmtS [data-cma]').first().click();
  ok('preview collapses the sheet to a bar', await pg.evaluate(() => document.getElementById('cmtbox').classList.contains('mini')));
  ok('preview draws the clicked alternative', await pg.evaluate(mv => cmArrows.length === 1 && JSON.stringify(cmArrows[0].slice(0, 4)) === JSON.stringify(mv), altMv));
  ok('preview draws an arrow on the real board', await pg.evaluate(() => cmArrows.length === 1));
  ok('preview shows the alternative position', await pg.evaluate(() => JSON.stringify(b) !== JSON.stringify(hist[hist.length - 1].b) && b[4][4] !== 'wP'));
  ok('preview bar names the move', await pg.evaluate(() => document.getElementById('cmtH').textContent.startsWith('PREVIEW ')));
  await pg.click('#cmtX');
  ok('closing restores the real position', await pg.evaluate(() => !document.querySelector('#s-cmt').classList.contains('on') && b[4][4] === 'wP' && cmArrows.length === 0));

  // ---- fool's mate g4: blunder headline, mate text, ply stepping ----
  await pg.evaluate(() => startGame(2));
  await pg.evaluate(() => { fx = false; snd = false; });
  await mv('f2', 'f3'); await mv('e7', 'e5'); await mv('g2', 'g4');
  ok('g4 headline calls it a blunder', await pg.evaluate(() => /BLUNDER/.test(document.getElementById('bt').textContent)));
  ok('g4 analysis knows about mate', await pg.evaluate(() => /MATE/.test(cmtLog[3].head + ' ' + cmtLog[3].threat.join(' '))));
  await pg.keyboard.press('c');
  ok('keyboard opens the sheet', await pg.evaluate(() => document.querySelector('#s-cmt').classList.contains('on')));
  ok('sheet shows the mate warning', /MATE/.test(await pg.locator('#cmtS').innerText()));
  ok('sheet offers better moves', (await pg.locator('#cmtS [data-cma]').count()) >= 1);
  ok('kibitz reacts differently to a blunder', (await pg.evaluate(() => document.getElementById('ck').toDataURL())) !== port1);
  await pg.click('#cmtP');
  ok('prev steps to the previous commented ply', await pg.evaluate(() => cmtOpenPly === 2));
  ok('prev move title shows the black move', await pg.evaluate(() => /e5/.test(document.getElementById('cmtH').textContent)));
  await pg.click('#cmtN');
  ok('next steps forward again', await pg.evaluate(() => cmtOpenPly === 3));
  await pg.keyboard.press('Escape');
  ok('escape closes the sheet', await pg.evaluate(() => !document.querySelector('#s-cmt').classList.contains('on')));
  ok('escape did not pause the game', await pg.evaluate(() => !paused));

  // ---- AI game: the CPU holds its move while the analysis sheet is open ----
  await pg.evaluate(() => startGame(1, OPPS[0], false));
  await pg.evaluate(() => { fx = false; snd = false; });
  await mv('d2', 'd4');
  await pg.evaluate(() => cmtShow(hist.length));
  await pg.waitForTimeout(1200);
  ok('cpu holds its move while the sheet is open', await pg.evaluate(() => hist.length === 1 && !over));
  await pg.click('#cmtX');
  const replied = await pg.waitForFunction(() => hist.length >= 2, null, { timeout: 6000 }).then(() => true).catch(() => false);
  ok('cpu replies after the sheet closes', replied);
  const head2 = await pg.evaluate(() => document.getElementById('bt').textContent.length > 3);
  ok('opponent move gets a headline too', head2);

  // ---- own blunder in an AI game auto-opens the sheet and holds the CPU ----
  await pg.evaluate(() => startGame(1, OPPS[0], false));
  await pg.evaluate(() => { fx = false; snd = false; });
  await mv('f2', 'f3');
  await pg.evaluate(() => { reqId++; play(1, 4, 3, 4, 'Q'); }); // hand-play black's e5, drop the pending cpu request
  await mv('g2', 'g4');
  ok('own blunder opens the sheet automatically', await pg.evaluate(() => document.querySelector('#s-cmt').classList.contains('on') && cmtOpenPly === 3));
  await pg.waitForTimeout(1200);
  ok('auto-open holds the cpu move', await pg.evaluate(() => hist.length === 3 && !over));
  await pg.click('#cmtX');
  const resumed = await pg.waitForFunction(() => hist.length >= 4, null, { timeout: 8000 }).then(() => true).catch(() => false);
  ok('closing the auto sheet resumes the cpu', resumed);

  // daily puzzle stays spoiler-free even with the commentator on
  const puz = await pg.evaluate(() => { try { startPuzzle(puzDay(Date.now())); } catch (e) { return 'start:' + e.message; } const m = all(b, turn)[0]; if (!m) return 'no moves'; play(m[0], m[1], m[2], m[3], 'Q'); return 'ok'; });
  await pg.waitForTimeout(500);
  ok('daily puzzle gets no commentary (no spoilers)', puz === 'ok' && await pg.evaluate(() => Object.keys(cmtLog).length === 0), puz);

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await pg.close(); await br.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
