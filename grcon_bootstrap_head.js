(function () {
  "use strict";
  try {
    const savedTheme = localStorage.getItem("quality-theme-grcon") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = savedTheme;
    document.documentElement.style.colorScheme = savedTheme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }

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

  // A Conferência de Postagem é um módulo independente e carregado sob demanda.
  // Só este bootstrap leve entra na inicialização; XLSX, ExcelJS, relatório e UI
  // continuam fora do caminho crítico até o operador abrir a nova área.
  function installPostingConferenceBootstrap() {
    if (document.querySelector('script[data-grcon-posting-conference-bootstrap]')) return;
    const script = document.createElement("script");
    script.src = "posting_conference_bootstrap.js";
    script.async = false;
    script.dataset.grconPostingConferenceBootstrap = "";
    document.head.appendChild(script);
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
