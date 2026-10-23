"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Zip = require("../jszip.min.js");
const Layout = require("../package_layout.js");
const Workbook = require("../grdt_workbook.js");
const C = require("../core.js");

async function fixture(extensions = Array(19).fill("pdf")) {
  const baseName = "0130870-C1O-PGV-G-1953-2026 - eGRDT";
  const entries = extensions.map((ext, index) => {
    const document = `C1O_RNEST_U32_7.6.1.1_EST_TH.SPIE_P-${index === 9 ? "32023" : index === 0 ? "32009" : 41000 + index}`;
    const finalName = `${document}.${ext}`;
    const record = { title: "TESTE SPIE", discipline: "ESTRUTURAS", format: "A4", documentType: "RL", purpose: "Para Informação" };
    return { document, revision: "0", finalName, originalName: finalName,
      file: new Uint8Array([37, 80, 68, 70, 45, 49, index]), item: C.buildEgrdtData(document, "0", finalName, record, "ET", "A4") };
  });
  const group = { number: 1, discipline: "ESTRUTURAS", entries, items: entries.map(entry => entry.item) };
  const data = await Workbook.build(group.items);
  await Workbook.verify(data, group.items);
  return [{ official: { baseName }, fileName: `${baseName}.xls`, group, data }];
}
async function archive(generated, mutate) {
  const zip = new Zip();
  Layout.addFolders(zip, generated);
  if (mutate) mutate(zip, generated[0]);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
(async () => {
  const generated = await fixture();
  const bytes = await archive(generated);
  const progress = [];
  assert.deepEqual(await Layout.verifyArchive(bytes, generated, { onProgress: detail => progress.push(detail) }),
    { valid: true, fileCount: 20, batchCount: 1 });
  assert.equal(progress.at(-1).completed, 20);
  const [file] = generated, entry = file.group.entries[9], path = `${file.official.baseName}/${entry.finalName}`;
  assert.match(path, /TH\.SPIE_P-32023\.pdf$/, "preserva pontos internos do código relatado no log");
  await assert.rejects(Layout.verifyArchive(await archive(generated, zip => zip.remove(path)), generated), /Arquivo não encontrado/);
  await assert.rejects(Layout.verifyArchive(await archive(generated, zip => zip.file(path, new Uint8Array([37, 80, 68, 70, 45, 49, 99]))), generated), /Conteúdo divergente/);
  await assert.rejects(Layout.verifyArchive(await archive(generated, zip => zip.file(path, new Uint8Array())), generated), /Conteúdo divergente/);
  await assert.rejects(Layout.verifyArchive(await archive(generated, zip => {
    zip.remove(path); zip.file(`${file.official.baseName}/subpasta/${entry.finalName}`, entry.file);
  }), generated), /fora do diretório/);
  await assert.rejects(Layout.verifyArchive(bytes.slice(0, 100), generated), /não pôde ser reaberto/);
  await assert.rejects(Layout.verifyArchive(bytes, generated, { cancelled: () => true }), error => error.name === "AbortError");
  const mismatch = [{ ...file, group: { ...file.group, items: file.group.items.map((item, index) => index === 9 ? { ...item, fileName: "ERRADO.pdf" } : item) } }];
  await assert.rejects(Layout.verifyArchive(bytes, mismatch), /diverge da coluna ARQUIVO/);
  const empty = [{ ...file, group: { ...file.group, entries: file.group.entries.map((item, index) => index === 9 ? { ...item, file: new Uint8Array() } : item) } }];
  await assert.rejects(Layout.verifyArchive(bytes, empty), /Arquivo vazio/);
  const collision = [{ ...file, group: { ...file.group, entries: [...file.group.entries, { ...entry, finalName: entry.finalName.toLowerCase() }],
    items: [...file.group.items, { ...entry.item, fileName: entry.finalName.toLowerCase() }] } }];
  await assert.rejects(Layout.verifyArchive(bytes, collision), /duplicado/);
  assert.throws(() => Layout.addFolders(new Zip(), [{ ...file, official: { baseName: "../escape" } }]), /Windows/);
  const only = new Zip(); Layout.addFolders(only, generated, [], { includeFiles: false });
  assert.equal((await Layout.verifyArchive(await only.generateAsync({ type: "uint8array" }), generated, { includeFiles: false })).fileCount, 1);
  const mixed = await fixture(["pdf", "docx", "txt", "xlsx", "dwg"]);
  assert.equal((await Layout.verifyArchive(await archive(mixed), mixed)).fileCount, 6, "integridade preserva a composição manual livre");

  // Executa as funções reais de exportação do Worker com o gerador XLS oficial.
  const workerSource = fs.readFileSync(require.resolve("../workers/export.worker.js"), "utf8");
  const extract = (from, to) => workerSource.slice(workerSource.indexOf(from), workerSource.indexOf(to, workerSource.indexOf(from)));
  const messages = [];
  const context = vm.createContext({ JSZip: Zip, Uint8Array, self: { GrdtWorkbook: Workbook, GrconPackageLayout: Layout, postMessage: message => messages.push(message) },
    cancelled: new Set(), ensure() {}, pause: async () => {}, summaryText: () => "Teste", });
  vm.runInContext(extract("async function buildEgrdts(", "function summaryText("), context);
  vm.runInContext(extract("async function buildPackage(", "async function buildTabularReport("), context);
  const built = await context.buildPackage({ groups: generated.map(item => item.group), officialNumbers: generated.map(item => item.official), includeFiles: true }, "QA");
  assert.equal(built.packageVerification.valid, true);
  assert.equal(built.packageVerification.fileCount, 20);
  assert.ok(messages.some(message => /Conferindo arquivos no ZIP/.test(message.message)));
  const workerOnly = await context.buildPackage({ groups: generated.map(item => item.group), officialNumbers: generated.map(item => item.official), includeFiles: false }, "QA-XLS");
  assert.equal(workerOnly.packageVerification.fileCount, 1);
  console.log("OK — ZIP final: 19 PDFs + XLS, bytes reabertos, arquivo ausente/vazio/alterado, nomes, diretórios, cancelamento e Worker real.");
})().catch(error => { console.error(error); process.exitCode = 1; });
