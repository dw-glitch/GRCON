(function () {
  "use strict";
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
