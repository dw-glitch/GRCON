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

  // O HTML histórico não listava .txt no seletor da pasta documental. Como o
  // emission.js é carregado antes do uso do campo, a extensão é habilitada em
  // tempo de execução sem exigir alteração estrutural no index.html.
  function enableTxtDocumentPicker() {
    if (typeof document === "undefined") return;
    const apply = () => {
      const input = document.getElementById("pdf-input");
      if (!input) return;
      const accepted = String(input.getAttribute("accept") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!accepted.some((item) => item.toLowerCase() === ".txt")) accepted.push(".txt");
      input.setAttribute("accept", accepted.join(","));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true });
    else apply();
  }

  enableTxtDocumentPicker();

  /**
   * TÍTULO e PROPÓSITO são informações documentais da eGRDT, mas não são
   * critérios técnicos para bloquear a geração. Eles continuam sendo
   * preservados quando existem na LD, porém ausência, texto não padronizado ou
   * divergência nesses dois campos não impedem a emissão.
   *
   * Documento, Revisão, Arquivo, Formato, Disciplina e Tipo de documento
   * continuam protegidos pelo validador central. O wrapper é aplicado aqui
   * porque emission.js carrega antes de app.js; assim prévia, conferência e
   * geração final seguem exatamente a mesma regra.
   */
  function disableInformationalFieldsAsEgrdtBlockers() {
    if (!C || typeof C.validateEgrdtData !== "function" || C.__grconInformationalFieldsNonBlocking) return;
    const originalValidateEgrdtData = C.validateEgrdtData.bind(C);
    C.validateEgrdtData = function validateEgrdtDataWithoutInformationalBlocks(data) {
      const errors = originalValidateEgrdtData(data);
      return (Array.isArray(errors) ? errors : []).filter((error) => {
        const normalizedError = norm(error);
        return !/^TITULO(?:\s|$)/.test(normalizedError)
          && !/^PROPOSITO(?:\s|$)/.test(normalizedError);
      });
    };
    try {
      Object.defineProperty(C, "__grconInformationalFieldsNonBlocking", { value: true, configurable: true });
    } catch (_) {
      C.__grconInformationalFieldsNonBlocking = true;
    }
  }

  disableInformationalFieldsAsEgrdtBlockers();

  /**
   * O título da eGRDT deve vir da LD. Ele não é bloqueante para a emissão, mas
   * quando existe na linha técnica precisa ser preservado na saída. Algumas
   * telas carregam row.egrdt antes de row.record; por isso recuperamos o valor
   * também da linha controlada e das evidências já resolvidas pela triagem.
   */
  function resolveEgrdtTitle(row) {
    const item = row || {};
    const candidates = [
      item.egrdt && item.egrdt.title,
      item.record && item.record.title,
      item.title,
      item.analysisEvidence && item.analysisEvidence.item && item.analysisEvidence.item.title,
      ...((item.evidence || []).map((entry) => entry && entry.item && entry.item.title)),
    ];
    return candidates.map(text).find(Boolean) || "";
  }

  /**
   * Propósito é apenas informação documental da LD/eGRDT durante a geração.
   * Não é inferido pelo código, não é comparado com uma lista oficial e não é
   * usado como critério de bloqueio. Quando existir, preservamos o primeiro
   * valor real encontrado na triagem.
   */
  function resolveEgrdtPurpose(row) {
    const item = row || {};
    const candidates = [
      item.egrdt && item.egrdt.purpose,
      item.record && item.record.purpose,
      item.purpose,
      item.analysisEvidence && item.analysisEvidence.item && item.analysisEvidence.item.purpose,
      ...((item.evidence || []).map((entry) => entry && entry.item && entry.item.purpose)),
    ];
    return candidates.map(text).find(Boolean) || "";
  }

  function n1710DocumentType(document) {
    const raw = text(document).replace(/\.[^.]+$/, "");
    const groups = raw.split("-");
    const languageOffset = /^[IAFLED]$/i.test(groups[0] || "") ? 1 : 0;
    return norm(groups[languageOffset] || "");
  }

  function has98VCode(document) {
    // Regra específica para códigos que tragam 98V em qualquer grupo da
    // codificação oficial. A análise usa o código controlado no GRCON, sem
    // depender de título ou texto adicional presente no nome físico.
    return norm(document).includes("98V");
  }

  function has955Code(document) {
    // O 955 precisa ser um grupo completo da codificação oficial, como em
    // PR-5290.00-22313-955-C1O-028. Evita confundir 955 com parte de título,
    // revisão ou outro número maior.
    const groups = norm(document).split("-");
    return groups.includes("955");
  }

  function isEtPlanningRow(row) {
    const item = row || {};
    const sheet = norm(item.sheet);
    const document = norm(item.document);
    const discipline = norm(
      item.egrdt && item.egrdt.discipline
      || item.record && item.record.discipline
      || item.discipline
    );
    const isEt = sheet === "ET" || document.includes("_RNEST_");
    return isEt && discipline.includes("PLANEJAMENTO");
  }

  /**
   * Exceção operacional para documentos ET da disciplina PLANEJAMENTO.
   * O planejamento sempre envia o arquivo editável em Word junto com o PDF,
   * portanto os dois devem seguir para postagem e ocupar linhas próprias na
   * eGRDT: primeiro o .docx e depois o .pdf.
   */
  function validateEtPlanningPair(row, sources) {
    const originalList = Array.isArray(sources) ? [...sources] : [];
    const applies = isEtPlanningRow(row);
    if (!applies) return { applies: false, valid: true, sources: originalList, errors: [], ignoredDuplicates: [] };

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
    const pdfs = list.filter((source) => extensionOf(source && (source.name || source.finalName)) === "pdf");
    const docx = list.filter((source) => extensionOf(source && (source.name || source.finalName)) === "docx");
    const invalid = list.filter((source) => {
      const extension = extensionOf(source && (source.name || source.finalName));
      return Boolean(extension && extension !== "pdf" && extension !== "docx");
    });
    const withoutExtension = list.filter((source) => !extensionOf(source && (source.name || source.finalName)));
    const errors = [];

    if (list.length !== 2) errors.push("ET da disciplina PLANEJAMENTO exige exatamente 2 arquivos por código: 1 DOCX + 1 PDF.");
    if (docx.length !== 1) errors.push("ET da disciplina PLANEJAMENTO exige exatamente 1 arquivo Word .docx por código.");
    if (pdfs.length !== 1) errors.push("ET da disciplina PLANEJAMENTO exige exatamente 1 PDF por código.");
    if (invalid.length) errors.push("ET da disciplina PLANEJAMENTO aceita para postagem somente o conjunto .docx + .pdf.");
    if (withoutExtension.length) errors.push("ET da disciplina PLANEJAMENTO exige extensão explícita nos dois arquivos.");
    if (list.some((source) => source && (source.virtual || !source.file))) {
      errors.push("ET da disciplina PLANEJAMENTO exige o par físico completo: 1 DOCX + 1 PDF.");
    }

    return {
      applies: true,
      valid: errors.length === 0,
      sources: [...docx, ...pdfs, ...invalid, ...withoutExtension],
      errors: [...new Set(errors)],
      ignoredDuplicates,
    };
  }

  /**
   * A N-1710 segue composição física obrigatória de dois arquivos por código.
   * Regra geral: 1 nativo + 1 PDF. Exceções operacionais:
   * - CR, independentemente da restante codificação: 1 nativo + 1 PDF + 1 TXT;
   * - códigos com o grupo 955: somente 1 PDF;
   * - LI e MC: 1 Excel + 1 PDF;
   * - qualquer código que contenha 98V: 1 Excel + 1 PDF, independentemente do
   *   tipo documental.
   * Cada arquivo físico aceito ocupa a própria linha na eGRDT.
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
    // CR tem prioridade sobre qualquer outra particularidade da codificação:
    // sempre seguem três arquivos físicos — nativo, PDF e TXT.
    const crTriple = documentType === "CR";
    const pdfOnlyBy955 = !crTriple && has955Code(row && row.document);
    const excelPairByType = documentType === "LI" || documentType === "MC";
    const excelPairBy98V = has98VCode(row && row.document);
    // Fora de CR, a regra 955 continua mais específica que Excel + PDF.
    const requiresExcelPair = !crTriple && !pdfOnlyBy955 && (excelPairByType || excelPairBy98V);
    const excelPairLabel = excelPairBy98V && !excelPairByType
      ? "Documento com codificação 98V da N-1710"
      : `${documentType} da N-1710`;
    const pdfs = list.filter((source) => extensionOf(source && (source.name || source.finalName)) === "pdf");
    const txts = list.filter((source) => extensionOf(source && (source.name || source.finalName)) === "txt");
    const excels = list.filter((source) => EXCEL_EXTENSIONS.has(extensionOf(source && (source.name || source.finalName))));
    const natives = list.filter((source) => {
      const extension = extensionOf(source && (source.name || source.finalName));
      return Boolean(extension && extension !== "pdf");
    });
    const crNatives = crTriple
      ? list.filter((source) => {
          const extension = extensionOf(source && (source.name || source.finalName));
          return Boolean(extension && extension !== "pdf" && extension !== "txt");
        })
      : [];
    const invalidExcelPairNatives = requiresExcelPair
      ? natives.filter((source) => !EXCEL_EXTENSIONS.has(extensionOf(source && (source.name || source.finalName))))
      : [];
    const nonPdfs = pdfOnlyBy955
      ? list.filter((source) => {
          const extension = extensionOf(source && (source.name || source.finalName));
          return Boolean(extension && extension !== "pdf");
        })
      : [];
    const withoutExtension = list.filter((source) => !extensionOf(source && (source.name || source.finalName)));
    const errors = [];

    if (crTriple) {
      if (list.length !== 3) errors.push("Documento CR exige exatamente 3 arquivos por código: 1 nativo + 1 PDF + 1 TXT.");
      if (pdfs.length !== 1) errors.push("Documento CR exige exatamente 1 PDF por código.");
      if (txts.length !== 1) errors.push("Documento CR exige exatamente 1 arquivo TXT por código.");
      if (crNatives.length !== 1) errors.push("Documento CR exige exatamente 1 arquivo nativo adicional, além do PDF e do TXT.");
    } else if (pdfOnlyBy955) {
      if (list.length !== 1) errors.push("Documento N-1710 com codificação 955 exige exatamente 1 arquivo por código: somente o PDF.");
      if (pdfs.length !== 1) errors.push("Documento N-1710 com codificação 955 exige exatamente 1 PDF por código.");
      if (nonPdfs.length) errors.push("Documento N-1710 com codificação 955 aceita para a eGRDT somente o arquivo PDF.");
    } else if (requiresExcelPair) {
      if (list.length !== 2) errors.push(`${excelPairLabel} exige exatamente 2 arquivos por código: 1 Excel + 1 PDF.`);
      if (pdfs.length !== 1) errors.push(`${excelPairLabel} exige exatamente 1 PDF por código.`);
      if (excels.length !== 1) errors.push(`${excelPairLabel} exige exatamente 1 arquivo Excel por código (.xls, .xlsx, .xlsm ou .xlsb).`);
      if (invalidExcelPairNatives.length) errors.push(`${excelPairLabel} não aceita outro tipo de arquivo nativo: envie a planilha Excel correspondente junto com o PDF.`);
    } else {
      if (list.length !== 2) errors.push("N-1710 exige exatamente 2 arquivos por código: 1 nativo + 1 PDF.");
      if (pdfs.length !== 1) errors.push("N-1710 exige exatamente 1 PDF por código.");
      if (natives.length !== 1) errors.push("N-1710 exige exatamente 1 arquivo nativo por código.");
      if (txts.length) errors.push("Arquivo TXT como terceiro arquivo é uma regra exclusiva para documentos CR.");
    }
    if (withoutExtension.length) errors.push(crTriple
      ? "Documento CR exige extensão explícita nos três arquivos: nativo, PDF e TXT."
      : pdfOnlyBy955
        ? "Documento N-1710 com codificação 955 exige extensão explícita no arquivo PDF."
        : "N-1710 exige extensão explícita nos dois arquivos.");
    if (list.some((source) => source && (source.virtual || !source.file))) {
      errors.push(crTriple
        ? "Documento CR exige os três arquivos físicos completos: 1 nativo + 1 PDF + 1 TXT."
        : pdfOnlyBy955
          ? "Documento N-1710 com codificação 955 exige o PDF físico; não é permitido gerar somente pela relação."
          : requiresExcelPair
            ? `${excelPairLabel} exige o par físico completo: 1 Excel + 1 PDF.`
            : "N-1710 exige o par físico completo; não é permitido gerar somente pela relação sem o arquivo nativo e o PDF.");
    }

    const orderedSources = crTriple
      ? [...crNatives, ...pdfs, ...txts, ...withoutExtension]
      : pdfOnlyBy955
        ? [...pdfs, ...nonPdfs, ...withoutExtension]
        : requiresExcelPair
          ? [...excels, ...pdfs, ...invalidExcelPairNatives, ...withoutExtension]
          : [...natives, ...pdfs, ...withoutExtension];

    return {
      applies: true,
      valid: errors.length === 0,
      documentType,
      crTriple,
      pdfOnlyBy955,
      requiresExcelPair,
      excelPairBy98V,
      // CR: nativo → PDF → TXT. Demais regras mantêm a ordem operacional anterior.
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
      const etPlanningPair = validateEtPlanningPair(row, sources);
      const pairValidation = etPlanningPair.applies ? etPlanningPair : validateN1710Pair(row, sources);
      if (pairValidation.ignoredDuplicates && pairValidation.ignoredDuplicates.length) {
        warnings.push(`${row.document}: ${pairValidation.ignoredDuplicates.length} arquivo(s) duplicado(s) ignorado(s); somente uma cópia de cada nome final seguirá para a eGRDT.`);
      }
      if (!pairValidation.valid) {
        pairValidation.errors.forEach((message) => errors.push(`${row.document}: ${message}`));
        return;
      }
      const orderedSources = pairValidation.sources;
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
          title: resolveEgrdtTitle(row),
          purpose: resolveEgrdtPurpose(row),
          fileName: finalName,
          databook: String(row.record && row.record.databook || "").trim(),
          manualAllocationOverride,
        };
        if (C && C.enforceDocumentFormat) C.enforceDocumentFormat(item);
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

  return { createPlan, validateN1710Pair, validateEtPlanningPair, consistencyErrors, splitPlan, manifestRows };
});
