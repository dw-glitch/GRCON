"use strict";
// Matriz de revisões: ciclo completo do documento nos dois sistemas, com
// revisões puladas marcadas e sem inventar revisões inexistentes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Revision = require("../sigem_pw_revision_core.js");

const sigem = [
  { revision: "C", status: "Em Análise" },
  { revision: "A", status: "Postado" },
  { revision: "0", status: "Sem Comentários" },
];
const pw = [
  { revision: "0", status: "Liberado", emitted: true },
  { revision: "B", status: "Liberado", emitted: true },
  { revision: "A", status: "Cadastrado", emitted: false },
];
const m = Revision.revisionMatrix(sigem, pw);
assert.deepEqual(m.columns.map((c) => c.revision), ["0", "A", "B", "C"], "colunas em ordem crescente, só as que existem");
assert.deepEqual(JSON.parse(JSON.stringify(m.skipped)), { sigem: ["B"], pw: [] }, "B existe no PW, ficou para trás de C no SIGEM: pulada");
assert.equal(m.hasSkipped, true);
const byRev = Object.fromEntries(m.columns.map((c) => [c.revision, c]));
assert.equal(byRev.B.sigem, null);
assert.equal(byRev.B.sigemSkipped, true);
assert.equal(byRev.C.pw, null);
assert.equal(byRev.C.pwSkipped, false, "revisão mais nova que a última do PW ainda não foi pulada: só não chegou");
assert.equal(byRev.A.pw.tone, "registered", "cadastrada no PW sem emissão");
assert.equal(byRev.A.sigem.tone, "done");
assert.equal(byRev.C.sigem.tone, "progress");
assert.equal(byRev["0"].pw.tone, "done");

// Documento sem lacunas
const clean = Revision.revisionMatrix([{ revision: "0", status: "Postado" }, { revision: "A", status: "Postado" }], [{ revision: "0", status: "L", emitted: true }, { revision: "A", status: "L", emitted: true }]);
assert.equal(clean.hasSkipped, false);
// Sem revisões válidas: nada de colunas inventadas
assert.equal(Revision.revisionMatrix([], []).columns.length, 0);
assert.equal(Revision.revisionMatrix([{ revision: "Não informada no PW", status: "" }], []).columns.length, 0);

// Tons
assert.equal(Revision.statusTone("Não Postado", "sigem"), "planned");
assert.equal(Revision.statusTone("Recusado", "sigem"), "bad");
assert.equal(Revision.statusTone("Com Comentários", "sigem"), "done");
assert.equal(Revision.statusTone("", "sigem"), "none");
assert.equal(Revision.statusTone("", "pw", false), "planned");

// Integração: alternância Lista/Matriz sem retirar a tabela existente
const section = fs.readFileSync(path.join(__dirname, "..", "src/react/sigem-pw/revision/SigemPwRevisionSection.tsx"), "utf8");
assert.match(section, /SigemPwRevisionMatrixView/);
assert.match(section, /SigemPwRevisionTable/);
assert.match(section, /Matriz de revisões/);
console.log("sigem_pw_revision_matrix: OK");
