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

console.log("sigem_pw_ld_membership: consta na LD ⇒ no universo; fora da LD segue fora; variantes tipográficas; identidades distintas preservadas OK");
