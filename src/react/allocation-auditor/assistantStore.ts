import {service,type Data} from './service';

export type Message={id:string;role:'user'|'assistant';text:string};
type State={
 open:boolean;messages:Message[];sessionId:string;revision:number;
 pending:boolean;error:string;sessions:Data[];
};
const welcome='Olá! Sou o Robô Auditor Preventivo do GRCON. Posso conferir uma alocação criada aqui ou uma planilha externa, antes do envio à fiscalização. Envie a alocação, anexe as LDs necessárias e peça para auditar.';
const initial=():State=>({
 open:false,messages:[{id:'hello',role:'assistant',text:welcome}],
 sessionId:crypto.randomUUID(),revision:0,pending:false,error:'',sessions:[]
});
let state=initial(),generation=0;
const listeners=new Set<()=>void>();
const emit=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(f=>f());};
const say=(text:string,role:Message['role']='assistant')=>emit({
 messages:[...state.messages,{id:crypto.randomUUID(),role,text:text.slice(0,2000)}].slice(-100)
});

async function persist(){
 const ticket=generation,snapshot=state,s=service.snapshot();
 const result=await service.assistantRpc('session-write',{
  id:snapshot.sessionId,revision:snapshot.revision,
  payload:{messages:snapshot.messages.slice(-100),runId:s.runId,
   sourceHashes:(s.context.sources||[]).map((x:Data)=>x.sha256)}
 });
 if(ticket===generation)emit({revision:result.revision});
}
async function execute(action:(speak:typeof say)=>Promise<unknown>){
 if(state.pending)return;
 const ticket=generation;
 emit({pending:true,error:''});
 try{
  await action((text,role)=>{if(ticket===generation)say(text,role);});
  if(ticket===generation){
   try{await persist();}
   catch(e){if(ticket===generation)emit({error:'Conversa ainda não salva: '+(e as Error).message});}
  }
 }catch(e){
  if(ticket===generation){
   const detail=(e as Error).message||String(e);
   emit({error:detail});
   say('Não consegui concluir essa etapa: '+detail+'. Os arquivos originais foram preservados.');
  }
 }finally{if(ticket===generation)emit({pending:false});}
}
const snapshotStatus=()=>{
 const s=service.snapshot(),sources=s.context.sources||[];
 const progress=s.total>0?s.progress+' de '+s.total+' documentos':s.records.length+' documento(s) recebido(s)';
 const context=s.rows.length?' Inconsistências confirmadas: '+(s.summary.errors||0)+'. Verificações pendentes: '+(s.summary.pending||0)+'.':'';
 return 'Situação da auditoria preventiva: '+progress+'. Arquivos identificados: '+sources.length+'.'+context+
  (s.progress===s.total&&s.total>0?' A análise está concluída para as fontes disponíveis.':'');
};
async function audit(resume=false,speak:typeof say=say){
 if(!service.snapshot().records.length){
  speak('Envie uma alocação XLSX externa ou selecione documentos no Gerador para começar.');return;
 }
 if(resume){
  const s=service.snapshot();
  if(s.total===0||s.progress===0){speak('Não há um processamento pausado. Inicie a auditoria dos arquivos recebidos.');return;}
  if(s.progress===s.total){speak('Esta análise já foi concluída. Consulte as pendências ou baixe o pacote.');return;}
 }
 speak(resume?'Vou continuar a conferência do ponto salvo.':'Vou iniciar a conferência preventiva dos documentos, consultando as referências disponíveis.');
 await service.analyze(resume);
 const s=service.snapshot();
 if(s.progress!==s.total){
  if(s.progress>0)await service.save();
  speak('Análise pausada em '+s.progress+' de '+s.total+' documentos. Para continuar, use Retomar análise.');
  return;
 }
 let count=0;
 try{count=await service.applyAutomatic();}
 catch(e){speak('A auditoria foi calculada, mas as correções automáticas não foram autorizadas: '+(e as Error).message);}
 const summary=service.core().summary(service.snapshot().rows);
 speak('Analisei '+summary.total+' documento'+(summary.total===1?'':'s')+' antes do envio à fiscalização. Foram autorizadas '+count+
  ' correções por regras ativas e existem '+summary.pending+
  ' documentos com verificações pendentes. O pacote final indicará as evidências, as cópias geradas e as exceções.');
}
const help=()=>[
 'Posso conferir os arquivos antes do envio à fiscalização. Escolha uma ação:',
 '• Anexar alocação XLSX, inclusive preparada fora do GRCON;',
 '• Anexar LDs e pedir "Auditar arquivos";',
 '• Consultar "Situação" ou "Ver pendências";',
 '• Pedir explicação citando o código completo do documento;',
 '• "Retomar análise" após uma pausa ou "Baixar pacote" ao concluir.',
 'Uma nova emissão numerada é uma ação separada, nunca automática.'
].join('\n');

export const assistant={
 subscribe(f:()=>void){listeners.add(f);return()=>listeners.delete(f);},
 snapshot:()=>state,
 show(){
  if(state.open)return;
  const ticket=generation;
  emit({open:true,error:''});
  void service.activate().catch(()=>{});
  void service.assistantRpc('sessions')
   .then((d:Data)=>{if(ticket===generation)emit({sessions:d.sessions||[]});})
   .catch((e:Error)=>{if(ticket===generation)emit({error:'Histórico de conversas indisponível: '+e.message});});
 },
 close(){emit({open:false});},
 status(){return execute(async(speak)=>speak(snapshotStatus()));},
 help(){return execute(async(speak)=>speak(help()));},
 current(){return execute(async(speak)=>{
  const g=window as unknown as Data;
  if(typeof g.GrconAllocationGeneratorUi?.auditCurrentInChat!=='function')
   throw Error('Abra o Gerador de Alocação e selecione os documentos que deseja conferir.');
  await g.GrconAllocationGeneratorUi.auditCurrentInChat();
  speak('Recebi os documentos selecionados no Gerador, sem criar uma nova alocação.');
  await audit(false,speak);
 });},
 upload(files:File[],kind:'allocation'|'ld'){return execute(async(speak)=>{
  if(!files.length){speak('Nenhum arquivo selecionado.');return;}
  if(kind==='allocation')await service.importMany(files);
  else await service.importAssistantLd(files);
  speak('Recebi '+files.length+' '+(kind==='allocation'?'alocação(ões)':'LD(s)')+
   '. Originais preservados. '+(kind==='allocation'?'Use "Auditar arquivos" para iniciar a conferência.':'Posso usar essas LDs na próxima conferência.'));
 });},
 auditFiles(){return execute(speak=>audit(false,speak));},
 resume(){return execute(speak=>audit(true,speak));},
 pause(){
  if(!state.pending&&!service.snapshot().busy){say('Não existe uma auditoria em andamento para pausar.');return;}
  service.cancel();
  say('Pausa solicitada. Vou finalizar o lote atual e registrar o progresso disponível.');
 },
 details(){return execute(async(speak)=>{
  const s=service.snapshot();
  if(!s.rows.length){speak('Ainda não há resultados. Envie ou selecione uma alocação e execute a auditoria preventiva.');return;}
  speak(snapshotStatus()+' O detalhamento técnico e as evidências estarão no relatório RESUMO/DETALHAMENTO. Os grupos de correção aparecem abaixo da conversa.');
 });},
 send(text:string){
  const request=text.trim().slice(0,2000);
  if(!request)return;
  const normalized=request.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/^(pausar?|parar|interromper)(\s|$)/.test(normalized)){
   say(request,'user');assistant.pause();return;
  }
  return execute(async(speak)=>{
   speak(request,'user');
   if(/^(ajuda|menu|comandos|como funciona)(\s|\?|$)/.test(normalized)){speak(help());return;}
   if(/^(status|situacao|andamento|progresso|resumo)(\s|\?|$)/.test(normalized)){speak(snapshotStatus());return;}
   const g=window as unknown as Data;
   const intent=g.GrconAllocationAssistant.intent(request);
   switch(intent){
    case 'audit':{
     const ref=g.GrconAllocationAssistant.allocationReference(request);
     const loaded=service.snapshot();
     const uploads=(loaded.context.sources||[]).filter((x:Data)=>x.kind==='allocation');
     const full=String(ref||'').toUpperCase();
     const matchingUpload=Boolean(full&&(
      loaded.records.some((r:Data)=>String(r.allocation||'').toUpperCase()===full)||
      uploads.some((x:Data)=>String(x.name||'').toUpperCase().includes(full))
     ));
     if(ref&&!matchingUpload){
      // Never overwrite external pre-fiscalization inputs by silently loading history.
      if(loaded.records.length&&uploads.length){
       speak('Já existem alocações externas anexadas. Para conferir esses arquivos, use "Auditar arquivos". Para consultar outra alocação, abra uma conversa sem anexos e informe o código completo.');
       break;
      }
      await service.openAllocationReference(ref);
      speak('Alocação '+ref+' encontrada no histórico do Gerador. Conferindo os documentos antes do envio.');
     }else if(matchingUpload){
      speak('Encontrei a alocação informada nos arquivos recebidos. Vou usar a planilha anexada, sem substituí-la pelo histórico do Gerador.');
     }
     await audit(false,speak);break;
    }
    case 'resume':await audit(true,speak);break;
    case 'package':await assistant.downloadInternal(false,speak);break;
    case 'details':{
     const s=service.snapshot();
     speak(s.rows.length?snapshotStatus()+' As pendências estão agrupadas na conversa e documentadas no relatório.':'Ainda não existem resultados. Execute a auditoria primeiro.');
     break;
    }
    default:{
     const rows=service.snapshot().rows;
     const candidates=g.GrconAllocationAssistant.questionRows(rows,request);
     if(candidates.length!==1){
      speak(candidates.length>1?
       'Há várias ocorrências do documento. Informe também a revisão e a alocação para consultar a origem exata.':
       rows.length?'Para interpretar um apontamento, informe o código completo de um documento com pendências. Também posso mostrar a situação e preparar o pacote.':help());
      break;
     }
     await service.ai(candidates[0].i,request);
     const answer=service.snapshot().rows[candidates[0].i].ai?.analysis;
     speak(answer?.rationale||'A IA não retornou uma resposta verificável. Confira as evidências no relatório.');
     if(answer?.missingEvidence?.length)speak('Referências ainda necessárias: '+answer.missingEvidence.join('; '));
    }
   }
  });
 },
 async downloadInternal(generateOfficial=false,speak:typeof say=say){
  const manifest=await service.assistantPackage(state.sessionId,generateOfficial) as Data;
  speak(manifest.exceptions?.length?
   'O pacote preventivo foi verificado, mas há limitações. Consulte o RESUMO e o manifesto de exceções.':
   'O pacote preventivo foi gerado. O relatório descreve as verificações e as cópias corrigidas efetivamente produzidas.');
 },
 download(){return execute(speak=>assistant.downloadInternal(false,speak));},
 generate(){return execute(async(speak)=>{
  await service.save();
  await assistant.downloadInternal(true,speak);
  speak('A nova emissão oficial foi solicitada expressamente. A Central compartilhada permanece preservada.');
 });},
 group(group:Data){return execute(async(speak)=>{
  await service.acceptGroup(group);
  await service.save();
  speak('Decisão registrada para '+group.rows.length+' ocorrência(s) do mesmo contexto. As cópias serão verificadas ao preparar o pacote.');
 });},
 restore(id:string){return execute(async(speak)=>{
  const result=await service.assistantRpc('session-read',{id});
  if(result.payload.runId)await service.restoreById(result.payload.runId);
  emit({sessionId:id,revision:result.revision,messages:result.payload.messages||[]});
  speak('Conversa recuperada. Reanexe as fontes originais quando necessário e reanalise antes de novas correções.');
 });},
};
for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])
 window.addEventListener(event,()=>{generation++;state=initial();listeners.forEach(f=>f());});
