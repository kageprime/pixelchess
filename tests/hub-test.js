// Hub checks: node tests/hub-test.js   (needs: npm i playwright && npx playwright install chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (!cond && extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const fontThere = fs.existsSync(path.join(root, 'shared/vendor/PressStart2P-Regular.woff2'));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // 1. static markup, no JavaScript
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false }), pg = await ctx.newPage();
    await pg.goto(base);
    const cards = await pg.$$eval('.card', a => a.map(x => ({ href: x.getAttribute('href'), dis: x.getAttribute('aria-disabled'), tab: x.getAttribute('tabindex'), t: x.querySelector('h2').textContent, b: x.querySelector('.bd').textContent })));
    ok('eight game cards in the static markup', cards.length === 8, cards.length);
    ok('card order is Chess, Ayo, Draughts, Shogi, Pool, Scrabble, Connect 4, Ludo', cards.map(c => c.t).join() === 'CHESS,AYO,DRAUGHTS,SHOGI,POOL,SCRABBLE,CONNECT 4,LUDO', cards.map(c => c.t));
    ok('Chess, Ayo, Pool, Scrabble, Connect 4 and Ludo are PLAYABLE and link to their pages', cards.filter(c => c.href).length === 6 && cards[0].href === 'chess/index.html' && cards[1].href === 'ayo/index.html' && cards[4].href === 'pool/index.html' && cards[5].href === 'scrabble/index.html' && cards[6].href === 'connect4/index.html' && cards[7].href === 'ludo/index.html' && [0, 1, 4, 5, 6, 7].every(i => cards[i].b === 'PLAYABLE'), cards);
    ok('the other two are SOON, aria-disabled, focusable, no href', [2, 3].every(i => cards[i].b === 'SOON' && cards[i].dis === 'true' && cards[i].tab === '0' && !cards[i].href));
    ok('every card has an inline pixel icon', (await pg.$$('.card svg.ic')).length === 8);
    await ctx.close();
  }

  // 2. every link resolves
  {
    const ctx = await browser.newContext(), pg = await ctx.newPage();
    await pg.goto(base);
    const urls = (await pg.evaluate(() => [...document.querySelectorAll('a[href],link[href],script[src]')].map(e => e.href || e.src))).filter(u => !u.startsWith('data:'));
    const codes = await Promise.all(urls.map(async u => [u, (await ctx.request.get(u)).status()]));
    ok('all links, styles and scripts on the hub resolve (' + urls.length + ')', codes.every(c => c[1] === 200), codes.filter(c => c[1] !== 200));
    const pool = await ctx.request.get(base + 'pool/index.html');
    ok('pool is served at /pool/index.html', pool.status() === 200 && (await pool.text()).includes('Pixel Pool'));
    const scr = await ctx.request.get(base + 'scrabble/index.html');
    ok('scrabble is served at /scrabble/index.html', scr.status() === 200 && (await scr.text()).includes('Pixel Scrabble'));
    const chess = await ctx.request.get(base + 'chess/index.html');
    ok('chess is served at /chess/index.html', chess.status() === 200 && (await chess.text()).includes('Pixel Chess'));
    const scrabble = await ctx.request.get(base + 'scrabble/index.html');
    ok('scrabble is served at /scrabble/index.html', scrabble.status() === 200 && (await scrabble.text()).includes('PIXEL') && (await scrabble.text()).includes('SCRABBLE'));
    for (const gp of [['ayo', 'AYO'], ['connect4', 'CONNECT 4'], ['ludo', 'LUDO']]) {
      const gr = await ctx.request.get(base + gp[0] + '/index.html');
      ok(gp[0] + ' is served at /' + gp[0] + '/index.html', gr.status() === 200 && (await gr.text()).includes(gp[1]));
    }
    await ctx.close();
  }

  // 3. layout at three viewports
  for (const [w, h, cols] of [[360, 640, 1], [740, 360, 2], [1280, 800, 3]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 }), pg = await ctx.newPage();
    await pg.goto(base);
    const m = await pg.evaluate(() => ({
      cols: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length,
      over: document.documentElement.scrollWidth - innerWidth,
      minCard: Math.min(...[...document.querySelectorAll('.card')].map(c => c.getBoundingClientRect().height)),
      snd: document.getElementById('snd').getBoundingClientRect().height,
      clipped: [...document.querySelectorAll('.card')].some(c => { const r = c.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; })
    }));
    ok(`${w}x${h}: ${cols} column(s)`, m.cols === cols, m.cols);
    ok(`${w}x${h}: no sideways scroll, no clipped cards`, m.over <= 0 && !m.clipped, m);
    ok(`${w}x${h}: touch targets are at least 44px`, m.minCard >= 44 && m.snd >= 44, m);
    await pg.screenshot({ path: path.join(root, `hub-${w}x${h}.png`), fullPage: true });
    await ctx.close();
  }

  // 4. behaviour
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage();
    const errs = [], pageErrs = [];
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    pg.on('pageerror', e => pageErrs.push(e.message));
    await pg.goto(base);
    ok('fresh profile: PLAYER / ROOKIE / XP 0 and NO GAMES YET', [await pg.textContent('#cn'), await pg.textContent('#cr'), await pg.textContent('#cx')].join('|') === 'PLAYER|ROOKIE|XP 0' && (await pg.textContent('#best-chess')) === 'NO GAMES YET');

    // SOON cards do nothing on click, Enter or Space
    const before = pg.url();
    for (const i of [2, 3]) {
      const c = pg.locator('.card').nth(i);
      await c.click({ force: true }); await c.focus(); await pg.keyboard.press('Enter'); await pg.keyboard.press('Space');
    }
    await pg.waitForTimeout(150);
    ok('SOON cards never navigate (click, Enter, Space)', pg.url() === before, pg.url());
    await pg.locator('.card').nth(3).focus();
    ok('SOON cards are keyboard focusable', await pg.evaluate(() => document.activeElement.dataset.game) === 'shogi');
    await pg.reload();
    ok('no default focus steal on load', await pg.evaluate(() => document.activeElement === document.body));
    await pg.click('#start');
    await pg.waitForTimeout(600);
    ok('PRESS START focuses the first cabinet', await pg.evaluate(() => document.activeElement.dataset.game) === 'chess');
    await pg.keyboard.press('ArrowDown');
    ok('arrow key moves focus to the next card', await pg.evaluate(() => document.activeElement.dataset.game) === 'ayo');
    await pg.keyboard.press('ArrowUp');
    ok('arrow key moves focus back', await pg.evaluate(() => document.activeElement.dataset.game) === 'chess');
    ok('hint line describes the focused cabinet', /CHESS/.test(await pg.locator('#hint').innerText()));
    ok('footer hints name the controls', /SELECT/.test(await pg.locator('.ft').innerText()) && /ENTER/.test(await pg.locator('.ft').innerText()));
    await pg.keyboard.press('Enter');
    await pg.waitForURL('**/chess/index.html');
    ok('Enter opens the focused game', (await pg.title()).length > 0);
    await pg.goto(base);

    // profile data from chess shows in the header
    await pg.evaluate(() => localStorage.setItem('pixelchess.v1', JSON.stringify({ v: 1, streak: 4, bestStreak: 9, total: { w: 5, l: 1, d: 0 }, rec: { moss: { w: 5, l: 1, d: 0 } }, xp: 120 })));
    await pg.reload();
    ok('chess best line reads STREAK 4 · BEST 9', (await pg.textContent('#best-chess')) === 'STREAK 4 \u00b7 BEST 9', await pg.textContent('#best-chess'));
    ok('header shows XP 120 and rank CADET', (await pg.textContent('#cx')) === 'XP 120' && (await pg.textContent('#cr')) === 'CADET');

    // Shared.addXP contract
    const r = await pg.evaluate(() => Shared.addXP('pool', 200));
    ok('addXP returns the new total and rank', r && r.xp === 320 && r.rank.title === 'VETERAN', r);
    ok('header updates live after addXP', (await pg.textContent('#cx')) === 'XP 320' && (await pg.textContent('#cr')) === 'VETERAN');
    const bad = await pg.evaluate(() => [Shared.addXP('nope', 5), Shared.addXP('pool', -3), Shared.addXP('pool', 'x'), Shared.addXP('pool', 0)]);
    ok('invalid addXP calls are ignored', bad.every(x => x === null), bad);
    const raw = await pg.evaluate(() => JSON.parse(localStorage.getItem('pixelchess.v1')));
    ok('addXP keeps v at 1 and leaves chess fields untouched', raw.v === 1 && raw.streak === 4 && raw.bestStreak === 9 && raw.total.w === 5 && raw.rec.moss.w === 5, raw);
    ok('addXP records per-game xp under byGame', raw.byGame && raw.byGame.pool.xp === 200 && raw.xp === 320, raw.byGame);

    // pool stats from the shared module show on the card
    const rg = await pg.evaluate(() => [Shared.recordGame('pool', true), Shared.recordGame('pool', true), Shared.recordGame('pool', false), Shared.recordGame('nope', true)]);
    ok('recordGame keeps wins, losses, streak and best', rg[2].w === 2 && rg[2].l === 1 && rg[2].streak === 0 && rg[2].best === 2 && rg[3] === null, rg);
    ok('pool card shows STREAK 0 · BEST 2 after those games', (await pg.textContent('#best-pool')) === 'STREAK 0 \u00b7 BEST 2', await pg.textContent('#best-pool'));
    await pg.evaluate(() => Shared.recordGame('scrabble', true));
    ok('scrabble card shows its streak too', (await pg.textContent('#best-scrabble')) === 'STREAK 1 \u00b7 BEST 1', await pg.textContent('#best-scrabble'));
    const raw2 = await pg.evaluate(() => JSON.parse(localStorage.getItem('pixelchess.v1')));
    ok('recordGame leaves xp and chess fields alone', raw2.xp === 320 && raw2.streak === 4 && raw2.byGame.pool.xp === 200, raw2);
    await pg.evaluate(() => localStorage.removeItem('pixelchess.v1')); await pg.reload();
    ok('clearing storage really resets the profile (no stale in-memory copy)', (await pg.textContent('#cx')) === 'XP 0' && (await pg.textContent('#best-pool')) === 'NO GAMES YET');
    await pg.evaluate(() => localStorage.setItem('pixelchess.v1', JSON.stringify({ v: 1, streak: 4, bestStreak: 9, total: { w: 5, l: 1, d: 0 }, xp: 320, byGame: { pool: { xp: 200 } } }))); await pg.reload();

    // sound toggle persists
    await pg.click('#snd');
    ok('sound toggle flips to OFF', (await pg.textContent('#snd')) === 'SOUND: OFF');
    await pg.reload();
    ok('sound choice survives a reload', (await pg.textContent('#snd')) === 'SOUND: OFF');
    await pg.click('#snd');

    // floor look: ticker marquee, lit chess cabinet, initials chip
    ok('ticker names the new games', /PIXEL POOL 3D/.test(await pg.locator('.tick').innerText()));
    ok('chess cabinet is lit', await pg.evaluate(() => document.querySelector('[data-game="chess"]').classList.contains('lit')));
    await pg.evaluate(() => localStorage.setItem('pixelchess.v1', JSON.stringify({ v: 1, name: 'Kage Prime' })));
    await pg.reload();
    ok('chip derives initials from the name', (await pg.textContent('#ci')) === 'KPA');

    // SOON cabinets never start anything via keyboard either
    await pg.click('#start');
    await pg.waitForTimeout(600);
    await pg.keyboard.press('ArrowRight');
    await pg.keyboard.press('ArrowRight');
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(300);
    ok('Enter on a SOON cabinet stays put', (await pg.evaluate(() => document.activeElement.dataset.game)) === 'draughts' && !pg.url().includes('draughts'));
    await pg.goto(base);

    const real = errs.filter(e => !(!fontThere && /PressStart2P|woff2|404/.test(e)) && !/fonts\.googleapis|fonts\.gstatic|ERR_FAILED|ERR_NAME|ERR_INTERNET|ERR_CONNECTION/.test(e));
    ok('no console errors or page errors' + (fontThere ? '' : ' (ignoring the not-yet-vendored font 404)'), real.length === 0 && pageErrs.length === 0, { real, pageErrs });
    await ctx.close();
  }

  // 5. offline after first visit
  {
    const ctx = await browser.newContext(), pg = await ctx.newPage();
    await pg.goto(base);
    await pg.evaluate(() => navigator.serviceWorker.ready);
    await pg.reload();
    ok('service worker controls the page after the first visit', await pg.evaluate(() => !!navigator.serviceWorker.controller));
    await pg.goto(base + 'chess/index.html'); await pg.waitForTimeout(300);
    await pg.goto(base + 'pool/index.html'); await pg.waitForTimeout(300);
    await pg.goto(base + 'scrabble/index.html'); await pg.waitForTimeout(300);
    await pg.goto(base + 'ayo/index.html'); await pg.waitForTimeout(300);
    await pg.goto(base + 'connect4/index.html'); await pg.waitForTimeout(300);
    await pg.goto(base + 'ludo/index.html'); await pg.waitForTimeout(300);
    await ctx.setOffline(true);
    await pg.goto(base);
    ok('hub loads offline with all eight cards', (await pg.$$('.card')).length === 8);
    ok('hub script still works offline', (await pg.textContent('#cr')).length > 0);
    await pg.goto(base + 'chess/index.html');
    ok('chess loads offline', (await pg.$('#cv')) !== null);
    await pg.goto(base + 'pool/index.html');
    ok('pool loads offline and racks a game', (await pg.$('#shoot')) !== null && await pg.evaluate(() => { window.__pool.newGame('cpu', 1); return window.__pool.balls.length === 16 && (window.__pool.state === 'place' || window.__pool.state === 'aim'); }));
    await pg.goto(base + 'scrabble/index.html');
    ok('scrabble loads offline with a board', (await pg.$('#bd')) !== null);
    await pg.goto(base + 'scrabble/index.html');
    ok('scrabble loads offline and deals a game', (await pg.$('#bStart')) !== null && await pg.evaluate(() => { newGame(); return P[0].r.length === 7 && bag.length === 86; }));
    await pg.goto(base + 'connect4/index.html');
    ok('connect4 loads offline and plays', (await pg.$$('#grid .cell')).length === 42 && await pg.evaluate(() => { document.querySelector('#cols button').click(); return document.querySelectorAll('#grid .disc').length >= 1; }));
    await pg.goto(base + 'ayo/index.html');
    ok('ayo loads offline', /ayo/i.test(await pg.title()));
    await pg.goto(base + 'ludo/index.html');
    ok('ludo loads offline', /ludo/i.test(await pg.title()));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
