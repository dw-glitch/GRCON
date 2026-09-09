/**
 * GRCON — Utilitários Compartilhados
 * Versão: 5.32.24
 *
 * Módulo centralizado com funções utilitárias que antes eram
 * copiadas em dezenas de arquivos. Todos os módulos devem usar
 * window.GrconUtils ao invés de redefinir essas funções.
 */
(function (root) {
  "use strict";

  /* ── Normalização de texto ──────────────────────────────── */

  /**
   * Limpa valor para string, tratando null/undefined.
   * @param {*} value
   * @returns {string}
   */
  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  /**
   * Normaliza texto para comparação: remove acentos, uppercase, espaços.
   * @param {*} value
   * @returns {string}
   */
  function norm(value) {
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();
  }

  /* ── Segurança ──────────────────────────────────────────── */

  /**
   * Escapa HTML para prevenir XSS ao inserir em innerHTML.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ── Formatação de datas ────────────────────────────────── */

  /**
   * Preenche número com zeros à esquerda.
   * @param {*} value
   * @param {number} [size=2]
   * @returns {string}
   */
  function pad(value, size) {
    return String(value).padStart(size || 2, "0");
  }

  /**
   * Formata data para exibição no padrão brasileiro.
   * @param {Date|string|number} value
   * @param {boolean} [withTime=true]
   * @returns {string}
   */
  function formatDate(value, withTime) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    if (withTime === false) {
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
    }
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  /**
   * Formata data apenas no padrão DD/MM/YYYY.
   * @param {Date|string} value
   * @returns {string}
   */
  function formatDateOnlyBR(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
    }
    const raw = text(value);
    let match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (match) return `${pad(match[1])}/${pad(match[2])}/${match[3]}`;
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return raw || "—";
  }

  /**
   * Gera timestamp compacto para nomes de arquivo.
   * @param {Date} [date]
   * @returns {string}
   */
  function compactStamp(date) {
    const d = date || new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  /* ── Armazenamento ──────────────────────────────────────── */

  /**
   * Calcula tamanho em bytes de um valor string (UTF-8).
   * @param {*} value
   * @returns {number}
   */
  function byteSize(value) {
    try {
      return new Blob([String(value)]).size;
    } catch (_) {
      console.debug("[GrconUtils] byteSize: Blob indisponível, usando estimativa.");
      return String(value).length * 2;
    }
  }

  /**
   * Retorna o storage recebido ou localStorage como fallback.
   * @param {Storage} [storage]
   * @returns {Storage|null}
   */
  function storageOf(storage) {
    return storage || (typeof localStorage !== "undefined" ? localStorage : null);
  }

  /* ── Download ───────────────────────────────────────────── */

  /**
   * Inicia download de um Blob como arquivo.
   * @param {Blob} blob
   * @param {string} filename
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || "download";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 200);
  }

  /* ── DOM helpers ────────────────────────────────────────── */

  /**
   * querySelector com raiz opcional.
   * @param {string} selector
   * @param {Element} [root]
   * @returns {Element|null}
   */
  function $(selector, rootNode) {
    return (rootNode || document).querySelector(selector);
  }

  /**
   * querySelectorAll retornando Array.
   * @param {string} selector
   * @param {Element} [root]
   * @returns {Element[]}
   */
  function $$(selector, rootNode) {
    return Array.from((rootNode || document).querySelectorAll(selector));
  }

  /* ── Parsing de data ────────────────────────────────────── */

  /**
   * Converte valor para Date, suportando formatos BR e ISO.
   * @param {*} value
   * @returns {Date|null}
   */
  function parseDateValue(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number" && Number.isFinite(value)) {
      const numericDate = new Date(value);
      return Number.isNaN(numericDate.getTime()) ? null : numericDate;
    }
    const raw = text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!br) return null;
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const hour = Number(br[4] || 0);
    const minute = Number(br[5] || 0);
    const second = Number(br[6] || 0);
    const local = new Date(year, month - 1, day, hour, minute, second, 0);
    if (Number.isNaN(local.getTime())) return null;
    return local;
  }

  /* ── Identidade documental / EAP ─────────────────────────
   *
   * Regra central:
   * - ET/RIR/C&M no padrão *_RNEST_* possui EAP no 4º grupo estrutural.
   * - EAP válido = quatro grupos numéricos separados por ponto.
   * - EAP diferente = documento diferente, ainda que TAG e tipo coincidam.
   * - CV e N-1710 preservam seus parsers/regras próprias; EAP não é forçado.
   *
   * Este bloco é deliberadamente único. Os módulos não devem criar regex
   * paralelas de EAP.
   * ───────────────────────────────────────────────────────── */

  const EAP_RE = /^\d+\.\d+\.\d+\.\d+$/;
  const DOCUMENT_EXTENSION_RE = /\.(?:PDF|DOCX?|XLSX?|XLSM|DWG|DGN|PPTX?|ZIP)$/i;
  const CONFUSABLE = Object.freeze({ O: "0", I: "1", L: "1", S: "5", Z: "2", B: "8" });

  function canonicalDocumentText(value) {
    return norm(value)
      .replace(/\s*([_.-])\s*/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function basenameDocumentText(value) {
    const raw = text(value).split(/[\\/]/).pop() || "";
    return canonicalDocumentText(raw).replace(DOCUMENT_EXTENSION_RE, "");
  }

  /**
   * Extrai o trecho ET mesmo quando o código está dentro do nome do arquivo.
   * O Grupo 7 pode trazer sufixos operacionais no nome; para a identidade EAP
   * precisamos dos grupos estruturais 1–6 e do início do identificador.
   */
  function etTokenFrom(value) {
    const normalized = basenameDocumentText(value);
    if (!normalized) return "";
    const marker = normalized.indexOf("_RNEST_");
    if (marker < 3) return "";
    const start = marker - 3;
    const emitter = normalized.slice(start, marker);
    const before = start > 0 ? normalized[start - 1] : "";
    if (!/^[A-Z0-9]{3}$/.test(emitter) || (before && /[A-Z0-9]/.test(before))) return "";
    return normalized.slice(start).split(/\s/)[0] || "";
  }

  function eapIrregularities(rawEap, groups) {
    const issues = [];
    const eap = text(rawEap);
    if (!eap) {
      issues.push({ code: "EAP_MISSING", message: "Não foi possível identificar o EAP esperado no quarto grupo do código documental." });
      return issues;
    }
    if (!EAP_RE.test(eap)) {
      const parts = eap.split(".");
      if (parts.length !== 4) {
        issues.push({
          code: "EAP_GROUP_COUNT",
          message: `O EAP identificado “${eap}” não possui os quatro grupos numéricos esperados.`,
        });
      }
      if (parts.some((part) => !/^\d+$/.test(part))) {
        issues.push({
          code: "EAP_NON_NUMERIC",
          message: `O EAP identificado “${eap}” contém grupo vazio ou não numérico.`,
        });
      }
      if (!issues.length) {
        issues.push({ code: "EAP_INVALID", message: `O EAP identificado “${eap}” está fora do padrão documental.` });
      }
      const displaced = (groups || [])
        .map((part, index) => ({ part: text(part), index }))
        .find((item) => item.index !== 3 && EAP_RE.test(item.part));
      if (displaced) {
        issues.push({
          code: "EAP_DISPLACED",
          message: `Há uma estrutura semelhante a EAP no grupo ${displaced.index + 1}; o EAP esperado fica no quarto grupo.`,
        });
      }
    }
    return issues;
  }

  /**
   * Uma única fonte de verdade para identidade documental.
   */
  function parseDocumentIdentity(value, options) {
    const settings = options || {};
    const original = text(value);
    const normalized = basenameDocumentText(original);
    const etToken = etTokenFrom(original);

    if (etToken) {
      const groups = etToken.split("_");
      const eap = text(groups[3]);
      const irregularities = eapIrregularities(eap, groups);
      const identifier = text(groups[6]);
      const isNonTagged = /^NT-/i.test(identifier);
      const tag = isNonTagged ? identifier.replace(/^NT-/i, "") : identifier;
      const codeNormalized = groups.length >= 7 ? groups.slice(0, 7).join("_") : etToken;
      return {
        codeOriginal: original,
        codeNormalized,
        family: "ET",
        eapApplicable: true,
        eap,
        eapValid: EAP_RE.test(eap),
        documentType: text(groups[5]),
        discipline: text(groups[4]),
        area: text(groups[2]),
        tag,
        tagComparable: norm(tag).replace(/[^A-Z0-9]/g, ""),
        nonTagged: isNonTagged,
        irregularities,
        structuralGroups: groups,
      };
    }

    // Currículo: a estrutura já validada pelo motor é instrumento-emissor-CV-
    // disciplina-sequencial. Não tratar o primeiro bloco pontuado como EAP.
    if (/^5900(?:\.\d+){3}-[A-Z0-9]{3}-CV-[A-Z0-9]+-\d{3,4}$/i.test(normalized)
        || norm(settings.sheetName) === "CV") {
      return {
        codeOriginal: original,
        codeNormalized: normalized,
        family: "CV",
        eapApplicable: false,
        eap: "",
        eapValid: null,
        documentType: "CV",
        discipline: "",
        area: "",
        tag: "",
        tagComparable: "",
        nonTagged: false,
        irregularities: [],
        structuralGroups: normalized.split("-"),
      };
    }

    // N-1710 tem estrutura contratual própria e não usa o EAP do quarto grupo
    // dos relatórios ET.
    if (/-5290\.00-/i.test(normalized) || /^N-1710(?:\s|$)/i.test(norm(settings.sheetName))) {
      return {
        codeOriginal: original,
        codeNormalized: normalized,
        family: "N-1710",
        eapApplicable: false,
        eap: "",
        eapValid: null,
        documentType: "",
        discipline: "",
        area: "",
        tag: "",
        tagComparable: "",
        nonTagged: false,
        irregularities: [],
        structuralGroups: normalized.split("-"),
      };
    }

    return {
      codeOriginal: original,
      codeNormalized: normalized,
      family: text(settings.sheetName),
      eapApplicable: false,
      eap: "",
      eapValid: null,
      documentType: "",
      discipline: "",
      area: "",
      tag: "",
      tagComparable: "",
      nonTagged: false,
      irregularities: [],
      structuralGroups: [],
    };
  }

  function documentIdentityKey(value, options) {
    const identity = parseDocumentIdentity(value, options);
    if (identity.eapApplicable && identity.eapValid) {
      return [
        identity.family,
        identity.eap,
        norm(identity.documentType),
        identity.tagComparable,
        identity.codeNormalized,
      ].join("::");
    }
    return identity.codeNormalized || canonicalDocumentText(value);
  }

  function eapTypeTagKey(identity) {
    const item = identity || {};
    if (!item.eapApplicable || !item.eapValid || !item.tagComparable) return "";
    return `${item.eap}::${norm(item.documentType)}::${item.tagComparable}`;
  }

  function typeTagKey(identity, confusable) {
    const item = identity || {};
    if (!item.documentType || !item.tagComparable) return "";
    const tag = confusable
      ? item.tagComparable.replace(/[OILSZB]/g, (character) => CONFUSABLE[character] || character)
      : item.tagComparable;
    return `${norm(item.documentType)}::${tag}`;
  }

  /**
   * Compara somente a parte de identidade que o EAP governa. O restante do
   * matching continua com o motor existente (código, tipo, TAG, revisão etc.).
   */
  function compareDocumentIdentity(inputValue, candidateValue, options) {
    const input = parseDocumentIdentity(inputValue, options);
    const candidate = parseDocumentIdentity(candidateValue, options);
    const exact = Boolean(
      input.codeNormalized
      && candidate.codeNormalized
      && input.codeNormalized === candidate.codeNormalized
    );

    if (!input.eapApplicable) {
      return { allowed: true, exact, reason: "EAP_NOT_APPLICABLE", input, candidate };
    }
    if (!candidate.eapApplicable) {
      return { allowed: false, exact, reason: "FAMILY_MISMATCH", input, candidate };
    }
    if (exact) {
      return {
        allowed: true,
        exact: true,
        reason: input.eapValid && candidate.eapValid ? "EXACT" : "EXACT_WITH_INVALID_EAP",
        input,
        candidate,
      };
    }
    if (!input.eapValid || !candidate.eapValid) {
      return { allowed: false, exact: false, reason: "EAP_INVALID", input, candidate };
    }
    if (input.eap !== candidate.eap) {
      return { allowed: false, exact: false, reason: "EAP_MISMATCH", input, candidate };
    }
    if (input.documentType && candidate.documentType
        && norm(input.documentType) !== norm(candidate.documentType)) {
      return { allowed: false, exact: false, reason: "DOCUMENT_TYPE_MISMATCH", input, candidate };
    }
    return { allowed: true, exact: false, reason: "EAP_MATCH", input, candidate };
  }

  function diagnosticMessage(comparison) {
    const cmp = comparison || {};
    if (cmp.reason === "EAP_MISMATCH") {
      return `TAG localizada em outro EAP — não considerada correspondência. EAP pesquisado: ${cmp.input && cmp.input.eap || "não identificado"}. EAP encontrado: ${cmp.candidate && cmp.candidate.eap || "não identificado"}.`;
    }
    if (cmp.reason === "EAP_INVALID") {
      const inputEap = cmp.input && cmp.input.eap;
      return inputEap
        ? `EAP inválido ou fora do padrão documental: “${inputEap}”. Nenhuma associação aproximada foi feita.`
        : "Não foi possível identificar o EAP esperado neste código documental. Nenhuma associação aproximada foi feita.";
    }
    if (cmp.reason === "FAMILY_MISMATCH") {
      return "A estrutura documental do candidato não pertence à mesma família do documento pesquisado.";
    }
    if (cmp.reason === "DOCUMENT_TYPE_MISMATCH") {
      return "EAP e TAG não substituem o tipo documental; o candidato pertence a outro tipo de documento.";
    }
    return "";
  }

  function attachIdentity(record, options) {
    if (!record || typeof record !== "object") return null;
    const identity = parseDocumentIdentity(record.documentKey || record.document, {
      ...(options || {}),
      sheetName: record.sheet || (options && options.sheetName),
    });
    try {
      Object.defineProperty(record, "documentIdentityInfo", {
        value: identity,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    } catch (_) {
      record.documentIdentityInfo = identity;
    }
    return identity;
  }

  function candidateIdentity(candidate) {
    if (!candidate) return parseDocumentIdentity("");
    const records = candidate.group && candidate.group.records || [];
    const source = candidate.document || (records[0] && records[0].document) || candidate.documentKey || "";
    return parseDocumentIdentity(source, { sheetName: records[0] && records[0].sheet });
  }

  function filterCandidatesByIdentity(inputValue, candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const accepted = [];
    const rejected = [];
    list.forEach((candidate) => {
      const comparison = compareDocumentIdentity(inputValue, candidate && (candidate.document || candidate.documentKey));
      if (comparison.allowed) {
        accepted.push(candidate);
      } else {
        rejected.push({ candidate, comparison, message: diagnosticMessage(comparison) });
      }
    });
    try {
      Object.defineProperty(accepted, "eapDiagnostics", {
        value: {
          input: parseDocumentIdentity(inputValue),
          rejected,
          rejectedByEap: rejected.filter((item) => item.comparison.reason === "EAP_MISMATCH"),
          rejectedInvalid: rejected.filter((item) => item.comparison.reason === "EAP_INVALID"),
        },
        configurable: true,
        enumerable: false,
      });
    } catch (_) {
      accepted.eapDiagnostics = { input: parseDocumentIdentity(inputValue), rejected };
    }
    return accepted;
  }

  function augmentDocumentIndex(index) {
    if (!index || typeof index !== "object") return index;
    const byEap = new Map();
    const byEapTypeTag = new Map();
    const byTypeTag = new Map();
    const identityByDocument = new Map();

    (index.documents || []).forEach((entry) => {
      const identity = candidateIdentity(entry);
      identityByDocument.set(entry.documentKey, identity);
      if (identity.eapApplicable && identity.eapValid) {
        if (!byEap.has(identity.eap)) byEap.set(identity.eap, []);
        byEap.get(identity.eap).push(entry);
      }
      const compound = eapTypeTagKey(identity);
      if (compound) {
        if (!byEapTypeTag.has(compound)) byEapTypeTag.set(compound, []);
        byEapTypeTag.get(compound).push(entry);
      }
      const simple = typeTagKey(identity, false);
      if (simple) {
        if (!byTypeTag.has(simple)) byTypeTag.set(simple, []);
        byTypeTag.get(simple).push(entry);
      }
    });

    index.byEap = byEap;
    index.byEapTypeTag = byEapTypeTag;
    index.byTypeTag = byTypeTag;
    index.identityByDocument = identityByDocument;
    return index;
  }

  /**
   * Cria uma visão do índice restrita ao EAP pesquisado para funções internas
   * do core que ainda executam o fallback por tipo+TAG dentro de triageOne.
   */
  function indexForIdentity(index, inputValue) {
    const input = parseDocumentIdentity(inputValue);
    if (!index || !input.eapApplicable || !input.eapValid) return index;

    const view = { ...index };
    const compatibleDocuments = (index.documents || []).filter((entry) => {
      const identity = candidateIdentity(entry);
      return !identity.eapApplicable || (identity.eapValid && identity.eap === input.eap);
    });
    view.documents = compatibleDocuments;

    const exact = new Map();
    const confusable = new Map();
    compatibleDocuments.forEach((entry) => {
      const identity = candidateIdentity(entry);
      if (!identity.eapApplicable || !identity.eapValid || identity.eap !== input.eap) return;
      const exactKey = typeTagKey(identity, false);
      const confusableKey = typeTagKey(identity, true);
      if (exactKey) {
        if (!exact.has(exactKey)) exact.set(exactKey, []);
        exact.get(exactKey).push(entry);
      }
      if (confusableKey) {
        if (!confusable.has(confusableKey)) confusable.set(confusableKey, []);
        confusable.get(confusableKey).push(entry);
      }
    });
    view.byEtReportTag = exact;
    view.byEtReportTagConfusable = confusable;
    return view;
  }

  function centralValidation(identity) {
    const item = identity || {};
    if (!item.eapApplicable) return [];
    return (item.irregularities || []).map((issue) => issue.message);
  }

  function rewriteLookupForEap(base, inputValue, match, candidates) {
    const result = { ...(base || {}) };
    const diagnostics = candidates && candidates.eapDiagnostics;
    const inputIdentity = diagnostics && diagnostics.input || parseDocumentIdentity(inputValue);
    const matchIdentity = match ? candidateIdentity(match) : null;
    const rejectedByEap = diagnostics && diagnostics.rejectedByEap || [];
    const rejectedInvalid = diagnostics && diagnostics.rejectedInvalid || [];

    result.eapApplicable = Boolean(inputIdentity.eapApplicable);
    result.eapSearched = inputIdentity.eap || "";
    result.eapValid = inputIdentity.eapValid;
    result.eapCandidate = matchIdentity && matchIdentity.eap || "";
    result.eapMatched = Boolean(
      matchIdentity
      && inputIdentity.eapValid
      && matchIdentity.eapValid
      && inputIdentity.eap === matchIdentity.eap
    );
    result.eapDiagnostics = diagnostics || { input: inputIdentity, rejected: [] };

    if (!match && rejectedByEap.length) {
      const foundEaps = [...new Set(rejectedByEap.map((item) => item.comparison.candidate.eap).filter(Boolean))];
      result.searchResult = "eap-mismatch";
      result.resultLabel = "TAG LOCALIZADA EM OUTRO EAP — NÃO CORRESPONDENTE";
      result.message = `TAG localizada em outro EAP — não considerada correspondência. EAP pesquisado: ${inputIdentity.eap || "não identificado"}. EAP encontrado: ${foundEaps.join(", ") || "não identificado"}. O registro foi descartado para impedir associação de documentos diferentes.`;
      result.eapEvidence = rejectedByEap.map((item) => ({
        searchedEap: item.comparison.input.eap,
        candidateEap: item.comparison.candidate.eap,
        candidateDocument: item.candidate && item.candidate.document || "",
        result: "descartado por divergência de EAP",
      }));
      return result;
    }

    if (!match && inputIdentity.eapApplicable && !inputIdentity.eapValid) {
      const issue = inputIdentity.irregularities && inputIdentity.irregularities[0];
      result.searchResult = "eap-invalid";
      result.resultLabel = "EAP INVÁLIDO — CONFERIR CÓDIGO";
      result.message = issue && issue.message
        ? `${issue.message} Nenhuma associação aproximada foi feita e o valor não foi corrigido automaticamente.`
        : "EAP inválido ou fora do padrão documental. Nenhuma associação aproximada foi feita.";
      return result;
    }

    if (!match && rejectedInvalid.length && !result.message) {
      result.message = rejectedInvalid[0].message;
    }

    if (match && result.matchedByReportTag && inputIdentity.eapValid) {
      result.resultLabel = "LOCALIZADO PELO EAP + TIPO + TAG — USAR O CÓDIGO DA LD";
      result.message = `Pesquisa pelo código completo com e sem nt- realizada. Como essas formas não foram localizadas, o GRCON pesquisou a combinação EAP “${inputIdentity.eap}” + tipo “${text(result.searchedReportCode) || norm(inputIdentity.documentType)}” + TAG “${text(result.searchedTag) || inputIdentity.tag}” e encontrou uma única correspondência no mesmo EAP: “${text(result.ldDocument) || text(match.document)}”. O arquivo final e a eGRDT usarão o código controlado da LD.`;
    }
    return result;
  }

  function rewriteRenameForEap(result, inputIdentity) {
    if (!result || !inputIdentity || !inputIdentity.eapValid || !result.ldRename) return result;
    const rename = { ...result.ldRename };
    if (rename.motivo === "tipo+tag") rename.motivo = "eap+tipo+tag";
    if (rename.nota) {
      rename.nota = rename.nota
        .replace(/combinação tipo/gi, `combinação EAP “${inputIdentity.eap}” + tipo`)
        .replace(/tipo \+ TAG/gi, "EAP + tipo + TAG");
    }
    const previousNote = result.ldRename.nota;
    const next = { ...result, ldRename: rename };
    if (previousNote && rename.nota && text(next.reason).includes(previousNote)) {
      next.reason = text(next.reason).replace(previousNote, rename.nota);
    }
    return next;
  }

  function wrapTriagemCore(api) {
    if (!api || typeof api !== "object" || api.__eapIdentityGuarded) return api;

    const original = api;
    const wrapped = { ...api };

    wrapped.parseDocumentIdentity = parseDocumentIdentity;
    wrapped.documentIdentityKey = documentIdentityKey;
    wrapped.compareDocumentIdentity = compareDocumentIdentity;
    wrapped.filterCandidatesByIdentity = filterCandidatesByIdentity;
    wrapped.eapTypeTagKey = eapTypeTagKey;
    wrapped.eapDiagnosticMessage = diagnosticMessage;

    wrapped.isEtDocument = function guardedIsEtDocument(value, sheetName) {
      const identity = parseDocumentIdentity(value, { sheetName });
      return identity.family === "ET" || original.isEtDocument(value, sheetName);
    };

    wrapped.documentSearchKeys = function guardedDocumentSearchKeys(value) {
      const identity = parseDocumentIdentity(value);
      if (identity.eapApplicable && !identity.eapValid) {
        const exact = original.key ? original.key(value) : canonicalDocumentText(value);
        return exact ? [exact] : [];
      }
      return original.documentSearchKeys(value);
    };

    wrapped.parseWorkbook = function guardedParseWorkbook(...args) {
      const parsed = original.parseWorkbook(...args);
      [...(parsed && parsed.records || []), ...(parsed && parsed.history || [])].forEach((record) => attachIdentity(record));
      return parsed;
    };

    wrapped.buildIndex = function guardedBuildIndex(records, history) {
      [...(records || []), ...(history || [])].forEach((record) => {
        if (!record.documentIdentityInfo) attachIdentity(record);
      });
      return augmentDocumentIndex(original.buildIndex(records, history));
    };

    wrapped.exactDocumentMatch = function guardedExactDocumentMatch(value, index) {
      const candidate = original.exactDocumentMatch(value, index);
      if (!candidate) return null;
      const comparison = compareDocumentIdentity(value, candidate.document || candidate.documentKey);
      return comparison.allowed ? candidate : null;
    };

    wrapped.compactDocumentCandidates = function guardedCompactCandidates(value, index) {
      return filterCandidatesByIdentity(value, original.compactDocumentCandidates(value, index));
    };

    wrapped.fuzzyDocumentCandidates = function guardedFuzzyCandidates(value, index) {
      return filterCandidatesByIdentity(value, original.fuzzyDocumentCandidates(value, index));
    };

    wrapped.matchDocuments = function guardedMatchDocuments(value, index, hintedSheet) {
      const candidates = original.matchDocuments(value, index, hintedSheet);
      return filterCandidatesByIdentity(value, candidates);
    };

    wrapped.matchDocument = function guardedMatchDocument(value, index, hintedSheet) {
      return wrapped.matchDocuments(value, index, hintedSheet)[0] || null;
    };

    wrapped.documentLookup = function guardedDocumentLookup(value, match, candidates) {
      const base = original.documentLookup(value, match, candidates);
      return rewriteLookupForEap(base, value, match, candidates);
    };

    wrapped.validateDocumentCode = function guardedValidateDocumentCode(document, sheetName) {
      const base = original.validateDocumentCode(document, sheetName);
      const identity = parseDocumentIdentity(document, { sheetName });
      if (!identity.eapApplicable) return { ...base, documentIdentity: identity, eap: "", eapValid: null, irregularities: [] };
      const centralErrors = centralValidation(identity);
      const existingErrors = (base.errors || []).filter((message) => !/EAP do relat[oó]rio/i.test(message));
      const errors = [...new Set([...existingErrors, ...centralErrors])];
      return {
        ...base,
        valid: Boolean(base.valid) && identity.eapValid && errors.length === 0,
        family: "ET",
        errors,
        documentIdentity: identity,
        eap: identity.eap,
        eapValid: identity.eapValid,
        irregularities: identity.irregularities,
      };
    };

    wrapped.validateEgrdtData = function guardedValidateEgrdtData(data) {
      const base = original.validateEgrdtData(data);
      const document = data && data.document;
      const sheetName = data && (data.sheet || data.sheetName);
      const code = wrapped.validateDocumentCode(document, sheetName);
      const eapErrors = code.eapValid === false ? code.errors.filter((message) => /EAP/i.test(message)) : [];
      if (!eapErrors.length) return base;
      if (Array.isArray(base)) return [...new Set([...base, ...eapErrors])];
      if (base && typeof base === "object") {
        const errors = [...new Set([...(base.errors || []), ...eapErrors])];
        return { ...base, valid: false, errors, documentIdentity: code.documentIdentity };
      }
      return base;
    };

    wrapped.buildEgrdtData = function guardedBuildEgrdtData(...args) {
      const data = original.buildEgrdtData(...args);
      return { ...data, documentIdentity: parseDocumentIdentity(data && data.document, { sheetName: args[4] }) };
    };

    wrapped.applyOfficialCodeRename = function guardedApplyOfficialCodeRename(result, input) {
      const base = original.applyOfficialCodeRename(result, input);
      return rewriteRenameForEap(base, parseDocumentIdentity(input && (input.document || input.name)));
    };

    wrapped.triageOne = function guardedTriageOne(input, index, options) {
      const sourceValue = input && (input.document || input.name) || "";
      const identity = parseDocumentIdentity(sourceValue, { sheetName: input && input.hintedSheet });
      const safeMatches = wrapped.matchDocuments(sourceValue, index, input && input.hintedSheet);
      const safeLookup = wrapped.documentLookup(sourceValue, safeMatches.length === 1 ? safeMatches[0] : null, safeMatches);
      const safeIndex = indexForIdentity(index, sourceValue);
      const safeInput = { ...(input || {}), documentLookupHint: safeLookup };
      let result = original.triageOne(safeInput, safeIndex, options);

      if (result && result.document && identity.eapApplicable) {
        const comparison = compareDocumentIdentity(sourceValue, result.document, { sheetName: result.sheet });
        if (!comparison.allowed && comparison.reason === "EAP_MISMATCH") {
          result = {
            ...result,
            document: text(input && input.document) || "Não localizado",
            documentKey: "",
            status: "EAP divergente — documento não conciliado",
            decision: original.REVIEW || "revisar",
            hardBlock: false,
            blockCode: "",
            record: {},
            egrdt: {},
            databook: "",
            reason: `${diagnosticMessage(comparison)} Um resultado “não encontrado” foi mantido no lugar de dados pertencentes a outro documento.`,
          };
        }
      }

      const codeTarget = result && result.document && result.document !== "Não localizado"
        ? result.document
        : sourceValue;
      const validation = wrapped.validateDocumentCode(codeTarget, result && result.sheet || input && input.hintedSheet);
      if (validation.eapValid === false) {
        result = {
          ...result,
          codeValidation: validation,
          decision: original.REVIEW || "revisar",
          hardBlock: true,
          blockCode: "eap_invalid",
          status: "EAP inválido",
          reason: `${validation.errors.filter((message) => /EAP/i.test(message)).join(" ")} ${text(result && result.reason)}`.trim(),
        };
      }
      result = rewriteRenameForEap(result, identity);
      if (result && identity.eapApplicable) {
        result.eapAudit = {
          searchedEap: identity.eap,
          searchedEapValid: identity.eapValid,
          candidateEap: parseDocumentIdentity(result.document, { sheetName: result.sheet }).eap,
          rejectedCandidates: safeMatches.eapDiagnostics && safeMatches.eapDiagnostics.rejected
            ? safeMatches.eapDiagnostics.rejected.map((item) => ({
              document: item.candidate && item.candidate.document || "",
              eap: item.comparison.candidate.eap,
              reason: item.comparison.reason,
            }))
            : [],
        };
      }
      return result;
    };

    try {
      Object.defineProperty(wrapped, "__eapIdentityGuarded", {
        value: true,
        enumerable: false,
        configurable: false,
      });
    } catch (_) {
      wrapped.__eapIdentityGuarded = true;
    }
    return wrapped;
  }

  /**
   * grcon_utils.js é carregado antes de core.js. O setter intercepta a
   * publicação de TriagemCore e aplica o guard uma única vez, sem duplicar o
   * motor nem exigir alteração na ordem atual dos scripts.
   */
  function installTriagemCoreGuard() {
    let current = root.TriagemCore ? wrapTriagemCore(root.TriagemCore) : null;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(root, "TriagemCore");
      if (descriptor && descriptor.configurable === false) {
        if (current) root.TriagemCore = current;
        return;
      }
      Object.defineProperty(root, "TriagemCore", {
        configurable: true,
        enumerable: true,
        get() { return current; },
        set(value) { current = wrapTriagemCore(value); },
      });
    } catch (_) {
      if (root.TriagemCore) root.TriagemCore = wrapTriagemCore(root.TriagemCore);
    }
  }

  const DocumentIdentity = Object.freeze({
    EAP_RE,
    canonicalDocumentText,
    parse: parseDocumentIdentity,
    key: documentIdentityKey,
    compare: compareDocumentIdentity,
    filterCandidates: filterCandidatesByIdentity,
    eapTypeTagKey,
    diagnosticMessage,
    augmentIndex: augmentDocumentIndex,
  });

  /* ── API Pública ────────────────────────────────────────── */

  root.GrconUtils = Object.freeze({
    text,
    norm,
    escapeHtml,
    pad,
    formatDate,
    formatDateOnlyBR,
    compactStamp,
    byteSize,
    storageOf,
    downloadBlob,
    $,
    $$,
    parseDateValue,
    DocumentIdentity,
    parseDocumentIdentity,
    documentIdentityKey,
    compareDocumentIdentity,
  });

  installTriagemCoreGuard();
})(typeof globalThis !== "undefined" ? globalThis : this);
