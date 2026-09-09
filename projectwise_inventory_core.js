(function (root, factory) {
  const api = factory(root.TriagemCore || (typeof require === "function" ? (() => { try { return require("./core.js"); } catch (_) { return null; } })() : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconProjectWiseInventory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";

  const SIGEM_ALIASES = Object.freeze({
    document: ["DOCUMENTO","CODIGO DO DOCUMENTO","CÓDIGO DO DOCUMENTO","DOCUMENT NUMBER","DOCUMENT","COD DOCUMENTO"],
    revision: ["REVISAO","REVISÃO","REV","REVISION","VERSAO","VERSÃO"],
    title: ["TITULO","TÍTULO","TITLE","DESCRIPTION","DESCRICAO","DESCRIÇÃO"],
    status: ["STATUS","STATUS SIGEM","SITUACAO","SITUAÇÃO"],
    discipline: ["DISCIPLINA","DISCIPLINE"],
    area: ["AREA","ÁREA"],
    eap: ["EAP","WBS","EAP/WBS","WBS/EAP"],
    tag: ["TAG"],
    documentType: ["TIPO DOCUMENTAL","TIPO DE DOCUMENTO","TIPO DOCUMENTO","DOCUMENT TYPE"],
    project: ["EMPREENDIMENTO","PROJECT","PROJETO"],
    unit: ["UNIDADE","UNIT"],
    taxonomy: ["TAXONOMIA","TAXONOMIA INTERNA","TAXONOMY"],
    fileName: ["ARQUIVO","NOME DO ARQUIVO","FILE NAME","FILENAME"],
    destination: ["DESTINO PROJECTWISE","CAMINHO PROJECTWISE","PROJECTWISE PATH","DESTINATION"],
  });

  const PW_ALIASES = Object.freeze({
    document: ["DOCUMENT NUMBER","DOCUMENT NO","DOCUMENTO","CODIGO","CÓDIGO","CODE","NUMBER","PW CODE","CODIGO PW","CÓDIGO PW"],
    revision: ["REVISION","REVISAO","REVISÃO","REV","VERSION","VERSAO","VERSÃO"],
    id: ["DOCUMENT ID","PW ID","INSTANCE ID","INSTANCEID","GUID","OBJECT ID","OBJECTID"],
    sigemCode: ["CODIGO SIGEM","CÓDIGO SIGEM","SIGEM CODE","CODIGO LD","CÓDIGO LD","LD CODE"],
    title: ["DESCRIPTION","TITLE","TITULO","TÍTULO","DESCRICAO","DESCRIÇÃO"],
    fileName: ["FILE NAME","FILENAME","NOME DO ARQUIVO","ARQUIVO"],
    folderPath: ["FOLDER PATH","PROJECTWISE PATH","PW PATH","FULL PATH","PATH","CAMINHO PROJECTWISE","PASTA PROJECTWISE","FOLDER"],
    discipline: ["DISCIPLINE","DISCIPLINA"],
    area: ["AREA","ÁREA"],
    eap: ["EAP","WBS","EAP/WBS","WBS/EAP"],
    tag: ["TAG"],
    documentType: ["DOCUMENT TYPE","TIPO DOCUMENTAL","TIPO DE DOCUMENTO","TIPO DOCUMENTO"],
    project: ["PROJECT","PROJETO","EMPREENDIMENTO"],
    unit: ["UNIT","UNIDADE"],
    taxonomy: ["TAXONOMY","TAXONOMIA","TAXONOMIA LD","INTERNAL TAXONOMY"],
    environment: ["ENVIRONMENT","AMBIENTE"],
    state: ["STATE","WORKFLOW STATE","STATUS","ESTADO"],
    updatedAt: ["UPDATED AT","MODIFIED AT","UPDATE TIME","DATA MODIFICACAO","DATA MODIFICAÇÃO"],
    fileSize: ["FILE SIZE","TAMANHO","SIZE"],
  });

  function text(value) { return String(value == null ? "" : value).trim(); }
  function normalizeHeader(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function norm(value) {
    if (Core && typeof Core.key === "function") return Core.key(value);
    return normalizeHeader(value).replace(/\s+/g, "");
  }
  function normalizedAliases(source) {
    return Object.fromEntries(Object.entries(source).map(([field, aliases]) => [field, new Set(aliases.map(normalizeHeader))]));
  }
  const N_SIGEM = normalizedAliases(SIGEM_ALIASES);
  const N_PW = normalizedAliases(PW_ALIASES);

  function detectColumns(matrix, kind, maxRows) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const aliases = kind === "projectwise" ? N_PW : N_SIGEM;
    const limit = Math.min(rows.length, Number(maxRows) || 50);
    let best = null;
    for (let r = 0; r < limit; r += 1) {
      const headers = Array.isArray(rows[r]) ? rows[r] : [];
      const columns = {};
      Object.entries(aliases).forEach(([field, set]) => {
        columns[field] = headers.findIndex((value) => set.has(normalizeHeader(value)));
      });
      const score = Object.values(columns).filter((v) => v >= 0).length;
      if (columns.document >= 0 && (!best || score > best.score)) {
        best = { rowIndex: r, headerRow: r + 1, headers: headers.map(text), columns, score };
      }
    }
    return best;
  }

  function rowValue(row, index) { return index >= 0 && Array.isArray(row) ? text(row[index]) : ""; }
  function familyHint(document) {
    if (!Core || typeof Core.parseDocumentIdentity !== "function") return "";
    try { return text(Core.parseDocumentIdentity(document).family); } catch (_) { return ""; }
  }
  function enrichIdentity(record) {
    if (!Core || typeof Core.parseDocumentIdentity !== "function") return record;
    try {
      const identity = Core.parseDocumentIdentity(record.document, { sheetName: familyHint(record.document) });
      return {
        ...record,
        family: text(identity.family),
        eap: record.eap || text(identity.eap),
        eapValid: identity.eapApplicable === false ? true : identity.eapValid !== false,
        eapApplicable: identity.eapApplicable !== false,
        tag: record.tag || text(identity.tag || identity.tagRaw || identity.tagComparable),
        tagComparable: text(identity.tagComparable),
        documentType: record.documentType || text(identity.documentType),
      };
    } catch (_) { return record; }
  }

  function parseMatrix(matrix, kind) {
    const detection = detectColumns(matrix, kind);
    if (!detection) return { ok: false, records: [], errors: ["Não foi possível identificar a coluna de documento."], meta: {} };
    const records = [];
    const seen = new Set();
    const rows = matrix.slice(detection.rowIndex + 1);
    rows.forEach((row, offset) => {
      const document = rowValue(row, detection.columns.document);
      if (!document) return;
      const base = { sourceRow: detection.headerRow + offset + 1, document };
      Object.keys(detection.columns).forEach((field) => {
        if (field !== "document") base[field] = rowValue(row, detection.columns[field]);
      });
      const record = enrichIdentity(base);
      const identity = kind === "projectwise"
        ? `${text(record.id) || `${norm(record.document)}|${norm(record.folderPath)}|${record.sourceRow}`}|${norm(record.revision)}`
        : `${norm(record.document)}|${norm(record.revision)}|${record.sourceRow}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      records.push({ ...record, inventoryId: identity });
    });
    const mappedColumns = Object.fromEntries(Object.entries(detection.columns)
      .filter(([, index]) => index >= 0)
      .map(([field, index]) => [field, detection.headers[index] || field]));
    return {
      ok: true,
      records,
      errors: [],
      meta: { recordCount: records.length, sourceRowCount: rows.length, headerRow: detection.headerRow, columns: mappedColumns, kind },
    };
  }

  function workbookToMatrix(workbook, kind) {
    const XLSX = typeof globalThis !== "undefined" ? globalThis.XLSX : null;
    if (!workbook || !Array.isArray(workbook.SheetNames) || !XLSX?.utils?.sheet_to_json) {
      return { ok: false, errors: ["Planilha ou leitor XLSX indisponível."] };
    }
    let best = null;
    workbook.SheetNames.forEach((sheetName) => {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false, blankrows: false });
      const detection = detectColumns(matrix, kind);
      if (detection && (!best || detection.score > best.detection.score)) best = { matrix, detection, sheetName };
    });
    return best ? { ok: true, ...best } : { ok: false, errors: ["Nenhuma aba possui uma coluna de documento reconhecida."] };
  }

  function parseWorkbook(workbook, kind, fileMeta) {
    const selected = workbookToMatrix(workbook, kind);
    if (!selected.ok) return { ok: false, records: [], meta: {}, errors: selected.errors };
    const parsed = parseMatrix(selected.matrix, kind);
    parsed.meta = {
      ...parsed.meta,
      sheetName: selected.sheetName,
      fileName: text(fileMeta?.fileName),
      fileSize: Number(fileMeta?.fileSize) || 0,
      lastModified: Number(fileMeta?.lastModified) || 0,
      importedAt: new Date().toISOString(),
    };
    return parsed;
  }

  function parseProjectWiseJson(input, fileMeta) {
    let source = input;
    if (typeof source === "string") {
      try { source = JSON.parse(source); } catch (_) { return { ok: false, records: [], errors: ["JSON do ProjectWise inválido."], meta: {} }; }
    }
    const list = Array.isArray(source) ? source : Array.isArray(source?.items) ? source.items : Array.isArray(source?.instances) ? source.instances : [];
    if (!list.length) return { ok: false, records: [], errors: ["JSON não contém uma lista de documentos reconhecível."], meta: {} };
    const records = list.map((item, index) => {
      const p = item?.properties || item || {};
      const record = enrichIdentity({
        document: text(p.DocumentNumber || p.documentNumber || p.Number || p.number || p.Name || p.name),
        revision: text(p.Revision || p.revision || p.Version || p.version),
        id: text(item?.instanceId || p.id || p.Id || p.DocumentId || p.documentId),
        sigemCode: text(p.SigemCode || p.sigemCode || p.LdCode || p.ldCode),
        title: text(p.Description || p.description || p.Title || p.title),
        fileName: text(p.FileName || p.fileName),
        folderPath: text(p.FolderPath || p.folderPath || p.Path || p.path),
        discipline: text(p.Discipline || p.discipline),
        area: text(p.Area || p.area),
        eap: text(p.EAP || p.eap || p.WBS || p.wbs),
        tag: text(p.Tag || p.tag),
        documentType: text(p.DocumentType || p.documentType),
        project: text(p.Project || p.project),
        unit: text(p.Unit || p.unit),
        taxonomy: text(p.Taxonomy || p.taxonomy),
        environment: text(p.Environment || p.environment),
        state: text(p.State || p.state),
        updatedAt: text(p.UpdateTime || p.updatedAt || p.ModifiedAt),
        fileSize: text(p.FileSize || p.fileSize),
        sourceRow: index + 1,
      });
      return { ...record, inventoryId: `${record.id || `${norm(record.document)}|${index + 1}`}|${norm(record.revision)}` };
    }).filter((r) => r.document || r.sigemCode);
    return {
      ok: records.length > 0,
      records,
      errors: records.length ? [] : ["JSON não contém documentos utilizáveis."],
      meta: { recordCount: records.length, fileName: text(fileMeta?.fileName), importedAt: new Date().toISOString(), kind: "projectwise-json" },
    };
  }

  return Object.freeze({
    SIGEM_ALIASES, PW_ALIASES, normalizeHeader, norm, detectColumns, parseMatrix, parseWorkbook, parseProjectWiseJson, enrichIdentity,
  });
});