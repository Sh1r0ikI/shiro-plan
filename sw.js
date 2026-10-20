/* Shell: stale-while-revalidate. plan.json: network-first, no HTTP cache, cache fallback. */
const CACHE = 'shiro-plan-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './logic.js',
  './plan.json',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/plan.json')) {
    event.respondWith(networkFirstPlan(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstPlan(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request.url, { cache: 'no-store', credentials: 'same-origin' });
    if (!fresh.ok) throw new Error(`status ${fresh.status}`);
    await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return markCached(cached);
    return new Response('plan.json unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function markCached(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Plan-Source', 'cache');
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  if (request.mode === 'navigate') {
    return (await cache.match('./index.html'))
      || (await cache.match('./'))
      || new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
