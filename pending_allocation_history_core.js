(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPendingAllocationHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "grcon.pending.allocation.history.v1";
  const MAX_RECORDS = 500;
  const MAX_BYTES = 5000000; // 5MB

  const _U = (typeof globalThis !== "undefined" ? globalThis : this).GrconUtils || {};
  function text(value) { return _U.text ? _U.text(value) : String(value === null || value === undefined ? "" : value).trim(); }
  function norm(value) { return _U.norm ? _U.norm(value) : text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase(); }
  function byteSize(value) { return _U.byteSize ? _U.byteSize(value) : (function() { try { return unescape(encodeURIComponent(String(value))).length; } catch (_) { console.debug("[PendingAllocation] byteSize fallback:", _); return String(value).length; } })(); }
  function storageOf(storage) { return _U.storageOf ? _U.storageOf(storage) : (storage || (typeof localStorage !== "undefined" ? localStorage : null)); }

  function cleanDocument(doc) {
    return {
      document: text(doc && doc.document),
      revision: text(doc && doc.revision),
      discipline: text(doc && doc.discipline),
      allocation: text(doc && doc.allocation),
      allocationStatus: text(doc && doc.allocationStatus),
      allocationStage: text(doc && doc.allocationStage),
      fiscalComment: text(doc && doc.fiscalComment),
      ldVersion: text(doc && doc.ldVersion),
      sheet: text(doc && doc.sheet),
      ldRow: Number(doc && doc.ldRow) || 0,
      originalName: text(doc && doc.originalName),
      finalName: text(doc && doc.finalName),
      pdfCount: Number(doc && doc.pdfCount) || 0,
    };
  }

  function cleanSnapshot(snapshot) {
    const documents = Array.isArray(snapshot && snapshot.documents)
      ? snapshot.documents.map(cleanDocument).filter((doc) => doc.document || doc.allocation)
      : [];
    const allocations = [...new Set(documents.map((doc) => doc.allocation).filter(Boolean))].sort();
    const disciplines = [...new Set(documents.map((doc) => doc.discipline).filter(Boolean))].sort();
    
    return {
      id: text(snapshot && snapshot.id) || `${text(snapshot && snapshot.analyzedAt)}|${allocations.join(",")}`,
      analyzedAt: text(snapshot && snapshot.analyzedAt) || new Date().toISOString(),
      ldName: text(snapshot && snapshot.ldName),
      ldVersion: text(snapshot && snapshot.ldVersion),
      sourceName: text(snapshot && snapshot.sourceName),
      documentCount: documents.length,
      pdfCount: documents.reduce((sum, doc) => sum + doc.pdfCount, 0),
      allocations,
      disciplines,
      documents,
    };
  }

  function read(storage) {
    const target = storageOf(storage);
    if (!target) return [];
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed)
        ? parsed.map(cleanSnapshot).sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))
        : [];
    } catch (_) { console.debug("[PendingAllocation] context:", _); return []; }
  }

  function fit(snapshots) {
    const kept = snapshots.slice(0, MAX_RECORDS);
    while (kept.length > 1 && byteSize(JSON.stringify(kept)) > MAX_BYTES) kept.pop();
    return kept;
  }

  function save(snapshot, storage) {
    const target = storageOf(storage);
    if (!target) return { saved: false, error: "Armazenamento local indisponível." };
    
    const incoming = cleanSnapshot(snapshot);
    if (!incoming.documentCount) {
      return { saved: false, error: "Nenhum documento aguardando alocação para registrar." };
    }

    const existing = read(target);
    const merged = new Map(existing.map((item) => [item.id, item]));
    merged.set(incoming.id, incoming);
    
    const fitted = fit([...merged.values()].sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt)));
    
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(fitted));
      return { saved: true, snapshot: incoming, snapshots: fitted };
    } catch (error) {
      return { saved: false, error: error && error.message || "Não foi possível salvar o histórico." };
    }
  }

  function saveMany(snapshots, storage) {
    const target = storageOf(storage);
    if (!target) return { saved: 0, snapshots: [], error: "Armazenamento local indisponível." };
    
    const incoming = (snapshots || []).map(cleanSnapshot).filter((item) => item.documentCount > 0);
    const merged = new Map(read(target).map((item) => [item.id, item]));
    incoming.forEach((item) => merged.set(item.id, item));
    
    const fitted = fit([...merged.values()].sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt)));
    
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(fitted));
      return { saved: incoming.length, snapshots: fitted };
    } catch (error) {
      return { saved: 0, snapshots: [], error: error && error.message || "Não foi possível salvar o histórico." };
    }
  }

  function filter(snapshots, query) {
    const wanted = norm(query);
    if (!wanted) return snapshots || [];
    return (snapshots || []).filter((snapshot) => norm([
      snapshot.ldName, snapshot.ldVersion, snapshot.sourceName,
      ...(snapshot.allocations || []),
      ...(snapshot.disciplines || []),
      ...(snapshot.documents || []).flatMap((doc) => [
        doc.document, doc.allocation, doc.discipline, doc.allocationStatus,
        doc.fiscalComment, doc.originalName, doc.finalName
      ]),
    ].join(" ")).includes(wanted));
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function filterByDate(snapshots, startDate, endDate) {
    const start = text(startDate);
    const end = text(endDate);
    if (start && end && start > end) return [];
    return (snapshots || []).filter((snapshot) => {
      const key = localDateKey(snapshot && snapshot.analyzedAt);
      if (!key) return false;
      if (start && key < start) return false;
      if (end && key > end) return false;
      return true;
    });
  }

  function filterByAllocation(snapshots, allocation) {
    const wanted = norm(allocation);
    if (!wanted) return snapshots || [];
    return (snapshots || []).filter((snapshot) =>
      (snapshot.allocations || []).some((alloc) => norm(alloc).includes(wanted))
    );
  }

  function filterByDiscipline(snapshots, discipline) {
    const wanted = norm(discipline);
    if (!wanted) return snapshots || [];
    return (snapshots || []).filter((snapshot) =>
      (snapshot.disciplines || []).some((disc) => norm(disc).includes(wanted))
    );
  }

  function periodBounds(snapshots) {
    const keys = (snapshots || []).map((snapshot) => localDateKey(snapshot && snapshot.analyzedAt)).filter(Boolean).sort();
    return { start: keys[0] || "", end: keys[keys.length - 1] || "" };
  }

  function summary(snapshots) {
    const source = snapshots || [];
    const allAllocations = new Set();
    const allDisciplines = new Set();
    const allDocuments = new Set();
    let totalPdfs = 0;

    source.forEach((snapshot) => {
      (snapshot.allocations || []).forEach((alloc) => allAllocations.add(alloc));
      (snapshot.disciplines || []).forEach((disc) => allDisciplines.add(disc));
      (snapshot.documents || []).forEach((doc) => allDocuments.add(norm(doc.document)));
      totalPdfs += snapshot.pdfCount || 0;
    });

    return {
      snapshots: source.length,
      totalDocuments: allDocuments.size,
      totalPdfs,
      allocations: allAllocations.size,
      disciplines: allDisciplines.size,
      first: source.length ? [...source].sort((a, b) => a.analyzedAt.localeCompare(b.analyzedAt))[0].analyzedAt : "",
      last: source.length ? [...source].sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))[0].analyzedAt : "",
    };
  }

  function createFromAnalysis(results, context) {
    const info = context || {};
    const rows = (results || []).filter((row) => {
      const allocationState = row && row.record && row.record.allocationStatus || row.allocationStatus;
      const normalized = norm(allocationState);
      return normalized.includes("NAO ALOCADO") && (row.allocation || row.record && row.record.allocation);
    });

    const documents = rows.map((row) => {
      const record = row.record || {};
      const pdfCount = (row.files || []).filter((entry) => /\.pdf$/i.test(text(entry.name || entry.finalName))).length;
      
      return cleanDocument({
        document: row.document,
        revision: row.revision,
        discipline: row.egrdt && row.egrdt.discipline || record.discipline,
        allocation: row.allocation || record.allocation,
        allocationStatus: row.allocationStatus || record.allocationStatus,
        allocationStage: row.allocationStage || record.allocationStage,
        fiscalComment: row.fiscalComment || record.fiscalComment,
        ldVersion: record.ldVersion,
        sheet: row.sheet || record.sheet,
        ldRow: record.row,
        originalName: row.files && row.files[0] && row.files[0].name || row.name,
        finalName: row.finalName,
        pdfCount,
      });
    });

    return cleanSnapshot({
      id: `${info.analyzedAt || new Date().toISOString()}|${Date.now()}`,
      analyzedAt: info.analyzedAt || new Date().toISOString(),
      ldName: info.ldName,
      ldVersion: info.ldVersion,
      sourceName: info.sourceName,
      documents,
    });
  }

  function remove(id, storage) {
    const target = storageOf(storage);
    if (!target) return { removed: false, error: "Armazenamento local indisponível." };
    
    const snapshots = read(target).filter((item) => item.id !== text(id));
    
    try {
      target.setItem(STORAGE_KEY, JSON.stringify(snapshots));
      return { removed: true, snapshots };
    } catch (error) {
      return { removed: false, error: error && error.message || "Não foi possível remover o snapshot." };
    }
  }

  function clear(storage) {
    const target = storageOf(storage);
    if (!target) return { cleared: false, error: "Armazenamento local indisponível." };
    
    try {
      target.removeItem(STORAGE_KEY);
      return { cleared: true };
    } catch (error) {
      return { cleared: false, error: error && error.message || "Não foi possível limpar o histórico." };
    }
  }

  return Object.freeze({
    read,
    save,
    saveMany,
    filter,
    filterByDate,
    filterByAllocation,
    filterByDiscipline,
    periodBounds,
    summary,
    createFromAnalysis,
    remove,
    clear,
    text,
    norm,
  });
});
