(function (root) {
  "use strict";

  const Core = root.GrconPdfMergeCore;
  const module = document.getElementById("pdf-tools-module");
  if (!Core || !module) return;

  const $ = (selector) => module.querySelector(selector);
  const state = {
    items: [],
    busy: false,
    worker: null,
    rejectJob: null,
    draggedId: "",
    dragDepth: 0,
    result: null,
  };
  const els = {
    drop: $("#pdf-merge-drop"),
    input: $("#pdf-merge-input"),
    add: $("#pdf-merge-add"),
    clear: $("#pdf-merge-clear"),
    list: $("#pdf-merge-list"),
    empty: $("#pdf-merge-empty"),
    count: $("#pdf-merge-count"),
    size: $("#pdf-merge-size"),
    outputName: $("#pdf-merge-output-name"),
    merge: $("#pdf-merge-run"),
    cancel: $("#pdf-merge-cancel"),
    progress: $("#pdf-merge-progress"),
    progressFill: $("#pdf-merge-progress-fill"),
    progressText: $("#pdf-merge-progress-text"),
    result: $("#pdf-merge-result"),
    resultName: $("#pdf-merge-result-name"),
    resultMeta: $("#pdf-merge-result-meta"),
    download: $("#pdf-merge-download"),
    privacy: $("#pdf-merge-privacy"),
  };

  function escapeHtml(value) {
    return Core.text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") root.alert(message);
  }

  function itemId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    return `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function revokeResult() {
    if (state.result && state.result.url) URL.revokeObjectURL(state.result.url);
    state.result = null;
  }

  function invalidateResult() {
    revokeResult();
    renderResult();
  }

  function renderResult() {
    const result = state.result;
    els.result.hidden = !result;
    if (!result) return;
    els.resultName.textContent = result.name;
    els.resultMeta.textContent = `${result.pageCount.toLocaleString("pt-BR")} página(s) · ${Core.formatBytes(result.outputBytes)} · ${result.fileCount.toLocaleString("pt-BR")} PDF(s)`;
  }

  function renderList() {
    const summary = Core.summarize(state.items);
    els.count.textContent = summary.count.toLocaleString("pt-BR");
    els.size.textContent = Core.formatBytes(summary.bytes);
    els.empty.hidden = Boolean(summary.count);
    els.list.hidden = !summary.count;
    els.list.innerHTML = state.items.map((item, index) => `
      <li class="pdf-merge-item" data-pdf-id="${escapeHtml(item.id)}" draggable="${state.busy ? "false" : "true"}">
        <button class="pdf-merge-grip" type="button" data-pdf-action="drag" aria-label="Arrastar ${escapeHtml(item.name)} para mudar a ordem" title="Arraste para mudar a ordem">⋮⋮</button>
        <span class="pdf-merge-order" aria-label="Posição ${index + 1}">${index + 1}</span>
        <span class="pdf-merge-file-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM15 3v4h4"></path><path d="M8 16h8M8 12h5"></path></svg></span>
        <span class="pdf-merge-file-copy"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><small>${Core.formatBytes(item.size)}</small></span>
        <span class="pdf-merge-item-actions">
          <button type="button" data-pdf-action="up" ${index === 0 || state.busy ? "disabled" : ""} aria-label="Subir ${escapeHtml(item.name)}">↑</button>
          <button type="button" data-pdf-action="down" ${index === state.items.length - 1 || state.busy ? "disabled" : ""} aria-label="Descer ${escapeHtml(item.name)}">↓</button>
          <button class="danger" type="button" data-pdf-action="remove" ${state.busy ? "disabled" : ""} aria-label="Remover ${escapeHtml(item.name)}">Remover</button>
        </span>
      </li>
    `).join("");
  }

  function renderBusy() {
    const enough = state.items.length >= 2;
    els.drop.classList.toggle("is-disabled", state.busy);
    els.input.disabled = state.busy;
    els.add.disabled = state.busy;
    els.clear.disabled = state.busy || !state.items.length;
    els.outputName.disabled = state.busy;
    els.merge.disabled = state.busy || !enough;
    els.merge.hidden = state.busy;
    els.cancel.hidden = !state.busy;
    els.progress.hidden = !state.busy;
    els.privacy.textContent = state.busy
      ? "Processando localmente. Não feche esta aba até o PDF ficar pronto."
      : "Processamento 100% local: nenhum PDF é enviado, armazenado ou registrado no banco.";
  }

  function render() {
    renderList();
    renderBusy();
    renderResult();
  }

  function addFiles(fileList) {
    if (state.busy) return;
    const files = Array.from(fileList || []);
    const existing = new Set(state.items.map((item) => item.signature));
    const accepted = [];
    let invalid = 0;
    let duplicated = 0;
    files.forEach((file) => {
      if (!Core.isPdfFile(file)) {
        invalid += 1;
        return;
      }
      const signature = Core.fileSignature(file);
      if (existing.has(signature)) {
        duplicated += 1;
        return;
      }
      existing.add(signature);
      accepted.push({ id: itemId(), file, name: file.name, size: file.size, signature });
    });
    if (accepted.length) {
      invalidateResult();
      state.items.push(...accepted);
      render();
      notify(`${accepted.length.toLocaleString("pt-BR")} PDF(s) adicionado(s). Confira a ordem antes de combinar.`, "success");
    }
    if (invalid) notify(`${invalid.toLocaleString("pt-BR")} arquivo(s) ignorado(s): selecione somente PDFs válidos e não vazios.`, "warn");
    if (duplicated) notify(`${duplicated.toLocaleString("pt-BR")} PDF(s) idêntico(s) já estavam na lista e não foram duplicados.`, "warn");
    els.input.value = "";
  }

  function moveItem(id, delta) {
    if (state.busy) return;
    const from = state.items.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= state.items.length) return;
    invalidateResult();
    state.items = Core.reorder(state.items, from, to);
    render();
    root.setTimeout(() => {
      const row = Array.from(els.list.querySelectorAll("[data-pdf-id]")).find((candidate) => candidate.dataset.pdfId === id);
      row?.querySelector(`[data-pdf-action="${delta < 0 ? "up" : "down"}"]`)?.focus();
    }, 0);
  }

  function removeItem(id) {
    if (state.busy) return;
    const before = state.items.length;
    state.items = state.items.filter((item) => item.id !== id);
    if (state.items.length === before) return;
    invalidateResult();
    render();
  }

  function setProgress(percent, message) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    els.progressFill.style.width = `${value}%`;
    els.progressFill.parentElement.setAttribute("aria-valuenow", String(Math.round(value)));
    els.progressText.textContent = message;
  }

  function progressMessage(message) {
    const total = Math.max(1, Number(message.total) || state.items.length || 1);
    if (message.stage === "reading") {
      setProgress((Number(message.index) / total) * 85, `Lendo ${message.name} (${Number(message.index) + 1} de ${total})…`);
    } else if (message.stage === "copied") {
      setProgress(((Number(message.index) + 1) / total) * 85, `${Number(message.pageCount).toLocaleString("pt-BR")} página(s) combinada(s)…`);
    } else if (message.stage === "saving") {
      setProgress(94, `Finalizando ${Number(message.pageCount).toLocaleString("pt-BR")} página(s)…`);
    }
  }

  function workerJob(files, outputName) {
    return new Promise((resolve, reject) => {
      const jobId = itemId();
      const worker = new Worker("workers/pdf-merge.worker.js");
      state.worker = worker;
      state.rejectJob = reject;
      worker.addEventListener("message", (event) => {
        const message = event.data || {};
        if (message.jobId !== jobId) return;
        if (message.type === "progress") progressMessage(message);
        if (message.type === "done") resolve(message);
        if (message.type === "error") {
          const error = new Error(message.message || "Não foi possível combinar os PDFs.");
          error.code = message.code || "MERGE_FAILED";
          reject(error);
        }
      });
      worker.addEventListener("error", () => reject(new Error("O navegador interrompeu o processamento dos PDFs.")), { once: true });
      worker.postMessage({
        type: "merge",
        jobId,
        title: outputName.replace(/\.pdf$/i, ""),
        files: files.map((item) => ({ name: item.name, file: item.file })),
      });
    });
  }

  function triggerDownload() {
    if (!state.result) return;
    const name = Core.outputFileName(els.outputName.value || state.result.name);
    els.outputName.value = name;
    state.result.name = name;
    const anchor = document.createElement("a");
    anchor.href = state.result.url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    renderResult();
  }

  async function combine() {
    if (state.busy) return;
    if (state.items.length < 2) {
      notify("Selecione pelo menos dois PDFs para combinar.", "warn");
      return;
    }
    if (typeof Worker !== "function") {
      notify("Este navegador não oferece o processamento necessário. Atualize o Chrome ou Edge e tente novamente.", "error");
      return;
    }

    invalidateResult();
    const outputName = Core.outputFileName(els.outputName.value);
    els.outputName.value = outputName;
    state.busy = true;
    setProgress(1, "Preparando os PDFs…");
    render();
    try {
      const response = await workerJob([...state.items], outputName);
      setProgress(100, "PDF combinado com sucesso.");
      const blob = new Blob([response.buffer], { type: "application/pdf" });
      state.result = {
        blob,
        url: URL.createObjectURL(blob),
        name: outputName,
        pageCount: Number(response.pageCount) || 0,
        fileCount: Number(response.fileCount) || state.items.length,
        outputBytes: Number(response.outputBytes) || blob.size,
      };
      notify(`PDF combinado: ${state.result.pageCount.toLocaleString("pt-BR")} página(s) em um único arquivo.`, "success");
      triggerDownload();
    } catch (error) {
      if (error && error.code !== "CANCELLED") notify(error.message || "Não foi possível combinar os PDFs.", "error");
    } finally {
      if (state.worker) state.worker.terminate();
      state.worker = null;
      state.rejectJob = null;
      state.busy = false;
      render();
    }
  }

  function cancel() {
    if (!state.busy) return;
    if (state.worker) {
      try { state.worker.postMessage({ type: "cancel" }); } catch (_) { /* o encerramento abaixo é suficiente */ }
      state.worker.terminate();
      state.worker = null;
    }
    const error = new Error("Processamento cancelado.");
    error.code = "CANCELLED";
    if (state.rejectJob) state.rejectJob(error);
    state.rejectJob = null;
    notify("Combinação cancelada. Nenhum arquivo foi salvo.", "info");
  }

  function clearAll() {
    if (state.busy || !state.items.length) return;
    state.items = [];
    revokeResult();
    els.input.value = "";
    els.outputName.value = "PDF_Combinado.pdf";
    render();
  }

  els.drop.addEventListener("click", () => { if (!state.busy) els.input.click(); });
  els.drop.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !state.busy) { event.preventDefault(); els.input.click(); }
  });
  els.drop.addEventListener("dragenter", (event) => { event.preventDefault(); state.dragDepth += 1; if (!state.busy) els.drop.classList.add("is-dragging"); });
  els.drop.addEventListener("dragover", (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; });
  els.drop.addEventListener("dragleave", () => { state.dragDepth = Math.max(0, state.dragDepth - 1); if (!state.dragDepth) els.drop.classList.remove("is-dragging"); });
  els.drop.addEventListener("drop", (event) => {
    event.preventDefault();
    state.dragDepth = 0;
    els.drop.classList.remove("is-dragging");
    if (!state.busy) addFiles(event.dataTransfer && event.dataTransfer.files);
  });
  els.input.addEventListener("change", () => addFiles(els.input.files));
  els.add.addEventListener("click", () => els.input.click());
  els.clear.addEventListener("click", clearAll);
  els.merge.addEventListener("click", () => void combine());
  els.cancel.addEventListener("click", cancel);
  els.download.addEventListener("click", triggerDownload);

  els.list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-pdf-id]");
    const action = event.target.closest("[data-pdf-action]")?.dataset.pdfAction;
    if (!row || !action) return;
    if (action === "up") moveItem(row.dataset.pdfId, -1);
    if (action === "down") moveItem(row.dataset.pdfId, 1);
    if (action === "remove") removeItem(row.dataset.pdfId);
  });
  els.list.addEventListener("dragstart", (event) => {
    if (state.busy) { event.preventDefault(); return; }
    const row = event.target.closest("[data-pdf-id]");
    if (!row) return;
    state.draggedId = row.dataset.pdfId;
    row.classList.add("is-dragging");
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", state.draggedId); }
  });
  els.list.addEventListener("dragover", (event) => {
    const row = event.target.closest("[data-pdf-id]");
    if (!row || row.dataset.pdfId === state.draggedId) return;
    event.preventDefault();
    els.list.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
    row.classList.add("is-drop-target");
  });
  els.list.addEventListener("drop", (event) => {
    const row = event.target.closest("[data-pdf-id]");
    if (!row || !state.draggedId) return;
    event.preventDefault();
    const from = state.items.findIndex((item) => item.id === state.draggedId);
    const to = state.items.findIndex((item) => item.id === row.dataset.pdfId);
    if (from >= 0 && to >= 0 && from !== to) {
      invalidateResult();
      state.items = Core.reorder(state.items, from, to);
      render();
    }
  });
  els.list.addEventListener("dragend", () => {
    state.draggedId = "";
    els.list.querySelectorAll(".is-dragging,.is-drop-target").forEach((node) => node.classList.remove("is-dragging", "is-drop-target"));
  });

  root.addEventListener("beforeunload", () => {
    if (state.worker) state.worker.terminate();
    revokeResult();
  });

  function activate() {
    render();
    root.setTimeout(() => els.drop.focus(), 0);
  }

  render();
  root.GrconPdfMergeUi = Object.freeze({ activate, addFiles, clear: clearAll, _debug: Object.freeze({ state }) });
})(window);
