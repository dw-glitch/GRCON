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

  const textOrder = new Intl.Collator("pt-BR");
  const numericOrder = new Intl.Collator("pt-BR", { numeric: true });

  const DB_NAME = "grcon-posting-conference";
  const DB_STORE = "kv";
  const LEGACY_SIGEM_BASE_KEY = "current-base";
  const LEGACY_PW_BASE_KEY = "projectwise-current-base";
  const SIGEM_BASE_KEY = "sigem-pw-current-sigem-v3";
  const PW_BASE_KEY = "sigem-pw-current-pw-v3";
  const LD_BASE_KEY = "sigem-pw-current-quality-ld-v1";
  const HISTORY_KEY = "sigem-pw-base-history-v3";
  const PW_BASE_VERSION = 7;
  const HISTORY_VERSION = 3;
  const PW_SCOPE_VERSION = 8;
  const PW_COMPANY_COLUMN_INDEX = 2; // Coluna C (índice zero-based), obrigatória.
  const UNCLASSIFIED = "Não classificado";
  const SCOPE_CLASSES = Object.freeze(["ET", "N-1710", "CV", UNCLASSIFIED]);
  const N1710_CODE_RE = /^(?:[IAFLED]-)?[A-Z0-9]{2,4}-5290\.00-22313-[A-Z0-9]{3}-C1O-\d{3,4}$/i;
  // Candidatos permanecem em lista de conferência; código incompleto não comprova identidade.
  const N1710_CANDIDATE_RE = /^(?:[IAFLED]-)?[A-Z0-9]{2,4}-5290\.00-22313-[A-Z0-9]{3}-C1O-/i;
  const LD_VALIDATION_VERSION = 1;
  const EMISSION_FLAGS = Object.freeze({ CURRENT: "SIM", HISTORICAL: "NAO", PLANNED: "PREVISTO" });
  const COMPARISON_SITUATIONS = Object.freeze({
    SIGEM_ONLY: "Postado no SIGEM, ainda não cadastrado no PW",
    BOTH_OTHER_REVISION: "Cadastrado no PW; revisão SIGEM sem correspondência confirmada",
    BOTH_NOT_EMITTED: "Postado no SIGEM e cadastrado no PW, ainda não emitido",
    BOTH_EMITTED: "Postado no SIGEM e emitido no PW",
    PW_ONLY_NOT_EMITTED: "Revisão cadastrada no PW sem correspondência no SIGEM; não emitida",
    PW_ONLY_EMITTED: "Revisão emitida no PW sem correspondência no SIGEM",
    CV_NOT_APPLICABLE: "CV — Currículo; sem exigência de cadastro no PW",
  });
  const REQUIRED_PW_FIELDS = Object.freeze(["document", "company"]);
  const REVISION_SCOPES = Object.freeze({ REVISION0: "revision0", ALL: "all" });

  const PW_HEADER_ALIASES = Object.freeze({
    document: ["NumeroDocumentoCliente", "NúmeroDocumentoCliente", "Numero Documento Cliente", "Número Documento Cliente"],
    company: ["Sigla da Empresa", "Sigla Empresa", "SiglaEmpresa", "Empresa Sigla", "EmpresaSigla", "Sigla da Contratada", "Sigla Contratada", "Empresa", "Company", "Company Code", "CompanyCode"],
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
   * Apenas ET/RNEST admite equivalência entre os seis separadores estruturais:
   * SIGEM usa underscores e algumas exportações PW usam hífens. A TAG (grupo 7)
   * é preservada literalmente. N-1710 é a exceção: utiliza hífens em AMBOS
   * os sistemas, sem substituição de caracteres. Jamais trocar separadores
   * globalmente ou identificar N-1710 apenas pela presença de hífen.
   */
  function canonicalDocumentCode(value) {
    const raw = norm(stripDocumentExtension(value)).replace(/\s*([_.-])\s*/g, "$1");
    if (!raw) return "";
    if (N1710_CODE_RE.test(raw)) return raw;
    const match = raw.match(/^([A-Z0-9]{3})[-_]RNEST[-_]([A-Z0-9]+)[-_](\d+(?:\.\d+){3})[-_]([A-Z0-9]+)[-_]([A-Z0-9]+)[-_](.+)$/);
    if (!match) return raw;
    return `${match[1]}_RNEST_${match[2]}_${match[3]}_${match[4]}_${match[5]}_${match[6]}`;
  }

  // Escopo único da comparação: presença literal de C1O no código documental.
  // A letra O jamais é confundida com o algarismo zero (C10).
  function isC1OCode(value) {
    return canonicalDocumentCode(value).includes("C1O");
  }

  // A responsabilidade contratual pertence à coluna da exportação PW,
  // nunca ao texto C1O encontrado no código ou no título.
  const PW_COMPANIES = Object.freeze(["CSG", "QTM"]);
  function companyCodes(value) {
    return [...new Set(norm(value).split(/[,;\/|+&\n]+|\s+E\s+/).map((part) => part.trim()).filter(Boolean))];
  }
  function recordCompany(record) {
    return record && typeof record === "object"
      ? text(record.company ?? record.companyCode ?? record.companySigla)
      : text(record);
  }
  function isPwCompanyInScope(record) {
    return companyCodes(recordCompany(record)).some((code) => PW_COMPANIES.includes(code));
  }
  function partitionPwCompanyRecords(records) {
    const eligible = [], outOfScope = [];
    for (const row of Array.isArray(records) ? records : []) {
      (isPwCompanyInScope(row) ? eligible : outOfScope).push(row);
    }
    return { eligible, outOfScope };
  }

  function partitionC1ORecords(records) {
    const eligible = [], outOfScope = [];
    for (const row of Array.isArray(records) ? records : []) {
      (isC1OCode(row && row.document) ? eligible : outOfScope).push(row);
    }
    return { eligible, outOfScope };
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

  // CV é o tipo documental Currículo, não uma família sem classificação.
  // Segmentos exatos evitam confundir CV com CVE.
  function isCvDocumentCode(value) {
    return /(?:^|[-_])CV(?=[-_]|$)/.test(canonicalDocumentCode(value));
  }

  /** Classe documental: ET, N-1710, CV e demais tipos identificados separadamente. */
  function documentClass(value) {
    return classFromIdentity(documentIdentity(value));
  }

  function n1710DocumentType(value) {
    const canonical = canonicalDocumentCode(value);
    const match = canonical.match(/^(?:[IAFLED]-)?([A-Z0-9]{2,4})-5290\.00-22313-[A-Z0-9]{3}-C1O-/);
    return match ? match[1] : "";
  }
  function isN1710Candidate(value) {
    const canonical = canonicalDocumentCode(value);
    return N1710_CANDIDATE_RE.test(canonical) && !N1710_CODE_RE.test(canonical);
  }

  function classFromIdentity(identity) {
    if (isCvDocumentCode(identity.canonical)) return "CV";
    if (/^C1O_RNEST_[A-Z0-9]+_\d+(?:\.\d+){3}_[A-Z0-9]+_[A-Z0-9]+_.+$/i.test(identity.canonical)) return "ET";
    if (N1710_CODE_RE.test(identity.canonical)) return "N-1710";
    return UNCLASSIFIED;
  }

  function revisionKey(value) {
    const revision = norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "");
    if (!revision || /^(?:SEMREVISAO|NAOINFORMAD[AO]|NA|N\/A|-)$/.test(revision)) return "__SEM_REVISAO__";
    return revision;
  }

  function normalizeRevisionScope(value) {
    return text(value).toLowerCase() === REVISION_SCOPES.REVISION0
      ? REVISION_SCOPES.REVISION0
      : REVISION_SCOPES.ALL;
  }

  function scopeRevisionMap(map, revisionScope, sigemRevision0) {
    const scope = normalizeRevisionScope(revisionScope);
    if (scope === REVISION_SCOPES.ALL) return map;
    const scoped = new Map([...map].filter(([, entry]) => entry && entry.revisionKey === "0"));
    if (!(sigemRevision0 instanceof Map)) return scoped;
    // Qualquer linha PW sem revisão comprova cadastro do código, NÃO revisão zero. Deve aparecer também no indicador PW da visão inicial,
    // mesmo quando não há registro da revisão 0 na Consulta Geral.
    const explicitPwCodes = new Set([...scoped.values()].map((entry) => entry.documentKey));
    map.forEach((entry, key) => {
      if (entry && entry.revisionKey === "__SEM_REVISAO__" && !explicitPwCodes.has(entry.documentKey)) scoped.set(key, entry);
    });
    return scoped;
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
    // A empresa vem SEMPRE da coluna C, mesmo se outro cabeçalho parecido existir.
    columns.company = PW_COMPANY_COLUMN_INDEX;
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
    const companyHeader = normalizeHeader((headers || [])[PW_COMPANY_COLUMN_INDEX]);
    const companyAliases = NORMALIZED_PW_ALIASES.company || new Set();
    if (!companyHeader || (headers || []).length <= PW_COMPANY_COLUMN_INDEX) {
      return ["Base PW inválida: coluna C (sigla da empresa) ausente. Atualize a consulta ProjectWise antes de importar."];
    }
    if (!companyAliases.has(companyHeader) && !/\b(SIGLA|EMPRESA|CONTRATADA|COMPANY)\b/.test(companyHeader)) {
      return ["Base PW inválida: o cabeçalho da coluna C não identifica a sigla da empresa. Confira o layout da consulta antes de importar."];
    }
    if (!missing.length) return [];
    const labels = {
      document: "NumeroDocumentoCliente",
      company: "Sigla da Empresa (CSG/QTM)",
      revision: "RevisaoCompleta/Revisao",
      documentType: "TipoDocumento",
      state: "o_statename",
      lastEmission: "Última emissão",
    };
    return [`Base ProjectWise inválida. Campo(s) obrigatório(s) não localizado(s): ${missing.map((field) => labels[field]).join(", ")}. Cabeçalhos lidos: ${(headers || []).filter(Boolean).slice(0, 18).join(", ")}${(headers || []).length > 18 ? "…" : ""}`];
  }

  function parsePwCsv(source, fileMeta) {
    const mappingProfile = fileMeta?.mappingProfile;
    const delimiter = mappingProfile && [";", ",", "\t"].includes(mappingProfile.delimiter) ? mappingProfile.delimiter : detectDelimiter(source);
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
        if (mappingProfile?.columns) for (const field of Object.keys(PW_HEADER_ALIASES)) {
          if (field === "company") continue; // Perfil nunca muda o filtro da coluna C.
          const header = mappingProfile.columns[field];
          if (!header) continue;
          const matches = headers.map((value,index)=>normalizeHeader(value)===normalizeHeader(header)?index:-1).filter(index=>index>=0);
          if (matches.length===0 && field!=='document') { columns[field]=-1; continue; }
          if (matches.length!==1) throw new Error('Perfil PW: coluna ausente ou ambígua para '+field+'. A base vigente foi preservada.');
          columns[field]=matches[0];
        }
        columns.company = PW_COMPANY_COLUMN_INDEX;
        if (columns.revisionComplete<0 && columns.revision>=0) columns.revisionComplete=columns.revision;
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
      const duplicateKey = entryKey(identity.key, revisionComplete || revision);
      if (revisionSeen.has(duplicateKey)) duplicateRevisionCount += 1;
      else revisionSeen.add(duplicateKey);

      records.push({
        document,
        company: rowValue(row, columns.company),
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
        companyHeader: headers[columns.company],
        companyColumn: "C",
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
    let statusColumn = -1;
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 80); rowIndex += 1) {
      const headers = (rows[rowIndex] || []).map(normalizeHeader);
      // A LD de comissionamento identifica a coluna em duas linhas:
      // "DOCUMENTO\r\nN-1710". Aceitar somente os dois rótulos oficiais.
      const documentColumns = headers.flatMap((header, index) =>
        ["DOCUMENTO", "DOCUMENTO N 1710"].includes(header) ? [index] : []);
      if (documentColumns.length > 1) throw new Error("LD da Qualidade inválida: mais de uma coluna DOCUMENTO localizada.");
      const documentIndex = documentColumns[0] ?? -1;
      if (documentIndex < 0) continue;
      headerRow = rowIndex;
      documentColumn = documentIndex;
      revisionColumn = headers.indexOf("REVISAO");
      titleColumn = headers.indexOf("TITULO");
      statusColumn = headers.indexOf("STATUS");
      break;
    }
    if (headerRow < 0) throw new Error("LD da Qualidade inválida: cabeçalho DOCUMENTO não localizado na aba N-1710.");

    const records = [];
    const seen = new Set();
    for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const document = rowValue(row, documentColumn);
      const identity = documentIdentity(document);
      if (!identity.key || documentClass(document) === UNCLASSIFIED || seen.has(identity.key)) continue;
      seen.add(identity.key);
      records.push({
        document,
        documentKey: identity.key,
        canonicalDocument: identity.canonical,
        revision: rowValue(row, revisionColumn),
        title: rowValue(row, titleColumn),
        status: rowValue(row, statusColumn),
        documentClass: documentClass(document),
        sheetName: text(fileMeta && fileMeta.sheetName) || "N-1710",
        sourceRow: rowIndex + 1,
      });
    }
    if (!records.length) throw new Error("Referência documental inválida: nenhum código documental reconhecido foi localizado.");
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
    return scopeClassFromIdentity(documentIdentity(document), ldUniverse, enforceLd);
  }

  function scopeClassFromIdentity(identity, ldUniverse, enforceLd) {
    const candidateClass = classFromIdentity(identity);
    if (candidateClass === "CV") return "CV";
    if (candidateClass === "ET") return "ET";
    if (!enforceLd && identity.canonical.includes("_RNEST_")) return "ET";
    // A LD é fonte de localização/alocação, NUNCA prova de existência no PW.
    if (candidateClass === "N-1710") return "N-1710";
    return "";
  }

  function classForRecord(record, identity, ldUniverse, enforceLd) {
    const type = norm(record && (record.documentType || record.tipoDocumento || record.tipo_documento));
    const description = norm(record && (record.documentTypeDesc || record.descricaoTipoDocumento));
    if (type === "CV" || description === "CURRICULO") return "CV";
    return scopeClassFromIdentity(identity, ldUniverse, enforceLd) || UNCLASSIFIED;
  }

  function normalizeRecords(records, kind, ldUniverse, enforceLd) {
    return (records || []).map((record) => {
      const identity = documentIdentity(record && record.document);
      const rawRevision = record && (record.revisionComplete || record.revision);
      const scopedClass = classForRecord(record, identity, ldUniverse, enforceLd);
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
        inQualityLd: Boolean(ldUniverse && ldUniverse.has(identity.key)),
        ldOriginalCode: text(ldUniverse && ldUniverse.get(identity.key)?.document),
        ldRevision: text(ldUniverse && ldUniverse.get(identity.key)?.revision),
        ldSourceRow: Number(ldUniverse && ldUniverse.get(identity.key)?.sourceRow) || 0,
        n1710DocumentType: n1710DocumentType(record && record.document),
        n1710Candidate: isN1710Candidate(record && record.document),
      };
    }).filter((record) => record.documentKey && record.documentClass);
  }

  function normalizeSigemRecords(records, ldUniverse) {
    return normalizeRecords(records, "sigem", ldUniverse || new Map(), arguments.length >= 2);
  }

  function sanitizePwRecords(records, ldRecords) {
    const sourceRecords = Array.isArray(records) ? records : [];
    const ldUniverse = buildLdUniverse(ldRecords || []);
    const companyScope = partitionPwCompanyRecords(sourceRecords);
    const accepted = normalizeRecords(companyScope.eligible, "pw", ldUniverse, true);
    const excludedReasons = { empresa_divergente: 0, sigla_ausente: 0 };
    const companyCounts = { CSG: 0, QTM: 0, MULTIPLAS: 0 };
    for (const record of sourceRecords) {
      const codes = companyCodes(recordCompany(record));
      if (!codes.length) excludedReasons.sigla_ausente += 1;
      else if (!isPwCompanyInScope(record)) excludedReasons.empresa_divergente += 1;
      else {
        const acceptedCodes = PW_COMPANIES.filter((code) => codes.includes(code));
        if (acceptedCodes.length === 1) companyCounts[acceptedCodes[0]] += 1;
        else companyCounts.MULTIPLAS += 1;
      }
    }
    const companyColumnMissing = sourceRecords.length > 0
      && !sourceRecords.some((record) => record && Object.prototype.hasOwnProperty.call(record, "company"));
    return {
      records: accepted,
      acceptedCount: accepted.length,
      excludedCount: Math.max(0, sourceRecords.length - accepted.length),
      excludedReasons,
      companyCounts,
      companyColumnMissing,
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
    }, { ET: 0, "N-1710": 0, CV: 0 });
    return {
      meta: {
        ...previousMeta,
        version: Math.max(Number(previousMeta.version) || 0, PW_BASE_VERSION),
        scopeVersion: PW_SCOPE_VERSION,
        scopeRule: "Somente linhas com Sigla da Empresa CSG/QTM comprovam cadastro no PW do contrato; PREVISTO é cadastrado, não emitido",
        scopeLdSnapshotId: text(ldMeta && ldMeta.snapshotId) || (ldMeta ? snapshotId("ld", ldMeta) : ""),
        sourceRecordCount: Number(previousMeta.sourceRecordCount) || sourceRecords.length,
        recordCount: audit.records.length,
        validRevisionRecordCount: entries.size,
        uniqueDocumentCount: documents.size,
        emittedDocumentCount: emittedDocuments.size,
        duplicateRevisionCount: Math.max(0, audit.records.length - entries.size),
        scopeAcceptedRecordCount: audit.acceptedCount,
        scopeExcludedCount: audit.excludedCount,
        scopeExcludedReasons: audit.excludedReasons,
        scopeCompanyCounts: audit.companyCounts,
        scopeCompanyColumnMissing: audit.companyColumnMissing,
        scopeClassCounts: classCounts,
        registeredWithoutQualityLdCount: audit.records.filter((row) => row.documentClass === "N-1710" && !row.inQualityLd).length,
        plannedRegisteredCount: new Set(audit.records.filter((row) => norm(row.lastEmission) === EMISSION_FLAGS.PLANNED).map((row) => row.documentKey)).size,
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
      .sort((left, right) => right.count - left.count || textOrder.compare(left.label, right.label));
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
      return numericOrder.compare(left.documentClass, right.documentClass);
    });
  }

  function createModel(sigemRecords, pwRecords, ldRecords, settings) {
    // Escopo PW: exclusivamente coluna C CSG/QTM. Cadastro e emissão seguem distintos.
    // A opção requireN1710Ld habilita o universo oficial da interface; chamadas
    // legadas sem a opção continuam úteis para relatórios históricos imutáveis.
    const enforceLd = arguments.length >= 3;
    const requireN1710Ld = Boolean(settings && settings.requireN1710Ld);
    // Opt-in for the live managerial dashboard. Historical snapshots retain the older N-1710-only behavior.
    const requireDocumentReference = Boolean(settings && settings.requireDocumentReference);
    const ldAvailable = Boolean(settings && settings.ldAvailable && Array.isArray(ldRecords) && ldRecords.length);
    // Ausência de uma fonte nunca comprova ausência documental.
    const sigemAvailable = !requireN1710Ld || settings.sigemAvailable !== false;
    const pwAvailable = !requireN1710Ld || settings.pwAvailable !== false;
    const ldUniverse = buildLdUniverse(ldRecords || []);
    const sigemScope = { eligible: Array.isArray(sigemRecords) ? sigemRecords : [], outOfScope: [] };
    const pwScope = partitionPwCompanyRecords(pwRecords);
    const sourceSigem = normalizeRecords(sigemScope.eligible, "sigem", ldUniverse, enforceLd);
    const sourcePw = normalizeRecords(pwScope.eligible, "pw", ldUniverse, enforceLd);
    const isEligible = (record) => requireDocumentReference
      ? (ldAvailable && record.inQualityLd && !record.n1710Candidate)
      : (!requireN1710Ld || (!record.n1710Candidate
        && (record.documentClass !== "N-1710" || (ldAvailable && record.inQualityLd))));
    const normalizedSigem = sourceSigem.filter(isEligible);
    const normalizedPw = sourcePw.filter(isEligible);
    const excludedSigemN1710 = sourceSigem.filter((record) => (requireDocumentReference || record.documentClass === "N-1710") && !isEligible(record));
    const excludedPwN1710 = sourcePw.filter((record) => (requireDocumentReference || record.documentClass === "N-1710") && !isEligible(record));
    const candidates = [
      ...sourceSigem.filter((record) => record.n1710Candidate).map((record) => ({ ...record, auditSource: "sigem" })),
      ...sourcePw.filter((record) => record.n1710Candidate).map((record) => ({ ...record, auditSource: "pw" })),
    ];
    const sigemEntries = buildEntryMap(normalizedSigem, "sigem");
    const pwEntries = buildEntryMap(normalizedPw, "pw");
    return {
      ldUniverse, ldAvailable, sigemAvailable, pwAvailable, requireN1710Ld, requireDocumentReference,
      excludedSigemN1710, excludedPwN1710, n1710Candidates: candidates,
      sourceSigemEntries: excludedSigemN1710.length || excludedPwN1710.length ? buildEntryMap(sourceSigem, "sigem") : undefined,
      sourcePwEntries: excludedSigemN1710.length || excludedPwN1710.length ? buildEntryMap(sourcePw, "pw") : undefined,
      sourcePwDocuments: excludedSigemN1710.length || excludedPwN1710.length ? buildDocumentMap(sourcePw, "pw") : undefined,
      comparisonScope: {
        rule: "PW: CSG/QTM", n1710LdRule: "N-1710 oficial: código presente na LD; sigla PW na coluna C", version: PW_SCOPE_VERSION,
        sigemAccepted: normalizedSigem.length, pwAccepted: normalizedPw.length,
        sigemN1710Excluded: excludedSigemN1710.length,
        pwN1710Excluded: excludedPwN1710.length,
        ldAvailable, requireN1710Ld,
        sigemOutOfScope: sigemScope.outOfScope.length,
        pwOutOfScope: pwScope.outOfScope.length,
      },
      normalizedSigem, normalizedPw,
      // Preservar os registros originais, inclusive registros fora do universo oficial.
      sigemEntries, pwEntries,
      sigemAll: buildDocumentMap(normalizedSigem, "sigem"),
      pwAll: buildDocumentMap(normalizedPw, "pw"),
    };
  }

  function comparisonRow(key, sigemEntry, pwEntry, options) {
    const settings = options || {};
    const reference = sigemEntry || pwEntry;
    const pwEvidence = pwEntry || settings.pwDocumentEntry || null;
    const sigemStatus = currentStatus(sigemEntry, "sigem");
    const sigemCurrent = sigemEntry && sigemEntry.current;
    const sigemDate = text(sigemCurrent && (sigemCurrent.modifiedAt || sigemCurrent.includedAt || sigemCurrent.stateChangedAt || sigemCurrent.createdAt));
    const pwLastEmission = text(pwEvidence && pwEvidence.current && pwEvidence.current.lastEmission);
    const pwStatusRaw = currentStatus(pwEvidence, "pw");
    const pwStatus = pwStatusRaw || (norm(pwLastEmission) === EMISSION_FLAGS.PLANNED ? "Previsto (sem estado no PW)" : "");
    const pwEmission = sigemEntry && reference.documentClass === "CV" && !pwEntry ? "Não aplicável (CV)" : pwEntry ? (pwEntry.emitted ? "Emitido" : "Não emitido") : pwEvidence ? "Revisão não confirmada" : "Não cadastrado";
    let situationKey = "bothEmitted";
    let situation = COMPARISON_SITUATIONS.BOTH_EMITTED;
    if (sigemEntry && !pwEntry && reference.documentClass === "CV") {
      situationKey = "cvNotApplicable";
      situation = COMPARISON_SITUATIONS.CV_NOT_APPLICABLE;
    } else if (sigemEntry && !pwEntry && pwEvidence) {
      situationKey = "bothOtherRevision";
      situation = COMPARISON_SITUATIONS.BOTH_OTHER_REVISION;
    } else if (sigemEntry && !pwEntry) {
      situationKey = "sigemOnly";
      situation = COMPARISON_SITUATIONS.SIGEM_ONLY;
    } else if (pwEntry && !sigemEntry && !pwEntry.emitted) {
      situationKey = "pwOnlyNotEmitted";
      situation = COMPARISON_SITUATIONS.PW_ONLY_NOT_EMITTED;
    } else if (pwEntry && !sigemEntry) {
      situationKey = "pwOnlyEmitted";
      situation = COMPARISON_SITUATIONS.PW_ONLY_EMITTED;
    } else if (pwEntry && !pwEntry.emitted) {
      situationKey = "bothNotEmitted";
      situation = COMPARISON_SITUATIONS.BOTH_NOT_EMITTED;
    }
    return {
      key,
      documentKey: reference.documentKey,
      document: reference.canonicalDocument || reference.document,
      revision: text(settings.revision) || reference.revision,
      documentClass: reference.documentClass,
      sigemStatus,
      sigemDate,
      pwStatus,
      pwEmission,
      pwLastEmission,
      pwCompany: text(pwEvidence && pwEvidence.current && pwEvidence.current.company),
      n1710DocumentType: n1710DocumentType(reference.document),
      ldStatus: reference.documentClass !== "N-1710" ? "NÃO SE APLICA"
        : (sigemCurrent || pwEvidence?.current)?.inQualityLd ? "SIM" : "NÃO",
      ldOriginalCode: text((sigemCurrent || pwEvidence?.current)?.ldOriginalCode),
      ldRevision: text((sigemCurrent || pwEvidence?.current)?.ldRevision),
      ldSourceRow: Number((sigemCurrent || pwEvidence?.current)?.ldSourceRow) || 0,
      pwRegistrationStatus: pwEvidence ? (pwEntry ? "CADASTRADO" : "CADASTRADO — OUTRA REVISÃO") : "NÃO LOCALIZADO NA BASE PW",
      sigemOriginalCode: text(sigemEntry && sigemEntry.document),
      pwOriginalCode: text(pwEvidence && pwEvidence.document),
      pwRevisionEvidence: sigemEntry && reference.documentClass === "CV" && !pwEntry ? "Revisão PW não exigida para CV" : !pwEntry && pwEvidence ? "Correspondência da revisão não confirmada" : pwEntry && pwEntry.revisionKey === "__SEM_REVISAO__" ? "Não informada no PW" : "Informada no PW",
      situation,
      situationKey,
      inSigem: Boolean(sigemEntry),
      inPw: Boolean(pwEvidence),
      hasPwEntry: Boolean(pwEntry),
      pwRevision: pwEvidence ? revisionLabel(pwEvidence.current && (pwEvidence.current.revisionComplete || pwEvidence.current.revision)) : "",
      pwRevisionMatched: Boolean(pwEntry && pwEntry.revisionKey !== "__SEM_REVISAO__" && sigemEntry && pwEntry.revisionKey === sigemEntry.revisionKey),
      pwEmitted: Boolean(pwEntry && pwEntry.emitted),
      matchMode: text(settings.matchMode) || (sigemEntry && pwEntry ? "document-revision" : "unmatched"),
    };
  }

  function groupEntriesByDocument(map) {
    const groups = new Map();
    map.forEach((entry, key) => {
      if (!groups.has(entry.documentKey)) groups.set(entry.documentKey, []);
      groups.get(entry.documentKey).push({ key, entry });
    });
    groups.forEach((entries) => entries.sort((left, right) =>
      revisionRank(right.entry.revision) - revisionRank(left.entry.revision)
      || numericOrder.compare(right.entry.revision, left.entry.revision)));
    return groups;
  }

  function buildComparisonLists(sigem, pw, options) {
    const revision0 = normalizeRevisionScope(options && options.revisionScope) === REVISION_SCOPES.REVISION0;
    const all = [];
    const consumedSigem = new Set();
    const consumedPw = new Set();

    // Quando os dois lados informam a revisão, a chave código + revisão segue
    // autoritativa. Revisões 0, A, B etc. continuam linhas independentes.
    pw.forEach((pwEntry, key) => {
      const sigemEntry = sigem.get(key);
      if (!sigemEntry) return;
      consumedSigem.add(key);
      consumedPw.add(key);
      const missingPwRevision = pwEntry.revisionKey === "__SEM_REVISAO__";
      all.push(comparisonRow(key, sigemEntry, pwEntry, missingPwRevision ? {
        revision: revision0 ? "0" : `Não informada no PW · SIGEM: ${sigemEntry.revision}`,
        matchMode: "document-fallback",
      } : null));
    });

    // A relação PW pode omitir a revisão. Nesse caso, a falta desse campo não
    // pode transformar um código presente na Consulta Geral em “Só PW”. Cada
    // registro sem revisão é conciliado uma vez, pelo código, com a revisão
    // SIGEM mais recente ainda não usada. As demais revisões SIGEM continuam
    // visíveis como registros próprios.
    const needsFallback = [...pw].some(([key, entry]) => !consumedPw.has(key) && entry.revisionKey === "__SEM_REVISAO__");
    const sigemByDocument = needsFallback ? groupEntriesByDocument(sigem) : new Map();
    pw.forEach((pwEntry, pwKey) => {
      if (consumedPw.has(pwKey) || pwEntry.revisionKey !== "__SEM_REVISAO__") return;
      const candidate = (sigemByDocument.get(pwEntry.documentKey) || [])
        .find((item) => !consumedSigem.has(item.key));
      if (!candidate) return;
      consumedSigem.add(candidate.key);
      consumedPw.add(pwKey);
      all.push(comparisonRow(`document:${pwKey}:${candidate.key}`, candidate.entry, pwEntry, {
        revision: revision0 ? "0" : `Não informada no PW · SIGEM: ${candidate.entry.revision}`,
        matchMode: "document-fallback",
      }));
    });

    sigem.forEach((entry, key) => {
      if (!consumedSigem.has(key)) {
        const evidence = options && options.pwDocuments && options.pwDocuments.get(entry.documentKey);
        all.push(comparisonRow(key, entry, null, { pwDocumentEntry: evidence, matchMode: evidence ? "document-presence" : "unmatched" }));
      }
    });
    pw.forEach((entry, key) => {
      if (!consumedPw.has(key)) {
        all.push(comparisonRow(key, null, entry, entry.revisionKey === "__SEM_REVISAO__" ? {
          revision: "Não informada no PW",
        } : null));
      }
    });

    all.sort((left, right) => textOrder.compare(left.documentClass, right.documentClass)
        || numericOrder.compare(left.document, right.document)
        || revisionRank(left.revision) - revisionRank(right.revision));
    const bySituation = (key) => all.filter((row) => row.situationKey === key);
    const cvNotApplicable = bySituation("cvNotApplicable");
    const sigemOnly = bySituation("sigemOnly");
    const bothOtherRevision = bySituation("bothOtherRevision");
    const bothNotEmitted = bySituation("bothNotEmitted");
    const bothEmitted = bySituation("bothEmitted");
    const pwOnlyNotEmitted = bySituation("pwOnlyNotEmitted");
    const pwOnlyEmitted = bySituation("pwOnlyEmitted");
    const exclusiveLists = [sigemOnly, cvNotApplicable, bothOtherRevision, bothNotEmitted, bothEmitted, pwOnlyNotEmitted, pwOnlyEmitted];
    const classified = exclusiveLists.reduce((total, rows) => total + rows.length, 0);
    const uniqueClassified = new Set(exclusiveLists.flat().map((row) => row.key)).size;
    if (classified !== all.length || uniqueClassified !== all.length) {
      throw new Error("Inconsistência matemática: as situações SIGEM × PW não formam grupos exclusivos.");
    }

    // Listas legadas permanecem disponíveis para o histórico e relatórios já
    // publicados, mas a interface principal usa somente os cinco grupos acima.
    const sigemRows = all.filter((row) => row.inSigem);
    const pwRows = all.filter((row) => row.hasPwEntry);
    const toRegisterPw = sigemOnly;
    const pwNotEmitted = all.filter((row) => row.hasPwEntry && !row.pwEmitted);
    const pwExclusive = all.filter((row) => row.hasPwEntry && !row.inSigem);
    const aligned = bothEmitted;
    const differences = all.filter((row) => row.situationKey !== "bothEmitted" && row.situationKey !== "cvNotApplicable");
    return {
      all, sigem: sigemRows, pw: pwRows, differences,
      sigemOnly, cvNotApplicable, bothOtherRevision, bothNotEmitted, bothEmitted, pwOnlyNotEmitted, pwOnlyEmitted,
      toRegisterPw, pwNotEmitted, pwExclusive, aligned,
    };
  }

  function summarizeClassesFromLists(sigem, pw, lists) {
    const classes = new Map();
    const ensure = (name) => {
      const key = name || UNCLASSIFIED;
      if (!classes.has(key)) classes.set(key, {
        documentClass: key,
        sigem: 0,
        bothOtherRevision: 0,
        pwRegistered: 0,
        pwEmitted: 0,
        gapSigemToPw: 0,
        gapPwToEmitted: 0,
        pwExclusive: 0,
        matched: 0,
      });
      return classes.get(key);
    };
    sigem.forEach((entry) => { ensure(entry.documentClass).sigem += 1; });
    pw.forEach((entry) => {
      const row = ensure(entry.documentClass);
      row.pwRegistered += 1;
      if (entry.emitted) row.pwEmitted += 1;
      else row.gapPwToEmitted += 1;
    });
    lists.bothOtherRevision.forEach((entry) => { ensure(entry.documentClass).bothOtherRevision += 1; });
    lists.sigemOnly.forEach((entry) => { ensure(entry.documentClass).gapSigemToPw += 1; });
    [...lists.pwOnlyNotEmitted, ...lists.pwOnlyEmitted].forEach((entry) => { ensure(entry.documentClass).pwExclusive += 1; });
    [...lists.bothNotEmitted, ...lists.bothEmitted].forEach((entry) => { ensure(entry.documentClass).matched += 1; });
    return [...classes.values()].sort((left, right) => left.documentClass === UNCLASSIFIED ? 1
      : right.documentClass === UNCLASSIFIED ? -1
        : numericOrder.compare(left.documentClass, right.documentClass));
  }

  function aggregateModel(model, filters, options) {
    const source = model || { normalizedSigem: [], normalizedPw: [], sigemAll: new Map(), pwAll: new Map() };
    const revisionScope = normalizeRevisionScope(options && options.revisionScope);
    const sigemSource = source.sigemEntries || source.sigemAll || new Map();
    const pwSource = source.pwEntries || source.pwAll || new Map();
    const sigemAll = scopeRevisionMap(sigemSource, revisionScope);
    const pwAll = scopeRevisionMap(pwSource, revisionScope, sigemAll);
    const sigem = filterMap(sigemAll, "sigem", filters);
    const pw = filterMap(pwAll, "pw", filters);
    const sigemKeys = new Set(sigem.keys());
    const pwKeys = new Set(pw.keys());
    const emittedKeys = new Set([...pw].filter(([, document]) => document.emitted).map(([key]) => key));
    if (emittedKeys.size > pwKeys.size) throw new Error("Inconsistência matemática: PW emitido maior que PW cadastrado.");

    const lists = buildComparisonLists(sigem, pw, { revisionScope, pwDocuments: source.pwAll });
    if (source.requireN1710Ld && source.pwAvailable === false) {
      for (const row of lists.all) {
        if (!row.inPw) {
          row.pwRegistrationStatus = "BASE PW NÃO CARREGADA — INCONCLUSIVO";
          row.pwEmission = "Não avaliável";
          row.situation = "Base ProjectWise não carregada: conciliação inconclusiva";
        }
      }
    }

    const auditRows = (records, kind, reason) => {
      const map = scopeRevisionMap(buildEntryMap(records || [], kind), revisionScope);
      return [...map.values()].filter((entry) => documentPasses(entry, kind, filters)).map((entry) => {
        const relatedPw = source.sourcePwEntries?.get(entry.key) || source.sourcePwDocuments?.get(entry.documentKey);
        const relatedSigem = source.sourceSigemEntries?.get(entry.key);
        return ({
        ...comparisonRow("audit:" + kind + ":" + reason + ":" + entry.key,
          kind === "sigem" ? entry : relatedSigem || null,
          kind === "pw" ? entry : source.sourcePwEntries?.get(entry.key) || null,
          kind === "sigem" && relatedPw && !source.sourcePwEntries?.has(entry.key) ? { pwDocumentEntry: relatedPw } : undefined),
        situationKey: reason,
        situation: reason === "ldUnavailableN1710" ? "Referências documentais indisponíveis: conferência pendente"
          : "Documento fora das referências vigentes",
        ldStatus: reason === "ldUnavailableN1710" ? "LD INDISPONÍVEL" : "NÃO",
      });
      });
    };
    const ldReason = source.ldAvailable ? "outsideLdN1710" : "ldUnavailableN1710";
    lists.sigemN1710OutsideLd = source.ldAvailable ? auditRows(source.excludedSigemN1710, "sigem", ldReason) : [];
    lists.pwN1710OutsideLd = source.ldAvailable ? auditRows(source.excludedPwN1710, "pw", ldReason) : [];
    lists.ldUnavailableN1710 = source.ldAvailable ? [] : [
      ...auditRows(source.excludedSigemN1710, "sigem", ldReason),
      ...auditRows(source.excludedPwN1710, "pw", ldReason),
    ];
    lists.n1710Candidates = [
      ...auditRows((source.n1710Candidates || []).filter((row) => row.auditSource === "sigem"), "sigem", "n1710Candidate"),
      ...auditRows((source.n1710Candidates || []).filter((row) => row.auditSource === "pw"), "pw", "n1710Candidate"),
    ].map((row) => ({ ...row, ldStatus: "A CONFERIR",
      situation: "Código semelhante a N-1710: verificar formato completo" }));
    const sigemAllCodes = new Set([
      ...(source.normalizedSigem || []), ...(source.excludedSigemN1710 || []),
    ].map((record) => record.documentKey));
    lists.ldWithoutSigem = source.ldAvailable && source.sigemAvailable
      ? [...(source.ldUniverse || new Map()).values()]
        .filter((record) => !sigemAllCodes.has(record.documentKey))
        .map((record) => ({
          key: "ld:" + record.documentKey, document: text(record.document), documentKey: record.documentKey,
          documentClass: documentClass(record.document), n1710DocumentType: n1710DocumentType(record.document),
          revision: text(record.revision) || "—", sigemStatus: "", pwStatus: "", pwEmission: "",
          ldStatus: "SIM", ldOriginalCode: text(record.document), ldRevision: text(record.revision),
          ldSourceRow: Number(record.sourceRow) || 0,
          inSigem: false, inPw: false, situationKey: "ldWithoutSigem",
          situation: "Presente na referência documental, não localizado na Consulta Geral",
        })) : [];
    const gapSigemToPw = new Set(lists.sigemOnly.map((row) => row.key));
    const gapPwToEmitted = setDifference(pwKeys, emittedKeys);
    const pwExclusive = new Set([...lists.pwOnlyNotEmitted, ...lists.pwOnlyEmitted].map((row) => row.key));
    const matched = new Set([...lists.bothNotEmitted, ...lists.bothEmitted].map((row) => row.key));

    const classRows = summarizeClassesFromLists(sigem, pw, lists);
    const allClassRows = sigem.size === sigemAll.size && pw.size === pwAll.size
      ? classRows : summarizeClassesFromLists(sigemAll, pwAll, buildComparisonLists(sigemAll, pwAll, { revisionScope, pwDocuments: source.pwAll }));
    const classifiedTotal = lists.sigemOnly.length + lists.cvNotApplicable.length + lists.bothOtherRevision.length + lists.bothNotEmitted.length + lists.bothEmitted.length
      + lists.pwOnlyNotEmitted.length + lists.pwOnlyEmitted.length;
    const expectedTotal = sigemKeys.size + pwKeys.size - matched.size;
    if (classifiedTotal !== expectedTotal) throw new Error("Inconsistência matemática: total classificado difere do universo comparado.");

    const duplicateRows = [];
    let duplicateGroups = 0, duplicateExtraRows = 0, pwSourceRows = 0;
    pwSource.forEach((entry) => {
      if (!documentPasses(entry, "pw", filters)) return;
      pwSourceRows += entry.rows.length;
      if (entry.rows.length < 2) return;
      duplicateGroups += 1;
      duplicateExtraRows += entry.rows.length - 1;
      entry.rows.forEach((record, index) => {
        const row = comparisonRow(`duplicate:${entry.key}:${index}`, null, entry);
        duplicateRows.push({ ...row, document: record.document, revision: record.revisionLabel,
          pwStatus: text(record.state), pwLastEmission: text(record.lastEmission),
          pwCompany: text(record.company),
          pwEmission: record.emittedEvidence ? "Emitido" : "Não emitido", situationKey: "pwDuplicates",
          situation: "Código + revisão repetidos na base PW", duplicateGroup: entry.key,
          duplicateCount: entry.rows.length, duplicateOccurrence: index + 1,
          pwSourceRow: Number(record.sourceRow) || 0, pwFileName: text(record.fileName),
          pwOriginalCode: text(record.document) });
      });
    });
    lists.pwDuplicates = duplicateRows;
    return {
      revisionScope,
      summary: {
        sigem: sigemKeys.size,
        pwRegistered: pwKeys.size,
        pwEmitted: emittedKeys.size,
        gapSigemToPw: gapSigemToPw.size,
        gapPwToEmitted: gapPwToEmitted.size,
        pwExclusive: pwExclusive.size,
        matched: matched.size,
        sigemOnly: lists.sigemOnly.length,
        cvNotApplicable: lists.cvNotApplicable.length,
        bothOtherRevision: lists.bothOtherRevision.length,
        bothNotEmitted: lists.bothNotEmitted.length,
        bothEmitted: lists.bothEmitted.length,
        pwOnlyNotEmitted: lists.pwOnlyNotEmitted.length,
        pwOnlyEmitted: lists.pwOnlyEmitted.length,
        classifiedTotal,
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
        pwSourceRows, pwDuplicateGroups: duplicateGroups, pwDuplicateExtraRows: duplicateExtraRows, pwDuplicateRows: duplicateRows.length,
        ldDocumentCount: source.ldUniverse ? source.ldUniverse.size : 0,
        ldAvailable: Boolean(source.ldAvailable),
        sigemN1710OutsideLd: (lists.sigemN1710OutsideLd || []).length,
        pwN1710OutsideLd: (lists.pwN1710OutsideLd || []).length,
        n1710Candidates: (lists.n1710Candidates || []).length,
        ldWithoutSigem: (lists.ldWithoutSigem || []).length,
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
    return { meta: { ...base.meta }, records: base.records,
      ...(base.meta?.kind === "ld" && Array.isArray(base.sourceRecords) ? { sourceRecords: base.sourceRecords } : {}) };
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

  async function updateSnapshotMetadata(kind, id, metadata) {
    const history = await loadHistory();
    const snapshots = history.snapshots.map(item => item.meta.snapshotId === id && item.meta.kind === kind
      ? { ...item, meta: { ...item.meta, ...metadata } } : item);
    const current = await kvGet(baseKey(kind), { meta: null, records: [] });
    const writes = [[HISTORY_KEY, { ...history, snapshots }]];
    if (current?.meta?.snapshotId === id) writes.push([baseKey(kind), { ...current, meta: { ...current.meta, ...metadata } }]);
    await kvSetMany(writes);
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
      const ldId = text(ldCurrent?.meta?.snapshotId) || (ldCurrent?.meta ? snapshotId("ld", ldCurrent.meta) : "");
      const alreadyScoped = Number(base.meta.scopeVersion) === PW_SCOPE_VERSION && text(base.meta.scopeLdSnapshotId) === ldId;
      const prepared = kind === "pw" && !alreadyScoped ? sanitizePwBase(base, ldCurrent) : base;
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
    await (typeof globalThis !== "undefined" ? globalThis.GrconSharedPwQuery?.refresh?.() : null);
    const [sigem, pw, ld, history] = await Promise.all([loadSigemBase(), loadPwBase(), loadLdBase(), loadHistory()]);
    return { sigem, pw, ld, history };
  }

  const EMISSION_RULE = "A comparação SIGEM × PW considera somente registros PW com sigla da empresa CSG ou QTM, independentemente da presença de C1O no código; registros de outras empresas ficam separados. Documentos CV (Currículo) sem cadastro no PW permanecem no SIGEM, mas não representam pendência de emissão. Todo código presente na base PW está CADASTRADO, independentemente de status, classe, revisão, emissão ou LD. A presença é conferida na base completa mesmo na visão Rev. 0. Cadastro não comprova a mesma revisão nem emissão: esses dados são apresentados separadamente. Cada código + revisão conta uma vez; todas as ocorrências repetidas estão na lista Duplicados PW, com as linhas de origem. Revisões diferentes são registros distintos. Sim identifica emissão atual e Não uma emissão histórica; outros valores ou campos vazios não comprovam emissão.";

  return Object.freeze({
    DB_NAME, DB_STORE, LEGACY_SIGEM_BASE_KEY, LEGACY_PW_BASE_KEY, SIGEM_BASE_KEY, PW_BASE_KEY, LD_BASE_KEY, HISTORY_KEY,
    PW_BASE_VERSION, HISTORY_VERSION, PW_SCOPE_VERSION, LD_VALIDATION_VERSION, N1710_CODE_RE, N1710_CANDIDATE_RE, UNCLASSIFIED, SCOPE_CLASSES, DOCUMENT_CLASSES: SCOPE_CLASSES,
    EMISSION_FLAGS, EMISSION_RULE, COMPARISON_SITUATIONS, PW_HEADER_ALIASES, REQUIRED_PW_FIELDS, REVISION_SCOPES,
    text, norm, normalizeHeader, canonicalDocumentCode, isC1OCode, isCvDocumentCode, partitionC1ORecords,
    PW_COMPANIES, PW_COMPANY_COLUMN_INDEX, companyCodes, recordCompany, isPwCompanyInScope, partitionPwCompanyRecords, documentIdentity, documentClass, n1710DocumentType, isN1710Candidate,
    revisionKey, normalizeRevisionScope, scopeRevisionMap, revisionLabel, entryKey, revisionRank, parseDateMs, detectDelimiter, forEachDelimitedRow, mapPwColumns, validatePwColumns,
    parsePwCsv, parseLdMatrix, buildLdUniverse, scopeClassFor, normalizeRecords, normalizeSigemRecords, sanitizePwRecords, sanitizePwBase, buildEntryMap, buildDocumentMap,
    createModel, groupEntriesByDocument, buildComparisonLists, summarizeClassesFromLists, aggregateModel, aggregate,
    openDb, storedValue, putKv, kvGet, kvSet, kvSetMany, loadSigemBase, loadPwBase, loadLdBase, loadHistory,
    saveBase, saveSigemBase, savePwBase, saveLdBase, saveLdAndReprocessPw, updateSnapshotDate, updateSnapshotMetadata, deleteSnapshot, migrateLegacyBases, loadBases,
  });
});
