import type {
  CoverDocumentData,
  CoverGeneratedFile,
  SourceDocumentInfo,
  SourceDocumentKind,
} from "../types/domain";

const DOCX_TEMPLATE_PARTS = [
  "assets/templates/CAPA_PAGE1_TEMPLATE.docx.b64.001",
  "assets/templates/CAPA_PAGE1_TEMPLATE.docx.b64.002",
];
const PDF_TEMPLATE_PARTS = [
  "assets/templates/CAPA_PAGE1_BASE.pdf.b64.001",
  "assets/templates/CAPA_PAGE1_BASE.pdf.b64.002",
  "assets/templates/CAPA_PAGE1_BASE.pdf.b64.003",
  "assets/templates/CAPA_PAGE1_BASE.pdf.b64.004",
  "assets/templates/CAPA_PAGE1_BASE.pdf.b64.005",
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

type ZipLike = {
  file(path: string): {
    async(type: "string"): Promise<string>;
    async(type: "uint8array"): Promise<Uint8Array>;
  } | null;
  file(path: string, data: string | ArrayBuffer | Uint8Array, options?: Record<string, unknown>): ZipLike;
  generateAsync(options: Record<string, unknown>): Promise<Uint8Array>;
};

async function loadTemplateBytes(parts: string[], label: string): Promise<Uint8Array> {
  const chunks = await Promise.all(parts.map(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Template " + label + " da capa não pôde ser carregado.");
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
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

function blobFromBytes(bytes: Uint8Array, type: string): Blob {
  const copy = Uint8Array.from(bytes);
  return new Blob([copy.buffer], { type });
}

export function outputFileName(data: CoverDocumentData, kind: SourceDocumentKind): string {
  const title = sanitizeFilePart(data.title) || "DOCUMENTO";
  const code = sanitizeFilePart(data.documentNumber) || "SEM CODIGO";
  const revision = sanitizeFilePart(data.revision) || "SEM REV";
  const maxTitle = title.length > 120 ? title.slice(0, 117).trim() + "..." : title;
  return code + " - " + maxTitle + " - REV " + revision + "." + kind;
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
      const proposed = current ? current + " " + word : word;
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
    pageNumber: "1 de " + totalPages,
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
  return blobFromBytes(bytes, "application/pdf");
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
    blob: blobFromBytes(bytes, "application/pdf"),
    fileName: outputFileName(data, "pdf"),
    kind: "pdf",
  };
}

function replacePlaceholder(xml: string, placeholder: string, value: string): string {
  if (!xml.includes(placeholder)) throw new Error("Template DOCX inválido: campo " + placeholder + " não encontrado.");
  return xml.split(placeholder).join(escapeXml(value || ""));
}

function relationshipPartPath(partPath: string): string {
  const slash = partPath.lastIndexOf("/");
  const dir = slash >= 0 ? partPath.slice(0, slash + 1) : "";
  const name = slash >= 0 ? partPath.slice(slash + 1) : partPath;
  return dir + "_rels/" + name + ".rels";
}

function normalizePath(value: string): string {
  const output: string[] = [];
  value.split("/").forEach((segment) => {
    if (!segment || segment === ".") return;
    if (segment === "..") output.pop();
    else output.push(segment);
  });
  return output.join("/");
}

function dirname(value: string): string {
  const index = value.lastIndexOf("/");
  return index < 0 ? "" : value.slice(0, index);
}

function basename(value: string): string {
  const index = value.lastIndexOf("/");
  return index < 0 ? value : value.slice(index + 1);
}

function resolveTarget(partPath: string, target: string): string {
  return normalizePath((dirname(partPath) ? dirname(partPath) + "/" : "") + target);
}

function relativeTarget(fromPart: string, toPart: string): string {
  const from = dirname(fromPart).split("/").filter(Boolean);
  const to = toPart.split("/").filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
  return new Array(from.length - shared).fill("..").concat(to.slice(shared)).join("/");
}

function uniquePartPath(zip: ZipLike, preferred: string): string {
  if (!zip.file(preferred)) return preferred;
  const dot = preferred.lastIndexOf(".");
  const stem = dot >= 0 ? preferred.slice(0, dot) : preferred;
  const ext = dot >= 0 ? preferred.slice(dot) : "";
  let index = 1;
  while (zip.file(stem + "-grcon-cover-" + index + ext)) index += 1;
  return stem + "-grcon-cover-" + index + ext;
}

function relationshipEntries(xml: string): Array<{ full: string; id: string; target: string; targetMode: string }> {
  const entries: Array<{ full: string; id: string; target: string; targetMode: string }> = [];
  const re = /<Relationship\b[^>]*\/>/g;
  for (const match of xml.matchAll(re)) {
    const full = match[0];
    const id = /\bId="([^"]+)"/.exec(full)?.[1] || "";
    const target = /\bTarget="([^"]+)"/.exec(full)?.[1] || "";
    const targetMode = /\bTargetMode="([^"]+)"/.exec(full)?.[1] || "";
    if (id && target) entries.push({ full, id, target, targetMode });
  }
  return entries;
}

function nextRelationshipId(xml: string): () => string {
  let index = 1;
  return () => {
    let candidate = "rIdGrconCover" + index++;
    while (xml.includes('Id="' + candidate + '"')) candidate = "rIdGrconCover" + index++;
    return candidate;
  };
}

async function clonePartGraph(
  template: ZipLike,
  output: ZipLike,
  sourcePartPath: string,
  preferredDestPath: string,
  cloned: Map<string, string>,
): Promise<string> {
  const existing = cloned.get(sourcePartPath);
  if (existing) return existing;
  const sourcePart = template.file(sourcePartPath);
  if (!sourcePart) throw new Error("Template Word incompleto: " + sourcePartPath + " ausente.");
  const destPath = uniquePartPath(output, preferredDestPath);
  cloned.set(sourcePartPath, destPath);
  output.file(destPath, await sourcePart.async("uint8array"), { binary: true });

  const sourceRels = template.file(relationshipPartPath(sourcePartPath));
  if (!sourceRels) return destPath;

  let relsXml = await sourceRels.async("string");
  for (const relation of relationshipEntries(relsXml)) {
    if (relation.targetMode.toLowerCase() === "external") continue;
    const childSourcePath = resolveTarget(sourcePartPath, relation.target);
    const childPreferred = normalizePath(dirname(destPath) + "/grcon-cover-" + basename(childSourcePath));
    const childDestPath = await clonePartGraph(template, output, childSourcePath, childPreferred, cloned);
    relsXml = relsXml.replace(
      relation.full,
      relation.full.replace('Target="' + relation.target + '"', 'Target="' + relativeTarget(destPath, childDestPath) + '"'),
    );
  }
  output.file(relationshipPartPath(destPath), relsXml);
  return destPath;
}

async function mergeContentTypes(template: ZipLike, output: ZipLike, cloned: Map<string, string>): Promise<void> {
  const templateTypesPart = template.file("[Content_Types].xml");
  const outputTypesPart = output.file("[Content_Types].xml");
  if (!templateTypesPart || !outputTypesPart) return;
  const templateTypes = await templateTypesPart.async("string");
  let outputTypes = await outputTypesPart.async("string");

  for (const [sourcePath, destPath] of cloned.entries()) {
    const override = new RegExp('<Override\\b[^>]*PartName="/' + escapeRegExp(sourcePath) + '"[^>]*/>').exec(templateTypes)?.[0];
    if (override) {
      const mapped = override.replace('PartName="/' + sourcePath + '"', 'PartName="/' + destPath + '"');
      if (!outputTypes.includes('PartName="/' + destPath + '"')) outputTypes = outputTypes.replace("</Types>", mapped + "</Types>");
    }
    const ext = extension(destPath);
    if (ext && !new RegExp('<Default\\b[^>]*Extension="' + escapeRegExp(ext) + '"', "i").test(outputTypes)) {
      const def = new RegExp('<Default\\b[^>]*Extension="' + escapeRegExp(ext) + '"[^>]*/>', "i").exec(templateTypes)?.[0];
      if (def) outputTypes = outputTypes.replace("</Types>", def + "</Types>");
    }
  }
  output.file("[Content_Types].xml", outputTypes);
}

function bodyParts(xml: string): { prefix: string; content: string; sectPr: string; suffix: string } {
  const open = xml.indexOf("<w:body");
  const openEnd = xml.indexOf(">", open);
  const close = xml.lastIndexOf("</w:body>");
  if (open < 0 || openEnd < 0 || close < 0) throw new Error("DOCX inválido: corpo do documento não encontrado.");
  const prefix = xml.slice(0, openEnd + 1);
  const suffix = xml.slice(close);
  const inner = xml.slice(openEnd + 1, close);
  const sectStart = inner.lastIndexOf("<w:sectPr");
  if (sectStart < 0) return { prefix, content: inner, sectPr: "", suffix };
  const sectEnd = inner.indexOf("</w:sectPr>", sectStart);
  if (sectEnd < 0) return { prefix, content: inner, sectPr: "", suffix };
  return {
    prefix,
    content: inner.slice(0, sectStart),
    sectPr: inner.slice(sectStart, sectEnd + "</w:sectPr>".length),
    suffix,
  };
}

function ensureNextPageSection(sectPr: string): string {
  if (!sectPr) return '<w:sectPr><w:type w:val="nextPage"/></w:sectPr>';
  if (/<w:type\b/.test(sectPr)) return sectPr.replace(/<w:type\b[^>]*\/>/, '<w:type w:val="nextPage"/>');
  return sectPr.replace("</w:sectPr>", '<w:type w:val="nextPage"/></w:sectPr>');
}

async function remapCoverRelationships(template: ZipLike, output: ZipLike, coverXml: string): Promise<string> {
  const templateRelsPart = template.file("word/_rels/document.xml.rels");
  const outputRelsPart = output.file("word/_rels/document.xml.rels");
  if (!templateRelsPart || !outputRelsPart) return coverXml;
  const templateRels = await templateRelsPart.async("string");
  let outputRels = await outputRelsPart.async("string");
  const nextId = nextRelationshipId(outputRels);
  const cloned = new Map<string, string>();
  let mappedXml = coverXml;

  for (const relation of relationshipEntries(templateRels)) {
    const usage = new RegExp('(?:r:id|r:embed|r:link)="' + escapeRegExp(relation.id) + '"');
    if (!usage.test(mappedXml)) continue;
    const newId = nextId();
    let newTarget = relation.target;
    if (relation.targetMode.toLowerCase() !== "external") {
      const sourcePart = resolveTarget("word/document.xml", relation.target);
      const preferred = normalizePath("word/grcon-cover-" + basename(sourcePart));
      const destPart = await clonePartGraph(template, output, sourcePart, preferred, cloned);
      newTarget = relativeTarget("word/document.xml", destPart);
    }
    const newRelation = relation.full
      .replace('Id="' + relation.id + '"', 'Id="' + newId + '"')
      .replace('Target="' + relation.target + '"', 'Target="' + newTarget + '"');
    outputRels = outputRels.replace("</Relationships>", newRelation + "</Relationships>");
    mappedXml = mappedXml.replace(
      new RegExp('((?:r:id|r:embed|r:link)=")' + escapeRegExp(relation.id) + '(")', "g"),
      "$1" + newId + "$2",
    );
  }

  output.file("word/_rels/document.xml.rels", outputRels);
  await mergeContentTypes(template, output, cloned);
  return mappedXml;
}

async function mergeCoverStyles(template: ZipLike, output: ZipLike, coverXml: string): Promise<string> {
  const templateStylesPart = template.file("word/styles.xml");
  const outputStylesPart = output.file("word/styles.xml");
  if (!templateStylesPart || !outputStylesPart) return coverXml;
  const templateStyles = await templateStylesPart.async("string");
  let outputStyles = await outputStylesPart.async("string");
  const referenced = new Set<string>();
  const styleRef = /<w:(?:pStyle|rStyle|tblStyle)\b[^>]*w:val="([^"]+)"/g;
  for (const match of coverXml.matchAll(styleRef)) referenced.add(match[1]);
  if (!referenced.size) return coverXml;

  const styleBlocks = new Map<string, string>();
  const styleBlockRe = /<w:style\b[\s\S]*?<\/w:style>/g;
  for (const match of templateStyles.matchAll(styleBlockRe)) {
    const id = /\bw:styleId="([^"]+)"/.exec(match[0])?.[1];
    if (id) styleBlocks.set(id, match[0]);
  }

  const queue = [...referenced];
  const required = new Set<string>();
  while (queue.length) {
    const id = queue.shift() || "";
    if (!id || required.has(id) || !styleBlocks.has(id)) continue;
    required.add(id);
    const block = styleBlocks.get(id) || "";
    for (const dep of block.matchAll(/<w:(?:basedOn|next|link)\b[^>]*w:val="([^"]+)"/g)) {
      if (!required.has(dep[1])) queue.push(dep[1]);
    }
  }

  const mapping = new Map<string, string>();
  required.forEach((id) => mapping.set(id, "GRCON_COVER_" + id.replace(/[^A-Za-z0-9_-]/g, "_")));
  let mappedXml = coverXml;
  for (const [from, to] of mapping.entries()) {
    mappedXml = mappedXml.replace(
      new RegExp('(<w:(?:pStyle|rStyle|tblStyle)\\b[^>]*w:val=")' + escapeRegExp(from) + '(")', "g"),
      "$1" + to + "$2",
    );
  }

  for (const [from, to] of mapping.entries()) {
    let block = styleBlocks.get(from) || "";
    block = block.replace('w:styleId="' + from + '"', 'w:styleId="' + to + '"');
    for (const [depFrom, depTo] of mapping.entries()) {
      block = block.replace(
        new RegExp('(w:val=")' + escapeRegExp(depFrom) + '(")', "g"),
        "$1" + depTo + "$2",
      );
    }
    if (!outputStyles.includes('w:styleId="' + to + '"')) outputStyles = outputStyles.replace("</w:styles>", block + "</w:styles>");
  }
  output.file("word/styles.xml", outputStyles);
  return mappedXml;
}

async function buildEditableDocx(data: CoverDocumentData, source: SourceDocumentInfo, totalPages: number): Promise<Uint8Array> {
  const Zip = getZip();
  const template = await Zip.loadAsync(await loadTemplateBytes(DOCX_TEMPLATE_PARTS, "Word")) as ZipLike;
  const output = await Zip.loadAsync(await source.file.arrayBuffer()) as ZipLike;
  const coverDocumentPart = template.file("word/document.xml");
  const sourceDocumentPart = output.file("word/document.xml");
  if (!coverDocumentPart || !sourceDocumentPart) throw new Error("Template ou documento Word incompleto.");

  let coverXml = await coverDocumentPart.async("string");
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
    coverXml = replacePlaceholder(coverXml, placeholder, value);
  });

  coverXml = await mergeCoverStyles(template, output, coverXml);
  coverXml = await remapCoverRelationships(template, output, coverXml);
  const cover = bodyParts(coverXml);
  const original = bodyParts(await sourceDocumentPart.async("string"));
  const sectionBreak = '<w:p><w:pPr>' + ensureNextPageSection(cover.sectPr) + '</w:pPr></w:p>';
  const combinedXml = original.prefix + cover.content + sectionBreak + original.content + original.sectPr + original.suffix;
  output.file("word/document.xml", combinedXml);

  const appPart = output.file("docProps/app.xml");
  if (appPart) {
    const appXml = await appPart.async("string");
    if (/<Pages>\d+<\/Pages>/.test(appXml)) {
      output.file("docProps/app.xml", appXml.replace(/<Pages>\d+<\/Pages>/, "<Pages>" + totalPages + "</Pages>"));
    }
  }

  return output.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function generateDocx(data: CoverDocumentData, source: SourceDocumentInfo, totalPages: number): Promise<CoverGeneratedFile> {
  if (source.kind !== "docx") throw new Error("Word editável é gerado apenas quando o documento de origem também é DOCX.");
  const bytes = await buildEditableDocx(data, source, totalPages);
  return {
    blob: blobFromBytes(bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
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
