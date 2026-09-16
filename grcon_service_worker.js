(function () {
  "use strict";

  // Mascote oficial da Qualidade. Mantido em módulos separados para que a
  // integração visual não se misture com regras de negócio ou navegação.
  const installMascotController = () => {
    if (window.GrconMascot || document.querySelector('script[data-grcon-mascot-controller="gsap"]')) return;
    const installController = () => {
      if (window.GrconMascot || document.querySelector('script[data-grcon-mascot-controller="gsap"]')) return;
      const controller = document.createElement("script");
      controller.src = "grcon_mascot_controller.js";
      controller.async = false;
      controller.dataset.grconMascotController = "gsap";
      document.head.appendChild(controller);
    };
    const installGsap = () => {
      if (window.gsap) return installController();
      const existingGsap = document.querySelector('script[data-grcon-gsap-runtime="local"]');
      if (existingGsap) return existingGsap.addEventListener("load", installController, { once: true });
      const runtime = document.createElement("script");
      runtime.src = "vendor/gsap/gsap.min.js";
      runtime.async = false;
      runtime.dataset.grconGsapRuntime = "local";
      runtime.addEventListener("load", installController, { once: true });
      document.head.appendChild(runtime);
    };
    if (window.GRCONMascotGreetingCore) return installGsap();
    const existingCore = document.querySelector('script[data-grcon-mascot-greeting-core="true"]');
    if (existingCore) return existingCore.addEventListener("load", installGsap, { once: true });
    const core = document.createElement("script");
    core.src = "grcon_mascot_greeting_core.js";
    core.async = false;
    core.dataset.grconMascotGreetingCore = "true";
    core.addEventListener("load", installGsap, { once: true });
    document.head.appendChild(core);
  };

  const installMascotAssetFix = () => {
    if (document.querySelector('script[data-grcon-mascot-asset-fix="true"]')) {
      installMascotController();
      return;
    }
    const fix = document.createElement("script");
    fix.src = "grcon_mascot_asset_fix.js";
    fix.async = false;
    fix.dataset.grconMascotAssetFix = "true";
    document.head.appendChild(fix);
    installMascotController();
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
