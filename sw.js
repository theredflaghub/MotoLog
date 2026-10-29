const CACHE = 'motolog-garage-v5';
const CORE = ['./', './index.html', './manifest.json', './motolog-extras.js', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const CDN = [
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js',
  'https://unpkg.com/lucide@0.383.0'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));                                  // must succeed
    await Promise.allSettled(CDN.map((u) => cache.add(u)));    // best effort: one failure no longer breaks install
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
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).hostname === 'api.open-meteo.com') return; // always live

  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    return hit || net;   // cached copy first, refreshed in the background
  }));
});
