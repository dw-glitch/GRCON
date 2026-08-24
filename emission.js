(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconEmission = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  function text(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function norm(value) {
    return C.norm(value || "");
  }

  function extensionOf(name) {
    const match = text(name).match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : "";
  }

  const EXCEL_EXTENSIONS = new Set(["xls", "xlsx", "xlsm", "xlsb"]);

  function n1710DocumentType(document) {
    const raw = text(document).replace(/\.[^.]+$/, "");
    const groups = raw.split("-");
    const languageOffset = /^[IAFLED]$/i.test(groups[0] || "") ? 1 : 0;
    return norm(groups[languageOffset] || "");
  }

  /**
   * A N-1710 segue composição física obrigatória de dois arquivos por código.
   * Regra geral: 1 nativo + 1 PDF. Exceção operacional para LI e MC: o nativo
   * é obrigatoriamente uma planilha Excel, portanto o par deve ser exatamente
   * 1 Excel + 1 PDF. Os dois recebem o mesmo código, revisão e _0001_<revisão>.
   */
  function validateN1710Pair(row, sources) {
    const originalList = Array.isArray(sources) ? [...sources] : [];
    const seen = new Set();
    const ignoredDuplicates = [];
    const list = originalList.filter((source) => {
      const key = norm(source && (source.finalName || source.name));
      if (!key) return true;
      if (seen.has(key)) {
        ignoredDuplicates.push(source);
        return false;
      }
      seen.add(key);
      return true;
    });
    const applies = Boolean(C && C.isN1710Context && C.isN1710Context(row && row.sheet, row && row.document));
    if (!applies) return { applies: false, valid: true, sources: list, errors: [], ignoredDuplicates };

    const documentType = n1710DocumentType(row && row.document);
    const requiresExcelPair = documentType === "LI" || documentType === "MC";
    const pdfs = list.filter((source) => extensionOf(source && (source.name || source.finalName)) === "pdf");
    const excels = list.filter((source) => EXCEL_EXTENSIONS.has(extensionOf(source && (source.name || source.finalName))));
    const natives = list.filter((source) => {
      const extension = extensionOf(source && (source.name || source.finalName));
      return Boolean(extension && extension !== "pdf");
    });
    const invalidLiMcNatives = requiresExcelPair
      ? natives.filter((source) => !EXCEL_EXTENSIONS.has(extensionOf(source && (source.name || source.finalName))))
      : [];
    const withoutExtension = list.filter((source) => !extensionOf(source && (source.name || source.finalName)));
    const errors = [];

    if (requiresExcelPair) {
      if (list.length !== 2) errors.push(`${documentType} da N-1710 exige exatamente 2 arquivos por código: 1 Excel + 1 PDF.`);
      if (pdfs.length !== 1) errors.push(`${documentType} da N-1710 exige exatamente 1 PDF por código.`);
      if (excels.length !== 1) errors.push(`${documentType} da N-1710 exige exatamente 1 arquivo Excel por código (.xls, .xlsx, .xlsm ou .xlsb).`);
      if (invalidLiMcNatives.length) errors.push(`${documentType} da N-1710 não aceita outro tipo de arquivo nativo: envie a planilha Excel correspondente junto com o PDF.`);
    } else {
      if (list.length !== 2) errors.push("N-1710 exige exatamente 2 arquivos por código: 1 nativo + 1 PDF.");
      if (pdfs.length !== 1) errors.push("N-1710 exige exatamente 1 PDF por código.");
      if (natives.length !== 1) errors.push("N-1710 exige exatamente 1 arquivo nativo por código.");
    }
    if (withoutExtension.length) errors.push("N-1710 exige extensão explícita nos dois arquivos.");
    if (list.some((source) => source && (source.virtual || !source.file))) {
      errors.push(requiresExcelPair
        ? `${documentType} da N-1710 exige o par físico completo: 1 Excel + 1 PDF.`
        : "N-1710 exige o par físico completo; não é permitido gerar somente pela relação sem o arquivo nativo e o PDF.");
    }

    const orderedSources = requiresExcelPair
      ? [...excels, ...pdfs, ...invalidLiMcNatives, ...withoutExtension]
      : [...natives, ...pdfs, ...withoutExtension];

    return {
      applies: true,
      valid: errors.length === 0,
      documentType,
      requiresExcelPair,
      // A ordem da eGRDT mantém o arquivo editável/nativo primeiro e o PDF depois.
      sources: orderedSources,
      errors: [...new Set(errors)],
      ignoredDuplicates,
    };
  }

  function createPlan(results, selectedIndices, options) {
    const selected = selectedIndices instanceof Set ? selectedIndices : new Set(selectedIndices || []);
    const settings = options || {};
    const manualForce = settings.manualForceIndices instanceof Set
      ? settings.manualForceIndices
      : new Set(settings.manualForceIndices || []);
    const entries = [];
    const items = [];
    const errors = [];
    const warnings = [];
    const names = new Set();

    (results || []).forEach((row, rowIndex) => {
      if (!selected.has(rowIndex)) return;
      const allocation = C && C.allocationState
        ? C.allocationState(row && (row.allocationStatus || row.record && row.record.allocationStatus))
        : { kind: "" };
      const manualAllocationOverride = Boolean(
        manualForce.has(rowIndex)
        && row.hardBlock
        && (allocation.kind === "not_allocated" || /^not_allocated(?:_conflict)?$/.test(row.blockCode || ""))
      );
      // "Não Alocado" continua sendo um alerta forte e nunca entra por padrão,
      // mas pode seguir quando o operador marcar conscientemente a linha. Outros
      // bloqueios técnicos continuam impedindo a emissão.
      if (row.hardBlock && !manualAllocationOverride) {
        errors.push(`${row.document || row.name}: item bloqueado não pode ser emitido.`);
        return;
      }
      if (manualAllocationOverride) {
        warnings.push(`${row.document || row.name}: incluído manualmente na GRDT embora a LD informe “Não Alocado”.`);
      }
      const sources = row.files && row.files.length
        ? row.files
        : row.virtualFileName
          ? [{ name: row.virtualFileName, finalName: row.finalName, file: null, virtual: true, relativePath: row.relativePath || row.virtualFileName }]
          : [];
      if (!sources.length) {
        errors.push(`${row.document}: nenhum arquivo físico selecionado.`);
        return;
      }
      const n1710Pair = validateN1710Pair(row, sources);
      if (n1710Pair.ignoredDuplicates && n1710Pair.ignoredDuplicates.length) {
        warnings.push(`${row.document}: ${n1710Pair.ignoredDuplicates.length} arquivo(s) duplicado(s) ignorado(s); somente uma cópia de cada nome final seguirá para a eGRDT.`);
      }
      if (!n1710Pair.valid) {
        n1710Pair.errors.forEach((message) => errors.push(`${row.document}: ${message}`));
        return;
      }
      const orderedSources = n1710Pair.sources;
      const codeValidation = C.validateDocumentCode(row.document, row.sheet);
      if (!codeValidation.valid) {
        warnings.push(`${row.document}: alerta de codificação — ${codeValidation.errors.join(" ")}`);
      }

      orderedSources.forEach((source) => {
        const fileNameCheck = C.validateFinalFileName(source.finalName, source.name, row.document, row.revision, row.sheet);
        if (!fileNameCheck.valid) {
          warnings.push(`${row.document} / ${source.name}: nome/codificação fora do padrão; o GRCON corrigiu automaticamente para ${fileNameCheck.expected}. ${fileNameCheck.errors.join(" ")}`);
        }
        const finalName = fileNameCheck.expected;
        const outputKey = norm(finalName);
        if (names.has(outputKey)) {
          warnings.push(`${row.document}: arquivo duplicado ${finalName} ignorado; somente uma cópia seguirá para a eGRDT.`);
          return;
        }
        names.add(outputKey);

        const item = {
          ...(row.egrdt || {}),
          document: row.document,
          revision: row.revision,
          fileName: finalName,
          databook: String(row.record && row.record.databook || "").trim(),
          manualAllocationOverride,
        };
        const itemErrors = C.validateEgrdtData(item);
        if (itemErrors.length) errors.push(`${row.document} / ${finalName}: ${itemErrors.join("; ")}.`);

        const entry = {
          rowIndex,
          document: row.document,
          revision: row.revision,
          sheet: row.sheet,
          discipline: item.discipline,
          sourceLd: String(row.record && row.record.source || "").trim(),
          allocation: String(row.record && row.record.allocation || "").trim(),
          originalName: source.name,
          relativePath: source.relativePath || source.name,
          finalName,
          file: source.file,
          virtual: Boolean(source.virtual || !source.file),
          manualAllocationOverride,
          item,
        };
        entries.push(entry);
        items.push(item);
      });
    });

    if (!entries.length) errors.push("Selecione ao menos um documento que não esteja marcado como Não incluir.");
    consistencyErrors({ entries, items }).forEach((error) => errors.push(error));
    return {
      entries,
      items,
      errors: [...new Set(errors)],
      warnings: [...new Set(warnings)],
    };
  }

  function consistencyErrors(plan) {
    const errors = [];
    if ((plan.entries || []).length !== (plan.items || []).length) errors.push("Quantidade de arquivos físicos diverge da quantidade de linhas da GRDT.");
    (plan.entries || []).forEach((entry, index) => {
      const item = (plan.items || [])[index];
      if (!item) return;
      if (entry.finalName !== item.fileName) errors.push(`${entry.document}: o arquivo físico “${entry.finalName}” diverge da coluna ARQUIVO “${item.fileName}”.`);
      if (norm(entry.revision) !== norm(item.revision)) errors.push(`${entry.document}: a revisão física diverge da revisão gravada na GRDT.`);
      const check = C.validateFinalFileName(entry.finalName, entry.originalName, entry.document, entry.revision, entry.sheet);
      if (!check.valid) errors.push(`${entry.document}: ${check.errors.join(" ")}`);
    });
    return [...new Set(errors)];
  }

  function splitPlan(plan, size) {
    const limit = Math.max(1, Number(size) || 48);
    const groups = [];
    const byDiscipline = new Map();
    (plan.entries || []).forEach((entry, originalIndex) => {
      const discipline = text(entry && entry.item && entry.item.discipline) || "SEM DISCIPLINA";
      const disciplineKey = norm(discipline);
      if (!byDiscipline.has(disciplineKey)) byDiscipline.set(disciplineKey, { discipline, entries: [] });
      byDiscipline.get(disciplineKey).entries.push({ entry, originalIndex });
    });
    const disciplines = [...byDiscipline.values()].sort((left, right) => norm(left.discipline).localeCompare(norm(right.discipline), "pt-BR"));
    let outputIndex = 0;
    disciplines.forEach((bucket) => {
      const disciplineBatchCount = Math.ceil(bucket.entries.length / limit);
      for (let start = 0; start < bucket.entries.length; start += limit) {
        const slice = bucket.entries.slice(start, start + limit);
        const entries = slice.map((item) => item.entry);
        groups.push({
          entries,
          items: entries.map((entry) => entry.item),
          number: groups.length + 1,
          startIndex: outputIndex,
          endIndex: outputIndex + entries.length - 1,
          originalIndices: slice.map((item) => item.originalIndex),
          limit,
          discipline: bucket.discipline,
          disciplineBatchNumber: Math.floor(start / limit) + 1,
          disciplineBatchCount,
        });
        outputIndex += entries.length;
      }
    });
    return groups;
  }

  function manifestRows(plan, metadata) {
    const info = metadata || {};
    return (plan.entries || []).map((entry, index) => ({
      "DOCUMENTO": entry.document,
      "REVISÃO": entry.revision,
      "ARQUIVO ORIGINAL": entry.originalName,
      "ARQUIVO FINAL NO PACOTE": entry.finalName,
      "ARQUIVO DESCRITO NA GRDT": entry.item.fileName,
      "NOME CONSISTENTE": entry.finalName === entry.item.fileName ? "SIM" : "NÃO",
      "GRDT REABERTA E VALIDADA": entry.grdtReopened ? "SIM" : "NÃO",
      "INCLUSÃO MANUAL — LD NÃO ALOCADO": entry.manualAllocationOverride ? "SIM" : "NÃO",
      "DISCIPLINA": entry.item && entry.item.discipline || entry.discipline || "",
      "LD DE ORIGEM": entry.sourceLd || "",
      "GRDT": entry.grdtFile || "",
      "LD UTILIZADA": info.ldName || "",
      "LISTA EXCEL": info.listName || "",
      "VERSÃO GRCON": info.appVersion || "",
      "DATA DA ANÁLISE": info.analysisAt || "",
      "LINHA": index + 1,
    }));
  }

  return { createPlan, validateN1710Pair, consistencyErrors, splitPlan, manifestRows };
});
