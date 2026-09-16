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
  const LEGACY_SIGEM_BASE_KEY = "current-base";
  const LEGACY_PW_BASE_KEY = "projectwise-current-base";
  const SIGEM_BASE_KEY = "sigem-pw-current-sigem-v3";
  const PW_BASE_KEY = "sigem-pw-current-pw-v3";
  const LD_BASE_KEY = "sigem-pw-current-quality-ld-v1";
  const HISTORY_KEY = "sigem-pw-base-history-v3";
  const PW_BASE_VERSION = 4;
  const HISTORY_VERSION = 3;
  const PW_SCOPE_VERSION = 4;
  const UNCLASSIFIED = "Não classificado";
  const SCOPE_CLASSES = Object.freeze(["ET", "N-1710"]);
  const N1710_CODE_RE = /^(?:[IAFLED]-)?[A-Z0-9]{2,3}-5290\.00-22313-[A-Z0-9]{3}-C1O-\d{3,4}$/i;
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

  /**
   * Harmoniza somente a representação dos seis separadores estruturais dos
   * códigos RNEST. A base SIGEM usa, em grande parte, C1O_RNEST_... enquanto a
   * exportação PW usa C1O-RNEST-.... O TAG/identificador (7º grupo) permanece
   * intacto. Depois dessa harmonização, toda identidade passa pelas regras
   * centrais do GRCON (documentSearchKeys / documentIdentityKey).
   */
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

    // Para ET, o primeiro searchKey do motor central é a chave sem o prefixo
    // nt-; assim, as duas grafias continuam sendo o MESMO documento, preservando
    // EAP, tipo e TAG. Para N-1710 o motor devolve a própria chave canônica.
    let searchKeys = [];
    if (Core && typeof Core.documentSearchKeys === "function") {
      try { searchKeys = Core.documentSearchKeys(canonical).map(norm).filter(Boolean); } catch (_) { searchKeys = []; }
    }
    let key = searchKeys[0] || "";
    if (!key && canonical.includes("_RNEST_")) {
      // Fallback equivalente ao ntNeutralKey central para testes/execuções em
      // que o TriagemCore ainda não foi carregado. Atua somente no 7º grupo.
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

  /** Classe do dashboard. O universo desta fase é somente ET e N-1710. */
  function documentClass(value) {
    const identity = documentIdentity(value);
    if (/^C1O_RNEST_[A-Z0-9]+_\d+(?:\.\d+){3}_[A-Z0-9]+_[A-Z0-9]+_.+$/i.test(identity.canonical)) return "ET";
    if (N1710_CODE_RE.test(identity.canonical)) return "N-1710";
    return UNCLASSIFIED;
  }

  function revisionKey(value) {
    return norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "") || "__SEM_REVISAO__";
  }

  function revisionLabel(value) {
    const key = revisionKey(value);
    return key === "__SEM_REVISAO__" ? "Sem revisão" : text(value) || key;
  }

  function entryKey(documentKey, revision) {
    return `${documentKey}::${revisionKey(revision)}`;
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

  /** RFC-4180 suficiente para a exportação PW, processando linha a linha. */
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
    // A revisão completa é preferencial para rastreabilidade; Revisao continua
    // separada para ordenação quando disponível.
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

  function parseLdMatrix(matrix, fileMeta) {
    const rows = Array.isArray(matrix) ? matrix : [];
    let headerRow = -1;
    let documentColumn = -1;
    let revisionColumn = -1;
    let titleColumn = -1;
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 80); rowIndex += 1) {
      const headers = (rows[rowIndex] || []).map(normalizeHeader);
      const documentIndex = headers.indexOf("DOCUMENTO");
      if (documentIndex < 0) continue;
      headerRow = rowIndex;
      documentColumn = documentIndex;
      revisionColumn = headers.indexOf("REVISAO");
      titleColumn = headers.indexOf("TITULO");
      break;
    }
    if (headerRow < 0) throw new Error("LD da Qualidade inválida: cabeçalho DOCUMENTO não localizado na aba N-1710.");

    const records = [];
    const seen = new Set();
    for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const document = rowValue(row, documentColumn);
      const identity = documentIdentity(document);
      if (!identity.key || documentClass(document) !== "N-1710" || seen.has(identity.key)) continue;
      seen.add(identity.key);
      records.push({
        document,
        documentKey: identity.key,
        canonicalDocument: identity.canonical,
        revision: rowValue(row, revisionColumn),
        title: rowValue(row, titleColumn),
        documentClass: "N-1710",
        sourceRow: rowIndex + 1,
      });
    }
    if (!records.length) throw new Error("LD da Qualidade inválida: nenhum documento N-1710 válido foi localizado.");
    return {
      ok: true,
      records,
      meta: {
        version: 1,
        fileName: text(fileMeta && fileMeta.fileName),
        fileSize: Number(fileMeta && fileMeta.fileSize) || 0,
        lastModified: Number(fileMeta && fileMeta.lastModified) || 0,
        importedAt: text(fileMeta && fileMeta.importedAt) || new Date().toISOString(),
        sheetName: text(fileMeta && fileMeta.sheetName) || "N-1710",
        headerRow: headerRow + 1,
        recordCount: records.length,
        uniqueDocumentCount: records.length,
      },
      errors: [],
    };
  }

  function buildLdUniverse(records) {
    return new Map((records || []).map((record) => {
      const identity = documentIdentity(record && record.document);
      return [identity.key, { ...record, documentKey: identity.key, canonicalDocument: identity.canonical }];
    }).filter(([key]) => key));
  }

  function scopeClassFor(document, ldUniverse, enforceLd) {
    const identity = documentIdentity(document);
    const candidateClass = documentClass(identity.canonical);
    if (candidateClass === "ET") return "ET";
    if (!enforceLd && identity.canonical.includes("_RNEST_")) return "ET";
    if (candidateClass === "N-1710" && (!enforceLd || (ldUniverse && ldUniverse.has(identity.key)))) return "N-1710";
    return "";
  }

  function normalizeRecords(records, kind, ldUniverse, enforceLd) {
    return (records || []).map((record) => {
      const identity = documentIdentity(record && record.document);
      const rawRevision = record && (record.revisionComplete || record.revision);
      const scopedClass = scopeClassFor(record && record.document, ldUniverse, enforceLd);
      const emissionFlag = kind === "pw" ? norm(record && record.lastEmission) : "";
      return {
        ...record,
        documentKey: identity.key,
        canonicalDocument: identity.canonical,
        documentClass: scopedClass,
        revisionKey: revisionKey(rawRevision),
        revisionLabel: revisionLabel(rawRevision),
        entryKey: entryKey(identity.key, rawRevision),
        emissionFlag,
        emittedEvidence: kind === "pw" && [EMISSION_FLAGS.CURRENT, EMISSION_FLAGS.HISTORICAL].includes(emissionFlag),
      };
    }).filter((record) => record.documentKey && record.documentClass);
  }

  function normalizeSigemRecords(records, ldUniverse) {
    return normalizeRecords(records, "sigem", ldUniverse || new Map(), arguments.length >= 2);
  }

  function sanitizePwRecords(records, ldRecords) {
    const sourceRecords = Array.isArray(records) ? records : [];
    const ldUniverse = buildLdUniverse(ldRecords || []);
    const accepted = normalizeRecords(sourceRecords, "pw", ldUniverse, true);
    return {
      records: accepted,
      acceptedCount: accepted.length,
      excludedCount: Math.max(0, sourceRecords.length - accepted.length),
      ldUniverse,
    };
  }

  function sanitizePwBase(base, ldBaseOrRecords) {
    if (!base || !base.meta || !Array.isArray(base.records)) throw new Error("Base PW inválida para saneamento.");
    const { scopeDiscardedRecords: _discardedRecords, scopeExcludedReasons: _excludedReasons, scopeExcludedExamples: _excludedExamples, ...previousMeta } = base.meta;
    const sourceRecords = Array.isArray(base.sourceRecords) ? base.sourceRecords : base.records;
    const ldRecords = Array.isArray(ldBaseOrRecords) ? ldBaseOrRecords : (ldBaseOrRecords && ldBaseOrRecords.records) || [];
    const ldMeta = !Array.isArray(ldBaseOrRecords) && ldBaseOrRecords && ldBaseOrRecords.meta;
    const audit = sanitizePwRecords(sourceRecords, ldRecords);
    const entries = buildEntryMap(audit.records, "pw");
    const documents = new Set(audit.records.map((record) => record.documentKey).filter(Boolean));
    const emittedDocuments = new Set(audit.records.filter((record) => record.emittedEvidence).map((record) => record.documentKey).filter(Boolean));
    const classCounts = audit.records.reduce((counts, record) => {
      counts[record.documentClass] = (counts[record.documentClass] || 0) + 1;
      return counts;
    }, { ET: 0, "N-1710": 0 });
    return {
      meta: {
        ...previousMeta,
        version: Math.max(Number(previousMeta.version) || 0, PW_BASE_VERSION),
        scopeVersion: PW_SCOPE_VERSION,
        scopeRule: "ET estrutural ou N-1710 estrutural presente na LD da Qualidade",
        scopeLdSnapshotId: text(ldMeta && ldMeta.snapshotId) || (ldMeta ? snapshotId("ld", ldMeta) : ""),
        sourceRecordCount: Number(previousMeta.sourceRecordCount) || sourceRecords.length,
        recordCount: audit.records.length,
        validRevisionRecordCount: entries.size,
        uniqueDocumentCount: documents.size,
        emittedDocumentCount: emittedDocuments.size,
        duplicateRevisionCount: Math.max(0, audit.records.length - entries.size),
        scopeAcceptedRecordCount: audit.acceptedCount,
        scopeExcludedCount: audit.excludedCount,
        scopeClassCounts: classCounts,
      },
      records: audit.records,
      sourceRecords,
    };
  }

  function buildEntryMap(records, kind) {
    const map = new Map();
    (records || []).forEach((record) => {
      const key = record.entryKey || entryKey(record.documentKey || documentIdentity(record.document).key, record.revisionComplete || record.revision);
      if (!key) return;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          documentKey: record.documentKey || documentIdentity(record.document).key,
          document: text(record.document),
          canonicalDocument: text(record.canonicalDocument) || canonicalDocumentCode(record.document),
          documentClass: record.documentClass,
          revisionKey: record.revisionKey || revisionKey(record.revisionComplete || record.revision),
          revision: record.revisionLabel || revisionLabel(record.revisionComplete || record.revision),
          rows: [],
          statuses: new Set(),
          disciplines: new Set(),
          emitted: false,
          current: null,
        };
        map.set(key, entry);
      }
      entry.rows.push(record);
      const status = kind === "pw" ? text(record.state) : text(record.status);
      if (status) entry.statuses.add(status);
      if (text(record.discipline)) entry.disciplines.add(text(record.discipline));
      if (kind === "pw" && record.emittedEvidence) entry.emitted = true;
      if (!entry.current || compareSourceRows(record, entry.current, kind) > 0) entry.current = record;
    });
    return map;
  }

  /* Mantido para compatibilidade com integrações antigas. */
  function buildDocumentMap(records, kind) {
    return buildEntryMap((records || []).map((record) => ({
      ...record,
      entryKey: record.documentKey || documentIdentity(record.document).key,
      revisionKey: "__DOCUMENTO__",
      revisionLabel: "",
    })), kind);
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

  function createModel(sigemRecords, pwRecords, ldRecords) {
    // Chamadas novas sempre informam a LD (mesmo vazia) e, portanto, exigem
    // pertencimento para N-1710. O modo de dois argumentos permanece somente
    // como ponte para relatórios legados já carregados pelo GRCON.
    const enforceLd = arguments.length >= 3;
    const ldUniverse = buildLdUniverse(ldRecords || []);
    const normalizedSigem = normalizeRecords(sigemRecords || [], "sigem", ldUniverse, enforceLd);
    const normalizedPw = normalizeRecords(pwRecords || [], "pw", ldUniverse, enforceLd);
    const sigemEntries = buildEntryMap(normalizedSigem, "sigem");
    const pwEntries = buildEntryMap(normalizedPw, "pw");
    return {
      ldUniverse,
      normalizedSigem,
      normalizedPw,
      // O Dashboard novo usa as entradas por código + revisão. Os mapas
      // documentais permanecem expostos para relatórios legados da mesma PR.
      sigemEntries,
      pwEntries,
      sigemAll: buildDocumentMap(normalizedSigem, "sigem"),
      pwAll: buildDocumentMap(normalizedPw, "pw"),
    };
  }

  function comparisonRow(key, sigemEntry, pwEntry) {
    const reference = sigemEntry || pwEntry;
    const sigemStatus = currentStatus(sigemEntry, "sigem");
    const pwStatus = currentStatus(pwEntry, "pw");
    const pwEmission = pwEntry ? (pwEntry.emitted ? "Emitido" : "Não emitido") : "Não cadastrado";
    let situation = "Alinhado e emitido";
    if (sigemEntry && !pwEntry) situation = "Cadastrar no PW";
    else if (pwEntry && !sigemEntry && !pwEntry.emitted) situation = "Somente no PW, não emitido";
    else if (pwEntry && !sigemEntry) situation = "Somente no PW, emitido";
    else if (pwEntry && !pwEntry.emitted) situation = "Cadastrado no PW, não emitido";
    return {
      key,
      documentKey: reference.documentKey,
      document: reference.canonicalDocument || reference.document,
      revision: reference.revision,
      documentClass: reference.documentClass,
      sigemStatus,
      pwStatus,
      pwEmission,
      situation,
      inSigem: Boolean(sigemEntry),
      inPw: Boolean(pwEntry),
      pwEmitted: Boolean(pwEntry && pwEntry.emitted),
    };
  }

  function buildComparisonLists(sigem, pw) {
    const keys = new Set([...sigem.keys(), ...pw.keys()]);
    const all = [...keys].map((key) => comparisonRow(key, sigem.get(key), pw.get(key)))
      .sort((left, right) => left.documentClass.localeCompare(right.documentClass, "pt-BR")
        || left.document.localeCompare(right.document, "pt-BR", { numeric: true })
        || revisionRank(left.revision) - revisionRank(right.revision));
    const sigemRows = all.filter((row) => row.inSigem);
    const pwRows = all.filter((row) => row.inPw);
    const toRegisterPw = all.filter((row) => row.inSigem && !row.inPw);
    const pwNotEmitted = all.filter((row) => row.inPw && !row.pwEmitted);
    const pwExclusive = all.filter((row) => row.inPw && !row.inSigem);
    const aligned = all.filter((row) => row.inSigem && row.inPw && row.pwEmitted);
    const differences = all.filter((row) => (row.inSigem && !row.inPw) || (row.inPw && !row.inSigem) || (row.inPw && !row.pwEmitted));
    return { all, sigem: sigemRows, pw: pwRows, toRegisterPw, pwNotEmitted, pwExclusive, aligned, differences };
  }

  function aggregateModel(model, filters) {
    const source = model || { normalizedSigem: [], normalizedPw: [], sigemAll: new Map(), pwAll: new Map() };
    const sigemAll = source.sigemEntries || source.sigemAll || new Map();
    const pwAll = source.pwEntries || source.pwAll || new Map();
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
    const lists = buildComparisonLists(sigem, pw);

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
        classes: SCOPE_CLASSES.filter((name) => allClassRows.some((row) => row.documentClass === name)),
        sigemStatuses: distribution(sigemAll, (document) => currentStatus(document, "sigem")).map((item) => item.label),
        pwStatuses: distribution(pwAll, (document) => currentStatus(document, "pw")).map((item) => item.label),
        disciplines: distribution(pwAll, currentDiscipline).map((item) => item.label),
      },
      quality: {
        sigemRawRecords: (source.normalizedSigem || []).length,
        pwRawRecords: (source.normalizedPw || []).length,
        sigemEntries: sigemAll.size,
        pwEntries: pwAll.size,
        pwEmittedEntries: [...pwAll.values()].filter((entry) => entry.emitted).length,
        ldDocumentCount: source.ldUniverse ? source.ldUniverse.size : 0,
      },
      sets: { sigemKeys, pwKeys, emittedKeys, gapSigemToPw, gapPwToEmitted, pwExclusive, matched },
      documents: { sigem, pw, sigemAll, pwAll },
      lists,
    };
  }

  function aggregate(sigemRecords, pwRecords, ldRecordsOrFilters, filters) {
    const hasLdRecords = Array.isArray(ldRecordsOrFilters);
    const ldRecords = hasLdRecords ? ldRecordsOrFilters : [];
    const activeFilters = hasLdRecords ? filters : ldRecordsOrFilters;
    return aggregateModel(createModel(sigemRecords, pwRecords, ldRecords), activeFilters);
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

  function storedValue(record, fallback) {
    if (record === undefined) return fallback;
    if (record && typeof record === "object"
      && Object.prototype.hasOwnProperty.call(record, "key")
      && Object.prototype.hasOwnProperty.call(record, "value")) return record.value;
    return record;
  }

  function putKv(store, key, value) {
    if (store.keyPath) store.put({ key, value });
    else store.put(value, key);
  }

  async function kvGet(key, fallback) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(storedValue(request.result, fallback));
        request.onerror = () => reject(request.error || new Error("Falha ao ler a base local."));
      });
    } finally { db.close(); }
  }

  async function kvSet(key, value) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        putKv(tx.objectStore(DB_STORE), key, value);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("Falha ao salvar a base local."));
        tx.onabort = () => reject(tx.error || new Error("A gravação da base local foi cancelada."));
      });
      return value;
    } finally { db.close(); }
  }

  async function kvSetMany(entries) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        const store = tx.objectStore(DB_STORE);
        (entries || []).forEach(([key, value]) => putKv(store, key, value));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("Falha ao salvar as bases do Dashboard."));
        tx.onabort = () => reject(tx.error || new Error("A gravação das bases foi cancelada."));
      });
      return true;
    } finally { db.close(); }
  }

  function baseKey(kind) {
    const keys = { sigem: SIGEM_BASE_KEY, pw: PW_BASE_KEY, ld: LD_BASE_KEY };
    if (!keys[kind]) throw new Error("Tipo de base desconhecido.");
    return keys[kind];
  }

  function hashText(value) {
    let hash = 2166136261;
    const source = String(value || "");
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function snapshotId(kind, meta) {
    const source = [kind, meta && meta.fileName, meta && meta.importedAt, meta && meta.lastModified, meta && meta.fileSize].join("|");
    return `${kind}-${hashText(source)}`;
  }

  function normalizeBase(kind, base) {
    if (!base || !base.meta || !Array.isArray(base.records)) throw new Error("Base inválida para persistência.");
    const id = text(base.meta.snapshotId) || snapshotId(kind, base.meta);
    const normalized = {
      meta: { ...base.meta, kind, snapshotId: id, historyVersion: HISTORY_VERSION },
      records: base.records,
    };
    if (Array.isArray(base.sourceRecords)) normalized.sourceRecords = base.sourceRecords;
    return normalized;
  }

  function historySnapshot(base) {
    return { meta: { ...base.meta }, records: base.records };
  }

  async function loadHistory() {
    const stored = await kvGet(HISTORY_KEY, { version: HISTORY_VERSION, snapshots: [], deletedIds: [] });
    const snapshots = Array.isArray(stored && stored.snapshots) ? stored.snapshots.filter((item) => item && item.meta && Array.isArray(item.records)) : [];
    const deletedIds = Array.isArray(stored && stored.deletedIds) ? [...new Set(stored.deletedIds.map(text).filter(Boolean))] : [];
    return { version: HISTORY_VERSION, snapshots, deletedIds };
  }

  async function saveBase(kind, base) {
    const normalized = normalizeBase(kind, base);
    const snapshot = historySnapshot(normalized);
    const history = await loadHistory();
    const snapshots = history.snapshots.filter((item) => item.meta.snapshotId !== normalized.meta.snapshotId);
    const deletedIds = history.deletedIds.filter((id) => id !== normalized.meta.snapshotId);
    snapshots.push(snapshot);
    snapshots.sort((left, right) => parseDateMs(right.meta.importedAt) - parseDateMs(left.meta.importedAt));
    await kvSetMany([
      [baseKey(kind), normalized],
      [HISTORY_KEY, { version: HISTORY_VERSION, snapshots, deletedIds }],
    ]);
    return normalized;
  }

  async function updateSnapshotDate(kind, snapshotIdValue, importedAtValue) {
    if (!["sigem", "pw"].includes(kind)) throw new Error("Somente bases SIGEM e PW permitem editar a data.");
    const snapshotIdValueText = text(snapshotIdValue);
    const parsed = new Date(importedAtValue);
    if (!snapshotIdValueText || Number.isNaN(parsed.getTime())) throw new Error("Informe uma data válida para a base.");
    const importedAt = parsed.toISOString();
    const history = await loadHistory();
    const index = history.snapshots.findIndex((item) => item.meta.snapshotId === snapshotIdValueText && item.meta.kind === kind);
    if (index < 0) throw new Error("A base selecionada não existe mais no histórico.");
    const original = history.snapshots[index];
    const editedAt = new Date().toISOString();
    const updated = {
      ...original,
      meta: {
        ...original.meta,
        sourceImportedAt: text(original.meta.sourceImportedAt) || text(original.meta.importedAt),
        importedAt,
        dateEditedAt: editedAt,
      },
    };
    const snapshots = history.snapshots.slice();
    snapshots[index] = updated;
    snapshots.sort((left, right) => parseDateMs(right.meta.importedAt) - parseDateMs(left.meta.importedAt));
    const current = await kvGet(baseKey(kind), { meta: null, records: [] });
    const writes = [[HISTORY_KEY, { version: HISTORY_VERSION, snapshots, deletedIds: history.deletedIds }]];
    let currentBase = current;
    if (current?.meta?.snapshotId === snapshotIdValueText) {
      currentBase = { ...current, meta: { ...current.meta, ...updated.meta } };
      writes.push([baseKey(kind), currentBase]);
    }
    await kvSetMany(writes);
    return { snapshot: updated, current: currentBase, importedAt };
  }

  async function deleteSnapshot(id) {
    const history = await loadHistory();
    const removed = history.snapshots.find((item) => item.meta.snapshotId === id);
    if (!removed) throw new Error("A base selecionada não existe mais no histórico.");
    const snapshots = history.snapshots.filter((item) => item.meta.snapshotId !== id);
    const deletedIds = [...new Set([...history.deletedIds, id])];
    const kind = removed.meta.kind;
    const current = await kvGet(baseKey(kind), { meta: null, records: [] });
    const currentId = current && current.meta && current.meta.snapshotId;
    const writes = [[HISTORY_KEY, { version: HISTORY_VERSION, snapshots, deletedIds }]];
    if (currentId === id) {
      const replacement = snapshots.filter((item) => item.meta.kind === kind)
        .sort((left, right) => parseDateMs(right.meta.importedAt) - parseDateMs(left.meta.importedAt))[0]
        || { meta: null, records: [] };
      writes.push([baseKey(kind), replacement]);
    }
    await kvSetMany(writes);
    return { removed, snapshots };
  }

  async function migrateLegacyBases() {
    const [sigemCurrent, pwCurrent, ldCurrent, legacySigem, legacyPw, history] = await Promise.all([
      kvGet(SIGEM_BASE_KEY, null), kvGet(PW_BASE_KEY, null), kvGet(LD_BASE_KEY, null),
      kvGet(LEGACY_SIGEM_BASE_KEY, null), kvGet(LEGACY_PW_BASE_KEY, null), loadHistory(),
    ]);
    const newest = (primary, legacy) => {
      if (!primary || !primary.meta) return legacy;
      if (!legacy || !legacy.meta) return primary;
      const primaryTime = parseDateMs(primary.meta.importedAt) || Number(primary.meta.lastModified) || 0;
      const legacyTime = parseDateMs(legacy.meta.importedAt) || Number(legacy.meta.lastModified) || 0;
      return legacyTime > primaryTime ? legacy : primary;
    };
    const selectedSigem = newest(sigemCurrent, legacySigem);
    const selectedPw = newest(pwCurrent, legacyPw);
    const candidates = [
      ["sigem", selectedSigem],
      ["pw", selectedPw],
      ["ld", ldCurrent],
    ].filter(([kind, base]) => base && base.meta && Array.isArray(base.records)
      && !history.deletedIds.includes(text(base.meta.snapshotId) || snapshotId(kind, base.meta)));
    const snapshots = [...history.snapshots];
    const writes = [];
    let historyChanged = false;
    candidates.forEach(([kind, base]) => {
      const prepared = kind === "pw" ? sanitizePwBase(base, ldCurrent) : base;
      const normalized = normalizeBase(kind, prepared);
      const compact = historySnapshot(normalized);
      const snapshotIndex = snapshots.findIndex((item) => item.meta.snapshotId === normalized.meta.snapshotId);
      const needsScopedSnapshot = kind === "pw" && (Number(snapshots[snapshotIndex]?.meta?.scopeVersion) < PW_SCOPE_VERSION
        || text(snapshots[snapshotIndex]?.meta?.scopeLdSnapshotId) !== text(normalized.meta.scopeLdSnapshotId)
        || Array.isArray(snapshots[snapshotIndex]?.sourceRecords));
      if (snapshotIndex < 0) { snapshots.push(compact); historyChanged = true; }
      else if (needsScopedSnapshot) { snapshots[snapshotIndex] = compact; historyChanged = true; }
      const current = kind === "sigem" ? sigemCurrent : kind === "pw" ? pwCurrent : ldCurrent;
      const currentNeedsScope = kind === "pw" && (Number(current?.meta?.scopeVersion) < PW_SCOPE_VERSION
        || text(current?.meta?.scopeLdSnapshotId) !== text(normalized.meta.scopeLdSnapshotId));
      if (!current || !current.meta || snapshotId(kind, current.meta) !== normalized.meta.snapshotId || currentNeedsScope) writes.push([baseKey(kind), normalized]);
    });
    if (historyChanged) {
      snapshots.sort((left, right) => parseDateMs(right.meta.importedAt) - parseDateMs(left.meta.importedAt));
      writes.push([HISTORY_KEY, { version: HISTORY_VERSION, snapshots, deletedIds: history.deletedIds }]);
    }
    if (writes.length) await kvSetMany(writes);
  }

  async function loadSigemBase() {
    return kvGet(SIGEM_BASE_KEY, { meta: null, records: [] });
  }

  async function loadPwBase() {
    return kvGet(PW_BASE_KEY, { meta: null, records: [] });
  }

  async function loadLdBase() {
    return kvGet(LD_BASE_KEY, { meta: null, records: [] });
  }

  async function savePwBase(base, ldBaseOrRecords) {
    const ld = ldBaseOrRecords === undefined ? await loadLdBase() : ldBaseOrRecords;
    return saveBase("pw", sanitizePwBase(base, ld));
  }

  async function saveSigemBase(base) {
    return saveBase("sigem", base);
  }

  async function saveLdAndReprocessPw(base, pwBase) {
    const normalizedLd = normalizeBase("ld", base);
    const currentPw = pwBase === undefined ? await loadPwBase() : pwBase;
    const normalizedPw = currentPw && currentPw.meta && Array.isArray(currentPw.records)
      ? normalizeBase("pw", sanitizePwBase(currentPw, normalizedLd))
      : null;
    const history = await loadHistory();
    const replacementIds = new Set([normalizedLd.meta.snapshotId, normalizedPw && normalizedPw.meta.snapshotId].filter(Boolean));
    const snapshots = history.snapshots.filter((item) => !replacementIds.has(item.meta.snapshotId));
    snapshots.push(historySnapshot(normalizedLd));
    if (normalizedPw) snapshots.push(historySnapshot(normalizedPw));
    snapshots.sort((left, right) => parseDateMs(right.meta.importedAt) - parseDateMs(left.meta.importedAt));
    const deletedIds = history.deletedIds.filter((id) => !replacementIds.has(id));
    const writes = [
      [LD_BASE_KEY, normalizedLd],
      [HISTORY_KEY, { version: HISTORY_VERSION, snapshots, deletedIds }],
    ];
    if (normalizedPw) writes.push([PW_BASE_KEY, normalizedPw]);
    await kvSetMany(writes);
    return { ld: normalizedLd, pw: normalizedPw };
  }

  async function saveLdBase(base) {
    return (await saveLdAndReprocessPw(base)).ld;
  }

  async function loadBases() {
    await migrateLegacyBases();
    const [sigem, pw, ld, history] = await Promise.all([loadSigemBase(), loadPwBase(), loadLdBase(), loadHistory()]);
    return { sigem, pw, ld, history };
  }

  const EMISSION_RULE = "A contagem usa código + revisão. Revisões 0 e A do mesmo documento contam como duas entradas. No PW, ‘Última emissão’ igual a Sim ou Não comprova emissão; Previsto ou vazio permanece como cadastrado e não emitido.";

  return Object.freeze({
    DB_NAME, DB_STORE, LEGACY_SIGEM_BASE_KEY, LEGACY_PW_BASE_KEY, SIGEM_BASE_KEY, PW_BASE_KEY, LD_BASE_KEY, HISTORY_KEY,
    PW_BASE_VERSION, HISTORY_VERSION, PW_SCOPE_VERSION, N1710_CODE_RE, UNCLASSIFIED, SCOPE_CLASSES, DOCUMENT_CLASSES: SCOPE_CLASSES,
    EMISSION_FLAGS, EMISSION_RULE, PW_HEADER_ALIASES, REQUIRED_PW_FIELDS,
    text, norm, normalizeHeader, canonicalDocumentCode, documentIdentity, documentClass,
    revisionKey, revisionLabel, entryKey, revisionRank, parseDateMs, detectDelimiter, forEachDelimitedRow, mapPwColumns, validatePwColumns,
    parsePwCsv, parseLdMatrix, buildLdUniverse, scopeClassFor, normalizeRecords, normalizeSigemRecords, sanitizePwRecords, sanitizePwBase, buildEntryMap, buildDocumentMap,
    createModel, buildComparisonLists, aggregateModel, aggregate,
    openDb, storedValue, putKv, kvGet, kvSet, kvSetMany, loadSigemBase, loadPwBase, loadLdBase, loadHistory,
    saveBase, saveSigemBase, savePwBase, saveLdBase, saveLdAndReprocessPw, updateSnapshotDate, deleteSnapshot, migrateLegacyBases, loadBases,
  });
});
