(function () {
  "use strict";

  const STORAGE_KEY = "grcon.lastLd.v1";
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

  function createLdSignature(file) {
    if (!file) return null;
    return {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      savedAt: Date.now(),
    };
  }

  function matchesSignature(file, signature) {
    if (!file || !signature) return false;
    return (
      file.name === signature.name &&
      file.size === signature.size &&
      file.lastModified === signature.lastModified
    );
  }

  function isStale(signature) {
    if (!signature || !signature.savedAt) return true;
    return Date.now() - signature.savedAt > MAX_AGE_MS;
  }

  function saveLastLd(file) {
    if (!file) return;
    try {
      const signature = createLdSignature(file);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(signature));
    } catch (error) {
      console.warn("Não foi possível salvar referência da última LD:", error);
    }
  }

  function getLastLd() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const signature = JSON.parse(raw);
      if (isStale(signature)) {
        clearLastLd();
        return null;
      }
      return signature;
    } catch (error) {
      console.warn("Não foi possível recuperar referência da última LD:", error);
      return null;
    }
  }

  function clearLastLd() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Não foi possível limpar referência da última LD:", error);
    }
  }

  function formatTimeSince(timestamp) {
    const elapsed = Date.now() - timestamp;
    const minutes = Math.floor(elapsed / (60 * 1000));
    const hours = Math.floor(elapsed / (60 * 60 * 1000));
    const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));

    if (minutes < 1) return "há poucos segundos";
    if (minutes === 1) return "há 1 minuto";
    if (minutes < 60) return `há ${minutes} minutos`;
    if (hours === 1) return "há 1 hora";
    if (hours < 24) return `há ${hours} horas`;
    if (days === 1) return "há 1 dia";
    return `há ${days} dias`;
  }

  function showRestoreBanner(signature, onRestore, onDismiss) {
    const banner = document.createElement("div");
    banner.id = "ld-restore-banner";
    banner.className = "ld-restore-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    const timeAgo = formatTimeSince(signature.savedAt);
    const sizeFormatted = (signature.size / (1024 * 1024)).toFixed(2);

    banner.innerHTML = `
      <div class="ld-restore-content">
        <div class="ld-restore-icon">📂</div>
        <div class="ld-restore-text">
          <strong>LD anterior disponível</strong>
          <span>${signature.name} (${sizeFormatted} MB) · Usada ${timeAgo}</span>
        </div>
      </div>
      <div class="ld-restore-actions">
        <button class="secondary-button compact" data-action="dismiss">Não usar</button>
        <button class="primary-button compact" data-action="restore">Usar esta LD</button>
      </div>
    `;

    const restoreButton = banner.querySelector('[data-action="restore"]');
    const dismissButton = banner.querySelector('[data-action="dismiss"]');

    restoreButton.addEventListener("click", () => {
      banner.remove();
      if (typeof onRestore === "function") onRestore();
    });

    dismissButton.addEventListener("click", () => {
      banner.remove();
      clearLastLd();
      if (typeof onDismiss === "function") onDismiss();
    });

    // Insere no topo do workspace
    const workspace = document.querySelector(".workspace") || document.body;
    workspace.insertBefore(banner, workspace.firstChild);

    // Auto-dismiss após 15 segundos
    setTimeout(() => {
      if (banner.parentNode) {
        banner.classList.add("fading");
        setTimeout(() => banner.remove(), 300);
      }
    }, 15000);

    return banner;
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .ld-restore-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.25rem;
        margin-bottom: 1rem;
        background: var(--brand-50);
        border: 1px solid var(--brand-100);
        border-radius: var(--radius-md);
        animation: slideDown 300ms ease;
      }
      
      .ld-restore-banner.fading {
        opacity: 0;
        transform: translateY(-1rem);
        transition: opacity 300ms ease, transform 300ms ease;
      }
      
      .ld-restore-content {
        display: flex;
        align-items: center;
        gap: .75rem;
        flex: 1;
        min-width: 0;
      }
      
      .ld-restore-icon {
        flex-shrink: 0;
        font-size: 1.5rem;
      }
      
      .ld-restore-text {
        display: flex;
        flex-direction: column;
        gap: .15rem;
        min-width: 0;
      }
      
      .ld-restore-text strong {
        color: var(--text-1);
        font-weight: 670;
      }
      
      .ld-restore-text span {
        color: var(--text-2);
        font-size: .8rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .ld-restore-actions {
        display: flex;
        gap: .5rem;
        flex-shrink: 0;
      }
      
      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-1rem);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @media (max-width: 640px) {
        .ld-restore-banner {
          flex-direction: column;
          align-items: stretch;
        }
        
        .ld-restore-actions {
          width: 100%;
        }
        
        .ld-restore-actions button {
          flex: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Injeta estilos ao carregar
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectStyles);
  } else {
    injectStyles();
  }

  window.GrconLdMemory = Object.freeze({
    save: saveLastLd,
    get: getLastLd,
    clear: clearLastLd,
    matches: matchesSignature,
    showBanner: showRestoreBanner,
  });
})();
