(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconCoverPdfEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const PAGE_HEIGHT = 841.8898;
  const BOX = Object.freeze({
    category: { x: 160, y: 794, w: 176, h: 18, size: 12, bold: true, align: "center" },
    number: { x: 337, y: 794, w: 237, h: 18, size: 11, bold: true, align: "center" },
    folio: { x: 482, y: 771, w: 90, h: 15, size: 10, align: "center" },
    title: { x: 160, y: 712, w: 320, h: 28, size: 12, bold: true, align: "center", lines: 2 },
    internal: { x: 274, y: 652, w: 240, h: 18, size: 9, bold: true, align: "center" },
    revision: { x: 78, y: 579, w: 38, h: 18, size: 10, align: "center" },
    revisionDescription: { x: 119, y: 579, w: 454, h: 18, size: 10, align: "left" },
    date: { x: 137, y: 103, w: 79, h: 10, size: 7, align: "center" },
    executor: { x: 137, y: 91, w: 79, h: 10, size: 6.6, align: "center" },
    checker: { x: 137, y: 80, w: 79, h: 10, size: 6.6, align: "center" },
    approver: { x: 137, y: 68, w: 79, h: 10, size: 6.6, align: "center" },
  });
  function txt(v) { return v == null ? "" : String(v).trim(); }
  function linesFor(font, value, size, width, maxLines) {
    const words = txt(value).split(/\s+/).filter(Boolean), lines = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width || !current) current = candidate;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = lines.slice(maxLines - 1).join(" ");
    return kept;
  }
  function fitted(font, value, box, minSize) {
    let size = box.size, lines = [txt(value)], maxLines = box.lines || 1;
    while (size > (minSize || 5.5)) {
      lines = linesFor(font, value, size, box.w - 4, maxLines);
      const widest = Math.max(0, ...lines.map((line) => font.widthOfTextAtSize(line, size)));
      if (widest <= box.w - 4 && lines.length <= maxLines) break;
      size -= .35;
    }
    return { size, lines };
  }
  function draw(page, font, value, box, color) {
    const v = txt(value); if (!v) return;
    const f = fitted(font, v, box);
    const lineHeight = f.size * 1.12;
    const blockHeight = lineHeight * f.lines.length;
    let y = box.y + (box.h - blockHeight) / 2 + (f.lines.length - 1) * lineHeight + 1.5;
    f.lines.forEach((line) => {
      const width = font.widthOfTextAtSize(line, f.size);
      let x = box.x + 2;
      if (box.align === "center") x = box.x + (box.w - width) / 2;
      if (box.align === "right") x = box.x + box.w - width - 2;
      page.drawText(line, { x, y, size: f.size, font, color });
      y -= lineHeight;
    });
  }
  async function fillTemplate(templateBytes, data, totalPages, pdfLib) {
    const doc = await pdfLib.PDFDocument.load(templateBytes, { updateMetadata: false });
    const page = doc.getPage(0);
    const regular = await doc.embedFont(pdfLib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
    const black = pdfLib.rgb(0, 0, 0);
    draw(page, bold, data.documentCategory, BOX.category, black);
    draw(page, bold, data.documentNumber, BOX.number, black);
    draw(page, regular, `1 de ${totalPages}`, BOX.folio, black);
    draw(page, bold, data.title, BOX.title, black);
    draw(page, bold, data.internalDocumentCode, BOX.internal, black);
    draw(page, regular, data.revision, BOX.revision, black);
    draw(page, regular, data.revisionDescription, BOX.revisionDescription, black);
    draw(page, regular, data.revisionDate, BOX.date, black);
    draw(page, regular, data.executor, BOX.executor, black);
    draw(page, regular, data.checker, BOX.checker, black);
    draw(page, regular, data.approver, BOX.approver, black);
    return doc;
  }
  async function inspectPdf(bytes, pdfLib) {
    const doc = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    return { pageCount: doc.getPageCount() };
  }
  async function generate(options) {
    const pdfLib = options.pdfLib || root.PDFLib;
    if (!pdfLib || !pdfLib.PDFDocument) throw new Error("pdf-lib não foi carregado.");
    const sourceBytes = options.sourceBytes || null;
    let source = null, sourcePages = 0;
    if (sourceBytes) {
      source = await pdfLib.PDFDocument.load(sourceBytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
      sourcePages = source.getPageCount();
      if (!sourcePages) throw new Error("O PDF de origem não possui páginas.");
    }
    const totalPages = source ? sourcePages + 1 : Math.max(1, Number(options.totalPages) || 1);
    const coverDoc = await fillTemplate(options.templateBytes, options.data || {}, totalPages, pdfLib);
    const out = await pdfLib.PDFDocument.create({ updateMetadata: false });
    const coverPages = await out.copyPages(coverDoc, [0]); out.addPage(coverPages[0]);
    if (source) {
      const originals = await out.copyPages(source, source.getPageIndices());
      originals.forEach((p) => out.addPage(p));
    }
    out.setTitle(txt(options.data && options.data.title) || "Documento com capa");
    out.setCreator("GRCON"); out.setProducer("GRCON - Adicionar Capa");
    const bytes = await out.save({ addDefaultPage: false, useObjectStreams: true, objectsPerTick: 40 });
    return { bytes, pageCount: totalPages, sourcePages };
  }
  return Object.freeze({ BOX, inspectPdf, generate, fillTemplate });
});