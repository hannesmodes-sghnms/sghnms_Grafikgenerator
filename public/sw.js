const CACHE_PREFIX = "sghnms-generator-";
const APP_CACHE = `${CACHE_PREFIX}app-v1`;
const DATA_CACHE = `${CACHE_PREFIX}data-v1`;

const scopedUrl = (path) =>
  new URL(path, self.location.href).href;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./story-format.js",
  "./pwa.js",
  "./manifest.json",
  "./assets/app/favicon-48.png",
  "./assets/app/apple-touch-icon.png",
  "./assets/app/icon-192.png",
  "./assets/app/icon-512.png",
  "./assets/app/icon-512-maskable.png"
].map(scopedUrl);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                ![APP_CACHE, DATA_CACHE].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, fallbackUrl = null) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request, {
      cache: "no-store"
    });

    if (response.ok) {
      await cache.put(
        request,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    const cached =
      await cache.match(request);

    if (cached) {
      return cached;
    }

    if (fallbackUrl) {
      const fallback =
        await caches
          .open(APP_CACHE)
          .then((appCache) =>
            appCache.match(
              scopedUrl(fallbackUrl)
            )
          );

      if (fallback) {
        return fallback;
      }
    }

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache =
    await caches.open(
      APP_CACHE
    );

  const cached =
    await cache.match(
      request
    );

  const refresh =
    fetch(request)
      .then(async (response) => {
        if (response.ok) {
          await cache.put(
            request,
            response.clone()
          );
        }

        return response;
      })
      .catch(() => null);

  return (
    cached ||
    (await refresh) ||
    Response.error()
  );
}

self.addEventListener("fetch", (event) => {
  const request =
    event.request;

  if (
    request.method !== "GET"
  ) {
    return;
  }

  const url =
    new URL(
      request.url
    );

  if (
    url.origin !==
    self.location.origin
  ) {
    return;
  }

  if (
    request.mode === "navigate"
  ) {
    event.respondWith(
      networkFirst(
        request,
        APP_CACHE,
        "./index.html"
      )
    );

    return;
  }

  const isDynamicData =
    url.pathname.includes("/data/") ||
    (
      url.pathname.endsWith(".json") &&
      !url.pathname.endsWith("/manifest.json")
    );

  if (isDynamicData) {
    event.respondWith(
      networkFirst(
        request,
        DATA_CACHE
      )
    );

    return;
  }

  event.respondWith(
    staleWhileRevalidate(
      request
    )
  );
});
