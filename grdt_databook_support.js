(function (root, factory) {
  const core = root.TriagemCore || (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconDatabookSupport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  const catalogMetaCache = new WeakMap();
  const suggestionCache = new Map();
  const TITLE_STOP_WORDS = new Set([
    "A", "AS", "AO", "AOS", "COM", "DA", "DAS", "DE", "DO", "DOS", "E", "EM", "NA", "NAS", "NO", "NOS",
    "O", "OS", "PARA", "POR", "UM", "UMA", "MCM", "UHDT", "UHDTD", "U32", "C1O", "C",
  ]);

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function norm(value) {
    return C && C.norm ? C.norm(value) : text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  }


  function key(value) {
    return C && C.key ? C.key(value) : norm(value).replace(/\s*([_.-])\s*/g, "$1");
  }

  function pathKey(value) {
    return norm(value)
      .replace(/EDECUCAO/g, "EXECUCAO")
      .replace(/INTRUMENT/g, "INSTRUMENT")
      .replace(/\s*\|\s*/g, "|");
  }

  function completeDatabook(value) {
    const raw = text(value);
    return Boolean(raw && raw.split("|").filter((part) => part.trim()).length >= 3);
  }

  function titleKind(value) {
    const title = norm(value);
    const rules = [
      ["CURRICULO", /\bCURRICULO\b/],
      ["IEIS", /\bIEIS\b|INSTRUCAO DE EXECUCAO E INSPECAO DE SOLDAGEM/],
      ["EPS", /\bEPS\b|ESPECIFICACAO DE PROCEDIMENTO DE SOLDAGEM/],
      ["RQPS", /\bRQPS\b|QUALIFICACAO DE PROCEDIMENTO DE SOLDAGEM/],
      ["RQS", /\bRQS\b|QUALIFICACAO DE SOLDADOR/],
      ["RSQ", /\bRSQ\b|RELACAO DE SOLDADORES QUALIFICADOS/],
      ["RIR", /\bRIR\b|INSPECAO DE RECEBIMENTO/],
      ["RNC", /\bRNC\b|RELATORIO DE NAO CONFORMIDADE/],
      ["DATA BOOK", /\bDATA BOOK\b/],
      ["PLANO", /\bPLANO\b/],
      ["PROCEDIMENTO", /\bPROCEDIMENTO\b/],
      ["RELATORIO", /\bRELATORIO\b/],
      ["CERTIFICADO", /\bCERTIFICACAO\b|\bCERTIFICADO\b/],
    ];
    const found = rules.find(([, pattern]) => pattern.test(title));
    return found ? found[0] : "";
  }

  function titleTokens(value) {
    return new Set(norm(value).split(/[^A-Z0-9]+/).filter((token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token)));
  }

  function titleSimilarity(left, right) {
    const a = titleTokens(left);
    const b = titleTokens(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    a.forEach((token) => { if (b.has(token)) intersection += 1; });
    return intersection / Math.max(a.size, b.size);
  }

  function subjectTags(document, title, databook) {
    const rawDocument = norm(document);
    const searchable = norm(`${title || ""} ${databook || ""}`).replace(/[^A-Z0-9]+/g, " ");
    const tags = new Set();
    const has = (pattern) => pattern.test(searchable);
    if (has(/\bMOTORES?\b/)) tags.add("MOTOR");
    if (has(/\bCABOS?\b|\bBOBINA\b/)) tags.add("CABO");
    if (has(/\bTRANSFORMADOR(?:ES)?\b/)) tags.add("TRANSFORMADOR");
    if (has(/\bCAIXA(?:S)?\b|\bBORNE\b/)) tags.add("CAIXA");
    if (has(/\bINFRAESTRUTURA\b|\bELETRODUTO\b|\bLEITO\b|\bBANDEJA\b/)) tags.add("INFRAESTRUTURA");
    if (has(/\bPAINEL(?:ES|S)?\b/)) tags.add("PAINEL");
    if (has(/\bVASOS?\b|\bTANQUES?\b/)) tags.add("VASO_TANQUE");
    if (has(/\bFORNOS?\b|\bQUEIMADORES?\b/)) tags.add("FORNO_QUEIMADOR");
    if (has(/\bTURBINAS?\b/)) tags.add("TURBINA");
    if (has(/\bESTRUTURA METALICA\b/)) tags.add("ESTRUTURA_METALICA");
    if (has(/\bACABAMENTO\b/)) tags.add("ACABAMENTO");
    if (has(/\bINSTRUMENTACAO\b/) && !tags.size) tags.add("INSTRUMENTO");
    if (tags.size) return tags;
    if (/_M-/.test(rawDocument)) tags.add("MOTOR");
    if (/_BOBINA|_NT-C-/.test(rawDocument)) tags.add("CABO");
    if (/_(?:TLE|TF)-/.test(rawDocument)) tags.add("TRANSFORMADOR");
    if (/_(?:CBT|CJA|CJV)-/.test(rawDocument)) tags.add("CAIXA");
    if (/_NT-(?:LBR|ETR)-/.test(rawDocument)) tags.add("INFRAESTRUTURA");
    if (/_PN-/.test(rawDocument)) tags.add("PAINEL");
    if (/_V-/.test(rawDocument)) tags.add("VASO_TANQUE");
    if (/_(?:F-|Q-F-)/.test(rawDocument)) tags.add("FORNO_QUEIMADOR");
    if (/_TB-/.test(rawDocument)) tags.add("TURBINA");
    if (/_NT-EMT-/.test(rawDocument)) tags.add("ESTRUTURA_METALICA");
    if (/_NT-LAC_/.test(rawDocument)) tags.add("ACABAMENTO");
    if (/_(?:PI|CJP|CJF|CJD)-/.test(rawDocument)) tags.add("INSTRUMENTO");
    return tags;
  }

  function setsIntersect(left, right) {
    for (const value of left) if (right.has(value)) return true;
    return false;
  }

  function disciplineKey(value) {
    return norm(value).split(/[|/]/).filter(Boolean).at(-1) || "";
  }

  function conflictEvidence(alternatives) {
    return {
      databook: "",
      levels: [],
      source: "Conflito no Mapa Databook",
      sourceType: "catalog",
      confidence: "conflito",
      support: (alternatives || []).length,
      allocation: "",
      relatedDocuments: [],
      alternatives: (alternatives || []).slice(0, 4),
      conflict: true,
    };
  }

  function catalogMeta(entry) {
    if (entry && catalogMetaCache.has(entry)) return catalogMetaCache.get(entry);
    const searchable = `${entry && entry.description || ""} ${entry && entry.notes || ""}`;
    const meta = {
      searchable,
      searchableNorm: norm(searchable),
      tokens: titleTokens(searchable),
      subjects: subjectTags("", searchable, entry && entry.databook || ""),
      path: pathKey(entry && entry.databook || ""),
      disciplineNorm: norm(`${entry && entry.databook || ""} ${entry && entry.description || ""}`),
      depth: text(entry && entry.databook).split("|").filter(Boolean).length,
    };
    if (entry && typeof entry === "object") catalogMetaCache.set(entry, meta);
    return meta;
  }

  function tokenIntersection(left, right) {
    let amount = 0;
    left.forEach((token) => { if (right.has(token)) amount += 1; });
    return amount;
  }

  function suggestionKey(record, targetKind, targetDiscipline, targetTokens, targetSubjects, catalogEntries) {
    const semanticTokens = [...targetTokens].filter((token) => !/\d/.test(token)).sort().join("|");
    return [
      targetKind,
      targetDiscipline,
      [...targetSubjects].sort().join("|"),
      semanticTokens,
      (catalogEntries || []).length,
    ].join("::");
  }

  function suggestCatalogDatabook(record, catalogEntries) {
    if (!record) return null;
    const targetKind = titleKind(record.title);
    const targetDiscipline = disciplineKey(record.discipline);
    const targetTokens = titleTokens(record.title);
    const targetSubjects = subjectTags(record.document, record.title, "");
    const cacheKey = suggestionKey(record, targetKind, targetDiscipline, targetTokens, targetSubjects, catalogEntries);
    if (suggestionCache.has(cacheKey)) return suggestionCache.get(cacheKey);
    const ranked = (catalogEntries || []).map((entry) => {
      const meta = catalogMeta(entry);
      const overlap = tokenIntersection(targetTokens, meta.tokens);
      const kindMatch = Boolean(targetKind && meta.searchableNorm.includes(targetKind));
      const disciplineMatch = Boolean(targetDiscipline && meta.disciplineNorm.includes(targetDiscipline));
      const subjectMatch = Boolean(targetSubjects.size && setsIntersect(targetSubjects, meta.subjects));
      const subjectConflict = Boolean(targetSubjects.size && meta.subjects.size && !subjectMatch);
      const similarity = targetTokens.size && meta.tokens.size ? overlap / Math.max(targetTokens.size, meta.tokens.size) : 0;
      const score = (kindMatch ? 65 : 0) + (disciplineMatch ? 24 : 0) + Math.min(28, overlap * 4)
        + Math.round(similarity * 28)
        + (subjectMatch ? 58 : 0) - (subjectConflict ? 32 : 0)
        + (subjectMatch && meta.depth >= 5 ? 8 : 0);
      return { entry, score, path: meta.path };
    }).filter((candidate) => candidate.score >= 62).sort((left, right) => right.score - left.score);
    if (!ranked.length) { suggestionCache.set(cacheKey, null); return null; }
    const top = ranked[0];
    const runner = ranked.find((candidate) => candidate.path !== top.path);
    if (runner && top.score - runner.score < 10) {
      const conflict = conflictEvidence([top, runner].map((candidate) => ({ databook: candidate.entry.databook, support: 1, score: candidate.score })));
      suggestionCache.set(cacheKey, conflict);
      return conflict;
    }
    if (top.score < 76) { suggestionCache.set(cacheKey, null); return null; }
    const suggestion = {
      databook: top.entry.databook,
      levels: [],
      source: "Mapa Databook",
      sourceType: "catalog",
      confidence: "alta",
      support: 1,
      allocation: "",
      relatedDocuments: [],
    };
    if (suggestionCache.size > 10000) suggestionCache.clear();
    suggestionCache.set(cacheKey, suggestion);
    return suggestion;
  }

  function findSheet(workbook, wanted) {
    const name = (workbook && workbook.SheetNames || []).find((sheetName) => norm(sheetName) === norm(wanted));
    return name ? workbook.Sheets[name] : null;
  }

  function parseDatabookWorkbook(workbook, XLSX) {
    suggestionCache.clear();
    const sheet = findSheet(workbook, "CAMINHO DB_SIGEM");
    if (!sheet) return { entries: [], sourceSheet: "" };
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    const entries = [];
    let current = null;
    rows.forEach((row, rowIndex) => {
      const pathColumn = (row || []).findIndex((cell) => completeDatabook(cell) && !norm(cell).startsWith("NOME UNIDADE|"));
      const databook = pathColumn >= 0 ? text(row[pathColumn]) : "";
      let description = "";
      if (pathColumn >= 0) {
        for (let column = pathColumn - 1; column >= 0; column -= 1) {
          const candidate = text(row[column]);
          if (!candidate || /^\d+(?:[.,]\d+)*$/.test(candidate) || norm(candidate) === "I" || /^REV\./i.test(candidate)) continue;
          description = candidate;
          break;
        }
      } else {
        description = (row || []).map(text).find((cell) => /DOCUMENTOS?:/i.test(cell) || /^\*/.test(cell)) || "";
      }
      if (completeDatabook(databook) && !norm(databook).startsWith("NOME UNIDADE|")) {
        current = { description, databook, notes: "", rowNumber: rowIndex + 1, sourceSheet: "CAMINHO DB_SIGEM" };
        entries.push(current);
      } else if (current && description && (/DOCUMENTOS?:/i.test(description) || /^\*/.test(description.trim()))) {
        current.notes = [current.notes, description].filter(Boolean).join("\n");
      }
    });
    return { entries, sourceSheet: "CAMINHO DB_SIGEM" };
  }

  return { norm, key, titleKind, completeDatabook, parseDatabookWorkbook, suggestCatalogDatabook };
});
