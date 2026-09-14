(function () {
  "use strict";

  // Mascote oficial da Qualidade. Mantido em módulos separados para que a
  // integração visual não se misture com regras de negócio ou navegação.
  const installMascotGreeting = () => {
    if (root.GRCONMascotGreeting || document.querySelector('script[data-grcon-mascot-greeting="true"]')) return;

    const installInteraction = () => {
      if (root.GRCONMascotGreeting || document.querySelector('script[data-grcon-mascot-greeting="true"]')) return;
      const interaction = document.createElement("script");
      interaction.src = "grcon_mascot_greeting.js";
      interaction.async = false;
      interaction.dataset.grconMascotGreeting = "true";
      document.head.appendChild(interaction);
    };

    if (root.GRCONMascotGreetingCore) {
      installInteraction();
      return;
    }
    const existingCore = document.querySelector('script[data-grcon-mascot-greeting-core="true"]');
    if (existingCore) {
      existingCore.addEventListener("load", installInteraction, { once: true });
      return;
    }
    const core = document.createElement("script");
    core.src = "grcon_mascot_greeting_core.js";
    core.async = false;
    core.dataset.grconMascotGreetingCore = "true";
    core.addEventListener("load", installInteraction, { once: true });
    document.head.appendChild(core);
  };

  const installMascotAssetFix = () => {
    if (document.querySelector('script[data-grcon-mascot-asset-fix="true"]')) {
      installMascotGreeting();
      return;
    }
    const fix = document.createElement("script");
    fix.src = "grcon_mascot_asset_fix.js";
    fix.async = false;
    fix.dataset.grconMascotAssetFix = "true";
    document.head.appendChild(fix);
    installMascotGreeting();
  };

  const installMascotHeader = () => {
    const existing = document.querySelector('script[data-grcon-mascot-loader="true"]');
    if (existing) {
      if (window.GRCONMascot) installMascotAssetFix();
      else existing.addEventListener("load", installMascotAssetFix, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "grcon_mascot_header.js";
    script.async = false;
    script.dataset.grconMascotLoader = "true";
    script.addEventListener("load", installMascotAssetFix, { once: true });
    document.head.appendChild(script);
  };
  installMascotHeader();

  // Bootstrap leve do Dashboard SIGEM × PW. O carregamento real continua lazy:
  // somente o bootstrap/navegação é instalado no início; core/app/Worker entram
  // quando o operador abre a nova aba.
  const installSigemPwDashboard = () => {
    const loader = window.GRCONModuleLoader;
    if (!loader || typeof loader.ensure !== "function") return;
    loader.ensure("sigem_pw_dashboard_bootstrap.js").catch((error) => {
      console.warn("Dashboard SIGEM × PW não pôde ser inicializado:", error);
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installSigemPwDashboard, { once: true });
  else installSigemPwDashboard();

  const canRegister = location.protocol === "https:"
    || (location.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname));
  if (!("serviceWorker" in navigator) || !window.isSecureContext || !canRegister) return;

  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((registration) => {
      console.log("GRCON SW registrado:", registration.scope);
      registration.update().catch(() => {});
    }).catch((error) => {
      console.warn("GRCON SW falhou:", error);
    });
  });
})();
