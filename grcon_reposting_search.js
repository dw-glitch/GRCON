(function (root, factory) {
  const api = factory(root, root.GrconRepostingCore, root.GrconRepostingStorage);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GrconRepostingSearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, Core, Storage) {
  "use strict";

  function text(value) { return String(value === null || value === undefined ? "" : value).trim(); }
  function stem(name) { return text(name).replace(/\.[^.]+$/, ""); }
  function normalizeName(name) { return Core?.norm?.(stem(name)) || stem(name).toUpperCase(); }
  function boundary(source, start, length) {
    const before = start > 0 ? source[start - 1] : "";
    const after = start + length < source.length ? source[start + length] : "";
    return (!before || !/[A-Z0-9]/.test(before)) && (!after || !/[A-Z0-9]/.test(after));
  }
  function targetPatterns(targets) {
    const byPattern = new Map();
    (targets || []).forEach((target) => {
      const id = text(target?.id);
      if (!id) return;
      (Core?.searchKeys?.(target.document) || []).forEach((pattern) => {
        const value = text(pattern);
        if (!value) return;
        if (!byPattern.has(value)) byPattern.set(value, new Set());
        byPattern.get(value).add(id);
      });
    });
    return byPattern;
  }
  function buildAutomaton(targets) {
    const patterns = targetPatterns(targets);
    const nodes = [{ next: new Map(), fail: 0, out: [] }];
    patterns.forEach((ids, pattern) => {
      let state = 0;
      for (const char of pattern) {
        let next = nodes[state].next.get(char);
        if (next === undefined) {
          next = nodes.length;
          nodes[state].next.set(char, next);
          nodes.push({ next: new Map(), fail: 0, out: [] });
        }
        state = next;
      }
      nodes[state].out.push({ pattern, ids: [...ids] });
    });
    const queue = [];
    nodes[0].next.forEach((child) => { nodes[child].fail = 0; queue.push(child); });
    for (let head = 0; head < queue.length; head += 1) {
      const state = queue[head];
      nodes[state].next.forEach((child, char) => {
        queue.push(child);
        let failure = nodes[state].fail;
        while (failure && !nodes[failure].next.has(char)) failure = nodes[failure].fail;
        const fallback = nodes[failure].next.get(char);
        nodes[child].fail = fallback === undefined ? 0 : fallback;
        if (nodes[nodes[child].fail].out.length) nodes[child].out.push(...nodes[nodes[child].fail].out);
      });
    }
    return { nodes, patternCount: patterns.size };
  }
  function matchingTargetIds(source, automaton) {
    const ids = new Set();
    let state = 0;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      while (state && !automaton.nodes[state].next.has(char)) state = automaton.nodes[state].fail;
      const next = automaton.nodes[state].next.get(char);
      state = next === undefined ? 0 : next;
      for (const output of automaton.nodes[state].out) {
        const start = index - output.pattern.length + 1;
        if (start >= 0 && boundary(source, start, output.pattern.length)) output.ids.forEach((id) => ids.add(id));
      }
    }
    return ids;
  }
  function abortError() { const error = new Error("Busca cancelada."); error.name = "AbortError"; return error; }
  function yieldTask() { return new Promise((resolve) => (root?.setTimeout || setTimeout)(resolve, 0)); }
  function progress(scanned, total) {
    const target = root?.document?.getElementById?.("grcon-repost-progress");
    if (target) target.textContent = `Filtrando índice: ${scanned.toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")} arquivos`;
  }

  async function filterEntriesForTargets(entries, targets, options) {
    const source = Array.from(entries || []);
    const wanted = (targets || []).filter((target) => text(target?.id) && text(target?.document));
    if (!source.length || !wanted.length) return [];
    const automaton = buildAutomaton(wanted);
    if (!automaton.patternCount) return [];
    const output = [];
    const seen = new Set();
    const signal = options?.signal;
    const chunkSize = Math.max(250, Number(options?.chunkSize) || 1250);
    for (let index = 0; index < source.length; index += 1) {
      if (signal?.aborted) throw abortError();
      const entry = source[index];
      const normalized = normalizeName(entry?.name);
      if (normalized && matchingTargetIds(normalized, automaton).size) {
        const key = text(entry?.id) || `${text(entry?.rootId)}|${text(entry?.relativePath)}|${text(entry?.name)}`;
        if (!seen.has(key)) { seen.add(key); output.push(entry); }
      }
      if ((index + 1) % chunkSize === 0) {
        if (typeof options?.onProgress === "function") options.onProgress({ scanned: index + 1, total: source.length, candidates: output.length });
        await yieldTask();
      }
    }
    if (typeof options?.onProgress === "function") options.onProgress({ scanned: source.length, total: source.length, candidates: output.length, done: true });
    return output;
  }

  // O índice persistente pode ter centenas de milhares de metadados. A UI
  // seleciona os documentos antes de pesquisar; por isso podemos reduzir o
  // conjunto em UMA varredura Aho-Corasick e só então executar a classificação
  // documental rigorosa existente. Isso não muda matching nem revisão: apenas
  // elimina candidatos impossíveis antes do Core conferir documento + revisão.
  if (Storage && typeof Storage.activeEntries === "function" && root) {
    const originalActiveEntries = Storage.activeEntries.bind(Storage);
    const patched = Object.freeze({
      ...Storage,
      activeEntries: async function activeEntriesForCurrentTargets(rootIds) {
        const all = await originalActiveEntries(rootIds);
        const targets = root.GrconRepostingUi?.state?.targets || [];
        if (!targets.length) return all;
        const signal = root.GrconRepostingUi?.state?.controller?.signal;
        return filterEntriesForTargets(all, targets, { signal, onProgress: ({ scanned, total }) => progress(scanned, total) });
      },
    });
    root.GrconRepostingStorage = patched;
  }

  return Object.freeze({ targetPatterns, buildAutomaton, matchingTargetIds, filterEntriesForTargets });
});
