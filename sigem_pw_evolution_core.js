(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.GrconSigemPwDashboard || safeRequire("./sigem_pw_scope_fix.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwEvolution = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Dashboard) {
  "use strict";

  const CALCULATION_VERSION = "sigem-pw-evolution-records-2";
  const VALID_CLASSES = new Set(["ET", "N-1710", "CV"]);
  const SYSTEMS = Object.freeze({ SIGEM: "sigem", PW: "pw" });

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function norm(value) {
    if (Dashboard && typeof Dashboard.norm === "function") return Dashboard.norm(value);
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").toUpperCase().replace(/\s+/g, " ").trim();
  }
  function normalizeRevision(value) {
    return norm(value).replace(/^REV(?:ISAO)?\.?\s*/, "").replace(/\s+/g, "");
  }
  function normalizeDate(value) {
    const raw = text(value);
    if (!raw) return "";
    const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (br) return `${br[3]}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}T${String(br[4] || 0).padStart(2, "0")}:${String(br[5] || 0).padStart(2, "0")}:${String(br[6] || 0).padStart(2, "0")}`;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? norm(raw) : date.toISOString();
  }
  function hash32(source, seed) {
    let hash = (seed >>> 0) || 2166136261;
    const value = String(source || "");
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }
  function fingerprint(values, prefix) {
    const rows = (values || []).map(String).sort();
    let first = hash32(`${prefix || "v"}|${rows.length}`, 2166136261);
    let second = hash32(`${rows.length}|${prefix || "v"}`, 2246822519);
    for (const row of rows) {
      first = hash32(row, first);
      second = hash32(row.split("").reverse().join(""), second);
    }
    return `${prefix || "v"}-${rows.length.toString(36)}-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
  }

  function fallbackDocumentIdentity(value) {
    const canonical = norm(value).replace(/\s*([_.-])\s*/g, "$1");
    const et = canonical.match(/^([A-Z0-9]{3})[-_]RNEST[-_]([A-Z0-9]+)[-_](\d+(?:\.\d+){3})[-_]([A-Z0-9]+)[-_]([A-Z0-9]+)[-_](.+)$/);
    const key = et ? `${et[1]}_RNEST_${et[2]}_${et[3]}_${et[4]}_${et[5]}_${et[6].replace(/^NT-/, "")}` : canonical;
    return { key, canonical, info: null, searchKeys: key ? [key] : [] };
  }
  function documentIdentity(value) {
    if (Dashboard && typeof Dashboard.documentIdentity === "function") return Dashboard.documentIdentity(value);
    return fallbackDocumentIdentity(value);
  }
  function documentClass(value) {
    if (Dashboard && typeof Dashboard.documentClass === "function") return Dashboard.documentClass(value);
    const code = documentIdentity(value).canonical;
    if (code.includes("_RNEST_")) return "ET";
    if (/^5900(?:\.\d+){3}-[A-Z0-9]{3}-CV-[A-Z0-9]+-\d{3,4}$/i.test(code)) return "CV";
    if (/^(?:[IAFLED]-)?[A-Z0-9]{2,3}-5290\.00-22313-[A-Z0-9]{3}-C1O-\d{3,4}$/i.test(code)) return "N-1710";
    return "Não classificado";
  }
  function inferEap(record, identity) {
    const explicit = text(record && (record.eap || record.EAP));
    if (explicit) return explicit;
    const info = identity && identity.info;
    if (info && text(info.eap)) return text(info.eap);
    const canonical = text(identity && identity.canonical);
    const match = canonical.match(/_RNEST_[^_]+_(\d+(?:\.\d+){3})_/i);
    return match ? match[1] : "";
  }
  function searchKeysFor(value) {
    const identity = documentIdentity(value);
    const keys = new Set([identity.key, ...(identity.searchKeys || [])].map(norm).filter(Boolean));
    return [...keys];
  }

  function buildLdUniverse(records, history) {
    const byKey = new Map();
    const all = [];
    const add = (raw, technical) => {
      if (!raw || !text(raw.document)) return;
      const identity = documentIdentity(raw.documentKey || raw.document);
      const keys = new Set([identity.key, ...(identity.searchKeys || []), ...searchKeysFor(raw.document)].map(norm).filter(Boolean));
      if (!keys.size) return;
      const entry = {
        document: text(raw.document),
        documentKey: norm(identity.key),
        documentClass: documentClass(raw.document),
        revision: normalizeRevision(raw.revision),
        title: text(raw.title),
        tag: text(raw.tag),
        eap: inferEap(raw, identity),
        discipline: text(raw.discipline),
        documentType: text(raw.documentType),
        prazo: text(raw.ldPrazo || raw.prazo),
        sheet: text(raw.sheet),
        source: text(raw.source),
        row: Number(raw.row) || 0,
        technical: Boolean(technical),
      };
      all.push(entry);
      keys.forEach((key) => {
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(entry);
      });
    };
    (records || []).forEach((row) => add(row, true));
    (history || []).forEach((row) => add(row, false));
    const uniqueDocuments = new Set(all.map((row) => row.documentKey).filter(Boolean));
    const technicalDocuments = new Set(all.filter((row) => row.technical).map((row) => row.documentKey).filter(Boolean));
    const sig = fingerprint(all.map((row) => [row.documentKey, row.documentClass, row.documentType, row.tag, row.eap, row.discipline, row.sheet, row.source].map(norm).join("|")), "ld");
    return {
      byKey,
      records: all,
      uniqueDocumentCount: uniqueDocuments.size,
      technicalDocumentCount: technicalDocuments.size,
      fingerprint: sig,
      available: all.length > 0,
    };
  }

  function findLdMatches(record, universe) {
    if (!universe || !universe.available || !(universe.byKey instanceof Map)) return [];
    const matches = new Map();
    searchKeysFor(record && record.document).forEach((key) => {
      (universe.byKey.get(norm(key)) || []).forEach((entry) => {
        const token = `${entry.source}|${entry.sheet}|${entry.row}|${entry.documentKey}`;
        if (!matches.has(token)) matches.set(token, entry);
      });
    });
    return [...matches.values()].sort((a, b) => Number(b.technical) - Number(a.technical) || a.row - b.row);
  }

  function scopeReason(record, identity, cls, universe) {
    if (!identity.key) return "codigo_vazio_ou_invalido";
    if (!VALID_CLASSES.has(cls)) {
      if (Dashboard && typeof Dashboard.n1710ScopeInfo === "function") {
        const scope = Dashboard.n1710ScopeInfo(record && record.document);
        if (scope && scope.reason && scope.reason !== "fora_das_familias_grcon") return scope.reason;
      }
      return "fora_do_escopo_grcon";
    }
    if (identity.info && identity.info.eapApplicable && identity.info.eapValid === false) return "eap_invalida";
    if (universe && universe.available && !findLdMatches(record, universe).length) return "nao_encontrado_nas_lds";
    return "";
  }

  function preferredLdMatch(matches) {
    if (!(matches || []).length) return null;
    return matches.find((row) => row.technical) || matches[0];
  }
  function statusOf(record, system) { return text(system === SYSTEMS.PW ? record && record.state : record && record.status); }
  function revisionOf(record) { return normalizeRevision(record && (record.revisionComplete || record.revision)); }
  function dateOf(record, system) {
    if (system === SYSTEMS.PW) return text(record && (record.sentDate || record.stateChangedAt || record.createdAt || record.incomingDate));
    return text(record && (record.includedAt || record.modifiedAt));
  }
  function strongOccurrenceId(record, system) {
    if (!record) return "";
    const explicit = text(record.clientRecordId || record.registrationId || record.recordNumber || record.registryId);
    if (explicit) return norm(explicit);
    if (system === SYSTEMS.PW) {
      const emissionSequence = text(record.emissionSequence);
      if (emissionSequence) return `SEQ:${norm(emissionSequence)}`;
      const grd = text(record.sentGrd);
      const sentDate = normalizeDate(record.sentDate);
      if (grd && sentDate) return `GRD:${norm(grd)}@${sentDate}`;
    } else {
      const includedAt = normalizeDate(record.includedAt);
      if (includedAt) return `INCL:${includedAt}`;
    }
    return "";
  }
  function versionOf(record) { return norm(record && (record.version || record.documentVersion || record.versao)); }
  function occurrenceKey(record, system) {
    const identity = documentIdentity(record && record.document);
    const revision = revisionOf(record);
    const version = versionOf(record);
    const strong = strongOccurrenceId(record, system);
    return [norm(identity.key), revision, version, strong].join("|");
  }
  function matchKey(record) {
    const identity = documentIdentity(record && record.document);
    return [norm(identity.key), revisionOf(record), versionOf(record)].join("|");
  }
  function technicalFingerprint(record, system) {
    const identity = documentIdentity(record && record.document);
    const common = [norm(identity.key), revisionOf(record), versionOf(record), norm(record && record.documentType), norm(record && record.discipline), norm(record && record.title)];
    const specific = system === SYSTEMS.PW
      ? [norm(record && record.state), norm(record && record.lastEmission), norm(record && record.fileName), norm(record && record.category), norm(record && record.sentGrd), normalizeDate(record && record.sentDate), norm(record && record.incomingGrd), normalizeDate(record && record.incomingDate), normalizeDate(record && record.createdAt), normalizeDate(record && record.stateChangedAt), norm(record && record.emissionSequence)]
      : [norm(record && record.status), norm(record && record.situation), norm(record && record.observation), normalizeDate(record && record.includedAt), normalizeDate(record && record.modifiedAt)];
    return [...common, ...specific].join("|");
  }

  function compactRecord(raw, system, universe, ldMatch) {
    const identity = documentIdentity(raw && raw.document);
    const cls = documentClass(raw && raw.document);
    const emissionFlag = norm(raw && raw.lastEmission);
    const emitted = system === SYSTEMS.PW ? ["SIM", "NAO"].includes(emissionFlag) : null;
    const match = ldMatch || null;
    return {
      system,
      document: text(raw && raw.document),
      documentKey: norm(identity.key),
      canonicalDocument: text(identity.canonical),
      documentClass: cls,
      revision: revisionOf(raw),
      version: versionOf(raw),
      title: text(raw && raw.title) || text(match && match.title),
      documentType: text(raw && raw.documentType) || text(match && match.documentType),
      discipline: text(raw && (raw.disciplineDesc || raw.discipline)) || text(match && match.discipline),
      tag: text(raw && raw.tag) || text(match && match.tag),
      eap: inferEap(raw, identity) || text(match && match.eap),
      status: statusOf(raw, system),
      date: dateOf(raw, system),
      includedAt: text(raw && raw.includedAt),
      modifiedAt: text(raw && raw.modifiedAt),
      createdAt: text(raw && raw.createdAt),
      stateChangedAt: text(raw && raw.stateChangedAt),
      lastEmission: text(raw && raw.lastEmission),
      emitted,
      fileName: text(raw && raw.fileName),
      category: text(raw && raw.category),
      sentGrd: text(raw && raw.sentGrd),
      sentDate: text(raw && raw.sentDate),
      incomingGrd: text(raw && raw.incomingGrd),
      incomingDate: text(raw && raw.incomingDate),
      emissionSequence: text(raw && raw.emissionSequence),
      sourceRow: Number(raw && raw.sourceRow) || 0,
      ldSource: text(match && match.source),
      ldSheet: text(match && match.sheet),
      ldRow: Number(match && match.row) || 0,
      ldPrazo: text(match && match.prazo),
      ldValidated: Boolean(universe && universe.available && match),
      occurrenceKey: occurrenceKey(raw, system),
      matchKey: matchKey(raw),
      technicalFingerprint: technicalFingerprint(raw, system),
    };
  }

  function rejectRecord(raw, system, reason) {
    return {
      system,
      document: text(raw && raw.document),
      revision: revisionOf(raw),
      documentType: text(raw && raw.documentType),
      status: statusOf(raw, system),
      discipline: text(raw && (raw.disciplineDesc || raw.discipline)),
      date: dateOf(raw, system),
      sourceRow: Number(raw && raw.sourceRow) || 0,
      reason: text(reason) || "fora_do_escopo_grcon",
    };
  }

  function prepareRecords(system, records, universe, options) {
    if (![SYSTEMS.SIGEM, SYSTEMS.PW].includes(system)) throw new Error("Sistema de evolução inválido.");
    const accepted = [];
    const rejected = [];
    const duplicates = [];
    const reasons = {};
    const exactSeen = new Map();
    const preRejected = Array.isArray(options && options.preRejected) ? options.preRejected : [];

    for (const raw of records || []) {
      if (!raw || !text(raw.document)) continue;
      const identity = documentIdentity(raw.document);
      const cls = documentClass(raw.document);
      const reason = scopeReason(raw, identity, cls, universe);
      if (reason) {
        const item = rejectRecord(raw, system, reason);
        rejected.push(item);
        reasons[reason] = (reasons[reason] || 0) + 1;
        continue;
      }
      const matches = findLdMatches(raw, universe);
      const compact = compactRecord(raw, system, universe, preferredLdMatch(matches));
      const exactKey = compact.technicalFingerprint;
      if (exactSeen.has(exactKey)) {
        duplicates.push({ ...compact, reason: "duplicidade_tecnica_exata", duplicateOfSourceRow: exactSeen.get(exactKey).sourceRow || 0 });
        continue;
      }
      exactSeen.set(exactKey, compact);
      accepted.push(compact);
    }

    for (const raw of preRejected) {
      const reason = text(raw && raw.reason) || "fora_do_escopo_grcon";
      rejected.push(rejectRecord(raw, system, reason));
      reasons[reason] = (reasons[reason] || 0) + 1;
    }

    accepted.sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey) || a.technicalFingerprint.localeCompare(b.technicalFingerprint));
    return { accepted, rejected, duplicates, reasons };
  }

  function classCounts(records) {
    const output = { ET: 0, "N-1710": 0, CV: 0 };
    for (const row of records || []) if (Object.prototype.hasOwnProperty.call(output, row.documentClass)) output[row.documentClass] += 1;
    return output;
  }
  function buildAudit(system, base, prepared, universe) {
    const meta = base && base.meta || {};
    const rawCount = Number(meta.sourceRowCount || meta.rawRecordCount || meta.recordCount || (base && base.records || []).length || 0);
    const parserInvalid = Math.max(0, Number(meta.baseInvalidCount ?? meta.invalidCount) || 0);
    const accepted = prepared.accepted.length;
    const scopeDiscarded = prepared.rejected.length;
    const technicalDuplicates = prepared.duplicates.length;
    const uniqueDocuments = new Set(prepared.accepted.map((row) => row.documentKey)).size;
    return {
      rawRecords: rawCount,
      acceptedRecords: accepted,
      discardedRecords: scopeDiscarded + parserInvalid,
      scopeDiscardedRecords: scopeDiscarded,
      parserInvalidRecords: parserInvalid,
      technicalDuplicates,
      uniqueDocuments,
      validRevisionRecords: accepted,
      classes: classCounts(prepared.accepted),
      discardReasons: { ...prepared.reasons },
      validationMode: universe && universe.available ? "ld" : "coding",
      ldDocuments: universe && universe.available ? universe.uniqueDocumentCount : 0,
      ldFingerprint: universe && universe.available ? universe.fingerprint : "",
    };
  }

  function sourceFingerprint(system, records) {
    return fingerprint((records || []).map((row) => `${row.occurrenceKey}::${row.technicalFingerprint}`), `evo-${system}`);
  }
  function buildSnapshot(system, base, universe, options) {
    if (!base || !base.meta || !Array.isArray(base.records)) throw new Error(`Base ${String(system || "").toUpperCase()} inválida para a evolução.`);
    const previousRejected = system === SYSTEMS.PW
      ? (base.meta.scopeDiscardedRecords || base.discardedRecords || (options && options.preRejected) || [])
      : ((options && options.preRejected) || []);
    const prepared = prepareRecords(system, base.records, universe, { preRejected: previousRejected });
    const contentFingerprint = sourceFingerprint(system, prepared.accepted);
    const snapshot = {
      id: text(options && options.snapshotId) || `${system}:${CALCULATION_VERSION}:${contentFingerprint}`,
      sourceSnapshotId: text(options && options.sourceSnapshotId) || text(options && options.snapshotId),
      system,
      calculationVersion: CALCULATION_VERSION,
      contentFingerprint,
      importedAt: text(base.meta.importedAt) || new Date().toISOString(),
      fileName: text(base.meta.fileName),
      fileSize: Number(base.meta.fileSize) || 0,
      lastModified: Number(base.meta.lastModified) || 0,
      sourceVersion: Number(base.meta.version) || 0,
      audit: buildAudit(system, base, prepared, universe),
      records: prepared.accepted,
      rejected: prepared.rejected,
      duplicates: prepared.duplicates,
    };
    return snapshot;
  }

  function groupBy(records, selector) {
    const map = new Map();
    for (const row of records || []) {
      const key = selector(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  }
  function consumeExact(previous, current) {
    const prevByFp = groupBy(previous, (row) => row.technicalFingerprint);
    const currByFp = groupBy(current, (row) => row.technicalFingerprint);
    const prevRemain = [];
    const currRemain = [];
    let exact = 0;
    const keys = new Set([...prevByFp.keys(), ...currByFp.keys()]);
    for (const key of keys) {
      const p = (prevByFp.get(key) || []).slice();
      const c = (currByFp.get(key) || []).slice();
      const matched = Math.min(p.length, c.length);
      exact += matched;
      prevRemain.push(...p.slice(matched));
      currRemain.push(...c.slice(matched));
    }
    return { exact, prevRemain, currRemain };
  }

  function compareRecords(previousRecords, currentRecords) {
    const previous = groupBy(previousRecords || [], (row) => row.occurrenceKey);
    const current = groupBy(currentRecords || [], (row) => row.occurrenceKey);
    const added = [];
    const removed = [];
    const metadataChanged = [];
    let remained = 0;
    const keys = new Set([...previous.keys(), ...current.keys()]);

    for (const key of keys) {
      const before = previous.get(key) || [];
      const after = current.get(key) || [];
      const exact = consumeExact(before, after);
      remained += exact.exact;
      const paired = Math.min(exact.prevRemain.length, exact.currRemain.length);
      for (let index = 0; index < paired; index += 1) {
        metadataChanged.push({ key, before: exact.prevRemain[index], after: exact.currRemain[index] });
      }
      remained += paired;
      if (exact.currRemain.length > paired) added.push(...exact.currRemain.slice(paired));
      if (exact.prevRemain.length > paired) removed.push(...exact.prevRemain.slice(paired));
    }

    const net = added.length - removed.length;
    return { added, removed, metadataChanged, remained, net, previousCount: (previousRecords || []).length, currentCount: (currentRecords || []).length };
  }

  function multisetMatch(leftRecords, rightRecords, selector) {
    const right = groupBy(rightRecords || [], selector);
    const matched = [];
    const leftOnly = [];
    const consumed = new Map();
    for (const row of leftRecords || []) {
      const key = selector(row);
      const list = right.get(key) || [];
      const used = consumed.get(key) || 0;
      if (used < list.length) {
        matched.push({ key, left: row, right: list[used] });
        consumed.set(key, used + 1);
      } else leftOnly.push(row);
    }
    const rightOnly = [];
    right.forEach((list, key) => {
      const used = consumed.get(key) || 0;
      rightOnly.push(...list.slice(used));
    });
    return { matched, leftOnly, rightOnly };
  }

  function classifyEvolution(sigemDelta, pwDelta, currentPwRecords) {
    const newSigem = sigemDelta && sigemDelta.added || [];
    const newPw = pwDelta && pwDelta.added || [];
    const movement = multisetMatch(newSigem, newPw, (row) => row.matchKey);
    const currentPresence = multisetMatch(newSigem, currentPwRecords || [], (row) => row.matchKey);
    return {
      newInBoth: movement.matched.map((pair) => ({ ...pair.left, matchedPw: pair.right })),
      newSigemNotNewPw: movement.leftOnly,
      newPwWithoutSigemMovement: movement.rightOnly,
      newSigemAlreadyInPw: currentPresence.matched.map((pair) => ({ ...pair.left, matchedPw: pair.right })),
      newSigemMissingPw: currentPresence.leftOnly,
    };
  }

  function compareSnapshots(previousSnapshot, currentSnapshot) {
    if (!previousSnapshot || !currentSnapshot) return null;
    if (previousSnapshot.system !== currentSnapshot.system) throw new Error("Snapshots de sistemas diferentes não podem ser comparados entre si.");
    return {
      system: currentSnapshot.system,
      previousSnapshotId: previousSnapshot.id,
      currentSnapshotId: currentSnapshot.id,
      ...compareRecords(previousSnapshot.records || [], currentSnapshot.records || []),
    };
  }

  function comparePeriod(sigemPrevious, sigemCurrent, pwPrevious, pwCurrent) {
    const sigem = sigemPrevious && sigemCurrent ? compareSnapshots(sigemPrevious, sigemCurrent) : null;
    const pw = pwPrevious && pwCurrent ? compareSnapshots(pwPrevious, pwCurrent) : null;
    const relation = classifyEvolution(sigem, pw, pwCurrent && pwCurrent.records || []);
    return { sigem, pw, relation };
  }

  return Object.freeze({
    CALCULATION_VERSION, VALID_CLASSES, SYSTEMS,
    text, norm, normalizeRevision, normalizeDate, fingerprint,
    documentIdentity, documentClass, inferEap, searchKeysFor,
    buildLdUniverse, findLdMatches, occurrenceKey, matchKey, technicalFingerprint,
    prepareRecords, buildAudit, sourceFingerprint, buildSnapshot,
    compareRecords, multisetMatch, classifyEvolution, compareSnapshots, comparePeriod,
  });
});
