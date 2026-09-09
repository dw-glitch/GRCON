/**
 * GRCON — Configuração Centralizada
 * Versão: 5.40.7
 *
 * Arquivo único de configuração para constantes, limites e opções
 * usados em todo o projeto. Evita hardcoding disperso.
 */
(function (root, factory) {
  const disciplines = root.GrconDiscipline
    || (typeof module === "object" && module.exports ? require("./discipline_resolver.js") : null);
  const config = factory(disciplines);
  if (typeof module === "object" && module.exports) module.exports = config;
  root.GrconConfig = config;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Disciplines) {
  "use strict";

  if (!Disciplines || !Array.isArray(Disciplines.OFFICIAL_DISCIPLINES)) {
    throw new Error("O catálogo central de disciplinas da eGRDT não foi carregado.");
  }

  const CONFIG = Object.freeze({
    /* ── Versão ─────────────────────────────────────────────── */
    APP_VERSION: "5.40.7",

    /* ── Limites de processamento ───────────────────────────── */
    EGRDT_BATCH_LIMIT: 48,
    PROCESS_CHUNK_SIZE: 300,
    RESULT_PAGE_SIZE: 250,
    RECENT_DAYS: 30,

    /* ── Limites de armazenamento ───────────────────────────── */
    STORAGE_MAX_RECORDS: 200,
    STORAGE_MAX_BYTES: 4_200_000,

    /* ── Alfabeto de revisão ────────────────────────────────── */
    REVISION_ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ",

    /* ── Categorias N1710 ───────────────────────────────────── */
    N1710_CATEGORIES: Object.freeze([
      "CE", "CR", "DB", "DE", "EC", "ET", "FD", "IM", "IS", "LA",
      "LD", "LI", "LO", "MA", "MC", "MD", "MO", "PR", "PT", "RL",
      "RM", "CT", "SIT",
    ]),

    /* ── Disciplinas de relatório ────────────────────────────── */
    REPORT_DISCIPLINES: Object.freeze([
      "ADC", "ARR", "DBU", "CVL", "CTO", "CRS", "CDR", "DOC", "ELE",
      "REQ", "ETF", "FSC", "FOR", "GER", "HVAC", "INSP", "INS", "PDMS",
      "MEC", "DIN", "EST", "PLA", "PRS", "PRJ", "QUA", "SMS", "SEG",
      "SIS", "SUP", "TEL", "TUB",
    ]),

    /* ── Opções de eGRDT ────────────────────────────────────── */
    EGRDT_OPTIONS: Object.freeze({
      formats: ["A0", "A1", "A2", "A3", "A4"],
      disciplines: Disciplines.OFFICIAL_DISCIPLINES,
      documentTypes: [
        "AD", "AF", "AL", "ART", "AS", "AT", "CE", "CO", "CR", "CT", "CV",
        "DB", "DTRI", "DE", "DTRA", "ET", "FD", "GES", "HIS", "IM", "IS",
        "LA", "LD", "LI", "LO", "MA", "MC", "MD", "MO", "ORG", "PR", "PT",
        "RL", "RM", "SG", "SUB",
      ],
      purposes: [
        "Para Compra", "Para Construção", "Conforme Construído", "Certificado",
        "Pendente Certificação", "Cancelado", "Emitido para Comentários",
        "Para Cancelamento", "Para Informação", "Para Liberação",
      ],
    }),

    /* ── Chaves de armazenamento ─────────────────────────────── */
    STORAGE_KEYS: Object.freeze({
      THEME: "quality-theme-grcon",
      EGRDT_HISTORY: "grcon.egrdt.history.v1",
      SIGEM_POSTINGS: "grcon.sigem.postings.v1",
      SIGEM_PREFERENCES: "grcon.sigem.preferences.v1",
      PENDING_ALLOCATION: "grcon.pending.allocation.history.v1",
      TASK_CENTER: "grcon.task-center.v2",
      EGRDT_SEQUENCE: "grcon.egrdt.sequence.v1",
      EGRDT_BATCH_LIMIT: "grcon.egrdt.batch.limit",
    }),
  });

  return CONFIG;
});
