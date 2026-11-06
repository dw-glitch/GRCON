(function(root){
 'use strict';
 // Fase 7 — pacote final do Robô Auditor Preventivo.
 //   GRCON_Auditoria_Preventiva/
 //     01_Relatorio_Auditoria.xlsx   (RESUMO + DETALHAMENTO)
 //     02_LDs_Corrigidas/…           (somente se alguma LD foi realmente corrigida)
 //     03_Alocacoes_Corrigidas/…     (somente cópias realmente corrigidas)
 //     04_Linhas_Central*.xlsx       (somente quando houve emissão oficial confirmada)
 //     05_Manifesto.json
 // Nenhuma pasta vazia, nenhum arquivo fictício e nenhuma numeração oficial consumida aqui.
 const PACKAGE_VERSION='2.0.0',ROOT='GRCON_Auditoria_Preventiva';
 const STATES=Object.freeze({ready:'Pronta para conferência final e envio',fix:'Correção necessária antes do envio',verify:'Verificação complementar necessária'});
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const safe=v=>typeof v==='string'&&/^[\s]*[=+\-@\t\r]/.test(v)?"'"+v:v??'';
 const SEVERITY={error:'Não conformidade confirmada',pending:'Verificação pendente',suggestion:'Sugestão preventiva (não normativa)'};
 const CORRECTION_TYPE={A:'A · Correção automática segura',B:'B · Correção proposta',C:'C · Verificação complementar',D:'D · Sem alteração necessária'};
 const LIMITS=['A auditoria preventiva não equivale à aprovação da Fiscal 01 nem substitui a conferência final.','Comentários fiscais históricos são precedentes, não normas.','Somente cópias são corrigidas; originais, Central compartilhada e comentários fiscais permanecem intactos.'];
 function evidenceText(list){
  return (list||[]).map(e=>{
   if(e==null)return '';
   let value=e;if(typeof e==='string'){try{value=JSON.parse(e);}catch{return e.slice(0,300);}}
   if(typeof value!=='object')return String(value).slice(0,300);
   return Object.entries(value).filter(([,v])=>v!==''&&v!=null&&typeof v!=='object').map(([k,v])=>k+': '+v).join(' · ').slice(0,300);
  }).filter(Boolean).slice(0,3).join(' | ');
 }
 const fieldMatches=(finding,change)=>finding.field===change.field||(finding.field==='levels'&&/^N[1-6]$/.test(change.field));
 // Estado final: considera achados do motor e correções efetivamente verificadas.
 function finalState(rows,files,exceptions,contextWarning){
  const changes=(files||[]).flatMap(f=>(f.changes||[]).filter(c=>c.verified!==false).map(c=>({...c,consumed:false})));
  // Uma alteração só comprova o que ela diz resolver: se cita achados (findingIds), esses; senão, no máximo UM erro do mesmo campo.
  // (Alterar o campo não prova que todos os apontamentos dele foram resolvidos.) O mesmo vale para propostas em aberto.
  const covered=(row,predicate)=>{
   const explicit=changes.find(c=>c.lineage===row.lineage&&Array.isArray(c.findingIds)&&predicate.id&&c.findingIds.includes(predicate.id));
   if(explicit)return true;
   const generic=changes.find(c=>!c.consumed&&c.lineage===row.lineage&&!Array.isArray(c.findingIds)&&fieldMatches(predicate,c));
   if(generic){generic.consumed=true;return true;}
   return false;
  };
  let uncorrected=0,pending=0,openProposals=0;
  for(const row of rows||[]){
   for(const f of row.findings||[]){
    if(f.severity==='error'){if(!covered(row,f))uncorrected++;}
    else if(f.severity==='pending')pending++;
   }
   // Proposta de correção ainda sem alteração verificada: exige revisão humana antes do envio (não é conformidade).
   for(const rec of row.recommendations||[])if(rec&&rec.field&&!covered(row,{field:rec.field}))openProposals++;
  }
  const inconclusive=pending+openProposals+(exceptions||[]).length+(contextWarning?1:0);
  const state=uncorrected?STATES.fix:inconclusive?STATES.verify:STATES.ready;
  return {state,uncorrectedErrors:uncorrected,inconclusive,pendingFindings:pending,openProposals};
 }
 function safeName(name){
  if(typeof name!=='string'||!/^[\wÀ-ÿ .()/\-]+\.xlsx$/u.test(name)||name.includes('..')||name.startsWith('/')||name.includes('//')||/(^|\/)\./.test(name))throw Error('Nome de saída inseguro ou repetido.');
  return name;
 }
 async function build(input,{XLSX,JSZip,C}){
  if(!input.rows?.length||input.progress!==input.total||input.rows.length!==input.total)throw Error('Conclua a auditoria antes de preparar o pacote.');
  if(!root.ExcelJS)importScripts('../exceljs.min.js');
  const rows=input.rows,events=C.approvedChanges(input.events||[]),exceptions=(input.exceptions||[]).map(String),files=input.files||[];
  const plan=input.plan||{items:[]},planByKey=new Map((plan.items||[]).filter(i=>i.field&&i.after!==undefined).map(i=>[JSON.stringify([i.lineage,i.field,i.after]),i]));
  const summary=C.summary(rows),state=finalState(rows,files,exceptions,input.contextWarning);
  const generatedAt=new Date();
  const verifiedChanges=files.flatMap(f=>(f.changes||[]).map(c=>({...c,file:f.name})));
  const appliedKey=new Set(verifiedChanges.map(c=>JSON.stringify([c.lineage,c.field,c.after])));
  const labels=Object.fromEntries((C.TAXONOMY||[]).map(t=>[t.id,t.label]));
  const book=new root.ExcelJS.Workbook();book.creator='GRCON';book.created=generatedAt;
  const header=(ws,fill='FF15546E')=>{const r=ws.getRow(1);r.font={bold:true,color:{argb:'FFFFFFFF'}};r.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};r.alignment={vertical:'middle',wrapText:true};r.height=30;};

  // --- Montagem do relatório (linguagem objetiva e profissional) ---
  const allocationOf=r=>r.allocation||r.sourceFile||'';
  const where=r=>[r.sourceFile,r.sourceSheet].filter(Boolean);
  const fieldLabel={title:'Título',workflow:'Workflow',databook:'Caminho do Data Book',document:'Código do documento',tag:'TAG',levels:'Níveis da EAP',fiscalComment:'Histórico fiscal',plannedDate:'Data prevista',action:'Ação',purpose:'Propósito de emissão',revision:'Revisão',ld:'LD de origem',eap:'EAP'};
  const labelOf=f=>fieldLabel[f]||(/^N[1-6]$/.test(f)?'Nível '+f.slice(1)+' da EAP':f||'');
  const humanDecision=e=>e.ruleId?'Não (regra ativa)':'Sim — decisão de '+(e.actor||'responsável');
  const normOf=r=>r.docKind==='N-1710'?'N-1710':r.docKind==='ET'?'ET-5290':'Não identificada';
  const fmtDate=v=>{const t=String(v??'').trim();if(/^\d{4}-\d{2}-\d{2}T/.test(t)){const d=new Date(t);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();}
   if(/^\d{5}$/.test(t)&&Number(t)>30000&&Number(t)<80000){const d=new Date(Math.round((Number(t)-25569)*86400000));return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();}return t;};

  // Uma alocação por grupo: nunca se misturam documentos de alocações diferentes (N-1710 e ET) na mesma aba.
  const groups=new Map();
  for(const row of rows){const k=allocationOf(row)||'Sem identificação';const g=groups.get(k)||[];g.push(row);groups.set(k,g);}
  const multiple=groups.size>1;
  const tabLabel=(name,used)=>{
   const m=String(name).match(/(\d{3,4})-(\d{4})(?:\D|$)/);
   let label=m?m[1]+'-'+m[2]:String(name).replace(/\.xlsx$/i,'').replace(/[\[\]:*?\/\\]/g,'').trim().slice(0,12)||'ALOC';
   let out=label,i=2;while(used.has(out)){out=label+'_'+i++;}used.add(out);return out;
  };
  const used=new Set(),labelsByAllocation=new Map([...groups.keys()].map(k=>[k,tabLabel(k,used)]));

  const resumo=book.addWorksheet('RESUMO',{views:[{showGridLines:false}]});
  let proposalsOpen=0,clearDocs=0;
  const allocationStats=[];
  const detailHeaders=['Alocação','Código do documento','Revisão','Norma','Categoria','Regra / critério','Classificação','Descrição do apontamento','Campo','Valor atual','Valor sugerido','Valor corrigido (aplicado)','Evidência','Arquivo de origem','Aba','Local (linha/célula)','Situação','Tipo de tratamento','Fundamento','Requer decisão humana'];
  const detailWidths=[22,38,9,12,18,26,24,60,18,30,30,28,44,28,12,16,28,26,50,20];
  const sheetNames=['RESUMO'];
  const fills={error:'FFFDE2E1',pending:'FFFFF3D6',proposal:'FFFFF3D6',suggestion:'FFE6F0FA',done:'FFE3F4E8',authorized:'FFEAF4E4',clear:'FFFFFFFF'};
  const order={error:0,pending:1,proposal:2,authorized:3,done:4,suggestion:5,clear:6};
  const editable=['workflow','databook','N1','N2','N3','N4','N5','N6'],cellOf={workflow:3,databook:10,N1:11,N2:12,N3:13,N4:14,N5:15,N6:16};
  const current=(row,f)=>/^N[1-6]$/.test(f)?String((row.levels||[])[Number(f.slice(1))-1]??''):String(row[f]??'');

  for(const [allocationName,groupRows] of groups){
   const tag=multiple?' '+labelsByAllocation.get(allocationName):'';
   const detailRows=[];let groupClear=0;
   for(const row of groupRows){
    const [file,sheet]=where(row),line=row.sourceRow?'linha '+row.sourceRow:'',norm=normOf(row);
    for(const f of row.findings||[]){
     const sug=f.suggestion;
     detailRows.push({tone:f.severity,cells:[allocationOf(row),row.document,row.revision,norm,labels[f.category]||f.category,f.id+' · motor '+(f.ruleVersion||row.ruleVersion),SEVERITY[f.severity]||f.severity,f.message,labelOf(f.field),sug?sug.before:'',sug?sug.after:'','',evidenceText(f.evidence)||f.source,file,sheet,line,f.severity==='suggestion'?'Sugestão a avaliar':f.severity==='pending'?'Aguardando verificação':'Aguardando correção',sug?'Correção sugerida (a confirmar)':'—',f.source||'',f.humanReview===false?'Não':'Sim']});
    }
    for(const rec of row.recommendations||[]){
     const key=JSON.stringify([row.lineage,rec.field,rec.after]),item=planByKey.get(key);
     if(events.some(e=>e.lineage===row.lineage&&e.field===rec.field&&e.after===rec.after))continue; // aparece como decisão abaixo
     proposalsOpen++;
     detailRows.push({tone:'proposal',cells:[allocationOf(row),row.document,row.revision,norm,labels[rec.field==='title'?'title':rec.field==='workflow'?'workflow':rec.field==='databook'?'databook':'hierarchy'],item?.ruleId||'Proposta determinística',SEVERITY.pending,rec.justification,labelOf(rec.field),rec.before,rec.after,'',evidenceText(rec.evidence),file,sheet,item?.cell||line,'Proposta aguardando decisão',CORRECTION_TYPE[item?.klass||'B'],rec.justification,'Sim']});
    }
    for(const e of events.filter(x=>x.lineage===row.lineage)){
     const done=appliedKey.has(JSON.stringify([e.lineage,e.field,e.after])),change=verifiedChanges.find(c=>c.lineage===e.lineage&&c.field===e.field&&c.after===e.after);
     const item=planByKey.get(JSON.stringify([e.lineage,e.field,e.after]));
     detailRows.push({tone:done?'done':'authorized',cells:[allocationOf(row),row.document,row.revision,norm,labels[e.field==='title'?'title':e.field==='workflow'?'workflow':e.field==='databook'?'databook':'hierarchy'],e.ruleId?e.ruleId+' v'+(e.ruleVersion||''):'Decisão humana',done?'Corrigido':'Autorizado',e.justification,labelOf(e.field),e.before,e.after,done?e.after:'',evidenceText(e.evidence),change?.file||file,change?.sheet||sheet,change?.cell||line,done?'Corrigida e verificada em cópia':'Autorizada — cópia não produzida',CORRECTION_TYPE[item?.klass||(e.ruleId?'A':'B')],e.justification,humanDecision(e)]});
    }
    if(!(row.findings||[]).length&&!(row.recommendations||[]).length){groupClear++;clearDocs++;detailRows.push({tone:'clear',cells:[allocationOf(row),row.document,row.revision,norm,'Verificação','','Sem apontamentos','Nenhum apontamento nas referências disponíveis.','','','','','',file,sheet,line,'Verificado — sem apontamentos',CORRECTION_TYPE.D,'A ausência de apontamentos não equivale à aprovação da fiscalização.','Não']});}
   }
   detailRows.sort((a,b)=>(order[a.tone]??9)-(order[b.tone]??9));
   const st=C.summary(groupRows);
   allocationStats.push({name:allocationName,documents:groupRows.length,n1710:groupRows.filter(r=>r.docKind==='N-1710').length,et:groupRows.filter(r=>r.docKind==='ET').length,errors:st.errors,pending:st.pending,suggestions:st.suggestions,clear:groupClear});

   const detail=book.addWorksheet('DETALHAMENTO'+tag);sheetNames.push(detail.name);
   detail.addRow(detailHeaders.map(safe));header(detail);
   for(const d of detailRows){const r=detail.addRow(d.cells.map(safe));if(fills[d.tone]&&d.tone!=='clear')r.getCell(7).fill={type:'pattern',pattern:'solid',fgColor:{argb:fills[d.tone]}};}
   detail.columns=detailWidths.map(width=>({width}));
   detail.views=[{state:'frozen',ySplit:1,xSplit:2}];
   detail.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,detail.rowCount),column:detailHeaders.length}};
   detail.eachRow((r,i)=>{if(i>1){r.alignment={vertical:'top',wrapText:true};r.font={color:{argb:'FF20384D'}};}});

   // ALOCAÇÃO CORRIGIDA desta alocação
   const corrected=book.addWorksheet((multiple?'ALOC. CORRIGIDA':'ALOCAÇÃO CORRIGIDA')+tag);sheetNames.push(corrected.name);
   corrected.addRow(['Nome do documento','Data prevista','Workflow','Documento ativo','Ação','Data da linha base','Propósito de emissão original','Documento crítico','Observação','Caminho do Data Book','N1','N2','N3','N4','N5','N6','Revisão','Norma','Código sugerido (conferir)','Alterações nesta linha','Situação das alterações'].map(safe));
   header(corrected,'FF1F4E78');
   const highlights=[],codeCells=[];
   groupRows.forEach(row=>{
    const values=[row.document,fmtDate(row.plannedDate),row.workflow,row.activeDocument,row.action,fmtDate(row.baselineDate),row.purpose,row.criticalDocument,row.observation,row.databook,...Array.from({length:6},(_,i)=>(row.levels||[])[i]??'')].map(v=>v??'');
    const changed=[];
    for(const f of editable){
     const decided=events.filter(e=>e.lineage===row.lineage&&e.field===f).pop();
     const afters=[...new Set((row.recommendations||[]).filter(x=>x.field===f).map(x=>x.after))];
     const after=decided?decided.after:afters.length===1?afters[0]:null;
     if(after==null||after===current(row,f))continue;
     const applied=appliedKey.has(JSON.stringify([row.lineage,f,after]));
     values[cellOf[f]-1]=after;changed.push({f,before:current(row,f),after,applied,authorized:Boolean(decided)});
    }
    const codeSuggestion=(row.findings||[]).map(x=>x.suggestion).find(x=>x&&x.field==='document');
    const status=!changed.length?'—':changed.every(c=>c.applied)?'Aplicadas em cópia verificada':changed.some(c=>c.authorized)?'Autorizadas; cópia pendente':'Sugeridas — aguardam decisão';
    const r=corrected.addRow([...values,row.revision,normOf(row),codeSuggestion?codeSuggestion.after:'',changed.map(c=>labelOf(c.f)+': «'+c.before+'» → «'+c.after+'»').join('\n'),status].map(safe));
    for(const c of changed)highlights.push([r.number,cellOf[c.f],c.applied]);
    if(codeSuggestion)codeCells.push(r.number);
   });
   corrected.columns=[44,13,40,12,12,14,22,12,30,60,14,14,14,14,14,14,9,12,44,60,28].map(width=>({width}));
   corrected.views=[{state:'frozen',ySplit:1,xSplit:1}];
   corrected.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,corrected.rowCount),column:21}};
   corrected.eachRow((r,i)=>{if(i>1){r.alignment={vertical:'top',wrapText:true};r.font={color:{argb:'FF20384D'}};}});
   for(const rn of codeCells)corrected.getRow(rn).getCell(19).font={bold:true,color:{argb:'FFB3261E'}};
   for(const [rn,cn,applied] of highlights){const c=corrected.getRow(rn).getCell(cn);c.fill={type:'pattern',pattern:'solid',fgColor:{argb:applied?'FFC8E6C9':'FFFFE08A'}};c.font={bold:true,color:{argb:'FF20384D'}};}

   // TÍTULOS DA LD desta alocação (somente quando houver)
   const titleItems=[];
   for(const row of groupRows){
    const titleEvents=events.filter(e=>e.lineage===row.lineage&&e.field==='title');
    const seen=new Set();
    for(const e of titleEvents){seen.add(e.after);titleItems.push({row,before:e.before,after:e.after,reason:e.justification,state:appliedKey.has(JSON.stringify([e.lineage,'title',e.after]))?'Aplicada em cópia verificada da LD':'Autorizada; cópia da LD pendente'});}
    for(const rec of (row.recommendations||[]).filter(x=>x.field==='title')){
     if(seen.has(rec.after))continue;
     let terms='';try{terms=(JSON.parse(rec.evidence?.[0]||'{}').ajustes||[]).map(a=>a.de+' → '+a.para).join('; ');}catch{terms='';}
     titleItems.push({row,before:rec.before,after:rec.after,reason:rec.justification,terms,state:'Sugerida — aguarda decisão'});
    }
   }
   if(titleItems.length){
    const titles=book.addWorksheet((multiple?'TÍTULOS LD':'TÍTULOS DA LD')+tag);sheetNames.push(titles.name);
    titles.addRow(['Código do documento','Revisão','Norma','LD de origem','Aba da LD','Linha','Título atual','Título sugerido','Termos alterados','Motivo da sugestão','Situação'].map(safe));
    header(titles,'FF1F4E78');
    for(const it of titleItems){const o=it.row.origin||{};titles.addRow([it.row.document,it.row.revision,normOf(it.row),o.file||it.row.ld||'',o.sheet||it.row.ldSheet||'',o.row||'',it.before,it.after,it.terms||'',it.reason,it.state].map(safe));}
    titles.columns=[44,9,12,30,14,8,60,60,34,50,30].map(width=>({width}));
    titles.views=[{state:'frozen',ySplit:1,xSplit:1}];
    titles.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,titles.rowCount),column:11}};
    titles.eachRow((r,i)=>{if(i>1){r.alignment={vertical:'top',wrapText:true};r.font={color:{argb:'FF20384D'}};r.getCell(8).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF3D6'}};r.getCell(8).font={bold:true,color:{argb:'FF20384D'}};}});
   }
  }

  // --- RESUMO ---
  const allocations=[...groups.keys()];
  const ldCopies=files.filter(f=>/^02_/.test(f.name)).length,allocCopies=files.filter(f=>/^03_/.test(f.name)).length;
  const executed=verifiedChanges.length;
  const authorized=events.length;
  resumo.columns=[{width:40},{width:96}];
  resumo.mergeCells('A1:B1');resumo.getCell('A1').value='GRCON · Relatório de Auditoria Preventiva de Alocações';resumo.getCell('A1').font={size:16,bold:true,color:{argb:'FFFFFFFF'}};
  resumo.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF15546E'}};resumo.getRow(1).height=34;resumo.getCell('A1').alignment={vertical:'middle'};
  const verdict=state.state===STATES.ready?'Não foram encontradas pendências nas referências disponíveis. A alocação pode seguir para a conferência final antes do envio. Este resultado não representa aprovação da fiscalização.'
   :state.state===STATES.fix?state.uncorrectedErrors+' não conformidade(s) confirmada(s) ainda sem correção verificada. Corrija antes de enviar a alocação à fiscalização.'
   :'Há '+state.inconclusive+' verificação(ões) em aberto. Conclua a conferência indicada no detalhamento antes do envio; a alocação não deve ser considerada pronta enquanto houver pendências.';
  const perAllocation=allocationStats.map(a=>[a.name,a.documents+' documento(s) · N-1710: '+a.n1710+' · ET-5290: '+a.et+' · erros confirmados: '+a.errors+' · pendências: '+a.pending+' · sem apontamentos: '+a.clear]);
  const sections=[
   ['Parecer',[['Estado da auditoria',state.state],['Conclusão',verdict]]],
   ['Identificação',[['Contrato',input.contract],['Identificação da auditoria',input.runId||input.sessionId||''],['Data de geração',generatedAt],['Alocações analisadas',allocations.join('; ')||'—'],['Versão do motor de auditoria',C.VERSION]]],
   ['Indicadores',[['Documentos analisados',rows.length],['Documentos sem apontamentos',clearDocs],['Não conformidades confirmadas sem correção',state.uncorrectedErrors],['Verificações pendentes',state.inconclusive],['Sugestões preventivas (precedentes, não normativas)',summary.suggestions],['Propostas aguardando decisão',proposalsOpen],['Correções autorizadas',authorized],['Correções aplicadas e verificadas em cópia',executed],['Cópias de LD geradas',ldCopies],['Cópias de alocação geradas',allocCopies]]],
   ...(multiple?[['Resultado por alocação',perAllocation]]:[]),
   ['Como usar este relatório',[multiple?['Abas por alocação','Cada alocação tem as suas próprias abas (DETALHAMENTO, ALOC. CORRIGIDA e, quando houver, TÍTULOS LD), identificadas pelo número, para não misturar documentos de normas diferentes.']:['DETALHAMENTO','Todos os apontamentos, com valor atual, valor sugerido, evidência e situação.'],['ALOCAÇÃO CORRIGIDA','A alocação com as correções sugeridas ou aplicadas. Células destacadas foram alteradas; a coluna "Alterações nesta linha" mostra o valor anterior.'],['TÍTULOS DA LD','Quando houver, o título atual e o título sugerido para ajuste na LD de origem.'],['Escopo por norma','Documentos N-1710: auditados apenas quanto a Data Book, níveis (EAP) e título. Documentos ET-5290: também código/TAG (nt-) e demais regras da ET.']]],
   ['Fontes e referências',[['Fontes utilizadas',(input.sources||[]).map(s=>s.name+' ('+(s.kind==='ld'?'LD':'alocação')+', SHA-256 '+String(s.sha256||'').slice(0,12)+'…)').join('\n')||'—'],['Versões das referências',Object.entries(input.versions||{}).map(([k,v])=>k+': '+v).join('\n')||'Não informadas'],['Bases complementares',input.contextWarning||'Consultadas']]],
   ['Limitações',[['Observações importantes',[...LIMITS,...(input.contextWarning?[input.contextWarning]:[]),...exceptions.map(e=>'Arquivo não produzido: '+e)].join('\n')]]]
  ];
  let at=2;
  for(const [title,pairs] of sections){
   const t=resumo.getRow(++at);t.getCell(1).value=title.toUpperCase();t.font={bold:true,color:{argb:'FF15546E'}};t.border={bottom:{style:'thin',color:{argb:'FF15546E'}}};resumo.mergeCells(at,1,at,2);
   for(const [k,v] of pairs){const r=resumo.getRow(++at);r.getCell(1).value=safe(k);r.getCell(1).font={bold:true,color:{argb:'FF20384D'}};r.getCell(2).value=v instanceof Date?v:typeof v==='number'?v:safe(String(v));
    if(v instanceof Date)r.getCell(2).numFmt='dd/mm/yyyy hh:mm';r.alignment={vertical:'top',wrapText:true,horizontal:'left'};
    if(k==='Estado da auditoria'){r.getCell(2).font={bold:true,size:12,color:{argb:state.state===STATES.ready?'FF1B6B3A':state.state===STATES.fix?'FFB3261E':'FF8A5A00'}};}}
   at++;
  }

  const zip=new JSZip(),outputs=[],omitted=[];
  const folder=zip.folder(ROOT);
  async function add(name,bytes,meta={}){
   safeName(name);if(folder.file(name))throw Error('Nome de saída inseguro ou repetido.');
   const archive=await JSZip.loadAsync(bytes,{checkCRC32:true});if(!archive.file('[Content_Types].xml'))throw Error('XLSX sem estrutura OOXML.');
   const wb=XLSX.read(bytes,{type:'array',cellFormula:true});if(!wb.SheetNames.length)throw Error('XLSX sem abas.');
   if(meta.official){if(!wb.Sheets.GERAL)throw Error('Modelo oficial sem GERAL.');const parsed=C.parseRows(XLSX.utils.sheet_to_json(wb.Sheets.GERAL,{header:1,defval:'',raw:true}),{contract:input.contract});if(parsed.model!=='official-16')throw Error('Modelo oficial de 16 colunas inválido.');
    const ctx={...input,records:parsed.records},index=C.prepare(ctx);const second=parsed.records.map(r=>C.auditRecord(r,ctx,index));
    // O campo corrigido deve deixar de constar do conjunto de propostas determinísticas.
    for(const change of meta.changes||[])if(second.some(r=>r.document===change.document&&r.recommendations?.some(p=>p.field===change.field&&p.after===change.after&&p.before===change.before)))throw Error('Segunda auditoria não confirmou a alteração.');
   }
   folder.file(name,bytes,{createFolders:true});outputs.push({path:ROOT+'/'+name,name,bytes:bytes.length,sha256:await hash(bytes),...meta,changes:undefined,changed:meta.changed||0});
  }
  const reportBytes=new Uint8Array(await book.xlsx.writeBuffer());
  const readReport=XLSX.read(reportBytes,{type:'array'});if(readReport.SheetNames.join('|')!==sheetNames.join('|'))throw Error('Relatório fora do contrato de abas.');
  await add('01_Relatorio_Auditoria.xlsx',reportBytes,{kind:'report'});
  for(const file of files)await add(file.name,file.bytes,{kind:/^02_/.test(file.name)?'ld':/^03_/.test(file.name)?'allocation':/^04_/.test(file.name)?'central':'file',official:Boolean(file.official),changed:file.changed||0,changes:file.changes||[]});
  if(!ldCopies)omitted.push({path:'02_LDs_Corrigidas/',reason:'Nenhuma LD foi corrigida nesta auditoria.'});
  if(!allocCopies)omitted.push({path:'03_Alocacoes_Corrigidas/',reason:'Nenhuma alocação foi corrigida nesta auditoria.'});
  if(!files.some(f=>/^04_/.test(f.name)))omitted.push({path:'04_Linhas_Central.xlsx',reason:'Nenhuma emissão oficial foi solicitada; a auditoria não consome numeração nem altera a Central compartilhada.'});

  const sources=(input.sources||[]).map(s=>({name:s.name,sha256:s.sha256,kind:s.kind,mapped:s.model==='mapped'||undefined}));
  const manifest={
   packageVersion:PACKAGE_VERSION,auditId:input.runId||input.sessionId||'',sessionId:input.sessionId,runId:input.runId,contract:input.contract,
   engine:C.VERSION,assistant:root.GrconAllocationAssistant.VERSION,generatedAt:generatedAt.toISOString(),
   finalState:state.state,sources,referenceVersions:input.versions||{},
   counts:{documents:rows.length,allocations:allocations.length,withoutProblems:clearDocs,confirmedErrors:summary.errors,pendingVerifications:summary.pending,preventiveSuggestions:summary.suggestions},
   corrections:{proposed:proposalsOpen+authorized,authorized,executed,verified:verifiedChanges.filter(c=>c.verified!==false).length,
    applied:verifiedChanges.map(c=>({file:c.file,sheet:c.sheet,cell:c.cell,document:c.document,revision:c.revision,field:c.field,before:c.before,after:c.after,ruleId:c.ruleId||'',ruleVersion:c.ruleVersion||0,actor:c.actor||'',verified:c.verified!==false}))},
   events,exceptions,outputs,omitted,limitations:[...LIMITS,...(input.contextWarning?[input.contextWarning]:[])],
   numbering:{consumed:files.some(f=>/^04_/.test(f.name)),note:'Auditoria e cópias corrigidas não consomem numeração oficial; a emissão é uma ação separada.'},
   validation:{xlsxReopened:true,crc32:true,reportSheets:readReport.SheetNames,secondAudit:'executada para cópias oficiais corrigidas',technicalValidationOnly:true},normativeApproval:false
  };
  folder.file('05_Manifesto.json',JSON.stringify(manifest,null,2));
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});const final=await JSZip.loadAsync(bytes,{checkCRC32:true});
  for(const out of outputs)if(await hash(await final.file(out.path).async('uint8array'))!==out.sha256)throw Error('Integridade do pacote divergente.');
  return {bytes,manifest};
 }
 root.GrconAllocationAuditPackage=Object.freeze({build,hash,finalState,STATES,ROOT,PACKAGE_VERSION});
})(typeof globalThis!=='undefined'?globalThis:this);
