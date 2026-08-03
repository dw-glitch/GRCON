/**
 * GRCON — Offline Resources (Stub Compatível)
 * Os recursos offline agora são gerenciados exclusivamente pelo Service Worker (sw.js).
 * Este módulo mantém a API para compatibilidade com grcon_module_loader.js e app.js.
 */
(function (root) {
  "use strict";
  const api = Object.freeze({
    register: function () { return api; },
    ensure: function () { return Promise.resolve(true); },
    has: function () { return false; },
    metadata: function () { return null; },
    arrayBuffer: function (name) { throw new Error("Recurso offline '" + name + "' deve ser carregado via Service Worker."); },
    objectUrl: function (name) { throw new Error("Recurso offline '" + name + "' deve ser carregado via Service Worker."); },
    revokeObjectUrls: function () {},
    manifest: Object.freeze({}),
  });
  root.GRCONOfflineResources = api;
})(typeof globalThis !== "undefined" ? globalThis : this);