const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  for (const [name, vp] of [['portrait', { width: 390, height: 780 }], ['small', { width: 360, height: 640 }], ['landscape', { width: 740, height: 360 }]]) {
    const pg = await br.newPage({ viewport: vp, hasTouch: false });
    pg.on('pageerror', e => errs.push(name + ': ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
    await pg.goto('file://'+__dirname+'/../index.html');
    await pg.click('[data-m="1"]');
    ok(name + ' opponent screen shows 3 cards', (await pg.locator('.oc').count()) === 3);
    const ocb = await pg.locator('.oc').last().boundingBox();
    ok(name + ' last opponent card on screen', ocb && ocb.y + ocb.height <= vp.height && ocb.x + ocb.width <= vp.width, JSON.stringify(ocb));
    await pg.screenshot({ path: `opp-${name}.png` });
    await pg.locator('.oc').first().click();
    await pg.waitForFunction(() => document.querySelector('#bt').textContent.length > 8, null, { timeout: 4000 }).catch(() => { });
    ok(name + ' opponent name in panel', (await pg.locator('#nb').innerText()) === 'MOSSBACK');
    ok(name + ' greeting bubble shown', (await pg.locator('#bt').innerText()).length > 8);
    const bb = await pg.locator('#bub').boundingBox();
    ok(name + ' bubble on screen', bb && bb.y >= 0 && bb.y + bb.height <= vp.height && bb.x + bb.width <= vp.width, JSON.stringify(bb));
    const box = async () => { const r = await pg.locator('#cv').boundingBox(); return r; };
    const sq = async (f, rk) => { const r = await box(); const c = 'abcdefgh'.indexOf(f), rw = 8 - rk; return [r.x + (c + .5) * r.width / 8, r.y + (rw + .5) * r.height / 8]; };
    const click = async (s) => { const [x, y] = await sq(s[0], +s[1]); await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.up(); };
    ok(name + ' scene is active for opponent', (await pg.evaluate(() => scn)) === 'moss');
    await pg.evaluate(() => { const h0 = hist; hist = Array(60).fill({}); sceneUpdate(); hist = h0; });
    ok(name + ' sky advances toward night', (await pg.evaluate(() => scP)) > .7);
    await pg.evaluate(() => sceneUpdate());
    ok(name + ' music sequencer started', await pg.evaluate(() => !!mus && mus.id === 'moss'));
    const r = await box();
    const app = await pg.locator('#app').boundingBox();
    ok(name + ' board fits viewport', r.y >= 0 && r.y + r.height <= vp.height && r.x >= 0 && r.x + r.width <= vp.width, JSON.stringify(r));
    const rib = await pg.locator('#rb').boundingBox();
    ok(name + ' ribbon on screen', rib && rib.y >= 0 && rib.y + rib.height <= vp.height && rib.x >= 0 && rib.x + rib.width <= vp.width, JSON.stringify(rib));
    ok(name + ' undo disabled at start', await pg.locator('#un').isDisabled());
    await click('e2'); await click('e4');
    await pg.waitForFunction(() => document.querySelector('#rb').textContent.includes('e4'), null, { timeout: 5000 }).catch(() => { });
    // wait for CPU reply: ribbon should show 2 plies
    await pg.waitForFunction(() => document.querySelectorAll('#rb span:not(.em)').length >= 2, null, { timeout: 8000 }).catch(() => { });
    const txt = await pg.locator('#rb').innerText();
    ok(name + ' ribbon has e4 and a CPU reply', /1\.e4[a-hNBRQKO]\S*/.test(txt.replace(/\n/g, ' ')), txt);
    ok(name + ' undo enabled after reply', !(await pg.locator('#un').isDisabled()));
    // hint
    await pg.click('#hn');
    await pg.waitForFunction(() => document.querySelector('#hn').textContent === 'HINT', null, { timeout: 3000 }).catch(() => { });
    const hintSet = await pg.evaluate(() => !!hint);
    ok(name + ' hint highlights a move', hintSet);
    // play a capture-free second move then undo twice-ply
    await pg.screenshot({ path: `${name}.png` });
    await pg.click('#un');
    const after = await pg.evaluate(() => ({ h: hist.length, t: turn, ok: b[6][4] === 'wP' && b[4][4] === null }));
    ok(name + ' undo restores start position', after.h === 0 && after.t === 'w' && after.ok, JSON.stringify(after));
    ok(name + ' ribbon reset', /NO MOVES/.test(await pg.locator('#rb').innerText()));
    ok(name + ' undo disabled again', await pg.locator('#un').isDisabled());
    await pg.close();
  }
  // 2 player: capture tray + undo of single ply
  const pg = await br.newPage({ viewport: { width: 390, height: 780 } });
  pg.on('pageerror', e => errs.push('2p: ' + e.message));
  await pg.goto('file://'+__dirname+'/../index.html');
  await pg.click('[data-m="2"]');
  await pg.evaluate(() => { fx = false; snd = false; });
  const mv = async (a, b2) => { await pg.evaluate(([a, b2]) => { const q = s => [8 - +s[1], 'abcdefgh'.indexOf(s[0])]; const [r, c] = q(a), [y, x] = q(b2); play(r, c, y, x, 'Q'); }, [a, b2]); };
  for (const [a, b2] of [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'], ['d8', 'd5']]) await mv(a, b2);
  const st = await pg.evaluate(() => ({ san: hist.map(h => h.san).join(' '), capW: hist.filter(h => h.cap && h.t == 'w').length, capB: hist.filter(h => h.cap && h.t == 'b').length, trayW: [...trc.w.getImageData(0, 0, 93, 9).data].some((v, i) => i % 4 == 3 && v > 0), mw: document.querySelector('#mw').textContent, mb: document.querySelector('#mb').textContent }));
  ok('2p SAN list', st.san === 'e4 d5 exd5 Qxd5', st.san);
  ok('2p trays drawn', st.capW === 1 && st.capB === 1 && st.trayW, JSON.stringify(st));
  await pg.click('#un');
  const u = await pg.evaluate(() => hist.length);
  ok('2p undo removes one ply', u === 3, String(u));
  await pg.screenshot({ path: 'twop.png' });
  await pg.click('#pz'); await pg.click('#qt');
  ok('scene cleared on return to menu', (await pg.evaluate(() => scn)) === null);
  ok('music stopped on return to menu', (await pg.evaluate(() => mus)) === null);
  await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})();
