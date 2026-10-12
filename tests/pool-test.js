// Pool checks: node tests/pool-test.js   (needs: npm i playwright && npx playwright install chromium)
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
  ok('menu shows 1P, 2P, free play, how-to and toggles', (await pg.$('#btn-cpu')) && (await pg.$('#btn-hot')) && (await pg.$('#btn-free')) && (await pg.$('#btn-how')) && (await pg.$('#btn-sound')) && (await pg.$('#btn-theme')) && (await pg.$('#btn-shake')));
  await pg.click('#btn-how'); ok('how-to opens', await pg.evaluate(() => document.querySelector('#s-how').classList.contains('on')));
  await pg.click('#btn-howback'); ok('how-to closes', await pg.evaluate(() => !document.querySelector('#s-how').classList.contains('on')));

  // ---- rack geometry (drive by hand, rAF frozen) ----
  await pg.click('#btn-hot');
  await pg.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; });
  const rack = await pg.evaluate(() => {
    const D = window.__debug.get(), R = 0.028575;
    const ids = D.balls.map(b => b.id).sort((a, b) => a - b);
    let gap = 1e9; for (let i = 0; i < D.balls.length; i++) for (let j = i + 1; j < D.balls.length; j++) gap = Math.min(gap, Math.hypot(D.balls[i].x - D.balls[j].x, D.balls[i].y - D.balls[j].y));
    const rows = {}; D.balls.forEach(b => { if (b.id) { const k = b.y.toFixed(4); (rows[k] = rows[k] || []).push(b); } });
    const mid = Object.values(rows).find(r => r.length === 3);
    const eight = D.balls.find(b => b.id === 8), cue = D.balls.find(b => b.id === 0);
    return { ids, gap, eightMid: mid && mid.slice().sort((a, b) => a.x - b.x)[1].id === 8, cue };
  });
  ok('16 balls: cue plus 1 to 15', rack.ids.join() === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15', rack.ids);
  ok('rack: no overlaps', rack.gap >= 2 * 0.028575 * 0.99, rack.gap);
  ok('rack: 8 ball in the middle of its row of three', rack.eightMid === true, rack.eightMid);
  ok('cue ball starts at the head spot', Math.abs(rack.cue.x) < 1e-9 && Math.abs(rack.cue.y + 0.495) < 1e-9, rack.cue);

  // ---- physics, stepped by hand ----
  const fric = await pg.evaluate(() => {
    const c = balls[0]; c.vx = 1.5; c.vy = 0.4;
    const v0 = Math.hypot(c.vx, c.vy); let slow = 0;
    for (let i = 0; i < 240 * 30; i++) { stepPhysics(1 / 240); const v = Math.hypot(c.vx, c.vy); if (v < 0.02) { slow = i; break; } }
    const finite = balls.every(b => [b.x, b.y, b.vx, b.vy].every(Number.isFinite));
    const inBounds = balls.every(b => b.pocketed || (Math.abs(b.x) <= 0.495 + 0.05 && b.y >= -0.99 - 0.05 && b.y <= 0.99 + 0.05));
    return { v0, slow, finite, inBounds };
  });
  ok('friction slows the cue ball to a stop inside the table', fric.v0 > 1 && fric.slow > 0 && fric.finite && fric.inBounds, fric);
  const cush = await pg.evaluate(() => {
    startGame('hot'); const c = balls[0]; c.x = 0.44; c.y = 0.5; c.vx = 2; c.vy = 0;
    let maxX = c.x;
    for (let i = 0; i < 240 * 3; i++) { stepPhysics(1 / 240); maxX = Math.max(maxX, c.x); }
    return { maxX, x: c.x, settled: Math.abs(c.vx) < 0.02 };
  });
  ok('a ball reaches the side cushion, comes back and settles', cush.maxX >= 0.46 && cush.x < 0.46 && cush.settled, cush);
  const pot = await pg.evaluate(() => {
    startGame('hot'); const p = pockets[0], b = balls[9];
    b.x = p.x; b.y = p.y; b.vx = 0.05; b.vy = 0.05;
    for (let i = 0; i < 240; i++) stepPhysics(1 / 240);
    return { pocketed: b.pocketed };
  });
  ok('a ball at a pocket mouth with a nudge falls in', pot.pocketed === true, pot);
  const chaos = await pg.evaluate(() => {
    startGame('hot');
    for (const b of balls) { b.vx = (Math.random() - .5) * 6; b.vy = (Math.random() - .5) * 6; }
    for (let i = 0; i < 240 * 10; i++) stepPhysics(1 / 240, []);
    return { finite: balls.every(b => [b.x, b.y, b.vx, b.vy, b.wx, b.wy, b.wz].every(Number.isFinite)) };
  });
  ok('chaos stays finite (no NaN anywhere)', chaos.finite);

  // ---- rules, through resolve() ----
  const J = (S) => pg.evaluate((S) => {
    startGame('hot'); Object.assign(players[S.turn], { group: S.group });
    players[1 - S.turn].group = S.ogroup || null;
    turn = S.turn; shot = { pocketed: S.pot.slice(), first: S.first, wasBreak: !!S.brk, railAfter: !!S.rail, t: 0 };
    if (S.clear) for (const b of balls) if (b.id >= 1 && b.id <= 15 && b.id !== 8 && (S.group === 'solids' ? b.id < 8 : b.id > 8)) b.pocketed = true;
    if (S.pot8) { const e = balls[8]; e.pocketed = false; }
    resolve();
    return { phase, turn, foul: bannerText, over: document.querySelector('#s-over').classList.contains('on'), title: document.querySelector('#over-title').textContent };
  }, S);
  let r = await J({ turn: 0, group: 'solids', ogroup: 'stripes', pot: [0], first: 3, rail: true });
  ok('scratch: foul, turn passes, ball in hand', /SCRATCH/.test(r.foul) && r.turn === 1 && r.phase === 'place', r);
  r = await J({ turn: 0, group: 'solids', ogroup: 'stripes', pot: [], first: null, rail: true });
  ok('no ball hit is a foul', /NO HIT/.test(r.foul) && r.turn === 1, r);
  r = await J({ turn: 0, group: 'solids', ogroup: 'stripes', pot: [11], first: 11, rail: true });
  ok('hitting the wrong group first is a foul even if you pot', /WRONG BALL/.test(r.foul) && r.turn === 1, r);
  r = await J({ turn: 0, group: 'solids', ogroup: 'stripes', pot: [3], first: 3, rail: true });
  ok('potting your own group keeps your turn', r.turn === 0 && r.phase === 'aim', r);
  r = await J({ turn: 0, group: null, ogroup: null, pot: [10], first: 10, rail: true });
  ok('open table: first pot assigns the group', await pg.evaluate(() => players[0].group === 'stripes'));
  r = await J({ turn: 0, group: 'solids', ogroup: 'stripes', pot: [], first: 5, rail: false });
  ok('a clean miss with no rail is a foul', /NO RAIL/.test(r.foul), r);
  r = await J({ turn: 0, group: 'solids', ogroup: 'stripes', pot: [8], first: 3, rail: true, clear: false });
  ok('potting the 8 early loses', r.over && /PIXIE|P2/.test(r.title) === false && r.title.length > 0, r);
  r = await J({ turn: 0, group: 'solids', ogroup: 'stripes', pot: [8], first: 8, rail: true, clear: true });
  ok('cleared group: potting the 8 wins', r.over && r.title.length > 0, r);

  // ---- AI plans and strikes ----
  const ai = await pg.evaluate(() => {
    startGame('cpu'); turn = 1;
    for (const b of balls) if (b.id !== 0 && b.id !== 3) b.pocketed = true;
    const c = balls[0], o = balls[3];
    c.x = 0; c.y = 0; c.vx = c.vy = 0;
    o.x = 0.3; o.y = 0; o.vx = o.vy = 0;
    const plan = findBestShot(1, c);
    startAI(); let struck = false;
    for (let i = 0; i < 80 && !struck; i++) {
      updateAI(0.05);
      if (phase === 'strike') { for (let k = 0; k < 20; k++) updateStrike(0.02); }
      if (shot !== null) struck = true;
    }
    return { plan: plan && { score: plan.score, angle: Number.isFinite(plan.angle), power: plan.power >= 0 }, struck };
  });
  ok('AI finds a positive plan for a hanging ball', ai.plan && ai.plan.score > 0 && ai.plan.angle && ai.plan.power !== undefined, ai.plan);
  ok('AI strikes within its think window', ai.struck === true, ai);

  // ---- XP and stats ----
  await pg.evaluate(() => { localStorage.removeItem('pixelchess.v1'); });
  const x1 = await pg.evaluate(() => { startGame('cpu'); turn = 0; endGame('win'); const p = Shared.profile(); return { xp: p.xp, g: p.games.pool, win: Shared.XP.win }; });
  ok('winning against the CPU awards the hub XP and records a win', x1.xp === x1.win && x1.g.w === 1 && x1.g.streak === 1 && x1.g.best === 1, x1);
  const x2 = await pg.evaluate(() => { startGame('cpu'); turn = 1; endGame('early'); const p = Shared.profile(); return { xp: p.xp, g: p.games.pool, loss: Shared.XP.loss, win: Shared.XP.win }; });
  ok('losing awards the smaller XP and resets the streak but keeps the best', x2.xp === x2.win + x2.loss && x2.g.l === 1 && x2.g.streak === 0 && x2.g.best === 1, x2);
  const x3 = await pg.evaluate(() => { const before = Shared.profile().xp; startGame('hot'); turn = 0; endGame('win'); return Shared.profile().xp - before; });
  ok('2-player games award no XP', x3 === 0, x3);
  const over = await pg.evaluate(() => { startGame('cpu'); turn = 0; endGame('win'); return { shown: document.querySelector('#s-over').classList.contains('on'), title: document.querySelector('#over-title').textContent }; });
  ok('game over screen shows the result', over.shown && over.title === 'YOU WIN', over);

  // ---- real input: aim with the pointer, shoot with Space ----
  await pg.evaluate(() => { window.requestAnimationFrame = window.__raf; requestAnimationFrame(loop); });
  await pg.evaluate(() => { startGame('hot'); });
  await pg.waitForTimeout(200);
  const a0 = await pg.evaluate(() => aim);
  await pg.click('#btn-shoot');
  ok('shoot button confirms the placement', await pg.evaluate(() => phase === 'aim'));
  const box = await pg.evaluate(() => { const r = cv.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await pg.mouse.move(box.x - 60, box.y + 40); await pg.mouse.down(); await pg.mouse.move(box.x + 60, box.y - 40, { steps: 5 }); await pg.mouse.up();
  const a1 = await pg.evaluate(() => aim);
  ok('dragging on the table turns the aim', Math.abs(a1 - a0) > 1e-4, { a0, a1 });
  await pg.keyboard.press('Space');
  await pg.waitForTimeout(500);
  const shot1 = await pg.evaluate(() => ({ ballsMoving: balls.some(b => !b.pocketed && (Math.abs(b.vx) + Math.abs(b.vy) > 0.02)) }));
  ok('Space shoots the cue ball', shot1.ballsMoving, shot1);

  // ---- layout at three sizes ----
  for (const [w, h] of [[360, 640], [740, 360], [1280, 800]]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 }), p2 = await c2.newPage();
    await p2.goto(base); await p2.click('#btn-hot'); await p2.waitForTimeout(400);
    const m = await p2.evaluate(() => {
      const c = document.querySelector('#cv').getBoundingClientRect(), s = document.querySelector('#btn-shoot').getBoundingClientRect();
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
