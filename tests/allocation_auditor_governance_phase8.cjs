'use strict';
// Fase 8 — histórico, retomada segura, aprendizado controlado, catálogo de regras e segurança.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const L=require('../allocation_auditor_learning.js'),C=require('../allocation_auditor_core.js');

// Aprendizado controlado: quatro níveis não equivalentes; recorrência nunca vira regra.
assert.equal(L.precedentLevel({distinctDocuments:1}).id,'precedente-observado');
assert.equal(L.precedentLevel({distinctDocuments:12}).id,'padrao-recorrente','muitas recorrências continuam sendo padrão, não norma');
assert.equal(L.precedentLevel({distinctDocuments:12}).automatic,false);
assert.equal(L.precedentLevel({distinctDocuments:3,authorizedSource:'ET Rev. R',evidence:'item 7.1.7',confirmedBy:'adm'}).id,'criterio-tecnico-confirmado');
assert.equal(L.precedentLevel({distinctDocuments:50,ruleState:'candidate',homologation:'Aprovação documentada 2026',validation:{passed:true}}).id,'padrao-recorrente','candidata não é homologada');
assert.equal(L.precedentLevel({ruleState:'active',homologation:'curto',validation:{passed:true}}).automatic,false);
const homolog=L.precedentLevel({ruleState:'active',homologation:'Ata de homologação ADM 03/11/2026',validation:{passed:true}});
assert.equal(homolog.id,'regra-operacional-homologada');assert.equal(homolog.automatic,true);
const proposal=L.proposeRuleAdjustment({distinctDocuments:5,category:'title',field:'title'},{file:'RET.xlsx',sheet:'GERAL',row:9,document:'DOC-1',comment:'Completar título'});
assert.equal(proposal.state,'proposta');assert.equal(proposal.activatesAutomatically,false);assert.equal(proposal.requiresAdminApproval,true);assert.equal(proposal.origin.row,9);

// Catálogo: campos do catálogo derivados da versão da regra, sem perder histórico.
const rule={id:'r1',version:3,state:'active',contract_id:'c1',created_by:'adm-1',created_at:'2026-11-03T10:00:00Z',payload:{field:'workflow',document:'DOC-1',revision:'0',discipline:'ELE',before:'A',after:'B',sourceHash:'a'.repeat(64),ldHash:'b'.repeat(64),contract:'c1',instruction:'Usar workflow da LD exata',evidence:['LD exata']},validation:{positives:3,negatives:2,failures:0,passed:true,homologation:'Ata de homologação ADM 03/11/2026'}};
const entry=L.catalogEntry(rule);
for(const k of ['id','name','category','source','revision','contract','activation','evidence','severity','verification','correctable','authorizationPolicy','version','state','approvedBy','changedAt','homologation','validation','level'])assert.ok(entry[k]!==undefined&&entry[k]!=='',k);
assert.equal(entry.level,'regra-operacional-homologada');assert.equal(L.catalogEntry({...rule,state:'suspended'}).level,'precedente-observado');

// Mudança de regra invalida autorizações que dependiam da versão anterior.
const ev=[{lineage:'L1',field:'workflow',ruleId:'r1',ruleVersion:3,decision:'accepted'},{lineage:'L2',field:'workflow',decision:'accepted'}];
assert.equal(L.invalidatedByRuleChange(ev,[rule]).length,0);
assert.equal(L.invalidatedByRuleChange(ev,[{...rule,version:4}]).length,1);
assert.equal(L.invalidatedByRuleChange(ev,[{...rule,state:'revoked'}]).length,1);
assert.equal(L.invalidatedByRuleChange(ev,[]).length,1,'regra removida do catálogo');

// Retomada: contrato, permissão, motor, hash, versões de base e regras.
const hashA='a'.repeat(64);
const saved={contract:'c1',engine:C.VERSION,sources:[{name:'ALOC.xlsx',sha256:hashA}],versions:{databook:'v1',eap:'v2'}};
const now={contract:'c1',permitted:true,engine:C.VERSION,availableSources:{[hashA]:hashA},versions:{databook:'v1',eap:'v2'}};
assert.equal(L.resumeCheck(saved,now).action,'resume');
assert.equal(L.resumeCheck(saved,{...now,contract:'c2'}).action,'reanalyze','troca de contrato');
assert.equal(L.resumeCheck(saved,{...now,permitted:false}).action,'reanalyze','permissão insuficiente');
assert.equal(L.resumeCheck(saved,{...now,availableSources:{}}).action,'reattach');assert.deepEqual(L.resumeCheck(saved,{...now,availableSources:{}}).reattach,['ALOC.xlsx']);
assert.equal(L.resumeCheck(saved,{...now,versions:{databook:'v2',eap:'v2'}}).action,'reanalyze','base mudou');
assert.match(L.resumeCheck(saved,{...now,versions:{databook:'v2',eap:'v2'}}).message,/Reanálise necessária.*databook/);
assert.equal(L.resumeCheck(saved,{...now,engine:'9.9.9'}).action,'reanalyze','motor atualizado');
assert.equal(L.resumeCheck({...saved,rulesVersion:'1'},{...now,rulesVersion:'2'}).action,'reanalyze','catálogo de regras mudou');
assert.equal(L.resumeCheck({...saved,versions:{databook:'v1'}},{...now,versions:{databook:'v1',novo:'x'}}).action,'reanalyze','nova base não existia na análise salva');

// Comentários fiscais originais preservados pelo catálogo (texto e espaçamento).
const original='  Completar o TÍTULO\n conforme ET  ';
const cat=C.catalogComments([{document:'D1',revision:'0',fiscalComment:original,contract:'c1'}]);
assert.equal(cat[0].originals[0],original);assert.equal(cat[0].normativeProof,false);assert.notEqual(cat[0].learning,'regra-operacional-homologada');

// Segurança estática: sem R2/cofre/armazenamento local de binários no Auditor.
const auditorFiles=['allocation_auditor_references.js','allocation_auditor_opinion.js','allocation_auditor_reaudit.js','allocation_auditor_report.js','allocation_auditor_fields.js','allocation_auditor_errors.js','allocation_auditor_core.js','allocation_auditor_assistant.js','allocation_auditor_revision.js','allocation_auditor_package.js','allocation_auditor_corrections.js','allocation_auditor_learning.js','workers/allocation-auditor.worker.js',...fs.readdirSync(path.join(root,'src/react/allocation-auditor')).map(f=>'src/react/allocation-auditor/'+f)];
for(const f of auditorFiles){
 const src=read(f);
 assert.ok(!/\bR2\b|r2_|putObject|\.put\(|createSignedUploadUrl|storage\.from|indexedDB|localStorage|sessionStorage/.test(src.replace(/Error\([^)]*\)/g,'')),f+' não grava documentos em R2/cofre/armazenamento local');
 assert.ok(!/service_role|SUPABASE_SERVICE|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{12,}/i.test(src),f+' sem segredos');
}
// Única chamada de rede do Auditor: IA opcional, autenticada, com metadados (não arquivos).
const net=read('src/react/allocation-auditor/service.ts').match(/fetch\(['"][^'"]+['"]/g)||[];
assert.deepEqual(net,["fetch('/api/document-vault/allocation-audit-ai'"]);
assert.match(read('src/react/allocation-auditor/service.ts'),/authorization:'Bearer '\+c\.session\.access_token/);
assert.ok(!/arrayBuffer|base64|bytes/.test(read('src/react/allocation-auditor/service.ts').match(/async ai\([\s\S]*?\n async/)?.[0]||''),'IA não recebe conteúdo de arquivos');

// Segurança SQL: tabelas privadas fechadas, funções com search_path vazio, contrato do membro, regras append-only.
const sqlFiles=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>/allocation_(auditor|assistant)/.test(f));
assert.ok(sqlFiles.length>=4);
const sql=sqlFiles.map(f=>read('supabase/migrations/'+f)).join('\n');
for(const m of sql.matchAll(/create table private\.(grcon_allocation_[a-z_]+)/g))assert.match(sql,new RegExp('revoke all on[^;]*'+m[1]+'[^;]*from[^;]*anon'),m[1]+' revogada para anon/authenticated');
for(const m of sql.matchAll(/create (?:or replace )?function (?:private|public)\.(grcon_allocation_(?:auditor|assistant)[a-z_]*)\([^)]*\)[\s\S]*?(?:as \$\$|as \$fn\$)/g))assert.match(m[0],/security definer set search_path=''|set search_path=''/,m[1]+' com search_path fixo');
assert.ok(!/storage\.(objects|buckets)/.test(sql),'migrações do Auditor não tocam o armazenamento');
assert.ok(!/(update|delete from) private\.grcon_allocation_learned_rules/.test(sql),'versões de regra são append-only');
assert.match(sql,/primary key\(id,version\)/);
assert.match(sql,/grcon_require_master_owner\(\)/,'ações de regra exigem o Proprietário ADM no servidor');
assert.match(sql,/m\.workspace_id=target_workspace and m\.user_id=u and m\.active/,'acesso ao contrato validado no servidor');
assert.match(sql,/contract_id=c/);
assert.ok(!/anon/.test((sql.match(/grant execute on function[^;]*;/g)||[]).join('')),'nenhum grant a anon');
// Interface administrativa existente: nomenclatura correta e nenhuma menção ao nome antigo.
const panel=read('src/react/allocation-auditor/IntelligencePanel.tsx');
assert.match(panel,/Proprietário ADM/);assert.ok(!/Proprietário Master/.test(panel+read('src/react/allocation-auditor/AllocationAssistant.tsx')));
// Loader e produção carregam o novo módulo.
assert.match(read('grcon_module_loader.js'),/allocation_auditor_learning\.js/);assert.match(read('scripts/verify-cloudflare-production.mjs'),/allocation_auditor_learning\.js/);
console.log('allocation_auditor_governance_phase8: níveis de precedente, catálogo, invalidação por regra, retomada segura, comentários fiscais, sem R2/armazenamento local, segredos e SQL (RLS/ADM/append-only) aprovados');
