"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const bootstrap = read("sigem_pw_dashboard_bootstrap.js");
const adapter = read("src/react/sigem-pw/services/sigemPwDashboardAdapter.ts");
const hook = read("src/react/sigem-pw/hooks/useSigemPwDashboard.ts");
const entry = read("src/react/sigem-pw/index.tsx");
const app = read("src/react/sigem-pw/SigemPwDashboardApp.tsx");
const types = read("src/react/sigem-pw/types/domain.ts");
const globals = read("src/react/sigem-pw/types/legacy-globals.d.ts");
const css = read("sigem-pw-dashboard.css");
const vite = read("vite.config.ts");
const pkg = JSON.parse(read("package.json"));
const sw = read("sw.js");
const worker = read("workers/sigem_pw_dashboard.worker.js");
const core = read("sigem_pw_dashboard_core.js");
const Dashboard = require("../sigem_pw_dashboard_core.js");

assert.match(vite, /"sigem-pw-dashboard"[\s\S]*src\/react\/sigem-pw\/index\.tsx[\s\S]*sigem-pw-dashboard-app\.js/);
assert.match(pkg.scripts.build, /vite build --mode sigem-pw-dashboard/);
assert.match(bootstrap, /id="grcon-sigem-pw-root"/);
assert.match(bootstrap, /ensure\("react-dist\/sigem-pw-dashboard-app\.js"\)/);
assert.doesNotMatch(bootstrap, /ensure\("sigem_pw_dashboard_app\.js"\)/, "o app legado não pode continuar no runtime");
assert.ok(bootstrap.indexOf('ensure("sigem_pw_revision_core.js")') < bootstrap.indexOf('ensure("sigem_pw_history_core.js")'));
assert.ok(bootstrap.indexOf('ensure("sigem_pw_history_management.js")') < bootstrap.indexOf('ensure("react-dist/sigem-pw-dashboard-app.js")'));

assert.match(entry, /mountReactIsland/);
assert.match(entry, /GrconSigemPwDashboardUi/);
for (const contract of ["activate","refresh","clearPreStage7BasesOnce","state"]) assert.match(entry, new RegExp(contract));
assert.match(hook, /useSyncExternalStore/);
assert.match(hook, /subscribeExternalEvents/);
assert.match(adapter, /registerHistoryBeforeActivation/);
assert.match(adapter, /History|GrconSigemPwHistory/);
assert.match(adapter, /rollbackStagedImport/);
assert.match(adapter, /rollbackRecordedActiveBases/);
assert.match(adapter, /modelGeneration/);
assert.match(adapter, /new Worker\(new URL\("workers\/sigem_pw_dashboard\.worker\.js"/);
assert.match(adapter, /aggregates\[aggregateKey\]/);
assert.match(adapter, /GRCONModuleLoader\.ensure\("xlsx"\)/);
assert.match(adapter, /filteredRows\(\)/);
assert.match(adapter, /rows\.slice\(start, start \+ 100\)/);
assert.ok(adapter.indexOf("registerHistoryBeforeActivation(\"sigem\"") < adapter.indexOf("saveSigemBase(candidate)"));
assert.ok(adapter.indexOf("registerHistoryBeforeActivation(\"pw\"") < adapter.indexOf("savePwBase(candidate, state.ld)"));
assert.ok(adapter.indexOf('registerHistoryBeforeActivation("pw", candidatePw') < adapter.indexOf("saveLdAndReprocessPw(candidateLd, state.pw)"));

assert.match(types, /SIGEM_PW_PAGE_SIZE = 100/);
assert.match(types, /SigemPwBase/);
assert.match(types, /SigemPwAggregateMap/);
assert.match(types, /SigemPwReadiness/);
assert.match(globals, /GrconSigemPwDashboardUi/);
assert.match(globals, /GrconSigemPwRevisionUi/);
assert.match(globals, /GrconSigemPwEvolutionUi/);

assert.match(css, /\.spw-page-heading/);
assert.match(css, /\.spw-base-grid/);
assert.match(css, /\.spw-table-wrap/);
assert.doesNotMatch(app, /createModel|aggregateModel|parsePwCsv|revisionRank|documentIdentity/);
for (const file of fs.readdirSync(path.join(root, "src/react/sigem-pw/components"))) {
  const source = read(path.join("src/react/sigem-pw/components", file));
  assert.doesNotMatch(source, /createModel|aggregateModel|parsePwCsv|documentIdentity|revisionRank/, file);
}
assert.match(worker, /Dashboard\.createModel/);
assert.match(worker, /Dashboard\.aggregateModel\(model/);
assert.match(core, /function createModel/);
assert.match(sw, /"sigem-pw-dashboard\.css"/);
assert.match(sw, /"react-dist\/sigem-pw-dashboard-app\.js"/);
assert.match(sw, /phase-a-sigem-pw-react1/);

const et = (id) => `C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-${id}`;
const revisionDoc = et("009999");
const revisionModel = Dashboard.createModel([
  { document: revisionDoc, revision: "0", status: "Postado" },
  { document: revisionDoc, revision: "A", status: "Postado" },
  { document: revisionDoc, revision: "B", status: "Postado" },
], [], []);
const revisionResult = Dashboard.aggregateModel(revisionModel);
assert.equal(revisionResult.summary.sigem, 3);
assert.equal(revisionResult.summary.sigemOnly, 3);
assert.deepEqual(revisionResult.lists.sigemOnly.map((row) => row.revision), ["0","A","B"]);

const classified = Dashboard.aggregate(
  [
    { document: et("000001"), revision: "0", status: "Postado" },
    { document: et("000002"), revision: "0", status: "Postado" },
    { document: et("000003"), revision: "0", status: "Postado" },
  ],
  [
    { document: et("000002"), revision: "0", state: "Cadastrado", lastEmission: "Previsto" },
    { document: et("000003"), revision: "0", state: "Liberado", lastEmission: "Sim" },
    { document: et("000004"), revision: "0", state: "Cadastrado", lastEmission: "Previsto" },
    { document: et("000005"), revision: "0", state: "Liberado", lastEmission: "Sim" },
  ],
);
assert.equal(classified.summary.sigemOnly, 1);
assert.equal(classified.summary.bothNotEmitted, 1);
assert.equal(classified.summary.bothEmitted, 1);
assert.equal(classified.summary.pwOnlyNotEmitted, 1);
assert.equal(classified.summary.pwOnlyEmitted, 1);
assert.equal(classified.summary.classifiedTotal, 5);
assert.equal(new Set(classified.lists.all.map((row) => row.key)).size, 5);

if (fs.existsSync(path.join(root, "react-dist/sigem-pw-dashboard-app.js"))) {
  const bundle = read("react-dist/sigem-pw-dashboard-app.js");
  const bytes = Buffer.byteLength(bundle);
  assert.ok(bytes < 500000, `bundle SIGEM × PW inesperadamente grande: ${bytes} bytes`);
  assert.doesNotMatch(bundle, /ExcelJS|exceljs\.min|SheetJS.*Community Edition|xlsx\.full\.min/i, "XLSX/ExcelJS não podem entrar no bundle React");
  assert.doesNotMatch(bundle, /function documentIdentity\(|function parsePwCsv\(/, "Core não pode ser duplicado dentro do bundle React");
}

console.log("sigem_pw_react: OK — ilha React, fachada, Worker, atomicidade, revisão e cinco situações preservados.");
