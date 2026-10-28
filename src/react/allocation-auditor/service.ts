export type Data=Record<string,any>;
type Snapshot={rows:Data[];records:Data[];history:Data[];events:Data[];runs:Data[];context:Data;busy:boolean;progress:number;total:number;error:string;message:string;runId:string;selected:number[]};
const g=window as unknown as Data;
let state:Snapshot={rows:[],records:[],history:[],events:[],runs:[],context:{},busy:false,progress:0,total:0,error:'',message:'',runId:'',selected:[]};
const listeners=new Set<()=>void>(),emit=(p:Partial<Snapshot>)=>{state={...state,...p};listeners.forEach(f=>f());};
const cloud=()=>g.GrconCloud?.state;
const scope=()=>JSON.stringify([cloud()?.session?.user?.id,cloud()?.membership?.workspace_id,cloud()?.membership?.contract_id]);
let identity=scope(),epoch=0,cancelled=false,worker:Worker|null=null,serial=0,saveRequest='',savedEvents=0;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
function requireSession(){const c=cloud();if(!c?.session?.user?.id||!c.membership?.contract_id||!c.membership?.workspace_id)throw Error('Entre em um contrato para auditar alocações.');if(identity!==scope())reset();return c;}
function current(t:number){if(t!==epoch||identity!==scope())throw Error('Conta ou contrato alterado. Reabra a análise.');}
async function compute(operation:string,input:Data){if(!worker){worker=new Worker('workers/allocation-auditor.worker.js');worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);};worker.onerror=()=>{pending.forEach(p=>p.reject(Error('Falha no processamento. A análise parcial permanece disponível.')));pending.clear();worker?.terminate();worker=null;};}const id=++serial;return new Promise<any>((resolve,reject)=>{pending.set(id,{resolve,reject});worker!.postMessage({id,operation,input});});}
async function rpc(operation:string,input:Data={}){const c=requireSession(),t=epoch;const r=await c.client.rpc('grcon_allocation_auditor',{target_workspace:c.membership.workspace_id,operation,input});current(t);if(r.error)throw Error(r.error.message||'Não foi possível acessar o histórico do auditor.');return r.data;}
async function task(action:()=>Promise<unknown>){if(state.busy)throw Error('Aguarde a operação atual.');requireSession();const t=epoch;emit({busy:true,error:'',message:''});try{return await action();}catch(e){if(t===epoch)emit({error:(e as Error).message||String(e)});throw e;}finally{if(t===epoch)emit({busy:false});}}
function reset(){identity=scope();epoch++;cancelled=true;worker?.terminate();worker=null;pending.forEach(p=>p.reject(Error('Contexto alterado.')));pending.clear();saveRequest='';savedEvents=0;emit({rows:[],records:[],history:[],events:[],runs:[],context:{},busy:false,progress:0,total:0,error:'',message:'',runId:'',selected:[]});}
function clearResults(){saveRequest='';savedEvents=0;emit({rows:[],events:[],progress:0,total:0,runId:'',selected:[],context:{...state.context,saved:false,history:undefined}});}
async function generator(){await g.GRCONModuleLoader.ensure('react-dist/allocation-app.js');return g.GrconAllocationGeneratorUi;}
async function getContext(){const ui=await generator();return await ui.auditContext();}
const identifyAllocation=(name:string)=>name.match(/(C1O-ALOC-[A-Z]+-\d{3,4}-20\d{2})/i)?.[1]?.toUpperCase()||'';
const save=(bytes:Uint8Array,name:string)=>{const u=URL.createObjectURL(new Blob([bytes as BlobPart]));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);};
export const service={
 subscribe(f:()=>void){listeners.add(f);return ()=>{listeners.delete(f);};},snapshot:()=>state,
 core:()=>g.GrconAllocationAuditorCore,
 async activate(){requireSession();try{const data=await rpc('history');emit({runs:data.runs});}catch(e){emit({message:'Histórico compartilhado indisponível: '+(e as Error).message});}},
 async open(seed:Data){return task(async()=>{const t=epoch;current(t);clearResults();emit({records:seed.rows.map((r:Data)=>({...r.record,document:r.document,revision:r.revision,title:r.title,discipline:r.output.discipline||r.identity.discipline,workflow:r.output.workflow,databook:r.output.databook,levels:r.output.levels,eap:r.identity.eap,allocation:seed.allocation||'',sourceFile:seed.allocation?'Histórico do Gerador':'Gerador GRCON',sourceVersions:seed.sourceVersions||{},contract:cloud().membership.contract_id})),context:{...seed,contract:cloud().membership.contract_id},message:'Documentos recebidos do Gerador. Inicie a auditoria.'});});},
 inspect:(file:File)=>task(async()=>compute('inspect',{file})),
 async import(file:File,sheet:string,kind:'allocation'|'history',allocation=''){return task(async()=>{const c=requireSession(),t=epoch;const code=allocation.trim()||identifyAllocation(file.name);const data=await compute('parse',{file,sheet,allocation:code,contract:c.membership.contract_id});current(t);clearResults();emit(kind==='history'?{history:g.GrconAllocationAuditorCore.mergeHistory(state.history,data.records),message:`${data.records.length} eventos fiscais lidos. Comentários originais preservados.`}:{records:data.records,context:{...state.context,inputFile:file.name,inputSheet:sheet,inputModel:data.model,allocation:code,sourceHash:data.sha256},message:`${data.records.length} documentos da aba ${sheet} reconhecidos (${data.model==='official-16'?'modelo oficial de 16 colunas':'colunas compatíveis'}). Iniciando verificação.`});return data;});},
 async importLd(files:File[]){return task(async()=>{const t=epoch,ui=await generator();await ui.importAuditLd(files);current(t);clearResults();emit({message:'LDs lidas. Originais preservados.'});});},
 async availableAllocations(){return task(async()=>{const t=epoch,ctx=await getContext();current(t);emit({context:{...state.context,allocationRuns:ctx.allocationRuns||[]},message:'Alocações reconhecidas no histórico do Gerador carregadas.'});});},
 async openAllocation(id:string){const ui=await generator();const run=state.context.allocationRuns?.find((r:Data)=>r.id===id);if(!run)throw Error('Selecione uma alocação disponível.');return ui.auditSavedRun(run);},
 async useLd(){return task(async()=>{const t=epoch,ctx=await getContext();current(t);clearResults();emit({records:ctx.ldRecords.map((r:Data)=>({...r,ld:r.source,ldSheet:r.sheet,sourceFile:r.source,sourceSheet:r.sheet,sourceRow:r.row,contract:cloud().membership.contract_id})),context:ctx,message:'Documentos da LD selecionados.'});});},
 setApplicability(revision:string,evidence:string){if(state.busy)return;clearResults();emit({context:{...state.context,applicability:{source:'ET-5290.00-22000-912-1LV-001',revision,evidence,contract:cloud()?.membership?.contract_id,confirmed:Boolean(evidence.trim()&&revision)}}});},
 async analyze(resume=false){return task(async()=>{
  const t=epoch;cancelled=false;if(!state.records.length)throw Error('Importe uma alocação ou selecione os documentos da LD.');if(state.records.length>50000)throw Error('Limite de 50.000 documentos por análise.');
  let fresh:Data={},contextWarning='';try{fresh=await getContext();}catch(e){current(t);contextWarning='As bases complementares não puderam ser consultadas: '+((e as Error).message||String(e))+'. Auditoria parcial; verificações dependentes das bases permanecem inconclusivas.';}
   current(t);const context={...fresh,...state.context,saved:false,ldRecords:fresh.ldRecords||state.context.ldRecords||[],bases:fresh.bases||state.context.bases||{},versions:fresh.versions||state.context.versions||{},baseMetadata:fresh.baseMetadata||[],contract:cloud().membership.contract_id,history:g.GrconAllocationAuditorCore.mergeHistory(fresh.centralHistory||[],state.history),records:state.records,homologated:{},contextWarning};
  if(resume&&JSON.stringify(context.versions)!==JSON.stringify(state.rows[0]?.versions||context.versions))throw Error('As bases mudaram. Inicie uma nova análise.');
  if(!resume)clearResults();else{saveRequest='';savedEvents=0;emit({runId:''});}emit({context,total:state.records.length});await compute('context',context);current(t);
  let rows=resume?state.rows.slice():[];
  for(let i=rows.length;i<context.records.length;i+=100){if(cancelled)break;const next=await compute('batch',{first:i,count:100});current(t);rows=[...rows,...next];emit({rows,progress:rows.length});await new Promise(resolve=>setTimeout(resolve,0));}
  emit({selected:rows.map((_,i)=>i),message:cancelled?'Análise pausada. Os registros concluídos podem ser retomados.':contextWarning?'Auditoria parcial concluída. '+contextWarning:'Auditoria concluída. Confira as pendências e evidências.'});
 });},
 cancel(){cancelled=true;},
 select(indices:number[]){emit({selected:indices});},
 async review(index:number,input:Data){const c=requireSession();if(state.busy)throw Error('Aguarde a operação atual.');if(!['owner','admin','operator'].includes(c.membership.role))throw Error('Perfil sem permissão de revisão.');const row=state.rows[index];if(input.field==='databook'&&input.value&&!state.context.bases?.databook?.some((p:Data)=>p.databook===input.value))throw Error('Escolha um caminho existente na base ativa.');
  const event={...g.GrconAllocationAuditorCore.reviewEvent(row,input,c.session.user.id),requestId:crypto.randomUUID()};
  emit({events:[...state.events,event],message:'Decisão registrada. A Central e a LD oficial não foram alteradas.'});
 },
 async save(){return task(async()=>{if(!state.rows.length)throw Error('Nenhuma análise para salvar.');const t=epoch;saveRequest=saveRequest||crypto.randomUUID();
  const metadata={engine:'1.0.0',versions:state.context.versions,applicability:state.context.applicability||{},sourceCount:(state.context.history||state.history).length,summary:g.GrconAllocationAuditorCore.summary(state.rows),kind:'audit'};
  const {id}=state.runId?{id:state.runId}:await rpc('begin',{requestId:saveRequest,count:state.rows.length,metadata});current(t);emit({runId:id});
  // Saved rows are immutable. Finishing may be retried after a lost response.
  if(!state.context.saved){for(let i=0;i<state.rows.length;i+=100){const rows=state.rows.slice(i,i+100).map(r=>{const {history,...rest}=r;return {...rest,history:history.map((h:Data)=>({document:h.document,revision:h.revision,allocation:h.allocation,fiscalComment:h.fiscalComment,fiscalDecision:h.fiscalDecision,returnedAt:h.returnedAt,sourceFile:h.sourceFile,sourceSheet:h.sourceSheet,sourceRow:h.sourceRow}))};});await rpc('chunk',{id,first:i+1,rows});current(t);}await rpc('finish',{id});current(t);emit({context:{...state.context,saved:true}});}
  for(let i=savedEvents;i<state.events.length;i++){const e=state.events[i];await rpc('event',{id,requestId:e.requestId,event:e});current(t);savedEvents=i+1;}
  const page=await rpc('history');emit({runs:page.runs,message:'Análise e decisões salvas com histórico auditável.'});
 });},
 async restore(run:Data){return task(async()=>{const t=epoch;const rows:Data[]=[];let meta:Data={},events:Data[]=[];
  for(let i=0;i<run.expected_count;i+=200){const d=await rpc('detail',{id:run.id,after:i});current(t);if(!d.rows.length)break;rows.push(...d.rows.map((x:Data)=>x.payload));meta=d.run.metadata;events=d.events;}
  clearResults();savedEvents=events.length;emit({rows,records:rows.map(r=>({...r})),events,runId:run.id,selected:rows.map((_,i)=>i),progress:rows.length,total:rows.length,context:{versions:meta.versions,applicability:meta.applicability,contract:cloud().membership.contract_id,saved:true},message:'Análise histórica carregada com suas versões originais. Reanalise para usar bases atuais.'});
 });},
 async export(official=false){return task(async()=>{if(!state.rows.length)throw Error('Execute a auditoria primeiro.');const t=epoch;let files:Data[]=[];
  if(official){if(state.progress!==state.total)throw Error('Conclua a análise antes de gerar o pacote oficial.');const ui=await generator();files=await ui.generateAudited(state.rows.filter((_,i)=>state.selected.includes(i)),state.events,state.context.versions);current(t);}
  const bytes=await compute('export',{...state.context,rows:state.rows,events:state.events,history:state.context.history|| (state.history.length?state.history:state.rows.flatMap(r=>r.history||[])),files});current(t);save(bytes,'Auditoria_Alocacao_GRCON.zip');
 });},
 async revisedLd(file:File){return task(async()=>{const t=epoch,ui=await generator();const events=g.GrconAllocationAuditorCore.approvedChanges(state.events).filter((e:Data)=>e.field==='title');if(!events.length)throw Error('Aprove uma proposta de título primeiro.');const result=await ui.reviseAuditLd(file,state.rows,events);current(t);save(result.buffer,result.fileName);emit({message:`Cópia revisada gerada; ${result.count} títulos alterados e preservação verificada.`});});},
 async ai(index:number){return task(async()=>{const c=requireSession(),t=epoch,r=state.rows[index];if(r.ai)return;if(!r.findings.length)throw Error('Não há apontamentos para esta consulta.');const response=await fetch('/api/document-vault/allocation-audit-ai',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+c.session.access_token},body:JSON.stringify({workspaceId:c.membership.workspace_id,document:r.document,title:r.title,findings:r.findings.slice(0,8).map((f:Data,i:number)=>({id:'finding:'+i,field:f.field,message:f.message,evidence:f.evidence.slice(0,2)}))})});const d=await response.json();current(t);if(!response.ok)throw Error(d.message||'IA indisponível.');const rows=state.rows.slice();rows[index]={...r,ai:d};emit({rows});});},clear:reset,
};
for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])window.addEventListener(event,reset);
window.addEventListener('grcon:cloud-ready',()=>{if(identity!==scope())reset();});
