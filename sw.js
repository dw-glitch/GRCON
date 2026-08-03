// GRCON — Service Worker para cache offline
// Versão: 5.31.2
// Estratégia: Cache First para assets estáticos

const CACHE_NAME = "grcon-v5.31.2";
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.addAll(ASSETS);
      } catch (error) {
        console.warn("SW: alguns assets não puderam ser cacheados:", error);
      }
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
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});
