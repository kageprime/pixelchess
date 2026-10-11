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
