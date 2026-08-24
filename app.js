(function () {
  "use strict";

  const C = window.TriagemCore;
  const T = window.TimelineCore;
  const L = window.GrconLdCompatibility;
  const E = window.GrconEmission;
  const Q = window.GrconTitleQuality;
  const D = window.GrconDatabookSupport;
  const Workspace = window.GrconWorkspace;
  const OutputGuard = window.GrconOutputGuard;
  const ConflictCore = window.LDConflictCore;
  const ReportSummary = window.GrconReportSummary;
  const PackageLayout = window.GrconPackageLayout;
  const SequenceCore = window.GrconEgrdtSequenceCore;
  const History = window.GrconHistory;
  const Posting = window.GrconSigemPosting;
  const AnalysisHistory = window.GrconAnalysisHistory;
  const PendingAllocationPackage = window.GrconPendingAllocationPackage;
  const PendingAllocationHistory = window.GrconPendingAllocationHistory;
  const FileAccess = window.GrconFileAccess;
  const Apendice = window.GrconApendice;
  const APP_VERSION = "5.33.15";
  const DOCUMENT_ENGINE_VERSION = "5.18.2"; // versão interna do motor documental, independente da versão do aplicativo
  try { window.localStorage.removeItem("grcon.databook.learning.v1"); } catch (_) { console.debug("[App] limpeza versão anterior:", _); /* limpeza de versão anterior */ }
  const DEFAULT_ITEMS_PER_EGRDT = 48;
  const EGRDT_BATCH_LIMIT_KEY = "grcon.egrdt.batch-limit.v1";

  // Sem limite máximo imposto pelo aplicativo: o usuário escolhe livremente
  // quantos documentos entram em cada eGRDT. Só se garante um inteiro >= 1.
  function normalizeEgrdtBatchLimit(value) {
    if (value === null || value === undefined || String(value).trim() === "") return DEFAULT_ITEMS_PER_EGRDT;
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed)) return DEFAULT_ITEMS_PER_EGRDT;
    return Math.max(1, parsed);
  }

  function readEgrdtBatchLimit() {
    try { return normalizeEgrdtBatchLimit(localStorage.getItem(EGRDT_BATCH_LIMIT_KEY)); }
    catch (_) { console.debug("[App] readEgrdtBatchLimit:", _); return DEFAULT_ITEMS_PER_EGRDT; }
  }

  function currentEgrdtBatchLimit() {
    return normalizeEgrdtBatchLimit(state && state.egrdtBatchLimit);
  }
  const LARGE = window.GrconLargeInput;
  let PerformanceCore = window.GrconPerformance;
  async function ensureRuntime(group) {
    if (window.GRCONModuleLoader) await window.GRCONModuleLoader.ensure(group);
    if (group === "performance" || group === "report" || group === "export") PerformanceCore = window.GrconPerformance || PerformanceCore;
    return true;
  }
  const PROCESS_CHUNK_SIZE = LARGE && LARGE.DEFAULT_CHUNK_SIZE || 300;
  const RESULT_PAGE_SIZE = LARGE && LARGE.DEFAULT_PAGE_SIZE || 250;
  const ANALYSIS_VALIDITY_MS = 30 * 60 * 1000;
  const SMART_ANALYSIS_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
  const VIRTUAL_MIN_ITEMS = 180;
  if (typeof Promise.allSettled !== "function") {
    Promise.allSettled = (values) => Promise.all([...values].map((value) => Promise.resolve(value).then(
      (result) => ({ status: "fulfilled", value: result }),
      (reason) => ({ status: "rejected", reason }),
    )));
  }
  const state = {
    ldFiles: [],
    listFiles: [],
    textEntries: [],
    relationDraft: "",
    relationSavedText: "",
    relationPreview: { entries: [], duplicates: [], ignored: [] },
    packageCandidates: [],
    packageSelectionPending: false,
    packageSelectionReady: false,
    packageFiles: [],
    ignoredFiles: [],
    listIgnoredFiles: [],
    listSummary: null,
    records: [],
    history: [],
    index: null,
    results: [],
    pendingAllocationBundle: { rows: [], entries: [], documentCount: 0, pdfCount: 0 },
    filter: "todos",
    sheetFilter: "todos",
    search: "",
    columnFilters: {},
    recentDays: 30,
    busy: false,
    expanded: new Set(),
    selected: new Set(),
    drawerIndices: [],
    drawerTitleSuggestion: "",
    drawerDatabookSuggestion: null,
    databookCatalogEntries: [],
    databookCatalogPromise: null,
    ldIntegrity: null,
    analysisAt: 0,
    analysisValidUntil: 0,
    analysisRecentDays: 30,
    analysisLdSignature: "",
    sgparQueue: [],
    sgparCurrent: 0,
    sgparLoading: false,
    sgparAddedFiles: [],
    egrdtSequenceCursor: 0,
    manualEgrdtSequenceStart: null,
    manualEgrdtSequences: [],
    conflictResolutions: new Map(),
    resultPage: 1,
    resultVersion: 0,
    filteredCache: { signature: "", indices: [] },
    virtual: { rowHeight: 68, overscan: 14, start: 0, end: 0, calibrating: false },
    resultDensity: "comfortable",
    performanceMetrics: {},
    smartAnalysisCache: { signature: "", snapshot: null, savedAt: 0 },
    liveProgress: { stage: "", completed: 0, total: 0, percent: 0 },
    cancelled: false,
    egrdtBatchLimit: readEgrdtBatchLimit(),
    groupByStatus: false,
    manualForceInclude: new Set(), // índices incluídos manualmente pelo operador (mesmo sem decisão READY)
  };

  const PACKAGE_EXTENSION = /\.(pdf|doc|docx|xls|xlsx|xlsm|xlsb|dwg|dgn|ppt|pptx)$/i;
  const $ = (selector) => document.querySelector(selector);

  const EGRDT_LEGACY_SEQUENCE_KEY = "grcon.egrdt.sequence.v3";
  const EGRDT_PREFIX = SequenceCore ? SequenceCore.PREFIX : "0130870-C1O-PGV-G";
  const EGRDT_YEAR = SequenceCore ? SequenceCore.operationalYear() : new Date().getFullYear();
  const EGRDT_SEQUENCE_START = SequenceCore ? SequenceCore.START : 1;
  const EGRDT_SEQUENCE_KEY = SequenceCore ? SequenceCore.storageKey(EGRDT_YEAR) : `grcon.egrdt.sequence.v4.${EGRDT_YEAR}`;

  function safeOutputPart(value, fallback = "arquivo") {
    const clean = String(value || "").trim()
      .replace(/\.[^.]+$/, "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return clean || fallback;
  }

  function safeArchiveName(value) {
    const original = String(value || "").trim();
    const clean = original
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
      .replace(/\.{2,}/g, "_")
      .replace(/[. ]+$/g, "")
      .replace(/^\.+/g, "");
    return clean || "arquivo.pdf";
  }

  function compactOutputStamp(date = new Date()) {
    const pad = (value, size = 2) => String(value).padStart(size, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}`;
  }

  function sequenceFromEgrdt(value) {
    if (SequenceCore) return SequenceCore.sequenceFrom(value, EGRDT_YEAR);
    const match = String(value || "").match(/0130870-C1O-PGV-G-(\d{4})-(\d{4})\s*-\s*eGRDT/i);
    if (!match || Number(match[2]) !== EGRDT_YEAR) return 0;
    return Number(match[1]) || 0;
  }

  function syncEgrdtSequenceFromLd(...collections) {
    const values = collections.flatMap((collection) => Array.isArray(collection) ? collection : []);
    const largest = values.reduce((maximum, record) => Math.max(maximum, sequenceFromEgrdt(record && record.grdt)), EGRDT_SEQUENCE_START - 1);
    state.egrdtSequenceCursor = Math.max(Number(state.egrdtSequenceCursor) || 0, largest);
    return state.egrdtSequenceCursor;
  }

  function readLastEgrdtSequence() {
    let stored = EGRDT_SEQUENCE_START - 1;
    try {
      const candidate = Number(localStorage.getItem(EGRDT_SEQUENCE_KEY));
      if (Number.isInteger(candidate) && candidate >= EGRDT_SEQUENCE_START) stored = candidate;
      // Migra somente o cursor antigo de 2026; ele nunca deve contaminar a
      // sequência de um novo ano operacional.
      if (EGRDT_YEAR === 2026) {
        const legacy = Number(localStorage.getItem(EGRDT_LEGACY_SEQUENCE_KEY));
        if (Number.isInteger(legacy) && legacy >= EGRDT_SEQUENCE_START) stored = Math.max(stored, legacy);
      }
    } catch (_) { console.debug("[App] sequência local indisponível:", _); /* sequência local indisponível */ }
    return Math.max(EGRDT_SEQUENCE_START - 1, stored, Number(state.egrdtSequenceCursor) || 0);
  }

  function automaticEgrdtSequenceInfo(offset = 0) {
    if (SequenceCore) return SequenceCore.next({ year: EGRDT_YEAR, ldSequence: state.egrdtSequenceCursor, localSequence: readLastEgrdtSequence(), offset });
    const sequence = Math.max(EGRDT_SEQUENCE_START, readLastEgrdtSequence() + 1) + Math.max(0, Number(offset) || 0);
    return { sequence, sequenceText: String(sequence).padStart(4, "0"), year: EGRDT_YEAR, baseName: `${EGRDT_PREFIX}-${String(sequence).padStart(4, "0")}-${EGRDT_YEAR} - eGRDT` };
  }

  function egrdtSequenceInfo(offset = 0) {
    const manual = Number(state.manualEgrdtSequenceStart);
    if (Number.isInteger(manual) && manual >= EGRDT_SEQUENCE_START && manual <= 9999) {
      const sequence = manual + Math.max(0, Number(offset) || 0);
      return { sequence, sequenceText: String(sequence).padStart(4, "0"), year: EGRDT_YEAR, baseName: SequenceCore ? SequenceCore.baseName(sequence, EGRDT_YEAR) : `${EGRDT_PREFIX}-${String(sequence).padStart(4, "0")}-${EGRDT_YEAR} - eGRDT`, manual: true };
    }
    return automaticEgrdtSequenceInfo(offset);
  }

  function validateManualEgrdtSequence(value) {
    const raw = String(value == null ? "" : value).trim();
    let sequence = 0;
    let parsedYear = EGRDT_YEAR;
    if (/^\d{1,4}$/.test(raw)) sequence = Number(raw);
    else if (SequenceCore && SequenceCore.parse(raw)) {
      const parsed = SequenceCore.parse(raw);
      sequence = parsed.sequence;
      parsedYear = parsed.year;
    } else {
      const match = raw.match(/-(\d{4})-(\d{4})\s*-\s*eGRDT/i);
      if (match) { sequence = Number(match[1]); parsedYear = Number(match[2]); }
    }
    if (!Number.isInteger(sequence) || sequence < EGRDT_SEQUENCE_START || sequence > 9999) return { valid: false, error: "Informe um número entre 0001 e 9999." };
    if (parsedYear !== EGRDT_YEAR) return { valid: false, error: `O ano operacional atual é ${EGRDT_YEAR}. Altere somente o número sequencial.` };
    const info = { sequence, sequenceText: String(sequence).padStart(4, "0"), year: EGRDT_YEAR, baseName: SequenceCore ? SequenceCore.baseName(sequence, EGRDT_YEAR) : `${EGRDT_PREFIX}-${String(sequence).padStart(4, "0")}-${EGRDT_YEAR} - eGRDT` };
    const automatic = automaticEgrdtSequenceInfo(0);
    const historyRecords = History ? History.read() : [];
    const duplicate = historyRecords.some((record) => [record.egrdtNumber, ...(record.numberHistory || [])].some((number) => String(number || "").toUpperCase() === info.baseName.toUpperCase()));
    const warnings = [];
    if (duplicate) warnings.push("Esse número já aparece no histórico local.");
    if (sequence < automatic.sequence) warnings.push(`A sequência automática sugerida é ${automatic.sequenceText}; confirme que o número menor está realmente disponível.`);
    if (sequence > automatic.sequence) warnings.push(`A sequência pula de ${automatic.sequenceText} para ${info.sequenceText}.`);
    warnings.push(SequenceCore ? SequenceCore.simultaneousUseWarning() : "Confirme se outra eGRDT foi emitida antes de concluir.");
    return { valid: true, ...info, automatic, duplicate, warning: warnings.join(" ") };
  }

  window.GrconEgrdtSequence = Object.freeze({
    preview() {
      const next = automaticEgrdtSequenceInfo(0);
      return Object.freeze({
        ...next,
        lastKnownSequence: readLastEgrdtSequence(),
        source: state.egrdtSequenceCursor > 0 ? "LD carregada e histórico desta sessão" : "histórico local desta máquina",
        storageKey: EGRDT_SEQUENCE_KEY,
        collisionWarning: SequenceCore ? SequenceCore.simultaneousUseWarning() : "Confirme se outra eGRDT foi emitida antes de concluir.",
      });
    },
    validate(value) { return validateManualEgrdtSequence(value); },
    setManualStart(value) {
      const checked = validateManualEgrdtSequence(value);
      if (!checked.valid) throw new Error(checked.error);
      state.manualEgrdtSequenceStart = checked.sequence;
      return checked;
    },
    clearManualStart() { state.manualEgrdtSequenceStart = null; },
    previewMany(amount) { return suggestedEgrdtSequences(amount); },
    validateMany(values, amount) { return validateManualEgrdtSequences(values, amount); },
    setManualMany(values, amount) {
      const checked = validateManualEgrdtSequences(values, amount);
      if (!checked.valid) throw new Error(checked.error || "Numeração inválida.");
      state.manualEgrdtSequences = checked.items.map((item) => item.sequence);
      state.manualEgrdtSequenceStart = null;
      return checked;
    },
    clearManualMany() { state.manualEgrdtSequences = []; },
    syncFromNumber(value) {
      const parsed = SequenceCore ? SequenceCore.parse(value) : null;
      if (!parsed || parsed.year !== EGRDT_YEAR) return false;
      state.egrdtSequenceCursor = Math.max(Number(state.egrdtSequenceCursor) || 0, parsed.sequence);
      try {
        const current = Number(localStorage.getItem(EGRDT_SEQUENCE_KEY)) || 0;
        if (parsed.sequence > current) localStorage.setItem(EGRDT_SEQUENCE_KEY, String(parsed.sequence));
      } catch (_) { console.debug("[App] histórico local indisponível:", _); /* histórico local indisponível */ }
      return true;
    },
  });

  function suggestedEgrdtSequences(amount) {
    const count = Math.max(1, Number(amount) || 1);
    const first = automaticEgrdtSequenceInfo(0);
    if (first.sequence + count - 1 > 9999) throw new Error("A quantidade de eGRDTs ultrapassa o limite da sequência 9999.");
    return Array.from({ length: count }, (_, index) => {
      const sequence = first.sequence + index;
      return {
        sequence,
        sequenceText: String(sequence).padStart(4, "0"),
        year: EGRDT_YEAR,
        baseName: SequenceCore ? SequenceCore.baseName(sequence, EGRDT_YEAR) : `${EGRDT_PREFIX}-${String(sequence).padStart(4, "0")}-${EGRDT_YEAR} - eGRDT`,
        manual: false,
      };
    });
  }

  function validateManualEgrdtSequences(values, expectedCount) {
    const count = Math.max(1, Number(expectedCount) || 1);
    const rawValues = Array.isArray(values) ? values : [];
    if (rawValues.length !== count) {
      return { valid: false, items: [], error: `Informe um número para cada uma das ${count} eGRDTs.` };
    }
    const items = rawValues.map((value, index) => ({ index, ...validateManualEgrdtSequence(value) }));
    const errors = [];
    const seen = new Map();
    items.forEach((item, index) => {
      if (!item.valid) {
        errors.push(`Lote ${index + 1}: ${item.error || "número inválido"}`);
        return;
      }
      const key = String(item.baseName || "").toUpperCase();
      if (seen.has(key)) {
        errors.push(`Os lotes ${seen.get(key) + 1} e ${index + 1} não podem usar o mesmo número.`);
      } else seen.set(key, index);
    });
    return {
      valid: errors.length === 0,
      items,
      error: errors.join(" "),
      warning: [...new Set(items.filter((item) => item.valid && item.warning).map((item) => item.warning))].join(" "),
    };
  }

  async function reserveEgrdtSequences(amount) {
    const count = Math.max(1, Number(amount) || 1);
    let values;
    let requestedSequences = null;
    if (state.manualEgrdtSequences.length) {
      const checked = validateManualEgrdtSequences(state.manualEgrdtSequences, count);
      if (!checked.valid) throw new Error(checked.error || "A numeração dos lotes precisa ser confirmada novamente.");
      requestedSequences = checked.items.map((item) => item.sequence);
      values = checked.items.map((item) => ({
        sequence: item.sequence,
        sequenceText: item.sequenceText,
        year: item.year,
        baseName: item.baseName,
        manual: true,
      }));
    } else {
      values = suggestedEgrdtSequences(count);
    }
    if (window.GrconCloud?.state?.membership) {
      values = await window.GrconCloud.reserveEgrdtSequences(EGRDT_YEAR, count, requestedSequences);
    }
    const highest = Math.max(...values.map((item) => item.sequence));
    state.egrdtSequenceCursor = Math.max(Number(state.egrdtSequenceCursor) || 0, highest);
    state.manualEgrdtSequenceStart = null;
    state.manualEgrdtSequences = [];
    try { localStorage.setItem(EGRDT_SEQUENCE_KEY, String(Math.max(readLastEgrdtSequence(), highest))); } catch (_) { console.debug("[App] sequência mantida nesta aba:", _); /* sequência mantida nesta aba */ }
    return values;
  }

  function createGeneratedHistoryRecords(generated, outputType, context) {
    if (!History || !generated || !generated.length) return [];
    const info = context || {};
    return History.createRecords(generated, state.results, {
      outputType,
      ldName: ldDisplayName(),
      sourceName: relationSourceLabel(),
      generatedAt: info.generatedAt,
    });
  }

  function prepareSigemOutput(generated, outputType, packageName, generatedAt) {
    const historyRecords = createGeneratedHistoryRecords(generated, outputType, { generatedAt });
    if (!Posting) return { historyRecords, postingDrafts: [], packageName, generatedAt };
    const postingDrafts = Posting.createDrafts(historyRecords, { packageName, appVersion: APP_VERSION });
    return { historyRecords, postingDrafts, packageName, generatedAt };
  }

  // A postagem continua totalmente manual. Nenhum manifesto de automação é incluído no ZIP.
  function sigemWorkerPayload() { return {}; }
  function addSigemManifests() { /* intencionalmente vazio */ }

  function saveGeneratedHistory(generated, outputType, postingContext, preparedRecords) {
    if (!History || !generated || !generated.length) return;
    try {
      const info = postingContext || {};
      // O histórico é reconstruído depois que o XLS foi gerado e reaberto pelo verificador.
      // Assim, a revisão registrada vem da própria eGRDT, e não apenas da prévia da emissão.
      const verifiedRecords = createGeneratedHistoryRecords(generated, outputType, { generatedAt: info.generatedAt });
      const records = verifiedRecords.length ? verifiedRecords : (preparedRecords || []);
      const saved = History.saveMany(records);
      if (Posting) {
        const postingSaved = Posting.registerGenerated(records, { packageName: info.packageName, appVersion: APP_VERSION });
        if (postingSaved.saved) window.dispatchEvent(new CustomEvent("grcon:sigem-updated", { detail: { records: postingSaved.created } }));
        if (postingSaved.error) console.warn("GRCON: registros de postagem SIGEM indisponíveis", postingSaved.error);
      }
      if (saved.saved) window.dispatchEvent(new CustomEvent("grcon:history-updated", { detail: { records } }));
      // O histórico local tem teto (1000 registros / 4,5 MB) e vinha descartando
      // os mais antigos em silêncio. Agora o usuário fica sabendo.
      if (saved.trimmed) {
        const limites = saved.limits || {};
        const espaco = ((limites.maxBytes || 0) / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
        const motivo = saved.trimmedBySize
          ? `limite de espaço do navegador (${espaco} MB)`
          : `limite de ${limites.maxRecords || 1000} eGRDTs`;
        const mensagem = `Histórico local cheio: ${saved.trimmed} eGRDT(s) mais antiga(s) saíram deste navegador pelo ${motivo}. Elas continuam no histórico compartilhado.`;
        if (typeof window.GrconNotify === "function") window.GrconNotify(mensagem, "warning");
        console.warn(`GRCON: ${mensagem}`);
      }
      if (saved.saved && window.GrconCloud?.completeEgrdtReservationRequest) {
        window.GrconCloud.completeEgrdtReservationRequest(generated);
      }
      if (saved.error) console.warn("GRCON: histórico local indisponível", saved.error);
    } catch (error) {
      console.warn("GRCON: a saída foi gerada, mas os históricos locais não puderam ser atualizados", error);
    }
  }

  function ehProprietario() {
    const Cloud = window.GrconCloud;
    // Sem área compartilhada configurada, o app é de uso local: não há a quem restringir.
    if (!Cloud || !Cloud.state?.membership) return true;
    return Boolean(Cloud.canManageMembers && Cloud.canManageMembers());
  }

  // ---------------------------------------------------------------------------
  // Central de alocação
  //
  // Fica numa pasta de rede, fora do alcance do navegador. O cadastro é mantido
  // apenas como referência da origem no Resumo. O relatório não grava PROCX ou
  // conexão externa, para abrir sem reparo e sem aviso de fonte não confiável.
  // ---------------------------------------------------------------------------
  const ALLOCATION_CENTER_PREFERENCE = "allocationCenter";

  function allocationCenterConfig() {
    if (!Workspace) return null;
    const saved = Workspace.preference(ALLOCATION_CENTER_PREFERENCE, null);
    if (!saved || typeof saved !== "object") return null;
    return ReportSummary && ReportSummary.normalizeAllocationCenter
      ? ReportSummary.normalizeAllocationCenter(saved)
      : saved;
  }

  function refreshAllocationCenterStatus() {
    if (!els.allocationCenterStatus) return;
    const central = allocationCenterConfig();
    if (!central) {
      els.allocationCenterStatus.textContent = "Não cadastrada. STATUS INTERNO usa o comentário da LD ou a situação apurada pelo GRCON.";
      return;
    }
    // O alcance importa: o cadastro é da equipe quando veio do banco, e só deste
    // navegador quando a área compartilhada estava fora do ar na hora de salvar.
    const salvo = Workspace ? Workspace.preference(ALLOCATION_CENTER_PREFERENCE, null) : null;
    const alcance = salvo && salvo.compartilhada ? "Referência cadastrada para todos" : "Referência cadastrada somente neste navegador";
    els.allocationCenterStatus.textContent = `${alcance}: ${central.fileName} · aba ${central.sheet}. O relatório não cria conexão externa.`;
  }

  // O cadastro é o mesmo para toda a área de trabalho, então quem não é
  // proprietário vê o que está valendo, mas não altera.
  function aplicarPermissaoCentralAlocacao() {
    const dono = ehProprietario();
    [els.allocationCenterPath, els.allocationCenterSheet, els.allocationCenterKey,
      els.allocationCenterComment, els.allocationCenterLastRow].forEach((campo) => {
      if (campo) campo.readOnly = !dono;
    });
    if (els.allocationCenterSave) els.allocationCenterSave.hidden = !dono;
    if (els.allocationCenterClear) els.allocationCenterClear.hidden = !dono;
    if (els.allocationCenterOwnerNote) els.allocationCenterOwnerNote.hidden = dono;
  }

  function loadAllocationCenterFields() {
    if (!els.allocationCenterPath) return;
    const saved = Workspace ? Workspace.preference(ALLOCATION_CENTER_PREFERENCE, null) : null;
    const central = saved && typeof saved === "object" ? saved : {};
    els.allocationCenterPath.value = String(central.path || "");
    els.allocationCenterSheet.value = String(central.sheet || "");
    els.allocationCenterKey.value = String(central.keyColumn || "");
    els.allocationCenterComment.value = String(central.commentColumn || "");
    els.allocationCenterLastRow.value = central.lastRow ? String(central.lastRow) : "";
    refreshAllocationCenterStatus();
    aplicarPermissaoCentralAlocacao();
  }

  async function saveAllocationCenter() {
    if (!Workspace) { showToast("Não foi possível salvar: armazenamento local indisponível.", "warn"); return; }
    const informado = {
      path: String(els.allocationCenterPath?.value || "").trim(),
      sheet: String(els.allocationCenterSheet?.value || "").trim(),
      keyColumn: String(els.allocationCenterKey?.value || "").trim(),
      commentColumn: String(els.allocationCenterComment?.value || "").trim(),
      lastRow: Number(els.allocationCenterLastRow?.value) || undefined,
    };
    const central = ReportSummary && ReportSummary.normalizeAllocationCenter
      ? ReportSummary.normalizeAllocationCenter(informado)
      : null;
    if (!central) {
      showToast("Informe o caminho do arquivo, a aba e as duas colunas da central.", "warn");
      return;
    }
    const guardado = {
      path: central.path,
      sheet: central.sheet,
      keyColumn: central.keyColumn,
      commentColumn: central.commentColumn,
      lastRow: central.lastRow,
    };
    // O cadastro vale para todos, então quem manda é o banco. A cópia local é
    // só para o relatório continuar saindo com a PROCX quando estiver offline.
    const Cloud = window.GrconCloud;
    if (Cloud?.saveAllocationCenter) {
      if (els.allocationCenterSave) els.allocationCenterSave.disabled = true;
      try {
        const resultado = await Cloud.saveAllocationCenter(guardado);
        if (resultado.ok) {
          loadAllocationCenterFields();
          showToast("Central de alocação salva para todos. Os próximos relatórios já trazem o comentário da fiscal.", "success");
          return;
        }
        // Recusa por permissão para aí; só falta de área compartilhada cai na
        // cópia local, senão quem não é proprietário burlaria a regra.
        if (!resultado.indisponivel) { showToast(resultado.error, "warn"); return; }
      } finally {
        if (els.allocationCenterSave) els.allocationCenterSave.disabled = false;
      }
    }
    Workspace.setPreference(ALLOCATION_CENTER_PREFERENCE, guardado);
    loadAllocationCenterFields();
    showToast("Referência cadastrada somente neste navegador: a área compartilhada está indisponível agora. O relatório continuará sem conexão externa.", "warn");
  }

  function limparCamposCentralAlocacao() {
    if (!els.allocationCenterPath) return;
    els.allocationCenterPath.value = "";
    els.allocationCenterSheet.value = "";
    els.allocationCenterKey.value = "";
    els.allocationCenterComment.value = "";
    els.allocationCenterLastRow.value = "";
  }

  async function clearAllocationCenter() {
    const Cloud = window.GrconCloud;
    // Remover só a cópia local não resolveria: a próxima leitura da área
    // compartilhada devolveria o cadastro.
    if (Cloud?.clearAllocationCenter) {
      const resultado = await Cloud.clearAllocationCenter();
      if (resultado.ok) {
        limparCamposCentralAlocacao();
        refreshAllocationCenterStatus();
        showToast("Cadastro da central removido para todos.", "info");
        return;
      }
      if (!resultado.indisponivel) { showToast(resultado.error, "warn"); return; }
    }
    if (Workspace) Workspace.setPreference(ALLOCATION_CENTER_PREFERENCE, null);
    limparCamposCentralAlocacao();
    refreshAllocationCenterStatus();
    showToast("Cadastro removido somente neste navegador: a área compartilhada está indisponível agora.", "warn");
  }

  function reportDownloadName() {
    const next = egrdtSequenceInfo(0);
    const ld = safeOutputPart(state.ldFiles.length === 1 ? state.ldFiles[0].name : `${state.ldFiles.length}_LDs`, "LD");
    return `GRCON_Relatorio_Triagem_${next.sequenceText}_${next.year}_${ld}_${compactOutputStamp()}.xlsx`;
  }

  function downloadBlob(blob, name) {
    const U = window.GrconUtils;
    if (U && U.downloadBlob) return U.downloadBlob(blob, name || `GRCON_${compactOutputStamp()}`);
    /* fallback inline (será removido em versão futura) */
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = String(name || `GRCON_${compactOutputStamp()}`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const els = {
    ldInput: $("#ld-input"),
    listInput: $("#list-input"),
    packageInput: $("#pdf-input"),
    relationStart: $("#relation-start"),
    sgparStart: $("#sgpar-start"),
    ldMeta: $("#ld-meta"),
    listMeta: $("#list-meta"),
    packageMeta: $("#pdf-meta"),
    recentDays: $("#recent-days"),
    analyze: $("#analyze"),
    reset: $("#reset"),
    clearLdBtn: $("#clear-ld-btn"),
    clearPdfBtn: $("#clear-pdf-btn"),
    clearRelationBtn: $("#clear-relation-btn"),
    progress: $("#progress"),
    progressBar: $("#progress-bar"),
    progressText: $("#progress-text"),
    resultsSection: $("#results-section"),
    tbody: $("#results-body"),
    empty: $("#empty-results"),
    search: $("#search"),
    exportReport: $("#export-report"),
    exportPendingAllocationPdfs: $("#export-pending-allocation-pdfs"),
    exportZip: $("#export-zip"),
    exportEgrdt: $("#export-egrdt"),
    allocationCenterPath: $("#allocation-center-path"),
    allocationCenterSheet: $("#allocation-center-sheet"),
    allocationCenterKey: $("#allocation-center-key"),
    allocationCenterComment: $("#allocation-center-comment"),
    allocationCenterLastRow: $("#allocation-center-last-row"),
    allocationCenterSave: $("#allocation-center-save"),
    allocationCenterClear: $("#allocation-center-clear"),
    allocationCenterStatus: $("#allocation-center-status"),
    allocationCenterOwnerNote: $("#allocation-center-owner-note"),
    exportFinalPackage: $("#export-final-package"),
    advancedToggle: $("#advanced-toggle"),
    advancedPanel: $("#advanced-panel"),
    ignoredDetails: $("#ignored-details"),
    ignoredSummary: $("#ignored-summary"),
    ignoredList: $("#ignored-list"),
    sheetFilter: $("#sheet-filter"),
    analysisStamp: $("#analysis-stamp"),
    selectedCount: $("#selected-count"),
    batchEgrdt: $("#batch-egrdt"),
    selectAllReady: $("#select-all-ready"),
    resultPagination: $("#result-pagination"),
    resultPagePrevious: $("#result-page-previous"),
    resultPageNext: $("#result-page-next"),
    resultPageStatus: $("#result-page-status"),
    resultsScroll: $("#results-scroll"),
    resultsTable: $("#results-table"),
    columnFilterRow: $("#results-column-filters"),
    clearColumnFilters: $("#results-clear-column-filters"),
    performancePanel: $("#performance-panel"),
    performanceStatus: $("#performance-status"),
    metricLd: $("#metric-ld"),
    metricTriage: $("#metric-triage"),
    metricExport: $("#metric-export"),
    metricMemory: $("#metric-memory"),
    cancelProcessing: $("#cancel-processing"),
    clearLdCache: $("#clear-ld-cache"),
    egrdtBatchLimit: $("#egrdt-batch-limit"),
    egrdtBatchSave: $("#egrdt-batch-limit-save"),
    egrdtBatchStatus: $("#egrdt-batch-limit-status"),
    egrdtBatchPolicyText: $("#egrdt-batch-policy-text"),
    p1BatchLimitNote: $("#p1-batch-limit-note"),
    performanceStageList: $("#performance-stage-list"),
    performanceLiveProgress: $("#performance-live-progress"),
    drawer: $("#egrdt-drawer"),
    drawerOverlay: $("#drawer-overlay"),
    drawerClose: $("#drawer-close"),
    drawerCancel: $("#drawer-cancel"),
    drawerSave: $("#drawer-save"),
    drawerCount: $("#drawer-count"),
    drawerDocuments: $("#drawer-documents"),
    drawerTitleField: $("#drawer-title-field"),
    drawerDatabookField: $("#drawer-databook-field"),
    drawerTitle: $("#drawer-title"),
    drawerFormat: $("#drawer-format"),
    drawerDiscipline: $("#drawer-discipline"),
    drawerType: $("#drawer-type"),
    drawerPurpose: $("#drawer-purpose"),
    drawerDatabook: $("#drawer-databook"),
    drawerTitleQuality: $("#drawer-title-quality"),
    drawerTitleSuggestion: $("#drawer-title-suggestion"),
    drawerDatabookSuggestion: $("#drawer-databook-suggestion"),
    relationDrawer: $("#relation-drawer"),
    relationOverlay: $("#relation-overlay"),
    relationClose: $("#relation-close"),
    relationCancel: $("#relation-cancel"),
    relationApply: $("#relation-apply"),
    relationPaste: $("#relation-paste"),
    relationClear: $("#relation-clear"),
    relationText: $("#relation-text"),
    relationCount: $("#relation-count"),
    relationValidCount: $("#relation-valid-count"),
    relationDuplicateCount: $("#relation-duplicate-count"),
    relationIgnoredCount: $("#relation-ignored-count"),
    relationPreviewMeta: $("#relation-preview-meta"),
    relationPreviewList: $("#relation-preview"),
    relationEmpty: $("#relation-empty"),
    sgparDrawer: $("#sgpar-drawer"),
    sgparOverlay: $("#sgpar-overlay"),
    sgparClose: $("#sgpar-close"),
    sgparCancel: $("#sgpar-cancel"),
    sgparAnalyze: $("#sgpar-analyze"),
    sgparUrl: $("#sgpar-url"),
    sgparCount: $("#sgpar-count"),
    sgparFoundCount: $("#sgpar-found-count"),
    sgparDownloadedCount: $("#sgpar-downloaded-count"),
    sgparPendingCount: $("#sgpar-pending-count"),
    sgparUnresolvedCount: $("#sgpar-unresolved-count"),
    sgparProgressBar: $("#sgpar-progress-bar"),
    sgparPosition: $("#sgpar-position"),
    sgparCurrentStatus: $("#sgpar-current-status"),
    sgparCode: $("#sgpar-code"),
    sgparExpectedFile: $("#sgpar-expected-file"),
    sgparCopy: $("#sgpar-copy"),
    sgparCopyOpen: $("#sgpar-copy-open"),
    sgparMarkDownloaded: $("#sgpar-mark-downloaded"),
    sgparMarkMissing: $("#sgpar-mark-missing"),
    sgparSkip: $("#sgpar-skip"),
    sgparPrevious: $("#sgpar-previous"),
    sgparNext: $("#sgpar-next"),
    sgparQueue: $("#sgpar-queue"),
    sgparFiles: $("#sgpar-files"),
    sgparFilesMeta: $("#sgpar-files-meta"),
    compatibilityOpen: $("#ld-compatibility-open"),
    compatibilityStatus: $("#ld-compatibility-status"),
    toast: $("#toast"),
  };

  function escapeHtml(value) {
    const U = window.GrconUtils;
    if (U && U.escapeHtml) return U.escapeHtml(value);
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message, kind = "info") {
    els.toast.textContent = message;
    els.toast.className = `toast show ${kind}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { els.toast.className = "toast"; }, 6500);
  }
  window.GrconNotify = showToast;

  function renderEgrdtBatchSettings() {
    const limit = currentEgrdtBatchLimit();
    if (els.egrdtBatchLimit && document.activeElement !== els.egrdtBatchLimit) els.egrdtBatchLimit.value = String(limit);
    if (els.egrdtBatchStatus) els.egrdtBatchStatus.textContent = `Separação por disciplina · até ${limit} documento${limit === 1 ? "" : "s"} por eGRDT`;
    if (els.egrdtBatchPolicyText) els.egrdtBatchPolicyText.textContent = `Por disciplina · até ${limit} por eGRDT`;
    if (els.p1BatchLimitNote) els.p1BatchLimitNote.textContent = `Cada disciplina terá sua própria eGRDT, limitada a ${limit} documento${limit === 1 ? "" : "s"}.`;
  }

  function saveEgrdtBatchLimit() {
    const raw = els.egrdtBatchLimit ? els.egrdtBatchLimit.value : state.egrdtBatchLimit;
    const parsed = Math.trunc(Number(raw));
    if (!Number.isInteger(parsed) || parsed < 1) {
      showToast("Informe uma quantidade inteira de pelo menos 1 documento.", "error");
      renderEgrdtBatchSettings();
      return false;
    }
    state.egrdtBatchLimit = parsed;
    try { localStorage.setItem(EGRDT_BATCH_LIMIT_KEY, String(parsed)); } catch (_) { console.debug("[App] configuração somente nesta sessão:", _); /* configuração disponível somente nesta sessão */ }
    state.manualEgrdtSequences = [];
    renderEgrdtBatchSettings();
    renderAll();
    showToast(`Cada disciplina será separada em eGRDTs de até ${parsed} documento${parsed === 1 ? "" : "s"}.`, "success");
    return true;
  }

  function metricDuration(value) {
    const ms = Number(value && value.durationMs);
    if (!Number.isFinite(ms)) return "—";
    return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)} s` : `${Math.round(ms)} ms`;
  }

  function refreshPerformancePanel(message) {
    if (!els.performancePanel) return;
    const metrics = state.performanceMetrics || {};
    const ld = metrics["ld-cache-hit"] || metrics["ld-parse-index"] || metrics["ld-file-read"];
    const triage = metrics["triage-enrichment"] || metrics.triage;
    const exportMetric = metrics["export-package"] || metrics["export-egrdts"] || metrics["export-report"];
    if (els.metricLd) {
      const cache = metrics["ld-cache-hit"] ? "cache · " : "";
      els.metricLd.textContent = `LD ${cache}${metricDuration(ld)}`;
    }
    if (els.metricTriage) els.metricTriage.textContent = `Triagem ${metricDuration(triage)}`;
    if (els.metricExport) els.metricExport.textContent = `Exportação ${metricDuration(exportMetric)}`;
    const memory = PerformanceCore && PerformanceCore.memorySnapshot ? PerformanceCore.memorySnapshot() : null;
    if (els.metricMemory) els.metricMemory.textContent = memory ? `Memória ${memory.usedMb.toLocaleString("pt-BR")} MB` : "Memória não exposta";
    if (els.performanceStageList) {
      const labels = {
        "ld-cache": "Consulta ao cache",
        "ld-cache-hit": "Reutilização do índice",
        "ld-file-read": "Leitura do arquivo LD",
        "ld-parse-index": "Interpretação e indexação",
        "triage-initialize": "Transferência do índice para triagem",
        "triage": "Triagem documental",
        "triage-enrichment": "Linha do tempo e Databook",
        "export-report": "Relatório Excel",
        "export-egrdts": "eGRDTs",
        "export-package": "Pacote ZIP",
      };
      const ordered = Object.entries(metrics).filter(([, value]) => value && value.stage);
      els.performanceStageList.innerHTML = ordered.length
        ? ordered.map(([key, value]) => {
          const amount = Number(value.items || value.records || 0);
          const extra = amount ? ` · ${amount.toLocaleString("pt-BR")} item(ns)` : "";
          const workerMemory = Number(value.memoryMb);
          const memoryText = Number.isFinite(workerMemory) ? ` · ${workerMemory.toLocaleString("pt-BR")} MB` : "";
          return `<span><b>${escapeHtml(labels[key] || key)}</b><em>${escapeHtml(metricDuration(value))}${escapeHtml(extra)}${escapeHtml(memoryText)}</em></span>`;
        }).join("")
        : `<span><b>Aguardando execução</b><em>As medições surgirão após a análise.</em></span>`;
    }
    if (message && els.performanceStatus) els.performanceStatus.textContent = message;
  }

  function workerProgress(stageLabel) {
    let lastPaint = 0;
    return (detail) => {
      const now = performance.now();
      if (now - lastPaint < 240 && detail && detail.progress < 1) return;
      lastPaint = now;
      const total = Number(detail && detail.total) || 0;
      const completed = Number(detail && detail.completed) || 0;
      const percent = total ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0;
      state.liveProgress = { stage: stageLabel || "Processamento", completed, total, percent };
      if (els.performanceLiveProgress) {
        els.performanceLiveProgress.textContent = total
          ? `${stageLabel}: ${percent}% (${completed.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")})`
          : `${stageLabel} em segundo plano…`;
      }
      if (els.performanceStatus) {
        els.performanceStatus.textContent = total
          ? `${stageLabel}: ${completed.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`
          : `${stageLabel} em segundo plano…`;
      }
    };
  }

  function compactSourceRef(value) {
    const source = value || {};
    return {
      source: source.source || source.file || "",
      file: source.file || source.source || "",
      sheet: source.sheet || "",
      row: Number(source.row) || 0,
      revision: source.revision || "",
    };
  }

  function compactLdConflict(value) {
    const conflict = value || {};
    return {
      hasConflict: Boolean(conflict.hasConflict),
      hasNotice: Boolean(conflict.hasNotice),
      noticeSummary: conflict.noticeSummary || "",
      noticeFields: Array.isArray(conflict.noticeFields) ? conflict.noticeFields.slice(0, 20) : [],
      fields: Array.isArray(conflict.fields) ? conflict.fields.slice(0, 20) : [],
      selected: conflict.selected ? { label: conflict.selected.label || "" } : null,
      duplicateAllocations: Array.isArray(conflict.duplicateAllocations)
        ? conflict.duplicateAllocations.slice(0, 20).map((item) => ({
          scope: item && item.scope || "",
          values: Array.isArray(item && item.values)
            ? item.values.slice(0, 20).map((entry) => ({ value: entry && entry.value || "" }))
            : [],
        }))
        : [],
      differences: Array.isArray(conflict.differences)
        ? conflict.differences.slice(0, 40).map((item) => ({
          field: item && item.field || "",
          label: item && item.label || "",
          scope: item && item.scope || "",
          values: Array.isArray(item && item.values)
            ? item.values.slice(0, 20).map((entry) => ({ value: entry && entry.value || "" }))
            : [],
        }))
        : [],
      notices: Array.isArray(conflict.notices)
        ? conflict.notices.slice(0, 40).map((item) => ({
          field: item && item.field || "",
          label: item && item.label || "",
          scope: item && item.scope || "",
          values: Array.isArray(item && item.values)
            ? item.values.slice(0, 20).map((entry) => ({ value: entry && entry.value || "" }))
            : [],
        }))
        : [],
      candidates: Array.isArray(conflict.candidates)
        ? conflict.candidates.slice(0, 40).map((item) => ({ label: item && item.label || "" }))
        : [],
    };
  }

  function compactTimeline(value) {
    const timeline = value || {};
    return {
      ldVersion: timeline.ldVersion || "",
      latestRevision: timeline.latestRevision || "",
      targetRevision: timeline.targetRevision || "",
      lastActivity: timeline.lastActivity || "",
      revisions: Array.isArray(timeline.revisions)
        ? timeline.revisions.map((item) => ({
          revision: item && item.revision || "",
          status: item && item.status || "",
          statusSource: item && item.statusSource || "",
          target: Boolean(item && item.target),
          predicted: Boolean(item && item.predicted),
          purpose: item && item.purpose || "",
          grdt: item && item.grdt || "",
          effectiveDate: item && item.effectiveDate || "",
          included: item && item.included || "",
          modified: item && item.modified || "",
          fiscalComment: item && item.fiscalComment || "",
          allocation: item && item.allocation || "",
          title: item && item.title || "",
        }))
        : [],
    };
  }

  function compactRecord(value) {
    const record = value || {};
    return {
      source: record.source || "",
      sheet: record.sheet || "",
      row: Number(record.row) || 0,
      document: record.document || "",
      revision: record.revision || "",
      title: record.title || "",
      databook: record.databook || "",
      grdt: record.grdt || "",
      effectiveDate: record.effectiveDate || "",
      allocationStatus: record.allocationStatus || "",
      allocationStatusState: record.allocationStatusState
        ? {
          kind: record.allocationStatusState.kind || "",
          raw: record.allocationStatusState.raw || "",
          normalized: record.allocationStatusState.normalized || "",
          label: record.allocationStatusState.label || "",
        }
        : null,
      allocation: record.allocation || "",
      allocationStage: record.allocationStage || "",
      tag: record.tag || "",
      tagHeader: record.tagHeader || "",
      tagColumn: record.tagColumn || "",
      fiscalComment: record.fiscalComment || "",
      sigemStatus: record.sigemStatus || "",
      ldVersion: record.ldVersion || "",
      ldVersionSource: record.ldVersionSource || "",
      ldVersionColumn: record.ldVersionColumn || "",
      allocationStatusColumn: record.allocationStatusColumn || "",
      allocationStatusHeader: record.allocationStatusHeader || "",
      allocationResolution: record.allocationResolution || "",
      allocationEvidence: record.allocationEvidence ? {
        source: record.allocationEvidence.source || "",
        sheet: record.allocationEvidence.sheet || "",
        row: Number(record.allocationEvidence.row) || 0,
        revision: record.allocationEvidence.revision || "",
        ldVersion: record.allocationEvidence.ldVersion || "",
        allocationStatus: record.allocationEvidence.allocationStatus || "",
        allocationStatusHeader: record.allocationEvidence.allocationStatusHeader || "",
        allocationStatusColumn: record.allocationEvidence.allocationStatusColumn || "",
        allocation: record.allocationEvidence.allocation || "",
        allocationStage: record.allocationEvidence.allocationStage || "",
        fiscalComment: record.allocationEvidence.fiscalComment || "",
      } : null,
      allocationDuplicate: record.allocationDuplicate ? {
        source: record.allocationDuplicate.source || "",
        sheet: record.allocationDuplicate.sheet || "",
        row: Number(record.allocationDuplicate.row) || 0,
        revision: record.allocationDuplicate.revision || "",
        ldVersion: record.allocationDuplicate.ldVersion || "",
        allocationStatus: record.allocationDuplicate.allocationStatus || "",
        allocation: record.allocationDuplicate.allocation || "",
        allocationStage: record.allocationDuplicate.allocationStage || "",
        fiscalComment: record.allocationDuplicate.fiscalComment || "",
      } : null,
      ldColumns: Array.isArray(record.ldColumns)
        ? record.ldColumns.map((column) => ({
          header: column && column.header || "",
          value: column && column.value == null ? "" : column.value,
        }))
        : [],
    };
  }

  function compactResultForWorker(row, rowIndex) {
    const item = row || {};
    return {
      name: item.name || "",
      document: item.document || "",
      decision: item.decision || "",
      hardBlock: Boolean(item.hardBlock),
      blockCode: item.blockCode || "",
      selectedForEgrdt: Number.isInteger(rowIndex) ? state.selected.has(rowIndex) : Boolean(item.selectedForEgrdt),
      manuallyIncluded: Number.isInteger(rowIndex) ? state.manualForceInclude.has(rowIndex) : Boolean(item.manuallyIncluded),
      reasonCode: item.reasonCode || "",
      reason: item.reason || "",
      status: item.status || "",
      revision: item.revision || "",
      revisionSource: item.revisionSource || "",
      sheet: item.sheet || "",
      fiscalComment: item.fiscalComment || "",
      allocationStatus: item.allocationStatus || "",
      // A situação da alocação e o cruzamento com o Apêndice viajam prontos:
      // o worker do relatório não relê a LD nem o Apêndice.
      allocationFinding: item.allocationFinding ? {
        kind: item.allocationFinding.kind || "",
        label: item.allocationFinding.label || "",
        evidence: item.allocationFinding.evidence || "",
        source: item.allocationFinding.source || "",
        tracked: Boolean(item.allocationFinding.tracked),
        status: item.allocationFinding.status || "",
        allocationNumber: item.allocationFinding.allocationNumber || "",
        sheet: item.allocationFinding.sheet || "",
        column: item.allocationFinding.column || "",
        header: item.allocationFinding.header || "",
        row: Number(item.allocationFinding.row) || 0,
      } : null,
      apendice: item.apendice ? {
        available: item.apendice.available !== false,
        found: item.apendice.found === null || item.apendice.found === undefined ? null : Boolean(item.apendice.found),
        ldCode: item.apendice.ldCode || "",
        tag: item.apendice.tag || "",
        tagSource: item.apendice.tagSource || "",
        search: item.apendice.search || "",
        tagged: item.apendice.tagged || "",
        suggestion: item.apendice.suggestion || "",
        suggestionNote: item.apendice.suggestionNote || "",
        note: item.apendice.note || "",
      } : null,
      databook: item.record && item.record.databook || "",
      finalName: item.finalName || "",
      listSource: item.listSource || "",
      packageWarning: item.packageWarning || "",
      grdt: item.grdt || "",
      effectiveDate: item.effectiveDate || "",
      postingStatus: item.postingStatus || "",
      documentLookup: item.documentLookup ? {
        inputDocument: item.documentLookup.inputDocument || "",
        searchedKeys: Array.isArray(item.documentLookup.searchedKeys) ? item.documentLookup.searchedKeys.slice() : [],
        searchedWithoutNt: item.documentLookup.searchedWithoutNt || "",
        searchedWithNt: item.documentLookup.searchedWithNt || "",
        appliesToNtRule: Boolean(item.documentLookup.appliesToNtRule),
        matched: Boolean(item.documentLookup.matched),
        matchedByNtVariant: Boolean(item.documentLookup.matchedByNtVariant),
        matchedByTagVariant: Boolean(item.documentLookup.matchedByTagVariant),
        matchedByReportTag: Boolean(item.documentLookup.matchedByReportTag),
        searchedTag: item.documentLookup.searchedTag || "",
        searchedReportCode: item.documentLookup.searchedReportCode || "",
        ldDocument: item.documentLookup.ldDocument || "",
        ldForm: item.documentLookup.ldForm || "",
        searchResult: item.documentLookup.searchResult || "",
        resultLabel: item.documentLookup.resultLabel || "",
        message: item.documentLookup.message || "",
      } : null,
      ntVariant: Boolean(item.ntVariant),
      ntRename: item.ntRename ? {
        enviado: item.ntRename.enviado || "",
        naLd: item.ntRename.naLd || "",
        finalName: item.ntRename.finalName || "",
        direcao: item.ntRename.direcao || "",
        nota: item.ntRename.nota || "",
      } : null,
      ldRename: item.ldRename ? {
        enviado: item.ldRename.enviado || "",
        naLd: item.ldRename.naLd || "",
        finalName: item.ldRename.finalName || "",
        motivo: item.ldRename.motivo || "",
        nota: item.ldRename.nota || "",
      } : null,
      postingEvidence: item.postingEvidence ? {
        status: item.postingEvidence.status || "",
        explanation: item.postingEvidence.explanation || "",
        complete: Boolean(item.postingEvidence.complete),
        partial: Boolean(item.postingEvidence.partial),
        grdt: item.postingEvidence.grdt || "",
        effectiveDate: item.postingEvidence.effectiveDate || "",
        source: item.postingEvidence.source || "",
        sheet: item.postingEvidence.sheet || "",
        row: Number(item.postingEvidence.row) || 0,
        conflict: Boolean(item.postingEvidence.conflict),
      } : null,
      files: Array.isArray(item.files) ? item.files.map((entry) => ({
        name: entry && entry.name || "",
        relativePath: entry && entry.relativePath || "",
        finalName: entry && entry.finalName || "",
        virtual: Boolean(entry && entry.virtual),
      })) : [],
      egrdt: item.egrdt ? {
        title: item.egrdt.title || "",
        databook: item.record && item.record.databook || "",
        format: item.egrdt.format || "",
        discipline: item.egrdt.discipline || "",
        documentType: item.egrdt.documentType || "",
        purpose: item.egrdt.purpose || "",
      } : null,
      record: compactRecord(item.record),
      timeline: compactTimeline(item.timeline),
      analysisEvidence: item.analysisEvidence ? {
        statusSource: compactSourceRef(item.analysisEvidence.statusSource),
        emissionSource: compactSourceRef(item.analysisEvidence.emissionSource),
      } : null,
      ldConflict: compactLdConflict(item.ldConflict),
    };
  }

  async function performanceSafeResults() {
    const output = new Array(state.results.length);
    const chunk = 600;
    for (let start = 0; start < state.results.length; start += chunk) {
      const end = Math.min(state.results.length, start + chunk);
      for (let index = start; index < end; index += 1) output[index] = compactResultForWorker(state.results[index], index);
      if (end < state.results.length && LARGE && LARGE.pause) await LARGE.pause();
    }
    return output;
  }


  window.addEventListener("grcon:performance-metrics", (event) => {
    state.performanceMetrics = event.detail && event.detail.metrics || state.performanceMetrics;
    refreshPerformancePanel();
  });

  function resultIndex(row) {
    return Number.isInteger(row && row._resultIndex) ? row._resultIndex : state.results.indexOf(row);
  }

  async function mapLarge(items, mapper, progress) {
    if (LARGE && LARGE.mapInChunks) return LARGE.mapInChunks(items, mapper, { chunkSize: PROCESS_CHUNK_SIZE, onProgress: progress });
    const output = [];
    for (let index = 0; index < items.length; index += 1) {
      output.push(mapper(items[index], index, items));
      if (index && index % PROCESS_CHUNK_SIZE === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return output;
  }

  async function forEachLarge(items, callback, progress) {
    if (LARGE && LARGE.forEachInChunks) return LARGE.forEachInChunks(items, callback, { chunkSize: PROCESS_CHUNK_SIZE, onProgress: progress });
    await mapLarge(items, (item, index, source) => { callback(item, index, source); return null; }, progress);
  }

  function hasLdHeader(items, predicate) {
    return (items || []).some((item) => (item.ldColumns || []).some((column) => predicate(C.norm(column.header))));
  }

  function validateLdIntegrity(file, parsed) {
    const issues = [];
    const warnings = [];
    if (!parsed.records.length) issues.push("nenhuma linha técnica reconhecida");
    if (!parsed.history.length) issues.push("nenhuma linha reconhecida em Colar SIGEM");
    const technicalFields = new Set(parsed.mappedFields && parsed.mappedFields.technical || []);
    const historyFields = new Set(parsed.mappedFields && parsed.mappedFields.history || []);
    if (!technicalFields.has("revision") && !hasLdHeader(parsed.records, (header) => header === "REVISAO" || header === "REV" || header === "REV.")) issues.push("coluna REVISÃO ausente nas abas técnicas");
    if (!technicalFields.has("grdt") && !hasLdHeader(parsed.records, (header) => header === "GRDT" || header.includes("NUMERO GRDT"))) issues.push("coluna GRDT ausente nas abas técnicas");
    if (!technicalFields.has("effectiveDate") && !hasLdHeader(parsed.records, (header) => header.includes("DATA EFETIVA DE EMISSAO"))) issues.push("coluna DATA EFETIVA DE EMISSÃO ausente");
    const allocationAvailable = technicalFields.has("allocationStatus") || hasLdHeader(parsed.records, (header) => (
      (header.includes("CONFIRMACAO") && (header.includes("DOCUMENTO") || header.includes("ALOCACAO")))
      || /^(STATUS|SITUACAO|CONDICAO) (DE|DA) ALOCACAO$/.test(header)
      || /^(ALOCADO|DOCUMENTO ALOCADO|ALOCACAO CONFIRMADA)$/.test(header)
    ));
    if (!allocationAvailable) warnings.push("confirmação de alocação indisponível nesta LD; a decisão usará a aba Colar SIGEM");
    if (!historyFields.has("status") && !historyFields.has("sigemStatus") && !hasLdHeader(parsed.history, (header) => header === "STATUS" || header.includes("STATUS SIGEM"))) issues.push("coluna STATUS ausente na base SIGEM");
    const ageDays = file.lastModified ? (Date.now() - Number(file.lastModified)) / 86400000 : null;
    if (ageDays !== null && ageDays < -1) issues.push("data de modificação da LD está no futuro");
    if (ageDays !== null && ageDays > 14) issues.push(`LD modificada há ${Math.floor(ageDays)} dias`);
    if (!file.lastModified) warnings.push("data de modificação da LD indisponível");
    return { valid: issues.length === 0, issues, warnings, records: parsed.records.length, history: parsed.history.length, ageDays, allocationAvailable };
  }

  function combineLdIntegrity(items) {
    const entries = items || [];
    const issues = entries.flatMap(({ file, integrity }) => (integrity.issues || []).map((message) => `${file.name}: ${message}`));
    const warnings = entries.flatMap(({ file, integrity }) => (integrity.warnings || []).map((message) => `${file.name}: ${message}`));
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      records: entries.reduce((total, item) => total + Number(item.integrity.records || 0), 0),
      history: entries.reduce((total, item) => total + Number(item.integrity.history || 0), 0),
      allocationAvailable: entries.some((item) => item.integrity.allocationAvailable),
      files: entries.map((item) => item.file.name),
    };
  }

  function setProgress(percent, message) {
    const bounded = Math.max(0, Math.min(100, Number(percent) || 0));
    if (els.progress) els.progress.hidden = false;
    if (els.progressBar) els.progressBar.style.width = `${bounded}%`;
    if (els.progressText && message) els.progressText.textContent = message;
    if (els.performanceLiveProgress) {
      const label = message || "Processando…";
      els.performanceLiveProgress.textContent = `${label} · ${bounded}%`;
    }
    const now = performance.now();
    if (now - (setProgress.lastPaint || 0) < 260 && Number(percent) < 100) return;
    setProgress.lastPaint = now;
    if (els.performanceStatus && message) els.performanceStatus.textContent = message;
  }

  function setBusy(busy, taskLabel = "Análise documental") {
    state.busy = busy;
    state.busyLabel = busy ? taskLabel : "";
    if (Workspace) Workspace.setTask("grdt-analysis", busy, taskLabel);
    els.analyze.disabled = busy;
    els.reset.disabled = busy;
    els.ldInput.disabled = busy;
    els.listInput.disabled = busy;
    els.packageInput.disabled = busy;
    els.relationStart.disabled = busy;
    if (els.compatibilityOpen) els.compatibilityOpen.disabled = busy;
    els.sgparStart.disabled = busy || state.sgparLoading || !state.ldFiles.length || !hasRelationSource();
    els.recentDays.disabled = busy;
    if (busy) {
      if (els.progress) els.progress.hidden = false;
      if (els.progressBar) els.progressBar.style.width = "2%";
      if (els.progressText) els.progressText.textContent = `${taskLabel}…`;
      els.exportReport.disabled = true;
      els.exportZip.disabled = true;
      els.exportEgrdt.disabled = true;
      els.exportFinalPackage.disabled = true;
      if (els.exportPendingAllocationPdfs) els.exportPendingAllocationPdfs.disabled = true;
    }
    els.analyze.querySelector("span").textContent = busy ? `${taskLabel}…` : "Analisar e conferir";
    if (els.cancelProcessing) els.cancelProcessing.hidden = !busy;
    if (els.clearLdCache) els.clearLdCache.disabled = busy;
    if (els.performancePanel) els.performancePanel.classList.toggle("is-busy", busy);
    if (busy) refreshPerformancePanel(`${taskLabel} em segundo plano. A interface permanece disponível para cancelamento.`);
    else {
      state.liveProgress = { stage: "", completed: 0, total: 0, percent: 0 };
      if (els.performanceLiveProgress) els.performanceLiveProgress.textContent = "Sem processamento em execução.";
      if (els.progressBar) els.progressBar.style.width = "0%";
      if (els.progressText) els.progressText.textContent = "Processando…";
      if (els.progress) els.progress.hidden = true;
      refreshPerformancePanel();
    }
  }

  function fileLabel(files, singular, plural) {
    if (!files || !files.length) return "Selecionar pasta";
    return `${files.length} ${files.length === 1 ? singular : plural}`;
  }

  function samePhysicalFile(left, right) {
    if (!left || !right) return false;
    return C.norm(left.name) === C.norm(right.name)
      && Number(left.size) === Number(right.size)
      && Number(left.lastModified) === Number(right.lastModified);
  }

  function ldDisplayName() {
    if (!state.ldFiles.length) return "";
    if (state.ldFiles.length === 1) return state.ldFiles[0].name;
    return `${state.ldFiles.length} LDs: ${state.ldFiles.map((file) => file.name).join(" · ")}`;
  }

  function currentLdSignature() {
    return state.ldFiles
      .map((file) => `${C.norm(file.name)}|${Number(file.size) || 0}|${Number(file.lastModified) || 0}`)
      .sort()
      .join("||");
  }

  function fileInputSignature(file) {
    if (!file) return "";
    return `${C.norm(file.webkitRelativePath || file.name)}|${Number(file.size) || 0}|${Number(file.lastModified) || 0}`;
  }

  function currentPackageSignature() {
    return state.packageFiles
      .map((file) => fileInputSignature(file))
      .filter(Boolean)
      .sort()
      .join("||");
  }

  function currentRelationSignature() {
    if (state.textEntries.length) return `texto:${C.norm(state.relationSavedText || state.relationDraft || "")}`;
    if (state.listFiles.length) return `lista:${fileInputSignature(state.listFiles[0])}`;
    return "sem-relacao";
  }

  function currentAnalysisSignature() {
    const days = Math.max(1, Number(els.recentDays && els.recentDays.value) || state.recentDays || 30);
    return [currentLdSignature(), currentPackageSignature(), currentRelationSignature(), `dias:${days}`].join("###");
  }

  function saveSmartAnalysisCache(signature) {
    state.smartAnalysisCache = {
      signature,
      savedAt: Date.now(),
      snapshot: {
        results: state.results,
        pendingAllocationBundle: state.pendingAllocationBundle,
        selectedIndices: [...state.selected],
        manualForceIndices: [...state.manualForceInclude],
        analysisAt: state.analysisAt,
        analysisValidUntil: state.analysisValidUntil,
        analysisRecentDays: state.analysisRecentDays,
        analysisLdSignature: state.analysisLdSignature,
        ldIntegrity: state.ldIntegrity,
      },
    };
  }

  function restoreSmartAnalysisCache(signature) {
    const cache = state.smartAnalysisCache;
    if (!cache || cache.signature !== signature || !cache.snapshot) return false;
    if (Date.now() - Number(cache.savedAt || 0) > SMART_ANALYSIS_CACHE_TTL_MS) return false;
    const snapshot = cache.snapshot;
    if (!snapshot.results || !snapshot.results.length) return false;

    state.results = snapshot.results;
    state.pendingAllocationBundle = snapshot.pendingAllocationBundle || { rows: [], entries: [], documentCount: 0, pdfCount: 0 };
    state.selected = new Set(snapshot.selectedIndices || []);
    state.manualForceInclude = new Set(snapshot.manualForceIndices || []);
    state.expanded.clear();
    state.resultVersion += 1;
    state.filteredCache = { signature: "", indices: [] };
    state.analysisAt = Number(snapshot.analysisAt) || Date.now();
    state.analysisValidUntil = Number(snapshot.analysisValidUntil) || (state.analysisAt + ANALYSIS_VALIDITY_MS);
    state.analysisRecentDays = Number(snapshot.analysisRecentDays) || state.recentDays;
    state.analysisLdSignature = snapshot.analysisLdSignature || currentLdSignature();
    state.ldIntegrity = snapshot.ldIntegrity || null;
    return true;
  }

  async function refreshPackageSelectionAsync(onProgress) {
    const ignoredFiles = [];
    const packageFiles = [];
    const seenPhysical = new Set();
    state.packageSelectionReady = false;
    const processFile = (file) => {
      const physicalKey = listPhysicalKey(file);
      if (seenPhysical.has(physicalKey)) {
        ignoredFiles.push({ name: file.name, reason: "arquivo duplicado — ignorado; somente uma cópia seguirá para a GRDT" });
        return;
      }
      seenPhysical.add(physicalKey);
      let reason = PACKAGE_EXTENSION.test(file && file.name || "") ? "" : "extensão não suportada";
      if (!reason) reason = C.controlArtifactKind(file && file.name);
      if (!reason && state.ldFiles.some((ldFile) => samePhysicalFile(file, ldFile))) reason = "LD selecionada";
      if (reason) ignoredFiles.push({ name: file.name, reason });
      else packageFiles.push(file);
    };

    if (LARGE && LARGE.forEachInChunks) {
      await LARGE.forEachInChunks(state.packageCandidates, processFile, {
        chunkSize: PROCESS_CHUNK_SIZE,
        onProgress: (completed, total) => {
          if (typeof onProgress === "function") onProgress(completed, total);
        },
      });
    } else {
      state.packageCandidates.forEach(processFile);
      if (typeof onProgress === "function") onProgress(state.packageCandidates.length, state.packageCandidates.length);
    }

    state.packageFiles = packageFiles;
    state.ignoredFiles = [...ignoredFiles, ...state.listIgnoredFiles];
    state.packageSelectionReady = true;
  }

  function refreshPackageSelection() {
    state.packageSelectionReady = false;
    const ignoredFiles = [];
    const seenPhysical = new Set();
    state.packageFiles = state.packageCandidates.filter((file) => {
      const physicalKey = listPhysicalKey(file);
      if (seenPhysical.has(physicalKey)) {
        ignoredFiles.push({ name: file.name, reason: "arquivo duplicado — ignorado; somente uma cópia seguirá para a GRDT" });
        return false;
      }
      seenPhysical.add(physicalKey);
      let reason = PACKAGE_EXTENSION.test(file && file.name || "") ? "" : "extensão não suportada";
      if (!reason) reason = C.controlArtifactKind(file && file.name);
      if (!reason && state.ldFiles.some((ldFile) => samePhysicalFile(file, ldFile))) reason = "LD selecionada";
      if (reason) {
        ignoredFiles.push({ name: file.name, reason });
        return false;
      }
      return true;
    });
    state.ignoredFiles = [...ignoredFiles, ...state.listIgnoredFiles];
    state.packageSelectionReady = true;
  }

  function hasRelationSource() {
    return state.textEntries.length > 0 || state.listFiles.length > 0;
  }

  function relationSourceKind() {
    if (state.textEntries.length) return "Texto";
    if (state.listFiles.length) return "Excel";
    return "";
  }

  function relationSourceLabel() {
    if (state.textEntries.length) return "Entrada por texto";
    return state.listFiles[0] ? state.listFiles[0].name : "";
  }

  async function currentRelationEntries() {
    if (state.textEntries.length) {
      if (state.relationSavedText && state.index) {
        const refreshed = parseRelationText(state.relationSavedText, state.index);
        if (refreshed.entries.length) {
          state.textEntries = refreshed.entries;
          state.relationPreview = refreshed;
        }
      }
      return state.textEntries;
    }
    if (state.listFiles.length) return readPdfList(state.listFiles[0]);
    return [];
  }

  /**
   * Cruzamento com o Apêndice 3 para a linha. A base é embutida e vale para
   * toda a obra, então não há arquivo a selecionar nem análise sem cruzamento.
   */
  function apendiceInfo(row) {
    if (row && row.apendice) return row.apendice;
    if (Apendice) return Apendice.evaluate(row || {}, null);
    return { ldCode: "", search: "Apêndice indisponível", tagged: "Não apurado — Apêndice indisponível", note: "", suggestion: "" };
  }

  function updateInputMeta() {
    if (!state.packageSelectionPending && !state.packageSelectionReady) refreshPackageSelection();
    els.ldMeta.textContent = state.ldFiles.length ? ldDisplayName() : "Selecionar arquivo";
    els.listMeta.textContent = state.textEntries.length
      ? state.listSummary
        ? `${state.listSummary.total} por texto · ${state.listSummary.files} PDF(s) físico(s)`
        : `${state.textEntries.length} item(ns) por texto`
      : state.listFiles.length
        ? state.listSummary
          ? `${state.listSummary.total} item(ns) lido(s) · ${state.listSummary.files} PDF(s) físico(s)`
          : state.listFiles[0].name
        : "Excel ou texto";
    const packageLabel = fileLabel(state.packageFiles, "arquivo encontrado", "arquivos encontrados");
    els.packageMeta.textContent = state.packageSelectionPending
      ? `Processando ${state.packageCandidates.length} arquivo(s)...`
      : state.listSummary
      ? state.listSummary.files
        ? `${state.listSummary.files} PDF(s) da relação localizado(s)`
        : "Sem PDF físico · GRDT disponível pela relação"
      : state.ignoredFiles.length ? `${packageLabel} · ${state.ignoredFiles.length} ignorado(s)` : packageLabel;
    els.ignoredDetails.hidden = state.ignoredFiles.length === 0 || state.packageSelectionPending;
    els.ignoredSummary.textContent = `Ignorados: ${state.ignoredFiles.length}`;
    els.ignoredList.innerHTML = state.ignoredFiles.slice(0, 100).map((item) => (
      `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.reason)}</span></li>`
    )).join("");
    const ldFile = state.ldFiles[0];
    const inspectedLdFiles = L ? state.ldFiles.filter((file) => L.inspectionFor(file)) : [];
    const readyLdFiles = L ? state.ldFiles.filter((file) => L.ready(file)) : state.ldFiles;
    const compatibilityReady = !state.ldFiles.length || !L || readyLdFiles.length === state.ldFiles.length;
    const compatibilityInspected = !state.ldFiles.length || !L || inspectedLdFiles.length === state.ldFiles.length;
    const compatibilityCanStart = Boolean(PerformanceCore && PerformanceCore.supported) || compatibilityReady || !compatibilityInspected;
    els.analyze.disabled = state.busy || !state.ldFiles.length || !compatibilityCanStart || (!state.packageFiles.length && !hasRelationSource());
    els.sgparStart.disabled = state.busy || state.sgparLoading || !state.ldFiles.length || !compatibilityCanStart || !hasRelationSource();
    if (els.compatibilityOpen && els.compatibilityStatus) {
      els.compatibilityOpen.hidden = !ldFile;
      els.compatibilityStatus.hidden = !ldFile;
      els.compatibilityStatus.textContent = !ldFile ? "" : !compatibilityInspected && PerformanceCore && PerformanceCore.supported
        ? `Validação de ${state.ldFiles.length} LD(s) ao analisar`
        : !compatibilityInspected
          ? `${inspectedLdFiles.length}/${state.ldFiles.length} estrutura(s) verificada(s)`
          : compatibilityReady
            ? `${readyLdFiles.length} LD(s) com estrutura confirmada`
            : `${readyLdFiles.length}/${state.ldFiles.length} LD(s) confirmada(s)`;
      els.compatibilityStatus.className = `compatibility-status ${compatibilityReady ? "ready" : "review"}`;
    }
    if (els.clearLdBtn) els.clearLdBtn.hidden = state.ldFiles.length === 0;
    if (els.clearPdfBtn) els.clearPdfBtn.hidden = state.packageFiles.length === 0 && state.packageCandidates.length === 0;
    if (els.clearRelationBtn) els.clearRelationBtn.hidden = state.listFiles.length === 0 && state.textEntries.length === 0 && !state.relationSavedText;
    // A barra de contexto lê estes mesmos rótulos. Sem o aviso, ela continuava
    // mostrando a contagem de antes da análise — dizia 576 documentos onde a
    // relação já falava em 600.
    window.dispatchEvent(new CustomEvent("grcon:ui-update"));
  }

  function triageSettings() {
    state.recentDays = Math.max(1, Number(els.recentDays.value) || 30);
    return { recentDays: state.recentDays, now: new Date(), conflictResolutions: state.conflictResolutions };
  }

  function normalizeFileAccessError(error, file, context) {
    if (!FileAccess || error && error.code === "FILE_NOT_READABLE") return error;
    return FileAccess.isNotReadableError(error) ? FileAccess.fileAccessError(file, context, error) : error;
  }

  async function stableSelectedFiles(files, context, onProgress) {
    const source = Array.from(files || []);
    if (!FileAccess || !source.length) return source;
    return FileAccess.snapshotMany(source, { context, retries: 1, onProgress });
  }

  async function loadLdSafely(file, profile, onProgress) {
    try {
      return await PerformanceCore.loadLd(file, profile, onProgress);
    } catch (error) {
      throw normalizeFileAccessError(error, file, "a LD controlada");
    }
  }

  async function readWorkbook(file, onlyLdSheets = false) {
    await ensureRuntime("xlsx");
    let data;
    try {
      data = FileAccess
        ? await FileAccess.read(file, { context: onlyLdSheets ? "a LD controlada" : "a planilha", retries: 1 })
        : await file.arrayBuffer();
    } catch (error) {
      throw normalizeFileAccessError(error, file, onlyLdSheets ? "a LD controlada" : "a planilha");
    }
    const options = { type: "array", cellDates: true, cellStyles: false };
    return XLSX.read(data, options);
  }

  function loadDatabookCatalog() {
    if (!D || !D.parseDatabookWorkbook) return Promise.resolve([]);
    if (state.databookCatalogEntries.length) return Promise.resolve(state.databookCatalogEntries);
    if (state.databookCatalogPromise) return state.databookCatalogPromise;
    state.databookCatalogPromise = (async () => {
      await ensureRuntime("xlsx");
      const embedded = window.GRCONOfflineResources;
      if (!embedded || !(await embedded.ensure("Caminho data book_Rev.B_VINI.xlsx"))) throw new Error("Base Databook incorporada indisponível.");
      const buffer = embedded.arrayBuffer("Caminho data book_Rev.B_VINI.xlsx");
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      state.databookCatalogEntries = D.parseDatabookWorkbook(workbook, XLSX).entries;
      return state.databookCatalogEntries;
    })().catch(() => []).finally(() => { state.databookCatalogPromise = null; });
    return state.databookCatalogPromise;
  }

  function listHeader(value) {
    const header = C.norm(value);
    return header === "DOCUMENTO"
      || header === "PDF"
      || header === "ARQUIVO"
      || header === "NOME DO PDF"
      || header === "NOME DO ARQUIVO"
      || header === "ARQUIVO PDF"
      || header === "CODIGO"
      || header === "CODIGO DO DOCUMENTO";
  }

  function listBaseName(value) {
    return String(value || "").trim().split(/[\\/]/).pop().trim();
  }

  function listDocumentName(value) {
    return listBaseName(value)
      .replace(/\.pdf$/i, "")
      .replace(/_\d{4}(?:_[0-9A-Z]+)?$/i, "")
      .trim();
  }

  function listPhysicalKey(file) {
    return [file.webkitRelativePath || file.name, Number(file.size), Number(file.lastModified)].join("::");
  }

  function addListCandidate(target, seen, rawValue, sheetName, rowNumber, header) {
    String(rawValue == null ? "" : rawValue).split(/[\r\n]+/).forEach((part) => {
      const raw = part.trim().replace(/^['"]|['"]$/g, "");
      if (!raw || C.norm(raw) === "FIM" || listHeader(raw)) return;
      const inferredDocument = listDocumentName(raw);
      const exact = state.index && C.exactDocumentMatch ? C.exactDocumentMatch(inferredDocument, state.index) : null;
      const matches = exact ? [exact] : C.matchDocuments(raw, state.index);
      if (!/\.pdf$/i.test(listBaseName(raw)) && matches.length !== 1 && !C.inferSheetFromName(`${inferredDocument}.pdf`)) return;
      const document = matches.length === 1 ? matches[0].document : inferredDocument;
      const key = `${C.norm(raw)}::${C.key(document)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const documentLookup = C.documentLookup
        ? C.documentLookup(inferredDocument || raw, matches.length === 1 ? matches[0] : null, matches)
        : null;
      target.push({ raw, fileName: listBaseName(raw), document, documentLookup, sheetName, rowNumber, header: header || "" });
    });
  }

  async function readPdfList(file) {
    const workbook = await readWorkbook(file, false);
    const entries = [];
    const seen = new Set();
    (workbook.SheetNames || []).forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet["!ref"]) return;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      let headerIndex = -1;
      let columns = [];
      for (let rowIndex = 0; rowIndex < Math.min(rows.length, 25); rowIndex += 1) {
        const found = (rows[rowIndex] || []).map((value, column) => listHeader(value) ? column : -1).filter((column) => column >= 0);
        if (found.length) {
          headerIndex = rowIndex;
          columns = found;
          break;
        }
      }
      if (headerIndex >= 0) {
        for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
          columns.forEach((column) => addListCandidate(entries, seen, rows[rowIndex][column], sheetName, rowIndex + 1, rows[headerIndex][column]));
        }
        return;
      }
      rows.forEach((row, rowIndex) => (row || []).forEach((cell) => {
        addListCandidate(entries, seen, cell, sheetName, rowIndex + 1, "");
      }));
    });
    if (!entries.length) throw new Error("A lista Excel não contém nomes de PDF ou documentos reconhecidos nas colunas DOCUMENTO, ARQUIVO ou PDF.");
    return entries;
  }

  function relationTokens(value) {
    const textValue = String(value || "");
    const patterns = [
      /\b(?:[IAFLED]-)?(?:CE|CR|DB|DE|EC|ET|FD|IM|IS|LA|LD|LI|LO|MA|MC|MD|MO|PR|PT|RL|RM|CT|SIT)-5290\.00-[0-9]{5}-[A-Z0-9]{3}-[A-Z0-9]{3}-[0-9]{3,5}\b/gi,
      /\b5900(?:\.\d+){3}-[A-Z0-9]{3}-CV-[A-Z0-9]+-\d{4}\b/gi,
      /\b[A-Z0-9]{3}_RNEST_[A-Z0-9]+_\d+(?:\.\d+){3}_[A-Z0-9]+_[A-Z0-9]+_[A-Z0-9_-]+\b/gi,
    ];
    const found = [];
    patterns.forEach((pattern) => {
      let match = pattern.exec(textValue);
      while (match) {
        found.push(match[0]);
        match = pattern.exec(textValue);
      }
    });
    return [...new Map(found.map((item) => [C.key(item), item])).values()];
  }

  function cleanRelationPart(value) {
    return String(value || "")
      .trim()
      .replace(/^\s*(?:[-•●▪◦]+\s*|\d+[.)-]\s+)/, "")
      .replace(/^['"]|['"]$/g, "")
      .trim();
  }

  function parseRelationText(value, indexOverride) {
    const relationIndex = indexOverride || state.index;
    const entries = [];
    const duplicates = [];
    const ignored = [];
    const seen = new Set();
    const lines = String(value || "").replace(/\r/g, "").split("\n");
    lines.forEach((originalLine, lineIndex) => {
      const line = cleanRelationPart(originalLine);
      if (!line || C.norm(line) === "FIM" || listHeader(line)) return;
      const candidates = new Map();

      // A LD é a fonte autoritativa para delimitar o código dentro de nomes longos.
      // Isso evita cortar identificadores ET que contêm ponto, vírgula ou outros
      // caracteres e evita falsas duplicidades entre documentos com prefixo igual.
      if (relationIndex) {
        C.matchDocuments(line, relationIndex).forEach((match) => candidates.set(C.key(match.document), { document: match.document, match }));
      }
      // As expressões regulares ficam apenas como contingência quando o código
      // ainda não existe na LD; elas nunca substituem um código completo da LD.
      if (!candidates.size) relationTokens(line).forEach((document) => candidates.set(C.key(document), { document, match: null }));
      if (!candidates.size) {
        line.split(/[\t;|]+/).map(cleanRelationPart).filter(Boolean).forEach((part) => {
          const document = listDocumentName(part);
          const exact = relationIndex && C.exactDocumentMatch ? C.exactDocumentMatch(document, relationIndex) : null;
          const sheet = C.inferSheetFromName(`${document}.pdf`);
          const validCode = sheet && C.validateDocumentCode(document, sheet).valid;
          if (/\.pdf$/i.test(listBaseName(part)) || exact || validCode) {
            const selectedDocument = exact ? exact.document : document;
            candidates.set(C.key(selectedDocument), { document: selectedDocument, match: exact || null });
          }
        });
      }
      if (!candidates.size && relationIndex) {
        C.matchDocuments(line, relationIndex).forEach((match) => candidates.set(C.key(match.document), { document: match.document, match }));
      }
      if (!candidates.size) {
        ignored.push({ raw: line, lineNumber: lineIndex + 1, reason: "Texto não reconhecido" });
        return;
      }
      const exactPdfName = candidates.size === 1 && /\.pdf$/i.test(listBaseName(line)) ? listBaseName(line) : "";
      candidates.forEach((candidate) => {
        const document = candidate.document;
        const documentKey = C.key(document);
        if (seen.has(documentKey)) {
          duplicates.push({ raw: line, document, lineNumber: lineIndex + 1 });
          return;
        }
        seen.add(documentKey);
        const documentLookup = C.documentLookup
          ? C.documentLookup(line, candidate.match, candidate.match ? [candidate.match] : [])
          : null;
        entries.push({
          raw: exactPdfName || document,
          fileName: exactPdfName || `${document}.pdf`,
          document,
          documentLookup,
          sheetName: "Entrada por texto",
          rowNumber: lineIndex + 1,
          header: "Entrada por texto",
        });
      });
    });
    return { entries, duplicates, ignored };
  }

  window.GrconLargeInputDiagnostics = Object.freeze({
    parseRelationText,
    pageSize: RESULT_PAGE_SIZE,
    chunkSize: PROCESS_CHUNK_SIZE,
    hasApplicationItemLimit: false,
  });

  function renderRelationPreview() {
    const preview = state.relationPreview;
    const totalPreview = preview.entries.length + preview.duplicates.length + preview.ignored.length;
    els.relationCount.textContent = preview.entries.length
      ? `${preview.entries.length} item${preview.entries.length === 1 ? "" : "s"} válido${preview.entries.length === 1 ? "" : "s"}`
      : "Nenhum item válido";
    els.relationValidCount.textContent = String(preview.entries.length);
    els.relationDuplicateCount.textContent = String(preview.duplicates.length);
    els.relationIgnoredCount.textContent = String(preview.ignored.length);
    const previewLimit = 300;
    const rows = [];
    preview.entries.slice(0, previewLimit).forEach((entry) => rows.push({
      kind: "valid",
      label: entry.documentLookup && entry.documentLookup.matchedByNtVariant ? "Ajustado pela LD" : "Válido",
      title: entry.document,
      detail: entry.documentLookup && entry.documentLookup.message ? entry.documentLookup.message : entry.fileName,
      line: entry.rowNumber,
    }));
    if (rows.length < previewLimit) preview.duplicates.slice(0, previewLimit - rows.length).forEach((entry) => rows.push({ kind: "duplicate", label: "Duplicado", title: entry.document, detail: entry.raw, line: entry.lineNumber }));
    if (rows.length < previewLimit) preview.ignored.slice(0, previewLimit - rows.length).forEach((entry) => rows.push({ kind: "ignored", label: "Ignorado", title: entry.raw, detail: entry.reason, line: entry.lineNumber }));
    els.relationPreviewMeta.textContent = totalPreview > previewLimit ? `${totalPreview} itens · prévia dos primeiros ${previewLimit}` : `${totalPreview} item${totalPreview === 1 ? "" : "s"}`;
    els.relationPreviewList.innerHTML = rows.map((row) => `
      <div class="relation-preview-item">
        <b>${escapeHtml(row.line)}</b>
        <span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.detail)}</small></span>
        <span class="relation-preview-status ${row.kind}">${row.label}</span>
      </div>
    `).join("");
    els.relationPreviewList.hidden = rows.length === 0;
    els.relationEmpty.hidden = rows.length > 0;
    els.relationApply.disabled = preview.entries.length === 0;
  }

  function updateRelationDraft(value) {
    state.relationDraft = String(value || "");
    window.clearTimeout(updateRelationDraft.persistTimer);
    updateRelationDraft.persistTimer = window.setTimeout(() => {
      if (Workspace) Workspace.setDraft("grdtRelation", state.relationDraft);
    }, 220);
    state.relationPreview = parseRelationText(state.relationDraft);
    renderRelationPreview();
  }

  function openRelationDrawer() {
    closeSgparDrawer();
    closeEgrdtDrawer();
    state.relationDraft = state.relationSavedText;
    els.relationText.value = state.relationDraft;
    updateRelationDraft(state.relationDraft);
    els.relationOverlay.hidden = false;
    els.relationDrawer.inert = false;
    els.relationDrawer.classList.add("open");
    els.relationDrawer.setAttribute("aria-hidden", "false");
    window.setTimeout(() => els.relationText.focus(), 50);
  }

  function closeRelationDrawer() {
    els.relationDrawer.classList.remove("open");
    els.relationDrawer.setAttribute("aria-hidden", "true");
    els.relationDrawer.inert = true;
    els.relationOverlay.hidden = true;
  }

  function cancelRelationDrawer() {
    state.relationDraft = state.relationSavedText;
    if (Workspace) Workspace.setDraft("grdtRelation", state.relationSavedText);
    state.relationPreview = parseRelationText(state.relationSavedText);
    closeRelationDrawer();
  }

  function applyRelationText() {
    const preview = state.relationPreview;
    if (!preview.entries.length) return;
    clearSgparQueue();
    invalidateAnalysisResults();
    state.textEntries = preview.entries;
    state.relationSavedText = state.relationDraft;
    if (Workspace) Workspace.setDraft("grdtRelation", state.relationSavedText);
    state.listFiles = [];
    els.listInput.value = "";
    closeRelationDrawer();
    updateInputMeta();
    const note = preview.duplicates.length || preview.ignored.length
      ? ` · ${preview.duplicates.length} duplicado(s) e ${preview.ignored.length} ignorado(s)`
      : "";
    showToast(`${state.textEntries.length} item(ns) incluído(s) pela Entrada por texto${note}.`, note ? "warn" : "success");
  }

  async function pasteRelationText() {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") throw new Error("indisponível");
      const clipboardText = await navigator.clipboard.readText();
      els.relationText.value = clipboardText;
      updateRelationDraft(clipboardText);
      showToast("Texto colado na Entrada por texto.", "success");
    } catch (_) {
      els.relationText.focus();
      showToast("Use Ctrl+V para colar a relação neste campo.", "warn");
    }
  }

  function selectPdfsFromList(entries) {
    const pdfs = state.packageFiles.filter((file) => extensionOf(file.name) === "pdf");
    const exactNames = new Map();
    const exactStems = new Map();
    const byDocument = new Map();
    pdfs.forEach((file) => {
      const nameKey = C.norm(file.name);
      const stemKey = C.norm(file.name.replace(/\.pdf$/i, ""));
      if (!exactNames.has(nameKey)) exactNames.set(nameKey, []);
      if (!exactStems.has(stemKey)) exactStems.set(stemKey, []);
      exactNames.get(nameKey).push(file);
      exactStems.get(stemKey).push(file);
      const inferredDocument = listDocumentName(file.name);
      const exact = C.exactDocumentMatch ? C.exactDocumentMatch(inferredDocument, state.index) : null;
      const matches = exact ? [exact] : C.matchDocuments(file.name, state.index);
      if (matches.length === 1) {
        const documentKey = C.key(matches[0].document);
        if (!byDocument.has(documentKey)) byDocument.set(documentKey, []);
        byDocument.get(documentKey).push(file);
      }
    });

    const selected = new Map();
    const sourceByPhysicalKey = new Map();
    const documentLookupByPhysicalKey = new Map();
    const missing = [];
    let matchedItems = 0;
    entries.forEach((entry) => {
      const baseName = listBaseName(entry.fileName || entry.raw);
      let candidates = exactNames.get(C.norm(baseName)) || [];
      if (!candidates.length && !/\.pdf$/i.test(baseName)) candidates = exactStems.get(C.norm(baseName)) || [];
      if (!candidates.length && entry.document) candidates = byDocument.get(C.key(entry.document)) || [];
      const unique = [...new Map(candidates.map((file) => [listPhysicalKey(file), file])).values()];
      if (unique.length === 1) {
        const physicalKey = listPhysicalKey(unique[0]);
        selected.set(physicalKey, unique[0]);
        if (!sourceByPhysicalKey.has(physicalKey)) sourceByPhysicalKey.set(physicalKey, []);
        sourceByPhysicalKey.get(physicalKey).push(`${entry.sheetName} · linha ${entry.rowNumber}`);
        if (entry.documentLookup) documentLookupByPhysicalKey.set(physicalKey, entry.documentLookup);
        matchedItems += 1;
      } else {
        missing.push({
          ...entry,
          reason: unique.length > 1
            ? `Mais de um PDF da pasta corresponde ao item “${entry.raw}”; informe o nome exato com a extensão na lista.`
            : `O PDF “${entry.raw}” está na relação, mas não foi localizado na pasta selecionada.`,
        });
      }
    });

    const matchedFiles = [...selected.values()];
    const selectedKeys = new Set(matchedFiles.map(listPhysicalKey));
    state.listIgnoredFiles = state.packageFiles
      .filter((file) => !selectedKeys.has(listPhysicalKey(file)))
      .map((file) => ({ name: file.name, reason: "fora da relação" }));
    state.listSummary = { total: entries.length, matched: matchedItems, files: matchedFiles.length, missing: missing.length };
    return { matchedFiles, missing, sourceByPhysicalKey, documentLookupByPhysicalKey };
  }

  function sgparStatusLabel(status) {
    return {
      pending: "Pendente",
      downloaded: "Baixado",
      located: "Localizado",
      missing: "Não encontrado",
      skipped: "Depois",
      review: "Conferir",
    }[status] || "Pendente";
  }

  function sgparSearchCode(entry) {
    return String(entry && (entry.document || entry.searchCode || entry.raw) || "")
      .trim()
      .replace(/\.pdf$/i, "");
  }

  function sgparCandidateFiles(entry) {
    const pdfs = state.packageFiles.filter((file) => extensionOf(file.name) === "pdf");
    const baseName = listBaseName(entry.fileName || entry.raw);
    let candidates = pdfs.filter((file) => C.norm(file.name) === C.norm(baseName));
    if (!candidates.length && !/\.pdf$/i.test(baseName)) {
      candidates = pdfs.filter((file) => C.norm(file.name.replace(/\.pdf$/i, "")) === C.norm(baseName));
    }
    if (!candidates.length && entry.document && state.index) {
      candidates = pdfs.filter((file) => {
        const matches = C.matchDocuments(file.name, state.index);
        return matches.length === 1 && C.key(matches[0].document) === C.key(entry.document);
      });
    }
    return [...new Map(candidates.map((file) => [listPhysicalKey(file), file])).values()];
  }

  function reconcileSgparFiles() {
    state.sgparQueue.forEach((entry) => {
      const matches = sgparCandidateFiles(entry);
      if (matches.length === 1) {
        entry.status = "located";
        entry.matchedFileName = matches[0].name;
      } else if (matches.length > 1) {
        entry.status = "review";
        entry.matchedFileName = `${matches.length} arquivos correspondentes`;
      } else {
        if (entry.status === "located" || entry.status === "review") entry.status = "pending";
        entry.matchedFileName = "";
      }
    });
  }

  function sgparCounts() {
    return state.sgparQueue.reduce((counts, entry) => {
      if (entry.status === "located") counts.located += 1;
      else if (entry.status === "downloaded") counts.downloaded += 1;
      else if (entry.status === "missing") counts.missing += 1;
      else if (entry.status === "review") counts.review += 1;
      else counts.pending += 1;
      return counts;
    }, { located: 0, downloaded: 0, missing: 0, review: 0, pending: 0 });
  }

  function renderSgpar() {
    const total = state.sgparQueue.length;
    const counts = sgparCounts();
    const current = total ? state.sgparQueue[Math.max(0, Math.min(state.sgparCurrent, total - 1))] : null;
    const unresolved = counts.missing + counts.review;
    const completed = total - counts.pending;
    els.sgparCount.textContent = total ? `${total} documento${total === 1 ? "" : "s"} na fila` : "Nenhum documento";
    els.sgparFoundCount.textContent = String(counts.located);
    els.sgparDownloadedCount.textContent = String(counts.downloaded);
    els.sgparPendingCount.textContent = String(counts.pending);
    els.sgparUnresolvedCount.textContent = String(unresolved);
    els.sgparProgressBar.style.width = `${total ? Math.round((completed / total) * 100) : 0}%`;
    els.sgparPosition.textContent = current ? `Documento ${state.sgparCurrent + 1} de ${total}` : "Documento 0 de 0";
    els.sgparCurrentStatus.textContent = current ? sgparStatusLabel(current.status) : "Pendente";
    els.sgparCurrentStatus.className = `sgpar-status ${current ? current.status : "pending"}`;
    els.sgparCode.textContent = current ? sgparSearchCode(current) : "—";
    els.sgparExpectedFile.textContent = current
      ? current.matchedFileName || current.fileName || current.raw
      : "—";
    [els.sgparCopy, els.sgparCopyOpen, els.sgparMarkDownloaded, els.sgparMarkMissing, els.sgparSkip,
      els.sgparPrevious, els.sgparNext].forEach((button) => { button.disabled = !current; });
    els.sgparQueue.innerHTML = state.sgparQueue.map((entry, index) => `
      <button class="sgpar-queue-item${index === state.sgparCurrent ? " active" : ""}" type="button" data-sgpar-index="${index}">
        <b>${index + 1}</b>
        <span><strong>${escapeHtml(sgparSearchCode(entry))}</strong><small>${escapeHtml(entry.matchedFileName || entry.fileName || entry.raw)}</small></span>
        <span class="sgpar-status ${escapeHtml(entry.status)}">${escapeHtml(sgparStatusLabel(entry.status))}</span>
      </button>
    `).join("");
    els.sgparFilesMeta.textContent = state.sgparAddedFiles.length
      ? `${state.sgparAddedFiles.length} PDF(s) adicionado(s) · ${counts.located} conciliado(s)`
      : "Nenhum PDF adicionado";
    els.sgparAnalyze.disabled = !state.ldFiles.length || !hasRelationSource();
  }

  function openSgparDrawer() {
    closeRelationDrawer();
    closeEgrdtDrawer();
    renderSgpar();
    els.sgparOverlay.hidden = false;
    els.sgparDrawer.inert = false;
    els.sgparDrawer.classList.add("open");
    els.sgparDrawer.setAttribute("aria-hidden", "false");
  }

  function closeSgparDrawer() {
    els.sgparDrawer.classList.remove("open");
    els.sgparDrawer.setAttribute("aria-hidden", "true");
    els.sgparDrawer.inert = true;
    els.sgparOverlay.hidden = true;
  }

  function clearSgparQueue(closeDrawer = true) {
    state.sgparQueue = [];
    state.sgparCurrent = 0;
    state.sgparAddedFiles = [];
    els.sgparFiles.value = "";
    if (closeDrawer) closeSgparDrawer();
    renderSgpar();
  }

  async function prepareSgparQueue() {
    if (!state.ldFiles.length || !hasRelationSource() || state.sgparLoading) return;
    if (state.sgparQueue.length) {
      reconcileSgparFiles();
      openSgparDrawer();
      return;
    }
    state.sgparLoading = true;
    if (Workspace) Workspace.start("sgpar-queue", "Preparação SGPAR");
    els.sgparStart.disabled = true;
    const originalText = els.sgparStart.querySelector("span").textContent;
    els.sgparStart.querySelector("span").textContent = state.textEntries.length ? "Preparando…" : "Lendo lista…";
    try {
      if (!state.index) {
        const ldFile = state.ldFiles[0];
        if (L) {
          await ensureRuntime("xlsx");
          await L.prepare(ldFile, { interactive: true });
          if (!L.ready(ldFile)) throw new Error("Confirme a estrutura da LD antes de continuar.");
        }
        const workbook = L && L.workbookFor(ldFile) || await readWorkbook(ldFile, true);
        const parsed = C.parseWorkbook(workbook, ldFile.name, ldFile.lastModified, L && L.profileFor(ldFile));
        const integrity = validateLdIntegrity(ldFile, parsed);
        if (!integrity.valid) throw new Error(`A integridade da LD foi reprovada: ${integrity.issues.join("; ")}.`);
        state.records = parsed.records;
        state.history = parsed.history;
        syncEgrdtSequenceFromLd(state.records, state.history);
        state.index = C.buildIndex(state.records, state.history);
      }
      const entries = await currentRelationEntries();
      state.sgparQueue = entries.map((entry, index) => ({
        ...entry,
        id: `sgpar-${index + 1}`,
        searchCode: sgparSearchCode(entry),
        status: "pending",
        matchedFileName: "",
      }));
      state.sgparCurrent = 0;
      reconcileSgparFiles();
      openSgparDrawer();
    } catch (error) {
      console.error(error);
      showToast(error.message || "Não foi possível preparar a fila do SGPAR.", "error");
    } finally {
      state.sgparLoading = false;
      if (Workspace) Workspace.finish("sgpar-queue");
      els.sgparStart.querySelector("span").textContent = originalText;
      updateInputMeta();
    }
  }

  function moveSgpar(step) {
    const total = state.sgparQueue.length;
    if (!total) return;
    state.sgparCurrent = (state.sgparCurrent + step + total) % total;
    renderSgpar();
  }

  function advanceSgpar() {
    const total = state.sgparQueue.length;
    if (!total) return;
    for (let offset = 1; offset <= total; offset += 1) {
      const index = (state.sgparCurrent + offset) % total;
      if (state.sgparQueue[index].status === "pending") {
        state.sgparCurrent = index;
        renderSgpar();
        return;
      }
    }
    for (let offset = 1; offset <= total; offset += 1) {
      const index = (state.sgparCurrent + offset) % total;
      if (state.sgparQueue[index].status === "skipped") {
        state.sgparCurrent = index;
        renderSgpar();
        return;
      }
    }
    moveSgpar(1);
  }

  function markSgpar(status) {
    const current = state.sgparQueue[state.sgparCurrent];
    if (!current) return;
    current.status = status;
    if (status !== "located" && status !== "review") current.matchedFileName = "";
    advanceSgpar();
  }

  function fallbackCopy(value) {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try { copied = typeof document.execCommand === "function" && document.execCommand("copy"); } catch (_) { console.debug("[App] execCommand copy:", _); copied = false; }
    area.remove();
    return copied;
  }

  async function copySgparCode() {
    const current = state.sgparQueue[state.sgparCurrent];
    const value = sgparSearchCode(current);
    if (!value) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) { console.debug("[App] clipboard.writeText:", _); /* tenta o método compatível abaixo */ }
    return fallbackCopy(value);
  }

  function sgparUrlForCurrent() {
    const raw = String(els.sgparUrl.value || "").trim();
    if (!raw) return "";
    const code = sgparSearchCode(state.sgparQueue[state.sgparCurrent]);
    let value = raw.replace(/\{codigo\}/gi, encodeURIComponent(code));
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
    try {
      const parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol)) return "";
      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  async function copyAndOpenSgpar() {
    const current = state.sgparQueue[state.sgparCurrent];
    if (!current) return;
    const url = sgparUrlForCurrent();
    const copyPromise = copySgparCode();
    let opened = null;
    if (url) opened = window.open(url, "_blank", "noopener,noreferrer");
    const copied = await copyPromise;
    if (!url) {
      els.sgparUrl.focus();
      showToast(copied ? "Código copiado. Informe o endereço do SGPAR para abri-lo." : "Informe o endereço do SGPAR e copie o código.", "warn");
    } else if (!opened) {
      showToast("Código copiado. O navegador bloqueou a nova aba; permita pop-ups para abrir o SGPAR.", "warn");
    } else {
      showToast(copied ? "Código copiado e SGPAR aberto." : "SGPAR aberto. Copie o código exibido para pesquisar.", "success");
    }
  }

  function addSgparFiles(files) {
    const pdfs = [...files].filter((file) => extensionOf(file.name) === "pdf");
    if (!pdfs.length) {
      showToast("Selecione pelo menos um arquivo PDF.", "warn");
      return;
    }
    const merged = new Map(state.packageCandidates.map((file) => [listPhysicalKey(file), file]));
    pdfs.forEach((file) => merged.set(listPhysicalKey(file), file));
    state.packageCandidates = [...merged.values()];
    const added = new Map(state.sgparAddedFiles.map((file) => [listPhysicalKey(file), file]));
    pdfs.forEach((file) => added.set(listPhysicalKey(file), file));
    state.sgparAddedFiles = [...added.values()];
    invalidateAnalysisResults(true);
    updateInputMeta();
    reconcileSgparFiles();
    renderSgpar();
    const counts = sgparCounts();
    showToast(`${pdfs.length} PDF(s) adicionado(s) · ${counts.located} item(ns) conciliado(s).`, counts.review ? "warn" : "success");
  }

  function extensionOf(name) {
    const match = String(name || "").match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : "";
  }

  function rowOutputSources(row) {
    let sources = [];
    if (row && row.files && row.files.length) sources = row.files;
    else if (row && row.virtualFileName) sources = [{
      name: row.virtualFileName,
      finalName: row.finalName,
      file: null,
      virtual: true,
      relativePath: row.relativePath || row.virtualFileName,
    }];
    if (!sources.length) return [];
    const pair = E && E.validateN1710Pair ? E.validateN1710Pair(row, sources) : null;
    return pair && pair.applies ? pair.sources : sources;
  }

  function manualAllocationOverrideAllowed(row) {
    if (!row || !row.hardBlock) return false;
    const allocation = C.allocationState(row.allocationStatus || row.record && row.record.allocationStatus);
    return allocation.kind === "not_allocated" || /^not_allocated(?:_conflict)?$/.test(row.blockCode || "");
  }

  function manuallyIncluded(row, index) {
    const rowIndex = Number.isInteger(index) ? index : resultIndex(row);
    return manualAllocationOverrideAllowed(row)
      && state.selected.has(rowIndex)
      && state.manualForceInclude.has(rowIndex);
  }

  function rowCanBeSelected(row) {
    return Boolean(row && (!row.hardBlock || manualAllocationOverrideAllowed(row)));
  }

  function refreshPendingAllocationBundle() {
    state.pendingAllocationBundle = PendingAllocationPackage
      ? PendingAllocationPackage.collect(state.results)
      : { rows: [], entries: [], documentCount: 0, pdfCount: 0 };
    return state.pendingAllocationBundle;
  }

  function outputPreviewData() {
    const includedRows = state.results.filter((row, index) => state.selected.has(index) && rowCanBeSelected(row));
    const items = includedRows.flatMap((row) => rowOutputSources(row).map((entry) => ({
      primary: entry.name || row.document,
      secondary: entry.finalName || row.finalName,
      meta: `${row.document} · revisão ${row.revision || "—"}`,
    })));
    const previewPlan = E.createPlan(state.results, state.selected, { manualForceIndices: state.manualForceInclude });
    const previewGroups = previewPlan.errors.length ? [] : E.splitPlan(previewPlan, currentEgrdtBatchLimit());
    const batchCount = Math.max(1, previewGroups.length || Math.ceil(items.length / currentEgrdtBatchLimit()));
    const sequences = suggestedEgrdtSequences(batchCount);
    const officialNumber = batchCount === 1
      ? sequences[0].baseName
      : `${batchCount} eGRDTs · ${sequences[0].sequenceText} a ${sequences[sequences.length - 1].sequenceText}`;
    const batchByEntry = new Map();
    previewGroups.forEach((group, batchIndex) => group.entries.forEach((entry) => {
      batchByEntry.set(`${entry.rowIndex}::${C.norm(entry.finalName)}`, batchIndex);
    }));
    const detailRows = [];
    state.results.forEach((row, index) => {
      const eligible = rowCanBeSelected(row);
      const included = state.selected.has(index) && eligible;
      const includedAfterReview = included && row.decision !== C.READY;
      const sources = rowOutputSources(row);
      const message = decisionMessage(row);
      const alerts = [
        row.packageWarning,
        row.codeValidationWarning,
        !ldDatabookValue(row) ? "Caminho Databook não informado na LD" : "",
        row.ldConflict && row.ldConflict.hasConflict ? "Conflito entre linhas da LD" : "",
        manuallyIncluded(row, index) ? "Incluído manualmente apesar de a LD informar Não Alocado" : includedAfterReview ? "Incluído pelo operador após conferência do alerta da triagem" : "",
        included ? "" : eligible ? "Não selecionado para esta saída" : message && (message.explanation || message.title),
      ].filter(Boolean).join(" · ");
      const databook = ldDatabookValue(row);
      const status = row.status || row.sigemStatus || row.record && row.record.status || "";
      const entries = sources.length ? sources : [{ name: row.name || row.document, finalName: row.finalName || "" }];
      entries.forEach((entry, entryIndex) => {
        const finalName = entry.finalName || row.finalName || "";
        const batchIndex = included ? batchByEntry.get(`${index}::${C.norm(finalName)}`) : undefined;
        detailRows.push({
        id: `result-${index}-${entryIndex}`,
        included,
        batchIndex: Number.isInteger(batchIndex) ? batchIndex : -1,
        discipline: row.egrdt && row.egrdt.discipline || "",
        egrdtNumber: included && Number.isInteger(batchIndex) && sequences[batchIndex] ? sequences[batchIndex].baseName : "—",
        document: row.document,
        originalName: entry.name || row.document,
        finalName: finalName || "—",
        revision: row.revision || "—",
        sigemStatus: status || "—",
        databook: databook || "—",
        decision: included ? "Incluído no pacote" : eligible ? "Excluído do pacote" : decisionLabel(row.decision, row),
        alerts: alerts || (included ? "Nenhum alerta" : "Não selecionado para esta saída"),
        });
      });
    });
    state.ignoredFiles.forEach((entry, index) => detailRows.push({
      id: `ignored-${index}`,
      included: false,
      egrdtNumber: "—",
      document: "Não associado à LD",
      originalName: entry && entry.name || "Arquivo ignorado",
      finalName: "—",
      revision: "—",
      sigemStatus: "—",
      databook: "—",
      decision: "Excluído do pacote",
      alerts: entry && entry.reason || "Arquivo ignorado com motivo registrado",
    }));
    const analyzedPhysical = state.results.reduce((total, row) => total + (row.files || []).length, 0);
    return {
      title: "Conferência final da eGRDT",
      officialNumber,
      summary: `${items.length} arquivo(s) incluído(s) · ${detailRows.filter((row) => !row.included).length} excluído(s)`,
      expectedInputs: state.packageCandidates.length,
      accountedInputs: analyzedPhysical + state.ignoredFiles.length,
      requireUniqueTargets: true,
      items,
      detailRows,
      counts: [
        { label: "Recebidos", value: state.packageCandidates.length },
        { label: "Analisados", value: analyzedPhysical },
        { label: "Ignorados com motivo", value: state.ignoredFiles.length },
        { label: "Na saída", value: items.length },
      ],
    };
  }

  window.GrconOutputPreview = outputPreviewData;

  function batchPlanPreview(mode) {
    const physicalOnly = mode === "physical";
    const selection = new Set([...state.selected].filter((index) => {
      const row = state.results[index];
      if (!row) return false;
      return physicalOnly ? Boolean(row.files && row.files.length) : Boolean(rowOutputSources(row).length);
    }));
    const plan = E.createPlan(state.results, selection, { manualForceIndices: state.manualForceInclude });
    const groups = plan.errors.length ? [] : E.splitPlan(plan, currentEgrdtBatchLimit());
    const suggested = groups.length ? suggestedEgrdtSequences(groups.length) : [];
    return {
      valid: plan.errors.length === 0 && groups.length > 0,
      errors: plan.errors,
      warnings: plan.warnings || [],
      totalItems: plan.entries.length,
      limit: currentEgrdtBatchLimit(),
      count: groups.length,
      disciplineCount: new Set(groups.map((group) => C.norm(group.discipline))).size,
      groups: groups.map((group, index) => ({
        index,
        number: index + 1,
        itemCount: group.entries.length,
        firstDocument: group.entries[0] && group.entries[0].document || "",
        lastDocument: group.entries[group.entries.length - 1] && group.entries[group.entries.length - 1].document || "",
        documents: group.entries.map((entry) => entry.document),
        discipline: group.discipline,
        disciplineBatchNumber: group.disciplineBatchNumber,
        disciplineBatchCount: group.disciplineBatchCount,
        suggested: suggested[index],
      })),
    };
  }

  window.GrconEgrdtBatchPlan = Object.freeze({
    getLimit() { return currentEgrdtBatchLimit(); },
    setLimit(value) {
      const parsed = normalizeEgrdtBatchLimit(value);
      if (Number(value) !== parsed) throw new Error("Informe uma quantidade inteira de pelo menos 1 documento.");
      state.egrdtBatchLimit = parsed;
      try { localStorage.setItem(EGRDT_BATCH_LIMIT_KEY, String(parsed)); } catch (_) { console.debug("[App] setLimit storage:", _); }
      renderEgrdtBatchSettings();
      return parsed;
    },
    preview(mode) { return batchPlanPreview(mode); },
    validate(values, amount) { return validateManualEgrdtSequences(values, amount); },
    setNumbers(values, amount) {
      const checked = validateManualEgrdtSequences(values, amount);
      if (!checked.valid) throw new Error(checked.error || "Numeração inválida.");
      state.manualEgrdtSequences = checked.items.map((item) => item.sequence);
      state.manualEgrdtSequenceStart = null;
      return checked;
    },
    clear() { state.manualEgrdtSequences = []; },
  });

  function mergePackageResults(rawResults) {
    const grouped = new Map();
    rawResults.forEach((row) => {
      const groupKey = row.documentKey ? `doc:${row.documentKey}` : `file:${row.id}`;
      const fileEntry = row.file ? {
        file: row.file,
        name: row.name,
        relativePath: row.relativePath || row.name,
        finalName: C.proposedFileName(row.name, row.document, row.revision, row.sheet),
        matchKind: row.matchKind || "",
      } : null;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, { ...row, files: fileEntry ? [fileEntry] : [] });
        return;
      }
      const existing = grouped.get(groupKey);
      if (fileEntry) existing.files.push(fileEntry);
      // Se o mesmo documento chegou repetido nas duas grafias, preserve no
      // resultado consolidado a evidência que exigiu ajuste. Sem isto, a linha
      // exata que apareceu primeiro escondia a renomeação da outra entrada.
      if (row.documentLookup && row.documentLookup.matchedByNtVariant
        && !(existing.documentLookup && existing.documentLookup.matchedByNtVariant)) {
        existing.documentLookup = row.documentLookup;
      }
      if (row.ntRename && !existing.ntRename) {
        existing.ntVariant = true;
        existing.ntRename = row.ntRename;
      }
      if (row.documentRevisionWarning) {
        existing.documentRevisionWarning = [existing.documentRevisionWarning, row.documentRevisionWarning].filter(Boolean).join(" ");
      }
      const claimedRevisionConflict = existing.claimedRevision && row.claimedRevision && existing.claimedRevision !== row.claimedRevision;
      if (!existing.claimedRevision && row.claimedRevision) existing.claimedRevision = row.claimedRevision;
      if (claimedRevisionConflict) {
        // Divergência escrita no nome do arquivo é apenas informativa. A revisão
        // que governa a eGRDT é a revisão controlada pela LD/histórico, portanto
        // PDF/nativo não devem ser bloqueados por sufixos divergentes no nome.
        const alert = `ALERTA: arquivos do mesmo documento trazem revisões/sufixos diferentes no nome (${existing.claimedRevision} e ${row.claimedRevision}). O GRCON ignorará essa divergência e usará a revisão controlada ${existing.revision || row.revision || "da LD"}.`;
        existing.documentRevisionWarning = [existing.documentRevisionWarning, alert].filter(Boolean).join(" ");
      }
      if (existing.revision !== row.revision || existing.decision !== row.decision || existing.sheet !== row.sheet) {
        existing.decision = C.REVIEW;
        existing.status = "Pacote inconsistente";
        existing.reason = "Arquivos do mesmo documento produziram revisões, decisões ou abas diferentes. Confira o pacote antes da postagem.";
      }
    });

    return [...grouped.values()].map((row) => {
      row.files.forEach((entry) => {
        entry.finalName = C.proposedFileName(entry.name, row.document, row.revision, row.sheet);
      });
      // Arquivos que convergem para o mesmo nome oficial são duplicatas lógicas.
      // A primeira cópia é preservada; as demais viram somente alerta e não
      // entram na composição N-1710 nem na eGRDT.
      const uniqueFiles = [];
      const seenFinalNames = new Set();
      const duplicateFiles = [];
      row.files.forEach((entry) => {
        const finalKey = C.norm(entry.finalName || entry.name);
        if (finalKey && seenFinalNames.has(finalKey)) {
          duplicateFiles.push(entry);
          state.ignoredFiles.push({
            name: entry.name,
            reason: `arquivo duplicado do documento ${row.document} — ignorado; foi mantida somente a primeira cópia de ${entry.finalName}`,
          });
          return;
        }
        if (finalKey) seenFinalNames.add(finalKey);
        uniqueFiles.push(entry);
      });
      row.files = uniqueFiles;
      row.duplicateFiles = duplicateFiles;
      row.duplicateFileWarning = duplicateFiles.length
        ? `${duplicateFiles.length} arquivo(s) duplicado(s) ignorado(s). Apenas uma cópia de cada arquivo seguirá para a GRDT.`
        : "";
      const primary = row.files.find((entry) => extensionOf(entry.name) === "pdf") || row.files[0] || null;
      if (primary) {
        row.file = primary.file;
        row.name = primary.name;
        row.relativePath = primary.relativePath;
        row.finalName = primary.finalName;
      }
      if (row.ntRename) row.ntRename.finalName = row.finalName || row.ntRename.finalName || "";
      const hasPdf = row.files.some((entry) => extensionOf(entry.name) === "pdf");
      const hasNative = row.files.some((entry) => extensionOf(entry.name) !== "pdf");
      const pairSources = row.files.length
        ? row.files
        : row.virtualFileName
          ? [{ name: row.virtualFileName, finalName: row.finalName, file: null, virtual: true }]
          : [];
      const n1710Pair = E && E.validateN1710Pair ? E.validateN1710Pair(row, pairSources) : { applies: false, valid: true, sources: pairSources, errors: [] };
      if (n1710Pair.applies) row.files = n1710Pair.sources.filter((entry) => entry && entry.file);
      if (n1710Pair.applies && !n1710Pair.valid) {
        row.decision = C.REVIEW;
        row.hardBlock = true;
        row.blockCode = "n1710_pair_incomplete";
        row.status = "Composição N-1710 incompleta";
        row.reason = n1710Pair.errors.join(" ");
      } else if (row.decision === C.READY && !hasPdf && !row.virtualFileName) {
        row.decision = C.REVIEW;
        row.status = "PDF não localizado";
        row.reason = "Nenhum PDF físico foi encontrado para comprovar a revisão e integrar a emissão.";
      }
      const compositionWarning = n1710Pair.applies
        ? n1710Pair.valid
          ? ""
          : `N-1710 bloqueada: ${n1710Pair.errors.join(" ")}`
        : row.virtualFileName
          ? "Item recebido somente pela relação. A GRDT e o nome final podem ser gerados, mas o PDF físico não será incluído no pacote."
          : !row.files.length
            ? "Nenhum arquivo físico foi selecionado; resultado apenas para conferência."
          : !hasPdf
            ? "PDF não localizado no pacote; confirme a composição documental exigida."
            : !hasNative
              ? "Somente PDF localizado; confirme se o arquivo nativo também é aplicável."
              : "";
      const formattingWarnings = row.files
        .map((entry) => C.fileNameFormattingWarning
          ? C.fileNameFormattingWarning(entry.name, row.document, row.revision, row.sheet, entry.matchKind || row.matchKind)
          : "")
        .filter(Boolean);
      row.fileNameFormattingWarning = [...new Set(formattingWarnings)].join(" ");
      row.packageWarning = [
        row.documentRevisionWarning,
        row.fileNameFormattingWarning,
        row.duplicateFileWarning,
        compositionWarning,
      ].filter(Boolean).join(" ");
      row.egrdt = {
        ...C.buildEgrdtData(row.document, row.revision, row.finalName, row.record || {}, row.sheet, ""),
        ...(row.egrdt || {}),
        document: row.document,
        revision: row.revision,
        fileName: row.finalName,
        databook: row.record && row.record.databook || "",
      };
      if (C.enforceDocumentFormat) C.enforceDocumentFormat(row.egrdt);
      return row;
    });
  }

  async function analyzeLegacy() {
    if (!state.ldFiles.length || (!state.packageFiles.length && !hasRelationSource())) return;
    setBusy(true, "Analisando documentos");
    state.records = [];
    state.history = [];
    state.results = [];
    state.pendingAllocationBundle = { rows: [], entries: [], documentCount: 0, pdfCount: 0 };
    state.packageSelectionReady = false;
    state.smartAnalysisCache = { signature: "", snapshot: null, savedAt: 0 };
    state.filter = "todos";
    state.sheetFilter = "todos";
    state.search = "";
    state.resultPage = 1;
    els.search.value = "";
    state.expanded.clear();
    state.selected.clear();
    state.manualForceInclude.clear();
    state.drawerIndices = [];
    state.listIgnoredFiles = [];
    state.listSummary = null;
    state.ldIntegrity = null;
    state.analysisAt = 0;
    state.analysisValidUntil = 0;
    state.analysisLdSignature = "";
    els.analysisStamp.hidden = true;
    els.resultsSection.hidden = true;
    setProgress(3, "Verificando a integridade da LD…");

    try {
      const loadedLds = [];
      for (let index = 0; index < state.ldFiles.length; index += 1) {
        const ldFile = state.ldFiles[index];
        if (L) {
          await ensureRuntime("xlsx");
          await L.prepare(ldFile, { interactive: true });
          if (!L.ready(ldFile)) throw new Error(`Confirme a estrutura de ${ldFile.name} antes de analisar.`);
        }
        setProgress(5 + Math.round(((index + 1) / state.ldFiles.length) * 12), `Lendo LD ${index + 1} de ${state.ldFiles.length}…`);
        const workbook = L && L.workbookFor(ldFile) || await readWorkbook(ldFile, true);
        const parsed = C.parseWorkbook(workbook, ldFile.name, ldFile.lastModified, L && L.profileFor(ldFile));
        loadedLds.push({ file: ldFile, parsed, integrity: validateLdIntegrity(ldFile, parsed) });
      }
      state.ldIntegrity = combineLdIntegrity(loadedLds);
      if (!state.ldIntegrity.valid) throw new Error(`A integridade da LD foi reprovada: ${state.ldIntegrity.issues.join("; ")}.`);
      loadedLds.forEach(({ parsed }) => {
        state.records.push(...parsed.records);
        state.history.push(...parsed.history);
      });
      syncEgrdtSequenceFromLd(state.records, state.history);
      if (!state.records.length || !state.history.length) {
        throw new Error("A LD precisa conter ao menos uma aba técnica e uma base de status do SIGEM.");
      }
      state.index = C.buildIndex(state.records, state.history);

      let analysisFiles = state.packageFiles;
      let missingFromList = [];
      let listSourceByPhysicalKey = new Map();
      let documentLookupByPhysicalKey = new Map();
      if (hasRelationSource()) {
        setProgress(30, state.textEntries.length ? "Preparando a Entrada por texto…" : "Lendo a lista Excel de PDFs…");
        const listEntries = await currentRelationEntries();
        const listSelection = selectPdfsFromList(listEntries);
        analysisFiles = listSelection.matchedFiles;
        missingFromList = listSelection.missing;
        listSourceByPhysicalKey = listSelection.sourceByPhysicalKey;
        documentLookupByPhysicalKey = listSelection.documentLookupByPhysicalKey;
      }

      const inputs = analysisFiles.map((file, index) => ({
        id: `arquivo-${index + 1}`,
        name: file.name,
        relativePath: file.webkitRelativePath || file.name,
        file,
        hintedSheet: "",
        documentSource: hasRelationSource() ? `${relationSourceLabel()} e nome do arquivo` : "nome do arquivo",
        listSource: (listSourceByPhysicalKey.get(listPhysicalKey(file)) || []).join(" | "),
        documentLookupHint: documentLookupByPhysicalKey.get(listPhysicalKey(file)) || null,
      }));
      if (!inputs.length && !missingFromList.length) throw new Error("Nenhum documento válido foi encontrado na pasta.");

      const settings = triageSettings();
      const totalTriageItems = inputs.length + missingFromList.length;
      let processedTriageItems = 0;
      const progressAnalysis = (done) => {
        processedTriageItems = done;
        const percent = 36 + Math.round((processedTriageItems / Math.max(1, totalTriageItems)) * 38);
        setProgress(Math.min(74, percent), `Analisando ${processedTriageItems.toLocaleString("pt-BR")} de ${totalTriageItems.toLocaleString("pt-BR")} documentos…`);
      };
      const rawResults = await mapLarge(inputs, (input) => {
        const result = C.triageOne(input, state.index, settings);
        // O conteúdo binário dos PDFs não é aberto, lido ou validado. A revisão
        // e o nome final dependem exclusivamente da LD e do histórico SIGEM.
        if (result.egrdt && !result.egrdt.format) result.egrdt.format = "A4";
        return result;
      }, progressAnalysis);

      state.results = mergePackageResults(rawResults);
      // O cruzamento com o Apêndice é informativo: roda depois da triagem, não
      // altera decisão nenhuma e responde "não apurado" quando não há Apêndice.
      if (Apendice) Apendice.apply(state.results, null);
      const physicalCount = state.results.reduce((total, row) => total + (row.files || []).length, 0);
      const logicalDuplicateCount = state.results.reduce((total, row) => total + (row.duplicateFiles || []).length, 0);
      if (physicalCount + logicalDuplicateCount !== inputs.length || state.results.some((row) => !(row.files || []).length)) {
        throw new Error("A conferência de origem falhou: um resultado não corresponde aos arquivos selecionados nem às duplicatas registradas.");
      }
      if (missingFromList.length) {
        const logicalResults = await mapLarge(missingFromList, (entry, index) => {
          const listedName = /\.pdf$/i.test(entry.fileName || "")
            ? entry.fileName
            : `${entry.fileName || entry.document || entry.raw}.pdf`;
          const input = {
            id: `lista-ausente-${index + 1}`,
            name: listedName,
            relativePath: `${relationSourceLabel()} · ${entry.sheetName} · linha ${entry.rowNumber}`,
            file: null,
            document: entry.document,
            hintedSheet: C.inferSheetFromName(entry.document || entry.raw),
            documentSource: state.textEntries.length ? "Entrada por texto" : "lista Excel",
            listSource: `${entry.sheetName} · linha ${entry.rowNumber}`,
            documentLookupHint: entry.documentLookup || null,
          };
          const result = C.triageOne(input, state.index, settings);
          result.virtualFileName = listedName;
          result.listSource = input.listSource;
          const warnings = [entry.reason];
          if (result.egrdt && !result.egrdt.format) {
            result.egrdt.format = "A4";
            warnings.push("Como o PDF físico não foi fornecido, o formato foi preenchido como A4 e deve ser confirmado antes da postagem.");
          }
          result.documentRevisionWarning = warnings.join(" ");
          return result;
        }, (done) => progressAnalysis(inputs.length + done));
        const mergedLogicalResults = mergePackageResults(logicalResults);
        mergedLogicalResults.forEach((row) => state.results.push(row));
      }
      await forEachLarge(state.results, (row, index) => {
        row._resultIndex = index;
        row.timeline = buildRowTimeline(row, settings);
        enforceDatabookFromLd(row);
      }, (done, total) => setProgress(75 + Math.round((done / Math.max(1, total)) * 20), `Finalizando ${done.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} documentos…`));
      
      if (window.GrconAnalysisWarning) {
        try {
          setProgress(96, "Verificando análises anteriores…");
          const previousAnalysis = await window.GrconAnalysisWarning.checkPreviousAnalysis(state.results);
          state.results.forEach((row) => {
            const key = AnalysisHistory ? AnalysisHistory.norm(row.document) : "";
            const info = previousAnalysis.get(key);
            if (info) {
              row.previousAnalysisInfo = info;
              row.previousAnalysisWarning = window.GrconAnalysisWarning.formatAnalysisWarning(info);
            }
          });
        } catch (error) {
          console.warn("Não foi possível carregar histórico de análises:", error);
        }
      }
      
      refreshPendingAllocationBundle();
      state.selected.clear();
      state.manualForceInclude.clear();
      state.results.forEach((row, index) => {
        if (row.decision === C.READY && !row.hardBlock && rowOutputSources(row).length) state.selected.add(index);
      });
      state.analysisAt = Date.now();
      state.analysisValidUntil = state.analysisAt + ANALYSIS_VALIDITY_MS;
      state.analysisRecentDays = state.recentDays;
      state.analysisLdSignature = currentLdSignature();
      const validUntil = new Date(state.analysisValidUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      els.analysisStamp.textContent = `${state.ldFiles.length} LD(s) lida(s) nesta análise · até ${validUntil}`;
      els.analysisStamp.title = `GRCON ${APP_VERSION} · ${ldDisplayName()}`;
      els.analysisStamp.hidden = false;
      await saveCurrentAnalysisHistory();
      savePendingAllocationHistory();
      setProgress(100, "Análise concluída");
      // Garante que o selo de "já emitido antes" reflita o histórico mais
      // recente ao mostrar os documentos desta nova análise, em vez de
      // depender só de um evento de sincronização anterior.
      if (window.GrconGrdtHistoryIndicator) window.GrconGrdtHistoryIndicator.refresh();
      renderAll();
      els.resultsSection.hidden = false;
      focarResultados();
      const counts = C.resultCounts(state.results);
      const ignored = state.ignoredFiles.length ? ` · ${state.ignoredFiles.length} arquivo(s) ignorado(s)` : "";
      showToast(`${counts.pronto} prontos · ${counts.bloqueado} bloqueados · ${counts.descartar} em análise · ${counts.revisar} para revisar${ignored}.`, counts.revisar || counts.bloqueado ? "warn" : "success");
      window.setTimeout(() => { els.progress.hidden = true; }, 900);
    } catch (error) {
      console.error(error);
      els.progress.hidden = true;
      const ErrorHandler = window.GrconErrorHandler;
      if (ErrorHandler) {
        ErrorHandler.showSmartError(error, { 
          operation: "analysis", 
          fileName: state.ldFiles[0]?.name,
          ldName: ldDisplayName(),
          fileCount: state.packageFiles.length,
          source: hasRelationSource() ? "list" : "folder"
        });
      } else {
        const rawMessage = String(error && error.message || "");
        const corrupted = /bad compressed size|invalid zip|central directory|unexpected end|corrupt|truncated/i.test(rawMessage);
        showToast(corrupted
          ? "A LD está corrompida ou incompleta. Exporte ou copie o arquivo novamente antes de analisar."
          : rawMessage || "Não foi possível concluir a análise.", "error");
      }
    } finally {
      setBusy(false);
      updateInputMeta();
    }
  }


  async function analyze() {
    try { await ensureRuntime("performance"); } catch (_) { console.debug("[App] ensureRuntime performance:", _); /* usa compatibilidade */ }
    if (!PerformanceCore || !PerformanceCore.supported) return analyzeLegacy();
    if (!state.ldFiles.length || (!state.packageFiles.length && !hasRelationSource())) return;

    const analysisSignature = currentAnalysisSignature();
    if (restoreSmartAnalysisCache(analysisSignature)) {
      const validUntil = new Date(state.analysisValidUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      els.analysisStamp.textContent = `${state.ldFiles.length} LD(s) reaproveitadas do cache · válidas até ${validUntil}`;
      els.analysisStamp.title = `GRCON ${APP_VERSION} · ${ldDisplayName()}`;
      els.analysisStamp.hidden = false;
      els.resultsSection.hidden = false;
      renderAll();
      focarResultados();
      refreshPerformancePanel("Cache inteligente aplicado: análise restaurada instantaneamente.");
      showToast("Análise reaproveitada do cache local (instantânea).", "success");
      return;
    }

    state.cancelled = false;
    setBusy(true, "Analisando documentos");
    state.records = [];
    state.history = [];
    state.results = [];
    state.pendingAllocationBundle = { rows: [], entries: [], documentCount: 0, pdfCount: 0 };
    state.packageSelectionReady = false;
    state.smartAnalysisCache = { signature: "", snapshot: null, savedAt: 0 };
    state.resultVersion += 1;
    state.filteredCache = { signature: "", indices: [] };
    state.filter = "todos";
    state.sheetFilter = "todos";
    state.search = "";
    state.resultPage = 1;
    if (els.search) els.search.value = "";
    state.expanded.clear();
    state.selected.clear();
    state.manualForceInclude.clear();
    state.drawerIndices = [];
    state.listIgnoredFiles = [];
    state.listSummary = null;
    state.ldIntegrity = null;
    state.analysisAt = 0;
    state.analysisValidUntil = 0;
    state.analysisLdSignature = "";
    if (els.analysisStamp) els.analysisStamp.hidden = true;
    if (els.resultsSection) els.resultsSection.hidden = true;
    if (els.resultsScroll) els.resultsScroll.scrollTop = 0;
    setProgress(2, "Preparando a análise…");

    try {
      const loadedLds = [];
      for (let index = 0; index < state.ldFiles.length; index += 1) {
        const ldFile = state.ldFiles[index];
        let profile = L && L.profileFor ? L.profileFor(ldFile) : null;
        let ldResult = await loadLdSafely(
          ldFile,
          profile,
          workerProgress(`LD ${index + 1}/${state.ldFiles.length}`),
        );
        let parsed = ldResult.parsed;
        let integrity = validateLdIntegrity(ldFile, parsed);
        if (!integrity.valid && L) {
          // Somente LDs fora do padrão abrem a compatibilidade. A LD comum nunca é
          // relida na thread da interface.
          await ensureRuntime("xlsx");
          await L.prepare(ldFile, { interactive: true });
          if (!L.ready(ldFile)) throw new Error(`Confirme a estrutura de ${ldFile.name} antes de analisar.`);
          profile = L.profileFor(ldFile);
          await PerformanceCore.clearLdCache();
          ldResult = await loadLdSafely(ldFile, profile, workerProgress(`Leitura de ${ldFile.name}`));
          parsed = ldResult.parsed;
          integrity = validateLdIntegrity(ldFile, parsed);
        }
        loadedLds.push({ file: ldFile, parsed, integrity, ldResult });
      }
      state.ldIntegrity = combineLdIntegrity(loadedLds);
      if (!state.ldIntegrity.valid) throw new Error(`A integridade da LD foi reprovada: ${state.ldIntegrity.issues.join("; ")}.`);
      state.records = loadedLds.flatMap((item) => item.parsed.records);
      state.history = loadedLds.flatMap((item) => item.parsed.history);
      state.index = C.buildIndex(state.records, state.history);
      if (!state.records.length || !state.history.length) throw new Error("A LD precisa conter ao menos uma aba técnica e uma base de status do SIGEM.");
      syncEgrdtSequenceFromLd(state.records, state.history);
      const cachedCount = loadedLds.filter((item) => item.ldResult.cacheHit).length;
      const cacheMessage = cachedCount
        ? `${cachedCount} de ${loadedLds.length} LD(s) reutilizada(s) do cache; índice consolidado reconstruído com todas as bases.`
        : `${loadedLds.length} LD(s) lida(s), consolidadas e preparadas.`;
      refreshPerformancePanel(cacheMessage);

      let analysisFiles = state.packageFiles;
      let missingFromList = [];
      let listSourceByPhysicalKey = new Map();
      let documentLookupByPhysicalKey = new Map();
      if (hasRelationSource()) {
        const listEntries = await currentRelationEntries();
        const listSelection = selectPdfsFromList(listEntries);
        analysisFiles = listSelection.matchedFiles;
        missingFromList = listSelection.missing;
        listSourceByPhysicalKey = listSelection.sourceByPhysicalKey;
        documentLookupByPhysicalKey = listSelection.documentLookupByPhysicalKey;
      }

      const physicalById = new Map();
      const logicalMeta = new Map();
      const workerInputs = analysisFiles.map((file, index) => {
        const id = `arquivo-${index + 1}`;
        physicalById.set(id, file);
        return {
          id,
          name: file.name,
          relativePath: file.webkitRelativePath || file.name,
          file: null,
          hintedSheet: "",
          documentSource: hasRelationSource() ? `${relationSourceLabel()} e nome do arquivo` : "nome do arquivo",
          listSource: (listSourceByPhysicalKey.get(listPhysicalKey(file)) || []).join(" | "),
          documentLookupHint: documentLookupByPhysicalKey.get(listPhysicalKey(file)) || null,
        };
      });
      missingFromList.forEach((entry, index) => {
        const id = `lista-ausente-${index + 1}`;
        const listedName = /\.pdf$/i.test(entry.fileName || "") ? entry.fileName : `${entry.fileName || entry.document || entry.raw}.pdf`;
        workerInputs.push({
          id,
          name: listedName,
          relativePath: `${relationSourceLabel()} · ${entry.sheetName} · linha ${entry.rowNumber}`,
          file: null,
          document: entry.document,
          hintedSheet: C.inferSheetFromName(entry.document || entry.raw),
          documentSource: state.textEntries.length ? "Entrada por texto" : "lista Excel",
          listSource: `${entry.sheetName} · linha ${entry.rowNumber}`,
          documentLookupHint: entry.documentLookup || null,
        });
        logicalMeta.set(id, { listedName, reason: entry.reason, listSource: `${entry.sheetName} · linha ${entry.rowNumber}` });
      });
      if (!workerInputs.length) throw new Error("Nenhum documento válido foi encontrado na entrada.");

      const settings = triageSettings();
      await PerformanceCore.initializeTriage(state.index, [], settings, workerProgress("Preparando triagem"));
      const rawResults = await PerformanceCore.triage(workerInputs, settings, workerProgress("Triagem"));
      rawResults.forEach((result) => {
        const physical = physicalById.get(result.id);
        if (physical) result.file = physical;
        // O Worker aplica as regras da LD, mas não abre o conteúdo binário do
        // PDF para inferir o tamanho da folha. Preserve o mesmo padrão seguro
        // do fluxo legado quando a LD não possuir a coluna FORMATO.
        const formatDefaulted = Boolean(result.egrdt && !result.egrdt.format);
        if (formatDefaulted) result.egrdt.format = "A4";
        const logical = logicalMeta.get(result.id);
        if (logical) {
          result.virtualFileName = logical.listedName;
          result.listSource = logical.listSource;
          const warnings = [logical.reason].filter(Boolean);
          if (formatDefaulted) {
            warnings.push("Como o PDF físico não foi fornecido, o formato foi preenchido como A4 e deve ser confirmado antes da postagem.");
          }
          result.documentRevisionWarning = warnings.join(" ");
        }
      });

      state.results = mergePackageResults(rawResults);
      // O cruzamento com o Apêndice é informativo: roda depois da triagem, não
      // altera decisão nenhuma e responde "não apurado" quando não há Apêndice.
      if (Apendice) Apendice.apply(state.results, null);
      const physicalCount = state.results.reduce((total, row) => total + (row.files || []).length, 0);
      const logicalDuplicateCount = state.results.reduce((total, row) => total + (row.duplicateFiles || []).length, 0);
      if (physicalCount + logicalDuplicateCount !== analysisFiles.length) throw new Error("A conferência de origem falhou: a quantidade de arquivos físicos e duplicatas registradas não confere.");

      refreshPendingAllocationBundle();
      state.selected.clear();
      state.manualForceInclude.clear();
      state.results.forEach((row, index) => {
        row._resultIndex = index;
        if (row.decision === C.READY && !row.hardBlock && rowOutputSources(row).length) state.selected.add(index);
      });
      state.resultVersion += 1;
      state.filteredCache = { signature: "", indices: [] };
      state.analysisAt = Date.now();
      state.analysisValidUntil = state.analysisAt + ANALYSIS_VALIDITY_MS;
      state.analysisRecentDays = state.recentDays;
      state.analysisLdSignature = currentLdSignature();
      const validUntil = new Date(state.analysisValidUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      els.analysisStamp.textContent = `${state.ldFiles.length} LD(s) preparadas · válidas até ${validUntil}`;
      els.analysisStamp.title = `GRCON ${APP_VERSION} · ${ldDisplayName()}`;
      els.analysisStamp.hidden = false;
      els.resultsSection.hidden = false;

      // Garante que o selo de "já emitido antes" reflita o histórico mais
      // recente ao mostrar os documentos desta nova análise, em vez de
      // depender só de um evento de sincronização anterior.
      if (window.GrconGrdtHistoryIndicator) window.GrconGrdtHistoryIndicator.refresh();
      const counts = C.resultCounts(state.results);
      window.requestAnimationFrame(() => {
        renderAll();
        focarResultados();
        refreshPerformancePanel(`Resultados iniciais exibidos · consolidando linha do tempo e Databook em segundo plano.`);
        showToast(`${counts.pronto} prontos · ${counts.bloqueado} bloqueados · ${counts.descartar} em análise · ${counts.revisar} para revisar.`, counts.revisar || counts.bloqueado ? "warn" : "success");
      });

      const enrichInput = state.results.map((row) => ({
        documentKey: row.documentKey,
        document: row.document,
        sheet: row.sheet,
        egrdt: row.egrdt,
        record: row.record,
      }));
      const enrichment = await PerformanceCore.enrich(enrichInput, settings, workerProgress("Linha do tempo e Databook"));
      enrichment.forEach((item) => {
        const row = state.results[item.index];
        if (!row) return;
        row.timeline = item.timeline;
        enforceDatabookFromLd(row);
      });
      if (state.results.length) {
        window.requestAnimationFrame(() => {
          renderAll();
          refreshPerformancePanel(`Concluído: ${counts.total.toLocaleString("pt-BR")} documentos processados fora da thread da interface.`);
        });
      }

      saveSmartAnalysisCache(analysisSignature);
      await saveCurrentAnalysisHistory();
      savePendingAllocationHistory();
    } catch (error) {
      if (error && error.name === "AbortError") {
        state.cancelled = true;
        if (els.performancePanel) els.performancePanel.classList.add("is-cancelled");
        refreshPerformancePanel("Processamento cancelado. Nenhum resultado parcial foi usado.");
        showToast("Processamento cancelado com segurança.", "warn");
      } else {
        console.error(error);
        const rawMessage = String(error && error.message || "");
        const corrupted = /bad compressed size|invalid zip|central directory|unexpected end|corrupt|truncated/i.test(rawMessage);
        showToast(corrupted ? "A LD está corrompida ou incompleta. Exporte ou copie o arquivo novamente." : rawMessage || "Não foi possível concluir a análise.", "error");
      }
    } finally {
      setBusy(false);
      updateInputMeta();
    }
  }

  async function ensureFreshAnalysis() {
    if (!state.analysisAt || !state.results.length) {
      showToast("Execute uma análise antes de gerar arquivos.", "error");
      return false;
    }
    if (Date.now() > state.analysisValidUntil) {
      showToast("A análise expirou após 30 minutos. Analise novamente com a LD atual.", "error");
      return false;
    }
    const currentRecentDays = Math.max(1, Number(els.recentDays.value) || 30);
    if (currentRecentDays !== state.analysisRecentDays) {
      showToast("A janela de emissão recente foi alterada. Analise novamente antes de emitir.", "error");
      return false;
    }
    if (!state.ldFiles.length || currentLdSignature() !== state.analysisLdSignature) {
      showToast("O conjunto de LDs usado na análise foi alterado. Analise novamente antes de emitir.", "error");
      return false;
    }
    return true;
  }

  function decisionLabel(value, row) {
    if (row && manuallyIncluded(row)) return "Incluído manualmente — LD: Não Alocado";
    if (row && row.hardBlock) return "Não será incluído";
    if (value === C.READY) return "Será incluído na eGRDT";
    if (value === C.DISCARD) return "Não será enviado novamente";
    return "Precisa de conferência";
  }

  function compactDecisionLabel(row) {
    if (manuallyIncluded(row)) return "Incluído manualmente";
    // Conflito de alocação não é "não alocado": a LD tem duas respostas e quem
    // decide é a pessoa. Chamar de "não incluir" escondia a diferença.
    if (row.blockCode === "not_allocated_conflict") return "Conferir alocação";
    // ALOC enviada com o retorno pendente também não é uma recusa. Continua
    // fora da eGRDT, mas quem lê precisa saber que o que falta é a confirmação
    // da Fiscal — e não uma alocação que ninguém pediu.
    if (row.allocationFinding && row.allocationFinding.awaitingReturn) return "Aguardando alocação";
    if (row.hardBlock) return "Não incluir";
    if (row.decision === C.READY) return "Incluir";
    if (row.decision === C.DISCARD) return "Em análise";
    return "Conferir";
  }

  function decisionClass(value, row) {
    if (row && row.hardBlock) return "blocked";
    return value === C.READY ? "ready" : value === C.DISCARD ? "discard" : "review";
  }

  function decisionGroupKey(row) {
    if (row && row.hardBlock) return "bloqueado";
    if (row && row.decision === C.READY) return "pronto";
    if (row && row.decision === C.DISCARD) return "descartar";
    return "revisar";
  }

  function decisionGroupLabel(row) {
    return ({ pronto: "Incluir na eGRDT", revisar: "Precisa de conferência", bloqueado: "Não incluir", descartar: "Em análise" })[decisionGroupKey(row)] || "Outros";
  }

  function formatDateBR(value) {
    const parsed = C && C.parseDate ? C.parseDate(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return String(value || "").trim();
    return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
  }

  const RESULT_COLUMN_FILTERS = Object.freeze([
    ["situation", "Situação"], ["originalFile", "Arquivo original"], ["document", "Documento"],
    ["ldCode", "Código da LD"], ["apendiceSearch", "Busca no Apêndice"], ["tagged", "Tagueado sim ou não?"],
    ["sheet", "Aba LD"],
    ["ldRevision", "Revisão"], ["targetRevision", "Revisão para postar"], ["title", "Título"], ["effectiveDate", "Data efetiva"],
    ["grdt", "GRDT"], ["technicalStatus", "Status"], ["sigemStatus", "Status SIGEM"], ["targetStatus", "Status da revisão"],
    ["postingStatus", "Situação de postagem"], ["fiscalComment", "Comentário da Fiscal"], ["allocation", "Alocação"],
    ["allocationStage", "Etapa da alocação"], ["allocationStatus", "Confirmação"], ["databook", "Caminho Databook"], ["finalFile", "Arquivo final"],
  ]);

  function resultColumnValue(row, keyName) {
    const record = row && row.record || {};
    const values = {
      situation: compactDecisionLabel(row),
      originalFile: [row && row.name, ...(row && row.files || []).map((entry) => entry.name)].filter(Boolean).join(" | "),
      document: row && row.document,
      ldCode: apendiceInfo(row).ldCode,
      apendiceSearch: apendiceInfo(row).search,
      tagged: apendiceInfo(row).tagged,
      sheet: row && row.sheet,
      ldRevision: record.revision,
      targetRevision: row && row.revision,
      title: record.title,
      effectiveDate: formatDateBR(ldValue(record, "DATA EFETIVA DE EMISSÃO") || record.effectiveDate),
      grdt: record.grdt || row && row.grdt,
      technicalStatus: record.status,
      sigemStatus: record.sigemStatus,
      targetStatus: row && row.status,
      postingStatus: row && (row.postingStatus || row.postingEvidence && row.postingEvidence.status),
      fiscalComment: record.fiscalComment,
      allocation: record.allocation,
      allocationStage: record.allocationStage || ldValue(record, "ETAPA DA ALOCAÇÃO"),
      allocationStatus: record.allocationStatus || row && row.allocationStatus,
      databook: record.databook,
      finalFile: row && row.finalName,
    };
    return values[keyName] || "";
  }

  // state.columnFilters[key] guarda os valores NORMALIZADOS marcados
  // (como no filtro do Excel: uma lista de valores permitidos). A chave só
  // existe quando é um subconjunto próprio — "tudo marcado" equivale a
  // nenhum filtro, igual ao Excel.
  function activeColumnFilters() {
    return Object.entries(state.columnFilters || {}).filter(([, values]) => Array.isArray(values) && values.length);
  }

  function rowPassesBaseFilters(row) {
    if (state.filter === "bloqueado" && !row.hardBlock) return false;
    if (state.filter === C.REVIEW && (row.hardBlock || row.decision !== C.REVIEW)) return false;
    if (!["todos", "bloqueado", C.REVIEW].includes(state.filter) && row.decision !== state.filter) return false;
    if (state.sheetFilter !== "todos" && C.norm(row.sheet) !== state.sheetFilter) return false;
    const query = C.norm(state.search);
    if (query && !C.norm(`${row.name} ${row.document} ${row.revision} ${row.status} ${row.sheet} ${row.reason} ${row.allocationStatus} ${row.fiscalComment} ${row.grdt}`).includes(query)) return false;
    return true;
  }

  function rowPassesColumnFilters(row, excludeKey, columnFilters) {
    for (const [keyName, values] of columnFilters || activeColumnFilters()) {
      if (keyName === excludeKey) continue;
      if (!values.includes(C.norm(resultColumnValue(row, keyName)))) return false;
    }
    return true;
  }

  // Valores únicos disponíveis para a coluna, considerando os demais filtros
  // já aplicados (igual ao Excel: o menu de uma coluna reflete o que ainda é
  // alcançável dado o restante dos filtros ativos).
  function computeColumnFilterOptions(keyName) {
    const map = new Map();
    state.results.forEach((row) => {
      if (!rowPassesBaseFilters(row) || !rowPassesColumnFilters(row, keyName)) return;
      const raw = String(resultColumnValue(row, keyName) ?? "").trim();
      const norm = C.norm(raw);
      if (!map.has(norm)) map.set(norm, { norm, label: raw || "(Vazias)", count: 0 });
      map.get(norm).count += 1;
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
  }

  const columnFilterPopoverState = { keyName: null, pending: null, options: [], search: "", triggerEl: null };

  function updateColumnFilterTriggerStates() {
    if (!els.resultsTable) return;
    els.resultsTable.querySelectorAll("[data-column-filter-trigger]").forEach((button) => {
      const active = Array.isArray(state.columnFilters[button.dataset.columnFilterTrigger]) && state.columnFilters[button.dataset.columnFilterTrigger].length > 0;
      button.classList.toggle("is-active", active);
    });
  }

  function closeColumnFilterPopover() {
    if (columnFilterPopoverState.triggerEl) columnFilterPopoverState.triggerEl.setAttribute("aria-expanded", "false");
    columnFilterPopoverState.keyName = null;
    columnFilterPopoverState.triggerEl = null;
    if (els.columnFilterPopover) els.columnFilterPopover.hidden = true;
  }

  function renderColumnFilterPopover() {
    const popover = els.columnFilterPopover;
    if (!popover) return;
    const { options, pending, search } = columnFilterPopoverState;
    const query = C.norm(search);
    const visibleOptions = query ? options.filter((option) => C.norm(option.label).includes(query)) : options;
    const allVisibleChecked = visibleOptions.length > 0 && visibleOptions.every((option) => pending.has(option.norm));
    popover.querySelector(".column-filter-search").value = search;
    const selectAll = popover.querySelector(".column-filter-select-all");
    selectAll.checked = allVisibleChecked;
    selectAll.indeterminate = !allVisibleChecked && visibleOptions.some((option) => pending.has(option.norm));
    popover.querySelector(".column-filter-list").innerHTML = visibleOptions.length
      ? visibleOptions.map((option) => `<label class="column-filter-option"><input type="checkbox" data-column-filter-value="${escapeHtml(option.norm)}" ${pending.has(option.norm) ? "checked" : ""}><span>${escapeHtml(option.label)}</span><b>${option.count}</b></label>`).join("")
      : `<p class="column-filter-empty">Nenhum valor com os filtros atuais.</p>`;
    const applyButton = popover.querySelector(".column-filter-apply");
    if (applyButton) applyButton.disabled = pending.size === 0;
    // O conteúdo mudou de altura (busca filtrando a lista): reposiciona para o
    // menu continuar dentro da janela.
    if (!popover.hidden && columnFilterPopoverState.triggerEl) positionColumnFilterPopover(columnFilterPopoverState.triggerEl);
  }

  // flipBias: abrir para baixo é o esperado (como no Excel) e cobre o corpo da
  // tabela; abrir para cima tapa a barra de ferramentas. Só vira para cima
  // quando o espaço acima é bem maior, não por uma diferença pequena.
  const COLUMN_FILTER_GEOMETRY = Object.freeze({ margin: 12, gap: 6, maxHeight: 420, minHeight: 160, maxWidth: 300, flipBias: 80 });

  // Geometria pura (sem DOM) para poder ser conferida isoladamente: decide se o
  // menu abre para baixo ou para cima conforme o espaço disponível e garante que
  // ele nunca ultrapasse a margem da janela em nenhum dos quatro lados.
  function columnFilterPlacement(triggerRect, naturalHeight, viewport) {
    const { margin, gap, maxHeight, minHeight, maxWidth, flipBias } = COLUMN_FILTER_GEOMETRY;
    const width = Math.min(maxWidth, viewport.width - margin * 2);
    const desired = Math.min(naturalHeight, maxHeight);
    const roomBelow = viewport.height - triggerRect.bottom - gap - margin;
    const roomAbove = triggerRect.top - gap - margin;
    const below = roomBelow >= desired || roomBelow + flipBias >= roomAbove;
    const room = Math.max(below ? roomBelow : roomAbove, minHeight);
    const height = Math.max(Math.min(minHeight, viewport.height - margin * 2), Math.min(desired, room));
    let top = below ? triggerRect.bottom + gap : triggerRect.top - gap - height;
    top = Math.max(margin, Math.min(top, viewport.height - margin - height));
    // Alinha pela seta; se estourar à direita, alinha o menu pela direita da seta.
    let left = triggerRect.left;
    if (left + width > viewport.width - margin) left = triggerRect.right - width;
    left = Math.max(margin, Math.min(left, viewport.width - margin - width));
    return { left, top, width, height, below };
  }

  function positionColumnFilterPopover(triggerEl) {
    const popover = els.columnFilterPopover;
    if (!popover || !triggerEl) return;
    // Mede a altura natural do conteúdo antes de decidir o limite.
    popover.style.maxHeight = "";
    const placement = columnFilterPlacement(
      triggerEl.getBoundingClientRect(),
      popover.offsetHeight,
      { width: document.documentElement.clientWidth, height: window.innerHeight },
    );
    popover.style.width = `${placement.width}px`;
    popover.style.left = `${placement.left}px`;
    popover.style.top = `${placement.top}px`;
    popover.style.maxHeight = `${placement.height}px`;
    popover.classList.toggle("is-above", !placement.below);
  }

  // A tabela rola na horizontal (19 colunas) dentro do próprio contêiner, e a
  // página rola por fora. Sem isto o menu ficava parado no lugar antigo,
  // "descolado" da coluna que ele filtra.
  function columnFilterTriggerVisible(triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
    const scroller = els.resultsScroll;
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      if (rect.right <= bounds.left + 2 || rect.left >= bounds.right - 2) return false;
    }
    return true;
  }

  function followColumnFilterTrigger() {
    const popover = els.columnFilterPopover;
    const triggerEl = columnFilterPopoverState.triggerEl;
    if (!popover || popover.hidden || !triggerEl) return;
    if (!columnFilterTriggerVisible(triggerEl)) { closeColumnFilterPopover(); return; }
    positionColumnFilterPopover(triggerEl);
  }

  function ensureColumnFilterPopover() {
    if (els.columnFilterPopover) return;
    const popover = document.createElement("div");
    popover.className = "column-filter-popover";
    popover.hidden = true;
    popover.innerHTML = `
      <input type="search" class="column-filter-search" placeholder="Buscar valor…" autocomplete="off">
      <label class="column-filter-option column-filter-select-all-row"><input type="checkbox" class="column-filter-select-all"><span>(Selecionar tudo)</span></label>
      <div class="column-filter-list"></div>
      <footer>
        <button type="button" class="text-button column-filter-reset">Limpar filtro</button>
        <span></span>
        <button type="button" class="secondary-button compact column-filter-cancel">Cancelar</button>
        <button type="button" class="primary-button compact column-filter-apply">OK</button>
      </footer>`;
    document.body.appendChild(popover);
    els.columnFilterPopover = popover;

    popover.querySelector(".column-filter-search").addEventListener("input", (event) => {
      columnFilterPopoverState.search = event.target.value;
      renderColumnFilterPopover();
    });
    popover.querySelector(".column-filter-select-all").addEventListener("change", (event) => {
      const query = C.norm(columnFilterPopoverState.search);
      const visible = query ? columnFilterPopoverState.options.filter((option) => C.norm(option.label).includes(query)) : columnFilterPopoverState.options;
      visible.forEach((option) => { if (event.target.checked) columnFilterPopoverState.pending.add(option.norm); else columnFilterPopoverState.pending.delete(option.norm); });
      renderColumnFilterPopover();
    });
    popover.querySelector(".column-filter-list").addEventListener("change", (event) => {
      const input = event.target.closest("[data-column-filter-value]");
      if (!input) return;
      if (input.checked) columnFilterPopoverState.pending.add(input.dataset.columnFilterValue);
      else columnFilterPopoverState.pending.delete(input.dataset.columnFilterValue);
      renderColumnFilterPopover();
    });
    popover.querySelector(".column-filter-cancel").addEventListener("click", () => closeColumnFilterPopover());
    popover.querySelector(".column-filter-reset").addEventListener("click", () => {
      delete state.columnFilters[columnFilterPopoverState.keyName];
      state.filteredCache = { signature: "", indices: [] };
      closeColumnFilterPopover();
      updateColumnFilterTriggerStates();
      if (els.clearColumnFilters) els.clearColumnFilters.hidden = activeColumnFilters().length === 0;
      if (els.resultsScroll) els.resultsScroll.scrollTop = 0;
      renderAll();
    });
    popover.querySelector(".column-filter-apply").addEventListener("click", () => {
      const { keyName, pending, options } = columnFilterPopoverState;
      if (pending.size >= options.length) delete state.columnFilters[keyName];
      else state.columnFilters[keyName] = [...pending];
      state.filteredCache = { signature: "", indices: [] };
      closeColumnFilterPopover();
      updateColumnFilterTriggerStates();
      if (els.clearColumnFilters) els.clearColumnFilters.hidden = activeColumnFilters().length === 0;
      if (els.resultsScroll) els.resultsScroll.scrollTop = 0;
      renderAll();
    });
    document.addEventListener("click", (event) => {
      if (popover.hidden || popover.contains(event.target) || event.target.closest("[data-column-filter-trigger]")) return;
      closeColumnFilterPopover();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popover.hidden) closeColumnFilterPopover();
    });
    // capture:true para pegar também a rolagem do contêiner da tabela, que não borbulha.
    window.addEventListener("scroll", followColumnFilterTrigger, true);
    window.addEventListener("resize", followColumnFilterTrigger);
  }

  function openColumnFilterPopover(keyName, triggerEl) {
    ensureColumnFilterPopover();
    const options = computeColumnFilterOptions(keyName);
    const existing = state.columnFilters[keyName];
    const pending = new Set(existing && existing.length ? existing : options.map((option) => option.norm));
    columnFilterPopoverState.keyName = keyName;
    columnFilterPopoverState.pending = pending;
    columnFilterPopoverState.options = options;
    columnFilterPopoverState.search = "";
    columnFilterPopoverState.triggerEl = triggerEl;
    els.columnFilterPopover.hidden = false;
    renderColumnFilterPopover();
    positionColumnFilterPopover(triggerEl);
    triggerEl.setAttribute("aria-expanded", "true");
    // preventScroll: sem isto o foco podia arrastar a página quando o menu
    // nascia perto da borda inferior.
    els.columnFilterPopover.querySelector(".column-filter-search").focus({ preventScroll: true });
  }

  function initializeResultColumnFilters() {
    if (els.columnFilterRow) els.columnFilterRow.hidden = true;
    if (!els.resultsTable || els.resultsTable.dataset.columnFilterTriggersReady === "true") return;
    els.resultsTable.dataset.columnFilterTriggersReady = "true";
    const headerCells = [...els.resultsTable.querySelectorAll("thead tr:first-child > th")];
    RESULT_COLUMN_FILTERS.forEach(([keyName, label], index) => {
      const th = headerCells[index];
      if (!th) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "column-filter-trigger";
      button.dataset.columnFilterTrigger = keyName;
      button.setAttribute("aria-label", `Filtrar ${label}`);
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = '<svg viewBox="0 0 12 9" aria-hidden="true"><path d="M1 1h10L7.2 6v2.2L4.8 7.2V6z"/></svg>';
      th.appendChild(button);
    });
    els.resultsTable.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-column-filter-trigger]");
      if (!trigger) return;
      event.stopPropagation();
      const keyName = trigger.dataset.columnFilterTrigger;
      if (columnFilterPopoverState.keyName === keyName && els.columnFilterPopover && !els.columnFilterPopover.hidden) { closeColumnFilterPopover(); return; }
      openColumnFilterPopover(keyName, trigger);
    });
  }

  function clearResultColumnFilters() {
    state.columnFilters = {};
    state.filteredCache = { signature: "", indices: [] };
    closeColumnFilterPopover();
    updateColumnFilterTriggerStates();
    if (els.clearColumnFilters) els.clearColumnFilters.hidden = true;
    if (els.resultsScroll) els.resultsScroll.scrollTop = 0;
    renderAll();
  }

  function filteredResultIndices() {
    const columnFilters = activeColumnFilters();
    const columnSignature = columnFilters.map(([keyName, values]) => `${keyName}:${[...values].sort().join(",")}`).join("|");
    const signature = `${state.resultVersion}|${state.filter}|${state.sheetFilter}|${C.norm(state.search)}|${columnSignature}|group:${state.groupByStatus ? "1" : "0"}`;
    if (state.filteredCache && state.filteredCache.signature === signature) return state.filteredCache.indices;
    const indices = [];
    for (let index = 0; index < state.results.length; index += 1) {
      const row = state.results[index];
      if (!rowPassesBaseFilters(row)) continue;
      if (!rowPassesColumnFilters(row, null, columnFilters)) continue;
      indices.push(index);
    }
    if (state.groupByStatus) {
      const rank = { pronto: 0, revisar: 1, bloqueado: 2, descartar: 3 };
      indices.sort((leftIndex, rightIndex) => {
        const left = state.results[leftIndex];
        const right = state.results[rightIndex];
        const leftKey = decisionGroupKey(left);
        const rightKey = decisionGroupKey(right);
        const difference = (rank[leftKey] ?? 9) - (rank[rightKey] ?? 9);
        return difference || String(left.document || "").localeCompare(String(right.document || ""), "pt-BR", { numeric: true });
      });
    }
    state.filteredCache = { signature, indices };
    return indices;
  }

  function filteredResults() {
    return filteredResultIndices().map((index) => state.results[index]);
  }

  function virtualResults() {
    const indices = filteredResultIndices();
    // Para conjuntos pequenos, renderiza tudo (sem espaçadores) para preservar
    // Ctrl+F do navegador, impressão e capturas de tela completas.
    if (indices.length <= VIRTUAL_MIN_ITEMS) {
      state.virtual.start = 0;
      state.virtual.end = indices.length;
      return {
        indices,
        visibleIndices: indices,
        start: 0,
        end: indices.length,
        total: indices.length,
        topSpace: 0,
        bottomSpace: 0,
        firstNumber: indices.length ? 1 : 0,
        lastNumber: indices.length,
      };
    }
    const scroll = els.resultsScroll;
    const rowHeight = state.virtual.rowHeight;
    const viewport = scroll ? Math.max(360, scroll.clientHeight || 620) : 620;
    const scrollTop = scroll ? scroll.scrollTop : 0;
    const visibleCount = Math.ceil(viewport / rowHeight);
    // A janela renderizada nunca pode começar depois do que a lista comporta:
    // sem esse limite, rolar até o fim empurrava o espaçador de cima além do
    // total de linhas, a barra de rolagem crescia sozinha e sobrava um vazio
    // depois do último documento.
    const janela = visibleCount + (state.virtual.overscan * 2);
    const maiorInicio = Math.max(0, indices.length - janela);
    const start = Math.min(maiorInicio, Math.max(0, Math.floor(scrollTop / rowHeight) - state.virtual.overscan));
    const end = Math.min(indices.length, start + janela);
    state.virtual.start = start;
    state.virtual.end = end;
    return {
      indices,
      visibleIndices: indices.slice(start, end),
      start,
      end,
      total: indices.length,
      topSpace: start * rowHeight,
      bottomSpace: Math.max(0, (indices.length - end) * rowHeight),
      firstNumber: indices.length ? start + 1 : 0,
      lastNumber: end,
    };
  }

  function visibleResults() {
    return virtualResults().visibleIndices.map((index) => state.results[index]);
  }

  /**
   * Confere a altura real da linha depois de desenhar.
   *
   * Os espaçadores da tabela virtual são calculados por uma altura fixa. Se a
   * linha renderizada tiver outra altura — densidade trocada, agrupamento
   * ligado, uma correção de CSS —, a barra de rolagem passa a mentir: some
   * conteúdo no fim ou sobra espaço em branco. Medir o que o navegador
   * realmente desenhou mantém as duas coisas coerentes sem depender de alguém
   * lembrar de acertar o número no código.
   */
  /**
   * Depois de analisar, a tabela é o assunto da tela — e ela nascia embaixo de
   * tudo: numa janela de 950 px o topo da tabela caía em 935, ou seja, fora da
   * vista. Levar a relação para o topo evita a rolagem às cegas e o efeito de
   * "sumiu o resultado".
   */
  function focarResultados() {
    if (!els.resultsSection || els.resultsSection.hidden) return;
    window.requestAnimationFrame(() => {
      els.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function calibrateVirtualRowHeight() {
    if (!els.tbody) return;
    const linhas = els.tbody.querySelectorAll("tr.result-row");
    if (linhas.length < 3) return;
    let soma = 0;
    let contadas = 0;
    linhas.forEach((linha) => {
      const altura = linha.getBoundingClientRect().height;
      if (altura > 0) { soma += altura; contadas += 1; }
    });
    if (!contadas) return;
    const medida = Math.round(soma / contadas);
    if (medida < 24 || medida > 400) return;
    if (Math.abs(medida - state.virtual.rowHeight) <= 1) return;
    state.virtual.rowHeight = medida;
    // Só re-renderiza quando há espaçadores em jogo: abaixo do limite virtual a
    // tabela inteira já está na tela e a altura não muda nada.
    if (state.virtual.calibrating || filteredResultIndices().length <= VIRTUAL_MIN_ITEMS) return;
    state.virtual.calibrating = true;
    window.requestAnimationFrame(() => {
      state.virtual.calibrating = false;
      renderTable();
    });
  }

  function renderResultPagination(info) {
    if (!info) return;
    if (els.resultPagination) els.resultPagination.hidden = info.total === 0;
    if (els.resultPageStatus) els.resultPageStatus.textContent = info.total
      ? `Visualização virtual · ${info.firstNumber.toLocaleString("pt-BR")}–${info.lastNumber.toLocaleString("pt-BR")} de ${info.total.toLocaleString("pt-BR")}`
      : "Nenhum resultado";
    const shownCount = document.getElementById("p1-shown-count");
    if (shownCount) {
      shownCount.dataset.filteredTotal = String(info.total);
      shownCount.dataset.first = String(info.firstNumber);
      shownCount.dataset.last = String(info.lastNumber);
      shownCount.textContent = info.total
        ? `Exibindo ${info.firstNumber.toLocaleString("pt-BR")}–${info.lastNumber.toLocaleString("pt-BR")} de ${info.total.toLocaleString("pt-BR")}`
        : "Nenhum resultado";
    }
  }

  function renderSummary() {
    const counts = C.resultCounts(state.results);
    $("#count-total").textContent = counts.total;
    $("#count-ready").textContent = counts.pronto;
    $("#count-blocked").textContent = counts.bloqueado;
    $("#count-discard").textContent = counts.descartar;
    $("#count-review").textContent = counts.revisar;
    document.querySelectorAll("[data-filter]").forEach((button) => {
      const filter = button.dataset.filter;
      button.querySelector("b").textContent = filter === "todos" ? counts.total : counts[filter] || 0;
      button.classList.toggle("active", filter === state.filter);
    });
  }

  function renderSheetFilter() {
    const sheets = [...new Set(state.results.map((row) => row.sheet).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (state.sheetFilter !== "todos" && !sheets.some((sheet) => C.norm(sheet) === state.sheetFilter)) state.sheetFilter = "todos";
    els.sheetFilter.innerHTML = `<option value="todos">Todas as abas</option>${sheets.map((sheet) => (
      `<option value="${escapeHtml(C.norm(sheet))}" ${C.norm(sheet) === state.sheetFilter ? "selected" : ""}>${escapeHtml(sheet)}</option>`
    )).join("")}`;
  }

  function ldValue(record, headerName) {
    const wanted = C.norm(headerName);
    const entry = (record && record.ldColumns || []).find((column) => C.norm(column.header) === wanted);
    return entry ? entry.value : "";
  }

  function buildRowTimeline(row, settings) {
    if (!T || !state.index || !row) return null;
    const documentKey = row.documentKey || C.key(row.document);
    const group = state.index.byDocument && state.index.byDocument.get(documentKey);
    if (!group) return null;
    return T.buildTimeline({ documentKey, document: row.document, group }, state.index, settings || triageSettings());
  }

  function timelineRoute(timeline) {
    return timeline && timeline.revisions && timeline.revisions.length
      ? timeline.revisions.map((item) => item.revision).join(" → ")
      : "";
  }

  function timelineStepExplanation(item, next) {
    if (item.target && item.predicted) return `Esta é a revisão ${item.revision}, calculada como a próxima disponível para postagem.`;
    if (item.target) return `Esta é a revisão ${item.revision}, escolhida para a nova eGRDT.`;
    const status = C.norm(item.status);
    if (status === "EM ANALISE") return `A revisão ${item.revision} está registrada como Em Análise na Colar SIGEM; o status é informativo e não impede gerar a eGRDT.`;
    if (status === "NAO POSTADO") return `A revisão ${item.revision} está disponível para postagem.`;
    if (next) return `A revisão ${item.revision} já teve retorno; por isso o fluxo segue para ${next.revision}.`;
    return `A revisão ${item.revision} é a última revisão registrada na LD.`;
  }

  function timelineExplanation(timeline) {
    if (!timeline || !timeline.revisions || !timeline.revisions.length) return "Nenhum histórico de revisão foi localizado na LD.";
    const route = timeline.revisions.map((item) => item.revision).join(" → ");
    return `Sequência identificada: ${route}. A revisão destacada é a que será usada na nova eGRDT.`;
  }

  function timelineReportText(timeline) {
    return timeline && timeline.revisions
      ? timeline.revisions.map((item) => `${item.revision} — ${item.status}${item.target ? " (alvo)" : ""}`).join(" → ")
      : "";
  }

  function timelineInline(row) {
    const timeline = row.timeline;
    if (!timeline || !timeline.revisions || !timeline.revisions.length) return "";
    const steps = timeline.revisions.map((item, index) => {
      const metadata = [
        ["GRDT", item.grdt],
        ["Data efetiva", item.effectiveDate],
        ["Finalidade", item.purpose],
        ["Incluído em", item.included],
        ["Modificado em", item.modified],
      ].filter((entry) => entry[1]);
      const tags = [
        item.latest ? '<span class="revision-tag latest">Última registrada</span>' : "",
        item.target ? '<span class="revision-tag target">Revisão da GRDT</span>' : "",
        item.predicted ? '<span class="revision-tag calculated">Calculada</span>' : "",
      ].filter(Boolean).join("");
      return `<article class="revision-timeline-step ${item.target ? "target" : ""}">
        <header>
          <span class="revision-step-number">${escapeHtml(item.revision)}</span>
          <div><strong>Revisão ${escapeHtml(item.revision)}</strong><div class="revision-tags">${tags}</div></div>
        </header>
        <div class="revision-step-body">
          <span class="revision-step-status ${escapeHtml(item.statusClass || "neutral")}">${escapeHtml(item.status || "Sem status")}</span>
          <small class="revision-status-source">${escapeHtml(item.statusSource || "LD")}</small>
          <p>${escapeHtml(timelineStepExplanation(item, timeline.revisions[index + 1]))}</p>
          ${metadata.length ? `<dl>${metadata.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`).join("")}</dl>` : ""}
        </div>
      </article>`;
    }).join("");
    return `<section class="revision-timeline-inline">
      <div class="revision-timeline-heading">
        <div><h3>Linha do tempo da revisão</h3><p>${escapeHtml(timelineExplanation(timeline))}</p></div>
        <div class="revision-timeline-summary"><span>Última registrada <strong>${escapeHtml(timeline.latestRevision || "—")}</strong></span><span>Revisão da GRDT <strong>${escapeHtml(timeline.targetRevision || row.revision || "—")}</strong></span></div>
      </div>
      <div class="revision-timeline-track">${steps}</div>
    </section>`;
  }

  function decisionMessage(row) {
    if (C.decisionMessage) return C.decisionMessage(row);
    return { title: decisionLabel(row.decision, row), explanation: C.simpleReason(row), nextAction: "" };
  }

  function detailRow(row, index) {
    if (!state.expanded.has(index)) return `<tr class="detail-row" data-index="${index}" hidden><td colspan="22"></td></tr>`;
    const source = row.relativePath || row.name || "—";
    const sourceLine = row.record && (row.record.sheet || row.record.row)
      ? `${row.record.source || ""} · ${row.record.sheet || ""} · linha ${row.record.row || ""}`
      : "—";
    const files = (row.files || []).map((entry) => entry.name).join(" · ") || "Nenhum arquivo físico";
    const databook = ldDatabookValue(row) || "—";
    const allocationRecord = row.record || {};
    const allocationEvidence = allocationRecord.allocationEvidence || null;
    const allocationSource = allocationEvidence || allocationRecord;
    const allocationState = row.allocationFinding && row.allocationFinding.label
      ? row.allocationFinding
      : C.allocationEvidenceState
        ? C.allocationEvidenceState(allocationRecord)
        : C.allocationState
          ? C.allocationState(row.allocationStatus)
          : { label: row.allocationStatus || "Não informado" };
    const allocationTrace = `<div class="allocation-trace ${escapeHtml(allocationState.kind || "empty")}">
      <h4>Como a alocação foi interpretada</h4>
      <dl>
        <div><dt>Resultado</dt><dd>${escapeHtml(allocationState.label || "Não informado")}</dd></div>
        <div><dt>Onde a evidência foi lida</dt><dd>${escapeHtml(allocationState.source || "—")}</dd></div>
        <div><dt>Valor confirmado</dt><dd>${escapeHtml(allocationSource.allocationStatus || row.allocationStatus || "—")}</dd></div>
        <div><dt>Cabeçalho</dt><dd>${escapeHtml(allocationSource.allocationStatusHeader || allocationRecord.allocationStatusHeader || "—")}</dd></div>
        <div><dt>Versão da evidência</dt><dd>${escapeHtml(allocationSource.ldVersion || allocationRecord.ldVersion || "Não informada na linha")}</dd></div>
        <div><dt>Alocação</dt><dd>${escapeHtml(allocationSource.allocation || allocationRecord.allocation || "—")}</dd></div>
        <div><dt>Etapa da alocação</dt><dd>${escapeHtml(allocationSource.allocationStage || allocationRecord.allocationStage || "—")}</dd></div>
        <div><dt>Comentário da Fiscal</dt><dd>${escapeHtml(allocationSource.fiscalComment || allocationRecord.fiscalComment || "Não informado")}</dd></div>
        <div><dt>Local da evidência</dt><dd>${escapeHtml(allocationSource.sheet || allocationRecord.sheet || row.sheet || "—")} · coluna ${escapeHtml(allocationSource.allocationStatusColumn || allocationRecord.allocationStatusColumn || "—")} · linha ${escapeHtml(allocationSource.row || allocationRecord.row || "—")}</dd></div>
        ${allocationEvidence ? `<div><dt>Linha técnica atual</dt><dd>${escapeHtml(allocationRecord.sheet || row.sheet || "—")} · linha ${escapeHtml(allocationRecord.row || "—")} · versão ${escapeHtml(allocationRecord.ldVersion || "—")}</dd></div>` : ""}
      </dl>
      <p>${allocationEvidence ? "A mesma revisão já possuía alocação confirmada. A linha posterior marcada como Não Alocado não tinha número nem evidência de recusa e foi tratada como duplicidade; título, Databook e demais dados permanecem os da linha técnica mais recente." : "O bloqueio por não alocação é explicado com os dados da mesma linha da aba técnica: confirmação, versão da LD enviada, número da alocação, etapa e comentário da Fiscal."}</p>
    </div>`;
    // Cruzamento com o Apêndice 3: informativo, nunca bloqueante. Quando o TAG
    // não consta da lista contratual, o painel mostra a forma com nt- sugerida.
    const apendice = apendiceInfo(row);
    const apendiceTrace = `<div class="allocation-trace ${apendice.found === true ? "allocated" : apendice.found === false ? "review" : "empty"}">
      <h4>Cruzamento com o Apêndice 3</h4>
      <dl>
        <div><dt>Código da LD</dt><dd>${escapeHtml(apendice.ldCode || "—")}</dd></div>
        <div><dt>TAG usado na busca</dt><dd>${escapeHtml(apendice.tag || "—")}${apendice.tagSource ? ` · ${escapeHtml(apendice.tagSource)}` : ""}</dd></div>
        <div><dt>Busca no Apêndice</dt><dd>${escapeHtml(apendice.search)}</dd></div>
        <div><dt>Tagueado sim ou não?</dt><dd>${escapeHtml(apendice.tagged)}</dd></div>
        ${apendice.suggestion ? `<div><dt>Código sugerido</dt><dd>${escapeHtml(apendice.suggestion)}</dd></div>` : ""}
      </dl>
      <p>${escapeHtml(apendice.suggestionNote || apendice.note || "")}</p>
    </div>`;
    const message = decisionMessage(row);
    const decisionCard = `<div class="detail-decision ${escapeHtml(message.severity || "warning")}">
      <strong>${escapeHtml(message.title || "Precisa de conferência.")}</strong>
      <p>${escapeHtml(message.explanation || C.simpleReason(row))}</p>
      ${message.nextAction ? `<small>${escapeHtml(message.nextAction)}</small>` : ""}
      ${message.code ? `<span class="decision-code">Código interno: ${escapeHtml(message.code)}</span>` : ""}
    </div>`;
    // O ajuste de "nt-" troca o nome do arquivo que vai ser postado. Ele ganha
    // um cartão próprio, com o que foi entregue e o que sai, para o operador
    // não precisar deduzir a mudança comparando duas colunas distantes.
    const ntCard = row.ntRename ? `<section class="nt-rename-panel" aria-label="Ajuste de código nt-">
      <div class="nt-rename-heading"><span class="nt-rename-kicker">Código encontrado na LD de outra forma</span><strong>${escapeHtml(row.ntRename.direcao)}</strong></div>
      <dl class="nt-rename-fields">
        <div><dt>Você informou</dt><dd>${escapeHtml(row.ntRename.enviado)}</dd></div>
        <div><dt>Na LD está como</dt><dd>${escapeHtml(row.ntRename.naLd)}</dd></div>
        <div><dt>Vai para a eGRDT como</dt><dd>${escapeHtml(row.ntRename.finalName || row.finalName || "—")}</dd></div>
      </dl>
      <p>O arquivo é renomeado para a grafia da LD porque é assim que o documento está alocado; o SIGEM só aceita a postagem com esse nome.</p>
    </section>` : "";
    const conflict = row.ldConflict && row.ldConflict.hasConflict ? row.ldConflict : null;
    const conflictCard = conflict ? `<section class="ld-conflict-panel" aria-label="Conflito entre linhas da LD">
      <div class="ld-conflict-heading"><div><span class="ld-conflict-kicker">Conflito na LD</span><h3>${escapeHtml(conflict.summary)}</h3></div>${conflict.resolved ? '<span class="ld-conflict-resolved">Escolha aplicada nesta sessão</span>' : '<span class="ld-conflict-blocked">Decisão automática pausada</span>'}</div>
      <div class="ld-conflict-fields">${conflict.differences.map((difference) => `<article><strong>${escapeHtml(difference.label)}</strong><span>${escapeHtml(difference.values.map((item) => item.value).join(" × "))}</span><small>${escapeHtml(difference.scope)}</small></article>`).join("")}</div>
      <div class="ld-conflict-sources">${conflict.candidates.map((candidate) => `<button class="ld-source-choice ${conflict.resolutionId === candidate.id ? "selected" : ""}" data-action="resolve-ld-conflict" data-source-id="${escapeHtml(candidate.id)}" type="button"><strong>${escapeHtml(candidate.sheet)} · linha ${escapeHtml(candidate.row || "—")}</strong><span>Revisão ${escapeHtml(candidate.revision || "—")}</span><small>${escapeHtml(candidate.source || "LD carregada")}</small></button>`).join("")}</div>
      <p>A escolha vale somente nesta aba e não será gravada para a próxima sessão.</p>
    </section>` : "";
    const ldNotice = row.ldConflict && row.ldConflict.hasNotice && !row.ldConflict.hasConflict ? row.ldConflict : null;
    const noticeCard = ldNotice ? `<section class="ld-history-notice" aria-label="Aviso informativo da LD">
      <strong>Aviso informativo da LD</strong>
      <p>${escapeHtml(ldNotice.noticeSummary || "Existem valores históricos diferentes; a linha controlada mais recente foi usada.")}</p>
      <small>O aviso informa a origem da evidência usada. Diferenças históricas sem impacto operacional não colocam o documento em Revisar.</small>
    </section>` : "";
    const ldColumns = row.record && row.record.ldColumns || [];
    const ldGrid = ldColumns.length ? `<div class="ld-values"><h3>Colunas da LD</h3><div class="ld-values-grid">${ldColumns.map((column) => (
      `<div><span>${escapeHtml(column.header)}</span><strong>${escapeHtml(column.value || "—")}</strong></div>`
    )).join("")}</div></div>` : "";
    return `<tr class="detail-row" data-index="${index}">
      <td colspan="22"><div class="details-shell">
        <section class="detail-section">
          <h3>Origem</h3>
          <p class="detail-line"><strong>Arquivo:</strong> ${escapeHtml(source)}</p>
          <p class="detail-line"><strong>Pacote:</strong> ${escapeHtml(files)}</p>
          <p class="detail-line"><strong>Identificação:</strong> ${escapeHtml(row.documentSource || "nome do arquivo")}</p>
          <p class="detail-line"><strong>Busca na LD (com/sem nt- e TAG):</strong> ${escapeHtml(row.documentLookup && row.documentLookup.message || "Pesquisa não registrada")}</p>
          <p class="detail-line"><strong>Revisão:</strong> ${escapeHtml(row.revisionSource || "—")}</p>
          <p class="detail-line"><strong>LD:</strong> ${escapeHtml(sourceLine)}</p>
        </section>
        <section class="detail-section">
          <h3>Controle</h3>
          ${decisionCard}
          ${ntCard}
          ${row.fiscalComment ? `<p class="detail-line"><strong>Fiscal:</strong> ${escapeHtml(row.fiscalComment)}</p>` : ""}
          <p class="detail-line"><strong>Databook:</strong> ${escapeHtml(databook)}</p>
          ${allocationTrace}
          ${apendiceTrace}
          ${row.codeValidationWarning ? `<div class="detail-warning">${escapeHtml(row.codeValidationWarning)}</div>` : ""}
          ${row.packageWarning ? `<div class="detail-warning">${escapeHtml(row.packageWarning)}</div>` : ""}
        </section>
        ${rowCanBeSelected(row) ? `<section class="detail-actions"><button class="secondary-button" data-action="edit-egrdt" type="button">Editar GRDT</button></section>` : ""}
      </div>${conflictCard}${noticeCard}${timelineInline(row)}${ldGrid}</td>
    </tr>`;
  }

  function titleQualityLabel(quality) {
    if (!quality) return "Título não avaliado";
    if (quality.status === "reserved") return "Reservado";
    if (quality.status === "good") return `Título ${quality.score}`;
    if (quality.status === "attention") return `Título ${quality.score}`;
    return `Título ${quality.score}`;
  }

  function titleQualityHtml(quality) {
    if (!quality) return "";
    const issues = quality.issues.length
      ? quality.issues.map((issue) => `<li class="${escapeHtml(issue.severity)}">${escapeHtml(issue.label)}</li>`).join("")
      : "<li>Padronização adequada</li>";
    return `<div><strong>Qualidade do título</strong><span class="title-quality-badge ${escapeHtml(quality.status)}">${escapeHtml(titleQualityLabel(quality))}</span></div><ul>${issues}</ul>`;
  }

  function ldDatabookValue(row) {
    const record = row && row.record || {};
    return String(record.databook == null ? "" : record.databook).trim();
  }

  function enforceDatabookFromLd(row) {
    if (!row) return "";
    const databook = ldDatabookValue(row);
    row.databook = databook;
    if (row.egrdt) row.egrdt.databook = databook;
    row.databookAssistant = null;
    row.databookAssistantApplied = false;
    row.databookMissingInLd = !databook;
    return databook;
  }

  function renderEgrdtAssistant() {
    const single = state.drawerIndices.length === 1;
    const row = single ? state.results[state.drawerIndices[0]] : null;
    if (!Q || !row) {
      els.drawerTitleQuality.hidden = true;
      els.drawerTitleSuggestion.hidden = true;
      els.drawerDatabookSuggestion.hidden = true;
      return;
    }
    const quality = Q.titleQuality(els.drawerTitle.value, row.document);
    els.drawerTitleQuality.innerHTML = titleQualityHtml(quality);
    els.drawerTitleQuality.hidden = false;
    state.drawerTitleSuggestion = quality.changed ? quality.suggested : "";
    els.drawerTitleSuggestion.hidden = !state.drawerTitleSuggestion || C.norm(state.drawerTitleSuggestion) === C.norm(els.drawerTitle.value);
    if (!els.drawerTitleSuggestion.hidden) els.drawerTitleSuggestion.textContent = `Aplicar padronização: ${state.drawerTitleSuggestion}`;

    state.drawerDatabookSuggestion = null;
    els.drawerDatabookSuggestion.hidden = true;
    els.drawerDatabookSuggestion.disabled = true;
    els.drawerDatabook.value = ldDatabookValue(row);
    els.drawerDatabook.title = els.drawerDatabook.value
      ? "Valor lido diretamente da linha do documento na LD."
      : "A LD não informa um caminho Databook para este documento; a eGRDT ficará em branco.";
  }

  function rowFileDisplayEntries(row) {
    const files = row && Array.isArray(row.files) ? row.files.filter(Boolean) : [];
    if (files.length) return files;
    const fallbackName = row && (row.name || row.virtualFileName) || "";
    if (!fallbackName && !(row && row.finalName)) return [];
    return [{
      name: fallbackName || row.finalName,
      relativePath: row && (row.relativePath || fallbackName) || fallbackName,
      finalName: row && row.finalName || fallbackName,
      virtual: !(row && row.file),
    }];
  }

  function renderRowFileList(row, finalNames = false) {
    const entries = rowFileDisplayEntries(row);
    if (!entries.length) return '<span class="filename-value">—</span>';
    const label = `${entries.length} ${entries.length === 1 ? "arquivo" : "arquivos"}`;
    return `<div class="result-file-list" aria-label="${escapeHtml(label)}">${entries.map((entry) => {
      const value = finalNames ? (entry.finalName || row.finalName || entry.name || "—") : (entry.name || "—");
      const title = finalNames ? value : (entry.relativePath || entry.name || value);
      const ext = extensionOf(value);
      return `<span class="result-file-item"><span class="filename-value" title="${escapeHtml(title)}">${escapeHtml(value)}</span>${ext ? `<span class="result-file-extension">${escapeHtml(ext.toUpperCase())}</span>` : ""}</span>`;
    }).join("")}</div>`;
  }

  function renderTable() {
    const virtualInfo = virtualResults();
    const rows = virtualInfo.visibleIndices.map((index, offset) => ({
      row: state.results[index],
      index,
      position: virtualInfo.start + offset,
    }));
    renderResultPagination(virtualInfo);
    els.empty.hidden = virtualInfo.total > 0;
    const topSpacer = virtualInfo.topSpace ? `<tr class="virtual-spacer-row" aria-hidden="true"><td colspan="22" style="--virtual-space:${virtualInfo.topSpace}px"></td></tr>` : "";
    const bottomSpacer = virtualInfo.bottomSpace ? `<tr class="virtual-spacer-row" aria-hidden="true"><td colspan="22" style="--virtual-space:${virtualInfo.bottomSpace}px"></td></tr>` : "";
    els.tbody.innerHTML = topSpacer + rows.map((entry) => {
      const row = entry.row;
      const index = entry.index;
      const previousIndex = entry.position > 0 ? virtualInfo.indices[entry.position - 1] : null;
      const previousRow = previousIndex === null ? null : state.results[previousIndex];
      const groupStart = state.groupByStatus && (!previousRow || decisionGroupKey(previousRow) !== decisionGroupKey(row));
      const resultClass = decisionClass(row.decision, row);
      const selectable = rowCanBeSelected(row);
      const selected = state.selected.has(index);
      const record = row.record || {};
      const ldRevision = record.revision || "—";
      // A coluna da triagem permanece fiel à LD. Ajustes aprovados de título
      // afetam somente a GRDT/arquivo final e ficam disponíveis no assistente.
      const title = record.title || "—";
      const titleQuality = Q ? Q.titleQuality(title === "—" ? "" : title, row.document) : null;
      const effectiveDate = formatDateBR(ldValue(record, "DATA EFETIVA DE EMISSÃO") || record.effectiveDate) || "—";
      const grdt = record.grdt || "—";
      const technicalStatus = record.status || "—";
      const ldSigemStatus = record.sigemStatus || "—";
      const fiscalComment = record.fiscalComment || "—";
      const allocation = record.allocation || "—";
      const allocationStage = record.allocationStage || ldValue(record, "ETAPA DA ALOCAÇÃO") || "—";
      // Sem status na célula, a coluna diz qual é o fato: coluna ausente na
      // aba, célula vazia, ou alocação evidenciada pelo número de ALOC. Com as
      // duas respostas na LD, mostra o conflito — imprimir só o valor da linha
      // escolhida fazia a tabela parecer contradizer a própria decisão.
      const conflitoAlocacao = row.allocationFinding && row.allocationFinding.kind === "conflict";
      const allocationStatus = conflitoAlocacao
        ? "CONFLITO — ALOCADO × NÃO ALOCADO"
        : record.allocationStatus
          || (C.allocationEvidenceState ? C.allocationEvidenceState(record).label : "")
          || "—";
      const allocationVisual = C.allocationEvidenceState ? C.allocationEvidenceState(record) : C.allocationState(record.allocationStatus || row.allocationStatus);
      const allocationClass = conflitoAlocacao
        ? "review"
        : row.hardBlock
        ? "blocked"
        : allocationVisual.kind === "allocated" ? "allocated"
        : allocationVisual.kind === "empty" || allocationVisual.kind === "blank" || allocationVisual.kind === "not_tracked" ? "empty"
        : "review";
      const apendice = apendiceInfo(row);
      const databook = record.databook || "—";
      const manualSelection = manuallyIncluded(row, index);
      const selectionTitle = manualAllocationOverrideAllowed(row)
        ? "Marcar manualmente para incluir na GRDT; a LD continuará registrada como Não Alocado"
        : selectable ? "Marcar para incluir na GRDT final" : "Bloqueado por uma condição que não admite inclusão manual";
      const mainRow = `<tr data-index="${index}" data-decision-group="${decisionGroupKey(row)}" class="result-row ${resultClass} ${groupStart ? "group-start" : ""} ${selected ? "selected" : ""} ${manualSelection ? "manually-included" : ""}">
        <td><div class="situation-cell">
          ${groupStart ? `<span class="triage-group-label">${escapeHtml(decisionGroupLabel(row))}</span>` : ""}
          <input id="select-row-${index}" name="select-row-${index}" class="row-select" data-select-row type="checkbox" ${selected ? "checked" : ""} ${selectable ? "" : "disabled"} aria-label="Selecionar para GRDT" title="${selectionTitle}">
          <button class="expand-button ${state.expanded.has(index) ? "open" : ""}" data-action="toggle-details" type="button" aria-label="Abrir evidências desta decisão" title="Abrir evidências desta decisão"><svg viewBox="0 0 16 16"><path d="M5 3l5 5-5 5"/></svg><span>Evidências</span></button>
          <span class="status-chip ${resultClass}">${compactDecisionLabel(row)}</span>
        </div></td>
        <td>${renderRowFileList(row, false)}</td>
        <td><span class="document-cell"><input id="manual-select-${index}" name="manual-select-${index}" class="manual-row-select" data-manual-select type="checkbox" ${selected ? "checked" : ""} ${selectable ? "" : "disabled"} aria-label="Incluir ${escapeHtml(row.document)} na GRDT" title="${selectionTitle}"><span class="document-code" title="${escapeHtml(row.document)}">${escapeHtml(row.document)}</span></span>${manualAllocationOverrideAllowed(row) ? `<span class="cell-muted">Não Alocado · inclusão manual permitida</span>` : ""}${row.ntRename ? `<span class="nt-rename-badge" title="${escapeHtml(row.ntRename.nota)}">nt- ajustado · informado ${escapeHtml(row.ntRename.enviado)}</span>` : ""}${row.previousAnalysisInfo && window.GrconAnalysisWarning ? window.GrconAnalysisWarning.createWarningBadge(row.previousAnalysisInfo).outerHTML : ""}${window.GrconGrdtHistoryIndicator ? window.GrconGrdtHistoryIndicator.getBadgeHtml(row.document) : ""}</td>
        <td><span class="text-cell" title="${escapeHtml(apendice.ldCode)}">${escapeHtml(apendice.ldCode || "—")}</span></td>
        <td><span class="text-cell" title="${escapeHtml(apendice.note || "")}">${escapeHtml(apendice.search)}</span>${apendice.suggestion ? `<span class="cell-muted" title="${escapeHtml(apendice.suggestionNote)}">Sugestão: ${escapeHtml(apendice.suggestion)}</span>` : ""}</td>
        <td><span class="text-cell" title="${escapeHtml(apendice.note || "")}">${escapeHtml(apendice.tagged)}</span></td>
        <td><span class="sheet-badge">${escapeHtml(row.sheet || "—")}</span></td>
        <td><span class="revision-value">${escapeHtml(ldRevision)}</span></td>
        <td><span class="revision-value">${escapeHtml(row.revision || "—")}</span>${row.timeline ? `<span class="revision-route" title="Histórico de revisões">${escapeHtml(timelineRoute(row.timeline))}</span>` : ""}</td>
        <td><span class="text-cell" title="${escapeHtml(title)}">${escapeHtml(title)}</span>${titleQuality ? `<span class="title-quality-badge ${escapeHtml(titleQuality.status)}">${escapeHtml(titleQualityLabel(titleQuality))}</span>` : ""}</td>
        <td><span class="text-cell">${escapeHtml(effectiveDate)}</span></td>
        <td><span class="grdt-code" title="${escapeHtml(grdt)}">${escapeHtml(grdt)}</span></td>
        <td><span class="text-cell" title="${escapeHtml(technicalStatus)}">${escapeHtml(technicalStatus)}</span></td>
        <td><span class="sigem-status" title="${escapeHtml(ldSigemStatus)}">${escapeHtml(ldSigemStatus)}</span></td>
        <td><span class="sigem-status" title="${escapeHtml(row.status)}">${escapeHtml(row.status || "—")}</span></td>
        <td><span class="posting-evidence ${row.postingEvidence && row.postingEvidence.complete ? "posted" : row.postingEvidence && row.postingEvidence.partial ? "review" : "none"}" title="${escapeHtml(row.postingEvidence && row.postingEvidence.explanation || "")}">${escapeHtml(row.postingStatus || (row.postingEvidence && row.postingEvidence.status) || "Sem evidência na LD")}</span></td>
        <td><span class="text-cell" title="${escapeHtml(fiscalComment)}">${escapeHtml(fiscalComment)}</span></td>
        <td><span class="text-cell">${escapeHtml(allocation)}</span></td>
        <td><span class="text-cell" title="${escapeHtml(allocationStage)}">${escapeHtml(allocationStage)}</span></td>
        <td><span class="allocation-state ${allocationClass}" title="${escapeHtml(conflitoAlocacao ? row.allocationFinding.source || "" : "")}">${escapeHtml(allocationStatus)}</span></td>
        <td><span class="text-cell" title="${escapeHtml(databook)}">${escapeHtml(databook)}</span></td>
        <td>${renderRowFileList(row, true)}</td>
      </tr>`;
      return mainRow + detailRow(row, index);
    }).join("") + bottomSpacer;
    calibrateVirtualRowHeight();
    window.dispatchEvent(new CustomEvent("grcon:triage-rendered", {
      detail: {
        total: virtualInfo.total,
        first: virtualInfo.firstNumber,
        last: virtualInfo.lastNumber,
        groupByStatus: state.groupByStatus,
      },
    }));
  }

  function commonEgrdtValue(indices, field) {
    const values = [...new Set(indices.map((index) => (state.results[index].egrdt || {})[field] || ""))];
    return values.length === 1 ? values[0] : "";
  }

  function setDrawerOptions(element, values, selected, placeholder) {
    element.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${values.map((value) => (
      `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`
    )).join("")}`;
  }

  function openEgrdtDrawer(indices) {
    const valid = [...new Set(indices)].filter((index) => {
      const row = state.results[index];
      return rowCanBeSelected(row);
    });
    if (!valid.length) {
      showToast("Selecione ao menos um item disponível para inclusão na GRDT.", "warn");
      return;
    }
    closeRelationDrawer();
    closeSgparDrawer();
    state.drawerIndices = valid;
    const multiple = valid.length > 1;
    els.drawerCount.textContent = multiple ? `${valid.length} documentos selecionados` : state.results[valid[0]].document;
    els.drawerTitleField.hidden = multiple;
    els.drawerDatabookField.hidden = multiple;
    els.drawerTitle.value = multiple ? "" : commonEgrdtValue(valid, "title");
    els.drawerDatabook.value = multiple ? "" : ldDatabookValue(state.results[valid[0]]);
    const placeholder = multiple ? "Não alterar" : "Selecione";
    setDrawerOptions(els.drawerFormat, C.EGRDT_OPTIONS.formats, commonEgrdtValue(valid, "format"), placeholder);
    setDrawerOptions(els.drawerDiscipline, C.EGRDT_OPTIONS.disciplines, commonEgrdtValue(valid, "discipline"), placeholder);
    setDrawerOptions(els.drawerType, C.EGRDT_OPTIONS.documentTypes, commonEgrdtValue(valid, "documentType"), placeholder);
    setDrawerOptions(els.drawerPurpose, C.EGRDT_OPTIONS.purposes, commonEgrdtValue(valid, "purpose"), placeholder);
    const drawerPreviewLimit = 250;
    const drawerPreview = valid.slice(0, drawerPreviewLimit).map((index) => escapeHtml(state.results[index].document));
    if (valid.length > drawerPreviewLimit) drawerPreview.push(`<strong>+ ${(valid.length - drawerPreviewLimit).toLocaleString("pt-BR")} documento(s) selecionado(s) não exibidos nesta prévia</strong>`);
    els.drawerDocuments.innerHTML = drawerPreview.join("<br>");
    renderEgrdtAssistant();
    els.drawerOverlay.hidden = false;
    els.drawer.inert = false;
    els.drawer.classList.add("open");
    els.drawer.setAttribute("aria-hidden", "false");
  }

  function closeEgrdtDrawer() {
    els.drawer.classList.remove("open");
    els.drawer.setAttribute("aria-hidden", "true");
    els.drawer.inert = true;
    els.drawerOverlay.hidden = true;
    state.drawerIndices = [];
  }

  function saveEgrdtDrawer() {
    const multiple = state.drawerIndices.length > 1;
    state.drawerIndices.forEach((index) => {
      const row = state.results[index];
      if (!row || !row.egrdt) return;
      if (!multiple) {
        row.egrdt.title = els.drawerTitle.value.trim();
        enforceDatabookFromLd(row);
      }
      [
        ["format", els.drawerFormat.value],
        ["discipline", els.drawerDiscipline.value],
        ["documentType", els.drawerType.value],
        ["purpose", els.drawerPurpose.value],
      ].forEach(([field, value]) => {
        if (!multiple || value) row.egrdt[field] = value;
      });
      if (C.enforceDocumentFormat) C.enforceDocumentFormat(row.egrdt);
    });
    const amount = state.drawerIndices.length;
    closeEgrdtDrawer();
    renderAll();
    showToast(`${amount} item(ns) atualizado(s) somente nesta análise.`, "success");
  }

  function renderAll() {
    state.selected.forEach((index) => {
      const row = state.results[index];
      // "Não Alocado" pode permanecer selecionado somente quando a escolha
      // manual do operador estiver registrada. Outros bloqueios são removidos.
      if (!row || !rowCanBeSelected(row) || (row.hardBlock && !state.manualForceInclude.has(index))) {
        state.selected.delete(index);
        state.manualForceInclude.delete(index);
      }
    });
    renderSummary();
    renderSheetFilter();
    renderTable();

    const filtered = filteredResults();
    const selectableIndices = [];
    filtered.forEach((row) => {
      if (rowCanBeSelected(row) && rowOutputSources(row).length) selectableIndices.push(resultIndex(row));
    });

    const physicalSelected = [];
    const logicalSelected = [];
    let incomplete = 0;
    let physicalIncomplete = 0;
    const selectedItemsByDiscipline = new Map();
    state.selected.forEach((index) => {
      const row = state.results[index];
      if (!row) return;
      const physical = Boolean(row.files && row.files.length);
      const logical = Boolean(row.virtualFileName && !physical);
      if (physical) physicalSelected.push(index);
      if (logical) logicalSelected.push(index);
      const sources = rowOutputSources(row);
      const discipline = C.norm(row.egrdt && row.egrdt.discipline) || "SEM DISCIPLINA";
      selectedItemsByDiscipline.set(discipline, (selectedItemsByDiscipline.get(discipline) || 0) + sources.length);
      const n1710Pair = E && E.validateN1710Pair ? E.validateN1710Pair(row, sources) : { valid: true };
      const invalid = !n1710Pair.valid || sources.some((entry) => C.validateEgrdtData({
        ...(row.egrdt || {}),
        document: row.document,
        revision: row.revision,
        fileName: entry.finalName,
      }).length > 0);
      if (invalid) {
        incomplete += 1;
        if (physical) physicalIncomplete += 1;
      }
    });

    els.exportZip.disabled = physicalSelected.length === 0;
    els.exportReport.disabled = state.results.length === 0;
    if (els.exportPendingAllocationPdfs) {
      const pending = state.pendingAllocationBundle || { documentCount: 0, pdfCount: 0 };
      els.exportPendingAllocationPdfs.disabled = !pending.pdfCount;
      els.exportPendingAllocationPdfs.textContent = pending.pdfCount
        ? `PDFs aguardando alocação (${pending.pdfCount.toLocaleString("pt-BR")})`
        : "PDFs aguardando alocação";
      els.exportPendingAllocationPdfs.title = pending.pdfCount
        ? `${pending.documentCount.toLocaleString("pt-BR")} documento(s) continuam bloqueados para eGRDT e têm PDF disponível para aguardar o retorno da alocação.`
        : "Disponível quando houver PDF físico com número de alocação registrado e confirmação ainda como Não Alocado.";
    }
    els.exportEgrdt.disabled = state.selected.size === 0;
    els.batchEgrdt.disabled = state.selected.size === 0;
    els.selectAllReady.disabled = selectableIndices.length === 0;
    els.selectAllReady.checked = selectableIndices.length > 0 && selectableIndices.every((index) => state.selected.has(index));
    els.selectAllReady.indeterminate = !els.selectAllReady.checked && selectableIndices.some((index) => state.selected.has(index));
    els.exportFinalPackage.disabled = physicalSelected.length === 0 || physicalIncomplete > 0;
    const selectedBatchCount = [...selectedItemsByDiscipline.values()].reduce((total, amount) => total + Math.ceil(amount / currentEgrdtBatchLimit()), 0);
    const selectedDisciplineCount = selectedItemsByDiscipline.size;
    els.selectedCount.textContent = `${state.selected.size.toLocaleString("pt-BR")} selecionado${state.selected.size === 1 ? "" : "s"}${selectedBatchCount ? ` · ${selectedDisciplineCount.toLocaleString("pt-BR")} disciplina${selectedDisciplineCount === 1 ? "" : "s"} · ${selectedBatchCount.toLocaleString("pt-BR")} eGRDT${selectedBatchCount === 1 ? "" : "s"} de até ${currentEgrdtBatchLimit()}` : ""}${logicalSelected.length ? ` · ${logicalSelected.length.toLocaleString("pt-BR")} somente na relação` : ""}${incomplete ? ` · ${incomplete.toLocaleString("pt-BR")} GRDT incompleta${incomplete === 1 ? "" : "s"}` : ""}`;
    window.dispatchEvent(new CustomEvent("grcon:ui-update"));
  }

  function reset() {
    state.ldFiles = [];
    state.listFiles = [];
    state.textEntries = [];
    state.relationDraft = "";
    state.relationSavedText = "";
    state.relationPreview = { entries: [], duplicates: [], ignored: [] };
    state.resultPage = 1;
    state.packageCandidates = [];
    state.packageFiles = [];
    state.ignoredFiles = [];
    state.listIgnoredFiles = [];
    state.listSummary = null;
    state.records = [];
    state.history = [];
    state.index = null;
    state.results = [];
    state.pendingAllocationBundle = { rows: [], entries: [], documentCount: 0, pdfCount: 0 };
    state.packageSelectionReady = false;
    state.smartAnalysisCache = { signature: "", snapshot: null, savedAt: 0 };
    state.filter = "todos";
    state.sheetFilter = "todos";
    state.search = "";
    state.columnFilters = {};
    closeColumnFilterPopover();
    updateColumnFilterTriggerStates();
    if (els.clearColumnFilters) els.clearColumnFilters.hidden = true;
    state.expanded.clear();
    state.selected.clear();
    state.manualForceInclude.clear();
    state.conflictResolutions.clear();
    state.manualEgrdtSequences = [];
    state.ldIntegrity = null;
    state.analysisAt = 0;
    state.analysisValidUntil = 0;
    state.analysisLdSignature = "";
    closeEgrdtDrawer();
    closeRelationDrawer();
    clearSgparQueue();
    els.ldInput.value = "";
    els.listInput.value = "";
    els.packageInput.value = "";
    els.sgparUrl.value = Workspace ? String(Workspace.preference("sgparUrl", "")) : "";
    els.relationText.value = "";
    els.search.value = "";
    els.sheetFilter.value = "todos";
    const savedRecentDays = Workspace ? Math.max(1, Math.min(365, Number(Workspace.preference("recentDays", 30)) || 30)) : 30;
    els.recentDays.value = String(savedRecentDays);
    els.advancedPanel.hidden = true;
    els.advancedToggle.setAttribute("aria-expanded", "false");
    state.recentDays = savedRecentDays;
    if (Workspace) Workspace.clearDraft("grdtRelation");
    els.resultsSection.hidden = true;
    els.progress.hidden = true;
    els.analysisStamp.hidden = true;
    if (els.compatibilityOpen) els.compatibilityOpen.hidden = true;
    if (els.compatibilityStatus) els.compatibilityStatus.hidden = true;
    renderRelationPreview();
    updateInputMeta();
  }

  function invalidateAnalysisResults(preserveIndex = false) {
    if (!preserveIndex) {
      state.records = [];
      state.history = [];
      state.index = null;
    }
    state.results = [];
    state.pendingAllocationBundle = { rows: [], entries: [], documentCount: 0, pdfCount: 0 };
    state.packageSelectionReady = false;
    state.smartAnalysisCache = { signature: "", snapshot: null, savedAt: 0 };
    state.selected.clear();
    state.manualForceInclude.clear();
    state.expanded.clear();
    state.manualEgrdtSequences = [];
    state.listIgnoredFiles = [];
    state.listSummary = null;
    state.ldIntegrity = null;
    state.analysisAt = 0;
    state.analysisValidUntil = 0;
    state.analysisLdSignature = "";
    els.resultsSection.hidden = true;
    els.analysisStamp.hidden = true;
  }

  function analysisHistoryDocuments() {
    return state.results.map((row) => {
      const record = row.record || {};
      const message = decisionMessage(row);
      const reason = [message.title, message.explanation, message.nextAction].filter(Boolean).join(" ") || C.simpleReason(row);
      return {
        document: row.document,
        title: row.egrdt && row.egrdt.title || row.title || record.title,
        originalFiles: (row.files || []).map((entry) => entry.name).join(" | ") || row.name || row.virtualFileName || "",
        finalFiles: (row.files || []).map((entry) => entry.finalName).filter(Boolean).join(" | ") || row.finalName || "",
        sheet: row.sheet || record.sheet,
        ldRow: record.row,
        ldVersion: record.ldVersion,
        currentRevision: record.revision,
        targetRevision: row.revision,
        targetRevisionStatus: row.status,
        statusDelivered: decisionLabel(row.decision, row),
        reasonCode: message.code || row.reasonCode || "",
        reason,
        sigemStatus: row.sigemStatus || record.sigemStatus || record.status,
        grdt: record.grdt || row.grdt,
        effectiveDate: formatDateBR(record.effectiveDate || row.effectiveDate),
        postingStatus: row.postingStatus || row.postingEvidence && row.postingEvidence.status || "Sem evidência de postagem na LD",
        allocationStatus: row.allocationStatus || record.allocationStatus,
        allocation: row.allocation || record.allocation,
        allocationStage: row.allocationStage || record.allocationStage,
        fiscalComment: row.fiscalComment || record.fiscalComment,
        includedInEgrdt: manuallyIncluded(row) ? "SIM — MANUAL; LD NÃO ALOCADO" : row.hardBlock ? "NÃO — DESMARCADO POR PADRÃO" : row.decision === C.READY ? "SIM — AUTOMÁTICO" : "SIM — SE SELECIONADO APÓS CONFERÊNCIA",
        databook: record.databook || "",
        inputSource: row.listSource || row.relativePath || row.name || "",
        packageWarning: [row.packageWarning, row.documentRevisionWarning, row.codeValidationWarning].filter(Boolean).join(" | "),
        virtual: !(row.files || []).length,
      };
    });
  }

  async function saveCurrentAnalysisHistory() {
    if (!AnalysisHistory || !state.analysisAt || !state.results.length) return;
    const counts = C.resultCounts(state.results);
    const session = {
      id: `analysis-${state.analysisAt}`,
      analyzedAt: new Date(state.analysisAt).toISOString(),
      appVersion: APP_VERSION,
      engineVersion: DOCUMENT_ENGINE_VERSION,
      ldName: ldDisplayName(),
      sourceName: relationSourceLabel() || (state.packageFiles[0] && (state.packageFiles[0].webkitRelativePath || state.packageFiles[0].name)) || "Pasta documental",
      inputType: relationSourceKind() || "Pasta documental",
      relationLabel: relationSourceLabel(),
      recentDays: state.recentDays,
      total: state.results.length,
      counts,
      ldRecords: state.ldIntegrity && state.ldIntegrity.records,
      sigemRecords: state.ldIntegrity && state.ldIntegrity.history,
    };
    try {
      await AnalysisHistory.saveAnalysis({
        session,
        documents: analysisHistoryDocuments(),
        onProgress(done, total) {
          if (state.busy && els.progress && !els.progress.hidden) setProgress(96 + Math.round(done / Math.max(1, total) * 3), `Registrando histórico: ${done.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} documentos…`);
        },
      });
      window.dispatchEvent(new CustomEvent("grcon:analysis-history-updated", { detail: { sessionId: session.id, total: state.results.length } }));
    } catch (error) {
      console.error("Histórico de análises:", error);
      showToast(`A análise foi concluída, mas o histórico não pôde ser salvo: ${error.message || "armazenamento indisponível"}.`, "warn");
    }
  }

  function savePendingAllocationHistory() {
    if (!PendingAllocationHistory || !state.analysisAt) return;
    const bundle = state.pendingAllocationBundle || refreshPendingAllocationBundle();
    if (!bundle.documentCount) return;
    
    try {
      const snapshot = PendingAllocationHistory.createFromAnalysis(state.results, {
        analyzedAt: new Date(state.analysisAt).toISOString(),
        ldName: ldDisplayName(),
        ldVersion: (state.results[0] && state.results[0].record && state.results[0].record.ldVersion) || "",
        sourceName: relationSourceLabel() || "Pasta documental",
      });
      
      const result = PendingAllocationHistory.save(snapshot);
      if (result.saved) {
        window.dispatchEvent(new CustomEvent("grcon:pending-allocation-history-updated", { detail: { snapshotId: snapshot.id, documents: snapshot.documentCount } }));
      } else if (result.error) {
        console.warn("Histórico de alocações pendentes:", result.error);
      }
    } catch (error) {
      console.warn("Histórico de alocações pendentes:", error);
    }
  }

  function previousEgrdtHistoryText(documentName) {
    const Indicator = window.GrconGrdtHistoryIndicator;
    if (!Indicator || typeof Indicator.getEntries !== "function") return "";
    const entries = Indicator.getEntries(documentName);
    if (!entries.length) return "";
    return entries.map((entry) => {
      const date = formatDateBR(entry.generatedAt);
      return date ? `${entry.egrdtNumber} (${date})` : entry.egrdtNumber;
    }).join(" | ");
  }

  // Reúne todos os comentários da fiscal encontrados para o documento: o da
  // linha técnica atual e os de cada revisão anterior conhecida na linha do
  // tempo, sem repetir textos iguais. Mesmo critério usado na aba Resumo.
  function allFiscalCommentsText(row) {
    const record = row && row.record || {};
    const values = [String(record.fiscalComment || row && row.fiscalComment || "").trim()];
    const revisions = (row && row.timeline && row.timeline.revisions) || [];
    revisions.forEach((item) => values.push(String(item && item.fiscalComment || "").trim()));
    return [...new Set(values.filter(Boolean))].join(" | ");
  }

  // Mesma normalização usada pelo índice do selo (grdt_history_indicator.js),
  // para o worker conseguir casar o documento sem depender do navegador.
  function historyDocumentKey(value) {
    if (!value) return "";
    return String(value).trim().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[–—]/g, "-").toUpperCase().replace(/\s+/g, " ");
  }

  // A normalização é usada apenas para pesquisar. No relatório, a grafia vem
  // literalmente da linha técnica selecionada na LD.
  function exactLdDocument(row) {
    return String(row && row.record && row.record.document
      || row && row.documentLookup && row.documentLookup.ldDocument
      || row && row.document
      || "").trim();
  }

  function historyByDocumentMap(results) {
    const map = {};
    (results || []).forEach((row) => {
      const key = historyDocumentKey(row && row.document);
      if (!key || map[key]) return;
      const text = previousEgrdtHistoryText(row.document);
      if (text) map[key] = text;
    });
    return map;
  }

  function reportRows() {
    return state.results.map((row, index) => {
      const ldDocument = exactLdDocument(row);
      const message = decisionMessage(row);
      const simpleMessage = [message.title, message.explanation, message.nextAction].filter(Boolean).join(" ");
      const output = {
        "SITUAÇÃO GRCON": decisionLabel(row.decision, row),
        "GRDT(S) ANTERIOR(ES) NO HISTÓRICO": previousEgrdtHistoryText(row.document),
        "CÓDIGO DO MOTIVO": message.code || row.reasonCode || "",
        "CÓDIGO INFORMADO / PDF": row.documentLookup && row.documentLookup.inputDocument || row.name || "",
        "CÓDIGO LOCALIZADO NA LD": row.documentLookup && row.documentLookup.matched ? ldDocument : "",
        "FORMA LOCALIZADA NA LD": row.documentLookup && row.documentLookup.ldForm || "Não localizado",
        "CÓDIGO DA LD": apendiceInfo(row).ldCode,
        "BUSCA NO APÊNDICE": apendiceInfo(row).search,
        "Tagueado sim ou não?": apendiceInfo(row).tagged,
        "CÓDIGO SUGERIDO PELO APÊNDICE (nt-)": apendiceInfo(row).suggestion || "",
        "PESQUISA COM/SEM nt- E TAG NA LD": row.documentLookup && row.documentLookup.message || "",
        "ARQUIVO ORIGINAL": row.name || "",
        "ARQUIVOS ORIGINAIS": (row.files || []).map((entry) => entry.name).join(" | "),
        "TÍTULO": row.record && row.record.title || "",
        "ABA LD": row.sheet,
        "REVISÃO": row.record && row.record.revision || "",
        "REVISÃO ENVIADA NA GRDT": row.revision,
        "REVISÃO PARA POSTAR": row.revision,
        "STATUS": row.record && row.record.status || "",
        "STATUS SIGEM": row.record && row.record.sigemStatus || "",
        "STATUS DA REVISÃO PARA POSTAR": row.status,
        "COMENTÁRIO DA FISCAL": allFiscalCommentsText(row),
        "ALOCAÇÃO": row.record && row.record.allocation || "",
        "ETAPA DA ALOCAÇÃO": row.record && row.record.allocationStage || ldValue(row.record || {}, "ETAPA DA ALOCAÇÃO") || "",
        "CONFIRMAÇÃO DE DOCUMENTOS PREVISTOS": row.record && row.record.allocationStatus || "",
        "ORIGEM DA REVISÃO": row.revisionSource,
        "HISTÓRICO DE REVISÕES": timelineReportText(row.timeline),
        "EXPLICAÇÃO DA REVISÃO": timelineExplanation(row.timeline),
        "ÚLTIMA REVISÃO REGISTRADA": row.timeline && row.timeline.latestRevision || "",
        "REVISÃO ALVO CALCULADA": row.timeline && row.timeline.targetRevision || row.revision || "",
        "ÚLTIMA ATIVIDADE DA REVISÃO": row.timeline && row.timeline.lastActivity || "",
        "CONTEÚDO DO PDF ANALISADO": "NÃO",
        "ORIGEM NA LISTA EXCEL": row.listSource || "",
        "SERÁ INCLUÍDO NA EGRDT?": manuallyIncluded(row, index) ? "Sim — inclusão manual apesar de a LD informar Não Alocado" : row.hardBlock ? "Não — desmarcado por padrão; inclusão manual disponível para Não Alocado" : row.decision === C.READY ? "Sim — seleção automática" : "Sim — quando selecionado pelo operador após conferência",
        "MOTIVO GRCON": simpleMessage || C.simpleReason(row),
        "FONTE DO STATUS SIGEM": row.analysisEvidence && row.analysisEvidence.statusSource
          ? `${row.analysisEvidence.statusSource.source || ""} · ${row.analysisEvidence.statusSource.sheet || ""} · linha ${row.analysisEvidence.statusSource.row || ""}`
          : "",
        "FONTE DA GRDT E DATA": row.analysisEvidence && row.analysisEvidence.emissionSource
          ? `${row.analysisEvidence.emissionSource.source || ""} · ${row.analysisEvidence.emissionSource.sheet || ""} · linha ${row.analysisEvidence.emissionSource.row || ""}`
          : row.postingEvidence && row.postingEvidence.source
            ? `${row.postingEvidence.source} · ${row.postingEvidence.sheet || ""} · linha ${row.postingEvidence.row || ""}`
            : "",
        "NÚMERO DA GRDT NA LD": row.record && row.record.grdt || row.grdt || "",
        "DATA EFETIVA DE EMISSÃO DA GRDT": formatDateBR(row.record && row.record.effectiveDate || row.effectiveDate),
        "SITUAÇÃO DE POSTAGEM": row.postingStatus || (row.postingEvidence && row.postingEvidence.status) || "Sem evidência de postagem na LD",
        "EVIDÊNCIA DE POSTAGEM": row.postingEvidence && row.postingEvidence.explanation || "",
        "CONFLITO BLOQUEANTE NA LD": row.ldConflict && row.ldConflict.hasConflict ? "SIM" : "NÃO",
        "AVISO INFORMATIVO DA LD": row.ldConflict && row.ldConflict.hasNotice ? "SIM — NÃO BLOQUEIA" : "NÃO",
        "CAMPOS INFORMATIVOS DIFERENTES": row.ldConflict && row.ldConflict.noticeFields ? row.ldConflict.noticeFields.join(" | ") : "",
        "DETALHE DO AVISO INFORMATIVO": row.ldConflict && ConflictCore && ConflictCore.noticeText ? ConflictCore.noticeText(row.ldConflict) : "",
        "CAMPOS EM CONFLITO": row.ldConflict && row.ldConflict.fields ? row.ldConflict.fields.join(" | ") : "",
        "EVIDÊNCIAS DO CONFLITO": row.ldConflict && ConflictCore ? ConflictCore.evidenceText(row.ldConflict) : "",
        "ALOCAÇÃO DUPLICADA": row.ldConflict && row.ldConflict.duplicateAllocations && row.ldConflict.duplicateAllocations.length ? "SIM" : "NÃO",
        "EVIDÊNCIA DA ALOCAÇÃO DUPLICADA": row.ldConflict && row.ldConflict.duplicateAllocations
          ? row.ldConflict.duplicateAllocations.map((item) => `${item.values[0] && item.values[0].value || "Alocação"} · ${item.scope}`).join(" | ")
          : "",
        "LINHA ESCOLHIDA NA SESSÃO": row.ldConflict && row.ldConflict.selected ? row.ldConflict.selected.label : "",
        "ALERTA DO PACOTE": row.packageWarning || "",
        "ALERTA DE CODIFICAÇÃO ET": row.codeValidationWarning || "",
        "TÍTULO USADO NA GRDT": row.egrdt && row.egrdt.title || "",
        "CAMINHO DATABOOK USADO NA GRDT": row.egrdt && row.egrdt.databook || "",
        "ARQUIVO FINAL": row.finalName || "",
        "ARQUIVOS FINAIS": (row.files || []).map((entry) => entry.finalName).join(" | ") || row.finalName,
        "LD / LINHA": row.record && (row.record.sheet || row.record.row) ? `${row.record.source || ""} · ${row.record.sheet || ""} · ${row.record.row || ""}` : "",
      };
      (row.record && row.record.ldColumns || []).forEach((column) => {
        output[column.header] = column.value;
      });
      // DOCUMENTO sempre reflete o mesmo valor usado na tabela de triagem,
      // mesmo quando a LD também tem uma coluna própria chamada "DOCUMENTO".
      output.DOCUMENTO = ldDocument || row.document;
      return output;
    });
  }

  function reportTimelineRows() {
    return state.results.flatMap((row) => (row.timeline && row.timeline.revisions || []).map((item, index, revisions) => ({
      "DOCUMENTO": row.document,
      "GRDT(S) ANTERIOR(ES) NO HISTÓRICO": previousEgrdtHistoryText(row.document),
      "ABA LD": row.sheet,
      "VERSÃO DA LD ENVIADA": row.timeline.ldVersion || "",
      "REVISÃO": item.revision,
      "STATUS": item.status,
      "ORIGEM DO STATUS": item.statusSource,
      "REVISÃO DA GRDT": item.target ? "SIM" : "",
      "REVISÃO CALCULADA": item.predicted ? "SIM" : "",
      "EXPLICAÇÃO": timelineStepExplanation(item, revisions[index + 1]),
      "FINALIDADE": item.purpose,
      "GRDT": item.grdt,
      "DATA EFETIVA DE EMISSÃO": formatDateBR(item.effectiveDate),
      "INCLUÍDO EM": item.included,
      "MODIFICADO EM": item.modified,
      "COMENTÁRIO DA FISCAL": item.fiscalComment,
      "ALOCAÇÃO": item.allocation,
      "TÍTULO": item.title,
    })));
  }

  function reportColumnWidth(header) {
    const normalized = C.norm(header);
    if (/ARQUIVO|TITULO|CAMINHO DATABOOK|COMENTARIO|ALERTA|MOTIVO|EXPLICACAO|HISTORICO/.test(normalized)) return 44;
    if (/DOCUMENTO|LD \/ LINHA|GRDT|ALOCACAO/.test(normalized)) return 28;
    if (/DATA|REVISAO|STATUS|SITUACAO|ABA/.test(normalized)) return 18;
    return 22;
  }

  function styleReportHeader(row, color) {
    row.height = 34;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color || "FF24689A" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB7C8D6" } } };
    });
  }

  function styleReportDataRow(row, index, statusColumn) {
    row.height = 32;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 9.5, color: { argb: "FF263E52" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFF7F9FB" : "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
    });
    if (statusColumn) {
      const cell = row.getCell(statusColumn);
      const normalized = C.norm(cell.value);
      const palette = normalized.includes("PRONTO")
        ? ["FFEAF7F1", "FF0C7657"]
        : normalized.includes("BLOQUE")
          ? ["FFFFF0ED", "FFA64035"]
          : normalized.includes("REVIS")
            ? ["FFFFF5DF", "FFA56812"]
            : ["FFEDF1F4", "FF596C7D"];
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette[0] } };
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: palette[1] } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    }
  }

  // O logo vive no construtor compartilhado: já houve duas planilhas montando a
  // mesma imagem por caminhos diferentes, e uma delas saía sem logo.
  async function addReportLogo(workbook, worksheet) {
    const Report = window.GrconRequestsReport;
    if (!Report || !Report.attachBrandLogo) return;
    await Report.attachBrandLogo(workbook, worksheet, window.GRCONBrandAssets, window.fetch.bind(window));
  }

  async function buildReportFileLegacy() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GRCON";
    workbook.lastModifiedBy = "GRCON";
    workbook.company = "CONSAG Engenharia";
    workbook.title = "Relatório de Triagem GRCON";
    workbook.created = new Date();
    workbook.modified = new Date();

    const rows = reportRows();
    const timelineRows = reportTimelineRows();
    const summary = C.resultCounts(state.results);
    const ldVersions = [...new Set((state.results || []).map((row) => String(row && row.record && row.record.ldVersion || "").trim()).filter(Boolean))];
    const hasLdVersionColumn = (state.results || []).some((row) => row && row.record && row.record.ldVersionSource === "VERSÃO DA LD ENVIADA");
    const reportLdVersion = ldVersions.length
      ? ldVersions.join(" · ")
      : hasLdVersionColumn
        ? "Não informada nas linhas analisadas"
        : "Coluna não localizada";
    const metadata = `${ldDisplayName() || "LD não informada"} · Versão da LD enviada: ${reportLdVersion} · ${new Date().toLocaleString("pt-BR")}`;

    const summarySheet = workbook.addWorksheet("Resumo", { properties: { defaultRowHeight: 20 }, views: [{ showGridLines: false, zoomScale: 85 }] });
    const reportResults = state.results.map((row, index) => ({
      ...row,
      selectedForEgrdt: state.selected.has(index),
      manuallyIncluded: state.manualForceInclude.has(index),
    }));
    const summaryRows = ReportSummary
      ? ReportSummary.buildRowsAsync
        ? await ReportSummary.buildRowsAsync(reportResults, { ldFileName: ldDisplayName(), historyLookup: previousEgrdtHistoryText })
        : ReportSummary.buildRows(reportResults, { ldFileName: ldDisplayName(), historyLookup: previousEgrdtHistoryText })
      : [];
    // O desenho da aba vive em report_summary.js e é o mesmo usado pelo Worker
    // dedicado. Duplicá-lo aqui fazia uma melhoria chegar só a metade dos
    // usuários, conforme o navegador tivesse ou não suporte a Worker.
    if (ReportSummary && ReportSummary.writeExecutiveSummarySheet) {
      await ReportSummary.writeExecutiveSummarySheet(summarySheet, summaryRows, {
        metadata,
        ldName: ldDisplayName(),
        ldVersion: reportLdVersion,
        relationLabel: relationSourceLabel(),
        allocationCenter: allocationCenterConfig(),
      });
    }
    await addReportLogo(workbook, summarySheet);

    const buildDataSheet = async (name, title, data, statusHeader) => {
      const headers = data.length ? [...new Set(data.flatMap((row) => Object.keys(row)))] : [];
      const sheet = workbook.addWorksheet(name, { properties: { defaultRowHeight: 20 }, views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: false, zoomScale: 85 }] });
      const columnCount = Math.max(1, headers.length);
      const last = (() => { let n = columnCount, result = ""; while (n > 0) { n -= 1; result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26); } return result; })();
      for (let row = 1; row <= 3; row += 1) for (let col = 1; col <= columnCount; col += 1) sheet.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153A5C" } };
      const titleStart = columnCount > 2 ? "C1" : "A1";
      sheet.mergeCells(`${titleStart}:${last}2`);
      sheet.getCell(titleStart).value = `GRCON · ${title}`;
      sheet.getCell(titleStart).font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getCell(titleStart).alignment = { vertical: "middle" };
      sheet.mergeCells(`A4:${last}4`);
      sheet.getCell("A4").value = `${data.length.toLocaleString("pt-BR")} registro(s) · ${metadata}`;
      sheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF536679" } };
      sheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
      headers.forEach((header, index) => { sheet.getCell(6, index + 1).value = header; });
      styleReportHeader(sheet.getRow(6));
      const statusColumn = statusHeader ? headers.indexOf(statusHeader) + 1 : 0;
      await forEachLarge(data, (item, index) => {
        const row = sheet.getRow(index + 7);
        headers.forEach((header, col) => { row.getCell(col + 1).value = item[header] == null || item[header] === "" ? null : item[header]; });
        styleReportDataRow(row, index, statusColumn);
      });
      headers.forEach((header, index) => { sheet.getColumn(index + 1).width = reportColumnWidth(header); });
      if (headers.length) sheet.autoFilter = { from: "A6", to: `${last}${Math.max(6, data.length + 6)}` };
      sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .2, right: .2, top: .4, bottom: .4, header: .2, footer: .2 }, printTitlesRow: "6:6" };
      sheet.headerFooter.oddFooter = "&LGRCON&C&P de &N&R&D";
      await addReportLogo(workbook, sheet);
      return sheet;
    };

    await buildDataSheet("Triagem", "RESULTADO DA TRIAGEM", rows, "SITUAÇÃO GRCON");
    if (timelineRows.length) await buildDataSheet("Linha do tempo", "LINHA DO TEMPO DAS REVISÕES", timelineRows, "STATUS");

    const buffer = await workbook.xlsx.writeBuffer();
    const check = new ExcelJS.Workbook();
    await check.xlsx.load(buffer);
    if (!check.getWorksheet("Resumo") || !check.getWorksheet("Triagem") || check.getWorksheet("Auditoria detalhada")) throw new Error("O relatório gerado não pôde ser validado.");
    return buffer;
  }


  async function buildReportFile() {
    await ensureRuntime("report");
    if (!PerformanceCore || !PerformanceCore.supported) return buildReportFileLegacy();
    const results = await performanceSafeResults();
    const brand = window.GRCONBrandAssets || {};
    const payload = {
      results,
      ldName: ldDisplayName(),
      appVersion: APP_VERSION,
      engineVersion: DOCUMENT_ENGINE_VERSION,
      inputType: relationSourceKind() || "Pasta documental",
      relationLabel: relationSourceLabel() || "",
      listSummary: state.listSummary,
      ldIntegrity: state.ldIntegrity,
      recentDays: state.recentDays,
      logoBase64: brand.reportLogoBase64 || "",
      // O worker não enxerga localStorage nem o índice de histórico, então o
      // mapa documento -> eGRDT(s) anterior(es) e o cadastro da central de
      // alocação vão prontos no payload.
      historyByDocument: historyByDocumentMap(results),
      allocationCenter: allocationCenterConfig(),
    };
    const buffer = await PerformanceCore.buildReport(payload, workerProgress("Relatório Excel"));
    refreshPerformancePanel("Relatório Excel concluído.");
    return buffer;
  }

  function handleWorkerTaskError(error, fallbackMessage) {
    if (error && error.name === "AbortError") {
      state.cancelled = true;
      refreshPerformancePanel("Processamento cancelado. Nenhum arquivo parcial foi usado.");
      showToast("Processamento cancelado com segurança.", "warn");
      return;
    }
    console.error(error);
    showToast(error && error.message || fallbackMessage, "error");
  }

  async function exportReport() {
    await ensureRuntime("report");
    state.cancelled = false;
    setBusy(true, "Gerando relatório Excel");
    els.exportReport.disabled = true;
    try {
      const buffer = await buildReportFile();
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), reportDownloadName());
      showToast("Relatório profissional gerado e validado.", "success");
    } catch (error) {
      handleWorkerTaskError(error, "Não foi possível gerar o relatório.");
    } finally {
      setBusy(false);
      renderAll();
    }
  }

  function pendingAllocationArchiveName(entry, usedNames) {
    const rawName = String(entry.finalName || entry.originalName || entry.document || "arquivo").trim();
    const baseName = rawName.replace(/[\\/]/g, "_").replace(/[<>:"|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
    const withoutExtension = baseName.replace(/\.pdf$/i, "");
    const extension = /\.pdf$/i.test(baseName) ? ".pdf" : ".pdf";
    const preferred = `${withoutExtension}${extension}`;
    const match = preferred.match(/^(.*?)(\.pdf)$/i);
    const base = match ? match[1] : preferred;
    let candidate = preferred;
    let suffix = 2;
    while (usedNames.has(C.norm(candidate))) {
      candidate = `${base}_${suffix}${extension}`;
      suffix += 1;
    }
    usedNames.add(C.norm(candidate));
    return candidate;
  }

  function pendingAllocationManifest(bundle, archiveEntries) {
    const clean = (value) => String(value == null ? "" : value).replace(/[\t\r\n]+/g, " ").trim();
    const lines = [
      "GRCON — PDFs AGUARDANDO RETORNO DA ALOCAÇÃO",
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      `LD(s): ${ldDisplayName() || "Não informada"}`,
      `Documentos bloqueados neste pacote: ${bundle.documentCount}`,
      `PDFs copiados: ${bundle.pdfCount}`,
      "",
      "IMPORTANTE:",
      "- Estes documentos CONTINUAM BLOQUEADOS e não foram incluídos em nenhuma eGRDT.",
      "- O pacote existe apenas para guardar os PDFs enquanto a confirmação da alocação permanece NÃO ALOCADO.",
      "- Após o retorno da alocação, atualize a LD para ALOCADO e execute uma nova análise no GRCON antes de gerar a eGRDT.",
      "",
      [
        "DOCUMENTO", "REVISÃO", "DISCIPLINA", "ALOCAÇÃO", "ETAPA", "CONFIRMAÇÃO",
        "VERSÃO DA LD ENVIADA", "ABA", "LINHA", "PDF ORIGINAL", "PDF NO PACOTE",
      ].join("\t"),
      ...archiveEntries.map((entry) => [
        entry.document,
        entry.revision,
        entry.discipline,
        entry.allocation,
        entry.allocationStage,
        entry.allocationStatus,
        entry.ldVersion,
        entry.sheet,
        entry.ldRow,
        entry.originalName,
        entry.archiveName,
      ].map(clean).join("\t")),
    ];
    return lines.join("\r\n");
  }

  async function exportPendingAllocationPdfs() {
    await ensureRuntime("zip");
    if (!(await ensureFreshAnalysis())) return;
    const bundle = refreshPendingAllocationBundle();
    if (!bundle.pdfCount) {
      showToast("Nenhum PDF atende ao critério: Não Alocado, com número real de alocação e sem indicação de recusa ou cancelamento.", "warn");
      renderAll();
      return;
    }

    setBusy(true, "Separando PDFs que aguardam retorno da alocação");
    if (els.exportPendingAllocationPdfs) {
      els.exportPendingAllocationPdfs.disabled = true;
      els.exportPendingAllocationPdfs.textContent = "Preparando PDFs…";
    }
    if (Workspace) Workspace.start("pending-allocation-pdfs", "PDFs aguardando alocação");
    try {
      if (typeof JSZip !== "function") throw new Error("O compactador ZIP não foi carregado.");
      const zip = new JSZip();
      const rootFolder = zip.folder("PDFs_AGUARDANDO_RETORNO_DA_ALOCACAO");
      const usedNames = new Set();
      const archived = [];
      for (const entry of bundle.entries) {
        if (!entry.file) continue;
        const group = safeArchiveName([entry.discipline || "SEM_DISCIPLINA", entry.allocation || entry.allocationStatus || "SEM_ALOCACAO"].filter(Boolean).join("_"));
        const folder = rootFolder.folder(group);
        const uniqueArchiveName = pendingAllocationArchiveName(entry, usedNames);
        folder.file(uniqueArchiveName, entry.file);
        archived.push({ ...entry, archiveName: uniqueArchiveName, archiveFolder: group });
      }
      if (!archived.length) throw new Error("Os registros foram encontrados, mas nenhum PDF físico permaneceu disponível para o pacote.");
      zip.file("LEIA-ME_E_CONTROLE.txt", pendingAllocationManifest(bundle, archived));
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 4 },
      });
      const name = `GRCON_PDFs_Aguardando_Retorno_Alocacao_${compactOutputStamp()}.zip`;
      downloadBlob(blob, name);
      showToast(`${archived.length} PDF(s) separado(s). Eles continuam bloqueados para eGRDT até a LD confirmar ALOCADO.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Não foi possível separar os PDFs que aguardam retorno da alocação.", "error");
    } finally {
      if (Workspace) Workspace.finish("pending-allocation-pdfs");
      setBusy(false);
      renderAll();
    }
  }

  window.GrconPendingAllocationUi = Object.freeze({
    preview: () => ({ ...(state.pendingAllocationBundle || refreshPendingAllocationBundle()) }),
    refresh: refreshPendingAllocationBundle,
    download: exportPendingAllocationPdfs,
  });

  function buildEgrdtItems() {
    state.selected.forEach((index) => {
      const row = state.results[index];
      if (row && row.egrdt && C.enforceDocumentFormat) C.enforceDocumentFormat(row.egrdt);
    });
    return E.createPlan(state.results, state.selected, { manualForceIndices: state.manualForceInclude });
  }

  function previewEgrdtRows() {
    const rows = [];
    state.results.filter((row, index) => state.selected.has(index) && rowCanBeSelected(row)).forEach((row) => {
      rowOutputSources(row).forEach((entry) => {
        const data = row.egrdt || {};
        rows.push({
          "DOCUMENTO": row.document,
          "REVISÃO": row.revision,
          "TÍTULO": data.title || "",
          "ARQUIVO": entry.finalName,
          "FORMATO": data.format || "",
          "DISCIPLINA": data.discipline || "",
          "TIPO DE DOCUMENTO": data.documentType || "",
          "PROPÓSITO": data.purpose || "",
          "CAMINHO DATABOOK": data.databook || "",
        });
      });
    });
    return rows;
  }

  function buildEgrdtPreviewFile() {
    const rows = previewEgrdtRows();
    const headers = ["DOCUMENTO", "REVISÃO", "TÍTULO", "ARQUIVO", "FORMATO", "DISCIPLINA", "TIPO DE DOCUMENTO", "PROPÓSITO", "CAMINHO DATABOOK"];
    const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] || "")), ["FIM"]];
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    sheet["!cols"] = [45, 10, 55, 55, 12, 28, 22, 28, 60].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(book, sheet, "GRDT");
    return XLSX.write(book, { type: "array", bookType: "biff8", bookSST: true });
  }


  function exportWorkerGroups(groups, includeFiles) {
    return (groups || []).map((group) => ({
      number: group.number,
      startIndex: group.startIndex,
      endIndex: group.endIndex,
      limit: group.limit,
      discipline: group.discipline,
      disciplineBatchNumber: group.disciplineBatchNumber,
      disciplineBatchCount: group.disciplineBatchCount,
      items: (group.items || []).map((item) => ({ ...item })),
      entries: (group.entries || []).map((entry) => ({
        rowIndex: entry.rowIndex,
        document: entry.document,
        revision: entry.revision,
        discipline: entry.discipline,
        sourceLd: entry.sourceLd,
        allocation: entry.allocation,
        originalName: entry.originalName,
        relativePath: entry.relativePath,
        finalName: entry.finalName,
        virtual: Boolean(entry.virtual),
        manualAllocationOverride: Boolean(entry.manualAllocationOverride),
        item: { ...(entry.item || {}) },
        file: includeFiles ? entry.file : null,
      })),
    }));
  }

  function restoreWorkerGenerated(workerGenerated, originalGroups) {
    return (workerGenerated || []).map((file, index) => ({
      group: (originalGroups || [])[index] || file.group,
      official: file.official,
      fileName: file.fileName,
      verification: file.verification,
      data: file.data,
    }));
  }

  async function workerReportPayload() {
    const results = await performanceSafeResults();
    const brand = window.GRCONBrandAssets || {};
    return {
      results,
      ldName: ldDisplayName(),
      appVersion: APP_VERSION,
      engineVersion: DOCUMENT_ENGINE_VERSION,
      inputType: relationSourceKind() || "Pasta documental",
      relationLabel: relationSourceLabel() || "",
      listSummary: state.listSummary,
      ldIntegrity: state.ldIntegrity,
      recentDays: state.recentDays,
      logoBase64: brand.reportLogoBase64 || "",
      allocationCenter: allocationCenterConfig(),
    };
  }

  function workerPackageName(generated, timestamp) {
    return PackageLayout.archiveName(generated, timestamp);
  }

  async function exportEgrdt() {
    await ensureRuntime("export");
    if (!(await ensureFreshAnalysis())) return;
    const prepared = buildEgrdtItems();
    if (prepared.errors.length) {
      showToast(`GRDT bloqueada: ${prepared.errors.slice(0, 3).join(" ")}`, "error");
      return;
    }
    state.cancelled = false;
    setBusy(true, "Gerando eGRDTs");
    els.exportEgrdt.disabled = true;
    els.exportEgrdt.textContent = "Gerando…";
    if (Workspace) Workspace.start("grdt-export", "Geração de GRDT");
    try {
      const generatedAt = new Date().toISOString();
      const timestamp = C.compactTimestamp(new Date());
      const groups = E.splitPlan(prepared, currentEgrdtBatchLimit());
      const officialNumbers = await reserveEgrdtSequences(groups.length);
      const previewGenerated = groups.map((group, index) => ({ group, official: officialNumbers[index], fileName: `${officialNumbers[index].baseName}.xls` }));
      const packageName = previewGenerated.length === 1 ? previewGenerated[0].fileName : PackageLayout.archiveName(previewGenerated, timestamp);
      const sigemPrepared = prepareSigemOutput(previewGenerated, "eGRDT final", packageName, generatedAt);
      let generated;
      if (PerformanceCore && PerformanceCore.supported) {
        if (groups.length === 1) {
          const built = await PerformanceCore.buildEgrdts({
            groups: exportWorkerGroups(groups, false),
            officialNumbers,
          }, workerProgress("eGRDT"));
          generated = restoreWorkerGenerated(built.generated, groups);
          const file = generated[0];
          downloadBlob(new Blob([file.data], { type: window.GrdtWorkbook.MIME || "application/vnd.ms-excel" }), file.fileName);
        } else {
          const built = await PerformanceCore.buildPackage({
            mode: "egrdt-only",
            includeFiles: false,
            groups: exportWorkerGroups(groups, false),
            officialNumbers,
            limit: currentEgrdtBatchLimit(),
            ...sigemWorkerPayload(sigemPrepared),
          }, workerProgress("eGRDT + ZIP"));
          generated = restoreWorkerGenerated(built.generated, groups);
          downloadBlob(new Blob([built.bytes], { type: "application/zip" }), packageName);
        }
        refreshPerformancePanel(`${generated.length} eGRDT(s) gerada(s).`);
      } else {
        generated = [];
        for (const group of groups) {
          const data = await window.GrdtWorkbook.build(group.items, C.EGRDT_OPTIONS);
          const verification = await window.GrdtWorkbook.verify(data, group.items);
          generated.push({ group, data, verification });
        }
        generated.forEach((file, index) => {
          file.official = officialNumbers[index];
          file.fileName = `${file.official.baseName}.xls`;
        });
        if (generated.length === 1) {
          downloadBlob(new Blob([generated[0].data], { type: window.GrdtWorkbook.MIME || "application/vnd.ms-excel" }), generated[0].fileName);
        } else {
          const zip = new JSZip();
          generated.forEach((file) => zip.folder(file.official.baseName).file(file.fileName, file.data));
          zip.file("ORGANIZACAO_DOS_LOTES.txt", buildBatchSummaryText(generated));
          addSigemManifests(zip, sigemPrepared);
          downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), packageName);
        }
      }
      saveGeneratedHistory(generated, "eGRDT final", { packageName, generatedAt }, sigemPrepared.historyRecords);
      showToast(`${generated.length} GRDT final(is) verificada(s) e registrada(s) para a etapa SIGEM.`, "success");
    } catch (error) {
      handleWorkerTaskError(error, "Não foi possível gerar a GRDT final.");
    } finally {
      if (Workspace) Workspace.finish("grdt-export");
      els.exportEgrdt.textContent = "Baixar eGRDT final";
      setBusy(false);
      renderAll();
    }
  }

  function outputFileEntries() {
    const selectedRows = state.results.filter((row, index) => state.selected.has(index));
    const manualForceRows = new Set([...state.manualForceInclude].map((index) => state.results[index]).filter(Boolean));
    const guard = OutputGuard ? OutputGuard.validateRows(selectedRows, { maxItems: currentEgrdtBatchLimit(), splitAllowed: true, manualForceRows }) : { valid: true, errors: [], warnings: [] };
    const entries = [];
    const names = new Set();
    const duplicates = [];
    const errors = [];
    const warnings = [...(guard.warnings || [])];
    state.results.filter((row, index) => state.selected.has(index) && rowCanBeSelected(row)).forEach((row) => {
      (row.files || []).forEach((entry) => {
        const check = C.validateFinalFileName(entry.finalName, entry.name, row.document, row.revision, row.sheet);
        const finalName = check.expected;
        if (!check.valid) warnings.push(`${row.document}: nome/codificação fora do padrão; corrigido automaticamente para ${finalName}. ${check.errors.join(" ")}`);
        if (safeArchiveName(finalName) !== finalName) errors.push(`${row.document}: o nome final contém caractere incompatível com o ZIP.`);
        const outputKey = C.norm(finalName);
        if (names.has(outputKey)) {
          duplicates.push(finalName);
          warnings.push(`${row.document}: arquivo duplicado ${finalName} ignorado; somente uma cópia seguirá para a saída.`);
          return;
        }
        names.add(outputKey);
        entries.push({ ...entry, finalName });
      });
    });
    guard.errors.forEach((message) => { if (!errors.includes(message)) errors.push(message); });
    return { entries, duplicates, errors, warnings };
  }

  async function exportZip() {
    await ensureRuntime("export");
    if (!(await ensureFreshAnalysis())) return;
    const physicalSelection = new Set([...state.selected].filter((index) => {
      const row = state.results[index];
      return row && row.files && row.files.length;
    }));
    if (!physicalSelection.size) {
      showToast("Nenhum arquivo físico selecionado. Use Baixar eGRDT final para itens recebidos somente por relação.", "warn");
      return;
    }
    const plan = E.createPlan(state.results, physicalSelection, { manualForceIndices: state.manualForceInclude });
    if (plan.errors.length) {
      showToast(`Arquivos + eGRDT bloqueados: ${plan.errors.slice(0, 3).join(" ")}`, "error");
      return;
    }
    state.cancelled = false;
    setBusy(true, "Montando arquivos, eGRDTs e ZIP");
    els.exportZip.disabled = true;
    els.exportZip.textContent = "Preparando…";
    if (Workspace) Workspace.start("grdt-package", "Arquivos + eGRDT");
    try {
      const consistency = E.consistencyErrors(plan);
      if (consistency.length) throw new Error(consistency.join(" "));
      const generatedAt = new Date().toISOString();
      const timestamp = C.compactTimestamp(new Date());
      const groups = E.splitPlan(plan, currentEgrdtBatchLimit());
      const officialNumbers = await reserveEgrdtSequences(groups.length);
      const previewGenerated = groups.map((group, index) => ({ group, official: officialNumbers[index], fileName: `${officialNumbers[index].baseName}.xls` }));
      const packageName = PackageLayout.archiveName(previewGenerated, timestamp);
      const sigemPrepared = prepareSigemOutput(previewGenerated, "Arquivos + eGRDT", packageName, generatedAt);
      let generated;
      let blob;
      if (PerformanceCore && PerformanceCore.supported) {
        const built = await PerformanceCore.buildPackage({
          mode: "pdfs",
          includeFiles: true,
          groups: exportWorkerGroups(groups, true),
          officialNumbers,
          limit: currentEgrdtBatchLimit(),
          ...sigemWorkerPayload(sigemPrepared),
        }, workerProgress("Arquivos + eGRDT + ZIP"));
        generated = restoreWorkerGenerated(built.generated, groups);
        blob = new Blob([built.bytes], { type: "application/zip" });
        refreshPerformancePanel(`${plan.entries.length} arquivo(s) e ${generated.length} eGRDT(s) processados.`);
      } else {
        generated = [];
        for (const group of groups) {
          const data = await window.GrdtWorkbook.build(group.items, C.EGRDT_OPTIONS);
          const verification = await window.GrdtWorkbook.verify(data, group.items);
          generated.push({ group, data, verification });
        }
        generated.forEach((file, index) => {
          file.official = officialNumbers[index];
          file.fileName = `${file.official.baseName}.xls`;
        });
        const zip = new JSZip();
        PackageLayout.addFolders(zip, generated, [{ name: "ORGANIZACAO_DOS_LOTES.txt", data: buildBatchSummaryText(generated) }]);
        addSigemManifests(zip, sigemPrepared);
        blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 4 } });
      }
      downloadBlob(blob, packageName);
      saveGeneratedHistory(generated, "Arquivos + eGRDT", { packageName, generatedAt }, sigemPrepared.historyRecords);
      showToast(`${plan.entries.length} arquivo(s) e ${generated.length} eGRDT(s) verificados e registrados para a etapa SIGEM.`, "success");
    } catch (error) {
      handleWorkerTaskError(error, "Não foi possível gerar os arquivos com a eGRDT.");
    } finally {
      if (Workspace) Workspace.finish("grdt-package");
      els.exportZip.textContent = "Baixar arquivos + eGRDT";
      setBusy(false);
      renderAll();
    }
  }

  function buildBatchSummaryText(generated) {
    const lines = [
      "GRCON — ORGANIZAÇÃO DOS LOTES PARA POSTAGEM NO SIGEM",
      `Limite operacional aplicado: ${currentEgrdtBatchLimit()} documentos por eGRDT.`,
      `Total de eGRDTs: ${generated.length}.`,
      "",
    ];
    generated.forEach((file, index) => {
      lines.push(`${index + 1}. ${file.official.baseName}`);
      lines.push(`   Disciplina: ${file.group.discipline || "NÃO INFORMADA"}`);
      if (file.group.disciplineBatchCount > 1) lines.push(`   Divisão da disciplina: ${file.group.disciplineBatchNumber} de ${file.group.disciplineBatchCount}`);
      lines.push(`   Documentos/PDFs: ${file.group.entries.length}`);
      lines.push(`   Arquivo eGRDT: ${file.fileName}`);
      lines.push(`   Pasta: ${file.official.baseName}`);
      lines.push("");
    });
    lines.push("Cada pasta contém somente a eGRDT indicada e os PDFs pertencentes ao respectivo lote.");
    return lines.join("\r\n");
  }

  function buildConferenceFile(plan) {
    const rows = E.manifestRows(plan, {
      ldName: ldDisplayName(),
      listName: relationSourceLabel(),
      appVersion: APP_VERSION,
      analysisAt: state.analysisAt ? new Date(state.analysisAt).toISOString() : "",
    });
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    sheet["!cols"] = headers.map((header) => ({ wch: Math.min(72, Math.max(14, header.length + 2)) }));
    XLSX.utils.book_append_sheet(book, sheet, "Conferência");
    return XLSX.write(book, { type: "array", bookType: "xlsx" });
  }

  async function exportFinalPackage() {
    await ensureRuntime("export");
    if (!(await ensureFreshAnalysis())) return;
    const physicalSelection = new Set([...state.selected].filter((index) => {
      const row = state.results[index];
      return row && row.files && row.files.length;
    }));
    if (!physicalSelection.size) {
      showToast("Nenhum PDF físico foi fornecido. Use Gerar GRDT final para os itens recebidos pela relação.", "warn");
      return;
    }
    const plan = E.createPlan(state.results, physicalSelection, { manualForceIndices: state.manualForceInclude });
    if (plan.errors.length) {
      showToast(`Pacote final bloqueado: ${plan.errors.slice(0, 3).join(" ")}`, "error");
      return;
    }
    state.cancelled = false;
    setBusy(true, "Montando pacote final");
    els.exportFinalPackage.disabled = true;
    els.exportFinalPackage.textContent = "Gerando…";
    if (Workspace) Workspace.start("grdt-final-package", "Pacote final GRDT");
    try {
      const consistency = E.consistencyErrors(plan);
      if (consistency.length) throw new Error(consistency.join(" "));
      const generatedAt = new Date().toISOString();
      const timestamp = C.compactTimestamp(new Date());
      const groups = E.splitPlan(plan, currentEgrdtBatchLimit());
      const officialNumbers = await reserveEgrdtSequences(groups.length);
      const previewGenerated = groups.map((group, index) => ({ group, official: officialNumbers[index], fileName: `${officialNumbers[index].baseName}.xls` }));
      const packageName = PackageLayout.archiveName(previewGenerated, timestamp);
      const sigemPrepared = prepareSigemOutput(previewGenerated, "Pacote completo", packageName, generatedAt);
      let generated;
      let blob;
      if (PerformanceCore && PerformanceCore.supported) {
        const firstOfficial = officialNumbers[0];
        const reportPayload = await workerReportPayload();
        const built = await PerformanceCore.buildPackage({
          mode: "final",
          includeFiles: true,
          groups: exportWorkerGroups(groups, true),
          officialNumbers,
          limit: currentEgrdtBatchLimit(),
          report: reportPayload,
          manifest: {
            ldName: ldDisplayName(),
            listName: relationSourceLabel(),
            appVersion: APP_VERSION,
            analysisAt: state.analysisAt ? new Date(state.analysisAt).toISOString() : "",
          },
          reportName: `Relatorio_GRCON_${firstOfficial.sequenceText}_${firstOfficial.year}_${timestamp}.xlsx`,
          manifestName: `Conferencia_GRCON_${firstOfficial.sequenceText}_${firstOfficial.year}.xlsx`,
          ...sigemWorkerPayload(sigemPrepared),
        }, workerProgress("Pacote final"));
        generated = restoreWorkerGenerated(built.generated, groups);
        generated.forEach((file) => file.group.entries.forEach((entry) => {
          entry.grdtFile = file.fileName;
          entry.grdtReopened = Boolean(file.verification && file.verification.valid);
        }));
        blob = new Blob([built.bytes], { type: "application/zip" });
        refreshPerformancePanel(`Pacote completo concluído: ${generated.length} eGRDT(s).`);
      } else {
        generated = [];
        for (const group of groups) {
          const data = await window.GrdtWorkbook.build(group.items, C.EGRDT_OPTIONS);
          const verification = await window.GrdtWorkbook.verify(data, group.items);
          generated.push({ group, data, verification });
        }
        generated.forEach((file, index) => {
          file.official = officialNumbers[index];
          file.fileName = `${file.official.baseName}.xls`;
          file.group.entries.forEach((entry) => { entry.grdtFile = file.fileName; entry.grdtReopened = file.verification.valid; });
        });
        const firstOfficial = generated[0].official;
        const zip = new JSZip();
        PackageLayout.addFolders(zip, generated, [
          { name: "ORGANIZACAO_DOS_LOTES.txt", data: buildBatchSummaryText(generated) },
          { name: `Conferencia_GRCON_${firstOfficial.sequenceText}_${firstOfficial.year}.xlsx`, data: buildConferenceFile(plan) },
          { name: `Relatorio_GRCON_${firstOfficial.sequenceText}_${firstOfficial.year}_${timestamp}.xlsx`, data: await buildReportFile() },
        ]);
        addSigemManifests(zip, sigemPrepared);
        blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 4 } });
      }
      downloadBlob(blob, packageName);
      saveGeneratedHistory(generated, "Pacote completo", { packageName, generatedAt }, sigemPrepared.historyRecords);
      showToast(`${plan.entries.length} arquivo(s), ${generated.length} eGRDT(s) e o relatório de conferência validados no pacote final.`, "success");
    } catch (error) {
      handleWorkerTaskError(error, "Não foi possível gerar o pacote final.");
    } finally {
      if (Workspace) Workspace.finish("grdt-final-package");
      els.exportFinalPackage.textContent = "Pacote final";
      setBusy(false);
      renderAll();
    }
  }

  els.ldInput.addEventListener("change", async (event) => {
    clearSgparQueue();
    state.conflictResolutions.clear();
    invalidateAnalysisResults();
    const files = [...event.target.files].filter((file) => /\.(xlsx?|xlsm)$/i.test(file.name));
    state.ldFiles = [];
    updateInputMeta();
    if (!files.length) return;
    els.ldInput.disabled = true;
    els.ldMeta.textContent = files.length === 1 ? "Preparando LD para leitura segura…" : `Preparando ${files.length} LDs…`;
    try {
      state.ldFiles = await stableSelectedFiles(files, "a LD controlada", (completed, total) => {
        if (total > 1) els.ldMeta.textContent = `Copiando LD ${completed} de ${total} para memória…`;
      });
      if (window.GrconLdMemory) window.GrconLdMemory.save(state.ldFiles[0]);
      refreshPerformancePanel(`${state.ldFiles.length} LD(s) copiadas para memória e prontas para análise.`);
      showToast(`${state.ldFiles.length} LD(s) preparada(s) para leitura segura.`, "success");
    } catch (error) {
      state.ldFiles = [];
      event.target.value = "";
      const friendly = normalizeFileAccessError(error, files[0], "a LD controlada");
      console.warn("GRCON: falha ao preparar a LD selecionada.", friendly);
      showToast(friendly && friendly.message || "Não foi possível ler a LD selecionada.", "error");
    } finally {
      els.ldInput.disabled = false;
      updateInputMeta();
    }
  });
  if (els.compatibilityOpen) els.compatibilityOpen.addEventListener("click", () => {
    if (!L) return;
    const target = state.ldFiles.find((file) => L.inspectionFor(file) && !L.ready(file))
      || state.ldFiles.find((file) => L.inspectionFor(file))
      || state.ldFiles[0];
    if (target) L.open(target);
  });
  document.addEventListener("grcon:ld-compatibility", (event) => {
    if (event.detail && state.ldFiles.includes(event.detail.file)) updateInputMeta();
  });
  els.listInput.addEventListener("change", async (event) => {
    clearSgparQueue();
    invalidateAnalysisResults();
    const files = [...event.target.files].filter((file) => /\.(xlsx?|xlsm|csv)$/i.test(file.name));
    state.listFiles = [];
    updateInputMeta();
    if (!files.length) return;
    els.listInput.disabled = true;
    els.listMeta.textContent = "Preparando relação para leitura segura…";
    try {
      state.listFiles = await stableSelectedFiles([files[0]], "a lista Excel");
      state.textEntries = [];
      state.relationDraft = "";
      state.relationSavedText = "";
      if (Workspace) Workspace.clearDraft("grdtRelation");
      state.relationPreview = { entries: [], duplicates: [], ignored: [] };
      renderRelationPreview();
      showToast("Lista Excel preparada para leitura segura.", "success");
    } catch (error) {
      state.listFiles = [];
      event.target.value = "";
      const friendly = normalizeFileAccessError(error, files[0], "a lista Excel");
      console.warn("GRCON: falha ao preparar a lista selecionada.", friendly);
      showToast(friendly && friendly.message || "Não foi possível ler a lista Excel selecionada.", "error");
    } finally {
      els.listInput.disabled = false;
      updateInputMeta();
    }
  });
  els.packageInput.addEventListener("change", async (event) => {
    invalidateAnalysisResults(state.sgparQueue.length > 0);
    state.packageCandidates = [...event.target.files];
    state.packageSelectionPending = true;
    state.packageSelectionReady = false;
    state.packageFiles = [];
    state.ignoredFiles = [];
    updateInputMeta();
    let lastPaint = 0;
    try {
      if (state.packageCandidates.length) {
        await refreshPackageSelectionAsync((completed, total) => {
          const now = performance.now();
          if (now - lastPaint < 180 && completed < total) return;
          lastPaint = now;
          if (els.packageMeta) els.packageMeta.textContent = `Processando pasta documental: ${completed.toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")}`;
          refreshPerformancePanel(`Carregamento progressivo: ${completed.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} arquivo(s).`);
        });
      }
    } finally {
      state.packageSelectionPending = false;
      state.packageSelectionReady = true;
      updateInputMeta();
      refreshPerformancePanel(`${state.packageFiles.length.toLocaleString("pt-BR")} arquivo(s) prontos para análise.`);
    }
    if (state.sgparQueue.length) {
      reconcileSgparFiles();
      renderSgpar();
    }
  });
  els.sgparStart.addEventListener("click", prepareSgparQueue);
  els.relationStart.addEventListener("click", openRelationDrawer);
  els.relationClose.addEventListener("click", cancelRelationDrawer);
  els.relationCancel.addEventListener("click", cancelRelationDrawer);
  els.relationOverlay.addEventListener("click", cancelRelationDrawer);
  els.relationText.addEventListener("input", (event) => updateRelationDraft(event.target.value));
  els.relationPaste.addEventListener("click", pasteRelationText);
  els.relationClear.addEventListener("click", () => {
    els.relationText.value = "";
    updateRelationDraft("");
    els.relationText.focus();
  });
  els.relationApply.addEventListener("click", applyRelationText);
  els.recentDays.addEventListener("change", () => {
    const days = Math.max(1, Math.min(365, Number(els.recentDays.value) || 30));
    els.recentDays.value = String(days);
    if (Workspace) Workspace.setPreference("recentDays", days);
  });
  els.sgparUrl.addEventListener("change", () => {
    if (Workspace) Workspace.setPreference("sgparUrl", String(els.sgparUrl.value || "").trim());
  });
  els.allocationCenterSave?.addEventListener("click", saveAllocationCenter);
  els.allocationCenterClear?.addEventListener("click", clearAllocationCenter);
  els.sgparClose.addEventListener("click", closeSgparDrawer);
  els.sgparCancel.addEventListener("click", closeSgparDrawer);
  els.sgparOverlay.addEventListener("click", closeSgparDrawer);
  els.sgparCopy.addEventListener("click", async () => {
    const copied = await copySgparCode();
    showToast(copied ? "Código copiado." : "Não foi possível copiar automaticamente. Selecione o código exibido.", copied ? "success" : "warn");
  });
  els.sgparCopyOpen.addEventListener("click", copyAndOpenSgpar);
  els.sgparMarkDownloaded.addEventListener("click", () => markSgpar("downloaded"));
  els.sgparMarkMissing.addEventListener("click", () => markSgpar("missing"));
  els.sgparSkip.addEventListener("click", () => markSgpar("skipped"));
  els.sgparPrevious.addEventListener("click", () => moveSgpar(-1));
  els.sgparNext.addEventListener("click", () => moveSgpar(1));
  els.sgparQueue.addEventListener("click", (event) => {
    const item = event.target.closest("[data-sgpar-index]");
    if (!item) return;
    state.sgparCurrent = Number(item.dataset.sgparIndex);
    renderSgpar();
  });
  els.sgparFiles.addEventListener("change", (event) => addSgparFiles(event.target.files));
  els.sgparAnalyze.addEventListener("click", () => {
    closeSgparDrawer();
    analyze();
  });
  els.analyze.addEventListener("click", analyze);
  els.reset.addEventListener("click", reset);

  // ─── Limpar fontes individuais ──────────────────────────────────────────────
  if (els.clearLdBtn) {
    els.clearLdBtn.addEventListener("click", () => {
      if (!state.ldFiles.length) return;
      state.ldFiles = [];
      els.ldInput.value = "";
      clearSgparQueue();
      state.conflictResolutions.clear();
      invalidateAnalysisResults();
      updateInputMeta();
      showToast("LD removida.", "success");
    });
  }

  if (els.clearPdfBtn) {
    els.clearPdfBtn.addEventListener("click", () => {
      if (!state.packageFiles.length && !state.packageCandidates.length) return;
      state.packageCandidates = [];
      state.packageFiles = [];
      state.ignoredFiles = [];
      state.listIgnoredFiles = [];
      state.listSummary = null;
      state.packageSelectionPending = false;
      state.packageSelectionReady = false;
      els.packageInput.value = "";
      invalidateAnalysisResults();
      updateInputMeta();
      showToast("Pasta documental removida.", "success");
    });
  }

  if (els.clearRelationBtn) {
    els.clearRelationBtn.addEventListener("click", () => {
      if (!state.listFiles.length && !state.textEntries.length && !state.relationSavedText) return;
      state.listFiles = [];
      state.textEntries = [];
      state.relationDraft = "";
      state.relationSavedText = "";
      state.relationPreview = { entries: [], duplicates: [], ignored: [] };
      state.listSummary = null;
      state.listIgnoredFiles = [];
      els.listInput.value = "";
      if (window.Workspace) window.Workspace.clearDraft("grdtRelation");
      clearSgparQueue();
      invalidateAnalysisResults();
      updateInputMeta();
      showToast("Relação e texto removidos.", "success");
    });
  }
  // ────────────────────────────────────────────────────────────────────────────

  els.advancedToggle.addEventListener("click", () => {
    const open = els.advancedPanel.hidden;
    els.advancedPanel.hidden = !open;
    els.advancedToggle.setAttribute("aria-expanded", String(open));
  });
  initializeResultColumnFilters();
  loadAllocationCenterFields();
  // A área compartilhada é quem manda no cadastro: quando ela responde, os
  // campos passam a mostrar o que está valendo para todos.
  window.addEventListener("grcon:allocation-center-updated", loadAllocationCenterFields);
  window.addEventListener("grcon:cloud-ready", loadAllocationCenterFields);
  if (els.clearColumnFilters) els.clearColumnFilters.addEventListener("click", clearResultColumnFilters);
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    state.resultPage = 1;
    window.clearTimeout(els.search._grconTimer);
    els.search._grconTimer = window.setTimeout(renderAll, 120);
  });
  els.sheetFilter.addEventListener("change", (event) => {
    state.sheetFilter = event.target.value;
    state.resultPage = 1;
    renderAll();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      state.resultPage = 1;
      renderAll();
    });
  });
  if (els.resultPagePrevious) els.resultPagePrevious.addEventListener("click", () => {
    state.resultPage = Math.max(1, state.resultPage - 1);
    renderTable();
  });
  if (els.resultPageNext) els.resultPageNext.addEventListener("click", () => {
    state.resultPage += 1;
    renderTable();
  });
  els.tbody.addEventListener("click", (event) => {
    const rowElement = event.target.closest("tr[data-index]");
    if (!rowElement) return;
    const index = Number(rowElement.dataset.index);
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "toggle-details") {
      if (state.expanded.has(index)) state.expanded.delete(index);
      else state.expanded.add(index);
      renderTable();
      return;
    }
    if (action === "edit-egrdt") {
      openEgrdtDrawer([index]);
      return;
    }
    if (action === "resolve-ld-conflict") {
      const row = state.results[index];
      const sourceId = event.target.closest("[data-source-id]")?.dataset.sourceId;
      if (!row || !row.documentKey || !sourceId) return;
      state.conflictResolutions.set(row.documentKey, sourceId);
      showToast("Linha escolhida para esta sessão. A triagem será recalculada.", "success");
      analyze();
      return;
    }
    if (event.target.closest("input, button, select, a")) return;
    if (event.target.closest(".result-row")) {
      if (state.expanded.has(index)) state.expanded.delete(index);
      else state.expanded.add(index);
      renderTable();
    }
  });
  els.tbody.addEventListener("change", (event) => {
    const isSelectRow = event.target.hasAttribute("data-select-row");
    const isManualSelect = event.target.hasAttribute("data-manual-select");
    if (!isSelectRow && !isManualSelect) return;
    const rowElement = event.target.closest("tr[data-index]");
    if (!rowElement) return;
    const index = Number(rowElement.dataset.index);
    const row = state.results[index];
    if (event.target.checked) {
      if (!rowCanBeSelected(row)) {
        event.target.checked = false;
        showToast("Este documento possui um bloqueio técnico que não admite inclusão manual.", "warn");
        return;
      }
      state.selected.add(index);
      // Mantém o registro visual de que o operador incluiu um alerta de triagem.
      if (row && (row.decision !== C.READY || row.hardBlock)) {
        state.manualForceInclude.add(index);
      }
      if (manualAllocationOverrideAllowed(row)) {
        showToast("Documento incluído manualmente. A LD continuará registrada como Não Alocado.", "warn");
      }
    } else {
      state.selected.delete(index);
      state.manualForceInclude.delete(index);
    }
    // Sincroniza os dois checkboxes (situação e manual)
    if (isManualSelect) {
      const selectRow = rowElement.querySelector("[data-select-row]");
      if (selectRow) selectRow.checked = event.target.checked;
    } else {
      const manualSelect = rowElement.querySelector("[data-manual-select]");
      if (manualSelect) manualSelect.checked = event.target.checked;
    }
    renderAll();
  });
  els.selectAllReady.addEventListener("change", (event) => {
    const visibleIndices = filteredResultIndices();
    visibleIndices.forEach((index) => {
      const row = state.results[index];
      if (!rowCanBeSelected(row) || !rowOutputSources(row).length) return;
      if (event.target.checked) {
        state.selected.add(index);
        if (row.decision !== C.READY || row.hardBlock) state.manualForceInclude.add(index);
      } else {
        state.selected.delete(index);
        state.manualForceInclude.delete(index);
      }
    });
    if (event.target.checked) {
      const visibleSet = new Set(visibleIndices);
      const manualCount = [...state.manualForceInclude].filter((index) => visibleSet.has(index)).length;
      showToast(`Documentos visíveis selecionados${manualCount ? ` · ${manualCount} inclusão(ões) manual(is) sinalizada(s)` : ""}.`, manualCount ? "warn" : "success");
    }
    renderAll();
  });
  if (els.resultsScroll) {
    els.resultsScroll.addEventListener("scroll", () => {
      if (els.resultsScroll._grconVirtualFrame) return;
      els.resultsScroll._grconVirtualFrame = requestAnimationFrame(() => {
        els.resultsScroll._grconVirtualFrame = 0;
        renderTable();
      });
    }, { passive: true });
  }
  if (els.cancelProcessing) els.cancelProcessing.addEventListener("click", () => {
    if (PerformanceCore) PerformanceCore.cancelAll();
    state.cancelled = true;
    if (els.performanceStatus) els.performanceStatus.textContent = "Cancelando e descartando resultados parciais…";
  });
  if (els.egrdtBatchSave) els.egrdtBatchSave.addEventListener("click", saveEgrdtBatchLimit);
  if (els.egrdtBatchLimit) {
    els.egrdtBatchLimit.addEventListener("keydown", (event) => { if (event.key === "Enter") saveEgrdtBatchLimit(); });
    els.egrdtBatchLimit.addEventListener("blur", () => renderEgrdtBatchSettings());
  }
  if (els.clearLdCache) els.clearLdCache.addEventListener("click", async () => {
    try {
      await ensureRuntime("performance");
      if (PerformanceCore) await PerformanceCore.clearLdCache();
      state.performanceMetrics = {};
      refreshPerformancePanel("Cache persistente da LD limpo.");
      showToast("Cache da LD limpo. A próxima análise fará uma nova indexação.", "success");
    } catch (error) {
      showToast(error.message || "Não foi possível limpar o cache da LD.", "error");
    }
  });
  els.exportReport.addEventListener("click", exportReport);
  if (els.exportPendingAllocationPdfs) {
    els.exportPendingAllocationPdfs.addEventListener("click", exportPendingAllocationPdfs);
  }
  document.getElementById("view-pending-allocation-history")?.addEventListener("click", () => {
    window.open("pending_allocation_history.html", "_blank", "noopener,noreferrer");
  });
  els.exportEgrdt.addEventListener("click", exportEgrdt);
  els.exportZip.addEventListener("click", exportZip);
  els.exportFinalPackage.addEventListener("click", exportFinalPackage);
  els.batchEgrdt.addEventListener("click", () => openEgrdtDrawer([...state.selected]));
  els.drawerClose.addEventListener("click", closeEgrdtDrawer);
  els.drawerCancel.addEventListener("click", closeEgrdtDrawer);
  els.drawerOverlay.addEventListener("click", closeEgrdtDrawer);
  els.drawerSave.addEventListener("click", saveEgrdtDrawer);
  [els.drawerTitle, els.drawerDatabook, els.drawerDiscipline, els.drawerType].forEach((element) => {
    element.addEventListener(element.tagName === "SELECT" ? "change" : "input", renderEgrdtAssistant);
  });
  els.drawerTitleSuggestion.addEventListener("click", () => {
    if (!state.drawerTitleSuggestion) return;
    els.drawerTitle.value = state.drawerTitleSuggestion;
    renderEgrdtAssistant();
  });
  els.drawerDatabookSuggestion.addEventListener("click", () => {
    // Somente leitura: o valor vem exclusivamente da linha correspondente na LD.
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.drawer.classList.contains("open")) closeEgrdtDrawer();
    if (event.key === "Escape" && els.sgparDrawer.classList.contains("open")) closeSgparDrawer();
    if (event.key === "Escape" && els.relationDrawer.classList.contains("open")) cancelRelationDrawer();
  });

  if (Workspace) {
    const savedRecentDays = Math.max(1, Math.min(365, Number(Workspace.preference("recentDays", 30)) || 30));
    state.recentDays = savedRecentDays;
    els.recentDays.value = String(savedRecentDays);
    els.sgparUrl.value = String(Workspace.preference("sgparUrl", ""));
    const savedRelation = String(Workspace.draft("grdtRelation", "") || "");
    state.relationSavedText = savedRelation;
    state.relationDraft = savedRelation;
    els.relationText.value = savedRelation;
    updateRelationDraft(savedRelation);
    document.addEventListener("grcon:preferences", () => {
      if (document.activeElement !== els.recentDays) {
        const days = Math.max(1, Math.min(365, Number(Workspace.preference("recentDays", 30)) || 30));
        els.recentDays.value = String(days);
        state.recentDays = days;
      }
      if (document.activeElement !== els.sgparUrl) els.sgparUrl.value = String(Workspace.preference("sgparUrl", ""));
    });
  }
  function syncTriageVirtualRowHeight() {
    state.virtual.rowHeight = state.resultDensity === "compact" ? 56 : state.groupByStatus ? 88 : 68;
    return state.virtual.rowHeight;
  }

  window.GrconTriageUiApi = Object.freeze({
    snapshot: () => ({
      filter: state.filter,
      sheetFilter: state.sheetFilter,
      search: state.search,
      columnFilters: { ...(state.columnFilters || {}) },
      groupByStatus: Boolean(state.groupByStatus),
      density: state.resultDensity,
      filtered: filteredResultIndices().length,
      total: state.results.length,
    }),
    getResult: (index) => state.results[Number(index)] || null,
    filteredIndices: () => [...filteredResultIndices()],
    setGroupByStatus: (value) => {
      state.groupByStatus = Boolean(value);
      syncTriageVirtualRowHeight();
      state.filteredCache = { signature: "", indices: [] };
      if (els.resultsScroll) els.resultsScroll.scrollTop = 0;
      renderAll();
      return state.groupByStatus;
    },
    setDensity: (value) => {
      state.resultDensity = value === "compact" ? "compact" : "comfortable";
      syncTriageVirtualRowHeight();
      if (els.resultsScroll) els.resultsScroll.scrollTop = 0;
      renderTable();
      return state.virtual.rowHeight;
    },
    clearFilter: (kind, keyName) => {
      if (kind === "search") { state.search = ""; if (els.search) els.search.value = ""; }
      if (kind === "sheet") { state.sheetFilter = "todos"; if (els.sheetFilter) els.sheetFilter.value = "todos"; }
      if (kind === "summary") state.filter = "todos";
      if (kind === "column" && keyName) { delete state.columnFilters[keyName]; updateColumnFilterTriggerStates(); if (els.clearColumnFilters) els.clearColumnFilters.hidden = activeColumnFilters().length === 0; }
      state.filteredCache = { signature: "", indices: [] };
      renderAll();
    },
    render: renderAll,
  });

  window.GrconRuntimeFiles = Object.freeze({
    currentLd: () => state.ldFiles[0] || null,
    ldName: () => ldDisplayName(),
  });

  window.GrconPerformanceDiagnostics = Object.freeze({
    version: APP_VERSION,
    state: () => ({
      results: state.results.length,
      selected: state.selected.size,
      filtered: filteredResultIndices().length,
      virtual: { ...state.virtual },
      busy: state.busy,
      cancelled: state.cancelled,
      metrics: PerformanceCore ? PerformanceCore.metrics() : {},
      memory: PerformanceCore ? PerformanceCore.memorySnapshot() : null,
      ldIntegrity: state.ldIntegrity ? { ...state.ldIntegrity } : null,
      egrdtBatchLimit: currentEgrdtBatchLimit(),
    }),
    cancel: () => PerformanceCore && PerformanceCore.cancelAll(),
    clearLdCache: () => PerformanceCore && PerformanceCore.clearLdCache(),
  });
  refreshPerformancePanel(PerformanceCore && PerformanceCore.supported
    ? "Processamento otimizado pronto."
    : "Motor de alto desempenho será carregado ao iniciar a análise.");
  renderEgrdtBatchSettings();
  updateInputMeta();
  renderRelationPreview();
  renderSgpar();
  
  // Verifica se há LD anterior para sugerir reload
  if (window.GrconLdMemory && !state.ldFiles.length) {
    const lastLd = window.GrconLdMemory.get();
    if (lastLd) {
      window.GrconLdMemory.showBanner(lastLd, 
        () => {
          showToast(`Use o seletor de arquivo para carregar "${lastLd.name}" novamente.`, "info");
          els.ldInput.focus();
        },
        () => {
          console.info("Usuário optou por não usar a LD anterior.");
        }
      );
    }
  }
})();
