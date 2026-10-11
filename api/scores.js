// Pixel Chess world leaderboards (Vercel serverless, Upstash Redis via REST).
// Env (Vercel dashboard only, never in the repo): KV_REST_API_URL, KV_REST_API_TOKEN.
// Boards: fast:<opp> (ms, lower wins), mate:<opp> (moves, lower wins), streak (n, higher wins).
const OPPS = ['moss', 'vex', 'dune', 'nox'];
const BOARDS = {};
OPPS.forEach(o => { BOARDS['fast:' + o] = { dir: -1, kind: 'fast' }; BOARDS['mate:' + o] = { dir: -1, kind: 'mate' }; });
BOARDS['streak'] = { dir: 1, kind: 'streak' };
const key = b => 'pc:board:' + b;
const clampName = n => (typeof n === 'string' ? n : '').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 12) || 'YOU';

// Pure validation (unit-tested). s: {name,board,value,plies,ms,undos,opp,date}
function validateScore(s) {
  if (!s || typeof s !== 'object') return 'bad body';
  const B = BOARDS[s.board];
  if (!B) return 'bad board';
  if (clampName(s.name) !== s.name || !s.name) return 'bad name';
  const v = s.value;
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

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const board = String((req.query || {}).board || '');
      if (!BOARDS[board]) return res.status(400).json({ ok: false, err: 'bad board' });
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
