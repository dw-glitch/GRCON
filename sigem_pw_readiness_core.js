(function (root, factory) {
  const safeRequire = (path) => {
    if (typeof require !== "function") return null;
    try { return require(path); } catch (_) { return null; }
  };
  const api = factory(root.GrconSigemPwDashboard || safeRequire("./sigem_pw_dashboard_core.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GrconSigemPwReadiness = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Dashboard) {
  "use strict";

  const VERSION = "sigem-pw-readiness-1";
  const CLASSES = Object.freeze(["ET", "N-1710"]);
  const REQUIRED_BASES = Object.freeze([
    { key: "sigem", label: "Consulta Geral/SIGEM" },
    { key: "pw", label: "relação ProjectWise" },
    { key: "ld", label: "LD da Qualidade" },
  ]);

  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function validBase(base) { return Boolean(base && base.meta && Array.isArray(base.records)); }
  function count(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
  function classRow(result, documentClass) {
    return (result && Array.isArray(result.classes) && result.classes.find((row) => row.documentClass === documentClass)) || {};
  }
  function check(key, label, passed, applicable) {
    return { key, label, passed: applicable === false ? true : Boolean(passed), applicable: applicable !== false };
  }

  function assess(state, result) {
    const source = state || {};
    const loaded = Object.fromEntries(REQUIRED_BASES.map((item) => [item.key, validBase(source[item.key])]));
    const missing = REQUIRED_BASES.filter((item) => !loaded[item.key]).map((item) => item.label);
    const anyLoaded = Object.values(loaded).some(Boolean);
    const allLoaded = missing.length === 0;
    const summary = result && result.summary || {};
    const lists = result && result.lists || {};
    const et = classRow(result, "ET");
    const n1710 = classRow(result, "N-1710");
    const sigemTotal = count(summary.sigem);
    const pwTotal = count(summary.pwRegistered);
    const emitted = count(summary.pwEmitted);
    const activeLdId = text(source.ld && source.ld.meta && source.ld.meta.snapshotId);
    const pwLdId = text(source.pw && source.pw.meta && source.pw.meta.scopeLdSnapshotId);
    const n1710Pw = count(n1710.pwRegistered);

    const checks = [
      check("classes", "Somente as classes ET e N-1710 participam do resultado",
        (result && result.classes || []).every((row) => CLASSES.includes(text(row.documentClass))), Boolean(result)),
      check("sigem-balance", "Total SIGEM conciliado com ET + N-1710",
        count(et.sigem) + count(n1710.sigem) === sigemTotal, loaded.sigem),
      check("pw-balance", "Total PW conciliado com ET + N-1710",
        count(et.pwRegistered) + count(n1710.pwRegistered) === pwTotal, loaded.pw),
      check("emission-balance", "Emissões PW contidas nos cadastros",
        emitted <= pwTotal, loaded.pw),
      check("register-list", "Lista Cadastrar no PW conciliada com o indicador",
        Array.isArray(lists.toRegisterPw) && lists.toRegisterPw.length === count(summary.gapSigemToPw), loaded.sigem && loaded.pw),
      check("not-emitted-list", "Lista PW não emitido conciliada com o indicador",
        Array.isArray(lists.pwNotEmitted) && lists.pwNotEmitted.length === count(summary.gapPwToEmitted), loaded.pw),
      check("pw-exclusive-list", "Lista Somente no PW conciliada com o indicador",
        Array.isArray(lists.pwExclusive) && lists.pwExclusive.length === count(summary.pwExclusive), loaded.sigem && loaded.pw),
      check("quality-ld", "N-1710 do PW vinculado à LD da Qualidade vigente",
        n1710Pw === 0 || (Boolean(activeLdId) && pwLdId === activeLdId), loaded.pw),
      check("scope-version", "Base PW processada pela regra de escopo vigente",
        count(source.pw && source.pw.meta && source.pw.meta.scopeVersion) >= count(Dashboard && Dashboard.PW_SCOPE_VERSION), loaded.pw),
    ];
    const failed = checks.filter((item) => item.applicable && !item.passed);
    let status = "empty";
    let title = "Pronto para receber as novas bases";
    let message = "Carregue a Consulta Geral, a relação ProjectWise e a LD da Qualidade para iniciar uma comparação nova.";
    if (anyLoaded && !allLoaded) {
      status = "partial";
      title = "Carregamento ainda incompleto";
      message = `Falta carregar: ${missing.join(", ")}. Os dados existentes permanecem preservados, mas a comparação completa ainda não está disponível.`;
    } else if (allLoaded && failed.length) {
      status = "attention";
      title = "Verificação de integridade requer atenção";
      message = `${failed.length} verificação(ões) não foi(ram) concluída(s). Reimporte a base indicada antes de usar os totais operacionais.`;
    } else if (allLoaded) {
      status = "ready";
      title = "Comparação pronta e íntegra";
      message = "SIGEM, ProjectWise e LD estão carregados; totais, classes, emissões e listas foram conciliados.";
    }
    return {
      version: VERSION,
      status,
      ready: status === "ready",
      loaded,
      missing,
      checks,
      failedChecks: failed.map((item) => item.key),
      title,
      message,
    };
  }

  return Object.freeze({ VERSION, CLASSES, REQUIRED_BASES, text, validBase, classRow, assess });
});
