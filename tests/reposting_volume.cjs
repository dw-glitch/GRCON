const assert = require("node:assert/strict");

const TriagemCore = require("../core.js");
globalThis.TriagemCore = TriagemCore;
const History = require("../history_core.js");
globalThis.GrconHistory = History;
const Reposting = require("../grcon_reposting_core.js");
globalThis.GrconRepostingCore = Reposting;
const Search = require("../grcon_reposting_search.js");

(async () => {
  // A revisão também precisa ser inferida quando a forma ET da rede usa nt-
  // e o Histórico traz a identidade equivalente sem nt-.
  const etWithout = "C1O_RNEST_U32_3.1.1.1_INS_RIR_SPE-AST-320019";
  const etWith = "C1O_RNEST_U32_3.1.1.1_INS_RIR_nt-SPE-AST-320019";
  assert.equal(Reposting.revisionFromName(`${etWith}_0001_A.pdf`, etWithout), "A");
  let etResult = Reposting.classifyTarget({ id: "et", document: etWithout, revision: "A", expectedByExtension: { pdf: 1 } }, [
    { id: "et-file", rootId: "r", name: `${etWith}_0001_A.pdf`, relativePath: `ET/${etWith}_0001_A.pdf`, extension: "pdf" },
  ]);
  assert.equal(etResult.state, Reposting.STATES.FOUND);

  const totalFiles = 60000;
  const targetCount = 80;
  const entries = [];
  for (let index = 0; index < totalFiles; index += 1) {
    const code = `MC-5290.00-22313-970-C1O-${String(index).padStart(5, "0")}`;
    entries.push({
      id: `file-${index}`,
      rootId: "root-volume",
      name: `${code}_0001_${index % 7 === 0 ? "B" : "A"}.pdf`,
      relativePath: `Lote/${Math.floor(index / 1000)}/${code}_0001_${index % 7 === 0 ? "B" : "A"}.pdf`,
      extension: "pdf",
      size: 1024 + index,
    });
  }

  const targets = [];
  for (let number = 100; number < 100 + targetCount; number += 1) {
    const code = `MC-5290.00-22313-970-C1O-${String(number).padStart(5, "0")}`;
    targets.push({ id: `target-${number}`, document: code, revision: number % 7 === 0 ? "B" : "A", expectedByExtension: { pdf: 1 } });
  }

  const started = Date.now();
  const candidates = await Search.filterEntriesForTargets(entries, targets, { chunkSize: 2000 });
  const elapsed = Date.now() - started;

  // Uma varredura do índice deve devolver apenas candidatos dos documentos do
  // lote, sem carregar dezenas de milhares de arquivos irrelevantes para a
  // classificação rigorosa posterior.
  assert.equal(candidates.length, targetCount);
  for (const target of targets) {
    const result = Reposting.classifyTarget(target, candidates);
    assert.equal(result.state, Reposting.STATES.FOUND, target.document);
    assert.equal(result.selected.length, 1);
    assert.ok(Reposting.matchesDocument(result.selected[0].name, target.document));
    assert.equal(result.selected[0].identifiedRevision, target.revision);
  }
  assert.ok(elapsed < 8000, `pré-filtro de ${totalFiles} arquivos levou ${elapsed}ms`);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => Search.filterEntriesForTargets(entries, targets, { signal: controller.signal }),
    (error) => error && error.name === "AbortError",
  );

  console.log(`reposting_volume: ${totalFiles} arquivos × ${targetCount} documentos → ${candidates.length} candidatos em ${elapsed}ms · cancelamento OK`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
