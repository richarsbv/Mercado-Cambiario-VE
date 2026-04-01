// Service Worker - Estrategia Stale-while-revalidate

const CACHE_NAME = 'app-cache-v4';
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './tailwind.js',
    './manifest.json',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png'
];

// Instalación: cachear assets estáticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Stale-while-revalidate para assets estáticos, bypass para API
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (url.hostname.includes('dolarapi.com')) return;
    if (request.method !== 'GET') return;

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse.ok) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => cachedResponse);

            // Le decimos al navegador que NO mate el proceso hasta que fetchPromise termine
            if (cachedResponse) {
                event.waitUntil(fetchPromise);
                return cachedResponse;
            }
            return fetchPromise;
        })
    );
});

// Escuchar mensajes desde la aplicación (para actualizaciones)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
