(function(root) {
  "use strict";
  const Core = root.GrconRequestsControlCore;
  let snapshot = null, index = new Map(), epoch = 0, scope = "", pending = null;
  const cloud = () => root.GrconCloud;
  const workspace = () => cloud()?.state?.membership?.workspace_id || "";
  function reset() { epoch++; snapshot = null; index = new Map(); pending = null; scope = workspace(); }
  function ensureScope() { if (scope !== workspace()) reset(); }
  async function rpc(operation, input = {}, target = workspace()) {
    const response = await cloud().state.client.rpc("grcon_requests_base", { target_workspace: target, operation, input });
    if (response.error) throw response.error;
    return response.data;
  }
  function current() { ensureScope(); return snapshot; }
  async function refresh() {
    ensureScope();
    if (!workspace() || !cloud()?.state?.online) return current();
    if (pending) return pending;
    const ticket = epoch, target = workspace();
    const valid = () => ticket === epoch && target === workspace();
    pending = (async () => {
      const meta = await rpc("current", {}, target);
      if (!valid()) return null;
      if (meta?.id === snapshot?.id) return snapshot;
      const records = [];
      if (meta?.id) {
        let after = 0;
        while (records.length < meta.expected_count) {
          const page = await rpc("page", { id: meta.id, after }, target);
          if (!page?.length) throw new Error("Controle de Solicitações incompleto. Atualize novamente.");
          for (const row of page) { if (row.row_number <= after) throw new Error("Página inválida."); records.push(row.payload); after = row.row_number; }
        }
        if (records.length !== meta.expected_count) throw new Error("Contagem divergente no Controle de Solicitações.");
      }
      if (!valid()) return null;
      await root.GRCONModuleLoader.ensure("core.js");
      if (!valid()) return null;
      snapshot = meta ? { ...meta, records } : null;
      index = Core.buildIndex(records);
      root.dispatchEvent(new CustomEvent("grcon:requests-control-updated"));
      return snapshot;
    })();
    const task = pending;
    try { return await task; } finally { if (pending === task) pending = null; }
  }
  async function publish(file) {
    if (!["owner", "admin"].includes(cloud()?.state?.membership?.role)) throw new Error("Sem permissão para atualizar a base.");
    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) throw new Error("Selecione uma planilha Excel.");
    ensureScope(); const target = workspace(), ticket = epoch;
    const valid = () => { if (ticket !== epoch || target !== workspace()) throw new Error("O contrato mudou. Carregue novamente a base."); };
    await root.GRCONModuleLoader.ensure("xlsx");
    const records = Core.parseWorkbook(root.XLSX.read(await file.arrayBuffer(), { type: "array" }), root.XLSX);
    valid(); const active = await rpc("current", {}, target); valid();
    const begun = await rpc("begin", { fileName: file.name, count: records.length, expectedActive: active?.id || null }, target);
    for (let offset = 0; offset < records.length; offset += 500) {
      valid(); await rpc("chunk", { id: begun.id, first: offset + 1, rows: records.slice(offset, offset + 500) }, target);
    }
    valid(); await rpc("publish", { id: begun.id }, target);
    return refresh();
  }
  root.GrconRequestsControl = Object.freeze({ current, refresh, publish,
    find(document) { ensureScope(); return Core.find(index, document); } });
  root.addEventListener("grcon:contract-context-changed", () => { reset(); root.dispatchEvent(new CustomEvent("grcon:requests-control-updated")); void refresh().catch(error => root.GrconNotify?.(error.message,"error")); });
  root.addEventListener("grcon:cloud-ready", () => void refresh().catch(error => console.warn("Controle de Solicitações", error.message)));
})(window);
