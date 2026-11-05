"use strict";
// Histórico de eGRDTs: "Tabela por eGRDT" é uma opção a mais; "Lista e detalhe" continua o padrão e intacto.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const app = read("src/react/historico-egrdt/HistoricoEgrdtApp.tsx");
const table = read("src/react/historico-egrdt/EgrdtTable.tsx");
const adapter = read("src/react/historico-egrdt/services/historicoEgrdtAdapter.ts");
const css = read("history-phase-b.css");

// A visão atual continua existindo e é o padrão.
assert.match(app, /<RecordList h=\{h\} \/>\s*<Detail h=\{h\} \/>/, "lista e detalhe preservados");
assert.match(app, /getItem\(VIEW_MODE_KEY\) === "table" \? "table" : "list"/, "padrão = lista");
assert.match(app, /data-history-view="list"/);
assert.match(app, /data-history-view="table"/);
assert.match(app, /viewMode === "table" && !h\.showRemovedOnly/, "a tela de excluídos segue na lista");
assert.match(app, /onOpenDetail=\{\(id\) => \{ h\.select\(id\); setViewMode\("list"\); \}\}/, "Abrir detalhe completo leva ao painel atual");

// Andamento só usa o que o Teams já registra, em 4 estados com texto (cor nunca é o único sinal).
assert.match(adapter, /function deliveryStage\(record: EgrdtHistoryRecord\): DeliveryStage/);
assert.match(adapter, /confirmation === "total"\) return 3/);
assert.match(adapter, /confirmation === "partial"\) return 2/);
for (const label of ["Ainda não avisada", "Aguardando confirmação", "Postagem parcial", "Postagem confirmada"]) assert.ok(adapter.includes(label), label);
assert.match(table, /role="img" aria-label=\{labels\.join\("; "\)\}/);

// Tabela: uma linha por eGRDT, documentos na própria linha, filtros pelos cartões, sem rolagem presa (região rolável com foco).
for (const header of ["eGRDT", "Saída", "Documentos", "Arquivos", "Alocação", "Andamento", "Gerado por"]) assert.ok(table.includes(`>${header}</th>`), `coluna ${header}`);
for (const header of ["Documento", "Rev. na GRDT", "Formato", "Classificação", "Alocação"]) assert.ok(table.includes(`>${header}</th>`), `coluna de documentos ${header}`);
assert.ok(table.includes(">Situação na geração</th>"), "o valor salvo na emissão não é apresentado como status SIGEM atual");
assert.doesNotMatch(table, />Status SIGEM<\/th>/);
// "Avisada" exige entrega: tarefa só registrada ou recibo do fluxo não avança o andamento.
assert.match(adapter, /saved && !saved\.queued && !saved\.receiptOnly/);
assert.match(adapter, /Boolean\(trace\?\.delivered_at\)/);
assert.match(table, /data-egrdt-tile=\{key\}/);
assert.match(table, /aria-expanded=\{open\}/);
assert.match(table, /role="region" tabIndex=\{0\}/);
assert.match(table, /Adapter\.openTeams\(record\)/);
// CSS: rolagem horizontal permitida, sem sobreposição de colunas.
assert.match(css, /\.egrdt-table-scroll \{ overflow-x: auto;/);
assert.match(css, /\.egrdt-table, html\[data-app="GRCON"\] \.history-module \.egrdt-docs-table \{ table-layout: auto !important; \}/);
console.log("historico_egrdt_table: OK");
