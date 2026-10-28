/* GRCON — armazenamento corporativo pendente de autorização.
 * A UI fica oculta, mas os serviços e os registros existentes são preservados.
 * Permissões de gravação DEVEM ser validadas também pelo Cloudflare Worker.
 */
(function(root) {
  "use strict";
  root.GrconStorageFeatures = Object.freeze({
    showStorageUI: false,
    enableAutomaticUpload: false,
    enableManualUpload: false,
    enableAutomaticLookup: false,
    enableStorageNotifications: false,
    enableStorageMetricsUI: false,
    preserveExistingData: true,
    storageProvider: "r2",
    futureOneDriveSupport: true
  });
})(window);
