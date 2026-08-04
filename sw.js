// GRCON — Service Worker para cache offline
// Versão: 5.31.6
// Estratégia: rede primeiro para o shell mutável; cache primeiro para bibliotecas estáticas.

const CACHE_NAME = "grcon-v5.31.6";
const ASSETS = [
  "index.html",
  "design-system.css",
  "legacy-compat.css",
  "grcon-ui.css",
  "sigem-posting.css",
  "analysis-history.css",
  "grcon-final.css",
  "grcon_cloud.css",
  "grcon-icon.png",
  "grcon-logo-app.png",
  "grcon-logo-report.png",
  "manifest.json",
  "offline_resources.js",
  "grcon_module_loader.js",
  "grcon_contracts.js",
  "large_input.js",
  "core.js",
  "ld_conflicts.js",
  "report_summary.js",
  "grcon_output_guard.js",
  "output_audit.js",
  "package_layout.js",
  "egrdt_sequence.js",
  "history_core.js",
  "supabase.min.js",
  "grcon_cloud_config.js",
  "grcon_cloud_app.js",
  "history_report.js",
  "history_app.js",
  "history_report_worker.js",
  "pending_allocation_history_core.js",
  "analysis_history_core.js",
  "analysis_history_report.js",
  "analysis_history_app.js",
  "analysis_history_storage_fallback.js",
  "analysis_warning.js",
  "error_handler.js",
  "keyboard_shortcuts.js",
  "grcon_grdt_history_indicator.js",
  "ld_memory.js",
  "sigem_posting_core.js",
  "sigem_posting_app.js",
  "ld_compatibility.js",
  "timeline_core.js",
  "grdt_databook_support.js",
  "emission.js",
  "pending_allocation_package.js",
  "grdt-template.xlsx",
  "task_center.js",
  "workspace.js",
  "title_quality.js",
  "grdt_history_indicator.js",
  "app.js",
  "macro5_flow_core.js",
  "p1_ux.js",
  "app-ui.js",
  "ui-v3.js",
  "macro5_flow_app.js",
  "productivity_center.js",
  "exceljs.min.js",
  "jszip.min.js",
  "xlsx.full.min.js",
  "grcon_config.js",
  "grcon_utils.js",
  "grcon_file_access.js",
  "grcon_enhancements.js",
  "grcon_brand_assets.js",
  "grdt_workbook.js",
  "ld_posting_writer.js",
  "performance_workers.js",
];

const CRITICAL_ASSETS = [
  "index.html",
  "design-system.css",
  "legacy-compat.css",
  "grcon-ui.css",
  "grcon-final.css",
  "grcon_cloud.css",
  "grcon_config.js",
  "grcon_utils.js",
  "core.js",
  "egrdt_sequence.js",
  "history_core.js",
  "supabase.min.js",
  "grcon_cloud_config.js",
  "grcon_cloud_app.js",
  "app.js",
];

const MUTABLE_PATHS = new Set([
  "/",
  "/index.html",
  "/sw.js",
  "/manifest.json",
  "/grcon_cloud_config.js",
  "/grcon_cloud_app.js",
  "/history_core.js",
  "/app.js",
]);

async function fetchAndCache(request) {
  const response = await fetch(new Request(request, { cache: "no-store" }));
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    return await fetchAndCache(request);
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(request) || (fallbackUrl ? await cache.match(fallbackUrl) : null)
      || new Response("GRCON indisponível offline neste navegador.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(CRITICAL_ASSETS.map((asset) => cache.add(asset)));
      const optionalAssets = ASSETS.filter((asset) => !CRITICAL_ASSETS.includes(asset));
      const results = await Promise.allSettled(optionalAssets.map((asset) => cache.add(asset)));
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed) console.warn(`SW: ${failed} asset(s) opcional(is) não foram pré-cacheados.`);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })()
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "index.html"));
    return;
  }
  const localPath = `/${requestUrl.pathname.split("/").filter(Boolean).pop() || ""}`;
  if (MUTABLE_PATHS.has(requestUrl.pathname) || MUTABLE_PATHS.has(localPath)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        return await fetchAndCache(event.request);
      } catch (error) {
        return new Response("Recurso indisponível offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })()
  );
});
