(function () {
  "use strict";
  try {
    const savedTheme = localStorage.getItem("quality-theme-grcon") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = savedTheme;
    document.documentElement.style.colorScheme = savedTheme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }

  // A persistência durável registra o listener de inicialização ainda no <head>.
  // Assim, quando DOMContentLoaded ocorrer, history_core.js e
  // sigem_posting_core.js já terão sido avaliados pelos scripts defer, mas a
  // pessoa ainda não teve oportunidade de iniciar uma operação. A versão v2
  // mantém o mesmo banco e acrescenta migração idempotente, validação real de
  // escrita e recuperação automática de bloqueios transitórios entre abas.
  function installOperationalPersistence() {
    if (document.querySelector("script[data-grcon-operational-persistence]")) return;
    const script = document.createElement("script");
    // O sufixo também impede que um HTML novo execute por engano a cópia antiga
    // deste módulo após um deploy, sem depender de limpeza manual do navegador.
    script.src = "operational_persistence_v2.js?storage=2";
    script.async = false;
    script.dataset.grconOperationalPersistence = "v2";
    document.head.appendChild(script);
  }

  installOperationalPersistence();

  // As folhas de estilo dos módulos que abrem ocultos entram no HTML com
  // media="print" para não bloquear a primeira pintura. Assim que o navegador
  // desenha a tela inicial, elas voltam a valer para todas as mídias — muito
  // antes de o operador conseguir abrir qualquer um desses módulos.
  function promoteAsyncStyles() {
    const pending = document.querySelectorAll('link[data-grcon-async-style][media="print"]');
    pending.forEach((link) => {
      link.media = "all";
      link.removeAttribute("data-grcon-async-style");
    });
  }

  function schedulePromoteAsyncStyles() {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(promoteAsyncStyles));
    else promoteAsyncStyles();
  }

  function installTconsagShortcut() {
    if (document.getElementById("app-shortcut-tconsag")) return;
    const host = document.querySelector(".runtime-status");
    if (!host) return;

    const link = document.createElement("a");
    link.id = "app-shortcut-tconsag";
    link.className = "app-shortcut-link app-shortcut-link-tconsag";
    link.href = "https://taxonomia-consag.vercel.app/";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Abrir Taxonomia Consag";
    link.setAttribute("aria-label", "Abrir Taxonomia Consag em uma nova aba");
    link.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5"></path></svg><span>TCONSAG</span>';

    const workspaceButton = document.getElementById("workspace-new-tab");
    if (workspaceButton && workspaceButton.parentElement === host) host.insertBefore(link, workspaceButton);
    else host.appendChild(link);
  }

  // Os bootstraps operacionais são independentes do motor documental. O guard
  // de análise é carregado aqui para proteger o clique antes de qualquer uso,
  // sem inserir dependência no Dashboard SIGEM × PW nem nas regras da triagem.
  function installPostingConferenceBootstrap() {
    const scripts = [
      ["analysis_runtime_guard.js", "grconAnalysisRuntimeGuard"],
      ["posting_conference_bootstrap.js", "grconPostingConferenceBootstrap"],
      ["posting_conference_refinement.js", "grconPostingConferenceRefinement"],
      ["posting_conference_state_guard.js", "grconPostingConferenceStateGuard"],
      ["grcon_operational_flow_bootstrap.js", "grconOperationalFlowBootstrap"],
    ];
    scripts.forEach(([src, marker]) => {
      if (document.querySelector(`script[data-${marker.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`)) return;
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset[marker] = "";
      document.head.appendChild(script);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      installTconsagShortcut();
      installPostingConferenceBootstrap();
      schedulePromoteAsyncStyles();
    }, { once: true });
  } else {
    installTconsagShortcut();
    installPostingConferenceBootstrap();
    schedulePromoteAsyncStyles();
  }
})();
