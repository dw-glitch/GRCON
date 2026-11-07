export type Data=Record<string,any>;
export class OperationError extends Error{
 code:string;operation:string;
 constructor(code:string,message:string,operation=''){super(message);this.name='OperationError';this.code=code;this.operation=operation;}
}
// Prazos por operação (ms). Valores generosos para arquivos grandes, mas finitos.
export const DEADLINES:Record<string,number>={
 inspect:60_000,parse:120_000,context:60_000,batch:120_000,summarize:60_000,'revise-allocation':120_000,'assistant-package':180_000,export:180_000,
 rpc:30_000,'rpc-write':60_000,ai:35_000,default:90_000
};
export const deadlineFor=(operation:string,overrides:Record<string,number>={})=>overrides[operation]??DEADLINES[operation]??overrides.default??DEADLINES.default;

type Pending={reject:(e:Error)=>void;operation:string;started:number};
// Registro das operações em andamento, para cancelar todas de uma vez.
export class OperationRegistry{
 private active=new Map<number,Pending&{id:number}>();private serial=0;
 log:Data[]=[];max=100;
 begin(operation:string,reject:(e:Error)=>void){const id=++this.serial;this.active.set(id,{id,reject,operation,started:Date.now()});return id;}
 end(id:number){this.active.delete(id);}
 get size(){return this.active.size;}
 cancelAll(message='Operação cancelada a seu pedido.'){const items=[...this.active.values()];this.active.clear();for(const i of items)i.reject(new OperationError('CANCELLED',message,i.operation));return items.length;}
 record(entry:Data){this.log.push(entry);if(this.log.length>this.max)this.log.splice(0,this.log.length-this.max);}
}

// Executa `start` com prazo. Se o prazo estoura, rejeita com TIMEOUT e chama `onTimeout` (ex.: encerrar o Worker ou abortar o fetch).
export function withDeadline<T>(operation:string,start:(signal:AbortSignal)=>Promise<T>,opts:{ms?:number;overrides?:Record<string,number>;onTimeout?:()=>void;registry?:OperationRegistry;signal?:AbortSignal}={}):Promise<T>{
 const ms=opts.ms??deadlineFor(operation,opts.overrides),controller:AbortController=typeof AbortController==='function'?new AbortController():({signal:undefined as any,abort(){}} as any);
 return new Promise<T>((resolve,reject)=>{
  let done=false,timer:ReturnType<typeof setTimeout>|undefined,regId=0;
  const finish=(fn:()=>void)=>{if(done)return;done=true;if(timer){try{clearTimeout(timer);}catch{/* ambiente sem clearTimeout */}}if(regId)opts.registry?.end(regId);opts.signal?.removeEventListener?.('abort',onAbort);fn();};
  const onAbort=()=>finish(()=>{controller.abort();reject(new OperationError('CANCELLED','Operação cancelada a seu pedido.',operation));});
  if(opts.signal){if(opts.signal.aborted){reject(new OperationError('CANCELLED','Operação cancelada a seu pedido.',operation));return;}opts.signal.addEventListener('abort',onAbort,{once:true});}
  if(opts.registry)regId=opts.registry.begin(operation,e=>finish(()=>{controller.abort();reject(e);}));
  timer=setTimeout(()=>finish(()=>{controller.abort();try{opts.onTimeout?.();}catch{/* o encerramento é melhor esforço */}reject(new OperationError('TIMEOUT','Tempo esgotado na operação '+operation+' ('+(ms<1000?ms+' ms':Math.round(ms/1000)+' s')+').',operation));}),ms);
  (timer as any)?.unref?.(); // no Node, o prazo pendente não deve segurar o processo
  let promise:Promise<T>;try{promise=start(controller.signal);}catch(e){finish(()=>reject(e as Error));return;}
  promise.then(v=>finish(()=>resolve(v)),e=>finish(()=>reject(e)));
 });
}

// Identificador curto de operação para o registro técnico.
export const newOperationId=()=>'op-'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);

type Snapshot={groups:Data[];summary:Data;rows:Data[];records:Data[];history:Data[];events:Data[];runs:Data[];context:Data;busy:boolean;progress:number;total:number;error:string;message:string;runId:string;selected:number[];comparison:Data|null;errorCode:string};
const g=window as unknown as Data;
let state:Snapshot={groups:[],summary:{},rows:[],records:[],history:[],events:[],runs:[],context:{},busy:false,progress:0,total:0,error:'',message:'',runId:'',selected:[],comparison:null,errorCode:''};
// Prazos e cancelamento por operação (RA-11) e registro técnico seguro: só identificadores, etapa, código e tempos.
const ops=new OperationRegistry();let deadlineOverrides:Record<string,number>={};
const errorsApi=()=>g.GrconAllocationAuditorErrors;
function logOp(operation:string,started:number,error?:any,count?:number){
 const E=errorsApi();if(!E)return;
 ops.record(E.logEntry({operationId:newOperationId(),step:operation,code:error?(error.code||E.classify(error).code):'OK',ok:!error,ms:Date.now()-started,count}));
}
// Resultado anterior (concluído) da mesma sessão, guardado ao limpar os resultados para reauditar: serve só para a comparação antes × depois.
let baseline:Data[]|null=null;
const listeners=new Set<()=>void>(),emit=(p:Partial<Snapshot>)=>{state={...state,...p};listeners.forEach(f=>f());};
const cloud=()=>g.GrconCloud?.state;
const scope=()=>JSON.stringify([cloud()?.session?.user?.id,cloud()?.membership?.workspace_id,cloud()?.membership?.contract_id]);
const sourceFiles=new Map<string,File>();
let identity=scope(),epoch=0,cancelled=false,worker:Worker|null=null,serial=0,saveRequest='',savedEvents=0,saveMetadata:Data|null=null;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
function requireSession(){const c=cloud();if(!c?.session?.user?.id||!c.membership?.contract_id||!c.membership?.workspace_id)throw Error('Entre em um contrato para auditar alocações.');if(identity!==scope())reset();return c;}
function current(t:number){if(t!==epoch||identity!==scope())throw Error('Conta ou contrato alterado. Reabra a análise.');}
function abortWorker(error:Error){const dead=worker;worker=null;try{dead?.terminate();}catch{/* melhor esforço */}const all=[...pending.values()];pending.clear();for(const p of all)p.reject(error);}
async function compute(operation:string,input:Data){
 if(!worker){worker=new Worker('workers/allocation-auditor.worker.js');worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);};worker.onerror=()=>{const e=Error('Falha no processamento. A análise parcial permanece disponível.');const all=[...pending.values()];pending.clear();for(const p of all)p.reject(e);worker?.terminate();worker=null;};}
 const id=++serial,started=Date.now(),target=worker;
 try{
  const result=await withDeadline<any>(operation,()=>new Promise<any>((resolve,reject)=>{pending.set(id,{resolve,reject});target!.postMessage({id,operation,input});}),
   {overrides:deadlineOverrides,registry:ops,onTimeout:()=>{pending.delete(id);if(worker===target)abortWorker(new OperationError('TIMEOUT','Tempo esgotado na operação '+operation+'.',operation));}});
  logOp(operation,started);return result;
 }catch(e){
  pending.delete(id);
  // Prazo ou cancelamento: o Worker pode estar no meio do trabalho; encerra-o. A resposta que chegar depois é ignorada (id removido).
  if(e instanceof OperationError&&worker===target)abortWorker(e);
  logOp(operation,started,e);throw e;
 }
}
// Compatibilidade com o banco: salvar o histórico completo (checkpoint) exige a migração 20261106104652 (operações input-chunk/input-detail).
// Se o servidor ainda não a recebeu, o app NÃO falha no meio da gravação: diz que o histórico está indisponível e segue com análise e relatório.
let checkpointSupport:'unknown'|'yes'|'no'='unknown',checkpointCheckedAt=0;
async function requireCheckpointSupport(){
 const ttl=deadlineOverrides.capabilityTtl??60000;
 if(checkpointSupport==='yes')return;
 if(checkpointSupport==='no'&&Date.now()-checkpointCheckedAt<ttl)throw new OperationError('CHECKPOINT_UNAVAILABLE','Histórico completo indisponível: o banco ainda não recebeu a atualização do checkpoint.','save');
 // Sonda: input-detail numa análise JÁ existente do contrato. No banco antigo a operação cai em "Operação não reconhecida."; no atualizado, responde.
 // (Com id inexistente os dois bancos respondem "Análise indisponível.", por isso a sonda precisa de uma análise real.)
 let probeId='';
 try{const h=await rpc('history',{});probeId=String(h?.runs?.[0]?.id||'');}catch{/* sem histórico legível: não há como sondar */}
 if(!probeId)return; // primeira gravação do contrato: a falha, se houver, é tratada ao enviar a entrada
 try{await rpc('input-detail',{id:probeId,after:0});checkpointSupport='yes';}
 catch(e){
  const m=String((e as Error)?.message||'');
  if(/opera[cç][aã]o n[aã]o reconhecida/i.test(m)){checkpointSupport='no';checkpointCheckedAt=Date.now();throw new OperationError('CHECKPOINT_UNAVAILABLE','Histórico completo indisponível: o banco ainda não recebeu a atualização do checkpoint ('+m+').','save');}
  /* outro erro: não conclui nada sobre a versão do banco; segue e deixa a gravação falhar normalmente se for o caso */
 }
}
let pauseMark=0,analysisSerial=0,activeAnalysis=0; // a pausa só pode interromper a análise que foi pausada, nunca uma gravação ou exportação posterior
function hardCancel(){const n=ops.cancelAll();if(worker)abortWorker(new OperationError('CANCELLED','Operação cancelada a seu pedido.'));return n;}
const WRITE_OPS=new Set(['begin','chunk','input-chunk','finish','event']);
async function rpc(operation:string,input:Data={}){
 const c=requireSession(),t=epoch,started=Date.now(),write=WRITE_OPS.has(operation);
 try{
  const r=await withDeadline<any>(write?'rpc-write':'rpc',signal=>{const b:any=c.client.rpc('grcon_allocation_auditor',{target_workspace:c.membership.workspace_id,operation,input});if(b&&typeof b.abortSignal==='function')b.abortSignal(signal);return Promise.resolve(b);},{overrides:deadlineOverrides,registry:ops});
  current(t);
  if(r.error){const message=r.error.message||'Não foi possível acessar o histórico do auditor.';throw write?new OperationError('SAVE_FAILED',message,operation):Error(message);}
  logOp('rpc:'+operation,started);return r.data;
 }catch(e){logOp('rpc:'+operation,started,e);throw e;}
}
async function task(action:()=>Promise<unknown>){if(state.busy)throw Error('Aguarde a operação atual.');requireSession();const t=epoch;emit({busy:true,error:'',errorCode:'',message:''});try{return await action();}catch(e){if(t===epoch){const code=(e as Data)?.code||'';if(code==='CANCELLED')emit({message:'Operação cancelada. O que já foi analisado ou salvo foi preservado.'});else emit({error:(e as Error).message||String(e),errorCode:code});}throw e;}finally{if(t===epoch)emit({busy:false});}}
function reset(){baseline=null;sourceFiles.clear();identity=scope();epoch++;cancelled=true;ops.cancelAll('Contexto alterado.');abortWorker(new OperationError('STALE_CONTEXT','Contexto alterado.'));saveRequest='';savedEvents=0;saveMetadata=null;emit({comparison:null,groups:[],summary:{},rows:[],records:[],history:[],events:[],runs:[],context:{},busy:false,progress:0,total:0,error:'',errorCode:'',message:'',runId:'',selected:[]});}
// Nome seguro e legível da cópia; o hash curto só entra se houver colisão.
function outName(folder:string,original:string,sha:string,existing:Data[]){
 const base=original.replace(/\.xlsx$/i,'').replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/^\.+/,'').slice(0,80)||'ARQUIVO';
 let name=folder+'/'+base+'_CORRIGIDA.xlsx';
 if(existing.some(f=>f.name===name))name=folder+'/'+base+'_'+sha.slice(0,8)+'_CORRIGIDA.xlsx';
 return name;
}
function remainingGroups(events:Data[],rows:Data[]=state.rows){const latest=new Map(events.map(e=>[JSON.stringify([e.lineage,e.field]),e]));return g.GrconAllocationAssistant?.groups(rows.map(row=>({...row,recommendations:(row.recommendations||[]).filter((p:Data)=>!['accepted','rejected'].includes(latest.get(JSON.stringify([row.lineage,p.field]))?.decision||''))})))||[];}
function clearResults(){if(state.rows.length&&state.total>0&&state.progress===state.total&&!state.context.partial)baseline=state.rows;saveRequest='';savedEvents=0;saveMetadata=null;emit({comparison:null,groups:[],summary:{},rows:[],events:[],progress:0,total:0,runId:'',selected:[],context:{...state.context,saved:false,checkpoint:false,history:undefined}});}
const canonical=(value:any):string=>value&&typeof value.toJSON==='function'?canonical(value.toJSON()):JSON.stringify(value===undefined?null:value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,JSON.parse(canonical(value[k]))])):value);
const digest=async(value:any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const sameInput=(input:Data,result:Data)=>['document','sourceHash','sourceFile','sourceSheet','sourceRow','allocation'].every(k=>String(input[k]??'')===String(result[k]??''))&&(!input.revision||String(input.revision)===String(result.revision));
async function referenceDigest(context:Data){return digest({versions:context.versions||{},applicability:context.applicability||{},bases:context.bases||{},history:context.history||[],ldRecords:(context.ldRecords||[]).map(({sourceTimestamp,...r}:Data)=>r)});}
function stopWorker(){epoch++;cancelled=true;worker?.terminate();worker=null;pending.forEach(p=>p.reject(Error('Análise substituída.')));pending.clear();}
function emptySnapshot():Partial<Snapshot>{return {comparison:null,groups:[],summary:{},rows:[],records:[],history:[],events:[],context:{},progress:0,total:0,error:'',message:'Conversa sem análise vinculada. Anexe as fontes para começar.',runId:'',selected:[]};}
function commitRestore(snapshot:Partial<Snapshot>,meta:Data|null,t:number){current(t);stopWorker();sourceFiles.clear();g.GrconAllocationGeneratorUi?.clearAuditLd?.();saveRequest='';savedEvents=snapshot.events?.length||0;saveMetadata=meta;emit(snapshot);}
async function stageRestore(run:Data){
 const t=epoch,rows:Data[]=[],records:Data[]=[];let meta:Data=run.metadata||{},events:Data[]=[];
 if(!Number.isInteger(run.expected_count)||run.expected_count<1||run.expected_count>50000)throw Error('A análise salva não informa um total documental válido.');
 const total=run.expected_count;
 for(let after=0;after<total;){const d=await rpc('detail',{id:run.id,after});current(t);
  if(d.run.id!==run.id||d.run.expected_count!==total)throw Error('A identificação da análise salva mudou durante a leitura.');
  if(after===0){run=d.run;meta=run.metadata||{};events=d.events||[];}
  if(!Array.isArray(d.rows)||d.rows.length>200)throw Error('Página de resultados inválida.');
  if(!d.rows.length)break;
  for(const item of d.rows){if(item.row_number!==rows.length+1)throw Error('A análise salva tem linhas ausentes ou fora de ordem.');rows.push(item.payload);}
  after=rows.length;
 }
 if(rows.length>total||(run.completed_at&&rows.length!==total))throw Error('Os resultados salvos não correspondem ao total esperado.');
 let inputComplete=false;
 if(meta.snapshotVersion===2){
  for(let after=0;after<total;){const d=await rpc('input-detail',{id:run.id,after});current(t);
   if(!Array.isArray(d.rows)||d.rows.length>200)throw Error('Página de entrada inválida.');if(!d.rows.length)break;
   for(const item of d.rows){if(item.row_number!==records.length+1)throw Error('A entrada salva tem linhas ausentes ou fora de ordem.');records.push(item.payload);}after=records.length;
  }
  inputComplete=records.length===total&&await digest(records)===meta.inputHash;
  current(t);
  if(records.length===total&&!inputComplete)throw Error('A identidade da entrada salva não confere. A retomada foi bloqueada.');
  if(inputComplete&&rows.some((row,i)=>!sameInput(records[i],row)))throw Error('Os resultados não seguem a ordem da entrada salva.');
 }
 const grouped=await compute('summarize',{rows});current(t);
 const context={checkpoint:!run.completed_at,sources:meta.sources||[],ldHashes:meta.ldHashes||{},versions:meta.versions||{},applicability:meta.applicability||{},contract:cloud().membership.contract_id,saved:Boolean(run.completed_at),engine:meta.engine,referenceHash:meta.referenceHash,inputHash:meta.inputHash,snapshotVersion:meta.snapshotVersion,inputComplete,createdBy:run.created_by,
  resume:{action:!inputComplete?'reanalyze':(meta.sources||[]).length?'reattach':'resume',message:!inputComplete?'Entrada completa não disponível nesta análise histórica. Inicie uma nova auditoria com todas as fontes originais.':'Entrada completa recuperada. Reanexe as fontes originais para confirmar referências e versões antes de continuar.'}};
 const snapshot:Partial<Snapshot>={...grouped,groups:remainingGroups(events,rows),history:[],rows,records:inputComplete?records:[],events,runId:run.id,selected:rows.map((_,i)=>i),progress:rows.length,total,context,error:'',message:'Análise histórica recuperada: '+rows.length+' de '+total+' documentos. '+context.resume.message};
 return {commit:()=>commitRestore(snapshot,meta,t)};
}
async function generator(){await g.GRCONModuleLoader.ensure('react-dist/allocation-app.js');return g.GrconAllocationGeneratorUi;}
async function getContext(){const ui=await generator();return await ui.auditContext();}
const identifyAllocation=(name:string)=>name.match(/(C1O-ALOC-[A-Z]+-\d{3,4}-20\d{2})/i)?.[1]?.toUpperCase()||'';
const unidentifiedAllocations=()=>((state.context.sources||[]) as Data[]).filter(source=>source.kind==='allocation'&&state.records.some(r=>r.sourceHash===source.sha256&&!r.allocation&&r.allocationIdentity!=='draft-confirmed')).map(source=>({name:source.name,sha256:source.sha256}));
const inspectionFailure=(name:string,tabs:Data[])=>name+': não encontrei uma aba com códigos documentais e cabeçalhos reconhecíveis. '+tabs.filter(tab=>tab.warning).slice(0,3).map(tab=>tab.name+': '+tab.warning).join(' ')+' Confira o arquivo antes do envio.';
const save=(bytes:Uint8Array,name:string)=>{const u=URL.createObjectURL(new Blob([bytes as BlobPart]));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);};
export const service={
 async assistantRpc(operation:string,input:Data={}){const c=requireSession(),t=epoch;const r=await c.client.rpc('grcon_allocation_assistant',{target_workspace:c.membership.workspace_id,operation,input});current(t);if(r.error)throw Error(r.error.message);return r.data;},
 // Exclui a análise atual para começar outra. Os arquivos originais do usuário nunca são tocados;
 // o histórico já salvo no servidor é imutável (trilha de auditoria) e permanece.
 async discard(includeLds=false){
  if(state.busy)throw Error('Pause a análise e aguarde a operação atual antes de iniciar outra auditoria.');
  epoch++;cancelled=true;ops.cancelAll('Análise excluída.');abortWorker(new OperationError('STALE_CONTEXT','Análise excluída.'));
  const keep=includeLds?[]:((state.context.sources||[]) as Data[]).filter(x=>x.kind==='ld');
  for(const key of [...sourceFiles.keys()])if(!keep.some(x=>x.sha256===key))sourceFiles.delete(key);
  baseline=null;saveRequest='';savedEvents=0;saveMetadata=null;
  if(includeLds){try{(await generator()).clearAuditLd?.();}catch{/* o Gerador pode não estar carregado */}}
  emit({comparison:null,groups:[],summary:{},rows:[],records:[],history:[],events:[],busy:false,progress:0,total:0,error:'',runId:'',selected:[],
   context:{sources:keep,ldHashes:Object.fromEntries(keep.map((x:Data)=>[x.name,x.sha256]))},
   message:includeLds?'Análise e LDs removidas desta sessão. Seus arquivos originais não foram alterados.':'Análise excluída. As LDs continuam disponíveis. Seus arquivos originais não foram alterados.'});
 },
 // Fase 6: classificação A/B/C/D com números reais. Nada é gravado; apenas lê regras ativas do contrato.
 async correctionPlan(){
  const rows=state.rows;if(!rows.length)return g.GrconAllocationCorrections.plan([],{},g.GrconAllocationAssistant,[]);
  let rules:Data[]=[];try{rules=((await service.assistantRpc('rules')).rules||[]).filter((r:Data)=>r.state==='active');}catch{rules=[];}
  return g.GrconAllocationCorrections.plan(rows,{...state.context,rules,contract:state.context.contract||cloud()?.membership?.contract_id},g.GrconAllocationAssistant,state.events);
 },
 async applyAutomatic(){
  await service.save();const t=epoch;const result=await service.assistantRpc('authorize',{runId:state.runId});current(t);
  const events=[...state.events,...result.events];emit({events,groups:remainingGroups(events)});savedEvents=state.events.length;return result.events.length;
 },
 async inspectBatch(files:File[]){
  return task(async()=>{
   if(!files.length||files.length>20)throw Error('Selecione de 1 a 20 alocações XLSX por lote.');
   const total=files.reduce((sum,file)=>sum+file.size,0);
   if(total>100*1024*1024)throw Error('O lote ultrapassa 100 MB. Divida os arquivos.');
   const options:Data[]=[],seenNames=new Set<string>();
   for(const file of files){
    if(seenNames.has(file.name))throw Error('O lote contém nomes repetidos: '+file.name+'. Renomeie os arquivos para identificar a origem corretamente.');
    seenNames.add(file.name);
    const tabs=await compute('inspect',{file});
    const candidates=(tabs as Data[]).filter(t=>['official-16','mapped'].includes(t.model)&&t.documentCount>0);
    if(!candidates.length)throw Error(inspectionFailure(file.name,tabs));
    const official=candidates.filter(t=>t.model==='official-16');
    const officialGeneral=official.filter(t=>t.name.toUpperCase()==='GERAL');
    const mappedGeneral=candidates.filter(t=>t.name.toUpperCase()==='GERAL');
    const preferred=officialGeneral.length===1?officialGeneral[0]:official.length===1?official[0]:mappedGeneral.length===1?mappedGeneral[0]:candidates.length===1?candidates[0]:null;
    options.push({name:file.name,candidates:candidates.map(t=>({name:t.name,model:t.model,documentCount:t.documentCount})),preferred:preferred?.name||'',requiresSelection:!preferred});
   }
   return options;
  });
 },
 async importMany(files:File[],selectedSheets:Record<string,string>={}){return task(async()=>{
  const t=epoch,c=requireSession();
  if(!files.length||files.length>20)throw Error('Selecione de 1 a 20 alocações XLSX por lote.');
  if(files.reduce((sum,file)=>sum+file.size,0)>100*1024*1024)throw Error('Lote acima de 100 MB. Divida os arquivos.');
  const entries:Data[]=[],records:Data[]=[];
  const seenNames=new Map<string,string>();
  for(const file of files){
   const tabs=await compute('inspect',{file});current(t);
   const compatible=(tabs as Data[]).filter(x=>['official-16','mapped'].includes(x.model)&&x.documentCount>0);
   if(!compatible.length)throw Error(inspectionFailure(file.name,tabs));
   const official=compatible.filter(x=>x.model==='official-16');
   const officialGeneral=official.filter(x=>x.name.toUpperCase()==='GERAL');
   const mappedGeneral=compatible.filter(x=>x.name.toUpperCase()==='GERAL');
   const preferred=officialGeneral.length===1?officialGeneral[0]:official.length===1?official[0]:mappedGeneral.length===1?mappedGeneral[0]:compatible.length===1?compatible[0]:null;
   const requested=selectedSheets[file.name];
   const candidate=requested?compatible.find(x=>x.name===requested):preferred;
   if(!candidate)throw Error(file.name+': mais de uma aba documental possível ('+compatible.map(x=>x.name).join(', ')+'). Selecione a aba correta para continuar.');
   const parsed=await compute('parse',{file,sheet:candidate.name,contract:c.membership.contract_id,allocation:identifyAllocation(file.name)});current(t);
   const namedAllocation=identifyAllocation(file.name);
   if(namedAllocation&&parsed.records.some((r:Data)=>r.allocation&&r.allocation!==namedAllocation))throw Error(file.name+': a identificação da alocação nas linhas diverge do nome do arquivo. Confira a coluna Alocação e o nome antes de importar; nenhuma associação foi presumida.');
   if(parsed.records.some((r:Data)=>Boolean(r.returnedAt||(parsed.columns?.fiscalComment>=0&&r.fiscalComment))))throw Error(file.name+': a planilha possui retorno ou comentário identificado da fiscalização. O Robô Auditor recebe alocações antes da submissão; comentários fiscais anteriores são usados como precedentes separados.');
   // STATUS/OBSERVACAO in a draft is an internal note, never a Fiscal 01 response.
   const normalizedRecords=parsed.records.map((r:Data)=>parsed.columns?.fiscalComment<0&&r.fiscalComment?{
    ...r,inputStatusObservation:r.fiscalComment,fiscalComment:'',commentFindings:[],fiscalDecision:'nao-comprovado'
   }:r);
   const named=seenNames.get(file.name);
   if(named&&named!==parsed.sha256)throw Error(file.name+': o lote contém arquivos diferentes com o mesmo nome. Renomeie uma cópia.');
   seenNames.set(file.name,parsed.sha256);
   entries.push({name:file.name,sha256:parsed.sha256,kind:'allocation',sheet:candidate.name,model:parsed.model,documentCount:parsed.records.length,readingPolicy:parsed.readingPolicy,sourceIssueCount:parsed.sourceIssues?.length||0,correctionMode:parsed.model==='official-16'?'official-16':'audit-only'});
   records.push(...normalizedRecords);
  }
  const keyOf=(r:Data)=>JSON.stringify([r.contract,r.sourceHash||r.sourceFile||r.document,r.sourceSheet||'',r.sourceRow||'',r.allocation||'',r.document,r.revision]);
  const previousAllocations=(state.context.sources||[]).filter((x:Data)=>x.kind==='allocation');
  // Retomada: os mesmos arquivos de uma análise parcial salva continuam a análise. Qualquer outro envio
  // inicia uma NOVA análise: as alocações anteriores são substituídas (nunca empilhadas); as LDs permanecem.
  const checkpoint=Boolean(state.context.checkpoint);
  if(checkpoint&&entries.some(e=>!previousAllocations.some((old:Data)=>old.sha256===e.sha256&&old.name===e.name&&old.sheet===e.sheet)))throw Error('O arquivo, a aba ou o hash não corresponde à análise pausada. Use Nova auditoria para conferir outra entrada.');
  const unique=checkpoint?new Map(state.records.map((r,i)=>[String(i),r])):new Map(records.map((r:Data)=>[keyOf(r),r]));
  if(unique.size>50000)throw Error('O conjunto excede 50.000 registros. Divida a auditoria em lotes.');
  const replaced=!checkpoint&&(state.records.length>0||previousAllocations.length>0);
  // Commit only after every workbook, selection and origin is verified.
  let sources:Data[]=[...(state.context.sources||[])];
  if(!checkpoint){
   sources=sources.filter((x:Data)=>x.kind!=='allocation');
   for(const old of previousAllocations)if(!entries.some((e:Data)=>e.sha256===old.sha256))sourceFiles.delete(old.sha256);
  }
  for(let i=0;i<entries.length;i++){
   const entry=entries[i];sourceFiles.set(entry.sha256,files[i]);
   if(!sources.some((x:Data)=>x.sha256===entry.sha256&&x.kind==='allocation'))sources.push(entry);
  }
  if(!checkpoint)clearResults();
  emit({records:[...unique.values()],context:{...state.context,sources,inputFile:'',inputSheet:'',inputModel:'',sourceHash:'',allocation:''},message:(replaced?'Nova análise iniciada: as alocações anteriores foram substituídas. ':'')+entries.length+' alocação(ões) recebida(s) e validada(s). Arquivos originais preservados.'});
  return {checkpoint,replaced,documents:unique.size,files:entries.length,unidentified:unidentifiedAllocations(),readingNotice:'Todas as linhas documentais foram consideradas, inclusive ocultas ou filtradas. Fórmulas usam o resultado salvo no arquivo; não são recalculadas pelo robô.'};
 });},
 unidentifiedAllocations,
 confirmAllocationIdentities(identities:Data[]){
  const c=requireSession();if(state.busy)throw Error('Aguarde a operação atual.');
  const needed=unidentifiedAllocations();
  if(identities.length!==needed.length||new Set(identities.map(x=>x.sha256)).size!==needed.length)throw Error('Confirme a identificação de cada arquivo pendente.');
  const confirmed=new Map<string,Data>();
  for(const source of needed){const item=identities.find(x=>x.sha256===source.sha256),value=String(item?.value||'').trim().toUpperCase();
   if(!item||(!item.draft&&!/^[A-Z0-9][A-Z0-9 ._/-]{0,119}$/.test(value))||(item.draft&&value))throw Error('Informe o número/código de '+source.name+' ou confirme que é um rascunho sem numeração.');
   confirmed.set(source.sha256,{allocation:value,allocationIdentity:item.draft?'draft-confirmed':'user-confirmed',identityConfirmedBy:c.session.user.id,identityConfirmedAt:new Date().toISOString()});
  }
  clearResults();emit({records:state.records.map(r=>{const value=confirmed.get(r.sourceHash);return value&&!r.allocation?{...r,...value}:r;}),context:{...state.context,sources:(state.context.sources||[]).map((s:Data)=>confirmed.has(s.sha256)?{...s,...confirmed.get(s.sha256)}:s)},message:'Identificações registradas para esta análise. Rascunhos continuam identificados como conferência preliminar.'});
 },
 async importAssistantLd(files:File[]){return task(async()=>{
  const t=epoch;
  if(!files.length||files.length>20)throw Error('Selecione de 1 a 20 LDs XLSX.');
  if(files.reduce((sum,file)=>sum+file.size,0)>100*1024*1024)throw Error('O lote de LDs ultrapassa 100 MB. Divida os arquivos.');
  const entries:Data[]=[],names=new Map<string,string>();
  for(const file of files){
   const sha256=await compute('fingerprint',{file});current(t);
   const old=(state.context.sources||[]).find((x:Data)=>x.name===file.name&&x.kind==='ld');
   if(old&&old.sha256!==sha256)throw Error('LD '+file.name+': mesmo nome, conteúdo diferente. Renomeie para preservar o histórico.');
   if(names.has(file.name)&&names.get(file.name)!==sha256)throw Error('Duas LDs diferentes possuem o mesmo nome: '+file.name);
   names.set(file.name,sha256);
   entries.push({name:file.name,sha256,kind:'ld'});
  }
  const unchanged=Boolean(state.context.checkpoint);
  if(unchanged&&entries.some(e=>!(state.context.sources||[]).some((old:Data)=>old.kind==='ld'&&old.sha256===e.sha256&&old.name===e.name)))throw Error('A LD não corresponde à fonte da análise pausada. Use Nova auditoria para mudar as referências.');
  const previousLd=(state.context.sources||[]).filter((x:Data)=>x.kind==='ld')
   .map((x:Data)=>[x.name as string,sourceFiles.get(x.sha256)] as const).filter((pair:readonly [string,File|undefined]):pair is readonly [string,File]=>Boolean(pair[1]));
  const allLd=[...new Map<string,File>([...previousLd,...files.map(f=>[f.name,f] as const)]).values()];
  if(unchanged){const order=(state.context.sources||[]).filter((x:Data)=>x.kind==='ld').map((x:Data)=>x.name);allLd.sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name));}
  // importLd clears obsolete findings/decisions, never the underlying allocation records.
  await (await generator()).importAuditLd(allLd);current(t);
  if(!unchanged)clearResults();
  const sources=[...(state.context.sources||[])];
  for(let i=0;i<entries.length;i++){
   sourceFiles.set(entries[i].sha256,files[i]);
   if(!sources.some((x:Data)=>x.sha256===entries[i].sha256&&x.kind==='ld'))sources.push(entries[i]);
  }
  emit({context:{...state.context,sources,ldHashes:Object.fromEntries(sources.filter((x:Data)=>x.kind==='ld').map((x:Data)=>[x.name,x.sha256]))},message:unchanged?'LDs originais reconectadas para continuar a auditoria.':'LDs anexadas. Alocações preservadas; resultados anteriores invalidados para nova conferência.'});
  return {unchanged,records:state.records.length};
 });},
 async assistantPackage(sessionId:string,generateOfficial=false){return task(async()=>{
  if(!state.rows.length||state.progress!==state.total||state.rows.length!==state.total||state.records.length!==state.total)throw Error('Conclua a auditoria antes de preparar o pacote ou emitir nova alocação.');
  const t=epoch,files:Data[]=[],exceptions:string[]=[];const approved=g.GrconAllocationAuditorCore.approvedChanges(state.events);
  for(const source of [...(state.context.sources||[])].sort((a,b)=>Number(b.kind==='ld')-Number(a.kind==='ld'))){
   const file=sourceFiles.get(source.sha256);if(!file){exceptions.push(source.name+': reanexe a origem para produzir a cópia.');continue;}
   if(source.kind==='allocation'){
    const rows=state.rows.filter(r=>r.sourceHash===source.sha256);const events=approved.filter((e:Data)=>rows.some(r=>r.lineage===e.lineage)&&g.GrconAllocationAssistant.editable(e.field));
    if(!events.length)continue;
    if(source.correctionMode==='audit-only'){
     exceptions.push(source.name+': layout compatível com auditoria, mas não homologado para edição automática. Revise as alterações na LD de origem e gere o modelo oficial para produzir a cópia corrigida.');
     continue;
    }
    try{const result=await compute('revise-allocation',{file,rows,events,sourceHash:source.sha256,contract:cloud().membership.contract_id});current(t);files.push({name:outName('03_Alocacoes_Corrigidas',file.name,source.sha256,files),bytes:result.bytes,changed:result.changed,changes:result.changes,official:true});}catch(e){current(t);exceptions.push(source.name+': '+(e as Error).message);}
   }else{
    const events=approved.filter((e:Data)=>state.rows.some(r=>r.lineage===e.lineage&&r.origin?.file===source.name));if(!events.length)continue;
    try{const ui=await generator();const result=await ui.reviseAuditLd(file,state.rows,events,source.sha256);current(t);if(!result.count)continue;files.push({name:outName('02_LDs_Corrigidas',file.name,source.sha256,files),bytes:new Uint8Array(result.buffer),changed:result.count,changes:result.changes});}catch(e){current(t);exceptions.push(source.name+': '+(e as Error).message);}
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
     files.push({name:output.kind==='control'?'04_Linhas_Central_'+safeName.replace(/^Linhas_Central_de_Alocacao_/,''):'03_Alocacoes_Corrigidas/NOVA_'+safeName,bytes,official:output.kind==='allocation',changed:0,changes:[]});
    }
   }
  }
  for(const e of approved)if(!files.some(f=>f.changes?.some((x:Data)=>x.lineage===e.lineage&&x.field===e.field&&x.after===e.after)))exceptions.push(e.document+' / '+e.field+': decisão registrada sem cópia produzida.');
  let plan:Data={items:[]};try{plan=await service.correctionPlan();}catch{plan={items:[]};}
  let result:Data;try{result=await compute('assistant-package',{...state.context,rows:state.rows,events:state.events,progress:state.progress,total:state.total,sessionId,runId:state.runId,files,exceptions,comparison:state.comparison,plan:{items:plan.items}});}catch(e){throw e instanceof OperationError?e:new OperationError('EXPORT_FAILED',(e as Error).message||'Falha ao gerar o pacote.','assistant-package');}current(t);
  save(result.bytes,'GRCON_Auditoria_Preventiva.zip');emit({message:exceptions.length?'Pacote parcial verificado; consulte as exceções no relatório.':'Pacote verificado e pronto para download.'});return result.manifest;
 });},
 async acceptGroup(group:Data){
  const currentGroups=g.GrconAllocationAssistant.groups(state.rows),match=currentGroups.find((x:Data)=>x.id===group.id);if(!match)throw Error('Grupo mudou. Reanalise.');
  for(const item of match.rows){const i=state.rows.findIndex(r=>r.lineage===item.lineage);await service.review(i,{state:'Correção proposta',decision:'accepted',field:match.field,value:match.after,justification:item.justification||match.justification,evidence:item.evidence||match.evidence});}
 },
 subscribe(f:()=>void){listeners.add(f);return ()=>{listeners.delete(f);};},snapshot:()=>state,
 missingSources:()=>((state.context.sources||[]) as Data[]).filter(x=>!sourceFiles.has(x.sha256)).map(x=>x.name),
 core:()=>g.GrconAllocationAuditorCore,
 async activate(){requireSession();try{const data=await rpc('history');emit({runs:data.runs});}catch(e){emit({message:'Histórico compartilhado indisponível: '+(e as Error).message});}},
 async open(seed:Data){return task(async()=>{const t=epoch;current(t);clearResults();emit({records:seed.rows.map((r:Data)=>({...r.record,document:r.document,revision:r.revision,title:r.title,discipline:r.output.discipline||r.identity.discipline,workflow:r.output.workflow,databook:r.output.databook,levels:r.output.levels,eap:r.identity.eap,allocation:seed.allocation||'',allocationIdentity:seed.allocation?'from-source':'draft-confirmed',sourceFile:seed.allocation?'Histórico do Gerador':'Gerador GRCON',sourceVersions:seed.sourceVersions||{},contract:cloud().membership.contract_id})),context:{...seed,contract:cloud().membership.contract_id},message:'Documentos recebidos do Gerador. Inicie a auditoria.'});});},
 prepareUpload(){if(state.busy)return;clearResults();emit({records:[],context:{...state.context,inputFile:'',inputSheet:'',inputModel:'',sourceHash:'',allocation:''},message:'Lendo o novo arquivo de alocação…'});},
 inspect:(file:File)=>task(async()=>compute('inspect',{file})),
 async import(file:File,sheet:string,kind:'allocation'|'history',allocation=''){return task(async()=>{const c=requireSession(),t=epoch;const code=allocation.trim()||identifyAllocation(file.name);const data=await compute('parse',{file,sheet,allocation:code,contract:c.membership.contract_id});current(t);clearResults();emit(kind==='history'?{history:g.GrconAllocationAuditorCore.mergeHistory(state.history,data.records),message:`${data.records.length} eventos fiscais lidos. Comentários originais preservados.`}:{records:data.records,context:{...state.context,inputFile:file.name,inputSheet:sheet,inputModel:data.model,allocation:code,sourceHash:data.sha256},message:`${data.records.length} documentos da aba ${sheet} reconhecidos (${data.model==='official-16'?'modelo oficial de 16 colunas':'colunas compatíveis'}). Iniciando verificação.`});return data;});},
 async importLd(files:File[]){return task(async()=>{const t=epoch,ui=await generator();await ui.importAuditLd(files);current(t);clearResults();emit({message:'LDs lidas. Originais preservados.'});});},
 async availableAllocations(){return task(async()=>{const t=epoch,ctx=await getContext();current(t);emit({context:{...state.context,allocationRuns:ctx.allocationRuns||[]},message:'Alocações reconhecidas no histórico do Gerador carregadas.'});});},
 async openAllocationReference(reference:string){const ui=await generator();return ui.auditAllocationReference(reference);},
 async openAllocation(id:string){const ui=await generator();const run=state.context.allocationRuns?.find((r:Data)=>r.id===id);if(!run)throw Error('Selecione uma alocação disponível.');return ui.auditSavedRun(run);},
 async useLd(){return task(async()=>{const t=epoch,ctx=await getContext();current(t);clearResults();emit({records:ctx.ldRecords.map((r:Data)=>({...r,ld:r.source,ldSheet:r.sheet,sourceFile:r.source,sourceSheet:r.sheet,sourceRow:r.row,contract:cloud().membership.contract_id})),context:ctx,message:'Documentos da LD selecionados.'});});},
 setApplicability(revision:string,evidence:string){if(state.busy)return;clearResults();emit({context:{...state.context,applicability:{source:'ET-5290.00-22000-912-1LV-001',revision,evidence,contract:cloud()?.membership?.contract_id,confirmed:Boolean(evidence.trim()&&revision)}}});},
 async analyze(resume=false){return task(async()=>{const run=++analysisSerial;activeAnalysis=run;try{
  const t=epoch;cancelled=false;
  if(resume&&(state.context.inputComplete===false||state.records.length!==state.total||!state.total))throw Error('A entrada completa não foi recuperada. O total esperado foi preservado; inicie uma nova auditoria com todas as fontes originais.');
  if(!state.records.length)throw Error('Importe uma alocação ou selecione os documentos da LD.');if(state.records.length>50000)throw Error('Limite de 50.000 documentos por análise.');
  if(resume&&state.context.engine&&state.context.engine!==g.GrconAllocationAuditorCore.VERSION)throw Error('O motor mudou. Inicie uma nova auditoria; os resultados históricos permanecem preservados.');
  if(resume&&state.runId&&state.context.createdBy!==cloud().session.user.id)throw Error('Somente o autor pode continuar esta análise.');
  let fresh:Data={},contextWarning='';try{fresh=await getContext();}catch(e){current(t);contextWarning='As bases complementares não puderam ser consultadas: '+((e as Error).message||String(e))+'. Auditoria parcial; verificações dependentes das bases permanecem inconclusivas.';}
   current(t);const context:Data={...fresh,...state.context,saved:false,checkpoint:resume&&Boolean(state.context.checkpoint),ldRecords:fresh.ldRecords||state.context.ldRecords||[],bases:fresh.bases||state.context.bases||{},versions:fresh.versions||state.context.versions||{},baseMetadata:fresh.baseMetadata||[],contract:cloud().membership.contract_id,history:g.GrconAllocationAuditorCore.mergeHistory(fresh.centralHistory||[],state.history),records:state.records,homologated:{},contextWarning};
  if(resume&&contextWarning)throw Error('Não foi possível confirmar as referências para retomar. Tente novamente quando as bases estiverem disponíveis.');
  if(resume&&canonical(context.versions)!==canonical(state.context.versions||{}))throw Error('As bases mudaram. Inicie uma nova análise.');
  if(resume&&state.context.checkpoint&&(state.context.sources||[]).some((s:Data)=>!sourceFiles.has(s.sha256)))throw Error('Reanexe todas as alocações e LDs originais antes de retomar.');
  context.referenceHash=await referenceDigest(context);current(t);
  if(resume&&(!state.context.referenceHash||context.referenceHash!==state.context.referenceHash))throw Error('As referências ou o histórico mudaram. Inicie uma nova auditoria para não misturar resultados.');
  if(resume&&state.rows.some((r,i)=>!sameInput(state.records[i],r)))throw Error('Os resultados parciais não correspondem à ordem da entrada.');
  context.inputComplete=true;context.engine=g.GrconAllocationAuditorCore.VERSION;context.createdBy=cloud().session.user.id;
  const total=resume?state.total:state.records.length;
  if(!resume)clearResults();emit({context,total});await compute('context',context);current(t);
  let rows=resume?state.rows.slice():[];
  for(let i=rows.length;i<context.records.length;i+=100){if(cancelled)break;let next:Data[];try{next=await compute('batch',{first:i,count:100});}catch(e){if((e as Data)?.code==='CANCELLED'){cancelled=true;break;}throw e;}current(t);rows=[...rows,...next];emit({rows,progress:rows.length,selected:rows.map((_,i)=>i)});await new Promise(resolve=>setTimeout(resolve,0));}
  let grouped:Data={};try{grouped=await compute('summarize',{rows});}catch(e){if((e as Data)?.code!=='CANCELLED')throw e;cancelled=true;}current(t);
  // Reauditoria: compara o resultado anterior com o atual (só documentos presentes nos dois lados). A comparação é a prova de resolução.
  let comparison:Data|null=null;
  if(!cancelled&&baseline&&rows.length===total&&g.GrconAllocationAuditorReaudit){const cmp=g.GrconAllocationAuditorReaudit.compare(baseline,rows);comparison=cmp.comparable?cmp:null;}
  if(!cancelled&&rows.length===total)baseline=null;
  emit({...grouped,comparison,selected:rows.map((_,i)=>i),message:cancelled?'Análise pausada. Os registros concluídos podem ser retomados.':contextWarning?'Auditoria parcial concluída. '+contextWarning:'Auditoria concluída. Confira as pendências e evidências.'});
 }finally{if(activeAnalysis===run)activeAnalysis=0;}
 });},
 // Pausa graciosa: o lote em andamento termina e entra no progresso; se ele travar, passado o prazo de tolerância (pauseGrace) a operação é interrompida de verdade.
 cancel(){cancelled=true;const mark=++pauseMark,run=activeAnalysis,grace=deadlineOverrides.pauseGrace??5000;if(!run)return;const timer:any=setTimeout(()=>{if(mark===pauseMark&&activeAnalysis===run&&cancelled)hardCancel();},grace);timer?.unref?.();},
 // Cancelamento imediato (botão "Cancelar operação"): interrompe Worker, gravação ou IA na hora; resultados já obtidos são preservados.
 abort(){cancelled=true;pauseMark++;return hardCancel();},
 setDeadlines(overrides:Record<string,number>){deadlineOverrides={...overrides};},
 // Esquece o que já se sabe sobre o banco (ex.: depois que o administrador aplica a atualização do checkpoint).
 resetCapabilities(){checkpointSupport='unknown';checkpointCheckedAt=0;},
 // Diagnóstico técnico seguro (sem documentos, sem nomes de arquivo, sem credenciais) para enviar ao suporte.
 diagnostics(){const E=errorsApi();return JSON.stringify({generatedAt:new Date().toISOString(),engine:g.GrconAllocationAuditorCore?.VERSION,errors:E?.VERSION,progress:state.progress,total:state.total,busy:state.busy,lastError:E?E.sanitize(state.error):'',lastErrorCode:state.errorCode,operations:ops.log.slice(-50)},null,1);},
 select(indices:number[]){emit({selected:indices});},
 async review(index:number,input:Data){const c=requireSession();if(state.busy)throw Error('Aguarde a operação atual.');if(!['owner','admin','operator'].includes(c.membership.role))throw Error('Perfil sem permissão de revisão.');const row=state.rows[index];if(input.field==='databook'&&input.value&&!state.context.bases?.databook?.some((p:Data)=>p.databook===input.value))throw Error('Escolha um caminho existente na base ativa.');
  const event={...g.GrconAllocationAuditorCore.reviewEvent(row,input,c.session.user.id),requestId:crypto.randomUUID()};
  const events=[...state.events,event];emit({events,groups:remainingGroups(events),message:'Decisão registrada. A Central e a LD oficial não foram alteradas.'});
 },
 async save(){return task(async()=>{
  if(!state.rows.length)throw Error('Nenhuma análise para salvar.');
  if(state.records.length!==state.total||state.context.inputComplete===false)throw Error('Não é possível salvar uma entrada incompleta como análise completa.');
  await requireCheckpointSupport();
  const t=epoch;saveRequest=saveRequest||crypto.randomUUID();
  const metadata=saveMetadata||{snapshotVersion:2,inputHash:await digest(state.records),referenceHash:state.context.referenceHash,engine:g.GrconAllocationAuditorCore.VERSION,contextWarning:state.context.contextWarning||'',sources:state.context.sources||[],ldHashes:state.context.ldHashes||{},versions:state.context.versions,applicability:state.context.applicability||{},sourceCount:(state.context.history||state.history).length,summary:g.GrconAllocationAuditorCore.summary(state.rows),kind:'audit'};
  current(t);saveMetadata=metadata;
  const {id}=state.runId?{id:state.runId}:await rpc('begin',{requestId:saveRequest,count:state.total,metadata});current(t);if(!id)throw Error('O servidor não confirmou a identificação da análise.');emit({runId:id});
  const sendRows=async(operation:string,rows:Data[])=>{
   for(let first=0;first<rows.length;){let end=first,bytes=0;
    while(end<rows.length&&end-first<100){const size=new TextEncoder().encode(JSON.stringify(rows[end])).length;if(size>90000)throw Error('Um registro excede o limite de salvamento. Divida o conteúdo de evidências na origem.');if(end>first&&bytes+size>1000000)break;bytes+=size;end++;}
    try{await rpc(operation,{id,first:first+1,rows:rows.slice(first,end)});}catch(e){if(operation==='input-chunk'&&/opera[cç][aã]o n[aã]o reconhecida/i.test(String((e as Error)?.message||''))){checkpointSupport='no';checkpointCheckedAt=Date.now();throw new OperationError('CHECKPOINT_UNAVAILABLE','Histórico completo indisponível: o banco ainda não recebeu a atualização do checkpoint ('+(e as Error).message+').','save');}throw e;}current(t);first=end;
   }
  };
  try{
   if(!state.context.saved){
    await sendRows('input-chunk',state.records);
    const rows=state.rows.map(r=>{const {history,...rest}=r;return {...rest,history:(history||[]).map((h:Data)=>({document:h.document,revision:h.revision,allocation:h.allocation,fiscalComment:h.fiscalComment,fiscalDecision:h.fiscalDecision,returnedAt:h.returnedAt,sourceFile:h.sourceFile,sourceSheet:h.sourceSheet,sourceRow:h.sourceRow}))};});
    await sendRows('chunk',rows);
    if(state.rows.length===state.total){await rpc('finish',{id});current(t);emit({context:{...state.context,saved:true,checkpoint:false}});}
    else emit({context:{...state.context,checkpoint:true}});
   }
   for(let i=savedEvents;i<state.events.length;i++){const e=state.events[i];await rpc('event',{id,requestId:e.requestId,event:e});current(t);savedEvents=i+1;}
  }catch(e){current(t);emit({message:'O salvamento não foi confirmado por completo. Mantenha esta análise aberta e tente salvar novamente; os lotes idênticos podem ser reenviados.'});throw e;}
  let runs=state.runs,warning='';try{const page=await rpc('history');runs=page.runs;}catch(e){current(t);warning=' A gravação foi confirmada, mas a lista de histórico está indisponível: '+(e as Error).message;}
  emit({runs,message:(state.progress===state.total?'Análise e decisões salvas com histórico auditável.':'Progresso parcial e entrada completa salvos. Reanexe as mesmas fontes para retomar após fechar o navegador.')+warning});
 });},
 async historyRows(id:string,after=0){return rpc('detail',{id,after});},
 async prepareRestoreById(id:string){return task(async()=>{const data=await rpc('detail',{id,after:0});return stageRestore(data.run);}) as Promise<{commit:()=>void}>;},
 prepareEmptyConversation(){if(state.busy)throw Error('Aguarde a operação atual antes de trocar de conversa.');const t=epoch;return {commit:()=>commitRestore(emptySnapshot(),null,t)};},
 async restoreById(id:string){const staged=await service.prepareRestoreById(id);staged.commit();},
 async restore(run:Data){const staged=await task(()=>stageRestore(run)) as {commit:()=>void};staged.commit();},
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
 // Explicação por IA: contrato de campos compartilhado, prazo e cancelamento próprios. Falha da IA nunca apaga o resultado determinístico.
 async ai(index:number,question=''){return task(async()=>{
  const c=requireSession(),t=epoch,r=state.rows[index];if(r.ai&&!question)return;
  if(!r.findings.length)throw Error('Não há apontamentos para esta consulta.');
  const Fields=g.GrconAllocationAuditorFields;if(!Fields)throw new OperationError('AI_FAILED','O contrato de campos da consulta por IA não está carregado.','ai');
  const built=Fields.buildAuditRequest(r,question);
  if(!built.usable)throw new OperationError('AI_FAILED','Nenhum apontamento desta linha cabe na consulta por IA ('+built.omitted.map((o:Data)=>o.reason).join('; ')+').','ai');
  let response:Response;
  try{response=await withDeadline<Response>('ai',signal=>fetch('/api/document-vault/allocation-audit-ai',{method:'POST',signal,headers:{'content-type':'application/json',authorization:'Bearer '+c.session.access_token},body:JSON.stringify({workspaceId:c.membership.workspace_id,...built.body})}),{overrides:deadlineOverrides,registry:ops});}
  catch(e){if(e instanceof OperationError&&e.code==='CANCELLED')throw e;throw new OperationError('AI_FAILED',e instanceof OperationError?'A IA excedeu o tempo de resposta.':'Não foi possível consultar a IA.','ai');}
  const d=await response.json().catch(()=>({}));current(t);
  if(!response.ok)throw new OperationError('AI_FAILED',d.message||'IA indisponível.','ai');
  const rows=state.rows.slice();rows[index]={...r,ai:{...d,omitted:built.omitted}};emit({rows});
 });},clear:reset,
};
for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])window.addEventListener(event,reset);
window.addEventListener('grcon:cloud-ready',()=>{if(identity!==scope())reset();});
