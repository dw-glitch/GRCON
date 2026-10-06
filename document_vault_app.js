(function (root) {
  "use strict";

  const API = "/api/document-vault";
  const PAGE_SIZE = 50;
  const UPLOAD_CONCURRENCY = 2;
  const sourceRegistry = new Map();
  const state = {
    files: [],
    selected: new Set(),
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
  };

  const text = value => String(value == null ? "" : value).trim();
  const esc = value => text(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const bytes = value => {
    const amount = Number(value) || 0;
    if (amount < 1024) return amount + " B";
    if (amount < 1024 * 1024) return (amount / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " KB";
    if (amount < 1024 * 1024 * 1024) return (amount / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
    return (amount / 1024 / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " GB";
  };

  function session() { return root.GrconCloud?.state?.session || null; }
  function workspaceId() { return text(root.GrconCloud?.state?.membership?.workspace_id); }
  function accessToken() { return text(session()?.access_token); }

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
    else if (kind === "error") console.error(message);
  }

  function sourceKey(file) {
    return file ? [file.name, Number(file.size) || 0, Number(file.lastModified) || 0].join("\u0000") : "";
  }

  function registerSource(file, metadata) {
    const key = sourceKey(file);
    if (key) sourceRegistry.set(key, { ...metadata });
    try {
      Object.defineProperty(file, "grconVaultFileId", { value: metadata.id, configurable: true });
    } catch (_) { /* File expandos are optional. */ }
    return file;
  }

  function lookupSource(file) {
    if (!file) return null;
    return sourceRegistry.get(sourceKey(file)) || (file.grconVaultFileId ? { id: file.grconVaultFileId } : null);
  }

  function parseIdentity(fileName) {
    const clean = text(fileName).split(/[\\/]/).pop();
    const dot = clean.lastIndexOf(".");
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const format = dot > 0 ? clean.slice(dot + 1).toLowerCase() : "";
    let documentCode = "";
    let revision = "";

    let match = stem.match(/^(.+?)_(\d{4})_([A-Z0-9#]+)$/i);
    if (match) {
      documentCode = match[1];
      revision = match[3];
    } else {
      match = stem.match(/^(.+?)_([0]|[A-Z]+|#[1-9]\d*|0[1-9]\d*)$/i);
      if (match) {
        documentCode = match[1];
        revision = match[2];
      }
    }
    return {
      documentCode: text(documentCode).toUpperCase(),
      revision: text(revision).toUpperCase(),
      format,
      inferred: Boolean(documentCode && revision),
    };
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
      xhr.onerror = () => reject(Object.assign(new Error("Falha de rede durante o upload."), { code: "NETWORK_ERROR" }));
      xhr.onabort = () => reject(Object.assign(new DOMException("Upload pausado.", "AbortError"), { code: "ABORTED" }));
      xhr.onload = () => {
        let payload = null;
        try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) { payload = { message: xhr.responseText }; }
        if (xhr.status < 200 || xhr.status >= 300 || payload?.ok === false) {
          const error = new Error(payload?.message || ("Falha no upload (" + xhr.status + ")."));
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
      worker.addEventListener("message", event => {
        const message = event.data || {};
        if (message.id !== id) return;
        if (message.type === "progress") {
          const total = Number(message.total) || task.file.size || 1;
          task.progress = Math.min(28, Math.round((Number(message.loaded) || 0) / total * 28));
          task.phase = "Calculando hash";
          renderQueue();
        } else if (message.type === "done") {
          worker.terminate();
          task.hashWorker = null;
          resolve(message.sha256);
        } else if (message.type === "error") {
          worker.terminate();
          task.hashWorker = null;
          reject(new Error(message.message || "Falha ao calcular SHA-256."));
        }
      });
      worker.addEventListener("error", event => {
        worker.terminate();
        task.hashWorker = null;
        reject(new Error(event.message || "Falha no worker de hash."));
      });
      worker.postMessage({ type: "hash", id, file: task.file, chunkSize: 4 * 1024 * 1024 });
    });
  }

  function taskStatusLabel(task) {
    return ({
      pending: "Aguardando",
      needs_metadata: "Revisar identificação",
      hashing: "Calculando hash",
      initializing: "Preparando",
      uploading: "Enviando",
      paused: "Pausado",
      conflict: "Conflito de identidade",
      done: task.duplicate ? "Já existente" : task.reused ? "Binário reaproveitado" : "Concluído",
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

  function enqueueFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file && file.name);
    if (!files.length) return;
    for (const file of files) {
      const identity = parseIdentity(file.name);
      state.queue.push({
        id: root.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)),
        file,
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
      });
    }
    renderQueue();
    pump();
  }

  async function uploadTask(task) {
    if (state.paused || !task || !["pending","paused"].includes(task.status)) return;
    if (!text(task.documentCode) || !text(task.revision)) {
      task.status = "needs_metadata";
      task.phase = "Informe documento e revisão";
      renderQueue();
      return;
    }

    task.status = "hashing";
    task.error = "";
    renderQueue();
    try {
      if (!task.sha256) task.sha256 = await hashFile(task);
      if (state.paused) throw new DOMException("Fila pausada.", "AbortError");

      task.status = "initializing";
      task.phase = "Verificando duplicidade";
      task.progress = Math.max(task.progress, 30);
      renderQueue();

      const init = await requestJson("/init", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspaceId(),
          fileName: task.file.name,
          relativePath: task.file.name,
          documentCode: task.documentCode,
          revision: task.revision,
          format: task.format,
          sha256: task.sha256,
          sizeBytes: task.file.size,
          allowConflict: task.allowConflict,
        }),
      });
      task.serverFile = init.file;
      task.duplicate = Boolean(init.duplicate);
      task.reused = Boolean(init.reused);

      if (init.ready || init.uploadMode === "none") {
        task.status = "done";
        task.progress = 100;
        task.phase = task.duplicate ? "Arquivo idêntico já estava no Cofre" : task.reused ? "Mesmo binário reaproveitado sem duplicar R2" : "Concluído";
        renderQueue();
        return;
      }

      task.status = "uploading";
      task.phase = init.uploadMode === "multipart" ? "Enviando em partes" : "Enviando ao R2";
      renderQueue();
      const common = {
        "x-grcon-file-id": init.file.id,
        "x-grcon-workspace": workspaceId(),
      };

      if (init.uploadMode === "single") {
        await xhrPut("/upload", task.file, task, common, (loaded, total) => {
          task.progress = 32 + Math.round((loaded / Math.max(1, total)) * 66);
          task.phase = "Enviando ao R2";
          renderQueue();
        });
      } else {
        const started = await requestJson("/multipart/start", {
          method: "POST",
          body: JSON.stringify({ workspaceId: workspaceId(), id: init.file.id, contentType: task.file.type || "application/octet-stream" }),
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
          body: JSON.stringify({ workspaceId: workspaceId(), id: init.file.id }),
        });
      }

      task.status = "done";
      task.progress = 100;
      task.phase = "Armazenado e catalogado";
      renderQueue();
    } catch (error) {
      if (error?.name === "AbortError" || error?.code === "ABORTED") {
        task.status = "paused";
        task.phase = "Pausado; pode continuar sem perder partes confirmadas";
      } else if (error?.code === "IDENTITY_CONFLICT") {
        task.status = "conflict";
        task.error = error.message;
        task.phase = "Mesmo documento/revisão com conteúdo diferente";
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
        if (!state.active && state.queue.some(item => item.status === "done")) void refreshList(true);
      });
    }
  }

  function pauseQueue() {
    state.paused = true;
    state.queue.forEach(task => {
      if (task.activeXhr) {
        try { task.activeXhr.abort(); } catch (_) {}
      }
      if (task.hashWorker) {
        try { task.hashWorker.terminate(); } catch (_) {}
        task.hashWorker = null;
        if (task.status === "hashing") {
          task.status = "paused";
          task.phase = "Pausado durante o hash";
          task.sha256 = "";
        }
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
    task[field] = text(value).toUpperCase();
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

  function renderQueue() {
    const host = document.getElementById("vault-queue-body");
    const panel = document.getElementById("vault-queue-panel");
    const pause = document.getElementById("vault-pause");
    const resume = document.getElementById("vault-resume");
    const summary = document.getElementById("vault-queue-summary");
    if (!host || !panel) return;
    panel.hidden = state.queue.length === 0;
    if (pause) pause.hidden = state.paused || !state.queue.some(task => ["pending","hashing","initializing","uploading"].includes(task.status));
    if (resume) resume.hidden = !state.paused;
    const complete = state.queue.filter(task => task.status === "done").length;
    const failed = state.queue.filter(task => ["error","conflict","needs_metadata"].includes(task.status)).length;
    if (summary) summary.textContent = state.queue.length ? complete + " concluído(s) · " + failed + " requer(em) atenção · " + state.active + " ativo(s)" : "";
    host.innerHTML = state.queue.map(task => {
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
  }

  async function checkHealth() {
    const node = document.getElementById("vault-health");
    try {
      const response = await fetch(API + "/health", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      state.health = payload;
      if (node) {
        node.className = payload.ok ? "vault-health ok" : "vault-health error";
        node.textContent = payload.ok ? "Cofre conectado · R2 + Supabase" : (payload.message || "Cofre ainda não configurado no Worker");
      }
      return payload;
    } catch (error) {
      if (node) {
        node.className = "vault-health error";
        node.textContent = "API do Cofre indisponível nesta origem";
      }
      return null;
    }
  }

  async function refreshList(reset) {
    if (state.loading) return;
    if (!accessToken() || !workspaceId()) {
      const body = document.getElementById("vault-list-body");
      if (body) body.innerHTML = '<tr><td colspan="8"><div class="vault-empty">Entre no GRCON para consultar o Cofre.</div></td></tr>';
      return;
    }
    state.loading = true;
    renderListStatus("Consultando Cofre…");
    try {
      if (reset) {
        state.files = [];
        state.next = null;
        state.hasMore = false;
        state.selected.clear();
      }
      const params = new URLSearchParams({
        workspace: workspaceId(),
        limit: String(PAGE_SIZE),
        q: state.query,
        allocation: state.allocation,
      });
      if (!reset && state.next) params.set("after", String(state.next));
      const payload = await requestJson("/list?" + params.toString(), { method: "GET" });
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
    return file.allocated ? "Alocado" : "Não alocado";
  }

  function renderVaultList() {
    const body = document.getElementById("vault-list-body");
    const more = document.getElementById("vault-load-more");
    const selected = document.getElementById("vault-selected-count");
    if (!body) return;
    if (!state.files.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="vault-empty"><strong>Nenhum documento localizado</strong><span>Ajuste os filtros ou envie arquivos para o Cofre.</span></div></td></tr>';
    } else {
      body.innerHTML = state.files.map(file => {
        const id = text(file.id);
        return '<tr>' +
          '<td><input type="checkbox" data-vault-select="' + esc(id) + '" ' + (state.selected.has(id) ? "checked" : "") + ' aria-label="Selecionar ' + esc(file.file_name) + '"></td>' +
          '<td><strong>' + esc(file.document_code || file.identity_code || "—") + '</strong><small>' + esc(file.file_name || "") + '</small></td>' +
          '<td>' + esc(file.revision || "—") + '</td>' +
          '<td>' + esc((file.format || "").toUpperCase() || "—") + '</td>' +
          '<td>' + esc(bytes(file.size_bytes)) + '</td>' +
          '<td><span class="vault-allocation ' + (file.allocated ? "yes" : "no") + '">' + esc(allocationLabel(file)) + '</span></td>' +
          '<td><span title="' + esc(file.sha256 || "") + '">' + esc(text(file.sha256).slice(0, 10) || "—") + '</span></td>' +
          '<td><div class="vault-row-actions"><button type="button" data-vault-open-file="' + esc(id) + '">Abrir</button><button type="button" class="quiet" data-vault-download="' + esc(id) + '">Baixar</button></div></td>' +
          '</tr>';
      }).join("");
    }
    if (more) more.hidden = !state.hasMore;
    if (selected) selected.textContent = state.selected.size ? state.selected.size + " selecionado(s)" : "Nenhum selecionado";
    renderListStatus(state.files.length + " documento(s) carregado(s)" + (state.hasMore ? " · há mais resultados" : ""));
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

  async function useSelectedInGrdt() {
    const selectedRows = state.files.filter(file => state.selected.has(text(file.id)));
    if (!selectedRows.length) {
      notify("Selecione ao menos um documento do Cofre.", "warning");
      return;
    }
    const button = document.getElementById("vault-use-grdt");
    if (button) button.disabled = true;
    renderListStatus("Preparando " + selectedRows.length + " documento(s) para Fazer GRDT…");
    try {
      const downloaded = [];
      for (const item of selectedRows) {
        const blob = await downloadBlob(item);
        const file = new File([blob], item.file_name || (item.document_code + "." + item.format), {
          type: blob.type || "application/octet-stream",
          lastModified: Date.now(),
        });
        registerSource(file, {
          id: item.id,
          documentCode: item.document_code || item.identity_code || "",
          revision: item.revision || "",
          sha256: item.sha256 || "",
          allocated: Boolean(item.allocated),
          source: "vault",
        });
        downloaded.push(file);
      }

      const input = document.getElementById("pdf-input");
      if (!input) throw new Error("Seletor do Fazer GRDT não localizado.");
      const transfer = new DataTransfer();
      const seen = new Set();
      Array.from(input.files || []).concat(downloaded).forEach(file => {
        const key = file.name + "\u0000" + file.size;
        if (seen.has(key)) return;
        seen.add(key);
        transfer.items.add(file);
      });
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      const control = document.querySelector('.grcon-view-tabs [data-grcon-view="control"]') || document.querySelector('[data-grcon-view="control"]');
      if (control) control.click();
      notify(downloaded.length + " documento(s) do Cofre adicionados ao Fazer GRDT.", "success");
    } catch (error) {
      notify(error.message || "Não foi possível usar os documentos no Fazer GRDT.", "error");
    } finally {
      if (button) button.disabled = false;
      renderVaultList();
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
      button.innerHTML = navSvg() + '<span><strong>Cofre</strong><small>Arquivos para GRDT</small></span>';
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
        <div><span>COFRE DE DOCUMENTOS</span><h2>Arquivos preservados para uso no GRCON</h2><p>Envie, localize e reutilize documentos sem abrir o painel da Cloudflare. O arquivo original permanece intacto no R2 privado.</p></div>
        <div id="vault-health" class="vault-health">Verificando conexão…</div>
      </header>
      <section class="vault-upload-card" aria-labelledby="vault-upload-title">
        <header><div><strong id="vault-upload-title">Adicionar documentos</strong><small>Arquivos de uma pasta são armazenados individualmente; a estrutura local não vira pasta no Cofre.</small></div>
          <div class="vault-upload-actions"><button id="vault-pick-files" type="button">Selecionar arquivos</button><button id="vault-pick-folder" type="button" class="secondary-button">Adicionar pasta</button></div>
        </header>
        <input id="vault-files-input" type="file" multiple hidden>
        <input id="vault-folder-input" type="file" multiple webkitdirectory directory hidden>
        <div id="vault-dropzone" class="vault-dropzone" tabindex="0" role="button"><strong>Arraste arquivos ou uma pasta para cá</strong><span>O GRCON calcula SHA-256 antes do envio e evita duplicar o mesmo binário.</span></div>
      </section>
      <section id="vault-queue-panel" class="vault-queue-panel" hidden>
        <header><div><strong>Fila de upload</strong><small id="vault-queue-summary"></small></div><div><button id="vault-pause" type="button" class="secondary-button">Pausar</button><button id="vault-resume" type="button" class="secondary-button" hidden>Retomar</button></div></header>
        <div class="vault-table-wrap"><table><thead><tr><th>Arquivo</th><th>Documento</th><th>Rev.</th><th>Estado</th><th>Progresso</th><th>Ações</th></tr></thead><tbody id="vault-queue-body"></tbody></table></div>
      </section>
      <section class="vault-browser-card">
        <header><div><strong>Documentos no Cofre</strong><small id="vault-list-status">Carregando…</small></div><button id="vault-refresh" type="button" class="secondary-button">Atualizar</button></header>
        <div class="vault-toolbar">
          <label class="vault-search"><span>Pesquisar</span><input id="vault-search" type="search" placeholder="Código, arquivo ou revisão"></label>
          <label><span>Alocação</span><select id="vault-allocation"><option value="all">Todos</option><option value="allocated">Alocados</option><option value="not_allocated">Não alocados</option></select></label>
          <div class="vault-selection-actions"><span id="vault-selected-count">Nenhum selecionado</span><button id="vault-use-grdt" type="button">Usar no Fazer GRDT</button></div>
        </div>
        <div class="vault-table-wrap vault-list-wrap"><table><thead><tr><th></th><th>Documento / arquivo</th><th>Rev.</th><th>Formato</th><th>Tamanho</th><th>Alocação</th><th>SHA-256</th><th>Ações</th></tr></thead><tbody id="vault-list-body"></tbody></table></div>
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
    document.getElementById("brand-subtitle") && (document.getElementById("brand-subtitle").textContent = "Cofre de Documentos");
    document.getElementById("footer-view") && (document.getElementById("footer-view").textContent = "Cofre de Documentos");
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
    await refreshList(true);
  }

  function installEvents() {
    document.getElementById("vault-pick-files")?.addEventListener("click", () => document.getElementById("vault-files-input")?.click());
    document.getElementById("vault-pick-folder")?.addEventListener("click", () => document.getElementById("vault-folder-input")?.click());
    document.getElementById("vault-files-input")?.addEventListener("change", event => { enqueueFiles(event.target.files); event.target.value = ""; });
    document.getElementById("vault-folder-input")?.addEventListener("change", event => { enqueueFiles(event.target.files); event.target.value = ""; });
    const zone = document.getElementById("vault-dropzone");
    zone?.addEventListener("click", () => document.getElementById("vault-files-input")?.click());
    zone?.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); document.getElementById("vault-files-input")?.click(); } });
    ["dragenter","dragover"].forEach(type => zone?.addEventListener(type, event => { event.preventDefault(); zone.classList.add("dragging"); }));
    ["dragleave","drop"].forEach(type => zone?.addEventListener(type, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
    zone?.addEventListener("drop", event => enqueueFiles(event.dataTransfer?.files));
    document.getElementById("vault-pause")?.addEventListener("click", pauseQueue);
    document.getElementById("vault-resume")?.addEventListener("click", resumeQueue);
    document.getElementById("vault-refresh")?.addEventListener("click", () => void refreshList(true));
    document.getElementById("vault-load-more")?.addEventListener("click", () => void refreshList(false));
    document.getElementById("vault-use-grdt")?.addEventListener("click", () => void useSelectedInGrdt());

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
      const select = event.target.closest?.("[data-vault-select]");
      if (select) {
        if (select.checked) state.selected.add(select.dataset.vaultSelect);
        else state.selected.delete(select.dataset.vaultSelect);
        renderVaultList();
      }
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
    });

    document.addEventListener("click", event => {
      const standard = event.target.closest?.("[data-grcon-view]");
      if (standard && state.open) deactivateShell();
    }, true);

    root.addEventListener("grcon:cloud-state", () => {
      if (state.open) {
        void checkHealth();
        void refreshList(true);
      }
    });
  }

  function init() {
    ensureCss();
    installNavigation();
    installModule();
    installEvents();
    renderQueue();
    renderVaultList();
  }

  root.GrconDocumentVault = Object.freeze({
    open: openVault,
    refresh: () => refreshList(true),
    enqueueFiles,
    lookupSource,
    parseIdentity,
    state,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
