const CACHE = 'motolog-garage-v6';
const CORE = ['./', './index.html', './manifest.json', './motolog-extras.js', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const CDN = [
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js',
  'https://unpkg.com/lucide@0.383.0'
];

// A response that came through a redirect cannot be handed to a page navigation, so rebuild it as a plain one.
const clean = async (r) => (r && r.redirected)
  ? new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers })
  : r;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // best effort: one missing file must never block the update
    await Promise.allSettled([...CORE, ...CDN].map(async (u) => {
      const res = await fetch(new Request(u, { cache: 'reload' }));
      if (res.ok) await cache.put(u, await clean(res));
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).hostname === 'api.open-meteo.com') return; // always live

  // Pages: network first (updates show immediately), saved copy only when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(async (r) => {
        if (r.ok && !r.redirected) { const c = await caches.open(CACHE); c.put('./', r.clone()); }
        return r;
      }).catch(async () => (await clean(await caches.match('./'))) || (await clean(await caches.match('./index.html'))) || Response.error())
    );
    return;
  }

  // Everything else: saved copy first, refreshed in the background
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => {
      if (r && r.status === 200) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
      return r;
    }).catch(() => hit || Response.error());
    if (hit) { e.waitUntil(net.catch(() => {})); return clean(hit); }
    return net;
  }));
});
