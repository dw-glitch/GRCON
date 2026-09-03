(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingConferenceRefinement = api;
  if (typeof window !== "undefined" && root === window) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MARKER = Symbol("grconPostingConferenceRefined");
  const PAGE_SIZE = 80;
  let installed = false;
  let decorating = false;
  let decorationQueued = false;

  function rawText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function trimmed(value) {
    return rawText(value).trim();
  }

  function conferenceLabel(status, Conference) {
    const S = Conference && Conference.STATUSES || {};
    if (status === S.CONFIRMED) return "Postado";
    if (status === S.AWAITING || status === S.NOT_FOUND) return "Não postado ainda";
    return Conference && typeof Conference.statusLabel === "function"
      ? Conference.statusLabel(status)
      : trimmed(status) || "Não verificado";
  }

  function matchedBaseRecords(row, baseRecords, Conference, baseIndex) {
    if (!row || !Conference || !Array.isArray(baseRecords) || !baseRecords.length) return [];
    const index = baseIndex || Conference.buildBaseIndex(baseRecords);
    const positions = new Set();
    (row.searchKeys || Conference.documentKeys(row.document) || []).forEach((searchKey) => {
      (index.get(Conference.norm(searchKey)) || []).forEach((position) => positions.add(position));
    });
    return [...positions].map((position) => baseRecords[position]).filter(Boolean);
  }

  function exactStatusRecord(row, baseRecords, Conference, baseIndex) {
    if (!row || !row.currentEvidence) return null;
    const sent = Conference.normalizeRevision(row.revisionSent);
    if (!sent) return null;
    const exact = matchedBaseRecords(row, baseRecords, Conference, baseIndex)
      .filter((record) => Conference.normalizeRevision(record.revision) === sent);
    return exact.length === 1 ? exact[0] : null;
  }

  function enrichRows(rows, baseRecords, Conference) {
    const base = Array.isArray(baseRecords) ? baseRecords : [];
    const index = Conference && typeof Conference.buildBaseIndex === "function" ? Conference.buildBaseIndex(base) : null;
    return (rows || []).map((row) => {
      const exact = exactStatusRecord(row, base, Conference, index);
      return {
        ...row,
        conferenceLabel: conferenceLabel(row.status, Conference),
        sigemStatus: exact ? rawText(exact.status) : "",
      };
    });
  }

  function enrichResult(result, baseRecords, Conference) {
    if (!result || typeof result !== "object") return result;
    return { ...result, rows: enrichRows(result.rows || [], baseRecords || [], Conference) };
  }

  function locateExactStatusColumn(matrix, Conference) {
    const detection = Conference.detectColumns(matrix, 40);
    if (!detection) return null;
    const header = matrix[detection.rowIndex] || [];
    let statusIndex = -1;
    for (let index = 0; index < header.length; index += 1) {
      if (Conference.normalizeHeader(header[index]) === "STATUS") {
        statusIndex = index;
        break;
      }
    }
    return statusIndex >= 0 ? { detection, statusIndex } : null;
  }

  function repairParsedStatuses(workbook, parsed, Conference) {
    if (!workbook || !parsed || !Array.isArray(parsed.records) || !root.XLSX?.utils?.sheet_to_json) return parsed;
    const sheetName = trimmed(parsed.meta && parsed.meta.sheetName) || workbook.SheetNames?.[0];
    const sheet = workbook.Sheets && workbook.Sheets[sheetName];
    if (!sheet) return parsed;
    const matrix = root.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
    const located = locateExactStatusColumn(matrix, Conference);
    if (!located) return parsed;

    const { detection, statusIndex } = located;
    const byDocumentRevision = new Map();
    matrix.slice(detection.rowIndex + 1).forEach((row) => {
      const document = trimmed(Array.isArray(row) ? row[detection.columns.document] : "");
      const revision = Conference.normalizeRevision(Array.isArray(row) ? row[detection.columns.revision] : "");
      if (!document) return;
      const identity = Conference.documentIdentity(document);
      const key = `${identity}|${revision}`;
      const status = rawText(Array.isArray(row) ? row[statusIndex] : "");
      if (!byDocumentRevision.has(key) || (!trimmed(byDocumentRevision.get(key)) && trimmed(status))) {
        byDocumentRevision.set(key, status);
      }
    });

    const records = parsed.records.map((record) => {
      const key = `${record.documentIdentity || Conference.documentIdentity(record.document)}|${Conference.normalizeRevision(record.revision)}`;
      return byDocumentRevision.has(key) ? { ...record, status: byDocumentRevision.get(key) } : record;
    });
    const headers = matrix[detection.rowIndex] || [];
    return {
      ...parsed,
      records,
      meta: {
        ...(parsed.meta || {}),
        columns: { ...(parsed.meta && parsed.meta.columns || {}), status: rawText(headers[statusIndex]) || "STATUS" },
      },
    };
  }

  function wrapConference(original) {
    if (!original || original[MARKER]) return original;
    const wrapped = {
      ...original,
      reconcile(historyRecords, baseRecords, previousState, options) {
        return enrichResult(original.reconcile(historyRecords, baseRecords, previousState, options), baseRecords || [], wrapped);
      },
      async reconcilePersisted(historyRecords, options) {
        const result = await original.reconcilePersisted(historyRecords, options);
        const base = await original.loadBase();
        return enrichResult(result, base && base.records || [], wrapped);
      },
      async importWorkbook(workbook, fileMeta, historyRecords, options) {
        let result = await original.importWorkbook(workbook, fileMeta, historyRecords, options);
        const repaired = repairParsedStatuses(workbook, result.parsed, wrapped);
        if (repaired !== result.parsed) {
          await original.saveBase({ meta: repaired.meta, records: repaired.records });
          result = { ...result, parsed: repaired };
        }
        return enrichResult(result, repaired.records || [], wrapped);
      },
      filterRows(rows, filters) {
        const sourceFilters = { ...(filters || {}) };
        const search = trimmed(sourceFilters.search);
        sourceFilters.search = "";
        let result = original.filterRows(rows, sourceFilters);
        if (!search) return result;
        const wanted = original.norm(search);
        result = result.filter((row) => original.norm([
          row.document, row.egrdtNumber, row.discipline, row.documentFamily,
          row.revisionSent, row.revisionFound, row.conferenceLabel || row.statusLabel,
          row.sigemStatus, row.note,
        ].join(" ")).includes(wanted));
        return result;
      },
    };
    Object.defineProperty(wrapped, MARKER, { value: true, enumerable: false });
    return Object.freeze(wrapped);
  }

  function installConferenceWrapper() {
    let value = root.GrconPostingConference;
    const descriptor = Object.getOwnPropertyDescriptor(root, "GrconPostingConference");
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(root, "GrconPostingConference", {
        configurable: true,
        enumerable: true,
        get() { return value; },
        set(next) { value = wrapConference(next); },
      });
      if (value) value = wrapConference(value);
      return;
    }
    if (value && !value[MARKER] && descriptor.writable) root.GrconPostingConference = wrapConference(value);
  }

  function visibleRows() {
    const ui = root.GrconPostingConferenceUi;
    const Conference = root.GrconPostingConference;
    if (!ui?.state || !Conference) return [];
    let rows = Conference.filterRows(ui.state.result?.rows || [], ui.state.filters || {});
    if (ui.state.view === "pending") rows = Conference.pendingRows(rows);
    const page = Math.max(1, Number(ui.state.page) || 1);
    return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  function ensureSigemCell(statusCell, row) {
    let cell = statusCell.nextElementSibling;
    if (!cell || !cell.classList.contains("pc-sigem-cell")) {
      cell = document.createElement("td");
      cell.className = "pc-sigem-cell";
      statusCell.insertAdjacentElement("afterend", cell);
    }
    cell.textContent = "";
    const badge = document.createElement("span");
    badge.className = "pc-sigem-status";
    badge.textContent = rawText(row && row.sigemStatus) || "—";
    cell.appendChild(badge);
  }

  function decorateDocumentTable(module) {
    const table = module.querySelector(".pc-table:not(.pc-grdt-table)");
    if (!table) return;
    const headings = [...table.querySelectorAll("thead th")];
    const conferenceIndex = headings.findIndex((th) => /^(Situação|Conferência)$/i.test(trimmed(th.textContent)));
    if (conferenceIndex < 0) return;
    const conferenceHeading = headings[conferenceIndex];
    conferenceHeading.textContent = "Conferência";
    let sigemHeading = conferenceHeading.nextElementSibling;
    if (!sigemHeading || !sigemHeading.classList.contains("pc-sigem-heading")) {
      sigemHeading = document.createElement("th");
      sigemHeading.className = "pc-sigem-heading";
      conferenceHeading.insertAdjacentElement("afterend", sigemHeading);
    }
    sigemHeading.textContent = "Status SIGEM";

    const rows = visibleRows();
    [...table.querySelectorAll("tbody tr")].forEach((tr, index) => {
      const row = rows[index];
      const cells = [...tr.children].filter((node) => node.tagName === "TD");
      const statusCell = cells[conferenceIndex];
      if (!statusCell) return;
      const chip = statusCell.querySelector(".pc-status");
      if (chip && row) chip.textContent = row.conferenceLabel || conferenceLabel(row.status, root.GrconPostingConference);
      ensureSigemCell(statusCell, row);
    });
  }

  function decorateLabels(module) {
    module.querySelectorAll("#pc-kpis span").forEach((node) => {
      if (trimmed(node.textContent) === "Aguardando confirmação") node.textContent = "Não postado ainda";
    });
    module.querySelectorAll("#pc-status option").forEach((option) => {
      const Conference = root.GrconPostingConference;
      if (!Conference) return;
      if (option.value === Conference.STATUSES.CONFIRMED) option.textContent = "Postado";
      if (option.value === Conference.STATUSES.AWAITING) option.textContent = "Não postado ainda";
    });
  }

  function decorate() {
    if (decorating) return;
    const module = document.getElementById("posting-conference-module");
    if (!module) return;
    decorating = true;
    decorateLabels(module);
    if (root.GrconPostingConferenceUi?.state?.view !== "grdts") decorateDocumentTable(module);
    setTimeout(() => { decorating = false; }, 0);
  }

  function scheduleDecorate() {
    if (decorating || decorationQueued) return;
    decorationQueued = true;
    const run = () => {
      decorationQueued = false;
      decorate();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function installDomRefinement() {
    const observer = new MutationObserver(() => scheduleDecorate());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    root.addEventListener("grcon:conference-updated", scheduleDecorate);
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-pc-view],#pc-prev,#pc-next,#pc-clear-filters")) setTimeout(scheduleDecorate, 0);
    });
    scheduleDecorate();
  }

  function install() {
    if (installed) return;
    installed = true;
    installConferenceWrapper();
    if (typeof document !== "undefined") installDomRefinement();
  }

  return Object.freeze({
    install,
    conferenceLabel,
    enrichRows,
    enrichResult,
    locateExactStatusColumn,
    repairParsedStatuses,
    wrapConference,
  });
});
