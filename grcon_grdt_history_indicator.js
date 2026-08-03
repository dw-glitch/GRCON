/**
 * GRCON - Indicador de Histórico de GRDTs
 * 
 * Mostra para cada documento na tabela de resultados se ele já possui
 * um GRDT emitido anteriormente, e qual o número do GRDT.
 * 
 * A informação é apenas informativa - não bloqueia a geração de um novo GRDT.
 * O usuário decide se quer ou não gerar um novo GRDT.
 */
(function () {
  "use strict";

  const HISTORY_KEY = "grcon.egrdt.history.v1";
  const NORM_CACHE_KEY = "grcon.grdt.history.documents.v1";
  let documentMap = new Map();
  let lastRefresh = 0;

  function text(value) {
    return String(value == null ? "" : value).trim();
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

  function key(value) {
    return norm(value)
      .replace(/\s*([_.-])\s*/g, "$1")
      .replace(/\s+/g, " ");
  }

  /**
   * Lê o histórico do localStorage e constrói um mapa
   * documento -> array de { egrdtNumber, generatedAt, egrdtInfo }
   */
  function refresh() {
    documentMap = new Map();
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const records = JSON.parse(raw);
      if (!Array.isArray(records)) return;

      records.forEach(function (record) {
        const egrdtNumber = text(record.egrdtNumber);
        const generatedAt = text(record.generatedAt);
        if (!egrdtNumber) return;

        const files = Array.isArray(record.files) ? record.files : [];
        files.forEach(function (file) {
          const doc = text(file && file.document);
          if (!doc) return;
          const docKey = key(doc);

          if (!documentMap.has(docKey)) {
            documentMap.set(docKey, []);
          }

          const entries = documentMap.get(docKey);
          // Evita duplicar o mesmo GRDT para o mesmo documento
          const exists = entries.some(function (e) {
            return e.egrdtNumber === egrdtNumber;
          });
          if (!exists) {
            entries.push({
              egrdtNumber: egrdtNumber,
              generatedAt: generatedAt,
              shortNumber: egrdtNumber.replace(/^0130870-C1O-PGV-G-/, "").replace(/ - eGRDT$/, ""),
            });
          }
        });
      });

      // Ordena cada entrada por data (mais recente primeiro)
      documentMap.forEach(function (entries) {
        entries.sort(function (a, b) {
          return b.generatedAt.localeCompare(a.generatedAt);
        });
      });

      lastRefresh = Date.now();
    } catch (_) {
      console.debug("[GrdtHistoryIndicator] context:", _);
      documentMap = new Map();
    }
  }

  /**
   * Retorna a lista de GRDTs para um documento
   */
  function getGrdtsForDocument(document) {
    if (!document) return [];
    if (Date.now() - lastRefresh > 30000) refresh();
    return documentMap.get(key(document)) || [];
  }

  /**
   * Cria o HTML do badge indicando GRDTs anteriores
   */
  function createBadgeHtml(document) {
    const grdts = getGrdtsForDocument(document);
    if (!grdts.length) return "";

    const count = grdts.length;
    const latest = grdts[0];
    const shortNumber = latest.shortNumber;

    // Múltiplos GRDTs
    if (count > 1) {
      return `<span class="grdt-history-badge multiple" title="Este documento já foi incluído em ${count} GRDTs. O mais recente é ${latest.egrdtNumber}. Clique para ver detalhes." data-grdt-count="${count}" data-grdt-list="${escapeAttr(grdts.map(function (g) { return g.egrdtNumber; }).join(", "))}" style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 6px;background:var(--warning-100);color:var(--warning-800);border-radius:999px;font-size:.65rem;font-weight:700;cursor:help;white-space:nowrap;border:1px solid var(--warning-100);">GRDT: ${escapeHtml(shortNumber)}<span style="font-size:.6rem;opacity:.7;">+${count - 1}</span></span>`;
    }

    // Apenas um GRDT
    const title = "Este documento já possui um GRDT emitido: " + latest.egrdtNumber + ". Você pode gerar um novo normalmente.";
    return `<span class="grdt-history-badge single" title="${escapeAttr(title)}" style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 6px;background:var(--info-100);color:var(--info-700);border-radius:999px;font-size:.65rem;font-weight:700;cursor:help;white-space:nowrap;border:1px solid var(--info-100);">GRDT: ${escapeHtml(shortNumber)}</span>`;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, '\x26amp;')
      .replace(/</g, '\x26lt;')
      .replace(/>/g, '\x26gt;')
      .replace(/"/g, '\x26quot;')
      .replace(/'/g, '\x26#039;');
  }

  function escapeAttr(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, '\x26amp;')
      .replace(/"/g, '\x26quot;')
      .replace(/'/g, '\x26#039;')
      .replace(/</g, '\x26lt;')
      .replace(/>/g, '\x26gt;');
  }

  /**
   * Hook para ser chamado após o histórico ser atualizado
   */
  function onHistoryUpdated() {
    refresh();
  }

  // Inicializa
  refresh();

  // Escuta atualizações do histórico
  window.addEventListener("grcon:history-updated", onHistoryUpdated);

  // Expõe a API
  window.GrconGrdtHistoryIndicator = {
    refresh: refresh,
    getGrdtsForDocument: getGrdtsForDocument,
    createBadgeHtml: createBadgeHtml,
    getBadgeHtml: createBadgeHtml,
    getMap: function () { return documentMap; },
  };
})();