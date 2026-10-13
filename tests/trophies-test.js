/**
 * Tests for Pixel Arcade - Declarative Trophy Engine & Trophy Room
 */
const assert = require('assert');
const path = require('path');
const http = require('http');
const fs = require('fs');

// 1. Headless unit testing of the Trophy Engine
const TROPHIES = require('../shared/trophies-data.js');
const ArcadeTrophies = require('../shared/trophies.js');

console.log('# Trophy definitions verification');
assert(Array.isArray(TROPHIES), 'TROPHIES must be an array');
assert(TROPHIES.length >= 25, `Expected at least 25 trophies, got ${TROPHIES.length}`);

TROPHIES.forEach(t => {
  assert(t.id, 'Trophy must have an id');
  assert(t.game, `Trophy ${t.id} must have a game`);
  assert(t.tier, `Trophy ${t.id} must have a tier`);
  assert(['bronze', 'silver', 'gold', 'platinum'].includes(t.tier), `Invalid tier in ${t.id}`);
  assert(typeof t.xp === 'number' && t.xp > 0, `Invalid XP in ${t.id}`);
  assert(t.on, `Trophy ${t.id} must specify an event 'on'`);
});
console.log(`ok   ${TROPHIES.length} trophies well-formed across chess, pool, connect4, ayo, scrabble, arcade`);

// Test reset
ArcadeTrophies.reset();
let summary = ArcadeTrophies.getSummary();
assert.strictEqual(summary.totalUnlocked, 0, 'Initial unlocked count must be 0');

// Test emit first chess win
console.log('# Event emission and unlocking');
const unlocked1 = ArcadeTrophies.emit('gameover', { winner: 'me', game: 'chess' });
assert(unlocked1.some(t => t.id === 'chess.first_win'), 'Should unlock chess.first_win');
assert.strictEqual(ArcadeTrophies.isUnlocked('chess.first_win'), true, 'chess.first_win must be marked unlocked');

// Test duplicate unlock does not re-award
const unlockedDup = ArcadeTrophies.emit('gameover', { winner: 'me', game: 'chess' });
assert(!unlockedDup.some(t => t.id === 'chess.first_win'), 'Should not re-unlock chess.first_win');

// Test checkmate with pawn
const unlockedPawn = ArcadeTrophies.emit('checkmate', { winner: 'me', byPiece: 'p', game: 'chess' });
assert(unlockedPawn.some(t => t.id === 'chess.small_fry'), 'Should unlock chess.small_fry');

// Test pool legal 8-ball pot
const unlockedPool = ArcadeTrophies.emit('pot', { by: 'me', ball: 8, legal: true, game: 'pool' });
assert(unlockedPool.some(t => t.id === 'pool.eight_hero'), 'Should unlock pool.eight_hero');

// Test connect4 diagonal win
const unlockedC4 = ArcadeTrophies.emit('gameover', { winner: 'me', direction: 'diagonal', turns: 6, game: 'connect4' });
assert(unlockedC4.some(t => t.id === 'connect4.diagonal'), 'Should unlock connect4.diagonal');
assert(unlockedC4.some(t => t.id === 'connect4.speed'), 'Should unlock connect4.speed');

// Test ayo harvest capture
const unlockedAyo = ArcadeTrophies.emit('capture', { by: 'me', count: 4, game: 'ayo' });
assert(unlockedAyo.some(t => t.id === 'ayo.big_pit'), 'Should unlock ayo.big_pit');

// Test scrabble bingo
const unlockedScrabble = ArcadeTrophies.emit('play', { by: 'me', bingo: true, game: 'scrabble', mode: '2p' });
assert(unlockedScrabble.some(t => t.id === 'scrabble.bingo'), 'Should unlock scrabble.bingo');

// Verify meta-trophy arcade.first_steps
summary = ArcadeTrophies.getSummary();
assert(summary.totalUnlocked >= 6, `Expected at least 6 trophies unlocked, got ${summary.totalUnlocked}`);
assert(summary.unlocked['arcade.first_steps'], 'arcade.first_steps must be unlocked');
console.log(`ok   all game trophy predicates pass (unlocked ${summary.totalUnlocked}/${summary.totalAvailable})`);

// 2. Browser integration test with Playwright
(async () => {
  const { chromium } = require('playwright');

  // Simple static file server
  const rootDir = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(rootDir, reqPath);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json'
    }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('# Browser Trophy Room verification');
  await page.goto(`http://localhost:${port}/trophies.html`);

  // Verify elements
  const title = await page.textContent('h1');
  assert(title.includes('TROPHIES'), 'Page header must contain TROPHIES');

  const cards = await page.$$('.trophy-card');
  assert(cards.length >= 25, `Expected at least 25 trophy cards, got ${cards.length}`);

  const chessTab = await page.$('button[data-game="chess"]');
  assert(chessTab, 'Chess filter tab must exist');
  await chessTab.click();

  const chessCards = await page.$$('.trophy-card');
  assert(chessCards.length >= 8, `Expected at least 8 chess trophies, got ${chessCards.length}`);

  console.log('# Store page trophies preview verification');
  await page.goto(`http://localhost:${port}/store.html?game=chess`);
  const storeTrophies = await page.$$('#game-trophies-list > div');
  assert(storeTrophies.length >= 3, `Expected trophies rendered on store page, got ${storeTrophies.length}`);

  await browser.close();
  server.close();

  console.log('all passed');
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
