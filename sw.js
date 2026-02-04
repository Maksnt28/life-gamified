// ============================================================
// Service Worker — Life Gamified
// ============================================================
// Strategy: cache-first for the app shell (instant load on repeat
// visits, works offline), background-update so the cached version
// stays fresh after every Vercel deploy.
// ============================================================

const CACHE_NAME = 'life-gamified-v2';

const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-512-maskable.png'
];

// --- INSTALL: pre-cache the app shell ---
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching app shell…');
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting(); // activate immediately, don't wait for other tabs
});

// --- ACTIVATE: delete any previous cache version ---
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME)
                    .map((k) => { console.log('[SW] Removing old cache:', k); return caches.delete(k); })
            )
        )
    );
    self.clients.claim(); // take over open tabs immediately
});

// --- FETCH: serve from cache, refresh in background ---
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return; // ignore external

    event.respondWith(
        caches.match(event.request).then((cached) => {
            // Always kick off a network fetch to update the cache
            const networkFetch = fetch(event.request)
                .then((res) => {
                    if (res.ok) {
                        caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
                    }
                    return res;
                })
                .catch(() => {}); // network failure — silent, we'll use cache

            // Return cached instantly if available; otherwise wait for network
            return cached || networkFetch;
        })
    );
});

// --- PUSH: show a notification when the browser delivers a push event ---
// (On iOS this fires when a push arrives while the app is in the background)
self.addEventListener('push', (event) => {
    let title = 'Life Gamified';
    let body  = 'Time to check your tasks!';
    let tag   = 'life-gamified-generic';
    let url   = '/';

    if (event.data) {
        try {
            const p = event.data.json();
            title = p.title || title;
            body  = p.body  || body;
            tag   = p.tag   || tag;
            url   = p.url   || url;
        } catch (e) {
            body = event.data.text() || body;
        }
    }

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            tag,                          // same tag = replaces previous (no duplicates)
            icon:  '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            data:  { url }
        })
    );
});

// --- NOTIFICATION CLICK: open / focus the app when user taps the notification ---
self.addEventListener('notificationclick', (event) => {
    event.preventDefault();
    event.notification.close();

    const url = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            // If app window already open, just focus it
            for (const client of clients) {
                if (client.url === self.location.origin + url) {
                    client.focus();
                    return;
                }
            }
            // Otherwise open a new window
            return self.clients.openWindow(url);
        })
    );
});
