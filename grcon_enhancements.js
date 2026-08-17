// GRCON — Melhorias de UX e Segurança
// Versão: 5.32.21
// Drag & Drop, Confirmações destrutivas, Auditoria local

(function () {
  "use strict";

  /* ============================================================
   * 1. DRAG & DROP PARA UPLOAD DE ARQUIVOS
   * ============================================================ */
  function initDragDrop() {
    const ldInput = document.getElementById("ld-input");
    const pdfInput = document.getElementById("pdf-input");
    const ldLabel = ldInput && ldInput.closest(".compact-source");
    const pdfLabel = pdfInput && pdfInput.closest(".compact-source");

    [ldLabel, pdfLabel].forEach((label) => {
      if (!label) return;
      label.setAttribute("draggable", "false");
      label.addEventListener("dragenter", (e) => {
        e.preventDefault();
        e.stopPropagation();
        label.classList.add("drag-over");
      });
      label.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        label.classList.add("drag-over");
      });
      label.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        label.classList.remove("drag-over");
      });
      label.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        label.classList.remove("drag-over");
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        // Determina qual input receberá os arquivos
        const isLd = label.querySelector("#ld-input");
        if (isLd) {
          // Filtra apenas arquivos Excel
          const excelFiles = [...files].filter((f) =>
            /\.(xlsx?|xlsm)$/i.test(f.name)
          );
          if (!excelFiles.length) {
            showToast("Arraste arquivos Excel (.xlsx, .xls, .xlsm) para a LD.", "warn");
            return;
          }
          // Atualiza o FileList do input
          const dt = new DataTransfer();
          excelFiles.forEach((f) => dt.items.add(f));
          ldInput.files = dt.files;
          ldInput.dispatchEvent(new Event("change", { bubbles: true }));
          showToast(`${excelFiles.length} LD(s) adicionada(s) por arrastar.`, "success");
        } else {
          // Pasta documental - aceita múltiplos formatos
          const validFiles = [...files].filter((f) =>
            /\.(pdf|doc|docx|xls|xlsx|xlsm|dwg|dgn|ppt|pptx)$/i.test(f.name)
          );
          if (!validFiles.length) {
            showToast("Arraste arquivos de documento (PDF, DOC, DWG, etc.).", "warn");
            return;
          }
          // Para drag & drop simples, sem webkitdirectory, usamos o input de arquivo normal
          if (pdfInput.getAttribute("webkitdirectory") !== null) {
            showToast("Para arrastar uma pasta inteira, use o seletor de pasta. Para arquivos individuais, use o seletor normal.", "warn");
            return;
          }
          const dt = new DataTransfer();
          validFiles.forEach((f) => dt.items.add(f));
          pdfInput.files = dt.files;
          pdfInput.dispatchEvent(new Event("change", { bubbles: true }));
          showToast(`${validFiles.length} documento(s) adicionado(s) por arrastar.`, "success");
        }
      });
    });

    // Estilo visual para drag over
    const style = document.createElement("style");
    style.textContent = `
      .compact-source.drag-over {
        border-color: var(--brand-600) !important;
        background: var(--brand-50) !important;
        transform: scale(1.02);
        box-shadow: 0 0 0 3px rgba(20, 121, 166, 0.2);
      }
      .compact-source.drag-over::after {
        content: "Solte para adicionar";
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.85);
        color: var(--brand-800);
        font-weight: 700;
        font-size: 1rem;
        border-radius: var(--radius-md);
        z-index: 10;
        pointer-events: none;
      }
      html[data-theme="dark"] .compact-source.drag-over::after {
        background: rgba(0, 0, 0, 0.7);
      }
    `;
    document.head.appendChild(style);
  }

  /* ============================================================
   * 2. CONFIRMAÇÕES PARA OPERAÇÕES DESTRUTIVAS
   * ============================================================ */
  function confirmAction(message, detail) {
    return new Promise((resolve) => {
      const existing = document.getElementById("grcon-confirm-dialog");
      if (existing) existing.remove();
      const overlay = document.createElement("div");
      overlay.className = "drawer-overlay";
      overlay.id = "grcon-confirm-overlay";
      overlay.style.zIndex = "800";
      const dialog = document.createElement("section");
      dialog.className = "p1-confirm-dialog";
      dialog.id = "grcon-confirm-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "grcon-confirm-title");
      dialog.innerHTML = `
        <div aria-hidden="true" class="p1-confirm-icon" style="background:var(--danger-100);color:var(--danger-700)">!</div>
        <div>
          <h2 id="grcon-confirm-title">${escapeHtml(message)}</h2>
          ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
        </div>
        <div class="p1-confirm-actions" style="margin-top:1rem">
          <button class="secondary-button" id="grcon-confirm-cancel" type="button">Cancelar</button>
          <button class="danger-button" id="grcon-confirm-ok" type="button">Confirmar</button>
        </div>
      `;
      document.body.appendChild(overlay);
      document.body.appendChild(dialog);
      document.body.classList.add("p1-modal-open");
      const close = (result) => {
        dialog.remove();
        overlay.remove();
        document.body.classList.remove("p1-modal-open");
        resolve(result);
      };
      document.getElementById("grcon-confirm-cancel").onclick = () => close(false);
      document.getElementById("grcon-confirm-ok").onclick = () => close(true);
      overlay.onclick = () => close(false);
      document.getElementById("grcon-confirm-ok").focus();
      // Tecla Escape
      const keyHandler = (e) => {
        if (e.key === "Escape") {
          close(false);
          document.removeEventListener("keydown", keyHandler);
        }
      };
      document.addEventListener("keydown", keyHandler);
    });
  }

  function escapeHtml(value) {
    const U = window.GrconUtils;
    if (U && U.escapeHtml) return U.escapeHtml(value);
    return String(value == null ? "" : value).replace(/[&<>"']/g, function(c) {
      return "&#" + c.charCodeAt(0) + ";";
    });
  }

  function showToast(message, kind) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = "toast show " + (kind || "info");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () { toast.className = "toast"; }, 6500);
  }

  function installDestructiveConfirmations() {
    // Botões destrutivos e seus confirmadores
    const destructiveActions = [
      {
        id: "analysis-history-clear",
        message: "Limpar todo o histórico de análises?",
        detail: "Esta ação é irreversível. Todos os registros de análises anteriores serão excluídos permanentemente.",
        event: "click",
        handler: async (e, originalHandler) => {
          e.preventDefault();
          e.stopPropagation();
          const confirmed = await confirmAction("Limpar todo o histórico de análises?", "Esta ação é irreversível. Todos os registros de análises anteriores serão excluídos permanentemente. Recomenda-se fazer um backup antes.");
          if (confirmed) originalHandler();
        }
      },
      {
        id: "sigem-clear",
        message: "Limpar todos os registros de postagem?",
        detail: "Esta ação é irreversível. Todos os registros de postagem SIGEM serão excluídos.",
        event: "click",
        handler: async (e, originalHandler) => {
          e.preventDefault();
          e.stopPropagation();
          const confirmed = await confirmAction("Limpar registros de postagem?", "Todos os registros de postagem SIGEM serão excluídos permanentemente.");
          if (confirmed) originalHandler();
        }
      },
      {
        id: "macro6-clear-operational",
        message: "Limpar históricos e filas?",
        detail: "Todos os históricos de eGRDTs, análises e filas SIGEM serão limpos. A sequência numérica das eGRDTs é preservada.",
        event: "click",
        handler: async (e, originalHandler) => {
          e.preventDefault();
          e.stopPropagation();
          const confirmed = await confirmAction("Limpar históricos e filas?", "Todos os históricos de eGRDTs, análises e filas SIGEM serão limpos.");
          if (confirmed) originalHandler();
        }
      },
      {
        id: "macro6-reset-preferences",
        message: "Restaurar preferências padrão?",
        detail: "Todas as preferências (colunas, densidade, filtros salvos, parâmetros de emissão e postagem) serão restauradas para o valor padrão.",
        event: "click",
        handler: async (e, originalHandler) => {
          e.preventDefault();
          e.stopPropagation();
          const confirmed = await confirmAction("Restaurar preferências padrão?", "Todas as preferências serão restauradas para o valor padrão.");
          if (confirmed) originalHandler();
        }
      },
    ];

    destructiveActions.forEach((action) => {
      const el = document.getElementById(action.id);
      if (!el) return;
      const originalHandler = el._originalHandler || null;
      el.addEventListener(action.event, async (e) => {
        await action.handler(e, originalHandler || (() => {}));
      });
    });
  }

  /* ============================================================
   * 3. AUDITORIA LOCAL (LOG DE OPERAÇÕES CRÍTICAS)
   * ============================================================ */
  const AUDIT_DB_NAME = "grcon.audit.log.v1";
  const AUDIT_STORE = "entries";

  function openAuditDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponível"));
      const request = indexedDB.open(AUDIT_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(AUDIT_STORE)) {
          const store = db.createObjectStore(AUDIT_STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("byTimestamp", "timestamp", { unique: false });
          store.createIndex("byAction", "action", { unique: false });
          store.createIndex("byUser", "user", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function logAudit(action, detail) {
    try {
      const db = await openAuditDb();
      const tx = db.transaction(AUDIT_STORE, "readwrite");
      const store = tx.objectStore(AUDIT_STORE);
      store.add({
        timestamp: new Date().toISOString(),
        action: String(action),
        detail: String(detail || ""),
        user: "",
        appVersion: "5.32.21",
        userAgent: navigator.userAgent ? navigator.userAgent.slice(0, 200) : "",
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (_) {
      // Auditoria é opcional; falha silenciosa
    }
  }

  async function exportAuditLog() {
    try {
      const db = await openAuditDb();
      const tx = db.transaction(AUDIT_STORE, "readonly");
      const store = tx.objectStore(AUDIT_STORE);
      const entries = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      const blob = new Blob([JSON.stringify({ schema: "grcon.audit.v1", exportedAt: new Date().toISOString(), entries }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GRCON_Auditoria_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      return entries.length;
    } catch (_) {
      return 0;
    }
  }

  function installAuditLogging() {
    const auditEvents = [
      { id: "analyze", action: "analise_executada" },
      { id: "export-egrdt", action: "egrdt_exportada" },
      { id: "export-zip", action: "pacote_exportado" },
      { id: "export-final-package", action: "pacote_completo_exportado" },
      { id: "export-report", action: "relatorio_exportado" },
      { id: "analysis-history-clear", action: "historico_analises_limpo" },
      { id: "history-clear", action: "historico_egrdts_limpo" },
      { id: "sigem-clear", action: "postagens_limpas" },
      { id: "macro6-clear-operational", action: "historico_operacional_limpo" },
      { id: "macro6-reset-preferences", action: "preferencias_restauradas" },
      { id: "macro6-full-export", action: "backup_completo_exportado" },
      { id: "macro6-full-import-button", action: "backup_completo_restaurado" },
      { id: "p1-confirm-ok", action: "confirmacao_saida_realizada" },
    ];

    auditEvents.forEach(({ id, action }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", () => {
        logAudit(action, `Botão: ${id}`);
      });
    });
  }

  /* ============================================================
   * 4. INICIALIZAÇÃO
   * ============================================================ */
  function init() {
    try {
      initDragDrop();
      installDestructiveConfirmations();
      installAuditLogging();
      // Exportar auditoria via console (para administradores)
      window.GrconAuditLog = {
        export: exportAuditLog,
        log: logAudit,
      };
      console.log("GRCON: Melhorias de UX e Segurança ativadas.");
    } catch (error) {
      console.warn("GRCON: Melhorias de UX não puderam ser carregadas:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
