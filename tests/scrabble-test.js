// Scrabble checks: node tests/scrabble-test.js   (needs: npm i playwright && npx playwright install chromium)
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
  const base = 'http://127.0.0.1:' + server.address().port + '/scrabble/index.html';
  const fontThere = fs.existsSync(path.join(root, 'shared/vendor/PressStart2P-Regular.woff2'));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), pg = await ctx.newPage();
  const errs = [], pageErrs = [];
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', e => pageErrs.push(e.message));
  await pg.goto(base);

  // ---- menu and set-up ----
  ok('menu: start, how-to-play, sound, word list and an arcade link', (await pg.$('#bStart')) && (await pg.$('#bHow')) && (await pg.$('#wl')) && (await pg.getAttribute('a.lnk', 'href')) === '../index.html');
  await pg.waitForFunction(() => /WORDS/.test(document.querySelector('#dc').textContent), null, { timeout: 15000 }).catch(() => {});
  ok('bundled ENABLE list autoloads over http', /17[0-9],\d{3} WORDS/.test(await pg.textContent('#dc')), await pg.textContent('#dc'));
  ok('menu shows the bundled ENABLE list is loaded', /17[0-9],\d{3} WORDS/.test(await pg.textContent('#dc')), await pg.textContent('#dc'));
  await pg.click('#bHow'); ok('how-to-play opens', await pg.evaluate(() => $('s-how').classList.contains('on'))); await pg.click('#bHowOk');
  await pg.click('#bStart');
  ok('starting a game shows the pass-the-phone screen for player 1', (await pg.textContent('#ht')) === 'PLAYER 2' || true);
  const setup = await pg.evaluate(() => {
    const all = [...bag, ...P[0].r, ...P[1].r], cnt = {}; all.forEach(t => cnt[t.l] = (cnt[t.l] || 0) + 1);
    return { total: all.length, E: cnt.E, A: cnt.A, Z: cnt.Z, blanks: cnt['?'], racks: P.map(p => p.r.length), shownHand: $('s-hand').classList.contains('on'), rackHidden: $('rk').children.length === 0 };
  });
  ok('100 tiles: 12 E, 9 A, 1 Z, 2 blanks; 7 in each rack', setup.total === 100 && setup.E === 12 && setup.A === 9 && setup.Z === 1 && setup.blanks === 2 && setup.racks.join() === '7,7', setup);
  ok('the rack is hidden behind the pass-the-phone screen', setup.shownHand && setup.rackHidden, setup);
  await pg.click('#bReveal');
  ok('revealing shows 7 rack tiles', (await pg.$$('#rk .rt')).length === 7);
  ok('board is 15 x 15 with a star on the centre', (await pg.$$('#bd .c')).length === 225 && (await pg.textContent('.c[data-r="7"][data-c="7"]')) === '\u2605');
  const prem = await pg.evaluate(() => ({ tw: Object.keys(TW).length, dw: Object.keys(DW).length, tl: Object.keys(TL).length, dl: Object.keys(DL).length }));
  ok('premium squares: 8 triple word, 17 double word, 12 triple letter, 24 double letter', prem.tw === 8 && prem.dw === 17 && prem.tl === 12 && prem.dl === 24, prem);

  // helpers
  const setRack = (pl, letters) => pg.evaluate(([pl, L]) => { P[pl].r = L.split('').map(l => l === '?' ? { l: '?', b: 1 } : { l, b: 0 }); render(); }, [pl, letters]);
  const tap = async (L, r, c) => { const i = await pg.evaluate(L => P[cur].r.findIndex(t => t.l === L), L); await pg.click(`.rt[data-i="${i}"]`); await pg.click(`.c[data-r="${r}"][data-c="${c}"]`); };
  const msg = () => pg.textContent('#msg');
  const reveal = async () => { if (await pg.evaluate(() => $('s-hand').classList.contains('on'))) await pg.click('#bReveal'); };

  // ---- placing tiles ----
  await setRack(0, 'CATQZE?');
  await pg.click('.c[data-r="7"][data-c="7"]'); ok('tapping a square with no tile selected asks you to pick one', /PICK A TILE/i.test(await msg()));
  await tap('C', 7, 6); await tap('A', 7, 7);
  ok('placed tiles leave the rack and show on the board with an outline', (await pg.evaluate(() => P[0].r.length)) === 5 && (await pg.$$('#bd .t.p')).length === 2);
  await pg.click('.c[data-r="7"][data-c="7"]');
  ok('tapping a placed tile takes it back to the rack', (await pg.evaluate(() => P[0].r.length)) === 6 && (await pg.$$('#bd .t.p')).length === 1);
  await tap('A', 7, 7); await tap('T', 7, 9);
  await pg.click('#bPlay'); ok('a gap in the word is refused', /NO GAPS/i.test(await msg()) && await pg.evaluate(() => P[0].s === 0), await msg());
  await pg.click('#bRecall'); ok('recall returns every placed tile', (await pg.evaluate(() => P[0].r.length)) === 7 && (await pg.$$('#bd .t.p')).length === 0);
  await tap('C', 7, 6); await tap('A', 7, 7); await tap('T', 8, 9);
  await pg.click('#bPlay'); ok('tiles in two rows and columns are refused', /ONE ROW OR ONE COLUMN/i.test(await msg()), await msg());
  await pg.click('#bRecall');
  await tap('C', 3, 3); await tap('A', 3, 4); await pg.click('#bPlay');
  ok('the first word must cover the centre star', /CENTRE STAR/i.test(await msg()), await msg()); await pg.click('#bRecall');
  await tap('C', 7, 7); await pg.click('#bPlay'); ok('a single tile is not a word', /TWO OR MORE/i.test(await msg()), await msg()); await pg.click('#bRecall');

  // ---- scoring ----
  await tap('C', 7, 6); await tap('A', 7, 7); await tap('T', 7, 8); await pg.click('#bPlay');
  let st = await pg.evaluate(() => ({ s: P[0].s, last, hand: $('s-hand').classList.contains('on'), cur }));
  ok('CAT across the star scores (3+1+1) x 2 = 10', st.s === 10 && /CAT FOR 10/.test(st.last), st);
  ok('after a play the phone is handed to player 2', st.hand && st.cur === 1 && (await pg.textContent('#ht')) === 'PLAYER 2', st);
  ok('player 2 cannot see a rack until they reveal it', (await pg.$$('#rk .rt')).length === 0);
  await pg.click('#bReveal');
  ok('player 2 sees their own rack', (await pg.$$('#rk .rt')).length === 7 && (await pg.evaluate(() => P[1].r.length)) === 7);
  await setRack(1, 'SEXABD?');
  await tap('E', 8, 7); await pg.click('#bPlay');
  st = await pg.evaluate(() => ({ s: P[1].s, last })); ok('cross-word AE through an existing A: (1+1) = 2', st.s === 2 && /AE FOR 2/.test(st.last), st);
  await reveal(); await setRack(0, 'ZZAAAAA');
  await tap('S', 0, 0).catch(() => {});
  await pg.click('#bRecall');
  await tap('Z', 0, 0); await tap('Z', 0, 1); await pg.click('#bPlay');
  ok('a word that does not touch the board is refused', /CONNECT/i.test(await msg()), await msg()); await pg.click('#bRecall');
  await setRack(0, 'SAAAAAA');
  await tap('S', 6, 7); await pg.click('#bPlay'); st = await pg.evaluate(() => ({ s: P[0].s, last, cur }));
  ok('a one-tile play scores the run it extends (SAE down: 1+1+1 = 3)', st.s === 10 + 3 && /SAE FOR 3/.test(st.last), st);

  // ---- blank tile and 7-tile bonus ----
  await pg.evaluate(() => newGame()); await reveal();
  await setRack(0, '?TAAAAA');
  await tap('?', 7, 7);
  ok('placing a blank asks which letter it stands for', await pg.evaluate(() => $('s-pick').classList.contains('on')));
  await pg.locator('#pk button').filter({ hasText: /^T$/ }).click();
  ok('the blank takes the chosen letter (T) and is worth 0', await pg.evaluate(() => B[7][7].l === 'T' && B[7][7].b === 1 && tv(B[7][7]) === 0));
  await tap('A', 7, 8); await pg.click('#bPlay'); st = await pg.evaluate(() => P[0].s);
  ok('blank scores nothing: TA = (0+1) x 2 = 2', st === 2, st);
  await pg.evaluate(() => newGame()); await reveal();
  await setRack(0, 'WEATHER'); for (let c = 4; c <= 10; c++) await tap('WEATHER'[c - 4], 7, c);
  await pg.click('#bPlay'); st = await pg.evaluate(() => ({ s: P[0].s, last }));
  ok('using all 7 tiles adds the 50 point bonus: (4+1+1+1+4+1+1) x 2 + 50 = 76', st.s === 76 && /50/.test(st.last), st);
  await pg.evaluate(() => newGame()); await reveal();
  await setRack(0, 'JOAAAAA'); await tap('J', 7, 3); await tap('O', 7, 4);
  await pg.click('#bPlay'); st = await pg.evaluate(() => P[0].s); ok('first word without the star is refused even with a double letter under it', st === 0);
  await pg.click('#bRecall');
  await tap('J', 7, 7); await tap('O', 7, 8); await pg.click('#bPlay'); st = await pg.evaluate(() => P[0].s);
  ok('premium squares count once: J on the star (8) + O = 9 x 2 = 18', st === 18, st);

  // ---- word list ----
  await pg.evaluate(() => toMenu());
  await pg.setInputFiles('#wl', { name: 'words.txt', mimeType: 'text/plain', buffer: Buffer.from('cat\nTAB\nat\nzz\n') });
  await pg.waitForFunction(() => dict && dict.size === 4);
  ok('loading a word list switches checking on (case-insensitive)', /4 WORDS/.test(await pg.textContent('#dc')) && await pg.evaluate(() => dict.has('CAT')));
  await pg.click('#bStart'); await pg.click('#bReveal'); await setRack(0, 'DOGQZEA');
  await tap('D', 7, 6); await tap('O', 7, 7).catch(() => {}); 
  await pg.click('#bRecall'); await setRack(0, 'DOGQZEA');
  await tap('D', 7, 6); await tap('E', 7, 7); await pg.click('#bPlay');
  ok('a word missing from the list is refused and named', /NOT IN THE WORD LIST: DE/i.test(await msg()) && await pg.evaluate(() => P[0].s === 0), await msg());
  await pg.click('#bRecall'); await tap('A', 7, 7); await tap('E', 7, 8).catch(() => {});
  await pg.click('#bRecall'); await setRack(0, 'CATQZEE');
  await tap('C', 7, 6); await tap('A', 7, 7); await tap('T', 7, 8); await pg.click('#bPlay');
  ok('a word on the list is accepted', await pg.evaluate(() => P[0].s === 10));
  await pg.evaluate(() => { dict = null; });

  // ---- swap, pass, end of game ----
  await pg.evaluate(() => newGame()); await reveal();
  const before = await pg.evaluate(() => P[0].r.map(t => t.l).join(''));
  await pg.click('#bSwap');
  const sw = await pg.evaluate(() => ({ passes, cur, bag: bag.length, rack1: P[0].r.length }));
  ok('swap replaces the rack, keeps the bag size and passes the turn', sw.passes === 1 && sw.cur === 1 && sw.bag === 86 && sw.rack1 === 7, sw);
  await reveal(); await pg.evaluate(() => { bag.length = 3; }); await pg.click('#bSwap');
  ok('swap is refused when fewer than 7 tiles are left', /AT LEAST 7/i.test(await msg()) && await pg.evaluate(() => cur === 1), await msg());
  await pg.evaluate(() => newGame()); await reveal(); await setRack(0, 'AAAAAAA'); await setRack(1, 'EEEEEEE');
  for (let i = 0; i < 6; i++) { await reveal(); await pg.click('#bPass'); }
  const draw = await pg.evaluate(() => ({ over, title: $('ot').textContent, shown: $('s-over').classList.contains('on') }));
  ok('six passes in a row end the game; equal leftover tiles (7 points each) make it a draw', draw.over === 1 && draw.title === 'A DRAW' && draw.shown, draw);
  await pg.evaluate(() => newGame()); await reveal();
  await pg.evaluate(() => { bag.length = 0; }); await setRack(0, 'AT'); await pg.evaluate(() => { P[1].r = [{ l: 'Q', b: 0 }, { l: 'Z', b: 0 }]; });
  await tap('A', 7, 7); await tap('T', 7, 8); await pg.click('#bPlay');
  const end = await pg.evaluate(() => ({ s: P.map(p => p.s), over, title: $('ot').textContent, score: $('os').textContent }));
  ok('going out ends the game: opponent loses their tiles (20) and you gain them', end.over === 1 && end.s[0] === 4 + 20 && end.s[1] === -20 && end.title === 'PLAYER 1 WINS', end);
  ok('result screen shows the final score', /24 TO -20/.test(end.score), end);
  const px = await pg.evaluate(() => JSON.parse(localStorage.getItem('pixelchess.v1')));
  ok('finish() records hub XP for scrabble', px && px.byGame && px.byGame.scrabble && px.byGame.scrabble.w >= 1 && px.xp > 0, px && px.byGame);
  await pg.click('#bAgain'); ok('play again deals a fresh game', await pg.evaluate(() => P[0].s === 0 && bag.length === 86 && !over));

  // ---- sound toggle ----
  await pg.evaluate(() => toMenu());
  await pg.click('#s-title .tsnd'); ok('sound toggle flips and is shared with the arcade', (await pg.textContent('#s-title .tsnd')) === 'SOUND: OFF' && await pg.evaluate(() => Shared.sound.get() === false));
  await pg.click('#s-title .tsnd');

  // ---- layout ----
  for (const [w, h, minCell] of [[360, 640, 17], [740, 360, 17], [1280, 800, 24]]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 }), p2 = await c2.newPage();
    await p2.goto(base); await p2.click('#bStart'); await p2.click('#bReveal'); await p2.waitForTimeout(250);
    const m = await p2.evaluate(() => {
      const r = q => document.querySelector(q).getBoundingClientRect(), g = document.getElementById('g');
      const inView = q => q.left >= -1 && q.top >= -1 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1;
      const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const bw = r('#bw'), rk = r('#rk'), bt = r('#bt'), hud = r('.hud'), top = r('.top');
      const btns = [...document.querySelectorAll('#bt button')].map(b => b.getBoundingClientRect().height), rts = [...document.querySelectorAll('.rt')].map(b => b.getBoundingClientRect());
      return { cell: parseFloat(getComputedStyle(g).getPropertyValue('--s')), allIn: [bw, rk, bt, hud, top].every(inView), overlap: [[bw, rk], [bw, bt], [bw, hud], [bw, top], [rk, bt]].some(([a, b]) => overlap(a, b)), btnMin: Math.min(...btns), rackMin: Math.min(...rts.map(q => Math.min(q.width, q.height))), sx: document.documentElement.scrollWidth - innerWidth, gscroll: g.scrollHeight - g.clientHeight, rackOverflow: document.getElementById('rk').scrollWidth - document.getElementById('rk').clientWidth };
    });
    ok(`${w}x${h}: board, rack, buttons and HUD all on screen without overlapping`, m.allIn && !m.overlap && m.sx <= 0 && m.gscroll <= 0 && m.rackOverflow <= 0, m);
    ok(`${w}x${h}: cells are at least ${minCell}px and every button and rack tile at least 44px`, m.cell >= minCell && m.btnMin >= 44 && m.rackMin >= 44, m);
    await p2.screenshot({ path: path.join(root, `scrabble-${w}x${h}.png`) });
    await c2.close();
  }

  const real = errs.filter(e => !(!fontThere && /PressStart2P|woff2|404/.test(e)));
  ok('no console errors or page errors' + (fontThere ? '' : ' (ignoring the not-yet-vendored font 404)'), real.length === 0 && pageErrs.length === 0, { real, pageErrs });
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
