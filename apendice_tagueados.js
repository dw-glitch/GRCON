(function (root, factory) {
  const C = root.TriagemCore || (typeof module === "object" && module.exports ? require("./core.js") : null);
  const api = factory(C);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconApendice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Apêndice 3 — Fornecimento de Bens Tagueados
  //
  // O Apêndice é a única fonte contratual do que é bem tagueado. O GRCON o usa
  // para responder duas coisas sobre cada documento da triagem: o TAG existe no
  // Apêndice? e, portanto, o item é tagueado ou não?
  //
  // Três regras governam este módulo:
  //   1. Nunca inventar. Sem Apêndice carregado, as colunas dizem exatamente
  //      isso — não sai "NÃO", que seria afirmar o que não se apurou.
  //   2. Nunca casar por semelhança. O TAG é comparado por igualdade; só caixa,
  //      acento e espaço são tolerados.
  //   3. Sugerir nunca bloqueia. Divergência entre a LD e o Apêndice gera
  //      sugestão de código e a postagem segue.
  // ---------------------------------------------------------------------------

  const NOT_LOADED = "Apêndice não carregado";
  const NO_TAG = "Sem TAG para procurar";
  const FOUND = "TAG encontrado no Apêndice";
  const MISSING = "TAG não encontrado no Apêndice";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    if (C && C.norm) return C.norm(value);
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—]/g, "-")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Chave de comparação do TAG: tolera apenas caixa, acento e espaço. */
  function tagKey(value) {
    return norm(value).replace(/\s+/g, "");
  }

  function headerScore(value) {
    const header = norm(value).replace(/\(NOTA\s*\d+\)/g, "").replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    if (!header) return 0;
    if (header === "TAG") return 1200;
    if (/^TAG\b/.test(header)) return 1100;
    if (/\bTAG\b/.test(header)) return 900;
    return 0;
  }

  function isTagValue(value) {
    const raw = text(value);
    if (!raw) return false;
    const normalized = norm(raw);
    if (normalized === "TAG" || normalized === "FIM") return false;
    return true;
  }

  /**
   * Lê o Apêndice. O cabeçalho não está na primeira linha (a planilha traz o
   * carimbo do documento antes dele), então a coluna de TAG é localizada
   * procurando o cabeçalho nas primeiras linhas de cada aba.
   */
  function parseWorkbook(workbook, XLSX, options) {
    const settings = options || {};
    const book = workbook || {};
    const names = book.SheetNames || [];
    const empty = {
      ok: false,
      fileName: text(settings.fileName),
      sheet: "",
      headerRow: 0,
      tagColumn: "",
      count: 0,
      tags: new Map(),
      issue: "Nenhuma aba com coluna de TAG foi localizada no arquivo informado.",
    };
    if (!names.length || !XLSX || !XLSX.utils) return empty;

    let best = null;
    names.forEach((sheetName) => {
      const sheet = book.Sheets[sheetName];
      if (!sheet || !sheet["!ref"]) return;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      let headerIndex = -1;
      let tagColumn = -1;
      for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
        const row = rows[rowIndex] || [];
        let bestColumn = -1;
        let bestValue = 0;
        row.forEach((cell, column) => {
          const score = headerScore(cell);
          if (score > bestValue) {
            bestValue = score;
            bestColumn = column;
          }
        });
        if (bestColumn >= 0) {
          headerIndex = rowIndex;
          tagColumn = bestColumn;
          break;
        }
      }
      if (headerIndex < 0) return;
      const header = (rows[headerIndex] || []).map((cell) => text(cell).replace(/\s+/g, " "));
      const columnFor = (aliases) => header.findIndex((label) => {
        const normalized = norm(label).replace(/\(NOTA\s*\d+\)/g, "").trim();
        return aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `));
      });
      const columns = {
        unit: columnFor(["UNIDADE DE PROCESSO", "UNIDADE"]),
        discipline: columnFor(["DISCIPLINA"]),
        description: columnFor(["DESCRICAO"]),
        supplier: columnFor(["RESPONSAVEL PELO FORNECIMENTO", "RESPONSAVEL"]),
        equipment: columnFor(["EQUIPAMENTO PRINCIPAL/AREA", "EQUIPAMENTO PRINCIPAL", "EQUIPAMENTO"]),
        criticality: columnFor(["CRITICIDADE"]),
        family: columnFor(["FAMILIA LCF", "FAMILIA"]),
        origin: columnFor(["FORNECEDOR ORIGINAL", "FORNECEDOR"]),
        delivery: columnFor(["LOCAL DE ENTREGA"]),
      };
      const tags = new Map();
      for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        const tag = text(row[tagColumn]);
        if (!isTagValue(tag)) continue;
        const entryKey = tagKey(tag);
        if (!entryKey || tags.has(entryKey)) continue;
        const at = (column) => (column >= 0 ? text(row[column]) : "");
        tags.set(entryKey, {
          tag,
          row: rowIndex + 1,
          unit: at(columns.unit),
          discipline: at(columns.discipline),
          description: at(columns.description),
          supplier: at(columns.supplier),
          equipment: at(columns.equipment),
          criticality: at(columns.criticality),
          family: at(columns.family),
          origin: at(columns.origin),
          delivery: at(columns.delivery),
        });
      }
      if (!tags.size) return;
      if (!best || tags.size > best.tags.size) {
        best = {
          ok: true,
          fileName: text(settings.fileName),
          sheet: sheetName.trim(),
          headerRow: headerIndex + 1,
          tagColumn: XLSX.utils.encode_col(tagColumn),
          count: tags.size,
          tags,
          issue: "",
        };
      }
    });
    return best || empty;
  }

  function loaded(index) {
    return Boolean(index && index.ok && index.tags && index.tags.size);
  }

  /**
   * Origem do TAG, nesta ordem: coluna de TAG da LD, quando a aba tiver uma; e,
   * na falta dela, o próprio código do documento (Grupo 7 do relatório ET).
   */
  function documentTag(record, document) {
    const item = record || {};
    const fromLd = text(item.tag);
    if (fromLd) {
      return {
        tag: fromLd,
        source: "coluna da LD",
        detail: `Coluna ${text(item.tagColumn) || "de TAG"}${item.tagHeader ? ` (${text(item.tagHeader)})` : ""} da aba ${text(item.sheet) || "técnica"}.`,
      };
    }
    const code = text(document) || text(item.document);
    const group7 = C && C.reportGroup7Info ? C.reportGroup7Info(code) : null;
    if (group7 && group7.tag) {
      return { tag: group7.tag, source: "código do documento", detail: "Grupo 7 do código, conforme a ET." };
    }
    if (group7 && group7.isNonTagged) {
      return { tag: "", source: "código do documento", detail: "O código já identifica item não tagueado (nt-).", nonTagged: true };
    }
    return { tag: "", source: "", detail: "A LD não traz coluna de TAG e o código não permite extrair um TAG." };
  }

  /**
   * Código sugerido quando o TAG não consta do Apêndice: o item não é tagueado,
   * logo o Grupo 7 leva nt-. Sugestão, nunca bloqueio.
   */
  function nonTaggedSuggestion(document) {
    const code = text(document);
    const group7 = C && C.reportGroup7Info ? C.reportGroup7Info(code) : null;
    if (!group7 || !group7.isReport || !group7.identifier) return "";
    if (group7.exactNonTagged) return "";
    const identifier = group7.isNonTagged
      ? `nt-${group7.identifier.replace(/^nt[-_]/i, "")}`
      : `nt-${group7.identifier}`;
    return [...group7.groups.slice(0, 6), identifier].join("_");
  }

  /**
   * Resposta do cruzamento para uma linha da triagem. Devolve exatamente o que
   * as três colunas novas mostram, mais a sugestão de código quando houver.
   */
  function evaluate(row, index) {
    const item = row || {};
    const record = item.record || {};
    const ldCode = text(record.document) || text(item.document);
    const origin = documentTag(record, ldCode);
    const base = {
      ldCode: ldCode || "Não localizado na LD",
      tag: origin.tag,
      tagSource: origin.source,
      tagDetail: origin.detail,
      suggestion: "",
      suggestionNote: "",
      entry: null,
    };
    if (!loaded(index)) {
      return {
        ...base,
        available: false,
        found: null,
        search: NOT_LOADED,
        tagged: "Não apurado — Apêndice não carregado",
        note: "Carregue o Apêndice 3 para que o GRCON responda se o item é tagueado.",
      };
    }
    if (!origin.tag) {
      return {
        ...base,
        available: true,
        found: null,
        search: NO_TAG,
        tagged: origin.nonTagged
          ? "NÃO — o código já identifica item não tagueado (nt-)"
          : "Não apurado — sem TAG para procurar",
        note: origin.detail,
      };
    }
    const entry = index.tags.get(tagKey(origin.tag)) || null;
    if (entry) {
      return {
        ...base,
        available: true,
        found: true,
        entry,
        search: FOUND,
        tagged: "SIM",
        note: `TAG ${entry.tag} consta do Apêndice ${index.sheet ? `(aba ${index.sheet}, linha ${entry.row})` : ""}.`.replace(/\s+/g, " ").trim(),
      };
    }
    const suggestion = nonTaggedSuggestion(ldCode);
    return {
      ...base,
      available: true,
      found: false,
      search: MISSING,
      tagged: "NÃO",
      suggestion,
      suggestionNote: suggestion
        ? `Sugestão: enviar a ALOC como ${suggestion}. O TAG ${origin.tag} não consta do Apêndice, e nt- marca o item não tagueado. A postagem não é impedida por isso.`
        : "",
      note: `O TAG ${origin.tag} não foi encontrado entre os ${index.count} TAGs do Apêndice. Comparação por igualdade, tolerando apenas caixa, acento e espaço.`,
    };
  }

  /** Aplica o cruzamento a todas as linhas da triagem, sem alterar decisão. */
  function apply(results, index) {
    (results || []).forEach((row) => {
      if (row) row.apendice = evaluate(row, index);
    });
    return results || [];
  }

  return Object.freeze({
    NOT_LOADED,
    NO_TAG,
    FOUND,
    MISSING,
    tagKey,
    headerScore,
    parseWorkbook,
    loaded,
    documentTag,
    nonTaggedSuggestion,
    evaluate,
    apply,
  });
});
