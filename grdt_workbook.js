(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    let sheetJsModule;
    try {
      sheetJsModule = require("./xlsx.full.min.js");
    } catch (_) {
      console.debug("[Workbook] context:", _);
      sheetJsModule = require("./vendor/xlsx.full.min.js");
    }
    module.exports = factory(sheetJsModule);
  } else {
    root.GrdtWorkbook = factory(root.XLSX);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (XLSX) {
  "use strict";

  const HEADERS = [
    "DOCUMENTO", "REVISÃO", "TÍTULO", "ARQUIVO", "FORMATO",
    "DISCIPLINA", "TIPO DE DOCUMENTO", "PROPÓSITO", "CAMINHO DATABOOK",
  ];
  const NOTES = [
    "ATENÇÃO:",
    "O CAMPO REVISÃO NÃO PODERÁ FICAR VAZIO",
    "A COLUNA ARQUIVO NÃO PODERÁ FICAR VAZIA E DEVERÁ CONTER A EXTENSÃO. Ex (.doc, .pdf, .xls, ...)",
    "AS COLUNAS NÃO PODERÃO SER TROCADAS DE LUGAR, OCULTADAS E NEM EXCLUÍDAS",
    "AO FINAL DO PREENCHIMENTO DA PLANILHA, NÃO PODERÃO HAVER LINHAS EM BRANCO",
    "USE OS COMBOS SELETORES NAS COLUNAS QUE POSSUEM AS POSSIBILIDADES DE PREENCHIMENTO",
  ];
  const MIME = "application/vnd.ms-excel";
  const EXTENSION = ".xls";
  const CFB_SIGNATURE = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  const RECORD = Object.freeze({
    BOF: 0x0809,
    EOF: 0x000A,
    BOUND_SHEET: 0x0085,
    NAME: 0x0018,
    INDEX: 0x020B,
    DIMENSIONS: 0x0200,
    ROW: 0x0208,
    NUMBER: 0x0203,
    LABEL: 0x0204,
    LABEL_SST: 0x00FD,
    BLANK: 0x0201,
    MUL_BLANK: 0x00BE,
    WINDOW_2: 0x023E,
    DV: 0x01BE,
  });

  function value(input) {
    return input === null || input === undefined ? "" : String(input);
  }

  function bytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    return new Uint8Array(input || []);
  }

  function u16(data, offset) {
    return data[offset] | (data[offset + 1] << 8);
  }

  function u32(data, offset) {
    return (u16(data, offset) | (u16(data, offset + 2) << 16)) >>> 0;
  }

  function setU16(data, offset, number) {
    data[offset] = number & 0xFF;
    data[offset + 1] = (number >>> 8) & 0xFF;
  }

  function setU32(data, offset, number) {
    setU16(data, offset, number & 0xFFFF);
    setU16(data, offset + 2, (number >>> 16) & 0xFFFF);
  }

  function concat(parts) {
    const size = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    parts.forEach((part) => {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  function copy(data, start, end) {
    return bytes(data).slice(start, end);
  }

  function isLegacyXls(buffer) {
    const data = bytes(buffer);
    return CFB_SIGNATURE.every((part, index) => data[index] === part);
  }

  let cachedTemplate = null;

  async function loadTemplate() {
    if (cachedTemplate) return cachedTemplate;
    if (typeof process !== "undefined" && process.versions && process.versions.node) {
      const fs = require("fs");
      const path = require("path");
      cachedTemplate = new Uint8Array(fs.readFileSync(path.join(__dirname, "grdt-template.xlsx")));
      return cachedTemplate;
    }
    // Em Web Worker o endereço relativo parte de /workers/. O facade define a
    // raiz dos ativos para que o mesmo módulo funcione na página e no worker.
    const assetBase = typeof globalThis !== "undefined" && globalThis.GRCON_ASSET_BASE || "";
    const response = await fetch(`${assetBase}grdt-template.xlsx`);
    if (!response.ok) throw new Error("Falha ao carregar o modelo oficial XLS da eGRDT.");
    const arrayBuffer = await response.arrayBuffer();
    cachedTemplate = new Uint8Array(arrayBuffer);
    return cachedTemplate;
  }

  function records(data, start, end) {
    const found = [];
    let offset = start || 0;
    const limit = end === undefined ? data.length : end;
    while (offset + 4 <= limit) {
      const id = u16(data, offset);
      const length = u16(data, offset + 2);
      const next = offset + 4 + length;
      if (next > limit) throw new Error("O modelo oficial XLS contém um registro BIFF incompleto.");
      found.push({ id, offset, length, payload: offset + 4, end: next });
      offset = next;
    }
    if (offset !== limit) throw new Error("O modelo oficial XLS contém bytes BIFF não conciliados.");
    return found;
  }

  function makeRecord(id, payload) {
    const body = bytes(payload);
    if (body.length > 8224) throw new Error("Um campo da eGRDT excede o limite do formato XLS antigo.");
    const output = new Uint8Array(body.length + 4);
    setU16(output, 0, id);
    setU16(output, 2, body.length);
    output.set(body, 4);
    return output;
  }

  function inlineLabel(row, column, xf, input) {
    const text = value(input);
    if (text.length > 4000) throw new Error(`O texto da linha ${row + 1}, coluna ${column + 1}, é grande demais para o XLS antigo.`);
    const payload = new Uint8Array(9 + (text.length * 2));
    setU16(payload, 0, row);
    setU16(payload, 2, column);
    setU16(payload, 4, xf);
    setU16(payload, 6, text.length);
    payload[8] = 1;
    for (let index = 0; index < text.length; index += 1) setU16(payload, 9 + (index * 2), text.charCodeAt(index));
    return makeRecord(RECORD.LABEL, payload);
  }

  function blankCell(row, column, xf) {
    const payload = new Uint8Array(6);
    setU16(payload, 0, row);
    setU16(payload, 2, column);
    setU16(payload, 4, xf);
    return makeRecord(RECORD.BLANK, payload);
  }

  function numberCell(row, column, xf, number) {
    const payload = new Uint8Array(14);
    setU16(payload, 0, row);
    setU16(payload, 2, column);
    setU16(payload, 4, xf);
    new DataView(payload.buffer).setFloat64(6, Number(number), true);
    return makeRecord(RECORD.NUMBER, payload);
  }

  function cloneRow(payload, row) {
    const result = copy(payload, 0, payload.length);
    setU16(result, 0, row);
    return makeRecord(RECORD.ROW, result);
  }

  function workbookStream(cfb) {
    const index = cfb.FullPaths.findIndex((path) => /\/(?:Workbook|Book)$/i.test(path));
    if (index < 0 || !cfb.FileIndex[index] || !cfb.FileIndex[index].content) {
      throw new Error("O fluxo interno Workbook não foi encontrado no modelo oficial.");
    }
    return { index, data: bytes(cfb.FileIndex[index].content) };
  }

  function sheetOffset(data) {
    const globalRecords = records(data, 0, data.length);
    const bound = globalRecords.find((entry) => entry.id === RECORD.BOUND_SHEET);
    if (!bound || bound.length < 4) throw new Error("A aba GRDT não foi localizada no modelo oficial.");
    return u32(data, bound.payload);
  }

  function extractTemplate(stream, start) {
    const sheetRecords = records(stream, start, stream.length);
    const dimensions = sheetRecords.find((entry) => entry.id === RECORD.DIMENSIONS);
    const window2 = sheetRecords.find((entry) => entry.id === RECORD.WINDOW_2 && dimensions && entry.offset > dimensions.offset);
    if (!dimensions || !window2) throw new Error("A estrutura da aba GRDT no modelo oficial está incompleta.");

    const rowPayloads = new Map();
    const xfs = new Map();
    sheetRecords.forEach((entry) => {
      if (entry.id === RECORD.ROW && entry.length >= 16) {
        rowPayloads.set(u16(stream, entry.payload), copy(stream, entry.payload, entry.end));
      }
      if ([RECORD.LABEL_SST, RECORD.LABEL, RECORD.NUMBER, RECORD.BLANK].includes(entry.id) && entry.length >= 6) {
        const row = u16(stream, entry.payload);
        const column = u16(stream, entry.payload + 2);
        xfs.set(`${row}:${column}`, u16(stream, entry.payload + 4));
      }
      if (entry.id === RECORD.MUL_BLANK && entry.length >= 8) {
        const row = u16(stream, entry.payload);
        const firstColumn = u16(stream, entry.payload + 2);
        const lastColumn = u16(stream, entry.end - 2);
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          xfs.set(`${row}:${column}`, u16(stream, entry.payload + 4 + ((column - firstColumn) * 2)));
        }
      }
    });

    [0, 1, 3, 6, 7, 8, 9, 10, 11].forEach((row) => {
      if (!rowPayloads.has(row)) throw new Error(`O estilo da linha ${row + 1} não foi encontrado no modelo oficial.`);
    });
    return { dimensions, window2, rowPayloads, xfs };
  }

  function xf(template, row, column, fallback) {
    const selected = template.xfs.get(`${row}:${column}`);
    if (selected === undefined && fallback === undefined) throw new Error(`O estilo oficial da célula ${row + 1}:${column + 1} não foi encontrado.`);
    return selected === undefined ? fallback : selected;
  }

  function patchPrintArea(globalPart, fimRow) {
    records(globalPart, 0, globalPart.length).forEach((entry) => {
      if (entry.id !== RECORD.NAME || entry.length < 26) return;
      const flags = u16(globalPart, entry.payload);
      const nameLength = globalPart[entry.payload + 3];
      const formulaLength = u16(globalPart, entry.payload + 4);
      const nameStart = entry.payload + 14;
      const formulaStart = nameStart + nameLength;
      const builtInPrintArea = (flags & 0x20) && nameLength === 1 && globalPart[nameStart] === 0x06;
      if (!builtInPrintArea || formulaLength < 11 || globalPart[formulaStart] !== 0x3B) return;
      setU16(globalPart, formulaStart + 5, fimRow);
    });
  }

  function preamble(stream, start, dimensions) {
    const output = [];
    records(stream, start, dimensions.end).forEach((entry) => {
      if (entry.id !== RECORD.INDEX) output.push(copy(stream, entry.offset, entry.end));
    });
    return concat(output);
  }

  function postamble(stream, start, itemCount) {
    const output = [];
    records(stream, start, stream.length).forEach((entry) => {
      const record = copy(stream, entry.offset, entry.end);
      if (entry.id === RECORD.DV && entry.length >= 10) {
        const payloadLength = entry.length;
        const rangeCountOffset = 4 + payloadLength - 10;
        if (u16(record, rangeCountOffset) === 1) {
          setU16(record, rangeCountOffset + 2, 1);
          setU16(record, rangeCountOffset + 4, itemCount);
        }
      }
      output.push(record);
    });
    return concat(output);
  }

  function dataRecords(items, template) {
    const output = [];
    const headerRow = template.rowPayloads.get(0);
    output.push(cloneRow(headerRow, 0));
    HEADERS.forEach((header, column) => output.push(inlineLabel(0, column, xf(template, 0, column, 109), header)));

    items.forEach((item, index) => {
      const row = index + 1;
      output.push(cloneRow(template.rowPayloads.get(1), row));
      const fields = [
        item.document, item.revision, item.title, item.fileName, item.format,
        item.discipline, item.documentType, item.purpose, item.databook,
      ];
      fields.forEach((field, column) => {
        const style = xf(template, 1, column, column === 1 ? 111 : 110);
        if (column === 1 && value(field) === "0") output.push(numberCell(row, column, style, 0));
        else if (value(field) === "") output.push(blankCell(row, column, style));
        else output.push(inlineLabel(row, column, style, field));
      });
    });

    const fimRow = items.length + 1;
    output.push(cloneRow(template.rowPayloads.get(3), fimRow));
    output.push(inlineLabel(fimRow, 0, xf(template, 3, 0, 74), "FIM"));
    for (let column = 1; column < HEADERS.length; column += 1) {
      output.push(blankCell(fimRow, column, xf(template, 3, column, 75)));
    }

    NOTES.forEach((note, index) => {
      const row = fimRow + 3 + index;
      const templateRow = 6 + index;
      output.push(cloneRow(template.rowPayloads.get(templateRow), row));
      output.push(inlineLabel(row, 0, xf(template, templateRow, 0, index ? 90 : 88), note));
    });
    return concat(output);
  }

  async function build(items) {
    if (!XLSX || !XLSX.CFB || !XLSX.utils) throw new Error("O gerador XLS oficial da GRDT não foi carregado.");
    if (!Array.isArray(items) || !items.length) throw new Error("Nenhum item foi informado para a GRDT.");
    if (items.length > 48) throw new Error("Uma única eGRDT operacional pode conter no máximo 48 documentos. Divida a emissão em novos lotes.");

    const cfb = XLSX.CFB.read(await loadTemplate(), { type: "buffer" });
    const workbook = workbookStream(cfb);
    const start = sheetOffset(workbook.data);
    const template = extractTemplate(workbook.data, start);
    const globalPart = copy(workbook.data, 0, start);
    const fimRow = items.length + 1;
    patchPrintArea(globalPart, fimRow);

    const rebuilt = concat([
      globalPart,
      preamble(workbook.data, start, template.dimensions),
      dataRecords(items, template),
      postamble(workbook.data, template.window2.offset, items.length),
    ]);
    cfb.FileIndex[workbook.index].content = rebuilt;
    cfb.FileIndex[workbook.index].size = rebuilt.length;
    const output = bytes(XLSX.CFB.write(cfb, { type: "array" }));
    if (!isLegacyXls(output)) throw new Error("A eGRDT não foi produzida no formato XLS legado exigido pelo SIGEM.");
    return output;
  }

  async function verify(buffer, items) {
    if (!XLSX || !XLSX.utils || typeof XLSX.read !== "function") throw new Error("O verificador XLS da GRDT não foi carregado.");
    if (!isLegacyXls(buffer)) throw new Error("A eGRDT não é um arquivo XLS BIFF8 válido.");
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true, cellText: false });
    const sheet = workbook.Sheets.GRDT;
    if (!sheet) throw new Error("A planilha GRDT não foi encontrada no arquivo XLS gerado.");
    const expected = Array.isArray(items) ? items : [];

    HEADERS.forEach((header, index) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: index })];
      if (value(cell && cell.v) !== header) throw new Error(`GRDT inconsistente: cabeçalho ${header} ausente na coluna ${index + 1}.`);
    });

    const fields = [
      [0, "document", "DOCUMENTO"], [1, "revision", "REVISÃO"], [2, "title", "TÍTULO"],
      [3, "fileName", "ARQUIVO"], [4, "format", "FORMATO"], [5, "discipline", "DISCIPLINA"],
      [6, "documentType", "TIPO DE DOCUMENTO"], [7, "purpose", "PROPÓSITO"], [8, "databook", "CAMINHO DATABOOK"],
    ];
    const reopenedRows = [];
    expected.forEach((item, index) => {
      const reopened = {};
      fields.forEach(([column, property, label]) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: column })];
        const actual = value(cell && cell.v);
        const wanted = value(item[property]);
        reopened[property] = actual;
        if (actual !== wanted) throw new Error(`GRDT inconsistente na linha ${index + 2}: ${label} “${actual}” diverge de “${wanted}”.`);
      });
      reopenedRows.push(reopened);
    });

    const fimIndex = expected.length + 1;
    const fimCell = sheet[XLSX.utils.encode_cell({ r: fimIndex, c: 0 })];
    if (value(fimCell && fimCell.v) !== "FIM") throw new Error("A linha FIM da GRDT não foi encontrada na posição esperada.");
    for (let column = 1; column < HEADERS.length; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: fimIndex, c: column })];
      if (value(cell && cell.v) !== "") throw new Error(`GRDT inconsistente: a linha FIM contém valor inesperado na coluna ${column + 1}.`);
    }
    return {
      valid: true,
      format: "BIFF8",
      extension: EXTENSION,
      officialTemplate: true,
      checkedRows: reopenedRows.length,
      rows: reopenedRows,
    };
  }

  async function inspect(buffer) {
    if (!XLSX || !XLSX.utils || typeof XLSX.read !== "function") {
      throw new Error("O leitor XLS da GRDT não foi carregado.");
    }
    if (!isLegacyXls(buffer)) throw new Error("A eGRDT corrigida não é um arquivo XLS BIFF8 válido.");
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true, cellText: false });
    const sheet = workbook.Sheets.GRDT;
    if (!sheet) throw new Error("A planilha GRDT não foi encontrada na eGRDT corrigida.");

    HEADERS.forEach((header, index) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: index })];
      if (value(cell && cell.v) !== header) {
        throw new Error(`A eGRDT corrigida não usa o modelo oficial: cabeçalho ${header} ausente na coluna ${index + 1}.`);
      }
    });

    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : { e: { r: 0 } };
    const fields = [
      [0, "document"], [1, "revision"], [2, "title"], [3, "fileName"], [4, "format"],
      [5, "discipline"], [6, "documentType"], [7, "purpose"], [8, "databook"],
    ];
    const rows = [];
    let fimRow = -1;

    for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
      const values = fields.map(([column]) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })];
        return value(cell && cell.v).trim();
      });
      if (values[0].toUpperCase() === "FIM") {
        if (values.slice(1).some(Boolean)) {
          throw new Error(`A linha FIM da eGRDT contém valores inesperados na linha ${rowIndex + 1}.`);
        }
        fimRow = rowIndex;
        break;
      }
      if (values.every((item) => !item)) {
        throw new Error(`A eGRDT contém uma linha em branco antes do FIM (linha ${rowIndex + 1}).`);
      }
      const row = {};
      fields.forEach(([, property], index) => { row[property] = values[index]; });
      rows.push(row);
    }

    if (fimRow < 0) throw new Error("A linha FIM não foi encontrada na eGRDT corrigida.");
    if (!rows.length) throw new Error("A eGRDT corrigida não contém documentos.");
    if (rows.length > 48) throw new Error("A eGRDT corrigida excede o limite operacional de 48 documentos.");
    return {
      valid: true,
      format: "BIFF8",
      extension: EXTENSION,
      officialTemplate: true,
      checkedRows: rows.length,
      fimRow: fimRow + 1,
      rows,
    };
  }

  return { HEADERS, MIME, EXTENSION, build, verify, inspect, isLegacyXls };
});
