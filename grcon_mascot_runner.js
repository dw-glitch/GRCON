/* GRCON — compatibilidade: corrida delegada ao Mascot Runtime único. */
(function (root) {
  "use strict";
  const VERSION = "5.0.0";
  async function run(options) {
    return Boolean(await root.GrconMascot?.run?.({ ...(options || {}), source: options?.source || "legacy-runner" }));
  }
  function diagnostics() {
    const runtime = root.GrconMascot?.diagnostics?.() || {};
    return Object.freeze({ version: VERSION, delegated: true, state: runtime.state || "hidden", running: runtime.state === "running" });
  }
  root.GrconMascotRunner = Object.freeze({ version: VERSION, run, diagnostics });
})(window);
