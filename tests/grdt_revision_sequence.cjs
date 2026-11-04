"use strict";
// Regressão da eGRDT 2043: documentos com várias revisões foram na MESMA GRDT,
// postando a mais nova e pulando as anteriores. Regra inviolável: uma revisão por
// documento, em sequência, nenhuma inclusão manual libera.
const assert = require("node:assert/strict");
const C = require("../core.js");
const E = require("../emission.js");
const Q = require("../grdt_triage_query.js");

const DOCS = {
  "057": "RL-5290.00-22313-911-C1O-057",
  "047": "RL-5290.00-22313-91B-C1O-047",
  "060": "RL-5290.00-22313-91B-C1O-060",
  "059": "RL-5290.00-22313-91B-C1O-059",
};
function row(code, revision, extra = {}) {
  const document = DOCS[code];
  const name = `${document}_${revision}.pdf`;
  const record = { document, revision, sheet: "N-1710", title: "RELATÓRIO DE MEDIÇÃO", discipline: "PLANEJAMENTO", format: "A4", documentType: "RL", purpose: "Para Informação" };
  const finalName = C.proposedFileName(name, document, revision, "N-1710");
  const files = [{ name, finalName, file: { name, size: 1 }, relativePath: name }];
  return { document, documentKey: C.key(document), revision, sheet: "N-1710", status: "Não Postado", sigemRevisionStatus: "Não Postado",
    decision: C.READY, record, files, finalName, name, egrdt: C.buildEgrdtData(document, revision, finalName, record, "N-1710", "A4"), ...extra };
}
// O conjunto exato da eGRDT 2043, na ordem recebida por e-mail.
const rows = [row("057", "C"), row("047", "P"), row("047", "Q"), row("047", "O"), row("047", "R"), row("060", "C"), row("060", "B"), row("059", "B")];
const label = (r) => `${r.document.slice(-3)}-${r.revision}`;

// 1) Avaliação: só a revisão mais antiga pendente de cada documento pode entrar.
const blocks = E.applyRevisionSequence(rows);
const blocked = rows.filter((r) => r.revisionSequenceBlock).map(label).sort();
const allowed = rows.filter((r) => !r.revisionSequenceBlock).map(label).sort();
assert.deepEqual(blocked, ["047-P", "047-Q", "047-R", "060-C"], "revisões posteriores esperam a anterior");
assert.deepEqual(allowed, ["047-O", "057-C", "059-B", "060-B"], "só a revisão mais antiga de cada documento entra");
assert.equal(blocks.size, 4);
assert.equal(rows.find((r) => label(r) === "047-R").revisionSequenceBlock.revision, "O", "aponta a revisão mais antiga que falta");

// 2) Política de seleção: nunca elegível, e a marcação manual NÃO libera.
const r047 = rows.find((r) => label(r) === "047-R");
const policy = Q.selectionPolicy(r047);
assert.equal(policy.sequenceBlocked, true);
assert.equal(policy.autoEligible, false);
const selected = new Set(rows.map((_, i) => i)), manual = new Set(rows.map((_, i) => i));
rows.forEach((r, i) => {
  assert.equal(Q.selectionAuthorized(r, i, selected, manual), !r.revisionSequenceBlock, `${label(r)}: nem inclusão manual libera revisão fora de sequência`);
});

// 3) Plano: selecionar TUDO (o que o operador fez) é recusado, mesmo com inclusão manual.
const everything = E.createPlan(rows, new Set(rows.map((_, i) => i)), { manualForceIndices: new Set(rows.map((_, i) => i)) });
assert.ok(everything.errors.some((e) => /047.*revisão R.*revisão O/.test(e) || /revisão O ainda não foi concluída/.test(e)), "plano com todas as revisões é recusado");
assert.ok(everything.errors.length >= 4);

// 4) Plano sem a avaliação prévia na tela (linha sem flag): createPlan avalia de novo sozinho.
const bare = rows.map((r) => { const copy = { ...r }; delete copy.revisionSequenceBlock; return copy; });
const bareIndexR = bare.findIndex((r) => label(r) === "047-R");
const onlyR = E.createPlan(bare, new Set([bareIndexR]), { manualForceIndices: new Set([bareIndexR]) });
assert.ok(onlyR.errors.some((e) => /revisão O ainda não foi concluída/.test(e)), "postar só a R, pulando O/P/Q, é recusado");
assert.equal(onlyR.entries.length, 0, "nenhum arquivo da R entra no plano");

// 5) O caminho correto funciona: a revisão mais antiga de cada documento, uma por documento.
const good = rows.filter((r) => !r.revisionSequenceBlock).map((r) => rows.indexOf(r));
const plan = E.createPlan(rows, new Set(good), { manualForceIndices: new Set() });
assert.deepEqual(plan.errors.filter((e) => /revis/i.test(e) && /sequência|conclu|diferentes/.test(e)), [], "plano correto não acusa sequência: " + plan.errors.join(" | "));
assert.equal(plan.entries.length, 4);
assert.deepEqual([...new Set(plan.entries.map((e) => e.document))].length, 4, "um documento por entrada");

// 6) Rede de segurança final: mesmo documento, revisões diferentes no mesmo plano.
const conflicts = E.revisionConflicts([{ document: DOCS["047"], revision: "O" }, { document: DOCS["047"], revision: "P" }, { document: DOCS["060"], revision: "B" }]);
assert.equal(conflicts.length, 1);
assert.deepEqual(conflicts[0].revisions.sort(), ["O", "P"]);
const consistency = E.consistencyErrors({ entries: [
  { document: DOCS["047"], revision: "O", finalName: "a", originalName: "a", sheet: "N-1710", file: { name: "a" } },
  { document: DOCS["047"], revision: "P", finalName: "b", originalName: "b", sheet: "N-1710", file: { name: "b" } },
], items: [{ fileName: "a", revision: "O" }, { fileName: "b", revision: "P" }] });
assert.ok(consistency.some((e) => /não pode conter revisões diferentes do mesmo documento/.test(e)), "conferência final barra revisões diferentes na mesma GRDT");

// 7) Revisão anterior só conhecida na LD/Consulta Geral (não está nos arquivos) também barra.
const lone = [row("047", "R")];
const loneBlocks = E.applyRevisionSequence(lone, { earlierKnown: () => [
  { revision: "O", status: "Não Postado", source: "LD" }, { revision: "P", status: "Não Postado", source: "LD" } ] });
assert.equal(loneBlocks.size, 1, "R sozinha na pasta, com O e P pendentes na LD, não entra");
assert.equal(lone[0].revisionSequenceBlock.revision, "O");

// 8) Quando as anteriores já foram concluídas no SIGEM, a próxima entra normalmente.
const cleared = [row("047", "R")];
E.applyRevisionSequence(cleared, { earlierKnown: () => [
  { revision: "O", status: "Com Comentários", source: "Consulta Geral" }, { revision: "P", status: "Sem Comentários", source: "Consulta Geral" }, { revision: "Q", status: "Aceito Sem Comentários", source: "Consulta Geral" } ] });
assert.equal(cleared[0].revisionSequenceBlock || null, null, "anteriores concluídas liberam a próxima");

// 9) Anterior ainda Em Análise também barra.
const analysis = [row("047", "R")];
E.applyRevisionSequence(analysis, { earlierKnown: () => [{ revision: "Q", status: "Em Análise", source: "Consulta Geral" }] });
assert.equal(analysis[0].revisionSequenceBlock.revision, "Q");

// 10) Ao concluir/trocar a revisão, o bloqueio é recalculado e limpo (e a razão original volta).
const flip = [row("047", "O"), row("047", "P", { reason: "motivo original" })];
E.applyRevisionSequence(flip);
assert.ok(flip[1].revisionSequenceBlock);
flip[0].status = "Sem Comentários"; flip[0].sigemRevisionStatus = "Sem Comentários";
E.applyRevisionSequence(flip);
assert.equal(flip[1].revisionSequenceBlock, null, "O concluída libera a P");
assert.equal(flip[1].reason, "motivo original");

console.log("OK — eGRDT 2043: uma revisão por documento, em sequência; seleção manual, plano, conferência final e LD/Consulta Geral barram revisões fora de ordem.");
