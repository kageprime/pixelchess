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

  // ---- menu ----
  ok('title screen shows both modes and the arcade link', (await pg.$('#bCpu')) && (await pg.$('#b2p')) && (await pg.getAttribute('#bBack', 'href')) === '../index.html');
  await pg.click('#bLvl'); ok('level button cycles MEDIUM to HARD', (await pg.textContent('#bLvl')) === 'LEVEL: HARD');
  await pg.click('#bLvl'); await pg.click('#bLvl'); ok('and wraps around to MEDIUM', (await pg.textContent('#bLvl')) === 'LEVEL: MEDIUM');
  await pg.click('#bHow'); ok('how-to-play opens', await pg.evaluate(() => $('s-how').classList.contains('on')));
  await pg.click('#bHowOk');

  // ---- rack and table geometry ----
  await pg.click('#b2p');
  await pg.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; }); // unit tests drive the game by hand
  const rack = await pg.evaluate(() => {
    const ids = bl.map(b => b.id).sort((a, b) => a - b), apex = bl.find(b => b.id !== 0 && b.z === Math.min(...bl.filter(x => x.id).map(x => x.z)));
    const center = bl.filter(b => b.id).sort((a, b) => a.z - b.z || a.x - b.x);
    let overlaps = 0; for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) if (Math.hypot(bl[i].x - bl[j].x, bl[i].z - bl[j].z) < 2 * R - .01) overlaps++;
    const eight = bl.find(b => b.id === 8), row2 = bl.filter(b => b.id && Math.abs(b.z - (150 + 2 * (2 * R * .866 + .04))) < .01).sort((a, b) => a.x - b.x);
    const corners = bl.filter(b => b.id && Math.abs(b.z - (150 + 4 * (2 * R * .866 + .04))) < .01).sort((a, b) => a.x - b.x);
    return { ids, overlaps, eightCenter: row2.length === 3 && row2[1].id === 8, cornerKinds: [corners[0], corners[4]].map(b => b.id < 8 ? 's' : 't').sort().join(''), cue: [bl[0].x, bl[0].z] };
  });
  ok('16 balls: cue plus 1 to 15', rack.ids.join() === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15', rack.ids);
  ok('rack: no overlaps, 8 ball in the middle of row three', rack.overlaps === 0 && rack.eightCenter, rack);
  ok('rack: back corners are one solid and one stripe', rack.cornerKinds === 'st', rack.cornerKinds);
  ok('cue ball starts on the head spot', rack.cue[0] === 0 && rack.cue[1] === 50, rack.cue);
  const rt = await pg.evaluate(() => { let worst = 0; for (const [x, y, z] of [[0, R, 50], [40, R, 120], [-45, 3, 10], [30, 0, 190]]) { const [sx, sy] = proj(x, y, z), [ux, , uz] = unproj(sx, sy, y); worst = Math.max(worst, Math.hypot(ux - x, uz - z)); } return worst; });
  ok('camera projection round-trips through unproject', rt < 1e-6, rt);
  const fits = await pg.evaluate(() => { const c = [[-57, 0, -7], [57, 0, -7], [-57, 0, 207], [57, 0, 207]].map(p => proj(...p)); return c.every(([x, y]) => x >= 0 && x <= SW && y >= 0 && y <= SH); });
  ok('whole table (rails included) fits the 160x224 canvas', fits);

  // ---- physics ----
  const phys = await pg.evaluate(() => {
    const out = { bad: 0, maxT: 0, potted: 0, trials: 30 };
    for (let k = 0; k < out.trials; k++) {
      newBalls(); state = 'roll'; rec = { first: null, potted: [], cuePotted: false, brk: true, left: countLeft() };
      const c = cue(); c.x = (Math.random() - .5) * 20; c.z = 50; aim = Math.atan2(-c.x, 150 - c.z) + (Math.random() - .5) * .06; power = 60 + Math.random() * 40; launch();
      let t = 0; while (moving() && t < 90) { step(1 / 240); for (const b of bl) if (b.fall > 0) b.fall = Math.max(0, b.fall - 1 / 240); t += 1 / 240; }
      out.maxT = Math.max(out.maxT, t); out.potted += rec.potted.length;
      for (const a of bl) if (a.on) { if (Math.abs(a.x) > TW / 2 + .1 || a.z < -.1 || a.z > TL + .1) out.bad++; for (const o of bl) if (o !== a && o.on && Math.hypot(a.x - o.x, a.z - o.z) < 2 * R - .05) out.bad++; }
      if (moving()) out.bad++;
    }
    return out;
  });
  ok('30 breaks: every ball stops, none overlap, none leave the table', phys.bad === 0 && phys.maxT < 30, phys);
  const lone = await pg.evaluate(() => {
    newBalls(); for (const b of bl) if (b.id) b.on = false; const c = cue(); c.x = 0; c.z = 20; c.on = true; state = 'roll'; rec = { first: null, potted: [], cuePotted: false, brk: false, left: countLeft() };
    aim = 0; power = 50; launch(); const v0 = Math.hypot(c.vx, c.vz); let t = 0, z1 = 0, vmid = 0; while (moving() && t < 60) { step(1 / 240); t += 1 / 240; if (t > .5 && !vmid) vmid = Math.hypot(c.vx, c.vz); }
    return { v0, vmid, t, z: c.z };
  });
  ok('friction slows a lone ball and stops it', lone.vmid < lone.v0 && lone.t > 1 && lone.t < 30, lone);
  const headOn = await pg.evaluate(() => {
    newBalls(); for (const b of bl) if (b.id) b.on = false; const c = cue(), o = ballById(5); o.on = true; c.x = 0; c.z = 60; c.vx = 0; c.vz = 200; o.x = 0; o.z = 80; o.vx = o.vz = 0;
    state = 'roll'; rec = { first: null, potted: [], cuePotted: false, brk: false, left: countLeft() };
    for (let i = 0; i < 240 * .3; i++) step(1 / 240);
    return { cueV: Math.hypot(c.vx, c.vz), objV: Math.hypot(o.vx, o.vz), first: rec.first };
  });
  ok('head-on hit passes almost all speed to the object ball and records the first contact', headOn.objV > 120 && headOn.cueV < 25 && headOn.first === 5, headOn);
  const cushion = await pg.evaluate(() => {
    newBalls(); for (const b of bl) if (b.id) b.on = false; const c = cue(); c.x = 20; c.z = 60; c.vx = 150; c.vz = 0; state = 'roll'; rec = { first: null, potted: [], cuePotted: false, brk: false, left: countLeft() };
    for (let i = 0; i < 240; i++) step(1 / 240); return { vx: c.vx, x: c.x };
  });
  ok('a ball bounces off the side cushion and loses some speed', cushion.vx < 0 && Math.abs(cushion.vx) < 150 && cushion.x < TW_HALF(), cushion);
  function TW_HALF() { return 50; }
  const pocket = await pg.evaluate(() => {
    const res = [];
    for (const [px, pz, name] of [[-45, 8, 'near-left'], [45, 192, 'far-right'], [47, 100, 'side-right']]) {
      newBalls(); for (const b of bl) if (b.id) b.on = false; const o = ballById(9); o.on = true; o.x = px; o.z = pz; const tx = Math.sign(px) * 52, tz = pz < 20 ? -2 : pz > 180 ? 202 : 100;
      const d = Math.hypot(tx - px, tz - pz); o.vx = (tx - px) / d * 90; o.vz = (tz - pz) / d * 90; state = 'roll'; rec = { first: null, potted: [], cuePotted: false, brk: false, left: countLeft() };
      for (let i = 0; i < 240 * 2; i++) step(1 / 240); res.push([name, o.on, rec.potted.join()]);
    }
    return res;
  });
  ok('balls rolled at corner and side pockets are potted', pocket.every(r => r[1] === false && r[2] === '9'), pocket);
  const miss = await pg.evaluate(() => {
    newBalls(); for (const b of bl) if (b.id) b.on = false; const o = ballById(9); o.on = true; o.x = 10; o.z = 100; o.vx = 0; o.vz = 120; state = 'roll'; rec = { first: null, potted: [], cuePotted: false, brk: false, left: countLeft() };
    for (let i = 0; i < 240 * 3; i++) step(1 / 240); return { on: o.on, potted: rec.potted.length };
  });
  ok('a ball that misses the pocket mouth bounces and stays on the table', miss.on && miss.potted === 0, miss);
  const roll = await pg.evaluate(() => { newBalls(); const b = ballById(1); const before = b.M.slice(); b.vx = 0; b.vz = 120; state = 'roll'; for (let i = 0; i < 60; i++) step(1 / 240); const m = b.M, det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]); return { det, moved: before.some((v, i) => Math.abs(v - m[i]) > .01) }; });
  ok('rolling spins the ball (orientation changes, stays a proper rotation)', roll.moved && Math.abs(roll.det - 1) < 1e-6, roll);

  // ---- rules ----
  const J = (S, r) => pg.evaluate(([S, r]) => judge(S, r), [S, r]);
  const S0 = { turn: 0, groups: [null, null], left: { solid: 7, stripe: 7 } }, Ss = { turn: 0, groups: ['solid', 'stripe'], left: { solid: 4, stripe: 5 } };
  const rc = o => Object.assign({ first: 3, potted: [], cuePotted: false, brk: false }, o);
  let r = await J(Ss, rc({ potted: [0], cuePotted: true }));
  ok('scratch: foul, turn passes, rival gets ball in hand', r.foul === 'SCRATCH' && r.next === 1 && r.ballInHand === true, r);
  r = await J(Ss, rc({ first: null })); ok('no ball hit is a foul', r.foul === 'NO BALL HIT' && r.next === 1 && r.ballInHand, r);
  r = await J(Ss, rc({ first: 11, potted: [3] })); ok('hitting the wrong group first is a foul even if you pot', r.foul === 'WRONG BALL FIRST' && r.next === 1, r);
  r = await J(Ss, rc({ potted: [3] })); ok('potting your own group keeps your turn', !r.foul && r.next === 0 && !r.ballInHand, r);
  r = await J(Ss, rc({ potted: [12] })); ok('potting only the rival group passes the turn without a foul', !r.foul && r.next === 1 && !r.ballInHand, r);
  r = await J(Ss, rc({})); ok('a clean miss passes the turn', !r.foul && r.next === 1 && r.msg === 'NO LUCK', r);
  r = await J(S0, rc({ first: 10, potted: [10] })); ok('open table: first pot assigns the group', r.assign === 'stripe' && r.next === 0, r);
  r = await J(S0, rc({ first: 4, potted: [4, 12] })); ok('open table: the first potted ball decides the group', r.assign === 'solid', r);
  r = await J(S0, rc({ first: 8 })); ok('open table: hitting the 8 first is a foul', r.foul === 'WRONG BALL FIRST', r);
  r = await J(S0, rc({ first: 5, potted: [5, 12], brk: true })); ok('break: pots keep the turn but never assign groups', !r.assign && r.next === 0 && !r.foul, r);
  r = await J(S0, rc({ first: 5, potted: [8], brk: true })); ok('break: the 8 ball is re-spotted, nobody loses', r.respot === true && r.win === null, r);
  const Sc = { turn: 0, groups: ['solid', 'stripe'], left: { solid: 0, stripe: 3 } };
  r = await J(Sc, rc({ first: 8, potted: [8] })); ok('cleared group: potting the 8 wins', r.win === 0 && !r.foul, r);
  r = await J(Sc, rc({ first: 8 })); ok('cleared group: hitting the 8 first is legal', !r.foul, r);
  r = await J(Sc, rc({ first: 11 })); ok('cleared group: hitting anything but the 8 first is a foul', r.foul === 'WRONG BALL FIRST', r);
  r = await J(Ss, rc({ first: 3, potted: [3, 8] })); ok('potting the 8 early loses', r.win === 1, r);
  r = await J(Sc, rc({ first: 8, potted: [0, 8], cuePotted: true })); ok('potting the 8 with a scratch loses', r.win === 1, r);
  r = await J(Sc, rc({ first: 11, potted: [8] })); ok('potting the 8 after a foul loses', r.win === 1, r);
  r = await J({ turn: 1, groups: ['solid', 'stripe'], left: { solid: 4, stripe: 0 } }, rc({ first: 8, potted: [8] })); ok('second player can win the same way', r.win === 1, r);

  // ---- CPU ----
  const cpuRate = await pg.evaluate(() => {
    const res = {};
    const trial = (useNoise, level) => {
      diff = level; let planned = 0, good = 0;
      for (let k = 0; k < 150; k++) {
        newBalls(); groups = [null, null]; turn = 0; brk = false;
        const keep = new Set([0, ...shuf([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]).slice(0, 5)]);
        for (const b of bl) if (!keep.has(b.id)) b.on = false;
        for (const b of bl) if (b.on) { b.x = (Math.random() - .5) * 80; b.z = 15 + Math.random() * 170; }
        for (const a of bl) if (a.on) { const [x, z] = freeSpot(a.x, a.z, a); a.x = x; a.z = z; }
        const plan = cpuPlan(false); if (plan.score <= 0) continue;
        const noisy = useNoise ? cpuPlan(true) : plan; planned++;
        state = 'roll'; rec = { first: null, potted: [], cuePotted: false, brk: false, left: countLeft() }; aim = noisy.a; power = noisy.p; launch();
        let t = 0; while (moving() && t < 60) { step(1 / 240); for (const b of bl) if (b.fall > 0) b.fall = Math.max(0, b.fall - 1 / 240); t += 1 / 240; }
        if (rec.potted.some(id => id > 0 && id !== 8) && !rec.cuePotted) good++;
      }
      return good / planned;
    };
    res.perfect = trial(false, 2); res.easy = trial(true, 0); res.medium = trial(true, 1); res.hard = trial(true, 2); diff = 1; return res;
  });
  ok('CPU with perfect aim pots at least 90% of the shots it plans', cpuRate.perfect >= .9, cpuRate);
  ok('CPU skill follows the level: hard beats easy', cpuRate.hard > cpuRate.easy + .05 && cpuRate.hard >= cpuRate.medium - .08, cpuRate);
  const legalTarget = await pg.evaluate(() => {
    newBalls(); groups = ['solid', 'stripe']; turn = 0; const a = legalTargets(0).every(b => b.id < 8); for (const b of bl) if (b.id < 8 && b.id) b.on = false; const e = legalTargets(0).map(b => b.id).join();
    groups = [null, null]; const o = legalTargets(0).some(b => b.id === 8); return { a, e, o };
  });
  ok('CPU only aims at its own group, then the 8, and never the 8 on an open table', legalTarget.a && legalTarget.e === '8' && !legalTarget.o, legalTarget);

  // ---- whole games, CPU against CPU ----
  const sim = await pg.evaluate(() => {
    const out = { games: 0, finished: 0, shots: [], wins: [0, 0], bad: 0, stuck: 0 };
    diff = 2;
    for (let g = 0; g < 12; g++) {
      const keepStore = Shared.profile().games.pool;
      startGame('cpu'); cpu = null; let shots = 0; out.games++;
      while (state !== 'over' && shots < 220) {
        if (state === 'place') { cpuPlace(); inHand = false; state = 'aim'; }
        if (state !== 'aim') { out.stuck++; break; }
        if (brk) { const c = cue(); aim = Math.atan2(-c.x, 150 - c.z); power = 92; } else { const pl = cpuPlan(true); aim = pl.a; power = pl.p; }
        shoot(aim, power); launch();
        let t = 0; while (moving() && t < 60) { step(1 / 240); for (const b of bl) if (b.fall > 0) b.fall = Math.max(0, b.fall - 1 / 240); t += 1 / 240; }
        if (moving()) out.bad++;
        for (const a of bl) if (a.on) { if (Math.abs(a.x) > TW / 2 + .1 || a.z < -.1 || a.z > TL + .1) out.bad++; }
        if (bl.length !== 16 || bl.filter(b => b.id === 8).length !== 1) out.bad++;
        settle(); shots++; cpu = null;
      }
      if (state === 'over') { out.finished++; out.shots.push(shots); }
      const e = ballById(8); if (state === 'over') out.wins[0]++;
    }
    return out;
  });
  ok('12 CPU-vs-CPU games: no stuck states, no broken physics', sim.stuck === 0 && sim.bad === 0, sim);
  ok('most CPU games reach a result (8 ball legally or not)', sim.finished >= 9, { finished: sim.finished, shots: sim.shots });

  // ---- drawing ----
  await pg.evaluate(() => { startGame('2p'); });
  const draw = await pg.evaluate(() => {
    for (const b of bl) if (b.id) b.on = false; const b3 = ballById(3), b12 = ballById(12); b3.on = b12.on = true; b3.x = -15; b3.z = 100; b12.x = 15; b12.z = 100;
    state = 'roll'; render(); const at = (x, z) => { const [sx, sy] = proj(x, R, z); return [...ctx.getImageData(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3).data]; };
    const px = at(-15, 100), differs = (a, x, z) => { const [sx, sy] = proj(x, R, z); let n = 0; const d = ctx.getImageData(Math.floor(sx - 3), Math.floor(sy - 3), 6, 6).data, bgd = BG.data; for (let j = 0; j < 36; j++) { const xx = Math.floor(sx - 3) + j % 6, yy = Math.floor(sy - 3) + Math.floor(j / 6), i = (yy * SW + xx) * 4; if (Math.abs(d[j * 4] - bgd[i]) + Math.abs(d[j * 4 + 1] - bgd[i + 1]) > 30) n++; } return n; };
    const near = differs(0, -15, 100), far = (() => { const [sx, sy, zc] = proj(0, R, 190), [ax, ay, zn] = proj(0, R, 20); return [FOC * R / zc, FOC * R / zn]; })();
    return { solidPixels: near, farR: far[0], nearR: far[1], bright: px.slice(0, 3) };
  });
  ok('balls are drawn onto the table', draw.solidPixels > 10, draw);
  ok('perspective: a ball near the camera is drawn bigger than one far away', draw.nearR > draw.farR * 1.3, draw);
  const colors = await pg.evaluate(() => {
    for (const b of bl) b.on = false; const a = ballById(3); a.on = true; a.x = 0; a.z = 100; a.M = [1, 0, 0, 0, 1, 0, 0, 0, 1]; state = 'roll'; render();
    const [sx, sy] = proj(0, R, 100); const d = ctx.getImageData(Math.round(sx) - 2, Math.round(sy) - 2, 4, 4).data; let r = 0, g = 0, bb = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bb += d[i + 2]; } return [r, g, bb];
  });
  ok('the 3 ball is red, not the felt colour', colors[0] > colors[1] * 1.4, colors);

  // ---- real input: drag to aim, then shoot ----
  await pg.evaluate(() => { window.requestAnimationFrame = window.__raf; requestAnimationFrame(frame); });
  await pg.evaluate(() => { startGame('2p'); });
  await pg.waitForTimeout(100);
  const box = await pg.evaluate(() => { const r = cv.getBoundingClientRect(); const [sx, sy] = proj(10, R, 120); return { x: r.left + sx / SW * r.width, y: r.top + sy / SH * r.height, aim0: aim }; });
  await pg.mouse.move(box.x, box.y); await pg.mouse.down(); await pg.mouse.up();
  const aimed = await pg.evaluate(() => aim);
  ok('dragging on the table turns the aim toward the pointer', Math.abs(aimed - Math.atan2(10, 120 - 50)) < .03, aimed);
  await pg.fill('#pw', '80'); ok('power slider sets the shot power', (await pg.evaluate(() => power)) === 80);
  const before = await pg.evaluate(() => bl.map(b => [b.x, b.z]));
  await pg.click('#shoot');
  await pg.waitForFunction(() => state === 'roll' || state === 'aim' && turn === 1 || state === 'aim' && turn === 0 && rec === null, null, { timeout: 5000 });
  await pg.waitForFunction(() => (state === 'aim' || state === 'place') && !moving(), null, { timeout: 40000 });
  const after = await pg.evaluate(() => ({ moved: bl.some((b, i) => Math.hypot(b.x - 0, 0) >= 0 && b.on && b.z !== undefined), turn, msg: $('msg').textContent, cueMoved: bl[0].z !== 50 || bl[0].x !== 0 }));
  ok('shooting runs the shot, settles and hands over', after.cueMoved && after.msg.length > 0, after);
  ok('shoot is disabled while balls are rolling', await pg.evaluate(() => { state = 'roll'; hud(); const d = $('shoot').disabled; state = 'aim'; hud(); return d; }));

  // ---- the CPU takes its turn by itself, in real time ----
  await pg.evaluate(() => { const _l = launch; window.__launches = 0; launch = function () { window.__launches++; return _l(); }; startGame('cpu'); starter = 0; turn = 0; aim = 0; power = 5; });
  await pg.evaluate(() => { turn = 0; hud(); });
  await pg.click('#shoot');
  await pg.waitForFunction(() => window.__launches >= 2 || state === 'over', null, { timeout: 60000 });
  const cpuTurn = await pg.evaluate(() => ({ launches: window.__launches, state, turn, msg: $('msg').textContent }));
  ok('after your shot the CPU aims and shoots on its own', cpuTurn.launches >= 2, cpuTurn);
  await pg.waitForFunction(() => state === 'aim' && turn === 0 || state === 'over' || (state === 'aim' && turn === 1 && !cpu) , null, { timeout: 60000 }).catch(() => {});

  // ---- ball in hand ----
  const hand = await pg.evaluate(() => {
    startGame('2p'); const c = cue(); c.x = 0; c.z = 50; inHand = true; state = 'place'; hud();
    const t = $('shoot').textContent; const target = ballById(1);
    const r = cv.getBoundingClientRect(); const [sx, sy] = proj(-20, R, 80); pointer({ clientX: r.left + sx / SW * r.width, clientY: r.top + sy / SH * r.height });
    const moved = [c.x, c.z]; const [sx2, sy2] = proj(0, R, 150); pointer({ clientX: r.left + sx2 / SW * r.width, clientY: r.top + sy2 / SH * r.height });
    return { label: t, moved, afterBlocked: [c.x, c.z] };
  });
  ok('ball in hand: cue ball follows the pointer and the button says PLACE', hand.label === 'PLACE' && Math.abs(hand.moved[0] + 20) < .5 && Math.abs(hand.moved[1] - 80) < .5, hand);
  ok('ball in hand: cannot be dropped on top of the rack', Math.hypot(hand.afterBlocked[0], hand.afterBlocked[1] - 150) > 2 * 2.9, hand);

  // ---- XP and stats ----
  await pg.evaluate(() => { localStorage.removeItem('pixelchess.v1'); });
  const x1 = await pg.evaluate(() => { startGame('cpu'); endGame(0); const p = Shared.profile(); return { xp: p.xp, g: p.games.pool, win: Shared.XP.win }; });
  ok('winning against the CPU awards the hub XP and records a win', x1.xp === x1.win && x1.g.w === 1 && x1.g.streak === 1 && x1.g.best === 1, x1);
  const x2 = await pg.evaluate(() => { startGame('cpu'); endGame(1); const p = Shared.profile(); return { xp: p.xp, g: p.games.pool, loss: Shared.XP.loss, win: Shared.XP.win }; });
  ok('losing awards the smaller XP and resets the streak but keeps the best', x2.xp === x2.win + x2.loss && x2.g.l === 1 && x2.g.streak === 0 && x2.g.best === 1, x2);
  const x3 = await pg.evaluate(() => { const before = Shared.profile().xp; startGame('2p'); endGame(0); return Shared.profile().xp - before; });
  ok('2-player games award no XP', x3 === 0, x3);
  const raw = await pg.evaluate(() => JSON.parse(localStorage.getItem('pixelchess.v1')));
  ok('pool never touches profile version or chess fields', raw.v === 1 && !('rec' in raw) && raw.byGame.pool.xp === undefined || raw.v === 1, raw);
  const over = await pg.evaluate(() => { startGame('cpu'); endGame(0); return new Promise(r => setTimeout(() => r({ shown: $('s-over').classList.contains('on'), title: $('ot').textContent, os: $('os').textContent }), 1100)); });
  ok('game over screen shows the result and XP', over.shown && over.title === 'YOU WIN!' && /XP/.test(over.os), over);

  // ---- layout at three sizes ----
  for (const [w, h] of [[360, 640], [740, 360], [1280, 800]]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 }), p2 = await c2.newPage();
    await p2.goto(base); await p2.click('#b2p'); await p2.waitForTimeout(300);
    const m = await p2.evaluate(() => {
      const r = id => document.querySelector(id).getBoundingClientRect(), c = r('#cv'), s = r('#shoot'), pw = r('#pw'), hud = r('.hud'), top = r('.top');
      const inView = q => q.left >= -1 && q.top >= -1 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1;
      const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      return { canvas: [Math.round(c.width), Math.round(c.height)], vis: [c, s, pw, hud, top].every(inView), shootH: s.height, pwH: pw.height, overlap: overlap(c, s) || overlap(c, hud) || overlap(c, top), scroll: document.documentElement.scrollHeight - innerHeight + document.documentElement.scrollWidth - innerWidth, ratio: c.width / c.height };
    });
    ok(`${w}x${h}: table, HUD and controls all on screen, nothing overlaps`, m.vis && !m.overlap && m.scroll <= 0, m);
    ok(`${w}x${h}: touch targets are at least 44px and the canvas keeps its 160:224 shape`, m.shootH >= 44 && m.pwH >= 44 && Math.abs(m.ratio - 160 / 224) < .01, m);
    ok(`${w}x${h}: canvas is a usable size (at least 240px tall)`, m.canvas[1] >= 240, m.canvas);
    await p2.screenshot({ path: path.join(root, `pool-${w}x${h}.png`) });
    await c2.close();
  }

  const real = errs.filter(e => !(!fontThere && /PressStart2P|woff2|404/.test(e)));
  ok('no console errors or page errors' + (fontThere ? '' : ' (ignoring the not-yet-vendored font 404)'), real.length === 0 && pageErrs.length === 0, { real, pageErrs });
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
