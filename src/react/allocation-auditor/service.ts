export type Data=Record<string,any>;
type Snapshot={groups:Data[];summary:Data;rows:Data[];records:Data[];history:Data[];events:Data[];runs:Data[];context:Data;busy:boolean;progress:number;total:number;error:string;message:string;runId:string;selected:number[]};
const g=window as unknown as Data;
let state:Snapshot={groups:[],summary:{},rows:[],records:[],history:[],events:[],runs:[],context:{},busy:false,progress:0,total:0,error:'',message:'',runId:'',selected:[]};
const listeners=new Set<()=>void>(),emit=(p:Partial<Snapshot>)=>{state={...state,...p};listeners.forEach(f=>f());};
const cloud=()=>g.GrconCloud?.state;
const scope=()=>JSON.stringify([cloud()?.session?.user?.id,cloud()?.membership?.workspace_id,cloud()?.membership?.contract_id]);
const sourceFiles=new Map<string,File>();
let identity=scope(),epoch=0,cancelled=false,worker:Worker|null=null,serial=0,saveRequest='',savedEvents=0,saveMetadata:Data|null=null;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
function requireSession(){const c=cloud();if(!c?.session?.user?.id||!c.membership?.contract_id||!c.membership?.workspace_id)throw Error('Entre em um contrato para auditar alocações.');if(identity!==scope())reset();return c;}
function current(t:number){if(t!==epoch||identity!==scope())throw Error('Conta ou contrato alterado. Reabra a análise.');}
async function compute(operation:string,input:Data){if(!worker){worker=new Worker('workers/allocation-auditor.worker.js');worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);};worker.onerror=()=>{pending.forEach(p=>p.reject(Error('Falha no processamento. A análise parcial permanece disponível.')));pending.clear();worker?.terminate();worker=null;};}const id=++serial;return new Promise<any>((resolve,reject)=>{pending.set(id,{resolve,reject});worker!.postMessage({id,operation,input});});}
async function rpc(operation:string,input:Data={}){const c=requireSession(),t=epoch;const r=await c.client.rpc('grcon_allocation_auditor',{target_workspace:c.membership.workspace_id,operation,input});current(t);if(r.error)throw Error(r.error.message||'Não foi possível acessar o histórico do auditor.');return r.data;}
async function task(action:()=>Promise<unknown>){if(state.busy)throw Error('Aguarde a operação atual.');requireSession();const t=epoch;emit({busy:true,error:'',message:''});try{return await action();}catch(e){if(t===epoch)emit({error:(e as Error).message||String(e)});throw e;}finally{if(t===epoch)emit({busy:false});}}
function reset(){sourceFiles.clear();identity=scope();epoch++;cancelled=true;worker?.terminate();worker=null;pending.forEach(p=>p.reject(Error('Contexto alterado.')));pending.clear();saveRequest='';savedEvents=0;saveMetadata=null;emit({groups:[],summary:{},rows:[],records:[],history:[],events:[],runs:[],context:{},busy:false,progress:0,total:0,error:'',message:'',runId:'',selected:[]});}
function remainingGroups(events:Data[],rows:Data[]=state.rows){const latest=new Map(events.map(e=>[JSON.stringify([e.lineage,e.field]),e]));return g.GrconAllocationAssistant?.groups(rows.map(row=>({...row,recommendations:(row.recommendations||[]).filter((p:Data)=>!['accepted','rejected'].includes(latest.get(JSON.stringify([row.lineage,p.field]))?.decision||''))})))||[];}
function clearResults(){saveRequest='';savedEvents=0;saveMetadata=null;emit({groups:[],summary:{},rows:[],events:[],progress:0,total:0,runId:'',selected:[],context:{...state.context,saved:false,checkpoint:false,history:undefined}});}
async function generator(){await g.GRCONModuleLoader.ensure('react-dist/allocation-app.js');return g.GrconAllocationGeneratorUi;}
async function getContext(){const ui=await generator();return await ui.auditContext();}
const identifyAllocation=(name:string)=>name.match(/(C1O-ALOC-[A-Z]+-\d{3,4}-20\d{2})/i)?.[1]?.toUpperCase()||'';
const save=(bytes:Uint8Array,name:string)=>{const u=URL.createObjectURL(new Blob([bytes as BlobPart]));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);};
export const service={
 async assistantRpc(operation:string,input:Data={}){const c=requireSession(),t=epoch;const r=await c.client.rpc('grcon_allocation_assistant',{target_workspace:c.membership.workspace_id,operation,input});current(t);if(r.error)throw Error(r.error.message);return r.data;},
 async applyAutomatic(){
  await service.save();const t=epoch;const result=await service.assistantRpc('authorize',{runId:state.runId});current(t);
  const events=[...state.events,...result.events];emit({events,groups:remainingGroups(events)});savedEvents=state.events.length;return result.events.length;
 },
 async importMany(files:File[]){return task(async()=>{
  const t=epoch,c=requireSession();if(files.length>20)throw Error('Selecione até 20 arquivos por lote.');
  const entries:Data[]=[],records:Data[]=[];
  for(const file of files){
   const tabs=await compute('inspect',{file});current(t);
   const official=tabs.filter((x:Data)=>x.model==='official-16'&&x.documentCount>0);
   const general=official.filter((x:Data)=>x.name==='GERAL');
   const candidate=general.length===1?general[0]:official.length===1?official[0]:null;
   if(!candidate)throw Error(file.name+': alocação oficial não identificada de forma única. Envie LDs pelo campo de LDs ou use a importação avançada.');
   const parsed=await compute('parse',{file,sheet:candidate.name,contract:c.membership.contract_id,allocation:identifyAllocation(file.name)});current(t);
   const old=(state.context.sources||[]).find((x:Data)=>x.name===file.name);
   if(old&&old.sha256!==parsed.sha256)throw Error('Há outro arquivo com o mesmo nome e conteúdo diferente. Renomeie a cópia.');
   entries.push({name:file.name,sha256:parsed.sha256,kind:'allocation',sheet:candidate.name});records.push(...parsed.records);
  }
  const checkpoint=state.context.checkpoint&&entries.every((e:Data)=>(state.context.sources||[]).some((old:Data)=>old.sha256===e.sha256));
  if(!checkpoint)clearResults();const sources=[...(state.context.sources||[])];
  for(let i=0;i<entries.length;i++){const entry=entries[i];sourceFiles.set(entry.sha256,files[i]);if(!sources.some((x:Data)=>x.sha256===entry.sha256))sources.push(entry);}
  const all=[...state.records,...records];const unique=new Map(all.map(r=>[JSON.stringify([r.sourceHash||r.document,r.sourceSheet||r.revision,r.sourceRow||r.allocation]),r]));
  emit({records:[...unique.values()],context:{...state.context,sources},message:entries.length+' alocações recebidas. Originais preservados.'});
 });},
 async importAssistantLd(files:File[]){
  const t=epoch;if(files.length>20)throw Error('Selecione até 20 LDs.');const entries:Data[]=[];
  for(const file of files){const sha256=await compute('fingerprint',{file});current(t);const old=(state.context.sources||[]).find((x:Data)=>x.name===file.name);if(old&&old.sha256!==sha256)throw Error('Nome de LD repetido com conteúdo diferente. Renomeie a cópia.');entries.push({name:file.name,sha256,kind:'ld'});}
  const checkpoint=state.context.checkpoint&&entries.every((e:Data)=>(state.context.sources||[]).some((old:Data)=>old.sha256===e.sha256));const previous=state,previousRequest=saveRequest,previousEvents=savedEvents,previousMeta=saveMetadata;
  await service.importLd([...new Map([...(state.context.sources||[]).filter((x:Data)=>x.kind==='ld').map((x:Data)=>[x.name,sourceFiles.get(x.sha256)]),...files.map(f=>[f.name,f])]).values()].filter(Boolean) as File[]);current(t);if(checkpoint){saveRequest=previousRequest;savedEvents=previousEvents;saveMetadata=previousMeta;emit(previous);}
  const sources=[...(state.context.sources||[])];
  for(let i=0;i<entries.length;i++){sourceFiles.set(entries[i].sha256,files[i]);if(!sources.some((x:Data)=>x.sha256===entries[i].sha256))sources.push(entries[i]);}
  emit({context:{...state.context,sources,ldHashes:Object.fromEntries(sources.filter((x:Data)=>x.kind==='ld').map((x:Data)=>[x.name,x.sha256]))}});
 },
 async assistantPackage(sessionId:string,generateOfficial=false){return task(async()=>{
  if(!state.rows.length||state.progress!==state.total||state.rows.length!==state.total||state.records.length!==state.total)throw Error('Conclua a auditoria antes de preparar o pacote ou emitir nova alocação.');
  const t=epoch,files:Data[]=[],exceptions:string[]=[];const approved=g.GrconAllocationAuditorCore.approvedChanges(state.events);
  for(const source of [...(state.context.sources||[])].sort((a,b)=>Number(b.kind==='ld')-Number(a.kind==='ld'))){
   const file=sourceFiles.get(source.sha256);if(!file){exceptions.push(source.name+': reanexe a origem para produzir a cópia.');continue;}
   if(source.kind==='allocation'){
    const rows=state.rows.filter(r=>r.sourceHash===source.sha256);const events=approved.filter((e:Data)=>rows.some(r=>r.lineage===e.lineage)&&g.GrconAllocationAssistant.editable(e.field));
    if(!events.length)continue;
    try{const result=await compute('revise-allocation',{file,rows,events,sourceHash:source.sha256,contract:cloud().membership.contract_id});current(t);files.push({name:'03_Alocacoes_Corrigidas/'+source.sha256.slice(0,8)+'_'+file.name.replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/\.xlsx$/i,'')+'_CORRIGIDA.xlsx',bytes:result.bytes,changed:result.changed,changes:result.changes,official:true});}catch(e){current(t);exceptions.push(source.name+': '+(e as Error).message);}
   }else{
    const events=approved.filter((e:Data)=>state.rows.some(r=>r.lineage===e.lineage&&r.origin?.file===source.name));if(!events.length)continue;
    try{const ui=await generator();const result=await ui.reviseAuditLd(file,state.rows,events,source.sha256);current(t);if(!result.count)continue;files.push({name:'02_LDs_Corrigidas/'+source.sha256.slice(0,8)+'_'+file.name.replace(/[^a-zA-Z0-9_.-]/g,'_'),bytes:new Uint8Array(result.buffer),changed:result.count,changes:result.changes});}catch(e){current(t);exceptions.push(source.name+': '+(e as Error).message);}
   }
  }
  if(generateOfficial){
   if(!state.runId)throw Error('Salve a auditoria antes de gerar uma nova alocação.');
   if(approved.some((e:Data)=>['title','tag','eap','discipline'].includes(e.field)&&!files.some(f=>f.changes?.some((x:Data)=>x.lineage===e.lineage&&x.field===e.field&&x.after===e.after))))throw Error('Há correções na origem sem cópia de LD validada. Reanexe a LD e resolva as exceções antes de emitir nova alocação.');
   if(exceptions.length)throw Error('Reanexe as fontes e resolva as exceções antes de emitir nova alocação.');
   const groups=new Map<string,Data[]>();
   for(const row of state.rows){const key=JSON.stringify([row.sourceHash||row.sourceFile||'Gerador',row.allocation||'']);groups.set(key,[...(groups.get(key)||[]),row]);}
   for(const rows of groups.values())if(new Set(rows.map(r=>JSON.stringify([r.document,r.revision]))).size!==rows.length)throw Error('Há ocorrências repetidas no mesmo lote. Resolva essa exceção antes de gerar nova numeração.');
   const ui=await generator();
   for(const rows of groups.values()){
    const generated=await ui.generateAudited(rows,state.events,state.context.versions);current(t);
    for(const output of generated.filter((f:Data)=>['allocation','control'].includes(f.kind))){
     const safeName=output.name.replace(/[^a-zA-Z0-9_.-]/g,'_');const binary=atob(output.base64);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
     files.push({name:output.kind==='control'?'04_Linhas_Central_'+safeName:'03_Alocacoes_Corrigidas/NOVA_'+safeName,bytes,official:output.kind==='allocation',changed:0,changes:[]});
    }
   }
  }
  for(const e of approved)if(!files.some(f=>f.changes?.some((x:Data)=>x.lineage===e.lineage&&x.field===e.field&&x.after===e.after)))exceptions.push(e.document+' / '+e.field+': decisão registrada sem cópia produzida.');
  const result=await compute('assistant-package',{...state.context,rows:state.rows,events:state.events,progress:state.progress,total:state.total,sessionId,runId:state.runId,files,exceptions});current(t);
  save(result.bytes,'GRCON_Auditoria_Alocacao.zip');emit({message:exceptions.length?'Pacote parcial verificado; consulte as exceções no relatório.':'Pacote verificado e pronto para download.'});return result.manifest;
 });},
 async acceptGroup(group:Data){
  const currentGroups=g.GrconAllocationAssistant.groups(state.rows),match=currentGroups.find((x:Data)=>x.id===group.id);if(!match)throw Error('Grupo mudou. Reanalise.');
  for(const item of match.rows){const i=state.rows.findIndex(r=>r.lineage===item.lineage);await service.review(i,{state:'Correção proposta',decision:'accepted',field:match.field,value:match.after,justification:match.justification,evidence:match.evidence});}
 },
 subscribe(f:()=>void){listeners.add(f);return ()=>{listeners.delete(f);};},snapshot:()=>state,
 core:()=>g.GrconAllocationAuditorCore,
 async activate(){requireSession();try{const data=await rpc('history');emit({runs:data.runs});}catch(e){emit({message:'Histórico compartilhado indisponível: '+(e as Error).message});}},
 async open(seed:Data){return task(async()=>{const t=epoch;current(t);clearResults();emit({records:seed.rows.map((r:Data)=>({...r.record,document:r.document,revision:r.revision,title:r.title,discipline:r.output.discipline||r.identity.discipline,workflow:r.output.workflow,databook:r.output.databook,levels:r.output.levels,eap:r.identity.eap,allocation:seed.allocation||'',sourceFile:seed.allocation?'Histórico do Gerador':'Gerador GRCON',sourceVersions:seed.sourceVersions||{},contract:cloud().membership.contract_id})),context:{...seed,contract:cloud().membership.contract_id},message:'Documentos recebidos do Gerador. Inicie a auditoria.'});});},
 prepareUpload(){if(state.busy)return;clearResults();emit({records:[],context:{...state.context,inputFile:'',inputSheet:'',inputModel:'',sourceHash:'',allocation:''},message:'Lendo o novo arquivo de alocação…'});},
 inspect:(file:File)=>task(async()=>compute('inspect',{file})),
 async import(file:File,sheet:string,kind:'allocation'|'history',allocation=''){return task(async()=>{const c=requireSession(),t=epoch;const code=allocation.trim()||identifyAllocation(file.name);const data=await compute('parse',{file,sheet,allocation:code,contract:c.membership.contract_id});current(t);clearResults();emit(kind==='history'?{history:g.GrconAllocationAuditorCore.mergeHistory(state.history,data.records),message:`${data.records.length} eventos fiscais lidos. Comentários originais preservados.`}:{records:data.records,context:{...state.context,inputFile:file.name,inputSheet:sheet,inputModel:data.model,allocation:code,sourceHash:data.sha256},message:`${data.records.length} documentos da aba ${sheet} reconhecidos (${data.model==='official-16'?'modelo oficial de 16 colunas':'colunas compatíveis'}). Iniciando verificação.`});return data;});},
 async importLd(files:File[]){return task(async()=>{const t=epoch,ui=await generator();await ui.importAuditLd(files);current(t);clearResults();emit({message:'LDs lidas. Originais preservados.'});});},
 async availableAllocations(){return task(async()=>{const t=epoch,ctx=await getContext();current(t);emit({context:{...state.context,allocationRuns:ctx.allocationRuns||[]},message:'Alocações reconhecidas no histórico do Gerador carregadas.'});});},
 async openAllocationReference(reference:string){const ui=await generator();return ui.auditAllocationReference(reference);},
 async openAllocation(id:string){const ui=await generator();const run=state.context.allocationRuns?.find((r:Data)=>r.id===id);if(!run)throw Error('Selecione uma alocação disponível.');return ui.auditSavedRun(run);},
 async useLd(){return task(async()=>{const t=epoch,ctx=await getContext();current(t);clearResults();emit({records:ctx.ldRecords.map((r:Data)=>({...r,ld:r.source,ldSheet:r.sheet,sourceFile:r.source,sourceSheet:r.sheet,sourceRow:r.row,contract:cloud().membership.contract_id})),context:ctx,message:'Documentos da LD selecionados.'});});},
 setApplicability(revision:string,evidence:string){if(state.busy)return;clearResults();emit({context:{...state.context,applicability:{source:'ET-5290.00-22000-912-1LV-001',revision,evidence,contract:cloud()?.membership?.contract_id,confirmed:Boolean(evidence.trim()&&revision)}}});},
 async analyze(resume=false){return task(async()=>{
  const t=epoch;cancelled=false;if(!state.records.length)throw Error('Importe uma alocação ou selecione os documentos da LD.');if(state.records.length>50000)throw Error('Limite de 50.000 documentos por análise.');
  let fresh:Data={},contextWarning='';try{fresh=await getContext();}catch(e){current(t);contextWarning='As bases complementares não puderam ser consultadas: '+((e as Error).message||String(e))+'. Auditoria parcial; verificações dependentes das bases permanecem inconclusivas.';}
   current(t);const context:Data={...fresh,...state.context,saved:false,checkpoint:resume&&Boolean(state.context.checkpoint),ldRecords:fresh.ldRecords||state.context.ldRecords||[],bases:fresh.bases||state.context.bases||{},versions:fresh.versions||state.context.versions||{},baseMetadata:fresh.baseMetadata||[],contract:cloud().membership.contract_id,history:g.GrconAllocationAuditorCore.mergeHistory(fresh.centralHistory||[],state.history),records:state.records,homologated:{},contextWarning};
  if(resume&&JSON.stringify(context.sources)!==JSON.stringify(state.context.sources))throw Error('As fontes mudaram. Inicie uma nova análise.');
  if(resume&&JSON.stringify(context.versions)!==JSON.stringify(state.rows[0]?.versions||context.versions))throw Error('As bases mudaram. Inicie uma nova análise.');
  if(resume&&state.context.checkpoint&&(state.context.sources||[]).some((s:Data)=>!sourceFiles.has(s.sha256)))throw Error('Reanexe todas as alocações e LDs originais antes de retomar.');
  if(!resume)clearResults();emit({context,total:state.records.length});await compute('context',context);current(t);
  let rows=resume?state.rows.slice():[];
  for(let i=rows.length;i<context.records.length;i+=100){if(cancelled)break;const next=await compute('batch',{first:i,count:100});current(t);rows=[...rows,...next];emit({rows,progress:rows.length,selected:rows.map((_,i)=>i)});await new Promise(resolve=>setTimeout(resolve,0));}
  const grouped=await compute('summarize',{rows});current(t);
  emit({...grouped,selected:rows.map((_,i)=>i),message:cancelled?'Análise pausada. Os registros concluídos podem ser retomados.':contextWarning?'Auditoria parcial concluída. '+contextWarning:'Auditoria concluída. Confira as pendências e evidências.'});
 });},
 cancel(){cancelled=true;},
 select(indices:number[]){emit({selected:indices});},
 async review(index:number,input:Data){const c=requireSession();if(state.busy)throw Error('Aguarde a operação atual.');if(!['owner','admin','operator'].includes(c.membership.role))throw Error('Perfil sem permissão de revisão.');const row=state.rows[index];if(input.field==='databook'&&input.value&&!state.context.bases?.databook?.some((p:Data)=>p.databook===input.value))throw Error('Escolha um caminho existente na base ativa.');
  const event={...g.GrconAllocationAuditorCore.reviewEvent(row,input,c.session.user.id),requestId:crypto.randomUUID()};
  const events=[...state.events,event];emit({events,groups:remainingGroups(events),message:'Decisão registrada. A Central e a LD oficial não foram alteradas.'});
 },
 async save(){return task(async()=>{if(!state.rows.length)throw Error('Nenhuma análise para salvar.');const t=epoch;saveRequest=saveRequest||crypto.randomUUID();
  const metadata=saveMetadata||(saveMetadata={engine:g.GrconAllocationAuditorCore.VERSION,contextWarning:state.context.contextWarning||'',sources:state.context.sources||[],ldHashes:state.context.ldHashes||{},versions:state.context.versions,applicability:state.context.applicability||{},sourceCount:(state.context.history||state.history).length,summary:g.GrconAllocationAuditorCore.summary(state.rows),kind:'audit'});
  const {id}=state.runId?{id:state.runId}:await rpc('begin',{requestId:saveRequest,count:state.total||state.records.length,metadata});current(t);emit({runId:id});
  // Saved rows are immutable. Finishing may be retried after a lost response.
  if(!state.context.saved){for(let i=0;i<state.rows.length;i+=100){const rows=state.rows.slice(i,i+100).map(r=>{const {history,...rest}=r;return {...rest,history:history.map((h:Data)=>({document:h.document,revision:h.revision,allocation:h.allocation,fiscalComment:h.fiscalComment,fiscalDecision:h.fiscalDecision,returnedAt:h.returnedAt,sourceFile:h.sourceFile,sourceSheet:h.sourceSheet,sourceRow:h.sourceRow}))};});await rpc('chunk',{id,first:i+1,rows});current(t);}if(state.rows.length===state.total){await rpc('finish',{id});current(t);emit({context:{...state.context,saved:true,checkpoint:false}});}else emit({context:{...state.context,checkpoint:true}});}
  for(let i=savedEvents;i<state.events.length;i++){const e=state.events[i];await rpc('event',{id,requestId:e.requestId,event:e});current(t);savedEvents=i+1;}
  const page=await rpc('history');emit({runs:page.runs,message:state.progress===state.total?'Análise e decisões salvas com histórico auditável.':'Progresso parcial salvo. Reanexe as mesmas fontes para retomar após fechar o navegador.'});
 });},
 async historyRows(id:string,after=0){return rpc('detail',{id,after});},
 async restoreById(id:string){const data=await rpc('detail',{id,after:0});return service.restore(data.run);},
 async restore(run:Data){return task(async()=>{const t=epoch;const rows:Data[]=[];let meta:Data={},events:Data[]=[];
  for(let i=0;i<run.expected_count;i+=200){const d=await rpc('detail',{id:run.id,after:i});current(t);if(!d.rows.length)break;rows.push(...d.rows.map((x:Data)=>x.payload));meta=d.run.metadata;events=d.events;}
  const grouped=await compute('summarize',{rows});current(t);
  clearResults();saveMetadata=meta;savedEvents=events.length;emit({...grouped,groups:remainingGroups(events,rows),rows,records:rows.map(r=>({...r})),events,runId:run.id,selected:rows.map((_,i)=>i),progress:rows.length,total:run.expected_count,context:{checkpoint:!run.completed_at,sources:meta.sources||[],ldHashes:meta.ldHashes||{},versions:meta.versions,applicability:meta.applicability,contract:cloud().membership.contract_id,saved:Boolean(run.completed_at)},message:'Análise histórica carregada com suas versões originais. Reanalise para usar bases atuais.'});
 });},
 async export(official=false){return task(async()=>{if(!state.rows.length)throw Error('Execute a auditoria primeiro.');const t=epoch;let files:Data[]=[];
  if(official){if(state.progress!==state.total)throw Error('Conclua a análise antes de gerar o pacote oficial.');const ui=await generator();files=await ui.generateAudited(state.rows.filter((_,i)=>state.selected.includes(i)),state.events,state.context.versions);current(t);}
  const bytes=await compute('export',{...state.context,rows:state.rows,events:state.events,history:state.context.history|| (state.history.length?state.history:state.rows.flatMap(r=>r.history||[])),files});current(t);save(bytes,'Auditoria_Alocacao_GRCON.zip');
 });},
 async revisedAllocation(file:File){return task(async()=>{const t=epoch;
  if(!state.rows.length||state.progress!==state.total)throw Error('Conclua a auditoria antes de corrigir o modelo oficial.');
  if(state.context.inputModel!=='official-16'||state.context.inputSheet!=='GERAL'||!state.context.sourceHash)throw Error('A cópia corrigida exige importação do modelo oficial GERAL com origem rastreável.');
  if(!file||file.name!==state.context.inputFile)throw Error('Selecione a mesma alocação original auditada.');
  const events=g.GrconAllocationAuditorCore.approvedChanges(state.events).filter((e:Data)=>['workflow','databook','N1','N2','N3','N4','N5','N6'].includes(e.field));
  if(!events.length)throw Error('Aprove ao menos uma correção de Workflow, Data Book ou N1–N6 com evidência antes de gerar a cópia.');
  const result=await compute('revise-allocation',{file,events,rows:state.rows,sourceHash:state.context.sourceHash,contract:cloud().membership.contract_id});current(t);
  const name=file.name.replace(/\.xlsx$/i,'')+'_REVISADA_GRCON.xlsx';save(result.bytes,name);
  emit({message:'Cópia oficial revisada gerada: '+result.changed+' célula(s) autorizada(s), demais células verificadas. Arquivo original e LD permanecem intactos.'});
  return result;
 });},
 async revisedLd(file:File){return task(async()=>{const t=epoch,ui=await generator();const events=g.GrconAllocationAuditorCore.approvedChanges(state.events).filter((e:Data)=>e.field==='title');if(!events.length)throw Error('Aprove uma proposta de título primeiro.');const result=await ui.reviseAuditLd(file,state.rows,events);current(t);save(result.buffer,result.fileName);emit({message:`Cópia revisada gerada; ${result.count} títulos alterados e preservação verificada.`});});},
 async ai(index:number,question=''){return task(async()=>{const c=requireSession(),t=epoch,r=state.rows[index];if(r.ai&&!question)return;if(!r.findings.length)throw Error('Não há apontamentos para esta consulta.');const response=await fetch('/api/document-vault/allocation-audit-ai',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+c.session.access_token},body:JSON.stringify({workspaceId:c.membership.workspace_id,document:r.document,title:r.title,question,proposals:(r.recommendations||[]).slice(0,8).map((p:Data,i:number)=>({id:'proposal:'+i,field:p.field,before:p.before,after:p.after,evidence:p.evidence.slice(0,2)})),findings:r.findings.slice(0,8).map((f:Data,i:number)=>({id:'finding:'+i,field:f.field,message:f.message,evidence:f.evidence.slice(0,2)}))})});const d=await response.json();current(t);if(!response.ok)throw Error(d.message||'IA indisponível.');const rows=state.rows.slice();rows[index]={...r,ai:d};emit({rows});});},clear:reset,
};
for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])window.addEventListener(event,reset);
window.addEventListener('grcon:cloud-ready',()=>{if(identity!==scope())reset();});
