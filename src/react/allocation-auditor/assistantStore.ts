import {service,type Data} from './service';

export type Message={id:string;role:'user'|'assistant';text:string};
type SheetChoice={name:string;options:Array<{name:string;model:string;documentCount:number}>;selected:string};
type State={
 open:boolean;messages:Message[];sessionId:string;revision:number;
 pending:boolean;error:string;errorCode:string;sessions:Data[];pendingSheets:SheetChoice[];pendingAllocations:Data[];plan:Data|null;saveState:'idle'|'saving'|'saved'|'failed'|'conflict';
 tab:Tab;
};
export type Tab='conversa'|'pendencias'|'arquivos'|'historico';
const welcome='Olá! Sou o Robô Auditor Preventivo do GRCON. Posso conferir uma alocação criada aqui ou uma planilha externa, antes do envio à fiscalização. Envie a alocação, anexe as LDs necessárias e peça para auditar.';
const initial=():State=>({
 open:false,messages:[{id:'hello',role:'assistant',text:welcome}],
 sessionId:crypto.randomUUID(),revision:0,pending:false,error:'',errorCode:'',sessions:[],pendingSheets:[],pendingAllocations:[],plan:null,saveState:'idle',tab:'conversa'
});
let state=initial(),generation=0,pendingWrite:Data|null=null;
const contextIdentity=()=>{const g=window as unknown as Data;return JSON.stringify([g.GrconCloud?.state?.session?.user?.id,g.GrconCloud?.state?.membership?.workspace_id,g.GrconCloud?.state?.membership?.contract_id]);};
let sessionIdentity=contextIdentity();
let pendingAllocationFiles:File[]=[];
const listeners=new Set<()=>void>();
// Um novo erro sem código explícito limpa o código anterior, para não classificar a falha nova pela antiga.
const emit=(patch:Partial<State>)=>{state={...state,...('error' in patch&&!('errorCode' in patch)?{errorCode:''}:{}),...patch};listeners.forEach(f=>f());};
const say=(text:string,role:Message['role']='assistant')=>emit({
 messages:[...state.messages,{id:crypto.randomUUID(),role,text:text.slice(0,2000)}].slice(-100)
});

async function persist(){
 const ticket=generation,snapshot=state,s=service.snapshot();
 emit({saveState:'saving'});
 let revision=snapshot.revision;
 if(pendingWrite?.id===snapshot.sessionId){
  const prior=await service.assistantRpc('session-write',pendingWrite);
  if(ticket!==generation)return;
  if(!Number.isInteger(prior.revision))throw Error('O servidor não confirmou a revisão da conversa.');
  revision=prior.revision;pendingWrite=null;emit({revision});
 }
 const messages=snapshot.messages.slice(-100),sourceHashes=(s.context.sources||[]).map((x:Data)=>x.sha256);
 while(messages.length>1&&new TextEncoder().encode(JSON.stringify({messages,runId:s.runId,sourceHashes})).length>70000)messages.shift();
 const request={
  id:snapshot.sessionId,revision,
  payload:{messages,runId:s.runId,sourceHashes}
 };pendingWrite=request;
 const result=await service.assistantRpc('session-write',request);
 if(!Number.isInteger(result.revision))throw Error('O servidor não confirmou a revisão da conversa.');
 if(ticket===generation){pendingWrite=null;emit({revision:result.revision,saveState:'saved'});}
}
async function execute(action:(speak:typeof say)=>Promise<unknown>,allowConflict=false){
 if(state.pending)return;
 if(state.saveState==='conflict'&&!allowConflict){emit({error:'Esta conversa foi alterada em outra janela. Reabra a conversa salva ou inicie Nova auditoria antes de continuar.'});return;}
 const ticket=generation;
 emit({pending:true,error:''});
 try{
  await action((text,role)=>{if(ticket===generation)say(text,role);});
  if(ticket===generation){
   try{await persist();}
   catch(e){if(ticket===generation)emit({saveState:/outra janela/.test((e as Error).message)?'conflict':'failed',error:'Conversa ainda não salva: '+(e as Error).message});}
  }
 }catch(e){
  if(ticket===generation){
   const detail=(e as Error).message||String(e),code=(e as Data)?.code||'';
   const E=(window as unknown as Data).GrconAllocationAuditorErrors,d=E?E.describe({message:detail,code}):null;
   if(code==='CANCELLED'){say((d?d.what+' '+d.compromised:'Operação cancelada.')+' '+(d?d.todo:''));}
   else{
    emit({error:detail,errorCode:code});
    say(d?'Não consegui concluir essa etapa. '+d.what+' '+d.compromised+' '+d.todo:'Não consegui concluir essa etapa: '+detail+'. Os arquivos originais foram preservados.');
   }
  }
 }finally{if(ticket===generation)emit({pending:false});}
}
// Parecer canônico (allocation_auditor_opinion.js): mesma fonte do relatório; cada número diz a unidade (documento, ocorrência, proposta).
const opinionLines=():string=>{
 const O=(window as unknown as Data).GrconAllocationAuditorOpinion,s=service.snapshot();
 if(!O||!s.rows.length)return '';
 try{
  const o=O.build({rows:s.rows,events:s.events,files:[],exceptions:[],contextWarning:s.context.contextWarning||''}),d=O.describe(o.counts);
  const impedimentos=o.blockers.length?' Impedimentos para concluir: '+o.blockers.map((b:Data)=>b.count+' '+b.message).join('; ')+'.':'';
  const R=(window as unknown as Data).GrconAllocationAuditorReaudit,reaudit=R&&s.comparison?' '+R.describe(s.comparison):'';
  return ' '+d.documents+'. '+d.occurrences+'. '+d.proposals+'.'+reaudit+impedimentos;
 }catch{return '';}
};
const snapshotStatus=()=>{
 const s=service.snapshot(),sources=s.context.sources||[];
 const progress=s.total>0?s.progress+' de '+s.total+' documentos':s.records.length+' documento(s) recebido(s)';
 const context=s.rows.length?(opinionLines()||' Inconsistências confirmadas: '+(s.summary.errors||0)+'. Verificações pendentes: '+(s.summary.pending||0)+'. Sugestões preventivas: '+(s.summary.suggestions||0)+'.'):'';
 return 'Situação da auditoria preventiva: '+progress+'. Arquivos identificados: '+sources.length+'.'+context+
  (s.progress===s.total&&s.total>0?' A análise está concluída para as fontes disponíveis, mas isso não equivale à aprovação fiscal.':'')+
  (s.context.contextWarning?' Há limitações de acesso às bases complementares; confira as fontes no relatório.':'');
};
async function audit(resume=false,speak:typeof say=say){
 if(resume&&service.snapshot().context.inputComplete===false){speak('A análise histórica não contém a entrada completa. O total original foi preservado. Use Nova auditoria e anexe todas as fontes para conferir o conjunto inteiro.');return;}
 const unidentified=service.unidentifiedAllocations?.()||[];
 if(unidentified.length){emit({pendingAllocations:unidentified.map((x:Data)=>({...x,value:state.pendingAllocations.find(p=>p.sha256===x.sha256)?.value||'',draft:state.pendingAllocations.find(p=>p.sha256===x.sha256)?.draft||false}))});speak('Falta confirmar a identificação de '+unidentified.length+' alocação(ões). Informe o número/código abaixo ou confirme que o arquivo é um rascunho sem numeração. Nenhuma emissão será criada.');return;}
 if(!service.snapshot().records.length){
  speak('Envie uma alocação XLSX externa ou selecione documentos no Gerador para começar.');return;
 }
 if(resume){
  const s=service.snapshot();
  if(s.total===0||(s.progress===0&&!s.context.checkpoint)){speak('Não há um processamento pausado. Inicie a auditoria dos arquivos recebidos.');return;}
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
 await refreshPlan();
 const plan=state.plan;
 speak('Auditoria preventiva concluída: '+summary.total+' documento'+(summary.total===1?'':'s')+' analisado'+(summary.total===1?'':'s')+'. '+
  (plan?plan.safe+' correção(ões) segura(s) ('+plan.safeAuthorized+' autorizada(s) por regra ativa), '+plan.proposed+' proposta(s) para revisão, '+plan.pending+' pendência(s) e '+plan.clear+' documento(s) sem problemas detectados.':'Resumo de correções indisponível.')+
  opinionLines()+' Foram autorizadas '+count+' correções nesta execução. Precedentes fiscais não são provas normativas nem garantem aprovação pela fiscalização.');
}
async function refreshPlan(){
 try{emit({plan:await service.correctionPlan()});}
 catch(e){emit({plan:null,error:'Resumo de correções indisponível: '+(e as Error).message});}
}
const help=()=>[
 'Posso conferir os arquivos antes do envio à fiscalização. Escolha uma ação:',
 '• Anexar alocação XLSX, inclusive preparada fora do GRCON;',
 '• Anexar LDs e pedir "Auditar arquivos";',
 '• Consultar "Situação" ou "Ver pendências";',
 '• Pedir explicação citando o código completo do documento;',
 '• "Retomar análise" após uma pausa ou "Baixar pacote" ao concluir.',
 'Limites por envio: até 20 arquivos XLSX, 30 MB por arquivo e 100 MB no lote. A auditoria aceita até 50.000 registros documentais. Linhas ocultas e filtradas também são conferidas.',
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
 // Aviso curto e transitório na janela (ex.: diagnóstico copiado), sem criar nova conversa.
 notice(text:string){say(text);},
 // Cancelamento real de qualquer operação em andamento (Worker, gravação, IA); o que já foi calculado é preservado.
 cancelOperation(){const n=service.cancel();say(n?'Cancelando a operação em andamento…':'Não há operação em andamento para cancelar.');},
 setTab(tab:Tab){emit({tab});},
 retrySave(){return execute(async(speak)=>speak('Vou tentar salvar a conversa novamente.'));},
 status(){return execute(async(speak)=>speak(snapshotStatus()));},
 help(){return execute(async(speak)=>speak(help()));},
 current(){return execute(async(speak)=>{
  if(state.pendingSheets.length){speak('Confirme ou cancele primeiro as abas das planilhas externas.');return;}
  const g=window as unknown as Data;
  if(typeof g.GrconAllocationGeneratorUi?.auditCurrentInChat!=='function')
   throw Error('Abra o Gerador de Alocação e selecione os documentos que deseja conferir.');
  await g.GrconAllocationGeneratorUi.auditCurrentInChat();
  speak('Recebi os documentos selecionados no Gerador, sem criar uma nova alocação.');
  await audit(false,speak);
 });},
 upload(files:File[],kind:'allocation'|'ld'){return execute(async(speak)=>{
  if(!files.length){speak('Nenhum arquivo selecionado.');return;}
  if(kind==='allocation'){
   const inspections=await service.inspectBatch(files) as Data[];
   const choices=inspections.filter(x=>x.requiresSelection).map(x=>({
    name:x.name,options:x.candidates,selected:''
   }));
   if(choices.length){
    pendingAllocationFiles=files.slice();
    emit({pendingSheets:choices});
    speak('Recebi '+files.length+' alocação(ões). Algumas planilhas possuem várias abas compatíveis. Selecione as abas indicadas para iniciar a conferência preventiva sem presumir a origem.');
    return;
   }
   const imported=await service.importMany(files) as Data;
   pendingAllocationFiles=[];
   emit({pendingSheets:[],pendingAllocations:[]});
   speak('Recebi e validei '+files.length+' alocação(ões).'+(imported.replaced?' Iniciei uma nova análise: as alocações anteriores foram substituídas e não se misturam a estas.':' Documentos incorporados à sessão com origem e ocorrências preservadas.'));
   if(imported.readingNotice)speak(imported.readingNotice);
   if(imported.checkpoint&&service.snapshot().progress<service.snapshot().total){
    const missing=service.missingSources();
    if(missing.length){speak('A análise parcial foi preservada. Reanexe estas fontes para continuar: '+missing.join(', '));return;}
    await audit(true,speak);
   }else await audit(false,speak);
  }else{
   const before=service.snapshot(),hadRows=before.rows.length>0;
   const result=await service.importAssistantLd(files) as Data;
   speak('Recebi '+files.length+' LD(s) de origem. As alocações anexadas permanecem na sessão.');
   if(result?.unchanged){
    if(before.progress<before.total){
     const missing=service.missingSources();
     if(missing.length)speak('Progresso preservado. Reanexe as fontes ainda necessárias: '+missing.join(', '));
     else await audit(true,speak);
    }else speak('Fontes idênticas reconectadas. Nenhum resultado ou decisão foi modificado.');
   }else if(service.snapshot().records.length){
    speak(hadRows?'As referências foram atualizadas. Vou refazer a auditoria para não reutilizar resultados antigos.':'Vou iniciar a auditoria usando as LDs recebidas.');
    await audit(false,speak);
   }else speak('Agora envie uma alocação para conferir antes da fiscalização.');
  }
 });},
 chooseSheet(fileName:string,sheet:string){
  if(state.pending)return;
  emit({pendingSheets:state.pendingSheets.map(x=>x.name===fileName?{...x,selected:sheet}:x)});
 },
 identifyAllocation(sha256:string,value:string,draft=false){if(state.pending)return;emit({pendingAllocations:state.pendingAllocations.map(x=>x.sha256===sha256?{...x,value:draft?'':value,draft}:x)});},
 confirmAllocationIdentities(){return execute(async(speak)=>{
  if(!state.pendingAllocations.length)return;
  service.confirmAllocationIdentities(state.pendingAllocations);
  emit({pendingAllocations:[]});
  speak('Identificação confirmada. Vou conferir as fontes disponíveis; rascunho sem numeração continua sujeito à identificação da emissão final.');
  await audit(false,speak);
 });},
 cancelSheetSelection(){
  if(state.pending)return;
  pendingAllocationFiles=[];emit({pendingSheets:[]});
  say('Seleção de abas cancelada. Os arquivos originais e alocações já carregadas permanecem intactos.');
 },
 confirmSheetSelection(){return execute(async(speak)=>{
  if(!state.pendingSheets.length||!pendingAllocationFiles.length){speak('Não há planilhas aguardando seleção.');return;}
  if(state.pendingSheets.some(x=>!x.options.some(option=>option.name===x.selected))){
   speak('Escolha uma aba válida para cada planilha antes de iniciar.');return;
  }
  const selected=Object.fromEntries(state.pendingSheets.map(x=>[x.name,x.selected]));
  const imported=await service.importMany(pendingAllocationFiles,selected) as Data;
  speak('Abas confirmadas e arquivos validados.'+(imported.replaced?' Iniciei uma nova análise: as alocações anteriores foram substituídas.':'')+' Vou conferir as ocorrências antes do envio à fiscalização.');
  pendingAllocationFiles=[];emit({pendingSheets:[],pendingAllocations:[]});
  if(imported.readingNotice)speak(imported.readingNotice);
  if(imported.checkpoint&&service.snapshot().progress<service.snapshot().total){
   const missing=service.missingSources();
   if(missing.length)speak('A análise parcial foi preservada. Reanexe as fontes restantes: '+missing.join(', '));
   else await audit(true,speak);
  }else await audit(false,speak);
 });},
 auditFiles(){return execute(async(speak)=>{
  if(state.pendingSheets.length){speak('Confirme primeiro as abas das planilhas anexadas.');return;}
  await audit(false,speak);
 });},
 resume(){return execute(speak=>audit(true,speak));},
 pause(){
  if(!state.pending&&!service.snapshot().busy){say('Não existe uma auditoria em andamento para pausar.');return;}
  service.cancel();
  say('Pausa solicitada. Vou finalizar o lote atual e registrar o progresso disponível.');
 },
 details(){return execute(async(speak)=>{
  const s=service.snapshot();
  if(!s.rows.length){speak('Ainda não há resultados. Envie ou selecione uma alocação e execute a auditoria preventiva.');return;}
  emit({tab:'pendencias'});
  speak('Abri a lista de pendências nesta janela, com filtros e orientação por item.'+opinionLines());
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
   if(state.pendingSheets.length&&['audit','resume','package'].includes(intent)){
    speak('Antes de continuar, selecione as abas pendentes ou cancele esse lote de arquivos.');return;
   }
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
     if(s.rows.length)emit({tab:'pendencias'});
     speak(s.rows.length?'Abri a lista de pendências nesta janela.'+opinionLines():'Ainda não existem resultados. Execute a auditoria primeiro.');
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
 // Exclui a análise atual (e, se pedido, as LDs desta sessão) para começar uma nova. Não altera arquivos do usuário.
 async discardAnalysis(includeLds=false){
  if(state.pending||service.snapshot().busy){emit({error:'Pause a análise e aguarde a operação atual antes de iniciar outra auditoria.'});return;}
  const open=state.open,sessions=state.sessions;generation++;const ticket=generation;pendingAllocationFiles=[];pendingWrite=null;
  emit({...initial(),open,sessions,pending:true});
  try{
   await service.discard(includeLds);
   if(ticket!==generation)return;
   say(includeLds?'Análise e LDs excluídas desta sessão. Envie as alocações e as LDs para começar uma nova auditoria. Seus arquivos originais não foram alterados.':'Análise excluída. As LDs continuam disponíveis: envie a alocação que deseja auditar. Seus arquivos originais não foram alterados.');
   try{await persist();}catch(e){if(ticket===generation)emit({saveState:'failed',error:'Conversa ainda não salva: '+(e as Error).message});}
  }catch(e){if(ticket===generation)emit({error:(e as Error).message});}
  finally{if(ticket===generation)emit({pending:false});}
 },
 applySafe(){return execute(async(speak)=>{
  const count=await service.applyAutomatic();
  await refreshPlan();
  speak(count?count+' correção(ões) segura(s) autorizada(s) por regra ativa. As cópias serão verificadas ao gerar os arquivos.':'Nenhuma correção segura nova: só são executadas as cobertas por regra homologada ativa.');
 });},
 // Revisão individual de um item: autorizar/recusar uma proposta ou registrar exceção justificada (com justificativa e evidência humanas).
 decide(input:{rowIndex:number;field:string;after:string;decision:'accepted'|'rejected'|'exception';justification:string;evidence:string}){return execute(async(speak)=>{
  const evidence=input.evidence.trim()?[input.evidence.trim()]:[];
  await service.review(input.rowIndex,{state:input.decision==='exception'?'Exceção justificada':'Correção proposta',decision:input.decision,field:input.field,value:input.after,justification:input.justification.trim(),evidence});
  await service.save();
  await refreshPlan();
  speak(input.decision==='accepted'?'Proposta autorizada. Ela só conta como correção depois de gerar os arquivos e reexecutar a auditoria.':input.decision==='rejected'?'Proposta recusada. O valor original foi mantido.':'Exceção registrada com justificativa e evidência. Ela ainda exige conferência humana final.');
 });},
 group(group:Data){return execute(async(speak)=>{
  await service.acceptGroup(group);
  await service.save();
  await refreshPlan();
  speak('Decisão registrada para '+group.rows.length+' ocorrência(s) do mesmo contexto. As cópias serão verificadas ao preparar o pacote.');
 });},
 restore(id:string){return execute(async(speak)=>{
  if(state.pendingSheets.length){speak('Cancele primeiro a seleção de abas da importação pendente.');return;}
  const ticket=generation;
  const result=await service.assistantRpc('session-read',{id});
  if(!result.payload||!Array.isArray(result.payload.messages)||!Number.isInteger(result.revision))throw Error('A conversa salva retornou dados incompletos.');
  const staged=result.payload.runId?await service.prepareRestoreById(result.payload.runId):service.prepareEmptyConversation();
  if(ticket!==generation)return;
  staged.commit();pendingAllocationFiles=[];pendingWrite=null;
  emit({sessionId:id,revision:result.revision,messages:result.payload.messages,pendingSheets:[],pendingAllocations:[],plan:null,saveState:'saved',tab:'conversa'});
  if(service.snapshot().rows.length)await refreshPlan();
  speak('Conversa recuperada. Reanexe as fontes originais quando necessário e reanalise antes de novas correções.');
 },true);},
};
function resetConversation(){generation++;pendingAllocationFiles=[];pendingWrite=null;sessionIdentity=contextIdentity();state=initial();listeners.forEach(f=>f());}
for(const event of ['grcon:contract-context-changed','grcon:cloud-signed-out'])window.addEventListener(event,resetConversation);
window.addEventListener('grcon:cloud-ready',()=>{if(sessionIdentity!==contextIdentity())resetConversation();});
