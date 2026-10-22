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

  const VERSION = "sigem-pw-readiness-2";
  const CLASSES = Object.freeze(["ET", "N-1710", "Não classificado"]);
  const REQUIRED_BASES = Object.freeze([
    { key: "sigem", label: "Consulta Geral/SIGEM" },
    { key: "pw", label: "relação ProjectWise" },
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
    loaded.ld = validBase(source.ld);
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
      check("classes", "Todos os códigos estão classificados ou identificados como não classificados",
        (result && result.classes || []).every((row) => CLASSES.includes(text(row.documentClass))), Boolean(result)),
      check("sigem-balance", "Total SIGEM conciliado com todas as classes",
        (result?.classes || []).reduce((sum, row) => sum + count(row.sigem), 0) === sigemTotal, loaded.sigem),
      check("pw-balance", "Total PW conciliado com todas as classes",
        (result?.classes || []).reduce((sum, row) => sum + count(row.pwRegistered), 0) === pwTotal, loaded.pw),
      check("emission-balance", "Emissões PW contidas nos cadastros",
        emitted <= pwTotal, loaded.pw),
      check("register-list", "Lista Cadastrar no PW conciliada com o indicador",
        Array.isArray(lists.toRegisterPw) && lists.toRegisterPw.length === count(summary.gapSigemToPw), loaded.sigem && loaded.pw),
      check("not-emitted-list", "Lista PW não emitido conciliada com o indicador",
        Array.isArray(lists.pwNotEmitted) && lists.pwNotEmitted.length === count(summary.gapPwToEmitted), loaded.pw),
      check("pw-exclusive-list", "Lista Somente no PW conciliada com o indicador",
        Array.isArray(lists.pwExclusive) && lists.pwExclusive.length === count(summary.pwExclusive), loaded.sigem && loaded.pw),
      check("exclusive-situations", "Situações exclusivas conciliadas sem duplicidade",
        ["sigemOnly", ...(lists.bothOtherRevision ? ["bothOtherRevision"] : []), "bothNotEmitted", "bothEmitted", "pwOnlyNotEmitted", "pwOnlyEmitted"].every((key) => Array.isArray(lists[key]) && lists[key].length === count(summary[key]))
          && count(summary.classifiedTotal) === count(summary.sigem) + count(summary.pwRegistered) - count(summary.matched), loaded.sigem && loaded.pw),
      check("quality-ld", "LD da Qualidade usada apenas para conferência de localização (sem bloquear cadastro PW)",
        true, loaded.pw),
      check("scope-version", "Base PW processada pela regra de escopo vigente",
        count(source.pw && source.pw.meta && source.pw.meta.scopeVersion) >= count(Dashboard && Dashboard.PW_SCOPE_VERSION), loaded.pw),
    ];
    const failed = checks.filter((item) => item.applicable && !item.passed);
    let status = "empty";
    let title = "Pronto para receber as novas bases";
    let message = "Carregue a Consulta Geral e a relação ProjectWise. A LD é opcional para conferir localização, não para comprovar cadastro.";
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
      message = loaded.ld ? "SIGEM e PW conciliados; a LD está disponível para conferência de localização." : "SIGEM e PW conciliados; documentos previstos estão cadastrados independentemente da LD.";
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
