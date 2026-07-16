/* Kupa Manager — static app-shell cache only.
 * Never cache API responses, business JSON, tokens, or Blob data.
 */
const CACHE_NAME = "kupa-static-v1";
const STATIC_ALLOW = [
  "/",
  "/login",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

function isApiPath(url) {
  try {
    const u = new URL(url);
    return u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function isStaticAsset(url) {
  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    if (isApiPath(url)) return false;
    const p = u.pathname;
    if (p.startsWith("/_next/static/")) return true;
    if (p.startsWith("/icons/")) return true;
    if (/\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(p)) return true;
    return STATIC_ALLOW.includes(p);
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ALLOW))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
            return undefined;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (isApiPath(req.url)) return; // network-only; never cache business APIs

  if (!isStaticAsset(req.url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.ok) {
        try {
          await cache.put(req, res.clone());
        } catch {
          /* ignore quota / opaque failures */
        }
      }
      return res;
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "KUPA_CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});
