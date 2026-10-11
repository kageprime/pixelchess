// World leaderboard API tests. Run: node tests/api-test.js
const api = require('../api/scores.js');
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
const good = { name: 'YOU', board: 'fast:moss', value: 90000, plies: 41, ms: 90000, undos: 0, opp: 'moss', san: 'e4 e5' };

eq('valid score passes', api.validateScore(good), null);
eq('bad board', api.validateScore({ ...good, board: 'fast:zzz' }), 'bad board');
eq('bad name', api.validateScore({ ...good, name: 'a!@#' }), 'bad name');
eq('empty name', api.validateScore({ ...good, name: '' }), 'bad name');
eq('time too fast', api.validateScore({ ...good, value: 1000, ms: 1000 }), 'bad time');
eq('time too slow', api.validateScore({ ...good, value: 99999999, ms: 99999999 }), 'bad time');
eq('fast needs 10+ moves', api.validateScore({ ...good, plies: 9 }), 'bad plies');
eq('mate moves range', api.validateScore({ name: 'A', board: 'mate:vex', value: 0, plies: 41, ms: 1, undos: 0, san: '' }), 'bad moves');
eq('mate ok', api.validateScore({ name: 'A', board: 'mate:vex', value: 21, plies: 41, ms: 1, undos: 0, san: '' }), null);
eq('streak range', api.validateScore({ name: 'A', board: 'streak', value: 0, plies: 1, ms: 1, undos: 0, san: '' }), 'bad streak');
eq('streak ok', api.validateScore({ name: 'A', board: 'streak', value: 7, plies: 1, ms: 1, undos: 0, san: '' }), null);
eq('undos capped', api.validateScore({ ...good, undos: 4 }), 'bad undos');
eq('san too long', api.validateScore({ ...good, san: 'x'.repeat(4001) }), 'bad san');
const lad = { name: 'Kage', board: 'ladder:global', value: 1250, pid: 'a1b2c3d4', wins: 12 };
eq('ladder valid', api.validateScore(lad), null);
eq('ladder bad pid', api.validateScore({ ...lad, pid: 'xyz' }), 'bad pid');
eq('ladder bad xp', api.validateScore({ ...lad, value: -5 }), 'bad xp');
eq('ladder bad board', api.validateScore({ ...lad, board: 'ladder:Mars' }), 'bad board');
eq('region NG', api.regionFor('ng'), 'Africa');
eq('region US', api.regionFor('US'), 'Americas');
eq('region JP', api.regionFor('jp'), 'Asia');
eq('region DE', api.regionFor('de'), 'Europe');
eq('region AU', api.regionFor('au'), 'Oceania');
eq('region unknown', api.regionFor('XX'), 'Global');

// handler with stubbed Upstash + env
process.env.KV_REST_API_URL = 'https://x';
process.env.KV_REST_API_TOKEN = 'y';
const calls = [];
global.fetch = async (url) => {
  calls.push(url);
  const u = String(url);
  if (u.includes('/incr/')) return { ok: true, json: async () => ({ result: 1 }) };
  if (u.includes('/expire/')) return { ok: true, json: async () => ({ result: 1 }) };
  if (u.includes('/zadd/')) return { ok: true, json: async () => ({ result: 1 }) };
  if (u.includes('/zremrangebyrank/')) return { ok: true, json: async () => ({ result: 1 }) };
  if (u.includes('/zrevrank/')) return { ok: true, json: async () => ({ result: 2 }) };
  if (u.includes('/zrevrange/')) return { ok: true, json: async () => ({ result: [JSON.stringify({ n: 'A', v: 5, d: 1 }), '5'] }) };
  return { ok: false, status: 500, json: async () => ({}) };
};
const res = () => { const r = {}; r.status = (c) => (r.code = c, r); r.json = (o) => (r.body = o, r); return r; };
(async () => {
  let r = res();
  await api({ method: 'GET', query: { board: 'mate:dune' }, headers: {} }, r);
  eq('GET top', [r.code, r.body], [200, { ok: true, board: 'mate:dune', top: [{ n: 'A', v: 5, d: 1 }] }]);
  r = res();
  await api({ method: 'GET', query: { board: 'nope' }, headers: {} }, r);
  eq('GET bad board', r.code, 400);
  r = res();
  await api({ method: 'POST', body: good, headers: {} }, r);
  eq('POST rank', [r.code, r.body], [200, { ok: true, rank: 3 }]);
  r = res();
  await api({ method: 'POST', body: { ...good, value: -5, ms: -5 }, headers: {} }, r);
  eq('POST invalid', r.code, 400);
  // ladder POST files global + regional + player hash
  const seen = [];
  global.fetch = async (url, init) => {
    seen.push(String(url));
    const u = String(url);
    if (u.includes('/incr/')) return { ok: true, json: async () => ({ result: 1 }) };
    if (u.includes('/expire/')) return { ok: true, json: async () => ({ result: 1 }) };
    if (u.includes('/hset/')) return { ok: true, json: async () => ({ result: 1 }) };
    if (u.includes('/zadd/') || u.includes('/zremrangebyrank/')) return { ok: true, json: async () => ({ result: 1 }) };
    if (u.includes('/zrevrank/')) return { ok: true, json: async () => ({ result: 6 }) };
    return { ok: true, json: async () => ({ result: 1 }) };
  };
  r = res();
  await api({ method: 'POST', body: lad, headers: { 'x-vercel-ip-country': 'NG' } }, r);
  eq('POST ladder rank+region', [r.code, r.body], [200, { ok: true, rank: 7, region: 'Africa' }]);
  eq('POST ladder touched regional + hash', seen.some(u => u.includes('ladder%3AAfrica')) && seen.some(u => u.includes('/hset/pc:player:a1b2c3d4')), true);
  // ladder GET with who + pipeline names
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/pipeline')) return { ok: true, json: async () => (JSON.parse(init.body).map((c, i) => ({ result: ['name', 'P' + i, 'xp', String(900 - i * 10), 'updated', '1'] }))) };
    if (u.includes('/zrevrank/')) return { ok: true, json: async () => ({ result: 9 }) };
    if (u.includes('/zrevrange/')) return { ok: true, json: async () => ({ result: ['p0', 'p1', 'p2'] }) };
    return { ok: true, json: async () => ({ result: 1 }) };
  };
  r = res();
  await api({ method: 'GET', query: { board: 'ladder:global', who: 'a1b2c3d4' }, headers: { 'x-vercel-ip-country': 'NG' } }, r);
  eq('GET ladder view', [r.code, r.body.ok, r.body.region, r.body.you.rank, r.body.top.length, r.body.top[0].n], [200, true, 'Africa', 10, 3, 'P0']);
  // rate limited
  global.fetch = async (url) => {
    if (String(url).includes('/incr/')) return { ok: true, json: async () => ({ result: 99 }) };
    return { ok: true, json: async () => ({ result: 1 }) };
  };
  r = res();
  await api({ method: 'POST', body: good, headers: {} }, r);
  eq('POST rate limited', r.code, 429);
  console.log(fail ? `\n${fail} FAILED` : '\nall passed');
  process.exit(fail ? 1 : 0);
})();
