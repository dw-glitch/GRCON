#!/usr/bin/env node
// Confere se as cópias de código embutidas em performance_workers.js ainda
// correspondem aos arquivos-fonte.
//
// Por que isto existe: performance_workers.js carrega, dentro de strings, cópias
// completas de core.js, grcon_contracts.js e report_summary.js — é esse código
// que roda de fato nos Web Workers, que é o caminho usado na maioria dos
// navegadores. Uma correção feita só no arquivo-fonte NÃO chega ao usuário, e
// nada avisava. Pior: uma cópia pode ser corrigida e a outra não.
//
// A comparação ignora comentários e espaçamento (reescrever um comentário não é
// deriva de lógica) e exige que, para cada bloco que contém um módulo, o código
// do módulo esteja presente por inteiro.

import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const PACOTE = path.join(raiz, "performance_workers.js");
const FONTES = ["core.js", "grcon_contracts.js", "report_summary.js"];

function lerSources() {
  const linhas = fs.readFileSync(PACOTE, "utf8").split("\n");
  const linha = linhas.find((l) => l.startsWith("const SOURCES="));
  if (!linha) throw new Error("Não encontrei a declaração SOURCES em performance_workers.js");
  const inicio = linha.indexOf("(") + 1;
  const fim = linha.lastIndexOf(")");
  return JSON.parse(linha.slice(inicio, fim));
}

// Remove comentários de linha inteira e blocos /* */ que começam a linha, e
// normaliza espaços. Não mexe em comentários no fim de uma linha de código,
// para não correr o risco de recortar conteúdo de strings.
function normalizar(codigo) {
  const semBloco = codigo.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "");
  const semLinha = semBloco
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  return semLinha.replace(/\s+/g, " ").trim();
}

const sources = lerSources();
const blocos = Object.entries(sources).map(([nome, codigo]) => [nome, normalizar(codigo)]);
const problemas = [];

console.log(`Pacote: ${path.basename(PACOTE)} — blocos embutidos: ${blocos.map(([n]) => n).join(", ")}\n`);

for (const arquivo of FONTES) {
  const caminho = path.join(raiz, arquivo);
  if (!fs.existsSync(caminho)) { problemas.push(`${arquivo}: arquivo-fonte não existe`); continue; }
  const fonte = normalizar(fs.readFileSync(caminho, "utf8"));
  // Assinatura curta para descobrir em quais blocos este módulo foi embutido.
  const assinatura = fonte.slice(0, 200);
  const contendo = blocos.filter(([, codigo]) => codigo.includes(assinatura)).map(([nome]) => nome);

  if (!contendo.length) {
    problemas.push(`${arquivo}: não está embutido em nenhum bloco do pacote (esperado em pelo menos um)`);
    console.log(`✗ ${arquivo.padEnd(22)} não encontrado no pacote`);
    continue;
  }

  const desatualizados = blocos
    .filter(([nome]) => contendo.includes(nome))
    .filter(([, codigo]) => !codigo.includes(fonte))
    .map(([nome]) => nome);

  if (desatualizados.length) {
    problemas.push(`${arquivo}: cópia desatualizada em ${desatualizados.join(", ")} — regere performance_workers.js`);
    console.log(`✗ ${arquivo.padEnd(22)} em ${contendo.join(", ")} — DESATUALIZADO em: ${desatualizados.join(", ")}`);
  } else {
    console.log(`✓ ${arquivo.padEnd(22)} em sincronia (${contendo.join(", ")})`);
  }
}

if (problemas.length) {
  console.error(`\nFALHOU — o código que roda nos Workers não confere com os arquivos-fonte:`);
  problemas.forEach((p) => console.error(`  - ${p}`));
  console.error(`\nUma correção feita só no arquivo-fonte não chega ao usuário.`);
  process.exit(1);
}
console.log("\nOK — as cópias embutidas conferem com os arquivos-fonte.");
