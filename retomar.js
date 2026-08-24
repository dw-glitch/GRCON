/**
 * GRCON — limpeza da tela inicial e sincronização do resumo do Histórico.
 *
 * A antiga faixa "Retomar de onde parou" deixou de fazer parte da tela inicial.
 * Este módulo continua carregado por compatibilidade e passa a cuidar apenas de
 * duas tarefas leves:
 *   1. remover a faixa antiga, caso o HTML ainda a contenha;
 *   2. manter os indicadores do Histórico sincronizados com o filtro de família
 *      documental (Todos, ET, N-1710 ou CV).
 */
(function (root) {
  "use strict";

  let refreshTimer = 0;

  function removeResumeBand() {
    const section = document.getElementById("grcon-retomar");
    if (section) section.remove();
  }

  function historyRecordsForSelectedFamily() {
    const History = root.GrconHistory;
    if (!History) return [];

    const uiRecords = root.GrconHistoryUi?.state?.filtered;
    const source = Array.isArray(uiRecords)
      ? uiRecords
      : (typeof History.read === "function" ? History.read() : []);
    const family = String(document.getElementById("history-period-document-type")?.value || "").trim();

    return typeof History.filterByDocumentFamily === "function"
      ? History.filterByDocumentFamily(source, family)
      : [...source];
  }

  function postingForRecord(record, postings) {
    if (!record) return null;
    return (postings || []).find((item) =>
      item?.historyId === record.id
      || item?.id === record.id
      || (item?.egrdtNumber && item.egrdtNumber === record.egrdtNumber)
    ) || null;
  }

  function updateHistorySummary() {
    const summaryElement = document.getElementById("history-summary");
    const History = root.GrconHistory;
    if (!summaryElement || !History || typeof History.summary !== "function") return;

    const records = historyRecordsForSelectedFamily();
    const summary = History.summary(records);
    const Posting = root.GrconSigemPosting;
    const postings = Posting && typeof Posting.read === "function" ? Posting.read() : [];
    const postingRecords = records.map((record) => postingForRecord(record, postings));
    const postedStatus = Posting?.STATUSES?.POSTADO;
    const pendingStatus = Posting?.STATUSES?.PENDENCIA;
    const failedStatus = Posting?.STATUSES?.FALHA;

    const awaiting = postingRecords.filter((record) => !record).length;
    const posted = postingRecords.filter((record) => record?.status === postedStatus).length;
    const attention = postingRecords.filter((record) => [pendingStatus, failedStatus].includes(record?.status)).length;

    summaryElement.innerHTML = [
      ["eGRDTs localizadas", summary.egrdts],
      ["Documentos registrados", summary.documents],
      ["Alocações relacionadas", summary.allocations],
      ["Aguardando SIGEM", awaiting],
      ["Postadas", posted],
      ["Pendências/Falhas", attention],
    ].map(([label, value]) => `<div><span>${label}</span><strong>${Number(value || 0).toLocaleString("pt-BR")}</strong></div>`).join("");
  }

  function scheduleHistorySummary() {
    root.clearTimeout(refreshTimer);
    refreshTimer = root.setTimeout(updateHistorySummary, 0);
  }

  function bindHistorySummary() {
    const ids = [
      "history-search",
      "history-year",
      "history-type",
      "history-posting-status",
      "history-sort",
      "history-date-start",
      "history-date-end",
      "history-period-document-type",
    ];

    ids.forEach((id) => {
      const control = document.getElementById(id);
      if (!control) return;
      const eventName = control.tagName === "INPUT" ? "input" : "change";
      control.addEventListener(eventName, scheduleHistorySummary);
    });

    document.querySelectorAll('[data-grcon-view="history"]').forEach((button) => {
      button.addEventListener("click", scheduleHistorySummary);
    });

    ["grcon:history-updated", "grcon:sigem-updated", "grcon:cloud-ready"].forEach((eventName) => {
      root.addEventListener(eventName, scheduleHistorySummary);
    });

    scheduleHistorySummary();
  }

  function init() {
    removeResumeBand();
    bindHistorySummary();
    return true;
  }

  // Mantém a API antiga para não quebrar integrações que ainda chamem
  // GrconRetomar.render(), mas "render" agora apenas garante que a faixa antiga
  // continue ausente e atualiza os indicadores do Histórico.
  root.GrconRetomar = Object.freeze({
    init,
    render() {
      removeResumeBand();
      scheduleHistorySummary();
    },
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window);
