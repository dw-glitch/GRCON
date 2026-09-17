(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconEgrdtTeamsNotificationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DESTINATION = Object.freeze({ type: "teams-group", name: "Qualidade - Documentação" });
  const MENTIONS = Object.freeze([
    Object.freeze({ key: "adriana", displayName: "Adriana Nojosa da Silva" }),
    Object.freeze({ key: "janecleide", displayName: "Janecleide Maria de Oliveira" }),
  ]);

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function norm(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase();
  }

  function notificationId(record) {
    const base = text(record && (record.clientRecordId || record.id))
      || `${text(record && record.egrdtNumber)}|${text(record && record.generatedAt)}`;
    return `egrdt-ready:${base}`.slice(0, 240);
  }

  function documentRows(record) {
    const grouped = new Map();
    (record && Array.isArray(record.files) ? record.files : []).forEach((file) => {
      const document = text(file && file.document);
      const revision = text(file && (file.grdtRevision || file.revision)) || "—";
      const discipline = text(file && file.discipline) || "Não informada";
      if (!document) return;
      const key = `${norm(document)}|${norm(revision)}`;
      if (!grouped.has(key)) grouped.set(key, { document, revision, disciplines: [] });
      const row = grouped.get(key);
      if (!row.disciplines.some((item) => norm(item) === norm(discipline))) row.disciplines.push(discipline);
    });
    return [...grouped.values()].map((row) => ({
      document: row.document,
      revision: row.revision,
      discipline: row.disciplines.join(" / "),
    }));
  }

  function buildPayload(record, options) {
    const settings = options || {};
    const egrdtNumber = text(record && record.egrdtNumber);
    const items = documentRows(record);
    if (!egrdtNumber) throw new Error("A eGRDT não possui número registrado.");
    if (!items.length) throw new Error("A eGRDT não possui documentos registrados para montar o aviso.");
    if (settings.folderConfirmed !== true) throw new Error("Confirme que a eGRDT já foi colocada na pasta antes de avisar o grupo.");
    return {
      schemaVersion: 1,
      eventType: "EGRDT_READY_FOR_SIGEM",
      eventId: notificationId(record),
      requestedAt: new Date(settings.requestedAt || Date.now()).toISOString(),
      destination: { ...DESTINATION },
      mentions: MENTIONS.map((item) => ({ ...item })),
      egrdt: {
        number: egrdtNumber,
        generatedAt: text(record && record.generatedAt),
        outputType: text(record && record.outputType) || "eGRDT final",
        documentCount: items.length,
        items,
      },
      confirmation: {
        folderConfirmed: true,
        confirmedBy: text(settings.confirmedBy),
        confirmedByEmail: text(settings.confirmedByEmail),
      },
      source: {
        app: "GRCON",
        appVersion: text(settings.appVersion),
        workspaceId: text(settings.workspaceId),
        historyRecordId: text(record && record.id),
        clientRecordId: text(record && record.clientRecordId),
      },
      message: {
        heading: "eGRDT pronta para postagem no SIGEM",
        instruction: "A eGRDT abaixo já foi criada e colocada na pasta. Por favor, efetuem a postagem no SIGEM.",
        columns: ["EGRDT", "REVISÕES ENVIADAS NA GRDT (DOCUMENTO · REVISÃO)", "DISCIPLINAS"],
        tableHtml: `<table><thead><tr><th>EGRDT</th><th>REVISÕES ENVIADAS NA GRDT (DOCUMENTO · REVISÃO)</th><th>DISCIPLINAS</th></tr></thead><tbody>${items.map((item) => `<tr><td>${escapeHtml(egrdtNumber)}</td><td>${escapeHtml(item.document)} · Rev. ${escapeHtml(item.revision || "—")}</td><td>${escapeHtml(item.discipline || "Não informada")}</td></tr>`).join("")}</tbody></table>`,
      },
    };
  }

  function revisionLabel(item) {
    const revision = text(item && item.revision) || "—";
    return `${text(item && item.document)} · Rev. ${revision}`;
  }

  return Object.freeze({ DESTINATION, MENTIONS, notificationId, documentRows, buildPayload, revisionLabel, escapeHtml });
});
