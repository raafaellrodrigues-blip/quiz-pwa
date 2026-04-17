// =============================================
// sw.js — Service Worker
// Cache offline + estratégia Network-First para API
// =============================================

const CACHE_NAME = 'quizia-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
];

// ── INSTALL: pré-cache dos assets estáticos ──
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: remove caches antigos ──────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativado');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Network-first para API, Cache-first para estáticos ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API: Network-first (tenta buscar novo, cai no cache se offline)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Google Fonts: Network-first com cache longo
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Estáticos: Cache-first
  event.respondWith(cacheFirst(request));
});

// Cache-first: serve do cache, busca na rede se ausente
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback para navegação
    return caches.match('/index.html');
  }
}

// Network-first: tenta rede, cai no cache se falhar
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(
      JSON.stringify({ error: 'Offline: sem dados em cache para esta requisição' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
