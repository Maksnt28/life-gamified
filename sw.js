// Service Worker for Life Gamified PWA
// Handles offline caching and push notifications

// --- Configuration ---
// Update this version number whenever you make changes to force cache refresh
const CACHE_NAME = 'life-gamified-v11';

const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-512-maskable.png',
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js'
];

// --- Install Event ---
// Fires when the service worker is first installed
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching app shell...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// --- Activate Event ---
// Fires when the service worker becomes active
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Take control of all pages immediately
    return self.clients.claim();
});

// --- Fetch Event ---
// Intercepts network requests and serves from cache when offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return cached version if available, otherwise fetch from network
            return response || fetch(event.request).then((fetchResponse) => {
                // Don't cache non-GET requests or chrome-extension requests
                if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
                    return fetchResponse;
                }
                
                // Clone the response before caching
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, fetchResponse.clone());
                    return fetchResponse;
                });
            });
        }).catch(() => {
            // If both cache and network fail, could return a custom offline page here
            console.log('[SW] Fetch failed for:', event.request.url);
        })
    );
});

// --- Push Event ---
// Handles incoming push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received:', event);
    
    let notificationData = {
        title: 'Life Gamified',
        body: 'You have a task reminder',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/' }
    };
    
    // If push has data, use it
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                data: data.data || notificationData.data
            };
        } catch (e) {
            console.log('[SW] Could not parse push data:', e);
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            data: notificationData.data
        })
    );
});

// --- Notification Click Event ---
// Handles clicks on notifications
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    event.notification.close();
    
    // Open the app or focus existing window
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (let client of clientList) {
                if (client.url === self.registration.scope && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data?.url || '/');
            }
        })
    );
});
