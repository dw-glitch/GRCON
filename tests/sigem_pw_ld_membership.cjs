"use strict";
/**
 * Código que consta na LD de referência nunca pode ser reportado como "fora das LDs"
 * nem como "não cadastrado" por falha de identificação.
 */
const assert = require("node:assert/strict");
global.GrconUtils = require("../grcon_utils.js");
global.TriagemCore = require("../core.js");
const Core = require("../sigem_pw_dashboard_core.js");

const opts = { requireN1710Ld: true, requireDocumentReference: true, ldAvailable: true, sigemAvailable: true, pwAvailable: true };

// 1. Aparência de N-1710 fora do padrão estrito, mas listado na LD, pertence ao universo.
const odd = "RL-5290.00-22313-ABC-C1O-12"; // sequencial com 2 dígitos: não passa no padrão estrito
const regular = "RL-5290.00-22313-ABC-C1O-001";
const ld = [{ document: odd, revision: "0" }, { document: regular, revision: "0" }];
const pw = [odd, regular].map(document => ({ document, revision: "0", state: "Liberado", lastEmission: "Sim", company: "CSG" }));
const sigem = [odd, regular].map(document => ({ document, revision: "0", status: "Postado" }));
const model = Core.createModel(sigem, pw, ld, opts);
assert.equal(model.normalizedPw.length, 2, "ambos constam na LD e devem integrar o universo PW");
assert.equal(model.normalizedSigem.length, 2);
assert.equal(model.excludedPwN1710.length, 0, "nada que conste na LD pode ir para fora das LDs");
assert.equal(model.excludedSigemN1710.length, 0);
const all = Core.aggregateModel(model, {}, { revisionScope: "all" });
assert.equal((all.lists.pwN1710OutsideLd || []).length, 0);
assert.equal((all.lists.sigemN1710OutsideLd || []).length, 0);

// 2. Quem NÃO consta na LD continua fora (a regra do universo é preservada).
const stranger = "RL-5290.00-22313-ABC-C1O-777";
const model2 = Core.createModel(sigem, [...pw, { document: stranger, revision: "0", state: "Liberado", lastEmission: "Sim", company: "CSG" }], ld, opts);
assert.equal(model2.excludedPwN1710.length, 1);
assert.equal(model2.normalizedPw.length, 2);

// 3. Variantes tipográficas vindas do Excel resolvem para a mesma chave.
const key = Core.documentIdentity(regular).key;
const variants = [
  regular.replace(/-/g, "‑"), regular.replace(/-/g, "−"), regular.replace(/-/g, "–"),
  regular.replace("-", "-​"), "﻿" + regular, regular + " ", regular + ".", `"${regular}"`,
  regular.toLowerCase(), ` ${regular} `, regular + ".pdf",
  regular.replace(/[A-Z0-9]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)),
];
for (const variant of variants) assert.equal(Core.documentIdentity(variant).key, key, JSON.stringify(variant));
const et = "C1O_RNEST_U32_3.1.1.1_INS_RIR_PI-000123";
assert.equal(Core.documentIdentity("c1o-rnest-u32-3.1.1.1-ins-rir-pi-000123").key, Core.documentIdentity(et).key);

// 4. Identidades realmente distintas NÃO são fundidas.
assert.notEqual(Core.documentIdentity("I-" + regular).key, key, "prefixo de idioma é outra identidade");
assert.notEqual(Core.documentIdentity(regular + "_A").key, key, "sufixo de revisão não é ignorado em silêncio");
assert.notEqual(Core.documentIdentity("RL-5290.00-22313-ABC-C1O-002").key, key);


// 5. Códigos reais da LD que apareciam em "Fora das LDs": a LD os descartava na importação
//    por não serem classificados como ET/N-1710/CV (ponto no 6º grupo, 5 dígitos, área 42323, C10_).
const real = [
  "C1O_RNEST_U32_7.6.1.1_EST_PAR.SPIE_V-32014", "C1O_RNEST_U32_7.6.1.1_EST_TH.SPIE_FT-C-32002A-02A",
  "C1O_RNEST_U39_7.6.1.1_EST_TH.SPIE_P-39701A", "C10_RNEST_U32_3.9.2.1_CVL_RIR_EMT-NF-43578",
  "IS-5290.00-22313-955-C1O-00101", "IS-5290.00-42323-955-C1O-2002",
];
const matrix = [["ITEM", "DOCUMENTO", "REVISÃO"], ["", "SISTEMA ELÉTRICO", ""], ["", "N-1710", ""], ...real.map((c, i) => [String(i), c, "0"])];
const parsed = Core.parseLdMatrix(matrix, { fileName: "ld.xlsx" });
assert.equal(parsed.records.length, real.length, "todos os códigos da LD são mantidos; títulos de seção são ignorados");
for (const [name, transform] of [["igual à LD", c => c], ["PW com hífens", c => /RNEST/.test(c) ? c.replace(/_/g, "-") : c]]) {
  const m = Core.createModel(real.map(document => ({ document, revision: "0", status: "Postado" })),
    real.map(c => ({ document: transform(c), revision: "0", state: "Liberado", lastEmission: "Sim", company: "CSG" })), parsed.records, opts);
  assert.equal(m.excludedPwN1710.length, 0, name + ": nada que conste na LD pode ir para fora das LDs");
  assert.equal(m.excludedSigemN1710.length, 0);
  assert.equal(m.normalizedPw.length, real.length);
}
assert.equal(Core.documentClass("C1O_RNEST_U32_7.6.1.1_EST_TH.SPIE_FT-C-32002A-02A"), "ET", "ET com ponto no 6º grupo é ET");

console.log("sigem_pw_ld_membership: consta na LD ⇒ no universo; fora da LD segue fora; variantes tipográficas; identidades distintas preservadas OK");
