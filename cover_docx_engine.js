(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconCoverDocxEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  function esc(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function replaceToken(xml, oldValue, newValue, occurrence) {
    const target = ">" + oldValue + "<"; let from = 0, seen = 0;
    while (true) {
      const at = xml.indexOf(target, from); if (at < 0) return xml;
      if (seen === (occurrence || 0)) return xml.slice(0, at + 1) + esc(newValue) + xml.slice(at + 1 + oldValue.length);
      seen += 1; from = at + target.length;
    }
  }
  function fillCoverXml(xml, data, totalPages) {
    let out = xml;
    out = replaceToken(out, "PROCEDIMENTO", data.documentCategory || "");
    out = replaceToken(out, "PR-5290.00-22313-98F-C1O-", data.documentNumber || "");
    out = replaceToken(out, "XXX", "");
    out = replaceToken(out, "1", "1", 0);
    out = replaceToken(out, "XX", String(totalPages || "XX"), 0);
    out = replaceToken(out, "XXXX", data.title || "", 0);
    out = replaceToken(out, "XXXXXX", data.internalDocumentCode || "", 0);
    out = replaceToken(out, "0", data.revision || "0", 0);
    out = replaceToken(out, "EMISSÃO", data.revisionDescription ? data.revisionDescription.split(/\s+/)[0] : "", 0);
    out = replaceToken(out, "ORIGINAL", data.revisionDescription ? data.revisionDescription.split(/\s+/).slice(1).join(" ") : "", 0);
    out = replaceToken(out, "  XXXX", data.revisionDate || "", 0);
    out = replaceToken(out, "KAIQUE CAETANO", data.executor || "", 0);
    out = replaceToken(out, "LEANDRO CALDEIRA", data.checker || "", 0);
    out = replaceToken(out, "LUCIANA SCIARRA", data.approver || "", 0);
    return out;
  }
  function nextRid(rels) {
    let max = 0; String(rels).replace(/Id="rId(\d+)"/g, (_, n) => { max = Math.max(max, Number(n)); return _; });
    return "rId" + (max + 1);
  }
  function insertAltChunk(xml, rid) {
    const chunk = '<w:altChunk r:id="' + rid + '"/>';
    const sect = xml.lastIndexOf("<w:sectPr");
    if (sect >= 0) return xml.slice(0, sect) + chunk + xml.slice(sect);
    return xml.replace("</w:body>", chunk + "</w:body>");
  }
  async function generate(options) {
    const JSZip = options.JSZip || root.JSZip;
    if (!JSZip) throw new Error("JSZip não foi carregado.");
    const template = await JSZip.loadAsync(options.templateBytes);
    let xml = await template.file("word/document.xml").async("string");
    xml = fillCoverXml(xml, options.data || {}, options.totalPages || "XX");
    template.file("word/document.xml", xml);

    if (options.sourceBytes) {
      let rels = await template.file("word/_rels/document.xml.rels").async("string");
      const rid = nextRid(rels);
      rels = rels.replace("</Relationships>", '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk/source.docx"/></Relationships>');
      template.file("word/_rels/document.xml.rels", rels);
      template.file("word/document.xml", insertAltChunk(xml, rid));
      template.file("word/afchunk/source.docx", options.sourceBytes);
      let types = await template.file("[Content_Types].xml").async("string");
      if (!types.includes('Extension="docx"')) {
        types = types.replace("</Types>", '<Default Extension="docx" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"/></Types>');
        template.file("[Content_Types].xml", types);
      }
    }
    return template.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }
  return Object.freeze({ fillCoverXml, generate });
});