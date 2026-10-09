/* GRCON — indicadores de alocação. Sem dependência do DOM: reutilizado pela tela e pelos testes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconAllocationDashboardCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const t = value => String(value ?? "").trim();
  const norm = value => t(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");
  const STATUS = Object.freeze({
    completed: "Concluída", fiscal1Waiting: "Fiscal 01 · Aguardando retorno",
    fiscal2Waiting: "Fiscal 02 · Aguardando retorno", fiscal1Rejected: "Fiscal 01 · Recusado",
    fiscal2Rejected: "Fiscal 02 · Recusado", rejected: "Recusada",
    alignment: "Aguardando alinhamento", ldPending: "Pendente envio de LD",
    cancelled: "Cancelada", exclusion: "Alocação de exclusão", drafting: "Em elaboração",
    other: "Outros / a confirmar"
  });
  function classify(value) {
    const s = norm(value);
    if (!s) return "other";
    if (s.includes("CANCELAD")) return "cancelled";
    if (s.includes("FISCAL 01") && (s.includes("RECUS") || s.includes("REJEIT"))) return "fiscal1Rejected";
    if (s.includes("FISCAL 02") && (s.includes("RECUS") || s.includes("REJEIT"))) return "fiscal2Rejected";
    if (s.includes("FISCAL 01") && (s.includes("AGUARDANDO") || s.includes("PENDENTE")) && s.includes("ALINHAMENTO")) return "alignment";
    if (s.includes("FISCAL 01") && (s.includes("AGUARDANDO") || s.includes("PENDENTE"))) return "fiscal1Waiting";
    if (s.includes("FISCAL 02") && (s.includes("AGUARDANDO") || s.includes("PENDENTE"))) return "fiscal2Waiting";
    if (s.includes("PENDENTE") && s.includes("LD")) return "ldPending";
    if (s.includes("RECUS") || s.includes("REJEIT")) return "rejected";
    if (s.includes("CONCLUID") || s.includes("FINALIZAD")) return "completed";
    if (s.includes("EXCLUSAO")) return "exclusion";
    if (s.includes("ELABORACAO")) return "drafting";
    if (s.includes("ALINHAMENTO")) return "alignment";
    return "other";
  }
  function fiscal(code) {
    if (code === "fiscal1Waiting" || code === "fiscal1Rejected" || code === "alignment") return "fiscal1";
    if (code === "fiscal2Waiting" || code === "fiscal2Rejected") return "fiscal2";
    return "unclassified";
  }
  function dateKey(value) {
    const s = t(value);
    if (!s) return "";
    if (/^\d{5}(?:\.\d+)?$/.test(s)) {
      const serial = Number(s);
      if (serial > 20000 && serial < 100000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
    }
    const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (br) { const date = new Date(Date.UTC(+br[3], +br[2] - 1, +br[1])); return date.getUTCDate() === +br[1] && date.getUTCMonth() === +br[2] - 1 ? date.toISOString().slice(0,10) : ""; }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return "";
  }
  function prepare(records) {
    const map = new Map();
    let duplicateLinks = 0;
    for (const record of records || []) {
      const document = t(record.document), allocation = t(record.allocation);
      if (!document) continue;
      const identity = norm(allocation) + "\u0000" + norm(document);
      const item = { ...record, document, allocation, statusCode: classify(record.allocationStatus) };
      if (map.has(identity)) {
        duplicateLinks++;
        // A última linha explícita representa o estado corrente. Nunca multiplicar o vínculo.
        if ((Number(map.get(identity).sourceRow) || 0) > (Number(item.sourceRow) || 0)) continue;
      }
      map.set(identity, item);
    }
    return { rows: [...map.values()], duplicateLinks };
  }
  function filter(rows, options = {}) {
    const search = norm(options.search), allocation = norm(options.allocation), status = t(options.status);
    const stage = t(options.stage), sheet = norm(options.sheet), action = norm(options.action);
    const start = t(options.from), end = t(options.to);
    return (rows || []).filter(row => {
      if (search && !norm(row.document + " " + row.allocation + " " + row.workflow).includes(search)) return false;
      if (allocation && !norm(row.allocation).includes(allocation)) return false;
      if (status && row.statusCode !== status) return false;
      if (stage && fiscal(row.statusCode) !== stage) return false;
      if (sheet && !norm(row.ldSheet).includes(sheet)) return false;
      if (action && !norm(row.action).includes(action)) return false;
      if (start || end) {
        const date = dateKey(row.sentAt);
        if (!date || (start && date < start) || (end && date > end)) return false;
      }
      return true;
    });
  }
  function aggregate(rows) {
    const groups = new Map();
    const statuses = {};
    const allocationsByStatus = new Map();
    for (const code of Object.keys(STATUS)) { statuses[code] = 0; allocationsByStatus.set(code, new Set()); }
    for (const row of rows || []) {
      const allocation = t(row.allocation) || "(sem alocação)";
      const key = norm(allocation);
      if (!groups.has(key)) groups.set(key, { allocation, items: [], codes: new Set(), documents: new Set(), dates: new Set() });
      const group = groups.get(key);
      group.items.push(row);
      group.codes.add(row.statusCode);
      group.documents.add(norm(row.document));
      if (dateKey(row.sentAt)) group.dates.add(dateKey(row.sentAt));
      statuses[row.statusCode] = (statuses[row.statusCode] || 0) + 1;
      allocationsByStatus.get(row.statusCode)?.add(key);
    }
    const list = [...groups.values()].map(group => {
      const counts = {};
      for (const item of group.items) counts[item.statusCode] = (counts[item.statusCode] || 0) + 1;
      const completed = counts.completed || 0;
      const situation = completed === group.items.length ? "Concluída"
        : completed > 0 ? "Parcialmente concluída"
        : group.codes.size > 1 ? "Status mistos"
        : STATUS[group.items[0]?.statusCode] || "A confirmar";
      return { ...group, counts, situation, documentsCount: group.documents.size, completed,
        pending: group.items.length - completed, lastSentAt: [...group.dates].sort().at(-1) || "" };
    }).sort((a,b) => a.allocation.localeCompare(b.allocation, "pt-BR", {numeric:true}));
    return {
      groups: list, links: (rows || []).length,
      documents: new Set((rows || []).map(row => norm(row.document))).size,
      completeAllocations: list.filter(group => group.completed === group.items.length).length,
      partialAllocations: list.filter(group => group.completed > 0 && group.completed < group.items.length).length,
      byStatus: Object.fromEntries([...allocationsByStatus].map(([k, v]) => [k, v.size])),
      linksByStatus: statuses
    };
  }
  function exportData(aggregated, context = {}) {
    const summary = [["Indicador", "Valor"], ["Contrato",t(context.contract)],
      ["Base",t(context.fileName)], ["Atualização",t(context.updatedAt)],
      ["Filtros",t(context.filters)], ["Alocações",aggregated.groups.length],
      ["Documentos distintos",aggregated.documents], ["Vínculos",aggregated.links],
      ["Integralmente concluídas",aggregated.completeAllocations],["Parcialmente concluídas",aggregated.partialAllocations]];
    for (const [key, label] of Object.entries(STATUS)) summary.push([label, aggregated.byStatus[key] || 0]);
    const allocations = [["Alocação", "Situação", "Documentos", "Vínculos", "Concluídos", "Não concluídos", "Último envio"]];
    const documents = [["Alocação", "Documento", "Status original", "Classificação", "Fiscal", "Aba LD", "Versão LD",
      "Envio", "Retorno Fiscal 01", "Resposta Fiscal 01", "Retorno Fiscal 02", "Resposta Fiscal 02",
      "Ação", "Workflow", "Observação", "Propósito", "Data prevista", "Linha de base", "Linha de origem"]];
    for (const g of aggregated.groups) {
      allocations.push([g.allocation,g.situation,g.documentsCount,g.items.length,g.completed,g.pending,g.lastSentAt]);
      for (const r of g.items) documents.push([g.allocation,r.document,t(r.allocationStatus),STATUS[r.statusCode],fiscal(r.statusCode),
        t(r.ldSheet),t(r.ldVersion),t(r.sentAt),t(r.fiscal1ReturnedAt),t(r.fiscalComment),
        t(r.fiscal2ReturnedAt),t(r.fiscal2Comment),t(r.action),t(r.workflow),
        t(r.remarks),t(r.originalPurpose),t(r.plannedAt),t(r.baselineAt),Number(r.sourceRow)||""]);
    }
    return { summary, allocations, documents };
  }
  return Object.freeze({ STATUS, norm, classify, fiscal, dateKey, prepare, filter, aggregate, exportData });
});
