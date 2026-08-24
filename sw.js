// GRCON — Service Worker para cache offline
// Versão: 5.33.13
// Estratégia: rede primeiro para todo o código do GRCON (HTML/CSS/JS), para
// que uma correção publicada apareça na hora; e stale-while-revalidate para os
// arquivos pesados (bibliotecas, imagens e os pacotes gerados), que assim
// carregam na hora do cache e se atualizam em segundo plano.
//
// Antes era o contrário: só um punhado de arquivos era "rede primeiro" e todo o
// resto vinha do cache. Como os CSS não estavam nessa lista e o nome do cache só
// muda quando alguém lembra de trocá-lo na mão, uma correção de CSS publicada no
// site nunca chegava a quem já tinha aberto o app antes — o navegador seguia
// servindo a versão antiga indefinidamente.

const CACHE_NAME = "grcon-v5.33.13";
const ASSETS = [
  "index.html",
  "design-system.css",
  "legacy-compat.css",
  "grcon-ui.css",
  "sigem-posting.css",
  "analysis-history.css",
  "grcon-final.css",
  "grcon-ui-fix.css",
  "grcon-responsive.css",
  "grcon_cloud.css",
  "requests.css",
  "grcon-icon.png",
  "grcon-logo-app.png",
  "grcon-logo-report.png",
  "manifest.json",
  "offline_resources.js",
  "grcon_bootstrap_head.js",
  "grcon_service_worker.js",
  "grcon_module_loader.js",
  "grcon_contracts.js",
  "large_input.js",
  "core.js",
  "ld_conflicts.js",
  "requests_core.js",
  "requests_report.js",
  "requests_app.js",
  "apendice_base.js",
  "apendice_tagueados.js",
  "report_summary.js",
  "grcon_output_guard.js",
  "output_audit.js",
  "package_layout.js",
  "egrdt_sequence.js",
  "history_core.js",
  "retomar.js",
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
  "workers/ld.worker.js",
  "workers/triage.worker.js",
  "workers/export.worker.js",
];

const CRITICAL_ASSETS = [
  "index.html",
  "grcon_bootstrap_head.js",
  "grcon_service_worker.js",
  "design-system.css",
  "legacy-compat.css",
  "grcon-ui.css",
  "grcon-final.css",
  "grcon-ui-fix.css",
  "grcon-responsive.css",
  "grcon_cloud.css",
  "grcon_config.js",
  "grcon_utils.js",
  "core.js",
  "egrdt_sequence.js",
  "history_core.js",
  "retomar.js",
  "supabase.min.js",
  "grcon_cloud_config.js",
  "grcon_cloud_app.js",
  "app.js",
];

// Arquivos pesados: entrega imediata do cache e revalidação em segundo plano
// (stale-while-revalidate). Os Workers deixaram de embutir cópias inteiras do
// motor e das bibliotecas; por isso entram na política normal de código, que
// tenta a rede primeiro e evita executar uma versão antiga após a publicação.
const HEAVY_ASSETS = new Set([
  "exceljs.min.js",
  "xlsx.full.min.js",
  "jszip.min.js",
  "supabase.min.js",
  "grdt-template.xlsx",
  "grcon-icon.png",
  "grcon-icon.ico",
  "grcon-logo-app.png",
  "grcon-logo-app.ico",
  "grcon-logo-report.png",
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
      // cache:"reload" ignora o cache HTTP do navegador ao pré-carregar, senão o
      // Service Worker novo podia guardar de novo justamente a cópia velha.
      const freshRequest = (asset) => new Request(asset, { cache: "reload" });
      await Promise.all(CRITICAL_ASSETS.map((asset) => cache.add(freshRequest(asset))));
      const optionalAssets = ASSETS.filter((asset) => !CRITICAL_ASSETS.includes(asset));
      const results = await Promise.allSettled(optionalAssets.map((asset) => cache.add(freshRequest(asset))));
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
  const fileName = requestUrl.pathname.split("/").filter(Boolean).pop() || "";
  if (!HEAVY_ASSETS.has(fileName)) {
    // Código do GRCON (HTML/CSS/JS): sempre tenta a rede antes, com o cache
    // como reserva para funcionar offline. Assim uma correção publicada
    // aparece na hora.
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      const revalidate = fetchAndCache(event.request).catch(() => null);
      if (cached) {
        // Mantém a revalidação viva mesmo depois de responder do cache.
        event.waitUntil(revalidate);
        return cached;
      }
      const fresh = await revalidate;
      return fresh || new Response("Recurso indisponível offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })()
  );
});
