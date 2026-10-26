import assert from 'node:assert/strict';
import {verifyPublishedAsset} from './deployment-asset-verification.mjs';
import { readFile } from 'node:fs/promises';

const base = process.env.GRCON_PRODUCTION_URL;
const expectedCommit = process.env.GITHUB_SHA;
assert.ok(base && new URL(base).protocol === 'https:', 'Origem de produção HTTPS obrigatória.');
assert.ok(/^[0-9a-f]{40}$/.test(expectedCommit || ''), 'Commit esperado obrigatório.');
async function get(path) {
  return fetch(new URL(path, base), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
}
const rootResponse = await get('/?verify=' + expectedCommit);
assert.equal(rootResponse.status, 200, 'Página inicial publicada indisponível.');
assert.match(rootResponse.headers.get('content-security-policy') || '', /img-src[^;]+https:\/\/kvyrttccwzdhasplfxnr\.supabase\.co/, 'CSP publicada deve permitir a foto privada do perfil.');
let metadata;
for (let attempt = 0; attempt < 6; attempt++) {
  const response = await get('/deployment-meta.json?verify=' + expectedCommit);
  assert.equal(response.status, 200, 'Identificação da publicação indisponível.');
  metadata = await response.json();
  if (metadata.commit === expectedCommit) break;
  if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.equal(metadata.commit, expectedCommit, 'Produção deve servir exatamente o commit publicado.');
assert.equal(metadata.provider, 'cloudflare');
// Teams retrieves this decorative asset without the GRCON user's session.
const teamsMascot = await get('/assets/mascot/grcon-mascot-teams-thumbsup.png');
assert.equal(teamsMascot.status, 200, 'Mascote do Teams deve ser público.');
assert.match(teamsMascot.headers.get('content-type') || '', /^image\/png\b/);
assert.equal(teamsMascot.headers.get('cross-origin-resource-policy'), null, 'Mascote do Teams não pode bloquear incorporação externa.');
assert.equal(teamsMascot.headers.get('access-control-allow-origin'), '*');
assert.deepEqual(Buffer.from(await teamsMascot.arrayBuffer()), await readFile(new URL('../assets/mascot/grcon-mascot-teams-thumbsup.png', import.meta.url)), 'PNG público deve corresponder ao asset validado.');
const page = await get('/');
assert.equal(page.status, 200);
const html = await page.text();
for (const path of ['contract_storage.js', 'contract_admin_app.js', 'sigem_status_monitoring_app.js', 'document_vault_app.js', 'egrdt_email_reply_ui.js']) {
  assert.ok(html.includes(path), 'Página sem módulo ' + path);
  const response = await get('/' + path);
  assert.equal(response.status, 200, 'Módulo indisponível: ' + path);
  assert.ok((await response.text()).length > 100, 'Módulo vazio: ' + path);
}
const healthResponse = await get('/api/document-vault/health');
const health = await healthResponse.json().catch(() => null);
const configured = value => typeof value === 'boolean' ? String(value) : 'desconhecido';
assert.equal(healthResponse.status, 200, 'Saúde do Cofre HTTP ' + healthResponse.status + ': Supabase configurado=' + configured(health?.supabaseConfigured) + ', R2 configurado=' + configured(health?.r2Configured) + '. O health verifica presença da configuração, não a validade da chave.');
assert.equal(health.ok, true, 'Cofre deve estar configurado.');
assert.equal(health.r2Configured, true);
assert.equal(health.supabaseConfigured, true);
assert.equal(typeof health.powerAutomateConfigured, 'boolean', 'Health deve informar se o Power Automate está configurado sem expor a URL.');
assert.equal(typeof health.powerAutomateUrlValid, 'boolean', 'Health deve informar se a URL configurada tem formato aceito.');
const anonymous = await get('/api/document-vault/list');
assert.equal(anonymous.status, 401, 'Catálogo deve exigir sessão.');
const verifiedAssets = ['sigem_pw_dashboard_core.js', 'workers/sigem_pw_dashboard.worker.js', 'react-dist/sigem-pw-dashboard-app.js', 'document-vault.css', 'sw.js', 'sigem_pw_revision_report.js', 'workers/export.worker.js', 'react-dist/sigem-pw-evolution-app.js'];
verifiedAssets.push('grcon_mascot_controller_v4.js', 'grcon_mascot_runner.js', 'assets/mascot/video/grcon-mascot-papers-running-alpha.webm', 'assets/mascot/grcon-mascot-papers-fallback.png');
verifiedAssets.push('app.js', 'app-ui.js', 'p1_ux.js', 'document_vault_app.js');
verifiedAssets.push('grcon_service_worker.js');
verifiedAssets.push('grcon_file_access.js');
verifiedAssets.push('egrdt_email_reply.js', 'egrdt_email_reply_ui.js', 'egrdt-email-reply.css');
verifiedAssets.push('background_jobs_app.js','background-jobs.css','client_diagnostics.js');
verifiedAssets.push('docx-pdf.css','docx_pdf_layout.js','docx_pdf_core.js','docx_pdf_app.js','assets/vendor/pdfjs/pdf.min.mjs','assets/vendor/pdfjs/pdf.worker.min.mjs');
verifiedAssets.push('shared_pw_query_app.js','allocation_generator_core.js','allocation_ld_export.js','allocation-generator.css','workers/allocation.worker.js','react-dist/allocation-app.js','vendor/recon/allocation_core.js','vendor/recon/allocation_workbook.js');
verifiedAssets.push('document_explanations.js','posting_conference_bootstrap.js');
verifiedAssets.push('sigem_pw_scope_fix.js','sigem_pw_revision_core.js','sigem_pw_readiness_core.js','sigem_pw_evolution_core.js','sigem_pw_history_core.js','sigem-pw-dashboard.css');
verifiedAssets.push('egrdt_teams_trace_app.js','egrdt_teams_trace_core.js','history_report.js','grcon_reposting_report.js');
verifiedAssets.push('document_task_queue.js','document_master_app.js','import_review.js','managerial_report.js','grcon_backup.js','productivity_center.js');
verifiedAssets.push('macro5_flow_core.js', 'macro5_flow_app.js', 'sigem_general_query_app.js', 'core.js', 'grcon_utils.js', 'emission.js', 'grdt_triage_query.js', 'grcon-version-c-phase2.css', 'posting_conference_core.js', 'posting_conference_refinement.js', 'posting_conference_app.js', 'posting_conference_report.js', 'posting-conference.css');
verifiedAssets.push('performance_workers.js', 'operation_tasks.js', 'operation_progress.js', 'operation_progress.css', 'workers/data.worker.js', 'consultation_index.js', 'data_exports.js', 'emission_dashboard_report.js', 'allocation_dashboard_app.js', 'allocation_registry_app.js', 'planned_documents_app.js', 'requests_control_app.js', 'sigem_posting_central_app.js', 'sigem_status_monitoring_app.js', 'history_report_worker.js', 'retomar.js', 'grcon_module_loader.js', 'workspace.js', 'react-dist/consultas-app.js', 'react-dist/historico-egrdt-app.js', 'react-dist/pdf-tools-app.js', 'react-dist/cover-document-app.js');
for (const path of verifiedAssets) {
  const expected = await readFile(new URL('../' + path, import.meta.url));
  await verifyPublishedAsset(attempt=>get('/'+path+'?verify='+expectedCommit+'&attempt='+attempt),expected,{label:path});
}
const jobsAnonymous=await fetch(new URL('/api/background-jobs/list?workspace=00000000-0000-4000-8000-000000000001',base),{signal:AbortSignal.timeout(20000)});
assert.equal(jobsAnonymous.status,401,'Tarefas devem exigir sessão.');
const githubAnonymous = await fetch(new URL('/api/egrdt-teams/github', base), {method:'POST',body:'{}',signal:AbortSignal.timeout(20000)});
assert.equal(githubAnonymous.status,401,'Retorno GitHub deve exigir OIDC assinado.');
console.log(JSON.stringify({ ok: true, url: base, commit: metadata.commit, provider: metadata.provider, modules: 5, verifiedAssets, cofreConfigured: true, powerAutomateConfigured: health.powerAutomateConfigured, powerAutomateUrlValid: health.powerAutomateUrlValid, anonymousCatalogStatus: anonymous.status }));
