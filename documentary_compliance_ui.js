(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  let currentRows = [], pageSize = 50, query = '', signature = '';
  function renderRows() {
    const target = document.getElementById('documentary-compliance-documents');
    if (!target) return;
    const rows = currentRows.filter(row => !query || String(row.document || '').toLocaleLowerCase('pt-BR').includes(query));
    target.innerHTML = rows.slice(0, pageSize).map(row => {
      const audit = root.GrconDocumentaryCompliance.auditRow(row);
      const groups = audit.components ? Object.entries(audit.components).map(([key, value]) => `<dt>${escape({ language: 'Idioma', category: 'Categoria', installation: 'Instalação', activity: 'Área de atividade', serviceClass: 'Classe de serviço', origin: 'Origem', sequence: 'Sequencial' }[key])}</dt><dd>${escape(value || (key === 'language' ? 'Português' : '—'))}</dd>`).join('') : '';
      const findings = audit.results.map(result => `<li><strong>${escape(result.configuredSeverity === 'info' ? 'INFORMAÇÃO' : result.outcome)}</strong> — ${escape(result.message)}<small>${escape(result.ruleId)} · ${escape(result.norm)} · ${escape(result.source?.label)} · Rev. ${escape(result.revision)} · § ${escape(result.section)}${result.valueFound ? ` · Encontrado: ${escape(result.valueFound)}` : ''}${result.valueExpected ? ` · Esperado: ${escape(result.valueExpected)}` : ''}</small></li>`).join('');
      return `<details class="compliance-document"><summary>${escape(row.document || row.name)} · Rev. ${escape(row.egrdt?.revision || row.revision)} · ${escape(audit.outcome)}</summary>${groups ? `<dl class="compliance-components">${groups}</dl>` : ''}<ul>${findings || '<li>Nenhuma regra normativa aplicável foi determinada para este documento.</li>'}</ul></details>`;
    }).join('');
    document.getElementById('documentary-compliance-more').hidden = rows.length <= pageSize;
    document.getElementById('documentary-compliance-page').textContent = `${Math.min(rows.length, pageSize)} de ${rows.length} documentos`;
  }
  function render(rows) {
    const host = document.getElementById('documentary-compliance');
    if (!host || !root.GrconDocumentaryCompliance) return;
    if (rows !== currentRows) { query = ''; pageSize = 50; host.querySelector('input').value = ''; }
    currentRows = rows || [];
    const counts = root.GrconDocumentaryCompliance.summary(currentRows);
    const nextSignature = JSON.stringify(counts) + currentRows.map(row => `${row.document}|${row.normativeValidation?.generatedAt}`).join(';');
    const label = `Conformidade documental · ${counts.compliant} conformes · ${counts.warnings} com alertas · ${counts.blocks} bloqueios · ${counts.information} com informações · ${counts.notApplicable} sem regra aplicável`;
    host.querySelector('summary').textContent = label;
    host.hidden = currentRows.length === 0;
    if (signature === nextSignature) return;
    signature = nextSignature;
    if (host.open) renderRows();
    if (!host.dataset.bound) {
      host.dataset.bound = 'true';
      host.addEventListener('toggle', () => { if (host.open) renderRows(); });
      host.querySelector('input').addEventListener('input', event => { query = event.target.value.trim().toLocaleLowerCase('pt-BR'); pageSize = 50; renderRows(); });
      host.querySelector('button').addEventListener('click', () => { pageSize += 50; renderRows(); });
    }
  }
  root.GrconDocumentaryComplianceUi = Object.freeze({ render });
})(typeof globalThis !== 'undefined' ? globalThis : this);
