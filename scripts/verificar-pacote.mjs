#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const facadePath = path.join(root, "performance_workers.js");
const facade = fs.readFileSync(facadePath, "utf8");
const workers = {
  ld: {
    file: "workers/ld.worker.js",
    required: ["../grcon_contracts.js", "../xlsx.full.min.js", "../core.js"],
  },
  triage: {
    file: "workers/triage.worker.js",
    required: ["../grcon_contracts.js", "../core.js", "../ld_conflicts.js", "../timeline_core.js"],
  },
  export: {
    file: "workers/export.worker.js",
    required: ["../grdt_workbook.js", "../exceljs.min.js", "../jszip.min.js", "../core.js", "../report_summary.js"],
  },
};

const problems = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

check(!facade.includes("const SOURCES="), "performance_workers.js ainda contém módulos embutidos");
check(!facade.includes("URL.createObjectURL"), "performance_workers.js ainda cria Workers a partir de Blob");

for (const [kind, spec] of Object.entries(workers)) {
  const workerPath = path.join(root, spec.file);
  check(facade.includes(spec.file), `facade não aponta para ${spec.file}`);
  if (!fs.existsSync(workerPath)) {
    problems.push(`${spec.file}: arquivo ausente`);
    continue;
  }
  const source = fs.readFileSync(workerPath, "utf8");
  check(source.includes("importScripts("), `${spec.file}: não carrega os módulos externos`);
  check(!source.includes("root.TriagemCore = api"), `${spec.file}: contém cópia embutida de core.js`);
  check(!source.includes("root.GrconReportSummary = api"), `${spec.file}: contém cópia embutida de report_summary.js`);
  for (const required of spec.required) {
    check(source.includes(JSON.stringify(required)), `${spec.file}: dependência obrigatória ${required} ausente`);
  }
  const imports = [...source.matchAll(/["'](\.\.\/[^"']+)["']/g)].map((match) => match[1]);
  for (const imported of imports) {
    const target = path.resolve(path.dirname(workerPath), imported);
    check(fs.existsSync(target), `${spec.file}: importScripts aponta para arquivo inexistente: ${imported}`);
  }
  console.log(`✓ ${kind.padEnd(7)} ${spec.file} (${fs.statSync(workerPath).size.toLocaleString("pt-BR")} bytes)`);
}

const exportWorker = fs.readFileSync(path.join(root, workers.export.file), "utf8");
check(exportWorker.includes("writeExecutiveTableAsync"), "worker de exportação não gera o Resumo Executivo");
check(exportWorker.includes("Auditoria detalhada"), "worker de exportação não gera a aba Auditoria detalhada");

if (problems.length) {
  console.error("\nFALHOU — arquitetura dos Workers inconsistente:");
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

console.log("\nOK — Workers externos usam diretamente os módulos atuais do GRCON.");
