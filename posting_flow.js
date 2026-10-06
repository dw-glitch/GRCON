(function (root) {
  "use strict";
  const Classification = root.GrconHistoryClassification;
  const Planner = root.GrconPostingBatchPlanner;
  const KEY = "grcon.egrdt.posting-mode.v1";
  let postingMode = "mixed", filter = "all", index = Classification.buildIndex([], { complete: false });
  let loading = null, dirty = true, generation = 0, workspace = "", memo = new Map();
  try { postingMode = Planner.normalizeMode(localStorage.getItem(KEY)); } catch (_) { /* optional preference */ }
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  function scope() { return root.GrconCloud?.state?.membership?.workspace_id || ""; }
  function localRecords() { return (root.GrconHistory?.read() || []).filter(record => scope() ? record.workspaceId === scope() : !record.workspaceId); }
  function install(records, complete, source) {
    index = Classification.buildIndex(records, { complete, workspaceId: scope(), source });
    memo = new Map(); generation += 1;
  }
  function lookup(document, revision) {
    if (workspace !== scope()) { workspace = scope(); dirty = true; install(localRecords(), false, "Cópia local do Histórico"); }
    const key = JSON.stringify([Classification.documentKey(document), Classification.revisionKey(revision)]);
    if (!memo.has(key)) memo.set(key, Classification.classify(document, revision, index));
    return memo.get(key);
  }
  async function refresh(force = false) {
    if (loading) return loading;
    if (!dirty && !force && workspace === scope()) return index;
    workspace = scope();
    const expected = workspace;
    install(localRecords(), false, "Cópia local do Histórico");
    const startedGeneration = generation;
    dirty = false;
    loading = (async () => {
      await Promise.resolve();
      try {
        if (!root.GrconCloud?.loadClassificationHistory || !expected) return index;
        const records = await root.GrconCloud.loadClassificationHistory();
        if (scope() !== expected || generation !== startedGeneration) { dirty = true; return index; }
        install(records, true, "Histórico compartilhado completo");
      } catch (_) { /* Keep explicit incomplete evidence, never infer absence. */ }
      finally { loading = null; root.dispatchEvent(new CustomEvent("grcon:posting-classification-updated")); }
      return index;
    })();
    return loading;
  }
  function classifyPlan(plan) {
    for (const entry of plan.entries || []) entry.historyClassification = lookup(entry.document, entry.item?.revision || entry.revision);
    return plan;
  }
  function splitPlan(plan, limit, mode) { return Planner.split(classifyPlan(plan), limit, mode, postingMode, root.GrconEmission.splitPlan); }
  function matches(row) {
    const kind = lookup(row.document, row.revision).emissionKind;
    return filter === "all" || filter === "postings" && (kind === "FIRST_POSTING" || kind === "NEW_REVISION") || filter === "reposts" && kind === "REPOST" || filter === "unconfirmed" && !kind;
  }
  function badge(document, revision) {
    const result = lookup(document, revision);
    const previous = result.previousGrdt ? `Anterior: Rev. ${result.previousRevision || "não registrada"} · ${result.previousGrdt}` : "";
    const info = [previous, result.previousGeneratedAt, result.emissionKind === "REPOST" ? `Esta mesma revisão já foi emitida anteriormente. ${result.occurrenceCount} emissão(ões); ${result.repostCount} repostagem(ns) anterior(es).` : "", ...result.warnings].filter(Boolean);
    return `<details class="posting-history-detail"><summary class="posting-kind posting-kind-${result.emissionKind || "UNCONFIRMED"}">${esc(result.label)}</summary><div>${info.map(line => `<p>${esc(line)}</p>`).join("")}${result.firstEmission ? `<p>Primeira emissão: ${esc(result.firstEmission.grdt)} · ${esc(result.firstEmission.generatedAt)}</p>` : ""}<small>${esc(result.source)}</small></div></details>`;
  }
  function render(rows, selected) {
    const host = document.getElementById("posting-history-summary");
    if (!host) return;
    const counts = { FIRST_POSTING: 0, NEW_REVISION: 0, REPOST: 0, UNCONFIRMED: 0, warnings: 0 }, seen = new Set();
    for (const position of selected) {
      const row = rows[position]; if (!row) continue;
      const result = lookup(row.document, row.revision);
      const key = JSON.stringify([result.documentCodeNormalized, result.revisionNormalized]);
      if (seen.has(key)) continue; seen.add(key);
      counts[result.emissionKind || "UNCONFIRMED"] += 1;
      if (result.warnings.length) counts.warnings += 1;
    }
    document.getElementById("posting-history-counts").textContent = `Primeira postagem: ${counts.FIRST_POSTING} · Nova revisão: ${counts.NEW_REVISION} · Repostagem: ${counts.REPOST} · A confirmar: ${counts.UNCONFIRMED} · Atenções: ${counts.warnings} · Total selecionado: ${seen.size}`;
    document.getElementById("posting-history-source").textContent = loading ? "Consultando o Histórico compartilhado…" : index.complete ? "Fonte: Histórico compartilhado completo. Contagem por documento + revisão; formatos adicionais não são outra emissão." : "Histórico compartilhado a confirmar. Você pode continuar; a classificação ficará registrada com essa ressalva.";
    const control = document.getElementById("posting-batch-mode");
    if (control && control.value !== postingMode) control.value = postingMode;
    for (const button of host.querySelectorAll("[data-posting-filter]")) button.setAttribute("aria-pressed", String(button.dataset.postingFilter === filter));
    if (dirty && rows.length) void refresh();
  }
  root.addEventListener("grcon:history-updated", () => { dirty = true; install(localRecords(), false, "Cópia local do Histórico"); });
  root.addEventListener("grcon:cloud-state", () => { dirty = true; });
  document.addEventListener("change", event => {
    if (event.target.id !== "posting-batch-mode") return;
    postingMode = Planner.normalizeMode(event.target.value);
    try { localStorage.setItem(KEY, postingMode); } catch (_) { /* optional preference */ }
    root.GrconEgrdtBatchPlan?.setMode(root.GrconEgrdtBatchPlan.getMode());
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-posting-filter]");
    if (!button) return;
    filter = button.dataset.postingFilter;
    root.GrconTriageUiApi?.render();
  });
  root.GrconPostingFlow = Object.freeze({ lookup, refresh, classifyPlan, splitPlan, matches, badge, render,
    signature: () => `${generation}:${filter}`, getMode: () => postingMode,
    setMode(value) { postingMode = Planner.normalizeMode(value); root.GrconTriageUiApi?.render(); return postingMode; },
  });
})(window);
