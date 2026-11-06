// Modelo de visualização do chat do Robô Auditor (Etapa 6, RA-13). Puro e sem DOM: só transforma o estado do motor em
// etapas, pendências individuais, filtros e a próxima ação. Os números vêm do parecer canônico (allocation_auditor_opinion.js).
export type Data=Record<string,any>;
export type Kind='erro'|'pendencia'|'sugestao'|'proposta';
export type Item={
 id:string;kind:Kind;rowIndex:number;lineage:string;document:string;revision:string;allocation:string;
 field:string;fieldLabel:string;ruleId:string;title:string;why:string;found:string;proposed:string;reference:string;
 action:string;where:string;verify:string;status:string;statusCode:string;open:boolean;canDecide:boolean;decision:string;
};
export type Stage={id:string;label:string;state:'done'|'current'|'todo'|'attention';detail:string};
export type NextAction={id:'confirm-sheets'|'confirm-identity'|'start'|'audit'|'resume'|'review'|'report'|'busy';label:string;hint:string};

const REVIEWABLE=new Set(['title','databook','eap','tag','discipline','workflow','N1','N2','N3','N4','N5','N6']);
const GUIDE:Record<string,{label:string;why:string;where:string}>={
 title:{label:'Título',why:'O título é parte da identificação do documento: precisa ser completo e inequívoco para que ele seja localizado sem depender do código.',where:'Corrigir na LD (coluna de título); a alocação deve repetir o valor da LD.'},
 tag:{label:'TAG',why:'A TAG liga o documento ao item físico; divergência entre LD, código e alocação impede rastrear o registro.',where:'Corrigir na LD e conferir o Grupo 7 do código do documento.'},
 databook:{label:'Caminho do Data Book',why:'Define onde o documento será arquivado; caminho errado esconde o documento da fiscalização.',where:'Corrigir na LD (coluna de caminho do Data Book) a partir da base ativa.'},
 workflow:{label:'Workflow',why:'O workflow determina quem analisa o documento; o valor precisa existir na base de workflows do contrato.',where:'Corrigir na LD e conferir na base de workflows.'},
 eap:{label:'EAP',why:'A EAP define o item de medição e a pasta N1–N5 do documento.',where:'Corrigir na LD; a hierarquia da alocação deve seguir a EAP.'},
 discipline:{label:'Disciplina',why:'A disciplina deve coincidir com a do código e a da LD.',where:'Corrigir na LD e na alocação.'},
 levels:{label:'Hierarquia (N1–N6)',why:'Os níveis da alocação precisam seguir a hierarquia da EAP para o arquivamento correto.',where:'Corrigir os níveis N1–N6 na alocação, conforme a EAP.'},
 document:{label:'Código do documento',why:'O código precisa seguir a estrutura de sete grupos da norma, sem caracteres não permitidos.',where:'Corrigir o código na LD.'},
 ld:{label:'LD de origem',why:'Sem a LD correspondente não é possível confirmar os dados do documento.',where:'Anexar a LD correta e auditar novamente.'},
 allocation:{label:'Identificação da alocação',why:'A auditoria precisa saber a qual alocação os documentos pertencem.',where:'Informar o número da alocação ou confirmar rascunho.'},
 revision:{label:'Revisão',why:'A revisão define a versão da ET e da LD aplicáveis.',where:'Conferir a revisão na LD.'}
};
const FALLBACK={label:'Informação do documento',why:'A conferência encontrou uma divergência ou lacuna neste dado.',where:'Conferir na LD ou na fonte indicada.'};
const guideFor=(field:string)=>GUIDE[/^N[1-6]$/.test(field)?'levels':field]||FALLBACK;

export const STATUS_LABEL:Record<string,string>={
 aberta:'Aberta',pendente:'Pendente de verificação',sugestao:'Sugestão preventiva',aplicada:'Correção aplicada na cópia',
 'aplicada-sem-reauditoria':'Aplicada — falta reauditar','resolvida-comprovada':'Resolvida (comprovada)','resolucao-contradita':'Persiste após a correção',
 'excecao-justificada':'Exceção justificada',sugerida:'Aguardando decisão',autorizada:'Autorizada — falta aplicar',recusada:'Recusada',contradita:'Persiste após a correção'
};
const OPEN=new Set(['aberta','pendente','sugerida','autorizada','resolucao-contradita','contradita','aplicada-sem-reauditoria']);
const text=(v:unknown)=>v==null?'':String(v).trim();
export const rowValue=(r:Data,f:string)=>/^N[1-6]$/.test(f)?text(r.levels?.[Number(f.slice(1))-1]):text(r[f]);
const evidenceText=(ev:any)=>(Array.isArray(ev)?ev:[]).slice(0,3).map((e:Data)=>[e.file,e.sheet&&'aba '+e.sheet,e.row&&'linha '+e.row,e.cell,e.version].filter(Boolean).join(' · ')).filter(Boolean).join('; ');

export function buildItems(rows:Data[],opinion:Data|null,events:Data[]=[],comparison:Data|null=null):Item[]{
 // Reauditoria: apontamentos que persistem ou surgiram depois da correção ganham o rótulo da comparação (chave: alocação · documento · revisão · regra · campo).
 const compared=new Map<string,string>();
 for(const c of (comparison&&comparison.items)||[])if(c.kind==='ocorrencia'&&c.status!=='resolvida')compared.set(JSON.stringify([c.allocation,c.document,c.revision,c.id,c.field]),c.status);
 const life=new Map<string,string>();
 for(const x of opinion?.lifecycle||[])life.set(x.kind==='ocorrencia'?JSON.stringify(['o',x.lineage,x.id]):JSON.stringify(['p',x.lineage,x.field,text(x.after)]),x.state);
 const latest=new Map<string,Data>();
 for(const e of events)if(e&&e.field)latest.set(JSON.stringify([e.lineage,e.field,text(e.after)]),e);
 const items:Item[]=[];
 rows.forEach((row,rowIndex)=>{
  const base={rowIndex,lineage:row.lineage,document:text(row.document),revision:text(row.revision),allocation:text(row.allocation)};
  for(const f of row.findings||[]){
   const g=guideFor(f.field),kind:Kind=f.severity==='error'?'erro':f.severity==='pending'?'pendencia':'sugestao';
   const rec=(row.recommendations||[]).find((p:Data)=>p.field===f.field||(f.field==='levels'&&/^N[1-6]$/.test(text(p.field))));
   const code=life.get(JSON.stringify(['o',row.lineage,f.id]))||(kind==='sugestao'?'sugestao':kind==='erro'?'aberta':'pendente');
   items.push({...base,id:row.lineage+'|'+f.id,kind,field:f.field||'',fieldLabel:g.label,ruleId:text(f.id),title:text(f.message),why:g.why,
    found:rec?text(rec.before):rowValue(row,f.field),proposed:rec?text(rec.after):'',reference:[text(f.source),evidenceText(f.evidence)].filter(Boolean).join(' — '),
    action:kind==='erro'?'Corrija na origem e reexecute a auditoria.':kind==='pendencia'?'Confira a fonte indicada e registre o resultado; sem comprovação, o item continua pendente.':'Avalie. Não é erro confirmado e não impede o envio.',
    where:text(f.origin)?'Corrigir em: '+text(f.origin)+'. '+g.where:g.where,
    verify:'Reexecute a auditoria: o apontamento deixa de aparecer. Só a reauditoria comprova a resolução.',
    status:STATUS_LABEL[code]||code,statusCode:code,open:OPEN.has(code),canDecide:kind!=='sugestao'&&REVIEWABLE.has(f.field||''),decision:''});
   const cmp=compared.get(JSON.stringify([base.allocation,base.document,base.revision,text(f.id),text(f.field)]));
   if(cmp){const it=items[items.length-1];it.status=cmp==='nova'?'Nova após a correção':'Persiste após a correção';it.statusCode=cmp==='nova'?'nova':'persiste';}
  }
  for(const rec of row.recommendations||[]){
   if(!rec||!rec.field)continue;
   const g=guideFor(rec.field),code=life.get(JSON.stringify(['p',row.lineage,rec.field,text(rec.after)]))||'sugerida';
   const d=latest.get(JSON.stringify([row.lineage,rec.field,text(rec.after)]));
   items.push({...base,id:row.lineage+'|P|'+rec.field+'|'+text(rec.after),kind:'proposta',field:rec.field,fieldLabel:g.label,ruleId:'PROPOSTA',
    title:'Valor sugerido para '+g.label.toLowerCase()+' a partir das fontes consultadas.',why:g.why,found:text(rec.before),proposed:text(rec.after),
    reference:evidenceText(rec.evidence)||text(rec.source),action:'Revise o valor sugerido e autorize ou recuse com justificativa. Sugestão não é correção realizada.',
    where:g.where,verify:'Autorizada a proposta, gere os arquivos e reexecute a auditoria para comprovar.',
    status:STATUS_LABEL[code]||code,statusCode:code,open:OPEN.has(code),canDecide:REVIEWABLE.has(rec.field),decision:d?text(d.decision):''});
  }
 });
 const rank:Record<Kind,number>={erro:0,pendencia:1,proposta:2,sugestao:3};
 return items.map((it,i)=>({it,i})).sort((a,b)=>rank[a.it.kind]-rank[b.it.kind]||a.i-b.i).map(x=>x.it);
}

export type Filter={kind:Kind|'todas';query:string;onlyOpen:boolean};
export function filterItems(items:Item[],f:Filter):Item[]{
 const q=text(f.query).toLocaleLowerCase();
 return items.filter(it=>(f.kind==='todas'||it.kind===f.kind)&&(!f.onlyOpen||it.open)&&(!q||[it.document,it.title,it.ruleId,it.fieldLabel,it.found,it.proposed].join(' ').toLocaleLowerCase().includes(q)));
}
export function countKinds(items:Item[]){
 const c={todas:items.length,erro:0,pendencia:0,proposta:0,sugestao:0,abertas:0};
 for(const it of items){c[it.kind]++;if(it.open)c.abertas++;}
 return c;
}

type Input={records:Data[];rows:Data[];progress:number;total:number;busy:boolean;sources:Data[];pendingSheets:number;pendingAllocations:number;opinion:Data|null;contextWarning?:string};
export function nextAction(i:Input):NextAction{
 if(i.pendingSheets)return {id:'confirm-sheets',label:'Confirmar abas',hint:'Selecione a aba de cada planilha para continuar.'};
 if(i.pendingAllocations)return {id:'confirm-identity',label:'Confirmar identificação',hint:'Informe o número da alocação ou confirme rascunho.'};
 if(i.busy)return {id:'busy',label:'Processando…',hint:'Acompanhe o progresso abaixo.'};
 if(!i.records.length&&!i.rows.length)return {id:'start',label:'Auditar alocação',hint:'Informe o número, use a alocação atual ou envie uma planilha.'};
 // Retomar só faz sentido se algo já foi analisado; com 0 documentos analisados (ex.: prazo estourado no primeiro lote) o caminho é auditar de novo.
 if(i.total>0&&i.progress>0&&i.progress<i.total)return {id:'resume',label:'Retomar análise',hint:'A análise parou em '+i.progress+' de '+i.total+' documentos.'};
 if(!i.rows.length)return {id:'audit',label:'Auditar alocação',hint:'Os documentos foram recebidos; falta executar a auditoria.'};
 const o=i.opinion;
 if(!o)return {id:'review',label:'Ver pendências',hint:'O parecer consolidado não está disponível nesta tela; confira as pendências antes de concluir.'};
 if((o.blockers||[]).length)return {id:'review',label:'Ver pendências',hint:(o.blockers as Data[]).map(b=>b.count+' '+b.message).join('; ')+'.'};
 return {id:'report',label:'Baixar relatório e arquivos',hint:'Nenhum impedimento registrado. A conferência final continua sendo humana.'};
}

export function buildStages(i:Input):Stage[]{
 const hasAlloc=i.records.length>0||i.rows.length>0,hasLd=i.sources.some(x=>x.kind==='ld'),complete=i.rows.length>0&&i.total>0&&i.progress===i.total;
 const o=i.opinion,blockers=(o?.blockers||[]).length;
 const st=(done:boolean,current:boolean,attention=false):Stage['state']=>attention?'attention':done?'done':current?'current':'todo';
 return [
  {id:'alocacao',label:'Alocação',state:st(hasAlloc,!hasAlloc),detail:hasAlloc?'Recebida':'Informe, selecione ou envie'},
  {id:'fontes',label:'LDs e referências',state:hasLd?'done':hasAlloc?'attention':'todo',detail:hasLd?i.sources.filter(x=>x.kind==='ld').length+' LD(s) anexada(s)':hasAlloc?'Sem LD: conferência limitada':'Anexe as LDs'},
  {id:'auditoria',label:'Auditoria',state:st(complete,i.busy||(hasAlloc&&!complete)),detail:complete?'Concluída':i.total>0?i.progress+' de '+i.total:'Aguardando'},
  {id:'diagnostico',label:'Diagnóstico',state:st(complete,false),detail:complete?(o?o.counts.occurrences.total+' ocorrência(s)':'Pronto'):'Após a auditoria'},
  {id:'correcoes',label:'Correções',state:complete?(blockers||!o?'attention':'done'):'todo',detail:complete?(!o?'Parecer indisponível':blockers?blockers+' tipo(s) de impedimento':'Sem impedimentos'):'Após o diagnóstico'},
  {id:'relatorio',label:'Relatório',state:complete&&o&&!blockers?'current':'todo',detail:complete?(!o||blockers?'Resolva os impedimentos':'Pronto para gerar'):'Ao final'}
 ];
}

// Mensagens de recuperação: o que aconteceu, o que ficou comprometido e o que fazer. Vêm do catálogo compartilhado
// (allocation_auditor_errors.js); sem ele, vale a mensagem genérica. `code` vem de erros tipados (prazo, cancelamento, IA, gravação).
export type Recovery={what:string;compromised:string;todo:string;detail:string;code:string;severity:string;retryable:boolean};
export function friendlyError(message:string,code=''):Recovery{
 const E=(globalThis as any).GrconAllocationAuditorErrors;
 const m=text(message);
 if(E){const d=E.describe({message:m,code});return {what:d.what,compromised:d.compromised,todo:d.todo,detail:d.detail,code:d.code,severity:d.severity,retryable:d.retryable};}
 return {what:'A etapa não foi concluída.',compromised:'Os arquivos originais foram preservados e os resultados já calculados continuam na tela.',todo:'Tente novamente. Se persistir, informe a mensagem à equipe do GRCON.',detail:m,code:'UNKNOWN',severity:'error',retryable:true};
}
