(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconDiscipline = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function norm(value) {
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();
  }

  // Fonte única de verdade para todos os campos DISCIPLINA gravados na eGRDT.
  // A relação foi extraída integralmente do combo do modelo oficial atual
  // (grdt-template.xlsx, coluna F). Um valor encontrado em uma eGRDT antiga
  // não amplia este catálogo: somente as opções do modelo vigente são aceitas.
  const OFFICIAL_DISCIPLINES = Object.freeze([
    "DINÂMICOS", "ESTÁTICOS", "MONTAGEM", "COMISSIONAMENTO", "SUPRIMENTOS",
    "ELÉTRICA", "ENGENHARIA DE PROJETO", "ESTRUTURA METÁLICA",
    "FERRAMENTAS COMPUTACIONAIS", "INSTRUMENTAÇÃO", "MECÂNICA", "MEIO AMBIENTE",
    "SEGURANÇA", "PLANEJAMENTO", "COMUNICAÇÃO E RS",
    "ADM CONTRATUAL", "GERAL", "QUALIDADE", "CIVIL", "SAÚDE", "TUBULAÇÃO",
    "COORDENAÇÃO", "CT",
  ]);

  const OFFICIAL_BY_KEY = new Map(OFFICIAL_DISCIPLINES.map((item) => [norm(item), item]));
  const OFFICIAL_SET = new Set(OFFICIAL_DISCIPLINES);

  // Códigos contratuais efetivamente usados nas LDs. A conversão só é aceita
  // quando o código aparece como um token inteiro; nunca por semelhança livre.
  const CODE_ALIASES = Object.freeze({
    ADC: "ADM CONTRATUAL",
    CDR: "COORDENAÇÃO",
    CRS: "COMUNICAÇÃO E RS",
    CVL: "CIVIL",
    DIN: "DINÂMICOS",
    ELE: "ELÉTRICA",
    EST: "ESTÁTICOS",
    GER: "GERAL",
    INS: "INSTRUMENTAÇÃO",
    MEC: "MECÂNICA",
    MON: "MONTAGEM",
    PLA: "PLANEJAMENTO",
    PRJ: "ENGENHARIA DE PROJETO",
    QUA: "QUALIDADE",
    SEG: "SEGURANÇA",
    SMS: "SEGURANÇA",
    SUP: "SUPRIMENTOS",
    TEL: "COMUNICAÇÃO E RS",
    TUB: "TUBULAÇÃO",
  });

  // Equivalências completas confirmadas pelas bases entregues. Elas precedem
  // a leitura por tokens justamente para não interpretar, por exemplo,
  // "SMS/GERAL" como duas disciplinas concorrentes.
  const FULL_ALIASES = Object.freeze({
    "RNEST UHDTD U-32 PROJETO": "ENGENHARIA DE PROJETO",
    "RNEST UHDTD U-32 SMS/GERAL": "GERAL",
    "RNEST UHDTD U-32 SMS/MEIO AMBIENTE": "MEIO AMBIENTE",
    "RNEST UHDTD U-32 SMS/SAUDE": "SAÚDE",
    "RNEST UHDTD U-32 SMS/SEGURANCA": "SEGURANÇA",
    "RNEST UHDTD U-32 TIC TELECOM": "COMUNICAÇÃO E RS",
    "RNEST UHDTD U-32 TIC TELECOM SIT": "COMUNICAÇÃO E RS",
  });

  const WORD_ALIASES = Object.freeze({
    COMISSION: "COMISSIONAMENTO",
    COORDEN: "COORDENAÇÃO",
    DINAM: "DINÂMICOS",
    ELETR: "ELÉTRICA",
    ESTATIC: "ESTÁTICOS",
    INSTRUMENT: "INSTRUMENTAÇÃO",
    MECAN: "MECÂNICA",
    PLANEJ: "PLANEJAMENTO",
    QUALIDADE: "QUALIDADE",
    SUPRIMENT: "SUPRIMENTOS",
    TELECOM: "COMUNICAÇÃO E RS",
    TUBUL: "TUBULAÇÃO",
  });

  function officialValue(value) {
    return OFFICIAL_BY_KEY.get(norm(value)) || "";
  }

  function isAllowed(value) {
    return Boolean(officialValue(value));
  }

  function isCvSheet(value) {
    return norm(value) === "CV";
  }

  function isCvDocument(value) {
    return /^5900(?:\.\d+){3}-[A-Z0-9]{3}-CV-[A-Z0-9]+-\d{3,4}$/i.test(text(value).replace(/\.[A-Z0-9]{1,8}$/i, ""));
  }

  function ldNumberFromSource(value) {
    const source = norm(value).replace(/\.(?:XLSX?|XLSM)$/i, "");
    let match = source.match(/(?:^|[^A-Z0-9])LD[ _-]?0*(\d{1,3})(?:[^A-Z0-9]|$)/);
    if (match) return Number(match[1]);
    match = source.match(/^LD-.*-C1O-0*(\d{1,3})(?:_|$)/);
    return match ? Number(match[1]) : 0;
  }

  function isLd001Source(value) {
    return ldNumberFromSource(value) === 1;
  }

  function familyOf(document, sheetName) {
    if (isCvSheet(sheetName) || isCvDocument(document)) return "CV";
    const normalized = norm(document);
    if (norm(sheetName) === "ET" || normalized.includes("_RNEST_")) return "ET";
    return "N-1710";
  }

  function boundedIncludes(source, token) {
    const escaped = norm(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:[^A-Z0-9]|$)`).test(norm(source));
  }

  function candidateDisciplines(source) {
    const normalized = norm(source);
    const candidates = new Set();

    // Uma opção composta oficial é uma unidade. Quando ela aparece inteira,
    // não a decompomos em MECÂNICA e SEGURANÇA.
    const composite = OFFICIAL_DISCIPLINES
      .filter((item) => /[/&]/.test(item))
      .sort((left, right) => norm(right).length - norm(left).length)
      .find((item) => boundedIncludes(normalized, item));
    if (composite) return [composite];

    OFFICIAL_DISCIPLINES
      .filter((item) => !/[/&]/.test(item))
      .forEach((item) => {
        if (boundedIncludes(normalized, item)) candidates.add(item);
      });

    const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
    tokens.forEach((token) => {
      if (CODE_ALIASES[token]) candidates.add(CODE_ALIASES[token]);
      Object.entries(WORD_ALIASES).forEach(([prefix, discipline]) => {
        if (token.startsWith(prefix)) candidates.add(discipline);
      });
    });
    return [...candidates];
  }

  function reportDisciplineFromDocument(document) {
    const groups = text(document).split("_");
    if (groups.length < 7 || norm(groups[1]) !== "RNEST") return "";
    return CODE_ALIASES[norm(groups[4])] || officialValue(groups[4]);
  }

  function evidence(record, family) {
    const item = record || {};
    return {
      family,
      source: text(item.source),
      sheet: text(item.sheet),
      row: Number(item.row) || 0,
      ld001: isLd001Source(item.source),
      original: text(item.discipline),
    };
  }

  function result(record, family, values) {
    const base = {
      disciplineOriginalLd: text(record && record.discipline),
      discipline: "",
      method: "unresolved",
      confidence: "none",
      valid: false,
      requiresConfirmation: true,
      candidates: [],
      warning: "A disciplina da LD não possui uma equivalência oficial inequívoca.",
      evidence: evidence(record, family),
      manual: false,
    };
    return Object.freeze({ ...base, ...(values || {}) });
  }

  function resolve(document, record, options) {
    const settings = options || {};
    const item = record || {};
    const family = familyOf(document, settings.sheetName || item.sheet);
    const original = text(item.discipline);
    const manual = text(settings.manualDiscipline);

    if (manual) {
      const selected = officialValue(manual);
      return result(item, family, selected ? {
        discipline: selected,
        method: "manual",
        confidence: "confirmed",
        valid: true,
        requiresConfirmation: false,
        warning: "Escolha manual válida somente para este resultado.",
        manual: true,
      } : {
        warning: `A disciplina manual “${manual}” não pertence à lista oficial da eGRDT.`,
      });
    }

    const exact = officialValue(original);
    if (exact) {
      return result(item, family, {
        discipline: exact,
        method: "exact",
        confidence: "high",
        valid: true,
        requiresConfirmation: false,
        warning: "",
      });
    }

    const fullAlias = FULL_ALIASES[norm(original)];
    if (fullAlias) {
      return result(item, family, {
        discipline: fullAlias,
        method: "validated-alias",
        confidence: "high",
        valid: true,
        requiresConfirmation: false,
        warning: original === fullAlias ? "" : `Disciplina da LD convertida pelo alias validado para “${fullAlias}”.`,
      });
    }

    const compact = norm(original).replace(/[^A-Z0-9]/g, "");
    const codeAlias = CODE_ALIASES[compact];
    if (codeAlias) {
      return result(item, family, {
        discipline: codeAlias,
        method: "contract-code",
        confidence: "high",
        valid: true,
        requiresConfirmation: false,
        warning: `Código disciplinar “${original}” convertido para “${codeAlias}”.`,
      });
    }

    if (original) {
      const candidates = candidateDisciplines(original);
      if (candidates.length === 1) {
        return result(item, family, {
          discipline: candidates[0],
          method: "controlled-token",
          confidence: "high",
          valid: true,
          requiresConfirmation: false,
          candidates,
          warning: `Descrição da LD convertida por regra determinística para “${candidates[0]}”.`,
        });
      }
      if (candidates.length > 1) {
        return result(item, family, {
          confidence: "ambiguous",
          candidates,
          warning: `A disciplina da LD corresponde a mais de uma opção oficial: ${candidates.join(" ou ")}.`,
        });
      }
    }

    // Apenas a ET possui um grupo disciplinar contratual no próprio código.
    // Para CV, a disciplina nunca é inferida de "-CV-XXX-": a linha da aba CV
    // da LD_001 continua obrigatória e, sem ela, a escolha é humana.
    if (family === "ET") {
      const fromCode = reportDisciplineFromDocument(document);
      if (fromCode) {
        return result(item, family, {
          discipline: fromCode,
          method: "et-contract-code",
          confidence: "high",
          valid: true,
          requiresConfirmation: false,
          warning: original
            ? `A disciplina “${original}” não foi reconhecida; o Grupo 5 controlado da ET determinou “${fromCode}”.`
            : `A LD não informou a disciplina; o Grupo 5 controlado da ET determinou “${fromCode}”.`,
        });
      }
    }

    return result(item, family, {
      warning: original
        ? `A disciplina “${original}” não possui mapeamento oficial inequívoco.`
        : "A linha técnica da LD não informa uma disciplina.",
    });
  }

  function traceLabel(resolution) {
    const item = resolution || {};
    const source = item.evidence || {};
    const location = [source.source, source.sheet ? `aba ${source.sheet}` : "", source.row ? `linha ${source.row}` : ""].filter(Boolean).join(" · ");
    return [
      source.family ? `Tipo: ${source.family}` : "",
      location ? `LD: ${location}` : "",
      `Disciplina encontrada: ${item.disciplineOriginalLd || "não informada"}`,
      `Disciplina eGRDT: ${item.discipline || "precisa de confirmação"}`,
      `Regra: ${item.method || "unresolved"}`,
    ].filter(Boolean).join(" · ");
  }

  return Object.freeze({
    OFFICIAL_DISCIPLINES,
    OFFICIAL_SET,
    CODE_ALIASES,
    FULL_ALIASES,
    officialValue,
    isAllowed,
    isCvSheet,
    isCvDocument,
    ldNumberFromSource,
    isLd001Source,
    familyOf,
    candidateDisciplines,
    reportDisciplineFromDocument,
    resolve,
    traceLabel,
    norm,
    text,
  });
});
