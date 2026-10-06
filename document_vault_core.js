(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GrconDocumentVaultCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ARCHIVE_EXTENSIONS = Object.freeze(["zip", "rar", "7z", "tar", "gz"]);

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function fileParts(value) {
    const clean = text(value).split(/[\\/]/).pop() || "";
    const dot = clean.lastIndexOf(".");
    const suffix = dot > 0 ? clean.slice(dot + 1) : "";
    const hasFileExtension = dot > 0 && /^[A-Za-z0-9]{1,20}$/.test(suffix);
    return {
      clean,
      stem: hasFileExtension ? clean.slice(0, dot) : clean,
      format: hasFileExtension ? suffix.toLowerCase() : "",
    };
  }

  function normalizeRevision(value) {
    const raw = text(value).toUpperCase().replace(/^REV(?:ISÃO|ISAO)?\.?\s*/i, "");
    if (!raw) return "";
    if (/^0+$/.test(raw)) return "0";
    return raw;
  }

  function normalizeDocumentCode(value) {
    return text(value).replace(/\s+/g, "").toUpperCase();
  }

  function identityCode(value) {
    return normalizeDocumentCode(value).replace(/^NT-/i, "");
  }

  function isRevisionToken(value) {
    const token = normalizeRevision(value);
    if (!token || token === "RIR") return false;
    return token === "0"
      || /^#[1-9]\d*$/.test(token)
      || /^0[1-9]\d*$/.test(token)
      || /^[1-9]\d*$/.test(token)
      || /^[A-Z]{1,3}\d*$/.test(token);
  }

  function splitRevision(stem) {
    const raw = text(stem);
    if (!raw) return { documentCode: "", revision: "", explicitRevision: false };

    let match = raw.match(/^(.+?)_0001_(.+)$/i);
    if (match && isRevisionToken(match[2])) {
      return {
        documentCode: normalizeDocumentCode(match[1]),
        revision: normalizeRevision(match[2]),
        explicitRevision: true,
        sequence: "0001",
      };
    }

    match = raw.match(/^(.+?)_0001(?:_RIR)?$/i);
    if (match) {
      return {
        documentCode: normalizeDocumentCode(match[1]),
        revision: "",
        explicitRevision: false,
        sequence: "0001",
        operationalSuffix: /_RIR$/i.test(raw) ? "RIR" : "",
      };
    }

    match = raw.match(/^(.+?)[_ -]REV(?:ISAO|ISÃO)?[_ -]?(.+)$/i);
    if (match && isRevisionToken(match[2])) {
      return {
        documentCode: normalizeDocumentCode(match[1]),
        revision: normalizeRevision(match[2]),
        explicitRevision: true,
      };
    }

    match = raw.match(/^(.+?)_([^_]+)$/);
    if (match && isRevisionToken(match[2])) {
      return {
        documentCode: normalizeDocumentCode(match[1]),
        revision: normalizeRevision(match[2]),
        explicitRevision: true,
      };
    }

    return {
      documentCode: normalizeDocumentCode(raw),
      revision: "",
      explicitRevision: false,
    };
  }

  function isArchiveFileName(fileName) {
    return ARCHIVE_EXTENSIONS.includes(fileParts(fileName).format);
  }

  function parseStoredFileIdentity(fileName) {
    const parts = fileParts(fileName);
    if (!parts.stem) {
      return { documentCode: "", revision: "", format: parts.format, inferred: false, ignored: false, explicitRevision: false };
    }
    const split = splitRevision(parts.stem);
    return {
      documentCode: split.documentCode,
      revision: split.explicitRevision ? split.revision : "0",
      format: parts.format,
      inferred: Boolean(split.documentCode),
      ignored: isArchiveFileName(fileName),
      explicitRevision: split.explicitRevision,
    };
  }

  function parseLookupInput(value) {
    const parts = fileParts(value);
    const split = splitRevision(parts.stem || parts.clean);
    return {
      input: text(value),
      documentCode: split.documentCode,
      identityCode: identityCode(split.documentCode),
      revision: split.explicitRevision ? split.revision : "",
      explicitRevision: split.explicitRevision,
    };
  }

  function parseLookupText(value) {
    const seen = new Set();
    const items = [];
    text(value).split(/\r?\n/).forEach((line, index) => {
      const parsed = parseLookupInput(line);
      if (!parsed.documentCode) return;
      const key = parsed.identityCode + "\u0000" + parsed.revision;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ ...parsed, requestId: String(index + 1) });
    });
    return items;
  }

  function groupMatchesByRevision(matches) {
    const groups = new Map();
    (Array.isArray(matches) ? matches : []).forEach((item) => {
      const revision = normalizeRevision(item && item.revision) || "0";
      if (!groups.has(revision)) groups.set(revision, []);
      groups.get(revision).push(item);
    });
    return Array.from(groups.entries()).map(([revision, files]) => ({ revision, files }));
  }

  function resolveLookupSelection(result) {
    const groups = groupMatchesByRevision(result && result.matches);
    const requested = normalizeRevision(result && result.requestedRevision);
    let selectedRevision = "";
    if (requested && groups.some(group => group.revision === requested)) selectedRevision = requested;
    else if (!requested && groups.length === 1) selectedRevision = groups[0].revision;
    return {
      groups,
      revisions: groups.map(group => group.revision),
      selectedRevision,
      found: groups.length > 0,
      needsRevisionChoice: !requested && groups.length > 1,
    };
  }

  return Object.freeze({
    ARCHIVE_EXTENSIONS,
    text,
    fileParts,
    normalizeRevision,
    normalizeDocumentCode,
    identityCode,
    isRevisionToken,
    isArchiveFileName,
    parseStoredFileIdentity,
    parseLookupInput,
    parseLookupText,
    groupMatchesByRevision,
    resolveLookupSelection,
  });
});
