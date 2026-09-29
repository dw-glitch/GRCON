(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSharedSigemQueryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const text = (v) => String(v == null ? "" : v).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const norm = (v) => text(v).toUpperCase().replace(/[–—]/g, "-").replace(/\s*([_.-])\s*/g, "$1");
  function canonical(document) {
    const raw = norm(document);
    const match = raw.match(/^([A-Z0-9]{3})[-_]RNEST[-_]([A-Z0-9]+)[-_](\d+(?:\.\d+){3})[-_]([A-Z0-9]+)[-_]([A-Z0-9]+)[-_](.+)$/);
    return match ? `${match[1]}_RNEST_${match[2]}_${match[3]}_${match[4]}_${match[5]}_${match[6]}` : raw;
  }
  function keys(document) {
    const value = canonical(document);
    const core = root.TriagemCore;
    return [...new Set((core?.documentSearchKeys?.(value) || [value]).map(norm).filter(Boolean))];
  }
  function revision(v) { return root.TriagemCore?.normalizeRevision?.(text(v)) || norm(v); }
  function timestamp(row) {
    const parse = root.GrconPostingConference?.parseSourceDate || root.GrconPostingConferenceRefinement?.parseSourceDate;
    const dates = [row.modifiedAt, row.includedAt].map((v) => {
      if (parse) return parse(v);
      const match = text(v).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      return match ? Date.UTC(+match[3], +match[2] - 1, +match[1], +(match[4] || 0), +(match[5] || 0), +(match[6] || 0)) : Date.parse(v);
    }).filter(Number.isFinite);
    return dates.length ? Math.max(...dates) : -Infinity;
  }
  function index(base) {
    const result = new Map();
    for (const row of base?.records || []) {
      if (!text(row.document) || !revision(row.revision)) continue;
      for (const key of keys(row.document)) {
        const id = `${key}::${revision(row.revision)}`;
        if (!result.has(id)) result.set(id, []);
        result.get(id).push(row);
      }
    }
    // Resolve dates once per import, not once per document during generation.
    for (const [key, rows] of result) {
      const newest = Math.max(...rows.map(timestamp));
      const current = rows.filter((row) => timestamp(row) === newest);
      const statuses = new Set(current.map((row) => norm(row.status)).filter(Boolean));
      result.set(key, statuses.size === 1 && current.every((r) => text(r.status)) ? current[0] : null);
    }
    return result;
  }
  function context(shared, local) {
    return { shared: shared ? index(shared) : null, local: local ? index(local) : null,
      sharedId: shared?.meta?.snapshotId || "", localId: local?.meta?.snapshotId || "" };
  }
  function resolve(document, rev, ctx, fallback) {
    for (const [layer, source] of [["shared", "shared-general-query"], ["local", "local-general-query"]]) {
      const matches = new Set();
      for (const key of keys(document)) {
        const row = ctx?.[layer]?.get(`${key}::${revision(rev)}`);
        if (row && text(row.status)) matches.add(row);
      }
      if (matches.size === 1) {
        const row = [...matches][0];
        return { status: text(row.status), source, revision: revision(rev), item: row,
          snapshotId: ctx[`${layer}Id`], conflict: false, incomplete: false };
      }
    }
    const legacy = typeof fallback === "function" ? fallback() : fallback;
    return { ...(typeof legacy === "object" && legacy ? legacy : { status: text(legacy) }), source: "legacy-fallback", revision: revision(rev) };
  }
  function validate(base) {
    if (!Array.isArray(base?.records) || !base.records.length) throw new Error("Consulta Geral vazia; a versão anterior foi mantida.");
    if (base.records.length > 100000) throw new Error("A Consulta Geral excede 100.000 registros.");
    if (base.records.some((r) => !text(r.document) || !revision(r.revision))) throw new Error("Há documentos sem código ou revisão válida. Corrija o arquivo antes de publicar.");
    if (!base.records.some((r) => text(r.status))) throw new Error("A Consulta Geral não contém status SIGEM.");
    return base;
  }
  return Object.freeze({ text, canonical, keys, revision, index, context, resolve, validate });
});
