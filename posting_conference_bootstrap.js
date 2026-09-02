(function (root) {
  "use strict";
  let opening = false;
  let decorateTimer = 0;
  let reconcileTimer = 0;
  let decorating = false;

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }

  function ensureCss() {
    if (document.querySelector('link[href$="posting-conference.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "posting-conference.css";
    document.head.appendChild(link);
  }

  function navSvg() {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5"></path><path d="M15.5 16.5l2 2 4-5"></path></svg>';
  }

  function installNavigation() {
    if (document.querySelector("[data-pc-open]")) return;
    const sidebar = document.querySelector(".ops-sidebar");
    const sidebarBefore = sidebar?.querySelector('[data-grcon-view="sigem"]');
    if (sidebar) {
      const button = document.createElement("button");
      button.className = "ops-nav-button";
      button.type = "button";
      button.dataset.pcOpen = "sidebar";
      button.innerHTML = `${navSvg()}<span><strong>Conferência</strong><small>Histórico × Consulta Geral</small></span><b hidden id="pc-nav-count">0</b>`;
      if (sidebarBefore) sidebar.insertBefore(button, sidebarBefore);
      else sidebar.appendChild(button);
    }

    const tabs = document.querySelector(".grcon-view-tabs");
    const tabBefore = document.getElementById("tab-sigem");
    if (tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.pcOpen = "tab";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.setAttribute("aria-controls", "posting-conference-module");
      button.innerHTML = `${navSvg()}<span><strong>Conferência de Postagem</strong><small>Histórico × Consulta Geral</small></span><b hidden id="pc-tab-count">0</b>`;
      if (tabBefore) tabs.insertBefore(button, tabBefore);
      else tabs.appendChild(button);
    }

    document.querySelectorAll("[data-pc-open]").forEach((button) => button.addEventListener("click", () => void openConference()));
  }

  function setAreaLabel(active) {
    if (!active) return;
    const subtitle = document.getElementById("brand-subtitle");
    const footer = document.getElementById("footer-view");
    if (subtitle) subtitle.textContent = "Conferência de Postagem";
    if (footer) footer.textContent = "Conferência de Postagem";
    document.title = "GRCON — Conferência de Postagem";
  }

  function deactivateConference() {
    const module = document.getElementById("posting-conference-module");
    if (module) module.hidden = true;
    document.querySelectorAll("[data-pc-open]").forEach((button) => {
      button.classList.remove("active");
      button.setAttribute("aria-selected", "false");
    });
  }

  function activateConferenceShell() {
    document.querySelectorAll("main.workspace > section").forEach((section) => { section.hidden = section.id !== "posting-conference-module"; });
    document.querySelectorAll("[data-grcon-view]").forEach((button) => {
      button.classList.remove("active");
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", "false");
      if (button.hasAttribute("aria-current")) button.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-pc-open]").forEach((button) => {
      button.classList.add("active");
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", "true");
    });
    setAreaLabel(true);
  }

  async function openConference() {
    if (opening) return;
    opening = true;
    try {
      ensureCss();
      activateConferenceShell();
      if (!root.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
      await root.GRCONModuleLoader.ensure("posting_conference_core.js");
      await root.GRCONModuleLoader.ensure("xlsx");
      await root.GRCONModuleLoader.ensure("excel");
      await root.GRCONModuleLoader.ensure("posting_conference_report.js");
      await root.GRCONModuleLoader.ensure("posting_conference_app.js");
      activateConferenceShell();
      await root.GrconPostingConferenceUi?.activate?.();
    } catch (error) {
      console.error(error);
      deactivateConference();
      notify(error.message || "Não foi possível abrir a Conferência de Postagem.", "error");
    } finally {
      opening = false;
    }
  }

  function aggregateClass(status) {
    return ({ CONFIRMADO: "confirmed", PENDENTE: "pending", REVISAR: "review", NAO_VERIFICADO: "" })[status] || "";
  }

  function aggregateLabel(item) {
    if (!item) return "Conf. SIGEM · Não verificado";
    if (item.status === "CONFIRMADO") return `Conf. SIGEM · ${item.confirmed}/${item.total} confirmado(s)`;
    if (item.status === "REVISAR") return `Conf. SIGEM · revisar · ${item.divergent + item.review} alerta(s)`;
    if (item.status === "PENDENTE") return `Conf. SIGEM · ${item.confirmed}/${item.total} · ${item.awaiting + item.notFound} pendente(s)`;
    return "Conf. SIGEM · Não verificado";
  }

  function decorateHistoryNow() {
    const Conference = root.GrconPostingConference;
    const History = root.GrconHistory;
    if (!Conference || !History || decorating) return;
    decorating = true;
    try {
      const records = History.read?.() || [];
      const byRecordId = new Map(records.map((record) => [record.id, record]));
      let attention = 0;

      document.querySelectorAll("#history-list [data-history-id]").forEach((button) => {
        const record = byRecordId.get(button.dataset.historyId);
        const aggregate = record ? Conference.historyAggregate(record) : null;
        let badge = button.querySelector("[data-pc-history-badge]");
        if (!badge) {
          badge = document.createElement("span");
          badge.dataset.pcHistoryBadge = "";
          (button.querySelector(".history-record-main") || button).appendChild(badge);
        }
        const className = `pc-history-badge ${aggregateClass(aggregate?.status)}`.trim();
        const label = aggregateLabel(aggregate);
        if (badge.className !== className) badge.className = className;
        if (badge.textContent !== label) badge.textContent = label;
        if (aggregate && aggregate.status !== "CONFIRMADO" && aggregate.status !== "NAO_VERIFICADO") attention += 1;
      });

      const active = document.querySelector("#history-list [data-history-id].active");
      const detail = document.getElementById("history-detail");
      const existingSummary = detail?.querySelector("[data-pc-history-summary]") || null;
      if (active && detail) {
        const record = byRecordId.get(active.dataset.historyId);
        const aggregate = record ? Conference.historyAggregate(record) : null;
        if (aggregate) {
          const html = `<span><strong>Conf. SIGEM:</strong> ${aggregateLabel(aggregate).replace("Conf. SIGEM · ", "")}</span><span><strong>${aggregate.confirmed}</strong> confirmado(s)</span><span><strong>${aggregate.awaiting}</strong> aguardando</span><span><strong>${aggregate.divergent}</strong> divergência(s)</span><span><strong>${aggregate.notFound}</strong> não encontrado(s)</span>`;
          let summary = existingSummary;
          if (!summary) {
            summary = document.createElement("div");
            summary.className = "pc-history-summary";
            summary.dataset.pcHistorySummary = "";
            const header = detail.querySelector(":scope > header");
            if (header) header.after(summary); else detail.prepend(summary);
          }
          if (summary.innerHTML !== html) summary.innerHTML = html;
        } else if (existingSummary) existingSummary.remove();
      } else if (existingSummary) existingSummary.remove();

      const navCount = document.getElementById("pc-nav-count");
      const tabCount = document.getElementById("pc-tab-count");
      [navCount, tabCount].filter(Boolean).forEach((node) => {
        if (node.textContent !== String(attention)) node.textContent = String(attention);
        node.hidden = attention === 0;
      });
    } finally {
      setTimeout(() => { decorating = false; }, 0);
    }
  }

  function queueDecorateHistory() {
    if (decorating) return;
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(decorateHistoryNow, 40);
  }

  async function reconcileAfterHistoryChange(reason) {
    const Conference = root.GrconPostingConference;
    const History = root.GrconHistory;
    if (!Conference || !History || root.GrconPostingConferenceUi?.state?.ready) return;
    try {
      const result = await Conference.reconcilePersisted(History.read?.() || [], { reason });
      root.dispatchEvent(new CustomEvent("grcon:conference-updated", { detail: { summary: result.summary, changes: result.changes, baseMeta: result.baseMeta } }));
    } catch (error) {
      console.debug("[PostingConference] reconciliação automática:", error);
    }
  }

  function queueReconcile(reason) {
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => void reconcileAfterHistoryChange(reason), 250);
  }

  function installObservers() {
    document.addEventListener("click", (event) => {
      const standard = event.target.closest?.("[data-grcon-view]");
      if (standard) deactivateConference();
    }, true);

    const historyList = document.getElementById("history-list");
    const historyDetail = document.getElementById("history-detail");
    const observer = new MutationObserver(queueDecorateHistory);
    if (historyList) observer.observe(historyList, { childList: true, subtree: true });
    if (historyDetail) observer.observe(historyDetail, { childList: true, subtree: true });

    root.addEventListener("grcon:conference-updated", queueDecorateHistory);
    root.addEventListener("grcon:history-updated", () => { queueDecorateHistory(); queueReconcile("history-event"); });
    root.addEventListener("storage", (event) => {
      if (event.key === root.GrconHistory?.STORAGE_KEY) queueReconcile("history-storage");
      if (event.key === root.GrconPostingConference?.HISTORY_INDEX_KEY) queueDecorateHistory();
    });
  }

  async function init() {
    ensureCss();
    installNavigation();
    installObservers();
    try {
      await root.GRCONModuleLoader?.ensure?.("posting_conference_core.js");
      queueDecorateHistory();
    } catch (error) {
      console.debug("[PostingConference] núcleo adiado:", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else void init();
})(window);
