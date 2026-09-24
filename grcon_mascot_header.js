/* GRCON — bridge de compatibilidade do antigo mascote contextual para o Mascot Runtime v5. */
(function (root) {
  "use strict";
  const VERSION = "5.0.0";
  const POSES = Object.freeze({
    default: true, analysis: true, search: true, check: true, history: true,
    dashboard: true, "sigem-pw": true, egrdt: true, import: true, report: true,
    warning: true, success: true, pending: true, empty: true, quality: true,
  });
  let requestedPose = "";
  function refresh() {
    root.dispatchEvent(new CustomEvent("grcon:mascot-context-refresh", { detail: { pose: requestedPose } }));
    root.GrconMascot?.refresh?.(requestedPose);
  }
  function setState(pose) {
    requestedPose = pose && POSES[pose] ? pose : "";
    if (pose === "warning") root.GrconMascot?.warning?.({ message: "Confira esta informação.", source: "legacy-pose" });
    else if (pose === "success") root.GrconMascot?.success?.({ source: "legacy-pose" });
    else refresh();
  }
  root.GRCONMascot = Object.freeze({
    version: VERSION,
    poses: POSES,
    contexts: Object.freeze({}),
    setState,
    clearState: () => { requestedPose = ""; refresh(); },
    refresh,
    installHeader: refresh,
  });
})(window);
