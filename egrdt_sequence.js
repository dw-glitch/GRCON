(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconEgrdtSequenceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREFIX = "0130870-C1O-PGV-G";
  const START = 1;

  function operationalYear(date) {
    const value = date instanceof Date ? date : new Date(date === undefined ? Date.now() : date);
    const year = value.getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("Ano operacional inválido.");
    return year;
  }

  function parse(value) {
    const match = String(value || "").match(/0130870-C1O-PGV-G-(\d{4})-(\d{4})\s*-\s*eGRDT/i);
    if (!match) return null;
    const sequence = Number(match[1]);
    const year = Number(match[2]);
    if (!Number.isInteger(sequence) || sequence < START || !Number.isInteger(year)) return null;
    return { sequence, sequenceText: String(sequence).padStart(4, "0"), year };
  }

  function sequenceFrom(value, year) {
    const parsed = parse(value);
    return parsed && parsed.year === Number(year) ? parsed.sequence : 0;
  }

  function largestForYear(records, year) {
    return (records || []).reduce((largest, record) => {
      const raw = typeof record === "string" ? record : record && record.grdt;
      return Math.max(largest, sequenceFrom(raw, year));
    }, START - 1);
  }

  function storageKey(year) {
    return `grcon.egrdt.sequence.v4.${Number(year)}`;
  }

  function baseName(sequence, year) {
    return `${PREFIX}-${String(Number(sequence)).padStart(4, "0")}-${Number(year)} - eGRDT`;
  }

  function next(options) {
    const settings = options || {};
    const year = Number(settings.year);
    const largest = Math.max(START - 1, Number(settings.ldSequence) || 0, Number(settings.localSequence) || 0);
    const sequence = Math.max(START, largest + 1) + Math.max(0, Number(settings.offset) || 0);
    return { sequence, sequenceText: String(sequence).padStart(4, "0"), year, baseName: baseName(sequence, year) };
  }

  function simultaneousUseWarning() {
    return "O número não é reservado entre computadores. Confirme na fonte oficial se outra eGRDT foi emitida antes de concluir.";
  }

  return Object.freeze({ PREFIX, START, operationalYear, parse, sequenceFrom, largestForYear, storageKey, baseName, next, simultaneousUseWarning });
});
