(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.GrconSigemPwDashboard || safeRequire("./sigem_pw_dashboard_core.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwRevision = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Dashboard) {
  "use strict";

  const SITUATIONS = Object.freeze({
    UPDATED: "updated",
    PREVIOUS: "pw-previous",
    NOT_FOUND: "pw-not-found",
    AWAITING_EMISSION: "pw-awaiting-emission",
    PW_AHEAD: "pw-ahead",
    REVIEW: "review",
  });

  const LABELS = Object.freeze({
    [SITUATIONS.UPDATED]: "Atualizado",
    [SITUATIONS.PREVIOUS]: "PW em revisão anterior",
    [SITUATIONS.NOT_FOUND]: "Não localizado no PW",
    [SITUATIONS.AWAITING_EMISSION]: "Aguardando emissão no PW",
    [SITUATIONS.PW_AHEAD]: "PW em revisão posterior",
    [SITUATIONS.REVIEW]: "Requer análise",
  });

  const ATTENTION = Object.freeze([
    SITUATIONS.NOT_FOUND,
    SITUATIONS.PREVIOUS,
    SITUATIONS.AWAITING_EMISSION,
    SITUATIONS.PW_AHEAD,
    SITUATIONS.REVIEW,
  ]);

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    if (Dashboard && typeof Dashboard.norm === "function") return Dashboard.norm(value);
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").toUpperCase().replace(/\s+/g, " ").trim();
  }

  function revisionValue(record) {
    if (!record) return "";
    const direct = text(record.revision);
    return direct !== "" ? direct : text(record.revisionComplete);
  }

  function rank(value) {
    if (Dashboard && typeof Dashboard.revisionRank === "function") return Dashboard.revisionRank(value);
    const revision = norm(value);
    if (revision === "0") return 0;
    if (/^[A-Z]+$/.test(revision)) {
      let output = 0;
      for (const char of revision) output = output * 26 + char.charCodeAt(0) - 64;
      return output * 1000;
    }
    return -1;
  }

  function dateRank(record) {
    const fields = [record && record.stateChangedAt, record && record.modifiedAt, record && record.sentDate, record && record.createdAt, record && record.includedAt];
    for (const field of fields) {
      if (!field) continue;
      if (Dashboard && typeof Dashboard.parseDateMs === "function") {
        const parsed = Dashboard.parseDateMs(field);
        if (parsed) return parsed;
      }
      const parsed = Date.parse(field);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function newerRecord(left, right) {
    if (!right) return left;
    if (!left) return right;
    const leftDate = dateRank(left);
    const rightDate = dateRank(right);
    if (leftDate !== rightDate) return leftDate > rightDate ? left : right;
    return (Number(left.sourceRow) || 0) >= (Number(right.sourceRow) || 0) ? left : right;
  }

  function buildRevisionIndex(document, kind) {
    const byRevision = new Map();
    const emittedByRevision = new Map();
    const rows = Array.isArray(document && document.rows) ? document.rows : [];
    for (const row of rows) {
      const revision = revisionValue(row);
      if (revision === "") continue;
      const key = norm(revision);
      byRevision.set(key, newerRecord(row, byRevision.get(key)));
      if (kind === "pw" && row.emittedEvidence) emittedByRevision.set(key, newerRecord(row, emittedByRevision.get(key)));
    }
    return { byRevision, emittedByRevision };
  }

  function bestRecord(map) {
    let best = null;
    if (!(map instanceof Map)) return best;
    map.forEach((record) => {
      if (!best) { best = record; return; }
      const candidateRank = rank(revisionValue(record));
      const bestRank = rank(revisionValue(best));
      if (candidateRank > bestRank) best = record;
      else if (candidateRank === bestRank) best = newerRecord(record, best);
    });
    return best;
  }

  function history(index, kind) {
    if (!index || !(index.byRevision instanceof Map)) return [];
    const output = [];
    index.byRevision.forEach((record) => {
      const key = norm(revisionValue(record));
      output.push({
        revision: revisionValue(record),
        status: kind === "pw" ? text(record.state) : text(record.status),
        emitted: kind === "pw" ? Boolean(index.emittedByRevision.get(key)) : null,
        emissionFlag: kind === "pw" ? text(record.lastEmission) : "",
        sourceRow: Number(record.sourceRow) || 0,
      });
    });
    return output.sort((a, b) => rank(b.revision) - rank(a.revision) || b.sourceRow - a.sourceRow);
  }

  function documentStructure(document) {
    const record = document && Array.isArray(document.rows) && document.rows.length ? document.rows[0] : null;
    const canonical = text(record && record.canonicalDocument) || text(document && document.document);
    const documentClass = text(document && document.documentClass);
    if (documentClass !== "ET") return { comparable: ["N-1710", "CV"].includes(documentClass), eap: "", documentType: "" };
    const normalized = canonical.replace(/-/g, "-");
    const underscore = normalized.includes("_RNEST_") ? normalized.split("_") : [];
    if (underscore.length >= 7) {
      const eap = text(underscore[3]);
      return { comparable: /^\d+\.\d+\.\d+\.\d+$/.test(eap), eap, documentType: text(underscore[5]) };
    }
    const hyphenMatch = normalized.match(/^[A-Z0-9]{3}-RNEST-[A-Z0-9]+-(\d+(?:\.\d+){3})-([A-Z0-9]+)-([A-Z0-9]+)-/i);
    return hyphenMatch
      ? { comparable: true, eap: text(hyphenMatch[1]), documentType: text(hyphenMatch[3]) }
      : { comparable: false, eap: "", documentType: "" };
  }

  function comparableDocument(document) {
    return documentStructure(document).comparable;
  }

  function scanDocument(document, kind, expectedRevisionKey) {
    const rows = Array.isArray(document && document.rows) ? document.rows : [];
    let latest = null;
    let latestEmitted = null;
    let exact = null;
    let exactEmitted = null;
    for (const row of rows) {
      const revision = revisionValue(row);
      if (revision === "") continue;
      const revisionKey = norm(revision);
      const rowRank = rank(revision);
      if (!latest) latest = row;
      else {
        const bestRank = rank(revisionValue(latest));
        if (rowRank > bestRank) latest = row;
        else if (rowRank === bestRank) latest = newerRecord(row, latest);
      }
      if (expectedRevisionKey && revisionKey === expectedRevisionKey) exact = newerRecord(row, exact);
      if (kind === "pw" && row.emittedEvidence) {
        if (!latestEmitted) latestEmitted = row;
        else {
          const emittedRank = rank(revisionValue(latestEmitted));
          if (rowRank > emittedRank) latestEmitted = row;
          else if (rowRank === emittedRank) latestEmitted = newerRecord(row, latestEmitted);
        }
        if (expectedRevisionKey && revisionKey === expectedRevisionKey) exactEmitted = newerRecord(row, exactEmitted);
      }
    }
    return { latest, latestEmitted, exact, exactEmitted, rowCount: rows.length };
  }

  function historyForRows(rows, kind) {
    const document = { rows: Array.isArray(rows) ? rows : [] };
    return history(buildRevisionIndex(document, kind), kind);
  }

  function analyzeOne(sigemDocument, pwDocument, key) {
    const sigemScan = scanDocument(sigemDocument, "sigem", "");
    const currentCandidate = revisionValue(sigemDocument && sigemDocument.current) !== "" ? sigemDocument.current : sigemScan.latest;
    const sigemRevision = revisionValue(currentCandidate);
    if (sigemRevision === "") return { skip: true, sigemRevisionRows: sigemScan.rowCount, pwRevisionRows: 0 };
    const sigemRevisionKey = norm(sigemRevision);
    const sigemRank = rank(sigemRevision);
    const structure = documentStructure(sigemDocument);
    const base = {
      key,
      document: text(sigemDocument.document),
      documentClass: text(sigemDocument.documentClass),
      sigemRevision,
      sigemStatus: text(currentCandidate && currentCandidate.status),
      sigemCode: text(sigemDocument.document),
      pwCode: "",
      pwRevision: "",
      pwStatus: "",
      lastEmittedPwRevision: "",
      lastEmittedPwStatus: "",
      situation: SITUATIONS.REVIEW,
      reason: "Não foi possível determinar a situação com segurança.",
      eap: text(structure.eap),
      documentType: text(structure.documentType),
      sigemRows: Array.isArray(sigemDocument.rows) ? sigemDocument.rows : [],
      pwRows: [],
    };

    if (!pwDocument) {
      base.situation = SITUATIONS.NOT_FOUND;
      base.reason = "Nenhuma correspondência documental válida foi localizada no ProjectWise considerando a identidade documental do GRCON.";
      return { row: base, counter: "notFound", sigemRevisionRows: sigemScan.rowCount, pwRevisionRows: 0 };
    }

    const pwScan = scanDocument(pwDocument, "pw", sigemRevisionKey);
    base.pwCode = text(pwDocument.document);
    base.pwRows = Array.isArray(pwDocument.rows) ? pwDocument.rows : [];
    const exact = pwScan.exact;
    const exactEmitted = pwScan.exactEmitted;
    const latestRegistered = pwScan.latest;
    const latestEmitted = pwScan.latestEmitted;
    const latestRegisteredRevision = revisionValue(latestRegistered);
    const latestRegisteredRank = rank(latestRegisteredRevision);
    if (latestEmitted) {
      base.lastEmittedPwRevision = revisionValue(latestEmitted);
      base.lastEmittedPwStatus = text(latestEmitted.state);
    }

    if (exact) {
      base.pwRevision = revisionValue(exact);
      base.pwStatus = text(exact.state);
      if (!exactEmitted) {
        base.situation = SITUATIONS.AWAITING_EMISSION;
        base.reason = base.lastEmittedPwRevision
          ? `A revisão ${sigemRevision} está cadastrada no PW, mas ainda não atende ao critério de emissão. A última revisão emitida identificada é ${base.lastEmittedPwRevision}.`
          : `A revisão ${sigemRevision} está cadastrada no PW, mas ainda não atende ao critério de emissão.`;
        return { row: base, counter: "awaitingEmission", sigemRevisionRows: sigemScan.rowCount, pwRevisionRows: pwScan.rowCount };
      }
      if (sigemRank >= 0 && latestRegisteredRank > sigemRank) {
        base.situation = SITUATIONS.PW_AHEAD;
        base.pwRevision = latestRegisteredRevision;
        base.pwStatus = text(latestRegistered.state);
        base.reason = `A revisão ${sigemRevision} existe e foi emitida no PW, porém o PW também possui revisão posterior ${latestRegisteredRevision}.`;
        return { row: base, counter: "pwAhead", sigemRevisionRows: sigemScan.rowCount, pwRevisionRows: pwScan.rowCount };
      }
      base.situation = SITUATIONS.UPDATED;
      base.reason = "A mesma revisão aplicável do SIGEM foi localizada no PW e possui evidência de emissão.";
      return { row: base, counter: "updated", sigemRevisionRows: sigemScan.rowCount, pwRevisionRows: pwScan.rowCount };
    }

    if (latestRegistered) {
      base.pwRevision = latestRegisteredRevision;
      base.pwStatus = text(latestRegistered.state);
      if (sigemRank >= 0 && latestRegisteredRank >= 0 && latestRegisteredRank < sigemRank) {
        base.situation = SITUATIONS.PREVIOUS;
        base.reason = `O documento existe no PW, mas a revisão mais avançada cadastrada (${latestRegisteredRevision}) é anterior à revisão do SIGEM (${sigemRevision}).`;
        return { row: base, counter: "previous", sigemRevisionRows: sigemScan.rowCount, pwRevisionRows: pwScan.rowCount };
      }
      if (sigemRank >= 0 && latestRegisteredRank > sigemRank) {
        base.situation = SITUATIONS.PW_AHEAD;
        base.reason = `O PW possui revisão mais avançada (${latestRegisteredRevision}) que a revisão atual do SIGEM (${sigemRevision}).`;
        return { row: base, counter: "pwAhead", sigemRevisionRows: sigemScan.rowCount, pwRevisionRows: pwScan.rowCount };
      }
      base.reason = `O documento existe no PW, mas as revisões ${sigemRevision} e ${latestRegisteredRevision || "não identificada"} não puderam ser ordenadas com segurança.`;
    } else {
      base.reason = "O documento existe no PW, porém nenhuma revisão válida foi identificada para comparação.";
    }
    return { row: base, counter: "review", sigemRevisionRows: sigemScan.rowCount, pwRevisionRows: pwScan.rowCount };
  }

  function finaliseAnalysis(rows, counts, startedAt, sigemRevisionRows, pwRevisionRows) {
    const priority = {
      [SITUATIONS.NOT_FOUND]: 0,
      [SITUATIONS.PREVIOUS]: 1,
      [SITUATIONS.AWAITING_EMISSION]: 2,
      [SITUATIONS.PW_AHEAD]: 3,
      [SITUATIONS.REVIEW]: 4,
      [SITUATIONS.UPDATED]: 5,
    };
    const buckets = Array.from({ length: 7 }, () => []);
    for (const row of rows) buckets[priority[row.situation] ?? 6].push(row);
    rows.splice(0, rows.length, ...buckets.flat());
    const endedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    return {
      rows,
      counts,
      metrics: {
        durationMs: Math.max(0, endedAt - startedAt),
        documentsCompared: counts.comparable,
        sigemRevisionRows,
        pwRevisionRows,
        algorithm: "O(SIGEM documents + revision rows of matched documents)",
      },
    };
  }

  function analyze(model) {
    const startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const sigemAll = model && model.sigemAll instanceof Map ? model.sigemAll : new Map();
    const pwAll = model && model.pwAll instanceof Map ? model.pwAll : new Map();
    const rows = [];
    const counts = { updated: 0, previous: 0, notFound: 0, awaitingEmission: 0, pwAhead: 0, review: 0, comparable: 0, nonComparable: 0 };
    let sigemRevisionRows = 0;
    let pwRevisionRows = 0;
    sigemAll.forEach((sigemDocument, key) => {
      if (!comparableDocument(sigemDocument)) { counts.nonComparable += 1; return; }
      counts.comparable += 1;
      const result = analyzeOne(sigemDocument, pwAll.get(key) || null, key);
      sigemRevisionRows += result.sigemRevisionRows || 0;
      pwRevisionRows += result.pwRevisionRows || 0;
      if (result.skip) { counts.review += 1; return; }
      counts[result.counter] += 1;
      rows.push(result.row);
    });
    return finaliseAnalysis(rows, counts, startedAt, sigemRevisionRows, pwRevisionRows);
  }

  async function analyzeAsync(model, options) {
    const startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const sigemAll = model && model.sigemAll instanceof Map ? model.sigemAll : new Map();
    const pwAll = model && model.pwAll instanceof Map ? model.pwAll : new Map();
    const entries = [...sigemAll.entries()];
    const rows = [];
    const counts = { updated: 0, previous: 0, notFound: 0, awaitingEmission: 0, pwAhead: 0, review: 0, comparable: 0, nonComparable: 0 };
    let sigemRevisionRows = 0;
    let pwRevisionRows = 0;
    let maxChunkMs = 0;
    const chunkSize = Math.max(100, Number(options && options.chunkSize) || 400);
    const onProgress = options && typeof options.onProgress === "function" ? options.onProgress : null;
    const generation = options && options.generation;
    const isCurrent = options && typeof options.isCurrent === "function" ? options.isCurrent : null;
    for (let start = 0; start < entries.length; start += chunkSize) {
      if (isCurrent && !isCurrent(generation)) return { cancelled: true, rows: [], counts, metrics: { durationMs: 0, documentsCompared: counts.comparable, sigemRevisionRows, pwRevisionRows, maxChunkMs, algorithm: "cancelled" } };
      const chunkStartedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const end = Math.min(entries.length, start + chunkSize);
      for (let index = start; index < end; index += 1) {
        const [key, sigemDocument] = entries[index];
        if (!comparableDocument(sigemDocument)) { counts.nonComparable += 1; continue; }
        counts.comparable += 1;
        const result = analyzeOne(sigemDocument, pwAll.get(key) || null, key);
        sigemRevisionRows += result.sigemRevisionRows || 0;
        pwRevisionRows += result.pwRevisionRows || 0;
        if (result.skip) { counts.review += 1; continue; }
        counts[result.counter] += 1;
        rows.push(result.row);
      }
      const chunkEndedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      maxChunkMs = Math.max(maxChunkMs, chunkEndedAt - chunkStartedAt);
      if (onProgress) onProgress(end, entries.length);
      if (end < entries.length) {
        if (typeof scheduler !== "undefined" && scheduler && typeof scheduler.yield === "function") await scheduler.yield();
        else await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    const result = finaliseAnalysis(rows, counts, startedAt, sigemRevisionRows, pwRevisionRows);
    result.metrics.maxChunkMs = maxChunkMs;
    result.metrics.chunkSize = chunkSize;
    return result;
  }

  function filterRows(rows, filters) {
    const source = Array.isArray(rows) ? rows : [];
    const f = filters || {};
    const search = norm(f.search);
    const wanted = new Set(String(f.documentList || "").split(/[\r\n,;|\t]+/).map((item) => norm(item)).filter(Boolean));
    return source.filter((row) => {
      if (f.situation === "attention" && !ATTENTION.includes(row.situation)) return false;
      if (f.situation === "other" && ![SITUATIONS.PW_AHEAD, SITUATIONS.REVIEW].includes(row.situation)) return false;
      if (f.situation && !["attention", "all", "other"].includes(f.situation) && row.situation !== f.situation) return false;
      if (f.documentClass && row.documentClass !== f.documentClass) return false;
      if (f.sigemRevision && norm(row.sigemRevision) !== norm(f.sigemRevision)) return false;
      if (f.pwRevision && norm(row.pwRevision) !== norm(f.pwRevision)) return false;
      if (f.sigemStatus && norm(row.sigemStatus) !== norm(f.sigemStatus)) return false;
      if (f.pwStatus && norm(row.pwStatus) !== norm(f.pwStatus)) return false;
      if (wanted.size && !wanted.has(norm(row.document)) && !wanted.has(norm(row.sigemCode)) && !wanted.has(norm(row.pwCode))) return false;
      if (search && !norm([row.document, row.sigemRevision, row.pwRevision, row.sigemStatus, row.pwStatus, row.lastEmittedPwRevision, row.reason].join(" ")).includes(search)) return false;
      return true;
    });
  }

  return Object.freeze({ SITUATIONS, LABELS, ATTENTION, text, norm, revisionValue, rank, buildRevisionIndex, bestRecord, history, historyForRows, documentStructure, comparableDocument, scanDocument, analyze, analyzeAsync, filterRows });
});
