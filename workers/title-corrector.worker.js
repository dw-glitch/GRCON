'use strict';
// Auditor de títulos: os arquivos e as bases são processados no próprio navegador.
importScripts('../xlsx.full.min.js','../jszip.min.js','title-corrector-reports.js',
  '../vendor/recon/recon_contracts.js','../vendor/recon/core.js',
  '../vendor/recon/ld_conflicts.js','../vendor/recon/allocation_confirmation_sources.js',
  '../vendor/recon/non_tagged_title_rules.js','../vendor/recon/allocation_core.js',
  '../vendor/recon/databook_allocation_sources.js',
  '../vendor/recon/document_title_standard.js','../vendor/recon/document_title_standard_r.js',
  '../vendor/recon/global_tag_title_core.js','../vendor/recon/audit_core.js',
  '../vendor/recon/ld_preservation.js','../vendor/recon/ld_title_writer.js',
  '../vendor/recon/offline_resources.js','../vendor/recon/offline_recon_audit_bases.js',
  '../vendor/recon/tag_reference_catalog.js','../vendor/recon/valve_list_catalog.js',
  '../vendor/recon/valve_reparo_catalog.js','../vendor/recon/scon_escopo_title_catalog.js',
  '../vendor/recon/scon_andaime.js',
  '../vendor/recon/scon_apoio.js',
  '../vendor/recon/scon_canteiro.js',
  '../vendor/recon/scon_civil.js',
  '../vendor/recon/scon_eletrica.js',
  '../vendor/recon/scon_eqp_dinamico.js',
  '../vendor/recon/scon_eqp_estatico.js',
  '../vendor/recon/scon_est_metalica.js',
  '../vendor/recon/scon_hvac.js',
  '../vendor/recon/scon_instrumentacao.js',
  '../vendor/recon/scon_loa.js',
  '../vendor/recon/scon_recursos_etf.js',
  '../vendor/recon/scon_seguranca.js',
  '../vendor/recon/scon_tubulacao.js');
const C=self.RECONTriagemCore,A=self.RECONAuditCore;
let original=null,originalName='',report=[];
let multiFiles=new Map();let batchMode=false;
const clean=x=>String(x==null?'':x).trim();
const normal=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
const reading=bytes=>XLSX.read(bytes,{type:'array',cellDates:true,cellFormula:true,bookVBA:true});
const mapRows=rows=>new Map((rows||[]).map(row=>[String(row.id),row]));
const addUnique=(list,value)=>{if(value&&!list.some(v=>normal(v)===normal(value)))list.push(value);};
function referenceWorkbook(bytes){return A.parseTitleReferenceWorkbook(reading(bytes),XLSX);}
function merge(base,extras){
  const result={entries:[...(base?.entries||[]),...(extras?.entries||[])],byDocument:new Map(base?.byDocument||[]),byTagDiscipline:new Map(base?.byTagDiscipline||[])};
  for(const [key,value] of extras?.byDocument||[])if(!result.byDocument.has(key))result.byDocument.set(key,value);
  for(const [key,values] of extras?.byTagDiscipline||[])result.byTagDiscipline.set(key,[...(result.byTagDiscipline.get(key)||[]),...values]);
  const chunks=Object.values(self.RECON_SCON_CHUNKS||{}).filter(chunk=>Array.isArray(chunk.rows));
  const columns=['document','titleComplement','fullDescription','sconTag','discipline','itemType','drawingReference','row'];
  const embedded=A.parseSconTitleCatalog({columns,rows:chunks.flatMap(chunk=>chunk.rows),sourceFile:'SCON - COMPONENTES E PROGRAMAÇÃO 2 (1).xlsx',sheet:'EXTRATO_COMPONENTES + PROGRAMACAO'});
  const uploaded=extras?.scon?.entries?.length?extras.scon:base?.scon;
  result.scon=uploaded?.entries?.length
    ? A.buildSconReferenceIndex([...embedded.entries,...uploaded.entries],{sourceFile:'SCON controlada + base complementar',sheet:'FONTES COMBINADAS'})
    : embedded;
  result.tagReference=A.parseTagReferenceCatalog(self.RECONTagReferenceCatalog);
  result.valveList=A.parseValveListCatalog(self.RECONValveListCatalog);
  result.valveReparo=A.parseValveReparoCatalog(self.RECONValveReparoCatalog);
  result.sconEscopo=A.parseSconEscopoTitleCatalog(self.RECONSconEscopoTitleCatalog);
  return result;
}
function areaFor(row,refs){
  if(row.sconEscopoMatch!=='SIM'||!row.sconEscopoEapMatched||row.sconEscopoEapFallback||row.sconEscopoTagFallback)return null;
  const target=clean(row.tag||row.sconEscopoLookupTag);
  const eap=normal(row.sconEscopoDocumentEap).replace(/\s/g,'');
  if(!target||!eap)return null;
  const matches=(refs.sconEscopo.byExactTag.get(target.toUpperCase())||[])
    .filter(entry=>normal(entry.eap).replace(/\s/g,'')===eap&&clean(entry.area));
  const names=[...new Set(matches.map(entry=>normal(entry.area)))];
  if(names.length!==1)return null;
  return {value:names[0],source:refs.sconEscopo.sourceFile||'SCON ESCOPO',reference:'TAG '+target+' / EAP '+eap};
}
function titleWithArea(row,where){
  const title=clean(row.proposed),area='AREA '+where.value;
  if(!title||normal(title).includes(normal(area))||normal(title).includes(normal(where.value)))return title;
  const tag=clean(row.tag);
  if(tag&&title.endsWith(' - '+tag))return title.slice(0,-(' - '+tag).length)+' - '+area+' - '+tag;
  return title+' - '+area;
}
// Regra: a TAG do código fica SEMPRE no final do título, no modelo "TÍTULO - TAG". Só muda a posição da TAG (copiada literalmente do código);
// o restante do texto não é reescrito. Documentos sem TAG (nt-, CV) não entram.
const escapeRegex=x=>String(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function endsWithTag(title,tag){
  const text=clean(title),needle=clean(tag);
  if(!needle)return true;
  return new RegExp('(?:^|\\s)[-–—]\\s+'+escapeRegex(needle)+'$','i').test(text);
}
function stripTag(title,tag){
  const text=clean(title),needle=clean(tag);
  if(!text||!needle)return text;
  const found=new RegExp('(^|[^A-Za-z0-9])(?:TAG\\s*[:\\-]?\\s*)?'+escapeRegex(needle)+'(?![A-Za-z0-9])','gi');
  return text.replace(found,(match,before)=>/[(\[]/.test(before)?before:' ')
    .replace(/\(\s*\)|\[\s*\]/g,' ')
    .replace(/\s+/g,' ')
    .replace(/(?:\s[-–—]\s*){2,}/g,' - ')
    .replace(/^\s*[-–—:]\s*|\s*[-–—:]\s*$/g,'')
    .trim();
}
function tagAtEnd(title,tag){
  const text=clean(title),needle=clean(tag);
  if(!text||!needle||endsWithTag(text,needle))return text;
  const body=stripTag(text,needle);
  return body?body+' - '+needle:text;
}
// REUNIDOR de informações: o título atual da LD e o título montado a partir das bases oficiais são JUNTADOS; nada que o título atual
// já diz é descartado. Há julgamento de qual é o esqueleto:
//  · título atual RICO (traz muito mais do que as bases) → ele é mantido por inteiro e o que as bases acrescentam entra antes da TAG;
//  · título atual POBRE ou genérico → o título das bases é o esqueleto e o que o atual diz a mais é anexado;
//  · bases em conflito entre si → o título atual é sempre mantido por inteiro (nada se perde) e a linha segue para revisão.
// Identificadores técnicos que não pertencem ao código do documento (outra TAG) nunca são incorporados; trecho do título atual que
// CONTRADIZ as bases (ex.: "VALVULA AUTOMATICA" × "VALVULA MANUAL") não é recolhido. A TAG do código sempre fecha o título.
const STOPWORDS=new Set(['DE','DA','DO','DAS','DOS','E','EM','NA','NO','NAS','NOS','A','O','AS','OS','PARA','POR','COM','SEM','AO','AOS']);
const TECH_ID=/^[A-Z0-9]{1,4}(?:-[A-Z])?-[A-Z0-9][A-Z0-9._/-]{2,}$/;
const tokenKey=token=>normal(token).replace(/[^A-Z0-9]/g,'');
const stemKey=key=>key.length>3&&key.endsWith('S')?key.slice(0,-1):key;
function coverageIndex(text){return clean(text).split(/\s+/).map(token=>stemKey(tokenKey(token))).filter(Boolean);}
function isCovered(keys,token){
  const key=stemKey(tokenKey(token));
  if(!key)return true;
  return keys.some(other=>other===key||(key.length>=3&&other.length>=3&&(other.startsWith(key)||key.startsWith(other))));
}
function significantTokens(text,tag){
  const own=tag?tokenKey(tag):'';
  return clean(text).split(/\s+/).filter(token=>{const key=tokenKey(token);return key&&!STOPWORDS.has(key)&&key!==own;});
}
// Trecho só de palavras, colado a uma palavra já coberta (no máximo com "DE" entre elas), em que as bases trazem OUTRA palavra no mesmo lugar.
function contradictsProposal(tokens,spanStart,proposal){
  const span=tokens.slice(spanStart).filter(Boolean);
  const first=stemKey(tokenKey(span[0]||''));
  if(!first||span.some(token=>/\d/.test(token)))return false;
  let at=spanStart-1,between=[];
  while(at>=0&&STOPWORDS.has(tokenKey(tokens[at]))){between.unshift(tokenKey(tokens[at]));at--;}
  if(at<0||between.some(word=>word!=='DE'))return false;
  const anchor=stemKey(tokenKey(tokens[at]));
  if(!anchor)return false;
  const list=clean(proposal).split(/\s+/).map(token=>stemKey(tokenKey(token))).filter(Boolean);
  for(let i=0;i<list.length-1;i++){
    if(list[i]!==anchor)continue;
    let next=i+1;
    while(next<list.length&&STOPWORDS.has(list[next]))next++;
    if(next<list.length&&list[next]!==first&&!(list[next].startsWith(first)||first.startsWith(list[next])))return true;
  }
  return false;
}
// Identificador do próprio código do documento (inclusive abreviado: R-32003/503-EL.37.015 dentro de …R-32003-R-32503-EL.37.015) não é "outra TAG".
function ownIdentifier(bare,docKey){
  const parts=bare.split(/[-/.]/).filter(part=>part.length>=3);
  return Boolean(docKey)&&parts.length>0&&parts.every(part=>docKey.includes(tokenKey(part)));
}
function hasForeignIdentifier(span,tag,docKey){
  return span.split(/\s+/).some(token=>{
    const bare=token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g,'').toUpperCase();
    return TECH_ID.test(bare)&&!/^NT-/.test(bare)&&bare!==clean(tag).toUpperCase()&&!ownIdentifier(bare,docKey);
  });
}
// O que `source` diz e `against` não cobre. wholeSegment: segmento das bases com muita informação nova entra por inteiro.
function extractExtras(source,against,options){
  const {tag,docKey,foreign,wholeSegment}=options;
  const keys=coverageIndex(against),extras=[],skipped=[],contradicted=[];
  for(const segment of clean(source).split(/\s+[-–—]\s+/)){
    const tokens=segment.replace(/\bTAG\b\s*[:\-]?\s*/gi,' ').split(/\s+/).filter(Boolean);
    const meaningful=tokens.map((token,index)=>({token,index,key:tokenKey(token)}))
      .filter(item=>item.key&&!STOPWORDS.has(item.key)&&!(tag&&item.key===tokenKey(tag))&&!isCovered(keys,item.token));
    if(!meaningful.length)continue;
    const signif=significantTokens(segment,tag).length;
    const coveredShare=signif?1-meaningful.length/signif:0;
    const whole=wholeSegment&&coveredShare<0.7;
    const startIndex=whole?0:meaningful[0].index,endIndex=whole?tokens.length-1:meaningful[meaningful.length-1].index;
    const span=tokens.slice(startIndex,endIndex+1).join(' ').replace(/^[\s,;:()\[\]-]+|[\s,;:()\[\]-]+$/g,'');
    if(!span)continue;
    if(foreign&&hasForeignIdentifier(span,tag,docKey)){skipped.push(span);continue;}
    if(foreign&&contradictsProposal(tokens,meaningful[0].index,against)){contradicted.push(span);continue;}
    if(!extras.some(item=>normal(item)===normal(span)))extras.push(span);
  }
  return {extras,skipped,contradicted};
}
function mergeCurrentInfo(row,base,conflict){
  const tag=clean(row.titleTag),current=clean(row.current),proposal=clean(base);
  if(!current||!proposal)return null;
  const curBody=stripTag(current,tag),recBody=stripTag(proposal,tag);
  if(!curBody||!recBody||normal(curBody)===normal(recBody))return null;
  const docKey=normal(row.document).replace(/[^A-Z0-9]/g,'');
  const fromCurrent=extractExtras(curBody,recBody,{tag,docKey,foreign:true});
  const significant=significantTokens(curBody,tag),keys=coverageIndex(recBody);
  const uncovered=significant.filter(token=>!isCovered(keys,token)).length;
  const rich=significant.length>=6&&uncovered>=5&&uncovered/significant.length>=0.5;
  const keepCurrent=rich||(conflict&&uncovered>0);
  if(keepCurrent){
    // Esqueleto = título atual da LD, por inteiro. As bases entram: tipo documental (se faltar) na frente; o resto, antes da TAG.
    const recSegments=recBody.split(/\s+[-–—]\s+/);
    let front='',rest=recSegments;
    if(recSegments.length>1){
      const head=significantTokens(recSegments[0],tag),curKeys=coverageIndex(curBody);
      const missing=head.filter(token=>!isCovered(curKeys,token)).length;
      if(head.length&&missing/head.length>=0.5){front=recSegments[0];rest=recSegments.slice(1);}
    }
    const addition=extractExtras(rest.join(' - '),curBody+' '+front,{tag,docKey,foreign:false,wholeSegment:true});
    const parts=[front,curBody,...addition.extras].filter(Boolean);
    return {mode:'atual',title:parts.join(' - '),extras:[...(front?[front]:[]),...addition.extras],skipped:fromCurrent.skipped,contradicted:[]};
  }
  const keep=fromCurrent.extras;
  if(!keep.length&&!fromCurrent.skipped.length&&!fromCurrent.contradicted.length)return null;
  return {mode:'bases',title:keep.length?recBody+' - '+keep.join(' - '):base,extras:keep,skipped:fromCurrent.skipped,contradicted:fromCurrent.contradicted};
}
function enforceTagAtEnd(row,suggested){
  const tag=clean(row.titleTag);
  const isCv=normal(row.sheet)==='CV'||/-C1O-CV-/.test(normal(row.document));
  const base=clean(suggested)||(row.issue==='ok'?clean(row.current):'');
  if(!tag||isCv||!base||endsWithTag(base,tag))return {title:suggested,issue:row.issue,reason:row.reason,classification:row.classification};
  const fixed=tagAtEnd(base,tag);
  if(!fixed||fixed===base)return {title:suggested,issue:row.issue,reason:row.reason,classification:row.classification};
  return row.issue==='ok'
    ?{title:fixed,issue:'tag_position',reason:'A TAG '+tag+' deve ficar no final do título, no modelo "TÍTULO - '+tag+'"',classification:'suggestion'}
    :{title:fixed,issue:row.issue,reason:endsWithTag(row.current,tag)?row.reason:(row.reason?row.reason+'; ':'')+'a TAG '+tag+' foi colocada no final do título',classification:row.classification};
}
// NOME DO RELATÓRIO (Grupo 6) conforme a ET, Tabela 13: o título SEMPRE começa com o nome oficial do relatório (com acentos, em caixa alta),
// consultado pelo código do documento. Se o título da LD traz uma variante (singular/plural, truncado, com erro de digitação) ela é identificada,
// dita na justificativa e corrigida; se não traz, o nome oficial é colocado na frente. Sigla do Grupo 6 ("RIR - ") antes do nome é redundante e sai.
const editDistance=(a,b)=>{const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let prev=Array.from({length:n+1},(_,i)=>i);for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}return prev[n];};
function sameWord(a,b){
  const x=stemKey(tokenKey(a)),y=stemKey(tokenKey(b));
  if(!x||!y)return false;
  if(x===y)return true;
  const limit=Math.max(x.length,y.length)>=9?2:Math.max(x.length,y.length)>=5?1:0;
  return limit>0&&editDistance(x,y)<=limit;
}
const SEPARATOR_TOKEN=/^[-–—\\/:|]+$/;
function reportNameParts(title,standard,sigla){
  const tokens=clean(title).split(/\s+/).filter(Boolean);
  let dropped='';
  if(sigla&&tokens.length>2&&tokenKey(tokens[0])===tokenKey(sigla)&&SEPARATOR_TOKEN.test(tokens[1])){dropped=tokens[0];tokens.splice(0,2);}
  const std=clean(standard).toLocaleUpperCase('pt-BR').split(/\s+/).filter(Boolean);
  const significant=std.filter(token=>!STOPWORDS.has(tokenKey(token))).length;
  let at=0,matched=0;
  for(const word of std){
    const stop=STOPWORDS.has(tokenKey(word));
    if(at<tokens.length&&sameWord(tokens[at],word)){at++;if(!stop)matched++;}
    else if(stop)continue;
    else break;
  }
  // Variante do nome: quase todas as palavras casam, ou o nome está TRUNCADO (casou o começo e o título passa a outro trecho/separador).
  const truncated=matched>=2&&(at>=tokens.length||SEPARATOR_TOKEN.test(tokens[at]));
  const found=significant>0&&(matched>=Math.ceil(significant*0.75)||truncated);
  return {tokens,dropped,std,significant,matched,found,consumed:found?tokens.slice(0,at):[]};
}
function reportNameFix(row,title){
  const standard=clean(row.titleStandard),text=clean(title);
  const isCv=normal(row.sheet)==='CV'||/-C1O-CV-/.test(normal(row.document));
  if(!standard||!text||isCv||row.titleStandardAmbiguous)return null;
  const official=standard.toLocaleUpperCase('pt-BR');
  const parts=reportNameParts(text,standard,row.titleStandardCode);
  if(parts.found){
    const phrase=parts.consumed.join(' ');
    const rest=parts.tokens.slice(parts.consumed.length);
    const exact=phrase===official;
    const sameWords=normal(phrase)===normal(official);
    const tail=rest.length?(SEPARATOR_TOKEN.test(rest[0])?' ':' - ')+rest.join(' '):'';
    return {title:exact&&!parts.dropped?text:official+tail,official,found:phrase,wrong:!sameWords,exact,dropped:parts.dropped};
  }
  return {title:official+' - '+parts.tokens.join(' '),official,found:'',wrong:true,exact:false,missing:true,dropped:parts.dropped};
}
// Documento "nt-" (Grupo 7 = NT-…) não tem TAG: nenhuma regra de TAG no final se aplica a ele.
const declaresNonTag=document=>/(?:^|[_-])NT(?:[-/_.]|$)/.test(normal(document));
// Em documento "nt-", o "nt-" não faz parte da TAG: a TAG do final do título é o Grupo 7 SEM o prefixo (…_nt-EMT-R-32003 → "EMT-R-32003").
function nonTaggedCodeTag(document){
  const raw=clean(document).replace(/\.(?:PDF|DOCX?|XLSX?|XLSM|DWG|DGN|PPTX?)$/i,'');
  const group7=raw.split('_').pop()||'';
  const match=/^nt-(.+)$/i.exec(group7);
  return match?clean(match[1]):'';
}
function shape(source,refs){
  const row=declaresNonTag(source.document)?{...source,titleTag:nonTaggedCodeTag(source.document)}:source;
  const area=areaFor(row,refs);
  const facts=[];
  if(row.titleStandard)facts.push({field:'tipo',value:row.titleStandard,source:row.titleStandardSource||'ET Rev. R',verified:true});
  const what=clean(row.valveTitle||row.sconTitleComplement||row.appendixTitle||row.globalTagTitle||row.nonTaggedWhat||row.sconEscopoTitle);
  if(what)facts.push({field:'objeto',value:what,source:row.descriptionSource||row.nonTaggedSource||'Base documental',verified:row.confidence==='alta'});
  if(area)facts.push({field:'localizacao',value:'AREA '+area.value,source:area.source,reference:area.reference,verified:true});
  const purpose=clean(row.titleStandard||row.titlePrefix);
  if(purpose)facts.push({field:'finalidade_documental',value:purpose,source:row.titleStandardSource||'Tipo documental',verified:Boolean(row.titleStandard)});
  const eap=clean(row.sconEscopoDocumentEap);
  if(eap)facts.push({field:'eap_classificacao',value:eap,source:'Grupo 4 / SCON',verified:true});
  const unsafe=Boolean(row.ldConflict?.hasConflict||row.issue==='conflict'||row.valveCancelled&&!row.valveFromReparoMap||
    row.globalTagConflict||row.sconMatch==='AMBÍGUO'||row.sconEscopoMatch==='AMBÍGUO'||row.titleStandardAmbiguous||
    row.sconEscopoEapFallback||row.sconEscopoTagFallback);
  const safeArea=area&&!unsafe?area:null;
  const withArea=safeArea?titleWithArea(row,safeArea):clean(row.proposed);
  const gathered=mergeCurrentInfo(row,withArea,unsafe);
  if(gathered?.mode==='bases'&&gathered.extras.length)facts.push({field:'informacao_adicional',value:gathered.extras.join(' · '),source:'Título atual da LD (informação que as bases não trazem)',verified:false});
  if(gathered?.mode==='atual'&&gathered.extras.length)facts.push({field:'informacao_bases',value:gathered.extras.join(' · '),source:row.descriptionSource||row.nonTaggedSource||'Bases oficiais',verified:!unsafe});
  const merged=gathered?gathered.title:withArea;
  // O nome do relatório da LD é conferido SEMPRE contra a ET; a recomendação começa com o nome oficial.
  const currentReport=reportNameFix(row,clean(row.current));
  const reportBase=merged||(currentReport&&currentReport.wrong?clean(row.current):'');
  const reported=reportBase?reportNameFix(row,reportBase):null;
  const withReport=reported&&(reported.wrong||merged)?reported.title:merged;
  const tagged=enforceTagAtEnd(row,withReport),suggested=tagged.title;
  if(currentReport&&currentReport.wrong){
    const was=currentReport.missing?'o título da LD não começa com o nome do relatório':'o nome do relatório no título da LD ("'+currentReport.found+'") não segue a ET';
    tagged.reason=(tagged.reason?tagged.reason+'; ':'')+was+': deve começar com "'+currentReport.official+'" (ET, Tabela 13)';
    if(['ok','description_mismatch','generic','format','tag_position'].includes(tagged.issue))tagged.issue='document_type';
    if(tagged.classification==='ok'||!tagged.classification)tagged.classification='confirmed_error';
  }
  if(reported?.dropped)tagged.reason=(tagged.reason?tagged.reason+'; ':'')+'a sigla "'+reported.dropped+'" antes do nome do relatório foi retirada (o nome oficial já a representa)';
  const note=text=>{tagged.reason=(tagged.reason?tagged.reason+'; ':'')+text;};
  if(gathered?.mode==='atual')note(gathered.extras.length?'título atual da LD mantido por inteiro e informação das bases acrescentada: '+gathered.extras.join(' · '):'título atual da LD mantido por inteiro');
  if(gathered?.mode==='bases'&&gathered.extras.length)note('informação adicional do título atual da LD mantida: '+gathered.extras.join(' · '));
  if(gathered?.skipped?.length)note('trecho com identificador diferente da TAG do código não foi incorporado: '+gathered.skipped.join(' · '));
  if(gathered?.contradicted?.length)note('trecho do título atual que contradiz as bases não foi incorporado: '+gathered.contradicted.join(' · '));
  return {id:String(row.id),document:row.document,sheet:row.sheet,row:row.row,discipline:row.discipline||'',
    current:clean(row.current),proposed:suggested,originalProposed:suggested,issue:tagged.issue,
    reason:tagged.reason||'',confidence:unsafe?'baixa':row.confidence||'nenhuma',
    classification:unsafe?'manual_review':tagged.classification||'suggestion',tag:row.tag||'',endTag:clean(row.titleTag),
    descriptionSource:row.descriptionSource||'',facts,hasConflict:unsafe,
    sourceRows:{valve:row.valveSourcePages||[],scon:row.sconSourceRows||[],appendix:row.appendixSourceRows||[],escopo:row.sconEscopoSourceRows||[]},
    evidenceSummary:row.descriptionSource||'Sem descrição confirmada',reviewRequired:unsafe||!suggested||row.confidence==='baixa',
    decision:'pending'};
}
async function analyze(input){
  if(!/\.(xlsx|xlsm)$/i.test(input.name||''))throw Error('A LD precisa estar em XLSX ou XLSM.');
  original=input.bytes;originalName=input.name; report=[];
  const book=reading(original);
  const parsed=C.parseWorkbook(book,input.name,Date.now());
  if(!parsed.records?.length)throw Error('A LD não contém registros técnicos reconhecidos. Confira os cabeçalhos e as abas.');
  const index=C.buildIndex(parsed.records,parsed.history||[]);
  const bundled=referenceWorkbook(self.RECONOfflineResources.arrayBuffer('Analise_descricoes_Planilha1.xlsx'));
  const supplemental=input.referenceBytes?referenceWorkbook(input.referenceBytes):null;
  const refs=merge(bundled,supplemental);
  let codes=null,unmatched=[];
  if(input.codes&&input.codes.length){
    const requested=new Set(input.codes.map(code=>C.key(code)).filter(Boolean));
    const found=new Set(index.documents.map(item=>item.documentKey));
    unmatched=[...requested].filter(code=>!found.has(code));
    codes=new Set([...requested].filter(code=>found.has(code)));
  }
  const audited=A.auditTitles(index,refs,{titleSourceMode:input.sourceMode||'auto',...(codes?{documentKeys:codes}:{})});
  report=audited.map(row=>shape(row,refs));
  return {rows:report,coverage:parsed.coverage||null,unmatched,sourceCounts:{
    controlled:bundled.entries.length,supplemental:supplemental?.entries.length||0,
    scon:refs.scon?.entries?.length||0,appendix:refs.tagReference?.entries?.length||0,
    valve:refs.valveList?.activeTagCount||0,escopo:refs.sconEscopo?.entries?.length||0},
    standard:'ET-5290.00-22000-912-1LV-001 Rev. R'};
}
function hasExactTitleTag(title,tag){
 const hay=clean(title).toUpperCase(),needle=clean(tag).toUpperCase();
 if(!needle)return true;
 let at=hay.indexOf(needle);
 while(at>=0){
  const before=at?hay[at-1]:'',after=hay[at+needle.length]||'';
  if(!/[A-Z0-9]/.test(before)&&!/[A-Z0-9]/.test(after))return true;
  at=hay.indexOf(needle,at+1);
 }
 return false;
}
async function exportLd(rows){
 if(!original)throw Error('Analise uma LD antes de exportar.');
 const originalMap=mapRows(report);
 for(const row of rows||[]){
  if(row?.decision!=='approved')continue;
  const controlled=originalMap.get(String(row.id));
  if(controlled?.tag&&!hasExactTitleTag(row.proposed,controlled.tag))throw Error('A TAG documental '+controlled.tag+' está ausente ou alterada no título de '+controlled.document+'. Corrija antes de exportar.');
  if(controlled?.endTag&&!endsWithTag(row.proposed,controlled.endTag))throw Error('A TAG '+controlled.endTag+' deve ficar no final do título de '+controlled.document+' ("TÍTULO - '+controlled.endTag+'"). Corrija antes de exportar.');
 }
 const authorized=(rows||[]).filter(row=>{
   const from=originalMap.get(String(row.id));
   return from&&from.sheet===row.sheet&&from.row===row.row&&from.document===row.document
     &&row.decision==='approved'&&clean(row.proposed)&&normal(row.proposed)!==normal(from.current)
     &&!from.hasConflict;
 }).map(row=>({...originalMap.get(String(row.id)),proposed:clean(row.proposed),decision:'approved'}));
 if(!authorized.length)throw Error('Selecione e aprove pelo menos uma alteração válida.');
 const file={name:originalName,arrayBuffer:async()=>original};
 const result=await self.RECONTitleWriter.apply(file,authorized,XLSX,JSZip);
 return {bytes:result.buffer,name:result.fileName.replace('_RECON_','_GRCON_'),changes:result.changes,preservation:result.preservation};
}
async function analyzeBatch(input){
 multiFiles.clear();batchMode=false;original=null;report=[];
 if(!Array.isArray(input.files)||input.files.length<1||input.files.length>8)throw Error('Selecione de 1 a 8 LDs.');
 let size=0;const combined=[],collections=[],missing=[],skipped=[],totals={};
 const localFiles=new Map();
 for(let i=0;i<input.files.length;i++){
  const file=input.files[i];
  if(!/\.(xlsx|xlsm)$/i.test(file?.name||'')||!(file.bytes instanceof ArrayBuffer))throw Error('Arquivo de LD inválido.');
  size+=file.bytes.byteLength;
  if(file.bytes.byteLength>50*1024*1024||size>120*1024*1024)throw Error('O lote ultrapassa o limite de 120 MB (máximo 50 MB por LD).');
  const data=await analyze({...input,name:file.name,bytes:file.bytes});
  const rows=data.rows.map(row=>({...row,id:'ld:'+i+'::'+row.id,sourceId:String(i),sourceFile:file.name}));
  localFiles.set(String(i),{bytes:file.bytes,name:file.name,rows});
  combined.push(...rows);
  collections.push({file:file.name,count:rows.length,coverage:data.coverage});
  missing.push(...data.unmatched.map(code=>file.name+': '+code));
  skipped.push(...(data.coverage?.skippedSheets||[]).map(entry=>({sheet:file.name+' / '+entry.sheet,reason:entry.reason})));
  for(const [key,value] of Object.entries(data.sourceCounts||{}))totals[key]=Math.max(Number(totals[key]||0),Number(value||0));
 }
 multiFiles=localFiles;batchMode=true;report=combined;original=null;originalName='';
 return {rows:combined,files:collections,unmatched:missing,coverage:{skippedSheets:skipped},sourceCounts:totals,standard:'ET-5290.00-22000-912-1LV-001 Rev. R'};
}
async function batchExports(rows){
 if(!batchMode)throw Error('Reanalise as LDs para gerar o pacote.');
 const saved={original,originalName,report},outputs=[],approved=(rows||[]).filter(r=>r.decision==='approved');
 try{
  for(const [sourceId,state] of multiFiles){
   const selected=approved.filter(row=>row.sourceId===sourceId);
   if(!selected.length)continue;
   original=state.bytes;originalName=state.name;report=state.rows;
   const output=await exportLd(selected);outputs.push(output);
  }
 }finally{original=saved.original;originalName=saved.originalName;report=saved.report;}
 if(!outputs.length)throw Error('Não há títulos aprovados para exportação.');
 return outputs;
}
async function exportBatch(rows){
 const outputs=await batchExports(rows);
 if(outputs.length===1)return outputs[0];
 const zip=new JSZip();
 outputs.forEach((file,i)=>zip.file(String(i+1).padStart(2,'0')+'_'+file.name,file.bytes));
 return {bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),name:'GRCON_LDs_Titulos_Corrigidos.zip',
   changes:outputs.flatMap(file=>file.changes),preservation:{valid:outputs.every(file=>file.preservation?.valid)},files:outputs.length};
}
async function packageBatch(input){
 const zip=new JSZip(),items=[];
 if((input.rows||[]).some(row=>row.decision==='approved')){
  const outputs=await batchExports(input.rows);
  outputs.forEach((file,i)=>{const name=String(i+1).padStart(2,'0')+'_'+file.name;zip.file(name,file.bytes);items.push(name);});
 }
 const audit=self.GrconTitleReports.report(input.reportRows||[]);
 zip.file(audit.name,audit.bytes);items.push(audit.name);
 const pending=self.GrconTitleReports.report((input.reportRows||[]).filter(row=>row.hasConflict||!row.proposed||row.confidence==='baixa'));
 zip.file('GRCON_Pendencias_Titulos.xlsx',pending.bytes);items.push('GRCON_Pendencias_Titulos.xlsx');
 return {bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),name:'GRCON_Pacote_Revisao_Titulos.zip',items};
}
self.onmessage=async({data})=>{
 const {id,op,input}=data;
 try{
   let result;
   if(op==='analyze')result=await analyze(input);
   else if(op==='analyzeBatch')result=await analyzeBatch(input);
   else if(op==='export')result=await exportLd(input.rows);
   else if(op==='exportBatch')result=await exportBatch(input.rows);
   else if(op==='report')result=self.GrconTitleReports.report(input.rows);
   else if(op==='package')result=await self.GrconTitleReports.package(input.rows,input.reportRows,exportLd);
   else if(op==='packageBatch')result=await packageBatch(input);
   else throw Error('Operação desconhecida.');
   const transfers=result?.bytes instanceof Uint8Array?[result.bytes.buffer]:[];
   self.postMessage({id,result},transfers);
 }catch(error){self.postMessage({id,error:error?.message||String(error)});}
};

