(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPackageLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function archiveName(generated, timestamp) {
    if (!Array.isArray(generated) || !generated.length) throw new Error("Nenhuma eGRDT foi gerada.");
    if (generated.length === 1) return `${generated[0].official.baseName}.zip`;
    const sequences = generated.map((file) => file.official.sequenceText);
    const label = sequences.length <= 6
      ? sequences.join("_")
      : `${sequences.slice(0, 3).join("_")}_mais_${sequences.length - 4}_${sequences[sequences.length - 1]}`;
    return `GRCON_${generated.length}_eGRDTs_${label}_${generated[0].official.year}_${timestamp}.zip`;
  }

  // PDF e formatos Office recentes já comprimem o conteúdo internamente.
  // Preserva cada byte e evita recompressão cara; planilhas eGRDT continuam DEFLATE.
  function compressionOptions(name) {
    return /\.(pdf|docx|xlsx|pptx|jpg|jpeg|png|webp)$/i.test(String(name || "")) ? { compression: "STORE" } : {};
  }
  function checkedName(value) {
    const name = String(value || "");
    if (!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) {
      throw new Error(`Nome incompatível com a extração no Windows: ${name || "(vazio)"}.`);
    }
    return name;
  }

  function addFolders(zip, generated, rootExtras = [], options = {}) {
    if (!zip || typeof zip.folder !== "function") throw new Error("Compactador indisponível.");
    if (!Array.isArray(generated) || !generated.length) throw new Error("Nenhuma eGRDT foi gerada.");
    const folderNames = new Set();
    generated.forEach((generatedFile) => {
      const folderName = checkedName(generatedFile.official.baseName);
      const expectedFileName = `${folderName}.xls`;
      if (generatedFile.fileName !== expectedFileName) throw new Error(`O nome da eGRDT deve ser ${expectedFileName}.`);
      if (folderNames.has(folderName.toUpperCase())) throw new Error(`Nome de pasta duplicado: ${folderName}.`);
      folderNames.add(folderName.toUpperCase());
      const folder = zip.folder(folderName);
      const fileNames = new Set([expectedFileName.toUpperCase()]);
      if (options.includeFiles !== false) generatedFile.group.entries.forEach((entry) => {
        if (!entry.file) throw new Error(`${entry.document || entry.finalName}: arquivo físico ausente no lote ${generatedFile.group.number}.`);
        checkedName(entry.finalName);
        const key = String(entry.finalName || "").toUpperCase();
        if (!key) throw new Error(`Existe um PDF sem nome final no lote ${generatedFile.group.number}.`);
        if (fileNames.has(key)) throw new Error(`PDF duplicado na pasta ${folderName}: ${entry.finalName}.`);
        fileNames.add(key);
        folder.file(entry.finalName, entry.file, compressionOptions(entry.finalName));
      });
      folder.file(generatedFile.fileName, generatedFile.data);
    });
    rootExtras.forEach((entry) => zip.file(checkedName(entry.name), entry.data));
    return generated.map((generatedFile) => generatedFile.official.baseName);
  }

  async function bytesOf(value) {
    if (value && typeof value.arrayBuffer === "function") return new Uint8Array(await value.arrayBuffer());
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") return new Uint8Array(value);
    throw new Error("Arquivo físico indisponível para conferência. Selecione novamente a pasta de origem.");
  }

  // Reabre o ZIP final e compara os bytes de cada saída com a origem, uma por
  // vez. Assim não basta a planilha estar correta ou JSZip aceitar um File:
  // todo arquivo precisa existir, ser legível e estar no mesmo diretório do XLS.
  async function verifyArchive(data, generated, options = {}) {
    const Zip = options.JSZip || root.JSZip || (typeof require === "function" ? require("./jszip.min.js") : null);
    if (!Zip || typeof Zip.loadAsync !== "function") throw new Error("Verificador do pacote ZIP indisponível.");
    if (!Array.isArray(generated) || !generated.length) throw new Error("Nenhuma eGRDT foi gerada.");
    const inventory = new Map();
    const names = new Set();
    const folders = new Set();
    const checkCancelled = () => {
      if (options.cancelled && options.cancelled()) {
        const error = new Error("Conferência do pacote cancelada."); error.name = "AbortError"; throw error;
      }
    };
    for (const file of generated) {
      const folder = checkedName(file.official.baseName);
      if (folders.has(folder.toUpperCase())) throw new Error(`Nome de pasta duplicado: ${folder}.`);
      folders.add(folder.toUpperCase());
      if (file.fileName !== `${folder}.xls`) throw new Error(`O nome da eGRDT deve ser ${folder}.xls.`);
      const add = (name, source) => {
        const path = `${folder}/${checkedName(name)}`;
        if (names.has(path.toUpperCase())) throw new Error(`Arquivo duplicado no pacote: ${path}.`);
        names.add(path.toUpperCase());
        inventory.set(path, source);
      };
      add(file.fileName, file.data);
      if (options.includeFiles !== false) {
        const entries = file.group.entries || [];
        const items = file.group.items || entries.map(entry => entry.item);
        if (entries.length !== items.length) throw new Error(`Quantidade de arquivos diverge das linhas da eGRDT ${file.fileName}.`);
        entries.forEach((entry, index) => {
          if (!entry.file) throw new Error(`${entry.document || entry.finalName}: arquivo físico ausente.`);
          if (!items[index] || items[index].fileName !== entry.finalName) throw new Error(`${entry.document || entry.finalName}: nome do arquivo diverge da coluna ARQUIVO da eGRDT.`);
          add(entry.finalName, entry.file);
        });
      }
    }
    checkCancelled();
    let zip;
    try { zip = await Zip.loadAsync(await bytesOf(data)); }
    catch (error) { throw new Error(`O pacote ZIP não pôde ser reaberto: ${error.message || error}. Gere novamente.`); }
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name];
      if (entry.dir) continue;
      if (entry.unsafeOriginalName && entry.unsafeOriginalName !== name) throw new Error(`Caminho inválido no pacote: ${entry.unsafeOriginalName}.`);
      if ([...folders].some(folder => name.toUpperCase().startsWith(`${folder}/`)) && !inventory.has(name)) {
        throw new Error(`Arquivo inesperado ou fora do diretório da eGRDT: ${name}.`);
      }
    }
    let completed = 0;
    for (const [name, source] of inventory) {
      checkCancelled();
      const entry = zip.file(name);
      if (!entry) throw new Error(`Arquivo não encontrado no pacote final: ${name}. Gere novamente antes de enviar ao SIGEM.`);
      const original = await bytesOf(source);
      if (!original.byteLength) throw new Error(`Arquivo vazio: ${name}. Selecione uma cópia válida antes de gerar o pacote.`);
      const actual = await entry.async("uint8array");
      let different = actual.byteLength !== original.byteLength;
      for (let index = 0; !different && index < actual.byteLength; index += 1) different = actual[index] !== original[index];
      if (different) {
        throw new Error(`Conteúdo divergente no pacote: ${name}. Selecione novamente o arquivo e gere outro pacote.`);
      }
      completed += 1;
      if (options.onProgress) options.onProgress({ completed, total: inventory.size, fileName: name });
    }
    checkCancelled();
    return { valid: true, fileCount: inventory.size, batchCount: generated.length };
  }

  return { archiveName, addFolders, compressionOptions, verifyArchive };
});
