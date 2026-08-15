/**
 * GRCON — Planilha da consulta de documentos
 *
 * Mesma identidade das planilhas da Triagem de GRDT: faixa azul com o logo,
 * linha de metadados, cabeçalho fixo, filtros, quebra de texto e largura
 * pensada por coluna. O usuário não deveria conseguir dizer, olhando, que a
 * planilha saiu de outro módulo.
 *
 * O construtor fica aqui, e não dentro da tela, pelo mesmo motivo que levou o
 * Resumo do relatório de triagem a ser extraído: assim existe um só desenho,
 * e uma melhoria não chega pela metade.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconRequestsReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLUMNS = Object.freeze([
    { header: "SITUAÇÃO", key: "situation", width: 26 },
    { header: "DOCUMENTO", key: "document", width: 46 },
    { header: "TÍTULO NA LD", key: "title", width: 58 },
    { header: "ALOCADO?", key: "allocated", width: 22 },
    { header: "ALOCAÇÃO", key: "allocation", width: 24 },
    { header: "ÚLTIMA GRDT", key: "lastGrdt", width: 26 },
    { header: "STATUS NO SIGEM", key: "sigemStatus", width: 24 },
    { header: "LD CONSIDERADA", key: "ld", width: 34 },
    { header: "LDs EM QUE FOI LOCALIZADO", key: "allLds", width: 42 },
    { header: "COMO ESTE RESULTADO FOI OBTIDO", key: "rule", width: 62 },
  ]);

  const AZUL = "FF153A5C";
  const AZUL_CLARO = "FF24689A";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function columnLetter(number) {
    let n = Number(number) || 1;
    let result = "";
    while (n > 0) { n -= 1; result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26); }
    return result;
  }

  function situationPalette(value) {
    const normalized = text(value).toUpperCase();
    if (normalized.startsWith("LOCALIZADO")) return ["FFEAF7F1", "FF0C7657"];
    if (normalized.includes("VALIDAÇÃO")) return ["FFFFF5DF", "FFA56812"];
    return ["FFFFF0ED", "FFA64035"];
  }

  function allocationPalette(value) {
    const normalized = text(value).toUpperCase();
    if (normalized.startsWith("SIM")) return ["FFEAF7F1", "FF0C7657"];
    if (normalized.startsWith("NÃO") || normalized.startsWith("NAO")) return ["FFFFF0ED", "FFA64035"];
    if (!normalized) return ["FFF3F5F7", "FF6F7E8C"];
    return ["FFFFF5DF", "FFA56812"];
  }

  /**
   * Monta a aba da consulta numa planilha já criada por quem chama, para o
   * mesmo construtor servir tanto ao arquivo avulso quanto a um pacote maior.
   */
  function writeConsultationSheet(worksheet, rows, options) {
    const settings = options || {};
    const lista = rows || [];
    const columnCount = COLUMNS.length;
    const lastColumn = columnLetter(columnCount);
    worksheet.columns = COLUMNS.map((column) => ({ width: column.width }));

    for (let row = 1; row <= 3; row += 1) {
      for (let col = 1; col <= columnCount; col += 1) {
        worksheet.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      }
    }
    worksheet.mergeCells(`C1:${lastColumn}2`);
    const titulo = worksheet.getCell("C1");
    titulo.value = "GRCON · CONSULTA DE DOCUMENTOS";
    titulo.font = { name: "Aptos Display", size: 19, bold: true, color: { argb: "FFFFFFFF" } };
    titulo.alignment = { vertical: "middle", horizontal: "left" };

    worksheet.mergeCells(`A4:${lastColumn}4`);
    const meta = worksheet.getCell("A4");
    meta.value = text(settings.metadata);
    meta.font = { name: "Aptos", size: 9, color: { argb: "FF52687B" } };
    meta.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F4" } };
    meta.alignment = { vertical: "middle" };

    // Três números que respondem a pergunta imediata de quem abre o arquivo.
    const localizados = lista.filter((item) => text(item.situation) === "Localizado").length;
    const validar = lista.filter((item) => text(item.situation) === "Requer validação manual").length;
    const ausentes = lista.length - localizados - validar;
    const cards = [
      ["DOCUMENTOS CONSULTADOS", lista.length, "FF2E5878"],
      ["LOCALIZADOS", localizados, "FF0C7657"],
      ["A VALIDAR", validar, "FFA56812"],
      ["NÃO LOCALIZADOS", ausentes, "FFA64035"],
    ];
    const largura = Math.max(1, Math.floor(columnCount / cards.length));
    cards.forEach(([label, count, cor], index) => {
      const inicio = index * largura + 1;
      const fim = index === cards.length - 1 ? columnCount : inicio + largura - 1;
      worksheet.mergeCells(6, inicio, 8, fim);
      const cell = worksheet.getCell(6, inicio);
      cell.value = { richText: [
        { font: { name: "Aptos", size: 9, bold: true, color: { argb: "FF6F7E8C" } }, text: `${label}\n` },
        { font: { name: "Aptos Display", size: 22, bold: true, color: { argb: cor } }, text: Number(count || 0).toLocaleString("pt-BR") },
      ] };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
      cell.border = {
        left: { style: "medium", color: { argb: cor } },
        top: { style: "thin", color: { argb: "FFDCE4EA" } },
        right: { style: "thin", color: { argb: "FFDCE4EA" } },
        bottom: { style: "thin", color: { argb: "FFDCE4EA" } },
      };
    });

    const origemRow = 10;
    worksheet.mergeCells(`A${origemRow}:${lastColumn}${origemRow}`);
    const faixa = worksheet.getCell(`A${origemRow}`);
    faixa.value = "LDs CONSULTADAS";
    faixa.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    faixa.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_CLARO } };
    faixa.alignment = { vertical: "middle" };
    worksheet.getRow(origemRow).height = 22;

    worksheet.mergeCells(`A${origemRow + 1}:${lastColumn}${origemRow + 1}`);
    const lds = worksheet.getCell(`A${origemRow + 1}`);
    lds.value = text(settings.ldNames) || "Nenhuma LD informada";
    lds.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
    lds.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    worksheet.getRow(origemRow + 1).height = 26;

    // Aviso permanente: a planilha não deve ser lida como se tudo estivesse
    // resolvido quando há linhas que dependem de conferência.
    const avisoRow = origemRow + 2;
    worksheet.mergeCells(`A${avisoRow}:${lastColumn}${avisoRow}`);
    const aviso = worksheet.getCell(`A${avisoRow}`);
    aviso.value = validar || ausentes
      ? "Atenção: há linhas que o GRCON não conseguiu concluir sozinho. “Requer validação manual” significa que o código foi localizado de outra forma ou que as LDs divergem; “Não localizado” significa que o código não consta em nenhuma LD anexada. Nenhum campo dessas linhas foi preenchido por suposição."
      : "Todos os documentos foram localizados com correspondência exata de código em uma única LD.";
    aviso.font = { name: "Aptos", size: 9, color: { argb: validar || ausentes ? "FF7A5300" : "FF0C7657" } };
    aviso.fill = { type: "pattern", pattern: "solid", fgColor: { argb: validar || ausentes ? "FFFFF3CF" : "FFEAF7F1" } };
    aviso.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    worksheet.getRow(avisoRow).height = 32;

    const headerRow = avisoRow + 2;
    COLUMNS.forEach((column, index) => {
      const cell = worksheet.getCell(headerRow, index + 1);
      cell.value = column.header;
      cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB7C8D6" } } };
    });
    worksheet.getRow(headerRow).height = 32;

    const dataStart = headerRow + 1;
    lista.forEach((item, index) => {
      const row = worksheet.getRow(dataStart + index);
      COLUMNS.forEach((column, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        const value = item[column.key];
        cell.value = value === "" || value === null || value === undefined ? null : value;
        cell.font = { name: "Aptos", size: 9, color: { argb: "FF263E52" } };
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDCE4EA" } } };
        if (index % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
      const situacao = row.getCell(1);
      const cores = situationPalette(situacao.value);
      situacao.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cores[0] } };
      situacao.font = { name: "Aptos", size: 9, bold: true, color: { argb: cores[1] } };
      const alocado = row.getCell(4);
      const coresAloc = allocationPalette(alocado.value);
      alocado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: coresAloc[0] } };
      alocado.font = { name: "Aptos", size: 9, bold: true, color: { argb: coresAloc[1] } };
      const maior = Math.max(...COLUMNS.map((column) => text(item[column.key]).length), 0);
      row.height = Math.min(90, Math.max(32, 20 + Math.ceil(maior / 70) * 14));
    });

    const finalRow = Math.max(headerRow, dataStart + lista.length - 1);
    worksheet.autoFilter = { from: `A${headerRow}`, to: `${lastColumn}${finalRow}` };
    worksheet.views = [{ state: "frozen", ySplit: headerRow, activeCell: `A${dataStart}`, showGridLines: false, zoomScale: 85 }];
    worksheet.pageSetup = {
      orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: .2, right: .2, top: .4, bottom: .4, header: .2, footer: .2 },
      printTitlesRow: `${headerRow}:${headerRow}`,
    };
    worksheet.headerFooter.oddFooter = "&LGRCON · Consulta de documentos&C&P de &N&R&D";
    return { headerRow, dataStart, finalRow, lastColumn };
  }

  /**
   * Aplica o logo oficial do GRCON no canto superior da planilha.
   *
   * Vive aqui, e não dentro de cada gerador, porque já existiam duas planilhas
   * com o mesmo logo montado de formas diferentes — e a segunda saiu sem imagem
   * até isto ser unificado. O base64 embutido é o caminho preferido; quando ele
   * está vazio, o PNG é buscado do próprio pacote.
   *
   * Falhar aqui nunca derruba a exportação: o logo é acabamento, e uma planilha
   * correta sem imagem é melhor do que nenhuma planilha.
   */
  async function attachBrandLogo(workbook, worksheet, brandAssets, fetchImpl) {
    try {
      const brand = brandAssets || {};
      let imageConfig = null;
      if (brand.reportLogoBase64) {
        imageConfig = { base64: brand.reportLogoBase64, extension: "png" };
      } else {
        const buscar = fetchImpl || (typeof fetch === "function" ? fetch : null);
        if (!buscar) return false;
        const response = await buscar(brand.reportLogoFile || "grcon-logo-report.png", { cache: "no-store" });
        if (!response || !response.ok) throw new Error("Logo GRCON indisponível");
        imageConfig = { buffer: await response.arrayBuffer(), extension: "png" };
      }
      const image = workbook.addImage(imageConfig);
      worksheet.addImage(image, { tl: { col: .12, row: .28 }, ext: { width: 188, height: 52 } });
      return true;
    } catch (erro) {
      console.debug("[GRCON] logo da planilha indisponível:", erro);
      return false;
    }
  }

  return Object.freeze({ COLUMNS, writeConsultationSheet, attachBrandLogo });
});
