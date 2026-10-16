// Start menu (chess title screen) checks: node tests/startmenu-test.js
// Covers the fused start menu: main/settings/credits view stack, switches wired to the
// real game settings, ESC navigation with focus return, arrow-key nav and persistence.
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x))); };
  const url = 'file://' + __dirname + '/../chess/index.html';
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(url);
  await pg.waitForTimeout(400);

  // ---- view stack: main is the only visible view -------------------------
  ok('main view is visible, settings/credits are hidden', await pg.evaluate(() =>
    document.getElementById('mvMain').classList.contains('on') &&
    !document.getElementById('mvSet').classList.contains('on') &&
    !document.getElementById('mvCre').classList.contains('on')));

  // ---- settings view opens, focus lands on the first switch ---------------
  await pg.click('#stg');
  ok('SETTINGS opens its own view', await pg.evaluate(() =>
    document.getElementById('mvSet').classList.contains('on') &&
    !document.getElementById('mvMain').classList.contains('on')));
  ok('settings focus starts on the sound switch', await pg.evaluate(() => document.activeElement.id) === 'swSnd');
  ok('switches carry switch semantics', await pg.evaluate(() => {
    const ids = ['swSnd', 'swFx', 'swCrt', 'swTut'];
    return ids.every(id => document.getElementById(id).getAttribute('role') === 'switch' &&
      ['true', 'false'].includes(document.getElementById(id).getAttribute('aria-checked')));
  }));
  ok('volume slider reflects the saved volume', await pg.evaluate(() =>
    Math.abs(+document.getElementById('setVol').value - Math.round(VOL * 100)) < 1));

  // ---- arrow nav inside the view, slider keeps native arrows --------------
  await pg.keyboard.press('ArrowDown');
  ok('arrows walk the settings view', await pg.evaluate(() => document.activeElement.id) === 'swFx');
  await pg.evaluate(() => document.getElementById('setVol').focus());
  await pg.keyboard.press('ArrowDown');
  const volumeAfterArrow = await pg.evaluate(() => ({ id: document.activeElement.id, v: +document.getElementById('setVol').value }));
  ok('volume slider keeps arrow keys for itself', volumeAfterArrow.id === 'setVol' && volumeAfterArrow.v !== 70, volumeAfterArrow);
  await pg.evaluate(() => setVol(.7));

  // ---- switches stay in sync with the pause-screen buttons ----------------
  await pg.click('#swSnd');
  ok('SOUND switch turns sound off everywhere', await pg.evaluate(() =>
    !snd && document.querySelector('.tsnd').textContent === 'SND OFF' &&
    document.getElementById('swSnd').getAttribute('aria-checked') === 'false'));
  await pg.click('#swSnd');
  ok('SOUND switch turns sound back on', await pg.evaluate(() => snd && document.getElementById('swSnd').classList.contains('on')));

  await pg.click('#swFx');
  ok('PIECE FX switch toggles fx', await pg.evaluate(() =>
    !fx && document.querySelector('.tfx').textContent === 'FX OFF'));
  await pg.keyboard.press('Enter');
  ok('PIECE FX switch works from the keyboard', await pg.evaluate(() => fx));

  await pg.click('#swTut');
  ok('COMMENTATOR switch drives the pause-screen COMMENTATOR button', await pg.evaluate(() =>
    cmt === 1 && prof.cmt === 1 && document.getElementById('tg').textContent === 'COMMENTATOR: ON'));
  await pg.click('#swTut');
  ok('COMMENTATOR switch turns back off', await pg.evaluate(() => cmt === 0 && document.getElementById('tg').textContent === 'COMMENTATOR: OFF'));

  // ---- scanlines: switch, class and persistence ---------------------------
  ok('scanlines default to on', await pg.evaluate(() => !document.body.classList.contains('noscan')));
  await pg.click('#swCrt');
  ok('SCANLINES switch hides the overlay', await pg.evaluate(() =>
    document.body.classList.contains('noscan') && prof.crt === 0 &&
    JSON.parse(localStorage.getItem('pixelchess.v1')).crt === 0));

  // ---- escape returns to the main view and restores focus -----------------
  await pg.keyboard.press('Escape');
  ok('ESC returns to the main view', await pg.evaluate(() =>
    document.getElementById('mvMain').classList.contains('on') &&
    !document.getElementById('mvSet').classList.contains('on')));
  ok('ESC returns focus to the SETTINGS button', await pg.evaluate(() => document.activeElement.id) === 'stg');
  await pg.keyboard.press('Escape');
  ok('ESC on the main view does nothing', await pg.evaluate(() => document.getElementById('mvMain').classList.contains('on')));

  // ---- credits view --------------------------------------------------------
  await pg.click('#crd');
  ok('CREDITS opens its own view', await pg.evaluate(() =>
    document.getElementById('mvCre').classList.contains('on') &&
    !document.getElementById('mvMain').classList.contains('on')));
  ok('credits name the author and the stack', await pg.evaluate(() => {
    const t = document.getElementById('mvCre').textContent.toUpperCase();
    return t.includes('KAGEPRIME') && t.includes('WEB AUDIO');
  }));
  await pg.keyboard.press('Escape');
  ok('ESC leaves the credits back to the main list', await pg.evaluate(() =>
    document.getElementById('mvMain').classList.contains('on') && document.activeElement.id === 'crd'));

  // ---- pause-screen buttons still drive the title switches ----------------
  await pg.click('#stg'); await pg.click('#swSnd'); await pg.keyboard.press('Escape');
  await pg.evaluate(() => { document.querySelector('.tsnd').click(); });
  ok('pause-screen SND button updates the settings switch', await pg.evaluate(() =>
    snd && document.getElementById('swSnd').classList.contains('on') &&
    document.getElementById('swSnd').getAttribute('aria-checked') === 'true'));

  // ---- daily puzzle label owns its own span -------------------------------
  ok('daily puzzle label keeps the streak suffix', await pg.evaluate(() => {
    prof.puz.streak = 3; puzLabel(); const t = document.getElementById('dpLab').textContent;
    prof.puz.streak = 0; puzLabel();
    return t === 'DAILY PUZZLE - 3' && document.getElementById('dpLab').textContent === 'DAILY PUZZLE';
  }));

  // ---- ESC also backs out of the standalone screens ------------------------
  await pg.click('#th');
  await pg.keyboard.press('Escape');
  ok('ESC backs out of the themes screen', await pg.evaluate(() =>
    document.getElementById('s-title').classList.contains('on') &&
    !document.getElementById('s-themes').classList.contains('on') && document.activeElement.id === 'th'));
  await pg.click('#hp');
  await pg.keyboard.press('Escape');
  ok('ESC backs out of the how-to-play screen', await pg.evaluate(() =>
    !document.getElementById('s-help').classList.contains('on') && document.activeElement.id === 'hp'));
  await pg.click('#onl');
  await pg.keyboard.press('Escape');
  ok('ESC backs out of the online screen', await pg.evaluate(() =>
    !document.getElementById('s-net').classList.contains('on') && document.activeElement.id === 'onl'));

  // ---- scanline choice survives a reload ----------------------------------
  await pg.reload();
  await pg.waitForTimeout(400);
  ok('scanline choice survives a reload', await pg.evaluate(() =>
    document.body.classList.contains('noscan') && !document.getElementById('swCrt').classList.contains('on')));
  await pg.close(); await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
