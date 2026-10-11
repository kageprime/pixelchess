// Pixel Chess world leaderboards (Vercel serverless, Upstash Redis via REST).
// Env (Vercel dashboard only, never in the repo): KV_REST_API_URL, KV_REST_API_TOKEN.
// Boards: fast:<opp> (ms, lower wins), mate:<opp> (moves, lower wins), streak (n, higher wins).
const OPPS = ['moss', 'vex', 'dune', 'nox'];
const REGIONS = ['Africa', 'Europe', 'Americas', 'Asia', 'Oceania'];
const AFR = 'NG GH ET EG CD TZ KE UG DZ SD MA AO CM CI SN ZM ZW RW MU ML BF NE TD GW BJ TG SL LR'.split(' ');
const EUR = 'GB IE DE FR ES IT PT NL BE CH AT SE NO DK FI PL CZ SK HU RO BG GR HR SI EE LV LT IS LU MT CY AL RS BA MK MD UA BY MC LI SM VA AD'.split(' ');
const AME = 'US CA MX GT BZ HN SV NI CR PA CU JM HT DO PR TT BB BS BM VG KY AW BQ CW SX GL BR AR CL CO PE VE EC BO PY UY GY SR'.split(' ');
const ASI = 'IN CN JP KR ID TH VN PH MY SG BD PK LK NP MM KH LA MN TW HK MO BT MV AF IR IQ SA YE SY JO LB IL PS KW QA BH OM AE UZ KZ KG TJ TM AM AZ GE'.split(' ');
const OCE = 'AU NZ FJ PG WS TO VU SB NC PF GU MP AS CK NU TK'.split(' ');
function regionFor(cc) {
  cc = String(cc || '').toUpperCase();
  if (AFR.includes(cc)) return 'Africa';
  if (EUR.includes(cc)) return 'Europe';
  if (AME.includes(cc)) return 'Americas';
  if (ASI.includes(cc)) return 'Asia';
  if (OCE.includes(cc)) return 'Oceania';
  return 'Global';
}
const BOARDS = {};
OPPS.forEach(o => { BOARDS['fast:' + o] = { dir: -1, kind: 'fast' }; BOARDS['mate:' + o] = { dir: -1, kind: 'mate' }; });
BOARDS['streak'] = { dir: 1, kind: 'streak' };
BOARDS['ladder:global'] = { dir: 1, kind: 'ladder' };
REGIONS.forEach(r => { BOARDS['ladder:' + r] = { dir: 1, kind: 'ladder' }; });
const key = b => 'pc:board:' + b;
const clampName = n => (typeof n === 'string' ? n : '').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 12) || 'YOU';

// Pure validation (unit-tested). s: {name,board,value,plies,ms,undos,opp,date}
function validateScore(s) {
  if (!s || typeof s !== 'object') return 'bad body';
  const B = BOARDS[s.board];
  if (!B) return 'bad board';
  if (clampName(s.name) !== s.name || !s.name) return 'bad name';
  const v = s.value;
  if (B.kind === 'ladder') {
    if (!/^[0-9a-f]{8}$/.test(s.pid || '')) return 'bad pid';
    if (!Number.isInteger(v) || v < 0 || v > 999999) return 'bad xp';
    if (s.wins !== undefined && (!Number.isInteger(s.wins) || s.wins < 0)) return 'bad wins';
    return null;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'bad value';
  const plies = s.plies | 0, ms = s.ms | 0, undos = s.undos | 0;
  if (undos < 0 || undos > 3) return 'bad undos';
  if (B.kind === 'fast') {
    if (v < 5000 || v > 7200000 || v !== ms) return 'bad time';
    if (plies < 19 || plies > 400) return 'bad plies';
  } else if (B.kind === 'mate') {
    if (v < 1 || v > 300 || !Number.isInteger(v)) return 'bad moves';
    if (plies < 1 || plies > 400) return 'bad plies';
  } else {
    if (!Number.isInteger(v) || v < 1 || v > 500) return 'bad streak';
  }
  if (s.opp && !OPPS.includes(s.opp) && s.board !== 'streak') return 'bad opp';
  if (typeof s.san !== 'string' || s.san.length > 4000) return 'bad san';
  return null;
}

async function kv(path, init) {
  const r = await fetch(process.env.KV_REST_API_URL + '/' + path, Object.assign(
    { headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN } }, init));
  if (!r.ok) throw new Error('kv ' + r.status);
  return r.json();
}
const ip = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
const countryOf = req => String(req.headers['x-vercel-ip-country'] || req.headers['x-country'] || 'XX').toUpperCase().slice(0, 2);
function pairs(arr) { const o = {}; for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = arr[i + 1]; return o; }
async function resolvePids(pids) {
  if (!pids.length) return [];
  const r = await fetch(process.env.KV_REST_API_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(pids.map(p => ['HGETALL', 'pc:player:' + p])),
  });
  if (!r.ok) throw new Error('kv pipe');
  const ds = await r.json();
  return pids.map((p, i) => {
    const h = pairs((ds[i] && ds[i].result) || []);
    return { pid: p, n: h.name || '???', v: +(h.xp || 0), d: +(h.updated || 0) };
  });
}
async function ladderTop(board, n) {
  const d = await kv('zrevrange/' + encodeURIComponent(key(board)) + '/0/' + (n - 1));
  return resolvePids(d.result || []);
}

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const q = req.query || {}, board = String(q.board || '');
      const B = BOARDS[board];
      if (!B) return res.status(400).json({ ok: false, err: 'bad board' });
      if (B.kind === 'ladder') {
        const who = String(q.who || '');
        const top = await ladderTop(board, 10);
        const region = regionFor(countryOf(req));
        const rtop = region === 'Global' ? top : await ladderTop('ladder:' + region, 10);
        const you = { rank: -1, xp: 0, near: [] };
        if (/^[0-9a-f]{8}$/.test(who)) {
          const rk = await kv('zrevrank/' + encodeURIComponent(key(board)) + '/' + who);
          if (rk.result !== null && rk.result !== undefined) {
            const rank = (rk.result | 0) + 1;
            const lo = Math.max(0, rank - 2), hi = rank;
            const nd = await kv('zrevrange/' + encodeURIComponent(key(board)) + '/' + lo + '/' + hi);
            const nb = await resolvePids(nd.result || []);
            const me = await resolvePids([who]);
            you.rank = rank; you.xp = me[0] ? me[0].v : 0; you.near = nb;
          }
        }
        return res.status(200).json({ ok: true, board, top, you, region, rtop });
      }
      const d = await kv('zrevrange/' + encodeURIComponent(key(board)) + '/0/4/WITHSCORES');
      const arr = d.result || [], top = [];
      for (let i = 0; i < arr.length; i += 2) {
        try { const m = JSON.parse(arr[i]); top.push({ n: m.n, v: m.v, d: m.d }); }
        catch (e) { /* skip corrupt members */ }
      }
      return res.status(200).json({ ok: true, board, top });
    }
    if (req.method === 'POST') {
      const s = req.body || {};
      const err = validateScore(s);
      if (err) return res.status(400).json({ ok: false, err });
      const rl = await kv('incr/pc:rl:' + encodeURIComponent(ip(req)));
      await kv('expire/pc:rl:' + encodeURIComponent(ip(req)) + '/60');
      if ((rl.result | 0) > 10) return res.status(429).json({ ok: false, err: 'slow down' });
      if (BOARDS[s.board].kind === 'ladder') {
        const region = regionFor(countryOf(req)), now = Date.now();
        await kv('zadd/' + encodeURIComponent(key(s.board)) + '/' + s.value + '/' + s.pid, { method: 'POST' });
        await kv('zremrangebyrank/' + encodeURIComponent(key(s.board)) + '/0/-101', { method: 'POST' });
        if (region !== 'Global') {
          await kv('zadd/' + encodeURIComponent(key('ladder:' + region)) + '/' + s.value + '/' + s.pid, { method: 'POST' });
          await kv('zremrangebyrank/' + encodeURIComponent(key('ladder:' + region)) + '/0/-101', { method: 'POST' });
        }
        await kv('hset/pc:player:' + s.pid + '/name/' + encodeURIComponent(s.name) + '/xp/' + s.value + '/wins/' + (s.wins | 0) + '/country/' + countryOf(req) + '/updated/' + now, { method: 'POST' });
        const rk = await kv('zrevrank/' + encodeURIComponent(key(s.board)) + '/' + s.pid);
        return res.status(200).json({ ok: true, rank: (rk.result | 0) + 1, region });
      }
      const member = JSON.stringify({ n: s.name, v: s.value, d: Date.now() });
      const score = BOARDS[s.board].dir * s.value;
      await kv('zadd/' + encodeURIComponent(key(s.board)) + '/' + score + '/' + encodeURIComponent(member), { method: 'POST' });
      await kv('zremrangebyrank/' + encodeURIComponent(key(s.board)) + '/0/-6', { method: 'POST' });
      const rk = await kv('zrevrank/' + encodeURIComponent(key(s.board)) + '/' + encodeURIComponent(member));
      return res.status(200).json({ ok: true, rank: (rk.result | 0) + 1 });
    }
    return res.status(405).json({ ok: false, err: 'method' });
  } catch (e) {
    return res.status(500).json({ ok: false, err: 'store unavailable' });
  }
}
module.exports = handler;
module.exports.validateScore = validateScore;
module.exports.BOARDS = BOARDS;
module.exports.regionFor = regionFor;
