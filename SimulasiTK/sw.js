const CACHE_NAME = "simkerja-id-cache-v3.1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png"
];

const OPTIONAL_CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
];

/* 1. INSTALL: Simpan aset inti ke cache lokal */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        CORE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" }))
        )
      );
      await Promise.allSettled(
        OPTIONAL_CDN_ASSETS.map((url) => cache.add(url))
      );
    })
  );
  self.skipWaiting();
});

/* 2. ACTIVATE: Bersihkan cache versi lama */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

/* 3. FETCH: Strategi offline-resilient */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith("http")) return;

  /* A. Navigasi halaman HTML: Network-first, fallback ke cache saat offline */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          }
          return networkRes;
        })
        .catch(async () => {
          return (
            (await caches.match(req)) ||
            (await caches.match("./index.html")) ||
            (await caches.match("./"))
          );
        })
    );
    return;
  }

  /* B. Aset lokal (same-origin): Stale-While-Revalidate */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200 && networkRes.type === "basic") {
              const copy = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return networkRes;
          })
          .catch(() => cachedRes);

        return cachedRes || fetchPromise;
      })
    );
    return;
  }

  /* C. Aset eksternal (Google Fonts & SheetJS CDN): Cache-first */
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) return cachedRes;
      return fetch(req)
        .then((networkRes) => {
          if (networkRes && (networkRes.ok || networkRes.type === "opaque")) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(() => new Response("", { status: 408, statusText: "Offline" }));
    })
  );
});
