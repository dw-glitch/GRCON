(function (root) {
  "use strict";
  const Core = root.GrconSharedSigemQueryCore;
  const state = { shared: null, local: null, history: [], stale: false, error: "", busy: false, workspace: "", context: Core.context(), refreshPromise: null };
  let epoch = 0;
  let lastEmission = "";
  let indexedShared = null, indexedLocal = null;
  const CONFERENCE_WORKSPACE_KEY = "shared-sigem-conference-workspace";
  function cloud() { return root.GrconCloud; }
  function emit() {
    const stamp = [state.workspace, state.shared?.meta?.snapshotId, state.local?.meta?.importedAt, state.stale, state.error].join("|");
    if (stamp === lastEmission) return;
    lastEmission = stamp;
    if (indexedShared !== state.shared || indexedLocal !== state.local) {
      state.context = Core.context(state.shared, state.local);
      indexedShared = state.shared; indexedLocal = state.local;
    }
    root.dispatchEvent(new CustomEvent("grcon:shared-sigem-updated", { detail: { meta: current()?.meta, stale: state.stale, error: state.error } }));
  }
  function current() { return state.shared || state.local; }
  function canPublish() { return cloud()?.state?.membership?.role === "owner"; }
  function cacheKey(workspace) { return `shared-sigem-query:${workspace}`; }
  async function runtime() {
    await root.GRCONModuleLoader.ensure("posting_conference_core.js");
    return root.GrconPostingConference;
  }
  async function request(name, args) {
    let timer;
    try {
      const response = await Promise.race([
        cloud().state.client.rpc(`grcon_sigem_query_${name}`, args),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("O banco não respondeu a tempo. A última base válida permanece disponível.")), 45000); }),
      ]);
      if (response.error) throw response.error;
      return response.data;
    } finally { clearTimeout(timer); }
  }
  async function cacheGet(workspace) {
    const conference = await runtime();
    return conference.kvGet(cacheKey(workspace), null);
  }
  async function cachePut(workspace, base) {
    const conference = await runtime();
    await conference.kvSet(cacheKey(workspace), base);
  }
  async function activateConferenceWorkspace(workspace) {
    const conference = await runtime();
    const previous = await conference.kvGet(CONFERENCE_WORKSPACE_KEY, "");
    if (previous && previous !== workspace) {
      await conference.kvSetMany([
        [conference.BASE_KEY, { meta: null, records: [] }],
        [conference.STATE_KEY, { version: 1, updatedAt: "", items: {} }],
        [conference.AUDIT_KEY, []],
        [CONFERENCE_WORKSPACE_KEY, workspace || ""],
      ]);
      try { root.localStorage.removeItem(conference.HISTORY_INDEX_KEY); } catch (_) { /* armazenamento opcional */ }
      root.dispatchEvent(new CustomEvent("grcon:conference-workspace-reset", { detail: { previous, workspace: workspace || "" } }));
      return;
    }
    if (workspace && previous !== workspace) await conference.kvSet(CONFERENCE_WORKSPACE_KEY, workspace);
    if (!workspace && previous) await conference.kvSet(CONFERENCE_WORKSPACE_KEY, "");
  }
  function reset() {
    epoch++;
    state.shared = null; state.local = null; state.workspace = ""; state.stale = false; state.error = "";
    state.context = Core.context();
    emit();
  }
  async function refresh() {
    const membership = cloud()?.state?.membership;
    const workspace = membership?.workspace_id;
    if (!workspace) {
      try { await activateConferenceWorkspace(""); } catch (error) { console.warn("Consulta Geral: não foi possível limpar a projeção da Conferência ao sair do workspace", error); }
      reset();
      return null;
    }
    if (state.refreshPromise && state.workspace === workspace) return state.refreshPromise;
    if (state.workspace !== workspace) {
      try { await activateConferenceWorkspace(workspace); }
      catch (error) { console.warn("Consulta Geral: não foi possível isolar a projeção da Conferência por workspace", error); }
      reset();
      state.workspace = workspace;
    }
    const ticket = epoch;
    const valid = () => ticket === epoch && cloud()?.state?.membership?.workspace_id === workspace;
    const promise = (async () => {
      try {
        try {
          if (!state.local) {
            const local = await (await runtime()).kvGet(`local-sigem-query:${workspace}`, null);
            if (local && valid()) { Core.validate(local); state.local = local; emit(); }
          }
          if (!state.shared) {
            const cached = await cacheGet(workspace);
            if (cached && valid()) { Core.validate(cached); state.shared = cached; state.stale = true; emit(); }
          }
        } catch (error) { console.warn("Consulta Geral: cache indisponível; consultando o banco", error); }
        if (!cloud()?.state?.online) throw new Error("Sem conexão. Usando a última Consulta Geral válida em cache.");
        const data = await request("current", { target_workspace: workspace });
        const meta = Array.isArray(data) ? data[0] : data;
        if (!valid()) return null;
        if (!meta?.snapshot_id) {
          const hadShared = Boolean(state.shared);
          state.shared = null; state.stale = false; state.error = "";
          try { await cachePut(workspace, null); } catch (_) { /* cache opcional */ }
          if (hadShared) emit();
          return current();
        }
        if (state.shared?.meta?.snapshotId === meta.snapshot_id) {
          const dateChanged = state.shared.meta.referenceDate !== meta.metadata?.referenceDate;
          const changed = state.stale || state.error;
          state.stale = false; state.error = "";
          if (dateChanged) {
            state.shared.meta = { ...state.shared.meta, ...meta.metadata };
            await cachePut(workspace, state.shared);
            root.dispatchEvent(new CustomEvent("grcon:shared-sigem-date-updated", { detail: { meta: state.shared.meta } }));
          }
          if (changed) emit();
          return state.shared;
        }
        const records = [];
        let after = 0;
        while (records.length < meta.record_count) {
          const page = await request("page", { target_workspace: workspace, target_snapshot: meta.snapshot_id, after_row: after, page_size: 1000 });
          if (!Array.isArray(page) || !page.length) throw new Error("A Consulta Geral recebida está incompleta.");
          for (const entry of page) { if (entry.row_number <= after) throw new Error("Paginação inválida."); records.push(entry.payload); after = entry.row_number; }
        }
        if (records.length !== meta.record_count) throw new Error("Contagem da Consulta Geral divergente.");
        const base = Core.validate({ meta: { ...meta.metadata, snapshotId: meta.snapshot_id, fileName: meta.file_name,
          importedAt: meta.metadata?.importedAt || meta.published_at, publishedAt: meta.published_at, recordCount: meta.record_count, source: "shared-general-query" }, records });
        if (!valid()) return null;
        let cacheWarning = "";
        try { await cachePut(workspace, base); }
        catch (_) { cacheWarning = "Consulta Geral atual carregada. O cache offline não pôde ser atualizado."; }
        if (!valid()) return null;
        state.shared = base; state.stale = false; state.error = cacheWarning; emit(); return base;
      } catch (error) {
        if (!valid()) return null;
        state.stale = Boolean(state.shared); state.error = String(error.message || error); emit(); return current();
      }
    })();
    state.refreshPromise = promise;
    try { return await promise; } finally { if (state.refreshPromise === promise) state.refreshPromise = null; }
  }
  async function refreshLatest() {
    const pending = state.refreshPromise;
    if (pending) {
      try { await pending; } catch (_) { /* a nova leitura abaixo decide a fonte válida */ }
    }
    return refresh();
  }
  async function setLocal(base) {
    Core.validate(base);
    state.local = { meta: { ...base.meta, source: "local-general-query" }, records: base.records };
    const workspace = cloud()?.state?.membership?.workspace_id;
    if (workspace) {
      try { await (await runtime()).kvSet(`local-sigem-query:${workspace}`, state.local); }
      catch (_) { state.error = "Consulta Geral local disponível nesta sessão; o cache não pôde ser salvo."; }
    }
    emit();
    return current();
  }
  async function parseFile(file) {
    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) throw new Error("Selecione uma Consulta Geral Excel (.xlsx ou .xls).");
    const buffer = await file.arrayBuffer();
    const meta = { fileName: file.name, fileSize: file.size, lastModified: file.lastModified, importedAt: new Date().toISOString() };
    if (typeof Worker === "function") {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("workers/shared_sigem_query.worker.js", document.baseURI));
        const timer = setTimeout(() => { worker.terminate(); reject(new Error("Tempo excedido ao ler a Consulta Geral.")); }, 120000);
        const done = () => { clearTimeout(timer); worker.terminate(); };
        worker.onmessage = (event) => { done(); try { event.data.ok ? resolve(Core.validate(event.data.base)) : reject(new Error(event.data.error)); } catch (error) { reject(error); } };
        worker.onerror = (event) => { done(); reject(new Error(event.message || "Falha no leitor da Consulta Geral.")); };
        worker.postMessage({ buffer, meta }, [buffer]);
      });
    }
    const conference = await runtime();
    await root.GRCONModuleLoader.ensure("xlsx");
    const parsed = conference.parseWorkbook(root.XLSX.read(buffer, { type: "array" }), meta);
    if (!parsed.ok) throw new Error(parsed.errors.join(" "));
    return Core.validate({ meta: parsed.meta, records: parsed.records });
  }
  async function publish(base) {
    Core.validate(base);
    if (!canPublish()) throw new Error("Somente o proprietário pode publicar a Consulta Geral compartilhada.");
    if (!cloud().state.online) throw new Error("Conecte-se para publicar a Consulta Geral.");
    if (state.busy) throw new Error("Já existe uma publicação em andamento.");
    state.busy = true;
    const target_workspace = cloud().state.membership.workspace_id;
    try {
      const expected = await request("current", { target_workspace });
      const active = Array.isArray(expected) ? expected[0] : expected;
      const digest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(base.records)));
      const checksum = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
      const upload_id = await request("begin", { target_workspace, source_file: base.meta.fileName,
        expected_count: base.records.length, source_metadata: { ...base.meta, checksum }, expected_active: active?.snapshot_id || null });
      const ensureWorkspace = () => {
        if (cloud()?.state?.membership?.workspace_id !== target_workspace) throw new Error("A área de trabalho mudou durante o envio. A base anterior permanece ativa.");
      };
      for (let offset = 0; offset < base.records.length; offset += 500) {
        ensureWorkspace();
        await request("chunk", { target_workspace, upload_id, first_row: offset + 1, rows: base.records.slice(offset, offset + 500) });
        root.dispatchEvent(new CustomEvent("grcon:shared-sigem-progress", { detail: { done: Math.min(offset + 500, base.records.length), total: base.records.length } }));
      }
      ensureWorkspace();
      await request("publish", { target_workspace, upload_id });
      await refreshLatest();
      if (state.shared?.meta?.snapshotId !== upload_id) {
        const error = new Error("A base foi publicada, mas o download ainda não foi confirmado. Atualize a página para consultá-la.");
        error.published = true; throw error;
      }
      state.local = null;
      try { await (await runtime()).kvSet(`local-sigem-query:${target_workspace}`, null); }
      catch (_) { console.warn("Consulta Geral publicada; não foi possível limpar a prévia local em cache."); }
      emit(); return state.shared;
    } finally { state.busy = false; }
  }
  async function listHistory() {
    const workspace = cloud()?.state?.membership?.workspace_id;
    if (!workspace || !cloud()?.state?.online) return state.history || [];
    const data = await request("history", { target_workspace: workspace });
    state.history = (Array.isArray(data) ? data : []).map((item) => ({
      snapshotId: item.snapshot_id, fileName: item.file_name, recordCount: Number(item.record_count || 0),
      uniqueDocumentCount: Number(item.unique_document_count || 0), etCount: Number(item.et_count || 0), n1710Count: Number(item.n1710_count || 0),
      publishedAt: item.published_at, createdAt: item.created_at, createdBy: item.created_by,
      createdByName: item.created_by_name || "", createdByEmail: item.created_by_email || "",
      metadata: item.metadata || {}, status: item.status, isActive: Boolean(item.is_current ?? item.is_active),
    }));
    return state.history;
  }
  async function activateSnapshot(snapshotId) {
    const workspace = cloud()?.state?.membership?.workspace_id;
    if (!canPublish()) throw new Error("Somente o proprietário pode selecionar a Consulta Geral ativa.");
    if (!workspace || !snapshotId) throw new Error("Consulta Geral inválida.");
    await request("activate", { target_workspace: workspace, target_snapshot: snapshotId });
    state.shared = null; state.stale = false; state.error = "";
    try { await cachePut(workspace, null); } catch (_) {}
    await refreshLatest(); await listHistory(); return state.shared;
  }
  async function deleteSnapshot(snapshotId) {
    const workspace = cloud()?.state?.membership?.workspace_id;
    if (!canPublish()) throw new Error("Somente o proprietário pode excluir Consultas Gerais compartilhadas.");
    if (!workspace || !snapshotId) throw new Error("Consulta Geral inválida.");
    const deletedCurrent = state.shared?.meta?.snapshotId === snapshotId;
    const result = await request("delete", { target_workspace: workspace, target_snapshot: snapshotId });
    state.shared = null; state.stale = false; state.error = "";
    try { await cachePut(workspace, null); } catch (_) {}
    if (deletedCurrent && !result?.activeSnapshotId) {
      state.local = null;
      try { await (await runtime()).kvSet(`local-sigem-query:${workspace}`, null); } catch (_) {}
    }
    await refreshLatest(); await listHistory();
    root.dispatchEvent(new CustomEvent("grcon:shared-sigem-deleted", { detail: result || { deletedSnapshotId: snapshotId } }));
    return result;
  }
  async function setReferenceDate(value) {
    const base = current(), workspace = cloud()?.state?.membership?.workspace_id;
    if (!base || !["owner", "admin"].includes(cloud()?.state?.membership?.role)) throw new Error("Sem permissão para editar a data.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Informe a data da Consulta Geral.");
    if (state.shared) {
      const metadata = await request("set_date", { target_workspace: workspace, target_snapshot: base.meta.snapshotId, reference_date: value, expected_date: base.meta.referenceDate || null });
      if (workspace !== cloud()?.state?.membership?.workspace_id) return;
      base.meta = { ...base.meta, ...metadata };
      await cachePut(workspace, base);
    } else {
      base.meta = { ...base.meta, referenceDate: value };
      await (await runtime()).kvSet(`local-sigem-query:${workspace}`, base);
    }
    root.dispatchEvent(new CustomEvent("grcon:shared-sigem-date-updated", { detail: { meta: base.meta } }));
  }
  root.GrconSharedSigemQuery = Object.freeze({ state, current, sharedCurrent: () => state.shared, refresh, refreshLatest, reset, canPublish, parseFile, setLocal, publish, listHistory, activateSnapshot, deleteSnapshot, setReferenceDate,
    context: () => state.context,
    sourceLabel: (source) => ({ "shared-general-query": "Consulta Geral compartilhada", "local-general-query": "Consulta Geral local", "legacy-fallback": "LD / Colar SIGEM", manual: "Manual" })[source] || "LD / Colar SIGEM",
    resolveSigemStatus: (document, revision, fallback) => Core.resolve(document, revision, state.context, fallback) });
  root.addEventListener("grcon:cloud-ready", () => void refresh());
  root.addEventListener("online", () => void refresh());
  root.document.addEventListener("visibilitychange", () => { if (!root.document.hidden) void refresh(); });
  setInterval(() => { if (!root.document.hidden && cloud()?.state?.membership) void refresh(); }, 60000);
})(window);
