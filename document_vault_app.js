(function (root) {
  "use strict";

  const Core = root.GrconDocumentVaultCore;
  if (!Core) {
    console.error("GRCON Cofre: núcleo documental não carregado.");
    return;
  }

  const API = "/api/document-vault";
  const PAGE_SIZE = 50;
  const UPLOAD_CONCURRENCY = 6;
  const DOWNLOAD_CONCURRENCY = 4;
  const ENQUEUE_CHUNK_SIZE = 250;
  const QUEUE_RENDER_LIMIT = 220;
  const LOOKUP_BATCH_SIZE = 500;
  let sourceRegistry = new WeakMap();
  let contextEpoch = 0;

  const state = {
    files: [],
    next: null,
    hasMore: false,
    loading: false,
    query: "",
    allocation: "all",
    queue: [],
    paused: false,
    active: 0,
    health: null,
    open: false,
    importStats: { analyzed: 0, accepted: 0, ignoredArchives: 0 },
    lookupRows: [],
    lookupBusy: false,
    vaultPrepared: false,
    storage: null,
    storageLoading: false,
  };

  const text = Core.text;
  const esc = value => text(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const bytes = value => {
    const amount = Number(value) || 0;
    if (amount < 1024) return amount + " B";
    if (amount < 1024 * 1024) return (amount / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " KB";
    if (amount < 1024 * 1024 * 1024) return (amount / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
    return (amount / 1024 / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " GB";
  };
  const dateLabel = value => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
      : "—";
  };
  const yieldMain = () => new Promise(resolve => {
    if (typeof root.requestIdleCallback === "function") root.requestIdleCallback(() => resolve(), { timeout: 50 });
    else root.setTimeout(resolve, 0);
  });

  function session() { return root.GrconCloud?.state?.session || null; }
  function workspaceId() { return text(root.GrconCloud?.state?.membership?.workspace_id); }
  function accessToken() { return text(session()?.access_token); }

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") console.error(message);
  }

  function registerSource(file, metadata) {
    sourceRegistry.set(file, { ...metadata });
    try {
      Object.defineProperty(file, "grconVaultFileId", { value: metadata.id, configurable: true });
    } catch (_) {}
    return file;
  }

  function lookupSource(file) {
    if (!file) return null;
    const source = sourceRegistry.get(file);
    return source ? { ...source } : null;
  }

  function parseIdentity(fileName) {
    return Core.parseStoredFileIdentity(fileName);
  }

  function requestHeaders(jsonBody) {
    const token = accessToken();
    const workspace = workspaceId();
    if (!token || !workspace) throw new Error("Entre no GRCON para utilizar o Cofre.");
    const headers = {
      authorization: "Bearer " + token,
      "x-grcon-workspace": workspace,
    };
    if (jsonBody) headers["content-type"] = "application/json";
    return headers;
  }

  async function requestJson(path, options) {
    const settings = options || {};
    const response = await fetch(API + path, {
      ...settings,
      headers: { ...requestHeaders(settings.body != null), ...(settings.headers || {}) },
    });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch (_) { payload = { message: raw }; }
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.message || ("Falha no Cofre (" + response.status + ")."));
      error.code = payload?.error || "VAULT_ERROR";
      error.status = response.status;
      error.detail = payload?.detail;
      throw error;
    }
    return payload || {};
  }

  function xhrPut(path, blob, task, extraHeaders, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      task.activeXhr = xhr;
      xhr.open("PUT", API + path, true);
      const headers = { ...requestHeaders(false), ...(extraHeaders || {}) };
      Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
      if (blob.type) xhr.setRequestHeader("content-type", blob.type);
      xhr.upload.onprogress = event => {
        if (event.lengthComputable && typeof onProgress === "function") onProgress(event.loaded, event.total);
      };
      xhr.onerror = () => reject(Object.assign(new Error("Falha de rede durante o envio."), { code: "NETWORK_ERROR" }));
      xhr.onabort = () => reject(new DOMException("Envio pausado.", "AbortError"));
      xhr.onload = () => {
        let payload = null;
        try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) { payload = { message: xhr.responseText }; }
        if (xhr.status < 200 || xhr.status >= 300 || payload?.ok === false) {
          const error = new Error(payload?.message || ("Falha no envio (" + xhr.status + ")."));
          error.code = payload?.error || "UPLOAD_ERROR";
          error.status = xhr.status;
          error.detail = payload?.detail;
          reject(error);
          return;
        }
        resolve(payload || {});
      };
      xhr.send(blob);
    }).finally(() => {
      if (task.activeXhr) task.activeXhr = null;
    });
  }

  function hashFile(task) {
    return new Promise((resolve, reject) => {
      const worker = new Worker("document_hash_worker.js");
      const id = task.id;
      task.hashWorker = worker;
      task.abortHash = () => {
        try { worker.terminate(); } catch (_) {}
        task.hashWorker = null;
        task.abortHash = null;
        reject(new DOMException("Processamento pausado.", "AbortError"));
      };
      worker.addEventListener("message", event => {
        const message = event.data || {};
        if (message.id !== id) return;
        if (message.type === "progress") {
          const total = Number(message.total) || task.file.size || 1;
          task.progress = Math.min(28, Math.round((Number(message.loaded) || 0) / total * 28));
          task.phase = "Preparando arquivo";
          renderQueue();
        } else if (message.type === "done") {
          worker.terminate();
          task.hashWorker = null;
          task.abortHash = null;
          resolve(message.sha256);
        } else if (message.type === "error") {
          worker.terminate();
          task.hashWorker = null;
          task.abortHash = null;
          reject(new Error(message.message || "Falha ao preparar o arquivo."));
        }
      });
      worker.addEventListener("error", event => {
        worker.terminate();
        task.hashWorker = null;
        task.abortHash = null;
        reject(new Error(event.message || "Falha ao preparar o arquivo."));
      });
      worker.postMessage({ type: "hash", id, file: task.file, chunkSize: 4 * 1024 * 1024 });
    });
  }

  function taskStatusLabel(task) {
    return ({
      pending: "Aguardando",
      needs_metadata: "Revisar identificação",
      hashing: "Preparando",
      initializing: "Verificando",
      uploading: "Enviando",
      paused: "Pausado",
      conflict: "Conflito",
      done: task.duplicate ? "Já existente" : task.reused ? "Reaproveitado" : "Concluído",
      error: "Falhou",
    })[task.status] || task.status;
  }

  function taskClass(task) {
    if (task.status === "done") return "success";
    if (task.status === "error" || task.status === "conflict") return "error";
    if (task.status === "paused") return "paused";
    if (task.status === "needs_metadata") return "warning";
    return "active";
  }

  function makeTask(file, identity) {
    return {
      id: root.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)),
      file,
      workspaceId: workspaceId(),
      documentCode: identity.documentCode,
      revision: identity.revision,
      format: identity.format,
      status: identity.inferred ? "pending" : "needs_metadata",
      phase: identity.inferred ? "Aguardando" : "Informe documento e revisão",
      progress: 0,
      error: "",
      sha256: "",
      allowConflict: false,
      duplicate: false,
      reused: false,
      serverFile: null,
      activeXhr: null,
      hashWorker: null,
    };
  }

  async function enqueueFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file && file.name);
    if (!files.length) return;
    let accepted = 0;
    let ignored = 0;

    for (let offset = 0; offset < files.length; offset += ENQUEUE_CHUNK_SIZE) {
      const chunk = files.slice(offset, offset + ENQUEUE_CHUNK_SIZE);
      for (const file of chunk) {
        state.importStats.analyzed += 1;
        if (Core.isArchiveFileName(file.name)) {
          state.importStats.ignoredArchives += 1;
          ignored += 1;
          continue;
        }
        const identity = parseIdentity(file.name);
        state.queue.push(makeTask(file, identity));
        state.importStats.accepted += 1;
        accepted += 1;
      }
      renderQueue();
      pump();
      await yieldMain();
    }

    const details = [
      accepted ? accepted + " documento(s) adicionado(s)" : "",
      ignored ? ignored + " compactado(s) ignorado(s)" : "",
    ].filter(Boolean).join(" · ");
    if (details) notify(details, ignored && !accepted ? "warning" : "info");
  }

  async function filesFromDrop(dataTransfer) {
    const items = Array.from(dataTransfer?.items || []);
    if (!items.length || !items.some(item => typeof item.webkitGetAsEntry === "function")) {
      return Array.from(dataTransfer?.files || []);
    }
    const output = [];
    let walked = 0;
    async function walk(entry) {
      if (!entry) return;
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        if (file) output.push(file);
        walked += 1;
        if (walked % ENQUEUE_CHUNK_SIZE === 0) await yieldMain();
        return;
      }
      if (!entry.isDirectory) return;
      const reader = entry.createReader();
      while (true) {
        const entries = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!entries.length) break;
        for (const child of entries) await walk(child);
      }
    }
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) await walk(entry);
    }
    return output.length ? output : Array.from(dataTransfer?.files || []);
  }

  async function uploadTask(task) {
    if (state.paused || !task || !["pending","paused"].includes(task.status)) return;
    if (!text(task.documentCode) || !text(task.revision)) {
      task.status = "needs_metadata";
      task.phase = "Informe documento e revisão";
      renderQueue();
      return;
    }

    if (!task.workspaceId) task.workspaceId = workspaceId();
    if (task.workspaceId !== workspaceId()) {
      task.status = "paused"; task.phase = "Envio pertence a outro contrato"; renderQueue(); return;
    }
    task.status = "hashing";
    task.error = "";
    renderQueue();
    try {
      if (!task.sha256) task.sha256 = await hashFile(task);
      if (state.paused) throw new DOMException("Fila pausada.", "AbortError");

      task.status = "initializing";
      task.phase = "Verificando se já existe";
      task.progress = Math.max(task.progress, 30);
      renderQueue();

      const init = await requestJson("/init", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: task.workspaceId,
          fileName: task.file.name,
          relativePath: task.file.webkitRelativePath || task.file.name,
          documentCode: task.documentCode,
          revision: task.revision,
          format: task.format,
          sha256: task.sha256,
          sizeBytes: task.file.size,
          allowConflict: task.allowConflict,
        }),
      });
      if (state.paused) throw new DOMException("Fila pausada.", "AbortError");
      task.serverFile = init.file;
      task.duplicate = Boolean(init.duplicate);
      task.reused = Boolean(init.reused);

      if (init.ready || init.uploadMode === "none") {
        task.status = "done";
        task.progress = 100;
        task.phase = task.duplicate ? "Este arquivo já estava armazenado" : task.reused ? "Conteúdo já existente reaproveitado" : "Concluído";
        renderQueue();
        return;
      }

      task.status = "uploading";
      task.phase = init.uploadMode === "multipart" ? "Enviando em partes" : "Enviando";
      renderQueue();
      const common = {
        "x-grcon-file-id": init.file.id,
        "x-grcon-workspace": task.workspaceId,
      };

      if (init.uploadMode === "single") {
        await xhrPut("/upload", task.file, task, common, (loaded, total) => {
          task.progress = 32 + Math.round((loaded / Math.max(1, total)) * 66);
          task.phase = "Enviando";
          renderQueue();
        });
      } else {
        const started = await requestJson("/multipart/start", {
          method: "POST",
          body: JSON.stringify({ workspaceId: task.workspaceId, id: init.file.id, contentType: task.file.type || "application/octet-stream" }),
        });
        const partSize = Number(started.partSize || init.partSize) || 16 * 1024 * 1024;
        const confirmed = new Set((started.parts || []).map(part => Number(part.partNumber)));
        const totalParts = Math.max(1, Math.ceil(task.file.size / partSize));
        let confirmedBytes = 0;
        for (const number of confirmed) {
          const offset = (number - 1) * partSize;
          confirmedBytes += Math.max(0, Math.min(partSize, task.file.size - offset));
        }
        for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
          if (state.paused) throw new DOMException("Fila pausada.", "AbortError");
          if (confirmed.has(partNumber)) continue;
          const start = (partNumber - 1) * partSize;
          const end = Math.min(task.file.size, start + partSize);
          const partBlob = task.file.slice(start, end, task.file.type);
          await xhrPut("/multipart/part", partBlob, task, {
            ...common,
            "x-grcon-part-number": String(partNumber),
            "x-grcon-part-size": String(partBlob.size),
          }, loaded => {
            task.progress = 32 + Math.round(((confirmedBytes + loaded) / Math.max(1, task.file.size)) * 64);
            task.phase = "Parte " + partNumber + " de " + totalParts;
            renderQueue();
          });
          confirmedBytes += partBlob.size;
        }
        await requestJson("/multipart/complete", {
          method: "POST",
          body: JSON.stringify({ workspaceId: task.workspaceId, id: init.file.id }),
        });
      }

      task.status = "done";
      task.progress = 100;
      task.phase = "Armazenado";
      renderQueue();
    } catch (error) {
      if (error?.name === "AbortError" || error?.code === "ABORTED") {
        task.status = "paused";
        task.phase = "Pausado; pode continuar depois";
      } else if (error?.code === "IDENTITY_CONFLICT") {
        task.status = "conflict";
        task.error = error.message;
        task.phase = "Mesmo documento e revisão com arquivo diferente";
      } else {
        task.status = "error";
        task.error = error?.message || "Falha no envio.";
        task.phase = "Falha";
      }
      renderQueue();
    }
  }

  function pump() {
    if (state.paused) return;
    while (state.active < UPLOAD_CONCURRENCY) {
      const task = state.queue.find(item => item.status === "pending");
      if (!task) break;
      state.active += 1;
      uploadTask(task).finally(() => {
        state.active = Math.max(0, state.active - 1);
        renderQueue();
        if (!state.paused) pump();
        if (!state.active && state.queue.some(item => item.status === "done")) {
          void refreshList(true);
          void refreshStorage();
        }
      });
    }
  }

  function pauseQueue() {
    state.paused = true;
    state.queue.forEach(task => {
      if (task.activeXhr) {
        try { task.activeXhr.abort(); } catch (_) {}
      }
      if (task.abortHash) {
        task.abortHash();
        task.sha256 = "";
      }
    });
    renderQueue();
  }

  function resumeQueue() {
    state.paused = false;
    state.queue.forEach(task => {
      if (task.status === "paused") {
        task.status = "pending";
        task.phase = "Retomando";
      }
    });
    renderQueue();
    pump();
  }

  function retryTask(id, allowConflict) {
    const task = state.queue.find(item => item.id === id);
    if (!task) return;
    if (allowConflict) task.allowConflict = true;
    task.status = "pending";
    task.error = "";
    task.phase = "Aguardando nova tentativa";
    renderQueue();
    pump();
  }

  function removeTask(id) {
    const index = state.queue.findIndex(item => item.id === id);
    if (index < 0) return;
    const task = state.queue[index];
    if (task.activeXhr || task.hashWorker) return;
    state.queue.splice(index, 1);
    renderQueue();
  }

  function updateTaskMetadata(id, field, value) {
    const task = state.queue.find(item => item.id === id);
    if (!task || !["documentCode","revision"].includes(field) || ["uploading","hashing","initializing","done"].includes(task.status)) return;
    task[field] = field === "revision" ? Core.normalizeRevision(value) : Core.normalizeDocumentCode(value);
    if (task.documentCode && task.revision) {
      task.status = "pending";
      task.phase = "Aguardando";
      task.error = "";
      renderQueue();
      pump();
    } else {
      task.status = "needs_metadata";
      task.phase = "Informe documento e revisão";
      renderQueue();
    }
  }

  function queueView() {
    const attention = state.queue.filter(task => ["error","conflict","needs_metadata","uploading","hashing","initializing","paused"].includes(task.status));
    const attentionIds = new Set(attention.map(task => task.id));
    const remaining = state.queue.filter(task => !attentionIds.has(task.id));
    return attention.concat(remaining).slice(0, QUEUE_RENDER_LIMIT);
  }

  function renderQueue() {
    const host = document.getElementById("vault-queue-body");
    const panel = document.getElementById("vault-queue-panel");
    const pause = document.getElementById("vault-pause");
    const resume = document.getElementById("vault-resume");
    const summary = document.getElementById("vault-queue-summary");
    if (!host || !panel) return;
    panel.hidden = state.queue.length === 0 && state.importStats.ignoredArchives === 0;
    if (pause) pause.hidden = state.paused || !state.queue.some(task => ["pending","hashing","initializing","uploading"].includes(task.status));
    if (resume) resume.hidden = !state.paused;
    const complete = state.queue.filter(task => task.status === "done").length;
    const failed = state.queue.filter(task => ["error","conflict","needs_metadata"].includes(task.status)).length;
    const pending = Math.max(0, state.queue.length - complete - failed);
    if (summary) {
      summary.textContent = [
        state.importStats.analyzed + " analisado(s)",
        complete + " registrado(s)",
        pending + " em andamento/aguardando",
        state.importStats.ignoredArchives + " compactado(s) ignorado(s)",
        failed + " requer(em) atenção",
      ].join(" · ");
    }
    const visible = queueView();
    host.innerHTML = visible.map(task => {
      const editable = !["hashing","initializing","uploading","done"].includes(task.status);
      const actions = [];
      if (task.status === "error") actions.push('<button type="button" data-vault-retry="' + esc(task.id) + '">Tentar novamente</button>');
      if (task.status === "conflict") actions.push('<button type="button" data-vault-conflict="' + esc(task.id) + '">Manter variante</button>');
      if (!["hashing","initializing","uploading"].includes(task.status)) actions.push('<button type="button" class="quiet" data-vault-remove-task="' + esc(task.id) + '">Remover</button>');
      return '<tr class="vault-task-' + taskClass(task) + '">' +
        '<td><strong>' + esc(task.file.name) + '</strong><small>' + esc(bytes(task.file.size)) + '</small></td>' +
        '<td><input data-vault-meta="documentCode" data-task-id="' + esc(task.id) + '" value="' + esc(task.documentCode) + '" ' + (editable ? "" : "disabled") + ' aria-label="Código documental"></td>' +
        '<td><input class="vault-revision-input" data-vault-meta="revision" data-task-id="' + esc(task.id) + '" value="' + esc(task.revision) + '" ' + (editable ? "" : "disabled") + ' aria-label="Revisão"></td>' +
        '<td><span class="vault-status">' + esc(taskStatusLabel(task)) + '</span><small>' + esc(task.error || task.phase) + '</small></td>' +
        '<td><div class="vault-progress"><i style="width:' + Math.max(0, Math.min(100, Number(task.progress) || 0)) + '%"></i></div><small>' + Math.round(Number(task.progress) || 0) + '%</small></td>' +
        '<td><div class="vault-row-actions">' + actions.join("") + '</div></td>' +
        '</tr>';
    }).join("");
    if (state.queue.length > visible.length) {
      host.insertAdjacentHTML("beforeend", '<tr><td colspan="6"><div class="vault-empty">Mostrando ' + visible.length + ' de ' + state.queue.length + ' itens para manter a tela responsiva. O restante continua sendo processado.</div></td></tr>');
    }
  }

  async function checkHealth() {
    const node = document.getElementById("vault-health");
    try {
      const response = await fetch(API + "/health", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      state.health = payload;
      if (node) {
        node.className = payload.ok ? "vault-health ok" : "vault-health error";
        node.textContent = payload.ok ? "Cofre disponível" : "Cofre indisponível";
      }
      return payload;
    } catch (_) {
      if (node) {
        node.className = "vault-health error";
        node.textContent = "Cofre indisponível";
      }
      return null;
    }
  }

  async function refreshList(reset) {
    if (state.loading) return;
    if (!accessToken() || !workspaceId()) {
      const body = document.getElementById("vault-list-body");
      if (body) body.innerHTML = '<tr><td colspan="7"><div class="vault-empty">Entre no GRCON para consultar o Cofre.</div></td></tr>';
      return;
    }
    const epoch = contextEpoch;
    const workspace = workspaceId();
    state.loading = true;
    renderListStatus("Consultando documentos…");
    try {
      if (reset) {
        state.files = [];
        state.next = null;
        state.hasMore = false;
      }
      const params = new URLSearchParams({
        workspace: workspaceId(),
        limit: String(PAGE_SIZE),
        q: state.query,
        allocation: state.allocation,
      });
      if (!reset && state.next) params.set("after", String(state.next));
      const payload = await requestJson("/list?" + params.toString(), { method: "GET" });
      if (epoch !== contextEpoch || workspace !== workspaceId()) return;
      const rows = Array.isArray(payload.files) ? payload.files : [];
      state.files = reset ? rows : state.files.concat(rows);
      state.next = payload.next ?? null;
      state.hasMore = Boolean(payload.has_more || payload.next);
      renderVaultList();
    } catch (error) {
      renderListStatus(error.message || "Não foi possível consultar o Cofre.", true);
    } finally {
      state.loading = false;
    }
  }

  function renderListStatus(message, error) {
    const status = document.getElementById("vault-list-status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(error));
  }

  function allocationLabel(file) {
    return text(file?.allocation_label) || (file?.allocation_identified ? "Não informado no Controle" : "Não identificado");
  }

  function allocationClass(file) {
    if (file?.allocated) return "yes";
    return file?.allocation_identified ? "no" : "unknown";
  }

  function renderVaultList() {
    const body = document.getElementById("vault-list-body");
    const more = document.getElementById("vault-load-more");
    if (!body) return;
    if (!state.files.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="vault-empty"><strong>Nenhum documento localizado</strong><span>Ajuste a pesquisa ou adicione documentos.</span></div></td></tr>';
    } else {
      body.innerHTML = state.files.map(file => {
        const id = text(file.id);
        return '<tr>' +
          '<td><strong>' + esc(file.document_code || file.identity_code || "—") + '</strong><small>' + esc(file.file_name || "") + '</small></td>' +
          '<td>' + esc(file.revision || "0") + '</td>' +
          '<td>' + esc((file.format || "outra").toUpperCase()) + '</td>' +
          '<td>' + esc(bytes(file.size_bytes)) + '</td>' +
          '<td>' + esc(dateLabel(file.created_at)) + '</td>' +
          '<td><span class="vault-allocation ' + allocationClass(file) + '" title="Fonte: ' + esc(file.allocation_source || "Controle de Solicitações") + '">' + esc(allocationLabel(file)) + '</span></td>' +
          '<td><div class="vault-row-actions">' + (file.status === 'ready' ? '<button type="button" data-vault-open-file="' + esc(id) + '">Abrir</button><button type="button" class="quiet" data-vault-download="' + esc(id) + '">Baixar</button>' : '<span>Exclusão pendente</span>') + (canDelete() ? '<button type="button" data-vault-delete="' + esc(id) + '">' + (file.status === 'ready' ? 'Excluir' : 'Tentar excluir novamente') + '</button>' : '') + '</div></td>' +
          '</tr>';
      }).join("");
    }
    if (more) more.hidden = !state.hasMore;
    renderListStatus(state.files.length + " documento(s) exibido(s)" + (state.hasMore ? " · há mais resultados" : ""));
  }

  async function downloadBlob(file) {
    const response = await fetch(API + "/download?workspace=" + encodeURIComponent(workspaceId()) + "&id=" + encodeURIComponent(file.id), {
      headers: requestHeaders(false),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Não foi possível baixar o documento.");
    }
    return response.blob();
  }

  async function downloadAction(id, open) {
    const file = state.files.find(item => text(item.id) === text(id));
    if (!file) return;
    try {
      const blob = await downloadBlob(file);
      const url = URL.createObjectURL(blob);
      if (open && /pdf/i.test(file.format || blob.type)) {
        root.open(url, "_blank", "noopener,noreferrer");
        root.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.file_name || "documento";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        root.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      notify(error.message || "Falha ao recuperar documento.", "error");
    }
  }

  function canDelete() { return ["owner", "admin"].includes(root.GrconCloud?.state?.membership?.role); }

  async function deleteDocument(id) {
    const file = state.files.find(item => item.id === id);
    if (!file || !canDelete()) return;
    const workspace = workspaceId(), epoch = contextEpoch;
    if (!root.confirm("Excluir documento?\n\n" + (file.document_code || file.file_name) + "\nRevisão " + file.revision + "\n\nO arquivo também será removido do armazenamento do Cofre. O Histórico de GRDT será preservado.")) return;
    // A File already downloaded keeps its original catalogue metadata even
    // if the catalogue object is later deleted or deletion fails.
    state.lookupRows = []; state.vaultPrepared = false;
    if (state.grdtSource === "vault") setPackageFiles([]);
    renderLookupResults();
    try {
      await requestJson("/delete", { method: "POST", body: JSON.stringify({ workspaceId: workspace, id }) });
      if (epoch !== contextEpoch) return;
      state.lookupRows = []; state.vaultPrepared = false;
      if (state.grdtSource === "vault") setPackageFiles([]);
      renderLookupResults();
      await refreshList(true);
      await refreshStorage();
      notify("Documento excluído do Cofre e do armazenamento.", "success");
    } catch (error) {
      if (epoch !== contextEpoch) return;
      await refreshList(true);
      await refreshStorage();
      notify(error.message, "error");
    }
  }

  async function exportVault() {
    const button = document.getElementById("vault-export");
    const workspace = workspaceId(), epoch = contextEpoch;
    const filters = { q: state.query, allocation: state.allocation };
    if (button) button.disabled = true;
    try {
      await root.GRCONModuleLoader.ensure("excel");
      const workbook = new root.ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Cofre", { views: [{ state: "frozen", ySplit: 1 }] });
      sheet.columns = [
        ["Contrato", "contract", 24], ["Código do documento", "document", 38], ["Revisão", "revision", 12],
        ["Nome do arquivo", "name", 52], ["Extensão", "format", 12], ["Tipo", "type", 14],
        ["Tamanho (bytes)", "size", 20], ["Data de inclusão", "date", 24], ["Incluído por", "actor", 38],
        ["Alocação", "allocation", 34], ["Fonte da alocação", "allocationSource", 28], ["Situação do arquivo", "status", 28],
      ].map(([header, key, width]) => ({ header, key, width }));
      let after = null;
      do {
        if (epoch !== contextEpoch) throw new Error("O contrato mudou. Exporte novamente.");
        const params = new URLSearchParams({ workspace, limit: "200", ...filters });
        if (after) params.set("after", String(after));
        const page = await requestJson("/list?" + params, { method: "GET" });
        if (epoch !== contextEpoch) throw new Error("O contrato mudou. Exporte novamente.");
        for (const file of page.files || []) sheet.addRow({
          contract: root.GrconCloud?.state?.contract?.display_name || root.GrconCloud?.state?.contract?.code || root.GrconCloud?.state?.membership?.contract_code || "Contrato atual",
          document: file.document_code, revision: file.revision, name: file.file_name, format: file.format,
          type: file.document_type || "", size: Number(file.size_bytes), date: new Date(file.created_at),
          actor: file.created_by_name || file.created_by_email || "", allocation: allocationLabel(file),
          allocationSource: file.allocation_source || "Controle de Solicitações",
          status: file.status === "ready" ? "Disponível" : "Exclusão pendente — tentar novamente",
        });
        after = page.next;
      } while (after);
      sheet.getColumn("date").numFmt = "dd/mm/yyyy hh:mm";
      sheet.getColumn("size").numFmt = "#,##0";
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "16324A" } };
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: 12 } };
      const buffer = await workbook.xlsx.writeBuffer();
      if (epoch !== contextEpoch) throw new Error("O contrato mudou. Exporte novamente.");
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "GRCON_Cofre_" + new Date().toISOString().slice(0,10) + ".xlsx";
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify((sheet.rowCount - 1) + " documentos exportados com os filtros selecionados.", "success");
    } catch (error) { notify(error.message, "error"); }
    finally { if (button) button.disabled = false; }
  }

  function renderStorage() {
    const used = document.getElementById("vault-storage-used");
    const objects = document.getElementById("vault-storage-objects");
    const integrity = document.getElementById("vault-storage-integrity");
    const checked = document.getElementById("vault-storage-checked");
    const reconcile = document.getElementById("vault-storage-reconcile");
    const refresh = document.getElementById("vault-storage-refresh");
    if (reconcile) reconcile.hidden = !canDelete();
    if (refresh) refresh.disabled = state.storageLoading;
    if (!state.storage) {
      if (used) used.textContent = state.storageLoading ? "Calculando…" : "—";
      if (objects) objects.textContent = "—";
      if (integrity) integrity.textContent = "—";
      if (checked) checked.textContent = "";
      return;
    }
    const value = state.storage;
    const usedBytes = Number(value.usedBytes ?? value.physicalBytes ?? 0);
    const fileCount = Number(value.fileCount ?? value.physicalObjects ?? 0);
    if (used) used.textContent = bytes(usedBytes);
    if (objects) objects.textContent = fileCount.toLocaleString("pt-BR") + " arquivo(s)";
    if (integrity) {
      const reconciled = value.source === "r2";
      const issues = Number(value.missingObjects || 0) + Number(value.sizeMismatches || 0) + Number(value.orphanObjects || 0);
      integrity.textContent = reconciled
        ? issues
          ? issues + " divergência(s) · " + Number(value.removedPendingFinalization || 0) + " exclusão(ões) aguardando finalização"
          : Number(value.removedPendingFinalization || 0)
            ? Number(value.removedPendingFinalization) + " exclusão(ões) aguardando finalização"
            : "R2 e catálogo coerentes"
        : value.lastReconciledAt
          ? "Uso operacional pelo catálogo · última conferência física " + dateLabel(value.lastReconciledAt)
          : "Uso operacional pelo catálogo · conferência física disponível para owner/admin";
      integrity.className = "vault-storage-integrity " + (reconciled && issues ? "warning" : "ok");
    }
    if (checked) checked.textContent = value.checkedAt ? (value.source === "r2" ? "Conferido " : "Atualizado ") + dateLabel(value.checkedAt) : "";
  }

  async function refreshStorage() {
    if (state.storageLoading || !accessToken() || !workspaceId()) return;
    const epoch = contextEpoch, workspace = workspaceId();
    state.storageLoading = true;
    renderStorage();
    try {
      const payload = await requestJson("/usage?workspace=" + encodeURIComponent(workspace), { method: "GET" });
      if (epoch !== contextEpoch || workspace !== workspaceId()) return;
      state.storage = payload.storage || null;
    } catch (error) {
      if (epoch === contextEpoch) notify(error.message || "Não foi possível calcular o armazenamento do Cofre.", "error");
    } finally {
      state.storageLoading = false;
      renderStorage();
    }
  }

  async function reconcileStorage() {
    if (!canDelete()) return;
    const button = document.getElementById("vault-storage-reconcile");
    if (button) button.disabled = true;
    try {
      const payload = await requestJson("/reconcile", { method: "POST", body: JSON.stringify({ workspaceId: workspaceId() }) });
      state.storage = payload.storage || state.storage;
      renderStorage();
      notify("Conferência do R2 concluída e registrada na auditoria. Nenhum arquivo foi excluído.", "success");
    } catch (error) {
      notify(error.message || "Não foi possível conferir o armazenamento.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function setPackageFiles(files) {
    const input = document.getElementById("pdf-input");
    if (!input) throw new Error("Seletor de documentos da GRDT não localizado.");
    const transfer = new DataTransfer();
    const seen = new Set();
    (files || []).forEach(file => {
      const key = file.name + "\u0000" + file.size + "\u0000" + file.lastModified;
      if (seen.has(key)) return;
      seen.add(key);
      transfer.items.add(file);
    });
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearPreparedVaultFiles() {
    if (state.grdtSource !== "vault") return;
    state.vaultPrepared = false;
    try { setPackageFiles([]); } catch (_) {}
    const summary = document.getElementById("grdt-vault-lookup-summary");
    if (summary && state.lookupRows.length) summary.textContent = "Seleção alterada. Prepare novamente os documentos antes de analisar.";
  }

  function normalizeLookupResult(raw, fallback) {
    const result = {
      requestId: text(raw?.requestId || raw?.request_id || fallback?.requestId),
      input: text(raw?.input || fallback?.input),
      documentCode: text(raw?.documentCode || raw?.document_code || fallback?.documentCode),
      requestedRevision: Core.normalizeRevision(raw?.requestedRevision || raw?.requested_revision || fallback?.revision),
      matches: Array.isArray(raw?.matches) ? raw.matches : [],
    };
    const resolved = Core.resolveLookupSelection(result);
    return {
      ...result,
      groups: resolved.groups,
      revisions: resolved.revisions,
      selectedRevision: resolved.selectedRevision,
      found: resolved.found,
      needsRevisionChoice: resolved.needsRevisionChoice,
      included: resolved.found && Boolean(resolved.selectedRevision),
    };
  }

  function filesForLookupRow(row) {
    if (!row?.selectedRevision) return [];
    const group = row.groups.find(item => item.revision === row.selectedRevision);
    return group ? group.files : [];
  }

  function renderLookupResults() {
    const host = document.getElementById("grdt-vault-lookup-results");
    const summary = document.getElementById("grdt-vault-lookup-summary");
    const prepare = document.getElementById("grdt-vault-prepare");
    if (!host || !summary) return;

    const found = state.lookupRows.filter(row => row.found).length;
    const missing = state.lookupRows.length - found;
    const ready = state.lookupRows.filter(row => row.included && row.selectedRevision).length;
    summary.textContent = state.lookupBusy
      ? "Localizando documentos…"
      : state.lookupRows.length
        ? state.lookupRows.length + " código(s) informado(s) · " + found + " encontrado(s) · " + missing + " não encontrado(s) · " + ready + " pronto(s)"
        : "Cole um código por linha.";

    if (!state.lookupRows.length) {
      host.innerHTML = "";
      if (prepare) prepare.hidden = true;
      return;
    }

    host.innerHTML = '<div class="grdt-vault-result-table-wrap"><table class="grdt-vault-result-table"><thead><tr><th>Usar</th><th>Documento</th><th>Revisão</th><th>Arquivo encontrado</th><th>Situação</th></tr></thead><tbody>' +
      state.lookupRows.map((row, index) => {
        const files = filesForLookupRow(row);
        const revisionCell = row.revisions.length > 1 && !row.requestedRevision
          ? '<select data-grdt-vault-revision="' + index + '" aria-label="Revisão de ' + esc(row.documentCode) + '"><option value="">Escolha a revisão</option>' + row.revisions.map(rev => '<option value="' + esc(rev) + '" ' + (rev === row.selectedRevision ? "selected" : "") + '>' + esc(rev) + '</option>').join("") + '</select>'
          : esc(row.selectedRevision || row.requestedRevision || "—");
        const fileLabel = files.length
          ? files.map(file => esc(file.file_name || "")).join("<br>")
          : row.found
            ? "Escolha uma revisão"
            : "—";
        const status = !row.found
          ? '<span class="vault-lookup-status missing">Não encontrado no Cofre</span>'
          : !row.selectedRevision
            ? '<span class="vault-lookup-status choice">Escolha a revisão</span>'
            : '<span class="vault-lookup-status found">Encontrado</span>';
        return '<tr>' +
          '<td><input type="checkbox" data-grdt-vault-include="' + index + '" ' + (row.included ? "checked" : "") + ' ' + (!row.selectedRevision ? "disabled" : "") + ' aria-label="Usar ' + esc(row.documentCode) + '"></td>' +
          '<td><strong>' + esc(row.documentCode || row.input) + '</strong><small>' + (row.requestedRevision ? "Revisão solicitada: " + esc(row.requestedRevision) : "Código informado sem revisão") + '</small></td>' +
          '<td>' + revisionCell + '</td>' +
          '<td>' + fileLabel + '</td>' +
          '<td>' + status + '</td>' +
          '</tr>';
      }).join("") +
      '</tbody></table></div>';
    if (prepare) prepare.hidden = !state.lookupRows.some(row => row.included && row.selectedRevision);
  }

  async function resolveMissingEntries(entries) {
    const source = Array.from(entries || []);
    if (!source.length) return { files: [], recovered: [], missing: [], queried: 0 };
    const prepared = source.map((entry, index) => {
      const parsed = Core.parseLookupInput(entry.fileName || entry.raw || entry.document || "");
      return {
        entry,
        requestId: "auto-" + (index + 1),
        input: entry.raw || entry.fileName || entry.document || "",
        documentCode: Core.normalizeDocumentCode(entry.document || parsed.documentCode),
        revision: parsed.explicitRevision ? parsed.revision : "",
      };
    });
    const invalid = prepared.filter(item => !item.documentCode);
    const valid = prepared.filter(item => item.documentCode);
    const normalized = [];
    const chunks = [];
    for (let offset = 0; offset < valid.length; offset += LOOKUP_BATCH_SIZE) chunks.push(valid.slice(offset, offset + LOOKUP_BATCH_SIZE));
    const batches = await mapLimit(chunks, 3, async chunk => {
      const payload = await requestJson("/lookup", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspaceId(),
          items: chunk.map(item => ({
            requestId: item.requestId,
            input: item.input,
            documentCode: item.documentCode,
            revision: item.revision,
          })),
        }),
      });
      const results = Array.isArray(payload.results) ? payload.results : [];
      const byId = new Map(results.map(result => [text(result.requestId || result.request_id), result]));
      return chunk.map(item => ({ item, row: normalizeLookupResult(byId.get(item.requestId) || {}, item) }));
    });
    batches.forEach(batch => normalized.push(...batch));

    const missing = invalid.map(item => ({ ...item.entry, reason: "O código solicitado não pôde ser identificado para busca no Cofre." }));
    const selected = [];
    normalized.forEach(({ item, row }) => {
      if (!row.found) {
        missing.push({ ...item.entry, reason: "Não localizado na pasta nem no Cofre." });
        return;
      }
      if (!row.selectedRevision) {
        missing.push({ ...item.entry, reason: "Há mais de uma revisão no Cofre; informe a revisão explicitamente no texto para selecionar com segurança." });
        return;
      }
      const files = filesForLookupRow(row);
      if (!files.length) {
        missing.push({ ...item.entry, reason: "A revisão localizada no Cofre não possui arquivo físico disponível." });
        return;
      }
      selected.push({ entry: item.entry, row, metadata: files });
    });

    const unique = new Map();
    selected.forEach(group => group.metadata.forEach(file => {
      const id = text(file.id);
      if (id && !unique.has(id)) unique.set(id, file);
    }));
    const blobRequests = new Map();
    const downloaded = await mapLimit([...unique.values()], DOWNLOAD_CONCURRENCY, async item => {
      try {
        const objectIdentity = item.sha256 ? item.sha256 + ":" + item.size_bytes : item.id;
        if (!blobRequests.has(objectIdentity)) blobRequests.set(objectIdentity, downloadBlob(item));
        const blob = await blobRequests.get(objectIdentity);
        return { id: text(item.id), item, blob };
      } catch (error) {
        return { id: text(item.id), item, error };
      }
    });
    const byFileId = new Map(downloaded.map(result => [result.id, result]));
    const recovered = [];
    const outputFiles = [];
    selected.forEach(group => {
      const results = group.metadata.map(file => byFileId.get(text(file.id)));
      const failed = results.filter(result => !result || result.error);
      if (failed.length) {
        missing.push({ ...group.entry, reason: failed.length + " arquivo(s) localizado(s) no Cofre não puderam ser recuperados; os demais documentos encontrados continuam válidos." });
        return;
      }
      const files = results.map(result => {
        const item = result.item;
        const file = new File([result.blob], item.file_name || ((item.document_code || item.identity_code) + "." + (item.format || "bin")), {
          type: result.blob.type || "application/octet-stream",
          lastModified: Date.now(),
        });
        registerSource(file, {
          id: item.id,
          sequence: Number(item.sequence) || 0,
          fileName: item.file_name || file.name,
          documentCode: item.document_code || item.identity_code || "",
          revision: item.revision || "0",
          format: item.format || "",
          sizeBytes: Number(item.size_bytes) || file.size || 0,
          sha256: item.sha256 || "",
          createdAt: item.created_at || "",
          verifiedAt: item.verified_at || "",
          allocated: Boolean(item.allocated),
          allocationLabel: allocationLabel(item),
          allocationSource: item.allocation_source || "Controle de Solicitações",
          source: "vault-auto",
        });
        outputFiles.push(file);
        return file;
      });
      recovered.push({ entry: group.entry, files, revision: group.row.selectedRevision });
    });
    return { files: outputFiles, recovered, missing, queried: valid.length };
  }

  async function lookupVaultCodes() {
    const textarea = document.getElementById("grdt-vault-codes");
    const button = document.getElementById("grdt-vault-lookup");
    const parsed = Core.parseLookupText(textarea?.value || "");
    if (!parsed.length) {
      state.lookupRows = [];
      renderLookupResults();
      notify("Informe ao menos um código documental.", "warning");
      return;
    }

    const epoch = contextEpoch;
    const workspace = workspaceId();
    state.lookupBusy = true;
    state.vaultPrepared = false;
    if (button) button.disabled = true;
    try { setPackageFiles([]); } catch (_) {}
    renderLookupResults();

    try {
      const combined = [];
      const chunks = [];
      for (let offset = 0; offset < parsed.length; offset += LOOKUP_BATCH_SIZE) chunks.push(parsed.slice(offset, offset + LOOKUP_BATCH_SIZE));
      const batches = await mapLimit(chunks, 3, async chunk => {
        const payload = await requestJson("/lookup", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspaceId(),
            items: chunk.map(item => ({
              requestId: item.requestId,
              input: item.input,
              documentCode: item.documentCode,
              revision: item.revision,
            })),
          }),
        });
        const results = Array.isArray(payload.results) ? payload.results : [];
        const byId = new Map(results.map(result => [text(result.requestId || result.request_id), result]));
        return chunk.map(item => normalizeLookupResult(byId.get(item.requestId) || {}, item));
      });
      batches.forEach(batch => combined.push(...batch));
      if (epoch !== contextEpoch || workspace !== workspaceId()) return;
      state.lookupRows = combined;
      const missing = combined.filter(row => !row.found).length;
      if (missing) notify(missing + " documento(s) não localizado(s) no Cofre. Os encontrados continuam disponíveis.", "warning");
    } catch (error) {
      state.lookupRows = [];
      notify(error.message || "Não foi possível localizar os documentos no Cofre.", "error");
    } finally {
      state.lookupBusy = false;
      if (button) button.disabled = false;
      renderLookupResults();
    }
  }

  async function mapLimit(items, limit, worker) {
    const source = Array.from(items || []);
    const results = new Array(source.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, source.length) }, async () => {
      while (cursor < source.length) {
        const index = cursor++;
        results[index] = await worker(source[index], index);
      }
    });
    await Promise.all(runners);
    return results;
  }

  async function prepareVaultForGrdt() {
    const button = document.getElementById("grdt-vault-prepare");
    const summary = document.getElementById("grdt-vault-lookup-summary");
    const epoch = contextEpoch;
    const workspace = workspaceId();
    const selectedRows = state.lookupRows.filter(row => row.included && row.selectedRevision);
    const selectedFiles = [];
    const seenIds = new Set();
    selectedRows.forEach(row => filesForLookupRow(row).forEach(file => {
      const id = text(file.id);
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      selectedFiles.push(file);
    }));
    if (!selectedFiles.length) {
      notify("Nenhum documento encontrado está selecionado para a GRDT.", "warning");
      return;
    }

    if (button) button.disabled = true;
    if (summary) summary.textContent = "Preparando " + selectedFiles.length + " arquivo(s) encontrados…";
    try {
      let completed = 0;
      const blobRequests = new Map();
      const downloaded = await mapLimit(selectedFiles, DOWNLOAD_CONCURRENCY, async item => {
        try {
          const objectIdentity = item.sha256 ? item.sha256 + ":" + item.size_bytes : item.id;
          if (!blobRequests.has(objectIdentity)) blobRequests.set(objectIdentity, downloadBlob(item));
          const blob = await blobRequests.get(objectIdentity);
          const file = new File([blob], item.file_name || ((item.document_code || item.identity_code) + "." + (item.format || "bin")), {
            type: blob.type || "application/octet-stream",
            lastModified: Date.now(),
          });
          registerSource(file, {
            id: item.id,
            sequence: Number(item.sequence) || 0,
            fileName: item.file_name || file.name,
            documentCode: item.document_code || item.identity_code || "",
            revision: item.revision || "0",
            format: item.format || "",
            sizeBytes: Number(item.size_bytes) || file.size || 0,
            sha256: item.sha256 || "",
            createdAt: item.created_at || "",
            verifiedAt: item.verified_at || "",
            allocated: Boolean(item.allocated),
            source: "vault",
          });
          return { ok: true, file };
        } catch (error) {
          return { ok: false, item, error };
        } finally {
          completed++;
          if (epoch === contextEpoch && summary) summary.textContent = "Preparando documentos do Cofre: " + completed + " de " + selectedFiles.length + " preparados";
        }
      });

      const good = downloaded.filter(item => item?.ok).map(item => item.file);
      const failed = downloaded.filter(item => !item?.ok);
      if (failed.length) throw new Error(failed.length + " arquivo(s) não puderam ser preparados. Tente novamente antes de gerar a GRDT.");
      if (epoch !== contextEpoch || workspace !== workspaceId()) return;
      setPackageFiles(good);
      state.vaultPrepared = true;
      if (summary) summary.textContent = selectedRows.length + " documento(s) · " + good.length + " arquivo(s) preparados para o fluxo normal da GRDT" + (failed.length ? " · " + failed.length + " falha(s)" : "");
      notify(good.length + " arquivo(s) do Cofre preparados para a GRDT.", failed.length ? "warning" : "success");
    } catch (error) {
      state.vaultPrepared = false;
      notify(error.message || "Não foi possível preparar os documentos para a GRDT.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function ensureCss() {
    if (document.querySelector('link[href$="document-vault.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "document-vault.css";
    document.head.appendChild(link);
  }

  function navSvg() {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16v13H4zM7 7V4h10v3"></path><path d="M8 12h8M8 16h5"></path></svg>';
  }

  function installNavigation() {
    if (document.querySelector("[data-vault-open]")) return;
    const sidebar = document.querySelector(".ops-sidebar");
    const sideBefore = sidebar?.querySelector('[data-grcon-view="requests"]');
    if (sidebar) {
      const button = document.createElement("button");
      button.className = "ops-nav-button";
      button.type = "button";
      button.dataset.vaultOpen = "sidebar";
      button.innerHTML = navSvg() + '<span><strong>Cofre</strong><small>Documentos armazenados</small></span>';
      if (sideBefore?.parentElement === sidebar) sidebar.insertBefore(button, sideBefore); else sidebar.appendChild(button);
    }
    const tabs = document.querySelector(".grcon-view-tabs");
    const tabBefore = document.getElementById("tab-requests");
    if (tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.vaultOpen = "tab";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.setAttribute("aria-controls", "document-vault-module");
      button.innerHTML = navSvg() + '<span><strong>Cofre</strong><small>Documentos armazenados</small></span>';
      if (tabBefore?.parentElement === tabs) tabs.insertBefore(button, tabBefore); else tabs.appendChild(button);
    }
    document.querySelectorAll("[data-vault-open]").forEach(button => button.addEventListener("click", openVault));
  }

  function installModule() {
    if (document.getElementById("document-vault-module")) return;
    const main = document.querySelector("main.workspace");
    if (!main) return;
    const section = document.createElement("section");
    section.id = "document-vault-module";
    section.className = "module-view document-vault-module";
    section.hidden = true;
    section.setAttribute("role", "tabpanel");
    section.setAttribute("aria-label", "Cofre de Documentos");
    section.innerHTML = `
      <header class="ops-page-heading vault-heading">
        <div><span>COFRE</span><h2>Documentos armazenados</h2><p>Adicione arquivos ou uma pasta, pesquise documentos e consulte as versões disponíveis.</p></div>
        <div id="vault-health" class="vault-health">Verificando disponibilidade…</div>
      </header>
      <details class="grcon-context-help" id="grcon-vault-help"><summary>Como funciona · arquivos e alocação no Cofre</summary><div><p>Adicione arquivos ou uma pasta para disponibilizá-los à equipe do contrato. A busca usa código, revisão e formato do arquivo.</p><p>A alocação vem do Controle de Solicitações compartilhado. Sem vínculo identificado, o Cofre mostra Não identificado.</p><p>Excluir remove o arquivo do armazenamento. As emissões já registradas no Histórico preservam os dados do arquivo utilizado.</p></div></details>
      <section class="vault-storage-card" aria-label="Armazenamento do Cofre">
        <div><small>Uso do contrato atual</small><strong id="vault-storage-used">—</strong><span id="vault-storage-objects">—</span></div>
        <div><small>Rastreabilidade</small><strong id="vault-storage-integrity" class="vault-storage-integrity">—</strong><span id="vault-storage-checked"></span></div>
        <div class="vault-storage-actions"><button id="vault-storage-refresh" type="button" class="secondary-button">Atualizar uso</button><button id="vault-storage-reconcile" type="button" class="secondary-button" hidden>Conferir R2</button></div>
      </section>
      <section class="vault-upload-card" aria-labelledby="vault-upload-title">
        <header><div><strong id="vault-upload-title">Adicionar documentos</strong><small>Ao adicionar uma pasta, os documentos são registrados individualmente.</small></div>
          <div class="vault-upload-actions"><button id="vault-pick-files" type="button">Adicionar documentos</button><button id="vault-pick-folder" type="button" class="secondary-button">Adicionar pasta</button></div>
        </header>
        <input id="vault-files-input" type="file" multiple hidden>
        <input id="vault-folder-input" type="file" multiple webkitdirectory directory hidden>
        <div id="vault-dropzone" class="vault-dropzone" tabindex="0" role="button"><strong>Arraste arquivos ou uma pasta para cá</strong><span>Arquivos compactados são ignorados. Os demais documentos são identificados pelo nome do arquivo.</span></div>
      </section>
      <section id="vault-queue-panel" class="vault-queue-panel" hidden>
        <header><div><strong>Registrando documentos</strong><small id="vault-queue-summary"></small></div><div><button id="vault-pause" type="button" class="secondary-button">Pausar</button><button id="vault-resume" type="button" class="secondary-button" hidden>Retomar</button></div></header>
        <div class="vault-table-wrap"><table><thead><tr><th>Arquivo</th><th>Código</th><th>Revisão</th><th>Situação</th><th>Progresso</th><th>Ações</th></tr></thead><tbody id="vault-queue-body"></tbody></table></div>
      </section>
      <section class="vault-browser-card">
        <header><div><strong>Documentos armazenados</strong><small id="vault-list-status">Carregando…</small></div><div><button id="vault-export" type="button" class="secondary-button">Exportar Excel</button><button id="vault-refresh" type="button" class="secondary-button">Atualizar</button></div></header>
        <div class="vault-toolbar">
          <label class="vault-search"><span>Pesquisar documentos</span><input id="vault-search" type="search" placeholder="Código, arquivo ou revisão"></label>
          <label><span>Alocação</span><select id="vault-allocation"><option value="all">Todos</option><option value="allocated">Alocados</option><option value="not_allocated">Não alocados</option><option value="not_identified">Não identificados</option></select></label>
        </div>
        <div class="vault-table-wrap vault-list-wrap"><table><thead><tr><th>Código / arquivo</th><th>Revisão</th><th>Tipo</th><th>Tamanho</th><th>Data de envio</th><th>Alocação</th><th>Ações</th></tr></thead><tbody id="vault-list-body"></tbody></table></div>
        <div class="vault-more"><button id="vault-load-more" type="button" class="secondary-button" hidden>Carregar mais</button></div>
      </section>`;
    main.appendChild(section);
  }

  function activateShell() {
    const module = document.getElementById("document-vault-module");
    if (!module) return;
    document.querySelectorAll("main.workspace > section").forEach(section => { section.hidden = section !== module; });
    document.querySelectorAll("[data-grcon-view]").forEach(button => {
      button.classList.remove("active");
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", "false");
      button.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-vault-open]").forEach(button => {
      button.classList.add("active");
      if (button.getAttribute("role") === "tab") button.setAttribute("aria-selected", "true");
      if (button.closest(".ops-sidebar")) button.setAttribute("aria-current", "page");
    });
    document.getElementById("brand-subtitle") && (document.getElementById("brand-subtitle").textContent = "Cofre");
    document.getElementById("footer-view") && (document.getElementById("footer-view").textContent = "Cofre");
    state.open = true;
  }

  function deactivateShell() {
    const module = document.getElementById("document-vault-module");
    if (module) module.hidden = true;
    document.querySelectorAll("[data-vault-open]").forEach(button => {
      button.classList.remove("active");
      button.setAttribute("aria-selected", "false");
      button.removeAttribute("aria-current");
    });
    state.open = false;
  }

  async function openVault() {
    activateShell();
    await checkHealth();
    await Promise.all([refreshList(true), refreshStorage()]);
  }

  function installEvents() {
    document.getElementById("vault-pick-files")?.addEventListener("click", () => document.getElementById("vault-files-input")?.click());
    document.getElementById("vault-pick-folder")?.addEventListener("click", () => document.getElementById("vault-folder-input")?.click());
    document.getElementById("vault-files-input")?.addEventListener("change", event => { void enqueueFiles(event.target.files); event.target.value = ""; });
    document.getElementById("vault-folder-input")?.addEventListener("change", event => { void enqueueFiles(event.target.files); event.target.value = ""; });
    const zone = document.getElementById("vault-dropzone");
    zone?.addEventListener("click", () => document.getElementById("vault-files-input")?.click());
    zone?.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); document.getElementById("vault-files-input")?.click(); } });
    ["dragenter","dragover"].forEach(type => zone?.addEventListener(type, event => { event.preventDefault(); zone.classList.add("dragging"); }));
    ["dragleave","drop"].forEach(type => zone?.addEventListener(type, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
    zone?.addEventListener("drop", event => { void filesFromDrop(event.dataTransfer).then(enqueueFiles).catch(error => notify(error.message || "Não foi possível ler a pasta.", "error")); });
    document.getElementById("vault-pause")?.addEventListener("click", pauseQueue);
    document.getElementById("vault-resume")?.addEventListener("click", resumeQueue);
    document.getElementById("vault-export")?.addEventListener("click", () => void exportVault());
    document.getElementById("vault-refresh")?.addEventListener("click", () => void refreshList(true));
    document.getElementById("vault-storage-refresh")?.addEventListener("click", () => void refreshStorage());
    document.getElementById("vault-storage-reconcile")?.addEventListener("click", () => void reconcileStorage());
    document.getElementById("vault-load-more")?.addEventListener("click", () => void refreshList(false));

    let searchTimer = 0;
    document.getElementById("vault-search")?.addEventListener("input", event => {
      clearTimeout(searchTimer);
      state.query = text(event.target.value);
      searchTimer = setTimeout(() => void refreshList(true), 250);
    });
    document.getElementById("vault-allocation")?.addEventListener("change", event => {
      state.allocation = event.target.value || "all";
      void refreshList(true);
    });

    document.getElementById("document-vault-module")?.addEventListener("change", event => {
      const meta = event.target.closest?.("[data-vault-meta]");
      if (meta) updateTaskMetadata(meta.dataset.taskId, meta.dataset.vaultMeta, meta.value);
    });

    document.getElementById("document-vault-module")?.addEventListener("click", event => {
      const retry = event.target.closest?.("[data-vault-retry]");
      if (retry) retryTask(retry.dataset.vaultRetry, false);
      const conflict = event.target.closest?.("[data-vault-conflict]");
      if (conflict) retryTask(conflict.dataset.vaultConflict, true);
      const remove = event.target.closest?.("[data-vault-remove-task]");
      if (remove) removeTask(remove.dataset.vaultRemoveTask);
      const open = event.target.closest?.("[data-vault-open-file]");
      if (open) void downloadAction(open.dataset.vaultOpenFile, true);
      const download = event.target.closest?.("[data-vault-download]");
      if (download) void downloadAction(download.dataset.vaultDownload, false);
      const deletion = event.target.closest?.("[data-vault-delete]");
      if (deletion) void deleteDocument(deletion.dataset.vaultDelete);
    });

    document.addEventListener("click", event => {
      const standard = event.target.closest?.("[data-grcon-view]");
      if (standard && state.open) deactivateShell();
    }, true);

    root.addEventListener("grcon:cloud-ready", () => {
      if (state.open) {
        void checkHealth();
        void refreshList(true);
        void refreshStorage();
      }
    });
    root.addEventListener("grcon:contract-context-changed", () => {
      contextEpoch++;
      state.files = []; state.lookupRows = []; state.next = null; state.hasMore = false; state.storage = null;
      state.vaultPrepared = false; sourceRegistry = new WeakMap();
      renderVaultList(); renderLookupResults(); renderStorage();
      if (state.open) { void refreshList(true); void refreshStorage(); }
    });
    root.addEventListener("grcon:requests-control-updated", () => {
      if (state.open) void refreshList(true);
    });
  }

  function init() {
    ensureCss();
    installNavigation();
    installModule();
    installEvents();
    renderQueue();
    renderVaultList();
    renderLookupResults();
    renderStorage();
  }

  root.GrconDocumentVault = Object.freeze({
    open: openVault,
    refresh: () => refreshList(true),
    enqueueFiles,
    lookupSource,
    parseIdentity,
    parseLookupInput: Core.parseLookupInput,
    resolveMissingEntries,
    refreshStorage,
    state,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
