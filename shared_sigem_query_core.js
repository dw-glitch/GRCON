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
  // Índice de revisões por documento, construído somente ao carregar a base.
  // Evita varrer até 100 mil registros a cada linha da triagem/Worker.
  function revisionsByDocument(indexed) {
    const result = new Map();
    for (const id of indexed?.keys() || []) {
      const separator = id.lastIndexOf("::");
      if (separator < 0) continue;
      const documentKey = id.slice(0, separator), rev = id.slice(separator + 2);
      if (!result.has(documentKey)) result.set(documentKey, new Set());
      result.get(documentKey).add(rev);
    }
    return result;
  }
  function context(shared, local) {
    const sharedIndex = shared ? index(shared) : null;
    const localIndex = local ? index(local) : null;
    return { shared: sharedIndex, local: localIndex,
      sharedRevisions: revisionsByDocument(sharedIndex),
      localRevisions: revisionsByDocument(localIndex),
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
  // Uma revisão futura como C pode estar "Não Postado" e continuar impedida
  // de ser emitida porque B ainda está Em Workflow/Em Análise. A verificação
  // sempre utiliza a mesma precedência por revisão do resolve() oficial.
  function previousAnalysis(document, targetRevision, ctx, legacyRevisions, legacyResolver) {
    const core = root.TriagemCore;
    const targetInfo = core?.revisionInfo?.(targetRevision);
    if (!targetInfo?.valid || !Number.isFinite(targetInfo.rank)) return null;
    const candidates = new Set((legacyRevisions || []).map(item => revision(item?.revision)).filter(Boolean));
    for (const documentKey of keys(document)) {
      for (const layer of ["sharedRevisions", "localRevisions"]) {
        for (const rev of ctx?.[layer]?.get(documentKey) || []) candidates.add(rev);
      }
    }
    const earlier = [...candidates].map(rev => ({ rev, info: core.revisionInfo(rev) }))
      .filter(item => item.info.valid && Number.isFinite(item.info.rank) && item.info.rank < targetInfo.rank)
      .sort((a, b) => b.info.rank - a.info.rank);
    for (const item of earlier) {
      const resolved = resolve(document, item.rev, ctx, () =>
        typeof legacyResolver === "function" ? legacyResolver(item.rev) : { status: "Não Postado" });
      if (core.statusKind(resolved.status) === "analysis") {
        return { revision: item.rev, status: resolved.status, source: resolved.source,
          snapshotId: resolved.snapshotId || "", item: resolved.item || null };
      }
    }
    return null;
  }
  function validate(base) {
    if (!Array.isArray(base?.records) || !base.records.length) throw new Error("Consulta Geral vazia; a versão anterior foi mantida.");
    if (base.records.length > 100000) throw new Error("A Consulta Geral excede 100.000 registros.");
    if (base.records.some((r) => !text(r.document) || !revision(r.revision))) throw new Error("Há documentos sem código ou revisão válida. Corrija o arquivo antes de publicar.");
    if (!base.records.some((r) => text(r.status))) throw new Error("A Consulta Geral não contém status SIGEM.");
    return base;
  }
  return Object.freeze({ text, canonical, keys, revision, index, context, resolve, previousAnalysis, validate });
});
