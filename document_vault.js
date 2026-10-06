(function (root) {
  "use strict";

  const C = root.TriagemCore;
  const state = {
    initialized: false,
    files: [],
    next: null,
    hasMore: false,
    allocationSnapshot: "",
    selected: new Set(),
    queue: [],
    paused: false,
    running: false,
    searchTimer: 0,
    pickerMode: false,
  };

  const $ = (selector, context) => (context || document).querySelector(selector);
  const escapeHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function notify(message, kind) {
    if (typeof root.GrconNotify === "function") root.GrconNotify(message, kind || "info");
  }

  function cloudContext() {
    const cloud = root.GrconCloud;
    const session = cloud?.state?.session;
    const membership = cloud?.state?.membership;
    if (!session?.access_token || !membership?.workspace_id) {
      throw new Error("Entre no GRCON compartilhado para utilizar o Cofre.");
    }
    return { token: session.access_token, workspaceId: membership.workspace_id, role: membership.role || "viewer" };
  }

  async function api(path, options) {
    const settings = options || {};
    const context = cloudContext();
    const headers = new Headers(settings.headers || {});
    headers.set("authorization", `Bearer ${context.token}`);
    headers.set("x-grcon-workspace", context.workspaceId);
    let body = settings.body;
    if (body && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !(body instanceof FormData) && typeof body !== "string") {
      headers.set("content-type", "application/json");
      body = JSON.stringify({ workspaceId: context.workspaceId, ...body });
    }
    const response = await fetch(`/api/document-vault/${path}`, {
      method: settings.method || "GET",
      headers,
      body,
      signal: settings.signal,
      cache: "no-store",
    });
    if (settings.raw) {
      if (!response.ok) {
        let problem = null;
        try { problem = await response.json(); } catch (_) {}
        throw Object.assign(new Error(problem?.message || `Falha no Cofre (HTTP ${response.status}).`), { status: response.status, code: problem?.error, detail: problem?.detail });
      }
      return response;
    }
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || data?.ok === false) {
      throw Object.assign(new Error(data?.message || `Falha no Cofre (HTTP ${response.status}).`), {
        status: response.status,
        code: data?.error,
        detail: data?.detail,
      });
    }
    return data || {};
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
    return `${(bytes / 1073741824).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
  }

  function normalizedIdentity(file) {
    const name = String(file?.name || "").split(/[\\/]/).pop();
    const stem = name.replace(/\.[^.]+$/, "");
    const withoutRevision = stem
      .replace(/_0001[_ -](?:REV[_ -]?)?(?:#[1-9]\d*|0[1-9]\d*|0|[A-Z]{1,3}\d*)$/i, "")
      .replace(/[_ -]REV(?:ISAO)?[_ -]?(?:#[1-9]\d*|0[1-9]\d*|0|[A-Z]{1,3}\d*)$/i, "");
    const documentCode = C?.key ? C.key(withoutRevision) : withoutRevision.toUpperCase().trim();
    let revision = "";
    const revisionMatch = stem.match(/_0001[_ -](?:REV[_ -]?)?(#[1-9]\d*|0[1-9]\d*|0|[A-Z]{1,3}\d*)$/i)
      || stem.match(/[_ -]REV(?:ISAO)?[_ -]?(#[1-9]\d*|0[1-9]\d*|0|[A-Z]{1,3}\d*)$/i);
    if (revisionMatch) revision = C?.normalizeRevision ? C.normalizeRevision(revisionMatch[1]) : revisionMatch[1].toUpperCase();
    return {
      documentCode,
      revision,
      format: (name.split(".").pop() || "").toLowerCase(),
    };
  }

  function hashFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const worker = new Worker("document_hash_worker.js");
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const close = () => worker.terminate();
      worker.addEventListener("message", (event) => {
        const message = event.data || {};
        if (message.id !== id) return;
        if (message.type === "progress") onProgress?.(message.loaded, message.total);
        if (message.type === "done") { close(); resolve(message.sha256); }
        if (message.type === "error") { close(); reject(new Error(message.message || "Falha ao calcular o hash.")); }
      });
      worker.addEventListener("error", (event) => { close(); reject(event.error || new Error("Falha no worker de hash.")); }, { once: true });
      worker.postMessage({ type: "hash", id, file, chunkSize: 4 * 1024 * 1024 });
    });
  }

  function ensureSurface() {
    if ($("#vault-module")) return;
    const main = $("main.workspace") || $("main") || document.body;
    const section = document.createElement("section");
    section.id = "vault-module";
    section.className = "vault-module";
    section.hidden = true;
    section.innerHTML = `
      <header class="vault-head">
        <div>
          <span class="section-eyebrow">ARMAZENAMENTO DOCUMENTAL</span>
          <h1>Cofre de Documentos</h1>
          <p>Arquivos preservados no R2 privado e catalogados no GRCON. A alocação vem exclusivamente de Documentos Previstos.</p>
        </div>
        <div class="vault-head-actions">
          <button class="secondary-button" id="vault-refresh" type="button">Atualizar</button>
          <button class="primary-button" id="vault-use-selected" type="button" disabled>Usar selecionados no Fazer GRDT</button>
        </div>
      </header>
      <section class="vault-upload-panel" aria-labelledby="vault-upload-title">
        <div class="vault-upload-copy">
          <h2 id="vault-upload-title">Adicionar documentos</h2>
          <p>Selecione arquivos, escolha uma pasta ou arraste uma pasta. A estrutura local não é recriada no Cofre.</p>
        </div>
        <div class="vault-upload-actions">
          <label class="secondary-button vault-file-button">Selecionar arquivos<input id="vault-file-input" type="file" multiple hidden></label>
          <label class="secondary-button vault-file-button">Selecionar pasta<input id="vault-folder-input" type="file" webkitdirectory directory multiple hidden></label>
          <button class="secondary-button" id="vault-pause" type="button" disabled>Pausar fila</button>
        </div>
        <div class="vault-drop-zone" id="vault-drop-zone" tabindex="0">Arraste arquivos ou uma pasta para esta área</div>
        <div class="vault-queue" id="vault-queue" hidden></div>
      </section>
      <section class="vault-browser" aria-labelledby="vault-browser-title">
        <div class="vault-toolbar">
          <div>
            <h2 id="vault-browser-title">Documentos armazenados</h2>
            <small id="vault-source-status">Carregando catálogo…</small>
          </div>
          <label class="vault-search"><span class="sr-only">Pesquisar</span><input id="vault-search" type="search" placeholder="Pesquisar código, arquivo ou revisão"></label>
          <label><span class="sr-only">Filtrar alocação</span><select id="vault-allocation-filter">
            <option value="all">Todos</option>
            <option value="allocated">Alocados</option>
            <option value="not_allocated">Não alocados</option>
          </select></label>
        </div>
        <div class="vault-table-wrap">
          <table class="vault-table">
            <thead><tr><th class="vault-select-col"><span class="sr-only">Selecionar</span></th><th>Documento</th><th>Revisão</th><th>Alocação</th><th>Arquivo original</th><th>Tamanho</th><th>Upload</th><th>Ações</th></tr></thead>
            <tbody id="vault-body"></tbody>
          </table>
          <div class="vault-empty" id="vault-empty" hidden>Nenhum documento encontrado.</div>
        </div>
        <div class="vault-pagination"><span id="vault-page-status"></span><button class="secondary-button" id="vault-load-more" type="button" hidden>Carregar mais</button></div>
      </section>`;
    main.appendChild(section);

    const sideControl = $('.app-nav [data-grcon-view="control"]');
    if (sideControl && !$('.app-nav [data-grcon-view="vault"]')) {
      const button = sideControl.cloneNode(true);
      button.dataset.grconView = "vault";
      button.setAttribute("aria-controls", "vault-module");
      button.classList.remove("active");
      button.setAttribute("aria-current", "false");
      const span = $("span", button);
      if (span) span.textContent = "Cofre";
      sideControl.insertAdjacentElement("afterend", button);
    }
    const compactControl = $('.app-tab-nav [data-grcon-view="control"]');
    if (compactControl && !$('.app-tab-nav [data-grcon-view="vault"]')) {
      const button = compactControl.cloneNode(true);
      button.dataset.grconView = "vault";
      button.setAttribute("aria-controls", "vault-module");
      button.classList.remove("active");
      button.setAttribute("aria-current", "false");
      const span = $("span", button);
      if (span) span.textContent = "Cofre";
      compactControl.insertAdjacentElement("afterend", button);
    }
  }

  function queueStatusLabel(item) {
    const labels = {
      queued: "Na fila", hashing: "Calculando hash", reserving: "Verificando catálogo",
      uploading: "Enviando", paused: "Pausado", done: item.reused ? "Reaproveitado" : item.duplicate ? "Já existente" : "Concluído",
      failed: "Falha", conflict: "Conflito de identidade",
    };
    return labels[item.status] || item.status;
  }

  function renderQueue() {
    const target = $("#vault-queue");
    if (!target) return;
    target.hidden = state.queue.length === 0;
    target.innerHTML = state.queue.map((item) => `
      <div class="vault-queue-row" data-queue-id="${escapeHtml(item.id)}">
        <div class="vault-queue-main"><strong>${escapeHtml(item.file.name)}</strong><small>${escapeHtml(item.message || queueStatusLabel(item))}</small></div>
        <div class="vault-progress"><span style="width:${Math.max(0, Math.min(100, item.progress || 0))}%"></span></div>
        <span class="vault-queue-status vault-status-${escapeHtml(item.status)}">${escapeHtml(queueStatusLabel(item))}</span>
        <div class="vault-queue-actions">
          ${item.status === "failed" ? '<button type="button" data-queue-action="retry">Tentar novamente</button>' : ""}
          ${item.status === "conflict" ? '<button type="button" data-queue-action="variant">Manter variante</button>' : ""}
        </div>
      </div>`).join("");
    const pause = $("#vault-pause");
    if (pause) {
      pause.disabled = !state.running && !state.queue.some((item) => ["queued","hashing","reserving","uploading","paused"].includes(item.status));
      pause.textContent = state.paused ? "Retomar fila" : "Pausar fila";
    }
  }

  async function waitWhilePaused(item) {
    while (state.paused) {
      item.status = "paused";
      item.message = "Fila pausada pelo operador.";
      renderQueue();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  async function uploadQueueItem(item) {
    await waitWhilePaused(item);
    item.status = "hashing";
    item.message = "Calculando SHA-256 sem ler o conteúdo do PDF para conferência.";
    renderQueue();
    const sha256 = await hashFile(item.file, (loaded, total) => {
      item.progress = total ? Math.round((loaded / total) * 20) : 0;
      renderQueue();
    });
    item.sha256 = sha256;
    const identity = normalizedIdentity(item.file);

    await waitWhilePaused(item);
    item.status = "reserving";
    item.message = "Conferindo duplicidade e reservando o catálogo.";
    item.progress = Math.max(item.progress, 22);
    renderQueue();

    let init;
    try {
      init = await api("init", {
        method: "POST",
        body: {
          fileName: item.file.name,
          relativePath: item.relativePath || item.file.name,
          documentCode: identity.documentCode,
          revision: identity.revision,
          format: identity.format,
          sizeBytes: item.file.size,
          sha256,
          allowConflict: Boolean(item.allowConflict),
        },
      });
    } catch (error) {
      if (error.code === "IDENTITY_CONFLICT") {
        item.status = "conflict";
        item.message = "Mesmo documento/revisão/formato já existe com outro conteúdo. Use “Manter variante” somente se quiser preservar os dois.";
        item.progress = 22;
        renderQueue();
        return;
      }
      throw error;
    }

    item.reservation = init.file;
    item.duplicate = Boolean(init.duplicate);
    item.reused = Boolean(init.reused);
    if (init.ready || init.uploadMode === "none") {
      item.status = "done";
      item.progress = 100;
      item.message = init.reused ? "Binário idêntico já existia no R2; apenas o registro lógico foi associado." : "Arquivo idêntico já estava no Cofre; nenhum binário foi duplicado.";
      renderQueue();
      return;
    }

    item.status = "uploading";
    item.message = init.uploadMode === "multipart" ? "Enviando em partes retomáveis." : "Enviando ao R2 privado.";
    renderQueue();

    if (init.uploadMode === "single") {
      const response = await api(`upload?id=${encodeURIComponent(init.file.id)}`, {
        method: "PUT",
        body: item.file,
        raw: false,
        headers: { "content-type": item.file.type || "application/octet-stream", "x-grcon-file-id": init.file.id },
      });
      item.reservation = response.file || init.file;
      item.progress = 100;
      item.status = "done";
      item.message = "Upload concluído e validado no R2.";
      renderQueue();
      return;
    }

    const start = await api("multipart/start", {
      method: "POST",
      body: { id: init.file.id, contentType: item.file.type || "application/octet-stream" },
    });
    const partSize = Number(start.partSize || init.partSize);
    const completedParts = new Set((start.parts || []).map((part) => Number(part.partNumber)));
    const totalParts = Math.max(1, Math.ceil(item.file.size / partSize));
    for (let index = 0; index < totalParts; index += 1) {
      const partNumber = index + 1;
      if (completedParts.has(partNumber)) {
        item.progress = 25 + Math.round((partNumber / totalParts) * 70);
        continue;
      }
      await waitWhilePaused(item);
      item.status = "uploading";
      const startByte = index * partSize;
      const endByte = Math.min(item.file.size, startByte + partSize);
      const blob = item.file.slice(startByte, endByte);
      item.message = `Enviando parte ${partNumber} de ${totalParts}.`;
      renderQueue();
      await api(`multipart/part?id=${encodeURIComponent(init.file.id)}&part=${partNumber}`, {
        method: "PUT",
        body: blob,
        headers: {
          "content-type": "application/octet-stream",
          "x-grcon-file-id": init.file.id,
          "x-grcon-part-number": String(partNumber),
          "x-grcon-part-size": String(blob.size),
        },
      });
      item.progress = 25 + Math.round((partNumber / totalParts) * 70);
      renderQueue();
    }
    const completed = await api("multipart/complete", { method: "POST", body: { id: init.file.id } });
    item.reservation = completed.file || init.file;
    item.progress = 100;
    item.status = "done";
    item.message = "Upload multipart concluído e validado no R2.";
    renderQueue();
  }

  async function processQueue() {
    if (state.running) return;
    state.running = true;
    renderQueue();
    try {
      for (;;) {
        const item = state.queue.find((entry) => entry.status === "queued");
        if (!item) break;
        try { await uploadQueueItem(item); }
        catch (error) {
          item.status = "failed";
          item.message = error?.message || "Falha durante o upload.";
          item.lastError = error;
          renderQueue();
        }
      }
    } finally {
      state.running = false;
      renderQueue();
      if (state.queue.some((item) => item.status === "done")) await loadFiles({ reset: true });
    }
  }

  function addFiles(files) {
    const existing = new Set(state.queue.map((item) => `${item.file.name}::${item.file.size}::${item.file.lastModified}`));
    for (const file of files || []) {
      if (!(file instanceof File) || !file.name || file.size < 0) continue;
      const key = `${file.name}::${file.size}::${file.lastModified}`;
      if (existing.has(key)) continue;
      existing.add(key);
      state.queue.push({
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        relativePath: file.webkitRelativePath || file.name,
        status: "queued",
        progress: 0,
        message: "",
        allowConflict: false,
      });
    }
    renderQueue();
    processQueue();
  }

  function readAllDirectoryEntries(reader) {
    return new Promise((resolve, reject) => {
      const all = [];
      const next = () => reader.readEntries((entries) => {
        if (!entries.length) return resolve(all);
        all.push(...entries);
        next();
      }, reject);
      next();
    });
  }

  async function entryFiles(entry, prefix, out) {
    if (!entry) return;
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      try { Object.defineProperty(file, "_grconRelativePath", { value: `${prefix}${file.name}`, configurable: true }); } catch (_) {}
      out.push(file);
      return;
    }
    if (entry.isDirectory) {
      const children = await readAllDirectoryEntries(entry.createReader());
      for (const child of children) await entryFiles(child, `${prefix}${entry.name}/`, out);
    }
  }

  async function droppedFiles(dataTransfer) {
    const items = Array.from(dataTransfer?.items || []);
    const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return Array.from(dataTransfer?.files || []);
    const result = [];
    for (const entry of entries) await entryFiles(entry, "", result);
    result.forEach((file) => {
      if (file._grconRelativePath) {
        try { Object.defineProperty(file, "webkitRelativePath", { value: file._grconRelativePath, configurable: true }); } catch (_) {}
      }
    });
    return result;
  }

  function renderFiles() {
    const body = $("#vault-body");
    const empty = $("#vault-empty");
    if (!body || !empty) return;
    empty.hidden = state.files.length > 0;
    body.innerHTML = state.files.map((file) => {
      const checked = state.selected.has(file.id);
      return `<tr data-vault-id="${escapeHtml(file.id)}">
        <td class="vault-select-col"><input type="checkbox" data-vault-select="${escapeHtml(file.id)}" ${checked ? "checked" : ""} aria-label="Selecionar ${escapeHtml(file.document_code || file.file_name)}"></td>
        <td><strong>${escapeHtml(file.document_code || "Não identificado")}</strong>${file.identity_conflict ? '<small class="vault-warning">Há variante de conteúdo</small>' : ""}</td>
        <td>${escapeHtml(file.revision || "—")}</td>
        <td><span class="vault-allocation ${file.allocated ? "allocated" : "not-allocated"}">${file.allocated ? "Alocado" : "Não alocado"}</span></td>
        <td><span class="vault-filename" title="${escapeHtml(file.file_name)}">${escapeHtml(file.file_name)}</span></td>
        <td>${formatBytes(file.size_bytes)}</td>
        <td>${file.verified_at ? escapeHtml(new Date(file.verified_at).toLocaleString("pt-BR")) : "—"}</td>
        <td class="vault-row-actions"><button type="button" data-vault-action="open">Abrir</button><button type="button" data-vault-action="download">Baixar</button></td>
      </tr>`;
    }).join("");
    const selectedButton = $("#vault-use-selected");
    if (selectedButton) {
      selectedButton.disabled = state.selected.size === 0;
      selectedButton.textContent = state.selected.size ? `Usar ${state.selected.size} selecionado(s) no Fazer GRDT` : "Usar selecionados no Fazer GRDT";
    }
    const loadMore = $("#vault-load-more");
    if (loadMore) loadMore.hidden = !state.hasMore;
    const status = $("#vault-page-status");
    if (status) status.textContent = `${state.files.length.toLocaleString("pt-BR")} documento(s) carregado(s)`;
    const source = $("#vault-source-status");
    if (source) source.textContent = state.allocationSnapshot
      ? "Alocação calculada pela publicação ativa de Documentos Previstos."
      : "Sem publicação ativa de Documentos Previstos; itens aparecem como não alocados.";
  }

  async function loadFiles(options) {
    const settings = options || {};
    const search = $("#vault-search")?.value || "";
    const allocation = $("#vault-allocation-filter")?.value || "all";
    const after = settings.reset ? 0 : (state.next || 0);
    if (settings.reset) {
      state.files = [];
      state.next = null;
      state.hasMore = false;
      state.selected.clear();
      renderFiles();
    }
    try {
      const data = await api(`list?after=${encodeURIComponent(after)}&limit=100&q=${encodeURIComponent(search)}&allocation=${encodeURIComponent(allocation)}`);
      state.files.push(...(Array.isArray(data.files) ? data.files : []));
      state.next = data.next || null;
      state.hasMore = Boolean(data.has_more);
      state.allocationSnapshot = data.allocation_snapshot || "";
      renderFiles();
    } catch (error) {
      notify(error?.message || "Não foi possível carregar o Cofre.", "error");
      const source = $("#vault-source-status");
      if (source) source.textContent = error?.message || "Cofre indisponível.";
    }
  }

  async function fileBlob(file) {
    const response = await api(`download?id=${encodeURIComponent(file.id)}`, { raw: true });
    return response.blob();
  }

  async function openFile(file, download) {
    const blob = await fileBlob(file);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    if (download) anchor.download = file.file_name || "documento";
    else anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function useSelectedInGrdt() {
    const selected = state.files.filter((file) => state.selected.has(file.id));
    if (!selected.length) return;
    const button = $("#vault-use-selected");
    if (button) button.disabled = true;
    try {
      const items = [];
      let completed = 0;
      for (const row of selected) {
        if (button) button.textContent = `Preparando ${completed + 1} de ${selected.length}…`;
        const blob = await fileBlob(row);
        const file = new File([blob], row.file_name || "documento", { type: blob.type || "application/octet-stream", lastModified: Date.now() });
        items.push({
          file,
          vault: {
            id: row.id,
            documentId: row.id,
            sha256: row.sha256,
            allocated: Boolean(row.allocated),
            allocationSnapshot: state.allocationSnapshot,
            documentCode: row.document_code || "",
            revision: row.revision || "",
          },
        });
        completed += 1;
      }
      if (!root.GrconAnalysisSources?.loadVaultFiles) throw new Error("O Fazer GRDT ainda não está preparado para receber documentos do Cofre.");
      await root.GrconAnalysisSources.loadVaultFiles(items);
      state.pickerMode = false;
      await root.GrconModuleLoader?.ensureModule?.("control");
      notify(`${items.length} documento(s) do Cofre carregado(s) no mesmo motor do Fazer GRDT.`, "success");
    } catch (error) {
      notify(error?.message || "Não foi possível usar os documentos no Fazer GRDT.", "error");
    } finally {
      if (button) {
        button.disabled = state.selected.size === 0;
        button.textContent = state.selected.size ? `Usar ${state.selected.size} selecionado(s) no Fazer GRDT` : "Usar selecionados no Fazer GRDT";
      }
    }
  }

  function bind() {
    $("#vault-file-input")?.addEventListener("change", (event) => {
      addFiles(Array.from(event.target.files || []));
      event.target.value = "";
    });
    $("#vault-folder-input")?.addEventListener("change", (event) => {
      addFiles(Array.from(event.target.files || []));
      event.target.value = "";
    });
    const drop = $("#vault-drop-zone");
    ["dragenter","dragover"].forEach((name) => drop?.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add("is-dragging");
    }));
    ["dragleave","drop"].forEach((name) => drop?.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove("is-dragging");
    }));
    drop?.addEventListener("drop", async (event) => {
      try { addFiles(await droppedFiles(event.dataTransfer)); }
      catch (error) { notify(error?.message || "Não foi possível ler a pasta arrastada.", "error"); }
    });
    $("#vault-pause")?.addEventListener("click", () => {
      state.paused = !state.paused;
      if (!state.paused) state.queue.filter((item) => item.status === "paused").forEach((item) => { item.status = "queued"; });
      renderQueue();
      processQueue();
    });
    $("#vault-refresh")?.addEventListener("click", () => loadFiles({ reset: true }));
    $("#vault-load-more")?.addEventListener("click", () => loadFiles({ reset: false }));
    $("#vault-use-selected")?.addEventListener("click", useSelectedInGrdt);
    $("#vault-search")?.addEventListener("input", () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => loadFiles({ reset: true }), 280);
    });
    $("#vault-allocation-filter")?.addEventListener("change", () => loadFiles({ reset: true }));
    $("#vault-body")?.addEventListener("change", (event) => {
      const id = event.target?.dataset?.vaultSelect;
      if (!id) return;
      if (event.target.checked) state.selected.add(id); else state.selected.delete(id);
      renderFiles();
    });
    $("#vault-body")?.addEventListener("click", async (event) => {
      const action = event.target?.dataset?.vaultAction;
      if (!action) return;
      const rowElement = event.target.closest("[data-vault-id]");
      const file = state.files.find((item) => item.id === rowElement?.dataset?.vaultId);
      if (!file) return;
      try { await openFile(file, action === "download"); }
      catch (error) { notify(error?.message || "Não foi possível abrir o documento.", "error"); }
    });
    $("#vault-queue")?.addEventListener("click", (event) => {
      const action = event.target?.dataset?.queueAction;
      if (!action) return;
      const row = event.target.closest("[data-queue-id]");
      const item = state.queue.find((entry) => entry.id === row?.dataset?.queueId);
      if (!item) return;
      if (action === "retry") {
        item.status = "queued"; item.progress = 0; item.message = ""; processQueue(); renderQueue();
      }
      if (action === "variant") {
        item.allowConflict = true; item.status = "queued"; item.progress = 20;
        item.message = "Variante confirmada pelo operador; preservando as duas versões binárias.";
        processQueue(); renderQueue();
      }
    });
  }

  async function activate(options) {
    ensureSurface();
    if (!state.initialized) {
      bind();
      state.initialized = true;
    }
    state.pickerMode = Boolean(options?.picker);
    await loadFiles({ reset: true });
  }

  function init() {
    ensureSurface();
    if (!state.initialized) {
      bind();
      state.initialized = true;
    }
  }

  root.GrconDocumentVault = Object.freeze({
    state,
    init,
    activate,
    refresh: () => loadFiles({ reset: true }),
    openPicker: async () => {
      state.pickerMode = true;
      await root.GrconModuleLoader?.ensureModule?.("vault");
      await activate({ picker: true });
    },
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
