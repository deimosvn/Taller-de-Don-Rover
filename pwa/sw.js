/* Service worker de IXCHEL (plantilla: vite.config.ts inyecta la versión y la lista de archivos). */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const MODELS = 'ixchel-models-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ixchel-') && k !== VERSION && k !== MODELS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Funciones del servidor (base de datos e IA): siempre a la red, nunca a la caché.
  if (url.origin === self.location.origin && url.pathname.includes('/api/')) return;

  // Navegación: red primero (para recibir actualizaciones) y, sin conexión, la app guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }).then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Archivos propios (con hash): caché primero.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Modelo de visión de TensorFlow.js: se guarda tras el primer uso para escanear sin internet.
  if (url.hostname === 'storage.googleapis.com' && url.pathname.includes('tfjs-models')) {
    event.respondWith(
      caches.open(MODELS).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
  // Todo lo demás (señalización WebRTC, API de Claude) va directo a la red.
});
