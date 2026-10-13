// Pool checks: node tests/pool-test.js   (needs: npm i playwright && npx playwright install chromium)
// Covers the Pixel Pool 3D build at pool/index.html (WebGL table, spin/power HUD, CPU + Shared XP).
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
  const base = 'http://127.0.0.1:' + server.address().port + '/pool/index.html';
  const fontThere = fs.existsSync(path.join(root, 'shared/vendor/PressStart2P-Regular.woff2'));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const pg = await ctx.newPage();
  const errs = [], pageErrs = [];
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', e => pageErrs.push(e.message));
  await pg.goto(base);
  await pg.waitForTimeout(800);

  // ---- menu ----
  ok('menu shows VS CPU, 2 PLAYERS, PRACTICE and skill chips', (await pg.$('[data-mode="cpu"]')) && (await pg.$('[data-mode="2p"]')) && (await pg.$('[data-mode="practice"]')) && (await pg.$$('[data-diff]')).length === 2 && (await pg.$('.help')));
  ok('menu has sound, camera and back-to-game controls', (await pg.$('#bMus')) && (await pg.$('#bSfx')) && (await pg.$('#bView')) && (await pg.$('#bResume')));
  ok('game wires its results into the shared hub profile', await pg.evaluate(() => document.documentElement.innerHTML.includes("Shared.recordGame('pool'") && document.documentElement.innerHTML.includes("Shared.addXP('pool'")));

  // ---- rack geometry: 16 balls, no overlaps, 8 in the middle of its row of three ----
  await pg.evaluate(() => window.__pool.newGame('2p', 1));
  await pg.waitForTimeout(300);
  const rack = await pg.evaluate(() => {
    const P = window.__pool, D = 4; // ball diameter in world units
    const ids = P.balls.map(b => b.n).sort((a, b) => a - b);
    let gap = 1e9;
    for (let i = 0; i < P.balls.length; i++) for (let j = i + 1; j < P.balls.length; j++)
      gap = Math.min(gap, Math.hypot(P.balls[i].x - P.balls[j].x, P.balls[i].z - P.balls[j].z));
    const rows = {};
    P.balls.forEach(b => { if (b.n) { const k = Math.round(b.x); (rows[k] = rows[k] || []).push(b); } });
    const mid = Object.values(rows).find(r => r.length === 3);
    const eight = P.balls.find(b => b.n === 8), cue = P.balls.find(b => b.n === 0);
    return { ids, gap, eightMid: mid && mid.slice().sort((a, b) => a.z - b.z)[1].n === 8, cue: { x: cue.x, z: cue.z }, state: P.state, hud: !document.getElementById('hud').hidden };
  });
  ok('16 balls: cue plus 1 to 15', rack.ids.join() === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15', rack.ids);
  ok('rack: no overlaps', rack.gap >= 4 * 0.96, rack.gap);
  ok('rack: 8 ball in the middle of its row of three', rack.eightMid === true, rack.eightMid);
  ok('cue ball starts behind the line with the HUD up', Math.abs(rack.cue.x + 25) < 1 && Math.abs(rack.cue.z) < 1 && rack.hud, rack);

  // ---- stepping the sim by hand stays finite and inside the table ----
  const sim = await pg.evaluate(() => {
    const P = window.__pool;
    for (let i = 0; i < 600; i++) P.update(1 / 60);
    return {
      finite: P.balls.every(b => [b.x, b.z, b.vx, b.vz].every(Number.isFinite)),
      inBounds: P.balls.every(b => !b.alive || (Math.abs(b.x) <= 54 && Math.abs(b.z) <= 29))
    };
  });
  ok('600 sim steps stay finite and inside the table', sim.finite && sim.inBounds, sim);

  // ---- power + view controls ----
  const ctl = await pg.evaluate(() => {
    const P = window.__pool;
    P.setPower(0.8);
    return { power: P.power };
  });
  ok('power slider sets the shot power', Math.abs(ctl.power - 0.8) < 1e-9, ctl);

  // ---- XP and stats through the shared module ----
  await pg.evaluate(() => { localStorage.removeItem('pixelchess.v1'); });
  const x1 = await pg.evaluate(() => { Shared.recordGame('pool', true); const done = Shared.addXP('pool', Shared.XP.win); const p = Shared.profile(); return { xp: p.xp, g: p.games.pool, win: Shared.XP.win, done: !!done }; });
  ok('a recorded pool win tracks the streak and awards the hub XP', x1.done && x1.xp === x1.win && x1.g.w === 1 && x1.g.streak === 1 && x1.g.best === 1, x1);
  const x2 = await pg.evaluate(() => { Shared.recordGame('pool', false); Shared.addXP('pool', Shared.XP.loss); const p = Shared.profile(); return { xp: p.xp, g: p.games.pool, win: Shared.XP.win, loss: Shared.XP.loss }; });
  ok('a loss resets the streak but keeps the best and adds the smaller XP', x2.xp === x2.win + x2.loss && x2.g.l === 1 && x2.g.streak === 0 && x2.g.best === 1, x2);

  // ---- real input: place with the shoot button, aim with a drag, shoot with Space ----
  await pg.evaluate(() => { window.__pool.newGame('2p', 1); });
  await pg.waitForTimeout(200);
  ok('placement state labels the shoot button PLACE', (await pg.textContent('#shoot')) === 'PLACE');
  await pg.click('#shoot');
  ok('shoot button confirms the placement', await pg.evaluate(() => window.__pool.state === 'aim'));
  const a0 = await pg.evaluate(() => window.__pool.aim);
  const box = await pg.evaluate(() => { const r = document.getElementById('gl').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await pg.mouse.move(box.x - 60, box.y + 40); await pg.mouse.down(); await pg.mouse.move(box.x + 60, box.y - 40, { steps: 5 }); await pg.mouse.up();
  await pg.waitForTimeout(200);
  const a1 = await pg.evaluate(() => window.__pool.aim);
  ok('dragging on the table turns the aim', Math.abs(a1 - a0) > 1e-4, { a0, a1 });
  await pg.keyboard.down('Space'); await pg.waitForTimeout(400); await pg.keyboard.up('Space');
  await pg.waitForTimeout(800);
  const shot1 = await pg.evaluate(() => ({ moving: window.__pool.balls.some(b => b.alive && Math.hypot(b.vx, b.vz) > 0.05), state: window.__pool.state }));
  ok('Space shoots the cue ball', shot1.moving || shot1.state === 'shooting' || shot1.state === 'rolling', shot1);

  // ---- layout at three sizes ----
  for (const [w, h] of [[360, 640], [740, 360], [1280, 800]]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 }), p2 = await c2.newPage();
    await p2.goto(base); await p2.evaluate(() => window.__pool.newGame('2p', 1)); await p2.waitForTimeout(400);
    const m = await p2.evaluate(() => {
      const c = document.querySelector('#gl').getBoundingClientRect(), s = document.querySelector('#shoot').getBoundingClientRect();
      const inView = q => q.left >= -1 && q.top >= -1 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1;
      return { cw: Math.round(c.width), ch: Math.round(c.height), shoot: inView(s), shootH: s.height, scroll: document.documentElement.scrollWidth - innerWidth + document.documentElement.scrollHeight - innerHeight };
    });
    ok(`${w}x${h}: canvas fills the screen, shoot button visible`, m.cw >= w - 1 && m.ch >= h - 1 && m.shoot && m.shootH >= 44, m);
    ok(`${w}x${h}: no scrolling`, m.scroll <= 0, m.scroll);
    await p2.screenshot({ path: path.join(root, `pool-${w}x${h}.png`) });
    await c2.close();
  }

  const real = errs.filter(e => !(!fontThere && /PressStart2P|woff2|404/.test(e)));
  ok('no console errors or page errors' + (fontThere ? '' : ' (ignoring the not-yet-vendored font 404)'), real.length === 0 && pageErrs.length === 0, { real, pageErrs });
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
