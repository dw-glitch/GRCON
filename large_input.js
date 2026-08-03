(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconLargeInput = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_CHUNK_SIZE = 300;
  const DEFAULT_PAGE_SIZE = 250;

  function pause() {
    if (typeof scheduler !== "undefined" && scheduler && typeof scheduler.yield === "function") {
      return scheduler.yield();
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function normalizedChunkSize(value) {
    return Math.max(25, Math.min(2000, Number(value) || DEFAULT_CHUNK_SIZE));
  }

  async function mapInChunks(items, mapper, options) {
    const source = Array.isArray(items) ? items : [];
    const settings = options || {};
    const chunkSize = normalizedChunkSize(settings.chunkSize);
    const output = new Array(source.length);
    for (let start = 0; start < source.length; start += chunkSize) {
      const end = Math.min(source.length, start + chunkSize);
      for (let index = start; index < end; index += 1) output[index] = mapper(source[index], index, source);
      if (typeof settings.onProgress === "function") settings.onProgress(end, source.length);
      if (end < source.length) await pause();
    }
    return output;
  }

  async function forEachInChunks(items, callback, options) {
    await mapInChunks(items, (item, index, source) => {
      callback(item, index, source);
      return null;
    }, options);
  }

  function page(items, currentPage, pageSize) {
    const source = Array.isArray(items) ? items : [];
    const size = Math.max(25, Number(pageSize) || DEFAULT_PAGE_SIZE);
    const pages = Math.max(1, Math.ceil(source.length / size));
    const selectedPage = Math.max(1, Math.min(pages, Number(currentPage) || 1));
    const startIndex = (selectedPage - 1) * size;
    const endIndex = Math.min(source.length, startIndex + size);
    return {
      items: source.slice(startIndex, endIndex),
      page: selectedPage,
      pages,
      pageSize: size,
      total: source.length,
      startIndex,
      endIndex,
      firstNumber: source.length ? startIndex + 1 : 0,
      lastNumber: endIndex,
    };
  }

  return Object.freeze({ DEFAULT_CHUNK_SIZE, DEFAULT_PAGE_SIZE, pause, mapInChunks, forEachInChunks, page });
});
