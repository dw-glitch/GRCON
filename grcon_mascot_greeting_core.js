/* GRCON — regras puras da saudação do Mascote da Qualidade. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GRCONMascotGreetingCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeName(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function firstName(value) {
    const normalized = normalizeName(value);
    return normalized ? normalized.split(" ")[0] : "";
  }

  function resolveFirstName(identity) {
    const source = identity || {};
    const candidates = [
      source.displayName,
      source.profileName,
      source.metadataName,
      source.fullName,
      source.name,
    ];
    for (const candidate of candidates) {
      const resolved = firstName(candidate);
      if (resolved) return resolved;
    }
    return "";
  }

  function greeting(identity) {
    const name = resolveFirstName(identity);
    return name ? `Olá, ${name}!` : "Olá!";
  }

  return Object.freeze({ normalizeName, firstName, resolveFirstName, greeting });
});
