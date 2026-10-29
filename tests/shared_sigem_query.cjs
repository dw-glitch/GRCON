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
assert.equal(Query.resolve(doc,'A',context,'LEGACY').status,'Não Postado');
assert.equal(Core.statusForRevision({history:[{revision:'B',status:'Recusado'}]},'C').status,'Não Postado');
assert.equal(Query.resolve(doc,'A',context,'LEGACY').source,'shared-general-query');
assert.equal(Query.resolve(doc,'B',Query.context(null,base('Recusado')),'LEGACY').source,'local-general-query');
assert.equal(Query.resolve(doc.replace(/_/g,'-').replace('nt-',''),' b ',context,'LEGACY').status,'Em análise');
assert.equal(Query.resolve(doc.replace('3.8.9.1','3.8.9.2'),'B',context,'LEGACY').status,'Não Postado');
const duplicate = {records:[...base('Recusado').records.map(r=>({...r,modifiedAt:'01/09/2026 10:00:00'})),...base('Em análise').records.map(r=>({...r,modifiedAt:'02/09/2026 10:00:00'}))]};
assert.equal(Query.resolve(doc,'B',Query.context(duplicate),'LEGACY').status,'Em análise');
assert.equal(Query.resolve(doc,'B',Query.context({records:[...base('Recusado').records,...base('Em análise').records]}),'LEGACY').conflict,true);
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
assert.equal(Core.statusKind(other.status), 'analysis', 'revisão A em análise impede postar B');
assert.equal(other.blockingRevision,'A');
assert.equal(other.sigemRevisionStatus,'Não Postado');
assert.equal(other.decision,Core.DISCARD);

// Bloqueio herdado: B está Em Workflow, C está Não Postado na Consulta Geral.
// O status próprio de C não é apagado, mas a triagem não deve marcá-la READY.
const revised = Query.context({
  meta:{snapshotId:'prev-analysis'},
  records:[
    {document:doc,revision:'A',status:'Para Construção'},
    {document:doc,revision:'B',status:'Em Workflow'},
    {document:doc,revision:'C',status:'Não Postado'},
  ],
});
const nextGroup = {records:[{document:doc,revision:'C'}],history:[]};
assert.equal(Core.statusForRevision(nextGroup,'C',revised).status,'Não Postado','status exato continua fiel ao SIGEM');
const guarded=Core.grdtStatusForRevision(nextGroup,'C',revised,doc);
assert.equal(guarded.status,'Em Análise');
assert.equal(guarded.revisionStatus,'Não Postado');
assert.equal(guarded.blockingRevision,'B');
assert.equal(guarded.blockingRevisionStatus,'Em Workflow');
assert.match(guarded.inheritedReason,/revisão B permanece Em Análise/);
assert.equal(Core.grdtStatusForRevision(nextGroup,'D',revised,doc).blockingRevision,'B','qualquer revisão posterior verifica anteriores');
assert.equal(Core.grdtStatusForRevision(nextGroup,'B',revised,doc).blockingRevision,undefined,'a própria revisão não herda seu próprio bloqueio');
assert.equal(Core.grdtStatusForRevision(nextGroup,'A',revised,doc).blockingRevision,undefined,'uma revisão anterior não herda status futuro');
const nextIndex=Core.buildIndex([{
  ...technical,revision:'C',status:'Não Postado',
}],[{document:doc,revision:'C',status:'Não Postado',sheet:'Colar SIGEM'}]);
const triagedNext=Core.triageOne({id:'next',name:doc+'_C.pdf'},nextIndex,{sigemQueryContext:revised});
assert.equal(triagedNext.decision,Core.DISCARD);
assert.equal(triagedNext.status,'Em Análise');
assert.equal(triagedNext.sigemRevisionStatus,'Não Postado');
assert.equal(triagedNext.blockingRevision,'B');
assert.match(triagedNext.reason,/revisão B permanece Em Análise/);
const release=Query.context({records:[
  {document:doc,revision:'B',status:'Para Construção'},
  {document:doc,revision:'C',status:'Não Postado'},
]});
assert.equal(Core.grdtStatusForRevision(nextGroup,'C',release,doc).blockingRevision,undefined);
const released=Core.triageOne({id:'released',name:doc+'_C.pdf'},nextIndex,{sigemQueryContext:release});
assert.equal(released.status,'Não Postado');
assert.equal(released.decision,Core.READY);
// Consulta Geral compartilhada prevalece sobre histórico local desatualizado.
const priority=Query.context({records:[{document:doc,revision:'B',status:'Para Construção'}]},
  {records:[{document:doc,revision:'B',status:'Em Análise'}]});
assert.equal(Core.grdtStatusForRevision(nextGroup,'C',priority,doc).blockingRevision,undefined);
const legacyGroup={records:[{document:doc,revision:'C'}],
  history:[{document:doc,revision:'B',status:'Em Análise',sheet:'Colar SIGEM'}]};
const legacy=Core.grdtStatusForRevision(legacyGroup,'C',null,doc);
assert.equal(legacy.blockingRevision,'B','sem Consulta Geral compartilhada usa histórico SIGEM da LD');
assert.equal(legacy.revisionStatus,'Não Postado');
assert.equal(Core.grdtStatusForRevision(nextGroup,'C',Query.context({records:[
  {document:doc.replace('3.8.9.1','3.8.9.2'),revision:'B',status:'Em Análise'},
]}),doc).blockingRevision,undefined,'não misturar documentos de outros códigos');
// Status C já emitido não deve ser falsamente anunciado como herdado de B.
const alreadyIssued=Query.context({records:[
  {document:doc,revision:'B',status:'Em Análise'},
  {document:doc,revision:'C',status:'Para Construção'},
]});
assert.equal(Core.grdtStatusForRevision(nextGroup,'C',alreadyIssued,doc).status,'Para Construção');

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
assert.match(p1Source,/preflight[\s\S]*GrconTriageUiApi\?\.checkAnalysisValidity/);
const sharedAppSource=fs.readFileSync(path.join(__dirname,'..','shared_sigem_query_app.js'),'utf8');
assert.doesNotMatch(sharedAppSource,/\[conference\.BASE_KEY,\s*base\]/);
assert.match(sharedAppSource,/shared-sigem-conference-workspace/);
assert.match(sharedAppSource,/async function refreshLatest\(\)/);
assert.match(sharedAppSource,/conference\.STATE_KEY[\s\S]*conference\.AUDIT_KEY/);
assert.match(sharedAppSource,/function canPublish\(\) \{ return cloud\(\)\?\.state\?\.membership\?\.role === "owner"; \}/);
assert.doesNotMatch(sharedAppSource.match(/function canPublish\(\)[^\n]*/)[0],/\["owner", "admin"\]\.includes/);
assert.match(sharedAppSource,/Somente o proprietário pode publicar a Consulta Geral compartilhada/);
const conferenceAppSource=fs.readFileSync(path.join(__dirname,'..','posting_conference_app.js'),'utf8');
assert.match(conferenceAppSource,/grconWorkspaceId/);
assert.match(conferenceAppSource,/conferenceProjection\(/);
assert.match(conferenceAppSource,/shared-general-query-empty/);
assert.doesNotMatch(conferenceAppSource,/pc-local-preview|Prévia local/);
console.log(`shared_sigem_query: prioridade, revisão, identidade/EAP, duplicidade/data, parser, triagem e alocação independentes OK; 25k indexação+consultas ${(performance.now()-started).toFixed(0)}ms`);
