(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceStatusRule = api;
  if (typeof window !== "undefined" && root === window) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MARKER = Symbol("grconPostingConferenceStatusRule");
  let installed = false;

  function rawText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function isPostedSigemStatus(value, Conference) {
    return Boolean(Conference && typeof Conference.isPostedSigemStatus === "function"
      ? Conference.isPostedSigemStatus(value)
      : false);
  }

  function revisionProvesPosting(foundRevision, sentRevision, Conference) {
    const found = Conference.normalizeRevision(foundRevision);
    const sent = Conference.normalizeRevision(sentRevision);
    return Boolean(found && sent && found === sent);
  }

  function matchedRecords(row, baseRecords, Conference, baseIndex) {
    if (!row || !Conference || !Array.isArray(baseRecords) || !baseRecords.length) return [];
    const index = baseIndex || Conference.buildBaseIndex(baseRecords);
    const positions = new Set();
    const searchKeys = Array.isArray(row.searchKeys) && row.searchKeys.length
      ? row.searchKeys
      : Conference.documentKeys(row.document);
    searchKeys.forEach((searchKey) => {
      (index.get(Conference.norm(searchKey)) || []).forEach((position) => positions.add(position));
    });
    return [...positions].map((position) => baseRecords[position]).filter(Boolean);
  }

  function postingEvidence(row, baseRecords, Conference, baseIndex) {
    if (!Conference || typeof Conference.resolvePostingEvidence !== "function") return null;
    const matched = matchedRecords(row, baseRecords, Conference, baseIndex);
    const resolved = Conference.resolvePostingEvidence(row, matched);
    return resolved && resolved.currentEvidence ? resolved.evidence : null;
  }

  function applyResult(result) {
    // Compatibility facade only. The core is the single source of truth for
    // posting evidence and status; this layer must never promote/downgrade.
    return result;
  }

  function wrapConference(original) {
    // Keep the historical module contract without adding a second decision engine.
    return original;
  }

  function install() {
    if (installed) return;
    installed = true;
    const previous = Object.getOwnPropertyDescriptor(root, "GrconPostingConference");
    let localValue = previous && Object.prototype.hasOwnProperty.call(previous, "value") ? previous.value : root.GrconPostingConference;
    if (!previous || previous.configurable) {
      if (!previous || !previous.get) localValue = wrapConference(localValue);
      Object.defineProperty(root, "GrconPostingConference", {
        configurable: true,
        enumerable: true,
        get() {
          const value = previous && previous.get ? previous.get.call(root) : localValue;
          return wrapConference(value);
        },
        set(next) {
          const wrapped = wrapConference(next);
          if (previous && previous.set) previous.set.call(root, wrapped);
          else localValue = wrapped;
        },
      });
      return;
    }
    if (root.GrconPostingConference && previous.writable) root.GrconPostingConference = wrapConference(root.GrconPostingConference);
  }

  return Object.freeze({
    install,
    wrapConference,
    applyResult,
    postingEvidence,
    isPostedSigemStatus,
    revisionProvesPosting,
  });
});
