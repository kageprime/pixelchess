// Shell checks: node tests/shell-test.js   (needs: npm i playwright && npx playwright install chromium)
// Covers the arcade shell on chess (pilot game): start-screen hierarchy, sidebar drawer,
// snapshot save/resume round-trip through quit and reload, corrupt-save fail-closed.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (!cond && extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await ctx.newPage();
  const errs = [], pageErrs = [];
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', e => pageErrs.push(e.message));
  await pg.goto(base + 'chess/index.html');
  await pg.waitForTimeout(600);

  // ---- start-screen hierarchy: one primary CTA, mode cards, fresh focus unchanged ----
  ok('title has one PLAY cta plus a hidden CONTINUE', (await pg.$('#shPlay')) && (await pg.$('#shResume')) && (await pg.$('#shResume')).isHidden());
  ok('mode cards carry pressed state, cpu selected', (await pg.getAttribute('[data-m="1"]', 'aria-pressed')) === 'true' && (await pg.getAttribute('[data-m="2"]', 'aria-pressed')) === 'false');
  ok('default focus is still VS CPU', await pg.evaluate(() => document.activeElement.dataset.m) === '1');
  await pg.click('#shPlay');
  ok('PLAY starts the selected mode (opponent screen)', await pg.evaluate(() => document.querySelector('#s-opp').classList.contains('on')));
  await pg.click('#ob');
  await pg.click('[data-m="2"]');
  await pg.waitForTimeout(300);
  ok('mode card still starts 2P directly', await pg.evaluate(() => typeof inGame !== 'undefined' && inGame && gmode === '2p'));

  // ---- sidebar drawer ----
  ok('menu button is mounted in the top bar', await pg.evaluate(() => !!document.querySelector('#shMount .sh-fab')));
  await pg.click('#shMount .sh-fab');
  ok('drawer opens with dialog semantics', await pg.evaluate(() => document.querySelector('.sh-drawer').classList.contains('on') && document.querySelector('.sh-drawer').getAttribute('aria-hidden') === 'false'));
  ok('drawer quits to the arcade', (await pg.getAttribute('.sh-drawer a.sh-btn', 'href')) === '../index.html');
  ok('drawer restart shows mid-game, resume hides with no save', await pg.evaluate(() => {
    const vis = t => [...document.querySelectorAll('.sh-drawer .sh-btn')].find(b => b.textContent.includes(t));
    return !vis('RESTART').hidden && vis('CONTINUE').hidden;
  }));
  await pg.keyboard.press('Escape');
  ok('Escape closes and focus returns to the menu button', await pg.evaluate(() => !document.querySelector('.sh-drawer').classList.contains('on') && document.activeElement.classList.contains('sh-fab')));

  // ---- snapshot round-trip: play, quit to arcade, reload, continue ----
  const saved = await pg.evaluate(() => { play(6, 4, 4, 4, 'Q'); shSave(); return !!localStorage.getItem('pixelarcade.save.chess'); });
  ok('a mid-game quit leaves a snapshot', saved);
  await pg.click('#shMount .sh-fab');
  await Promise.all([pg.waitForURL('**/index.html'), pg.click('.sh-drawer a.sh-btn')]);
  ok('drawer quit lands on the hub', /index\.html$/.test(pg.url()));
  await pg.goto(base + 'chess/index.html');
  await pg.waitForTimeout(600);
  ok('title offers CONTINUE after reload', await pg.evaluate(() => !document.querySelector('#shResume').hidden));
  await pg.click('#shResume');
  const resumed = await pg.evaluate(() => ({ game: inGame, pawn: b[4][4] === 'wP', hist: hist.length }));
  ok('continue restores the exact position', resumed.game && resumed.pawn && resumed.hist === 1, resumed);
  const undoOk = await pg.evaluate(() => { undo(); return b[6][4] === 'wP' && hist.length === 0; });
  ok('undo works after a restore', undoOk);

  // ---- corrupt saves fail closed ----
  await pg.evaluate(() => { localStorage.setItem('pixelarcade.save.chess', '{nope'); shRefreshTitle(); });
  ok('a corrupt snapshot hides CONTINUE', await pg.evaluate(() => document.querySelector('#shResume').hidden && shRestore() === false));
  await pg.evaluate(() => { localStorage.setItem('pixelarcade.save.chess', JSON.stringify({ v: 1, t: 1, state: { v: 1, gmode: 'ladder', ai: true, oppId: 'nope', turn: 'w', b: { g: [], cr: {} }, hist: [] } })); });
  ok('an unknown opponent fails validation', await pg.evaluate(() => shRestore() === false));

  // ---- connect4 quit/resume round-trip (2P, fully black-box) ----
  {
    const p2 = await ctx.newPage();
    await p2.goto(base + 'connect4/index.html');
    await p2.click('[data-mode="2p"]');
    await p2.click('#cols button[data-k="3"]');
    await p2.waitForTimeout(300);
    await p2.click('#shMount .sh-fab');
    await Promise.all([p2.waitForURL('**/index.html'), p2.click('.sh-drawer a.sh-btn')]);
    ok('connect4 quit saves and lands on the hub', p2.url().includes('index.html') && await p2.evaluate(() => !!localStorage.getItem('pixelarcade.save.connect4')));
    await p2.goto(base + 'connect4/index.html');
    await p2.waitForTimeout(400);
    await p2.click('#shMount .sh-fab');
    ok('connect4 offers CONTINUE after reload', await p2.evaluate(() => ![...document.querySelectorAll('.sh-drawer .sh-btn')].find(b => b.textContent.includes('CONTINUE')).hidden));
    await p2.evaluate(() => [...document.querySelectorAll('.sh-drawer .sh-btn')].find(b => b.textContent.includes('CONTINUE')).click());
    await p2.waitForTimeout(300);
    ok('connect4 restores the discs', (await p2.evaluate(() => document.querySelectorAll('#grid .disc').length)) >= 1);
    await p2.close();
  }

  // ---- ayo quit/resume round-trip (2P, keyboard sow) ----
  {
    const p3 = await ctx.newPage();
    const errs3 = []; p3.on('pageerror', e => errs3.push(e.message));
    await p3.goto(base + 'ayo/index.html');
    await p3.waitForTimeout(800);
    await p3.click('#md [data-v="2p"]');
    await p3.keyboard.press('1');
    await p3.waitForTimeout(2500);
    await p3.click('#shMount .sh-fab');
    await Promise.all([p3.waitForURL('**/index.html'), p3.click('.sh-drawer a.sh-btn')]);
    ok('ayo quit saves a mid-game snapshot', await p3.evaluate(() => !!localStorage.getItem('pixelarcade.save.ayo')));
    await p3.goto(base + 'ayo/index.html');
    await p3.waitForTimeout(800);
    await p3.click('#shMount .sh-fab');
    await p3.evaluate(() => [...document.querySelectorAll('.sh-drawer .sh-btn')].find(b => b.textContent.includes('CONTINUE')).click());
    await p3.waitForTimeout(500);
    ok('ayo continue resumes the 2P game', /TOP'S TURN/.test(await p3.textContent('#status')), await p3.textContent('#status'));
    ok('ayo has no page errors', errs3.length === 0, errs3);
    await p3.close();
  }

  // ---- ludo quit/resume round-trip (2P pass-and-play, die roll) ----
  {
    const p4 = await ctx.newPage();
    const errs4 = []; p4.on('pageerror', e => errs4.push(e.message));
    await p4.goto(base + 'ludo/index.html');
    await p4.waitForTimeout(800);
    await p4.click('#np [data-v="2"]');
    await p4.click('#md [data-v="pass"]');
    await p4.click('#die');
    await p4.waitForTimeout(4500);
    await p4.click('#shMount .sh-fab');
    await Promise.all([p4.waitForURL('**/index.html'), p4.click('.sh-drawer a.sh-btn')]);
    ok('ludo quit saves a turn-boundary snapshot', await p4.evaluate(() => !!localStorage.getItem('pixelarcade.save.ludo')));
    await p4.goto(base + 'ludo/index.html');
    await p4.waitForTimeout(800);
    await p4.click('#shMount .sh-fab');
    await p4.evaluate(() => [...document.querySelectorAll('.sh-drawer .sh-btn')].find(b => b.textContent.includes('CONTINUE')).click());
    await p4.waitForTimeout(800);
    ok('ludo continue restores the 2P setup', (await p4.evaluate(() => document.querySelectorAll('#players .pcard').length)) === 2);
    ok('ludo has no page errors', errs4.length === 0, errs4);
    await p4.close();
  }

  // ---- pool quit/resume round-trip (2P, driven through __pool) ----
  {
    const p5 = await ctx.newPage();
    const errs5 = []; p5.on('pageerror', e => errs5.push(e.message));
    await p5.goto(base + 'pool/index.html');
    await p5.waitForTimeout(600);
    await p5.evaluate(() => { window.__pool.newGame('2p', 1); window.__pool.confirmPlace(); });
    await p5.waitForTimeout(300);
    ok('pool mounts the arcade menu in the HUD', await p5.evaluate(() => !!document.querySelector('#mid .sh-fab')));
    await p5.click('#mid .sh-fab');
    await Promise.all([p5.waitForURL('**/index.html'), p5.click('.sh-drawer a.sh-btn')]);
    ok('pool quit saves and lands on the hub', p5.url().includes('index.html') && await p5.evaluate(() => !!localStorage.getItem('pixelarcade.save.pool')));
    await p5.goto(base + 'pool/index.html');
    await p5.waitForTimeout(600);
    ok('pool menu offers CONTINUE after reload', await p5.evaluate(() => !document.getElementById('bContinue').hidden));
    await p5.click('#bContinue');
    await p5.waitForTimeout(500);
    const poolSt = await p5.evaluate(() => ({ state: window.__pool.state, balls: window.__pool.balls.length }));
    ok('pool continue restores the table', (poolSt.state === 'place' || poolSt.state === 'aim') && poolSt.balls === 16, poolSt);
    ok('pool has no page errors', errs5.length === 0, errs5);
    await p5.close();
  }

  // ---- scrabble quit/resume round-trip (played tiles from the bag) ----
  {
    const p6 = await ctx.newPage();
    const errs6 = []; p6.on('pageerror', e => errs6.push(e.message));
    await p6.goto(base + 'scrabble/index.html');
    await p6.waitForTimeout(400);
    const word = await p6.evaluate(() => {
      newGame();
      const t = [bag.pop(), bag.pop(), bag.pop()];
      B[7][7] = { l: t[0].l, b: t[0].b, f: 1 }; B[7][8] = { l: t[1].l, b: t[1].b, f: 1 }; B[7][9] = { l: t[2].l, b: t[2].b, f: 1 };
      render(); return t.map(x => x.l).join('');
    });
    ok('scrabble mounts the arcade menu in the top bar', await p6.evaluate(() => !!document.querySelector('#shMount .sh-fab')));
    await p6.click('#bReveal');
    await p6.click('#shMount .sh-fab');
    await Promise.all([p6.waitForURL('**/index.html'), p6.click('.sh-drawer a.sh-btn')]);
    ok('scrabble quit saves and lands on the hub', p6.url().includes('index.html') && await p6.evaluate(() => !!localStorage.getItem('pixelarcade.save.scrabble')));
    await p6.goto(base + 'scrabble/index.html');
    await p6.waitForTimeout(400);
    ok('scrabble title offers CONTINUE after reload', await p6.evaluate(() => !document.getElementById('bContinue').hidden));
    await p6.click('#bContinue');
    await p6.waitForTimeout(400);
    const back = await p6.evaluate(() => [B[7][7].l, B[7][8].l, B[7][9].l].join(''));
    ok('scrabble continue restores the board tiles', back === word, { word, back });
    ok('scrabble continue shows the pass-the-phone screen', await p6.evaluate(() => document.getElementById('s-hand').classList.contains('on')));
    ok('scrabble has no page errors', errs6.length === 0, errs6);
    await p6.close();
  }

  const real = errs.filter(e => !/fonts\.googleapis|fonts\.gstatic|ERR_|Failed to load|404/.test(e));
  ok('no console or page errors', real.length === 0 && pageErrs.length === 0, { real, pageErrs });
  await ctx.close(); await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
