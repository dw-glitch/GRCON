import type {
  CoverDocumentData,
  CoverGeneratedFile,
  SourceDocumentInfo,
  SourceDocumentKind,
} from "../types/domain";

const DOCX_TEMPLATE_PARTS = [
  "assets/templates/capa-documento.docx.b64.1",
  "assets/templates/capa-documento.docx.b64.2",
  "assets/templates/capa-documento.docx.b64.3",
];
const PDF_TEMPLATE_PARTS = [
  "assets/templates/capa-documento-base.pdf.b64.1",
  "assets/templates/capa-documento-base.pdf.b64.2",
  "assets/templates/capa-documento-base.pdf.b64.3",
];

const PDF_DRAW = {
  category: { x: 202, top: 33, width: 110, size: 9, bold: true, align: "center" as const },
  documentNumber: { x: 380, top: 34, width: 170, size: 8.5, bold: true, align: "left" as const },
  pageNumber: { x: 518, top: 56, width: 48, size: 8.5, bold: false, align: "center" as const },
  title: { x: 204, top: 108, width: 268, size: 9, bold: true, align: "left" as const, lines: 2 },
  internalDocumentCode: { x: 302, top: 171, width: 84, size: 7.5, bold: true, align: "center" as const },
  revision: { x: 84, top: 245, width: 27, size: 10, bold: false, align: "center" as const },
  revisionDescription: { x: 120, top: 245, width: 350, size: 10, bold: false, align: "left" as const, lines: 2 },
  revisionDate: { x: 139, top: 728, width: 91, size: 6.5, bold: false, align: "center" as const },
  executor: { x: 135, top: 739, width: 100, size: 6.5, bold: false, align: "center" as const },
  checker: { x: 135, top: 750, width: 110, size: 6.5, bold: false, align: "center" as const },
  approver: { x: 135, top: 761, width: 100, size: 6.5, bold: false, align: "center" as const },
};

async function loadTemplateBytes(parts: string[], label: string): Promise<Uint8Array> {
  const chunks = await Promise.all(parts.map(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Template ${label} da capa não pôde ser carregado.`);
    return (await response.text()).trim();
  }));
  const binary = atob(chunks.join(""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function getPdfLib() {
  if (!window.PDFLib) throw new Error("Motor PDF do GRCON não está disponível.");
  return window.PDFLib;
}

function getZip() {
  if (!window.JSZip) throw new Error("Motor DOCX do GRCON não está disponível.");
  return window.JSZip;
}

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function sourceKind(file: File): SourceDocumentKind | null {
  const ext = extension(file.name);
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  if (ext === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return null;
}

function xmlText(xml: string, tagName: string): string {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return doc.getElementsByTagName(tagName)[0]?.textContent?.trim() || "";
  } catch (_) {
    return "";
  }
}

export async function inspectSourceDocument(file: File): Promise<SourceDocumentInfo> {
  const kind = sourceKind(file);
  if (!kind) throw new Error("Formato não suportado. Use PDF ou DOCX nesta versão da ferramenta.");
  if (!file.size) throw new Error("O arquivo selecionado está vazio.");

  if (kind === "pdf") {
    const pdf = await getPdfLib().PDFDocument.load(await file.arrayBuffer());
    return { file, kind, originalPages: pdf.getPageCount(), pageCountSource: "exact" };
  }

  const zip = await getZip().loadAsync(await file.arrayBuffer());
  const appXml = await zip.file("docProps/app.xml")?.async("string");
  const pages = Number(appXml ? xmlText(appXml, "Pages") : "");
  return {
    file,
    kind,
    originalPages: Number.isFinite(pages) && pages > 0 ? pages : null,
    pageCountSource: Number.isFinite(pages) && pages > 0 ? "metadata" : "unknown",
  };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

export function outputFileName(data: CoverDocumentData, kind: SourceDocumentKind): string {
  const title = sanitizeFilePart(data.title) || "DOCUMENTO";
  const code = sanitizeFilePart(data.documentNumber) || "SEM CODIGO";
  const revision = sanitizeFilePart(data.revision) || "SEM REV";
  const maxTitle = title.length > 120 ? `${title.slice(0, 117).trim()}...` : title;
  return `${code} - ${maxTitle} - REV ${revision}.${kind}`;
}

function wrapText(text: string, font: { widthOfTextAtSize(value: string, size: number): number }, size: number, maxWidth: number, maxLines = 1): { lines: string[]; size: number } {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { lines: [""], size };
  let currentSize = size;
  for (; currentSize >= 5.5; currentSize -= 0.25) {
    const words = clean.split(" ");
    const lines: string[] = [];
    let current = "";
    words.forEach((word) => {
      const proposed = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(proposed, currentSize) <= maxWidth) current = proposed;
      else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((line) => font.widthOfTextAtSize(line, currentSize) <= maxWidth)) return { lines, size: currentSize };
  }
  return { lines: [clean], size: 5.5 };
}

async function buildCoverPdf(data: CoverDocumentData, totalPages: number): Promise<Uint8Array> {
  const lib = getPdfLib();
  const document = await lib.PDFDocument.load(await loadTemplateBytes(PDF_TEMPLATE_PARTS, "PDF"));
  const page = document.getPages()[0];
  if (!page) throw new Error("Template PDF da capa está vazio.");
  const regular = await document.embedFont(lib.StandardFonts.Helvetica);
  const bold = await document.embedFont(lib.StandardFonts.HelveticaBold);
  const black = lib.rgb(0, 0, 0);
  const white = lib.rgb(1, 1, 1);
  const height = page.getHeight();
  page.drawRectangle({ x: 516, y: height - 69, width: 51, height: 15, color: white });

  const values: Record<keyof typeof PDF_DRAW, string> = {
    category: data.categoryLabel || data.category,
    documentNumber: data.documentNumber,
    pageNumber: `1 de ${totalPages}`,
    title: data.title,
    internalDocumentCode: data.internalDocumentCode || "NÃO INFORMADO NA LD",
    revision: data.revision,
    revisionDescription: data.revisionDescription,
    revisionDate: data.revisionDate,
    executor: data.executor,
    checker: data.checker,
    approver: data.approver,
  };

  (Object.keys(PDF_DRAW) as Array<keyof typeof PDF_DRAW>).forEach((key) => {
    const spec = PDF_DRAW[key];
    const font = spec.bold ? bold : regular;
    const wrapped = wrapText(values[key], font, spec.size, spec.width, "lines" in spec ? spec.lines : 1);
    wrapped.lines.forEach((line, index) => {
      const lineWidth = font.widthOfTextAtSize(line, wrapped.size);
      const x = spec.align === "center" ? spec.x + Math.max(0, (spec.width - lineWidth) / 2) : spec.x;
      const y = height - spec.top - wrapped.size - index * (wrapped.size + 1.2);
      page.drawText(line, { x, y, size: wrapped.size, font, color: black });
    });
  });

  return document.save();
}

export async function createCoverPreview(data: CoverDocumentData, totalPages: number): Promise<Blob> {
  const bytes = await buildCoverPdf(data, totalPages);
  return new Blob([bytes], { type: "application/pdf" });
}

export async function generatePdf(data: CoverDocumentData, source: SourceDocumentInfo): Promise<CoverGeneratedFile> {
  if (source.kind !== "pdf") throw new Error("A geração de PDF nesta versão exige um documento de origem em PDF.");
  const lib = getPdfLib();
  const original = await lib.PDFDocument.load(await source.file.arrayBuffer());
  const originalPages = original.getPageCount();
  const coverBytes = await buildCoverPdf(data, originalPages + 1);
  const output = await lib.PDFDocument.load(coverBytes);
  const indices = Array.from({ length: originalPages }, (_, index) => index);
  const pages = await output.copyPages(original, indices);
  pages.forEach((page) => output.addPage(page));
  const bytes = await output.save();
  return {
    blob: new Blob([bytes], { type: "application/pdf" }),
    fileName: outputFileName(data, "pdf"),
    kind: "pdf",
  };
}

function replacePlaceholder(xml: string, placeholder: string, value: string): string {
  if (!xml.includes(placeholder)) throw new Error(`Template DOCX inválido: campo ${placeholder} não encontrado.`);
  return xml.split(placeholder).join(escapeXml(value || ""));
}

function addAltChunkRelationship(xml: string): string {
  const relation = '<Relationship Id="rIdGrconSourceDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk1.docx"/>';
  if (xml.includes("rIdGrconSourceDocument")) return xml;
  return xml.replace(/<\/Relationships>\s*$/i, `${relation}</Relationships>`);
}

function addDocxContentType(xml: string): string {
  if (/Extension="docx"/i.test(xml)) return xml;
  const item = '<Default Extension="docx" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"/>';
  return xml.replace(/<\/Types>\s*$/i, `${item}</Types>`);
}

function addAltChunkToDocument(xml: string): string {
  if (xml.includes("rIdGrconSourceDocument")) return xml;
  const insert = '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:altChunk r:id="rIdGrconSourceDocument"/>';
  const position = xml.lastIndexOf("<w:sectPr");
  if (position < 0) throw new Error("Template DOCX inválido: seção final não encontrada.");
  return `${xml.slice(0, position)}${insert}${xml.slice(position)}`;
}

export async function generateDocx(data: CoverDocumentData, source: SourceDocumentInfo, totalPages: number): Promise<CoverGeneratedFile> {
  if (source.kind !== "docx") throw new Error("Word editável é gerado apenas quando o documento de origem também é DOCX.");
  const Zip = getZip();
  const zip = await Zip.loadAsync(await loadTemplateBytes(DOCX_TEMPLATE_PARTS, "Word"));
  const documentPart = zip.file("word/document.xml");
  const relsPart = zip.file("word/_rels/document.xml.rels");
  const contentTypesPart = zip.file("[Content_Types].xml");
  if (!documentPart || !relsPart || !contentTypesPart) throw new Error("Template Word incompleto ou corrompido.");

  let documentXml = await documentPart.async("string");
  const replacements: Record<string, string> = {
    "{{CATEGORY}}": data.categoryLabel || data.category,
    "{{DOCUMENT_NUMBER}}": data.documentNumber,
    "{{TOTAL_PAGES}}": String(totalPages),
    "{{TITLE}}": data.title,
    "{{INTERNAL_CODE}}": data.internalDocumentCode || "NÃO INFORMADO NA LD",
    "{{REVISION}}": data.revision,
    "{{REVISION_DESCRIPTION}}": data.revisionDescription,
    "{{REVISION_DATE}}": data.revisionDate,
    "{{EXECUTOR}}": data.executor,
    "{{CHECKER}}": data.checker,
    "{{APPROVER}}": data.approver,
  };
  Object.entries(replacements).forEach(([placeholder, value]) => {
    documentXml = replacePlaceholder(documentXml, placeholder, value);
  });
  documentXml = addAltChunkToDocument(documentXml);
  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", addAltChunkRelationship(await relsPart.async("string")));
  zip.file("[Content_Types].xml", addDocxContentType(await contentTypesPart.async("string")));
  zip.file("word/afchunk1.docx", await source.file.arrayBuffer(), { binary: true });

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return {
    blob: new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    fileName: outputFileName(data, "docx"),
    kind: "docx",
  };
}

export function downloadGenerated(file: CoverGeneratedFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
