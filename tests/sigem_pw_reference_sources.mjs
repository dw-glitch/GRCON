import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourceFile = new URL("../src/react/sigem-pw/services/sigemPwReferenceSources.ts", import.meta.url);
const output = ts.transpileModule(readFileSync(sourceFile, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", "require", output)(module.exports, module, require);
const { buildReferenceBase, listedSources } = module.exports;

const codeA = "CR-5290.00-22313-911-C1O-001";
const codeB = "PR-5290.00-22313-122-C1O-002";
const identity = code => ({ key: code.trim().toUpperCase(), canonical: code.trim().toUpperCase() });
const base0 = { meta: null, records: [] };
const file = (name, records) => ({
  file: { name, size: records.length * 100 },
  meta: { importedAt: "2026-10-29T00:00:00Z" },
  records,
});
const ld1 = file("LD-001.xlsx", [
  { document: codeA, revision: "0", title: "Cronograma" },
]);
const ld2 = file("LD-002.xlsx", [
  { document: codeA, revision: "B", title: "Cronograma" },
  { document: codeB, revision: "0", title: "Plano" },
]);
const imported = buildReferenceBase(base0, [ld1, ld2], identity);
assert.equal(listedSources(imported).length, 2);
assert.equal(imported.records.length, 2, "duplicate code in multiple LDs is counted once");
assert.equal(imported.meta.referenceConflictCount, 1);
assert.equal(imported.records.find(r => r.documentKey === codeA).revision, "", "conflicting revision is not picked silently");
const ld2Id = listedSources(imported).find(s => s.fileName === "LD-002.xlsx").id;
const inactive = buildReferenceBase(imported, [], identity, ld2Id, false);
assert.equal(inactive.records.length, 1, "deactivating one source recalculates the active universe");
assert.equal(inactive.sourceRecords.length, 3, "inactive source rows remain in the history");
const restored = buildReferenceBase(inactive, [], identity, ld2Id, true);
assert.equal(restored.records.length, 2);
const updated = buildReferenceBase(restored, [file("LD-002.xlsx", [
  { document: codeB, revision: "A", title: "Plano atualizado" },
])], identity);
assert.equal(listedSources(updated).length, 2, "same filename updates only that source");
assert.equal(updated.records.length, 2);
assert.equal(updated.meta.referenceConflictCount, 0);
console.log("SIGEM × PW: multiple source import, conflicts, activation and replacement OK");
