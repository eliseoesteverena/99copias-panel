// Service Worker del panel — dos responsabilidades:
// 1) Requisito técnico para que el navegador ofrezca "instalar la app".
// 2) Recibir y mostrar las notificaciones push aunque el panel esté cerrado.
//
// A propósito NO cachea agresivamente: es un panel de datos en vivo, y
// servir HTML/JS viejo desde caché generaría confusión (ya nos pasó una
// vez con caché de borde de Cloudflare). Estrategia: network-first con
// fallback a caché solo si no hay conexión.

const CACHE_NAME = 'panel-shell-v1';
const APP_SHELL = [
  '/index.html',
  '/catalogo.html',
  '/turnos.html',
  '/css/style.css',
  '/css/pedidos.css',
  '/js/api.js',
  '/js/pedidos.js',
  '/js/catalogo.js',
  '/js/turnos.js',
  '/js/push.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Nunca cachear llamadas a la API: siempre tienen que ser datos frescos.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---------- Push ----------

self.addEventListener('push', (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { title: 'Panel 99copias', body: event.data ? event.data.text() : '' };
  }

  const titulo = datos.title || 'Nuevo pedido';
  const opciones = {
    body: datos.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: datos.tag || 'pedido-nuevo',
    data: { url: datos.url || '/index.html' },
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        // Si ya hay una pestaña del panel abierta, la reusamos y navegamos.
        if (cliente.url.includes(self.location.origin) && 'focus' in cliente) {
          cliente.navigate(url);
          return cliente.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
