(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./normative_applicability.js"), require("./normative_version_registry.js"));
  } else {
    root.NormativeRegistry = factory(root.NormativeApplicability, root.NormativeVersionRegistry);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Applicability, VersionRegistry) {
  "use strict";

  const RULE_TYPES = Object.freeze(["mandatory", "recommended", "contractual", "operational", "informational"]);
  const SEVERITIES = Object.freeze(["critical", "high", "medium", "low", "info"]);
  const PROMOTION_STATES = Object.freeze(["candidate", "active", "superseded", "disabled"]);

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function norm(value) {
    return Applicability && Applicability.norm
      ? Applicability.norm(value)
      : text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  }

  function freezeRule(rule) {
    const source = rule && rule.source || {};
    const applicability = rule && rule.applicability || {};
    return Object.freeze({
      ruleId: text(rule && rule.ruleId),
      norma: text(rule && rule.norma),
      revision: text(rule && rule.revision),
      section: text(rule && rule.section),
      title: text(rule && rule.title),
      description: text(rule && rule.description),
      type: RULE_TYPES.includes(text(rule && rule.type)) ? text(rule.type) : "informational",
      severity: SEVERITIES.includes(text(rule && rule.severity)) ? text(rule.severity) : "info",
      applicability: Object.freeze({ ...applicability }),
      discipline: Array.isArray(rule && rule.discipline) ? [...rule.discipline] : rule && rule.discipline || [],
      documentCategory: Array.isArray(rule && rule.documentCategory) ? [...rule.documentCategory] : rule && rule.documentCategory || [],
      effectiveDate: text(rule && rule.effectiveDate),
      source: Object.freeze({
        file: text(source.file),
        page: Number(source.page) || 0,
        section: text(source.section || rule && rule.section),
        note: text(source.note),
      }),
      sourceStatus: text(rule && rule.sourceStatus) || "file-confirmed",
      normStatus: text(rule && rule.normStatus) || "catalog-unconfirmed",
      promotionState: PROMOTION_STATES.includes(text(rule && rule.promotionState)) ? text(rule.promotionState) : "candidate",
      validatorId: text(rule && rule.validatorId),
      overrideAllowed: Boolean(rule && rule.overrideAllowed),
      correctionHint: text(rule && rule.correctionHint),
    });
  }

  const BASE_NORMS = Object.freeze([
    Object.freeze({
      normId: "PETROBRAS-N-2064",
      norma: "N-2064",
      revision: "C",
      editionDate: "2003-08",
      amendmentDate: "2014-02",
      effectiveDate: "2003-08",
      title: "Emissão e Revisão de Documentos de Projeto",
      classification: "Normas Gerais de Projeto",
      sourceFile: "420369210-N-2064-pdf.pdf",
      sourceStatus: "file-confirmed",
      catalogRevision: "D",
      catalogDate: "2024-07",
      notes: "Arquivo local Rev. C diverge do catálogo oficial PETROBRAS Jul/2024, que registra N-2064 Rev. D (out/2017). Nunca promover regras desta Rev. C para bloqueio sem reconciliar a Rev. D.",
    }),
    Object.freeze({
      normId: "PETROBRAS-N-1710",
      norma: "N-1710",
      revision: "N",
      editionDate: "2020-04",
      effectiveDate: "2020-04",
      title: "Codificação de Documentos Técnicos de Engenharia",
      classification: "Normas Gerais de Projeto",
      sourceFile: "N-1710.pdf",
      sourceStatus: "file-confirmed",
      catalogRevision: "",
      catalogDate: "",
      notes: "Arquivo confirmado; anexos devem ser versionados separadamente quando catalogados.",
    }),
    Object.freeze({
      normId: "PETROBRAS-N-381",
      norma: "N-381",
      revision: "M",
      editionDate: "2022-05",
      effectiveDate: "2022-05",
      title: "Formulários para Emissão de Documentos Técnicos de Engenharia",
      classification: "Normas Gerais de Projeto",
      sourceFile: "N-0381 - REVISÃO M.pdf",
      sourceStatus: "file-confirmed",
      catalogRevision: "",
      catalogDate: "",
      notes: "Arquivo confirmado; vigência contratual depende do empreendimento/contrato.",
    }),
    Object.freeze({
      normId: "ET-5290.00-22000-912-1LV-001",
      norma: "ET-5290.00-22000-912-1LV-001",
      revision: "P",
      editionDate: "2026-06-17",
      effectiveDate: "2026-06-17",
      title: "Definição de Codificação de Documentos",
      classification: "Especificação Técnica de projeto — RNEST",
      sourceFile: "ET-5290.00-22000-912-1LV-001 - DEFINIÇÃO DE CODIFICAÇÃO DE DOCUMENTOS - Rev. P(8).pdf",
      sourceStatus: "file-confirmed",
      catalogRevision: "",
      catalogDate: "",
      explicitStatus: "source-confirmed",
      notes: "Fonte específica do projeto RNEST; não aplicar fora desse projeto.",
    }),
  ]);

  const BASE_RULES = Object.freeze([
    freezeRule({
      ruleId: "N2064-4.1.1-ORIGINAL-REV0",
      norma: "N-2064",
      revision: "C",
      section: "4.1.1",
      title: "Emissão original em revisão 0",
      description: "A emissão original de documento de projeto é identificada como revisão 0.",
      type: "mandatory",
      severity: "high",
      applicability: {},
      effectiveDate: "2003-08",
      source: { file: "420369210-N-2064-pdf.pdf", page: 5, section: "4.1.1" },
      normStatus: "catalog-mismatch",
      promotionState: "candidate",
      validatorId: "revision.original.zero",
      correctionHint: "Confirme se é primeira emissão; quando for, use revisão 0.",
    }),
    freezeRule({
      ruleId: "N2064-4.2.1-REVISION-ALPHABET",
      norma: "N-2064",
      revision: "C",
      section: "4.2.1",
      title: "Sequência alfabética sem I/O",
      description: "Revisões alfabéticas usam letras maiúsculas e excluem I e O.",
      type: "mandatory",
      severity: "high",
      applicability: {},
      effectiveDate: "2003-08",
      source: { file: "420369210-N-2064-pdf.pdf", page: 6, section: "4.2.1" },
      normStatus: "catalog-mismatch",
      promotionState: "candidate",
      validatorId: "revision.alphabet",
      correctionHint: "Use 0 ou a sequência alfabética válida sem I/O.",
    }),
    freezeRule({
      ruleId: "N2064-4.2.2-REVISION-AFTER-Z",
      norma: "N-2064",
      revision: "C",
      section: "4.2.2",
      title: "Sequência após Z",
      description: "Após Z, a revisão continua em AA, AB e sequências equivalentes.",
      type: "mandatory",
      severity: "high",
      applicability: {},
      effectiveDate: "2003-08",
      source: { file: "420369210-N-2064-pdf.pdf", page: 6, section: "4.2.2" },
      normStatus: "catalog-mismatch",
      promotionState: "candidate",
      validatorId: "revision.sequence",
    }),
    freezeRule({
      ruleId: "N2064-4.2.3-FIELD-REVISION",
      norma: "N-2064",
      revision: "C",
      section: "4.2.3",
      title: "Revisão de campo",
      description: "Revisões de campo acrescentam algarismo à última revisão controlada.",
      type: "mandatory",
      severity: "medium",
      applicability: {},
      effectiveDate: "2003-08",
      source: { file: "420369210-N-2064-pdf.pdf", page: 6, section: "4.2.3" },
      normStatus: "catalog-mismatch",
      promotionState: "candidate",
      validatorId: "revision.field",
    }),
    freezeRule({
      ruleId: "N2064-5.1-PURPOSE-CHANGE-IS-REVISION",
      norma: "N-2064",
      revision: "C",
      section: "5.1",
      title: "Mudança de finalidade caracteriza revisão",
      description: "Alterar a finalidade específica de emissão caracteriza revisão do documento.",
      type: "mandatory",
      severity: "high",
      applicability: {},
      effectiveDate: "2003-08",
      source: { file: "420369210-N-2064-pdf.pdf", page: 8, section: "5.1" },
      normStatus: "catalog-mismatch",
      promotionState: "candidate",
      validatorId: "purpose.change.requires.revision",
      correctionHint: "Compare a finalidade com a última emissão e ajuste a revisão quando necessário.",
    }),
    freezeRule({
      ruleId: "N2064-5.4-RENUMBER-NEW-REV0",
      norma: "N-2064",
      revision: "C",
      section: "5.4",
      title: "Renumeração cria novo documento em revisão 0",
      description: "Quando um documento é renumerado, o novo número deve ser emitido em revisão 0.",
      type: "mandatory",
      severity: "high",
      applicability: {},
      effectiveDate: "2003-08",
      source: { file: "420369210-N-2064-pdf.pdf", page: 8, section: "5.4" },
      normStatus: "catalog-mismatch",
      promotionState: "candidate",
      validatorId: "renumber.new.zero",
    }),
    freezeRule({
      ruleId: "N1710-5.1-SEVEN-GROUPS",
      norma: "N-1710",
      revision: "N",
      section: "5.1",
      title: "Estrutura de sete grupos",
      description: "O número codificado N-1710 é composto pelos sete grupos básicos definidos pela norma.",
      type: "mandatory",
      severity: "high",
      applicability: { n1710Only: true },
      effectiveDate: "2020-04",
      source: { file: "N-1710.pdf", page: 3, section: "5.1" },
      normStatus: "catalog-unconfirmed",
      promotionState: "candidate",
      validatorId: "n1710.structure.groups",
      correctionHint: "Identifique qual grupo do código diverge e valide o respectivo anexo.",
    }),
    freezeRule({
      ruleId: "N1710-1.2-CATEGORY-AND-CLASS-SCOPE",
      norma: "N-1710",
      revision: "N",
      section: "1.2",
      title: "Escopo por categoria e classe",
      description: "A N-1710 se aplica às categorias e classes previstas nos anexos aplicáveis.",
      type: "mandatory",
      severity: "high",
      applicability: { n1710Only: true },
      effectiveDate: "2020-04",
      source: { file: "N-1710.pdf", page: 2, section: "1.2" },
      normStatus: "catalog-unconfirmed",
      promotionState: "candidate",
      validatorId: "n1710.catalog.codes",
    }),
    freezeRule({
      ruleId: "N381-3.5.1-LEGEND-ALL-SHEETS",
      norma: "N-381",
      revision: "M",
      section: "3.5.1",
      title: "Legenda em todas as folhas",
      description: "As folhas do documento técnico devem conter quadro de legenda para identificação e interpretação.",
      type: "mandatory",
      severity: "medium",
      applicability: {},
      effectiveDate: "2022-05",
      source: { file: "N-0381 - REVISÃO M.pdf", page: 5, section: "3.5.1" },
      normStatus: "catalog-unconfirmed",
      promotionState: "candidate",
      validatorId: "pdf.legend.present",
    }),
    freezeRule({
      ruleId: "N381-3.5.4-DOCUMENT-METADATA",
      norma: "N-381",
      revision: "M",
      section: "3.5.4",
      title: "Campos de identificação da legenda",
      description: "A legenda reúne metadados como título, responsáveis, categoria, data, número e revisão.",
      type: "mandatory",
      severity: "medium",
      applicability: {},
      effectiveDate: "2022-05",
      source: { file: "N-0381 - REVISÃO M.pdf", page: 6, section: "3.5.4" },
      normStatus: "catalog-unconfirmed",
      promotionState: "candidate",
      validatorId: "pdf.legend.metadata",
    }),
    freezeRule({
      ruleId: "ET5290P-7.1-REPORT-GROUPS",
      norma: "ET-5290.00-22000-912-1LV-001",
      revision: "P",
      section: "7.1",
      title: "Codificação de relatórios RNEST por grupos",
      description: "Relatórios do projeto usam a estrutura de grupos e separadores definida pela especificação técnica RNEST.",
      type: "contractual",
      severity: "high",
      applicability: { projects: ["RNEST"] },
      effectiveDate: "2026-06-17",
      source: { file: "ET-5290.00-22000-912-1LV-001 - DEFINIÇÃO DE CODIFICAÇÃO DE DOCUMENTOS - Rev. P(8).pdf", page: 12, section: "7.1" },
      normStatus: "source-confirmed",
      promotionState: "candidate",
      validatorId: "rnest.report.code.groups",
      correctionHint: "Use a estrutura e os códigos vigentes da ET do projeto RNEST.",
    }),
    freezeRule({
      ruleId: "ET5290P-7.1.7.3-NT-PREFIX",
      norma: "ET-5290.00-22000-912-1LV-001",
      revision: "P",
      section: "7.1.7.3",
      title: "Prefixo nt- para item não tagueado",
      description: "No Grupo 7 dos relatórios RNEST, itens não tagueados iniciam com nt- em minúsculo.",
      type: "contractual",
      severity: "high",
      applicability: { projects: ["RNEST"] },
      effectiveDate: "2026-06-17",
      source: { file: "ET-5290.00-22000-912-1LV-001 - DEFINIÇÃO DE CODIFICAÇÃO DE DOCUMENTOS - Rev. P(8).pdf", page: 24, section: "7.1.7.3" },
      normStatus: "source-confirmed",
      promotionState: "candidate",
      validatorId: "rnest.untagged.nt-prefix",
      correctionHint: "Para item não tagueado no escopo RNEST, use nt- em minúsculo no início do identificador.",
    }),
  ]);

  function create(options) {
    const settings = options || {};
    const versions = VersionRegistry.create(settings.norms || BASE_NORMS);
    const rules = new Map();

    function registerRule(rule) {
      const normalized = freezeRule(rule);
      if (!normalized.ruleId) throw new Error("ruleId é obrigatório.");
      if (!normalized.norma || !normalized.revision || !normalized.section) {
        throw new Error("Norma, revisão e seção são obrigatórias para toda regra normativa.");
      }
      if (rules.has(normalized.ruleId)) {
        const existing = rules.get(normalized.ruleId);
        if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
          throw new Error(`A regra ${normalized.ruleId} já existe com conteúdo diferente; crie nova versão em vez de sobrescrever o histórico.`);
        }
        return existing;
      }
      rules.set(normalized.ruleId, normalized);
      return normalized;
    }

    (settings.rules || BASE_RULES).forEach(registerRule);

    function listRules() {
      return [...rules.values()];
    }

    function getRule(ruleId) {
      return rules.get(text(ruleId)) || null;
    }

    function applicableRules(context) {
      return listRules().filter((rule) => !Applicability || Applicability.matches(rule.applicability, context));
    }

    function rulesForNorm(norma) {
      const wanted = norm(norma);
      return listRules().filter((rule) => norm(rule.norma) === wanted);
    }

    return Object.freeze({
      versions,
      registerRule,
      listRules,
      getRule,
      applicableRules,
      rulesForNorm,
    });
  }

  return {
    RULE_TYPES,
    SEVERITIES,
    PROMOTION_STATES,
    BASE_NORMS,
    BASE_RULES,
    create,
  };
});
