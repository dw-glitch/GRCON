(function () {
  "use strict";

  // Mascote oficial da Qualidade. O runtime v4 aponta diretamente para os
  // PNGs HD físicos em assets/mascot; não há mais patch nem Base64 legado.
  const installMascotHeader = () => {
    if (document.querySelector('script[data-grcon-mascot-loader="true"]')) return;
    const script = document.createElement("script");
    script.src = "grcon_mascot_header.js?v=4.0.0";
    script.async = false;
    script.dataset.grconMascotLoader = "true";
    document.head.appendChild(script);
  };
  installMascotHeader();

  // Bootstrap leve do Dashboard SIGEM × PW. O carregamento real continua lazy.
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
