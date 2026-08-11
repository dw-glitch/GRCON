/**
 * GRCON — Utilitários Compartilhados
 * Versão: 5.32.2
 *
 * Módulo centralizado com funções utilitárias que antes eram
 * copiadas em dezenas de arquivos. Todos os módulos devem usar
 * window.GrconUtils ao invés de redefinir essas funções.
 */
(function (root) {
  "use strict";

  /* ── Normalização de texto ──────────────────────────────── */

  /**
   * Limpa valor para string, tratando null/undefined.
   * @param {*} value
   * @returns {string}
   */
  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  /**
   * Normaliza texto para comparação: remove acentos, uppercase, espaços.
   * @param {*} value
   * @returns {string}
   */
  function norm(value) {
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();
  }

  /* ── Segurança ──────────────────────────────────────────── */

  /**
   * Escapa HTML para prevenir XSS ao inserir em innerHTML.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ── Formatação de datas ────────────────────────────────── */

  /**
   * Preenche número com zeros à esquerda.
   * @param {*} value
   * @param {number} [size=2]
   * @returns {string}
   */
  function pad(value, size) {
    return String(value).padStart(size || 2, "0");
  }

  /**
   * Formata data para exibição no padrão brasileiro.
   * @param {Date|string|number} value
   * @param {boolean} [withTime=true]
   * @returns {string}
   */
  function formatDate(value, withTime) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    if (withTime === false) {
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
    }
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  /**
   * Formata data apenas no padrão DD/MM/YYYY.
   * @param {Date|string} value
   * @returns {string}
   */
  function formatDateOnlyBR(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
    }
    const raw = text(value);
    let match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (match) return `${pad(match[1])}/${pad(match[2])}/${match[3]}`;
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return raw || "—";
  }

  /**
   * Gera timestamp compacto para nomes de arquivo.
   * @param {Date} [date]
   * @returns {string}
   */
  function compactStamp(date) {
    const d = date || new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  /* ── Armazenamento ──────────────────────────────────────── */

  /**
   * Calcula tamanho em bytes de um valor string (UTF-8).
   * @param {*} value
   * @returns {number}
   */
  function byteSize(value) {
    try {
      return new Blob([String(value)]).size;
    } catch (_) {
      console.debug("[GrconUtils] byteSize: Blob indisponível, usando estimativa.");
      return String(value).length * 2;
    }
  }

  /**
   * Retorna o storage recebido ou localStorage como fallback.
   * @param {Storage} [storage]
   * @returns {Storage|null}
   */
  function storageOf(storage) {
    return storage || (typeof localStorage !== "undefined" ? localStorage : null);
  }

  /* ── Download ───────────────────────────────────────────── */

  /**
   * Inicia download de um Blob como arquivo.
   * @param {Blob} blob
   * @param {string} filename
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || "download";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 200);
  }

  /* ── DOM helpers ────────────────────────────────────────── */

  /**
   * querySelector com raiz opcional.
   * @param {string} selector
   * @param {Element} [root]
   * @returns {Element|null}
   */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  /**
   * querySelectorAll retornando Array.
   * @param {string} selector
   * @param {Element} [root]
   * @returns {Element[]}
   */
  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  /* ── Parsing de data ────────────────────────────────────── */

  /**
   * Converte valor para Date, suportando formatos BR e ISO.
   * @param {*} value
   * @returns {Date|null}
   */
  function parseDateValue(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number" && Number.isFinite(value)) {
      const numericDate = new Date(value);
      return Number.isNaN(numericDate.getTime()) ? null : numericDate;
    }
    const raw = text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!br) return null;
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const hour = Number(br[4] || 0);
    const minute = Number(br[5] || 0);
    const second = Number(br[6] || 0);
    const local = new Date(year, month - 1, day, hour, minute, second, 0);
    if (Number.isNaN(local.getTime())) return null;
    return local;
  }

  /* ── API Pública ────────────────────────────────────────── */

  root.GrconUtils = Object.freeze({
    text,
    norm,
    escapeHtml,
    pad,
    formatDate,
    formatDateOnlyBR,
    compactStamp,
    byteSize,
    storageOf,
    downloadBlob,
    $,
    $$,
    parseDateValue,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
