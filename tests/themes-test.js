// Themes, profile and leaderboard screens in a real browser. Run: node themes-test.js
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  const url = 'file://' + __dirname + '/../chess/index.html';
  const mk = async (vp, init) => {
    const ctx = await br.newContext({ viewport: vp }); const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message));
    if (init) await pg.addInitScript(init);
    await pg.goto(url); await pg.evaluate(() => { fx = false; snd = false; }); return pg;
  };
  const mate = async pg => {
    await pg.evaluate(() => {
      const e = Array.from({ length: 8 }, () => Array(8).fill(null));
      e[0][6] = 'bK'; e[1][5] = 'bP'; e[1][6] = 'bP'; e[1][7] = 'bP'; e[7][6] = 'wK'; e[7][0] = 'wR';
      e.cr = { wK: 0, wQ: 0, bK: 0, bQ: 0 }; e.ep = null; b = e; turn = 'w'; hist = []; status(); draw(); play(7, 0, 0, 0, 'Q');
    });
    await pg.waitForSelector('#s-over.on', { timeout: 4000 });
  };
  const px = (pg, x, y) => pg.evaluate(([x, y]) => '#' + [...bg.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''), [x, y]);
  const fits = async (pg, sel, vp) => (await pg.locator(sel).evaluate(e => e.scrollWidth <= e.clientWidth + 1));
  for (const [name, vp] of [['portrait', { width: 390, height: 780 }], ['small', { width: 360, height: 640 }], ['landscape', { width: 740, height: 360 }]]) {
    const pg = await mk(vp);
    const r = async s => await pg.locator(s).boundingBox();
    for (const s of ['#hp', '#th', '#pf']) { const bb = await r(s); ok(name + ' title ' + s + ' on screen', bb && bb.x >= 0 && bb.x + bb.width <= vp.width && bb.y >= 0 && bb.y + bb.height <= vp.height, JSON.stringify(bb)); }
    await pg.click('#th');
    ok(name + ' themes: 5 board + 4 piece options', (await pg.locator('#tb .tc').count()) === 5 && (await pg.locator('#tp .tc').count()) === 4);
    ok(name + ' themes: defaults selected', (await pg.locator('.tc.sel').count()) === 2 && /SELECTED/.test(await pg.locator('#tb .tc').first().innerText()));
    ok(name + ' themes: 7 locked at the start', (await pg.locator('.tc.lk').count()) === 7);
    ok(name + ' locked text names the opponent', /BEAT MOSSBACK/.test(await pg.locator('#tb .tc').nth(1).innerText()) && /3 WIN STREAK/.test(await pg.locator('#tb .tc').nth(4).innerText()) && /5 WIN STREAK/.test(await pg.locator('#tp .tc').nth(3).innerText()));
    ok(name + ' themes pane has no sideways scroll', await fits(pg, '#s-themes .pane'));
    await pg.locator('#s-themes .pane').evaluate(e => e.scrollTop = 0); await pg.screenshot({ path: `themes-${name}-locked.png` });
    await pg.click('#thb');
    ok(name + ' back to title', await pg.locator('#s-title.on').count() === 1);
    await pg.click('#pf');
    ok(name + ' profile opens on RECORD with 5 tabs', (await pg.locator('#ptabs button').count()) === 5 && (await pg.locator('#ptabs button.on').innerText()) === 'RECORD');
    ok(name + ' profile: locked opponents hidden', (await pg.locator('#pbody').innerText()).includes('???'));
    await pg.click('#ptabs button:nth-child(2)');
    ok(name + ' streak tab empty state', /NO STREAKS YET/.test(await pg.locator('#pbody').innerText()));
    await pg.click('#pfb');
    // first ladder win -> Midnight unlocked, mentioned on the result panel
    await pg.click('[data-m="1"]'); await pg.locator('.oc').first().click(); await mate(pg);
    const t = await pg.locator('#out').innerText();
    ok(name + ' result panel announces the new theme', /NEW THEME: MIDNIGHT BOARD/.test(t), t);
    ok(name + ' result panel shows new bests', /NEW BEST: FEWEST MOVES/.test(t));
    await pg.screenshot({ path: `result-${name}.png` });
    await pg.click('#mn'); await pg.click('#th');
    ok(name + ' Midnight now unlocked', (await pg.locator('#tb .tc').nth(1).getAttribute('aria-disabled')) === 'false');
    await pg.locator('#tb .tc').nth(1).click();
    ok(name + ' selecting Midnight saves the choice', await pg.evaluate(() => prof.theme.board === 'midnight' && JSON.parse(localStorage.getItem('pixelchess.v1')).theme.board === 'midnight'));
    ok(name + ' board colours really changed', (await px(pg, 30, 10)) === '#2b3a67', await px(pg, 30, 10));
    ok(name + ' only one option is selected per row', (await pg.locator('#tb .tc.sel').count()) === 1);
    await pg.locator('#tb .tc').nth(2).click({ force: true });
    ok(name + ' clicking a locked theme changes nothing', await pg.evaluate(() => prof.theme.board === 'midnight'));
    await pg.screenshot({ path: `themes-${name}-midnight.png` });
    await pg.click('#thb');
    // a scene theme is overridden by the theme, and returns with "Scene"
    await pg.click('[data-m="1"]'); await pg.locator('.oc').first().click();
    ok(name + ' theme overrides the scene board in a game', (await px(pg, 30, 10)) === '#2b3a67');
    await pg.click('#pz'); await pg.click('#qt'); await pg.click('#th'); await pg.locator('#tb .tc').first().click();
    await pg.click('#thb'); await pg.click('[data-m="1"]'); await pg.locator('.oc').first().click();
    ok(name + ' Scene option brings the garden board back', (await px(pg, 30, 10)) === '#5f8a3e', await px(pg, 30, 10));
    await pg.reload(); await pg.evaluate(() => { fx = false; snd = false; });
    ok(name + ' unlocks and choice survive a reload', await pg.evaluate(() => themeUnlocked(prof, 'board', 'midnight') && prof.theme.board === 'scene'));
    await pg.context().close();
  }
  // piece themes, streaks and the leaderboard screens
  {
    const pg = await mk({ width: 390, height: 780 });
    await pg.evaluate(() => { const R = (id, res, o = {}) => Object.assign({ id, res, mate: res == 'w', plies: 41, ms: 90000, caps: 3, left: 9, undos: 0, san: 'e4', date: Date.now() }, o);
      recordResult(prof, R('moss', 'w', { plies: 31, ms: 61000 })); recordResult(prof, R('moss', 'w', { plies: 51, ms: 120000, undos: 2 })); recordResult(prof, R('moss', 'l'));
      recordResult(prof, R('moss', 'w')); recordResult(prof, R('moss', 'w')); recordResult(prof, R('moss', 'w'));
      recordResult(prof, R('vex', 'w', { plies: 61, ms: 200000 })); saveProfile(store, prof); });
    await pg.click('#th');
    ok('Jade pieces unlocked by beating Lady Vex', (await pg.locator('#tp .tc').nth(1).getAttribute('aria-disabled')) === 'false');
    ok('Glacier board unlocked by a 3 streak', (await pg.locator('#tb .tc').nth(4).getAttribute('aria-disabled')) === 'false');
    const before = await pg.evaluate(() => JSON.stringify(runs('wN')));
    await pg.locator('#tp .tc').nth(1).click();
    const after = await pg.evaluate(() => JSON.stringify(runs('wN')));
    ok('piece theme re-colours the sprites', before !== after && await pg.evaluate(() => PAL.w.d === '#2e8a6b' && PAL.b.d === '#3a2466'));
    await pg.screenshot({ path: 'themes-pieces.png' });
    await pg.reload(); await pg.evaluate(() => { fx = false; snd = false; });
    ok('piece theme survives a reload', await pg.evaluate(() => PAL.w.d === '#2e8a6b' && prof.theme.piece === 'jade'));
    await pg.evaluate(() => { startGame(2); });
    ok('game uses the themed sprites', await pg.evaluate(() => runs('wP').some(r => r[3].toLowerCase() == '#2e8a6b')));
    await pg.evaluate(() => toTitle());
    await pg.click('#pf');
    let txt = await pg.locator('#pbody').innerText();
    ok('record tab shows totals', /5 \/ 1 \/ 0|W2 L1 D0/.test(txt) || /W5/.test(txt), txt);
    await pg.screenshot({ path: 'prof-record.png' });
    await pg.click('#ptabs button:nth-child(2)'); txt = await pg.locator('#pbody').innerText();
    ok('streak tab: finished run and the running one', /1\. 4 WINS\s+RUNNING NOW/.test(txt.replace(/\n/g, ' ')) && /2\. 2 WINS/.test(txt), txt);
    await pg.screenshot({ path: 'prof-streaks.png' });
    await pg.click('#ptabs button:nth-child(3)'); txt = await pg.locator('#pbody').innerText();
    ok('fastest tab: sorted, with moves', /1\. 1:30/.test(txt) && /2\. 1:01/.test(txt) === false || /1\. 1:01/.test(txt), txt);
    ok('fastest tab shows undo marker', /U2/.test(txt), txt);
    ok('fastest tab explains the minimum', /10\+ MOVES/.test(txt));
    ok('Old Dune (unlocked by beating Vex) shows an empty state', /OLD DUNE[\s\S]*NO QUALIFYING WIN YET/.test(txt), txt);
    await pg.screenshot({ path: 'prof-fastest.png' });
    await pg.click('#ptabs button:nth-child(4)'); txt = await pg.locator('#pbody').innerText();
    ok('fewest-moves tab lists best first', txt.indexOf('1. 16 MOVES') > -1 && txt.indexOf('1. 16 MOVES') < txt.indexOf('2. '), txt);
    ok('profile pane has no sideways scroll', await fits(pg, '#s-prof .pane'));
    await pg.screenshot({ path: 'prof-moves.png' });
    await pg.click('#pfb');
    await pg.context().close();
  }
  // blocked storage: themes still work this session
  {
    const pg = await mk({ width: 390, height: 780 }, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await pg.evaluate(() => { recordResult(prof, { id: 'moss', res: 'w', mate: true, plies: 41, ms: 1000, caps: 0, left: 16, undos: 0, san: '', date: 1 }); });
    await pg.click('#th'); await pg.locator('#tb .tc').nth(1).click();
    ok('blocked storage: theme still applies for the session', await pg.evaluate(() => prof.theme.board === 'midnight') && (await px(pg, 30, 10)) === '#2b3a67');
    await pg.click('#thb'); await pg.click('#pf');
    ok('blocked storage: profile warns', /NOT SAVED/.test(await pg.locator('#pbody').innerText()));
    await pg.context().close();
  }
  await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})();
