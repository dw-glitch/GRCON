import type {
  SigemPwAggregateMap,
  SigemPwBase,
  SigemPwBaseMeta,
  SigemPwDocumentClass,
  SigemPwEditableBaseKind,
  SigemPwListKey,
  SigemPwModel,
  SigemPwRecord,
  SigemPwResult,
  SigemPwState,
  SigemPwUiSnapshot,
  WorkerModelPayload,
} from "../types/domain";

const PRE_STAGE7_RESET_KEY = "sigem-pw-stage7-preupdate-reset-v1";
const EMPTY_BASE = (): SigemPwBase => ({ meta: null, records: [] });
const EMPTY_HISTORY = () => ({ version: 3, snapshots: [] as Array<{ meta: SigemPwBaseMeta; records: SigemPwRecord[] }> });

interface XlsxCell { w?: unknown; v?: unknown; }
interface XlsxSheet { "!ref"?: string; [cell: string]: unknown; }
interface XlsxWorkbook { SheetNames: string[]; Sheets: Record<string, XlsxSheet>; }
interface XlsxApi {
  read(buffer: ArrayBuffer, options: Record<string, unknown>): XlsxWorkbook;
  utils: {
    decode_range(ref: string): { s: { r: number; c: number }; e: { r: number; c: number } };
    encode_cell(cell: { r: number; c: number }): string;
    json_to_sheet(data: Array<Record<string, unknown>>): Record<string, unknown>;
    book_new(): unknown;
    book_append_sheet(book: unknown, sheet: unknown, name: string): void;
  };
  writeFile(book: unknown, filename: string, options?: Record<string, unknown>): void;
}

interface RecordedActiveBases {
  sigem?: { snapshot?: { id?: string } };
  pw?: { snapshot?: { id?: string } };
  rollbackToken?: unknown;
  [key: string]: unknown;
}

interface PreparedConferenceImport {
  parsed: { meta: SigemPwBaseMeta; records: SigemPwRecord[] };
  summary?: unknown;
  changes?: unknown;
  [key: string]: unknown;
}

type Subscriber = () => void;

const state: SigemPwState = {
  ready: false,
  busy: false,
  progressMessage: "",
  sigem: EMPTY_BASE(),
  pw: EMPTY_BASE(),
  ld: EMPTY_BASE(),
  history: EMPTY_HISTORY(),
  model: null,
  result: null,
  readiness: null,
  aggregates: null,
  modelGeneration: 0,
  dateEditSystem: "",
  dateEditSnapshotId: "",
  dateEditor: { open: false, system: "", snapshotId: "", value: "" },
  historyDialogOpen: false,
  filters: { documentClass: "", query: "" },
  activeList: "all",
  page: 1,
};

let revision = 0;
let snapshot: SigemPwUiSnapshot = { ...state, revision };
const subscribers = new Set<Subscriber>();
let refreshPromise: Promise<void> | null = null;
let externalListenersInstalled = false;

function Core() {
  const api = window.GrconSigemPwDashboard;
  if (!api) throw new Error("Motor do Dashboard SIGEM × PW indisponível.");
  return api;
}
function Readiness() {
  const api = window.GrconSigemPwReadiness;
  if (!api) throw new Error("Readiness do Dashboard SIGEM × PW indisponível.");
  return api;
}
function text(value: unknown): string { return value == null ? "" : String(value).trim(); }
function fmt(value: number): string { return Number(value || 0).toLocaleString("pt-BR"); }
function messageOf(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }
function emit(): void {
  revision += 1;
  snapshot = { ...state, revision };
  subscribers.forEach((listener) => listener());
}
function notify(message: string, kind = "info"): void {
  if (typeof window.GrconNotify === "function") window.GrconNotify(message, kind);
  else if (kind === "error") window.alert(message);
}
function dispatchMascot(active: boolean, label?: string): void {
  window.dispatchEvent(new CustomEvent("grcon:mascot-operation", {
    detail: { active, state: "sigem-pw-analysis", task: label || "Comparando SIGEM e ProjectWise" },
  }));
}
function setBusy(busy: boolean, label = ""): void {
  state.busy = busy;
  state.progressMessage = busy ? (label || "Processando base…") : "";
  dispatchMascot(busy, label);
  emit();
}
function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => resolve());
    else window.setTimeout(resolve, 0);
  });
}
function xlsx(): XlsxApi {
  const api = window.XLSX as unknown as XlsxApi | undefined;
  if (!api?.read || !api.utils) throw new Error("Biblioteca XLSX indisponível.");
  return api;
}
function workbookMatrix(sheet: XlsxSheet | undefined, maxColumns: number): string[][] {
  const api = xlsx();
  if (!sheet || !sheet["!ref"]) return [];
  const range = api.utils.decode_range(sheet["!ref"]);
  const endColumn = Math.min(range.e.c, Math.max(1, Number(maxColumns) || 40) - 1);
  const output: string[][] = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const values: string[] = [];
    for (let column = range.s.c; column <= endColumn; column += 1) {
      const cell = sheet[api.utils.encode_cell({ r: row, c: column })] as XlsxCell | undefined;
      values[column - range.s.c] = cell ? text(cell.w !== undefined ? cell.w : cell.v) : "";
    }
    output.push(values);
  }
  return output;
}
function localDateTimeValue(value: unknown): string {
  const source = text(value);
  const date = new Date(source);
  if (!source || Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function currentSnapshotId(kind: "sigem" | "pw" | "ld"): string { return text(state[kind].meta?.snapshotId); }
function baseForDateEdit(system: SigemPwEditableBaseKind, snapshotId?: string): SigemPwBase | null {
  const id = text(snapshotId) || currentSnapshotId(system);
  return state.history.snapshots.find((item) => item.meta.kind === system && item.meta.snapshotId === id)
    || (state[system].meta?.snapshotId === id ? state[system] : null);
}

function renderFromModel(resetPage: boolean): void {
  if (!state.model || !state.aggregates) {
    state.result = null;
    state.readiness = null;
    emit();
    return;
  }
  if (resetPage) state.page = 1;
  const aggregateKey = state.filters.documentClass || "all";
  state.result = state.aggregates[aggregateKey];
  state.readiness = Readiness().assess(state, state.aggregates.all);
  emit();
}

function modelInWorker(generation: number): Promise<WorkerModelPayload> {
  if (typeof Worker === "undefined") return Promise.reject(new Error("Worker indisponível"));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("workers/sigem_pw_dashboard.worker.js", document.baseURI));
    } catch (error) {
      reject(error);
      return;
    }
    const cleanup = () => worker.terminate();
    worker.addEventListener("message", (event: MessageEvent<WorkerModelPayload>) => {
      const payload = event.data || { ok: false };
      cleanup();
      if (payload.ok && payload.type === "model" && payload.model && payload.aggregates) resolve(payload);
      else reject(new Error(payload.error || "O Worker não conseguiu montar o comparativo."));
    }, { once: true });
    worker.addEventListener("error", (event) => {
      cleanup();
      reject(event.error || new Error(event.message || "Worker do comparativo falhou."));
    }, { once: true });
    worker.postMessage({
      type: "model",
      generation,
      sigemRecords: state.sigem.records,
      pwRecords: state.pw.records,
      ldRecords: state.ld.records,
    });
  });
}

async function rebuildModelAsync(): Promise<boolean> {
  const generation = ++state.modelGeneration;
  let built: WorkerModelPayload;
  try {
    built = await modelInWorker(generation);
  } catch (error) {
    console.warn("[SIGEM×PW] Worker de comparação indisponível; usando modo compatível:", error);
    await yieldFrame();
    const core = Core();
    const model = core.createModel(state.sigem.records, state.pw.records, state.ld.records);
    built = {
      ok: true,
      type: "model",
      generation,
      model,
      aggregates: {
        all: core.aggregateModel(model),
        ET: core.aggregateModel(model, { documentClass: "ET" }),
        "N-1710": core.aggregateModel(model, { documentClass: "N-1710" }),
      },
    };
  }
  if (generation !== state.modelGeneration || built.generation !== generation || !built.model || !built.aggregates) return false;
  state.model = built.model;
  state.aggregates = built.aggregates;
  return true;
}

async function ensureConferenceRuntime() {
  if (!window.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
  await window.GRCONModuleLoader.ensure("posting_conference_core.js");
  const conference = window.GrconPostingConference;
  if (!conference) throw new Error("Fluxo seguro da Consulta Geral indisponível.");
  return conference;
}
function validateSigemWorkbook(workbook: XlsxWorkbook, conference: NonNullable<typeof window.GrconPostingConference>): void {
  let best: { score: number; columns: Record<string, number> } | null = null;
  workbook.SheetNames.forEach((sheetName) => {
    const detection = conference.detectColumns(workbookMatrix(workbook.Sheets[sheetName], 80).slice(0, 40), 40);
    if (detection && (!best || detection.score > best.score)) best = detection;
  });
  if (!best) throw new Error("Consulta Geral inválida: não foi possível localizar Documento e Revisão nas primeiras linhas.");
  if (["document", "revision", "status", "documentType"].some((field) => (best?.columns[field] ?? -1) < 0)) {
    throw new Error("Consulta Geral inválida: faltam Documento, Revisão, Status ou Tipo de documento. A base vigente foi preservada.");
  }
}

async function rollbackStagedImport(recorded: RecordedActiveBases | null, dashboardWrites: Array<[string, unknown]>): Promise<void> {
  const history = window.GrconSigemPwHistory;
  const failures: string[] = [];
  try {
    if (dashboardWrites.length) await Core().kvSetMany(dashboardWrites);
  } catch (error) {
    failures.push(`base ativa: ${messageOf(error, "falha de restauração")}`);
  }
  try {
    if (recorded?.rollbackToken && history?.rollbackRecordedActiveBases) await history.rollbackRecordedActiveBases(recorded);
  } catch (error) {
    failures.push(`histórico: ${messageOf(error, "falha de restauração")}`);
  }
  if (failures.length) throw new Error(`A recuperação automática não foi concluída (${failures.join("; ")}).`);
}

async function registerHistoryBeforeActivation(
  system: SigemPwEditableBaseKind,
  candidate: SigemPwBase,
  options?: { sigemBase?: SigemPwBase; pwBase?: SigemPwBase; ldRecords?: SigemPwRecord[]; recordedAt?: string; reason?: string },
): Promise<RecordedActiveBases> {
  const history = window.GrconSigemPwHistory;
  const management = window.GrconSigemPwHistoryManagement;
  if (!history?.recordActiveBases || !history.rollbackRecordedActiveBases || !management?.capturePayload) {
    throw new Error("O histórico evolutivo não está disponível. A base vigente foi preservada.");
  }
  const values = options || {};
  const sigemBase = system === "sigem" ? candidate : values.sigemBase || state.sigem;
  const pwBase = system === "pw" ? candidate : values.pwBase || state.pw;
  const ldRecords = values.ldRecords || state.ld.records;
  const recordedAt = text(values.recordedAt) || text(candidate.meta?.importedAt) || new Date().toISOString();
  let recorded: RecordedActiveBases | null = null;
  try {
    recorded = await history.recordActiveBases(sigemBase, pwBase, {
      recordedAt,
      effectiveAt: recordedAt,
      changedSystem: system,
      reason: values.reason || "validated-import-before-activation",
      ldRecords,
    }) as RecordedActiveBases;
    const source = recorded[system];
    const sourceId = source?.snapshot?.id;
    if (!sourceId) throw new Error("Snapshot da base validada não foi confirmado.");
    await management.capturePayload(system, candidate, sourceId, { sigemBase, pwBase, ldRecords });
    return recorded;
  } catch (error) {
    if (recorded?.rollbackToken) {
      try {
        await history.rollbackRecordedActiveBases(recorded);
      } catch (rollbackError) {
        throw new Error(`A nova base não foi ativada, mas a recuperação do histórico falhou. ${messageOf(rollbackError, "Reabra o GRCON antes de tentar novamente.")}`);
      }
    }
    throw new Error(`A nova base foi validada, mas não pôde ser registrada no histórico e não foi ativada. ${messageOf(error, "Tente novamente.")}`);
  }
}

async function parsePwFile(file: File, fileMeta: Record<string, unknown>): Promise<{ meta: SigemPwBaseMeta; records: SigemPwRecord[] }> {
  const core = Core();
  if (typeof Worker === "undefined") return core.parsePwCsv(await file.text(), fileMeta);
  const buffer = await file.arrayBuffer();
  try {
    return await new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL("workers/sigem_pw_dashboard.worker.js", document.baseURI));
      } catch (error) {
        reject(error);
        return;
      }
      const cleanup = () => worker.terminate();
      worker.addEventListener("message", (event: MessageEvent<WorkerModelPayload>) => {
        const payload = event.data || { ok: false };
        cleanup();
        if (payload.ok && payload.parsed) resolve(payload.parsed);
        else reject(new Error(payload.error || "Falha ao processar a base ProjectWise."));
      }, { once: true });
      worker.addEventListener("error", (event) => {
        cleanup();
        reject(event.error || new Error(event.message || "Worker da base ProjectWise falhou."));
      }, { once: true });
      worker.postMessage({ buffer, meta: fileMeta }, [buffer]);
    });
  } catch (error) {
    console.warn("[SIGEM×PW] Worker PW indisponível; usando processamento local:", error);
    return core.parsePwCsv(await file.text(), fileMeta);
  }
}

async function importSigem(file: File): Promise<void> {
  if (state.busy) return;
  setBusy(true, "Validando e indexando a Consulta Geral…");
  await yieldFrame();
  try {
    if (!window.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await window.GRCONModuleLoader.ensure("xlsx");
    const conference = await ensureConferenceRuntime();
    const workbook = xlsx().read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: false });
    validateSigemWorkbook(workbook, conference);
    const importedAt = new Date().toISOString();
    const prepared = await conference.prepareWorkbookImport(
      workbook,
      { fileName: file.name, fileSize: file.size, lastModified: file.lastModified, importedAt },
      window.GrconHistory?.read?.() || [],
      { now: importedAt, reason: "sigem-pw-dashboard" },
    ) as PreparedConferenceImport;
    const candidate: SigemPwBase = { meta: prepared.parsed.meta, records: prepared.parsed.records };
    const previousHistory = state.history;
    const recorded = await registerHistoryBeforeActivation("sigem", candidate, { reason: "sigem-import" });
    const historySourceSnapshotId = recorded.sigem?.snapshot?.id;
    if (!candidate.meta || !historySourceSnapshotId) throw new Error("Snapshot SIGEM validado não foi confirmado.");
    candidate.meta.historySourceSnapshotId = historySourceSnapshotId;
    let saved: SigemPwBase;
    try {
      saved = await Core().saveSigemBase(candidate);
      await conference.commitPreparedImport(prepared);
    } catch (error) {
      try {
        await rollbackStagedImport(recorded, [[Core().SIGEM_BASE_KEY, state.sigem], [Core().HISTORY_KEY, previousHistory]]);
      } catch (rollbackError) {
        throw new Error(`${messageOf(error, "Falha ao ativar a Consulta Geral.")} ${messageOf(rollbackError, "")}`.trim());
      }
      throw new Error(`${messageOf(error, "Falha ao ativar a Consulta Geral.")} A base anterior e o histórico foram restaurados.`);
    }
    state.sigem = saved;
    state.history = await Core().loadHistory();
    await rebuildModelAsync();
    renderFromModel(true);
    window.dispatchEvent(new CustomEvent("grcon:conference-updated", { detail: { summary: prepared.summary, changes: prepared.changes, baseMeta: state.sigem.meta, source: "sigem-pw-dashboard" } }));
    notify(`Consulta Geral atualizada: ${fmt(state.model?.sigemEntries?.size || 0)} registros/revisões ET e N-1710.`, "success");
  } catch (error) {
    console.error("[SIGEM×PW] Consulta Geral:", error);
    notify(messageOf(error, "Não foi possível atualizar a Consulta Geral. A última base válida foi mantida."), "error");
  } finally {
    setBusy(false);
  }
}

async function importPw(file: File): Promise<void> {
  if (state.busy) return;
  setBusy(true, "Validando e indexando a base ProjectWise…");
  await yieldFrame();
  try {
    if (!/\.(?:csv|txt)$/i.test(file.name || "")) throw new Error("A relação ProjectWise deve ser fornecida em CSV.");
    const importedAt = new Date().toISOString();
    const parsed = await parsePwFile(file, { fileName: file.name, fileSize: file.size, lastModified: file.lastModified, importedAt });
    const candidate = Core().sanitizePwBase({ meta: parsed.meta, records: parsed.records }, state.ld);
    const previousHistory = state.history;
    const recorded = await registerHistoryBeforeActivation("pw", candidate, { reason: "pw-import" });
    const historySourceSnapshotId = recorded.pw?.snapshot?.id;
    if (!candidate.meta || !historySourceSnapshotId) throw new Error("Snapshot PW validado não foi confirmado.");
    candidate.meta.historySourceSnapshotId = historySourceSnapshotId;
    let saved: SigemPwBase;
    try {
      saved = await Core().savePwBase(candidate, state.ld);
    } catch (error) {
      try {
        await rollbackStagedImport(recorded, [[Core().PW_BASE_KEY, state.pw], [Core().HISTORY_KEY, previousHistory]]);
      } catch (rollbackError) {
        throw new Error(`${messageOf(error, "Falha ao ativar a base ProjectWise.")} ${messageOf(rollbackError, "")}`.trim());
      }
      throw new Error(`${messageOf(error, "Falha ao ativar a base ProjectWise.")} A base anterior e o histórico foram restaurados.`);
    }
    state.pw = saved;
    state.history = await Core().loadHistory();
    await rebuildModelAsync();
    renderFromModel(true);
    window.dispatchEvent(new CustomEvent("grcon:pw-base-updated", { detail: { baseMeta: state.pw.meta, source: "sigem-pw-dashboard" } }));
    notify(`Base PW atualizada: ${fmt(state.model?.pwEntries?.size || 0)} registros/revisões válidos no universo ET e N-1710.`, "success");
  } catch (error) {
    console.error("[SIGEM×PW] ProjectWise:", error);
    notify(messageOf(error, "Não foi possível atualizar a base ProjectWise. A última base válida foi mantida."), "error");
  } finally {
    setBusy(false);
  }
}

async function importLd(file: File): Promise<void> {
  if (state.busy) return;
  setBusy(true, "Lendo o universo N-1710 da LD da Qualidade…");
  await yieldFrame();
  try {
    if (!window.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await window.GRCONModuleLoader.ensure("xlsx");
    const workbook = xlsx().read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: false });
    const sheetName = workbook.SheetNames.find((name) => Core().normalizeHeader(name) === "N 1710");
    if (!sheetName) throw new Error("LD inválida: a aba N-1710 não foi localizada.");
    const parsed = Core().parseLdMatrix(workbookMatrix(workbook.Sheets[sheetName], 40), {
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      importedAt: new Date().toISOString(),
      sheetName,
    });
    const candidateLd: SigemPwBase = { meta: parsed.meta, records: parsed.records };
    const candidatePw = state.pw.meta ? Core().sanitizePwBase(state.pw, candidateLd) : null;
    const previousHistory = state.history;
    const recorded = candidatePw
      ? await registerHistoryBeforeActivation("pw", candidatePw, { reason: "quality-ld-revalidation", recordedAt: text(parsed.meta.importedAt), ldRecords: candidateLd.records })
      : null;
    let saved: { ld: SigemPwBase; pw: SigemPwBase | null };
    try {
      saved = await Core().saveLdAndReprocessPw(candidateLd, state.pw);
    } catch (error) {
      try {
        await rollbackStagedImport(recorded, [
          [Core().LD_BASE_KEY, state.ld],
          [Core().PW_BASE_KEY, state.pw],
          [Core().HISTORY_KEY, previousHistory],
        ]);
      } catch (rollbackError) {
        throw new Error(`${messageOf(error, "Falha ao ativar a LD da Qualidade.")} ${messageOf(rollbackError, "")}`.trim());
      }
      throw new Error(`${messageOf(error, "Falha ao ativar a LD da Qualidade.")} A LD, o PW anterior e o histórico foram restaurados.`);
    }
    state.ld = saved.ld;
    if (saved.pw) state.pw = saved.pw;
    state.history = await Core().loadHistory();
    await rebuildModelAsync();
    renderFromModel(true);
    if (saved.pw) window.dispatchEvent(new CustomEvent("grcon:pw-base-updated", { detail: { baseMeta: state.pw.meta, source: "sigem-pw-dashboard-ld" } }));
    notify(`LD da Qualidade atualizada: ${fmt(Number(parsed.meta.uniqueDocumentCount) || 0)} códigos N-1710 no universo válido.`, "success");
  } catch (error) {
    console.error("[SIGEM×PW] LD:", error);
    notify(messageOf(error, "Não foi possível atualizar a LD da Qualidade."), "error");
  } finally {
    setBusy(false);
  }
}

async function clearPreStage7BasesOnce(): Promise<boolean> {
  const core = Core();
  const alreadyReset = await core.kvGet(PRE_STAGE7_RESET_KEY, false);
  if (alreadyReset) return false;
  const history = window.GrconSigemPwHistory;
  if (!history?.clearHistory) throw new Error("A limpeza segura do histórico SIGEM × PW não está disponível.");
  await history.clearHistory();
  const emptyBase = EMPTY_BASE();
  await core.kvSetMany([
    [core.SIGEM_BASE_KEY, emptyBase],
    [core.PW_BASE_KEY, emptyBase],
    [core.LD_BASE_KEY, emptyBase],
    [core.HISTORY_KEY, { version: core.HISTORY_VERSION, snapshots: [], deletedIds: [] }],
    [core.LEGACY_SIGEM_BASE_KEY, emptyBase],
    [core.LEGACY_PW_BASE_KEY, emptyBase],
    ["confirmation-state", { version: 1, updatedAt: "", items: {} }],
    ["audit-log", []],
    [PRE_STAGE7_RESET_KEY, { completed: true, completedAt: new Date().toISOString() }],
  ]);
  try { window.localStorage.removeItem("grcon.postingConference.historyIndex.v1"); } catch { /* índice derivado */ }
  return true;
}

async function refresh(reason = ""): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const resetApplied = await clearPreStage7BasesOnce();
      const bases = await Core().loadBases();
      state.sigem = bases.sigem?.meta ? bases.sigem : EMPTY_BASE();
      state.pw = bases.pw?.meta ? bases.pw : EMPTY_BASE();
      state.ld = bases.ld?.meta ? bases.ld : EMPTY_BASE();
      state.history = bases.history || EMPTY_HISTORY();
      await rebuildModelAsync();
      state.ready = true;
      renderFromModel(true);
      if (resetApplied) notify("Bases anteriores SIGEM, PW e LD removidas. O módulo está pronto para novas importações.", "success");
    } catch (error) {
      console.error(`[SIGEM×PW] atualização ${reason}:`, error);
      notify(messageOf(error, "Não foi possível ler as bases persistidas do Dashboard."), "error");
      emit();
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function activate(): Promise<void> {
  const shell = document.getElementById("sigem-pw-dashboard-module");
  if (shell) shell.hidden = false;
  if (!state.ready) {
    setBusy(true, "Carregando bases vigentes…");
    await yieldFrame();
    await refresh("ativação");
    setBusy(false);
  } else {
    renderFromModel(false);
  }
}

function filteredRows(): SigemPwResult["lists"][string] {
  const rows = state.result?.lists?.[state.activeList] || [];
  const query = Core().norm(state.filters.query);
  return query
    ? rows.filter((row) => Core().norm([row.document, row.revision, row.documentClass, row.sigemStatus, row.pwStatus, row.pwEmission, row.situation].join(" ")).includes(query))
    : rows;
}
function pageRows(): { rows: ReturnType<typeof filteredRows>; visible: ReturnType<typeof filteredRows>; pages: number; start: number } {
  const rows = filteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / 100));
  if (state.page > pages) state.page = pages;
  if (state.page < 1) state.page = 1;
  const start = (state.page - 1) * 100;
  return { rows, visible: rows.slice(start, start + 100), pages, start };
}
function setQuery(value: string): void {
  state.filters.query = value;
  state.page = 1;
  emit();
}
function setDocumentClass(value: SigemPwDocumentClass): void {
  state.filters.documentClass = value;
  state.page = 1;
  renderFromModel(false);
}
function clearFilters(): void {
  state.filters.documentClass = "";
  state.filters.query = "";
  state.page = 1;
  renderFromModel(false);
}
function setActiveList(value: SigemPwListKey): void {
  state.activeList = value;
  state.page = 1;
  emit();
}
function setPage(page: number): void {
  state.page = Math.max(1, Math.floor(page || 1));
  emit();
}

async function exportCurrentList(): Promise<void> {
  try {
    const rows = filteredRows();
    if (!rows.length) {
      notify("Não há registros na lista filtrada para exportar.", "info");
      return;
    }
    if (!window.GRCONModuleLoader) throw new Error("Carregador de módulos do GRCON indisponível.");
    await window.GRCONModuleLoader.ensure("xlsx");
    const api = xlsx();
    const data = rows.map((row) => ({
      Classe: row.documentClass,
      Documento: row.document,
      "Revisão": row.revision,
      "Status SIGEM": row.sigemStatus,
      "Status PW": row.pwStatus,
      "Emissão PW": row.pwEmission,
      "Situação": row.situation,
    }));
    const worksheet = api.utils.json_to_sheet(data);
    (worksheet as Record<string, unknown>)["!cols"] = [{ wch: 11 }, { wch: 58 }, { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 34 }];
    const workbook = api.utils.book_new();
    api.utils.book_append_sheet(workbook, worksheet, "Relação");
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    api.writeFile(workbook, `GRCON_SIGEM_PW_${state.activeList}_${stamp}.xlsx`, { compression: true });
    notify(`Lista exportada com ${fmt(rows.length)} registros.`, "success");
  } catch (error) {
    console.error("[SIGEM×PW] exportação:", error);
    notify(messageOf(error, "Não foi possível exportar a lista."), "error");
  }
}

async function openHistory(): Promise<void> {
  state.history = await Core().loadHistory();
  state.historyDialogOpen = true;
  emit();
}
function closeHistory(): void {
  state.historyDialogOpen = false;
  emit();
}
async function removeSnapshot(id: string): Promise<void> {
  const item = state.history.snapshots.find((entry) => entry.meta.snapshotId === id);
  if (!item || !window.confirm(`Excluir a base “${text(item.meta.fileName) || "sem nome"}” do histórico?`)) return;
  try {
    await Core().deleteSnapshot(id);
    await refresh("base excluída");
    state.history = await Core().loadHistory();
    emit();
    notify("Base excluída do histórico.", "success");
  } catch (error) {
    notify(messageOf(error, "Não foi possível excluir a base do histórico."), "error");
  }
}

function openBaseDateEditor(system: SigemPwEditableBaseKind, snapshotId?: string): void {
  const base = baseForDateEdit(system, snapshotId);
  if (!base?.meta) {
    notify(`Ainda não existe uma base ${system === "sigem" ? "SIGEM" : "PW"} para editar.`, "warning");
    return;
  }
  const id = text(base.meta.snapshotId);
  state.dateEditSystem = system;
  state.dateEditSnapshotId = id;
  state.dateEditor = { open: true, system, snapshotId: id, value: localDateTimeValue(base.meta.importedAt) };
  emit();
}
function closeBaseDateEditor(): void {
  state.dateEditor = { ...state.dateEditor, open: false };
  emit();
}
function setBaseDateValue(value: string): void {
  state.dateEditor = { ...state.dateEditor, value };
  emit();
}

async function saveBaseDate(): Promise<void> {
  const system = state.dateEditor.system;
  const snapshotId = state.dateEditor.snapshotId;
  const parsed = new Date(state.dateEditor.value);
  if ((system !== "sigem" && system !== "pw") || !snapshotId || Number.isNaN(parsed.getTime())) {
    notify("Informe uma data e hora válidas para a base.", "warning");
    return;
  }
  const original = baseForDateEdit(system, snapshotId);
  const originalDate = text(original?.meta?.importedAt);
  let dashboardUpdated = false;
  let historyUpdated = false;
  let historySnapshotId = "";
  setBusy(true, "Atualizando data operacional da base…");
  try {
    const result = await Core().updateSnapshotDate(system, snapshotId, parsed.toISOString());
    dashboardUpdated = true;
    const history = window.GrconSigemPwHistory;
    if (!history?.updateSourceSnapshotDate) throw new Error("O histórico evolutivo não está disponível; a data anterior foi preservada.");
    historySnapshotId = text(original?.meta?.historySourceSnapshotId)
      || (history.contentFingerprint ? `${system}:${history.contentFingerprint(system, original?.records || [])}` : "");
    const historyResult = historySnapshotId ? await history.updateSourceSnapshotDate(system, historySnapshotId, parsed.toISOString()) : null;
    if (!historyResult) throw new Error("A base não foi localizada no histórico evolutivo; a data anterior foi preservada.");
    historyUpdated = true;
    state.history = await Core().loadHistory();
    if (state[system].meta?.snapshotId === snapshotId && result.current?.meta) state[system] = result.current;
    state.dateEditor = { ...state.dateEditor, open: false };
    renderFromModel(false);
    window.dispatchEvent(new CustomEvent("grcon:sigem-pw-base-date-updated", { detail: { system, snapshotId, importedAt: result.importedAt } }));
    notify(`Data da base ${system === "sigem" ? "SIGEM" : "PW"} atualizada.`, "success");
  } catch (error) {
    const history = window.GrconSigemPwHistory;
    if (historyUpdated && historySnapshotId && originalDate && history?.updateSourceSnapshotDate) {
      try { await history.updateSourceSnapshotDate(system, historySnapshotId, originalDate); }
      catch (rollbackError) { console.error("[SIGEM×PW] restauração da data evolutiva:", rollbackError); }
    }
    if (dashboardUpdated && originalDate) {
      try { await Core().updateSnapshotDate(system, snapshotId, originalDate); }
      catch (rollbackError) { console.error("[SIGEM×PW] restauração da data:", rollbackError); }
    }
    console.error("[SIGEM×PW] edição da data:", error);
    notify(messageOf(error, "Não foi possível atualizar a data da base."), "error");
  } finally {
    setBusy(false);
  }
}

async function openEvolution(): Promise<void> {
  await window.GrconSigemPwDashboardBootstrap?.openEvolution?.();
}

function installExternalListeners(): () => void {
  if (externalListenersInstalled) return () => undefined;
  externalListenersInstalled = true;
  const conference = (event: Event) => {
    const detail = (event as CustomEvent<{ source?: string }>).detail;
    if (detail?.source !== "sigem-pw-dashboard") void refresh("Consulta Geral atualizada em outro módulo");
  };
  const pw = (event: Event) => {
    const detail = (event as CustomEvent<{ source?: string }>).detail;
    if (detail?.source !== "sigem-pw-dashboard" && detail?.source !== "sigem-pw-dashboard-ld") void refresh("base PW atualizada em outro módulo");
  };
  window.addEventListener("grcon:conference-updated", conference);
  window.addEventListener("grcon:pw-base-updated", pw);
  return () => {
    window.removeEventListener("grcon:conference-updated", conference);
    window.removeEventListener("grcon:pw-base-updated", pw);
    externalListenersInstalled = false;
  };
}

export const sigemPwDashboardAdapter = {
  state,
  subscribe(listener: Subscriber): () => void { subscribers.add(listener); return () => subscribers.delete(listener); },
  getSnapshot(): SigemPwUiSnapshot { return snapshot; },
  activate,
  refresh,
  clearPreStage7BasesOnce,
  importSigem,
  importPw,
  importLd,
  setQuery,
  setDocumentClass,
  clearFilters,
  setActiveList,
  setPage,
  filteredRows,
  pageRows,
  exportCurrentList,
  openHistory,
  closeHistory,
  removeSnapshot,
  openBaseDateEditor,
  closeBaseDateEditor,
  setBaseDateValue,
  saveBaseDate,
  openEvolution,
  subscribeExternalEvents: installExternalListeners,
};

export type SigemPwDashboardAdapter = typeof sigemPwDashboardAdapter;
