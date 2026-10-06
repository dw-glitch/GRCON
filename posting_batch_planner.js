(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconPostingBatchPlanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const normalizeMode = value => value === "separate" ? "separate" : "mixed";
  function split(plan, limit, disciplineMode, postingMode, splitDiscipline) {
    const mode = normalizeMode(postingMode);
    const source = plan.entries || [];
    const positions = new Map(source.map((entry, index) => [entry, index]));
    const buckets = new Map();
    for (const entry of source) {
      const kind = entry.historyClassification?.emissionKind;
      // Unknown history remains selectable and is visibly kept separate when requested.
      const group = mode === "mixed" ? "MIXED" : kind === "REPOST" ? "REPOST" : kind ? "POSTING" : "UNCONFIRMED";
      if (!buckets.has(group)) buckets.set(group, []);
      buckets.get(group).push(entry);
    }
    const groups = [];
    for (const [postingGroup, entries] of buckets) {
      const split = splitDiscipline({ ...plan, entries, items: entries.map(entry => entry.item) }, limit, disciplineMode);
      for (const group of split) {
        groups.push({ ...group, number: groups.length + 1, postingMode: mode, postingGroup,
          originalIndices: group.entries.map(entry => positions.get(entry)),
          postingCounts: group.entries.reduce((counts, entry) => {
            const kind = entry.historyClassification?.emissionKind || "UNCONFIRMED";
            counts[kind] = (counts[kind] || 0) + 1;
            return counts;
          }, {}),
        });
      }
    }
    let start = 0;
    for (const group of groups) { group.startIndex = start; group.endIndex = start + group.entries.length - 1; start += group.entries.length; }
    return groups;
  }
  return Object.freeze({ normalizeMode, split });
});
