const CACHE_NAME = "kem-family-routes-v13";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./points.js",
  "./photos.js",
  "./route-geometry.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/illustrations/station.svg",
  "./assets/illustrations/tower.svg",
  "./assets/illustrations/officers-house.svg",
  "./assets/illustrations/slon.svg",
  "./assets/illustrations/sea-rapid.svg",
  "./assets/illustrations/pushkin.svg",
  "./assets/photos/11-internationalists.webp",
  "./assets/photos/16-lenin.webp",
  "./assets/photos/27-minin.webp",
  "./assets/photos/28-annunciation.webp",
  "./assets/photos/34-kem-river.webp"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then(clients => Promise.all(clients.map(client => client.navigate(client.url))))
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match("./index.html"))));
});
