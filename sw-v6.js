// GRCON Service Worker v6 — migração multiformato do mascote.
const CACHE_NAME = "grcon-v5.40.11-mascot-multiformat-v2";
const CACHE_PREFIX = "grcon-";
const CORE_ASSETS = [
  "index.html",
  "grcon_service_worker.js",
  "grcon_mascot_header.js",
  "grcon_mascot_asset_fix.js",
  "grcon_mascot_greeting_core.js",
  "grcon_mascot_controller.js",
  "grcon_mascot_controller_v5.js",
  "grcon_mascot_compat_media.js",
  "grcon-mascot-sprite.png",
  "design-system.css",
  "grcon-ui.css",
  "grcon-final.css",
  "app.js",
];
const HEAVY_ASSETS = new Set([
  "exceljs.min.js", "xlsx.full.min.js", "jszip.min.js", "pdf-lib.min.js",
  "supabase.min.js", "grdt-template.xlsx", "grcon-icon.png", "grcon-logo-app.png",
  "grcon-logo-report.png", "grcon-mascot-sprite.png",
]);

function validCacheResponse(response) {
  return Boolean(response && response.ok && response.status === 200 && response.type !== "opaque");
}

async function fetchFresh(request) {
  return fetch(new Request(request, { cache: "no-cache" }));
}

async function fetchAndCache(request) {
  const response = await fetchFresh(request);
  if (validCacheResponse(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetchAndCache(request);
    if (response) return response;
  } catch (_) {}
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request))
    || (fallbackUrl ? await cache.match(fallbackUrl) : null)
    || new Response("GRCON indisponível offline neste navegador.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetchAndCache(request).catch(() => null);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || new Response("Recurso indisponível offline.", { status: 503 });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(new Request(asset, { cache: "reload" }))));
    const failed = results.filter((entry) => entry.status === "rejected").length;
    if (failed) console.warn(`GRCON SW v6: ${failed} recurso(s) opcional(is) não foram pré-carregados.`);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "index.html"));
    return;
  }

  const path = url.pathname;
  const fileName = path.split("/").filter(Boolean).pop() || "";
  const mascotVideo = path.includes("/assets/mascot/video/");
  const mascotCompat = path.includes("/assets/mascot/compat/") || fileName === "grcon_mascot_compat_media.js";

  // Requests parciais de vídeo precisam chegar intactas ao servidor/CDN para 206.
  // Nunca guardar 206 como se fosse o arquivo completo.
  if (request.headers.has("range")) {
    event.respondWith(fetch(request));
    return;
  }

  // Durante e depois da migração, mídia do mascote é sempre rede-primeiro.
  // 404/erro/resposta parcial não são armazenados por validCacheResponse().
  if (mascotVideo || mascotCompat) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (HEAVY_ASSETS.has(fileName)) {
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }

  event.respondWith(networkFirst(request));
});
