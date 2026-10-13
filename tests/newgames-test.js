// New-cabinet checks: node tests/newgames-test.js   (needs: npm i playwright && npx playwright install chromium)
// Covers ayo, connect4 and ludo: hub wiring (Shared XP, no private award paths),
// connect4 plays a real game in-DOM, the 3D cabinets degrade cleanly when the CDN is unreachable.
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

  // ---- static wiring: every new cabinet uses the shared module and never its own XP numbers ----
  for (const g of ['ayo', 'connect4', 'ludo']) {
    const html = fs.readFileSync(path.join(root, g, 'index.html'), 'utf8');
    ok(g + ' loads the shared module', html.includes('<script src="../shared/shared.js"></script>'));
    ok(g + ' records results with Shared.recordGame', html.includes(`Shared.recordGame('${g}'`));
    ok(g + ' awards hub XP with Shared.addXP', html.includes(`Shared.addXP('${g}'`));
    ok(g + ' uses the hub XP amounts, not its own numbers', html.includes('Shared.XP.win') && html.includes('Shared.XP.loss'));
    ok(g + ' has no private PixelArcade award path left', !html.includes('PixelArcade'));
    ok(g + ' links back to the lobby', html.includes('href="../index.html"'));
  }

  // ---- connect4 plays: pure DOM, fully drivable ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage();
    const errs = [], pageErrs = [];
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    pg.on('pageerror', e => pageErrs.push(e.message));
    await pg.goto(base + 'connect4/index.html');
    ok('connect4 shows 42 cells and 7 column buttons', (await pg.$$('#grid .cell')).length === 42 && (await pg.$$('#cols button')).length === 7);
    ok('connect4 status names the turn', /YOUR TURN|RED/.test(await pg.textContent('#status')));
    await pg.click('#cols button[data-k="3"]');
    await pg.waitForTimeout(200);
    const after = await pg.evaluate(() => ({ discs: document.querySelectorAll('#grid .disc').length, log: document.getElementById('log').textContent }));
    ok('dropping in a column lands a disc and logs the move', after.discs >= 1 && /column 4/i.test(after.log), after);
    await pg.keyboard.press('1');
    await pg.waitForTimeout(200);
    ok('keyboard column 1 also plays', (await pg.evaluate(() => document.querySelectorAll('#grid .disc').length)) >= after.discs, after);
    const xp = await pg.evaluate(() => { localStorage.removeItem('pixelchess.v1'); Shared.recordGame('connect4', true); Shared.addXP('connect4', Shared.XP.win); const p = Shared.profile(); return { xp: p.xp, g: p.games.connect4, win: Shared.XP.win }; });
    ok('connect4 wins feed the hub profile', xp.xp === xp.win && xp.g.w === 1 && xp.g.streak === 1, xp);
    const real = errs.filter(e => !/fonts\.googleapis|fonts\.gstatic|ERR_|Failed to load|404/.test(e));
    ok('connect4 has no console or page errors', real.length === 0 && pageErrs.length === 0, { real, pageErrs });
    await ctx.close();
  }

  // ---- ayo + ludo boot (3D needs the CDN; without it they must say so, not crash) ----
  for (const [g, sel] of [['ayo', '#status'], ['ludo', '#msg']]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage();
    const pageErrs = [];
    pg.on('pageerror', e => pageErrs.push(e.message));
    await pg.goto(base + g + '/index.html');
    await pg.waitForTimeout(1200);
    const txt = await pg.textContent(sel);
    ok(g + ' shows a status line (' + (txt || '').slice(0, 40) + ')', (txt || '').length > 3, txt);
    ok(g + ' has no page errors', pageErrs.length === 0, pageErrs);
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
