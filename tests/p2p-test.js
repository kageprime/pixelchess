// P2P loopback test: real WebRTC handshake over local HTTP with an in-memory
// signal stub (same REST shape as api/signal.js), moves both ways, sync check.
// Run: node tests/p2p-test.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
(async () => {
  let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  const root = path.join(__dirname, '..');
  const sig = {};
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  const srv = http.createServer((q, s) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/api/signal') {
      let body = '';
      q.on('data', c => { body += c; });
      q.on('end', () => {
        s.writeHead(200, { 'Content-Type': 'application/json' });
        if (q.method === 'GET') {
          const room = u.searchParams.get('room'), since = +(u.searchParams.get('since') || 0);
          const all = sig[room] || [];
          s.end(JSON.stringify({ ok: true, msgs: all.slice(since), next: all.length }));
        } else {
          const { room, msg } = JSON.parse(body);
          (sig[room] = sig[room] || []).push(JSON.stringify(msg));
          s.end(JSON.stringify({ ok: true }));
        }
      });
      return;
    }
    const f = path.join(root, decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html');
    fs.readFile(f, (e, d) => {
      if (e) { s.writeHead(404); s.end(); return; }
      s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
      s.end(d);
    });
  });
  await new Promise(r => srv.listen(8902, r));
  const br = await chromium.launch();
  const H = await br.newPage({ viewport: { width: 390, height: 780 } });
  const G = await br.newPage({ viewport: { width: 390, height: 780 } });
  const errs = [];
  H.on('pageerror', e => errs.push('H: ' + e.message));
  G.on('pageerror', e => errs.push('G: ' + e.message));
  await H.goto('http://localhost:8902/chess/index.html');
  await G.goto('http://localhost:8902/chess/index.html');
  await H.click('#onl');
  await H.click('#neth');
  await H.waitForFunction(() => /CODE/.test(document.querySelector('#netmsg').textContent), null, { timeout: 15000 });
  const code = ((await H.locator('#netmsg').innerText()).match(/CODE ([A-Z0-9]{4})/) || [])[1];
  ok('host shows room code', !!code);
  await G.click('#onl');
  await G.locator('#netcode').fill(code || 'XXXX');
  await G.click('#netj');
  await H.waitForFunction(() => p2p && p2p.connected, null, { timeout: 30000 }).catch(() => {});
  await G.waitForFunction(() => p2p && p2p.connected, null, { timeout: 30000 }).catch(() => {});
  const st = await Promise.all([H, G].map(p => p.evaluate(() => ({ c: !!(p2p && p2p.connected), g: gmode, side: p2p && p2p.side }))));
  ok('both linked', st[0].c && st[1].c, JSON.stringify(st));
  ok('sides split white/black', st[0].side === 'w' && st[1].side === 'b' && st[0].g === 'online' && st[1].g === 'online');
  await H.evaluate(() => { fx = false; play(6, 4, 4, 4, 'Q'); });
  await G.waitForFunction(() => document.querySelector('#rb').textContent.includes('e4'), null, { timeout: 8000 }).catch(() => {});
  ok('guest receives e4', await G.evaluate(() => b[4][4] === 'wP'));
  await G.evaluate(() => { fx = false; play(1, 4, 3, 4, 'Q'); });
  await H.waitForFunction(() => (document.querySelectorAll('#rb span:not(.em)') || []).length >= 2, null, { timeout: 8000 }).catch(() => {});
  const eq = await Promise.all([H, G].map(p => p.evaluate(() => JSON.stringify(b.map(r => r.map(p => p))))));
  ok('boards in sync after e4 e5', eq[0] === eq[1]);
  const before = eq[1];
  await G.evaluate(() => netOn({ t: 'mv', m: [6, 4, 4, 4] }));
  await G.waitForTimeout(300);
  ok('illegal remote move ignored', (await G.evaluate(() => JSON.stringify(b.map(r => r.map(p => p))))) === before);
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails || errs.length ? fails + ' FAILED' : 'all passed');
  await br.close();
  srv.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
