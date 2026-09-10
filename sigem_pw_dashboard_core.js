(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(
    root.GrconUtils || safeRequire("./grcon_utils.js"),
    root.TriagemCore || safeRequire("./core.js")
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwDashboard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Utils, Core) {
  "use strict";

  const DB_NAME = "grcon-posting-conference";
  const DB_STORE = "kv";
  const SIGEM_BASE_KEY = "current-base";
  const PW_BASE_KEY = "projectwise-current-base";
  const PW_BASE_VERSION = 1;
  const UNCLASSIFIED = "Não classificado";
  const EMISSION_FLAGS = Object.freeze({ CURRENT: "SIM", HISTORICAL: "NAO", PLANNED: "PREVISTO" });
  const REQUIRED_PW_FIELDS = Object.freeze(["document", "revision", "documentType", "state", "lastEmission"]);

  const PW_HEADER_ALIASES = Object.freeze({
    document: ["NumeroDocumentoCliente", "NúmeroDocumentoCliente", "Numero Documento Cliente", "Número Documento Cliente"],
    revisionComplete: ["RevisaoCompleta", "RevisãoCompleta", "Revisao Completa", "Revisão Completa"],
    revision: ["Revisao", "Revisão", "Rev"],
    documentType: ["TipoDocumento", "Tipo Documento"],
    documentTypeDesc: ["TipoDocumentoDesc", "Tipo Documento Desc", "Descrição Tipo Documento", "Descricao Tipo Documento"],
    discipline: ["Disciplina"],
    disciplineDesc: ["DisciplinaDesc", "Disciplina Desc", "Descrição Disciplina", "Descricao Disciplina"],
    state: ["o_statename", "o statename", "State", "Estado"],
    lastEmission: ["Última emissão", "Ultima emissao", "Ultima emissão", "Última emissao"],
    fileName: ["o_filename", "o filename", "Arquivo", "Nome Arquivo"],
    category: ["Categoria"],
    sentGrd: ["NumeroGRDEnvioCliente", "Número GRD Envio Cliente", "Numero GRD Envio Cliente"],
    sentDate: ["DataEnvioGRDCliente", "Data Envio GRD Cliente"],
    incomingGrd: ["NumeroGRDEntrada", "Número GRD Entrada", "Numero GRD Entrada"],
    incomingDate: ["DataGRDEntrada", "Data GRD Entrada"],
    createdAt: ["datacriacao", "data criacao", "data criação"],
    stateChangedAt: ["DataAlteracaoState", "Data Alteracao State", "Data Alteração State"],
    emissionSequence: ["SequencialEmissao", "Sequencial Emissao", "Sequencial Emissão"],
  });

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    if (Utils && typeof Utils.norm === "function") return Utils.norm(value);
    if (Core && typeof Core.norm === "function") return Core.norm(value);
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—]/g, "-")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeHeader(value) {
    return norm(value).replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function stripDocumentExtension(value) {
    return text(value).split(/[\\/]/).pop().replace(/\.(?:PDF|DOCX?|XLSX?|XLSM|DWG|DGN|PPTX?|ZIP)$/i, "");
  }

  function canonicalDocumentCode(value) {
    const raw = norm(stripDocumentExtension(value)).replace(/\s*([_.-])\s*/g, "$1");
    if (!raw) return "";
    const match = raw.match(/^([A-Z0-9]{3})[-_]RNEST[-_]([A-Z0-9]+)[-_](\d+(?:\.\d+){3})[-_]([A-Z0-9]+)[-_]([A-Z0-9]+)[-_](.+)$/);
    if (!match) return raw;
    return `${match[1]}_RNEST_${match[2]}_${match[3]}_${match[4]}_${match[5]}_${match[6]}`;
  }

  function documentIdentity(value) {
    const canonical = canonicalDocumentCode(value);
    if (!canonical) return { key: "", canonical: "", info: null, searchKeys: [] };

    const info = Utils && typeof Utils.parseDocumentIdentity === "function"
      ? Utils.parseDocumentIdentity(canonical)
      : null;

    let searchKeys = [];
    if (Core && typeof Core.documentSearchKeys === "function") {
      try { searchKeys = Core.documentSearchKeys(canonical).map(norm).filter(Boolean); } catch (_) { searchKeys = []; }
    }
    let key = searchKeys[0] || "";
    if (!key && canonical.includes("_RNEST_")) {
      const et = canonical.match(/^([A-Z0-9]{3}_RNEST_[A-Z0-9]+_\d+(?:\.\d+){3}_[A-Z0-9]+_[A-Z0-9]+_)(.+)$/);
      if (et) key = `${et[1]}${et[2].replace(/^NT-/, "")}`;
    }
    if (!key && Utils && typeof Utils.documentIdentityKey === "function") {
      try { key = norm(Utils.documentIdentityKey(canonical)); } catch (_) { key = ""; }
    }
    if (!key) key = canonical;

    return { key, canonical, info, searchKeys };
  }

  function isOfficialDocumentType(value) {
    const candidate = norm(value);
    const official = Core && Core.EGRDT_OPTIONS && Array.isArray(Core.EGRDT_OPTIONS.documentTypes)
      ? Core.EGRDT_OPTIONS.documentTypes.map(norm)
      : [];
    return official.length ? official.includes(candidate) : /^[A-Z]{2,4}$/.test(candidate);
  }

  function documentClass(value) {
    const identity = documentIdentity(value);
    const info = identity.info;
    if (info && info.family === "ET") return "ET";
    if (info && info.family === "CV") return "CV";
    if (identity.canonical.includes("_RNEST_")) return "ET";
    if (/^5900(?:\.\d+){3}-[A-Z0-9]{3}-CV-[A-Z0-9]+-\d{3,4}$/i.test(identity.canonical)) return "CV";
    if ((info && info.family === "N-1710") || /-5290\.00-/i.test(identity.canonical)) {
      const prefix = norm(identity.canonical.split("-")[0]);
      return isOfficialDocumentType(prefix) ? prefix : UNCLASSIFIED;
    }
    return UNCLASSIFIED;
  }

  function revisionRank(value) {
    if (Core && typeof Core.revisionRank === "function") {
      const rank = Core.revisionRank(value);
      return Number.isFinite(rank) ? rank : -1;
    }
    const revision = norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "");
    if (revision === "0") return 0;
    if (/^[A-Z]+$/.test(revision)) {
      let rank = 0;
      for (const character of revision) rank = rank * 26 + character.charCodeAt(0) - 64;
      return rank * 1000;
    }
    const field = revision.match(/^([A-Z]+)(\d+)$/);
    return field ? revisionRank(field[1]) + Number(field[2]) : -1;
  }

  function parseDateMs(value) {
    if (!value) return 0;
    if (Core && typeof Core.parseDate === "function") {
      const parsed = Core.parseDate(value);
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0;
    }
    const raw = text(value);
    const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (br) {
      const date = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0), Number(br[6] || 0));
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function compareSourceRows(left, right, kind) {
    const emissionPriority = (record) => kind === "pw"
      ? ({ SIM: 30, NAO: 20, PREVISTO: 10 })[norm(record && record.lastEmission)] || 0
      : 0;
    return emissionPriority(left) - emissionPriority(right)
      || revisionRank(left && (left.revision || left.revisionComplete)) - revisionRank(right && (right.revision || right.revisionComplete))
      || parseDateMs(left && (left.modifiedAt || left.stateChangedAt || left.createdAt || left.includedAt)) - parseDateMs(right && (right.modifiedAt || right.stateChangedAt || right.createdAt || right.includedAt))
      || (Number(left && left.sourceRow) || 0) - (Number(right && right.sourceRow) || 0);
  }

  function countDelimiter(line, delimiter) {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && character === delimiter) count += 1;
    }
    return count;
  }

  function detectDelimiter(source) {
    const line = String(source || "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
    const candidates = [";", ",", "\t"].map((delimiter) => ({ delimiter, count: countDelimiter(line, delimiter) }));
    candidates.sort((a, b) => b.count - a.count);
    return candidates[0].count ? candidates[0].delimiter : ";";
  }

  function forEachDelimitedRow(source, delimiter, callback) {
    const input = String(source || "").replace(/^\uFEFF/, "");
    let row = [];
    let field = "";
    let quoted = false;
    let rowIndex = 0;
    const emitField = () => { row.push(field); field = ""; };
    const emitRow = () => {
      emitField();
      callback(row, rowIndex);
      rowIndex += 1;
      row = [];
    };
    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (quoted) {
        if (character === '"' && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') quoted = false;
        else field += character;
        continue;
      }
      if (character === '"') { quoted = true; continue; }
      if (character === delimiter) { emitField(); continue; }
      if (character === "\n") { emitRow(); continue; }
      if (character === "\r") {
        if (input[index + 1] === "\n") index += 1;
        emitRow();
        continue;
      }
      field += character;
    }
    if (field.length || row.length) emitRow();
  }

  const NORMALIZED_PW_ALIASES = Object.freeze(Object.fromEntries(
    Object.entries(PW_HEADER_ALIASES).map(([field, values]) => [field, new Set(values.map(normalizeHeader))])
  ));

  function findColumn(headers, field) {
    const aliases = NORMALIZED_PW_ALIASES[field] || new Set();
    for (let index = 0; index < headers.length; index += 1) {
      if (aliases.has(normalizeHeader(headers[index]))) return index;
    }
    return -1;
  }

  function mapPwColumns(headers) {
    const columns = {};
    Object.keys(PW_HEADER_ALIASES).forEach((field) => { columns[field] = findColumn(headers, field); });
    if (columns.revisionComplete < 0 && columns.revision >= 0) columns.revisionComplete = columns.revision;
    return columns;
  }

  function rowValue(row, index) {
    return index >= 0 && Array.isArray(row) ? text(row[index]) : "";
  }

  function validatePwColumns(columns, headers) {
    const missing = [];
    REQUIRED_PW_FIELDS.forEach((field) => {
      const index = field === "revision" ? Math.max(columns.revisionComplete, columns.revision) : columns[field];
      if (index < 0) missing.push(field);
    });
    if (!missing.length) return [];
    const labels = {
      document: "NumeroDocumentoCliente",
      revision: "RevisaoCompleta/Revisao",
      documentType: "TipoDocumento",
      state: "o_statename",
      lastEmission: "Última emissão",
    };
    return [`Base ProjectWise inválida. Campo(s) obrigatório(s) não localizado(s): ${missing.map((field) => labels[field]).join(", ")}. Cabeçalhos lidos: ${(headers || []).filter(Boolean).slice(0, 18).join(", ")}${(headers || []).length > 18 ? "…" : ""}`];
  }

  function parsePwCsv(source, fileMeta) {
    const delimiter = detectDelimiter(source);
    let headers = null;
    let columns = null;
    const records = [];
    let sourceRowCount = 0;
    let invalidCount = 0;
    let emptyDocumentCount = 0;
    let unknownEmissionCount = 0;
    let duplicateRevisionCount = 0;
    const revisionSeen = new Set();

    forEachDelimitedRow(source, delimiter, (row, rowIndex) => {
      if (rowIndex === 0) {
        headers = row.map(text);
        columns = mapPwColumns(headers);
        const errors = validatePwColumns(columns, headers);
        if (errors.length) throw new Error(errors.join(" "));
        return;
      }
      if (!row.some((value) => text(value))) return;
      sourceRowCount += 1;
      const document = rowValue(row, columns.document);
      if (!document) {
        invalidCount += 1;
        emptyDocumentCount += 1;
        return;
      }
      const identity = documentIdentity(document);
      if (!identity.key) {
        invalidCount += 1;
        return;
      }
      const revisionComplete = rowValue(row, columns.revisionComplete);
      const revision = rowValue(row, columns.revision) || revisionComplete;
      const lastEmission = rowValue(row, columns.lastEmission);
      const emissionFlag = norm(lastEmission);
      if (emissionFlag && !Object.values(EMISSION_FLAGS).includes(emissionFlag)) unknownEmissionCount += 1;
      const duplicateKey = `${identity.key}::${norm(revisionComplete || revision)}`;
      if (revisionSeen.has(duplicateKey)) duplicateRevisionCount += 1;
      else revisionSeen.add(duplicateKey);

      records.push({
        document,
        documentKey: identity.key,
        canonicalDocument: identity.canonical,
        documentClass: documentClass(document),
        revisionComplete,
        revision,
        documentType: rowValue(row, columns.documentType),
        documentTypeDesc: rowValue(row, columns.documentTypeDesc),
        discipline: rowValue(row, columns.discipline),
        disciplineDesc: rowValue(row, columns.disciplineDesc),
        state: rowValue(row, columns.state),
        lastEmission,
        emissionFlag,
        emittedEvidence: emissionFlag === EMISSION_FLAGS.CURRENT || emissionFlag === EMISSION_FLAGS.HISTORICAL,
        fileName: rowValue(row, columns.fileName),
        category: rowValue(row, columns.category),
        sentGrd: rowValue(row, columns.sentGrd),
        sentDate: rowValue(row, columns.sentDate),
        incomingGrd: rowValue(row, columns.incomingGrd),
        incomingDate: rowValue(row, columns.incomingDate),
        createdAt: rowValue(row, columns.createdAt),
        stateChangedAt: rowValue(row, columns.stateChangedAt),
        emissionSequence: rowValue(row, columns.emissionSequence),
        sourceRow: rowIndex + 1,
      });
    });

    if (!headers) throw new Error("Base ProjectWise vazia ou sem cabeçalho legível.");
    const uniqueDocuments = new Set(records.map((record) => record.documentKey));
    const emittedDocuments = new Set(records.filter((record) => record.emittedEvidence).map((record) => record.documentKey));
    if (emittedDocuments.size > uniqueDocuments.size) throw new Error("Inconsistência PW: documentos emitidos excedem documentos cadastrados.");

    return {
      ok: true,
      records,
      meta: {
        version: PW_BASE_VERSION,
        fileName: text(fileMeta && fileMeta.fileName),
        fileSize: Number(fileMeta && fileMeta.fileSize) || 0,
        lastModified: Number(fileMeta && fileMeta.lastModified) || 0,
        importedAt: text(fileMeta && fileMeta.importedAt) || new Date().toISOString(),
        delimiter,
        headerCount: headers.length,
        sourceRowCount,
        recordCount: records.length,
        uniqueDocumentCount: uniqueDocuments.size,
        emittedDocumentCount: emittedDocuments.size,
        invalidCount,
        emptyDocumentCount,
        unknownEmissionCount,
        duplicateRevisionCount,
        columns: Object.fromEntries(Object.entries(columns).filter(([, index]) => index >= 0).map(([field, index]) => [field, headers[index]])),
      },
      errors: [],
    };
  }

  function normalizeSigemRecords(records) {
    return (records || []).map((record) => {
      const identity = documentIdentity(record && record.document);
      return {
        ...record,
        documentKey: identity.key,
        canonicalDocument: identity.canonical,
        documentClass: documentClass(record && record.document),
      };
    }).filter((record) => record.documentKey);
  }

  function buildDocumentMap(records, kind) {
    const map = new Map();
    (records || []).forEach((record) => {
      const key = record.documentKey || documentIdentity(record.document).key;
      if (!key) return;
      let document = map.get(key);
      if (!document) {
        document = {
          key,
          document: text(record.document),
          documentClass: record.documentClass || documentClass(record.document),
          rows: [],
          revisions: new Set(),
          statuses: new Set(),
          disciplines: new Set(),
          emitted: false,
          current: null,
        };
        map.set(key, document);
      }
      document.rows.push(record);
      const revision = text(record.revision || record.revisionComplete);
      if (revision) document.revisions.add(revision);
      const status = kind === "pw" ? text(record.state) : text(record.status);
      if (status) document.statuses.add(status);
      if (text(record.discipline)) document.disciplines.add(text(record.discipline));
      if (kind === "pw" && record.emittedEvidence) document.emitted = true;
      if (!document.current || compareSourceRows(record, document.current, kind) > 0) document.current = record;
    });
    return map;
  }

  function currentStatus(document, kind) {
    return kind === "pw" ? text(document && document.current && document.current.state) : text(document && document.current && document.current.status);
  }

  function currentDiscipline(document) {
    return text(document && document.current && (document.current.disciplineDesc || document.current.discipline));
  }

  function documentPasses(document, kind, filters) {
    const f = filters || {};
    if (f.documentClass && document.documentClass !== f.documentClass) return false;
    if (kind === "sigem" && f.sigemStatus && norm(currentStatus(document, kind)) !== norm(f.sigemStatus)) return false;
    if (kind === "pw") {
      if (f.pwStatus && norm(currentStatus(document, kind)) !== norm(f.pwStatus)) return false;
      if (f.discipline && norm(currentDiscipline(document)) !== norm(f.discipline)) return false;
      if (f.emission === "emitted" && !document.emitted) return false;
      if (f.emission === "not-emitted" && document.emitted) return false;
    }
    return true;
  }

  function filterMap(map, kind, filters) {
    return new Map([...map].filter(([, document]) => documentPasses(document, kind, filters)));
  }

  function setDifference(left, right) {
    const output = new Set();
    left.forEach((value) => { if (!right.has(value)) output.add(value); });
    return output;
  }

  function setIntersection(left, right) {
    const output = new Set();
    left.forEach((value) => { if (right.has(value)) output.add(value); });
    return output;
  }

  function distribution(map, selector) {
    const counts = new Map();
    map.forEach((document) => {
      const label = text(selector(document)) || "Sem informação";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "pt-BR"));
  }

  function summarizeClasses(sigemMap, pwMap) {
    const sigemSets = new Map();
    const pwSets = new Map();
    const emittedSets = new Map();
    const ensure = (map, key) => { if (!map.has(key)) map.set(key, new Set()); return map.get(key); };
    sigemMap.forEach((document, key) => ensure(sigemSets, document.documentClass || UNCLASSIFIED).add(key));
    pwMap.forEach((document, key) => {
      ensure(pwSets, document.documentClass || UNCLASSIFIED).add(key);
      if (document.emitted) ensure(emittedSets, document.documentClass || UNCLASSIFIED).add(key);
    });
    const classes = new Set([...sigemSets.keys(), ...pwSets.keys()]);
    return [...classes].map((documentClassName) => {
      const sigem = sigemSets.get(documentClassName) || new Set();
      const pw = pwSets.get(documentClassName) || new Set();
      const emitted = emittedSets.get(documentClassName) || new Set();
      return {
        documentClass: documentClassName,
        sigem: sigem.size,
        pwRegistered: pw.size,
        pwEmitted: emitted.size,
        gapSigemToPw: setDifference(sigem, pw).size,
        gapPwToEmitted: setDifference(pw, emitted).size,
        pwExclusive: setDifference(pw, sigem).size,
        matched: setIntersection(sigem, pw).size,
      };
    }).sort((left, right) => {
      if (left.documentClass === UNCLASSIFIED) return 1;
      if (right.documentClass === UNCLASSIFIED) return -1;
      return left.documentClass.localeCompare(right.documentClass, "pt-BR", { numeric: true });
    });
  }

  function createModel(sigemRecords, pwRecords) {
    const normalizedSigem = normalizeSigemRecords(sigemRecords || []);
    const normalizedPw = (pwRecords || []).map((record) => {
      const identity = documentIdentity(record && record.document);
      const emissionFlag = norm(record && record.lastEmission);
      return {
        ...record,
        documentKey: identity.key,
        canonicalDocument: identity.canonical,
        documentClass: documentClass(record && record.document),
        emissionFlag,
        emittedEvidence: [EMISSION_FLAGS.CURRENT, EMISSION_FLAGS.HISTORICAL].includes(emissionFlag),
      };
    }).filter((record) => record.documentKey);
    return {
      normalizedSigem,
      normalizedPw,
      sigemAll: buildDocumentMap(normalizedSigem, "sigem"),
      pwAll: buildDocumentMap(normalizedPw, "pw"),
    };
  }

  function aggregateModel(model, filters) {
    const source = model || { normalizedSigem: [], normalizedPw: [], sigemAll: new Map(), pwAll: new Map() };
    const sigemAll = source.sigemAll || new Map();
    const pwAll = source.pwAll || new Map();
    const sigem = filterMap(sigemAll, "sigem", filters);
    const pw = filterMap(pwAll, "pw", filters);
    const sigemKeys = new Set(sigem.keys());
    const pwKeys = new Set(pw.keys());
    const emittedKeys = new Set([...pw].filter(([, document]) => document.emitted).map(([key]) => key));
    if (emittedKeys.size > pwKeys.size) throw new Error("Inconsistência matemática: PW emitido maior que PW cadastrado.");

    const gapSigemToPw = setDifference(sigemKeys, pwKeys);
    const gapPwToEmitted = setDifference(pwKeys, emittedKeys);
    const pwExclusive = setDifference(pwKeys, sigemKeys);
    const matched = setIntersection(sigemKeys, pwKeys);

    const classRows = summarizeClasses(sigem, pw);
    const allClassRows = summarizeClasses(sigemAll, pwAll);
    const unclassified = {
      sigem: [...sigem.values()].filter((document) => document.documentClass === UNCLASSIFIED).length,
      pw: [...pw.values()].filter((document) => document.documentClass === UNCLASSIFIED).length,
    };

    return {
      summary: {
        sigem: sigemKeys.size,
        pwRegistered: pwKeys.size,
        pwEmitted: emittedKeys.size,
        gapSigemToPw: gapSigemToPw.size,
        gapPwToEmitted: gapPwToEmitted.size,
        pwExclusive: pwExclusive.size,
        matched: matched.size,
      },
      classes: classRows,
      sigemStatus: distribution(sigem, (document) => currentStatus(document, "sigem")),
      pwStatus: distribution(pw, (document) => currentStatus(document, "pw")),
      disciplines: distribution(pw, currentDiscipline),
      filterOptions: {
        classes: allClassRows.map((row) => row.documentClass),
        sigemStatuses: distribution(sigemAll, (document) => currentStatus(document, "sigem")).map((item) => item.label),
        pwStatuses: distribution(pwAll, (document) => currentStatus(document, "pw")).map((item) => item.label),
        disciplines: distribution(pwAll, currentDiscipline).map((item) => item.label),
      },
      quality: {
        sigemRawRecords: (source.normalizedSigem || []).length,
        pwRawRecords: (source.normalizedPw || []).length,
        sigemUniqueDocuments: sigemAll.size,
        pwUniqueDocuments: pwAll.size,
        pwEmittedDocuments: [...pwAll.values()].filter((document) => document.emitted).length,
        unclassified,
      },
      sets: { sigemKeys, pwKeys, emittedKeys, gapSigemToPw, gapPwToEmitted, pwExclusive, matched },
      documents: { sigem, pw, sigemAll, pwAll },
    };
  }

  function aggregate(sigemRecords, pwRecords, filters) {
    return aggregateModel(createModel(sigemRecords, pwRecords), filters);
  }

  function openDb() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponível neste navegador."));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha ao abrir a base local SIGEM × PW."));
    });
  }

  async function kvGet(key, fallback) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result === undefined ? fallback : request.result);
        request.onerror = () => reject(request.error || new Error("Falha ao ler a base local."));
      });
    } finally { db.close(); }
  }

  async function kvSet(key, value) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("Falha ao salvar a base local."));
        tx.onabort = () => reject(tx.error || new Error("A gravação da base local foi cancelada."));
      });
      return value;
    } finally { db.close(); }
  }

  async function loadSigemBase() {
    return kvGet(SIGEM_BASE_KEY, { meta: null, records: [] });
  }

  async function loadPwBase() {
    return kvGet(PW_BASE_KEY, { meta: null, records: [] });
  }

  async function savePwBase(base) {
    if (!base || !base.meta || !Array.isArray(base.records)) throw new Error("Base PW inválida para persistência.");
    return kvSet(PW_BASE_KEY, base);
  }

  async function loadBases() {
    const [sigem, pw] = await Promise.all([loadSigemBase(), loadPwBase()]);
    return { sigem, pw };
  }

  const EMISSION_RULE = "Um documento PW é considerado emitido quando qualquer revisão possui ‘Última emissão’ = Sim ou Não. ‘Sim’ identifica a emissão vigente; ‘Não’ identifica uma emissão histórica/superada. ‘Previsto’ não é emissão. A regra é agregada por documento, portanto revisões não inflam o KPI.";

  return Object.freeze({
    DB_NAME, DB_STORE, SIGEM_BASE_KEY, PW_BASE_KEY, PW_BASE_VERSION, UNCLASSIFIED,
    EMISSION_FLAGS, EMISSION_RULE, PW_HEADER_ALIASES, REQUIRED_PW_FIELDS,
    text, norm, normalizeHeader, canonicalDocumentCode, documentIdentity, documentClass,
    revisionRank, parseDateMs, detectDelimiter, forEachDelimitedRow, mapPwColumns, validatePwColumns,
    parsePwCsv, normalizeSigemRecords, buildDocumentMap, createModel, aggregateModel, aggregate,
    openDb, kvGet, kvSet, loadSigemBase, loadPwBase, savePwBase, loadBases,
  });
});