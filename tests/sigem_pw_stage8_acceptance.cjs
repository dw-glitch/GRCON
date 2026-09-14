const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(rootDir, name), "utf8");
const Readiness = require("../sigem_pw_readiness_core.js");
const Dashboard = require("../sigem_pw_dashboard_core.js");
const app = read("sigem_pw_dashboard_app.js");
const bootstrap = read("sigem_pw_dashboard_bootstrap.js");
const sw = read("sw.js");

function base(meta, records) { return { meta: meta || {}, records: records || [] }; }
function validResult() {
  return {
    summary: {
      sigem: 3,
      pwRegistered: 2,
      pwEmitted: 1,
      gapSigemToPw: 1,
      gapPwToEmitted: 1,
      pwExclusive: 0,
    },
    classes: [
      { documentClass: "ET", sigem: 2, pwRegistered: 1 },
      { documentClass: "N-1710", sigem: 1, pwRegistered: 1 },
    ],
    lists: {
      toRegisterPw: [{}],
      pwNotEmitted: [{}],
      pwExclusive: [],
    },
  };
}

(function emptyStateAfterOneTimeResetIsExpected() {
  const assessment = Readiness.assess({
    sigem: { meta: null, records: [] },
    pw: { meta: null, records: [] },
    ld: { meta: null, records: [] },
  }, { summary: {}, classes: [], lists: {} });
  assert.equal(assessment.status, "empty");
  assert.equal(assessment.ready, false);
  assert.equal(assessment.missing.length, 3);
  assert.match(assessment.title, /Pronto/);
})();

(function partialImportNamesOnlyMissingSources() {
  const assessment = Readiness.assess({
    sigem: base({ snapshotId: "sigem:1" }, []),
    pw: { meta: null, records: [] },
    ld: { meta: null, records: [] },
  }, validResult());
  assert.equal(assessment.status, "partial");
  assert.deepEqual(assessment.missing, ["relação ProjectWise", "LD da Qualidade"]);
  assert.doesNotMatch(assessment.message, /descart|fora do escopo|exclu/i);
})();

(function completeConsistentSetIsReady() {
  const assessment = Readiness.assess({
    sigem: base({ snapshotId: "sigem:1" }, []),
    pw: base({ snapshotId: "pw:1", scopeVersion: Dashboard.PW_SCOPE_VERSION, scopeLdSnapshotId: "ld:1" }, []),
    ld: base({ snapshotId: "ld:1" }, []),
  }, validResult());
  assert.equal(assessment.status, "ready");
  assert.equal(assessment.ready, true);
  assert.deepEqual(assessment.failedChecks, []);
  assert.ok(assessment.checks.filter((item) => item.applicable).every((item) => item.passed));
})();

(function inconsistentSetIsBlockedByAttentionVerdict() {
  const result = validResult();
  result.summary.pwEmitted = 4;
  result.lists.toRegisterPw = [];
  const assessment = Readiness.assess({
    sigem: base({ snapshotId: "sigem:1" }, []),
    pw: base({ snapshotId: "pw:1", scopeVersion: 0, scopeLdSnapshotId: "ld:old" }, []),
    ld: base({ snapshotId: "ld:1" }, []),
  }, result);
  assert.equal(assessment.status, "attention");
  assert.equal(assessment.ready, false);
  assert.ok(assessment.failedChecks.includes("emission-balance"));
  assert.ok(assessment.failedChecks.includes("register-list"));
  assert.ok(assessment.failedChecks.includes("quality-ld"));
  assert.ok(assessment.failedChecks.includes("scope-version"));
})();

(function runtimeAndUiContractsAreInstalled() {
  assert.match(bootstrap, /ensure\("sigem_pw_readiness_core\.js"\)/);
  assert.match(bootstrap, /root\.GrconSigemPwReadiness/);
  assert.match(app, /id="spw-readiness"/);
  assert.match(app, /Readiness\.assess\(state, state\.result\)/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /data-status="attention"/);
  assert.match(sw, /"sigem_pw_readiness_core\.js"/);
})();

console.log("sigem_pw_stage8_acceptance: OK — estados vazio, parcial, íntegro e atenção validados.");
