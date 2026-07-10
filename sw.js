const CACHE = 'spark-v3';

// Same-origin app shell
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo.png',
];

// Cross-origin dependencies the app needs offline (export libs + fonts).
// Fetched no-cors so the opaque responses can still be served from cache.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    // CDN precache is best-effort — install must not fail if a CDN is slow
    await Promise.allSettled(CDN_ASSETS.map(url =>
      cache.add(new Request(url, {mode: 'no-cors'}))
    ));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Stale-while-revalidate: serve from cache instantly, refresh in the
// background so a deploy reaches installed devices on the next launch.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, {ignoreSearch: e.request.mode === 'navigate'});
    const refresh = fetch(e.request).then(res => {
      // Cache successful responses; opaque (no-cors CDN) responses are kept
      // too so fonts/OCR assets become available offline after first use.
      if (res && (res.ok || res.type === 'opaque')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return res;
    }).catch(() => null);

    if (cached) {
      e.waitUntil(refresh);
      return cached;
    }
    const fresh = await refresh;
    if (fresh) return fresh;
    if (e.request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return Response.error();
  })());
});
