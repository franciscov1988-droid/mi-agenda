/* Service worker — caché offline y notificaciones */
const CACHE = 'miagenda-v4';
// Estáticos que casi no cambian (caché primero)
const ASSETS = [
  './styles.css', './app.js', './manifest.webmanifest', './chart.umd.min.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];
// Siempre frescos desde la red (config y la página): así los cambios de
// config.js (claves de Firebase/Google) y del HTML se aplican de inmediato.
const NETWORK_FIRST = ['./', './index.html', './config.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

function isNetworkFirst(url) {
  const p = url.pathname;
  return p.endsWith('/config.js') || p.endsWith('/index.html') || p === '/' || p.endsWith('/mi-agenda/') || p.endsWith('/mi-agenda');
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // APIs externas (Google, Firebase): dejar pasar a la red sin interferir
  if (url.origin !== location.origin) return;

  if (isNetworkFirst(url) || e.request.mode === 'navigate') {
    // Red primero; si no hay conexión, usar la copia en caché
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Estáticos: caché primero
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});

// Al tocar la notificación, enfocar/abrir la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
