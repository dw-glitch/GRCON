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
    // O Dashboard é construído por retomar.js e já existe no carregamento inicial.
    // Ele é uma view lógica, não um arquivo chamado /dashboard.
    dashboard: [],
    "analysis-history": ["navigation", "analysis_history_report.js", "analysis_history_app.js"],
    "ld-posting": ["xlsx", "zip", "ld_posting_writer.js"],
    sigem: ["navigation", "ld-posting", "sigem_posting_app.js"],
    // A consulta lê LDs e exporta Excel; ambos entram sob demanda.
    requests: ["xlsx", "excel", "brand", "requests_app.js"],
    // O combinador é isolado do banco. A biblioteca pesada fica dentro do
    // Worker e só é carregada quando o operador realmente gera o PDF.
    "pdf-tools": ["pdf_merge_core.js", "pdf_merge_app.js"],
  };

  const moduleRequirements = {
    history: ["GrconHistory", "GrconHistoryReport", "GrconHistoryUi"],
    dashboard: ["GrconHistoryDashboard"],
    "analysis-history": ["GrconAnalysisHistory", "GrconAnalysisHistoryReport", "GrconAnalysisHistoryUi"],
    sigem: ["GrconSigemPosting", "GrconLdPostingWriter", "GrconSigemUi"],
    requests: ["GrconRequestsCore", "GrconRequestsReport", "GrconRequestsUi"],
    "pdf-tools": ["GrconPdfMergeCore", "GrconPdfMergeUi"],
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
            // O fallback continua como script externo. Antes o arquivo era
            // baixado como texto e injetado em inline.text, ampliando a
            // superfície de execução e dificultando uma CSP mais rigorosa.
            await new Promise((candidateResolve, candidateReject) => {
              const retry = document.createElement("script");
              const retryUrl = new URL(url, document.baseURI);
              retryUrl.searchParams.set("grcon-retry", String(Date.now()));
              retry.src = retryUrl.href;
              retry.async = false;
              retry.dataset.grconLazy = `${url}::retry`;
              retry.addEventListener("load", candidateResolve, { once: true });
              retry.addEventListener("error", () => {
                retry.remove();
                candidateReject(new Error(`Falha ao carregar ${url}.`));
              }, { once: true });
              document.head.appendChild(retry);
            });
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
    if (Object.prototype.hasOwnProperty.call(groups, item)) {
      for (const dependency of groups[item]) await ensure(dependency);
      return;
    }
    // Só caminhos de JavaScript podem chegar ao carregador de scripts. Antes,
    // qualquer nome lógico desconhecido (ex.: "dashboard") virava uma URL e
    // disparava várias tentativas 404 + erro de MIME no navegador.
    if (!/\.(?:m?js)(?:[?#].*)?$/i.test(String(item || ""))) {
      throw new Error(`Módulo desconhecido: ${item}. Atualize o GRCON e tente novamente.`);
    }
    await loadScript(item);
  }

  function directActivate(view) {
    const modules = {
      control: "grdt-module",
      "analysis-history": "analysis-history-module",
      history: "history-module",
      dashboard: "dashboard-module",
      sigem: "sigem-module",
      requests: "requests-module",
      "pdf-tools": "pdf-tools-module",
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
    rotularArea(view);
  }

  // O cabeçalho e o rodapé diziam "Controle de GRDT" em todas as abas, mesmo
  // com outra aberta. Quem chega à tela pelo link de outra pessoa lia o nome
  // errado da área em que está.
  const NOMES = {
    control: "Controle de GRDT",
    requests: "Consultas",
    "analysis-history": "Histórico de análises",
    history: "Histórico de eGRDTs",
    dashboard: "Dashboard de emissões",
    sigem: "Postagem SIGEM",
    "pdf-tools": "Combinar PDFs",
  };

  function rotularArea(view) {
    const nome = NOMES[view] || NOMES.control;
    const subtitulo = document.getElementById("brand-subtitle");
    const rodape = document.getElementById("footer-view");
    if (subtitulo) subtitulo.textContent = nome;
    if (rodape) rodape.textContent = nome;
    document.title = `GRCON — ${nome}`;
  }

  function assertModuleReady(module) {
    const missing = (moduleRequirements[module] || []).filter((name) => root[name] == null);
    if (missing.length) {
      throw new Error(`O módulo ${module} não foi inicializado corretamente. Componente(s) ausente(s): ${missing.join(", ")}. Recarregue a página e tente novamente.`);
    }
  }

  function activateReadyModule(module) {
    if (module === "dashboard") {
      root.GrconHistoryDashboard?.activate?.();
      return;
    }
    if (module === "pdf-tools") {
      root.GrconPdfMergeUi?.activate?.();
      return;
    }
    root.GrconHistoryUi?.activate?.(module);
  }

  async function ensureModule(view) {
    const module = view || "control";
    if (module === "control") {
      directActivate("control");
      return;
    }
    if (moduleState.get(module) === "ready") {
      // directActivate também aqui: sem isto, a partir da segunda visita a um
      // módulo já carregado só corria o activate() do history_app, que não
      // conhece todas as views — e a tela ficava em branco.
      directActivate(module);
      activateReadyModule(module);
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
        activateReadyModule(module);
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
    // Delegação cobre também views criadas dinamicamente (Dashboard) e mantém
    // um único ponto de navegação. O handler do próprio Dashboard pode coexistir:
    // ensureModule reconhece a view e não tenta buscar um arquivo inexistente.
    document.addEventListener("click", (event) => {
      const button = event.target && event.target.closest ? event.target.closest("[data-grcon-view]") : null;
      if (!button) return;
      ensureModule(button.dataset.grconView).catch(() => {});
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
