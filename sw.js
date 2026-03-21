/* Sonderm — простой офлайн-кэш для PWA */
const CACHE = "sonderm-v1";

async function cacheCore() {
  const cache = await caches.open(CACHE);
  const urls = [
    "/index.html",
    "/login.html",
    "/telegram.css",
    "/app.js",
    "/webrtc.js",
    "/auth-client.js",
    "/auth-config.js",
    "/manifest.json",
  ];
  await Promise.all(
    urls.map((u) =>
      cache.add(u).catch(() => {
        /* файл может отсутствовать (например auth-config) */
      })
    )
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheCore().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok && request.url.startsWith(self.location.origin)) {
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html"));
    })
  );
});
