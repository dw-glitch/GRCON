(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NormativeApplicability = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—]/g, "-")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function list(value) {
    if (Array.isArray(value)) return value.map(norm).filter(Boolean);
    const normalized = norm(value);
    return normalized ? [normalized] : [];
  }

  function normalizeContext(context) {
    const source = context || {};
    return {
      document: text(source.document),
      documentCategory: norm(source.documentCategory || source.category || source.documentType),
      documentType: norm(source.documentType || source.category),
      discipline: norm(source.discipline),
      phase: norm(source.phase),
      installation: norm(source.installation),
      project: norm(source.project),
      sheetFamily: norm(source.sheetFamily || source.sheet),
      isN1710: Boolean(source.isN1710),
      purpose: norm(source.purpose),
      source,
    };
  }

  function scalarMatches(allowed, actual) {
    const values = list(allowed);
    if (!values.length || values.includes("*")) return true;
    return values.includes(norm(actual));
  }

  function matches(applicability, context) {
    const rule = applicability || {};
    if (rule.enabled === false) return false;
    const ctx = normalizeContext(context);
    if (rule.n1710Only && !ctx.isN1710) return false;
    if (!scalarMatches(rule.disciplines || rule.discipline, ctx.discipline)) return false;
    if (!scalarMatches(rule.documentCategories || rule.categories, ctx.documentCategory)) return false;
    if (!scalarMatches(rule.documentTypes, ctx.documentType)) return false;
    if (!scalarMatches(rule.phases, ctx.phase)) return false;
    if (!scalarMatches(rule.installations, ctx.installation)) return false;
    if (!scalarMatches(rule.projects, ctx.project)) return false;
    if (!scalarMatches(rule.sheetFamilies, ctx.sheetFamily)) return false;
    if (!scalarMatches(rule.purposes, ctx.purpose)) return false;
    return true;
  }

  function explain(applicability, context) {
    const ctx = normalizeContext(context);
    const rule = applicability || {};
    const reasons = [];
    if (rule.enabled === false) reasons.push("regra desabilitada");
    if (rule.n1710Only && !ctx.isN1710) reasons.push("fora do contexto N-1710");
    if (!scalarMatches(rule.disciplines || rule.discipline, ctx.discipline)) reasons.push("disciplina fora do escopo");
    if (!scalarMatches(rule.documentCategories || rule.categories, ctx.documentCategory)) reasons.push("categoria documental fora do escopo");
    if (!scalarMatches(rule.documentTypes, ctx.documentType)) reasons.push("tipo documental fora do escopo");
    if (!scalarMatches(rule.phases, ctx.phase)) reasons.push("fase fora do escopo");
    if (!scalarMatches(rule.installations, ctx.installation)) reasons.push("instalação fora do escopo");
    if (!scalarMatches(rule.projects, ctx.project)) reasons.push("projeto fora do escopo");
    if (!scalarMatches(rule.sheetFamilies, ctx.sheetFamily)) reasons.push("família/aba fora do escopo");
    if (!scalarMatches(rule.purposes, ctx.purpose)) reasons.push("propósito fora do escopo");
    return { applies: reasons.length === 0, reasons, context: ctx };
  }

  return { text, norm, list, normalizeContext, scalarMatches, matches, explain };
});
