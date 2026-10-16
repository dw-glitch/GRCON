'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Executa a função real da interface, com um navegador simulado, para prevenir
// o retorno do desvio que substituía o download por "Tarefas".
const source = fs.readFileSync('posting_conference_app.js', 'utf8');
const start = source.indexOf('  async function exportReport() {');
const end = source.indexOf('\n\n  async function activate() {', start);
assert.ok(start >= 0 && end > start, 'função de exportação encontrada');
const exportSource = source.slice(start, end);

async function testDownload(view) {
  const rows = [{ document: 'DOC-1', revisionSent: 'A', egrdtNumber: 'GRDT-1' }];
  const group = { historyId: 'h1', egrdtNumber: 'GRDT-1', rows };
  const downloads = [], generated = [], notifications = [];
  let queued = 0, busy = false, renders = 0;
  const root = {
    GrconBackgroundJobs: { available: () => true, submit: async () => { queued++; throw new Error('Exportação desviada para tarefas'); } },
    GrconTeamsTrace: { forExport: async () => [] },
    GrconCloud: { state: { membership: { workspace_id: 'workspace-1' } } },
  };
  const Report = {
    buildWorkbook: async (items, options) => {
      generated.push({ items, options });
      return new Uint8Array([80, 75, 3, 4]);
    },
    downloadName: ({ scopeLabel }) => 'Conferencia_' + (scopeLabel || 'Geral') + '.xlsx',
  };
  const anchor = {
    click() { downloads.push({ download: this.download, href: this.href }); },
    remove() {},
  };
  const document = {
    createElement(tag) { assert.equal(tag, 'a'); return anchor; },
    body: { appendChild(node) { assert.equal(node, anchor); } },
  };
  const scope = {
    Report, root, document, Blob, Intl, Uint8Array,
    URL: { createObjectURL(blob) { assert.ok(blob instanceof Blob); return 'blob:grcon-teste'; }, revokeObjectURL() {} },
    state: { view, busy: false, base: { meta: { fileName: 'Consulta Geral.xlsx', importedAt: '2026-10-16T12:00:00Z' } }, filters: { grdt: '' } },
    documentRows: () => rows,
    filteredPendingRows: () => [{ ...rows[0], historyId: 'h1' }],
    filteredPendingDocuments: () => rows,
    detailedGroups: () => [group],
    filteredGroups: () => [group],
    filteredDocumentRows: () => rows,
    setBusy: value => { busy = value; },
    render: () => { renders++; },
    fmt: value => String(value),
    notify: (message, kind) => notifications.push({ message, kind }),
    currentOperation: null,
    setTimeout: () => {},
    console,
  };
  await vm.runInNewContext(exportSource + '\nexportReport()', scope);
  assert.equal(queued, 0, 'nunca criar tarefa ao clicar em Relatório Excel');
  assert.equal(generated.length, 1, 'gerar XLSX no navegador');
  assert.equal(downloads.length, 1, 'iniciar download no mesmo clique');
  assert.match(downloads[0].download, /^Conferencia_.*\.xlsx$/);
  assert.equal(downloads[0].href, 'blob:grcon-teste');
  assert.equal(generated[0].options.pending, view === 'pending');
  assert.equal(generated[0].options.mode, view === 'documents' ? 'documents' : 'events');
  assert.equal(busy, false, 'limpar estado de processamento');
  assert.equal(renders, 1);
  assert.equal(notifications.at(-1).kind, 'success');
}

(async () => {
  for (const view of ['documents', 'pending', 'grdts']) await testDownload(view);
  console.log('Conferência: download XLSX direto em documentos, pendências e por eGRDT; Tarefas permanece independente.');
})().catch(error => { console.error(error); process.exitCode = 1; });
