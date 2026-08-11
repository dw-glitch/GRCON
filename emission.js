(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof require === "function" ? require("./core.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconEmission = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  function norm(value) {
    return C.norm(value || "");
  }

  function createPlan(results, selectedIndices, options) {
    const selected = selectedIndices instanceof Set ? selectedIndices : new Set(selectedIndices || []);
    const entries = [];
    const items = [];
    const errors = [];
    const warnings = [];
    const names = new Set();

    (results || []).forEach((row, rowIndex) => {
      if (!selected.has(rowIndex)) return;
      // A triagem orienta o operador, mas somente "Não incluir" (hardBlock)
      // impede a emissão. Itens em Conferir/Revisar/Aguardar podem seguir quando
      // forem selecionados conscientemente na tela.
      if (row.hardBlock) {
        errors.push(`${row.document || row.name}: item bloqueado não pode ser emitido.`);
        return;
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
      const codeValidation = C.validateDocumentCode(row.document, row.sheet);
      if (!codeValidation.valid) {
        warnings.push(`${row.document}: alerta de codificação — ${codeValidation.errors.join(" ")}`);
      }

      sources.forEach((source) => {
        const fileNameCheck = C.validateFinalFileName(source.finalName, source.name, row.document, row.revision, row.sheet);
        if (!fileNameCheck.valid) errors.push(`${row.document} / ${source.name}: ${fileNameCheck.errors.join(" ")}`);
        const finalName = fileNameCheck.expected;
        const outputKey = norm(finalName);
        if (names.has(outputKey)) errors.push(`Nome final duplicado: ${finalName}.`);
        names.add(outputKey);

        const item = {
          ...(row.egrdt || {}),
          document: row.document,
          revision: row.revision,
          fileName: finalName,
          databook: String(row.record && row.record.databook || "").trim(),
        };
        const itemErrors = C.validateEgrdtData(item);
        if (itemErrors.length) errors.push(`${row.document} / ${finalName}: ${itemErrors.join("; ")}.`);

        const entry = {
          rowIndex,
          document: row.document,
          revision: row.revision,
          sheet: row.sheet,
          originalName: source.name,
          relativePath: source.relativePath || source.name,
          finalName,
          file: source.file,
          virtual: Boolean(source.virtual || !source.file),
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
    for (let start = 0; start < (plan.entries || []).length; start += limit) {
      const entries = plan.entries.slice(start, start + limit);
      groups.push({ entries, items: entries.map((entry) => entry.item), number: groups.length + 1, startIndex: start, endIndex: start + entries.length - 1, limit });
    }
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
      "GRDT": entry.grdtFile || "",
      "LD UTILIZADA": info.ldName || "",
      "LISTA EXCEL": info.listName || "",
      "VERSÃO GRCON": info.appVersion || "",
      "DATA DA ANÁLISE": info.analysisAt || "",
      "LINHA": index + 1,
    }));
  }

  return { createPlan, consistencyErrors, splitPlan, manifestRows };
});
