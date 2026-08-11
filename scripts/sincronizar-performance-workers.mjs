#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packagePath = path.join(root, "performance_workers.js");
const lines = fs.readFileSync(packagePath, "utf8").split("\n");
const lineIndex = lines.findIndex((line) => line.startsWith("const SOURCES="));
if (lineIndex < 0) throw new Error("Declaração SOURCES não encontrada.");

const sourceLine = lines[lineIndex];
const sources = JSON.parse(sourceLine.slice(sourceLine.indexOf("(") + 1, sourceLine.lastIndexOf(")")));
const core = fs.readFileSync(path.join(root, "core.js"), "utf8").trimEnd();
const report = fs.readFileSync(path.join(root, "report_summary.js"), "utf8").trimEnd();

function replaceModule(source, assignment, endMarker, replacement) {
  const assignmentIndex = source.indexOf(assignment);
  if (assignmentIndex < 0) return { source, replaced: false };
  const start = source.lastIndexOf("(function (root, factory) {", assignmentIndex);
  const endStart = source.indexOf(endMarker, assignmentIndex);
  if (start < 0 || endStart < 0) throw new Error(`Não foi possível delimitar ${assignment}.`);
  const end = endStart + endMarker.length;
  return { source: `${source.slice(0, start)}${replacement}${source.slice(end)}`, replaced: true };
}

const coreEnd = "    resultCounts,\n  };\n});";
const reportEnd = "  return Object.freeze({ COLUMNS, allocationReason, buildRows, buildRowsAsync, writeTable, writeTableAsync });\n});";
let coreCopies = 0;
let reportCopies = 0;

for (const name of Object.keys(sources)) {
  const coreResult = replaceModule(sources[name], "root.TriagemCore = api", coreEnd, core);
  sources[name] = coreResult.source;
  if (coreResult.replaced) coreCopies += 1;

  const reportResult = replaceModule(sources[name], "root.GrconReportSummary = api", reportEnd, report);
  sources[name] = reportResult.source;
  if (reportResult.replaced) reportCopies += 1;
}

if (coreCopies !== 3 || reportCopies !== 1) {
  throw new Error(`Quantidade inesperada de cópias: core=${coreCopies}; relatório=${reportCopies}.`);
}

lines[lineIndex] = `const SOURCES=Object.freeze(${JSON.stringify(sources)});`;
fs.writeFileSync(packagePath, lines.join("\n"));
process.stdout.write(`Sincronizado: core=${coreCopies}; relatório=${reportCopies}.\n`);
