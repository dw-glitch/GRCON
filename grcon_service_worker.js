(function () {
  "use strict";

  window.GRCON_SW_REVISION = "20260916.4-mascot-running-lane";
  const SW_URL = "sw-v6.js?v=20260916.4";
  const RELOAD_GUARD = "grcon:sw-v6:controller-reload";

  const installMascotController = () => {
    if (window.GrconMascot || document.querySelector('script[data-grcon-mascot-controller="video"]')) return;
    const installController = () => {
      if (window.GrconMascot || document.querySelector('script[data-grcon-mascot-controller="video"]')) return;
      const controller = document.createElement("script");
      controller.src = "grcon_mascot_controller.js?v=20260916.4";
      controller.async = false;
      controller.dataset.grconMascotController = "video";
      document.head.appendChild(controller);
    };
    if (window.GRCONMascotGreetingCore) return installController();
    const existingCore = document.querySelector('script[data-grcon-mascot-greeting-core="true"]');
    if (existingCore) return existingCore.addEventListener("load", installController, { once: true });
    const core = document.createElement("script");
    core.src = "grcon_mascot_greeting_core.js";
    core.async = false;
    core.dataset.grconMascotGreetingCore = "true";
    core.addEventListener("load", installController, { once: true });
    document.head.appendChild(core);
  };

  const installMascotAssetFix = () => {
    if (document.querySelector('script[data-grcon-mascot-asset-fix="true"]')) return installMascotController();
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

  const installMascotRunner = () => {
    if (!document.querySelector('link[data-grcon-mascot-runner-style="true"]')) {
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = "grcon_mascot_runner.css?v=20260916.4";
      style.dataset.grconMascotRunnerStyle = "true";
      document.head.appendChild(style);
    }
    if (window.GrconMascotRunner || document.querySelector('script[data-grcon-mascot-runner="true"]')) return;
    const script = document.createElement("script");
    script.src = "grcon_mascot_runner.js?v=20260916.4";
    script.async = false;
    script.dataset.grconMascotRunner = "true";
    document.head.appendChild(script);
  };

  installMascotHeader();
  installMascotRunner();

  const installSigemPwDashboard = () => {
    const loader = window.GRCONModuleLoader;
    if (!loader || typeof loader.ensure !== "function") return;
    loader.ensure("sigem_pw_dashboard_bootstrap.js").catch((error) => console.warn("Dashboard SIGEM × PW não pôde ser inicializado:", error));
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
    try {
      if (sessionStorage.getItem(RELOAD_GUARD) === "1") {
        sessionStorage.removeItem(RELOAD_GUARD);
        window.dispatchEvent(new CustomEvent("grcon:sw-updated"));
        return;
      }
      sessionStorage.setItem(RELOAD_GUARD, "1");
    } catch (_) {}
    location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL, { scope: "./", updateViaCache: "none" }).then((registration) => {
      registration.update().catch(() => {});
      window.dispatchEvent(new CustomEvent("grcon:sw-updated", { detail: { scope: registration.scope, revision: window.GRCON_SW_REVISION } }));
      window.setTimeout(() => {
        try { sessionStorage.removeItem(RELOAD_GUARD); } catch (_) {}
        reloadingForUpdate = false;
      }, 1500);
    }).catch((error) => console.warn("GRCON SW v6 falhou:", error));
  });
})();
