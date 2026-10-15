/* Imports and dashboard calculations use the same domain parsers as the UI. */
importScripts("../grcon_contracts.js", "../discipline_resolver.js", "../xlsx.full.min.js", "../core.js", "../allocation_registry_core.js", "../planned_documents_core.js", "../requests_control_core.js", "../consultation_index.js", "../allocation_dashboard_core.js", "../data_exports.js");
const models = new Map();
const progress = (taskId, message, done, total) => self.postMessage({ type: "progress", taskId, message, done, total });


async function process(action, payload, taskId) {
  if (action === "allocation-index") return GrconAllocationRegistryCore.buildIndex(payload.records);
  if (action === "consultation-index") { progress(taskId,"Organizando índice de documentos…"); return GrconConsultationIndex.buildIndex(payload.lds,payload.plannedSnapshot,payload.control); }
  if (action === "central-export") return GrconDataExports.central(payload, detail=>progress(taskId,detail.message,detail.done,detail.total));
  if (action === "import") {
    progress(taskId, "Lendo a estrutura da planilha…");
    const workbook = XLSX.read(payload.buffer, { type: "array", dense: payload.kind === "planned" });
    progress(taskId, "Validando cabeçalhos e registros…");
    if (payload.kind === "allocation") return GrconAllocationRegistryCore.parseWorkbook(workbook, XLSX);
    if (payload.kind === "planned") return GrconPlannedDocumentsCore.parseWorkbook(workbook);
    if (payload.kind === "requests") return GrconRequestsControlCore.parseWorkbook(workbook, XLSX);
    throw new Error("Tipo de base desconhecido.");
  }
  if (action === "allocation-prepare") {
    progress(taskId, "Preparando indicadores de alocação…");
    const prepared = GrconAllocationDashboardCore.prepare(payload.records);
    const full = GrconAllocationDashboardCore.aggregate(prepared.rows);
    models.set(payload.key, { prepared, full });
    // One version per scoped dashboard, not a cache of all imported bases.
    for (const key of models.keys()) if (key !== payload.key) models.delete(key);
    return { prepared, full };
  }
  if (action === "allocation-filter") {
    const model = models.get(payload.key);
    if (!model) throw new Error("Atualize a base do dashboard para aplicar os filtros.");
    progress(taskId, "Aplicando filtros…");
    return GrconAllocationDashboardCore.aggregate(GrconAllocationDashboardCore.filter(model.prepared.rows, payload.options));
  }
  if (action === "allocation-export") return GrconDataExports.allocation(payload, detail=>progress(taskId,detail.message,detail.done,detail.total));
  if (action === "xlsx") return GrconDataExports.sheets(payload, detail=>progress(taskId,detail.message,detail.done,detail.total));
  throw new Error("Operação de dados desconhecida.");
}
self.onmessage = async event => {
  const { taskId, action, payload = {} } = event.data || {};
  try {
    const result = await process(action, payload, taskId);
    self.postMessage({ taskId, type: "done", result }, result instanceof ArrayBuffer ? [result] : []);
  } catch (error) { self.postMessage({ taskId, type: "error", error: error.message || String(error) }); }
};
