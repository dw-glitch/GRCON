(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GrconAllocationAuditorCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='1.6.0';
 // Catálogo de referências (Etapa 3): opcional e aditivo. Sem context.references o motor se comporta como antes.
 const References=(()=>{try{if(typeof module==='object'&&module.exports&&typeof require==='function')return require('./allocation_auditor_references.js');}catch(_){}return typeof globalThis!=='undefined'?globalThis.GrconAllocationAuditorReferences:undefined;})();
 const text=v=>v==null?'':Object.prototype.toString.call(v)==='[object Date]'?v.toISOString():String(v).trim();
 const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
 const key=r=>JSON.stringify([text(r.contract),text(r.document),text(r.revision),ldIdentity(r).id||text(r.ld),ldIdentity(r).sheet,text(r.sourceFile),text(r.sourceSheet),text(r.sourceRow),text(r.allocation),text(r.sourceHash)]);
 const ET='ET-5290.00-22000-912-1LV-001';
 const STATES=['Aberto','Correção proposta','Corrigido na origem','Reapresentado','Aguardando avaliação','Resolvido com evidência','Aceito com ressalvas','Exceção justificada','Não comprovado'];
 const TAXONOMY=[
  ['title','Título',/TITULO|DESCRICAO|ORTOGRAF|FORMACAO DO CABO|CLASSE DE TENSAO|CONDUTORES/,'title','LD'],
  ['code','Codificação',/CODIFIC|SEQUENCIAL|N-1710|NT-|CARACTER|GRUPO 7/,'document','LD'],
  ['tag','TAG',/\bTAG\b|EQUIPAMENTO|MOTOR/,'tag','Cadastro de TAGs / LD'],
  ['databook','Data Book',/CAM\.?\s?DB|CAMINHO|DATA\s?BOOK|PASTA|SUBGRUPO/,'databook','LD / Base Data Book'],
  ['hierarchy','Hierarquia / EAP',/\bEAP\b|\bN(?:[1-9]|10)\b|NIVE[LIS]|HIERARQUIA|ETAPA/,'levels','LD / EAP'],
  ['workflow','Workflow',/WORKFLOW|\bWF\b/,'workflow','LD / Workflow'],
  ['scope','Atividade / escopo',/REPARO|MONTAGEM|COMISSIONAMENTO|HVAC|ESCOPO|DISCIPLINA/,'discipline','LD / Informação técnica'],
  ['history','Pendência documental',/HISTORICO|VERSAO|ATUALIZAR ALOCACAO|NAO LOCALIZAD|JUSTIFICATIVA|LD DESATUALIZ/,'allocation','LD']
 ];
 const RULES=[
  {id:'ET-717-PRESERVE',item:'7.1.7',field:'tag',description:'Identificador exato da referência, sem normalização do TAG.'},
  {id:'ET-7171-SEPARATOR',item:'7.1.7.1',field:'tag',description:'Separação de nomes de itens não tagueados por hífen.'},
  {id:'ET-7172-CHARACTERS',item:'7.1.7.2',field:'tag',description:'Caracteres proibidos no Grupo 7.'},
  {id:'ET-7173-NT',item:'7.1.7.3',field:'tag',description:'Prefixo nt- minúsculo para itens comprovadamente não tagueados.'}
 ].map(r=>Object.freeze({...r,source:ET,revisions:['N','P','Q','R'],version:VERSION,severity:'error',contracts:[],condition:'Revisão e aplicabilidade confirmadas na base do contrato; relatórios ET.'}));
 function classifyComment(original){
  const value=norm(original);if(!value)return [];
  if(/^(?:OK|ACEIT[OA] SEM COMENTARIOS)\.?$/.test(value))return [];
  const matches=TAXONOMY.filter(x=>x[2].test(value));
  return (matches.length?matches:[['unconfirmed','Comentário não classificado',null,'','Informação técnica']]).map(([category,label,_,field,origin])=>({category,label,field,origin,original:original==null?'':String(original),learning:'precedente-especifico',certainty:category==='unconfirmed'?'baixa':'media',humanReview:true,references:[...new Set(text(original).match(/(?:7\.1\.7(?:\.[1-3])?|N-1710|ET-[\dA-Z.-]+)/g)||[])],requestedCorrection:text(original)}));
 }
 function decision(comment,status){
  const c=norm(comment),s=norm(status);
  if(/RECUSAD/.test(c))return 'recusado';
  if(/ACEIT[OA] COM|AJUSTAR|CORRIGIR|AVALIAR/.test(c))return 'aceito-com-ressalvas';
  if(/^(OK|ACEIT[OA] SEM COMENTARIOS)\.?$/.test(c))return 'aceito-sem-comentarios';
  if(/RECUSAD/.test(s))return 'recusado';
  return 'nao-comprovado';
 }
 function headerMap(row){
  const h=row.map(norm),compact=v=>v.replace(/[^A-Z0-9]/g,''),find=(...names)=>{const exact=h.findIndex(v=>names.includes(v));if(exact>=0)return exact;const aliases=new Set(names.map(compact));return h.findIndex(v=>aliases.has(compact(v)));};
  return {document:find('NOMEDOCUMENTO','NOME DOCUMENTO','NOME DO DOCUMENTO','DOCUMENTO','CODIGO','CODIGO DO DOCUMENTO','CODIGO DOCUMENTAL','NUMERO DO DOCUMENTO','Nº DOCUMENTO','N° DOCUMENTO'),revision:find('REVISAO','REV.','REV'),title:find('TITULO','TITULO DO DOCUMENTO'),allocation:find('ALOCACAO','NUMERO DA ALOCACAO'),ld:find('LD','LD DE ORIGEM'),ldSheet:find('ABA'),ldVersion:find('VERSAO DA LD'),sentAt:find('DATA DO ENVIO DA ALOC','DATA DO ENVIO'),returnedAt:h.findIndex(v=>/^RETORNO DA FISCAL 01/.test(v)),fiscalComment:h.findIndex(v=>/^RESPOSTA DA FISCAL 01/.test(v)),fiscal02:h.findIndex(v=>/^RETORNO DA FISCAL 02/.test(v)),status:find('STATUS DA ALOCACAO','STATUS/ OBSERVACAO','STATUS'),databook:find('CAMINHO DATA BOOK','CAMINHO DATABOOK'),workflow:find('WORKFLOW'),discipline:find('DISCIPLINA'),eap:find('EAP'),tag:find('TAG'),plannedDate:find('DATA PREVISTA'),activeDocument:find('DOCUMENTO ATIVO'),action:find('ACAO'),baselineDate:find('DATA DA LINHA BASE'),purpose:find('PROPOSITO DE EMISSAO ORIGINAL'),criticalDocument:find('DOCUMENTO CRITICO'),observation:find('OBSERVACAO'),levels:Array.from({length:10},(_,i)=>find('N'+(i+1)))};
 }
 function parseRows(rows,meta={},options={}){
  let header=-1,map,highestScore=-1;
  for(let i=0;i<Math.min(1000,rows.length);i++){
   const m=headerMap(rows[i]||[]);
   if(m.document<0)continue;
   const fields=['revision','title','allocation','ld','ldSheet','ldVersion','sentAt','returnedAt','fiscalComment','status','databook','workflow','discipline','eap','tag','plannedDate','activeDocument','action','baselineDate','purpose','criticalDocument','observation'];
   const score=fields.filter(k=>m[k]>=0).length+m.levels.filter(k=>k>=0).length;
   if(score>highestScore){header=i;map=m;highestScore=score;}
  }
  if(header<0)throw Error('Cabeçalho documental não reconhecido nas primeiras 1.000 linhas. Nenhuma coluna foi presumida.');
  for(const field of ['document','revision','allocation','ld','ldSheet','title','workflow','tag','eap','databook','discipline']){
   const matches=(rows[header]||[]).map((value,i)=>headerMap([value])[field]===0?i:-1).filter(i=>i>=0);
   if(matches.length>1)throw Error('Cabeçalho ambíguo: mais de uma coluna de '+({document:'documento',revision:'revisão',allocation:'alocação',ld:'LD',ldSheet:'aba da LD',title:'título',workflow:'workflow',tag:'TAG',eap:'EAP',databook:'Data Book',discipline:'disciplina'}[field])+' na linha '+(header+1)+'. Confirme o layout antes de importar.');
  }
  const official=['NOMEDOCUMENTO','DATA PREVISTA','WORKFLOW','DOCUMENTO ATIVO','ACAO','DATA DA LINHA BASE','PROPOSITO DE EMISSAO ORIGINAL','DOCUMENTO CRITICO','OBSERVACAO','CAMINHO DATA BOOK','N1','N2','N3','N4','N5','N6'].every((h,i)=>norm(rows[header][i])===h);
   const records=[];for(let i=header+1;i<rows.length;i++){
   const row=rows[i]||[],cellValues={},sourceIssues=[];
   const get=n=>{
    if(map[n]<0||map[n]===undefined)return '';
    if(!options.cellAt)return text(row[map[n]]);
    const value=options.cellAt(i,map[n]);cellValues[n]=value;
    if(value.issue){
     if(n==='document')throw Error('Falha de leitura do código documental em '+(meta.sourceSheet||'aba selecionada')+'!'+value.cell+': '+value.issue+'. Abra uma cópia no Excel, recalcule e salve antes de importar.');
     if(!sourceIssues.some(x=>x.field===n))sourceIssues.push({field:n,cell:value.cell,message:value.issue});
     return '';
    }
    return text(['document','revision','allocation','ld','ldSheet','ldVersion','tag','eap'].includes(n)?value.display:row[map[n]]);
   };
   const document=get('document');if(!document)continue;
   // Repeated print headers are not document occurrences.
   if((rows[header]||[]).every((value,col)=>norm(value)===norm(row[col])))continue;
   const r={...meta,document,rawDocument:row[map.document]==null?'':String(row[map.document]),officialAllocation:official,plannedDate:get('plannedDate'),activeDocument:get('activeDocument'),action:get('action'),baselineDate:get('baselineDate'),purpose:get('purpose'),criticalDocument:get('criticalDocument'),observation:get('observation'),revision:get('revision'),title:get('title'),allocation:get('allocation')||text(meta.allocation),ld:get('ld'),ldSheet:get('ldSheet'),ldVersion:get('ldVersion'),sentAt:get('sentAt'),returnedAt:get('returnedAt'),fiscalComment:get('fiscalComment'),fiscal02:get('fiscal02'),status:get('status'),databook:get('databook'),workflow:get('workflow'),discipline:get('discipline'),eap:get('eap'),tag:get('tag'),levels:map.levels.map((j,n)=>{
    if(j<0)return '';if(!options.cellAt)return text(row[j]);
    const value=options.cellAt(i,j);cellValues['N'+(n+1)]=value;
    if(value.issue){sourceIssues.push({field:'levels',cell:value.cell,message:value.issue});return '';}
    return text(row[j]);
   }),sourceRow:i+1,columns:Object.fromEntries(Object.entries(map).filter(([_,v])=>typeof v==='number'&&v>=0).map(([k,v])=>[k,v+1]))};
   if(options.cellAt){r.cellValues=cellValues;r.sourceIssues=sourceIssues;r.sourceRowHidden=Boolean(options.rowHidden?.(i));}
   r.allocationIdentity=r.allocation?'from-source':'unconfirmed';
   // Fiscal text is preserved verbatim, including spacing and line breaks.
   if(map.fiscalComment>=0){const raw=row[map.fiscalComment];r.fiscalComment=typeof raw==='string'?raw:'';if(raw!=null&&raw!==''&&typeof raw!=='string'){r.fiscalCommentRaw=raw;r.commentDataIssue='Resposta fiscal contém valor não textual.';}}
   // Status/observação in returned allocation workbooks is evidence; sheet names are not decisions.
   if(!r.fiscalComment&&map.fiscalComment<0&&map.status>=0&&norm(rows[header][map.status])==='STATUS/ OBSERVACAO')r.fiscalComment=row[map.status]==null?'':String(row[map.status]);
   r.fiscalDecision=decision(r.fiscalComment,r.status);r.commentFindings=classifyComment(r.fiscalComment);records.push(r);
  }
  if(!records.length)throw Error('Cabeçalho encontrado na linha '+(header+1)+', mas nenhuma linha de documento foi reconhecida. Confira o modelo e a aba de origem.');
   return {records,headerRow:header+1,columns:map,model:official?'official-16':'mapped',documentCount:records.length};
 }
 function cellSnapshot(sheet,xlsx,row,col){
  const address=xlsx.utils.encode_cell({r:row,c:col}),cell=sheet[address];
  if(!cell)return {cell:address,raw:null,display:'',type:'empty',format:'',formula:null,cache:'not-formula'};
  const raw=cell.v==null?null:Object.prototype.toString.call(cell.v)==='[object Date]'?cell.v.toISOString():cell.v;
  const missing=Boolean(cell.f)&&(cell.v==null||cell.t==='z');
  let display=cell.w!==undefined?String(cell.w):text(cell.v);
  if(cell.w===undefined&&cell.v!=null){try{display=xlsx.utils.format_cell(cell);}catch{/* raw representation remains available */}}
  const issue=cell.t==='e'?'A célula contém erro do Excel ('+display+')':missing?'A fórmula não tem resultado calculado disponível':cell.t==='n'&&(!Number.isFinite(cell.v)||(Number.isInteger(cell.v)&&!Number.isSafeInteger(cell.v)))?'O número não pode ser preservado com segurança; confirme o identificador como texto':'';
  return {cell:address,raw,display,type:cell.t||'unknown',format:cell.z||'',formula:cell.f||null,cache:cell.t==='e'?'error':cell.f?(missing?'missing':'available'):'not-formula',...(issue?{issue}:{})};
 }
 function parseWorksheet(sheet,xlsx,meta={}){
  if(!sheet||!sheet['!ref'])throw Error('A aba não contém uma região documental legível.');
  const range=xlsx.utils.decode_range(sheet['!ref']);
  if(range.e.r>100000||range.e.c>200)throw Error('Planilha acima dos limites de 100.001 linhas ou 201 colunas. Divida a entrada antes de importar.');
  const rows=xlsx.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true,range:{s:{r:0,c:0},e:range.e}});
  const parsed=parseRows(rows,meta,{cellAt:(r,c)=>cellSnapshot(sheet,xlsx,r,c),rowHidden:r=>sheet['!rows']?.[r]?.hidden});
  return {...parsed,readingPolicy:{includesHiddenRows:true,includesFilteredRows:true,formulaResults:'cached-only',hiddenDocumentRows:parsed.records.filter(r=>r.sourceRowHidden).length},sourceIssues:parsed.records.flatMap(r=>(r.sourceIssues||[]).map(issue=>({...issue,row:r.sourceRow})))};
 }
 function parts(document){const p=text(document).split('_');return p.length>=7?{supplier:p[0],project:p[1],unit:p[2],eap:p[3],discipline:p[4],report:p[5],tag:p.slice(6).join('_')}:null;}
 function ldIdentity(r){const file=text(r.ld||r.origin?.file),sheet=norm(r.ldSheet||r.origin?.sheet);const id=file.match(/LD-[\d.]+-[\dA-Z]+-[\dA-Z]+-[\dA-Z]+-(\d{3})/i)?.[1]||sheet.match(/LD[_\s-]*(\d{3})/)?.[1]||'';return {id,sheet:sheet.replace(/[_\s-]*LD[_\s-]*\d{3}.*$/,'').trim()};}
 function sameLd(a,b){const x=ldIdentity(a),y=ldIdentity(b);if(x.id&&y.id&&x.id!==y.id)return false;if(x.sheet&&y.sheet&&x.sheet!==y.sheet)return false;
  const af=text(a.ld||a.origin?.file),bf=text(b.ld||b.origin?.file);
  const fullId=value=>value.match(/LD-[\d.]+-[\dA-Z]+-[\dA-Z]+-[\dA-Z]+-\d{3}/i)?.[0]?.toUpperCase();
  if(fullId(af)&&fullId(bf)&&fullId(af)!==fullId(bf))return false;
  if(af&&bf&&(!x.id||!y.id)&&norm(af.split(/[\\/]/).pop())!==norm(bf.split(/[\\/]/).pop()))return false;
  return true;
 }
 function applicable(context){const a=context.applicability||{};return a.confirmed===true&&a.contract===context.contract&&a.source===ET&&['N','P','Q','R'].includes(a.revision)&&Boolean(text(a.evidence));}
 function finding(id,category,field,message,evidence,opts={}){return {id,category,field,message,evidence,ruleVersion:VERSION,source:opts.source||'Integridade operacional',severity:opts.severity||'pending',origin:opts.origin||'LD',humanReview:true,...opts};}
 function buildTree(paths,version){const nodes=new Map();for(const entry of paths||[]){const p=text(entry.databook||entry.path).split('|');if(p.some(x=>!x.trim()))continue;for(let i=0;i<p.length;i++){const full=p.slice(0,i+1).join('|');nodes.set(full,{id:JSON.stringify([version,full]),parent:i?JSON.stringify([version,p.slice(0,i).join('|')]):null,label:p[i],path:full,version});}}return nodes;}
 function fiscalFamily(document){
  const parsed=parts(document);
  if(!parsed||norm(parsed.project)!=='RNEST'||!parsed.report||!parsed.discipline)return '';
  return norm(parsed.discipline)+'|'+norm(parsed.report);
 }
 const FISCAL_FAMILY_CATEGORIES=new Set(['title','code','tag','databook','hierarchy','workflow','scope']);

 // ---- Verificações de digitação e de nt- (motor 1.4.0) ----
 // Distância de Damerau-Levenshtein (alinhamento ótimo) com corte antecipado.
 function editDistance(a,b,max){
  if(a===b)return 0;
  if(Math.abs(a.length-b.length)>max)return max+1;
  const prev2=new Array(b.length+1).fill(0);let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
   const cur=[i];let rowMin=i;
   for(let j=1;j<=b.length;j++){
    const cost=a[i-1]===b[j-1]?0:1;
    let v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+cost);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,(prev2[j-2]??Infinity)+1);
    cur[j]=v;if(v<rowMin)rowMin=v;
   }
   if(rowMin>max)return max+1;
   for(let j=0;j<=b.length;j++)prev2[j]=prev[j];
   prev=cur;
  }
  return prev[b.length];
 }
 const WORD=/[A-Za-zÀ-ÿ]{5,}/g;
 function buildVocabulary(ldRecords){
  const counts=new Map(),display=new Map();
  if((ldRecords||[]).length<50)return null; // vocabulário insuficiente: nada é afirmado
  for(const rec of ldRecords){
   const title=text(rec.title);if(!title)continue;
   for(const w of title.match(WORD)||[]){
    const n=norm(w);counts.set(n,(counts.get(n)||0)+1);
    const d=display.get(n)||new Map();d.set(w,(d.get(w)||0)+1);display.set(n,d);
   }
  }
  const good=new Map();
  for(const [n,c] of counts)if(c>=5){const len=n.length,l=good.get(len)||[];l.push(n);good.set(len,l);}
  const shown=n=>[...display.get(n).entries()].sort((a,b)=>b[1]-a[1])[0][0];
  return {counts,good,shown};
 }
 // Sugere correção de palavra apenas quando há um único vizinho muito mais frequente na LD.
 function suggestWord(word,vocab){
  const n=norm(word),c=vocab.counts.get(n)||0;
  if(c>=3||/\d/.test(n))return null;
  const max=n.length>=11?2:1;let best=null,tie=false;
  for(let len=n.length-max;len<=n.length+max;len++)for(const cand of vocab.good.get(len)||[]){
   const cc=vocab.counts.get(cand);
   if(cc<Math.max(5,5*Math.max(c,1)))continue;
   if(cand.startsWith(n)||n.startsWith(cand))continue;           // plural/flexão
   if(cand.slice(0,-1)===n.slice(0,-1))continue;                  // só a última letra: gênero/número
   const d=editDistance(n,cand,max);
   if(d>max)continue;
   if(!best||d<best.d||(d===best.d&&cc>best.cc*3)){best={cand,d,cc};tie=false;}
   else if(d===best.d&&cc*3>best.cc)tie=true;
  }
  if(!best||tie)return null;
  const target=vocab.shown(best.cand);
  // preserva a caixa da palavra original
  const out=word===word.toUpperCase()?target.toUpperCase():word[0]===word[0].toUpperCase()?target[0].toUpperCase()+target.slice(1).toLowerCase():target.toLowerCase();
  return {from:word,to:out,distance:best.d,occurrences:best.cc};
 }
 // Defeitos de digitação do título. Retorna o título corrigido e a lista de ajustes.
 function checkTitle(title,vocab,memo){
  if(memo&&memo.has(title))return memo.get(title);
  const changes=[];let fixed=title;
  const trimmed=fixed.replace(/\s{2,}/g,' ').replace(/\s+([,.;:])/g,'$1').trim();
  if(trimmed!==fixed){changes.push({kind:'espacos',from:fixed,to:trimmed,note:'Espaços duplicados, antes de pontuação ou nas extremidades.'});fixed=trimmed;}
  const dedup=fixed.replace(/\b([A-Za-zÀ-ÿ]{2,})\s+\1\b/gi,'$1');
  if(dedup!==fixed){changes.push({kind:'palavra-repetida',from:fixed,to:dedup,note:'Palavra repetida em sequência.'});fixed=dedup;}
  if(vocab){
   const swaps=[];
   fixed=fixed.replace(WORD,w=>{const s=suggestWord(w,vocab);if(s){swaps.push(s);return s.to;}return w;});
   for(const s of swaps)changes.push({kind:'ortografia',from:s.from,to:s.to,note:'"'+s.from+'" ocorre raramente na LD; "'+s.to+'" ocorre '+s.occurrences+' vezes (distância '+s.distance+').'});
  }
  const result={fixed,changes,changed:fixed!==title};
  if(memo)memo.set(title,result);
  return result;
 }
 function withNt(document,stripNt){
  const p=text(document).split('_');if(p.length<7)return '';
  const tag=p.slice(6).join('_');
  const next=stripNt?tag.replace(/^nt-/i,''):(/^nt-/i.test(tag)?tag:'nt-'+tag);
  return next===tag?'':[...p.slice(0,6),next].join('_');
 }
 function indexLdCodes(ldRecords){
  const byLen=new Map(),seen=new Set();
  for(const rec of ldRecords||[]){const d=text(rec.document);if(!d||seen.has(d))continue;seen.add(d);const l=byLen.get(d.length)||[];l.push(d);byLen.set(d.length,l);}
  return byLen;
 }
 // Códigos da LD a 1 caractere (troca) ou 1 transposição do código digitado.
 function nearLdCodes(document,byLen){
  const code=text(document),out=[];
  for(const cand of byLen.get(code.length)||[]){
   let diff=0,first=-1;
   for(let i=0;i<code.length&&diff<3;i++)if(code[i]!==cand[i]){if(first<0)first=i;diff++;}
   if(diff===1||(diff===2&&code[first]===cand[first+1]&&code[first+1]===cand[first]))out.push(cand);
   if(out.length>3)break;
  }
  return out;
 }
 // Pares de caracteres que se confundem ao digitar (O/0, I/1/L, S/5, B/8, Z/2).
 const CONFUSABLE=new Set(['O0','0O','I1','1I','L1','1L','S5','5S','B8','8B','Z2','2Z']);
 function confusableOnly(a,b){
  let diff=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]){diff++;if(!CONFUSABLE.has(a[i].toUpperCase()+b[i].toUpperCase()))return false;}
  return diff===1;
 }
 function closest(value,list,ratio){
  const n=norm(value);if(!n)return null;
  const max=Math.max(2,Math.floor(n.length*ratio));let best=null,tie=false;
  for(const item of list){const m=norm(item),d=editDistance(n,m,max);if(d>max)continue;if(!best||d<best.d){best={item,d};tie=false;}else if(d===best.d)tie=true;}
  return best&&!tie?best:null;
 }
 function prepare(context){
  const byDocument=new Map(),byFamilyCategory=new Map(),batches=new Map(),tags=new Map(),paths=new Map(),eaps=new Map(),ld=new Map();
  for(const h of context.history||[]){
   // Preserve narrowly scoped existing history while never generalizing an
   // unscoped record into a recurrent family rule.
   if(h.contract&&h.contract!==context.contract)continue;
   const exact=byDocument.get(h.document)||[];
   exact.push(h);byDocument.set(h.document,exact);
   if(h.contract!==context.contract)continue;
   const family=fiscalFamily(h.document);
   if(!family)continue;
   for(const issue of classifyComment(h.fiscalComment)){
    if(!FISCAL_FAMILY_CATEGORIES.has(issue.category))continue;
    const key=family+'|'+issue.category,list=byFamilyCategory.get(key)||[];
    list.push(h);byFamilyCategory.set(key,list);
   }
  }
  for(const r of context.records||[]){const k=JSON.stringify([r.document,r.revision||'',r.allocation||r.sourceFile||'']);batches.set(k,(batches.get(k)||0)+1);}
  for(const kind of ['appendix','li','scon'])for(const t of context.bases?.[kind]||[]) {const tag=text(t.tag||t.TAG);if(tag)tags.set(tag,{...t,kind});}
  for(const p of context.bases?.databook||[])paths.set(text(p.databook),p);
  for(const e of context.bases?.eap||[]){const code=text(e.code);if(!code)continue;const list=eaps.get(code)||[];list.push(e);eaps.set(code,list);}
  for(const r of context.ldRecords||[]){if(r.contract&&r.contract!==context.contract)continue;const list=ld.get(text(r.document))||[];list.push(r);ld.set(text(r.document),list);}
  // Preaggregate historical recurrence once per audit. Large allocations must not
  // repeatedly scan thousands of fiscal comments for every document.
  const recurringFamilies=new Map();
  for(const [key,entries] of byFamilyCategory){
   const distinct=new Map();
   for(const h of entries)if(h.document&&!distinct.has(h.document))distinct.set(h.document,h);
   if(distinct.size<3)continue;
   recurringFamilies.set(key,{
    distinctDocuments:distinct.size,
    samples:[...distinct.values()].slice(0,3).map(h=>({document:h.document,revision:h.revision,comment:h.fiscalComment,allocation:h.allocation,source:h.sourceFile,sourceVersion:h.sourceVersion||h.sourceHash||'',sheet:h.sourceSheet||h.ldSheet||'',row:h.sourceRow||'',returnedAt:h.returnedAt||''}))
   });
  }
  return {byDocument,byFamilyCategory:recurringFamilies,batches,tags,paths,eaps,ld,tree:buildTree(context.bases?.databook,context.versions?.databook),vocab:buildVocabulary(context.ldRecords),titleMemo:new Map(),ldCodes:indexLdCodes(context.ldRecords),workflows:(context.bases?.workflows||[]).map(w=>text(w.workflow)).filter(Boolean)};
 }

 // Compatibiliza um código documental longo com seu último ancestral cadastrado.
 // Opções múltiplas no mesmo ancestral são selecionadas pela disciplina do Workflow.
 function workflowDiscipline(workflow){
  const w=norm(workflow),label=w.match(/C\s*&\s*M\s*\/\s*([^/]+)$/)?.[1]||w.split('/').pop()||'';
  const hints=[['ELETRICA',/ELETRIC/],['TUBULACAO',/TUBULAC/],['INSTRUMENTACAO',/INSTRUMENT/],['ESTRUTURA METALICA',/ESTRUTURA METAL/],['CIVIL',/\bCIVIL\b/],['DINAMICOS',/DINAMIC/],['ESTATICOS',/ESTATIC/],['HVAC',/\bHVAC\b/],['TELECOM',/TELECOM/],['SEGURANCA',/SEGURANCA/],['FORNOS',/FORNOS/]];
  return hints.find(([,regex])=>regex.test(label))?.[0]||'';
 }
 function chooseEap(code,workflow,index){
  const parts=text(code).split('.');let matchedCode='',candidates=[];
  for(let len=parts.length;len>0;len--){const p=parts.slice(0,len).join('.');if(index.eaps.has(p)){matchedCode=p;candidates=index.eaps.get(p);break;}}
  if(!candidates.length)return {matchedCode:'',entry:null,candidates:[],ambiguous:false,discipline:''};
  const discipline=workflowDiscipline(workflow);
  if(candidates.length===1)return {matchedCode,entry:candidates[0],candidates,ambiguous:false,discipline};
  if(!discipline)return {matchedCode,entry:null,candidates,ambiguous:true,discipline};
  const selected=candidates.filter(item=>(item.levels||[]).some(level=>{const val=norm(level);return val.endsWith(discipline)||val.includes('.'+discipline);}));
  return selected.length===1?{matchedCode,entry:selected[0],candidates,ambiguous:false,discipline}:{matchedCode,entry:null,candidates,ambiguous:true,discipline};
 }
 function auditRecord(input,context,index=prepare(context)){
  if(!text(context.contract))throw Error('Contrato obrigatório.');
  if(input.contract&&input.contract!==context.contract)throw Error('Documento de outro contrato.');
  const r={...input,document:text(input.document),revision:text(input.revision),contract:context.contract},f=[],p=parts(r.document),add=(...a)=>f.push(finding(...a)),enforced=applicable(context);
  const invalidFields=new Set((r.sourceIssues||[]).map(x=>x.field));
  for(const issue of r.sourceIssues||[])add('SOURCE-CELL-UNREADABLE','history',issue.field,'Não foi possível conferir o valor recebido: '+issue.message+'. Corrija a leitura na origem e reimporte o arquivo.',[{file:r.sourceFile,sheet:r.sourceSheet,row:r.sourceRow,cell:issue.cell}],{source:'Leitura do arquivo de origem',origin:'Alocação',severity:'pending',technicalFailure:true});
  if(r.allocationIdentity==='unconfirmed'||r.allocationIdentity==='draft-confirmed')add('ALLOCATION-IDENTITY-UNCONFIRMED','history','allocation',r.allocationIdentity==='draft-confirmed'?'Entrada confirmada como rascunho sem numeração. A conferência não comprova a identificação de uma emissão final.':'O número da alocação não foi confirmado. Informe a identificação ou confirme o uso como rascunho.',[{file:r.sourceFile,sheet:r.sourceSheet}],{origin:'Alocação'});
  // Norma do código: ET-5290 (Grupo 7 com TAG, separado por _) ou N-1710. Em N-1710 só se auditam Data Book, níveis (EAP) e título.
  const kind=p?'ET':/^(?:[A-Z]-)?[A-Z]{2}-\d{4}\.\d{2}-/i.test(text(r.document))?'N-1710':'outro',isN1710=kind==='N-1710';
  if(r.rawDocument&&r.rawDocument!==r.document&&r.rawDocument.trim()===r.document)add('SOURCE-CODE-WHITESPACE','code','document','O código de origem contém espaços externos. Confira a fonte; o valor original foi preservado.',[{original:r.rawDocument,matchingKey:r.document}]);
  const originals=index.ld.get(r.document)||[],scoped=originals.filter(x=>sameLd({ld:r.ld,ldSheet:r.ldSheet},{ld:x.source||x.sourceFile||x.ld,ldSheet:x.sheet||x.sourceSheet||x.ldSheet}));
  const readable=scoped.filter(x=>!(x.sourceIssues||[]).some(issue=>['document','revision'].includes(issue.field)));
  const compatible=invalidFields.has('revision')||invalidFields.has('ld')||invalidFields.has('ldSheet')?[]:readable.filter(x=>!r.revision||text(x.revision)===r.revision);
  const originEvidence=items=>items.map(x=>({file:x.source||x.sourceFile||x.ld,sheet:x.sheet||x.sourceSheet||x.ldSheet,row:x.row||x.sourceRow,revision:text(x.revision)}));
  if(!index.ld.size)add('LD-BASE-MISSING','history','ld','Nenhuma LD de referência está disponível para confirmar este documento. Anexe a LD correspondente e execute novamente.',[{document:r.document,revision:r.revision}],{origin:'LD'});
  else if(!originals.length)add('DOCUMENT-NOT-IN-LD','history','ld','O código exato do documento não foi localizado nas LDs carregadas. Confira a origem correta; nenhum código semelhante foi associado automaticamente.',[{document:r.document,revision:r.revision,requestedLd:r.ld||'',requestedSheet:r.ldSheet||''}],{origin:'LD'});
  else if(!scoped.length)add('LD-INCOMPATIBLE','history','ld','O documento foi localizado, mas não na LD ou aba informada. Confirme a origem antes de usar os valores encontrados.',[{requestedLd:r.ld||'',requestedSheet:r.ldSheet||'',candidates:originEvidence(originals)}],{origin:'LD'});
  else if(!readable.length)add('LD-CELL-UNREADABLE','history','revision','As linhas da LD têm erro de leitura no código ou na revisão. Corrija as células indicadas e reimporte a referência.',scoped.map(x=>({...originEvidence([x])[0],issues:x.sourceIssues})),{origin:'LD',technicalFailure:true});
  else if(!compatible.length&&!invalidFields.has('revision')&&!invalidFields.has('ld')&&!invalidFields.has('ldSheet'))add(readable.some(x=>text(x.revision))?'REVISION-MISMATCH':'LD-REVISION-UNKNOWN','history','revision',readable.some(x=>text(x.revision))?'A revisão informada não foi localizada nas linhas compatíveis da LD. Confira se a LD precisa ser atualizada ou se a revisão da alocação está incorreta.':'A LD não informa uma revisão que permita confirmar a revisão recebida. Não foi presumida equivalência.',[{found:r.revision,references:originEvidence(scoped)}],{origin:'LD'});
  r.ldMatch={status:compatible.length===1?'matched':compatible.length>1?'ambiguous':!index.ld.size?'missing-base':!originals.length?'document-not-found':!scoped.length?'incompatible-source':'revision-unconfirmed',candidates:originEvidence(scoped),receivedRevision:r.revision};
  const source=compatible.length===1?compatible[0]:null,recommendations=[];
  if(!source)delete r.origin;
  if(source)for(const issue of source.sourceIssues||[])add('LD-CELL-UNREADABLE','history',issue.field,'Não foi possível ler um valor da LD: '+issue.message+'. Corrija a célula na referência e reimporte antes de validar este campo.',[{file:source.source||source.sourceFile,sheet:source.sheet||source.sourceSheet,row:source.row||source.sourceRow,cell:issue.cell}],{origin:'LD',technicalFailure:true});
  if(source){r.valueOrigins={...(r.valueOrigins||{})};for(const k of ['title','revision','discipline','workflow','eap','tag'])if(!text(r[k])&&!invalidFields.has(k)&&!(r.officialAllocation&&k==='workflow')){r[k]=text(source[k]);if(r[k])r.valueOrigins[k]={kind:'LD',received:'',file:source.source||source.sourceFile,sheet:source.sheet||source.sourceSheet,row:source.row||source.sourceRow};}r.ld=r.ld||text(source.source||source.sourceFile);r.ldSheet=r.ldSheet||text(source.sheet||source.sourceSheet);r.ldVersion=r.ldVersion||text(source.ldVersion);r.origin={revision:text(source.revision),file:source.source||source.sourceFile,sheet:source.sheet||source.sourceSheet,row:source.row||source.sourceRow,titleColumn:source.titleColumn||source.columns?.title||source.ldColumns?.find(c=>norm(c.header)==='TITULO')?.column};}
  // RA-02 — campo PREENCHIDO é comparado com a linha exata da LD (existir não basta). Quatro níveis, sempre com os dois valores e a origem:
  // igual → nada; igual só na forma (maiúsculas, acentos, espaços) ou EQUIVALENTE por regra explícita (sigla × nome da disciplina,
  // prefixo hierárquico da EAP) → sugestão; diferente → erro (título, TAG, disciplina, EAP) ou pendência a confirmar (Workflow, Data Book,
  // que podem ter sido reclassificados de propósito). Valor copiado da LD (campo vazio na alocação) não é comparado consigo mesmo.
  const DISCIPLINE_ALIAS={ELE:'ELETRICA',TUB:'TUBULACAO',HVAC:'HVAC',CVL:'CIVIL'};
  const equivalent={
   discipline:(a,b)=>{const x=norm(a),y=norm(b);return (DISCIPLINE_ALIAS[x]||x)===(DISCIPLINE_ALIAS[y]||y);},
   eap:(a,b)=>{const x=text(a),y=text(b);return x.startsWith(y+'.')||y.startsWith(x+'.');}
  };
  const compared=[['title','Título','title','error'],['tag','TAG','tag','error'],['discipline','Disciplina','scope','error'],['eap','EAP','hierarchy','error'],['workflow','Workflow','workflow','pending'],['databook','Caminho do Data Book','databook','pending']];
  if(source)for(const [k,label,category,severity] of compared){
   const mine=text(r[k]),theirs=text(source[k]);
   if(!mine||!theirs||mine===theirs||invalidFields.has(k)||r.valueOrigins?.[k]?.kind==='LD'||(k==='workflow'&&isN1710))continue;
   const same=norm(mine)===norm(theirs),semantic=!same&&equivalent[k]&&equivalent[k](mine,theirs),where={file:source.source||source.sourceFile,sheet:source.sheet||source.sourceSheet,row:source.row||source.sourceRow};
   const evidence=[{field:k,alocacao:mine,ld:theirs,comparacao:same?'igual na forma normalizada':semantic?'equivalente por regra explícita':'divergente',...where}];
   const id=k.toUpperCase();
   if(same)add('LD-'+id+'-FORMAT',category,k,label+' da alocação difere da LD só na forma (maiúsculas, acentos ou espaços). Confirme o padrão exigido antes de enviar.',evidence,{severity:'suggestion',origin:'LD exata'});
   else if(semantic)add('LD-'+id+'-SEMANTIC',category,k,label+' da alocação é equivalente ao da LD por regra explícita ('+(k==='discipline'?'sigla × nome da disciplina':'um código EAP contém o outro como prefixo hierárquico')+'), mas não é idêntico. Confirme se o nível de detalhe está correto.',evidence,{severity:'suggestion',origin:'LD exata'});
   else{
    add('LD-'+id+'-MISMATCH',category,k,label+' da alocação difere da linha exata da LD. Confirme qual valor está atualizado na origem antes de enviar; a LD é o primeiro documento contratual.',evidence,{severity,origin:'LD exata'});
    // Workflow e Data Book já geram proposta própria (modelo oficial, com a base ativa) mais abaixo; aqui não se duplica.
    if(!['workflow','databook'].includes(k))recommendations.push({field:k,before:mine,after:theirs,justification:label+' da linha exata da LD. Proposta, não correção: depende de confirmação na origem.',evidence:[JSON.stringify(where)],confidence:'media',proposal:true});
   }
  }
  // ET 7.1.7 — a TAG informada precisa ser a do Grupo 7 do código ("_" e "/" valem como "-"). Item nt- não tem TAG para comparar.
  if(kind==='ET'&&p&&text(r.tag)&&!/^nt-/i.test(p.tag)){
   const flat=v=>text(v).replace(/[_/]/g,'-').toUpperCase();
   if(flat(p.tag)!==flat(r.tag))add('TAG-GROUP7-MISMATCH','tag','tag','A TAG informada ('+text(r.tag)+') difere da TAG do Grupo 7 do código ('+p.tag+'). A ET exige a TAG exata da referência; confirme qual está errada, o código ou a TAG.',[{field:'tag',informada:text(r.tag),grupo7:p.tag,document:r.document}],{severity:'error',source:ET+' §7.1.7',origin:'Código do documento',normativeProof:enforced});
  }
  if(source&&r.officialAllocation){
   const reference={origin:'LD exata',file:source.source||source.sourceFile,sheet:source.sheet||source.sourceSheet,row:source.row||source.sourceRow,version:source.ldVersion||''};
   if(!isN1710&&text(source.workflow)&&text(source.workflow)!==text(r.workflow))recommendations.push({field:'workflow',before:text(r.workflow),after:text(source.workflow),justification:'Diferença de Workflow frente à linha exata da LD. Verifique a versão e a disciplina antes de aprovar.',evidence:[JSON.stringify(reference)],confidence:'fonte documental exata',humanReview:true});
   if(text(source.databook)&&text(source.databook)!==text(r.databook)&&index.paths.has(text(source.databook)))recommendations.push({field:'databook',before:text(r.databook),after:text(source.databook),justification:'Caminho da LD encontrado na base Data Book ativa. Confirme a adequação ao serviço antes de aprovar.',evidence:[JSON.stringify({...reference,databookVersion:context.versions?.databook})],confidence:'fonte documental exata',humanReview:true});
  }
  if(!originals.length&&index.ldCodes.size){
   const near=nearLdCodes(r.document,index.ldCodes);
   const likely=near.length===1?near:near.filter(c=>confusableOnly(r.document,c));
   if(near.length)add('CODE-TYPO-SUSPECT','code','document','O código não consta na LD, mas é quase idêntico a '+(near.length===1?'um código cadastrado':'mais de um código cadastrado')+'. Verifique erro de digitação'+(likely.length===1&&near.length>1?' (letra e número parecidos trocados).':'.'),[{digitado:r.document,semelhantes:near.slice(0,3)}],{severity:'pending',source:'Comparação do código com a LD carregada',origin:'Alocação',normativeProof:false,...(likely.length===1?{suggestion:{field:'document',before:r.document,after:likely[0]}}:{})});
  }
  if(compatible.length>1)add('LD-AMBIGUOUS','history','ld','Mais de uma linha da LD corresponde ao documento. Confirme a origem.',compatible.map(x=>({file:x.source,sheet:x.sheet,row:x.row})));
  if(!text(r.revision))add('REVISION-UNKNOWN','history','revision','Revisão não informada; não foi presumida revisão 0.',[{file:r.sourceFile,row:r.sourceRow}]);
  if(!text(r.title))add('TITLE-MISSING','title','title',r.officialAllocation?'O modelo oficial não contém título. Consulte a LD correspondente para validar o conteúdo.':'Título não disponível. Importe a LD para verificar.',[{file:r.sourceFile,row:r.sourceRow}]);
  if(text(r.title)){
   const check=checkTitle(r.title,index.vocab,index.titleMemo);
   if(check.changed){
    const spelling=check.changes.some(c=>c.kind==='ortografia');
    add(spelling?'TITLE-TYPO-SUSPECT':'TITLE-FORMAT','title','title',
     spelling?'Possível erro de digitação no título. Confira e, se confirmado, aplique o título sugerido na LD.':'O título tem defeito de formatação (espaços ou palavra repetida).',
     [{title:r.title,suggested:check.fixed,adjustments:check.changes.map(c=>c.note)}],
     {severity:spelling?'pending':'error',source:spelling?'Verificação ortográfica por similaridade com os títulos da LD':'Padronização do título',origin:'LD',normativeProof:false,suggestion:{field:'title',before:r.title,after:check.fixed}});
    recommendations.push({field:'title',before:r.title,after:check.fixed,justification:check.changes.map(c=>c.note).join(' '),evidence:[JSON.stringify({origem:'ortografia/formatação',ajustes:check.changes.map(c=>({de:c.from,para:c.to}))})],confidence:spelling?'similaridade com termos recorrentes da LD':'regra de formatação',humanReview:true});
   }
  }
   if(r.officialAllocation){
    if(!text(r.plannedDate))add('ALLOCATION-DATE-MISSING','history','plannedDate','A Data Prevista está vazia no modelo oficial.',[{file:r.sourceFile,row:r.sourceRow}],{origin:'Alocação'});
    if(!text(r.action))add('ALLOCATION-ACTION-MISSING','history','action','A ação da alocação está vazia.',[{file:r.sourceFile,row:r.sourceRow}],{origin:'Alocação'});
    if(!text(r.purpose))add('ALLOCATION-PURPOSE-MISSING','history','purpose','O Propósito de Emissão Original está vazio.',[{file:r.sourceFile,row:r.sourceRow}],{origin:'Alocação'});
   }
  if(!enforced&&!isN1710)add('ET-APPLICABILITY','code','document','Aplicabilidade e revisão da ET ainda não comprovadas para este contrato.',[],{origin:'Base normativa'});
  const catalogRApplicable=enforced&&context.applicability?.revision==='R';
  if(enforced&&!catalogRApplicable&&!isN1710)add('ET-REVISION-NEEDS-VALIDATION','code','document','A revisão aplicável da ET é '+context.applicability.revision+', mas o validador incorporado usa a revisão R. Não aplicar as regras da revisão R como não conformidades confirmadas.',[{source:ET,applicableRevision:context.applicability.revision,catalogRevision:'R',contract:context.contract}],{source:'Controle de aplicabilidade normativa',origin:'Base normativa',severity:'pending',normativeProof:false});
  if(context.validateDocument){
   const validation=context.validateDocument(r.document);
   for(const error of validation.errors||[]){
    const et=/^ET(?:-|_)/.test(String(error.code||''));
    if(et&&isN1710)continue; // regras da ET não se aplicam a documentos N-1710
    if(et&&enforced&&!catalogRApplicable)continue;
    const matched=(context.bases?.norms||[]).find(n=>n.source===error.source&&n.contract===context.contract&&n.applicabilityEvidence&&n.confirmed===true);
    const confirmed=et?catalogRApplicable:Boolean(matched);
    add('CATALOG-'+error.code,'code',error.field||'document',error.message,[{value:r.document,source:error.source,baseVersion:context.versions?.norms,applicability:matched?.applicabilityEvidence||context.applicability?.evidence||''}],{severity:confirmed?'error':'pending',source:error.source||'Catálogo normativo incorporado'});
   }
   if(validation.kind==='unknown')add('NORMATIVE-UNRECOGNIZED','code','document','Documento não reconhecido pelos validadores normativos incorporados.',[{value:r.document}]);
  }
  const n1710=text(r.document).match(/^(?:[A-Z]-)?[A-Z]{2}-\d{4}\.\d{2}-[0-9A-Z]{4,5}-[0-9A-Z]{3}-[A-Z0-9]{3}-([A-Z0-9]+)$/i);
  if(n1710&&!/^\d{3}$/.test(n1710[1])&&!(/^[1-9]\d{3}$/.test(n1710[1])))add('N1710-SEQUENCE','code','document','Confira o sequencial: três algarismos; quatro quando ultrapassar 999. Letras não compõem o sequencial numérico.',[{source:'N-1710 Rev. N',item:'6.7',value:n1710[1]}],{source:'N-1710 Rev. N §6.7',severity:'pending'});
  if(p){
   r.tag=r.tag||p.tag;r.eap=r.eap||p.eap;r.discipline=r.discipline||p.discipline;
   const reference={source:ET,revision:context.applicability?.revision||'',contract:context.contract,evidence:context.applicability?.evidence||''};
   const rule=(id,item,message)=>add(id,'code','document',message,[{...reference,item,value:p.tag}],{severity:catalogRApplicable?'error':'pending',source:ET+' '+item,origin:'LD'});
   if(/[çÇ?|!@#$%¨&*(),\s]/.test(p.tag))rule('ET-7172-CHARACTERS','7.1.7.2','Grupo 7 contém caractere proibido na ET.');
   const nonTagged=r.nonTagged===true||/^nt-/i.test(p.tag);
   if(nonTagged&&!p.tag.startsWith('nt-'))rule('ET-7173-NT','7.1.7.3','Item não tagueado: o Grupo 7 deve iniciar com nt- minúsculo.');
   if(nonTagged&&p.tag.includes('_'))rule('ET-7171-SEPARATOR','7.1.7.1','Confira a separação dos nomes do item não tagueado por hífen.');
   if(/^nt-/i.test(p.tag)&&index.tags.size){
    const stripped=p.tag.replace(/^nt-/i,''),exact=index.tags.get(stripped);
    const partial=exact?null:[...index.tags.keys()].filter(k=>k.length>=6&&(stripped===k||stripped.startsWith(k+'-'))).slice(0,3);
    const suggestion=withNt(r.document,true);
    if(exact)add('NT-PREFIX-IN-REFERENCE','tag','document','O código usa nt-, mas o TAG '+stripped+' consta no cadastro ('+(exact.kind||'referência')+'). Item cadastrado não deve levar nt-; remova o prefixo do Grupo 7.',[{tag:stripped,cadastro:exact.kind||'',versao:context.versions?.appendix||'',codigoSugerido:suggestion}],{severity:context.homologated?.appendix?'error':'pending',source:'Cadastro de TAGs × prefixo nt- (ET item 7.1.7.3)',origin:'Cadastro de TAGs / LD',normativeProof:false,suggestion:{field:'document',before:r.document,after:suggestion}});
    else if(partial&&partial.length)add('NT-PREFIX-PARTIAL-MATCH','tag','document','O código usa nt-, e parte dele coincide com TAG cadastrado ('+partial.join(', ')+'). Confira se o item é realmente não tagueado.',[{grupo7:p.tag,coincidencias:partial}],{severity:'suggestion',source:'Cadastro de TAGs × prefixo nt-',origin:'Cadastro de TAGs / LD',normativeProof:false});
   }
   if(!nonTagged){const tag=index.tags.get(p.tag);if(!tag){const suggestion=index.tags.size?withNt(r.document,false):'';add('TAG-NOT-PROVEN','tag','tag','TAG não comprovado nas referências carregadas.'+(suggestion?' Se o item não for tagueado, o Grupo 7 deve começar com nt- (código sugerido no detalhamento); caso contrário, confira o cadastro.':' Verifique outras fontes autorizadas.'),[{tag:p.tag,version:context.versions?.appendix,...(suggestion?{codigoSugerido:suggestion}:{})}],{origin:'Cadastro de TAGs / LD',...(suggestion?{suggestion:{field:'document',before:r.document,after:suggestion}}:{})});}}
   const codedUnit=norm(p.unit).replace(/-/g,''),destUnit=norm(r.databook).match(/\b(?:U-?32|U-?39S|SE-?3200)\b/)?.[0]?.replace(/-/g,'');
   if(destUnit&&codedUnit!==destUnit)add('UNIT-PATH-MISMATCH','databook','databook','A unidade do documento diverge da unidade explícita do caminho.',[{code:p.unit,path:r.databook}],{severity:'error',origin:'LD'});
   if(text(r.title)&&p.report==='RIR'&&!norm(r.title).startsWith('RELATORIO DE INSPECAO DE RECEBIMENTO'))add('RIR-TITLE-PRECEDENT','title','title','Confira a identificação de relatório de inspeção de recebimento no título.',[{title:r.title,report:p.report}],{severity:'suggestion',source:'Critério fiscal a confirmar'});
   if(p.report==='RIR'&&/BOBINA|CABO/.test(norm(p.tag+' '+r.title))){
    const missing=[];if(!/\b(?:KV|VOLT|TENSAO)\b|\d\s*[Kk][Vv]/.test(norm(r.title)))missing.push('classe de tensão');if(!/\d+(?:[.,]\d+)?\s*MM(?:2|²)?(?![A-Z])|\b(?:MM|MM2|MM²|SECAO|CONDUTOR|CONDUTORES|\d+C#)\b/.test(norm(r.title)))missing.push('configuração / seção');if(!/EPR|XLPE|PVC|FORMACAO|ISOLACAO|CONSTRUT/.test(norm(r.title)))missing.push('formação / características construtivas');
    if(missing.length)add('CABLE-DETAILS','title','title','Conferir '+missing.join(', ')+'. Não completar com características presumidas.',[{title:r.title,missing}],{severity:'suggestion',source:'Precedente fiscal para RIR de cabos'});
   }
  }else if(!/^\w+-\d{4}\.\d{2}-/.test(r.document))add('CODE-UNRECOGNIZED','code','document','Codificação não reconhecida pelo auditor. Requer conferência.',[{value:r.document}]);
  if(!index.paths.size)add('DATABOOK-BASE-MISSING','databook','databook','Base Data Book indisponível.',[],{origin:'Base Data Book'});
  else if(!text(r.databook))add('DATABOOK-MISSING','databook','databook','Caminho não informado.',[]);
  else if(!index.paths.has(r.databook)){const near=closest(r.databook,[...index.paths.keys()],0.04);add('DATABOOK-NOT-FOUND','databook','databook','Caminho completo não encontrado na versão carregada.'+(near?' Existe um caminho muito parecido; confira possível erro de digitação.':''),[{path:r.databook,version:context.versions?.databook,...(near?{caminhoSemelhante:near.item}:{})}],{severity:context.homologated?.databook?'error':'pending',...(near?{suggestion:{field:'databook',before:r.databook,after:near.item}}:{})});}
  else {const entry=index.paths.get(r.databook);if(entry.discipline&&norm(entry.discipline)!==norm(r.discipline))add('PATH-DISCIPLINE','databook','databook','Disciplina incompatível com a classificação explícita do caminho.',[{path:r.databook,discipline:r.discipline,expected:entry.discipline}],{severity:'error'});}
  if(!index.eaps.size)add('EAP-BASE-MISSING','hierarchy','eap','EAP contratual não disponível. Hierarquia oficial não foi inferida do histórico.',[],{origin:'EAP'});
  else {
    const selection=chooseEap(r.eap,r.workflow,index),e=selection.entry;
    r.eapMatch={requested:r.eap,matchedCode:selection.matchedCode,discipline:selection.discipline,candidates:selection.candidates.length,ambiguous:selection.ambiguous};
    if(!context.homologated?.eap)add('EAP-APPLICABILITY','hierarchy','eap','A hierarquia carregada não comprova a EAP contratual. Confirme o Anexo III — Apêndice A aplicável.',[{version:context.versions?.eap}],{origin:'EAP'});
    if(!selection.matchedCode)add('EAP-NOT-FOUND','hierarchy','eap','Nenhum prefixo do código EAP consta na base carregada.',[{eap:r.eap,version:context.versions?.eap}],{severity:'pending'});
    else if(selection.ambiguous)add('EAP-DISCIPLINE-AMBIGUOUS','hierarchy','eap','Há mais de uma hierarquia para o código EAP; o Workflow não selecionou uma disciplina única. Confira o Workflow e a fonte.',[{eap:r.eap,matchedCode:selection.matchedCode,workflow:r.workflow,discipline:selection.discipline,options:selection.candidates.map(c=>(c.levels||[]).filter(Boolean).slice(-1)[0])}],{severity:'pending'});
    else if(e&&Array.isArray(e.levels)&&Array.isArray(r.levels)){
      const differences=e.levels.map((expected,i)=>({index:i,expected:text(expected),actual:text(r.levels[i])})).filter(x=>x.expected&&x.actual!==x.expected);
      if(differences.length){
       add('EAP-LEVEL-MISMATCH','hierarchy','levels','Os níveis disponíveis na EAP não coincidem com a alocação. Níveis adicionais sem referência na base não foram considerados erro.',[{requested:r.eap,matchedCode:selection.matchedCode,workflow:r.workflow,differences,source:e.source,version:context.versions?.eap}],{severity:context.homologated?.eap?'error':'pending'});
       if(r.officialAllocation)for(const x of differences)if(x.index<6)recommendations.push({field:'N'+(x.index+1),before:x.actual,after:x.expected,justification:'Nível existente na EAP aplicável à disciplina do Workflow. Confirmar a evidência antes de aprovar.',evidence:[JSON.stringify({code:r.eap,matchedCode:selection.matchedCode,workflow:r.workflow,version:context.versions?.eap,source:e.source})],confidence:context.homologated?.eap?'EAP homologada':'Base EAP ativa; homologação pendente',humanReview:true});
      }
    }
   }
  // A Workflow/discipline discrepancy is a preventive warning, not a guessed correction.
  const alias={ELE:'ELETRICA',TUB:'TUBULACAO',HVAC:'HVAC',CVL:'CIVIL'};
  const workflowCategory=isN1710?'':workflowDiscipline(r.workflow);
  const documentCategory=alias[norm(r.discipline)]||'';
  if(workflowCategory&&documentCategory&&workflowCategory!==documentCategory){
   add('WORKFLOW-DISCIPLINE-CONFLICT','workflow','workflow','A disciplina identificada no Workflow diverge da disciplina explicitamente codificada. Confira a LD e a tabela aplicável antes do envio.',[{document:r.document,codeDiscipline:r.discipline,workflow:r.workflow,workflowDiscipline:workflowCategory,sourceFile:r.sourceFile,sourceSheet:r.sourceSheet,sourceRow:r.sourceRow}],{severity:context.homologated?.workflows?'pending':'suggestion',origin:'Workflow / LD',normativeProof:false});
  }
  const workflows=context.bases?.workflows||[];
  if(isN1710){/* Workflow não é auditado em N-1710 */}
  else if(!text(r.workflow))add('WORKFLOW-MISSING','workflow','workflow','Workflow não informado. Verifique a necessidade de definição.',[]);
  else if(workflows.length&&!workflows.some(w=>text(w.workflow)===r.workflow)){const near=closest(r.workflow,index.workflows,0.04);add('WORKFLOW-UNKNOWN','workflow','workflow','Workflow não localizado na referência carregada.'+(near?' Existe um Workflow muito parecido; confira possível erro de digitação.':''),[{workflow:r.workflow,...(near?{workflowSemelhante:near.item}:{})}],near?{suggestion:{field:'workflow',before:r.workflow,after:near.item}}:{});}
  const dup=JSON.stringify([input.document,input.revision||'',input.allocation||input.sourceFile||'']);
  if((index.batches.get(dup)||0)>1)add('DUPLICATE-IN-BATCH','history','document','Mesmo código e revisão aparecem mais de uma vez no mesmo lote. Confira antes de gerar.',[{allocation:r.allocation,file:r.sourceFile}],{severity:r.revision?'error':'pending'});
  const history=(index.byDocument.get(r.document)||[]).filter(h=>(!h.revision||!r.revision||h.revision===r.revision)&&sameLd(h,r));
  if(classifyComment(r.fiscalComment).length)add('FISCAL-CURRENT','history','fiscalComment','A planilha contém apontamento fiscal cujo atendimento precisa ser conferido.',[{comment:r.fiscalComment,decision:decision(r.fiscalComment,r.status),file:r.sourceFile,sheet:r.sourceSheet,row:r.sourceRow}],{source:'Retorno fiscal específico'});
  if(r.commentDataIssue)add('FISCAL-NON-TEXT','history','fiscalComment',r.commentDataIssue,[{value:r.fiscalCommentRaw,row:r.sourceRow}],{source:'Qualidade da fonte fiscal'});
  for(const h of history){
   const issues=classifyComment(h.fiscalComment);
   if(!issues.length)continue;
   // Only a demonstrably unchanged value makes the old comment a pending risk.
   // The presence of a historic rejection alone is never a fresh nonconformity.
   const unchanged=issues.some(issue=>['title','workflow','databook','tag','discipline'].includes(issue.field)&&text(h[issue.field])&&text(r[issue.field])&&norm(h[issue.field])===norm(r[issue.field]));
   add(unchanged?'FISCAL-UNCHANGED-PRECEDENT':'FISCAL-PRECEDENT','history','fiscalComment',
    unchanged?'Um valor citado em apontamento anterior permanece igual. Confira a correção antes do envio.':'Há apontamento histórico para esta ocorrência. Consulte a evidência anterior, sem presumir que a falha ainda existe.',
    [{comment:h.fiscalComment,decision:h.fiscalDecision,allocation:h.allocation,file:h.sourceFile,sourceVersion:h.sourceVersion||h.sourceHash||'',sheet:h.sourceSheet,row:h.sourceRow,date:h.returnedAt,revisionKnown:Boolean(h.revision),unchangedValue:unchanged}],
    {severity:unchanged?'pending':'suggestion',source:'Precedente fiscal específico (não normativo)',origin:'Histórico Fiscal 01',normativeProof:false});
  }
  const family=fiscalFamily(r.document);
  if(family&&index.byFamilyCategory){
   const categories=['title','code','tag','databook','hierarchy','workflow','scope'];
   for(const category of categories){
    if(isN1710&&!['title','databook','hierarchy'].includes(category))continue;
    const recurrence=index.byFamilyCategory.get(family+'|'+category);
    if(!recurrence)continue; // A single document resubmitted several times is not recurrence.
    add('FISCAL-FAMILY-'+category,'history','fiscalComment',
      'A Fiscal 01 apontou esta categoria em documentos distintos da mesma família técnica. Avalie a evidência específica antes do envio; a recorrência não comprova defeito nesta alocação.',
      [{family,category,distinctDocuments:recurrence.distinctDocuments,samples:recurrence.samples}],
      {severity:'suggestion',source:'Recorrência histórica Fiscal 01 (não normativa)',origin:'Precedentes da família',normativeProof:false,humanReview:true});
   }
  }
  // Referência ausente, não carregada ou não validada NUNCA vira conformidade: a verificação fica inconclusiva, com o motivo.
  let verification;
  if(context.references&&References){
   const v=References.verification({...r,docKind:kind},context.references);
   const groups=References.groupBlocks(v);
   // Um único apontamento por registro (não um por referência), para não afogar os problemas reais; o detalhe vai na evidência.
   if(groups.length)add('REF-BLOCKED','reference','document','Verificação incompleta: '+groups.length+' referência(s) sem o nível exigido, '+v.blocked.length+' regra(s) bloqueada(s). Referência necessária: '+groups.map(g=>g.reference+(g.revision&&g.revision!=='qualquer'?' (rev. '+g.revision+')':'')+' — '+g.needed).join('; ')+'. Estas verificações não foram feitas; ausência de apontamento nelas não significa conformidade.',groups.map(g=>({code:g.code,reference:g.reference,revision:g.revision,needed:g.needed,rules:g.rules,fields:g.fields})),{severity:'pending',source:'Catálogo de referências',origin:'Referências',normativeProof:false});
   // Verificação que só se sustenta num sinalizador (sem responsável/data) é dita; "nunca forçar flags" = não tratar sinalizador como demonstração.
   if(v.flagOnly.length)add('REF-FLAG-ONLY','reference','document','Esta verificação depende de sinalizador de homologação sem responsável e data ('+[...new Set(v.flagOnly.map(x=>x.name))].join('; ')+'). Registre a validação com evidência para demonstrar fonte, revisão e vigência.',v.flagOnly,{severity:'suggestion',source:'Catálogo de referências',origin:'Referências',normativeProof:false});
   verification={status:v.status,verified:v.verified,flagOnly:v.flagOnly.map(x=>x.rule),blocked:v.blocked.map(b=>({rule:b.rule,field:b.field,codes:b.blockers.map(x=>x.code),reference:b.reference})),catalog:context.references.fingerprint};
  }
  const status=f.some(x=>x.severity==='error')?'Correções pendentes':f.some(x=>x.severity==='pending')?'Verificações inconclusivas':f.some(x=>x.severity==='suggestion')?'Sugestões de melhoria':'Sem não conformidades detectadas';
  return {...r,docKind:kind,findings:f,recommendations,history,status,lineage:key(r),ruleVersion:VERSION,versions:context.versions||{},state:'Aberto',...(verification?{verification}:{})};
 }
 function compare(a,b){const changes=[],unknown=[];for(const k of ['document','revision','title','tag','discipline','eap','databook','levels','workflow']){if(a[k]==null||b[k]==null||a[k]===''||b[k]===''){unknown.push(k);continue;}if(JSON.stringify(a[k])!==JSON.stringify(b[k]))changes.push({field:k,before:a[k],after:b[k]});}return {changes,unknown,resolved:false};}
 function reviewEvent(row,{state,field,value,justification,evidence=[],decision='proposed'},actor){
  if(!STATES.includes(state)||!text(actor)||text(justification).length<5)throw Error('Estado, responsável e justificativa são obrigatórios.');
  if(['Resolvido com evidência','Corrigido na origem','Exceção justificada'].includes(state)&&!evidence.length)throw Error('Este estado exige evidência.');
  if(field&&!['title','databook','eap','tag','discipline','workflow','N1','N2','N3','N4','N5','N6'].includes(field))throw Error('Campo de correção inválido.');
  if(/^N[1-6]$/.test(field)&&!row.officialAllocation)throw Error('Edição direta de hierarquia requer o modelo oficial de alocação.');
  if(!['proposed','accepted','rejected','exception'].includes(decision))throw Error('Decisão inválida.');
  if(decision==='accepted'&&['databook','eap','tag','discipline','workflow','N1','N2','N3','N4','N5','N6'].includes(field)&&!evidence.some(x=>text(x)))throw Error('Alteração de classificação exige evidência.');
  return {document:row.document,revision:row.revision,lineage:row.lineage,state,decision,field:field||'',before:field?( /^N[1-6]$/.test(field)?text(row.levels?.[Number(field.slice(1))-1]):row[field]):'',after:value??'',justification,evidence,actor,at:new Date().toISOString(),humanReview:true};
 }
 function summary(rows){return {total:rows.length,errors:rows.filter(r=>r.findings.some(f=>f.severity==='error')).length,pending:rows.filter(r=>r.findings.some(f=>f.severity==='pending')).length,suggestions:rows.filter(r=>r.findings.some(f=>f.severity==='suggestion')).length,clear:rows.filter(r=>r.findings.length===0).length};}
 function approvedChanges(events){const latest=new Map();for(const e of events||[])if(e.field)latest.set(JSON.stringify([e.lineage,e.field]),e);return [...latest.values()].filter(e=>e.decision==='accepted');}
 function mergeHistory(existing,incoming){const out=existing.slice(),keys=new Set(out.map(h=>JSON.stringify([h.contract,h.sourceVersion||h.sourceHash||h.sourceFile,h.sourceSheet,h.sourceRow])));for(const h of incoming){const k=JSON.stringify([h.contract,h.sourceVersion||h.sourceHash||h.sourceFile,h.sourceSheet,h.sourceRow]);if(!keys.has(k)){keys.add(k);out.push(h);}}return out;}
 function catalogComments(history){const groups=new Map();for(const r of history||[]){if(!text(r.fiscalComment))continue;const k=norm(r.fiscalComment),g=groups.get(k)||{id:'comment:'+groups.size,originals:[],occurrences:[],findings:classifyComment(r.fiscalComment)};
  if(!g.originals.includes(r.fiscalComment))g.originals.push(r.fiscalComment);
  g.occurrences.push({document:r.document,revision:r.revision,contract:r.contract,ld:r.ld,ldSheet:r.ldSheet,ldVersion:r.ldVersion,allocation:r.allocation,date:r.returnedAt,decision:r.fiscalDecision,file:r.sourceFile,sheet:r.sourceSheet,row:r.sourceRow});groups.set(k,g);}
  return [...groups.values()].map(g=>({...g,learning:g.findings.length&&new Set(g.occurrences.map(o=>o.document)).size>=3?'criterio-fiscal-recorrente':g.findings.length?'precedente-especifico':'avaliacao-sem-apontamento',normativeProof:false,humanReview:true}));
 }
 function splitGroup(r){let h=2166136261;for(const c of text(r.contract)+'|'+text(r.document))h=Math.imul(h^c.charCodeAt(0),16777619);const n=(h>>>0)%10;return n<6?'development':n<8?'validation':'holdout';}
 return {VERSION,editDistance,checkTitle,withNt,ET,RULES,STATES,TAXONOMY:TAXONOMY.map(([id,label])=>({id,label})),text,norm,key,parts,ldIdentity,sameLd,classifyComment,decision,headerMap,parseRows,parseWorksheet,cellSnapshot,applicable,buildTree,prepare,chooseEap,workflowDiscipline,auditRecord,compare,reviewEvent,summary,approvedChanges,mergeHistory,catalogComments,splitGroup};
});
