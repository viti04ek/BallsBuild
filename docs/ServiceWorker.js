const cacheName = "DefaultCompany-balls-0.1.0" + "-v3";
const contentToCache = [
    "Build/Balls.loader.js",
    "Build/Balls.framework.js.unityweb",
    "Build/Balls.data.unityweb",
    "Build/Balls.wasm.unityweb",
    "styles.css",
    "logo.png"
];
const cachePaths = contentToCache.map(function (p) {
    return new URL(p, self.location.origin).pathname;
});

self.addEventListener('install', function (e) {
    console.log('[Service Worker] Install');
    
    e.waitUntil((async function () {
      const cache = await caches.open(cacheName);
      console.log('[Service Worker] Caching all: app shell and content');
      await Promise.all(contentToCache.map(function (p) {
        return cache.add(p).catch(function () { return null; });
      }));
    })());

    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    e.waitUntil((async function () {
      const keys = await caches.keys();
      await Promise.all(keys.map(function (key) {
        if (key !== cacheName) {
          return caches.delete(key);
        }
      }));
    })());

    self.clients.claim();
});

self.addEventListener('fetch', function (e) {
    if (e.request.method !== 'GET') {
      return;
    }

    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin) {
      return;
    }

    if (cachePaths.indexOf(url.pathname) === -1) {
      return;
    }

    e.respondWith((async function () {
      const cache = await caches.open(cacheName);
      try {
        const response = await fetch(e.request);
        if (response && response.ok) {
          cache.put(e.request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await cache.match(e.request);
        if (cached) { return cached; }
        throw err;
      }
    })());
});
