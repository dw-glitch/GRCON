// Legacy engines cross the Worker boundary as structured data; components consume
// the typed operational fields below, without exposing GRCON globals to RECON.
export type BaseKind='databook'|'eap'|'titles'|'norms'|'template'|'li'|'scon'|'appendix'|'config';
export type Data=Record<string,any>;
export interface Row extends Data {document:string;revision:string;title:string;originalTitle:string;titleSource:string;ldLocated:boolean;plannedAllocated:boolean;existing:Array<{allocation:string;status:string}>;confidence:string;blockers:string[];statusLabel:string;decisionId:string;confirmed:boolean;output:{workflow:string;discipline:string;databook:string;levels:string[]};standard:{refs:Data[];errors:Data[];warnings:Data[];compatible:boolean};versions:Record<string,string>;identity:{family:string;discipline:string;eap:string};ai:Data|null;selected:boolean;}
export interface FileOutput {name:string;kind:string;base64:string;sha256:string;}
export interface Snapshot {openRequest:null|{document:string;revision:string;id:number};bases:Data[];versions:Record<string,string>;rows:Row[];history:Data[];decisions:Data[];preview:null|{kind:BaseKind;rows:Data[];fileName:string};busy:boolean;progress:string;error:string;canManage:boolean;plan:Data|null;files:FileOutput[];}
const globals=window as unknown as Record<string,any>;
let state:Snapshot={openRequest:null,bases:[],versions:{},rows:[],history:[],decisions:[],preview:null,busy:false,progress:'',error:'',canManage:false,plan:null,files:[]};
const listeners=new Set<()=>void>();const emit=(patch:Partial<Snapshot>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
const cloud=()=>globals.GrconCloud?.state;
const scope=()=>JSON.stringify([cloud()?.session?.user?.id||'',cloud()?.membership?.workspace_id||'']);
let identity=scope(),epoch=0,worker:Worker|null=null,requestId=0,openId=0,activeRequest:string|null=null;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
const baseCache=new Map<string,Data[]>();let ldRecords:Data[]=[],localCentral:Data[]=[],localHistory:Data[]=[],contextBases:Record<string,Data[]>={};
function current(ticket:number){if(ticket!==epoch||identity!==scope())throw Error('A conta ou o contrato mudou. Refaça a análise.');}
function reset(){identity=scope();epoch++;worker?.terminate();worker=null;pending.forEach(p=>p.reject(Error('Contexto alterado.')));pending.clear();baseCache.clear();ldRecords=[];localCentral=[];localHistory=[];contextBases={};activeRequest=null;emit({openRequest:null,bases:[],versions:{},rows:[],history:[],decisions:[],preview:null,busy:false,progress:'',error:'',canManage:false,plan:null,files:[]});}
export async function compute(operation:string,input:Data):Promise<any>{
 if(!worker){worker=new Worker('workers/allocation.worker.js');worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);if(data.error)p.reject(Error(data.error));else p.resolve(data.result);};worker.onerror=()=>{pending.forEach(p=>p.reject(Error('Motor de alocação indisponível. Reabra o módulo.')));pending.clear();worker?.terminate();worker=null;};}
 const id=++requestId;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker!.postMessage({id,operation,input});});
}
async function rpc(operation:string,input:Data={}){
 const ticket=epoch,c=cloud();if(!c?.session?.user||!c?.membership||!c?.online)throw Error('Conecte-se ao contrato para usar o gerador.');
 const response=await c.client.rpc('grcon_allocation',{target_workspace:c.membership.workspace_id,operation,input});current(ticket);if(response.error)throw response.error;return response.data;
}
async function api(action:string,input:Data){
 const ticket=epoch,c=cloud();if(!c?.session?.access_token||!c?.membership)throw Error('Sessão necessária.');
 const response=await fetch('/api/document-vault/allocation-'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+c.session.access_token},body:JSON.stringify({...input,workspaceId:c.membership.workspace_id})});
 const result=await response.json();current(ticket);if(!response.ok||!result.ok)throw Error(result.message||'Não foi possível concluir.');return result;
}
async function task<T>(label:string,action:()=>Promise<T>):Promise<T|undefined>{
 if(state.busy)return;const ticket=epoch;emit({busy:true,progress:label,error:''});
 try{return await action();}catch(error){if(ticket===epoch)emit({error:error instanceof Error?error.message:String(error)});}
 finally{if(ticket===epoch)emit({busy:false,progress:''});}
}
async function loadBase(base:Data){
 if(baseCache.has(base.id))return baseCache.get(base.id)!;const rows:Data[]=[];
 while(rows.length<base.record_count){const page=await rpc('page',{id:base.id,after:rows.length});if(!Array.isArray(page.rows)||!page.rows.length)throw Error('Base incompleta; análise interrompida.');for(const row of page.rows){if(row.row_number!==rows.length+1)throw Error('Ordem inválida da base.');rows.push(row.payload);}}
 if(rows.length!==base.record_count)throw Error('Contagem divergente da base.');baseCache.set(base.id,rows);return rows;
}
async function refreshInternal(){
 if(identity!==scope())reset();const ticket=epoch;const catalog=await rpc('catalog');current(ticket);
 const changed=JSON.stringify(catalog.versions)!==JSON.stringify(state.versions);if(changed){contextBases={};activeRequest=null;}
 emit({bases:catalog.bases,versions:catalog.versions,canManage:catalog.canManage,...(changed?{openRequest:null,rows:[],plan:null,files:[]}: {})});
  const [history,decisions]=await Promise.all([rpc('history'),rpc('experiences')]);emit({history:history.runs,decisions:decisions.decisions});
}
export const service={
 subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};},snapshot:()=>state,
 refresh:()=>task('Atualizando bases e histórico',refreshInternal),
 async open(seed:{document:string;revision:string}){
  const ticket=epoch,intent=++openId;
  try{
   // Module activation starts a refresh. Wait for it before starting the seeded
   // analysis; the persisted request also survives React's first mount.
   if(state.busy)await new Promise<void>(resolve=>{const done=()=>{if(!state.busy){listeners.delete(done);resolve();}};listeners.add(done);done();});
   current(ticket);if(intent!==openId)return;await this.analyze('',[seed]);current(ticket);
   if(intent===openId&&!state.error&&state.rows.length)emit({openRequest:{...seed,id:intent}});
  }catch(error){if(ticket===epoch)emit({error:error instanceof Error?error.message:String(error)});}
 },
 async preview(kind:BaseKind,file?:File){return task('Lendo base e preparando prévia',async()=>{const rows=await compute(file?'parse':'bundled',file?{kind,file}:{kind});if(!Array.isArray(rows)||!rows.length)throw Error('Base vazia.');emit({preview:{kind,rows,fileName:file?.name||'Referência RECON — confirmar vigência'}});});},
 previewConfig(prefix:string,unit:string){emit({preview:{kind:'config',fileName:'Configuração contratual',rows:[{prefix:prefix.trim(),unit:unit.trim()}]}});},
 async publish(revision:string){return task('Publicando base de referência',async()=>{
  const preview=state.preview;if(!preview||!revision.trim())throw Error('Informe a revisão autorizada antes de publicar.');
  const ticket=epoch,{id}=await rpc('base-begin',{kind:preview.kind,fileName:preview.fileName,revision,count:preview.rows.length,metadata:{origin:preview.fileName.includes('RECON')?'RECON fadf2f3':'importacao',confirmedRevision:revision},expectedActive:state.versions[preview.kind]||null});
  for(let i=0;i<preview.rows.length;i+=250){current(ticket);emit({progress:`Enviando ${Math.min(i+250,preview.rows.length)} de ${preview.rows.length} registros`});await rpc('base-chunk',{id,first:i+1,rows:preview.rows.slice(i,i+250)});}
  await rpc('base-publish',{id});emit({preview:null});await refreshInternal();
 });},
 restore:(base:Data)=>task('Restaurando versão da base',async()=>{await rpc('base-restore',{id:base.id,expectedActive:state.versions[base.kind]||null});await refreshInternal();}),
 async importSource(kind:'ld'|'central'|'history',files:File[]){return task('Lendo fontes documentais',async()=>{const rows:Data[]=[];for(const file of files){const parsed=await compute('parse',{kind,file});rows.push(...(kind==='ld'?parsed.records:parsed));}if(kind==='ld')ldRecords=rows;else if(kind==='central')localCentral=rows;else localHistory=rows;emit({rows:[],plan:null,files:[],progress:`${rows.length} registros reconhecidos`});return rows.length;});},
 async analyze(text:string,seeds:Data[]=[]){return task('Analisando documentos e caminhos',async()=>{
  const ticket=epoch;await refreshInternal();current(ticket);
  for(const base of state.bases.filter(x=>x.status==='active')){contextBases[base.kind]=await loadBase(base);current(ticket);}
  if(!contextBases.databook?.length)throw Error('Publique a base Databook do contrato antes de analisar.');
  // Reuse the LD already analyzed by GRCON, rather than request the same import.
  const shared=globals.GrconTriageUiApi?.allocationSources?.();
  if(!ldRecords.length&&shared?.records?.length)ldRecords=shared.records;
  await globals.GrconAllocationRegistry?.refresh?.();current(ticket);
  const central=[...(globals.GrconAllocationRegistry?.current()?.records||[]),...localCentral,...localHistory];
  const documents=seeds.length?seeds:[...new Set(text.split(/\r?\n|;/).map(x=>x.trim()).filter(Boolean))].map(document=>({document}));
  if(!documents.length)throw Error('Informe ao menos um código.');
  const planned=globals.GrconPlannedDocuments?.current()?.records||[];
  const rows=await compute('analyze',{documents,records:ldRecords,central,planned,bases:contextBases,versions:state.versions,decisions:state.decisions});current(ticket);
  emit({rows,files:[],plan:null});activeRequest=null;
 });},
 async review(index:number,changes:Data){const ticket=epoch,row=await compute('review',{row:state.rows[index],changes,bases:contextBases});current(ticket);const rows=state.rows.slice();rows[index]=row;emit({rows,files:[],plan:null});activeRequest=null;},
 async confirm(index:number,justification:string,status='corrected'){return task('Registrando decisão revisada',async()=>{
  const ticket=epoch,row=state.rows[index],payload=await compute('decision',{row,justification,status});current(ticket);
  const result=await api('confirm',payload);
  const rows=state.rows.slice();rows[index]={...row,decisionId:result.id,confirmed:true,selected:true,learned:result.trusted===true};emit({rows,files:[],plan:null});activeRequest=null;
 });},
 async ai(index:number){return task('Consultando IA para este documento',async()=>{
  const row=state.rows[index];if(row.confidence==='alta')throw Error('Correspondência exata: a análise por regras já é suficiente.');
  if(row.ai)return;
  const response=await api('ai',{document:row.document,title:row.title,discipline:row.identity.discipline,versions:row.versions,candidatePaths:row.candidates.slice(0,3).map((p:Data)=>p.databook).filter(Boolean)});const rows=state.rows.slice();rows[index]={...row,ai:response};emit({rows});
 });},
 select(index:number,value:boolean){const rows=state.rows.slice();rows[index]={...rows[index],selected:value};activeRequest=null;emit({rows,plan:null,files:[]});},
 async plan(mode:string){const plan=await compute('plan',{results:state.rows.filter(x=>x.selected),mode});emit({plan});return plan;},
 async generate(mode:string,justification:string){return task('Gerando pacote de alocação',async()=>{
  const ticket=epoch,selected=state.rows.filter(x=>x.selected);if(!selected.length||selected.some(r=>!r.confirmed))throw Error('Revise e confirme todos os documentos selecionados.');
  const plan=await this.plan(mode);if(!plan.valid)throw Error(plan.errors?.join(' ')||'Agrupamento inválido.');
  activeRequest=activeRequest||crypto.randomUUID();
  const prefix=contextBases.config?.[0]?.prefix,year=new Date().getUTCFullYear();
  const observedSequence=Math.max(0,...[...localCentral,...localHistory].map(r=>{const value=String(r.allocation||'');const match=value.startsWith(prefix+'-')?value.match(/-(\d{4})-(\d{4})$/):null;return match&&Number(match[2])===year?Number(match[1]):0;}));
  const generated=await rpc('generate',{requestId:activeRequest,versions:state.versions,observedSequence,justification,groups:plan.groups.map((g:Data)=>({documents:g.results.map((r:Row)=>({document:r.document,revision:r.revision,decisionId:r.decisionId}))}))});
  const files:FileOutput[]=[];
  for(let i=0;i<plan.groups.length;i++){
   current(ticket);const run=generated.runs[i];let groupFiles=run.files;
   if(!groupFiles?.length){
    groupFiles=await compute('export',{results:plan.groups[i].results,template:contextBases.template?.[0],meta:{allocationCode:run.allocation_code,allocationDate:new Date().toISOString().slice(0,10),status:'PENDENTE ENVIO DE LD'}});current(ticket);
    await rpc('run-files',{id:run.id,files:groupFiles});
   }files.push(...groupFiles);
  }emit({files});const history=await rpc('history');emit({history:history.runs});
 });},
 async download(kind='zip',files=state.files){if(!files.length)throw Error('Gere os arquivos primeiro.');
  if(kind==='zip'){const bytes=await compute('zip',{files});save(new Blob([bytes]),'Pacote_Alocacao_GRCON.zip');}
  else for(const file of files.filter(x=>x.kind===kind)){const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==file.sha256)throw Error('Arquivo do histórico não passou na verificação de integridade.');save(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),file.name);}
 },
 historyDownload:(run:Data)=>task('Preparando arquivos preservados',async()=>{const saved=await rpc('run-detail',{id:run.id});await service.download('zip',saved.files);}),
 searchHistory:(q:string,more=false)=>task('Consultando histórico',async()=>{const page=await rpc('history',{q,after:more?state.history.length:0});emit({history:more?[...state.history,...page.runs]:page.runs});}),
 moreExperiences:()=>task('Consultando experiências',async()=>{const page=await rpc('experiences',{after:state.decisions.length});emit({decisions:[...state.decisions,...page.decisions]});}),
 status:(run:Data,status:string,justification:string)=>task('Registrando situação real da alocação',async()=>{await rpc('run-status',{id:run.id,status,justification});await refreshInternal();}),
 invalidate:(decision:Data)=>task('Invalidando experiência',async()=>{await rpc('invalidate',{id:decision.id});await refreshInternal();}),
 bases:()=>contextBases,clear:reset,
};
function save(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])window.addEventListener(event,reset);
window.addEventListener('grcon:cloud-ready',()=>{if(identity!==scope())reset();});
