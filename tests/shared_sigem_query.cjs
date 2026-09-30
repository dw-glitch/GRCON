const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../core.js');
const Query = require('../shared_sigem_query_core.js');
const Conference = require('../posting_conference_core.js');
const doc = 'C1O_RNEST_U32_3.8.9.1_TUB_REP_nt-VM-320236';
const base = (status, rev='B') => ({ meta: { snapshotId:status }, records:[{document:doc,revision:rev,status}] });
let context = Query.context(base('Em análise'), base('Recusado'));
assert.equal(Query.resolve(doc,'B',context,'LEGACY').status,'Em análise');
assert.equal(Query.resolve(doc,'B',context,'LEGACY').source,'shared-general-query');
assert.equal(Query.resolve(doc,'A',context,'LEGACY').status,'LEGACY');
assert.equal(Core.statusForRevision({history:[{revision:'B',status:'Recusado'}]},'C').status,'Não Postado');
assert.equal(Query.resolve(doc,'A',context,'LEGACY').source,'legacy-fallback');
assert.equal(Query.resolve(doc,'B',Query.context(null,base('Recusado')),'LEGACY').source,'local-general-query');
assert.equal(Query.resolve(doc.replace(/_/g,'-').replace('nt-',''),' b ',context,'LEGACY').status,'Em análise');
assert.equal(Query.resolve(doc.replace('3.8.9.1','3.8.9.2'),'B',context,'LEGACY').status,'LEGACY');
const duplicate = {records:[...base('Recusado').records.map(r=>({...r,modifiedAt:'01/09/2026 10:00:00'})),...base('Em análise').records.map(r=>({...r,modifiedAt:'02/09/2026 10:00:00'}))]};
assert.equal(Query.resolve(doc,'B',Query.context(duplicate),'LEGACY').status,'Em análise');
assert.equal(Query.resolve(doc,'B',Query.context({records:[...base('Recusado').records,...base('Em análise').records]}),'LEGACY').status,'LEGACY');
assert.throws(()=>Query.validate({records:[]}),/vazia/);
assert.throws(()=>Query.validate({records:[{document:doc,revision:'',status:'Em análise'}]}),/revisão/);
const parsed = Conference.parseMatrix([['Documento','Revisão','Status','Disciplina'],[doc,'B','Em análise','TUB']]);
assert.equal(parsed.records[0].discipline,'TUB');

const sigemExportWithFooter = Conference.parseMatrix([
  ['Documento','Revisão','Status','Disciplina'],
  [doc,'B','Em análise','TUB'],
  ['SIGEM - Sistema Integrado de Gerenciamento de Empreendimentos','','',''],
]);
assert.equal(sigemExportWithFooter.records.length,1);
assert.equal(sigemExportWithFooter.meta.ignoredFooterCount,1);
assert.equal(sigemExportWithFooter.meta.invalidCount,0);
assert.doesNotThrow(()=>Query.validate({records:sigemExportWithFooter.records}));

const malformedDocumentRow = Conference.parseMatrix([
  ['Documento','Revisão','Status','Disciplina'],
  [doc,'','Em análise','TUB'],
]);
assert.equal(malformedDocumentRow.records.length,1);
assert.equal(malformedDocumentRow.meta.invalidCount,1);
assert.throws(()=>Query.validate({records:malformedDocumentRow.records}),/revisão/);
const technical={document:doc,revision:'B',sheet:'ET',title:'Título',discipline:'TUBULAÇÃO',documentType:'REP',databook:'Databook',allocationStatus:'ALOCADO'};
const history={document:doc,revision:'B',status:'Não Postado',sheet:'Colar SIGEM'};
const index=Core.buildIndex([technical],[history]);
const result=Core.triageOne({id:'test',name:doc+'_B.pdf'},index,{sigemQueryContext:context});
assert.equal(result.status,'Em análise');
assert.equal(result.sigemStatusSource,'shared-general-query');
assert.equal(result.allocationFinding.kind,'allocated');
const other=Core.triageOne({id:'test',name:doc+'_B.pdf'},index,{sigemQueryContext:Query.context(base('Em análise','A'))});
assert.notEqual(other.status,'Em análise');
const many={records:Array.from({length:25000},(_,i)=>({document:`RL-5290.00-22313-ABC-C1O-${i}`,revision:'B',status:'Em análise'}))};
const started=performance.now();const large=Query.context(many);
for(let i=0;i<25000;i++) assert.equal(Query.resolve(`RL-5290.00-22313-ABC-C1O-${i}`,'B',large,'fallback').source,'shared-general-query');
const appSource=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
assert.match(appSource,/analysisSigemSnapshot/);
assert.match(appSource,/currentSigemQuerySnapshot\(\)\s*!==\s*state\.analysisSigemSnapshot/);
assert.match(appSource,/sharedSigem\?\.refreshLatest/);
assert.match(appSource,/Consulta Geral SIGEM foi atualizada após esta análise/);
assert.match(appSource,/ensureFreshAnalysis:\s*\(\)\s*=>\s*ensureFreshAnalysis\(\)/);
const p1Source=fs.readFileSync(path.join(__dirname,'..','p1_ux.js'),'utf8');
assert.match(p1Source,/preflight[\s\S]*GrconTriageUiApi\?\.ensureFreshAnalysis/);
const sharedAppSource=fs.readFileSync(path.join(__dirname,'..','shared_sigem_query_app.js'),'utf8');
assert.doesNotMatch(sharedAppSource,/\[conference\.BASE_KEY,\s*base\]/);
assert.match(sharedAppSource,/shared-sigem-conference-workspace/);
assert.match(sharedAppSource,/async function refreshLatest\(\)/);
assert.match(sharedAppSource,/conference\.STATE_KEY[\s\S]*conference\.AUDIT_KEY/);
const conferenceAppSource=fs.readFileSync(path.join(__dirname,'..','posting_conference_app.js'),'utf8');
assert.match(conferenceAppSource,/grconWorkspaceId/);
assert.match(conferenceAppSource,/conferenceProjection\(/);
assert.match(conferenceAppSource,/shared-general-query-empty/);
assert.doesNotMatch(conferenceAppSource,/pc-local-preview|Prévia local/);
console.log(`shared_sigem_query: prioridade, revisão, identidade/EAP, duplicidade/data, parser, triagem e alocação independentes OK; 25k indexação+consultas ${(performance.now()-started).toFixed(0)}ms`);
