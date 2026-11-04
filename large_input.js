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

  // Orçamento de tempo por fatia: o trabalho cede a tela a cada ~TIME_BUDGET_MS,
  // em vez de a cada N itens. Itens baratos continuam em blocos grandes; itens
  // caros (ex.: primeira leitura de File.size em disco/rede) não travam a janela.
  const TIME_BUDGET_MS = 10;
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

  async function mapInChunks(items, mapper, options) {
    const source = Array.isArray(items) ? items : [];
    const settings = options || {};
    const chunkSize = normalizedChunkSize(settings.chunkSize);
    const budget = Number(settings.timeBudgetMs) > 0 ? Number(settings.timeBudgetMs) : TIME_BUDGET_MS;
    const output = new Array(source.length);
    let index = 0;
    let lastReported = 0;
    while (index < source.length) {
      const sliceStarted = now();
      const hardEnd = Math.min(source.length, index + chunkSize * 4);
      // Confere o relógio a cada poucos itens: barato e preciso o bastante.
      while (index < hardEnd) {
        output[index] = mapper(source[index], index, source);
        index += 1;
        if ((index & 7) === 0 && now() - sliceStarted >= budget) break;
      }
      if (typeof settings.onProgress === "function" && (index - lastReported >= chunkSize || index >= source.length)) {
        lastReported = index;
        settings.onProgress(index, source.length);
      }
      if (index < source.length) await pause();
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
