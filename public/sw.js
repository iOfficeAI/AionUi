const CACHE_NAME = 'aionui-webui-v1';
const NON_CACHEABLE_PATHS = new Set(['/qr-login']);
const OFFLINE_PAGE_URL = new URL('./index.html', self.location.href).toString();
const PRECACHE_URLS = [
  new URL('./', self.location.href).toString(),
  OFFLINE_PAGE_URL,
  new URL('./manifest.webmanifest', self.location.href).toString(),
  new URL('./pwa/icon-192.png', self.location.href).toString(),
  new URL('./pwa/icon-512.png', self.location.href).toString(),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key === CACHE_NAME) {
              return Promise.resolve();
            }
            return caches.delete(key);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

function shouldHandleRequest(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  return !url.pathname.startsWith('/api/') && !NON_CACHEABLE_PATHS.has(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(OFFLINE_PAGE_URL)) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void networkFetch;
    return cached;
  }

  return (await networkFetch) || Response.error();
}

self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  const destination = event.request.destination;
  if (['script', 'style', 'image', 'font'].includes(destination)) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
