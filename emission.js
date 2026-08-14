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
          manualAllocationOverride,
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
      "INCLUSÃO MANUAL — LD NÃO ALOCADO": entry.manualAllocationOverride ? "SIM" : "NÃO",
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
