(function (root) {
  "use strict";
  const Core = root.GrconAllocationRegistryCore, Context = root.GrconDocumentAllocationContext;
  const state = { snapshot: null, workspace: "", user: "", loading: null, error: "", busy: false, parsed: null };
  const cloud = () => root.GrconCloud;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function ensureScope() {
    const workspace = cloud()?.state?.membership?.workspace_id || "", user = cloud()?.state?.session?.user?.id || "";
    if (workspace !== state.workspace || user !== state.user) {
      state.workspace = workspace; state.user = user; state.snapshot = null; state.parsed = null; state.error = "";
    }
    return { workspace, user };
  }
  const validScope = expected => { const current = ensureScope(); return current.workspace === expected.workspace && current.user === expected.user; };
  async function rpc(name, args) {
    const current = cloud()?.state;
    if (!current?.online || !current.client || !current.membership) throw new Error("Conecte-se para consultar a Central compartilhada.");
    const result = await current.client.rpc(`grcon_allocation_registry_${name}`, args);
    if (result.error) throw result.error;
    return result.data;
  }
  function current() { ensureScope(); return state.snapshot; }
  function emit() { render(); root.dispatchEvent(new CustomEvent("grcon:allocation-registry-updated")); }
  async function refresh() {
    const expected = ensureScope();
    if (!expected.workspace) { render(); return null; }
    if (state.loading?.workspace === expected.workspace && state.loading.user === expected.user) return state.loading.promise;
    const token = {};
    const promise = (async () => {
      await Promise.resolve();
      try {
        const response = await rpc("current", { target_workspace: expected.workspace });
        const meta = Array.isArray(response) ? response[0] : response;
        if (!validScope(expected)) return null;
        if (!meta?.snapshot_id) { state.snapshot = null; state.error = ""; emit(); return null; }
        if (state.snapshot?.id === meta.snapshot_id) { state.snapshot.stale = false; state.error = ""; render(); return state.snapshot; }
        const records = []; let after = 0;
        while (records.length < meta.record_count) {
          const page = await rpc("page", { target_workspace: expected.workspace, target_snapshot: meta.snapshot_id, after_row: after, page_size: 1000 });
          if (!validScope(expected)) return null;
          if (!Array.isArray(page) || !page.length) throw new Error("A Central compartilhada chegou incompleta.");
          for (const item of page) {
            if (!Number.isInteger(item.row_number) || item.row_number <= after) throw new Error("Página inválida da Central compartilhada.");
            records.push(Core.cleanRecord(item.payload)); after = item.row_number;
          }
          if (records.length > meta.record_count) throw new Error("Contagem divergente na Central compartilhada.");
        }
        if (!validScope(expected)) return null;
        state.snapshot = { id: meta.snapshot_id, fileName: meta.file_name, updatedAt: meta.published_at, count: records.length, index: Core.buildIndex(records), records, stale: false };
        state.error = ""; emit(); return state.snapshot;
      } catch (error) {
        if (!validScope(expected)) return null;
        if (state.snapshot) state.snapshot.stale = true;
        state.error = `Central compartilhada não confirmada: ${error.message || error}. A referência não define se o documento está alocado.`;
        render(); return state.snapshot;
      } finally { if (state.loading?.token === token) state.loading = null; }
    })();
    state.loading = { ...expected, token, promise }; return promise;
  }
  async function publish() {
    const expected = ensureScope(), parsed = state.parsed;
    if (!parsed || state.busy) return;
    if (cloud()?.state?.membership?.role !== "owner") throw new Error("Somente o proprietário pode publicar esta base.");
    state.busy = true; render(); let published = false, publishAttempted = false;
    try {
      const upload_id = await rpc("begin", { target_workspace: expected.workspace, source_file: state.fileName, expected_count: parsed.count,
        source_metadata: parsed.metadata, expected_active: current()?.id || null });
      for (let offset = 0; offset < parsed.count; offset += 500) {
        if (!validScope(expected)) throw new Error("A sessão mudou durante o envio.");
        await rpc("chunk", { target_workspace: expected.workspace, upload_id, first_row: offset + 1, rows: parsed.records.slice(offset, offset + 500) });
        $("allocation-registry-status").textContent = `Enviando ${Math.min(offset + 500, parsed.count)} de ${parsed.count} vínculos. A base anterior continua ativa.`;
      }
      if (!validScope(expected)) throw new Error("A sessão mudou durante o envio.");
      publishAttempted = true;
      await rpc("publish", { target_workspace: expected.workspace, upload_id }); published = true;
      if (!validScope(expected)) return;
      state.parsed = null; $("allocation-registry-file").value = ""; await refresh();
      root.GrconNotify?.(state.snapshot?.id === upload_id && !state.snapshot.stale ? "Central de alocação publicada para a equipe. Faça nova análise para usar a versão atual." : "Central publicada. Atualize a consulta para confirmar a versão carregada.", state.snapshot?.id === upload_id && !state.snapshot.stale ? "success" : "warning");
    } catch (error) {
      if (validScope(expected)) { state.error = `${published ? "A base foi publicada; atualize a página para carregá-la" : (publishAttempted ? "Não foi possível confirmar a publicação; atualize a consulta" : "Publicação não concluída; a base anterior foi mantida")}: ${error.message || error}`; root.GrconNotify?.(state.error, "warning"); }
    } finally { state.busy = false; render(); }
  }
  function render() {
    if (!$("allocation-registry-status")) return;
    const owner = cloud()?.state?.membership?.role === "owner";
    $("allocation-registry-file").parentElement.hidden = !owner;
    $("allocation-registry-publish").hidden = !owner;
    $("allocation-registry-publish").disabled = state.busy || !state.parsed;
    $("allocation-registry-file").disabled = state.busy;
    $("allocation-registry-owner-note").hidden = owner;
    if (!state.busy) $("allocation-registry-status").textContent = state.error || (state.snapshot ? `${state.snapshot.count.toLocaleString("pt-BR")} vínculos · ${state.snapshot.fileName} · atualizado em ${new Date(state.snapshot.updatedAt).toLocaleString("pt-BR")}.` : "Nenhuma Central compartilhada publicada. Documentos Previstos continua determinando Alocado/Não alocado.");
    const preview = $("allocation-registry-preview"); preview.hidden = !state.parsed;
    preview.innerHTML = state.parsed ? `<p>${state.parsed.count} vínculos reconhecidos · ${state.parsed.metadata.ignored} linhas ignoradas. Confira antes de publicar.</p><table><thead><tr><th>Documento</th><th>Alocação</th><th>Status da alocação</th></tr></thead><tbody>${state.parsed.records.slice(0, 8).map(item => `<tr><td>${esc(item.document)}</td><td>${esc(item.allocation)}</td><td>${esc(item.allocationStatus)}</td></tr>`).join("")}</tbody></table><small>Amostra de até 8 vínculos; a publicação inclui a base inteira.</small>` : "";
  }
  function resolve(document) { return Context.resolve(document, root.GrconPlannedDocuments?.current(), current()); }
  function badge(document) {
    const info = resolve(document);
    if (!info.centralSnapshotId) return "";
    return `<details class="allocation-registry-detail posting-history-detail"><summary>Central: ${esc(info.allocations.join(" · ") || "sem alocação vinculada")}</summary>${info.references.map(item => `<p>${esc(item.allocation || "Alocação não informada")} · ${esc(item.allocationStatus || "Status não informado")} · ${esc(item.workflow || "Workflow não informado")} · linha ${item.sourceRow}</p>`).join("")}${info.warnings.map(message => `<p>${esc(message)}</p>`).join("")}<small>${esc(info.centralFileName)} · ${esc(info.centralUpdatedAt)}</small></details>`;
  }
  root.GrconAllocationRegistry = Object.freeze({ current, refresh, publish, resolve, badge,
    signature: () => { const snapshot = current(); return `${snapshot?.id || ""}:${Boolean(snapshot?.stale)}`; },
    applyRecords: records => Context.applyRecords(records, root.GrconPlannedDocuments?.current(), current()) });
  root.addEventListener("grcon:cloud-ready", () => void refresh());
  root.addEventListener("grcon:cloud-offline", () => { if (current()) state.snapshot.stale = true; render(); });
  document.addEventListener("DOMContentLoaded", () => {
    $("allocation-registry-file")?.addEventListener("change", async event => {
      const expected = ensureScope(), parseToken = {}; state.parseToken = parseToken;
      state.parsed = null; state.error = ""; render();
      const file = event.target.files?.[0]; if (!file) { render(); return; }
      try {
        if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Selecione uma planilha Excel.");
        await root.GRCONModuleLoader.ensure("xlsx");
        const workbook = root.XLSX.read(await file.arrayBuffer(), { type: "array" });
        if (state.parseToken !== parseToken || !validScope(expected)) return;
        state.parsed = Core.parseWorkbook(workbook, root.XLSX); state.fileName = file.name; render();
      } catch (error) { if (state.parseToken === parseToken && validScope(expected)) { state.error = error.message || String(error); render(); } }
    });
    $("allocation-registry-refresh")?.addEventListener("click", () => void refresh());
    $("allocation-registry-publish")?.addEventListener("click", () => void publish().catch(error => { state.error = error.message; render(); }));
    render();
  }, { once: true });
})(window);
