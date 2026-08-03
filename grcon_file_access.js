(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconFileAccess = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function isNotReadableError(error) {
    const name = text(error && error.name);
    const message = text(error && error.message);
    return name === "NotReadableError"
      || /requested file could not be read|permission problems|could not be read|acesso.*negado|não.*pôde.*ser lido/i.test(message);
  }

  function wait(milliseconds) {
    return new Promise((resolve) => root.setTimeout(resolve, milliseconds));
  }

  function fileAccessError(file, context, cause) {
    const fileName = text(file && file.name) || "arquivo selecionado";
    const subject = text(context) || "o arquivo";
    const error = new Error(`Não foi possível ler ${subject} “${fileName}”. O arquivo pode ter sido substituído, movido ou bloqueado pelo Windows após a seleção. Se ele estiver na rede, copie-o para uma pasta local e selecione-o novamente.`);
    error.name = "GrconFileAccessError";
    error.code = "FILE_NOT_READABLE";
    error.fileName = fileName;
    error.cause = cause || null;
    return error;
  }

  async function read(file, options) {
    const settings = options || {};
    if (!file || typeof file.arrayBuffer !== "function") throw fileAccessError(file, settings.context, new Error("Referência de arquivo inválida."));
    const retries = Math.max(0, Math.min(3, Number(settings.retries) || 0));
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const buffer = await file.arrayBuffer();
        if (settings.requireContent !== false && (!buffer || !buffer.byteLength)) {
          const empty = new Error("O arquivo selecionado está vazio.");
          empty.name = "EmptyFileError";
          throw empty;
        }
        return buffer;
      } catch (error) {
        lastError = error;
        if (!isNotReadableError(error) || attempt >= retries) break;
        if (typeof settings.onRetry === "function") settings.onRetry(attempt + 1, file);
        await wait(120 * (attempt + 1));
      }
    }
    if (isNotReadableError(lastError)) throw fileAccessError(file, settings.context, lastError);
    throw lastError;
  }

  function preserveMetadata(target, source) {
    const relativePath = text(source && source.webkitRelativePath);
    if (relativePath && !text(target && target.webkitRelativePath)) {
      try { Object.defineProperty(target, "webkitRelativePath", { value: relativePath, configurable: true }); } catch (_) { /* metadado opcional */ }
    }
    try { Object.defineProperty(target, "__grconMemorySnapshot", { value: true, configurable: false }); } catch (_) { /* metadado opcional */ }
    return target;
  }

  async function snapshot(file, options) {
    if (file && file.__grconMemorySnapshot) return file;
    const settings = { retries: 1, ...(options || {}) };
    const buffer = await read(file, settings);
    const properties = { type: text(file && file.type), lastModified: Number(file && file.lastModified) || Date.now() };
    let stable;
    if (typeof root.File === "function") {
      stable = new root.File([buffer], text(file && file.name) || "arquivo", properties);
    } else {
      stable = new root.Blob([buffer], { type: properties.type });
      Object.defineProperties(stable, {
        name: { value: text(file && file.name) || "arquivo" },
        lastModified: { value: properties.lastModified },
      });
    }
    return preserveMetadata(stable, file);
  }

  async function snapshotMany(files, options) {
    const source = Array.from(files || []);
    const output = [];
    for (let index = 0; index < source.length; index += 1) {
      output.push(await snapshot(source[index], options));
      if (options && typeof options.onProgress === "function") options.onProgress(index + 1, source.length);
    }
    return output;
  }

  return Object.freeze({ isNotReadableError, fileAccessError, read, snapshot, snapshotMany });
});
