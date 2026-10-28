"use strict";
// A identificação técnica de C1O continua existindo, mas não estabelece
// responsabilidade pela emissão no ProjectWise.
const assert = require("node:assert/strict");
const Core = require("../sigem_pw_dashboard_core.js");
assert.equal(Core.isC1OCode("PR-5290.00-22313-955-C1O-121"), true);
assert.equal(Core.isC1OCode("PR-5290.00-22313-955-C10-121"), false);
assert.equal(Core.isPwCompanyInScope({document:"PR-5290.00-22313-955-C1O-121",company:"ABC"}), false);
assert.equal(Core.isPwCompanyInScope({document:"PR-5290.00-22313-955-C2O-121",company:"CSG"}), true);
require("./sigem_pw_company_column_c.cjs");
console.log("sigem_pw_c1o_comparison: regra histórica C1O desacoplada do escopo por empresa — OK");
