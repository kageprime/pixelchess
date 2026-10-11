// Ladder + save tests in a real browser. Run: node ladder-test.js
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  const url = 'file://' + __dirname + '/../chess/index.html';
  // back-rank mate in one for White: Ra1-a8#
  const setMate = pg => pg.evaluate(() => {
    const e = Array.from({ length: 8 }, () => Array(8).fill(null));
    e[0][6] = 'bK'; e[1][5] = 'bP'; e[1][6] = 'bP'; e[1][7] = 'bP'; e[7][6] = 'wK'; e[7][0] = 'wR';
    e.cr = { wK: 0, wQ: 0, bK: 0, bQ: 0 }; e.ep = null; b = e; turn = 'w'; hist = []; status(); draw();
  });
  const mate = async pg => { await setMate(pg); await pg.evaluate(() => play(7, 0, 0, 0, 'Q')); await pg.waitForSelector('#s-over.on', { timeout: 4000 }); };
  const mk = async (vp, init) => {
    const ctx = await br.newContext({ viewport: vp }); const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message));
    if (init) await pg.addInitScript(init);
    await pg.goto(url); return pg;
  };
  for (const [name, vp] of [['portrait', { width: 390, height: 780 }], ['small', { width: 360, height: 640 }], ['landscape', { width: 740, height: 360 }]]) {
    const pg = await mk(vp);
    await pg.evaluate(() => { fx = false; snd = false; });
    await pg.click('[data-m="1"]');
    ok(name + ' Vex and Dune start locked', (await pg.locator('.oc.lk').count()) === 2);
    await pg.screenshot({ path: `ladder-${name}.png` });
    await pg.locator('.oc').nth(1).click({ force: true });
    ok(name + ' clicking a locked card does nothing', await pg.locator('#s-opp.on').count() === 1 && !(await pg.evaluate(() => inGame)));
    await pg.click('#ex');
    ok(name + ' exhibition toggle on', (await pg.locator('#ex').innerText()) === 'EXHIBITION: ON');
    ok(name + ' last card still on screen', await (async () => { const r = await pg.locator('.oc').last().boundingBox(); return r.y + r.height <= vp.height && r.x + r.width <= vp.width; })());
    await pg.locator('.oc').nth(1).click();
    ok(name + ' exhibition lets you play locked Lady Vex', await pg.evaluate(() => inGame && opp.id === 'vex' && gmode === 'exh'));
    ok(name + ' exhibition undo has no counter', (await pg.locator('#un').innerText()) === 'UNDO');
    await mate(pg);
    ok(name + ' exhibition result is not recorded', await pg.evaluate(() => prof.games.length === 0 && prof.unlocked.length === 1));
    ok(name + ' no ladder panel after exhibition', (await pg.locator('#ou.on').count()) === 0);
    await pg.click('#mn'); await pg.click('[data-m="1"]');
    ok(name + ' exhibition resets to off when reopened', (await pg.locator('#ex').innerText()) === 'EXHIBITION: OFF');
    await pg.locator('.oc').first().click();
    ok(name + ' ladder game starts with 3 undos', (await pg.locator('#un').innerText()) === 'UNDO 3');
    await mate(pg);
    ok(name + ' win unlocks Lady Vex', await pg.evaluate(() => isUnlocked(prof, 'vex') && prof.streak === 1));
    ok(name + ' unlock panel shown', (await pg.locator('#ou.on').count()) === 1 && (await pg.locator('#nx.on').innerText()) === 'NEXT: LADY VEX');
    for (const sel of ['#nx', '#rm', '#mn']) { const r = await pg.locator(sel).boundingBox(); ok(name + ' ' + sel + ' button on screen/reachable', await pg.evaluate(() => { const c = document.querySelector('#s-over .card'); return c.scrollHeight <= c.clientHeight || getComputedStyle(c).overflowY === 'auto'; }), JSON.stringify(r)); }
    await pg.screenshot({ path: `unlock-${name}.png` });
    ok(name + ' save written to storage', await pg.evaluate(() => JSON.parse(localStorage.getItem('pixelchess.v1')).unlocked.includes('vex')));
    await pg.click('#nx');
    ok(name + ' NEXT starts Lady Vex on the ladder', await pg.evaluate(() => inGame && opp.id === 'vex' && gmode === 'ladder'));
    await pg.reload();
    ok(name + ' progress survives a reload', await pg.evaluate(() => isUnlocked(prof, 'vex') && prof.total.w === 1));
    await pg.click('[data-m="1"]');
    ok(name + ' after reload only Dune is locked', (await pg.locator('.oc.lk').count()) === 1);
    await pg.context().close();
  }
  // undo limit
  {
    const pg = await mk({ width: 390, height: 780 });
    await pg.evaluate(() => { fx = false; snd = false; });
    await pg.click('[data-m="1"]'); await pg.locator('.oc').first().click();
    for (let i = 3; i >= 1; i--) {
      await pg.evaluate(() => { const e = hist.length; if (turn == 'w' && !hist.length) play(6, 4, 4, 4, 'Q'); });
      await pg.waitForFunction(() => hist.length >= 2 && turn == 'w' && !an && !sa, null, { timeout: 8000 });
      ok('undo #' + (4 - i) + ' available', !(await pg.locator('#un').isDisabled()) && (await pg.locator('#un').innerText()) === 'UNDO ' + i);
      await pg.click('#un');
      ok('undo #' + (4 - i) + ' takes the move back', await pg.evaluate(() => hist.length === 0));
    }
    ok('after 3 undos the button is spent', (await pg.locator('#un').isDisabled()) && (await pg.locator('#un').innerText()) === 'UNDO 0');
    await pg.evaluate(() => play(6, 4, 4, 4, 'Q'));
    await pg.waitForFunction(() => hist.length >= 2 && turn == 'w' && !an && !sa, null, { timeout: 8000 });
    await pg.keyboard.press('u');
    ok('keyboard undo is refused when spent', await pg.evaluate(() => hist.length >= 2));
    await pg.evaluate(() => { undosLeft = 3; });
    await pg.click('#pz'); await pg.click('#rt');
    ok('restart resets the undo counter', (await pg.locator('#un').innerText()) === 'UNDO 3');
    await pg.context().close();
  }
  // loss resets streak, draw keeps it
  {
    const pg = await mk({ width: 390, height: 780 });
    await pg.evaluate(() => { fx = false; snd = false; });
    await pg.click('[data-m="1"]'); await pg.locator('.oc').first().click();
    await mate(pg); await pg.click('#rm');
    ok('rematch keeps the same opponent and mode', await pg.evaluate(() => opp.id === 'moss' && gmode === 'ladder' && !over));
    await pg.evaluate(() => {   // stalemate: black to move, no moves
      const e = Array.from({ length: 8 }, () => Array(8).fill(null));
      e[0][7] = 'bK'; e[2][6] = 'wK'; e[1][5] = 'wQ'; e.cr = { wK: 0, wQ: 0, bK: 0, bQ: 0 }; e.ep = null; b = e; turn = 'w'; hist = []; status();
      play(1, 5, 1, 5, 'Q');
    }).catch(() => { });
    await pg.evaluate(() => { const e = Array.from({ length: 8 }, () => Array(8).fill(null)); e[0][7] = 'bK'; e[2][5] = 'wK'; e[3][6] = 'wQ'; e.cr = { wK: 0, wQ: 0, bK: 0, bQ: 0 }; e.ep = null; b = e; turn = 'w'; hist = []; recorded = false; over = false; status(); draw(); play(3, 6, 2, 6, 'Q'); });
    await pg.waitForSelector('#s-over.on', { timeout: 4000 });
    ok('stalemate is a draw and keeps the streak', await pg.evaluate(() => prof.total.d === 1 && prof.streak === 1));
    ok('draw panel says streak kept', /STREAK KEPT/.test(await pg.locator('#out').innerText()));
    // loss: black mates white
    await pg.click('#rm');
    await pg.evaluate(() => {
      const e = Array.from({ length: 8 }, () => Array(8).fill(null));
      e[0][0] = 'bR'; e[7][6] = 'wK'; e[6][5] = 'wP'; e[6][6] = 'wP'; e[6][7] = 'wP'; e[0][4] = 'bK';
      e.cr = { wK: 0, wQ: 0, bK: 0, bQ: 0 }; e.ep = null; b = e; turn = 'b'; hist = []; status(); draw(); play(0, 0, 7, 0, 'Q');
    });
    await pg.waitForSelector('#s-over.on', { timeout: 4000 });
    ok('loss resets the streak and keeps best', await pg.evaluate(() => prof.total.l === 1 && prof.streak === 0 && prof.bestStreak === 1));
    ok('loss panel says streak lost', /STREAK LOST/.test(await pg.locator('#out').innerText()));
    ok('no NEXT button after a loss', (await pg.locator('#nx.on').count()) === 0);
    await pg.context().close();
  }
  // storage blocked: game still works
  {
    const pg = await mk({ width: 390, height: 780 }, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await pg.evaluate(() => { fx = false; snd = false; });
    await pg.click('[data-m="1"]');
    ok('blocked storage: warning shown', /NOT SAVED/.test(await pg.locator('#osm').innerText()));
    await pg.locator('.oc').first().click();
    await mate(pg);
    ok('blocked storage: game plays and result shows', await pg.evaluate(() => isUnlocked(prof, 'vex')) && (await pg.locator('#nx.on').count()) === 1);
    await pg.context().close();
  }
  await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})();
