/**
 * Service worker (web ISA ISC-98) — simple and honest:
 *  - precaches the app shell on install;
 *  - cache-first for same-origin hashed static assets (Astro fingerprints /_astro/, so
 *    stale entries are impossible by construction);
 *  - network-first with cache fallback for page navigations (lab pages carry their
 *    exercise spec + seed data inline, so caching the page caches the lab content).
 * No third-party requests are ever intercepted or made (ISC-99).
 */
const CACHE = "grcb-v1";
const SHELL = ["/", "/labs/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (ISC-99)

  const isHashedAsset = url.pathname.startsWith("/_astro/");
  const isStatic = isHashedAsset || /\.(js|css|svg|png|ico|woff2?|wasm|json)$/.test(url.pathname);

  if (isStatic) {
    // cache-first: hashed assets never change under the same URL
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    // network-first so content updates win; cached copy serves offline revisits
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});
