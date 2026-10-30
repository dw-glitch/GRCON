import {service,type Data} from './service';
export type Message={id:string;role:'user'|'assistant';text:string};
type State={open:boolean;messages:Message[];sessionId:string;revision:number;pending:boolean;error:string;sessions:Data[]};
const initial=():State=>({open:false,messages:[{id:'hello',role:'assistant',text:'Olá! Sou o Assistente de Auditoria do GRCON. Deseja conferir a alocação que está gerando ou analisar outra alocação?'}],sessionId:crypto.randomUUID(),revision:0,pending:false,error:'',sessions:[]});
let state=initial(),generation=0;const listeners=new Set<()=>void>();
const emit=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(f=>f());};
async function persist(){const ticket=generation;const snapshot=state;const s=service.snapshot();const result=await service.assistantRpc('session-write',{id:snapshot.sessionId,revision:snapshot.revision,payload:{messages:snapshot.messages.slice(-100),runId:s.runId,sourceHashes:(s.context.sources||[]).map((x:Data)=>x.sha256)}});if(ticket===generation)emit({revision:result.revision});}
async function execute(action:(speak:typeof say)=>Promise<unknown>){if(state.pending)return;const ticket=generation;emit({pending:true,error:''});try{await action((text,role)=>{if(ticket===generation)say(text,role);});if(ticket===generation)try{await persist();}catch(e){if(ticket===generation)emit({error:'Conversa ainda não salva: '+(e as Error).message});}}catch(e){if(ticket===generation)emit({error:(e as Error).message});}finally{if(ticket===generation)emit({pending:false});}}
const say=(text:string,role:Message['role']='assistant')=>emit({messages:[...state.messages,{id:crypto.randomUUID(),role,text:text.slice(0,2000)}].slice(-100)});
async function audit(resume=false,sayMessage= say){
 await service.analyze(resume);const s=service.snapshot();if(s.progress!==s.total){if(s.progress>0)await service.save();sayMessage('Análise pausada em '+s.progress+' de '+s.total+' documentos.');return;}
 let count=0;try{count=await service.applyAutomatic();}catch(e){sayMessage('Auditoria calculada. Correções automáticas não foram liberadas: '+(e as Error).message);}
 const summary=service.core().summary(service.snapshot().rows);sayMessage('Analisei '+summary.total+' documentos. Autorizei '+count+' correções por regras ativas e há '+summary.pending+' documentos com verificações pendentes. As cópias serão verificadas ao preparar o pacote.');
}
export const assistant={
 subscribe(f:()=>void){listeners.add(f);return()=>{listeners.delete(f);};},snapshot:()=>state,
 show(){const ticket=generation;emit({open:true});void service.activate().catch(()=>{});void service.assistantRpc('sessions').then(d=>{if(ticket===generation)emit({sessions:d.sessions});}).catch(e=>{if(ticket===generation)emit({error:'Histórico de conversas indisponível: '+e.message});});},
 close(){emit({open:false});},
 current(){return execute(async(say)=>{const g=window as unknown as Data;await g.GrconAllocationGeneratorUi.auditCurrent();say('Recebi os documentos selecionados no Gerador.');await audit(false,say);});},
 upload(files:File[],kind:'allocation'|'ld'){return execute(async(say)=>{if(kind==='allocation')await service.importMany(files);else await service.importAssistantLd(files);say('Recebi '+files.length+' '+(kind==='allocation'?'alocação(ões)':'LD(s)')+'. Envie uma instrução para iniciar a conferência.');});},
 send(text:string){return execute(async(say)=>{say(text,'user');const g=window as unknown as Data;switch(g.GrconAllocationAssistant.intent(text)){
 case 'audit':{const reference=g.GrconAllocationAssistant.allocationReference(text);if(reference){await service.openAllocationReference(reference);say('Alocação '+reference+' carregada do histórico publicado.');}await audit(false,say);break;}
 case 'resume':await audit(true,say);break;
 case 'pause':service.cancel();say('Pausa solicitada. Aguarde o lote em processamento.');break;
 case 'package':await assistant.downloadInternal(false,say);break;
 case 'details':say('As pendências estão agrupadas abaixo e o detalhamento completo acompanha o relatório Excel.');break;
 default:{
 const rows=service.snapshot().rows;const candidates=g.GrconAllocationAssistant.questionRows(rows,text);
 if(candidates.length!==1){say(candidates.length>1?'Há várias ocorrências desse documento. Informe também a revisão e o código da alocação para consultar a origem exata.':'Informe o código completo de um documento para interpretar seus achados. Também posso conferir os arquivos e preparar o pacote.');break;}
 await service.ai(candidates[0].i,text);const answer=service.snapshot().rows[candidates[0].i].ai?.analysis;
 say(answer?.rationale||'A IA não retornou uma resposta verificável. Consulte as fontes indicadas no relatório.');
 if(answer?.missingEvidence?.length)say('Referências adicionais: '+answer.missingEvidence.join('; '));break;
 }
 }});},
 async downloadInternal(generateOfficial=false,speak=say){const manifest=await service.assistantPackage(state.sessionId,generateOfficial) as Data;speak(manifest.exceptions.length?'O pacote foi verificado e contém limitações: consulte RESUMO e o manifesto.':'O pacote foi verificado. O relatório descreve as correções aplicadas e as pendências.');},
 download(){return execute(speak=>assistant.downloadInternal(false,speak));},
 generate(){return execute(async(say)=>{await service.save();await assistant.downloadInternal(true,say);});},
 group(group:Data){return execute(async(say)=>{await service.acceptGroup(group);await service.save();say('Decisão registrada para '+group.rows.length+' ocorrências do mesmo contexto. Prepare o pacote para gerar as cópias.');});},
 restore(id:string){return execute(async(say)=>{const result=await service.assistantRpc('session-read',{id});if(result.payload.runId)await service.restoreById(result.payload.runId);emit({sessionId:id,revision:result.revision,messages:result.payload.messages||[]});say('Conversa recuperada. Reanexe as fontes originais e reanalise antes de novas correções.');});},
};
for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])window.addEventListener(event,()=>{generation++;state=initial();listeners.forEach(f=>f());});
