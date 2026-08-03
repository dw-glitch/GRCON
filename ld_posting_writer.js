(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconLdPostingWriter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0.0";
  const ERROR_VALUES = new Set(["#N/A", "N/A", "#N/D", "#VALUE!", "#VALOR!", "#REF!", "#NAME?", "#NOME?", "#DIV/0!", "#NULL!", "#NUM!"]);

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").toUpperCase();
  }
  function loose(value) { return norm(value).replace(/[^A-Z0-9]/g, ""); }
  function isBlank(value) { const valueNorm = norm(value); return !valueNorm || ERROR_VALUES.has(valueNorm); }
  function escapeXml(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
  function columnName(index) { let value = Number(index) + 1, result = ""; while (value > 0) { const rest = (value - 1) % 26; result = String.fromCharCode(65 + rest) + result; value = Math.floor((value - 1) / 26); } return result; }
  function timestamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, ""); }
  function outputName(name) {
    const source = text(name) || "LD.xlsx";
    const match = source.match(/^(.*?)(\.(?:xlsx|xlsm))$/i);
    const base = match ? match[1] : source;
    const extension = match ? match[2] : ".xlsx";
    return `${base}_ATUALIZADA_POS_SIGEM_GRCON_${timestamp()}${extension}`;
  }
  function resultDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  function excelSerial(date, date1904) {
    const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
    return Math.round((utc - epoch) / 86400000);
  }
  function comparableDate(value, date1904) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if ((typeof value === "number" && Number.isFinite(value)) || /^\d+(?:\.\d+)?$/.test(text(value))) {
      const serial = Number(value);
      const epoch = new Date(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
      const parsed = new Date(epoch.getTime() + Math.round(serial) * 86400000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  function equivalentDate(value, expected, date1904) {
    if (isBlank(value) && !expected) return true;
    const parsed = comparableDate(value, date1904);
    if (!parsed) return norm(value) === norm(expected);
    const target = comparableDate(expected, date1904);
    if (!target) return false;
    return parsed.getFullYear() === target.getFullYear() && parsed.getMonth() === target.getMonth() && parsed.getDate() === target.getDate();
  }

  function headerKind(value) {
    const key = norm(value).replace(/[º°]/g, "").replace(/\./g, "");
    if (key === "DOCUMENTO" || key.startsWith("DOCUMENTO ") || key === "CODIGO DO DOCUMENTO" || key === "NOME DOCUMENTO" || key === "NOMEDOCUMENTO") return "document";
    if (/^(REVISAO|REV)$/.test(key)) return "revision";
    if (/^DATA EFETIVA( DE)? EMISSAO$/.test(key) || key === "DATA EFETIVA") return "effectiveDate";
    if (/^(E?GRDT|NUMERO DA E?GRDT|N DA E?GRDT|NO DA E?GRDT)$/.test(key)) return "grdt";
    return "";
  }

  function detectSheets(workbook, XLSX) {
    const result = [];
    (workbook.SheetNames || []).forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "", blankrows: false });
      let detected = null;
      for (let rowIndex = 0; rowIndex < Math.min(rows.length, 35); rowIndex += 1) {
        const mapping = {};
        (rows[rowIndex] || []).forEach((value, columnIndex) => { const kind = headerKind(value); if (kind && mapping[kind] === undefined) mapping[kind] = columnIndex; });
        if (mapping.document !== undefined && mapping.effectiveDate !== undefined && mapping.grdt !== undefined) {
          detected = { sheetName, worksheet, rows, headerRow: rowIndex + 1, columns: mapping };
          break;
        }
      }
      if (detected) result.push(detected);
    });
    return result;
  }

  function cellValue(worksheet, row, column) {
    const cell = worksheet[`${columnName(column)}${row}`];
    if (!cell) return "";
    return cell.v instanceof Date ? cell.v : cell.v;
  }
  function cellFormula(worksheet, row, column) {
    const cell = worksheet[`${columnName(column)}${row}`];
    return Boolean(cell && cell.f);
  }

  function buildIndex(sheets) {
    const exact = new Map();
    const relaxed = new Map();
    sheets.forEach((sheet) => {
      for (let row = sheet.headerRow + 1; row <= sheet.rows.length; row += 1) {
        const document = text(cellValue(sheet.worksheet, row, sheet.columns.document));
        if (!document) continue;
        const revision = sheet.columns.revision !== undefined ? text(cellValue(sheet.worksheet, row, sheet.columns.revision)) : "";
        const entry = { sheet, row, document, revision };
        const exactKey = norm(document);
        const relaxedKey = loose(document);
        if (!exact.has(exactKey)) exact.set(exactKey, []);
        exact.get(exactKey).push(entry);
        if (!relaxed.has(relaxedKey)) relaxed.set(relaxedKey, []);
        relaxed.get(relaxedKey).push(entry);
      }
    });
    return { exact, relaxed };
  }

  function chooseRow(file, index, sheets) {
    const wantedDocument = norm(file.document);
    const wantedRevision = norm(file.revision);
    if (!wantedDocument) return { error: "Documento não informado." };
    if (file.sheet && file.ldRow) {
      const sheet = sheets.find((item) => norm(item.sheetName) === norm(file.sheet));
      if (sheet && Number(file.ldRow) > sheet.headerRow) {
        const currentDocument = cellValue(sheet.worksheet, Number(file.ldRow), sheet.columns.document);
        if (norm(currentDocument) === wantedDocument) return { entry: { sheet, row: Number(file.ldRow), document: text(currentDocument), revision: sheet.columns.revision !== undefined ? text(cellValue(sheet.worksheet, Number(file.ldRow), sheet.columns.revision)) : "" }, match: "linha registrada" };
      }
    }
    let candidates = index.exact.get(wantedDocument) || [];
    if (!candidates.length) candidates = index.relaxed.get(loose(file.document)) || [];
    if (candidates.length > 1 && wantedRevision) {
      const byRevision = candidates.filter((entry) => norm(entry.revision) === wantedRevision);
      if (byRevision.length === 1) candidates = byRevision;
    }
    if (candidates.length === 1) return { entry: candidates[0], match: index.exact.has(wantedDocument) ? "documento exato" : "documento normalizado" };
    if (!candidates.length) return { error: "Documento não localizado na LD." };
    return { error: "Documento localizado em mais de uma linha; necessita de conferência." };
  }

  function consolidate(records) {
    const map = new Map();
    const conflicts = [];
    (records || []).filter((record) => norm(record.status) === "POSTADO" && record.resultAt && (record.postingGrdtNumber || record.egrdtNumber)).forEach((record) => {
      (record.files || []).forEach((file) => {
        if (!file || !file.document) return;
        const key = `${norm(file.document)}|${norm(file.revision)}`;
        const item = { recordId: text(record.id), egrdtNumber: text(record.postingGrdtNumber || record.egrdtNumber), resultAt: text(record.resultAt), file };
        const previous = map.get(key);
        if (!previous) map.set(key, item);
        else if (norm(previous.egrdtNumber) !== norm(item.egrdtNumber) || !equivalentDate(previous.resultAt, item.resultAt)) {
          const latest = new Date(item.resultAt) >= new Date(previous.resultAt) ? item : previous;
          conflicts.push({ recordId: item.recordId, otherRecordId: previous.recordId, document: file.document, revision: file.revision, reason: "O mesmo documento/revisão aparece em mais de uma postagem." });
          map.delete(key);
          map.set(`${key}|CONFLICT`, latest);
        }
      });
    });
    conflicts.forEach((conflict) => {
      const base = `${norm(conflict.document)}|${norm(conflict.revision)}`;
      map.delete(base);
      map.delete(`${base}|CONFLICT`);
    });
    return { items: [...map.values()], conflicts };
  }

  function parseRelationships(xml) {
    const map = new Map();
    const regex = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g;
    let match;
    while ((match = regex.exec(xml))) map.set(match[1], match[2]);
    return map;
  }
  function sheetPaths(workbookXml, relsXml) {
    const relationships = parseRelationships(relsXml);
    const map = new Map();
    const regex = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g;
    let match;
    while ((match = regex.exec(workbookXml))) {
      const target = relationships.get(match[2]);
      if (!target) continue;
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`.replace(/\/worksheets\/\.\.\//g, "/");
      map.set(match[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"'), path);
    }
    return map;
  }
  function cellRegex(reference) { return new RegExp(`<c\\b([^>]*\\br="${reference}"[^>]*)>([\\s\\S]*?)<\\/c>|<c\\b([^>]*\\br="${reference}"[^>]*)\\/>`, "i"); }
  function styleFrom(attributes) { const match = String(attributes || "").match(/\bs="([^"]+)"/); return match ? ` s="${match[1]}"` : ""; }
  function patchCell(xml, reference, value, kind) {
    const regex = cellRegex(reference);
    const existing = xml.match(regex);
    const style = existing ? styleFrom(existing[1] || existing[3]) : "";
    const replacement = kind === "number"
      ? `<c r="${reference}"${style}><v>${value}</v></c>`
      : `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    if (existing) return xml.replace(regex, replacement);
    const row = Number(reference.match(/\d+$/)[0]);
    const rowRegex = new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`, "i");
    if (rowRegex.test(xml)) return xml.replace(rowRegex, (_, open, body, close) => `${open}${body}${replacement}${close}`);
    const rowXml = `<row r="${row}">${replacement}</row>`;
    return xml.replace(/<\/sheetData>/i, `${rowXml}</sheetData>`);
  }

  function safeTextOverwrite(current, oldValue, newValue) {
    if (isBlank(current) || norm(current) === norm(newValue)) return true;
    return !isBlank(oldValue) && norm(current) === norm(oldValue);
  }
  function safeDateOverwrite(current, oldValue, newDate, date1904) {
    if (isBlank(current) || equivalentDate(current, newDate, date1904)) return true;
    return !isBlank(oldValue) && equivalentDate(current, oldValue, date1904);
  }

  async function apply(file, records, dependencies) {
    const XLSX = dependencies && dependencies.XLSX;
    const JSZip = dependencies && dependencies.JSZip;
    if (!file || typeof file.arrayBuffer !== "function") throw new Error("Selecione a LD que será atualizada.");
    if (!XLSX || !JSZip) throw new Error("Não foi possível preparar a atualização da LD.");
    const sourceBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(sourceBuffer, { type: "array", cellDates: true, cellFormula: true, cellNF: true, cellStyles: true });
    const sheets = detectSheets(workbook, XLSX);
    if (!sheets.length) throw new Error("Não foram localizadas as colunas Documento, Data Efetiva e GRDT na LD.");
    const index = buildIndex(sheets);
    const consolidated = consolidate(records);
    const changes = [];
    const skipped = [...consolidated.conflicts];
    const recordIds = new Set();
    const date1904 = Boolean(workbook.Workbook && workbook.Workbook.WBProps && workbook.Workbook.WBProps.date1904);

    consolidated.items.forEach((item) => {
      const match = chooseRow(item.file, index, sheets);
      if (!match.entry) { skipped.push({ recordId: item.recordId, document: item.file.document, revision: item.file.revision, reason: match.error }); return; }
      const { sheet, row } = match.entry;
      const dateColumn = sheet.columns.effectiveDate;
      const grdtColumn = sheet.columns.grdt;
      if (cellFormula(sheet.worksheet, row, dateColumn) || cellFormula(sheet.worksheet, row, grdtColumn)) {
        skipped.push({ recordId: item.recordId, document: item.file.document, revision: item.file.revision, sheet: sheet.sheetName, row, reason: "A linha possui fórmula na Data Efetiva ou GRDT." });
        return;
      }
      const newDate = resultDate(item.resultAt);
      if (!newDate) { skipped.push({ recordId: item.recordId, document: item.file.document, revision: item.file.revision, reason: "Data da postagem inválida." }); return; }
      const currentDate = cellValue(sheet.worksheet, row, dateColumn);
      const currentGrdt = cellValue(sheet.worksheet, row, grdtColumn);
      if (!safeDateOverwrite(currentDate, item.file.effectiveDate, newDate, date1904) || !safeTextOverwrite(currentGrdt, item.file.grdt, item.egrdtNumber)) {
        skipped.push({ recordId: item.recordId, document: item.file.document, revision: item.file.revision, sheet: sheet.sheetName, row, reason: "A LD foi alterada depois da geração; necessita de conferência." });
        return;
      }
      changes.push({
        recordId: item.recordId,
        document: item.file.document,
        revision: item.file.revision,
        sheet: sheet.sheetName,
        row,
        dateReference: `${columnName(dateColumn)}${row}`,
        grdtReference: `${columnName(grdtColumn)}${row}`,
        dateValue: newDate,
        dateSerial: excelSerial(newDate, date1904),
        grdtValue: item.egrdtNumber,
        alreadyCorrect: equivalentDate(currentDate, newDate, date1904) && norm(currentGrdt) === norm(item.egrdtNumber),
        match: match.match,
      });
      recordIds.add(item.recordId);
    });

    if (!changes.length) return { buffer: null, fileName: "", changes: [], skipped, recordsApplied: [], documentsUpdated: 0, alreadyCorrect: 0, sourceName: file.name };
    const zip = await JSZip.loadAsync(sourceBuffer);
    const workbookXml = await zip.file("xl/workbook.xml").async("string");
    const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
    const paths = sheetPaths(workbookXml, relsXml);
    const grouped = new Map();
    changes.forEach((change) => { if (!grouped.has(change.sheet)) grouped.set(change.sheet, []); grouped.get(change.sheet).push(change); });
    for (const [sheetName, sheetChanges] of grouped) {
      const path = paths.get(sheetName);
      if (!path || !zip.file(path)) throw new Error(`Não foi possível atualizar a aba ${sheetName}.`);
      let xml = await zip.file(path).async("string");
      sheetChanges.forEach((change) => {
        xml = patchCell(xml, change.dateReference, change.dateSerial, "number");
        xml = patchCell(xml, change.grdtReference, change.grdtValue, "string");
      });
      zip.file(path, xml);
    }
    const output = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const verification = XLSX.read(output, { type: "array", cellDates: true, cellFormula: true, cellNF: true, cellStyles: true });
    changes.forEach((change) => {
      const worksheet = verification.Sheets[change.sheet];
      const currentDate = worksheet[change.dateReference] && worksheet[change.dateReference].v;
      const currentGrdt = worksheet[change.grdtReference] && worksheet[change.grdtReference].v;
      if (!equivalentDate(currentDate, change.dateValue, date1904) || norm(currentGrdt) !== norm(change.grdtValue)) {
        throw new Error(`A conferência final falhou no documento ${change.document}: Data “${text(currentDate)}”; GRDT “${text(currentGrdt)}”.`);
      }
    });
    const skippedRecordIds = new Set();
    skipped.forEach((item) => {
      if (item.recordId) skippedRecordIds.add(item.recordId);
      if (item.otherRecordId) skippedRecordIds.add(item.otherRecordId);
    });
    const recordsApplied = [...recordIds].filter((id) => !skippedRecordIds.has(id));
    return {
      buffer: output,
      fileName: outputName(file.name),
      sourceName: file.name,
      changes,
      skipped,
      recordsApplied,
      documentsUpdated: changes.filter((change) => !change.alreadyCorrect).length,
      alreadyCorrect: changes.filter((change) => change.alreadyCorrect).length,
    };
  }

  return Object.freeze({ VERSION, apply, detectSheets, consolidate, norm, loose, outputName });
});
