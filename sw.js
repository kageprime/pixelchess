/* Pixel Arcade service worker: precaches the hub, shared files and shipped games so the arcade works offline.
   Add each game's /<game>/index.html to PRECACHE as it ships, and bump CACHE so old copies are dropped. */
const CACHE = 'pixel-arcade-v4';
const PRECACHE = ['./', 'index.html', 'chess/index.html', 'pool/index.html', 'scrabble/index.html', 'scrabble/words.txt', 'shared/arcade.css', 'shared/shared.js', 'shared/vendor/PressStart2P-Regular.woff2'];

/* a redirected response cannot be served to a navigation, so rebuild it as a plain one */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* one missing file (the font, before it is vendored) must not stop everything else being cached */
    await Promise.all(PRECACHE.map(async u => {
      try { const r = await fetch(new Request(u, { cache: 'reload' })); if (r.ok) await c.put(new Request(u), await clean(r)); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const job = (async () => {
    const c = await caches.open(CACHE);
    let hit = await c.match(r, { ignoreSearch: true });
    if (!hit && r.mode === 'navigate') { /* /chess and /chess/ both mean /chess/index.html */
      const base = u.pathname.replace(/\/$/, '');
      hit = await c.match(base + '/index.html');
    }
    const net = fetch(r).then(async res => {
      if (res.ok && res.type === 'basic') await c.put(r, await clean(res.clone()));
      return res;
    });
    if (hit) return { res: hit, bg: net.catch(() => {}) };
    try { return { res: await net, bg: null }; }
    catch (_) { return { res: (r.mode === 'navigate' && await c.match('index.html')) || Response.error(), bg: null }; }
  })();
  e.respondWith(job.then(x => x.res));
  e.waitUntil(job.then(x => x.bg).catch(() => {}));
});
