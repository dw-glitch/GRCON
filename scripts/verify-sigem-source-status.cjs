'use strict';
// Read-only verification against the original Excel, without uploading data.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const XLSX = require('../xlsx.full.min.js');
global.XLSX = XLSX;
const Conference = require('../posting_conference_core.js');
const Query = require('../shared_sigem_query_core.js');
const file = process.argv[2];
if (!file) throw new Error('Informe o caminho da Consulta Geral original (.xlsx).');
const workbook = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
const parsed = Conference.parseWorkbook(workbook, { fileName: require('node:path').basename(file) });
assert.ok(parsed.ok, parsed.errors.join(' '));
const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[parsed.meta.sheetName], { header: 1, raw: false, defval: '', blankrows: true });
const detected = Conference.detectColumns(matrix);
const columns = detected.columns, groups = new Map();
for (const row of matrix.slice(detected.rowIndex + 1)) {
  if (!row[columns.document] || !row[columns.revision]) continue;
  const document = row[columns.document], revision = Query.revision(row[columns.revision]);
  const id = Query.canonical(document) + '::' + revision;
  const date = Math.max(...[row[columns.modifiedAt], row[columns.includedAt]].map(Conference.parseSourceDate).filter(Number.isFinite), -Infinity);
  const status = String(row[columns.status] || '').trim();
  const previous = groups.get(id);
  if (!previous || date > previous.date) groups.set(id, { document, revision, date, statuses: new Set([status]) });
  else if (date === previous.date) previous.statuses.add(status);
}
const context = Query.context({ records: parsed.records });
let checked = 0, conflicts = 0, empty = 0;
for (const group of groups.values()) {
  const result = Query.resolve(group.document, group.revision, context, 'STALE STATUS');
  if (group.statuses.size > 1) { assert.ok(result.conflict || result.incomplete); conflicts++; }
  else if (!group.statuses.values().next().value) { assert.ok(result.incomplete); empty++; }
  else { assert.equal(result.status, group.statuses.values().next().value, group.document + ' ' + group.revision); checked++; }
}
console.log(JSON.stringify({ records: parsed.records.length, checkedPairs: checked, conflictingPairs: conflicts, emptyPairs: empty, headerRow: parsed.meta.headerRow, statusColumn: parsed.meta.columns.status }, null, 2));
