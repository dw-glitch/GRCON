(function () {
  "use strict";

  const Posting = window.GrconSigemPosting;
  const Flow = window.GrconMacro5Flow;
  const APP_VERSION = "5.32.10";
  if (!Posting) return;
  const $ = (selector, root) => (root || document).querySelector(selector);
  const escapeHtml = (value) => Posting.text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const state = {
    records: [], filtered: [], selectedId: "", query: "", status: "all",
    ldFile: null, ldUpdateBusy: false, grdtValidationBusy: false, autoRunLdAfterSelect: false, ldTargetRecordId: "",
  };
  const els = {
    module: $("#sigem-module"),
    search: $("#sigem-search"), status: $("#sigem-status-filter"), count: $("#sigem-result-count"),
    summary: $("#sigem-summary"), list: $("#sigem-list"), empty: $("#sigem-empty"), detail: $("#sigem-detail"),
    basePath: $("#sigem-base-path"), defaultResponsible: $("#sigem-default-responsible"), savePreferences: $("#sigem-save-preferences"),
    clear: $("#sigem-clear"), tabCount: $("#sigem-tab-count"), sidebarCount: $("#ops-sigem-count"),
    ldUpdateFile: $("#sigem-ld-update-file"), ldUpdateFileMeta: $("#sigem-ld-update-file-meta"),
    ldUpdateScope: $("#sigem-ld-update-scope"), ldUpdateRun: $("#sigem-ld-update-run"),
    ldUpdateCount: $("#sigem-ld-update-count"), ldUpdateStatus: $("#sigem-ld-update-status"),
  };

  function notify(message, kind) {
    if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind || "info");
    else if (kind === "error") window.alert(message);
  }

  function formatDate(value, withTime) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }

  function statusTone(status) {
    return Flow?.postingTone?.(status) || ({ GERADO: "neutral", VALIDADO: "info", PRONTO: "warning", POSTADO: "success", PENDENCIA: "warning", FALHA: "danger", CANCELADO: "neutral" })[status] || "neutral";
  }

  function toLocalInput(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function toLocalDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function syncFromHistory() {
    try {
      const history = window.GrconHistory?.read?.() || [];
      if (history.length) Posting.registerGenerated(history, { appVersion: APP_VERSION });
    } catch (error) {
      console.warn("GRCON: não foi possível sincronizar o histórico com a fila SIGEM", error);
    }
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function copyText(value, label) {
    const text = Posting.text(value);
    if (!text) { notify(`${label || "Valor"} não informado.`, "error"); return; }
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      notify(`${label || "Valor"} copiado.`, "success");
    } catch (_) { console.debug("[SigemPostingApp] context:", _); notify(`Não foi possível copiar ${String(label || "o valor").toLowerCase()}.`, "error"); }
  }

  function filePath(record) { return record.folderPath ? Posting.joinPath(record.folderPath, record.egrdtFileName) : record.egrdtFileName; }

  function refresh() {
    state.records = Posting.read();
    const query = Posting.norm(state.query);
    state.filtered = state.records.filter((record) => {
      if (state.status !== "all" && record.status !== state.status) return false;
      if (!query) return true;
      const haystack = Posting.norm([record.egrdtNumber, record.packageName, record.folderPath, record.status, record.responsible, record.protocol, ...(record.files || []).flatMap((file) => [file.document, file.finalName, file.databook])].join(" "));
      return haystack.includes(query);
    });
    if (!state.filtered.some((record) => record.id === state.selectedId)) state.selectedId = state.filtered[0] && state.filtered[0].id || "";
    const prefs = Posting.readPreferences();
    if (els.basePath && document.activeElement !== els.basePath) els.basePath.value = prefs.basePath;
    if (els.defaultResponsible && document.activeElement !== els.defaultResponsible) els.defaultResponsible.value = prefs.responsible;
    if (els.count) els.count.textContent = `${state.filtered.length.toLocaleString("pt-BR")} registro(s)`;
    [els.tabCount, els.sidebarCount].filter(Boolean).forEach((badge) => {
      const pending = state.records.filter((record) => ![Posting.STATUSES.POSTADO, Posting.STATUSES.CANCELADO].includes(record.status)).length;
      badge.textContent = String(pending);
      badge.hidden = pending === 0;
    });
  }

  function postedRecordsForLd() {
    const allPosted = state.records.filter((record) => record.status === Posting.STATUSES.POSTADO && record.resultAt && (record.postingGrdtNumber || record.egrdtNumber));
    const scope = els.ldUpdateScope?.value || "pending";
    if (scope === "all") return allPosted;
    if (scope === "selected") return allPosted.filter((record) => record.id === state.selectedId);
    return allPosted.filter((record) => !record.ldUpdate?.appliedAt);
  }

  function selectedLdFile() {
    return state.ldFile || window.GrconRuntimeFiles?.currentLd?.() || null;
  }

  function renderLdUpdate() {
    const records = postedRecordsForLd();
    const documents = records.reduce((total, record) => total + (record.files || []).length, 0);
    const current = selectedLdFile();
    if (els.ldUpdateCount) els.ldUpdateCount.textContent = records.length
      ? `${records.length} eGRDT(s) · ${documents.toLocaleString("pt-BR")} documento(s)`
      : "Nenhuma postagem pendente";
    if (els.ldUpdateFileMeta) els.ldUpdateFileMeta.textContent = current
      ? `Arquivo selecionado: ${current.name}`
      : "A LD carregada na análise será usada quando disponível.";
    if (els.ldUpdateRun) {
      els.ldUpdateRun.disabled = state.ldUpdateBusy || !records.length;
      els.ldUpdateRun.textContent = state.ldUpdateBusy ? "Atualizando…" : "Gerar LD atualizada";
    }
  }

  function renderSummary() {
    const summary = Posting.summary(state.records);
    els.summary.innerHTML = `
      <div><span>Total</span><strong>${summary.total.toLocaleString("pt-BR")}</strong></div>
      <div><span>Validados</span><strong>${summary.validated.toLocaleString("pt-BR")}</strong></div>
      <div><span>Prontos</span><strong>${summary.ready.toLocaleString("pt-BR")}</strong></div>
      <div><span>Postados</span><strong>${summary.posted.toLocaleString("pt-BR")}</strong></div>
      <div><span>Pendências/Falhas</span><strong>${(summary.pending + summary.failed).toLocaleString("pt-BR")}</strong></div>
      <div><span>Cancelados</span><strong>${Number(summary.cancelled || 0).toLocaleString("pt-BR")}</strong></div>`;
  }

  function renderList() {
    els.list.innerHTML = state.filtered.map((record) => {
      const audit = Posting.audit(record, state.records);
      return `<button class="sigem-record ${record.id === state.selectedId ? "active" : ""}" data-sigem-id="${escapeHtml(record.id)}" type="button">
        <div class="sigem-record-heading"><strong>${escapeHtml(record.egrdtNumber)}</strong><span class="sigem-status ${statusTone(record.status)}">${escapeHtml(Posting.statusLabel(record.status))}</span></div>
        <span>${formatDate(record.generatedAt, true)} · ${record.files.length} arquivo(s)</span>
        <small>${audit.ready ? "Auditoria aprovada" : `${audit.errors.length} bloqueio(s) · ${audit.warnings.length} aviso(s)`}</small>
      </button>`;
    }).join("");
    els.empty.hidden = state.filtered.length > 0;
  }

  function checkIcon(severity) { return severity === "ok" ? "✓" : severity === "warning" ? "!" : "×"; }

  function renderAudit(audit) {
    return `<section class="sigem-audit-card">
      <header><div><span>CONFERÊNCIA PRÉ-POSTAGEM</span><strong>${audit.ready ? "Pacote aprovado" : "Pacote com bloqueios"}</strong></div><span class="sigem-audit-result ${audit.ready ? "success" : "danger"}">${audit.errors.length} erro(s) · ${audit.warnings.length} aviso(s)</span></header>
      <div class="sigem-checklist">${audit.checks.map((check) => `<div class="sigem-check ${check.severity}"><b>${checkIcon(check.severity)}</b><div><strong>${escapeHtml(check.label)}</strong><span>${escapeHtml(check.message)}</span></div></div>`).join("")}</div>
    </section>`;
  }

  function renderCorrection(record, audit) {
    const validation = record.grdtValidation;
    const recoveryAudit = Posting.ldRecoveryAudit(record, state.records);
    const busy = state.grdtValidationBusy;
    const validatedText = validation
      ? `Revalidada em ${formatDate(validation.validatedAt, true)} · ${validation.rowCount} documento(s) · ${validation.changedFields} campo(s) atualizado(s).`
      : "Selecione a eGRDT depois de corrigir o erro indicado pelo SIGEM.";
    const nameWarning = validation && !validation.fileNameMatched
      ? `<small class="sigem-correction-warning">O nome local do arquivo era diferente; o vínculo foi confirmado por Documento + Revisão.</small>`
      : "";
    const canFastUpdate = Boolean(validation && recoveryAudit.ready && record.status !== Posting.STATUSES.POSTADO);
    const responsible = record.responsible || Posting.readPreferences().responsible;
    return `<section class="sigem-correction-card">
      <header><div><span>CORREÇÃO APÓS RETORNO DO SIGEM</span><strong>Reabrir a eGRDT corrigida</strong></div><small>O erro anterior permanece no histórico, mas deixa de bloquear quando a correção é comprovada.</small></header>
      <div class="sigem-correction-file">
        <input accept=".xls" hidden id="sigem-corrected-grdt-input" type="file"/>
        <button class="secondary-button compact" data-sigem-action="choose-corrected-grdt" ${busy ? "disabled" : ""} type="button">${busy ? "Conferindo…" : "Selecionar eGRDT corrigida"}</button>
        <span>${escapeHtml(validatedText)}</span>
      </div>
      ${nameWarning}
      <form class="sigem-fast-ld-form" id="sigem-fast-ld-form">
        <div class="sigem-fast-ld-grid">
          <label><span>Data efetiva para a LD</span><input id="sigem-fast-effective-date" type="date" value="${escapeHtml(toLocalDate(record.status === Posting.STATUSES.POSTADO ? record.resultAt : ""))}" ${canFastUpdate ? "" : "disabled"}/></label>
          <label><span>Número da GRDT para a LD</span><input id="sigem-fast-grdt-number" value="${escapeHtml(record.postingGrdtNumber || record.egrdtNumber)}" ${canFastUpdate ? "" : "disabled"}/></label>
          <label><span>Responsável pela confirmação</span><input id="sigem-fast-responsible" value="${escapeHtml(responsible)}" placeholder="Nome ou identificação" ${canFastUpdate ? "" : "disabled"}/></label>
        </div>
        <label class="sigem-check-field"><input id="sigem-fast-confirm" type="checkbox" ${canFastUpdate ? "" : "disabled"}/><span>Confirmo que esta eGRDT corrigida já foi aceita pelo SIGEM e que a data e o número acima devem ser gravados na LD.</span></label>
        <div class="sigem-fast-ld-actions"><small>${validation ? (recoveryAudit.ready ? (audit.ready ? "A conferência está aprovada. O atalho registra a postagem e gera a cópia atualizada da LD." : "A eGRDT está segura para a LD. Pendências antigas de pasta/ZIP não bloqueiam esta recuperação pós-postagem.") : `Ainda existem ${recoveryAudit.errors.length} bloqueio(s) que afetam a atualização da LD.`) : "Revalide a eGRDT antes de usar este atalho."}</small><button class="primary-button" ${canFastUpdate ? "" : "disabled"} type="submit">Confirmar e gerar LD</button></div>
      </form>
    </section>`;
  }

  function duplicateBlock(record, audit) {
    if (!audit.duplicates.length) return "";
    const rows = audit.duplicates.slice(0, 12).map((item) => `<li><strong>${escapeHtml(item.document)}</strong> · Rev. ${escapeHtml(item.revision)} · ${escapeHtml(item.previousEgrdt)}${item.protocol ? ` · Protocolo ${escapeHtml(item.protocol)}` : ""}</li>`).join("");
    return `<section class="sigem-repost-card"><header><span>REPOSTAGEM EXCEPCIONAL</span><strong>${audit.duplicates.length} ocorrência(s) anterior(es)</strong></header><ul>${rows}</ul>
      <label class="sigem-check-field"><input id="sigem-repost-authorized" type="checkbox" ${record.repostAuthorized ? "checked" : ""}/><span>Autorizo a repostagem excepcional após conferir o histórico.</span></label>
      <label><span>Justificativa obrigatória</span><textarea id="sigem-repost-justification" placeholder="Explique por que a mesma revisão precisa ser postada novamente.">${escapeHtml(record.repostJustification)}</textarea></label>
      <button class="secondary-button compact" data-sigem-action="save-repost" type="button">Salvar autorização</button>
    </section>`;
  }

  // Outras eGRDTs no histórico que já incluíram este documento, sem contar
  // a própria eGRDT deste registro (senão o documento sempre "encontraria"
  // a si mesmo, já que este registro também é um item do histórico).
  function previousEgrdtText(document, currentEgrdtNumber) {
    const Indicator = window.GrconGrdtHistoryIndicator;
    if (!Indicator || typeof Indicator.getEntries !== "function") return "";
    const entries = Indicator.getEntries(document).filter((entry) => entry.egrdtNumber !== currentEgrdtNumber);
    if (!entries.length) return "";
    return entries.map((entry) => `${entry.egrdtNumber}${entry.generatedAt ? ` (${formatDate(entry.generatedAt)})` : ""}`).join(" | ");
  }

  function renderFiles(record) {
    return `<details class="sigem-files-card"><summary><span>Documentos do lote</span><strong>${record.files.length} arquivo(s)</strong></summary><div class="sigem-files-table"><table><thead><tr><th>Documento</th><th>Revisão</th><th>Arquivo final</th><th>Caminho Databook</th><th>Alocação</th><th>eGRDT(s) anterior(es)</th></tr></thead><tbody>${record.files.map((file) => `<tr><td>${escapeHtml(file.document || "—")}</td><td>${escapeHtml(file.revision || "—")}</td><td>${escapeHtml(file.finalName || "—")}</td><td>${escapeHtml(file.databook || "—")}</td><td>${escapeHtml(file.allocation || file.allocationStatus || "—")}</td><td>${escapeHtml(previousEgrdtText(file.document, record.egrdtNumber) || "—")}</td></tr>`).join("")}</tbody></table></div></details>`;
  }

  function renderStatusHistory(record) {
    return `<details class="sigem-history-card"><summary><span>Linha do tempo da postagem</span><strong>${record.statusHistory.length} evento(s)</strong></summary><ol>${[...record.statusHistory].reverse().map((event) => `<li><b>${escapeHtml(Posting.statusLabel(event.status))}</b><span>${formatDate(event.at, true)}${event.responsible ? ` · ${escapeHtml(event.responsible)}` : ""}${event.protocol ? ` · Protocolo ${escapeHtml(event.protocol)}` : ""}</span>${event.message ? `<small>${escapeHtml(event.message)}</small>` : ""}</li>`).join("")}</ol></details>`;
  }

  function renderWorkflow(record, audit) {
    const steps = Flow?.workflowSteps?.(record.status, audit.ready) || [];
    return `<nav class="posting-flow" aria-label="Etapas da postagem">${steps.map((step, index) => `<div class="posting-flow-step ${step.complete ? "complete" : ""} ${step.current ? "current" : ""}" data-step="${index + 1}"><strong>${escapeHtml(step.label)}</strong></div>`).join("")}</nav>`;
  }

  function renderDetail() {
    const record = state.records.find((item) => item.id === state.selectedId);
    if (!record) {
      els.detail.innerHTML = '<div class="sigem-detail-empty"><strong>Selecione uma eGRDT</strong><span>A conferência, o registro da postagem e a atualização da LD aparecerão aqui.</span></div>';
      return;
    }
    const audit = Posting.audit(record, state.records);
    const resultStatus = [Posting.STATUSES.POSTADO, Posting.STATUSES.PENDENCIA, Posting.STATUSES.FALHA, Posting.STATUSES.CANCELADO].includes(record.status) ? record.status : Posting.STATUSES.POSTADO;
    const posted = record.status === Posting.STATUSES.POSTADO;
    const responsible = record.responsible || Posting.readPreferences().responsible;
    const postingNumber = record.postingGrdtNumber || record.egrdtNumber;
    const postingDate = toLocalDate(record.resultAt);
    els.detail.innerHTML = `
      <header class="sigem-detail-header"><div><span>CONTROLE MANUAL</span><h3>${escapeHtml(record.egrdtNumber)}</h3><p>${formatDate(record.generatedAt, true)} · ${escapeHtml(record.outputType || "Saída GRCON")}</p></div><span class="sigem-status large ${statusTone(record.status)}">${escapeHtml(Posting.statusLabel(record.status))}</span></header>
      ${renderWorkflow(record, audit)}
      <section class="sigem-fields-card">
        <header><div><span>DADOS PARA PREENCHER NO SIGEM</span><strong>Copie os três campos abaixo</strong></div><small>A postagem continua sendo feita manualmente na interface do SIGEM.</small></header>
        <form id="sigem-path-form" class="sigem-path-form">
          <label><span>1. Pasta da GRDT</span><div class="sigem-copy-field"><input id="sigem-folder-path" value="${escapeHtml(record.folderPath)}" placeholder="Ex.: R:\...\${escapeHtml(record.folderName)}"/><button class="secondary-button compact" data-copy-value="folder" type="button">Copiar</button></div></label>
          <label><span>2. Nome da GRDT</span><div class="sigem-copy-field"><input readonly value="${escapeHtml(record.egrdtNumber)}"/><button class="secondary-button compact" data-copy-value="number" type="button">Copiar</button></div></label>
          <label><span>3. Arquivo da GRDT</span><div class="sigem-copy-field"><input readonly value="${escapeHtml(filePath(record))}"/><button class="secondary-button compact" data-copy-value="file" type="button">Copiar</button></div></label>
          <div class="sigem-path-actions"><span>ZIP de origem: <strong>${escapeHtml(record.packageName || "não registrado")}</strong></span><button class="secondary-button compact" type="submit">Salvar caminho</button></div>
        </form>
      </section>
      ${renderAudit(audit)}
      ${renderCorrection(record, audit)}
      ${duplicateBlock(record, audit)}
      <section class="sigem-manual-flow-card ${audit.ready ? "ready" : "blocked"}">
        <div><span>ETAPA 1 · VERIFICAÇÃO</span><strong>${audit.ready ? "Conferência aprovada" : "Corrija os bloqueios antes de marcar como postado"}</strong><small>${audit.ready ? "Depois de concluir a postagem no SIGEM, registre abaixo o número realmente usado e a data." : `${audit.errors.length} bloqueio(s) impedem a confirmação da postagem.`}</small></div>
        <button class="secondary-button compact" data-sigem-action="proof" type="button">Baixar comprovante da conferência</button>
      </section>
      <form class="sigem-result-card" id="sigem-result-form">
        <header><div><span>ETAPA 2 · CONFIRMAÇÃO</span><strong>${posted ? "Postagem registrada" : "Marcar a eGRDT como postada"}</strong></div><small>Nenhum arquivo é enviado automaticamente pelo GRCON.</small></header>
        <div class="sigem-result-grid">
          <label><span>Resultado</span><select id="sigem-result-status"><option value="POSTADO" ${resultStatus === "POSTADO" ? "selected" : ""}>Postado com sucesso</option><option value="PENDENCIA" ${resultStatus === "PENDENCIA" ? "selected" : ""}>Postagem com pendência</option><option value="FALHA" ${resultStatus === "FALHA" ? "selected" : ""}>Falha na postagem</option><option value="CANCELADO" ${resultStatus === "CANCELADO" ? "selected" : ""}>Postagem cancelada</option></select></label>
          <label><span>Número da GRDT postada</span><input id="sigem-posting-grdt-number" value="${escapeHtml(postingNumber)}" placeholder="0130870-C1O-PGV-G-0000-2026 - eGRDT"/></label>
          <label><span>Data da postagem</span><input id="sigem-posting-date" type="date" value="${escapeHtml(postingDate)}"/></label>
          <label><span>Responsável pela confirmação</span><input id="sigem-responsible" value="${escapeHtml(responsible)}" placeholder="Nome ou identificação"/></label>
          <label><span>Protocolo/retorno</span><input id="sigem-protocol" value="${escapeHtml(record.protocol)}" placeholder="Opcional"/></label>
        </div>
        <details class="sigem-posting-notes"><summary>Mensagem e observações da postagem</summary>
          <label><span>Mensagem exibida pelo SIGEM</span><textarea id="sigem-message" placeholder="Cole a confirmação ou o erro apresentado.">${escapeHtml(record.sigemMessage)}</textarea></label>
          <label><span>Observações</span><textarea id="sigem-notes" placeholder="Registre qualquer conferência ou ação necessária.">${escapeHtml(record.notes)}</textarea></label>
        </details>
        <label class="sigem-check-field"><input id="sigem-result-confirm" type="checkbox"/><span>Confirmo que conferi esta eGRDT no SIGEM, os documentos pertencem a este lote e o número e a data informados estão corretos.</span></label>
        <div class="sigem-result-actions"><button class="primary-button" type="submit">${posted ? "Atualizar registro da postagem" : "Marcar como postado"}</button>${posted ? '<button class="secondary-button" data-sigem-action="update-ld" type="button">Atualizar LD desta eGRDT</button>' : ''}</div>
      </form>
      ${posted ? `<section class="sigem-ld-ready-card"><span>ETAPA 3 · LD</span><strong>Pronto para preencher a LD</strong><small>Será gravado <b>${escapeHtml(postingNumber)}</b> com a data <b>${escapeHtml(postingDate ? postingDate.split("-").reverse().join("/") : "não informada")}</b> somente nas linhas seguras dos documentos desta eGRDT.</small></section>` : ""}
      ${renderFiles(record)}
      ${renderStatusHistory(record)}`;
  }

  function render() { refresh(); renderSummary(); renderLdUpdate(); renderList(); renderDetail(); }
  function select(id) { state.selectedId = id; renderList(); renderDetail(); }

  function savePreferences() {
    const result = Posting.savePreferences({ basePath: els.basePath.value, responsible: els.defaultResponsible.value });
    if (!result.saved) { notify(result.error, "error"); return; }
    Posting.applyBasePath(result.preferences.basePath);
    notify("Preferências de postagem salvas e aplicadas aos registros automáticos.", "success");
    render();
  }

  function selectedRecord() { return state.records.find((record) => record.id === state.selectedId); }

  function savePath(event) {
    event.preventDefault();
    const record = selectedRecord();
    if (!record) return;
    const value = Posting.normalizePath($("#sigem-folder-path", els.detail).value);
    const result = Posting.update(record.id, { folderPath: value, pathMode: "manual" });
    if (!result.updated) { notify(result.error, "error"); return; }
    notify("Caminho da pasta salvo.", "success");
    render();
  }

  function saveRepost() {
    const record = selectedRecord();
    if (!record) return;
    const authorized = Boolean($("#sigem-repost-authorized", els.detail)?.checked);
    const justification = Posting.text($("#sigem-repost-justification", els.detail)?.value);
    if (authorized && justification.length < 10) { notify("Informe uma justificativa de repostagem com pelo menos 10 caracteres.", "error"); return; }
    const result = Posting.update(record.id, { repostAuthorized: authorized, repostJustification: justification });
    if (!result.updated) { notify(result.error, "error"); return; }
    notify("Autorização de repostagem atualizada.", "success");
    render();
  }

  function downloadProof() {
    const record = selectedRecord();
    if (!record) return;
    downloadBlob(new Blob([Posting.proofText(record, state.records)], { type: "text/plain;charset=utf-8" }), `REGISTRO_SIGEM_${record.egrdtNumber.replace(/\s-\seGRDT$/i, "")}.txt`);
  }

  function markReady() {
    const record = selectedRecord();
    if (!record) return;
    const result = Posting.transition(record.id, Posting.STATUSES.PRONTO, { responsible: record.responsible });
    if (!result.updated) { notify(result.error, "error"); return; }
    notify("eGRDT marcada como pronta para preenchimento no SIGEM.", "success");
    render();
  }

  async function revalidateCorrectedGrdt(file) {
    const record = selectedRecord();
    if (!record || !file) return;
    if (!/\.xls$/i.test(file.name)) { notify("Selecione a eGRDT corrigida no formato .xls.", "error"); return; }
    if (!window.GrdtWorkbook?.inspect) { notify("O leitor da eGRDT não foi carregado. Reabra o módulo Postagem SIGEM.", "error"); return; }
    state.grdtValidationBusy = true;
    renderDetail();
    try {
      const inspection = await window.GrdtWorkbook.inspect(await file.arrayBuffer());
      const result = Posting.revalidateCorrectedGrdt(record.id, inspection.rows, {
        sourceFile: file.name,
        rowCount: inspection.checkedRows,
      });
      if (!result.updated) throw new Error(result.errors?.length ? result.errors.join("\n") : result.error);
      const suffix = result.warnings?.length ? ` ${result.warnings[0]}` : "";
      notify(`eGRDT corrigida revalidada: ${result.changedFields} campo(s) atualizado(s).${suffix}`, result.warnings?.length ? "warn" : "success");
      window.dispatchEvent(new CustomEvent("grcon:sigem-updated", { detail: { record: result.record, revalidated: true } }));
    } catch (error) {
      console.error("GRCON: falha ao revalidar a eGRDT corrigida", error);
      notify(error && error.message || "Não foi possível revalidar a eGRDT corrigida.", "error");
    } finally {
      state.grdtValidationBusy = false;
      render();
    }
  }

  async function fastUpdateLd(event) {
    event.preventDefault();
    const record = selectedRecord();
    if (!record?.grdtValidation) { notify("Primeiro selecione e revalide a eGRDT corrigida.", "error"); return; }
    const currentAudit = Posting.ldRecoveryAudit(record, state.records);
    if (!currentAudit.ready) { notify(`A correção foi lida, mas ainda existem ${currentAudit.errors.length} bloqueio(s).`, "error"); return; }
    if (!$("#sigem-fast-confirm", els.detail)?.checked) { notify("Confirme que a eGRDT corrigida já foi aceita pelo SIGEM.", "error"); return; }
    const dateValue = Posting.text($("#sigem-fast-effective-date", els.detail)?.value);
    const grdtNumber = Posting.text($("#sigem-fast-grdt-number", els.detail)?.value);
    const responsible = Posting.text($("#sigem-fast-responsible", els.detail)?.value);
    if (!dateValue) { notify("Informe a data efetiva que será gravada na LD.", "error"); return; }
    if (!/^0130870-C1O-PGV-G-\d{4}-\d{4}\s-\seGRDT$/i.test(grdtNumber)) { notify("Confira o número da GRDT. Ele não segue o padrão oficial.", "error"); return; }
    if (!responsible) { notify("Informe o responsável pela confirmação.", "error"); return; }
    const resultAt = new Date(`${dateValue}T12:00:00`).toISOString();
    const result = Posting.confirmCorrectedPosting(record.id, {
      responsible,
      postingGrdtNumber: grdtNumber,
      resultAt,
      sigemMessage: "eGRDT corrigida já aceita pelo SIGEM; postagem confirmada para atualização da LD.",
      notes: `Atalho de correção: data efetiva ${dateValue}; GRDT ${grdtNumber}.`,
    });
    if (!result.updated) { notify(result.error, "error"); return; }
    Posting.savePreferences({ responsible });
    notify("Postagem confirmada. Preparando a LD com a data e o número informados.", "success");
    render();
    if (selectedLdFile()) await generateUpdatedLd([result.record]);
    else {
      state.autoRunLdAfterSelect = true;
      state.ldTargetRecordId = result.record && result.record.id || record.id;
      notify("Agora selecione a LD. A cópia atualizada será gerada em seguida.", "info");
      els.ldUpdateFile?.click();
    }
  }

  async function generateUpdatedLd(recordsOverride) {
    const Writer = window.GrconLdPostingWriter;
    const records = Array.isArray(recordsOverride) && recordsOverride.length ? recordsOverride : postedRecordsForLd();
    const file = selectedLdFile();
    if (!records.length) { notify("Nenhuma postagem concluída está pendente de atualização.", "warn"); return; }
    if (!file) { notify("Selecione a LD que será atualizada.", "error"); els.ldUpdateFile?.click(); return; }
    if (!Writer) { notify("Não foi possível preparar a atualização da LD. Recarregue a página.", "error"); return; }
    state.ldUpdateBusy = true;
    if (els.ldUpdateStatus) els.ldUpdateStatus.textContent = "Conferindo os documentos e preparando uma cópia da LD…";
    renderLdUpdate();
    try {
      const result = await Writer.apply(file, records, { XLSX: window.XLSX, JSZip: window.JSZip });
      if (!result.buffer) {
        const detail = result.skipped.length ? ` ${result.skipped.length} documento(s) precisam de conferência.` : "";
        throw new Error(`Nenhuma linha segura foi encontrada para atualizar.${detail}`);
      }
      downloadBlob(new Blob([result.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), result.fileName);
      Posting.markLdUpdated(result.recordsApplied, {
        appliedAt: new Date().toISOString(), sourceFile: result.sourceName, outputFile: result.fileName,
        updatedDocuments: result.documentsUpdated + result.alreadyCorrect, skippedDocuments: result.skipped.length,
      });
      const updated = result.documentsUpdated + result.alreadyCorrect;
      const skippedPreview = result.skipped.slice(0, 3).map((item) => `${item.document || "Documento"}: ${item.reason}`).join(" | ");
      const message = `LD atualizada com ${updated.toLocaleString("pt-BR")} documento(s).${result.skipped.length ? ` ${result.skipped.length.toLocaleString("pt-BR")} ficaram para conferência.` : ""}`;
      if (els.ldUpdateStatus) els.ldUpdateStatus.textContent = `${message} Arquivo gerado: ${result.fileName}${skippedPreview ? ` · ${skippedPreview}` : ""}`;
      notify(message, result.skipped.length ? "warn" : "success");
      window.dispatchEvent(new CustomEvent("grcon:ld-posting-updated", { detail: result }));
    } catch (error) {
      console.error("GRCON: falha ao atualizar a LD após as postagens", error);
      const message = error && error.message ? error.message : "Não foi possível gerar a LD atualizada.";
      if (els.ldUpdateStatus) els.ldUpdateStatus.textContent = message;
      notify(message, "error");
    } finally {
      state.ldUpdateBusy = false;
      render();
    }
  }

  function saveResult(event) {
    event.preventDefault();
    const record = selectedRecord();
    if (!record) return;
    const confirmed = Boolean($("#sigem-result-confirm", els.detail)?.checked);
    if (!confirmed) { notify("Confirme que você conferiu esta eGRDT e os dados informados.", "error"); return; }
    const status = $("#sigem-result-status", els.detail).value;
    const responsible = Posting.text($("#sigem-responsible", els.detail).value);
    const postingGrdtNumber = Posting.text($("#sigem-posting-grdt-number", els.detail).value);
    const postingDate = Posting.text($("#sigem-posting-date", els.detail).value);
    if (!responsible) { notify("Informe o responsável pela confirmação.", "error"); return; }
    if (status === Posting.STATUSES.POSTADO) {
      if (!/^0130870-C1O-PGV-G-\d{4}-\d{4}\s-\seGRDT$/i.test(postingGrdtNumber)) { notify("Confira o número da GRDT postada. Ele não segue o padrão oficial.", "error"); return; }
      if (!postingDate) { notify("Informe a data em que a GRDT foi postada.", "error"); return; }
    }
    const resultAt = status === Posting.STATUSES.POSTADO
      ? new Date(`${postingDate}T12:00:00`).toISOString()
      : new Date().toISOString();
    const details = {
      responsible,
      postingGrdtNumber,
      protocol: $("#sigem-protocol", els.detail).value,
      sigemMessage: $("#sigem-message", els.detail)?.value || "",
      notes: $("#sigem-notes", els.detail)?.value || "",
      resultAt,
    };
    const result = Posting.transition(record.id, status, details);
    if (!result.updated) { notify(result.error, "error"); return; }
    Posting.savePreferences({ responsible });
    notify(status === Posting.STATUSES.POSTADO ? "Postagem confirmada. Esta eGRDT já pode ser aplicada à LD." : `Resultado salvo: ${Posting.statusLabel(status)}.`, status === Posting.STATUSES.POSTADO ? "success" : status === Posting.STATUSES.FALHA ? "error" : "warn");
    window.dispatchEvent(new CustomEvent("grcon:sigem-updated", { detail: { record: result.record } }));
    render();
  }

  async function updateSelectedLd(record) {
    if (!record || record.status !== Posting.STATUSES.POSTADO || !record.resultAt) { notify("Primeiro marque esta eGRDT como postada.", "error"); return; }
    if (selectedLdFile()) {
      await generateUpdatedLd([record]);
      return;
    }
    state.autoRunLdAfterSelect = true;
    state.ldTargetRecordId = record.id;
    notify("Selecione a LD que será atualizada. A cópia será gerada após a conferência das linhas.", "info");
    els.ldUpdateFile?.click();
  }

  els.search?.addEventListener("input", () => { state.query = els.search.value; render(); });
  els.status?.addEventListener("change", () => { state.status = els.status.value; render(); });
  els.savePreferences?.addEventListener("click", savePreferences);
  els.clear?.addEventListener("click", () => {
    if (!state.records.length || !window.confirm("Limpar todos os registros locais de postagem SIGEM? O histórico de eGRDTs não será apagado.")) return;
    if (Posting.clear()) { state.selectedId = ""; render(); notify("Registros de postagem limpos.", "success"); }
  });
  els.ldUpdateFile?.addEventListener("change", () => {
    state.ldFile = els.ldUpdateFile.files && els.ldUpdateFile.files[0] || null;
    renderLdUpdate();
    if (state.autoRunLdAfterSelect && state.ldFile) {
      state.autoRunLdAfterSelect = false;
      const target = state.records.find((record) => record.id === state.ldTargetRecordId);
      state.ldTargetRecordId = "";
      generateUpdatedLd(target ? [target] : undefined);
    }
  });
  els.ldUpdateScope?.addEventListener("change", renderLdUpdate);
  els.ldUpdateRun?.addEventListener("click", generateUpdatedLd);
  els.list?.addEventListener("click", (event) => { const button = event.target.closest("[data-sigem-id]"); if (button) select(button.dataset.sigemId); });
  els.detail?.addEventListener("submit", (event) => {
    if (event.target.id === "sigem-path-form") savePath(event);
    if (event.target.id === "sigem-result-form") saveResult(event);
    if (event.target.id === "sigem-fast-ld-form") fastUpdateLd(event);
  });
  els.detail?.addEventListener("change", (event) => {
    if (event.target.id === "sigem-corrected-grdt-input") {
      const file = event.target.files && event.target.files[0];
      if (file) revalidateCorrectedGrdt(file);
    }
  });
  els.detail?.addEventListener("click", (event) => {
    const record = selectedRecord();
    if (!record) return;
    const copy = event.target.closest("[data-copy-value]")?.dataset.copyValue;
    if (copy === "folder") copyText(record.folderPath, "Caminho da pasta");
    if (copy === "number") copyText(record.egrdtNumber, "Nome da GRDT");
    if (copy === "file") copyText(filePath(record), "Caminho do arquivo GRDT");
    const action = event.target.closest("[data-sigem-action]")?.dataset.sigemAction;
    if (action === "proof") downloadProof();
    if (action === "save-repost") saveRepost();
    if (action === "update-ld") updateSelectedLd(record);
    if (action === "choose-corrected-grdt") {
      const input = $("#sigem-corrected-grdt-input", els.detail);
      if (input) { input.value = ""; input.click(); }
    }
  });
  window.addEventListener("grcon:sigem-updated", render);
  window.addEventListener("grcon:history-updated", () => window.setTimeout(() => { syncFromHistory(); render(); }, 0));
  window.addEventListener("storage", (event) => { if ([Posting.STORAGE_KEY, Posting.PREFERENCES_KEY].includes(event.key)) render(); });

  window.GrconSigemUi = Object.freeze({ render, state, select });
  syncFromHistory();
  render();
})();
