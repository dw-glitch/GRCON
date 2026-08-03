(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPackageLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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

  function addFolders(zip, generated, rootExtras = []) {
    if (!zip || typeof zip.folder !== "function") throw new Error("Compactador indisponível.");
    if (!Array.isArray(generated) || !generated.length) throw new Error("Nenhuma eGRDT foi gerada.");
    const folderNames = new Set();
    generated.forEach((generatedFile) => {
      const folderName = generatedFile.official.baseName;
      const expectedFileName = `${folderName}.xls`;
      if (generatedFile.fileName !== expectedFileName) throw new Error(`O nome da eGRDT deve ser ${expectedFileName}.`);
      if (folderNames.has(folderName.toUpperCase())) throw new Error(`Nome de pasta duplicado: ${folderName}.`);
      folderNames.add(folderName.toUpperCase());
      const folder = zip.folder(folderName);
      const fileNames = new Set();
      generatedFile.group.entries.forEach((entry) => {
        if (!entry.file) throw new Error(`${entry.document || entry.finalName}: PDF físico ausente no lote ${generatedFile.group.number}.`);
        const key = String(entry.finalName || "").toUpperCase();
        if (!key) throw new Error(`Existe um PDF sem nome final no lote ${generatedFile.group.number}.`);
        if (fileNames.has(key)) throw new Error(`PDF duplicado na pasta ${folderName}: ${entry.finalName}.`);
        fileNames.add(key);
        folder.file(entry.finalName, entry.file);
      });
      folder.file(generatedFile.fileName, generatedFile.data);
    });
    rootExtras.forEach((entry) => zip.file(entry.name, entry.data));
    return generated.map((generatedFile) => generatedFile.official.baseName);
  }

  return { archiveName, addFolders };
});
