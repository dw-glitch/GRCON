(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.TriagemCore || safeRequire("./core.js"), root.GrconHistory || safeRequire("./history_core.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRepostingCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, History) {
  "use strict";

  const STATES = Object.freeze({
    FOUND: "ENCONTRADO",
    NOT_FOUND: "NAO_ENCONTRADO",
    AMBIGUOUS: "AMBIGUO",
    DIFFERENT_REVISION: "REVISAO_DIFERENTE",
    PERMISSION_REQUIRED: "PERMISSAO_NECESSARIA",
    UNCHECKED: "NAO_VERIFICADO",
  });

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) {
    if (Core && typeof Core.key === "function") return Core.key(value);
    if (History && typeof History.norm === "function") return History.norm(value);
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").toUpperCase().replace(/\s+/g, " ").trim();
  }
  function normalizeRevision(value) {
    if (Core && typeof Core.normalizeRevision === "function") return Core.normalizeRevision(value);
    return norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "");
  }
  function searchKeys(value) {
    const raw = text(value);
    if (!raw) return [];
    if (Core && typeof Core.documentSearchKeys === "function") return [...new Set(Core.documentSearchKeys(raw).map(norm).filter(Boolean))];
    const valueKey = norm(raw);
    return valueKey ? [valueKey] : [];
  }
  function extensionOf(name) {
    const match = text(name).match(/\.([A-Z0-9]{1,10})$/i);
    return match ? match[1].toLowerCase() : "";
  }
  function stemOf(name) { return text(name).replace(/\.[^.]+$/, ""); }
  function boundaryMatch(haystack, needle) {
    const source = norm(haystack);
    const wanted = norm(needle);
    if (!source || !wanted) return false;
    let from = 0;
    while (from <= source.length - wanted.length) {
      const at = source.indexOf(wanted, from);
      if (at < 0) return false;
      const before = at > 0 ? source[at - 1] : "";
      const after = at + wanted.length < source.length ? source[at + wanted.length] : "";
      const beforeOk = !before || !/[A-Z0-9]/.test(before);
      const afterOk = !after || !/[A-Z0-9]/.test(after);
      if (beforeOk && afterOk) return true;
      from = at + 1;
    }
    return false;
  }
  function matchesDocument(fileName, document) {
    const stem = stemOf(fileName);
    return searchKeys(document).some((key) => boundaryMatch(stem, key));
  }
  function revisionFromName(fileName, document) {
    if (!History || typeof History.generatedRevision !== "function") return "";
    // ET pode aparecer com ou sem nt- no arquivo físico. O casamento de
    // documento já usa documentSearchKeys; a extração da revisão precisa usar
    // as mesmas variantes para não classificar um arquivo correto como ambíguo.
    const candidates = [...new Set([text(document), ...searchKeys(document)].filter(Boolean))];
    for (const candidate of candidates) {
      const revision = normalizeRevision(History.generatedRevision({ document: candidate, finalName: fileName }));
      if (revision) return revision;
    }
    return "";
  }
  function unique(values) { return [...new Set((values || []).filter(Boolean))]; }

  function historyRecordFor(row, records) {
    const all = records || [];
    const ids = new Set([text(row && row.historyRecordId), text(row && row.historyId)].filter(Boolean));
    return all.find((record) => ids.has(text(record.id)) || ids.has(text(record.clientRecordId)))
      || all.find((record) => text(record.egrdtNumber) === text(row && row.egrdtNumber))
      || null;
  }
  function sameDocument(left, right) {
    const leftKeys = new Set(searchKeys(left));
    return searchKeys(right).some((key) => leftKeys.has(key));
  }
  function targetFromConference(row, historyRecords) {
    const record = historyRecordFor(row, historyRecords);
    const revision = normalizeRevision(row && row.revisionSent);
    const files = (record && record.files || []).filter((file) => sameDocument(file.document, row && row.document) && normalizeRevision(file.grdtRevision || file.revision) === revision);
    const expectedByExtension = {};
    files.forEach((file) => {
      const ext = extensionOf(file.finalName || file.originalName);
      if (ext) expectedByExtension[ext] = (expectedByExtension[ext] || 0) + 1;
    });
    return {
      id: text(row && row.key) || `${text(row && row.historyId)}|${norm(row && row.document)}|${revision}`,
      rowKey: text(row && row.key),
      historyId: text(row && row.historyId),
      historyRecordId: text(row && row.historyRecordId),
      egrdtNumber: text(row && row.egrdtNumber),
      generatedAt: text(row && row.generatedAt),
      document: text(row && row.document),
      revision,
      documentFamily: text(row && row.documentFamily),
      discipline: text(row && row.discipline),
      conferenceStatus: text(row && row.status),
      conferenceLabel: text(row && (row.conferenceLabel || row.statusLabel)),
      sigemStatus: text(row && row.sigemStatus),
      revisionFound: text(row && row.revisionFound),
      expectedByExtension,
      historyFiles: files.map((file) => ({ originalName: text(file.originalName), finalName: text(file.finalName), extension: extensionOf(file.finalName || file.originalName) })),
    };
  }

  function normalizeEntry(entry) {
    const normalized = {
      id: text(entry && entry.id),
      rootId: text(entry && entry.rootId),
      rootLabel: text(entry && entry.rootLabel),
      generation: text(entry && entry.generation),
      name: text(entry && entry.name),
      relativePath: text(entry && entry.relativePath),
      size: Number(entry && entry.size) || 0,
      lastModified: Number(entry && entry.lastModified) || 0,
      extension: text(entry && entry.extension) || extensionOf(entry && entry.name),
      indexedAt: text(entry && entry.indexedAt),
    };
    // A pasta escolhida somente para a sessão não existe em índice nenhum: a
    // única forma de reabrir aquele arquivo é a referência física devolvida
    // pelo seletor do navegador. A normalização descartava essa referência, e
    // o lote preparado a partir dessa pasta falhava no fim — ao gerar o ZIP, ao
    // baixar os arquivos e ao copiar para pasta — alegando que a raiz
    // autorizada não estava mais disponível, sendo que raiz autorizada nunca
    // houve.
    if (entry && entry.__fileRef) normalized.__fileRef = entry.__fileRef;
    return normalized;
  }

  function classifyTarget(target, indexedEntries) {
    const source = (indexedEntries || []).map(normalizeEntry);
    const documentCandidates = source.filter((entry) => matchesDocument(entry.name, target.document));
    if (!documentCandidates.length) return { state: STATES.NOT_FOUND, target, candidates: [], selected: [], evidence: "Nenhum arquivo com identidade documental inequívoca foi localizado no índice autorizado." };

    const analyzed = documentCandidates.map((entry) => ({ ...entry, identifiedRevision: revisionFromName(entry.name, target.document) }));
    const exact = analyzed.filter((entry) => entry.identifiedRevision && entry.identifiedRevision === normalizeRevision(target.revision));
    const unknownRevision = analyzed.filter((entry) => !entry.identifiedRevision);
    const different = analyzed.filter((entry) => entry.identifiedRevision && entry.identifiedRevision !== normalizeRevision(target.revision));

    if (!exact.length) {
      if (unknownRevision.length) return { state: STATES.AMBIGUOUS, target, candidates: analyzed, selected: [], evidence: "O documento foi localizado, mas a revisão não pôde ser identificada de forma inequívoca em um ou mais nomes de arquivo." };
      return { state: STATES.DIFFERENT_REVISION, target, candidates: different, selected: [], revisionsFound: unique(different.map((entry) => entry.identifiedRevision)), evidence: "O documento foi localizado, porém somente em revisão diferente da revisão válida do Histórico." };
    }

    const expected = target.expectedByExtension || {};
    const expectedExtensions = Object.keys(expected);
    const selected = [];
    const ambiguous = [];
    const missing = [];

    if (expectedExtensions.length) {
      expectedExtensions.forEach((ext) => {
        const candidates = exact.filter((entry) => entry.extension === ext);
        const wantedCount = Number(expected[ext]) || 1;
        if (candidates.length < wantedCount) {
          selected.push(...candidates);
          missing.push({ extension: ext, expected: wantedCount, found: candidates.length });
        } else if (candidates.length > wantedCount) {
          ambiguous.push(...candidates);
        } else selected.push(...candidates);
      });
    } else {
      const byExtension = new Map();
      exact.forEach((entry) => {
        const ext = entry.extension || "sem-extensao";
        if (!byExtension.has(ext)) byExtension.set(ext, []);
        byExtension.get(ext).push(entry);
      });
      byExtension.forEach((entries) => {
        if (entries.length === 1) selected.push(entries[0]);
        else ambiguous.push(...entries);
      });
    }

    if (ambiguous.length) return { state: STATES.AMBIGUOUS, target, candidates: exact, selected, ambiguous, evidence: "Há mais arquivos válidos do que o esperado para pelo menos um formato. O GRCON não escolheu automaticamente." };
    if (missing.length) return { state: STATES.NOT_FOUND, target, candidates: exact, selected, missing, partial: selected.length > 0, evidence: "Parte dos formatos esperados foi localizada, mas o conjunto documental ainda está incompleto." };
    return { state: STATES.FOUND, target, candidates: exact, selected, evidence: `Correspondência exata de documento + revisão ${normalizeRevision(target.revision)} encontrada.` };
  }

  function stateLabel(state) {
    return ({
      [STATES.FOUND]: "Encontrado",
      [STATES.NOT_FOUND]: "Não encontrado",
      [STATES.AMBIGUOUS]: "Ambíguo",
      [STATES.DIFFERENT_REVISION]: "Revisão diferente",
      [STATES.PERMISSION_REQUIRED]: "Permissão necessária",
      [STATES.UNCHECKED]: "Não verificado",
    })[state] || "Não verificado";
  }

  function summarize(results) {
    const rows = results || [];
    return {
      documents: rows.length,
      filesFound: rows.reduce((total, result) => total + (result.selected || []).length, 0),
      found: rows.filter((result) => result.state === STATES.FOUND).length,
      notFound: rows.filter((result) => result.state === STATES.NOT_FOUND).length,
      ambiguous: rows.filter((result) => result.state === STATES.AMBIGUOUS).length,
      differentRevision: rows.filter((result) => result.state === STATES.DIFFERENT_REVISION).length,
      permissionRequired: rows.filter((result) => result.state === STATES.PERMISSION_REQUIRED).length,
      ready: rows.length > 0 && rows.every((result) => result.state === STATES.FOUND),
    };
  }

  return Object.freeze({ STATES, text, norm, normalizeRevision, searchKeys, extensionOf, matchesDocument, revisionFromName, targetFromConference, classifyTarget, stateLabel, summarize });
});
