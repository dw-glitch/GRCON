(function (root) {
  "use strict";
  let opening = false;
  let reconcileTimer = 0;
  let decorating = false;
  let decorateQueued = false;
  let projectionRefreshPromise = null;
  let historyProjection = null;

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setClass(node, value) {
    if (node && node.className !== value) node.className = value;
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

  async function ensureConferenceRuntime() {
    if (!root.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await root.GRCONModuleLoader.ensure("posting_conference_core.js");
    await root.GRCONModuleLoader.ensure("posting_conference_refinement.js");
    await root.GRCONModuleLoader.ensure("posting_conference_history_projection.js");
  }

  async function openConference() {
    if (opening) return;
    opening = true;
    try {
      ensureCss();
      activateConferenceShell();
      await ensureConferenceRuntime();
      await root.GRCONModuleLoader.ensure("xlsx");
      await root.GRCONModuleLoader.ensure("excel");
      await root.GRCONModuleLoader.ensure("posting_conference_report.js");
      await root.GRCONModuleLoader.ensure("posting_conference_app.js");
      activateConferenceShell();
      await root.GrconPostingConferenceUi?.activate?.();
      captureProjectionFromUi();
      queueDecorateHistory();
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
    if (item.status === "CONFIRMADO") return `Conf. SIGEM · ${item.confirmed}/${item.total} postado(s)`;
    if (item.status === "REVISAR") return `Conf. SIGEM · revisar · ${item.divergent + item.review} alerta(s)`;
    if (item.status === "PENDENTE") return `Conf. SIGEM · ${item.confirmed}/${item.total} · ${item.awaiting + item.notFound} não postado(s) ainda`;
    return "Conf. SIGEM · Não verificado";
  }

  function conferenceRowLabel(row) {
    const Conference = root.GrconPostingConference;
    const Refinement = root.GrconPostingConferenceRefinement;
    if (!row || !Conference) return "Não verificado";
    if (row.conferenceLabel) return row.conferenceLabel;
    if (Refinement?.conferenceLabel) return Refinement.conferenceLabel(row.status, Conference);
    return row.statusLabel || Conference.statusLabel?.(row.status) || "Não verificado";
  }

  function conferenceStatusClass(status) {
    return ({
      CONFIRMADO: "confirmed",
      AGUARDANDO: "awaiting",
      REVISAO_DIVERGENTE: "divergent",
      NAO_ENCONTRADO: "missing",
      REQUER_ANALISE: "review",
      NAO_VERIFICADO: "neutral",
    })[status] || "neutral";
  }

  function captureProjection(result, baseMeta) {
    const Projection = root.GrconPostingConferenceHistoryProjection;
    const Conference = root.GrconPostingConference;
    if (!Projection || !Conference) return false;
    historyProjection = Projection.build(result?.rows || [], baseMeta || result?.baseMeta || null, Conference);
    return true;
  }

  function captureProjectionFromUi() {
    const ui = root.GrconPostingConferenceUi;
    if (!ui?.state?.result) return false;
    return captureProjection(ui.state.result, ui.state.base?.meta || null);
  }

  async function refreshHistoryProjection(reason) {
    if (projectionRefreshPromise) return projectionRefreshPromise;
    projectionRefreshPromise = (async () => {
      await ensureConferenceRuntime();
      if (captureProjectionFromUi()) return historyProjection;
      const Conference = root.GrconPostingConference;
      const History = root.GrconHistory;
      const Refinement = root.GrconPostingConferenceRefinement;
      if (!Conference || !History) return null;
      const result = await Conference.reconcilePersisted(History.read?.() || [], { reason });
      const base = await Conference.loadBase();
      const prepared = Refinement?.enrichResult
        ? Refinement.enrichResult(result, base?.records || [], Conference)
        : result;
      captureProjection(prepared, base?.meta || result.baseMeta || null);
      return historyProjection;
    })().catch((error) => {
      console.debug("[PostingConference] projeção para o Histórico:", error);
      return null;
    }).finally(() => {
      projectionRefreshPromise = null;
      queueDecorateHistory();
    });
    return projectionRefreshPromise;
  }

  function rowsForRecord(record) {
    const Projection = root.GrconPostingConferenceHistoryProjection;
    const Conference = root.GrconPostingConference;
    return Projection && Conference && historyProjection
      ? Projection.rowsForRecord(historyProjection, record, Conference)
      : [];
  }

  function sigemSummary(record) {
    const Projection = root.GrconPostingConferenceHistoryProjection;
    const Conference = root.GrconPostingConference;
    return Projection && Conference
      ? Projection.statusSummary(historyProjection, record, Conference)
      : { label: "—", title: "Consulta Geral não carregada", values: [], baseLoaded: false };
  }

  function rowForFile(record, file) {
    const Projection = root.GrconPostingConferenceHistoryProjection;
    const Conference = root.GrconPostingConference;
    const History = root.GrconHistory;
    return Projection && Conference
      ? Projection.rowForFile(historyProjection, record, file, Conference, History)
      : null;
  }

  function sigemValue(row) {
    const Projection = root.GrconPostingConferenceHistoryProjection;
    return Projection?.sigemStatus?.(row) || "";
  }

  function ensureHistorySigemBadge(button, record) {
    const summary = sigemSummary(record);
    let badge = button.querySelector("[data-pc-history-sigem]");
    if (!badge) {
      badge = document.createElement("span");
      badge.dataset.pcHistorySigem = "";
      badge.className = "pc-sigem-status";
      (button.querySelector(".history-record-main") || button).appendChild(badge);
    }
    setText(badge, `Status SIGEM · ${summary.label}`);
    const title = summary.title ? `Status SIGEM atual: ${summary.title}` : "Status SIGEM atual: —";
    if (badge.title !== title) badge.title = title;
  }

  function ensureDetailProjection(detail, record) {
    if (!detail || !record) return;
    const table = detail.querySelector(".history-detail-table table");
    if (!table) return;
    const headRow = table.querySelector("thead tr");
    if (!headRow) return;
    const headings = [...headRow.children];
    const revisionHeading = headings.find((heading) => /Revisão gerada na GRDT/i.test(heading.textContent || ""));
    if (!revisionHeading) return;

    let conferenceHeading = headRow.querySelector("[data-pc-history-conference-heading]");
    if (!conferenceHeading) {
      conferenceHeading = document.createElement("th");
      conferenceHeading.dataset.pcHistoryConferenceHeading = "";
      revisionHeading.insertAdjacentElement("afterend", conferenceHeading);
    }
    setText(conferenceHeading, "Conferência atual");

    let sigemHeading = headRow.querySelector("[data-pc-history-sigem-heading]");
    if (!sigemHeading) {
      sigemHeading = document.createElement("th");
      sigemHeading.dataset.pcHistorySigemHeading = "";
      conferenceHeading.insertAdjacentElement("afterend", sigemHeading);
    }
    setText(sigemHeading, "Status SIGEM atual");

    const revisionIndex = [...headRow.children].indexOf(revisionHeading);
    [...table.querySelectorAll("tbody tr")].forEach((tr, index) => {
      const file = record.files?.[index];
      const row = file ? rowForFile(record, file) : null;
      const anchor = tr.children[revisionIndex];
      if (!anchor) return;

      let conferenceCell = tr.querySelector("[data-pc-history-conference-cell]");
      if (!conferenceCell) {
        conferenceCell = document.createElement("td");
        conferenceCell.dataset.pcHistoryConferenceCell = "";
        anchor.insertAdjacentElement("afterend", conferenceCell);
      }
      let chip = conferenceCell.querySelector(".pc-status");
      if (!chip) {
        chip = document.createElement("span");
        conferenceCell.appendChild(chip);
      }
      setClass(chip, `pc-status ${conferenceStatusClass(row?.status)}`);
      setText(chip, conferenceRowLabel(row));

      let sigemCell = tr.querySelector("[data-pc-history-sigem-cell]");
      if (!sigemCell) {
        sigemCell = document.createElement("td");
        sigemCell.dataset.pcHistorySigemCell = "";
        conferenceCell.insertAdjacentElement("afterend", sigemCell);
      }
      let sigem = sigemCell.querySelector(".pc-sigem-status");
      if (!sigem) {
        sigem = document.createElement("span");
        sigem.className = "pc-sigem-status";
        sigemCell.appendChild(sigem);
      }
      setText(sigem, sigemValue(row) || "—");
    });
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
        setClass(badge, className);
        setText(badge, label);
        if (record) ensureHistorySigemBadge(button, record);
        if (aggregate && aggregate.status !== "CONFIRMADO" && aggregate.status !== "NAO_VERIFICADO") attention += 1;
      });

      const active = document.querySelector("#history-list [data-history-id].active");
      const detail = document.getElementById("history-detail");
      const existingSummary = detail?.querySelector("[data-pc-history-summary]") || null;
      if (active && detail) {
        const record = byRecordId.get(active.dataset.historyId);
        const aggregate = record ? Conference.historyAggregate(record) : null;
        if (aggregate && record) {
          const status = sigemSummary(record);
          const html = `<span><strong>Conf. SIGEM:</strong> ${escapeHtml(aggregateLabel(aggregate).replace("Conf. SIGEM · ", ""))}</span><span><strong>Status SIGEM:</strong> ${escapeHtml(status.label)}</span><span><strong>${aggregate.confirmed}</strong> postado(s)</span><span><strong>${aggregate.awaiting}</strong> não postado(s) ainda</span><span><strong>${aggregate.divergent}</strong> divergência(s)</span><span><strong>${aggregate.notFound}</strong> não encontrado(s)</span>`;
          let summary = existingSummary;
          if (!summary) {
            summary = document.createElement("div");
            summary.className = "pc-history-summary";
            summary.dataset.pcHistorySummary = "";
            const header = detail.querySelector(":scope > header");
            if (header) header.after(summary); else detail.prepend(summary);
          }
          if (summary.innerHTML !== html) summary.innerHTML = html;
          ensureDetailProjection(detail, record);
        } else if (existingSummary) existingSummary.remove();
      } else if (existingSummary) existingSummary.remove();

      const navCount = document.getElementById("pc-nav-count");
      const tabCount = document.getElementById("pc-tab-count");
      [navCount, tabCount].filter(Boolean).forEach((node) => {
        setText(node, String(attention));
        node.hidden = attention === 0;
      });
    } finally {
      decorating = false;
    }
  }

  function queueDecorateHistory() {
    if (decorating || decorateQueued) return;
    decorateQueued = true;
    const run = () => {
      decorateQueued = false;
      decorateHistoryNow();
    };
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
  }

  function isConferenceDecoration(node) {
    if (!(node instanceof Element)) return false;
    const selector = "[data-pc-history-badge],[data-pc-history-summary],[data-pc-history-sigem],[data-pc-history-conference-heading],[data-pc-history-sigem-heading],[data-pc-history-conference-cell],[data-pc-history-sigem-cell]";
    return node.matches(selector) || Boolean(node.closest(selector));
  }

  function mutationOnlyConferenceDecorations(mutation) {
    if (isConferenceDecoration(mutation.target)) return true;
    const changed = [...mutation.addedNodes, ...mutation.removedNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
    return changed.length > 0 && changed.every((node) => isConferenceDecoration(node));
  }

  async function reconcileAfterHistoryChange(reason) {
    const Conference = root.GrconPostingConference;
    const History = root.GrconHistory;
    if (!Conference || !History || root.GrconPostingConferenceUi?.state?.ready) {
      captureProjectionFromUi();
      queueDecorateHistory();
      return;
    }
    try {
      const result = await Conference.reconcilePersisted(History.read?.() || [], { reason });
      const base = await Conference.loadBase();
      const prepared = root.GrconPostingConferenceRefinement?.enrichResult
        ? root.GrconPostingConferenceRefinement.enrichResult(result, base?.records || [], Conference)
        : result;
      captureProjection(prepared, base?.meta || result.baseMeta || null);
      root.dispatchEvent(new CustomEvent("grcon:conference-updated", { detail: { summary: prepared.summary, changes: prepared.changes, baseMeta: base?.meta || result.baseMeta } }));
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
      if (!standard) return;
      deactivateConference();
      if (standard.dataset.grconView === "history") void refreshHistoryProjection("history-open");
    }, true);

    const historyList = document.getElementById("history-list");
    const historyDetail = document.getElementById("history-detail");
    const observer = new MutationObserver((mutations) => {
      if (mutations.length && mutations.every(mutationOnlyConferenceDecorations)) return;
      queueDecorateHistory();
    });
    if (historyList) observer.observe(historyList, { childList: true, subtree: true });
    if (historyDetail) observer.observe(historyDetail, { childList: true, subtree: true });

    root.addEventListener("grcon:conference-updated", () => {
      captureProjectionFromUi();
      queueDecorateHistory();
    });
    root.addEventListener("grcon:history-updated", () => { queueDecorateHistory(); queueReconcile("history-event"); });
    root.addEventListener("grcon:sigem-updated", queueDecorateHistory);
    root.addEventListener("grcon:module-ready", (event) => {
      if (event.detail?.module === "history") void refreshHistoryProjection("history-module-ready");
    });
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
      await ensureConferenceRuntime();
      queueDecorateHistory();
    } catch (error) {
      console.debug("[PostingConference] núcleo adiado:", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else void init();
})(window);
