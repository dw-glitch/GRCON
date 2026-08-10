(function (root) {
  "use strict";

  const loaded = new Set();
  const loading = new Map();
  const moduleState = new Map();

  const groups = {
    xlsx: ["xlsx.full.min.js", "grdt_workbook.js"],
    excel: ["exceljs.min.js"],
    zip: ["jszip.min.js"],
    brand: ["grcon_brand_assets.js"],
    performance: ["performance_workers.js"],
    report: ["excel", "brand", "performance"],
    export: ["xlsx", "excel", "zip", "brand", "performance"],
    navigation: ["history_report.js", "history_app.js"],
    history: ["navigation"],
    "analysis-history": ["navigation", "analysis_history_report.js", "analysis_history_app.js"],
    "ld-posting": ["xlsx", "zip", "ld_posting_writer.js"],
    sigem: ["navigation", "ld-posting", "sigem_posting_app.js"],
    // Os scripts da fila de e-mails já vêm no index.html; nada a carregar sob demanda.
    emails: [],
  };

  const moduleRequirements = {
    history: ["GrconHistory", "GrconHistoryReport", "GrconHistoryUi"],
    "analysis-history": ["GrconAnalysisHistory", "GrconAnalysisHistoryReport", "GrconAnalysisHistoryUi"],
    sigem: ["GrconSigemPosting", "GrconLdPostingWriter", "GrconSigemUi"],
    emails: ["GrconEmailQueue", "GrconEmailQueueUi"],
  };

  function scriptBasename(value) {
    const raw = String(value || "").split("?")[0].split("#")[0];
    if (!raw) return "";
    try {
      const pathname = new URL(raw, document.baseURI).pathname;
      return decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1));
    } catch (_) {
      console.debug("[ModuleLoader] context:", _);
      return decodeURIComponent(raw.replace(/\\/g, "/").split("/").pop() || "");
    }
  }

  function isSameScript(node, src) {
    if (!node) return false;
    if (node.dataset.grconLazy === src) return true;
    return scriptBasename(node.getAttribute("src")) === scriptBasename(src);
  }

  function loadScript(src) {
    if (loaded.has(src)) return Promise.resolve();
    if (loading.has(src)) return loading.get(src);

    const existing = [...document.scripts].find((node) => isSameScript(node, src));
    if (existing) {
      loaded.add(src);
      return Promise.resolve();
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const normalizedSrc = new URL(src, document.baseURI).href;
      script.src = normalizedSrc;
      script.async = false;
      script.dataset.grconLazy = normalizedSrc;
      let runtimeError = null;

      const onRuntimeError = (event) => {
        if (scriptBasename(event.filename) !== scriptBasename(src)) return;
        runtimeError = event.error instanceof Error
          ? event.error
          : new Error(event.message || `Falha ao executar ${src}`);
      };

      const cleanup = () => root.removeEventListener("error", onRuntimeError);
      root.addEventListener("error", onRuntimeError);

      script.addEventListener("load", () => {
        cleanup();
        if (runtimeError) {
          script.remove();
          reject(runtimeError);
          return;
        }
        loaded.add(src);
        resolve();
      }, { once: true });

      script.addEventListener("error", async () => {
        cleanup();
        script.remove();
        const basename = scriptBasename(src) || src;
        const tried = [];

        // Tentativas de fallback por várias URLs plausíveis
        const candidates = [];
        try { candidates.push(normalizedSrc); } catch (_) { console.debug("[ModuleLoader] context:", _); }
        // basename bruto (pode funcionar quando o navegador resolve relativo ao documento)
        candidates.push(basename);
        // caminho relativo explícito na mesma pasta
        candidates.push(`./${basename}`);
        // caminho relativo absoluto baseado em document.baseURI
        try {
          const base = new URL(document.baseURI).pathname.replace(/[^/]*$/, "");
          candidates.push(base + basename);
        } catch (_) { console.debug("[ModuleLoader] context:", _); }

        for (const url of candidates) {
          if (!url || tried.includes(String(url))) continue;
          tried.push(String(url));
          try {
            const resp = await fetch(url, { cache: "no-store" });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const text = await resp.text();
            const inline = document.createElement("script");
            inline.text = text;
            inline.dataset.grconLazy = `${url}::inline`;
            document.head.appendChild(inline);
            loaded.add(src);
            resolve();
            return;
          } catch (err) {
            // tenta próxima opção
          }
        }

        // Tentar carregar a partir dos recursos offline incorporados, se houver.
        // Ao usar o provedor offline, primeiro solicite que ele carregue/prepare o recurso (ensure)
        if (root.GRCONOfflineResources && typeof root.GRCONOfflineResources.ensure === "function") {
          try { await root.GRCONOfflineResources.ensure(basename); } catch (err) { console.debug("[ModuleLoader] Offline ensure para", basename, ":", err); }
        }
        if (root.GRCONOfflineResources && typeof root.GRCONOfflineResources.has === "function" && root.GRCONOfflineResources.has(basename)) {
          try {
            const objectUrl = root.GRCONOfflineResources.objectUrl(basename);
            const fallback = document.createElement("script");
            fallback.src = objectUrl;
            fallback.async = false;
            fallback.dataset.grconLazy = `${basename}::offline`;
            fallback.addEventListener("load", () => { loaded.add(src); resolve(); }, { once: true });
            fallback.addEventListener("error", () => { reject(new Error(`Falha ao carregar ${src} a partir de recursos offline.`)); }, { once: true });
            document.head.appendChild(fallback);
            return;
          } catch (offlineErr) {
            // se falhar, seguirá para rejeitar
          }
        }

        reject(new Error(`Falha ao carregar ${src}: não foi possível recuperar por rede, caminho local ou recurso offline.`));
      }, { once: true });

      document.head.appendChild(script);
    }).finally(() => loading.delete(src));

    loading.set(src, promise);
    return promise;
  }

  async function ensure(item) {
    if (groups[item]) {
      for (const dependency of groups[item]) await ensure(dependency);
      return;
    }
    await loadScript(item);
  }

  function directActivate(view) {
    const modules = {
      control: "grdt-module",
      "analysis-history": "analysis-history-module",
      history: "history-module",
      sigem: "sigem-module",
      emails: "emails-module",
    };
    Object.entries(modules).forEach(([key, id]) => {
      const node = document.getElementById(id);
      if (node) node.hidden = key !== view;
    });
    document.querySelectorAll("[data-grcon-view]").forEach((button) => {
      const active = button.dataset.grconView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  function assertModuleReady(module) {
    const missing = (moduleRequirements[module] || []).filter((name) => root[name] == null);
    if (missing.length) {
      throw new Error(`O módulo ${module} não foi inicializado corretamente. Componente(s) ausente(s): ${missing.join(", ")}. Recarregue a página e tente novamente.`);
    }
  }

  async function ensureModule(view) {
    const module = view || "control";
    if (module === "control") {
      directActivate("control");
      return;
    }
    if (moduleState.get(module) === "ready") {
      root.GrconHistoryUi?.activate?.(module);
      return;
    }
    if (moduleState.get(module) === "loading") return loading.get(`module:${module}`);

    moduleState.set(module, "loading");
    directActivate(module);

    const promise = (async () => {
      try {
        await ensure(module);
        assertModuleReady(module);
        moduleState.set(module, "ready");
        root.GrconHistoryUi?.activate?.(module);
        root.dispatchEvent(new CustomEvent("grcon:module-ready", { detail: { module } }));
      } catch (error) {
        moduleState.set(module, "failed");
        console.error(error);
        root.GrconNotify?.(error.message || `Falha ao carregar ${module}.`, "error");
        throw error;
      } finally {
        loading.delete(`module:${module}`);
      }
    })();

    loading.set(`module:${module}`, promise);
    return promise;
  }

  root.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-grcon-view]").forEach((button) => {
      button.addEventListener("click", () => ensureModule(button.dataset.grconView).catch(() => {}));
    });
  }, { once: true });

  root.GRCONModuleLoader = Object.freeze({
    ensure,
    ensureModule,
    loaded: (name) => loaded.has(name),
    state: (name) => moduleState.get(name) || "idle",
    scriptBasename,
  });
})(window);
