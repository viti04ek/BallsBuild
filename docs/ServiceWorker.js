const cacheVersion = "1.0" + '-' + "Balls.wasm.unityweb";
const cacheName = "DefaultCompany-balls" + '-' + cacheVersion;
const criticalPatterns = [
    /\/TonConnectBridge\.jslib(\?|$)/,
    /\/Build\/.*\.(data|wasm|js)(\?|$)/
];

const contentToCache = [
    "Build/Balls.loader.js",
    "Build/Balls.framework.js.unityweb",
    "Build/Balls.data.unityweb",
    "Build/Balls.wasm.unityweb",
    "TemplateData/style.css"
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Install');
    self.skipWaiting();

    event.waitUntil((async () => {
        const cache = await caches.open(cacheName);
        console.log('[Service Worker] Caching predefined assets');
        await cache.addAll(contentToCache);
    })());
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activate');

    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter((key) => key !== cacheName)
                .map((key) => {
                    console.log('[Service Worker] Removing old cache:', key);
                    return caches.delete(key);
                })
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = request.url;
    const isCritical = criticalPatterns.some((pattern) => pattern.test(url));

    event.respondWith((async () => {
        if (isCritical) {
            try {
                const networkResponse = await fetch(request, { cache: 'no-store' });
                const cache = await caches.open(cacheName);
                cache.put(request, networkResponse.clone());
                return networkResponse;
            } catch (error) {
                const cached = await caches.match(request);
                if (cached) {
                    console.warn('[Service Worker] Using cached critical asset after network failure:', url);
                    return cached;
                }
                throw error;
            }
        }

        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }

        const networkResponse = await fetch(request);
        const cache = await caches.open(cacheName);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    })());
});
