const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'posting-conference.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'posting_conference_app.js'), 'utf8');
const reposting = fs.readFileSync(path.join(root, 'grcon_reposting_app.js'), 'utf8');

function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
}

assert.match(css, /\.pc-table:not\(\.pc-grdt-table\)\s*\{[\s\S]*?min-width:\s*1[6-9]\d{2}px/i,
  'A tabela documental deve preservar uma largura mínima legível e usar scroll interno em telas menores.');
assert.match(css, /\.pc-table td\s*\{[\s\S]*?vertical-align:\s*top/i,
  'As células devem começar no topo da mesma linha visual.');
assert.doesNotMatch(css, /\.pc-table:not\(\.pc-grdt-table\)[^{}]*(?:th|td):nth-child\(/i,
  'A Conferência não pode voltar a alinhar colunas por nth-child: a seleção de repostagem é injetada dinamicamente.');
assert.match(css, /\.pc-table \.pc-document-code\s*\{/,
  'Documento precisa de regra semântica própria.');
assert.match(css, /\.pc-table \.pc-document-code strong\s*\{[\s\S]*?overflow-wrap:\s*break-word/i,
  'Código documental deve quebrar somente quando realmente necessário.');
assert.doesNotMatch(block('.pc-table .pc-document-code strong'), /overflow-wrap:\s*anywhere/i,
  'Código documental não deve quebrar agressivamente caractere por caractere.');
assert.match(css, /\.pc-note\s*\{[\s\S]*?min-width:\s*22rem/i,
  'Observação precisa de largura mínima suficiente para não criar linhas gigantes.');
assert.match(css, /\.pc-table \.grcon-repost-select\s*\{[\s\S]*?width:\s*40px/i,
  'A coluna dinâmica de seleção deve ter largura previsível.');
assert.match(css, /\.pc-pagination\s*\{[\s\S]*?min-height:\s*58px/i,
  'Paginação deve ter área própria e não ficar colada à tabela.');

assert.match(app, /<th>Documento<\/th><th>Tipo<\/th><th>Disciplina<\/th><th>Envios \/ eGRDTs<\/th><th>Último envio<\/th><th>Rev\. atual<\/th><th>Rev\. SIGEM<\/th><th>Conferência<\/th><th>Status SIGEM<\/th><th>Confirmado em<\/th><th>Observação<\/th>/,
  'A ordem funcional das colunas da Conferência deve permanecer preservada.');
assert.match(reposting, /headRow\.insertAdjacentHTML\("afterbegin", '<th class="grcon-repost-select"/,
  'O teste deve continuar cobrindo a integração que injeta a coluna de seleção antes de Documento.');

console.log('OK — contrato visual da Conferência preservado sem depender da posição das colunas.');
