// Pixel Chess P2P signaling (Vercel serverless, Upstash Redis via REST).
// Game traffic is peer-to-peer WebRTC; only lobby/SDP/ICE go through here.
// Env (Vercel dashboard only, never in the repo): KV_REST_API_URL, KV_REST_API_TOKEN.
const TYPES = ['offer', 'answer', 'ice', 'hello', 'bye', 'sync-req'];
const key = r => 'pc:sig:' + r;
const validRoom = r => /^[A-Z0-9]{4}$/.test(r || '');

// Pure validation (unit-tested). m: {room, msg:{t,d,from}}
function validateSignal(m) {
  if (!m || typeof m !== 'object') return 'bad body';
  if (!validRoom(m.room)) return 'bad room';
  const g = m.msg;
  if (!g || typeof g !== 'object') return 'bad msg';
  if (!TYPES.includes(g.t)) return 'bad type';
  if (g.from !== 'h' && g.from !== 'g') return 'bad from';
  const s = typeof g.d === 'string' ? g.d : JSON.stringify(g.d || '');
  if (s.length > 8192) return 'too big';
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
      const q = req.query || {}, room = String(q.room || '');
      if (!validRoom(room)) return res.status(400).json({ ok: false, err: 'bad room' });
      const since = Math.max(0, parseInt(q.since || '0', 10) || 0);
      const d = await kv('lrange/' + encodeURIComponent(key(room)) + '/' + since + '/-1');
      return res.status(200).json({ ok: true, msgs: d.result || [], next: since + (d.result || []).length });
    }
    if (req.method === 'POST') {
      const err = validateSignal(req.body || {});
      if (err) return res.status(400).json({ ok: false, err });
      const rl = await kv('incr/pc:rlsig:' + encodeURIComponent(ip(req)));
      await kv('expire/pc:rlsig:' + encodeURIComponent(ip(req)) + '/60');
      if ((rl.result | 0) > 60) return res.status(429).json({ ok: false, err: 'slow down' });
      const { room, msg } = req.body;
      await kv('rpush/' + encodeURIComponent(key(room)) + '/' + encodeURIComponent(JSON.stringify(msg)), { method: 'POST' });
      await kv('expire/' + encodeURIComponent(key(room)) + '/600', { method: 'POST' });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ ok: false, err: 'method' });
  } catch (e) {
    return res.status(500).json({ ok: false, err: 'store unavailable' });
  }
}
module.exports = handler;
module.exports.validateSignal = validateSignal;
