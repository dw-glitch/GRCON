"use strict";
// 1) PDF, XLSX e DOCX do mesmo documento/revisão são UM documento (inclusive com "_" sobrando no nome).
// 2) A tela e os dois Excel da triagem dizem POR QUE uma linha está Bloqueada/Excluída/Não incluir.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../core.js");
const Q = require("../grdt_triage_query.js");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const doc = "PR-5290.00-22313-98V-C1O-040";
const evidence = (name) => C.fileRevisionEvidence(name, doc);
const key = (name, id) => C.packageGroupKey({ id, documentKey: doc, name }, evidence(name));

// "_" sobrando depois da revisão não impede reconhecer a revisão.
assert.equal(evidence(`${doc}_C_.pdf`).valid, true);
assert.equal(evidence(`${doc}_C_.pdf`).revision, "C");
assert.equal(evidence(`${doc}_0001_B_.xlsx`).revision, "B");
assert.equal(evidence(`${doc}_C.pdf`).revision, "C", "nome sem '_' sobrando continua igual");
// Um "_" solto sem revisão não inventa revisão: continua a regra antiga (sem sufixo = revisão 0).
assert.equal(evidence(`${doc}_.pdf`).revision, "0");
// Texto qualquer depois do código não vira revisão.
assert.equal(evidence(`${doc}_rascunho_final_.pdf`).valid, false);

// Mesmo documento e revisão, extensões diferentes: um pacote só.
assert.equal(key(`${doc}_C_.pdf`, 1), key(`${doc}_C_.xlsx`, 2), "PDF e XLSX com '_' sobrando");
assert.equal(key(`${doc}_C.pdf`, 1), key(`${doc}_C.docx`, 2), "PDF e DOCX");
assert.equal(key(`${doc}_C_.pdf`, 1), key(`${doc}_C.xlsx`, 2), "com e sem '_' final");
// Revisões diferentes continuam pacotes independentes.
assert.notEqual(key(`${doc}_B.pdf`, 1), key(`${doc}_C.xlsx`, 2));
// Sem revisão reconhecível: só agrupa nome-base idêntico; nomes diferentes não são presumidos iguais.
assert.equal(key(`${doc}_rascunho.pdf`, 1), key(`${doc}_rascunho.xlsx`, 2));
assert.notEqual(key(`${doc}_rascunho.pdf`, 1), key(`${doc}_versao-final.xlsx`, 2));
// Documentos diferentes nunca se misturam.
assert.notEqual(C.packageGroupKey({ id: 1, documentKey: "A", name: "A_C.pdf" }, evidence("A_C.pdf")), C.packageGroupKey({ id: 2, documentKey: "B", name: "A_C.pdf" }, evidence("A_C.pdf")));
// Linha sem documento identificado não agrupa com ninguém.
assert.equal(C.packageGroupKey({ id: 7, documentKey: "", name: "x.pdf" }, evidence("x.pdf")), "file:7");

// Motivo da situação.
const row = (extra) => ({ document: doc, revision: "C", status: "Não Postado", decision: C.READY, hardBlock: false, ...extra });
assert.equal(Q.situationReason(row(), { included: true }), null, "linha que entra normalmente não precisa de explicação");
const seq = Q.situationReason(row({ revisionSequenceBlock: { revision: "B", message: "A revisão B ainda não foi concluída no SIGEM." } }), { included: false });
assert.equal(seq.code, "sequence"); assert.match(seq.short, /Aguarda a revisão B/); assert.match(seq.detail, /não foi concluída/);
assert.equal(Q.situationReason(row({ blockCode: "not_allocated" }), { included: false }).code, "not_allocated");
assert.equal(Q.situationReason(row({ blockCode: "not_allocated_conflict" }), { included: false }).code, "allocation_conflict");
assert.equal(Q.situationReason(row({ blockingRevision: "B" }), { included: false }).code, "previous_in_analysis");
assert.equal(Q.situationReason(row({ status: "Xpto" }), { included: false }).code, "status_unresolved");
const discard = Q.situationReason(row({ decision: C.DISCARD, reason: "Já enviada na eGRDT 12." }), { included: false });
assert.equal(discard.code, "triage_discard"); assert.equal(discard.detail, "Já enviada na eGRDT 12.");
const hard = Q.situationReason(row({ status: "Identidade do arquivo divergente", hardBlock: true, blockCode: "document_identity_mismatch", reason: "O arquivo A não corresponde ao código B." }), { included: false });
assert.equal(hard.detail, "O arquivo A não corresponde ao código B.", "o motivo da triagem aparece como está");
assert.equal(Q.situationReason(row(), { included: false, compositionErrors: ["Falta o PDF do par ET."] }).code, "composition");
assert.equal(Q.situationReason(row(), { included: false }).code, "not_selected");
// Inclusão manual continua mostrando o impedimento original.
assert.match(Q.situationReason(row({ blockCode: "not_allocated" }), { included: true, manual: true }).short, /incluído manualmente/);

// Tela e Excel usam a mesma função.
const app = read("app.js");
assert.match(app, /function situationWhyFor\(row, index\)/);
assert.match(app, /const situationWhy = situationWhyFor\(row, index\)/);
assert.match(app, /class="grdt-why"/);
assert.match(app, /situationWhy: Number\.isInteger\(rowIndex\) && row \? situationWhyFor\(row, rowIndex\)/, "o worker do Excel recebe a mesma resposta da tela");
assert.match(app, /"POR QUE ESTÁ NESTA SITUAÇÃO":/, "aba Triagem (caminho legado)");
assert.match(read("workers/export.worker.js"), /"POR QUE ESTÁ NESTA SITUAÇÃO":row\.situationWhy/, "aba Triagem (worker)");
const summary = read("report_summary.js");
assert.match(summary, /header: "POR QUE ESTÁ NESTA SITUAÇÃO", key: "screenReason"/, "aba Resumo");
assert.match(summary, /header: "SITUAÇÃO NA TELA", key: "screenSituation"/);
assert.match(app, /C\.packageGroupKey\(row, fileRevision\)/, "agrupamento do pacote usa a regra central");
console.log("grdt_package_and_reason: OK");
