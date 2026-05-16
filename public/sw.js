// Bumped from v1: the v1 networkFirst fallback returned OFFLINE_PAGE_URL
// (index.html) for failed script requests, causing "module script MIME text/html"
// errors when the server was down or served a different asset hash. The v2
// activate handler deletes v1, flushing any poisoned cached entries.
const CACHE_NAME = 'aionui-webui-v2';
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
      // After claim, tell any open WebUI tabs running under the previous SW
      // to reload so they pick up the fixed fetch handler immediately.
      // Without this, an already-open tab keeps serving from the old v1 SW
      // until the user manually refreshes.
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          for (const client of clients) {
            client.navigate(client.url).catch(() => undefined);
          }
        })
      )
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
    // Only fall back to the offline index.html for navigation requests.
    // Returning index.html for a `<script>` request gives the browser HTML with
    // a text/html MIME and breaks the page with "module script MIME" errors.
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await cache.match(OFFLINE_PAGE_URL)) || Response.error();
    }
    return Response.error();
  }
}

// Asset requests (script/style) must never serve a cached entry whose content
// type has diverged from what the browser is asking for. A hash-mismatched
// script file on disk is served as index.html by the fallback, which then
// gets cached — the next request replays the corrupted entry even if the
// network is up. This helper drops entries whose content-type lies.
function isAssetContentTypeMismatch(request, response) {
  if (request.mode === 'navigate') return false;
  const destination = request.destination;
  if (destination !== 'script' && destination !== 'style') return false;
  const contentType = response.headers.get('content-type') || '';
  if (destination === 'script' && !/javascript|ecmascript|wasm/i.test(contentType)) return true;
  if (destination === 'style' && !/css/i.test(contentType)) return true;
  return false;
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

async function networkOnlyWithTypeGuard(request) {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(request);
  if (isAssetContentTypeMismatch(request, response)) {
    // Server is probably serving the SPA fallback (index.html) for a script
    // URL whose hash no longer exists on disk — typically a stale asset
    // reference from a previous app version. Drop any poisoned cache entry
    // and fail fast so the browser shows a clear error instead of trying to
    // execute HTML as JavaScript.
    await cache.delete(request);
    return Response.error();
  }
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
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
  if (['script', 'style'].includes(destination)) {
    // Script/style must stay network-fresh. An asset hash mismatch between
    // two app builds would otherwise let networkFirst serve a stale cached
    // bundle that no longer matches index.html's <script> tags.
    event.respondWith(networkOnlyWithTypeGuard(event.request));
  } else if (['image', 'font'].includes(destination)) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
