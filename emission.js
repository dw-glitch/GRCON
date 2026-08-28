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

  // O seletor de pasta não pode esconder extensões antes da triagem. A decisão
  // sobre aceitar ou não um arquivo é feita depois, com o código documental e
  // a LD disponíveis. Isto é essencial para N-1710, cuja regra operacional
  // aceita qualquer extensão; ET/CV continuam protegidos pela lógica própria do
  // app.js e pelos validadores documentais.
  function enableUnrestrictedDocumentPicker() {
    if (typeof document === "undefined") return;
    const apply = () => {
      const input = document.getElementById("pdf-input");
      if (!input) return;
      input.removeAttribute("accept");
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true });
    else apply();
  }

  enableUnrestrictedDocumentPicker();

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
      const n1710 = Boolean(C && C.isN1710Context && C.isN1710Context("", data && data.document));
      return (Array.isArray(errors) ? errors : []).filter((error) => {
        const normalizedError = norm(error);
        if (/^TITULO(?:\s|$)/.test(normalizedError)) return false;
        if (/^PROPOSITO(?:\s|$)/.test(normalizedError)) return false;
        // Para N-1710 a extensão é uma característica do arquivo recebido, não
        // um critério de validade documental. O nome do arquivo continua
        // obrigatório, mas o formato da extensão não bloqueia a eGRDT.
        if (n1710 && /^ARQUIVO SEM EXTENSAO(?:\s|$)/.test(normalizedError)) return false;
        return true;
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
   * Política de arquivos da N-1710.
   *
   * Quantidade e extensão NÃO definem se o documento pode ou não ser emitido.
   * Um código N-1710 validado pela LD pode seguir com 1, 2, 3 ou qualquer
   * quantidade de arquivos físicos, em qualquer extensão. A validade continua
   * vindo de código + LD + revisão + disciplina + regras normativas.
   *
   * O nome histórico validateN1710Pair é preservado porque app.js e o verificador
   * SIGEM já o utilizam, mas a função não exige mais um “par” nem combinações
   * especiais para CR, 955, LI/MC ou 98V.
   */
  function validateN1710Pair(row, sources) {
    const originalList = Array.isArray(sources) ? sources.filter(Boolean) : [];
    const applies = Boolean(C && C.isN1710Context && C.isN1710Context(row && row.sheet, row && row.document));
    if (!applies) {
      return { applies: false, valid: true, sources: originalList, errors: [], warnings: [], ignoredDuplicates: [] };
    }

    const errors = [];
    const localNames = new Set();
    const flexibleSources = originalList.map((source) => {
      const originalName = text(source && (source.name || source.finalName));
      const preferred = C && C.proposedFileName
        ? C.proposedFileName(originalName, row && row.document, row && row.revision, row && row.sheet)
        : text(source && (source.finalName || source.name));
      const finalName = n1710UniqueFinalName(source, row, localNames, preferred);
      localNames.add(norm(finalName));
      return { ...source, finalName };
    });

    // Relação/linha virtual sem arquivo físico não é uma restrição de extensão
    // nem de quantidade: simplesmente não há arquivo para compor o pacote.
    // Um único arquivo físico já é suficiente, independentemente do formato.
    if (flexibleSources.some((source) => source && (source.virtual || !source.file))) {
      errors.push("N-1710 exige ao menos um arquivo físico associado ao documento; a relação sem arquivo não compõe o pacote.");
    }

    return {
      applies: true,
      valid: errors.length === 0,
      documentType: n1710DocumentType(row && row.document),
      flexibleFiles: true,
      // Preserve integralmente a ordem e todos os arquivos físicos recebidos.
      // Não existe deduplicação por extensão; colisões de nome recebem apenas
      // um sufixo operacional para que cada arquivo continue individual.
      sources: flexibleSources,
      errors: [...new Set(errors)],
      warnings: [],
      ignoredDuplicates: [],
    };
  }

  function n1710UniqueFinalName(source, row, usedNames, preferredName) {
    const preferred = text(preferredName) || text(source && (source.finalName || source.name));
    const preferredKey = norm(preferred);
    if (preferred && !usedNames.has(preferredKey)) return preferred;

    const match = preferred.match(/(\.[^.]+)$/);
    const extension = match ? match[1] : "";
    const stem = extension ? preferred.slice(0, -extension.length) : preferred;
    let sequence = 2;
    let candidate = "";
    do {
      candidate = `${stem}_ARQ${String(sequence).padStart(2, "0")}${extension}`;
      sequence += 1;
    } while (usedNames.has(norm(candidate)));
    return candidate;
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
        const n1710 = Boolean(C && C.isN1710Context && C.isN1710Context(row.sheet, row.document));
        if (!fileNameCheck.valid) {
          warnings.push(`${row.document} / ${source.name}: nome físico diferente do padrão controlado; o código foi validado pela LD e será usado como referência. ${fileNameCheck.errors.join(" ")}`);
        }
        const finalName = n1710
          ? n1710UniqueFinalName(source, row, names, fileNameCheck.expected)
          : fileNameCheck.expected;
        const outputKey = norm(finalName);
        if (names.has(outputKey)) {
          // Esta proteção continua valendo para famílias com nomenclatura rígida.
          // Na N-1710 n1710UniqueFinalName garante um nome individual para cada
          // arquivo, inclusive quando vários possuem a mesma extensão.
          warnings.push(`${row.document}: arquivo duplicado ${finalName} ignorado; somente uma cópia seguirá para a eGRDT.`);
          return;
        }
        if (n1710 && norm(finalName) !== norm(fileNameCheck.expected)) {
          warnings.push(`${row.document} / ${source.name}: mais de um arquivo convergiu para o mesmo nome controlado; preservado individualmente na eGRDT como ${finalName}.`);
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
      const n1710 = Boolean(C && C.isN1710Context && C.isN1710Context(entry.sheet, entry.document));
      const check = C.validateFinalFileName(entry.finalName, entry.originalName, entry.document, entry.revision, entry.sheet);
      // N-1710 pode ter vários arquivos da mesma extensão; nesses casos o nome
      // final recebe um sufixo operacional único. A consistência relevante é a
      // correspondência DOCUMENTO/REVISÃO/ARQUIVO, não a igualdade a um único
      // nome canônico. ET/CV mantêm a validação rígida anterior.
      if (!n1710 && !check.valid) errors.push(`${entry.document}: ${check.errors.join(" ")}`);
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
